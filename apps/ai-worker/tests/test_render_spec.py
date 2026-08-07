import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from pipeline.render_spec import (  # noqa: E402
    DEFAULT_RENDER_SPEC,
    LEGACY_RENDER_SPEC,
    build_video_filter,
    parse_render_spec,
)


class RenderSpecTest(unittest.TestCase):
    def test_missing_snapshot_uses_legacy_profile_for_queued_jobs(self) -> None:
        self.assertEqual(parse_render_spec(None), LEGACY_RENDER_SPEC)

    def test_valid_snapshot_is_parsed(self) -> None:
        spec = parse_render_spec(
            {
                "profileVersion": 1,
                "outputProfile": "short_vertical",
                "width": 1080,
                "height": 1920,
                "fps": 30,
                "fitMode": "blur_background",
            }
        )
        self.assertEqual(spec, DEFAULT_RENDER_SPEC)

    def test_profile_dimension_mismatch_is_rejected(self) -> None:
        with self.assertRaises(ValueError):
            parse_render_spec(
                {
                    "profileVersion": 1,
                    "outputProfile": "short_vertical",
                    "width": 7680,
                    "height": 4320,
                    "fps": 120,
                    "fitMode": "cover",
                }
            )

    def test_unhashable_profile_value_is_rejected_as_invalid_input(self) -> None:
        with self.assertRaises(ValueError):
            parse_render_spec(
                {
                    "profileVersion": 1,
                    "outputProfile": ["short_vertical"],
                    "width": 1080,
                    "height": 1920,
                    "fps": 30,
                    "fitMode": "cover",
                }
            )

    def test_contain_does_not_force_small_foreground_upscale(self) -> None:
        graph = build_video_filter(LEGACY_RENDER_SPEC, "")
        self.assertIn("min(1920,iw)", graph)
        self.assertIn("pad=1920:1080", graph)

    def test_cover_and_blur_have_independent_filter_strategies(self) -> None:
        cover = parse_render_spec(
            {
                "profileVersion": 1,
                "outputProfile": "square",
                "width": 1080,
                "height": 1080,
                "fps": 30,
                "fitMode": "cover",
            }
        )
        self.assertIn("force_original_aspect_ratio=increase", build_video_filter(cover, ""))
        self.assertIn("crop=1080:1080", build_video_filter(cover, ""))
        self.assertIn("gblur=sigma=30", build_video_filter(DEFAULT_RENDER_SPEC, ""))
        self.assertIn("overlay=", build_video_filter(DEFAULT_RENDER_SPEC, ""))


if __name__ == "__main__":
    unittest.main()
