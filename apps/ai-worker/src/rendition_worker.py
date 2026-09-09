"""BullMQ 'renditions' 큐 구독 워커 — 배포 렌디션 생성.

편집 워커·분석 워커와 **다른 프로세스**다. 같은 이미지에서 커맨드만 다르게 뜬다.
셋을 나눈 이유는 같다 — 한쪽의 재배포나 장애가 다른 쪽을 멈추면 안 되고, 자원 성격이 다르다.
이 워커는 짧은 FFmpeg 변환이라 편집 워커처럼 오래 CPU 를 잡지 않는다.

적재 주체는 API 다. `POST /videos` 로 업로드가 확정되는 순간 한 건이 들어온다.

**실패는 치명적이지 않다.** 렌디션이 없으면 다른 플랫폼에서 재생이 안 될 뿐, 스냅은 쓸 수
있고 편집은 원본으로 돈다 — 그래서 실패해도 `videos.status` 는 건드리지 않는다.
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
import storage
from pipeline.rendition import RenditionError, build


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


async def _run(video_id: str, user_id: str, s3_key: str, work_dir: str) -> None:
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
        video_id, rendition_key, thumbnail_key, outcome.duration_ms
    )
    if not saved:
        # 변환 중 영상이 삭제됐다 — 만들어 둔 객체는 정리 배치가 회수한다.
        raise RenditionSkipped(f"반영 대상이 없습니다: {video_id}")

    logger.info("렌디션 완료 video_id={} key={}", video_id, rendition_key)


async def process_rendition_job(job, _job_token) -> dict:
    video_id = job.data["videoId"]
    logger.info("렌디션 작업 수신 video_id={}", video_id)
    work_dir = tempfile.mkdtemp(prefix=f"rendition_{video_id}_")
    try:
        await asyncio.wait_for(
            _run(video_id, job.data["userId"], job.data["s3Key"], work_dir),
            timeout=config.RENDITION_TIMEOUT_SECONDS,
        )
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
