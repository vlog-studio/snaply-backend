"""앵커 사전과 파생 공식의 계약.

사전은 `packages/shared-types/src/anchor-vocabulary.json` 하나가 원본이고 API 도 같은 파일을
읽는다. 여기서는 **워커가 그 사전을 그대로 쓰는지**와 **파생 공식이 픽스처와 같은 값을 내는지**를
고정한다. TS 쪽 대조는 `apps/api/test/anchor-vocabulary.test.ts` 가 맡는다.

ffmpeg·SDK 없이 도는 순수 검사다.
"""

import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from pipeline import anchor, vocabulary  # noqa: E402

FIXTURE = json.loads(
    (Path(__file__).resolve().parent / "fixtures" / "anchor-derivation.json").read_text(
        encoding="utf-8"
    )
)


class VocabularyTest(unittest.TestCase):
    def test_worker_reads_the_shared_vocabulary_file(self) -> None:
        # 저장소 후보(두 번째)가 실제로 존재해야 네이티브 개발에서 워커가 뜬다.
        candidates = vocabulary.candidates_for(anchor.VOCABULARY_FILE)
        self.assertTrue(candidates[1].exists())
        self.assertEqual(candidates[0].name, "anchor-vocabulary.json")

    def test_every_kind_declares_its_analysis_dependency(self) -> None:
        # requiresAnalysis 가 빠지면 폴백 체인을 걸을 때 무엇이 없어서 실패했는지 알 수 없다.
        for kind, entry in anchor.KINDS.items():
            self.assertIn("requiresAnalysis", entry, kind)
            self.assertIn("refs", entry, kind)

    def test_drop_is_the_only_kind_without_refs(self) -> None:
        empty = [kind for kind in anchor.KINDS if not anchor.refs_for(kind)]
        self.assertEqual(empty, ["drop"])

    def test_valid_and_invalid_anchor_combinations(self) -> None:
        self.assertTrue(anchor.is_valid_anchor("face", "aboveHead"))
        self.assertTrue(anchor.is_valid_anchor("drop", None))
        # hand 에는 aboveHead 가 없다 — kind 별 목록이 실제로 갈라져 있는지.
        self.assertFalse(anchor.is_valid_anchor("hand", "aboveHead"))
        self.assertFalse(anchor.is_valid_anchor("face", None))
        self.assertFalse(anchor.is_valid_anchor("drop", "bboxCenter"))
        self.assertFalse(anchor.is_valid_anchor("nose", "bboxCenter"))

    def test_fallback_chain_must_end_with_drop(self) -> None:
        # 잘못 배치된 스티커는 없는 것보다 나쁘다 — "못 붙이면 안 붙인다"가 스펙에 드러나야 한다.
        self.assertTrue(
            anchor.is_valid_fallback_chain(
                [
                    {"kind": "face", "ref": "aboveHead"},
                    {"kind": "freezone", "ref": "topRight"},
                    {"kind": "drop"},
                ]
            )
        )
        self.assertFalse(
            anchor.is_valid_fallback_chain([{"kind": "face", "ref": "aboveHead"}])
        )
        self.assertFalse(anchor.is_valid_fallback_chain([]))

    def test_affinity_must_not_contain_drop(self) -> None:
        # fallback 과 정반대 규칙이라 헷갈리기 쉽다. drop 은 is_valid_anchor 를 통과하므로
        # 전용 검증이 없으면 매니페스트에 들어가도 아무도 모른다.
        self.assertTrue(
            anchor.is_valid_anchor_affinity(
                [{"kind": "face", "ref": "aboveHead"}, {"kind": "freezone", "ref": "topRight"}]
            )
        )
        self.assertFalse(
            anchor.is_valid_anchor_affinity(
                [{"kind": "face", "ref": "aboveHead"}, {"kind": "drop"}]
            )
        )
        self.assertFalse(anchor.is_valid_anchor_affinity([]))
        self.assertFalse(
            anchor.is_valid_anchor_affinity([{"kind": "hand", "ref": "aboveHead"}])
        )

    def test_missing_vocabulary_is_fatal_not_silent(self) -> None:
        # config.py 의 _load_dotenv 는 후보가 없으면 조용히 넘어간다(주입이 이기므로 정상).
        # 사전은 반대여야 한다 — 없는 채로 뜨면 렌더 시점에 터지고 원인이 안 보인다.
        with self.assertRaises(vocabulary.VocabularyUnavailableError):
            vocabulary.load("nonexistent-vocabulary.json")


