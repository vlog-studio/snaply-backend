import { createHash } from 'node:crypto';

import {
  CUT_ROLES,
  DEFAULT_CUT_ROLE,
  MOVIE_CLIP_MAX,
  cutRolesAllowedAt,
  isCutRoleJudgeable,
  type CutRole,
  type StylePreset,
} from '@vlog-studio/shared-types';

/**
 * AI 편집 초안의 선택 단계(specs/movie.md MOV-21) — 넘겨받은 스냅 중 무엇을 쓰고, 어떤 순서로 놓고,
 * 컷마다 어느 구간을 자르는지. 규칙과 근거는 docs/decisions/edit-director.md, 절 번호는 그 문서의 것이다.
 *
 * **규칙과 시드로 고른다**(auto-edit-draft.md §3). 모델을 부르지 않고 DB 도 보지 않는 순수 함수다 —
 * 신호와 분석은 호출하는 쪽(`movie-draft.service.ts`)이 읽어 넘긴다. 같은 입력이면 같은 초안이다.
 */

/**
 * 워커의 `SIGNALS_VERSION`(apps/ai-worker/src/pipeline/snap_signals.py). 다른 방법으로 잰 신호와 문턱값을
 * 섞지 않도록 이 버전의 신호만 쓴다. 두 값이 어긋나면 `edit-director.test.ts` 가 잡는다.
 */
export const SIGNALS_VERSION = 1;

/**
 * 고르는 규칙의 버전. 규칙(문턱값·길이·격자)을 바꾸면 올린다 — 같은 요청을 24시간 재사용하는 창이 이 값을 키에 넣으므로,
 * 올리지 않으면 바뀐 규칙이 하루 동안 예전 제안에 가려진다.
 */
export const EDIT_DIRECTOR_VERSION = 3;

/**
 * 대표 프레임 수 — 워커의 `HASH_POSITIONS`(25·50·75%). 셋을 다 가진 스냅끼리만 중복을 잰다(§2.2). 두 값이 어긋나면
 * `edit-director.test.ts` 가 잡는다.
 */
export const FRAME_HASH_COUNT = 3;

/**
 * §2 의 문턱값 — **잠정값**이다. 실제 스냅의 분포로 다시 정한다(backlog A-11). 극단만 잡는 쪽으로 둔다:
 * 밤 외출은 스냅 전부가 어둡고, 흔들린 컷도 대개 쓸 만하다.
 */
export const DRAFT_THRESHOLDS = {
  /** 이보다 짧은 스냅은 뺀다(§2.1). */
  minDurationMs: 500,
  /** 평균 밝기(0~1)가 이보다 낮으면 거의 검은 화면이다. */
  darkBrightness: 0.06,
  /** 라플라시안 분산이 이보다 낮으면 초점이 전혀 맞지 않은 화면이다. 흐리게 만든 합성 클립이 1 안팎이다. */
  blurSharpness: 15,
  /** 대표 프레임 셋의 해시 거리 중앙값이 이 이하면 같은 장면이다(§2.2). 다른 장면은 30 안팎이다. */
  duplicateHashDistance: 10,
  /** 중복은 촬영 시각이 이만큼 안일 때만이다 — 비슷해 보이는 다른 장면을 지킨다. */
  duplicateWindowMs: 10 * 60 * 1000,
} as const;

/** §3 스타일별 컷 길이. */
export const CUT_LENGTHS: Record<StylePreset, { base: number; min: number; max: number; spare: number }> = {
  일상: { base: 2000, min: 1200, max: 3000, spare: 250 },
  감성: { base: 2800, min: 1800, max: 4000, spare: 400 },
  여행: { base: 1400, min: 800, max: 2000, spare: 250 },
};

/** §3 역할이 컷 길이를 조정한다. */
const ROLE_LENGTH_FACTOR: Partial<Record<CutRole, number>> = { hook: 0.75, closer: 1.25 };

/** §4 점수 가중치. */
const SCORE_WEIGHTS = { quality: 0.5, motion: 0.3, speech: 0.2 } as const;

/** §7 구간 창이 움직이는 단위이자 창이 놓이는 격자 — 앱의 트림 단위(`CutTrimStepSec`)와 같아야 한다. */
const WINDOW_STEP_MS = 100;

