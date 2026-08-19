"""분석 1건의 순서를 담는다 — 프레임 추출 → 모델 호출 → 결과 검증.

DB 와 큐는 모르는 계층이다. 상태 전이는 `analysis_worker.py` 가 담당한다.
"""

import os
from dataclasses import dataclass, field

from loguru import logger

from pipeline.video_analysis import frame_sampler, openai_client
from pipeline.video_analysis.errors import AnalysisError
from pipeline.video_analysis.prompt import PROMPT_VERSION
from pipeline.video_analysis.schema import ResultSchemaError, validate_result

MAX_FRAMES = 4


@dataclass
class AnalysisOutcome:
    """DB 에 그대로 반영할 값 + 관측용 수치."""

    duration_ms: int
    frame_timestamps_ms: list[int] = field(default_factory=list)
    result: dict = field(default_factory=dict)
    model_version: str = ""
    prompt_version: str = PROMPT_VERSION
    input_tokens: int | None = None
    output_tokens: int | None = None
    latency_ms: int | None = None
    request_id: str | None = None


def _prepare_frames(video_path: str, work_dir: str) -> tuple[int, list[int], list[str]]:
    """(실측 길이, 사용한 시점, 프레임 경로). 유사 프레임 제거까지 끝낸 결과."""
    try:
        duration_ms = frame_sampler.probe_duration_ms(video_path)
    except Exception as exc:  # noqa: BLE001 — 손상된 영상·미지원 코덱
        raise AnalysisError(
            "FRAME_EXTRACTION_FAILED", False, f"영상 길이를 확인할 수 없습니다: {exc}"
        ) from exc

    timestamps = frame_sampler.frame_timestamps_ms(duration_ms)[:MAX_FRAMES]
    if not timestamps:
        raise AnalysisError(
            "FRAME_EXTRACTION_FAILED", False, f"프레임 시점을 계산할 수 없습니다(길이 {duration_ms}ms)."
        )

    frames = [
        (timestamp, os.path.join(work_dir, f"frame_{index}.jpg"))
        for index, timestamp in enumerate(timestamps)
    ]
    try:
        frame_sampler.extract_frames(video_path, frames)
    except frame_sampler.FrameExtractionError as exc:
        raise AnalysisError("FRAME_EXTRACTION_FAILED", False, str(exc)) from exc

    existing = [(ts, path) for ts, path in frames if os.path.exists(path)]
    if not existing:
        raise AnalysisError("FRAME_EXTRACTION_FAILED", False, "프레임을 하나도 얻지 못했습니다.")

    hashes = [frame_sampler.frame_ahash(path) for _, path in existing]
    kept = frame_sampler.dedupe_indices(hashes)
    return (
        duration_ms,
        [existing[index][0] for index in kept],
        [existing[index][1] for index in kept],
    )


def analyze(video_path: str, work_dir: str) -> AnalysisOutcome:
    """로컬에 내려받은 스냅 하나를 분석한다. 실패는 모두 `AnalysisError` 로 분류돼 나온다."""
    duration_ms, timestamps, frame_paths = _prepare_frames(video_path, work_dir)
    logger.info("프레임 {}장 추출 duration={}ms ts={}", len(frame_paths), duration_ms, timestamps)

    request = openai_client.build_request(
        [openai_client.encode_data_url(path) for path in frame_paths]
    )
    payload, latency_ms = openai_client.call_vision(request)
    input_tokens, output_tokens, request_id = openai_client.read_usage(payload)

    try:
        result = validate_result(openai_client.parse_output_json(openai_client.extract_output_text(payload)))
    except ResultSchemaError as exc:
        # 스키마 강제에도 값이 계약을 벗어난 경우. 1회 재시도할 가치가 있다.
        raise AnalysisError("SCHEMA_INVALID", True, str(exc)) from exc

    return AnalysisOutcome(
        duration_ms=duration_ms,
        frame_timestamps_ms=timestamps,
        result=result,
        model_version=str(request["model"]),
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        latency_ms=latency_ms,
        request_id=request_id,
    )
