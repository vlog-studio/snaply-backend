"""컷 사이 전환 어휘 — 경계마다 고르는 전환의 이름·길이 범위·폴백과, 그 값을 컷에 맞추는 해석 규칙.

원본은 `packages/shared-types/src/transition-vocabulary.json` **하나**이고 API·앱도 같은 파일을
읽는다. 해석(`resolve_transition`)은 앱 미리보기와 렌더가 같은 답을 내야 하므로 TS 구현과 같은
픽스처(`packages/shared-types/fixtures/transition-resolution.json`)로 고정한다.

결정: docs/decisions/auto-edit-draft.md §2.3 · 툴 카드: docs/plans/edit-recipe-tools.md §1
"""

import math
from dataclasses import dataclass

from pipeline import vocabulary as _vocabulary

VOCABULARY_FILE = "transition-vocabulary.json"

VOCABULARY: dict = _vocabulary.load(VOCABULARY_FILE)

TRANSITION_VOCABULARY_VERSION: int = VOCABULARY["transitionVocabularyVersion"]
KINDS: dict[str, dict] = VOCABULARY["kinds"]
KIND_NAMES: tuple[str, ...] = tuple(sorted(KINDS, key=lambda name: KINDS[name]["order"]))
TIMINGS: tuple[str, ...] = tuple(VOCABULARY["timings"])
EASINGS: tuple[str, ...] = tuple(VOCABULARY["easings"])

HARDCUT = "hardcut"
OVERLAP = "overlap"


class TransitionError(ValueError):
    """사전에 맞지 않는 전환 — 조용히 고치지 않는다."""


@dataclass(frozen=True)
class Transition:
    kind: str
    # hardcut 은 None
    duration_ms: int | None = None


@dataclass(frozen=True)
class Boundary:
    """경계 양쪽 컷의 사정. 모두 밀리초."""

    outgoing_cut_ms: float
    outgoing_spare_after_ms: float
    incoming_cut_ms: float
    incoming_spare_before_ms: float


def validate_transition(kind: str, duration_ms: object = None) -> Transition:
    """범위 밖 길이는 폴백하지 않고 거부한다 — 줄이는 것은 해석 단계의 일이다."""
    entry = KINDS.get(kind)
    if entry is None:
        raise TransitionError(f"알 수 없는 전환입니다: {kind}")
    spec = entry["durationMs"]
    if spec is None:
        if duration_ms is not None:
            raise TransitionError(f"{kind} 는 길이를 갖지 않습니다.")
        return Transition(HARDCUT)
    if (
        isinstance(duration_ms, bool)
        or not isinstance(duration_ms, int)
        or not spec["min"] <= duration_ms <= spec["max"]
    ):
        raise TransitionError(
            f"{kind} 의 길이는 {spec['min']}~{spec['max']}ms 정수여야 합니다(받은 값: {duration_ms})."
        )
    return Transition(kind, duration_ms)


def default_transition(kind: str) -> Transition:
    spec = KINDS[kind]["durationMs"]
    return Transition(kind, None if spec is None else spec["default"])


def _capacity_ms(kind: str, boundary: Boundary) -> int:
    entry = KINDS[kind]
    if entry["timing"] == OVERLAP:
        # 경계를 가운데에 두고 양쪽에 절반씩 — 여분 프레임이 그만큼 있어야 하고,
        # 섞이는 몫이 컷의 절반을 넘지 않아야 컷의 가운데가 온전히 보인다.
        caps = [
            2 * boundary.outgoing_spare_after_ms,
            2 * boundary.incoming_spare_before_ms,
            boundary.outgoing_cut_ms,
            boundary.incoming_cut_ms,
        ]
    else:
        split = entry["split"]
        caps = []
        if split["outgoing"] > 0:
            caps.append(boundary.outgoing_cut_ms / 2 / split["outgoing"])
        if split["incoming"] > 0:
            caps.append(boundary.incoming_cut_ms / 2 / split["incoming"])
    return math.floor(max(0, min(caps)))


def resolve_transition(transition: Transition, boundary: Boundary) -> Transition:
    """고른 전환을 이 경계에 실제로 들어가는 전환으로 바꾼다.

    길이는 컷 길이·여분 프레임이 허락하는 만큼 줄고, `min` 보다 짧아지면 `fallback` 이 된다.
    """
    if transition.kind == HARDCUT:
        return transition
    entry = KINDS[transition.kind]
    duration = min(transition.duration_ms, _capacity_ms(transition.kind, boundary))
    if duration >= entry["durationMs"]["min"]:
        return Transition(transition.kind, duration)
    fallback = entry["fallback"] or HARDCUT
    if fallback == HARDCUT:
        return Transition(HARDCUT)
    return resolve_transition(default_transition(fallback), boundary)
