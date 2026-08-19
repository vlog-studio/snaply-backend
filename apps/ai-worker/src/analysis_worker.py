"""BullMQ 'video-analysis' 큐 구독 워커 — 스냅 내용 분석.

편집 워커(worker.py)와 **다른 프로세스**다. 편집 워커는 기동 시 Whisper 를 안고 있고
FFmpeg 편집으로 CPU 를 오래 쓴다. 분석은 모델 호출 대기가 대부분이라 동시성을 따로 잡아야
하고, 한쪽 재배포·장애가 다른 쪽을 멈추면 안 된다. 같은 이미지에서 커맨드만 다르게 뜬다.

분석은 업로드 시점이 아니라 **분석 요청 시점**에만 돈다 — 적재 주체는 API 다
(docs/decisions/snap-content-analysis.md).
"""

import asyncio
import os
import shutil
import signal
import sys
import tempfile

from bullmq import Worker
from loguru import logger

import analysis_db
import config
import db
import storage
from pipeline.video_analysis.analyzer import analyze
from pipeline.video_analysis.errors import AnalysisError


class AnalysisSkipped(Exception):
    """더 진행할 이유가 없음 — 삭제된 영상, 이미 완료된 분석 등. 실패가 아니다."""


def _init_sentry() -> None:
    """SENTRY_DSN 이 있을 때만 초기화. 없으면 no-op."""
    dsn = os.environ.get("SENTRY_DSN")
    if not dsn:
        return
    import sentry_sdk

    sentry_sdk.init(dsn=dsn, environment=os.environ.get("NODE_ENV", "development"))
    logger.info("Sentry 초기화 완료")


def _capture(exc: BaseException) -> None:
    if not os.environ.get("SENTRY_DSN"):
        return
    import sentry_sdk

    sentry_sdk.capture_exception(exc)


async def _run_analysis(analysis_id: str, work_dir: str) -> None:
    ctx = await analysis_db.fetch_context(analysis_id)
    if ctx is None:
        raise AnalysisSkipped(f"분석 레코드가 없습니다: {analysis_id}")
    if ctx["status"] == "done":
        raise AnalysisSkipped(f"이미 완료된 분석입니다: {analysis_id}")
    # LEFT JOIN 이라 삭제된 영상은 video_* 가 None 으로 온다.
    if ctx["video_s3_key"] is None or ctx["video_kind"] != "source":
        raise AnalysisError(
            "SOURCE_UNAVAILABLE", False, "분석할 원본 스냅을 찾을 수 없습니다."
        )

    if not await analysis_db.mark_processing(analysis_id):
        raise AnalysisSkipped(f"상태 전이 실패(삭제/완료됨): {analysis_id}")

    local_path = os.path.join(work_dir, f"source{os.path.splitext(ctx['video_s3_key'])[1] or '.mp4'}")
    try:
        await asyncio.to_thread(storage.download, ctx["video_s3_key"], local_path)
    except Exception as exc:  # noqa: BLE001 — 일시적 스토리지 장애는 재시도 대상이다
        raise AnalysisError("SOURCE_UNAVAILABLE", True, f"원본 다운로드 실패: {exc}") from exc

    outcome = await asyncio.to_thread(analyze, local_path, work_dir)

    saved = await analysis_db.save_result(
        analysis_id,
        outcome.duration_ms,
        outcome.frame_timestamps_ms,
        outcome.result,
        outcome.model_version,
        outcome.prompt_version,
        outcome.input_tokens,
        outcome.output_tokens,
    )
    if not saved:
        # 분석 중 영상이 삭제됐거나 다른 시도가 먼저 채웠다 — 응답을 버린다.
        raise AnalysisSkipped(f"결과 반영 대상이 없습니다: {analysis_id}")

    logger.info(
        "분석 완료 analysis_id={} model={} frames={} tokens={}/{} latency={}ms",
        analysis_id,
        outcome.model_version,
        len(outcome.frame_timestamps_ms),
        outcome.input_tokens,
        outcome.output_tokens,
        outcome.latency_ms,
    )


async def process_analysis_job(job, _job_token) -> dict:
    analysis_id = job.data["analysisId"]
    logger.info("분석 작업 수신 analysis_id={} video_id={}", analysis_id, job.data.get("videoId"))
    work_dir = tempfile.mkdtemp(prefix=f"analysis_{analysis_id}_")
    try:
        await asyncio.wait_for(
            _run_analysis(analysis_id, work_dir),
            timeout=config.VIDEO_ANALYSIS_TIMEOUT_SECONDS,
        )
        return {"analysisId": analysis_id, "status": "done"}
    except AnalysisSkipped as exc:
        # 실패로 기록하지 않는다. raise 하지 않으므로 BullMQ 재시도도 없다.
        logger.info("분석 건너뜀 analysis_id={} 이유={}", analysis_id, exc)
        return {"analysisId": analysis_id, "status": "skipped"}
    except asyncio.TimeoutError:
        logger.error("분석 타임아웃 analysis_id={}", analysis_id)
        await analysis_db.mark_failed(analysis_id, "TIMEOUT", "분석 시간이 초과되었습니다.")
        raise
    except AnalysisError as exc:
        logger.error(
            "분석 실패 analysis_id={} code={} retryable={}", analysis_id, exc.code, exc.retryable
        )
        await analysis_db.mark_failed(analysis_id, exc.code, str(exc))
        if exc.retryable:
            # 재시도 가능한 실패만 다시 던져 BullMQ 백오프를 태운다.
            raise
        return {"analysisId": analysis_id, "status": "failed", "code": exc.code}
    except Exception as exc:  # noqa: BLE001
        logger.exception("분석 중 예상치 못한 오류 analysis_id={}", analysis_id)
        _capture(exc)
        await analysis_db.mark_failed(analysis_id, "INTERNAL", str(exc))
        raise
    finally:
        # 프레임과 원본은 영구 저장하지 않는다 — 성공·실패 모두 지운다.
        shutil.rmtree(work_dir, ignore_errors=True)


def _require_api_key() -> None:
    """키 없이 뜨면 작업을 받아놓고 전부 실패시킨다. 기동 단계에서 죽는 편이 낫다."""
    if not config.OPENAI_API_KEY:
        logger.error(
            "OPENAI_API_KEY 가 없어 분석 워커를 시작할 수 없습니다. "
            "로컬은 apps/api/.env, 운영은 배포 플랫폼 시크릿으로 주입한다."
        )
        sys.exit(1)


async def main() -> None:
    _require_api_key()
    _init_sentry()
    await db.init_pool()

    worker = Worker(
        config.VIDEO_ANALYSIS_QUEUE_NAME,
        process_analysis_job,
        {"connection": config.REDIS_URL, "concurrency": config.VIDEO_ANALYSIS_CONCURRENCY},
    )
    logger.info(
        "video-analysis 워커 시작 (queue={} model={} concurrency={})",
        config.VIDEO_ANALYSIS_QUEUE_NAME,
        config.OPENAI_VISION_MODEL,
        config.VIDEO_ANALYSIS_CONCURRENCY,
    )

    stop_event = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, stop_event.set)

    await stop_event.wait()
    logger.info("종료 신호 수신, 정리 중...")
    await worker.close()
    await db.close_pool()


if __name__ == "__main__":
    asyncio.run(main())
