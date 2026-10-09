/**
 * 컷 역할 어휘 — AI 편집 초안이 컷을 고르고 놓는 문법. 사용자에게 보이지 않는 내부 값이다(ANA-2).
 *
 * 원본은 `cut-role-vocabulary.json` **하나**이고 워커(`pipeline/cut_role.py`)도 같은 파일을 읽는다.
 * 역할마다 놓일 수 있는 자리(`position`)와 판단에 쓰는 신호, 그 신호의 출처(촬영·로컬·분석)를 담는다.
 *
 * 결정: `docs/decisions/auto-edit-draft.md` · 역할을 정하는 규칙: `docs/decisions/edit-director.md` §6
 */
import vocabulary from './cut-role-vocabulary.json' with { type: 'json' };

export const CUT_ROLE_VOCABULARY = vocabulary;

export const CUT_ROLE_VOCABULARY_VERSION = vocabulary.cutRoleVocabularyVersion;

/** 사전의 `order` 순서. */
export const CUT_ROLES = ['hook', 'establish', 'detail', 'action', 'people', 'closer', 'body'] as const;
export type CutRole = (typeof CUT_ROLES)[number];

export const CUT_ROLE_POSITIONS = ['first', 'last', 'any'] as const;
export type CutRolePosition = (typeof CUT_ROLE_POSITIONS)[number];

export const CUT_ROLE_SOURCES = ['capture', 'local', 'analysis'] as const;
export type CutRoleSource = (typeof CUT_ROLE_SOURCES)[number];

export const CUT_ROLE_SIGNALS = [
  'captureOrder',
  'motion',
  'quality',
  'face',
  'places',
  'objects',
  'actions',
] as const;
export type CutRoleSignal = (typeof CUT_ROLE_SIGNALS)[number];

/** 신호로 판단할 수 없는 컷의 역할. */
export const DEFAULT_CUT_ROLE = vocabulary.default as CutRole;

interface RoleEntry {
  order: number;
  position: CutRolePosition;
  signals: CutRoleSignal[];
}

const ROLES = vocabulary.roles as unknown as Record<CutRole, RoleEntry>;
const SIGNALS = vocabulary.signals as unknown as Record<CutRoleSignal, { source: CutRoleSource }>;

export function isCutRole(value: unknown): value is CutRole {
  return typeof value === 'string' && (CUT_ROLES as readonly string[]).includes(value);
}

export function cutRolePosition(role: CutRole): CutRolePosition {
  return ROLES[role].position;
}

export function cutRoleSignals(role: CutRole): readonly CutRoleSignal[] {
  return ROLES[role].signals;
}

export function cutRoleSignalSource(signal: CutRoleSignal): CutRoleSource {
  return SIGNALS[signal].source;
}

/**
 * `count` 컷 중 `index` 번째 자리에 놓일 수 있는 역할, 사전 순서대로.
 * 첫 자리와 (두 컷 이상일 때) 마지막 자리는 그 자리의 역할로만 채운다 — 사전 `_positionsNote`.
 */
export function cutRolesAllowedAt(index: number, count: number): readonly CutRole[] {
  if (!Number.isInteger(count) || count < 1 || !Number.isInteger(index) || index < 0 || index >= count) {
    throw new RangeError(`컷 자리가 범위 밖입니다: ${index} / ${count}`);
  }
  const position: CutRolePosition = index === 0 ? 'first' : index === count - 1 ? 'last' : 'any';
  return CUT_ROLES.filter((role) => ROLES[role].position === position);
}

/**
 * 주어진 출처의 신호만으로 판단할 수 있는 역할인가. 신호가 없는 `default` 는 언제나 쓸 수 있다.
 * 분석이 꺼져 있으면 `['capture', 'local']` 로 물어 분석 신호만 쓰는 역할을 거른다.
 */
export function isCutRoleJudgeable(role: CutRole, sources: readonly CutRoleSource[]): boolean {
  const signals = ROLES[role].signals;
  if (signals.length === 0) return true;
  return signals.some((signal) => sources.includes(SIGNALS[signal].source));
}
