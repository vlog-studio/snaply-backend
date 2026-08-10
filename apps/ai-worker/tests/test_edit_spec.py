import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from pipeline.edit_spec import parse_job_clips  # noqa: E402


class EditSpecTest(unittest.TestCase):
    def test_v2_clips_preserve_order_repetitions_and_ranges(self) -> None:
        clips = parse_job_clips(
            {
                "clips": [
                    {"videoId": "video-a", "startMs": 3500, "endMs": 8000},
                    {"videoId": "video-b", "startMs": 0},
                    {"videoId": "video-a", "startMs": 12000, "endMs": 15500},
                ]
            }
        )

        self.assertEqual([clip.video_id for clip in clips], ["video-a", "video-b", "video-a"])
        self.assertEqual((clips[0].start_ms, clips[0].end_ms), (3500, 8000))
        self.assertIsNone(clips[1].end_ms)

    def test_legacy_video_ids_use_the_full_source(self) -> None:
        clips = parse_job_clips({"videoIds": ["video-a", "video-b"]})

        self.assertTrue(all(clip.start_ms == 0 and clip.end_ms is None for clip in clips))

    def test_invalid_range_is_rejected(self) -> None:
        with self.assertRaisesRegex(ValueError, "종료 시간"):
            parse_job_clips(
                {"clips": [{"videoId": "video-a", "startMs": 1000, "endMs": 1000}]}
            )


if __name__ == "__main__":
    unittest.main()
