"""공유 사전 로더의 계약.

**이 파일의 존재 이유는 한 가지다.** 사전은 각 소비 모듈이 임포트 시점에 읽는데, `worker.py`
가 그 모듈을 임포트하지 않으면 기동 시 검증이 일어나지 않는다. 커밋 2·3 에서 연속으로 걸렸다 —
테스트는 전부 초록인데 컨테이너에서 사전을 지워도 워커가 떴다.

문서에 주의를 적는 것으로는 세 번째를 못 막는다(E-6 에서 이미 같은 방식으로 실패했다).
`REQUIRED` 를 **저장소의 실제 파일 목록에 묶어** 기계가 막게 한다.

ffmpeg·SDK 없이 도는 순수 검사다.
"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from pipeline import vocabulary  # noqa: E402

SHARED_TYPES_SRC = (
    Path(__file__).resolve().parents[3] / "packages" / "shared-types" / "src"
)


class RequiredVocabulariesTest(unittest.TestCase):
    def test_required_matches_the_files_in_shared_types(self) -> None:
        """사전을 새로 만들면 `REQUIRED` 에 넣기 전까지 여기서 막힌다.

        이게 임포트 누락이라는 실패 모드를 없애는 지점이다 — 목록에 들어가는 순간
        `verify_all()` 이 기동 시 검증하므로 `worker.py` 는 손대지 않아도 된다.
        """
        on_disk = sorted(path.name for path in SHARED_TYPES_SRC.glob("*-vocabulary.json"))
        self.assertEqual(
            sorted(vocabulary.REQUIRED),
            on_disk,
            "packages/shared-types/src 의 사전 목록과 vocabulary.REQUIRED 가 다릅니다. "
            "사전을 추가·삭제했다면 REQUIRED 도 함께 고치세요.",
        )

    def test_dockerfile_copies_every_required_vocabulary(self) -> None:
        # 와일드카드가 지워지고 개별 COPY 로 바뀌면 사전 하나가 이미지에서 빠질 수 있다.
        dockerfile = (Path(__file__).resolve().parents[1] / "Dockerfile").read_text(
            encoding="utf-8"
        )
        self.assertIn("packages/shared-types/src/*-vocabulary.json", dockerfile)

    def test_verify_all_reads_every_required_file(self) -> None:
        self.assertEqual(vocabulary.verify_all(), vocabulary.REQUIRED)

    def test_verify_all_fails_when_one_is_missing(self) -> None:
        # 디렉터리 스캔이었다면 "둘 적재" 로 조용히 성공한다. 기대 집합이 있어야 부재를 안다.
        original = vocabulary.REQUIRED
        try:
            vocabulary.REQUIRED = (*original, "nonexistent-vocabulary.json")
            with self.assertRaises(vocabulary.VocabularyUnavailableError):
                vocabulary.verify_all()
        finally:
            vocabulary.REQUIRED = original


class LoaderTest(unittest.TestCase):
    def test_container_path_is_searched_first(self) -> None:
        # 운영에서 저장소 경로 탐색이 먼저 돌면 안 된다.
        candidates = vocabulary.candidates_for("anchor-vocabulary.json")
        self.assertEqual(len(candidates), 2)
        self.assertEqual(candidates[0].parent.name, "ai-worker")

    def test_missing_vocabulary_names_both_paths_it_tried(self) -> None:
        # 메시지가 곧 해결 방법이어야 한다 — 어디를 봤는지 없으면 원인 파악에 시간이 든다.
        with self.assertRaises(vocabulary.VocabularyUnavailableError) as caught:
            vocabulary.load("nonexistent-vocabulary.json")
        message = str(caught.exception)
        self.assertIn("nonexistent-vocabulary.json", message)
        self.assertIn("packages/shared-types/src", message)


if __name__ == "__main__":
    unittest.main()
