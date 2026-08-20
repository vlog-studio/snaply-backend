"""스테이지 시드의 계약.

이 스펙에서 **가장 조용히 깨질 수 있는 것이 재현성**이다. 값이 달라져도 영상은 만들어지고
에러도 안 나므로, 사용자가 "복원"을 눌러 다른 영상을 받기 전까지 아무도 모른다. 그래서 골든
값과 **환경 독립성**을 함께 고정한다.

ffmpeg·SDK 없이 도는 순수 검사다.
"""

import json
import os
import subprocess
import sys
import unittest
from pathlib import Path

SRC = Path(__file__).resolve().parents[1] / "src"
sys.path.insert(0, str(SRC))

from pipeline import seed  # noqa: E402

FIXTURE = json.loads(
    (Path(__file__).resolve().parent / "fixtures" / "stage-seed.json").read_text(
        encoding="utf-8"
    )
)


class StageVocabularyTest(unittest.TestCase):
    def test_stages_are_ordered_by_the_pipeline(self) -> None:
        orders = [seed.STAGES[name]["order"] for name in seed.STAGE_NAMES]
        self.assertEqual(orders, sorted(orders))
        self.assertEqual(seed.STAGE_NAMES[0], "ingest")

    def test_only_directors_use_a_seed(self) -> None:
        # 리더는 MediaPipe·VAD 라 결정적이고, semantic 은 analysisVersion 으로 핀된다.
        # 선택이 있는 것은 디렉터뿐이다.
        for name in seed.SEEDED_STAGES:
            self.assertEqual(seed.STAGES[name]["kind"], "director", name)
        self.assertEqual(len(seed.SEEDED_STAGES), 3)

    def test_unknown_stage_is_not_seeded(self) -> None:
        self.assertFalse(seed.is_seeded_stage("style-directr"))
        self.assertFalse(seed.is_seeded_stage("visual-reader"))


class DeriveStageSeedTest(unittest.TestCase):
    def test_algorithm_parameters_come_from_the_vocabulary(self) -> None:
        # 코드에 하드코딩하면 사전의 설명과 실제 동작이 갈릴 수 있다.
        self.assertEqual(seed.SEED_ALGORITHM, FIXTURE["algorithm"])
        self.assertEqual(seed.SEED_TEMPLATE, FIXTURE["template"])
        self.assertEqual(seed.SEED_BYTES, FIXTURE["bytes"])
        self.assertEqual(seed.SEED_BYTE_ORDER, FIXTURE["byteOrder"])

    def test_every_golden_case_matches(self) -> None:
        for case in FIXTURE["cases"]:
            with self.subTest(**{k: case[k] for k in ("root", "stage", "attempt")}):
                self.assertEqual(
                    seed.derive_stage_seed(case["root"], case["stage"], case["attempt"]),
                    case["expected"],
                )

    def test_attempt_and_stage_both_change_the_seed(self) -> None:
        base = seed.derive_stage_seed(1837462, "style-director", 0)
        self.assertNotEqual(base, seed.derive_stage_seed(1837462, "style-director", 1))
        self.assertNotEqual(base, seed.derive_stage_seed(1837462, "edit-director", 0))
        self.assertNotEqual(base, seed.derive_stage_seed(1837463, "style-director", 0))

    def test_seed_is_stable_across_pythonhashseed(self) -> None:
        """`hash()` 를 썼다면 여기서 잡힌다.

        골든 값만으로는 부족하다 — 한 프로세스 안에서는 `hash()` 도 일관되므로 통과한다.
        PYTHONHASHSEED 를 바꿔 별도 프로세스로 두 번 돌려야 논거가 실제로 검증된다.
        """
        script = (
            "import sys; sys.path.insert(0, %r);"
            "from pipeline.seed import derive_stage_seed;"
            "print(derive_stage_seed(1837462, 'style-director', 2))" % str(SRC)
        )
        results = []
        for hash_seed in ("0", "1", "12345"):
            env = {**os.environ, "PYTHONHASHSEED": hash_seed}
            proc = subprocess.run(
                [sys.executable, "-c", script],
                capture_output=True, text=True, check=True, env=env,
            )
            results.append(proc.stdout.strip())

        self.assertEqual(len(set(results)), 1, f"PYTHONHASHSEED 에 따라 시드가 달라졌다: {results}")
        self.assertEqual(int(results[0]), seed.derive_stage_seed(1837462, "style-director", 2))

    def test_non_seeded_stage_is_rejected_not_defaulted(self) -> None:
        # 조용히 값을 내주면 리더에 attempt 를 붙이는 코드가 아무 경고 없이 자란다.
        with self.assertRaises(seed.SeedError):
            seed.derive_stage_seed(1837462, "visual-reader", 0)
        with self.assertRaises(seed.SeedError):
            seed.derive_stage_seed(1837462, "style-directr", 0)