class FaceDerivationTest(unittest.TestCase):
    """MediaPipe 6키포인트에 없는 ref 를 bbox·두 눈에서 파생한 결과를 고정한다."""

    def test_fixture_matches_the_current_derivation_version(self) -> None:
        # 계수를 손댔는데 버전을 안 올리면 과거 스펙의 resolved 재계산이 조용히 달라진다.
        self.assertEqual(FIXTURE["derivationVersion"], anchor.DERIVATION_VERSION)

    def test_tie_epsilon_comes_from_the_shared_vocabulary(self) -> None:
        # 코드에 하드코딩하면 앱 프리뷰 구현이 왔을 때 값이 갈리고 픽스처가 계약이 되지 못한다.
        self.assertEqual(anchor.TIE_EPSILON, anchor.VOCABULARY["tieEpsilon"])
        self.assertEqual(FIXTURE["tieEpsilon"], anchor.TIE_EPSILON)

    def test_fixture_keeps_boundary_cases(self) -> None:
        # 동률·0.0/1.0 경계에서만 드러나는 결함이 있다(beside 가 그랬다). 정상 입력만 남으면
        # 다음 공식을 추가할 때 같은 종류가 다시 숨는다.
        cases = FIXTURE["face"] + FIXTURE["hand"] + FIXTURE["object"]
        self.assertGreaterEqual(sum(1 for case in cases if case["boundary"]), 5)

    def test_face_anchors_match_the_fixture(self) -> None:
        for case in FIXTURE["face"]:
            bbox = tuple(case["bbox"])
            keypoints = {name: tuple(point) for name, point in case["keypoints"].items()}
            for ref, expected in case["expected"].items():
                with self.subTest(case=case["name"], ref=ref):
                    x, y = anchor.resolve_face_anchor(bbox, keypoints, ref)
                    self.assertAlmostEqual(x, expected[0], places=9)
                    self.assertAlmostEqual(y, expected[1], places=9)
            self.assertAlmostEqual(
                anchor.face_roll_degrees(keypoints), case["expectedRollDegrees"], places=9
            )
            self.assertAlmostEqual(
                anchor.face_scale_reference(bbox), case["expectedFaceWidth"], places=9
            )

    def test_chin_lands_on_the_bbox_bottom_for_a_level_face(self) -> None:
        # 계수가 통째로 어긋나면 픽스처는 같이 바뀌어 통과한다. 해부학적 기준점 하나를 따로 고정한다.
        bbox = (0.30, 0.20, 0.28, 0.34)
        keypoints = {"eyeL": (0.365, 0.3292), "eyeR": (0.505, 0.3292)}
        _, chin_y = anchor.resolve_face_anchor(bbox, keypoints, "chin")
        self.assertAlmostEqual(chin_y, bbox[1] + bbox[3], places=2)

    def test_roll_rotates_the_anchor_frame(self) -> None:
        # 기울어진 얼굴에서 aboveHead 가 수직으로만 올라가면 회전이 적용되지 않은 것이다.
        bbox = (0.30, 0.20, 0.28, 0.34)
        level = {"eyeL": (0.365, 0.3292), "eyeR": (0.505, 0.3292)}
        tilted = {"eyeL": (0.360, 0.3450), "eyeR": (0.500, 0.3150)}
        level_x, _ = anchor.resolve_face_anchor(bbox, level, "aboveHead")
        tilted_x, _ = anchor.resolve_face_anchor(bbox, tilted, "aboveHead")
        self.assertNotAlmostEqual(level_x, tilted_x, places=3)

    def test_out_of_frame_anchors_are_not_clamped(self) -> None:
        # 프레임 위에 붙은 얼굴의 aboveHead 는 음수가 맞다. 여기서 0 으로 당기면 스티커가
        # 조용히 다른 자리에 붙고 폴백 체인은 성공했다고 판단한다. 배치 가능 여부는
        # 세이프에어리어를 아는 배치 단계가 정한다.
        top = (0.36, 0.00, 0.28, 0.34)
        top_eyes = {"eyeL": (0.425, 0.1292), "eyeR": (0.565, 0.1292)}
        _, above_y = anchor.resolve_face_anchor(top, top_eyes, "aboveHead")
        self.assertLess(above_y, 0.0)

        # 아래가 잘린 얼굴의 chin 은 1.0 을 넘는다.
        bottom = (0.36, 0.70, 0.28, 0.34)
        bottom_eyes = {"eyeL": (0.425, 0.8292), "eyeR": (0.565, 0.8292)}
        _, chin_y = anchor.resolve_face_anchor(bottom, bottom_eyes, "chin")
        self.assertGreater(chin_y, 1.0)

    def test_vertical_eye_line_gives_a_right_angle_roll(self) -> None:
        # 카메라를 90° 돌려 찍은 영상. atan2 라 0 나눗셈은 없지만 축이 뒤집히는 지점이라 고정한다.
        vertical = {"eyeL": (0.435, 0.259), "eyeR": (0.435, 0.399)}
        self.assertAlmostEqual(anchor.face_roll_degrees(vertical), 90.0, places=9)

    def test_derivation_requires_both_eyes(self) -> None:
        with self.assertRaisesRegex(ValueError, "eyeR"):
            anchor.resolve_face_anchor(
                (0.3, 0.2, 0.28, 0.34), {"eyeL": (0.365, 0.3292)}, "forehead"
            )

    def test_unknown_ref_is_rejected_not_defaulted(self) -> None:
        with self.assertRaisesRegex(ValueError, "ref"):
            anchor.resolve_face_anchor(
                (0.3, 0.2, 0.28, 0.34),
                {"eyeL": (0.365, 0.3292), "eyeR": (0.505, 0.3292)},
                "topRight",
            )


