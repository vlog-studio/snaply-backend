"""스냅 로컬 신호(`pipeline/snap_signals.py`).

순수 계산은 numpy 배열로, 파일 읽기는 ffmpeg 로 만든 합성 클립(`lavfi`)으로 본다 — 바이너리
픽스처는 커지고 썩는다. 값의 **방향**(어두우면 작다, 흐리면 작다, 움직이면 크다)을 고정한다.
문턱값은 여기서 정하지 않는다 — 실제 스냅으로 정한다(docs/decisions/edit-director.md §2).

`REQUIRE_FFMPEG=1` 이면 ffmpeg 검사는 건너뛰지 않고 실패한다.

    cd apps/ai-worker && python -m unittest tests.test_snap_signals
"""

import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from pipeline import snap_signals  # noqa: E402
from pipeline.snap_signals import (  # noqa: E402
    SignalsError,
    ahash,
    hash_distance,
    motion_series,
    read_pgm,
    read_signals,
    representative_hashes,
    sharpness,
    speech_spans_ms,
)


def _has(tool: str) -> bool:
    try:
        subprocess.run([tool, "-version"], capture_output=True, check=True)
        return True
    except (OSError, subprocess.CalledProcessError):
        return False


FFMPEG_AVAILABLE = _has("ffmpeg") and _has("ffprobe")
if os.environ.get("REQUIRE_FFMPEG") == "1" and not FFMPEG_AVAILABLE:
    raise RuntimeError("REQUIRE_FFMPEG=1 인데 ffmpeg/ffprobe 가 없다.")