class RootRangeTest(unittest.TestCase):
    def test_root_beyond_javascript_safe_integer_is_rejected(self) -> None:
        # 2^53 을 넘으면 JS 가 반올림해 API 가 쓴 root 와 워커가 읽은 root 가 달라진다.
        # 이 경로는 에러 없이 다른 영상을 만들기 때문에 입구에서 막는다.
        self.assertEqual(seed.ROOT_MAX, 9007199254740991)
        seed.derive_stage_seed(seed.ROOT_MAX, "edit-director", 0)
        with self.assertRaisesRegex(seed.SeedError, "root"):
            seed.derive_stage_seed(seed.ROOT_MAX + 1, "edit-director", 0)

    def test_negative_and_non_integer_roots_are_rejected(self) -> None:
        for bad in (-1, 1.5, "1837462", True, None):
            with self.subTest(root=bad):
                with self.assertRaises(seed.SeedError):
                    seed.derive_stage_seed(bad, "edit-director", 0)  # type: ignore[arg-type]


class ParseSeedTest(unittest.TestCase):
    def test_missing_stages_default_to_attempt_zero(self) -> None:
        root, attempt = seed.parse_seed({"root": 7, "attempt": {"style-director": 2}})
        self.assertEqual(root, 7)
        self.assertEqual(attempt["style-director"], 2)
        self.assertEqual(attempt["edit-director"], 0)
        self.assertEqual(set(attempt), set(seed.SEEDED_STAGES))

    def test_attempt_can_be_omitted_entirely(self) -> None:
        _, attempt = seed.parse_seed({"root": 7})
        self.assertTrue(all(value == 0 for value in attempt.values()))

    def test_attempt_on_a_non_seeded_stage_is_rejected(self) -> None:
        # 오타 난 스테이지 이름을 조용히 무시하면 "다시 생성"이 아무 일도 안 한 것처럼 보이고,
        # 그 이유를 찾는 데 시간이 든다.
        with self.assertRaisesRegex(seed.SeedError, "style-directr"):
            seed.parse_seed({"root": 7, "attempt": {"style-directr": 1}})
        with self.assertRaisesRegex(seed.SeedError, "visual-reader"):
            seed.parse_seed({"root": 7, "attempt": {"visual-reader": 1}})

    def test_malformed_seed_is_rejected(self) -> None:
        for bad in (None, [], {"attempt": {}}, {"root": 7, "attempt": []}):
            with self.subTest(seed=bad):
                with self.assertRaises(seed.SeedError):
                    seed.parse_seed(bad)
        with self.assertRaises(seed.SeedError):
            seed.parse_seed({"root": 7, "attempt": {"edit-director": -1}})

    def test_seeds_for_spec_covers_every_seeded_stage(self) -> None:
        seeds = seed.seeds_for_spec({"root": 1837462, "attempt": {"style-director": 2}})
        self.assertEqual(set(seeds), set(seed.SEEDED_STAGES))
        self.assertEqual(
            seeds["style-director"], seed.derive_stage_seed(1837462, "style-director", 2)
        )
        self.assertEqual(
            seeds["edit-director"], seed.derive_stage_seed(1837462, "edit-director", 0)
        )

    def test_regeneration_without_touching_attempt_is_identical(self) -> None:
        # 만료 후 무료 재생성의 약속 — storage-and-subscription-policy.md §3.
        spec = {"root": 1837462, "attempt": {"edit-director": 1, "style-director": 2}}
        self.assertEqual(seed.seeds_for_spec(spec), seed.seeds_for_spec(spec))

    def test_bumping_one_stage_leaves_the_others_untouched(self) -> None:
        # 부분 재생성의 핵심 — "스티커만 다시"가 컷을 바꾸면 무효화 표의 유지 범위가 무너진다.
        before = seed.seeds_for_spec({"root": 1837462, "attempt": {"style-director": 0}})
        after = seed.seeds_for_spec({"root": 1837462, "attempt": {"style-director": 1}})
        self.assertNotEqual(before["style-director"], after["style-director"])
        self.assertEqual(before["edit-director"], after["edit-director"])
        self.assertEqual(before["music-director"], after["music-director"])


if __name__ == "__main__":
    unittest.main()
