"""faster-whisper 자막 생성 → SRT → 소프트 자막(mov_text) 삽입."""

import subprocess

from loguru import logger

import config

_model = None


def load_model() -> None:
    """컨테이너 시작 시 1회 로드 (요청마다 재로드 금지). GPU 없으면 CPU int8."""
    global _model
    if _model is not None:
        return
    from faster_whisper import WhisperModel

    logger.info("faster-whisper 모델 로드 중 (model={}, device=cpu)", config.WHISPER_MODEL)
    _model = WhisperModel(config.WHISPER_MODEL, device="cpu", compute_type="int8")
    logger.info("faster-whisper 모델 로드 완료")


def _fmt_ts(seconds: float) -> str:
    ms = int(round(seconds * 1000))
    h, ms = divmod(ms, 3_600_000)
    m, ms = divmod(ms, 60_000)
    s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def transcribe_to_srt(media_path: str, srt_path: str) -> int:
    """음성 인식 후 SRT 작성. 반환: 세그먼트 수(0이면 무음/인식 실패)."""
    if _model is None:
        load_model()
    assert _model is not None

    segments, _info = _model.transcribe(media_path, vad_filter=True)
    lines: list[str] = []
    count = 0
    for seg in segments:
        text = seg.text.strip()
        if not text:
            continue
        count += 1
        lines.append(str(count))
        lines.append(f"{_fmt_ts(seg.start)} --> {_fmt_ts(seg.end)}")
        lines.append(text)
        lines.append("")

    with open(srt_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    logger.info("자막 인식 완료 segments={}", count)
    return count


def embed_soft(video_in: str, srt_path: str, out: str) -> None:
    """SRT를 mp4 소프트 자막(mov_text)으로 삽입."""
    subprocess.run(
        [
            "ffmpeg", "-y", "-i", video_in, "-i", srt_path,
            "-map", "0:v", "-map", "0:a", "-map", "1",
            "-c:v", "copy", "-c:a", "copy", "-c:s", "mov_text",
            "-metadata:s:s:0", "language=kor", out,
        ],
        capture_output=True, text=True, check=True,
    )
    logger.info("소프트 자막 삽입 완료")


def apply_subtitles(video_in: str, work_dir: str, out: str) -> tuple[str, bool]:
    """자막 생성·삽입 시도. 반환: (결과 경로, 자막 적용 여부)."""
    srt_path = f"{work_dir}/subtitle.srt"
    try:
        count = transcribe_to_srt(video_in, srt_path)
        if count == 0:
            logger.warning("인식된 자막 없음 — 자막 없이 진행")
            return video_in, False
        embed_soft(video_in, srt_path, out)
        return out, True
    except Exception:  # noqa: BLE001
        logger.exception("자막 생성 실패 — 자막 없이 진행")
        return video_in, False
