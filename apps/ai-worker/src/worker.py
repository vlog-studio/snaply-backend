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
from pipeline import anchor, editor, invalidation, music, seed, subtitle, vocabulary
from pipeline.edit_spec import parse_job_clips
from pipeline.editor import get_preset
from pipeline.render_spec import parse_render_spec

_publisher: aioredis.Redis | None = None


class JobCanceled(Exception):
    """API가 작업을 canceled로 바꿔 파이프라인을 중단해야 할 때."""


class SourceUnavailableError(RuntimeError):
    """원본 클립을 찾을 수 없음 — 실패 분류 코드 SOURCE_UNAVAILABLE."""


def _init_sentry() -> None:
    """SENTRY_DSN이 있을 때만 초기화. 없으면 no-op."""
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


async def _publish(job_id: str, payload: dict) -> None:
    if _publisher is not None:
        await _publisher.publish(config.edit_progress_channel(job_id), json.dumps(payload))


async def _progress(job_id: str, progress: int, step: str, extra: dict | None = None) -> None:
    # 갱신 실패 = 그 사이 취소됨(status가 processing이 아님) → 파이프라인 중단
    if not await db.update_progress(job_id, progress):
        raise JobCanceled(job_id)
    await _publish(job_id, {"progress": progress, "step": step, **(extra or {})})


async def _run_pipeline(job_id: str, data: dict, work_dir: str) -> None:
    user_id = data["userId"]
    clip_specs = parse_job_clips(data)
    edit_spec = data.get("editSpec") or {"stylePreset": data.get("stylePreset", "일상")}
    preset = get_preset(edit_spec["stylePreset"])
    render_spec = parse_render_spec(data.get("renderSpec"))

    ctx = await db.fetch_job_context(job_id)
    if ctx is None:
        raise RuntimeError("edit_jobs 레코드를 찾을 수 없습니다.")
    output_video_id = ctx["video_id"]

    if not await db.mark_processing(job_id):
        raise JobCanceled(job_id)
    await _publish(job_id, {"progress": 0, "step": "시작"})

    # 1) 원본 클립 다운로드
    video_ids = list(dict.fromkeys(clip.video_id for clip in clip_specs))
    source_keys = await db.fetch_source_keys(user_id, video_ids)
    if len(source_keys) != len(video_ids):
        raise SourceUnavailableError("원본 클립을 찾을 수 없습니다.")
    local_sources: dict[str, str] = {}
    for i, video_id in enumerate(video_ids):
        key = source_keys[video_id]
        local = os.path.join(work_dir, f"src_{i}{os.path.splitext(key)[1] or '.mp4'}")
        await asyncio.to_thread(storage.download, key, local)
        local_sources[video_id] = local
    clips = [
        editor.ClipSource(local_sources[clip.video_id], clip.start_ms, clip.end_ms)
        for clip in clip_specs
    ]
    await _progress(job_id, 10, "원본 다운로드 완료")

    # 2) 컷편집
    base = await asyncio.to_thread(editor.edit, clips, preset, render_spec, work_dir)
    duration = await asyncio.to_thread(editor.probe_duration, base)
    await _progress(job_id, 35, "컷편집 완료")

    # 3) BGM 매칭/합성
    with_bgm_path = os.path.join(work_dir, "with_bgm.mp4")
    current, _bgm_ok = await asyncio.to_thread(
        music.apply_bgm, base, preset.bgm_tag, with_bgm_path, duration
    )
    await _progress(job_id, 60, "음악 매칭 중...")

    # 4) 자막 생성/삽입 — 요청 시에만 (쇼츠용이 기본이라 디폴트는 건너뜀 → whisper 추론 비용 절약)
    if data.get("subtitles", False):
        with_sub_path = os.path.join(work_dir, "with_sub.mp4")
        current, _sub_ok = await asyncio.to_thread(
            subtitle.apply_subtitles, current, work_dir, with_sub_path
        )
        await _progress(job_id, 85, "자막 생성 중...")
    else:
        await _progress(job_id, 85, "자막 건너뜀")

    # 5) 썸네일 추출 (기본 1초, 짧은 결과물은 중간 시점)
    thumb_path = os.path.join(work_dir, "thumb.jpg")
    thumbnail_at = min(1.0, duration / 2)
    await asyncio.to_thread(editor.extract_thumbnail, current, thumb_path, thumbnail_at)

    # 6) S3 업로드
    edited_key = storage.edited_key(user_id, job_id)
    thumb_key = storage.thumbnail_key(user_id, job_id)
    edited_url = await asyncio.to_thread(storage.upload, current, edited_key, "video/mp4")
    thumbnail_url = await asyncio.to_thread(storage.upload, thumb_path, thumb_key, "image/jpeg")
    await _progress(job_id, 95, "업로드 중...")

    # 7) 결과 반영
    await db.set_video_result(
        output_video_id,
        edited_url,
        edited_key,
        thumbnail_url,
        thumb_key,
    )
    if not await db.mark_done(job_id):
        # 업로드까지 끝났지만 그 사이 취소됨 — done으로 되살리지 않는다 (산출물은 GC가 정리)
        raise JobCanceled(job_id)
    output_url = storage.download_url(edited_key)
    await _publish(job_id, {"progress": 100, "step": "완료", "outputUrl": output_url})
    logger.info("편집 완료 job_id={} url={}", job_id, edited_url)


