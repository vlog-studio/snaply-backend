"""HDR 원본을 SDR 로 내리는 공통 처리.

아이폰은 HDR(Dolby Vision/HLG, PQ)로 찍는다. 우리 산출물은 H.264/8bit SDR 이므로 어딘가에서
반드시 내려와야 하는데, **픽셀만 내리고 색 메타데이터를 그대로 두면 파일이 자기 자신에 대해
거짓말을 한다.** 플레이어는 `smpte2084`(PQ) 태그를 보고 이미 평평해진 영상에 HDR 톤매핑을
**한 번 더** 걸고, 결과는 "다소 어둡게" 가 아니라 눈에 띄게 망가진다.

실제로 그 상태였다(2026-09-15 실검증에서 발견). 그래서 이 모듈은 두 가지를 한다:

1. **가능하면 제대로 톤매핑한다** — `zscale`+`tonemap` 이 있는 빌드에서.
   워커 이미지(Debian)에는 있고, macOS Homebrew 빌드에는 없다. 그래서 있으면 쓰고 없으면
   기존 방식(색공간 변환 없이 8bit 로 떨구기)으로 물러난다.
2. **어느 경로든 출력 태그를 bt709 로 적는다.** 이건 선택이 아니다 — 톤매핑을 못 했더라도
   파일이 "나는 PQ 다" 라고 말하면 안 된다. 태그가 맞아야 플레이어가 두 번 손대지 않는다.

   태그는 **필터(`setparams`)로** 바꾼다. 출력 인자 `-color_trc`/`-color_primaries` 만으로는
   부족하다 — mov/mp4 muxer 가 입력의 `colr` 박스를 그대로 다시 써서 `colorspace` 만 바뀌고
   전달함수·프라이머리는 PQ/bt2020 으로 남는다(실측 확인). 프레임 속성을 바꿔야 인코더와
   muxer 가 함께 따라온다.

SDR 원본은 건드리지 않는다. 입력 태그가 이미 사실이므로 덮어쓸 이유가 없다.
"""

import json
import subprocess
from functools import lru_cache

#: PQ(HDR10/Dolby Vision)와 HLG. 이 둘이면 톤매핑 대상이다.
HDR_TRANSFERS = {"smpte2084", "arib-std-b67"}


@lru_cache(maxsize=1)
def has_tonemap() -> bool:
    """`zscale`+`tonemap` 이 있는 빌드인가. 프로세스당 한 번만 조회한다."""
    try:
        out = subprocess.run(
            ["ffmpeg", "-hide_banner", "-filters"], capture_output=True, text=True, check=True
        ).stdout
    except (OSError, subprocess.CalledProcessError):
        return False
    return " zscale " in out and " tonemap " in out


def is_hdr(path: str) -> bool:
    """원본이 HDR 전달함수를 쓰는가. 읽을 수 없으면 False — 모르면 건드리지 않는다."""
    try:
        out = subprocess.run(
            ["ffprobe", "-v", "error", "-select_streams", "v:0",
             "-show_entries", "stream=color_transfer", "-of", "json", path],
            capture_output=True,
            text=True,
            check=True,
        ).stdout
        streams = json.loads(out).get("streams") or []
        return bool(streams) and streams[0].get("color_transfer") in HDR_TRANSFERS
    except Exception:  # noqa: BLE001 — 판정 실패가 변환을 막지는 않는다
        return False


#: 프레임의 색 속성을 SDR 로 못 박는다. 파일이 자기 자신을 정확히 설명하게 하는 부분.
SDR_PARAMS = "setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709"


def tonemap_filter() -> str:
    """
    PQ/HLG → BT.709 SDR.

    `npl=100` 은 기준 백색 100nit. `hable` 은 하이라이트를 부드럽게 눌러 얼굴이 날아가지 않게
    한다. `desat=0` 은 자동 채도 저하를 끄는 것 — 기본값은 밝은 부분을 회색으로 만든다.
    """
    return (
        "zscale=t=linear:npl=100,"
        "tonemap=tonemap=hable:desat=0,"
        "zscale=p=bt709:t=bt709:m=bt709:r=tv"
    )


def source_filters(path: str) -> list[str]:
    """
    원본에 먼저 걸 필터 조각. SDR 원본이면 빈 목록 — 입력 태그가 이미 사실이라 건드리지 않는다.

    HDR 이면 톤매핑(가능한 빌드에서)과 SDR 태그를 함께 건다. **톤매핑을 못 하는 빌드에서도
    태그는 붙는다** — 그게 이 결함의 핵심이다.
    """
    if not is_hdr(path):
        return []
    return ([tonemap_filter()] if has_tonemap() else []) + [SDR_PARAMS]
