"""스테이지 시드 파생.

재현과 "다시 생성"은 서로 반대를 요구한다. 시드를 스펙에 하나만 고정하면 시스템 재렌더는
같은 결과를 내지만 사용자가 "다시 생성"을 눌러도 같은 영상이 나온다. 그래서 시드는 둘로 나뉜다:

    "seed": { "root": 1837462, "attempt": { "edit-director": 0, "style-director": 2 } }

- 시스템 재렌더 · 만료 후 재생성 → `attempt` 유지 → **완전히 같은 산출물**
  ([decisions/storage-and-subscription-policy.md](../../../../docs/decisions/storage-and-subscription-policy.md) §3 의 약속)
- 사용자 "다시 생성" → 해당 스테이지의 `attempt` 만 증가 → 다른 결과, 여전히 재현 가능

**`attempt` 가 스테이지별인 이유**는 부분 재생성이다. "스티커만 다시"가 `music`·`timeline` 까지
바꾸면 무효화 표가 약속한 유지 범위가 무너진다.

파생 함수는 **워커 단독 구현**이다. API 는 `root` 를 쓰고 "다시 생성"에서 `attempt` 를 올릴 뿐
파생값을 소비하지 않는다 — `pipeline/anchor.py` 의 파생 공식과 같은 구조다. 그래서 크로스랭귀지
동일성 테스트가 아니라 `tests/fixtures/stage-seed.json` 골든 값이 계약이다.

계획: docs/plans/edit-spec-v3-kickoff.md §4
"""

import hashlib

from pipeline import vocabulary as _vocabulary

VOCABULARY_FILE = "stage-vocabulary.json"

VOCABULARY: dict = _vocabulary.load(VOCABULARY_FILE)

STAGE_VOCABULARY_VERSION: int = VOCABULARY["stageVocabularyVersion"]
STAGES: dict[str, dict] = VOCABULARY["stages"]

# 알고리즘을 사전에서 읽어 코드와 문서가 갈라지지 않게 한다. 값을 바꾸면 과거 스펙이 다른
# 영상을 내므로, 이것들은 사실상 불변이고 바꾸려면 스펙 버전이 올라가야 한다.
SEED_ALGORITHM: str = VOCABULARY["seedAlgorithm"]
SEED_TEMPLATE: str = VOCABULARY["seedTemplate"]
SEED_BYTES: int = VOCABULARY["seedBytes"]
SEED_BYTE_ORDER: str = VOCABULARY["seedByteOrder"]
ROOT_MAX: int = VOCABULARY["rootMax"]

STAGE_NAMES: tuple[str, ...] = tuple(
    sorted(STAGES, key=lambda name: STAGES[name]["order"])
)
SEEDED_STAGES: tuple[str, ...] = tuple(
    name for name in STAGE_NAMES if STAGES[name]["seeded"]
)


class SeedError(ValueError):
    """시드 구조가 계약을 벗어남 — 조용히 기본값으로 넘어가지 않는다."""


def is_seeded_stage(stage: str) -> bool:
    entry = STAGES.get(stage)
    return entry is not None and bool(entry["seeded"])


def derive_stage_seed(root: int, stage: str, attempt: int) -> int:
    """`sha256("{root}:{stage}:{attempt}")` 의 상위 8바이트를 빅엔디언 정수로 읽는다.

    **파이썬 내장 `hash()` 를 쓰면 안 된다.** `PYTHONHASHSEED` 가 프로세스마다 달라서
    같은 스펙이 실행할 때마다 다른 영상을 만든다. 재현성이 이 스펙의 존재 이유인데 그게
    프로세스 기동 시각에 좌우되면 아무 의미가 없다.

    스테이지 이름을 사전으로 검증하는 이유도 같다 — 오타 난 이름도 유효한 해시를 내므로
    검증이 없으면 "다시 생성"이 아무 일도 안 하는 것처럼 보인다.
    """
    if not is_seeded_stage(stage):
        raise SeedError(
            f"시드를 쓰지 않는 스테이지입니다: {stage} "
            f"(시드를 쓰는 스테이지: {', '.join(SEEDED_STAGES)})"
        )
    _require_root(root)
    _require_attempt(attempt, stage)

    material = SEED_TEMPLATE.format(root=root, stage=stage, attempt=attempt)
    digest = hashlib.new(SEED_ALGORITHM, material.encode("utf-8")).digest()
    return int.from_bytes(digest[:SEED_BYTES], SEED_BYTE_ORDER)


def _require_root(root: int) -> None:
    if isinstance(root, bool) or not isinstance(root, int):
        raise SeedError("시드 root 는 정수여야 합니다.")
    if not 0 <= root <= ROOT_MAX:
        # 2^53 을 넘으면 JavaScript 가 값을 반올림해 API 가 쓴 root 와 워커가 읽은 root 가
        # 달라진다. 재현성이 소리 없이 깨지는 경로라 범위를 강제한다.
        raise SeedError(f"시드 root 는 0 이상 {ROOT_MAX} 이하여야 합니다: {root}")


def _require_attempt(attempt: int, stage: str) -> None:
    if isinstance(attempt, bool) or not isinstance(attempt, int) or attempt < 0:
        raise SeedError(f"{stage} 의 attempt 는 0 이상의 정수여야 합니다: {attempt}")


def parse_seed(raw: object) -> tuple[int, dict[str, int]]:
    """스펙의 `seed` 를 `(root, attempt)` 로 읽는다. 빠진 스테이지의 attempt 는 0 이다.

    `attempt` 에 시드를 쓰지 않는 스테이지가 들어오면 거부한다. 조용히 무시하면 사용자가
    "다시 생성"을 눌렀는데 아무 일도 안 일어난 이유를 아무도 모른다.
    """
    if not isinstance(raw, dict):
        raise SeedError("seed 가 객체가 아닙니다.")

    root = raw.get("root")
    _require_root(root)

    raw_attempt = raw.get("attempt", {})
    if not isinstance(raw_attempt, dict):
        raise SeedError("seed.attempt 가 객체가 아닙니다.")

    attempt = {stage: 0 for stage in SEEDED_STAGES}
    for stage, value in raw_attempt.items():
        if not is_seeded_stage(stage):
            raise SeedError(
                f"시드를 쓰지 않는 스테이지의 attempt 입니다: {stage} "
                f"(시드를 쓰는 스테이지: {', '.join(SEEDED_STAGES)})"
            )
        _require_attempt(value, stage)
        attempt[stage] = value

    return root, attempt


def seeds_for_spec(raw: object) -> dict[str, int]:
    """스펙의 `seed` 에서 시드를 쓰는 스테이지 전부의 파생 시드를 만든다."""
    root, attempt = parse_seed(raw)
    return {stage: derive_stage_seed(root, stage, attempt[stage]) for stage in SEEDED_STAGES}
