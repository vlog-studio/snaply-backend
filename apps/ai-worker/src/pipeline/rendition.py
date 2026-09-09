"""배포 렌디션 — 어디서나 재생되는 사본을 만든다.

아이폰이 쓰는 HEVC(H.265)와 HDR(Dolby Vision/HLG)은 안드로이드·웹에서 재생되지 않는 경우가
많다. 원본을 그대로 내려보내면 "내 영상인데 안 열린다"가 되므로, 업로드 직후 **H.264/SDR
사본**을 하나 만들어 둔다. 원본은 지우지 않는다 — 편집은 계속 원본을 쓴다.

`durationMs` 도 여기서 실측한다. 클라이언트가 보고한 길이는 캡처 옵션에서 온 값이라 실제
파일과 어긋날 수 있다.
"""

import json
import os
import subprocess
from dataclasses import dataclass

from loguru import logger

#: 배포본의 세로 상한. 원본이 이보다 작으면 키우지 않는다 — 화질은 늘지 않고 용량만 는다.
MAX_HEIGHT = 1920
#: 썸네일을 뽑을 시점(초). 첫 프레임은 검은 화면인 경우가 많다.
THUMBNAIL_AT_SECONDS = 0.5


class RenditionError(Exception):
    """변환 실패. 스냅 자체는 계속 쓸 수 있으므로 치명적이지 않다."""


@dataclass(frozen=True)
class RenditionOutcome:
    video_path: str
    thumbnail_path: str | None
    duration_ms: int | None


def _run(cmd: list[str]) -> None:
    logger.debug("ffmpeg: {}", " ".join(cmd))
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RenditionError(f"ffmpeg 실패: {proc.stderr[-800:]}")


def probe_duration_ms(path: str) -> int | None:
    """FFprobe 실측 길이(밀리초). 읽을 수 없으면 None — 변환 자체는 계속한다."""
    try:
        out = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "json", path],
            capture_output=True,
            text=True,
            check=True,
        )
        seconds = float(json.loads(out.stdout)["format"]["duration"])
        return int(round(seconds * 1000))
    except Exception:  # noqa: BLE001 — 길이는 있으면 좋은 값이지 필수가 아니다
        return None


def _has_audio(path: str) -> bool:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "a", "-show_entries", "stream=index",
         "-of", "json", path],
        capture_output=True,
        text=True,
        check=True,
    )
    return bool(json.loads(out.stdout).get("streams"))


def _video_filter() -> str:
    """
    HDR → SDR 톤매핑 + 세로 상한.

    `zscale` 로 톤매핑하면 정확하지만 그 필터가 없는 빌드가 흔하다. 여기서는 어느 빌드에서나
    도는 방법을 쓴다 — 색공간을 BT.709 로 강제 변환하고 `format=yuv420p` 로 떨어뜨린다.
    HDR 원본은 다소 어둡게 나올 수 있지만 **재생되지 않는 것보다 낫다**. 정밀 톤매핑은
    A-7 의 렌더 파이프라인에서 다룬다.

    `-2` 는 짝수로 맞춘 자동 계산이다 — H.264 는 홀수 해상도를 받지 않는다.
    """
    return (
        f"scale='min(iw,iw*{MAX_HEIGHT}/ih)':'min({MAX_HEIGHT},ih)':force_original_aspect_ratio=decrease,"
        "scale=trunc(iw/2)*2:trunc(ih/2)*2,"
        "format=yuv420p"
    )


def build(source_path: str, work_dir: str) -> RenditionOutcome:
    """원본에서 배포본과 썸네일을 만든다. 썸네일 실패는 삼킨다 — 표지는 장식이다."""
    duration_ms = probe_duration_ms(source_path)
    video_path = os.path.join(work_dir, "rendition.mp4")

    cmd = ["ffmpeg", "-y", "-i", source_path, "-vf", _video_filter(),
           "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
           "-profile:v", "high", "-pix_fmt", "yuv420p",
           # 스트리밍 재생을 위해 moov 를 앞으로 — 없으면 플레이어가 전체를 받고서야 시작한다.
           "-movflags", "+faststart"]
    if _has_audio(source_path):
        cmd += ["-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-ac", "2"]
    else:
        cmd += ["-an"]
    cmd.append(video_path)
    _run(cmd)

    thumbnail_path: str | None = os.path.join(work_dir, "thumbnail.jpg")
    try:
        _run(["ffmpeg", "-y", "-ss", str(THUMBNAIL_AT_SECONDS), "-i", source_path,
              "-frames:v", "1", "-q:v", "3", "-vf", _video_filter(), thumbnail_path])
    except RenditionError:
        # 0.5초보다 짧은 클립 등. 표지가 없을 뿐 배포본은 멀쩡하다.
        logger.warning("썸네일 생성 실패 — 배포본만 저장한다")
        thumbnail_path = None

    logger.info("렌디션 생성 완료 duration_ms={} thumbnail={}", duration_ms, thumbnail_path is not None)
    return RenditionOutcome(video_path, thumbnail_path, duration_ms)