async def process_edit_job(job, _job_token) -> dict:
    job_id = job.data["jobId"]
    logger.info(
        "편집 작업 수신 job_id={} clips={}",
        job_id,
        job.data.get("clips") or job.data.get("videoIds"),
    )
    work_dir = tempfile.mkdtemp(prefix=f"edit_{job_id}_")
    try:
        await asyncio.wait_for(
            _run_pipeline(job_id, job.data, work_dir),
            timeout=config.EDIT_TIMEOUT_SECONDS,
        )
        return {"jobId": job_id, "status": "done"}
    except JobCanceled:
        # 취소는 실패가 아니다 — 상태 변경·WS 종료 메시지는 API의 취소 처리가 이미 수행했다.
        # raise하지 않아 BullMQ 재시도도 일어나지 않는다.
        logger.info("편집 취소 감지, 중단 job_id={}", job_id)
        return {"jobId": job_id, "status": "canceled"}
    except asyncio.TimeoutError:
        logger.error("편집 타임아웃 job_id={}", job_id)
        await db.mark_failed(job_id, "편집 시간이 초과되었습니다.", "TIMEOUT")
        await _publish(
            job_id,
            {"status": "failed", "error": "편집 시간이 초과되었습니다.", "code": "TIMEOUT"},
        )
        raise
    except SourceUnavailableError as exc:
        logger.error("원본 클립 없음 job_id={}", job_id)
        await db.mark_failed(job_id, str(exc), "SOURCE_UNAVAILABLE")
        await _publish(
            job_id,
            {"status": "failed", "error": str(exc), "code": "SOURCE_UNAVAILABLE"},
        )
        raise
    except Exception as exc:  # noqa: BLE001
        logger.exception("편집 실패 job_id={}", job_id)
        _capture(exc)
        await db.mark_failed(job_id, str(exc), "INTERNAL")
        await _publish(
            job_id,
            {"status": "failed", "error": "편집 중 오류가 발생했습니다.", "code": "INTERNAL"},
        )
        raise
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)


async def main() -> None:
    global _publisher
    # 사전이 하나라도 없으면 여기서 멈춘다 — DB·Redis 를 건드리기 **전**이다.
    # 소비 모듈을 임포트했는지와 무관하게 도는 것이 요점이다. 임포트에만 기대면 사전을 늘릴
    # 때마다 이 파일도 같이 고쳐야 하고, 실제로 두 번 빠뜨렸다. 넷째가 생겨도 이 줄은 그대로다.
    loaded = vocabulary.verify_all()

    _init_sentry()
    await db.init_pool()
    _publisher = aioredis.from_url(config.REDIS_URL, decode_responses=True)
    # whisper 모델은 자막 요청(subtitles=true)이 처음 올 때 lazy 로드한다.
    # 기본 플로우(자막 없음)에서는 로드하지 않아 기동이 빠르고 메모리를 아낀다.

    worker = Worker(config.EDIT_QUEUE_NAME, process_edit_job, {"connection": config.REDIS_URL})
    # 이미지에 어떤 사전이 들어 있는지는 렌더 결과를 되짚을 때 첫 단서라 기동 로그에 남긴다.
    # 버전 항목은 모듈을 임포트해야 나오므로 사전이 늘면 이 줄도 늘어난다 — 다만 **기동 검증은
    # 위 verify_all() 이 이미 마쳤다.** 로그가 빠뜨려도 없는 사전으로 뜨지는 않는다.
    logger.info(
        "edit-jobs 워커 시작 (queue={} 사전={}종 anchor=v{} derivation=v{} stage=v{} invalidation=v{})",
        config.EDIT_QUEUE_NAME,
        len(loaded),
        anchor.VOCABULARY_VERSION,
        anchor.DERIVATION_VERSION,
        seed.STAGE_VOCABULARY_VERSION,
        invalidation.INVALIDATION_VOCABULARY_VERSION,
    )

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
