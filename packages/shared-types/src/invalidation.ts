/**
 * 재생성 무효화 규칙 — 무엇을 바꾸면 어디까지 다시 계산하는가.
 *
 * 이 계획의 중심 산출물이다. 시드 구조(`seed.ts`)·`analysis` 참조 전환·비트 재투영 가드가
 * 전부 이 표의 한 열로 들어온다.
 *
 * 원본은 `invalidation-vocabulary.json` **하나**이고 워커(`pipeline/invalidation.py`)도 같은
 * 파일을 읽는다. **표를 문서에만 두면 구현과 갈라지므로 데이터로 둔다.**
 *
 * 액션마다 **모든 레이어의 상태를 빠짐없이 적는다.** 생략을 허용하고 기본값을 두면, 레이어를
 * 새로 추가했을 때 아무도 판단하지 않은 채 그 기본값으로 굳는다. `preserved` 를 기본값으로
 * 두면 새 레이어가 조용히 낡고, `invalidated` 를 두면 조용히 낭비된다 — 어느 쪽도 좋지 않다.
 *
 * 계획: `docs/plans/edit-spec-v3-kickoff.md` §5
 */
import vocabulary from './invalidation-vocabulary.json' with { type: 'json' };
import { SEEDED_STAGES, type SeededStage } from './seed.js';

export const INVALIDATION_VOCABULARY = vocabulary;

export const INVALIDATION_VOCABULARY_VERSION = vocabulary.invalidationVocabularyVersion;

/**
 * - `invalidated` — 레이어를 다시 계산한다. 결과가 달라질 수 있다.
 * - `retimed` — 구성은 그대로 두고 시각만 다시 투영한다. 컷 목록·스티커 종류는 바뀌지 않는다.
 * - `preserved` — 손대지 않는다. 바이트 단위로 같아야 한다.
 */
export const LAYER_STATES = ['invalidated', 'retimed', 'preserved'] as const;
export type LayerState = (typeof LAYER_STATES)[number];

export const SPEC_LAYERS = [
  'grade.look',
  'grade.match',
  'grade.accents',
  'music',
  'timeline.cuts',
  'timeline.transitions',
  'overlays.stickers',
  'overlays.captions',
  'audio.bgm',
  'audio.sfx',
  'audio.mix',
] as const;
export type SpecLayer = (typeof SPEC_LAYERS)[number];

/** 파이프라인 순서가 아니라 표에서 읽히는 순서다 — 재현/재생성 쌍이 맨 위에 인접해 있다. */
export const INVALIDATION_ACTIONS = [
  'expired-regenerate',
  'user-regenerate',
  'bgm-swap',
  'bgm-swap-beyond-guard',
  'sticker-pack-swap',
  'transition-style-swap',
  'cut-reorder',
  'cut-remove',
  'clip-add',
  'output-profile-change',
] as const;
export type InvalidationAction = (typeof INVALIDATION_ACTIONS)[number];

interface ActionEntry {
  order: number;
  label: string;
  layers: Record<string, string>;
  reinterpretedRefs: string[];
  pinPromotion: string[];
  attemptBump: string[];
  note: string;
}

const ACTIONS = vocabulary.actions as unknown as Record<string, ActionEntry>;

export function isInvalidationAction(value: string): value is InvalidationAction {
  return (INVALIDATION_ACTIONS as readonly string[]).includes(value);
}

export function layerState(action: InvalidationAction, layer: SpecLayer): LayerState {
  const state = ACTIONS[action]?.layers[layer];
  if (state === undefined) {
    // 사전에 빠진 조합은 조용히 기본값으로 넘기지 않는다 — 그게 이 표를 데이터로 둔 이유다.
    throw new Error(`무효화 사전에 ${action} × ${layer} 판단이 없습니다.`);
  }
  return state as LayerState;
}

export function layersInState(action: InvalidationAction, state: LayerState): SpecLayer[] {
  return SPEC_LAYERS.filter((layer) => layerState(action, layer) === state);
}

/** 이 액션이 어떤 디렉터의 `attempt` 를 올리는가. 빈 배열이면 선택이 없다는 뜻이다. */
export function attemptBumpFor(action: InvalidationAction): SeededStage[] {
  return (ACTIONS[action]?.attemptBump ?? []).filter((stage): stage is SeededStage =>
    (SEEDED_STAGES as readonly string[]).includes(stage),
  );
}

/** 스펙에 핀된 참조 중 다시 해석해야 하는 것(새 `packId`, 새 클립의 `analysis` 등). */
export function reinterpretedRefsFor(action: InvalidationAction): string[] {
  return ACTIONS[action]?.reinterpretedRefs ?? [];
}

/**
 * 핀을 더 최신 버전으로 올릴 수 있는 액션인지 — A-5 의 세 번째 축이다.
 * 무효화도 재해석도 아니다: 더 나은 `analysisVersion` 이 나중에 생겼을 때 그것을 쓸 것인가는
 * 별개의 정책이고, 그 경계가 `attempt` 경계와 정확히 일치한다.
 */
export function pinPromotionFor(action: InvalidationAction): string[] {
  return ACTIONS[action]?.pinPromotion ?? [];
}

/** 아무것도 무효화하지 않는 액션 — 산출물이 바이트 단위로 같아야 한다. */
export function isPreservingAction(action: InvalidationAction): boolean {
  return SPEC_LAYERS.every((layer) => layerState(action, layer) === 'preserved');
}

export function actionLabel(action: InvalidationAction): string {
  return ACTIONS[action]?.label ?? action;
}

export function actionNote(action: InvalidationAction): string {
  return ACTIONS[action]?.note ?? '';
}
