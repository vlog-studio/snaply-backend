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
        self.assertIn("atrim=duration=7.250", graph)

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


if __name__ == "__main__":
    unittest.main()
