"""BullMQ 'renditions' 큐 구독 워커 — 배포 렌디션 생성.

편집 워커·분석 워커와 **다른 프로세스**다. 같은 이미지에서 커맨드만 다르게 뜬다.
셋을 나눈 이유는 같다 — 한쪽의 재배포나 장애가 다른 쪽을 멈추면 안 되고, 자원 성격이 다르다.
이 워커는 짧은 FFmpeg 변환이라 편집 워커처럼 오래 CPU 를 잡지 않는다.

적재 주체는 API 다. `POST /videos` 로 업로드가 확정되는 순간 한 건이 들어온다.

**실패는 치명적이지 않다.** 렌디션이 없으면 다른 플랫폼에서 재생이 안 될 뿐, 스냅은 쓸 수
있고 편집은 원본으로 돈다 — 그래서 실패해도 `videos.status` 는 건드리지 않는다.

**로컬 신호도 여기서 계산한다**(`pipeline/snap_signals.py`). 원본을 이미 받아 둔 자리라 다시 받지
않고, 업로드 직후에 계산해 두면 AI 편집 초안이 신호를 기다리지 않는다. 신호가 실패해도 렌디션은
성공이다 — 신호가 없는 스냅은 초안에서 검사 없이 들어갈 뿐이다(docs/decisions/edit-director.md §1).
신호가 없는 예전 스냅은 `only: "signals"` 작업으로 신호만 계산한다.
"""

import asyncio
import os
import shutil
import signal
import tempfile

from bullmq import Worker
from loguru import logger

import config
import db
import rendition_db
import signals_db
import storage
from pipeline.rendition import RenditionError, build
from pipeline.snap_signals import SIGNALS_VERSION, SignalsError, read_signals


class RenditionSkipped(Exception):
    """더 진행할 이유가 없음 — 삭제된 영상, 이미 만들어진 렌디션 등. 실패가 아니다."""


def _init_sentry() -> None:
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


async def _discard(keys: list[str | None]) -> None:
    """올렸지만 반영하지 못한 객체를 지운다. 실패는 기록만 한다 — 작업 결과를 바꾸지 않는다."""
    for key in keys:
        if not key:
            continue
        try:
            await asyncio.to_thread(storage.delete, key)
        except Exception as exc:  # noqa: BLE001 — 정리 실패로 작업을 재시도할 이유는 없다
            logger.warning("반영하지 못한 객체 삭제 실패 key={} 이유={}", key, exc)
            _capture(exc)


async def _record_signals(video_id: str, local: str, duration_ms: int | None) -> None:
    """
    렌디션 뒤의 신호 계산. 어떤 실패도 렌디션 결과를 바꾸지 않는다 — 시간 초과도 그렇다.

    렌디션의 시간 제한 밖에서 따로 제한을 받는다. 같은 제한 안에 있으면 신호 계산이 늦어질 때 이미 반영한
    렌디션이 `failed` 로 덮이고 작업이 재시도돼 같은 변환을 다시 돌린다.
    """
    try:
        signals = await asyncio.wait_for(
            asyncio.to_thread(read_signals, local, duration_ms),
            timeout=config.RENDITION_TIMEOUT_SECONDS,
        )
        if await signals_db.save_signals(video_id, signals):
            logger.info("신호 저장 video_id={} motion={}개", video_id, len(signals.motion))
    except Exception as exc:  # noqa: BLE001 — 신호는 초안을 낫게 할 뿐 렌디션의 조건이 아니다
        logger.warning("신호 계산 실패 video_id={} 이유={}", video_id, exc)
        if not isinstance(exc, SignalsError):
            _capture(exc)


async def _run_signals(video_id: str, s3_key: str, work_dir: str) -> None:
    """신호만 계산하는 작업 — 신호 없이 올라온 예전 스냅을 초안이 쓰려 할 때."""
    ctx = await rendition_db.fetch_context(video_id)
    if ctx is None or ctx["deleted_at"] is not None:
        raise RenditionSkipped(f"영상이 없습니다: {video_id}")
    local = os.path.join(work_dir, f"source{os.path.splitext(s3_key)[1] or '.mp4'}")
    await asyncio.to_thread(storage.download, s3_key, local)
    signals = await asyncio.to_thread(read_signals, local, None)
    if not await signals_db.save_signals(video_id, signals):
        raise RenditionSkipped(f"반영 대상이 없습니다: {video_id}")
    logger.info("신호 저장 video_id={} motion={}개", video_id, len(signals.motion))


async def _run(video_id: str, user_id: str, s3_key: str, work_dir: str) -> None:
    """렌디션(시간 제한 안)을 반영한 뒤, 받아 둔 원본으로 신호를 계산한다(따로 제한)."""
    local, duration_ms = await asyncio.wait_for(
        _render(video_id, user_id, s3_key, work_dir),
        timeout=config.RENDITION_TIMEOUT_SECONDS,
    )
    await _record_signals(video_id, local, duration_ms)


