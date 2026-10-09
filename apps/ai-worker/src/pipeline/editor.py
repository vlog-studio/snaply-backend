"""FFmpeg 컷편집 파이프라인 — 스타일 프리셋별 편집 + 1080p 렌더링."""

import json
import math
import shutil
import subprocess
from dataclasses import dataclass

from loguru import logger

import pipeline.hdr as hdr
from pipeline import transition as tr
from pipeline.render_spec import RenderSpec, build_video_filter


MIN_CLIP_DURATION_SECONDS = 0.1
CLIP_END_TOLERANCE_SECONDS = 0.05


@dataclass(frozen=True)
class ClipSource:
    path: str
    start_ms: int = 0
    end_ms: int | None = None


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


def _resolve_clip_window(
    source_duration: float, start_ms: int, end_ms: int | None
) -> tuple[float, float, float]:
    start = start_ms / 1000
    requested_end = source_duration if end_ms is None else end_ms / 1000
    if start >= source_duration:
        raise ValueError("클립 시작 시간이 원본 영상 길이를 벗어났습니다.")
    if requested_end > source_duration + CLIP_END_TOLERANCE_SECONDS:
        raise ValueError("클립 종료 시간이 원본 영상 길이를 벗어났습니다.")
    end = min(requested_end, source_duration)
    duration = end - start
    if duration < MIN_CLIP_DURATION_SECONDS:
        raise ValueError("클립 길이는 최소 100ms여야 합니다.")
    return start, end, duration


def normalize_clip(
    src: str,
    dst: str,
    eq: str,
    render_spec: RenderSpec,
    start_ms: int = 0,
    end_ms: int | None = None,
) -> None:
    """Trim and normalize one clip while keeping its audio aligned.

    The source's own tags stay behind (`-map_metadata -1`). ffmpeg copies the first input's global metadata into
    every output, and a phone's original carries where it was shot (`location`), the device, and its software —
    which would leave in the movie through sharing and SNS posts (backlog E-17). Every later step (joining, BGM,
    subtitles) starts from these files, so stopping it here keeps the whole movie clean.
    """
    cmd = ["ffmpeg", "-y"]
    has_audio = _has_audio(src)
    source_duration = probe_duration(src)
    start, end, duration = _resolve_clip_window(source_duration, start_ms, end_ms)
    cmd += ["-i", src]
    if not has_audio:
        cmd += ["-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000"]
    audio_input = "[0:a:0]" if has_audio else "[1:a:0]"
    # HDR 원본은 트림 직후 SDR 로 내린다 — 이후 스케일·블러 배경은 SDR 에서 돌아야
    # 색이 어긋나지 않는다. 필터가 없는 빌드에서는 빈 목록이라 그대로 지나간다.
    tonemap = "".join("," + f for f in hdr.source_filters(src))
    video_trim = f"[0:v:0]trim=start={start:.3f}:end={end:.3f}{tonemap}[trimmed_v]"
    if has_audio:
        audio_filter = (
            f"{audio_input}aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,"
            f"apad,atrim=start={start:.3f}:end={end:.3f},asetpts=PTS-STARTPTS[a]"
        )
    else:
        audio_filter = (
            f"{audio_input}aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,"
            f"atrim=duration={duration:.3f},asetpts=PTS-STARTPTS[a]"
        )
    filter_graph = (
        f"{video_trim};"
        f"{build_video_filter(render_spec, eq, input_label='[trimmed_v]')};"
        f"{audio_filter}"
    )
    cmd += [
        "-filter_complex", filter_graph,
        "-map", "[v]",
        "-map", "[a]",
        "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-ar", "48000", "-ac", "2",
        "-map_metadata", "-1",
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

    t = min(t, min(durations) / 2)
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
    clips: list[ClipSource], preset: StylePreset, render_spec: RenderSpec, work_dir: str
) -> str:
    """원본 클립들을 편집해 편집본(BGM/자막 전) 경로를 반환."""
    normalized: list[str] = []
    for i, clip in enumerate(clips):
        dst = f"{work_dir}/norm_{i}.mp4"
        normalize_clip(
            clip.path,
            dst,
            preset.eq,
            render_spec,
            start_ms=clip.start_ms,
            end_ms=clip.end_ms,
        )
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


