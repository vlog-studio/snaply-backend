"""Versioned edit specifications consumed from BullMQ jobs."""

from dataclasses import dataclass


MAX_CLIPS = 10
MIN_CLIP_DURATION_MS = 100


@dataclass(frozen=True)
class ClipSpec:
    video_id: str
    start_ms: int = 0
    end_ms: int | None = None


def _parse_v2_clip(raw: object) -> ClipSpec:
    if not isinstance(raw, dict):
        raise ValueError("클립 명세가 객체가 아닙니다.")

    video_id = raw.get("videoId")
    start_ms = raw.get("startMs", 0)
    end_ms = raw.get("endMs")
    if not isinstance(video_id, str) or not video_id:
        raise ValueError("클립 videoId가 올바르지 않습니다.")
    if isinstance(start_ms, bool) or not isinstance(start_ms, int) or start_ms < 0:
        raise ValueError("클립 시작 시간은 0 이상의 정수 밀리초여야 합니다.")
    if end_ms is not None:
        if isinstance(end_ms, bool) or not isinstance(end_ms, int) or end_ms <= start_ms:
            raise ValueError("클립 종료 시간은 시작 시간보다 커야 합니다.")
        if end_ms - start_ms < MIN_CLIP_DURATION_MS:
            raise ValueError(f"클립 길이는 최소 {MIN_CLIP_DURATION_MS}ms여야 합니다.")
    return ClipSpec(video_id, start_ms, end_ms)


def parse_job_clips(data: object) -> list[ClipSpec]:
    """Parse v3 clips, falling back to full-length legacy videoIds jobs."""
    if not isinstance(data, dict):
        raise ValueError("편집 작업 데이터가 객체가 아닙니다.")

    raw_clips = data.get("clips")
    edit_spec = data.get("editSpec")
    if raw_clips is None and isinstance(edit_spec, dict) and edit_spec.get("version") == 2:
        raw_clips = edit_spec.get("clips")

    if raw_clips is not None:
        if not isinstance(raw_clips, list) or not 1 <= len(raw_clips) <= MAX_CLIPS:
            raise ValueError(f"클립은 1개 이상 {MAX_CLIPS}개 이하여야 합니다.")
        return [_parse_v2_clip(raw) for raw in raw_clips]

    video_ids = data.get("videoIds")
    if not isinstance(video_ids, list) or not 1 <= len(video_ids) <= MAX_CLIPS:
        raise ValueError("편집할 원본 영상이 없습니다.")
    if any(not isinstance(video_id, str) or not video_id for video_id in video_ids):
        raise ValueError("원본 영상 ID가 올바르지 않습니다.")
    return [ClipSpec(video_id) for video_id in video_ids]
