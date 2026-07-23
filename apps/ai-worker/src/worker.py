"""BullMQ 'edit-jobs' 큐 구독 워커 — 실제 AI 편집 파이프라인 (Phase 5).

큐에서 job을 받아 원본 다운로드 → 컷편집 → BGM → 자막 → 썸네일 → S3 업로드를
수행하고, edit_jobs/videos 상태를 갱신하며 진행률을 Redis Pub/Sub으로 발행한다.
"""

import asyncio
import json
import os
import shutil
import signal
import tempfile

import redis.asyncio as aioredis
from bullmq import Worker
from loguru import logger

import config
import db
import storage
from pipeline import editor, music, subtitle
from pipeline.editor import get_preset

_publisher: aioredis.Redis | None = None


async def _publish(job_id: str, payload: dict) -> None:
    if _publisher is not None:
        await _publisher.publish(config.edit_progress_channel(job_id), json.dumps(payload))


async def _progress(job_id: str, progress: int, step: str, extra: dict | None = None) -> None:
    await db.update_progress(job_id, progress)
    await _publish(job_id, {"progress": progress, "step": step, **(extra or {})})


async def _run_pipeline(job_id: str, data: dict, work_dir: str) -> None:
    user_id = data["userId"]
    video_ids = data["videoIds"]
    preset = get_preset(data["stylePreset"])

    ctx = await db.fetch_job_context(job_id)
    if ctx is None:
        raise RuntimeError("edit_jobs 레코드를 찾을 수 없습니다.")
    output_video_id = ctx["video_id"]

    await db.mark_processing(job_id)
    await _publish(job_id, {"progress": 0, "step": "시작"})

    # 1) 원본 클립 다운로드
    source_keys = await db.fetch_source_keys(video_ids)
    if not source_keys:
        raise RuntimeError("원본 클립을 찾을 수 없습니다.")
    clips: list[str] = []
    for i, key in enumerate(source_keys):
        local = os.path.join(work_dir, f"src_{i}{os.path.splitext(key)[1] or '.mp4'}")
        await asyncio.to_thread(storage.download, key, local)
        clips.append(local)
    await _progress(job_id, 10, "원본 다운로드 완료")

    # 2) 컷편집
    base = await asyncio.to_thread(editor.edit, clips, preset, work_dir)
    duration = await asyncio.to_thread(editor.probe_duration, base)
    await _progress(job_id, 35, "컷편집 완료")

    # 3) BGM 매칭/합성
    with_bgm_path = os.path.join(work_dir, "with_bgm.mp4")
    current, _bgm_ok = await asyncio.to_thread(
        music.apply_bgm, base, preset.bgm_tag, with_bgm_path, duration
    )
    await _progress(job_id, 60, "음악 매칭 중...")

    # 4) 자막 생성/삽입
    with_sub_path = os.path.join(work_dir, "with_sub.mp4")
    current, _sub_ok = await asyncio.to_thread(
        subtitle.apply_subtitles, current, work_dir, with_sub_path
    )
    await _progress(job_id, 85, "자막 생성 중...")

    # 5) 썸네일 추출 (1초 시점)
    thumb_path = os.path.join(work_dir, "thumb.jpg")
    await asyncio.to_thread(editor.extract_thumbnail, current, thumb_path, 1.0)

    # 6) S3 업로드
    edited_key = storage.edited_key(user_id, job_id)
    thumb_key = storage.thumbnail_key(user_id, job_id)
    edited_url = await asyncio.to_thread(storage.upload, current, edited_key, "video/mp4")
    thumbnail_url = await asyncio.to_thread(storage.upload, thumb_path, thumb_key, "image/jpeg")
    await _progress(job_id, 95, "업로드 중...")

    # 7) 결과 반영
    await db.set_video_result(output_video_id, edited_url, thumbnail_url)
    await db.mark_done(job_id)
    await _publish(job_id, {"progress": 100, "step": "완료", "outputUrl": edited_url})
    logger.info("편집 완료 job_id={} url={}", job_id, edited_url)


async def process_edit_job(job, _job_token) -> dict:
    job_id = job.data["jobId"]
    logger.info("편집 작업 수신 job_id={} videos={}", job_id, job.data.get("videoIds"))
    work_dir = tempfile.mkdtemp(prefix=f"edit_{job_id}_")
    try:
        await asyncio.wait_for(
            _run_pipeline(job_id, job.data, work_dir),
            timeout=config.EDIT_TIMEOUT_SECONDS,
        )
        return {"jobId": job_id, "status": "done"}
    except asyncio.TimeoutError:
        logger.error("편집 타임아웃 job_id={}", job_id)
        await db.mark_failed(job_id, "편집 시간이 초과되었습니다.")
        await _publish(job_id, {"status": "failed", "error": "편집 시간이 초과되었습니다."})
        raise
    except Exception as exc:  # noqa: BLE001
        logger.exception("편집 실패 job_id={}", job_id)
        await db.mark_failed(job_id, str(exc))
        await _publish(job_id, {"status": "failed", "error": "편집 중 오류가 발생했습니다."})
        raise
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)


async def main() -> None:
    global _publisher
    await db.init_pool()
    _publisher = aioredis.from_url(config.REDIS_URL, decode_responses=True)
    subtitle.load_model()  # 시작 시 1회 로드

    worker = Worker(config.EDIT_QUEUE_NAME, process_edit_job, {"connection": config.REDIS_URL})
    logger.info("edit-jobs 워커 시작 (queue={})", config.EDIT_QUEUE_NAME)

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
