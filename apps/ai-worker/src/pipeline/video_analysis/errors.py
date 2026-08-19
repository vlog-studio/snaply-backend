"""분석 실패 분류.

`packages/shared-types/src/domain.ts` 의 `VideoAnalysisErrorCode` 와 같은 목록을 유지한다.
재시도 가능 여부의 판정도 API(`video-analysis.service.ts` 의 `TERMINAL_ERROR_CODES`)와
같아야 한다 — 한쪽만 고치면 앱에 "재시도하라"고 알려주고 실제로는 같은 실패가 반복된다.
"""


class AnalysisError(RuntimeError):
    """분류된 분석 실패. code 와 retryable 을 DB 에 그대로 기록한다."""

    def __init__(self, code: str, retryable: bool, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.retryable = retryable


# 다시 실행해도 결과가 달라지지 않는 코드.
TERMINAL_CODES = frozenset(
    {
        "AUTH_FAILED",
        "BAD_REQUEST",
        "MODEL_NOT_FOUND",
        "SAFETY_REFUSED",
        "FRAME_EXTRACTION_FAILED",
    }
)


def is_retryable(code: str) -> bool:
    return code not in TERMINAL_CODES


def classify_failure(status_code: int | None, exception_name: str, message: str) -> tuple[str, bool]:
    """(code, retryable) 로 분류한다.

    SDK 예외 타입을 import 하지 않고 이름·상태코드로 판정한다 — 이 함수가 SDK 설치 없이
    테스트되어야 하고, SDK 버전이 올라가며 예외 클래스가 바뀌어도 분류가 깨지지 않는다.
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
    return "INTERNAL", False
