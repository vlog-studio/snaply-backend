"""실제 ffmpeg 를 돌려 **산출물의 성질**을 검사한다.

나머지 파이썬 테스트는 ffmpeg 없이 돌도록 명령줄만 검사한다. 그 방식으로는 잡히지 않는
결함이 실제로 두 번 났다:

- 쇼츠 앱인데 편집 결과가 **가로 1920x1080** 으로 나왔다. 명령줄은 멀쩡했고 합성 클립이
  가로라서 통과했다 — 진짜 아이폰 영상을 손으로 돌려 보고서야 발견했다.
- 배포본이 아이폰 원본(HEVC/HDR) 그대로라 **다른 기기에서 재생되지 않았다.**

그래서 여기서는 명령줄이 아니라 **파일**을 본다. ffprobe 가 말하는 해상도·코덱·픽셀 포맷이
계약이다.

입력은 저장소에 두지 않고 ffmpeg 로 만든다(`lavfi`) — 바이너리 픽스처는 커지고 썩는다.

**ffmpeg 이 없으면 건너뛴다.** 로컬에서 ffmpeg 없이 테스트를 돌리는 것이 이 저장소의 관행이라
그걸 깨지 않는다. 다만 CI 에서까지 조용히 건너뛰면 검사가 있으나 마나이므로,
`REQUIRE_FFMPEG=1` 이면 건너뛰지 않고 **실패한다**. CI 가 그 값을 준다.
"""

import json
import os
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from pipeline import rendition  # noqa: E402
from pipeline.editor import ClipSource, edit, get_preset  # noqa: E402
from pipeline.render_spec import DEFAULT_RENDER_SPEC  # noqa: E402


def _has(tool: str) -> bool:
    try:
        subprocess.run([tool, "-version"], capture_output=True, check=True)
        return True
    except (OSError, subprocess.CalledProcessError):
        return False


FFMPEG_AVAILABLE = _has("ffmpeg") and _has("ffprobe")
REQUIRE_FFMPEG = os.environ.get("REQUIRE_FFMPEG") == "1"

if REQUIRE_FFMPEG and not FFMPEG_AVAILABLE:
    raise RuntimeError(
        "REQUIRE_FFMPEG=1 인데 ffmpeg/ffprobe 가 없다. "
        "이 검사를 건너뛴 채로 초록이 되면 안 된다 — CI 의 설치 단계를 확인할 것."
    )


def probe(path: str) -> dict:
    """첫 비디오 스트림과 포맷 정보."""
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", path],
        capture_output=True,
        text=True,
        check=True,
    )
    data = json.loads(out.stdout)
    video = next(s for s in data["streams"] if s["codec_type"] == "video")
    return {"video": video, "format": data["format"], "streams": data["streams"]}


def make_clip(path: str, *, width: int, height: int, seconds: float = 1.0) -> None:
    """합성 입력. 오디오를 함께 넣어 오디오 경로도 같이 탄다."""
    subprocess.run(
        [
            "ffmpeg", "-y",
            "-f", "lavfi", "-i", f"testsrc=size={width}x{height}:rate=30:duration={seconds}",
            "-f", "lavfi", "-i", f"sine=frequency=440:duration={seconds}",
            "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest",
            path,
        ],
        capture_output=True,
        check=True,
    )


@unittest.skipUnless(FFMPEG_AVAILABLE, "ffmpeg/ffprobe 없음")
class EditOutputContract(unittest.TestCase):
    """편집 산출물은 **세로**여야 한다 — 쇼츠 앱이다."""

    def test_landscape_input_still_produces_a_vertical_short(self) -> None:
        # 가로 입력이 그대로 새어 나간 것이 실제 결함이었다. 그래서 일부러 가로로 넣는다.
        with tempfile.TemporaryDirectory() as work:
            src = os.path.join(work, "landscape.mp4")
            make_clip(src, width=1280, height=720)

            out = edit([ClipSource(src)], get_preset("일상"), DEFAULT_RENDER_SPEC, work)

            info = probe(out)["video"]
            self.assertEqual((info["width"], info["height"]), (1080, 1920))

    def test_output_plays_everywhere(self) -> None:
        """H.264 + yuv420p. 이걸 벗어나면 기기에 따라 재생되지 않는다."""
        with tempfile.TemporaryDirectory() as work:
            src = os.path.join(work, "portrait.mp4")
            make_clip(src, width=1080, height=1920)

            out = edit([ClipSource(src)], get_preset("일상"), DEFAULT_RENDER_SPEC, work)

            info = probe(out)["video"]

            self.assertEqual(info["codec_name"], "h264")
            self.assertEqual(info["pix_fmt"], "yuv420p")


