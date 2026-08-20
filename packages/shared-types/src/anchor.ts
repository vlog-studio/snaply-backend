/**
 * 앵커 어휘 — editSpec v3 의 `anchor`/`fallback` 과 에셋 매니페스트의 `anchorAffinity` 가
 * 같은 값을 쓴다.
 *
 * 원본은 `anchor-vocabulary.json` **하나**이고 워커(`pipeline/anchor.py`)도 같은 파일을 읽는다.
 * 아래 상수 배열이 JSON 과 어긋나면 `apps/api/test/anchor-vocabulary.test.ts` 가 잡는다 —
 * 타입은 컴파일 타임에만 있으므로 런타임 배열과 JSON 을 대조하는 것이 유일한 방법이다.
 *
 * 배치·로딩 규약은 `docs/plans/edit-spec-v3-kickoff.md` §3.
 */
import vocabulary from './anchor-vocabulary.json' with { type: 'json' };

export const ANCHOR_VOCABULARY = vocabulary;

export const VOCABULARY_VERSION = vocabulary.vocabularyVersion;

/**
 * 얼굴 앵커 파생 공식의 버전. 공식은 워커 단독 구현이고 이 값이 그 계약이다.
 * 계수를 손대면 이 값을 올리고 워커의 파생 픽스처를 다시 만든다 — 안 그러면 과거 스펙의
 * `resolved` 재계산 결과가 조용히 달라진다.
 */
export const DERIVATION_VERSION = vocabulary.derivationVersion;

/**
 * 파생에서 동률을 판정할 때 쓰는 여유. 공식은 워커 단독 구현이지만 이 값은 **계약**이라
 * 사전에서 온다 — 앱이 프리뷰 배치를 구현하면 같은 값을 써야 픽스처가 계약으로 성립한다.
 * 그냥 `>` 로 비교하면 부동소수 잡음이 동률을 갈라 스티커가 반대쪽에 붙는다.
 */
export const TIE_EPSILON = vocabulary.tieEpsilon;

export const ANCHOR_KINDS = [
  'face',
  'hand',
  'object',
  'freezone',
  'safeArea',
  'drop',
] as const;
export type AnchorKind = (typeof ANCHOR_KINDS)[number];

export const FACE_REFS = [
  'eyes',
  'forehead',
  'aboveHead',
  'chin',
  'cheekL',
  'cheekR',
  'bboxCenter',
] as const;
export const HAND_REFS = ['bboxCenter', 'above'] as const;
export const OBJECT_REFS = ['bboxCenter', 'above', 'beside'] as const;
export const FREEZONE_REFS = [
  'topLeft',
  'topRight',
  'center',
  'bottomLeft',
  'bottomRight',
] as const;
export const SAFE_AREA_REFS = ['upper', 'lowerThird'] as const;

/** kind 별 허용 ref. `drop` 은 ref 를 갖지 않는다. */
export const ANCHOR_REFS: Readonly<Record<AnchorKind, readonly string[]>> = {
  face: FACE_REFS,
  hand: HAND_REFS,
  object: OBJECT_REFS,
  freezone: FREEZONE_REFS,
  safeArea: SAFE_AREA_REFS,
  drop: [],
};

export type FaceRef = (typeof FACE_REFS)[number];
export type HandRef = (typeof HAND_REFS)[number];
export type ObjectRef = (typeof OBJECT_REFS)[number];
export type FreezoneRef = (typeof FREEZONE_REFS)[number];
export type SafeAreaRef = (typeof SAFE_AREA_REFS)[number];
export type AnchorRef = FaceRef | HandRef | ObjectRef | FreezoneRef | SafeAreaRef;

export const SCALE_REFS = ['faceWidth', 'handWidth', 'objectWidth', 'frameWidth'] as const;
export type ScaleRef = (typeof SCALE_REFS)[number];

/**
 * 앵커 하나. editSpec 의 `anchor`·`fallback[]` 과 매니페스트의 `anchorAffinity[]` 가
 * **같은 모양**을 쓴다 — `"face:aboveHead"` 같은 문자열은 `offset` 을 담지 못해 확장 불가다.
 *
 * 매니페스트에는 `defaultAnchor` 를 따로 두지 않는다. `anchorAffinity[0]` 이 곧 기본값이라
 * 두 값이 어긋날 여지를 없앤다.
 */
export interface AnchorSpec {
  kind: AnchorKind;
  /** `drop` 은 생략한다. 그 외에는 kind 별 허용 목록에서 고른다. */
  ref?: AnchorRef;
  /** 앵커점 기준 상대 이동. `scaleRef` 단위의 배수다(픽셀이 아니다). */
  offset?: readonly [number, number];
}

/**
 * kind 와 ref 의 조합이 사전에 있는지.
 *
 * ⚠️ 여기에 **좌표 범위 검증을 추가하지 말 것.** editSpec 의 "모든 좌표는 0~1 정규화"는
 * 좌표계 진술이지 범위 보장이 아니다 — 파생은 프레임 밖 좌표를 클램프하지 않으므로
 * `resolved.xy` 는 정상적으로 음수이거나 1 을 넘을 수 있다(프레임 위에 붙은 얼굴의
 * `aboveHead` 등). 클램프도 범위 거부도 실패를 성공으로 위장하는 변환이고, 배치 가능 여부는
 * 세이프에어리어를 아는 배치 단계가 정한다. 근거와 실제 값은
 * `docs/plans/edit-spec-v3-kickoff.md` §1.1 과 워커의 파생 픽스처에 있다.
 */
export function isValidAnchor(spec: AnchorSpec): boolean {
  const allowed = ANCHOR_REFS[spec.kind] as readonly string[] | undefined;
  if (!allowed) {
    return false;
  }
  if (spec.kind === 'drop') {
    return spec.ref === undefined;
  }
  return spec.ref !== undefined && allowed.includes(spec.ref);
}

/**
 * 폴백 체인이 성립하는지. **마지막은 반드시 `drop`** 이다 —
 * 잘못 배치된 스티커는 없는 것보다 나쁘므로 "어디에도 못 붙이면 안 붙인다"가 스펙에 드러나야 한다.
 */
export function isValidFallbackChain(chain: readonly AnchorSpec[]): boolean {
  if (chain.length === 0) {
    return false;
  }
  if (chain[chain.length - 1]?.kind !== 'drop') {
    return false;
  }
  return chain.every(isValidAnchor);
}

/**
 * 에셋 매니페스트의 `anchorAffinity` — 이 에셋을 어디에 붙일 수 있는지의 **선호 순서**다.
 * `anchorAffinity[0]` 이 곧 기본값이므로 매니페스트에 `defaultAnchor` 를 따로 두지 않는다.
 *
 * **`drop` 은 여기에 쓰지 않는다.** 위 `isValidFallbackChain` 과 정반대 규칙이라 헷갈리기 쉽다:
 * `fallback`(editSpec)은 `drop` 으로 **끝나야** 하고, `anchorAffinity`(매니페스트)는 `drop` 을
 * **포함하면 안 된다.** `drop` 은 "어디에도 못 붙이면 안 붙인다"는 폴백 종점이지 붙일 수 있는
 * 자리가 아니다. 넣어도 `isValidAnchor` 는 통과하므로 이 함수가 없으면 잡히지 않는다.
 */
export function isValidAnchorAffinity(affinity: readonly AnchorSpec[]): boolean {
  if (affinity.length === 0) {
    return false;
  }
  if (affinity.some((link) => link.kind === 'drop')) {
    return false;
  }
  return affinity.every(isValidAnchor);
}
