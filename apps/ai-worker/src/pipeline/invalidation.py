"""재생성 무효화 규칙 — 무엇을 바꾸면 어디까지 다시 계산하는가.

원본은 `packages/shared-types/src/invalidation-vocabulary.json` **하나**이고 API 도 같은 파일을
읽는다. 표를 문서에만 두면 구현과 갈라지므로 데이터로 둔다.

액션마다 **모든 레이어의 상태를 빠짐없이 적는다.** 생략을 허용하고 기본값을 두면 레이어를 새로
추가했을 때 아무도 판단하지 않은 채 그 기본값으로 굳는다 — `preserved` 기본값은 새 레이어를
조용히 낡게 하고 `invalidated` 기본값은 조용히 낭비한다.

계획: docs/plans/edit-spec-v3-kickoff.md §5
"""

from pipeline import seed as _seed
from pipeline import vocabulary as _vocabulary

VOCABULARY_FILE = "invalidation-vocabulary.json"

VOCABULARY: dict = _vocabulary.load(VOCABULARY_FILE)

INVALIDATION_VOCABULARY_VERSION: int = VOCABULARY["invalidationVocabularyVersion"]
STATES: dict[str, str] = VOCABULARY["states"]
LAYERS: tuple[str, ...] = tuple(VOCABULARY["layers"])
ACTIONS: dict[str, dict] = VOCABULARY["actions"]

ACTION_NAMES: tuple[str, ...] = tuple(
    sorted(ACTIONS, key=lambda name: ACTIONS[name]["order"])
)

INVALIDATED = "invalidated"
RETIMED = "retimed"
PRESERVED = "preserved"


class InvalidationError(ValueError):
    """무효화 사전에 없는 액션·레이어 — 조용히 기본값으로 넘어가지 않는다."""


def _entry(action: str) -> dict:
    entry = ACTIONS.get(action)
    if entry is None:
        raise InvalidationError(
            f"알 수 없는 재생성 액션입니다: {action} (아는 액션: {', '.join(ACTION_NAMES)})"
        )
    return entry


def layer_state(action: str, layer: str) -> str:
    state = _entry(action)["layers"].get(layer)
    if state is None:
        # 사전에 빠진 조합을 기본값으로 때우면 이 표를 데이터로 둔 이유가 사라진다.
        raise InvalidationError(f"무효화 사전에 {action} × {layer} 판단이 없습니다.")
    return state


def layers_in_state(action: str, state: str) -> tuple[str, ...]:
    return tuple(layer for layer in LAYERS if layer_state(action, layer) == state)


def attempt_bump_for(action: str) -> tuple[str, ...]:
    """이 액션이 어떤 디렉터의 `attempt` 를 올리는가. 비어 있으면 선택이 없다는 뜻이다."""
    return tuple(_entry(action)["attemptBump"])


def reinterpreted_refs_for(action: str) -> tuple[str, ...]:
    return tuple(_entry(action)["reinterpretedRefs"])


def pin_promotion_for(action: str) -> tuple[str, ...]:
    """A-5 의 세 번째 축. 무효화도 재해석도 아닌 별개 정책이다."""
    return tuple(_entry(action)["pinPromotion"])


def is_preserving_action(action: str) -> bool:
    """아무것도 무효화하지 않는 액션 — 산출물이 바이트 단위로 같아야 한다."""
    return all(layer_state(action, layer) == PRESERVED for layer in LAYERS)


def next_seed(raw_seed: object, action: str) -> dict:
    """액션에 따라 `attempt` 를 올린 새 시드를 만든다. 원본은 바꾸지 않는다.

    스펙은 영구 저장물이라 제자리 수정이 과거 산출물의 재현을 깨뜨린다. 그리고 **올리는 것은
    이 액션이 지목한 스테이지뿐**이다 — 전부 올리면 "스티커만 다시"가 컷까지 바꾼다.
    """
    root, attempt = _seed.parse_seed(raw_seed)
    bumped = dict(attempt)
    for stage in attempt_bump_for(action):
        if not _seed.is_seeded_stage(stage):
            raise InvalidationError(
                f"{action} 이 시드를 쓰지 않는 스테이지의 attempt 를 올리려 합니다: {stage}"
            )
        bumped[stage] = bumped.get(stage, 0) + 1
    return {"root": root, "attempt": bumped}