async def _render(video_id: str, user_id: str, s3_key: str, work_dir: str) -> tuple[str, int | None]:
    """렌디션을 만들어 반영한다. 신호 계산에 쓸 원본 경로와 길이를 돌려준다."""
    ctx = await rendition_db.fetch_context(video_id)
    if ctx is None or ctx["deleted_at"] is not None:
        raise RenditionSkipped(f"영상이 없습니다: {video_id}")
    if ctx["rendition_status"] == "ready":
        raise RenditionSkipped(f"이미 렌디션이 있습니다: {video_id}")
    if not await rendition_db.mark_processing(video_id):
        raise RenditionSkipped(f"상태 전이 실패(삭제/완료됨): {video_id}")

    local = os.path.join(work_dir, f"source{os.path.splitext(s3_key)[1] or '.mp4'}")
    await asyncio.to_thread(storage.download, s3_key, local)

    outcome = await asyncio.to_thread(build, local, work_dir)

    rendition_key = storage.rendition_key(user_id, video_id)
    await asyncio.to_thread(storage.upload, outcome.video_path, rendition_key, "video/mp4")

    thumbnail_key = None
    if outcome.thumbnail_path:
        thumbnail_key = storage.snap_thumbnail_key(user_id, video_id)
        await asyncio.to_thread(storage.upload, outcome.thumbnail_path, thumbnail_key, "image/jpeg")

    saved = await rendition_db.save_rendition(
        video_id,
        rendition_key,
        thumbnail_key,
        outcome.duration_ms,
        outcome.width,
        outcome.height,
    )
    if not saved:
        # 변환 중 영상이 삭제됐다. 키가 행에 기록되지 않았으므로 정리 배치도 이 객체를 모른다 —
        # 여기서 지우지 않으면 지운 스냅의 재생 가능한 사본이 계정 purge 전까지 남는다(backlog E-8).
        await _discard([rendition_key, thumbnail_key])
        raise RenditionSkipped(f"반영 대상이 없습니다: {video_id}")

    logger.info(
        "렌디션 완료 video_id={} key={} {}x{}", video_id, rendition_key, outcome.width, outcome.height
    )
    return local, outcome.duration_ms


async def process_signals_job(job) -> dict:
    video_id = job.data["videoId"]
    logger.info("신호 작업 수신 video_id={}", video_id)
    work_dir = tempfile.mkdtemp(prefix=f"signals_{video_id}_")
    try:
        await asyncio.wait_for(
            _run_signals(video_id, job.data["s3Key"], work_dir),
            timeout=config.RENDITION_TIMEOUT_SECONDS,
        )
        return {"videoId": video_id, "status": "ready"}
    except RenditionSkipped as exc:
        logger.info("신호 건너뜀 video_id={} 이유={}", video_id, exc)
        return {"videoId": video_id, "status": "skipped"}
    except SignalsError as exc:
        # 읽을 수 없는 파일이다. 다시 시도해도 같다. 신호 버전을 함께 남겨, API 가 이 버전으로는 다시 돌리지 않고 그 스냅을
        # "검사 없음"으로 확정하게 한다(apps/api/src/queue/rendition-queue.ts `enqueueSignals`). 버전이 바뀌면 다시 돌린다.
        logger.error("신호 실패 video_id={} 이유={}", video_id, exc)
        return {"videoId": video_id, "status": "failed", "signalsVersion": SIGNALS_VERSION}
    except Exception as exc:  # noqa: BLE001 — 스토리지 장애 등은 재시도 대상이다
        logger.exception("신호 작업 중 예상치 못한 오류 video_id={}", video_id)
        _capture(exc)
        raise
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)


async def process_rendition_job(job, _job_token) -> dict:
    if job.data.get("only") == "signals":
        return await process_signals_job(job)
    video_id = job.data["videoId"]
    logger.info("렌디션 작업 수신 video_id={}", video_id)
    work_dir = tempfile.mkdtemp(prefix=f"rendition_{video_id}_")
    try:
        # 시간 제한은 `_run` 안에서 렌디션과 신호에 따로 건다.
        await _run(video_id, job.data["userId"], job.data["s3Key"], work_dir)
        return {"videoId": video_id, "status": "ready"}
    except RenditionSkipped as exc:
        logger.info("렌디션 건너뜀 video_id={} 이유={}", video_id, exc)
        return {"videoId": video_id, "status": "skipped"}
    except asyncio.TimeoutError:
        logger.error("렌디션 타임아웃 video_id={}", video_id)
        await rendition_db.mark_failed(video_id)
        raise
    except RenditionError as exc:
        # 변환 자체가 안 되는 파일이다. 다시 시도해도 같은 결과라 재시도하지 않는다.
        logger.error("렌디션 실패 video_id={} 이유={}", video_id, exc)
        await rendition_db.mark_failed(video_id)
        return {"videoId": video_id, "status": "failed"}
    except Exception as exc:  # noqa: BLE001 — 스토리지 장애 등은 재시도 대상이다
        logger.exception("렌디션 중 예상치 못한 오류 video_id={}", video_id)
        _capture(exc)
        await rendition_db.mark_failed(video_id)
        raise
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)


async def main() -> None:
    _init_sentry()
    await db.init_pool()

    worker = Worker(
        config.RENDITION_QUEUE_NAME,
        process_rendition_job,
        {"connection": config.REDIS_URL, "concurrency": config.RENDITION_CONCURRENCY},
    )
    logger.info("renditions 워커 시작 (queue={})", config.RENDITION_QUEUE_NAME)

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
