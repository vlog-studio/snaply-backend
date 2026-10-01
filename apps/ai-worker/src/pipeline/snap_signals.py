"""스냅 하나의 로컬 신호 — AI 편집 초안이 고르고 자르는 데 쓰는 값.

모델을 부르지 않는다. 프레임과 오디오에서 ffmpeg·numpy·silero VAD 로 계산하므로 분석 동의와
무관하게 돈다(docs/decisions/auto-edit-draft.md §2.7). 업로드 뒤 렌디션 작업이 원본으로 계산해
`video_signals` 에 둔다 — 초안 요청이 신호를 기다리지 않게 하려는 것이다.

| 신호 | 값 | 쓰는 곳(docs/decisions/edit-director.md) |
|---|---|---|
| `brightness` | 움직임 프레임의 평균 밝기, 0~1 | 거르기(어둠) §2.1 |
| `sharpness` | 대표 프레임 라플라시안 분산의 중앙값 | 거르기(흐림) §2.1 |
| `frame_hashes` | 대표 프레임 셋(25·50·75%)의 8×8 평균 해시 | 중복 §2.2 |
| `motion` | `STEP_MS` 마다 이웃 프레임의 평균 절대 차이, 0~1 | 점수 §4 · 역할 §6 · 구간 §7 |
| `speech` | 발화 구간 `[startMs, endMs]` 목록 | 점수 §4 · 구간 §7 |

값의 크기는 프레임 해상도에 따라 달라지므로 해상도를 고정한다(짧은 변 기준). 계산 방법을 바꾸면
`SIGNALS_VERSION` 을 올린다 — 다른 방법으로 잰 값끼리 비교하면 문턱값이 의미를 잃는다.
"""

import json
import os
import subprocess
import tempfile
from dataclasses import dataclass

import numpy as np

SIGNALS_VERSION = 1

# 움직임·밝기 프레임 간격. 구간을 고르는 창이 100ms 단위로 움직인다(edit-director.md §7).
STEP_MS = 100
MOTION_SHORT_SIDE = 96
# 흐림과 해시는 대표 프레임 셋에서 잰다. 흐림은 해상도가 낮으면 구별되지 않는다.
DETAIL_SHORT_SIDE = 360
HASH_POSITIONS = (0.25, 0.5, 0.75)

VAD_SAMPLE_RATE = 16000


class SignalsError(RuntimeError):
    """신호를 계산할 수 없는 파일."""


@dataclass(frozen=True)
class SnapSignals:
    duration_ms: int
    brightness: float
    sharpness: float
    frame_hashes: tuple[str, ...]
    motion: tuple[float, ...]
    has_audio: bool
    speech: tuple[tuple[int, int], ...]
    step_ms: int = STEP_MS
    version: int = SIGNALS_VERSION


# ── 순수 계산 ────────────────────────────────────────────────────────────────


def ahash(frame: np.ndarray) -> str:
    """그레이 프레임 → 8×8 평균 해시(16자리 16진수). 블록 평균으로 줄인다."""
    rows = np.array_split(frame.astype(np.float64), 8, axis=0)
    blocks = np.array([[block.mean() for block in np.array_split(row, 8, axis=1)] for row in rows])
    bits = 0
    for index, value in enumerate((blocks > blocks.mean()).flatten()):
        if value:
            bits |= 1 << index
    return f"{bits:016x}"


def hash_distance(left: str, right: str) -> int:
    return bin(int(left, 16) ^ int(right, 16)).count("1")


def sharpness(frame: np.ndarray) -> float:
    """라플라시안(4-이웃) 분산. 초점이 나가면 가장자리가 무너져 값이 작아진다."""
    image = frame.astype(np.float64)
    laplacian = (
        image[:-2, 1:-1] + image[2:, 1:-1] + image[1:-1, :-2] + image[1:-1, 2:] - 4 * image[1:-1, 1:-1]
    )
    return float(laplacian.var())


def motion_series(frames: list[np.ndarray]) -> tuple[float, ...]:
    """이웃 프레임의 평균 절대 차이(0~1). i 번째 값은 [i·STEP_MS, (i+1)·STEP_MS) 의 움직임이다."""
    return tuple(
        float(np.abs(after.astype(np.int16) - before.astype(np.int16)).mean() / 255)
        for before, after in zip(frames, frames[1:])
    )


def brightness(frames: list[np.ndarray]) -> float:
    return float(np.mean([frame.mean() for frame in frames]) / 255)


def speech_spans_ms(timestamps: list[dict], sample_rate: int = VAD_SAMPLE_RATE) -> tuple[tuple[int, int], ...]:
    """VAD 의 샘플 위치 → 밀리초 구간."""
    return tuple(
        (int(round(span["start"] * 1000 / sample_rate)), int(round(span["end"] * 1000 / sample_rate)))
        for span in timestamps
    )


