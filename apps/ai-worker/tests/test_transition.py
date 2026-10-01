"""전환 사전과 해석 규칙의 계약.

사전은 `packages/shared-types/src/transition-vocabulary.json` 하나가 원본이고 API·앱도 같은
파일을 읽는다. 해석 규칙은 **TS 구현과 같은 픽스처**
(`packages/shared-types/fixtures/transition-resolution.json`)로 검사한다 — 앱 미리보기와 렌더가
경계마다 같은 전환을 그려야 한다. TS 쪽은 `apps/api/test/transition-vocabulary.test.ts` 가 맡는다.

ffmpeg·SDK 없이 도는 순수 검사다.
"""

import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from pipeline import transition, vocabulary  # noqa: E402
from pipeline.transition import (  # noqa: E402
    Boundary,
    Transition,
    TransitionError,
    resolve_transition,
    validate_transition,
)

FIXTURE = json.loads(
    (
        Path(__file__).resolve().parents[3]
        / "packages"
        / "shared-types"
        / "fixtures"
        / "transition-resolution.json"
    ).read_text(encoding="utf-8")
)


def _transition(raw: dict) -> Transition:
    return Transition(raw["kind"], raw.get("durationMs"))


class VocabularyTest(unittest.TestCase):
    def test_worker_reads_the_shared_vocabulary_file(self) -> None:
        candidates = vocabulary.candidates_for(transition.VOCABULARY_FILE)
        self.assertTrue(candidates[1].exists())

    def test_kind_order_is_dense_from_zero(self) -> None:
        orders = sorted(entry["order"] for entry in transition.KINDS.values())
        self.assertEqual(orders, list(range(len(orders))))

    def test_kinds_are_the_v1_five(self) -> None:
        # TS 의 TRANSITION_KINDS 와 같은 순서여야 한다 — 그쪽은 api 테스트가 사전과 대조한다.
        self.assertEqual(
            transition.KIND_NAMES, ("hardcut", "crossfade", "dip", "flash", "zoompunch")
        )

    def test_every_kind_uses_a_declared_timing_and_easing(self) -> None:
        for name, entry in transition.KINDS.items():
            self.assertIn(entry["timing"], transition.TIMINGS, name)
            if "easing" in entry:
                self.assertIn(entry["easing"], transition.EASINGS, name)


class ValidateTest(unittest.TestCase):
    def test_accepts_values_in_range(self) -> None:
        self.assertEqual(validate_transition("hardcut"), Transition("hardcut"))
        self.assertEqual(validate_transition("crossfade", 800), Transition("crossfade", 800))

    def test_rejects_out_of_range_instead_of_clamping(self) -> None:
        for kind, ms in (("crossfade", 199), ("crossfade", 801), ("dip", 300.5), ("dip", None), ("dip", True)):
            with self.subTest(kind=kind, ms=ms), self.assertRaises(TransitionError):
                validate_transition(kind, ms)

    def test_rejects_unknown_kind_and_hardcut_with_duration(self) -> None:
        with self.assertRaises(TransitionError):
            validate_transition("whip", 300)
        with self.assertRaises(TransitionError):
            validate_transition("hardcut", 100)

    def test_defaults_are_valid(self) -> None:
        for name in transition.KIND_NAMES:
            default = transition.default_transition(name)
            self.assertEqual(validate_transition(default.kind, default.duration_ms), default)


class ResolveFixtureTest(unittest.TestCase):
    def test_fixture_cases(self) -> None:
        for case in FIXTURE["cases"]:
            with self.subTest(case["name"]):
                boundary = Boundary(
                    outgoing_cut_ms=case["outgoing"]["cutMs"],
                    outgoing_spare_after_ms=case["outgoing"]["spareAfterMs"],
                    incoming_cut_ms=case["incoming"]["cutMs"],
                    incoming_spare_before_ms=case["incoming"]["spareBeforeMs"],
                )
                self.assertEqual(
                    resolve_transition(_transition(case["transition"]), boundary),
                    _transition(case["expected"]),
                )


if __name__ == "__main__":
    unittest.main()