export interface DraftSignals {
  durationMs: number;
  stepMs: number;
  brightness: number;
  sharpness: number;
  frameHashes: string[];
  motion: number[];
  speech: Array<[number, number]>;
}

export interface DraftAnalysis {
  usableForEdit: boolean | null;
  visualQualityScore: number | null;
  hasPlaces: boolean;
  hasObjects: boolean;
  hasActions: boolean;
}

export interface DraftCandidate {
  /** 업로드된 스냅이면 videoId, 아니면 앱의 localId. */
  key: string;
  uploaded: boolean;
  capturedAt: number;
  /** 이 버전의 신호. 없으면 검사 없이 들어간다(§1). */
  signals: DraftSignals | null;
  analysis: DraftAnalysis | null;
}

export interface DraftCut {
  key: string;
  role: CutRole;
  /** 구간이 없으면 스냅 전체다. */
  startMs?: number;
  endMs?: number;
}

export interface DraftResult {
  cuts: DraftCut[];
  /** 넣지 않은 스냅의 key, 촬영순. 업로드되지 않은 스냅은 검사 없는 스냅이 10개를 넘을 때만 빠진다. */
  excluded: string[];
}

interface Scored {
  candidate: DraftCandidate;
  /** 넘긴 순서 — 같은 촬영 시각을 가르는 마지막 기준. */
  index: number;
  score: number;
  quality: number;
  motionMean: number;
}

/** 재현을 위한 시드의 뿌리 — 사용자와 넘긴 스냅 집합(§8). 같은 스냅을 다시 넘기면 같은 초안이다. */
export function draftSeedRoot(userId: string, keys: readonly string[]): string {
  return createHash('sha256').update(`${userId}\n${[...new Set(keys)].sort().join(',')}`).digest('hex');
}

/** [0, 1) 균등값. 규약은 전환 디렉터와 같다 — sha256 상위 8바이트, 빅엔디언. */
function unit(root: string, key: string): number {
  const top = createHash('sha256').update(`${root}:edit-director:0:${key}`).digest().readBigUInt64BE(0);
  return Number(top >> 11n) / 2 ** 53;
}

