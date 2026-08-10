"""Versioned output profiles and FFmpeg fit strategies."""

from dataclasses import dataclass


@dataclass(frozen=True)
class RenderSpec:
    profile_version: int
    output_profile: str
    width: int
    height: int
    fps: int
    fit_mode: str


PROFILE_V1: dict[str, tuple[int, int, int]] = {
    "short_vertical": (1080, 1920, 30),
    "youtube_landscape": (1920, 1080, 30),
    "instagram_portrait": (1080, 1350, 30),
    "square": (1080, 1080, 30),
}
FIT_MODES = {"contain", "cover", "blur_background"}

DEFAULT_RENDER_SPEC = RenderSpec(1, "short_vertical", 1080, 1920, 30, "blur_background")
LEGACY_RENDER_SPEC = RenderSpec(1, "youtube_landscape", 1920, 1080, 30, "contain")


def parse_render_spec(raw: object, *, fallback: RenderSpec = LEGACY_RENDER_SPEC) -> RenderSpec:
    """Parse a trusted job snapshot while rejecting unknown or oversized dimensions."""
    if not isinstance(raw, dict):
        return fallback

    profile_version = raw.get("profileVersion")
    output_profile = raw.get("outputProfile")
    fit_mode = raw.get("fitMode")
    if (
        profile_version != 1
        or not isinstance(output_profile, str)
        or output_profile not in PROFILE_V1
        or not isinstance(fit_mode, str)
        or fit_mode not in FIT_MODES
    ):
        raise ValueError("지원하지 않는 렌더 설정입니다.")

    width, height, fps = PROFILE_V1[output_profile]
    if (raw.get("width"), raw.get("height"), raw.get("fps")) != (width, height, fps):
        raise ValueError("출력 프로필과 해상도 설정이 일치하지 않습니다.")

    return RenderSpec(1, output_profile, width, height, fps, fit_mode)


def _contain_scale(spec: RenderSpec) -> str:
    # Preserve small foregrounds instead of blindly stretching them to the canvas.
    return (
        f"scale=w='min({spec.width},iw)':h='min({spec.height},ih)':"
        "force_original_aspect_ratio=decrease:force_divisible_by=2"
    )


def build_video_filter(spec: RenderSpec, eq: str, *, input_label: str = "[0:v:0]") -> str:
    """Build a labelled filter graph whose video output is always named ``[v]``."""
    prefix = f"{input_label}setpts=PTS-STARTPTS"
    if eq:
        prefix += f",{eq}"

    finish = f"setsar=1,fps={spec.fps},format=yuv420p[v]"
    if spec.fit_mode == "contain":
        return (
            f"{prefix},{_contain_scale(spec)},"
            f"pad={spec.width}:{spec.height}:(ow-iw)/2:(oh-ih)/2:color=black,{finish}"
        )

    cover = (
        f"scale={spec.width}:{spec.height}:"
        "force_original_aspect_ratio=increase:force_divisible_by=2,"
        f"crop={spec.width}:{spec.height}"
    )
    if spec.fit_mode == "cover":
        return f"{prefix},{cover},{finish}"

    return (
        f"{prefix},split=2[background][foreground];"
        f"[background]{cover},gblur=sigma=30[background_blurred];"
        f"[foreground]{_contain_scale(spec)}[foreground_scaled];"
        "[background_blurred][foreground_scaled]"
        "overlay=(main_w-overlay_w)/2:(main_h-overlay_h)/2,"
        f"{finish}"
    )
