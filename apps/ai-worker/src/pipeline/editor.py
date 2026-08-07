"""FFmpeg 컷편집 파이프라인 — 스타일 프리셋별 편집 + 1080p 렌더링."""

import json
import subprocess
from dataclasses import dataclass

from loguru import logger

from pipeline.render_spec import RenderSpec, build_video_filter


@dataclass(frozen=True)
class StylePreset:
    name: str
    # 클립 정규화 시 적용할 색보정(eq) 필터. 빈 문자열이면 원본 색감 유지.
    eq: str
    # 클립 간 전환: "crossfade" | "cut"
    transition: str
    transition_seconds: float
    bgm_tag: str


PRESETS: dict[str, StylePreset] = {
    "감성": StylePreset("감성", "eq=saturation=0.8", "crossfade", 0.8, "calm"),
    "여행": StylePreset("여행", "eq=brightness=0.1", "cut", 0.3, "upbeat"),
    "일상": StylePreset("일상", "", "cut", 0.5, "daily"),
}


def get_preset(name: str) -> StylePreset:
    return PRESETS.get(name, PRESETS["일상"])


def _run(cmd: list[str]) -> None:
    logger.debug("ffmpeg: {}", " ".join(cmd))
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg 실패: {proc.stderr[-800:]}")


def probe_duration(path: str) -> float:
    out = subprocess.run(
        [
            "ffprobe", "-v", "error", "-show_entries", "format=duration",
            "-of", "json", path,
        ],
        capture_output=True, text=True, check=True,
    )
    return float(json.loads(out.stdout)["format"]["duration"])


def _has_audio(path: str) -> bool:
    out = subprocess.run(
        [
            "ffprobe", "-v", "error", "-select_streams", "a",
            "-show_entries", "stream=index", "-of", "json", path,
        ],
        capture_output=True, text=True, check=True,
    )
    return bool(json.loads(out.stdout).get("streams"))


def normalize_clip(src: str, dst: str, eq: str, render_spec: RenderSpec) -> None:
    """Normalize one clip to the selected canvas without truncating it to audio length."""
    cmd = ["ffmpeg", "-y"]
    has_audio = _has_audio(src)
    duration = probe_duration(src)
    cmd += ["-i", src]
    if not has_audio:
        cmd += ["-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000"]
    audio_input = "[0:a:0]" if has_audio else "[1:a:0]"
    filter_graph = (
        f"{build_video_filter(render_spec, eq)};"
        f"{audio_input}aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,"
        f"apad,atrim=duration={duration:.3f},asetpts=PTS-STARTPTS[a]"
    )
    cmd += [
        "-filter_complex", filter_graph,
        "-map", "[v]",
        "-map", "[a]",
        "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-ar", "48000", "-ac", "2",
        dst,
    ]
    _run(cmd)


def _concat(normalized: list[str], out: str) -> None:
    inputs: list[str] = []
    for path in normalized:
        inputs += ["-i", path]
    streams = "".join(f"[{i}:v:0][{i}:a:0]" for i in range(len(normalized)))
    fc = f"{streams}concat=n={len(normalized)}:v=1:a=1[v][a]"
    _run([
        "ffmpeg", "-y", *inputs,
        "-filter_complex", fc, "-map", "[v]", "-map", "[a]",
        "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p",
        "-c:a", "aac", out,
    ])


def _crossfade(normalized: list[str], durations: list[float], t: float, out: str) -> None:
    inputs: list[str] = []
    for path in normalized:
        inputs += ["-i", path]

    vparts, aparts = [], []
    v_prev, a_prev = "[0:v:0]", "[0:a:0]"
    running = durations[0]
    for i in range(1, len(normalized)):
        offset = max(running - t, 0)
        v_out = f"[v{i}]"
        a_out = f"[a{i}]"
        vparts.append(
            f"{v_prev}[{i}:v:0]xfade=transition=fade:duration={t}:offset={offset:.3f}{v_out}"
        )
        aparts.append(f"{a_prev}[{i}:a:0]acrossfade=d={t}{a_out}")
        v_prev, a_prev = v_out, a_out
        running += durations[i] - t

    fc = ";".join(vparts + aparts)
    _run([
        "ffmpeg", "-y", *inputs,
        "-filter_complex", fc, "-map", v_prev, "-map", a_prev,
        "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p",
        "-c:a", "aac", out,
    ])


def extract_thumbnail(video: str, out: str, at_seconds: float = 1.0) -> None:
    """지정 시점(기본 1초) 프레임을 JPG 썸네일로 추출."""
    _run([
        "ffmpeg", "-y", "-ss", str(at_seconds), "-i", video,
        "-frames:v", "1", "-q:v", "3", out,
    ])


def edit(
    clips: list[str], preset: StylePreset, render_spec: RenderSpec, work_dir: str
) -> str:
    """원본 클립들을 편집해 편집본(BGM/자막 전) 경로를 반환."""
    normalized: list[str] = []
    for i, clip in enumerate(clips):
        dst = f"{work_dir}/norm_{i}.mp4"
        normalize_clip(clip, dst, preset.eq, render_spec)
        normalized.append(dst)

    out = f"{work_dir}/edited_base.mp4"
    if len(normalized) == 1:
        # 단일 클립: 정규화본을 그대로 사용
        import shutil

        shutil.copyfile(normalized[0], out)
    elif preset.transition == "crossfade":
        durations = [probe_duration(p) for p in normalized]
        _crossfade(normalized, durations, preset.transition_seconds, out)
    else:
        _concat(normalized, out)

    logger.info(
        "컷편집 완료 preset={} profile={} fit={} clips={}",
        preset.name,
        render_spec.output_profile,
        render_spec.fit_mode,
        len(clips),
    )
    return out
