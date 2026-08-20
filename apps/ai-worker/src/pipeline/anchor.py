"""앵커 어휘 사전과 얼굴 앵커 파생.

사전의 원본은 `packages/shared-types/src/anchor-vocabulary.json` **하나**이고 API 도 같은
파일을 읽는다. 여기서는 읽기만 하며 어휘를 코드에 다시 적지 않는다.

사전을 찾고 없으면 죽는 규약은 `pipeline/vocabulary.py` 가 갖는다. 편집 파이프라인만 사전을
쓰고, 편집 워커는 사전이 없으면 **기동 단계에서** 실패해야 한다 — 렌더 시점에 터지면 원인이
안 보인다.

파생 공식은 워커 단독 구현이다. API 는 `resolved` 를 계산하지 않으므로(저장·응답만 한다)
크로스랭귀지 계약이 없고, 대신 `tests/fixtures/anchor-derivation.json` 픽스처가 계약이다.
앱이 프리뷰 배치를 하기로 하면 그 픽스처가 그대로 계약이 된다.

배치·로딩 규약: docs/plans/edit-spec-v3-kickoff.md §3.4
"""

import math

from pipeline import vocabulary as _vocabulary

VOCABULARY_FILE = "anchor-vocabulary.json"

# 모듈 임포트 시점에 읽는다 — worker.py 가 이 모듈을 임포트하므로 편집 워커의 기동이 여기서 갈린다.
# 사전이 없으면 여기서 VocabularyUnavailableError 로 죽는 것이 의도다.
VOCABULARY: dict = _vocabulary.load(VOCABULARY_FILE)

VOCABULARY_VERSION: int = VOCABULARY["vocabularyVersion"]
DERIVATION_VERSION: int = VOCABULARY["derivationVersion"]

KINDS: dict[str, dict] = VOCABULARY["kinds"]
SCALE_REFS: tuple[str, ...] = tuple(VOCABULARY["scaleRefs"])
FACE_KEYPOINTS: tuple[str, ...] = tuple(VOCABULARY["faceKeypoints"]["available"])
DERIVATION_KEYPOINTS: tuple[str, ...] = tuple(VOCABULARY["faceKeypoints"]["requiredForDerivation"])


def refs_for(kind: str) -> tuple[str, ...]:
    entry = KINDS.get(kind)
    if entry is None:
        raise ValueError(f"알 수 없는 앵커 kind 입니다: {kind}")
    return tuple(entry["refs"])


def is_valid_anchor(kind: str, ref: str | None) -> bool:
    """kind·ref 조합이 사전에 있는지. `drop` 만 ref 를 갖지 않는다."""
    entry = KINDS.get(kind)
    if entry is None:
        return False
    if kind == "drop":
        return ref is None
    return ref is not None and ref in entry["refs"]


def is_valid_fallback_chain(chain: list[dict]) -> bool:
    """폴백 체인의 마지막은 반드시 `drop` 이다 — 못 붙이면 안 붙인다는 뜻이 스펙에 드러나야 한다."""
    if not chain:
        return False
    if chain[-1].get("kind") != "drop":
        return False
    return all(is_valid_anchor(link.get("kind", ""), link.get("ref")) for link in chain)


def is_valid_anchor_affinity(affinity: list[dict]) -> bool:
    """매니페스트의 `anchorAffinity` — 이 에셋을 붙일 수 있는 자리의 선호 순서.

    **`drop` 은 여기에 쓰지 않는다.** 위 폴백 체인과 정반대 규칙이라 헷갈리기 쉽다:
    `fallback`(editSpec)은 `drop` 으로 끝나야 하고 `anchorAffinity`(매니페스트)는 `drop` 을
    포함하면 안 된다. `drop` 은 폴백 종점이지 붙일 수 있는 자리가 아니다 — 넣어도
    `is_valid_anchor` 는 통과하므로 이 함수가 없으면 잡히지 않는다.

    `anchorAffinity[0]` 이 곧 기본값이라 매니페스트에 `defaultAnchor` 를 따로 두지 않는다.
    """
    if not affinity:
        return False
    if any(link.get("kind") == "drop" for link in affinity):
        return False
    return all(is_valid_anchor(link.get("kind", ""), link.get("ref")) for link in affinity)


# ── 얼굴 앵커 파생 ────────────────────────────────────────────────────────────────
#
# MediaPipe Face Detection 의 6키포인트에는 forehead·cheek·chin 이 **없다**. 아래 계수로
# bbox 와 두 눈에서 파생한다. 값은 해부학적 근사이며, 정확도보다 **재현성**이 계약이다 —
# 계수를 손대면 DERIVATION_VERSION 을 올리고 픽스처를 다시 만든다.
#
# 좌표계: 원점은 두 눈의 중점, 축은 눈 각도(roll)로 회전한 얼굴 로컬 프레임.
# 계수는 (오른쪽 × bbox 폭, 위쪽 × bbox 높이) 배수다. 이미지 좌표라 y 는 아래로 증가한다.
_FACE_OFFSETS: dict[str, tuple[float, float]] = {
    "eyes": (0.00, 0.00),
    "forehead": (0.00, 0.23),
    "aboveHead": (0.00, 0.48),
    "chin": (0.00, -0.62),
    "cheekL": (-0.25, -0.20),
    "cheekR": (0.25, -0.20),
}

