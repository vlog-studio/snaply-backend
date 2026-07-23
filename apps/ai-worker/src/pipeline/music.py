"""스타일 프리셋 태그 기반 BGM 매칭 및 합성 (v1)."""

import random
import subprocess
from pathlib import Path

from loguru import logger

import config

AUDIO_EXTS = {".m4a", ".mp3", ".aac", ".wav", ".ogg", ".flac"}


def _bgm_root() -> Path:
    root = Path(config.BGM_DIR)
    if not root.is_absolute():
        root = config.WORKER_ROOT / root
    return root


def pick_track(tag: str) -> str | None:
    """태그 디렉토리에서 무작위 BGM 선택. 없으면 전체에서, 그래도 없으면 None."""
    root = _bgm_root()
    candidates = [p for p in (root / tag).glob("*") if p.suffix.lower() in AUDIO_EXTS] if (root / tag).is_dir() else []
    if not candidates and root.is_dir():
        candidates = [p for p in root.rglob("*") if p.suffix.lower() in AUDIO_EXTS]
    if not candidates:
        logger.warning("BGM 없음 (tag={}, dir={}) — BGM 없이 진행", tag, root)
        return None
    return str(random.choice(candidates))


def mix(video_in: str, bgm_path: str, out: str, video_duration: float) -> None:
    """원본 오디오 위에 BGM을 낮은 볼륨으로 합성하고, 끝에서 fade-out."""
    fade_start = max(video_duration - 2.0, 0.0)
    fc = (
        f"[1:a]volume=0.25,afade=t=out:st={fade_start:.2f}:d=2,"
        f"atrim=0:{video_duration:.2f}[bg];"
        f"[0:a][bg]amix=inputs=2:duration=first:dropout_transition=0[a]"
    )
    subprocess.run(
        [
            "ffmpeg", "-y",
            "-i", video_in,
            "-stream_loop", "-1", "-i", bgm_path,  # BGM이 짧으면 반복
            "-filter_complex", fc,
            "-map", "0:v:0", "-map", "[a]",
            "-c:v", "copy", "-c:a", "aac", "-shortest", out,
        ],
        capture_output=True, text=True, check=True,
    )
    logger.info("BGM 합성 완료 track={}", Path(bgm_path).name)


def apply_bgm(video_in: str, tag: str, out: str, video_duration: float) -> tuple[str, bool]:
    """BGM 합성 시도. 반환: (결과 경로, BGM 적용 여부)."""
    track = pick_track(tag)
    if track is None:
        return video_in, False
    mix(video_in, track, out, video_duration)
    return out, True