function hashDistance(left: string, right: string): number {
  let bits = BigInt(`0x${left}`) ^ BigInt(`0x${right}`);
  let count = 0;
  while (bits > 0n) {
    count += Number(bits & 1n);
    bits >>= 1n;
  }
  return count;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** 넘긴 스냅 안에서 0~1 로 맞춘다. 모두 같으면 0.5. */
function normalizer(values: number[]): (value: number) => number {
  const min = Math.min(...values);
  const max = Math.max(...values);
  return (value) => (max > min ? (value - min) / (max - min) : 0.5);
}

function isDuplicate(left: Scored, right: Scored): boolean {
  const a = left.candidate.signals!;
  const b = right.candidate.signals!;
  if (Math.abs(left.candidate.capturedAt - right.candidate.capturedAt) > DRAFT_THRESHOLDS.duplicateWindowMs) {
    return false;
  }
  // 셋을 다 가진 스냅끼리만 잰다. 위치가 빠진 목록(이 규칙 전에 저장한 신호에 있다)을 인덱스끼리 비교하면
  // 다른 위치의 프레임끼리 잰다 — 그런 스냅은 해시가 없는 스냅처럼 중복 검사에서 빠진다.
  if (a.frameHashes.length !== FRAME_HASH_COUNT || b.frameHashes.length !== FRAME_HASH_COUNT) return false;
  const distances = a.frameHashes.map((hash, i) => hashDistance(hash, b.frameHashes[i]!));
  return median(distances) <= DRAFT_THRESHOLDS.duplicateHashDistance;
}

function byCapture(left: Scored, right: Scored): number {
  return left.candidate.capturedAt - right.candidate.capturedAt || left.index - right.index;
}

/** 점수가 높은 쪽. 같으면 시드로(§4). */
function better(root: string) {
  return (left: Scored, right: Scored): Scored => {
    if (left.score !== right.score) return left.score > right.score ? left : right;
    return unit(root, left.candidate.key) >= unit(root, right.candidate.key) ? left : right;
  };
}

/** 촬영순 목록을 `count` 개의 연속한 묶음으로 — 크기 차이는 1 이하, 큰 묶음이 앞(§4). */
function buckets<T>(items: T[], count: number): T[][] {
  const groups: T[][] = [];
  const size = Math.floor(items.length / count);
  const larger = items.length % count;
  let offset = 0;
  for (let i = 0; i < count; i += 1) {
    const length = size + (i < larger ? 1 : 0);
    groups.push(items.slice(offset, offset + length));
    offset += length;
  }
  return groups;
}

/** §2.1 거르기. 짧은 스냅은 한도 없이, 나머지는 넘긴 스냅의 절반까지만 뺀다. */
function gate(examined: Scored[], handed: number): { kept: Scored[]; dropped: Scored[] } {
  const short = examined.filter((item) => item.candidate.signals!.durationMs < DRAFT_THRESHOLDS.minDurationMs);
  const rest = examined.filter((item) => !short.includes(item));
  const bad = rest
    .filter((item) => {
      const signals = item.candidate.signals!;
      return (
        signals.brightness < DRAFT_THRESHOLDS.darkBrightness ||
        signals.sharpness < DRAFT_THRESHOLDS.blurSharpness ||
        item.candidate.analysis?.usableForEdit === false
      );
    })
    .sort((left, right) => left.quality - right.quality || left.index - right.index)
    .slice(0, Math.floor(handed / 2));
  return {
    kept: rest.filter((item) => !bad.includes(item)),
    dropped: [...short, ...bad],
  };
}

/** §2.2 중복. 연쇄로 묶고 묶음마다 점수가 가장 높은 하나(같으면 먼저 찍은 것)를 남긴다. */
function dedupe(items: Scored[]): { kept: Scored[]; dropped: Scored[] } {
  const parent = items.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      if (isDuplicate(items[i]!, items[j]!)) parent[find(j)] = find(i);
    }
  }
  const groups = new Map<number, Scored[]>();
  items.forEach((item, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), item]));
  const kept: Scored[] = [];
  for (const group of groups.values()) {
    kept.push(
      group.reduce((best, item) =>
        item.score > best.score || (item.score === best.score && byCapture(item, best) < 0) ? item : best,
      ),
    );
  }
  return { kept, dropped: items.filter((item) => !kept.includes(item)) };
}

/** §6 역할. 첫·마지막 자리는 사전이 정하고, 가운데는 판단할 수 있는 역할 중 신호가 맞는 것. */
function roleFor(item: Scored, index: number, count: number, busy: ReadonlySet<Scored>): CutRole {
  const allowed = cutRolesAllowedAt(index, count);
  if (allowed.length === 1) return allowed[0]!;
  const analysis = item.candidate.analysis;
  const sources = analysis ? (['capture', 'local', 'analysis'] as const) : (['capture', 'local'] as const);
  const matches: Record<CutRole, boolean> = {
    hook: false,
    closer: false,
    establish: analysis?.hasPlaces ?? false,
    detail: analysis?.hasObjects ?? false,
    action: (analysis?.hasActions ?? false) || busy.has(item),
    people: false,
    body: false,
  };
  return (
    CUT_ROLES.find(
      (role) => allowed.includes(role) && role !== DEFAULT_CUT_ROLE && isCutRoleJudgeable(role, sources) && matches[role],
    ) ?? DEFAULT_CUT_ROLE
  );
}