# ── 경계별 전환(editSpec v3) ─────────────────────────────────────────────────────
#
# 컷마다 정규화한 구간을 경계의 전환으로 잇는다(specs/movie.md MOV-22). 전환의 종류·길이·폴백은
# transition-vocabulary.json 이 원천이고, 고른 값을 컷에 맞추는 해석(`resolve_transition`)은 앱
# 미리보기와 같은 규칙이다 — 편집 화면에서 본 전환이 결과물이 된다.
#
# **겹침형(crossfade)은 컷 구간 밖의 여분 프레임을 쓴다**(decisions/transition-director.md §0.2). 경계를
# 가운데에 두고 나가는 컷은 구간 끝 뒤로, 들어오는 컷은 구간 시작 앞으로 절반씩 늘려 정규화한 뒤
# 그만큼 겹친다. 그래서 사용자가 자른 구간은 전부 보이고 무비 길이는 컷 길이의 합이다.
# 경계형(dip·flash·zoompunch)은 각 컷 안에서 끝나므로 구간을 늘리지 않고 이어 붙인다.


@dataclass(frozen=True)
class _Segment:
    path: str
    duration: float  # 정규화된 파일의 실제 길이(초)


def _ms_window(clip: ClipSource) -> tuple[int, int, int]:
    """(구간 시작, 구간 끝, 원본 길이) — 모두 밀리초. 끝이 원본보다 길면 원본 끝에 맞춘다."""
    source_ms = math.floor(probe_duration(clip.path) * 1000)
    start, end, _ = _resolve_clip_window(source_ms / 1000, clip.start_ms, clip.end_ms)
    return clip.start_ms, min(round(end * 1000), source_ms), source_ms


def resolve_boundaries(
    windows: list[tuple[int, int, int]], transitions: list[tr.Transition]
) -> list[tr.Transition]:
    """경계마다 고른 전환을 양쪽 컷의 길이·여분 프레임에 맞춘다."""
    resolved = []
    for i, chosen in enumerate(transitions):
        out_start, out_end, out_source = windows[i]
        in_start, in_end, _ = windows[i + 1]
        boundary = tr.Boundary(
            outgoing_cut_ms=out_end - out_start,
            outgoing_spare_after_ms=out_source - out_end,
            incoming_cut_ms=in_end - in_start,
            incoming_spare_before_ms=in_start,
        )
        resolved.append(tr.resolve_transition(chosen, boundary))
    return resolved


def _is_overlap(t: tr.Transition) -> bool:
    return t.kind != tr.HARDCUT and tr.KINDS[t.kind]["timing"] == tr.OVERLAP


def _overlap_half_ms(t: tr.Transition | None) -> int:
    # 올림이어도 여분을 넘지 않는다 — 해석이 여분의 두 배 이하로 길이를 잡고 여분은 정수 ms 다.
    return math.ceil(t.duration_ms / 2) if t is not None and _is_overlap(t) else 0


def _zoompunch_filter(t: tr.Transition, render_spec: RenderSpec) -> str:
    entry = tr.KINDS[t.kind]
    seconds = t.duration_ms / 1000
    extra = entry["scaleFrom"] - 1
    # easeOutCubic: 1 - (1 - x)^3 만큼 제자리로 → 배율 = 1 + extra·(1 - x)^3
    zoom = f"1+{extra:g}*pow(1-min(it/{seconds:g}\\,1)\\,3)"
    # zoompan 은 출력 타임베이스를 1/fps 로 선언하면서 pts 는 입력 것을 그대로 쓴다. 입력이
    # 1/15360 이면 프레임 하나가 17초가 되어 2초 컷이 17분이 됐고, 뒤의 fps 가 그 사이를 복제하느라
    # 메모리가 끝없이 늘었다(2026-10-01). 그래서 먼저 타임베이스를 1/fps, pts 를 프레임 번호로 맞춘다.
    fps = render_spec.fps
    return (
        f"fps={fps},settb=1/{fps},setpts=N,"
        f"zoompan=z='{zoom}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':"
        f"d=1:s={render_spec.width}x{render_spec.height}:fps={fps}"
    )


def _fade_filter(direction: str, t: tr.Transition, share: float, start: float) -> str:
    entry = tr.KINDS[t.kind]
    seconds = t.duration_ms / 1000 * share
    return f"fade=t={direction}:st={start:.3f}:d={seconds:.3f}:color={entry['color']}"