Point = tuple[float, float]
BBox = tuple[float, float, float, float]

# 동률 판정의 여유. 파생 공식과 같은 계약이라 코드가 아니라 사전에서 온다 — 앱 프리뷰 구현이
# 오면 같은 값을 써야 픽스처가 계약으로 성립한다. 근거는 사전의 _tieEpsilonNote.
TIE_EPSILON: float = VOCABULARY["tieEpsilon"]


def _require_keypoints(keypoints: dict[str, Point]) -> tuple[Point, Point]:
    missing = [name for name in DERIVATION_KEYPOINTS if name not in keypoints]
    if missing:
        raise ValueError(f"얼굴 앵커 파생에 필요한 키포인트가 없습니다: {', '.join(missing)}")
    return keypoints["eyeL"], keypoints["eyeR"]


def face_roll_degrees(keypoints: dict[str, Point]) -> float:
    """두 눈을 잇는 선의 기울기. 스티커 회전에 그대로 쓴다."""
    eye_l, eye_r = _require_keypoints(keypoints)
    return math.degrees(math.atan2(eye_r[1] - eye_l[1], eye_r[0] - eye_l[0]))


def face_scale_reference(bbox: BBox) -> float:
    """`scaleRef: "faceWidth"` 의 값. bbox 폭을 쓴다 — 눈 사이 거리는 고개를 돌리면 줄어든다."""
    return bbox[2]


def resolve_face_anchor(bbox: BBox, keypoints: dict[str, Point], ref: str) -> Point:
    """얼굴 앵커점을 소스 정규화 좌표로 반환한다.

    캔버스가 아니라 **소스** 기준이다 — 앵커의 출처(bbox·키포인트)가 전부 소스 좌표계이고,
    캔버스 기준으로 저장하면 fitMode 가 섞여 출력 프로필을 바꿀 때 재계산해야 한다.

    **0~1 밖으로 나가도 클램프하지 않는다.** 프레임 위쪽에 붙은 얼굴의 `aboveHead` 는 음수가
    되는 것이 맞다. 여기서 프레임 안으로 밀어 넣으면 스티커가 조용히 다른 자리에 붙고, 폴백
    체인은 "성공했다"고 판단한다. 배치 가능 여부는 세이프에어리어를 아는 배치 단계가 정하고
    안 되면 다음 폴백으로 간다 — 잘못 붙은 스티커는 없는 것보다 나쁘다.
    """
    if ref not in refs_for("face"):
        raise ValueError(f"face 앵커의 ref 가 아닙니다: {ref}")

    x, y, w, h = bbox
    if ref == "bboxCenter":
        return (x + w / 2, y + h / 2)

    eye_l, eye_r = _require_keypoints(keypoints)
    origin = ((eye_l[0] + eye_r[0]) / 2, (eye_l[1] + eye_r[1]) / 2)
    roll = math.atan2(eye_r[1] - eye_l[1], eye_r[0] - eye_l[0])
    right = (math.cos(roll), math.sin(roll))
    up = (math.sin(roll), -math.cos(roll))

    along_right, along_up = _FACE_OFFSETS[ref]
    return (
        origin[0] + right[0] * along_right * w + up[0] * along_up * h,
        origin[1] + right[1] * along_right * w + up[1] * along_up * h,
    )


def resolve_hand_anchor(bbox: BBox, ref: str) -> Point:
    if ref not in refs_for("hand"):
        raise ValueError(f"hand 앵커의 ref 가 아닙니다: {ref}")
    x, y, w, h = bbox
    if ref == "bboxCenter":
        return (x + w / 2, y + h / 2)
    return (x + w / 2, y - 0.25 * h)


def resolve_object_anchor(bbox: BBox, ref: str) -> Point:
    if ref not in refs_for("object"):
        raise ValueError(f"object 앵커의 ref 가 아닙니다: {ref}")
    x, y, w, h = bbox
    if ref == "bboxCenter":
        return (x + w / 2, y + h / 2)
    if ref == "above":
        return (x + w / 2, y - 0.25 * h)
    # beside — 프레임 가장자리까지 여유가 큰 쪽. 동률이면 오른쪽으로 고정한다.
    #
    # 여유를 그냥 `>` 로 비교하면 안 된다. x=0.40·w=0.20 이면 `1.0 - (x + w)` 가
    # 0.3999999999999999 로 떨어져 부동소수 잡음이 동률을 갈라 버린다. 입력을 조금만 달리 표현해도
    # 스티커가 반대쪽에 붙으므로, 잡음보다 큰 여유를 두고 비교해 결정론을 지킨다.
    if x > (1.0 - (x + w)) + TIE_EPSILON:
        return (x - 0.25 * w, y + h / 2)
    return (x + w + 0.25 * w, y + h / 2)