@unittest.skipUnless(FFMPEG_AVAILABLE, "ffmpeg/ffprobe 없음")
class RenditionContract(unittest.TestCase):
    """배포본은 "어디서나 재생되는 사본" 이다. 그 말이 파일에서도 사실이어야 한다."""

    def test_rendition_is_h264_sdr_and_starts_without_full_download(self) -> None:
        with tempfile.TemporaryDirectory() as work:
            src = os.path.join(work, "src.mp4")
            make_clip(src, width=720, height=1280, seconds=2.0)

            outcome = rendition.build(src, work)

            info = probe(outcome.video_path)
            self.assertEqual(info["video"]["codec_name"], "h264")
            self.assertEqual(info["video"]["pix_fmt"], "yuv420p")
            # faststart: moov 가 앞에 없으면 플레이어가 전체를 받고서야 시작한다.
            self.assertIn("faststart", _movflags_state(outcome.video_path))

    def test_duration_is_measured_not_reported(self) -> None:
        """클라이언트가 보고한 길이가 아니라 **실측값**이어야 한다."""
        with tempfile.TemporaryDirectory() as work:
            src = os.path.join(work, "src.mp4")
            make_clip(src, width=720, height=1280, seconds=2.0)

            outcome = rendition.build(src, work)

            self.assertIsNotNone(outcome.duration_ms)
            self.assertAlmostEqual(outcome.duration_ms / 1000, 2.0, delta=0.3)

    def test_tall_source_is_capped_not_upscaled(self) -> None:
        """세로 상한(1920)은 넘기지 않고, 그보다 작은 원본을 키우지도 않는다."""
        with tempfile.TemporaryDirectory() as work:
            small = os.path.join(work, "small.mp4")
            make_clip(small, width=360, height=640)
            small_out = rendition.build(small, work).video_path
            self.assertEqual(probe(small_out)["video"]["height"], 640)

        with tempfile.TemporaryDirectory() as work:
            tall = os.path.join(work, "tall.mp4")
            make_clip(tall, width=1440, height=2560)
            tall_out = rendition.build(tall, work).video_path
            self.assertLessEqual(probe(tall_out)["video"]["height"], 1920)

    def test_silent_source_still_produces_a_rendition(self) -> None:
        """오디오가 없는 원본도 있다(무음 촬영). 그때 변환이 실패하면 안 된다."""
        with tempfile.TemporaryDirectory() as work:
            src = os.path.join(work, "silent.mp4")
            subprocess.run(
                ["ffmpeg", "-y", "-f", "lavfi", "-i", "testsrc=size=720x1280:rate=30:duration=1",
                 "-c:v", "libx264", "-pix_fmt", "yuv420p", src],
                capture_output=True,
                check=True,
            )

            outcome = rendition.build(src, work)

            self.assertTrue(os.path.exists(outcome.video_path))
            self.assertFalse([s for s in probe(outcome.video_path)["streams"] if s["codec_type"] == "audio"])


@unittest.skipUnless(FFMPEG_AVAILABLE, "ffmpeg/ffprobe 없음")
class HdrContract(unittest.TestCase):
    """
    HDR 원본을 내릴 때 **파일이 자기 자신에 대해 거짓말하면 안 된다** (2026-09-15 실검증).

    픽셀만 8bit 로 내리고 색 태그를 PQ 로 남겨 두면, 플레이어가 이미 평평해진 영상에 HDR
    톤매핑을 한 번 더 걸어 화면이 망가진다. 실제로 그 상태였다.

    톤매핑 자체는 빌드에 `zscale`+`tonemap` 이 있어야 제대로 되지만(워커 이미지에는 있고
    macOS Homebrew 빌드에는 없다), **태그가 bt709 여야 한다는 것은 어느 빌드에서나 같다.**
    그래서 여기서는 태그를 검사한다.
    """

    def make_hdr10(self, path: str) -> None:
        subprocess.run(
            ["ffmpeg", "-y",
             "-f", "lavfi", "-i", "testsrc=size=720x1280:rate=30:duration=1",
             "-c:v", "libx265", "-pix_fmt", "yuv420p10le",
             "-x265-params", "colorprim=bt2020:transfer=smpte2084:colormatrix=bt2020nc",
             "-color_primaries", "bt2020", "-color_trc", "smpte2084", "-colorspace", "bt2020nc",
             "-tag:v", "hvc1", path],
            capture_output=True,
            check=True,
        )

    def assert_sdr_tagged(self, path: str) -> None:
        info = probe(path)["video"]
        self.assertEqual(info["pix_fmt"], "yuv420p", "8bit SDR 로 내려와야 한다")
        self.assertEqual(info.get("color_transfer"), "bt709")
        self.assertEqual(info.get("color_primaries"), "bt709")
        self.assertEqual(info.get("color_space"), "bt709")

    def test_rendition_of_hdr_source_is_tagged_sdr(self) -> None:
        with tempfile.TemporaryDirectory() as work:
            src = os.path.join(work, "hdr.mov")
            self.make_hdr10(src)

            self.assert_sdr_tagged(rendition.build(src, work).video_path)

    def test_edit_of_hdr_source_is_tagged_sdr(self) -> None:
        with tempfile.TemporaryDirectory() as work:
            src = os.path.join(work, "hdr.mov")
            self.make_hdr10(src)

            out = edit([ClipSource(src)], get_preset("일상"), DEFAULT_RENDER_SPEC, work)

            self.assert_sdr_tagged(out)

    def test_sdr_source_tags_are_left_alone(self) -> None:
        """SDR 원본의 태그는 이미 사실이다 — 덮어쓸 이유가 없다."""
        with tempfile.TemporaryDirectory() as work:
            src = os.path.join(work, "sdr.mp4")
            make_clip(src, width=720, height=1280)

            info = probe(rendition.build(src, work).video_path)["video"]

            self.assertNotEqual(info.get("color_transfer"), "smpte2084")


def _movflags_state(path: str) -> str:
    """moov 가 mdat 보다 앞에 있으면 faststart 다. 박스 순서를 직접 읽는다."""
    with open(path, "rb") as f:
        head = f.read(1_000_000)
    moov = head.find(b"moov")
    mdat = head.find(b"mdat")
    if moov == -1:
        return "moov-not-in-head"
    if mdat == -1 or moov < mdat:
        return "faststart"
    return "moov-after-mdat"


if __name__ == "__main__":
    unittest.main()