class HandAndObjectDerivationTest(unittest.TestCase):
    def test_hand_anchors_match_the_fixture(self) -> None:
        for case in FIXTURE["hand"]:
            for ref, expected in case["expected"].items():
                with self.subTest(ref=ref):
                    x, y = anchor.resolve_hand_anchor(tuple(case["bbox"]), ref)
                    self.assertAlmostEqual(x, expected[0], places=9)
                    self.assertAlmostEqual(y, expected[1], places=9)

    def test_object_anchors_match_the_fixture(self) -> None:
        for case in FIXTURE["object"]:
            for ref, expected in case["expected"].items():
                with self.subTest(case=case["name"], ref=ref):
                    x, y = anchor.resolve_object_anchor(tuple(case["bbox"]), ref)
                    self.assertAlmostEqual(x, expected[0], places=9)
                    self.assertAlmostEqual(y, expected[1], places=9)

    def test_beside_tie_is_broken_deterministically_not_by_float_noise(self) -> None:
        # x=0.40·w=0.20 이면 `1.0 - (x + w)` 가 0.3999999999999999 로 떨어진다.
        # 잡음이 동률을 가르면 같은 입력을 달리 표현했을 때 스티커가 반대쪽에 붙는다.
        centered = (0.40, 0.40, 0.20, 0.30)
        x, _ = anchor.resolve_object_anchor(centered, "beside")
        self.assertGreater(x, 0.60, "동률이면 오른쪽으로 고정한다")

    def test_full_width_object_has_no_side_and_still_resolves_deterministically(self) -> None:
        # 양쪽 여유가 0인 동률이다. 결과는 프레임 밖으로 나가고(1.25), 배치 단계가 그걸 보고
        # 폴백해야 한다 — 여기서 프레임 안으로 당기면 "성공했다"고 잘못 판단한다.
        x, _ = anchor.resolve_object_anchor((0.00, 0.30, 1.00, 0.40), "beside")
        self.assertGreater(x, 1.0)

    def test_zero_width_bbox_does_not_crash(self) -> None:
        # 검출 잡음이 만들 수 있는 입력이다. 나눗셈이 없어 터지지 않지만 회귀로 고정한다.
        x, _ = anchor.resolve_object_anchor((0.50, 0.40, 0.00, 0.30), "beside")
        self.assertAlmostEqual(x, 0.50, places=9)

    def test_beside_follows_the_larger_gap(self) -> None:
        left_hugging, _ = anchor.resolve_object_anchor((0.10, 0.40, 0.20, 0.30), "beside")
        right_hugging, _ = anchor.resolve_object_anchor((0.70, 0.40, 0.20, 0.30), "beside")
        self.assertGreater(left_hugging, 0.30)
        self.assertLess(right_hugging, 0.70)


if __name__ == "__main__":
    unittest.main()
