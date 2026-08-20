"""재생성 무효화 규칙의 계약.

표가 문서에만 있으면 구현과 갈라진다. 여기서는 **규칙 자체가 성립하는지**(빠진 판단이 없는지,
attempt 가 시드 어휘와 맞는지)와 **계획이 약속한 몇 가지가 실제로 그렇게 적혀 있는지**를
고정한다. TS 쪽 대조는 `apps/api/test/invalidation.test.ts` 가 맡는다.

ffmpeg·SDK 없이 도는 순수 검사다.
"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from pipeline import invalidation, seed  # noqa: E402


class VocabularyShapeTest(unittest.TestCase):
    def test_every_action_judges_every_layer(self) -> None:
        # 생략을 허용하면 레이어를 새로 추가했을 때 아무도 판단하지 않은 채 기본값으로 굳는다.
        for action in invalidation.ACTION_NAMES:
            for layer in invalidation.LAYERS:
                with self.subTest(action=action, layer=layer):
                    self.assertIn(
                        invalidation.layer_state(action, layer), invalidation.STATES
                    )

    def test_states_are_exactly_the_documented_three(self) -> None:
        self.assertEqual(
            set(invalidation.STATES),
            {invalidation.INVALIDATED, invalidation.RETIMED, invalidation.PRESERVED},
        )

    def test_action_order_is_dense_from_zero(self) -> None:
        orders = sorted(entry["order"] for entry in invalidation.ACTIONS.values())
        self.assertEqual(orders, list(range(len(orders))))

    def test_every_action_explains_itself(self) -> None:
        # 근거 없는 행은 다음 사람이 고칠 때 무엇을 깨는지 알 수 없다.
        for action in invalidation.ACTION_NAMES:
            with self.subTest(action=action):
                self.assertTrue(invalidation.ACTIONS[action]["note"].strip())
                self.assertTrue(invalidation.ACTIONS[action]["label"].strip())

    def test_unknown_action_and_layer_are_rejected(self) -> None:
        with self.assertRaises(invalidation.InvalidationError):
            invalidation.layer_state("bgm-swop", "music")
        with self.assertRaises(invalidation.InvalidationError):
            invalidation.layer_state("bgm-swap", "timeline.beats")


class SeedVocabularyAgreementTest(unittest.TestCase):
    def test_attempt_bump_only_names_seeded_stages(self) -> None:
        # 리더의 attempt 를 올리는 규칙이 들어오면 seed.parse_seed 가 그 스펙을 거부한다 —
        # 두 사전이 갈라지면 액션 자체가 실행 불가가 된다.
        for action in invalidation.ACTION_NAMES:
            for stage in invalidation.attempt_bump_for(action):
                with self.subTest(action=action, stage=stage):
                    self.assertTrue(seed.is_seeded_stage(stage))

    def test_next_seed_bumps_only_the_named_stages(self) -> None:
        base = {"root": 1837462, "attempt": {}}
        after = invalidation.next_seed(base, "sticker-pack-swap")
        self.assertEqual(after["attempt"]["style-director"], 1)
        self.assertEqual(after["attempt"]["edit-director"], 0)
        self.assertEqual(after["attempt"]["music-director"], 0)

    def test_next_seed_does_not_mutate_the_original(self) -> None:
        # 스펙은 영구 저장물이라 제자리 수정이 과거 산출물의 재현을 깨뜨린다.
        base = {"root": 1837462, "attempt": {"style-director": 2}}
        invalidation.next_seed(base, "user-regenerate")
        self.assertEqual(base["attempt"], {"style-director": 2})

    def test_expired_regeneration_changes_no_seed(self) -> None:
        # storage-and-subscription-policy.md §3 — 크레딧 없는 무료 재생성은 같은 산출물이어야 한다.
        base = {"root": 1837462, "attempt": {"edit-director": 1, "style-director": 2}}
        after = invalidation.next_seed(base, "expired-regenerate")
        self.assertEqual(
            seed.seeds_for_spec(after), seed.seeds_for_spec(base)
        )

    def test_user_regeneration_changes_every_director_seed(self) -> None:
        base = {"root": 1837462, "attempt": {}}
        after = invalidation.next_seed(base, "user-regenerate")
        before_seeds = seed.seeds_for_spec(base)
        after_seeds = seed.seeds_for_spec(after)
        for stage in seed.SEEDED_STAGES:
            with self.subTest(stage=stage):
                self.assertNotEqual(before_seeds[stage], after_seeds[stage])


class DocumentedRulesTest(unittest.TestCase):
    """계획이 약속한 것이 표에 실제로 그렇게 적혀 있는지."""

    def test_the_two_regeneration_rows_differ_only_by_attempt(self) -> None:
        # 이 쌍이 attempt 열의 존재 이유다. 레이어 상태로는 구분되지 않아야 의미가 산다.
        expired = {
            layer: invalidation.layer_state("expired-regenerate", layer)
            for layer in invalidation.LAYERS
        }
        self.assertTrue(all(state == invalidation.PRESERVED for state in expired.values()))
        self.assertEqual(invalidation.attempt_bump_for("expired-regenerate"), ())
        self.assertEqual(len(invalidation.attempt_bump_for("user-regenerate")), 3)

    def test_expired_regeneration_preserves_everything(self) -> None:
        self.assertTrue(invalidation.is_preserving_action("expired-regenerate"))

    def test_output_profile_change_preserves_everything(self) -> None:
        # resolved.xy 가 소스 정규화라 성립한다(B-1). 캔버스 정규화였다면 fitMode 가 바뀔 때마다
        # 오버레이를 전부 다시 계산해야 했다.
        self.assertTrue(invalidation.is_preserving_action("output-profile-change"))

    def test_bgm_swap_within_guard_keeps_the_cut_composition(self) -> None:
        # beatLength 가 권위고 길이는 파생이다(B-6). 컷 구성은 두고 그리드에 다시 투영한다.
        self.assertEqual(
            invalidation.layer_state("bgm-swap", "timeline.cuts"), invalidation.RETIMED
        )
        self.assertEqual(
            invalidation.layer_state("bgm-swap", "music"), invalidation.INVALIDATED
        )

    def test_bgm_swap_beyond_guard_rebuilds_the_timeline(self) -> None:
        # 92→128 BPM 이면 28% 짧아진다. 그 정도면 컷 구성을 다시 짜는 게 맞다.
        self.assertEqual(
            invalidation.layer_state("bgm-swap-beyond-guard", "timeline.cuts"),
            invalidation.INVALIDATED,
        )
        self.assertIn("edit-director", invalidation.attempt_bump_for("bgm-swap-beyond-guard"))

    def test_transition_swap_keeps_the_cuts(self) -> None:
        self.assertEqual(
            invalidation.layer_state("transition-style-swap", "timeline.cuts"),
            invalidation.PRESERVED,
        )
        self.assertEqual(
            invalidation.layer_state("transition-style-swap", "timeline.transitions"),
            invalidation.INVALIDATED,
        )

    def test_sticker_pack_swap_is_a_new_pin_not_a_re_render(self) -> None:
        # 재조회 금지 규칙은 핀을 바꾸지 않는 재렌더에만 적용된다.
        self.assertIn(
            "assetRefs.stickerPack", invalidation.reinterpreted_refs_for("sticker-pack-swap")
        )
        self.assertEqual(
            invalidation.layer_state("sticker-pack-swap", "timeline.cuts"),
            invalidation.PRESERVED,
        )

    def test_only_user_regeneration_promotes_the_analysis_pin(self) -> None:
        # 만료 재생성은 올리지 않는다 — 올리면 "복원"이 다른 영상을 낸다.
        promoting = [
            action
            for action in invalidation.ACTION_NAMES
            if "analysis" in invalidation.pin_promotion_for(action)
        ]
        self.assertEqual(promoting, ["user-regenerate"])

    def test_manual_cut_edits_do_not_bump_any_attempt(self) -> None:
        # 사용자가 순서를 정했으므로 디렉터에 선택이 없다.
        self.assertEqual(invalidation.attempt_bump_for("cut-reorder"), ())
        self.assertEqual(invalidation.attempt_bump_for("cut-remove"), ())

    def test_adding_a_clip_reuses_existing_analysis(self) -> None:
        # analysis 를 스펙 밖 참조로 뺀 것의 실질 이득이 여기서 나온다.
        self.assertIn("analysis", invalidation.reinterpreted_refs_for("clip-add"))
        self.assertEqual(
            invalidation.layer_state("clip-add", "music"), invalidation.PRESERVED
        )

    def test_clip_add_recomputes_color_match(self) -> None:
        # 색 통계는 결정적이라 기존 클립은 같은 값이 나온다. 그런데도 무효화하는 이유는
        # **referenceClipId 재선정**이다 — 추가된 클립이 기존 레퍼런스보다 노출·품질이 좋으면
        # 레퍼런스가 옮겨가고 모든 클립의 보정량이 실제로 달라진다. 유지하면 낡은 기준이 남고,
        # 새 클립만 따로 계산하면 색이 갈린다.
        self.assertEqual(
            invalidation.layer_state("clip-add", "grade.match"), invalidation.INVALIDATED
        )
        # look 은 번들에서 오므로 클립 추가와 무관하다.
        self.assertEqual(
            invalidation.layer_state("clip-add", "grade.look"), invalidation.PRESERVED
        )

    def test_accents_follow_the_cuts_not_the_look(self) -> None:
        """grade 아래 있지만 축이 다르다 — 이름 때문에 별개 레이어로 안 세는 오분류가 있었다."""
        # 컷 순서가 바뀌면 어느 컷이 hook 인지가 바뀐다. retimed 로는 표현할 수 없다.
        self.assertEqual(
            invalidation.layer_state("cut-reorder", "grade.accents"), invalidation.INVALIDATED
        )
        self.assertEqual(
            invalidation.layer_state("cut-remove", "grade.accents"), invalidation.INVALIDATED
        )
        # 액센트는 음악 sections 에서도 나오므로 트랙이 바뀌면 강조할 컷이 달라진다 —
        # 같은 액션에서 오버레이는 retimed 인데 여기만 invalidated 인 이유다.
        self.assertEqual(
            invalidation.layer_state("bgm-swap", "grade.accents"), invalidation.INVALIDATED
        )
        self.assertEqual(
            invalidation.layer_state("bgm-swap", "overlays.stickers"), invalidation.RETIMED
        )
        # 색·스티커 도메인 변화에는 반응하지 않는다.
        self.assertEqual(
            invalidation.layer_state("sticker-pack-swap", "grade.accents"),
            invalidation.PRESERVED,
        )

    def test_every_layer_is_explained(self) -> None:
        # grade 세 갈래는 이름만으로 구분이 안 된다. 사전이 각각의 축을 적어 둬야 한다.
        for layer in ("grade.look", "grade.match", "grade.accents"):
            with self.subTest(layer=layer):
                self.assertTrue(invalidation.VOCABULARY["layerNotes"][layer].strip())

    def test_grade_survives_everything_except_a_full_reroll(self) -> None:
        # 룩은 번들이 정하고 번들은 핀돼 있다. 컷을 지웠다고 색이 변하면 안 된다.
        for action in ("cut-remove", "cut-reorder", "sticker-pack-swap", "bgm-swap"):
            with self.subTest(action=action):
                self.assertEqual(
                    invalidation.layer_state(action, "grade.look"), invalidation.PRESERVED
                )
                self.assertEqual(
                    invalidation.layer_state(action, "grade.match"), invalidation.PRESERVED
                )


if __name__ == "__main__":
    unittest.main()