def read_pgm(path: str) -> np.ndarray:
    """ffmpeg 가 쓴 P5(8비트) PGM 하나. 머리글에 치수가 있어 원본 비율을 따로 알 필요가 없다."""
    with open(path, "rb") as handle:
        data = handle.read()
    fields: list[bytes] = []
    offset = 0
    while len(fields) < 4:
        while data[offset : offset + 1].isspace():
            offset += 1
        if data[offset : offset + 1] == b"#":
            offset = data.index(b"\n", offset) + 1
            continue
        end = offset
        while not data[end : end + 1].isspace():
            end += 1
        fields.append(data[offset:end])
        offset = end
    if fields[0] != b"P5" or int(fields[3]) != 255:
        raise SignalsError(f"8비트 P5 PGM 이 아닙니다: {path}")
    width, height = int(fields[1]), int(fields[2])
    pixels = np.frombuffer(data, dtype=np.uint8, count=width * height, offset=offset + 1)
    return pixels.reshape(height, width)


# ── ffmpeg ──────────────────────────────────────────────────────────────────


def _short_side(size: int) -> str:
    # 짧은 변을 size 로 맞추고 비율은 지킨다 — 가로 스냅도 세로 스냅과 같은 해상도로 잰다.
    return f"scale={size}:{size}:force_original_aspect_ratio=increase,format=gray"


def _ffmpeg(args: list[str]) -> None:
    proc = subprocess.run(["ffmpeg", "-v", "error", "-y", *args], capture_output=True, text=True)
    if proc.returncode != 0:
        raise SignalsError(f"ffmpeg 실패: {proc.stderr[-800:]}")


def probe_duration_ms(path: str) -> int:
    proc = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "json", path],
        capture_output=True,
        text=True,
    )
    try:
        return int(round(float(json.loads(proc.stdout)["format"]["duration"]) * 1000))
    except (KeyError, ValueError, json.JSONDecodeError) as exc:
        raise SignalsError(f"길이를 읽을 수 없습니다: {proc.stderr[-400:]}") from exc


def has_audio(path: str) -> bool:
    proc = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "json", path],
        capture_output=True,
        text=True,
    )
    try:
        return bool(json.loads(proc.stdout).get("streams"))
    except json.JSONDecodeError:
        return False


def _motion_frames(path: str, work_dir: str) -> list[np.ndarray]:
    pattern = os.path.join(work_dir, "motion_%05d.pgm")
    _ffmpeg(["-i", path, "-an", "-vf", f"fps={1000 // STEP_MS},{_short_side(MOTION_SHORT_SIDE)}", pattern])
    names = sorted(name for name in os.listdir(work_dir) if name.startswith("motion_"))
    if not names:
        raise SignalsError("영상 프레임이 없습니다")
    return [read_pgm(os.path.join(work_dir, name)) for name in names]


def _detail_frames(path: str, work_dir: str, duration_ms: int) -> list[np.ndarray]:
    frames = []
    for index, position in enumerate(HASH_POSITIONS):
        out = os.path.join(work_dir, f"detail_{index}.pgm")
        at = f"{duration_ms * position / 1000:.3f}"
        _ffmpeg(["-ss", at, "-i", path, "-an", "-frames:v", "1", "-vf", _short_side(DETAIL_SHORT_SIDE), out])
        if os.path.exists(out):
            frames.append(read_pgm(out))
    if not frames:
        raise SignalsError("대표 프레임을 뽑지 못했습니다")
    return frames


def _speech(path: str) -> tuple[tuple[int, int], ...]:
    # faster-whisper 는 자막 때문에 이미 이미지에 있다. 무거운 whisper 모델은 부르지 않고 VAD(silero ONNX)만 쓴다.
    from faster_whisper.audio import decode_audio
    from faster_whisper.vad import VadOptions, get_speech_timestamps

    audio = decode_audio(path, sampling_rate=VAD_SAMPLE_RATE)
    options = VadOptions(min_speech_duration_ms=250, min_silence_duration_ms=300, speech_pad_ms=100)
    return speech_spans_ms(get_speech_timestamps(audio, options, sampling_rate=VAD_SAMPLE_RATE))


def read_signals(path: str, duration_ms: int | None = None) -> SnapSignals:
    """원본 파일 하나의 신호. 읽을 수 없는 파일은 `SignalsError`."""
    duration = duration_ms if duration_ms else probe_duration_ms(path)
    with tempfile.TemporaryDirectory(prefix="signals_") as work_dir:
        motion_frames = _motion_frames(path, work_dir)
        detail = _detail_frames(path, work_dir, duration)
    audio = has_audio(path)
    return SnapSignals(
        duration_ms=duration,
        brightness=brightness(motion_frames),
        sharpness=float(np.median([sharpness(frame) for frame in detail])),
        frame_hashes=tuple(ahash(frame) for frame in detail),
        motion=motion_series(motion_frames),
        has_audio=audio,
        speech=_speech(path) if audio else (),
    )
