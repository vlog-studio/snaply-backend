"""분석 결과 계약 — Structured Outputs 용 JSON Schema + 애플리케이션 검증.

모델이 스키마를 지켰다고 값이 쓸 만하다는 뜻은 아니다(0~1 범위, 목록 길이, 빈 문자열).
그래서 스키마 강제와 별개로 애플리케이션에서 한 번 더 검증한다 — 계획 문서 §6.
"""

from prompt import VISUAL_ISSUE_CODES

SCHEMA_NAME = "snap_analysis"

MAX_SUMMARY_LENGTH = 200
MAX_LIST_ITEMS = 6
MAX_ITEM_LENGTH = 40

_STRING_LIST = {
    "type": "array",
    "items": {"type": "string"},
}

RESULT_JSON_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": [
        "summary", "topics", "places", "objects", "actions", "moods",
        "visualQuality", "confidence",
    ],
    "properties": {
        "summary": {"type": "string"},
        "topics": _STRING_LIST,
        "places": _STRING_LIST,
        "objects": _STRING_LIST,
        "actions": _STRING_LIST,
        "moods": _STRING_LIST,
        "visualQuality": {
            "type": "object",
            "additionalProperties": False,
            "required": ["score", "issues", "usableForEdit"],
            "properties": {
                "score": {"type": "number"},
                "issues": {
                    "type": "array",
                    "items": {"type": "string", "enum": list(VISUAL_ISSUE_CODES)},
                },
                "usableForEdit": {"type": "boolean"},
            },
        },
        "confidence": {"type": "number"},
    },
}

LIST_FIELDS = ("topics", "places", "objects", "actions", "moods")


class ResultSchemaError(ValueError):
    """모델 출력이 계약을 벗어남 — 1회 재시도 대상(계획 문서 §12.1)."""


def _validate_string_list(field: str, value: object) -> list[str]:
    if not isinstance(value, list):
        raise ResultSchemaError(f"{field} 는 배열이어야 합니다.")
    if len(value) > MAX_LIST_ITEMS:
        raise ResultSchemaError(f"{field} 항목이 {MAX_LIST_ITEMS} 개를 넘습니다: {len(value)}")
    items: list[str] = []
    for item in value:
        if not isinstance(item, str):
            raise ResultSchemaError(f"{field} 항목이 문자열이 아닙니다: {item!r}")
        stripped = item.strip()
        if not stripped:
            raise ResultSchemaError(f"{field} 에 빈 문자열이 있습니다.")
        if len(stripped) > MAX_ITEM_LENGTH:
            raise ResultSchemaError(f"{field} 항목이 너무 깁니다: {stripped[:20]}...")
        items.append(stripped)
    return items


def _validate_unit_range(field: str, value: object) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ResultSchemaError(f"{field} 는 숫자여야 합니다: {value!r}")
    number = float(value)
    if not 0.0 <= number <= 1.0:
        raise ResultSchemaError(f"{field} 가 0~1 범위를 벗어났습니다: {number}")
    return number


def validate_result(payload: object) -> dict:
    """검증된 결과를 정규화해서 돌려준다. 실패는 ResultSchemaError."""
    if not isinstance(payload, dict):
        raise ResultSchemaError("결과가 객체가 아닙니다.")

    summary = payload.get("summary")
    if not isinstance(summary, str) or not summary.strip():
        raise ResultSchemaError("summary 가 비어 있습니다.")
    if len(summary) > MAX_SUMMARY_LENGTH:
        raise ResultSchemaError(f"summary 가 너무 깁니다: {len(summary)}자")

    quality = payload.get("visualQuality")
    if not isinstance(quality, dict):
        raise ResultSchemaError("visualQuality 가 객체가 아닙니다.")
    usable = quality.get("usableForEdit")
    if not isinstance(usable, bool):
        raise ResultSchemaError("visualQuality.usableForEdit 가 boolean 이 아닙니다.")
    issues = quality.get("issues")
    if not isinstance(issues, list):
        raise ResultSchemaError("visualQuality.issues 는 배열이어야 합니다.")
    unknown = [code for code in issues if code not in VISUAL_ISSUE_CODES]
    if unknown:
        raise ResultSchemaError(f"허용되지 않은 visualIssue: {unknown}")

    return {
        "summary": summary.strip(),
        **{field: _validate_string_list(field, payload.get(field)) for field in LIST_FIELDS},
        "visualQuality": {
            "score": _validate_unit_range("visualQuality.score", quality.get("score")),
            "issues": list(issues),
            "usableForEdit": usable,
        },
        "confidence": _validate_unit_range("confidence", payload.get("confidence")),
    }
