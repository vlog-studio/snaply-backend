/**
 * 스펙 시드와 파이프라인 스테이지 이름.
 *
 * 재현과 "다시 생성"은 서로 반대를 요구한다. 시드를 하나만 고정하면 만료 후 재생성이 같은
 * 산출물을 내는 대신 사용자가 "다시 생성"을 눌러도 같은 영상이 나온다. 그래서 `root` 는
 * 고정하고 `attempt` 만 올린다.
 *
 * `attempt` 가 **스테이지별**인 이유는 부분 재생성이다 — "스티커만 다시"가 `music`·`timeline`
 * 까지 바꾸면 무효화 표가 약속한 유지 범위가 무너진다.
 *
 * 스테이지 이름의 원본은 `stage-vocabulary.json` **하나**이고 워커(`pipeline/seed.py`)도 같은
 * 파일을 읽는다. 아래 상수 배열이 JSON 과 어긋나면
 * `apps/api/test/stage-vocabulary.test.ts` 가 잡는다.
 *
 * **시드 파생 함수는 여기에 없다.** API 는 `root` 를 쓰고 `attempt` 를 올릴 뿐 파생값을
 * 소비하지 않는다 — 파생은 디렉터(워커) 단독이고 골든 픽스처가 그 계약이다.
 * `anchor.ts` 의 파생 공식과 같은 구조다.
 *
 * 계획: `docs/plans/edit-spec-v3-kickoff.md` §4
 */
import vocabulary from './stage-vocabulary.json' with { type: 'json' };

export const STAGE_VOCABULARY = vocabulary;

export const STAGE_VOCABULARY_VERSION = vocabulary.stageVocabularyVersion;

/**
 * `root` 의 상한 = `Number.MAX_SAFE_INTEGER`. 넘으면 JavaScript 가 값을 반올림해
 * API 가 쓴 `root` 와 워커가 읽은 `root` 가 달라지고, **에러 없이 다른 영상이 나온다.**
 */
export const SEED_ROOT_MAX = vocabulary.rootMax;

/** 파이프라인 순서대로. `provenance.stages[]` 도 같은 어휘를 쓴다. */
export const STAGE_NAMES = [
  'ingest',
  'visual-reader',
  'audio-reader',
  'semantic-reader',
  'music-director',
  'edit-director',
  'style-director',
] as const;
export type StageName = (typeof STAGE_NAMES)[number];

/**
 * 시드를 쓰는 스테이지 — 선택이 있는 디렉터뿐이다. 리더는 MediaPipe·VAD 라 결정적이고,
 * `semantic-reader` 는 결과가 `analysisVersion` 으로 핀되므로 다시 돌리지 않는다.
 */
export const SEEDED_STAGES = ['music-director', 'edit-director', 'style-director'] as const;
export type SeededStage = (typeof SEEDED_STAGES)[number];

export interface SpecSeed {
  root: number;
  /** 빠진 스테이지는 0 으로 본다. 시드를 쓰지 않는 스테이지는 키로 넣을 수 없다. */
  attempt: Partial<Record<SeededStage, number>>;
}

export function isSeededStage(stage: string): stage is SeededStage {
  return (SEEDED_STAGES as readonly string[]).includes(stage);
}

function isNonNegativeInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

/**
 * 시드 구조가 계약을 지키는지. **오타 난 스테이지 이름을 통과시키면 안 된다** —
 * 통과시키면 그 디렉터는 `attempt` 를 0 으로 보고, 사용자가 "다시 생성"을 눌러도 같은 영상이
 * 나오며, 아무 에러도 남지 않는다.
 */
export function isValidSeed(seed: unknown): seed is SpecSeed {
  if (typeof seed !== 'object' || seed === null) {
    return false;
  }
  const candidate = seed as { root?: unknown; attempt?: unknown };
  if (!isNonNegativeInt(candidate.root) || candidate.root > SEED_ROOT_MAX) {
    return false;
  }
  if (candidate.attempt === undefined) {
    return true;
  }
  // 배열을 빼놓으면 `attempt: []` 가 통과한다 — `Object.entries([])` 가 빈 배열이라
  // `.every()` 가 참이 되기 때문이다. 워커의 `parse_seed` 는 dict 만 받으므로 여기서 막지
  // 않으면 API 가 통과시킨 스펙을 워커가 거부하는 상태가 된다.
  if (typeof candidate.attempt !== 'object' || candidate.attempt === null) {
    return false;
  }
  if (Array.isArray(candidate.attempt)) {
    return false;
  }
  return Object.entries(candidate.attempt).every(
    ([stage, value]) => isSeededStage(stage) && isNonNegativeInt(value),
  );
}

export function createSeed(root: number): SpecSeed {
  if (!isNonNegativeInt(root) || root > SEED_ROOT_MAX) {
    throw new RangeError(`시드 root 는 0 이상 ${SEED_ROOT_MAX} 이하의 정수여야 합니다: ${root}`);
  }
  return { root, attempt: {} };
}

/**
 * 사용자가 "다시 생성"을 누른 스테이지의 `attempt` 만 올린다. 원본을 바꾸지 않는다 —
 * 스펙은 영구 저장물이라 제자리 수정이 과거 산출물의 재현을 깨뜨린다.
 */
export function bumpAttempt(seed: SpecSeed, stage: SeededStage): SpecSeed {
  return {
    root: seed.root,
    attempt: { ...seed.attempt, [stage]: (seed.attempt[stage] ?? 0) + 1 },
  };
}

/** 빠진 스테이지를 0 으로 채운 완전한 `attempt`. 워커의 `parse_seed` 와 같은 규칙이다. */
export function resolveAttempts(seed: SpecSeed): Record<SeededStage, number> {
  return Object.fromEntries(
    SEEDED_STAGES.map((stage) => [stage, seed.attempt[stage] ?? 0]),
  ) as Record<SeededStage, number>;
}
