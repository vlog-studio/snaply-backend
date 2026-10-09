"""컷 역할 어휘 — AI 편집 초안이 컷을 고르고 놓는 문법. 사용자에게 보이지 않는 내부 값이다(ANA-2).

원본은 `packages/shared-types/src/cut-role-vocabulary.json` **하나**이고 API 도 같은 파일을
읽는다(`cut-role.ts`). 고르는 일은 API 의 선택 단계가 하고, 워커는 역할을 받아 검증한다 —
사전에 없는 역할은 조용히 `body` 로 바꾸지 않고 거부한다.

결정: docs/decisions/auto-edit-draft.md · 역할을 정하는 규칙: docs/decisions/edit-director.md §6
"""

from pipeline import vocabulary as _vocabulary

VOCABULARY_FILE = "cut-role-vocabulary.json"

VOCABULARY: dict = _vocabulary.load(VOCABULARY_FILE)

CUT_ROLE_VOCABULARY_VERSION: int = VOCABULARY["cutRoleVocabularyVersion"]
ROLES: dict[str, dict] = VOCABULARY["roles"]
ROLE_NAMES: tuple[str, ...] = tuple(sorted(ROLES, key=lambda name: ROLES[name]["order"]))
POSITIONS: tuple[str, ...] = tuple(VOCABULARY["positions"])
SOURCES: tuple[str, ...] = tuple(VOCABULARY["sources"])
SIGNALS: dict[str, dict] = VOCABULARY["signals"]
DEFAULT_ROLE: str = VOCABULARY["default"]


class CutRoleError(ValueError):
    """사전에 없는 컷 역할."""


def validate_role(role: object) -> str:
    if not isinstance(role, str) or role not in ROLES:
        raise CutRoleError(f"알 수 없는 컷 역할입니다: {role!r} (허용: {', '.join(ROLE_NAMES)})")
    return role
