/**
 * 컷 사이 전환 어휘 — 경계마다 고르는 전환의 이름·길이 범위·폴백과, 그 값을 컷에 맞추는 해석 규칙.
 *
 * 원본은 `transition-vocabulary.json` **하나**이고 워커(`pipeline/transition.py`)도 같은 파일을
 * 읽는다. 해석(`resolveTransition`)은 앱 미리보기·API·렌더러가 모두 같은 답을 내야 하므로
 * 두 구현을 같은 픽스처(`packages/shared-types/fixtures/transition-resolution.json`)로 고정한다.
 * 편집 화면에서 본 전환이 결과물과 다르면 사용자는 보지 않고 고른 셈이 된다(MOV-22).
 *
 * 결정: `docs/decisions/auto-edit-draft.md` §2.3 · 툴 카드: 같은 문서 §6.1 · v1 전환과 여분 프레임:
 * `docs/decisions/transition-director.md` §0
 */
import vocabulary from './transition-vocabulary.json' with { type: 'json' };

export const TRANSITION_VOCABULARY = vocabulary;

export const TRANSITION_VOCABULARY_VERSION = vocabulary.transitionVocabularyVersion;

/** 사전의 `order` 순서. 경계마다 고르는 UI 도 이 순서로 보여준다. */
export const TRANSITION_KINDS = ['hardcut', 'crossfade', 'dip', 'flash', 'zoompunch'] as const;
export type TransitionKind = (typeof TRANSITION_KINDS)[number];

/** 길이가 있는 전환. `hardcut` 만 길이가 없다. */
export type TimedTransitionKind = Exclude<TransitionKind, 'hardcut'>;

export const TRANSITION_TIMINGS = ['boundary', 'overlap'] as const;
export type TransitionTiming = (typeof TRANSITION_TIMINGS)[number];

export const TRANSITION_EASINGS = ['linear', 'easeOutCubic'] as const;
export type TransitionEasing = (typeof TRANSITION_EASINGS)[number];

/** 경계 하나의 전환. `hardcut` 은 길이를 갖지 않는다. */
export type Transition =
  | { kind: 'hardcut' }
  | { kind: TimedTransitionKind; durationMs: number };

interface DurationRange {
  min: number;
  max: number;
  default: number;
}

interface KindEntry {
  order: number;
  label: string;
  timing: TransitionTiming;
  durationMs: DurationRange | null;
  split?: { outgoing: number; incoming: number };
  color?: string;
  scaleFrom?: number;
  easing?: TransitionEasing;
  fallback: TransitionKind | null;
}

const KINDS = vocabulary.kinds as unknown as Record<TransitionKind, KindEntry>;

export class TransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TransitionError';
  }
}

export function isTransitionKind(value: string): value is TransitionKind {
  return (TRANSITION_KINDS as readonly string[]).includes(value);
}

export function transitionTiming(kind: TransitionKind): TransitionTiming {
  return KINDS[kind].timing;
}

export function transitionLabel(kind: TransitionKind): string {
  return KINDS[kind].label;
}

/** 길이 범위. `hardcut` 은 `null`. */
export function transitionDurationRange(kind: TransitionKind): DurationRange | null {
  return KINDS[kind].durationMs;
}

export function transitionEasing(kind: TransitionKind): TransitionEasing {
  return KINDS[kind].easing ?? 'linear';
}

/** 경계형 전환이 나가는 컷·들어오는 컷에 걸치는 비율. 겹침형·`hardcut` 은 `null`. */
export function transitionSplit(kind: TransitionKind): { outgoing: number; incoming: number } | null {
  return KINDS[kind].split ?? null;
}

/** 이 전환을 사전의 기본 길이로. */
export function defaultTransition(kind: TransitionKind): Transition {
  if (kind === 'hardcut') return { kind };
  return { kind, durationMs: (KINDS[kind].durationMs as DurationRange).default };
}

