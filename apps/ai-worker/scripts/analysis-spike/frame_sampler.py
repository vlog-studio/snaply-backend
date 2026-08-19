"""스파이크용 대표 프레임 추출 — FFprobe 실측 길이 기준 상대 위치.

클라이언트가 보고한 길이는 믿지 않는다(앱의 해상도 하드코딩 전례가 있다).
ffmpeg/ffprobe 호출은 얇게 감싸고, 계산은 순수 함수로 분리해 테스트가 외부 바이너리 없이 돈다.
"""

import json
import subprocess

# 촬영 시작·종료의 흔들림을 피하려고 첫/끝 프레임을 쓰지 않는다.
FRAME_POSITIONS = (0.10, 0.367, 0.633, 0.90)

# detail=low 는 업로드 이미지를 저해상도로 축소해 처리하므로 원본을 그대로 올릴 이유가 없다.
MAX_FRAME_DIMENSION = 512

# 이보다 가까운 두 시점은 사실상 같은 프레임이라 하나로 접는다(아주 짧은 영상).
MIN_FRAME_GAP_MS = 120

# 8x8 평균 해시의 해밍 거리. 이 이하면 같은 화면으로 보고 버린다.
DUPLICATE_HAMMING_THRESHOLD = 5


class FrameExtractionError(RuntimeError):
    """프레임을 하나도 얻지 못함 — 재시도해도 같은 결과이므로 재시도 대상이 아니다."""


def parse_duration_ms(ffprobe_stdout: str) -> int:
    """`ffprobe -show_entries format=duration -of json` 출력에서 길이(ms)를 뽑는다."""
    payload = json.loads(ffprobe_stdout)
    seconds = float(payload["format"]["duration"])
    if seconds <= 0:
        raise ValueError(f"영상 길이가 0 이하입니다: {seconds}")
    return int(round(seconds * 1000))


def probe_duration_ms(video_path: str) -> int:
    out = subprocess.run(
        [
            "ffprobe", "-v", "error", "-show_entries", "format=duration",
            "-of", "json", video_path,
        ],
        capture_output=True, text=True, check=True,
    )
    return parse_duration_ms(out.stdout)


def frame_timestamps_ms(
    duration_ms: int,
    positions: tuple[float, ...] = FRAME_POSITIONS,
    min_gap_ms: int = MIN_FRAME_GAP_MS,
) -> list[int]:
    """실측 길이에 대한 상대 위치를 ms 시점으로. 너무 가까운 시점은 접는다.

    3초 영상이면 300 / 1101 / 1899 / 2700 ms 가 나온다(계획 문서 §7).
    """
    timestamps: list[int] = []
    for position in positions:
        candidate = int(round(duration_ms * position))
        if candidate <= 0 or candidate >= duration_ms:
            continue
        if timestamps and candidate - timestamps[-1] < min_gap_ms:
            continue
        timestamps.append(candidate)
    return timestamps


def build_extract_command(
    video_path: str,
    frames: list[tuple[int, str]],
    max_dimension: int = MAX_FRAME_DIMENSION,
) -> list[str]:
    """여러 시점을 **한 번의 ffmpeg 호출**로 뽑는 명령을 만든다.

    출력마다 `-ss` 를 두면(입력 뒤 seek) 디코딩은 느리지만 시점이 정확하다.
    3초 영상 4장 규모에서는 정확도가 속도보다 중요하다.
    """
    if not frames:
        raise ValueError("추출할 프레임 시점이 없습니다.")
    scale = (
        f"scale='min({max_dimension},iw)':'min({max_dimension},ih)'"
        ":force_original_aspect_ratio=decrease"
    )
    cmd = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", video_path]
    for timestamp_ms, out_path in frames:
        cmd += [
            "-ss", f"{timestamp_ms / 1000:.3f}",
            "-frames:v", "1",
            "-filter:v", scale,
            "-q:v", "3",
            out_path,
        ]
    return cmd


def extract_frames(video_path: str, frames: list[tuple[int, str]]) -> None:
    cmd = build_extract_command(video_path, frames)
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise FrameExtractionError(f"ffmpeg 실패: {proc.stderr[-800:]}")


def ahash_from_gray_bytes(data: bytes) -> int:
    """8x8 그레이스케일 원본 바이트 → 64비트 평균 해시."""
    if len(data) != 64:
        raise ValueError(f"8x8 gray 프레임은 64바이트여야 합니다: {len(data)}")
    mean = sum(data) / 64
    bits = 0
    for index, value in enumerate(data):
        if value > mean:
            bits |= 1 << index
    return bits


def frame_ahash(frame_path: str) -> int:
    out = subprocess.run(
        [
            "ffmpeg", "-v", "error", "-i", frame_path,
            "-vf", "scale=8:8,format=gray", "-f", "rawvideo", "-",
        ],
        capture_output=True, check=True,
    )
    return ahash_from_gray_bytes(out.stdout)


def hamming_distance(left: int, right: int) -> int:
    return bin(left ^ right).count("1")


def dedupe_indices(
    hashes: list[int], threshold: int = DUPLICATE_HAMMING_THRESHOLD
) -> list[int]:
    """유사 프레임을 버리고 남길 인덱스만 시간순으로 반환한다.

    거의 같은 화면만 반복되는 영상에 4장을 다 올리면 토큰만 쓰고 정보가 늘지 않는다.
    """
    kept: list[int] = []
    for index, value in enumerate(hashes):
        if any(hamming_distance(value, hashes[k]) <= threshold for k in kept):
            continue
        kept.append(index)
    return kept
