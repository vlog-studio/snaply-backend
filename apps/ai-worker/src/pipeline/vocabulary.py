"""공유 사전 파일 로더.

사전의 원본은 `packages/shared-types/src/*-vocabulary.json` 이고 API 도 같은 파일을 읽는다.
사전이 컨테이너와 저장소에서 다른 곳에 있으므로 후보 목록으로 찾는다 — `config.py` 의
`ENV_CANDIDATES` 와 같은 패턴이되 **실패 동작은 반대**다.

`.env` 는 없어도 된다(운영에서는 값이 주입으로 들어온다). 사전은 **없으면 기동 실패**여야 한다.
없는 채로 뜨면 렌더 시점에 터지고 원인이 안 보인다.

이 모듈은 `config.py` 가 아니다. `config.py` 는 analysis_worker 도 임포트하므로 거기에 사전
로드를 넣으면 편집 파이프라인만 쓰는 사전 하나 때문에 분석 워커까지 못 뜬다.

배치·로딩 규약: docs/plans/edit-spec-v3-kickoff.md §3.4
"""

import json
from pathlib import Path

import config


# 편집 워커가 기동 시점에 있어야 하는 사전 전부.
#
# **왜 목록을 선언하는가.** 사전은 각 소비 모듈이 임포트 시점에 읽는데, `worker.py` 가 그
# 모듈을 임포트하지 않으면 기동 시 검증이 일어나지 않는다. 실제로 커밋 2·3 에서 연속으로
# 걸렸다 — 테스트는 전부 초록인데 컨테이너에서 사전을 지워도 워커가 떴다.
#
# **왜 디렉터리 스캔이 아닌가.** 스캔은 있는 파일을 찾지 빠진 파일을 모른다. 셋 중 하나가
# 이미지에 없으면 "둘 적재"로 조용히 성공한다. 기대 집합이 선언돼 있어야 부재를 감지한다.
#
# 이 목록이 저장소의 실제 파일과 어긋나면 `tests/test_vocabulary.py` 가 잡는다. 즉 사전을
# 새로 만들면 여기에 넣기 전까지 테스트가 실패하고, 넣으면 기동 검증이 자동으로 따라온다 —
# `worker.py` 는 손대지 않는다.
REQUIRED = (
    "anchor-vocabulary.json",
    "stage-vocabulary.json",
    "invalidation-vocabulary.json",
)


class VocabularyUnavailableError(RuntimeError):
    """공유 사전을 찾을 수 없음 — 편집 워커는 이 상태로 뜨면 안 된다."""


def candidates_for(filename: str) -> tuple[Path, ...]:
    """컨테이너 경로를 앞에 둔다 — 운영에서 저장소 경로 탐색이 먼저 돌지 않게."""
    return (
        config.WORKER_ROOT / filename,
        config.REPO_ROOT / "packages" / "shared-types" / "src" / filename,
    )


def load(filename: str) -> dict:
    for path in candidates_for(filename):
        if path.exists():
            return json.loads(path.read_text(encoding="utf-8"))
    searched = "\n  ".join(str(path) for path in candidates_for(filename))
    raise VocabularyUnavailableError(
        f"공유 사전 {filename} 을 찾을 수 없습니다. 편집 워커는 사전 없이 기동하지 않습니다.\n"
        f"찾아본 경로:\n  {searched}\n"
        "컨테이너라면 Dockerfile 의 COPY packages/shared-types/src/*-vocabulary.json 을,"
        " 네이티브 실행이라면 저장소 경로를 확인하세요."
    )


def verify_all() -> tuple[str, ...]:
    """`REQUIRED` 를 전부 읽어 보고 이름을 돌려준다. 하나라도 없으면 기동을 멈춘다.

    소비 모듈의 임포트 여부와 무관하게 도는 것이 요점이다. 사전이 넷째로 늘어도 이 함수를
    부르는 쪽(`worker.py`)은 고치지 않는다.
    """
    for filename in REQUIRED:
        load(filename)
    return REQUIRED