/** §3·§7 구간. 스냅이 범위 최솟값 이하이면 전체(구간 없음). */
export function chooseRange(
  signals: DraftSignals,
  stylePreset: StylePreset,
  role: CutRole,
): { startMs: number; endMs: number } | null {
  const lengths = CUT_LENGTHS[stylePreset];
  const duration = signals.durationMs;
  if (duration <= lengths.min) return null;

  // 창은 앱의 트림 격자(`CutTrimStepSec`, 100ms) 위에 놓는다. 격자 밖이면 사용자가 한쪽 핸들을 처음 끌 때
  // 다른 끝도 격자에 맞춰 움직여, 건드리지 않은 끝이 바뀐다(2026-10-01 Galaxy 에서 2750 → 2800 을 봤다).
  const down = (ms: number) => Math.floor(ms / WINDOW_STEP_MS) * WINDOW_STEP_MS;
  const up = (ms: number) => Math.ceil(ms / WINDOW_STEP_MS) * WINDOW_STEP_MS;
  const usable = down(duration);

  const wanted = down(lengths.base * (ROLE_LENGTH_FACTOR[role] ?? 1));
  let length = Math.min(lengths.max, Math.max(lengths.min, wanted));
  let spare = lengths.spare;
  // 길이를 먼저 줄이고, 그다음 여분을 앞뒤 똑같이 줄인다.
  if (length + 2 * spare > usable) length = Math.max(lengths.min, down(usable - 2 * spare));
  if (length + 2 * spare > usable) spare = (usable - length) / 2;
  // 격자 위의 여분 — 자리가 남으면 올려서, 모자라면 내려서.
  let low = up(spare);
  let high = usable - up(spare);
  if (high - low < length) {
    low = down(spare);
    high = usable - down(spare);
  }

  // 발화를 자르지 않는다 — 가장 긴 발화 하나를 통째로, 안 되면 그 시작을 담는다. 창의 끝은 격자 위에 있으므로
  // 발화를 덮는 격자 구간 [down(시작), up(끝)] 으로 따진다 — 발화 길이로 따지면 끝점이 격자 밖일 때 담는 창이 없다.
  let contains: ((start: number, end: number) => boolean) | null = null;
  const speech = [...signals.speech]
    .map(([start, end]) => [Math.max(0, start), Math.min(duration, end)] as const)
    .filter(([start, end]) => end > start)
    .sort((left, right) => right[1] - right[0] - (left[1] - left[0]) || left[0] - right[0])[0];
  if (speech !== undefined && speech[0] < high) {
    const [speechStart, speechEnd] = speech;
    const head = down(speechStart);
    const tail = up(speechEnd);
    // 앞 여분 안에서 시작한 발화는 그 컷만 앞 여분을 발화 시작까지 줄인다 — 말의 첫머리가 잘리는 것이
    // 전환이 겹치지 못하는 것보다 어색하다(§7). 뒤 여분은 줄이지 않는다: 끝이 잘리는 것은 받아들인다.
    low = Math.min(low, head);
    if (tail <= high && tail - head <= Math.min(lengths.max, high - low)) {
      length = Math.max(length, tail - head);
      contains = (start, end) => start <= speechStart && end >= speechEnd;
    } else {
      contains = (start, end) => start <= speechStart && end > speechStart;
    }
  }

  const starts: number[] = [];
  for (let start = low; start + length <= high; start += WINDOW_STEP_MS) starts.push(start);
  if (starts.length === 0) starts.push(Math.max(0, down((usable - length) / 2)));
  const allowed = contains === null ? starts : starts.filter((start) => contains!(start, start + length));
  const candidates = allowed.length > 0 ? allowed : starts;

  // 창에 걸친 만큼만 센다 — 반만 걸친 칸을 통째로 세면 움직임을 잘라 먹는 창이 이긴다.
  const motionOver = (start: number): number => {
    const step = signals.stepMs;
    const end = start + length;
    let sum = 0;
    for (let i = Math.floor(start / step); i < Math.ceil(end / step); i += 1) {
      const overlap = Math.min(end, (i + 1) * step) - Math.max(start, i * step);
      sum += ((signals.motion[i] ?? 0) * Math.max(0, overlap)) / step;
    }
    return sum;
  };
  const center = duration / 2;
  const hasMotion = signals.motion.some((value) => value > 0);
  const best = candidates.reduce((pick, start) => {
    const gain = hasMotion ? motionOver(start) - motionOver(pick) : 0;
    if (gain > 1e-9) return start;
    if (gain < -1e-9) return pick;
    return Math.abs(start + length / 2 - center) < Math.abs(pick + length / 2 - center) ? start : pick;
  });
  return { startMs: best, endMs: best + length };
}