def _segment_video_filter(
    index: int,
    segment: _Segment,
    incoming: tr.Transition | None,
    outgoing: tr.Transition | None,
    render_spec: RenderSpec,
) -> str:
    """구간 하나의 경계형 효과. 들어오는 경계는 앞에, 나가는 경계는 뒤에 걸린다."""
    filters: list[str] = []
    if incoming is not None and incoming.kind == "zoompunch":
        filters.append(_zoompunch_filter(incoming, render_spec))
    if incoming is not None and incoming.kind in ("dip", "flash"):
        share = tr.KINDS[incoming.kind]["split"]["incoming"]
        filters.append(_fade_filter("in", incoming, share, 0))
    if outgoing is not None and outgoing.kind in ("dip", "flash"):
        share = tr.KINDS[outgoing.kind]["split"]["outgoing"]
        start = max(segment.duration - outgoing.duration_ms / 1000 * share, 0)
        filters.append(_fade_filter("out", outgoing, share, start))
    # xfade 는 두 입력의 타임베이스가 같아야 한다 — fps 가 타임베이스를 다시 바꾸므로 settb 가 마지막이다.
    filters.append(f"fps={render_spec.fps},format=yuv420p,setsar=1,settb=AVTB")
    return f"[{index}:v:0]{','.join(filters)}[s{index}v]"


def edit_timeline(
    clips: list[ClipSource],
    transitions: list[tr.Transition],
    preset: StylePreset,
    render_spec: RenderSpec,
    work_dir: str,
) -> str:
    """경계마다 고른 전환으로 컷을 이어 편집본(BGM/자막 전) 경로를 반환한다."""
    if len(transitions) != len(clips) - 1:
        raise ValueError("전환은 컷 사이마다 하나씩이어야 합니다.")

    windows = [_ms_window(clip) for clip in clips]
    resolved = resolve_boundaries(windows, transitions)

    segments: list[_Segment] = []
    for i, (clip, (start_ms, end_ms, _source_ms)) in enumerate(zip(clips, windows)):
        before = _overlap_half_ms(resolved[i - 1] if i > 0 else None)
        after = _overlap_half_ms(resolved[i] if i < len(resolved) else None)
        dst = f"{work_dir}/seg_{i}.mp4"
        normalize_clip(
            clip.path,
            dst,
            preset.eq,
            render_spec,
            start_ms=start_ms - before,
            end_ms=end_ms + after,
        )
        segments.append(_Segment(dst, probe_duration(dst)))

    out = f"{work_dir}/edited_base.mp4"
    if len(segments) == 1:
        shutil.copyfile(segments[0].path, out)
    else:
        _join_segments(segments, resolved, render_spec, out)

    logger.info(
        "컷편집 완료(v3) preset={} profile={} fit={} clips={} transitions={}",
        preset.name,
        render_spec.output_profile,
        render_spec.fit_mode,
        len(clips),
        [t.kind if t.duration_ms is None else f"{t.kind}:{t.duration_ms}" for t in resolved],
    )
    return out


def _join_segments(
    segments: list[_Segment],
    resolved: list[tr.Transition],
    render_spec: RenderSpec,
    out: str,
) -> None:
    inputs: list[str] = []
    for segment in segments:
        inputs += ["-i", segment.path]

    parts = [
        _segment_video_filter(
            i,
            segment,
            resolved[i - 1] if i > 0 else None,
            resolved[i] if i < len(resolved) else None,
            render_spec,
        )
        for i, segment in enumerate(segments)
    ]

    acc_v, acc_a, acc_duration = "[s0v]", "[0:a:0]", segments[0].duration
    for i in range(1, len(segments)):
        t = resolved[i - 1]
        next_v, next_a = f"[s{i}v]", f"[{i}:a:0]"
        out_v, out_a = f"[j{i}v]", f"[j{i}a]"
        if _is_overlap(t):
            seconds = t.duration_ms / 1000
            # 앞쪽 누적의 끝(여분 프레임 절반)과 다음 구간의 앞(여분 프레임 절반)을 겹친다.
            offset = max(acc_duration - seconds, 0)
            parts.append(
                f"{acc_v}{next_v}xfade=transition=fade:duration={seconds:.3f}:offset={offset:.3f}{out_v}"
            )
            parts.append(f"{acc_a}{next_a}acrossfade=d={seconds:.3f}{out_a}")
            acc_duration += segments[i].duration - seconds
        else:
            parts.append(f"{acc_v}{acc_a}{next_v}{next_a}concat=n=2:v=1:a=1{out_v}{out_a}")
            acc_duration += segments[i].duration
        acc_v, acc_a = out_v, out_a

    _run([
        "ffmpeg", "-y", *inputs,
        "-filter_complex", ";".join(parts), "-map", acc_v, "-map", acc_a,
        "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p",
        "-c:a", "aac", out,
    ])
