"""vision 모델 호출 — 요청 구성·오류 분류·단가 계산.

`openai` SDK 는 **호출 시점에만** import 한다. 요청 구성과 오류 분류는 순수 함수라
SDK 설치 없이 테스트할 수 있어야 한다.
"""

import base64
import json
import time

from prompt import SYSTEM_PROMPT, USER_PROMPT
from result_schema import RESULT_JSON_SCHEMA, SCHEMA_NAME

PROVIDER = "openai"
DEFAULT_DETAIL = "low"
DEFAULT_MAX_OUTPUT_TOKENS = 700
DEFAULT_TIMEOUT_SECONDS = 60


class VisionCallError(RuntimeError):
    """분류된 호출 실패. `code` 와 `retryable` 을 리포트에 그대로 기록한다."""

    def __init__(self, code: str, retryable: bool, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.retryable = retryable


def encode_data_url(frame_path: str) -> str:
    with open(frame_path, "rb") as handle:
        encoded = base64.b64encode(handle.read()).decode("ascii")
    return f"data:image/jpeg;base64,{encoded}"


def build_request(
    model: str,
    image_data_urls: list[str],
    detail: str = DEFAULT_DETAIL,
    reasoning_effort: str | None = None,
    max_output_tokens: int = DEFAULT_MAX_OUTPUT_TOKENS,
) -> dict:
    """프레임 전체를 **한 요청**에 시간순으로 담는다(계획 문서 §3).

    프레임을 나눠 호출하면 모델이 같은 영상의 흐름을 볼 수 없고 요청 수만 늘어난다.
    """
    if not image_data_urls:
        raise ValueError("이미지가 없는 요청은 만들지 않습니다.")
    content: list[dict] = [{"type": "input_text", "text": USER_PROMPT}]
    for data_url in image_data_urls:
        content.append({"type": "input_image", "image_url": data_url, "detail": detail})

    request: dict = {
        "model": model,
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
    }
    # 추론 파라미터를 지원하지 않는 모델도 비교 대상이라 값이 있을 때만 넣는다.
    if reasoning_effort:
        request["reasoning"] = {"effort": reasoning_effort}
    return request


def classify_failure(status_code: int | None, exception_name: str, message: str) -> tuple[str, bool]:
    """(code, retryable) 로 분류한다 — 계획 문서 §12.

    재시도 가능/불가의 경계를 리포트에 남겨야 본구현의 재시도 정책을 실측으로 정할 수 있다.
    """
    lowered = f"{exception_name} {message}".lower()
    if "timeout" in lowered or "timed out" in lowered:
        return "TIMEOUT", True
    if status_code == 429:
        return "RATE_LIMITED", True
    if status_code is not None and 500 <= status_code < 600:
        return "UPSTREAM_ERROR", True
    if status_code in (401, 403):
        return "AUTH_FAILED", False
    if "connection" in lowered or "apiconnection" in lowered:
        return "NETWORK", True
    if "content_policy" in lowered or "safety" in lowered or "refus" in lowered:
        return "SAFETY_REFUSED", False
    if status_code == 400:
        return "BAD_REQUEST", False
    if status_code == 404:
        return "MODEL_NOT_FOUND", False
    return "UNKNOWN", False


def compute_cost_usd(
    input_tokens: int | None,
    output_tokens: int | None,
    price_input_per_mtok: float | None,
    price_output_per_mtok: float | None,
) -> float | None:
    """단가가 채워져 있지 않으면 **비용을 추측하지 않고 None** 을 돌린다.

    스파이크의 산출물이 "스냅당 단가" 이므로, 여기서 임의의 값을 넣으면 결론이 오염된다.
    단가는 `models.json` 에 운영자가 직접 채운다.
    """
    if price_input_per_mtok is None or price_output_per_mtok is None:
        return None
    used_input = input_tokens or 0
    used_output = output_tokens or 0
    return (
        used_input * price_input_per_mtok + used_output * price_output_per_mtok
    ) / 1_000_000


def extract_output_text(response: object) -> str:
    """Responses API 응답에서 JSON 본문 문자열만 꺼낸다.

    SDK 객체와 dict(테스트용 fake) 를 모두 받는다.
    """
    text = getattr(response, "output_text", None)
    if isinstance(text, str) and text.strip():
        return text
    payload = response if isinstance(response, dict) else getattr(response, "model_dump", lambda: {})()
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
    raise VisionCallError("EMPTY_OUTPUT", False, "모델 응답에서 본문을 찾지 못했습니다.")


def read_usage(response: object) -> tuple[int | None, int | None, str | None]:
    payload = response if isinstance(response, dict) else getattr(response, "model_dump", lambda: {})()
    usage = (payload or {}).get("usage") or {}
    request_id = (payload or {}).get("id")
    return usage.get("input_tokens"), usage.get("output_tokens"), request_id


def parse_output_json(text: str) -> dict:
    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:
        raise VisionCallError("SCHEMA_INVALID", True, f"JSON 파싱 실패: {exc}") from exc


def call_vision(request: dict, timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS) -> tuple[dict, int]:
    """실제 호출. (응답 payload, 지연시간 ms) 를 돌려준다.

    `OPENAI_API_KEY` 는 셸 환경에서만 읽는다 — 스파이크 단계에서는 `env-spec.ts` 에 선언하지
    않는다는 결정(docs/decisions/snap-content-analysis.md §5.2)에 따른다.
    """
    from openai import OpenAI  # noqa: PLC0415 — SDK 없이도 순수 함수 테스트가 돌아야 한다

    client = OpenAI(timeout=timeout_seconds)
    started = time.monotonic()
    try:
        response = client.responses.create(**request)
    except Exception as exc:  # noqa: BLE001 — 분류해서 다시 던진다
        status_code = getattr(exc, "status_code", None)
        code, retryable = classify_failure(status_code, type(exc).__name__, str(exc))
        raise VisionCallError(code, retryable, str(exc)) from exc
    latency_ms = int((time.monotonic() - started) * 1000)
    payload = response.model_dump() if hasattr(response, "model_dump") else response
    return payload, latency_ms
