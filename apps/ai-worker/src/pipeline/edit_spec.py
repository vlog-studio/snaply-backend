"""Versioned edit specifications consumed from BullMQ jobs."""

from dataclasses import dataclass

from pipeline.transition import Transition, TransitionError, validate_transition


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


@dataclass(frozen=True)
class Timeline:
    """editSpec v3 의 컷과 경계 전환. `transitions[i]` 는 `cuts[i]` → `cuts[i+1]` 이다."""

    cuts: list[ClipSpec]
    transitions: list[Transition]


def _parse_v3_cut(raw: object) -> tuple[str, ClipSpec]:
    if not isinstance(raw, dict):
        raise ValueError("컷 명세가 객체가 아닙니다.")
    cut_id = raw.get("cutId")
    if not isinstance(cut_id, str) or not cut_id:
        raise ValueError("컷 cutId가 올바르지 않습니다.")
    clip = _parse_v2_clip(
        {
            "videoId": raw.get("videoId"),
            "startMs": raw.get("sourceInMs", 0),
            **({"endMs": raw["sourceOutMs"]} if raw.get("sourceOutMs") is not None else {}),
        }
    )
    return cut_id, clip


def parse_timeline(edit_spec: object) -> Timeline:
    """editSpec v3(컷·전환)를 읽는다. 경계마다 전환이 정확히 하나씩이어야 한다.

    빠진 경계를 hardcut 으로 채우지 않는다 — 어긋난 스펙을 조용히 렌더하면 사용자가 고른 전환이
    빠진 결과물이 유료로 완료된다(decisions/edit-spec-v3.md §4 와 같은 이유).
    """
    if not isinstance(edit_spec, dict) or edit_spec.get("version") != 3:
        raise ValueError("editSpec v3 가 아닙니다.")
    timeline = edit_spec.get("timeline")
    if not isinstance(timeline, dict):
        raise ValueError("editSpec v3 에 timeline 이 없습니다.")
    raw_cuts = timeline.get("cuts")
    raw_transitions = timeline.get("transitions")
    if not isinstance(raw_cuts, list) or not 1 <= len(raw_cuts) <= MAX_CLIPS:
        raise ValueError(f"컷은 1개 이상 {MAX_CLIPS}개 이하여야 합니다.")
    cuts = [_parse_v3_cut(raw) for raw in raw_cuts]
    if len({cut_id for cut_id, _ in cuts}) != len(cuts):
        raise ValueError("컷 cutId가 겹칩니다.")
    if not isinstance(raw_transitions, list) or len(raw_transitions) != len(cuts) - 1:
        raise ValueError("전환은 컷 사이마다 하나씩이어야 합니다.")

    transitions: list[Transition] = []
    for i, raw in enumerate(raw_transitions):
        if not isinstance(raw, dict):
            raise ValueError("전환 명세가 객체가 아닙니다.")
        if raw.get("fromCutId") != cuts[i][0] or raw.get("toCutId") != cuts[i + 1][0]:
            raise ValueError("전환이 이어진 두 컷을 가리키지 않습니다.")
        try:
            transitions.append(validate_transition(str(raw.get("kind")), raw.get("durationMs")))
        except TransitionError as exc:
            raise ValueError(str(exc)) from exc
    return Timeline([clip for _, clip in cuts], transitions)