/** 넘긴 스냅으로 초안을 만든다(§1 의 여섯 단계). */
export function directDraft(params: {
  seedRoot: string;
  stylePreset: StylePreset;
  candidates: DraftCandidate[];
}): DraftResult {
  const examinedCandidates = params.candidates.filter((c) => c.uploaded && c.signals !== null);
  const qualityOf = normalizer(examinedCandidates.map((c) => Math.log1p(c.signals!.sharpness)));
  const motionOf = normalizer(examinedCandidates.map((c) => mean(c.signals!.motion)));

  const all: Scored[] = params.candidates.map((candidate, index) => {
    if (!candidate.uploaded || candidate.signals === null) {
      return { candidate, index, score: 0, quality: 0, motionMean: 0 };
    }
    const signals = candidate.signals;
    const local = qualityOf(Math.log1p(signals.sharpness));
    const vision = candidate.analysis?.visualQualityScore;
    const quality = vision === null || vision === undefined ? local : (local + Math.min(1, Math.max(0, vision))) / 2;
    const motionMean = mean(signals.motion);
    const score =
      SCORE_WEIGHTS.quality * quality +
      SCORE_WEIGHTS.motion * motionOf(motionMean) +
      SCORE_WEIGHTS.speech * (signals.speech.length > 0 ? 1 : 0);
    return { candidate, index, score, quality, motionMean };
  });

  // 업로드되지 않았거나 신호가 없는 스냅은 검사 없이 들어가 자리를 먼저 차지한다(§1·§4).
  const fixed = all.filter((item) => !item.candidate.uploaded || item.candidate.signals === null).sort(byCapture);
  const examined = all.filter((item) => !fixed.includes(item));

  const gated = gate(examined, params.candidates.length);
  const unique = dedupe(gated.kept);
  let pool = unique.kept.sort(byCapture);
  const excluded = [...gated.dropped, ...unique.dropped];

  // 컷은 하나 이상 남는다(MOV-5). 모두 빠지면 화질이 가장 좋은 하나를 되살린다.
  if (fixed.length === 0 && pool.length === 0 && examined.length > 0) {
    const revived = examined.reduce((best, item) => (item.quality > best.quality ? item : best));
    pool = [revived];
    excluded.splice(excluded.indexOf(revived), 1);
  }

  let chosen: Scored[];
  if (fixed.length >= MOVIE_CLIP_MAX) {
    // 검사 없는 스냅만으로 넘친다 — 그것들끼리 나눠 고르고 먼저 찍은 것이 이긴다.
    const picked = buckets(fixed, MOVIE_CLIP_MAX).map((group) => group[0]!);
    excluded.push(...fixed.filter((item) => !picked.includes(item)), ...pool);
    chosen = picked;
  } else {
    const slots = MOVIE_CLIP_MAX - fixed.length;
    let picked = pool;
    if (pool.length > slots) {
      const pick = better(params.seedRoot);
      picked = buckets(pool, slots).map((group) => group.reduce(pick));
      excluded.push(...pool.filter((item) => !picked.includes(item)));
    }
    chosen = [...fixed, ...picked];
  }
  chosen.sort(byCapture);

  // 고른 컷 중 움직임 상위 25%(순위로, 적어도 하나)가 `action` 이다(§6). 중앙값보다 커야 한다 — 모두 고르면 아무도 아니다.
  const examinedChosen = chosen.filter((item) => item.candidate.signals !== null);
  const motionMedian = examinedChosen.length === 0 ? 0 : median(examinedChosen.map((item) => item.motionMean));
  const busy = new Set(
    [...examinedChosen]
      .sort((left, right) => right.motionMean - left.motionMean || left.index - right.index)
      .slice(0, Math.max(1, Math.round(examinedChosen.length / 4)))
      .filter((item) => item.motionMean > motionMedian),
  );

  const cuts = chosen.map((item, index): DraftCut => {
    const role = roleFor(item, index, chosen.length, busy);
    const signals = item.candidate.signals;
    const range = item.candidate.uploaded && signals !== null ? chooseRange(signals, params.stylePreset, role) : null;
    return { key: item.candidate.key, role, ...(range ?? {}) };
  });

  return {
    cuts,
    excluded: excluded.sort(byCapture).map((item) => item.candidate.key),
  };
}