/**
 * 사전에 맞는 값인지 확인한다. 범위 밖 길이는 **폴백하지 않고 거부한다** — 줄이는 것은 컷에 맞추는
 * 해석 단계의 일이고, 애초에 잘못 들어온 값을 조용히 고치면 어디서 틀렸는지 아무도 모른다.
 */
export function validateTransition(value: { kind: string; durationMs?: number | null }): Transition {
  if (!isTransitionKind(value.kind)) {
    throw new TransitionError(`알 수 없는 전환입니다: ${value.kind}`);
  }
  const range = KINDS[value.kind].durationMs;
  if (range === null) {
    if (value.durationMs !== undefined && value.durationMs !== null) {
      throw new TransitionError(`${value.kind} 는 길이를 갖지 않습니다.`);
    }
    return { kind: 'hardcut' };
  }
  const ms = value.durationMs;
  if (typeof ms !== 'number' || !Number.isInteger(ms) || ms < range.min || ms > range.max) {
    throw new TransitionError(
      `${value.kind} 의 길이는 ${range.min}~${range.max}ms 정수여야 합니다(받은 값: ${String(ms)}).`,
    );
  }
  return { kind: value.kind as TimedTransitionKind, durationMs: ms };
}

/** 경계 양쪽 컷의 사정. 모두 밀리초. */
export interface TransitionBoundary {
  outgoing: {
    /** 나가는 컷의 구간 길이. */
    cutMs: number;
    /** 원본에서 구간 끝 뒤로 남은 프레임. */
    spareAfterMs: number;
  };
  incoming: {
    /** 들어오는 컷의 구간 길이. */
    cutMs: number;
    /** 원본에서 구간 시작 앞으로 남은 프레임. */
    spareBeforeMs: number;
  };
}

/** 이 경계에 넣을 수 있는 이 전환의 최대 길이(밀리초, 내림). */
function capacityMs(kind: TimedTransitionKind, boundary: TransitionBoundary): number {
  const { outgoing, incoming } = boundary;
  const caps: number[] = [];
  if (KINDS[kind].timing === 'overlap') {
    // 경계를 가운데에 두고 양쪽에 절반씩 — 각 쪽에 그만큼의 여분 프레임이 있어야 하고,
    // 섞이는 몫이 컷의 절반을 넘지 않아야 컷의 가운데가 온전히 보인다.
    caps.push(2 * outgoing.spareAfterMs, 2 * incoming.spareBeforeMs, outgoing.cutMs, incoming.cutMs);
  } else {
    const split = KINDS[kind].split as { outgoing: number; incoming: number };
    if (split.outgoing > 0) caps.push(outgoing.cutMs / 2 / split.outgoing);
    if (split.incoming > 0) caps.push(incoming.cutMs / 2 / split.incoming);
  }
  return Math.floor(Math.max(0, Math.min(...caps)));
}

/**
 * 고른 전환을 이 경계에 실제로 들어가는 전환으로 바꾼다.
 *
 * 길이는 컷 길이·여분 프레임이 허락하는 만큼 줄어들고, 줄어든 길이가 사전의 `min` 보다 짧으면
 * `fallback` 을 그 기본 길이로 다시 해석한다 — `crossfade` → `dip` → `hardcut`, 나머지는 바로 `hardcut`
 * (decisions/transition-director.md §2). 종류(`kind`)를 바꾸는 것은 이 폴백뿐이다 — 고른 값 자체는
 * 그대로 저장되고, 컷이 다시 길어지면 원래 전환이 돌아온다.
 */
export function resolveTransition(transition: Transition, boundary: TransitionBoundary): Transition {
  if (transition.kind === 'hardcut') return transition;
  const entry = KINDS[transition.kind];
  const range = entry.durationMs as DurationRange;
  const durationMs = Math.min(transition.durationMs, capacityMs(transition.kind, boundary));
  if (durationMs >= range.min) return { kind: transition.kind, durationMs };
  const fallback = entry.fallback ?? 'hardcut';
  return fallback === 'hardcut' ? { kind: 'hardcut' } : resolveTransition(defaultTransition(fallback), boundary);
}