def _checker(height: int = 64, width: int = 64, cell: int = 8) -> np.ndarray:
    ys, xs = np.indices((height, width))
    return (((ys // cell + xs // cell) % 2) * 255).astype(np.uint8)


class PureTest(unittest.TestCase):
    def test_hash_is_sixteen_hex_digits_and_ignores_brightness_shift(self) -> None:
        frame = _checker()
        brighter = np.clip(frame.astype(np.int16) // 2 + 100, 0, 255).astype(np.uint8)
        self.assertRegex(ahash(frame), r"^[0-9a-f]{16}$")
        self.assertEqual(hash_distance(ahash(frame), ahash(brighter)), 0)

    def test_hash_tells_different_layouts_apart(self) -> None:
        left_dark = np.zeros((64, 64), np.uint8)
        left_dark[:, 32:] = 255
        top_dark = np.zeros((64, 64), np.uint8)
        top_dark[32:, :] = 255
        self.assertGreaterEqual(hash_distance(ahash(left_dark), ahash(top_dark)), 24)

    def test_representative_hashes_keep_the_position_order(self) -> None:
        frames = [_checker(cell=8), np.full((64, 64), 128, np.uint8), _checker(cell=16)]
        self.assertEqual(representative_hashes(frames), tuple(ahash(frame) for frame in frames))

    def test_a_missing_representative_frame_empties_the_hashes(self) -> None:
        # [h50, h75] 를 남기면 다른 스냅의 [h25, h50, h75] 와 인덱스끼리 비교돼 다른 위치끼리 잰다.
        self.assertEqual(representative_hashes([None, _checker(), _checker(cell=16)]), ())

    def test_flat_frame_has_no_sharpness(self) -> None:
        self.assertEqual(sharpness(np.full((40, 40), 128, np.uint8)), 0.0)
        self.assertGreater(sharpness(_checker()), 1000)

    def test_motion_is_zero_for_still_frames_and_grows_with_change(self) -> None:
        still = [np.full((8, 8), 100, np.uint8)] * 3
        self.assertEqual(motion_series(still), (0.0, 0.0))
        changing = [np.full((8, 8), value, np.uint8) for value in (0, 51, 255)]
        self.assertEqual(motion_series(changing), (0.2, 0.8))

    def test_motion_does_not_wrap_around_uint8(self) -> None:
        # uint8 끼리 빼면 0 - 255 가 1 이 된다.
        frames = [np.full((4, 4), 255, np.uint8), np.zeros((4, 4), np.uint8)]
        self.assertEqual(motion_series(frames), (1.0,))

    def test_speech_samples_become_milliseconds(self) -> None:
        self.assertEqual(speech_spans_ms([{"start": 8000, "end": 24000}]), ((500, 1500),))

    def test_pgm_reader_keeps_the_frame_shape(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "f.pgm")
            pixels = np.arange(6 * 4, dtype=np.uint8).reshape(4, 6)
            with open(path, "wb") as handle:
                handle.write(b"P5\n# comment\n6 4\n255\n" + pixels.tobytes())
            np.testing.assert_array_equal(read_pgm(path), pixels)

    def test_pgm_reader_rejects_other_formats(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "f.pgm")
            with open(path, "wb") as handle:
                handle.write(b"P2\n2 2\n255\n0 0 0 0\n")
            with self.assertRaises(SignalsError):
                read_pgm(path)


def _make(path: str, video: str, *, seconds: float = 2.0, audio: str | None = None, vf: str | None = None) -> None:
    cmd = ["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", f"{video}:r=30:d={seconds}"]
    if audio:
        cmd += ["-f", "lavfi", "-i", audio, "-c:a", "aac"]
    if vf:
        cmd += ["-vf", vf]
    cmd += ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-t", str(seconds)]
    subprocess.run([*cmd, path], capture_output=True, check=True)


@unittest.skipUnless(FFMPEG_AVAILABLE, "ffmpeg/ffprobe 없음")
class ReadSignalsTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.tmp = tempfile.TemporaryDirectory()
        cls.paths = {}
        clips = {
            "black": ("color=black:s=360x640", {"audio": "anullsrc=r=44100:cl=mono"}),
            "still": ("color=gray:s=360x640", {}),
            "moving": ("testsrc2=s=360x640", {}),
            "blurred": ("testsrc2=s=360x640", {"vf": "boxblur=12"}),
            "landscape": ("testsrc2=s=640x360", {}),
            "other": ("smptebars=s=360x640", {}),
        }
        for name, (video, options) in clips.items():
            path = os.path.join(cls.tmp.name, f"{name}.mp4")
            _make(path, video, **options)
            cls.paths[name] = path
        cls.signals = {name: read_signals(path) for name, path in cls.paths.items()}

    @classmethod
    def tearDownClass(cls) -> None:
        cls.tmp.cleanup()

    def test_measures_the_length_and_one_motion_value_per_step(self) -> None:
        signals = self.signals["moving"]
        self.assertAlmostEqual(signals.duration_ms, 2000, delta=50)
        self.assertEqual(signals.step_ms, snap_signals.STEP_MS)
        # 10fps 로 20프레임 → 이웃 쌍 19개.
        self.assertIn(len(signals.motion), (19, 20))
        self.assertEqual(len(signals.frame_hashes), len(snap_signals.HASH_POSITIONS))

    def test_black_is_dark_and_flat(self) -> None:
        self.assertLess(self.signals["black"].brightness, 0.05)
        self.assertGreater(self.signals["moving"].brightness, 0.3)
        self.assertLess(self.signals["black"].sharpness, 1)

    def test_blur_lowers_sharpness_but_keeps_the_hash(self) -> None:
        sharp, blurred = self.signals["moving"], self.signals["blurred"]
        self.assertLess(blurred.sharpness, sharp.sharpness / 10)
        # 같은 장면의 흐린 사본은 중복이다 — 중복 묶음에서는 점수가 높은(선명한) 쪽이 남는다.
        self.assertEqual(
            [hash_distance(a, b) for a, b in zip(sharp.frame_hashes, blurred.frame_hashes)], [0, 0, 0]
        )

    def test_different_scenes_hash_far_apart(self) -> None:
        distances = [
            hash_distance(a, b)
            for a, b in zip(self.signals["moving"].frame_hashes, self.signals["other"].frame_hashes)
        ]
        self.assertTrue(all(distance >= 16 for distance in distances), distances)

    def test_motion_separates_still_from_moving(self) -> None:
        still = max(self.signals["still"].motion)
        moving = sum(self.signals["moving"].motion) / len(self.signals["moving"].motion)
        self.assertLess(still, 0.001)
        self.assertGreater(moving, 0.003)

    def test_landscape_is_read_at_the_same_short_side(self) -> None:
        signals = self.signals["landscape"]
        self.assertGreater(signals.sharpness, 50)
        self.assertGreater(sum(signals.motion), 0)

    def test_audio_without_speech_has_no_speech(self) -> None:
        self.assertTrue(self.signals["black"].has_audio)
        self.assertEqual(self.signals["black"].speech, ())
        self.assertFalse(self.signals["moving"].has_audio)
        self.assertEqual(self.signals["moving"].speech, ())

    def test_a_seek_past_the_end_leaves_no_partial_hashes(self) -> None:
        # 2초 클립을 3초로 읽으면 75%(2.25초) seek 가 끝을 넘는다 — ffmpeg 는 0 으로 끝나고 파일만 없다.
        signals = read_signals(self.paths["moving"], 3000)
        self.assertEqual(signals.frame_hashes, ())
        self.assertGreater(signals.sharpness, 0)

    def test_unreadable_file_raises_signals_error(self) -> None:
        path = os.path.join(self.tmp.name, "broken.mp4")
        with open(path, "wb") as handle:
            handle.write(b"not a video")
        with self.assertRaises(SignalsError):
            read_signals(path)


if __name__ == "__main__":
    unittest.main()
