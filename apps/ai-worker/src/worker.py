"""BullMQ 'edit-jobs' 큐 구독 워커.

Phase 4: 편집 파이프라인 뼈대. 큐에서 job을 받아 상태를 처리하고
진행률을 Redis Pub/Sub으로 발행한다. 실제 영상 편집은 Phase 5에서 구현.
"""

import asyncio
import json
import signal

import redis.asyncio as aioredis
from bullmq import Worker
from loguru import logger

import db
from config import EDIT_QUEUE_NAME, REDIS_URL, edit_progress_channel

# Phase 5에서 실제 편집 단계로 대체될 진행률 시뮬레이션 단계
PROGRESS_STEPS = [
    (10, "편집 준비 중..."),
    (30, "음악 매칭 중..."),
    (70, "자막 생성 중..."),
    (95, "렌더링 중..."),
]

_publisher: aioredis.Redis | None = None


async def _publish(job_id: str, payload: dict) -> None:
    if _publisher is None:
        return
    await _publisher.publish(edit_progress_channel(job_id), json.dumps(payload))


async def process_edit_job(job, _job_token) -> dict:
    data = job.data
    job_id = data["jobId"]
    logger.info("편집 작업 수신 job_id={} videos={}", job_id, data.get("videoIds"))

    try:
        await db.mark_processing(job_id)
        await _publish(job_id, {"progress": 0, "step": "시작"})

        for progress, step in PROGRESS_STEPS:
            await asyncio.sleep(0.3)  # Phase 5에서 실제 편집 작업으로 대체
            await db.update_progress(job_id, progress)
            await _publish(job_id, {"progress": progress, "step": step})

        await db.mark_done(job_id)
        await _publish(job_id, {"progress": 100, "step": "완료"})
        logger.info("편집 작업 완료 job_id={}", job_id)
        return {"jobId": job_id, "status": "done"}
    except Exception as exc:  # noqa: BLE001
        logger.exception("편집 작업 실패 job_id={}", job_id)
        await db.mark_failed(job_id, str(exc))
        await _publish(job_id, {"status": "failed", "error": "편집 중 오류가 발생했습니다."})
        raise


async def main() -> None:
    global _publisher
    await db.init_pool()
    _publisher = aioredis.from_url(REDIS_URL, decode_responses=True)

    worker = Worker(
        EDIT_QUEUE_NAME,
        process_edit_job,
        {"connection": REDIS_URL},
    )
    logger.info("edit-jobs 워커 시작 (queue={})", EDIT_QUEUE_NAME)

    stop_event = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, stop_event.set)

    await stop_event.wait()

    logger.info("종료 신호 수신, 정리 중...")
    await worker.close()
    if _publisher is not None:
        await _publisher.aclose()
    await db.close_pool()


if __name__ == "__main__":
    asyncio.run(main())
