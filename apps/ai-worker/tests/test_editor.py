import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
sys.modules.setdefault("loguru", MagicMock())

from pipeline import editor  # noqa: E402
from pipeline.render_spec import DEFAULT_RENDER_SPEC  # noqa: E402


class NormalizeClipTest(unittest.TestCase):
    @patch("pipeline.editor._run")
    @patch("pipeline.editor.probe_duration", return_value=7.25)
    @patch("pipeline.editor._has_audio", return_value=True)
    def test_audio_is_padded_to_video_duration_instead_of_truncating_video(
        self, _has_audio, _probe_duration, run
    ) -> None:
        editor.normalize_clip("input.mp4", "output.mp4", "", DEFAULT_RENDER_SPEC)

        command = run.call_args.args[0]
        self.assertNotIn("-shortest", command)
        graph = command[command.index("-filter_complex") + 1]
        self.assertIn("apad", graph)
        self.assertIn("trim=start=0.000:end=7.250", graph)
        self.assertIn("atrim=start=0.000:end=7.250", graph)

    @patch("pipeline.editor._run")
    @patch("pipeline.editor.probe_duration", return_value=3.0)
    @patch("pipeline.editor._has_audio", return_value=False)
    def test_missing_audio_gets_a_bounded_silent_track(
        self, _has_audio, _probe_duration, run
    ) -> None:
        editor.normalize_clip("input.mp4", "output.mp4", "", DEFAULT_RENDER_SPEC)

        command = run.call_args.args[0]
        self.assertIn("anullsrc=channel_layout=stereo:sample_rate=48000", command)
        graph = command[command.index("-filter_complex") + 1]
        self.assertIn("[1:a:0]", graph)
        self.assertIn("atrim=duration=3.000", graph)

    @patch("pipeline.editor._run")
    @patch("pipeline.editor.probe_duration", return_value=10.0)
    @patch("pipeline.editor._has_audio", return_value=True)
    def test_selected_window_trims_video_and_audio_to_the_same_timeline(
        self, _has_audio, _probe_duration, run
    ) -> None:
        editor.normalize_clip(
            "input.mp4", "output.mp4", "", DEFAULT_RENDER_SPEC, start_ms=3500, end_ms=8000
        )

        command = run.call_args.args[0]
        graph = command[command.index("-filter_complex") + 1]
        self.assertIn("trim=start=3.500:end=8.000", graph)
        self.assertIn("atrim=start=3.500:end=8.000", graph)
        self.assertIn("asetpts=PTS-STARTPTS", graph)

    @patch("pipeline.editor._run")
    @patch("pipeline.editor.probe_duration", return_value=5.0)
    @patch("pipeline.editor._has_audio", return_value=True)
    def test_window_outside_source_duration_is_rejected(
        self, _has_audio, _probe_duration, _run
    ) -> None:
        with self.assertRaisesRegex(ValueError, "종료 시간"):
            editor.normalize_clip(
                "input.mp4", "output.mp4", "", DEFAULT_RENDER_SPEC, end_ms=6000
            )


if __name__ == "__main__":
    unittest.main()
