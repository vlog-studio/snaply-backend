"""컷 역할 어휘의 정합성.

원본은 `packages/shared-types/src/cut-role-vocabulary.json` 하나이고 API 테스트
(`apps/api/test/cut-role-vocabulary.test.ts`)도 같은 파일을 같은 규칙으로 검사한다.

ffmpeg·SDK 없이 도는 순수 검사다.
"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from pipeline import cut_role, vocabulary  # noqa: E402


class CutRoleVocabularyTest(unittest.TestCase):
    def test_worker_reads_the_shared_vocabulary_file(self) -> None:
        candidates = vocabulary.candidates_for(cut_role.VOCABULARY_FILE)
        self.assertTrue(candidates[1].exists())

    def test_roles_are_the_v1_seven(self) -> None:
        # TS 의 CUT_ROLES 와 같은 순서여야 한다 — 그쪽은 api 테스트가 사전과 대조한다.
        self.assertEqual(
            cut_role.ROLE_NAMES,
            ("hook", "establish", "detail", "action", "people", "closer", "body"),
        )

    def test_role_order_is_dense_from_zero(self) -> None:
        orders = sorted(entry["order"] for entry in cut_role.ROLES.values())
        self.assertEqual(orders, list(range(len(orders))))

    def test_every_role_uses_a_declared_position_and_signals(self) -> None:
        for name, entry in cut_role.ROLES.items():
            self.assertIn(entry["position"], cut_role.POSITIONS, name)
            for signal in entry["signals"]:
                self.assertIn(signal, cut_role.SIGNALS, name)

    def test_every_signal_has_a_declared_source(self) -> None:
        for name, entry in cut_role.SIGNALS.items():
            self.assertIn(entry["source"], cut_role.SOURCES, name)

    def test_first_and_last_each_have_exactly_one_role(self) -> None:
        # 첫·마지막 자리는 그 자리의 역할로만 채우므로 하나씩이어야 고를 것이 없다.
        for position in ("first", "last"):
            holders = [n for n, e in cut_role.ROLES.items() if e["position"] == position]
            self.assertEqual(len(holders), 1, position)

    def test_default_role_needs_no_signal_and_fits_the_middle(self) -> None:
        # 분석이 꺼진 초안의 가운데 컷은 default 로 남는다 — 신호 없이, 가운데 자리에 놓일 수 있어야 한다.
        entry = cut_role.ROLES[cut_role.DEFAULT_ROLE]
        self.assertEqual(entry["signals"], [])
        self.assertEqual(entry["position"], "any")

    def test_only_the_default_role_has_no_signal(self) -> None:
        for name, entry in cut_role.ROLES.items():
            if name != cut_role.DEFAULT_ROLE:
                self.assertTrue(entry["signals"], name)

    def test_validate_role_rejects_unknown_roles(self) -> None:
        self.assertEqual(cut_role.validate_role("hook"), "hook")
        for bad in ("intro", "", None, 3):
            with self.assertRaises(cut_role.CutRoleError):
                cut_role.validate_role(bad)


if __name__ == "__main__":
    unittest.main()
