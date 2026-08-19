"""vision 모델 호출 — 요청 구성과 응답 해석.

`openai` SDK 는 **호출 시점에만** import 한다. 요청 구성과 응답 해석은 순수 함수라
SDK 설치 없이 테스트할 수 있어야 한다.
"""

import base64
import json
import time

import config
from pipeline.video_analysis.errors import AnalysisError, classify_failure
from pipeline.video_analysis.prompt import SYSTEM_PROMPT, USER_PROMPT
from pipeline.video_analysis.schema import RESULT_JSON_SCHEMA, SCHEMA_NAME

PROVIDER = "openai"
MAX_OUTPUT_TOKENS = 700


def encode_data_url(frame_path: str) -> str:
    """프레임을 data URL 로. 프레임은 S3 에 올리지 않으므로 presigned URL 이 없다."""
    with open(frame_path, "rb") as handle:
        encoded = base64.b64encode(handle.read()).decode("ascii")
    return f"data:image/jpeg;base64,{encoded}"


def build_request(
    image_data_urls: list[str],
    model: str | None = None,
    detail: str | None = None,
    max_output_tokens: int = MAX_OUTPUT_TOKENS,
) -> dict:
    """프레임 전체를 **한 요청**에 시간순으로 담는다.

    프레임을 나눠 호출하면 모델이 같은 영상의 흐름을 볼 수 없고 요청 수만 늘어난다.
    """
    if not image_data_urls:
        raise ValueError("이미지가 없는 요청은 만들지 않습니다.")
    content: list[dict] = [{"type": "input_text", "text": USER_PROMPT}]
    for data_url in image_data_urls:
        content.append(
            {
                "type": "input_image",
                "image_url": data_url,
                "detail": detail or config.OPENAI_IMAGE_DETAIL,
            }
        )
    return {
        "model": model or config.OPENAI_VISION_MODEL,
        "input": [
            {"role": "system", "content": [{"type": "input_text", "text": SYSTEM_PROMPT}]},
            {"role": "user", "content": content},
        ],
        "text": {
            "format": {
                "type": "json_schema",
                "name": SCHEMA_NAME,
                "strict": True,
                "schema": RESULT_JSON_SCHEMA,
            }
        },
        "max_output_tokens": max_output_tokens,
        # Responses API 의 `store` 기본값은 true 다 — 끄지 않으면 우리가 보낸 프레임과 응답이
        # 30일간 저장되고 제공자 대시보드에 남는다. 남용 모니터링 보관과는 별개의 축이라,
        # 켜 두면 개인정보처리방침에 보관 축을 하나 더 적어야 한다.
        #
        # 끄는 데 따르는 손실은 대시보드 로그뿐이다. 이 파이프라인은 `previous_response_id` 를
        # 쓰지 않는 단발 호출이고, 품질·단가 기준선은 `video_analyses` 테이블 집계로 낸다
        # (docs/decisions/snap-content-analysis.md §9.3).
        "store": False,
    }


def extract_output_text(response: object) -> str:
    """응답에서 JSON 본문 문자열만 꺼낸다. SDK 객체와 dict 를 모두 받는다."""
    text = getattr(response, "output_text", None)
    if isinstance(text, str) and text.strip():
        return text
    payload = (
        response if isinstance(response, dict) else getattr(response, "model_dump", lambda: {})()
    )
    if isinstance(payload, dict):
        direct = payload.get("output_text")
        if isinstance(direct, str) and direct.strip():
            return direct
        chunks = [
            item.get("text", "")
            for message in payload.get("output", []) or []
            for item in (message.get("content") or [])
            if item.get("type") in ("output_text", "text")
        ]
        joined = "".join(chunks).strip()
        if joined:
            return joined
    raise AnalysisError("EMPTY_OUTPUT", False, "모델 응답에서 본문을 찾지 못했습니다.")


def read_usage(response: object) -> tuple[int | None, int | None, str | None]:
    """(input_tokens, output_tokens, request_id). 토큰은 비용 관측의 원천이다."""
    payload = (
        response if isinstance(response, dict) else getattr(response, "model_dump", lambda: {})()
    )
    usage = (payload or {}).get("usage") or {}
    return usage.get("input_tokens"), usage.get("output_tokens"), (payload or {}).get("id")


def parse_output_json(text: str) -> dict:
    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:
        raise AnalysisError("SCHEMA_INVALID", True, f"JSON 파싱 실패: {exc}") from exc


def call_vision(request: dict, timeout_seconds: int | None = None) -> tuple[dict, int]:
    """실제 호출. (응답 payload, 지연시간 ms).

    `OPENAI_API_KEY` 는 SDK 가 환경변수에서 읽는다. 로컬은 `apps/api/.env`,
    운영은 배포 플랫폼 시크릿 주입 — 둘 다 프로세스 환경변수로 들어온다.
    """
    from openai import OpenAI  # noqa: PLC0415 — SDK 없이도 순수 함수 테스트가 돌아야 한다

    client = OpenAI(timeout=timeout_seconds or config.VIDEO_ANALYSIS_TIMEOUT_SECONDS)
    started = time.monotonic()
    try:
        response = client.responses.create(**request)
    except Exception as exc:  # noqa: BLE001 — 분류해서 다시 던진다
        code, retryable = classify_failure(
            getattr(exc, "status_code", None), type(exc).__name__, str(exc)
        )
        raise AnalysisError(code, retryable, str(exc)) from exc
    latency_ms = int((time.monotonic() - started) * 1000)
    payload = response.model_dump() if hasattr(response, "model_dump") else response
    return payload, latency_ms
