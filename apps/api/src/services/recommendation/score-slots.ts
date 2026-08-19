/**
 * 템플릿 슬롯에 후보 스냅을 배정하는 규칙 기반 점수화.
 *
 * **순수 함수다.** DB·시각·난수를 읽지 않으므로 같은 입력이면 항상 같은 배정이 나오고,
 * 가중치를 만졌을 때 무엇이 달라지는지 테스트가 잡는다. 추천 경로에 모델 호출을 하나 더
 * 얹지 않은 이유는 docs/decisions/template-snap-recommendation.md §7.
 *
 * 슬롯 이름은 사람에게 주는 촬영 지시이지 스냅 내용에 대한 주장이 아니다. 그래서 여기서
 * 계산하는 점수도 "이 스냅이 골목이다"가 아니라 **"이 슬롯 자리에 이 스냅을 놓는 게 낫다"**는
 * 상대 순위다.
 */

/** 슬롯이 원하는 신호. `movie_template_slots.match_hints` 의 형태이며 전부 선택이다. */
export interface SlotMatchHints {
  places?: string[];
  objects?: string[];
  actions?: string[];
  topics?: string[];
  /** 외출 안에서의 정규화 위치(0=시작, 1=끝). 없으면 슬롯 순서에서 유도한다. */
  temporalPrior?: number;
}

export interface ScoringSlot {
  slotId: string;
  position: number;
  hints: SlotMatchHints;
}

/** 점수화가 분석 결과에서 실제로 읽는 것. 요약·분위기는 쓰지 않는다. */
export interface CandidateAnalysis {
  topics: string[];
  places: string[];
  objects: string[];
  actions: string[];
  visualQualityScore: number | null;
  usableForEdit: boolean | null;
  confidence: number | null;
}

export interface ScoringCandidate {
  videoId: string;
  /** 후보 배열에서의 위치. 앱이 촬영 시간 오름차순으로 보낸다. */
  index: number;
  /** 분석이 없거나 실패했으면 null. */
  analysis: CandidateAnalysis | null;
}

export interface SlotAssignment {
  slotId: string;
  position: number;
  videoId: string | null;
  score: number | null;
}

export type ExclusionReason = 'unusable' | 'analysis_failed' | 'no_match';

export interface ExcludedCandidate {
  videoId: string;
  reason: ExclusionReason;
}

export interface SlotAssignmentResult {
  slots: SlotAssignment[];
  excluded: ExcludedCandidate[];
}

/**
 * 가중치. 합이 1이다.
 *
 * `temporal` 이 살아 있는 한 **키워드가 하나도 맞지 않아도 결과가 현행 시간순 배치보다
 * 나빠지지 않는다.** 이게 규칙 기반으로 시작할 수 있는 근거이므로, 이 항을 0으로 만드는
 * 조정은 그 안전망을 걷어내는 것과 같다.
 */
export const SCORE_WEIGHTS = {
  keyword: 0.5,
  quality: 0.2,
  temporal: 0.2,
  confidence: 0.1,
} as const;

/** 분석이 값을 주지 않았을 때 쓰는 중립값. 없다는 것이 나쁘다는 뜻은 아니다. */
const NEUTRAL = 0.5;

const HINT_FIELDS = ['places', 'objects', 'actions', 'topics'] as const;

/**
 * jsonb 를 방어적으로 읽는다. 힌트는 시드가 넣지만, 형태가 어긋난 한 행이 추천 전체를
 * 무너뜨리는 것보다 그 슬롯만 힌트 없이 도는 편이 낫다.
 */
export function parseMatchHints(raw: unknown): SlotMatchHints {
  if (typeof raw !== 'object' || raw === null) return {};
  const source = raw as Record<string, unknown>;
  const hints: SlotMatchHints = {};
  for (const field of HINT_FIELDS) {
    const value = source[field];
    if (Array.isArray(value)) {
      hints[field] = value.filter((item): item is string => typeof item === 'string');
    }
  }
  const prior = source.temporalPrior;
  if (typeof prior === 'number' && Number.isFinite(prior)) {
    hints.temporalPrior = Math.min(1, Math.max(0, prior));
  }
  return hints;
}

/**
 * 힌트 한 조각이 분석 결과의 같은 이름 필드에 나타나는가.
 *
 * 형태소 분석 없이 양방향 부분 문자열로 본다 — 분석은 한국어 자유 문자열을 돌려주므로
 * `골목` 힌트는 `좁은 골목길` 에도 맞아야 하고, `카페` 값은 `카페 외관` 힌트에도 맞아야 한다.
 */
function matchesAny(hint: string, values: readonly string[]): boolean {
  const needle = hint.trim();
  if (needle.length === 0) return false;
  return values.some((value) => {
    const hay = value.trim();
    return hay.length > 0 && (hay.includes(needle) || needle.includes(hay));
  });
}

/** 맞은 힌트 조각의 비율. 힌트가 없는 슬롯은 0 이고, 시간·화질로만 배정된다. */
function keywordScore(hints: SlotMatchHints, analysis: CandidateAnalysis): number {
  let total = 0;
  let matched = 0;
  for (const field of HINT_FIELDS) {
    const wanted = hints[field] ?? [];
    for (const hint of wanted) {
      total += 1;
      if (matchesAny(hint, analysis[field])) matched += 1;
    }
  }
  return total === 0 ? 0 : matched / total;
}

/** 슬롯이 기대하는 위치와 스냅이 실제로 찍힌 위치가 얼마나 가까운가. */
function temporalScore(prior: number, candidateIndex: number, candidateCount: number): number {
  const position = candidateCount <= 1 ? 0 : candidateIndex / (candidateCount - 1);
  return 1 - Math.abs(position - prior);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** 한 (슬롯, 후보) 쌍의 점수. 0~1. */
export function scorePair(
  slot: ScoringSlot,
  slotCount: number,
  candidate: ScoringCandidate,
  candidateCount: number,
): number {
  const analysis = candidate.analysis;
  if (!analysis) return 0;

  const prior =
    slot.hints.temporalPrior ?? (slotCount <= 1 ? 0 : slot.position / (slotCount - 1));

  const score =
    SCORE_WEIGHTS.keyword * keywordScore(slot.hints, analysis) +
    SCORE_WEIGHTS.quality * clamp01(analysis.visualQualityScore ?? NEUTRAL) +
    SCORE_WEIGHTS.temporal * temporalScore(prior, candidate.index, candidateCount) +
    SCORE_WEIGHTS.confidence * clamp01(analysis.confidence ?? NEUTRAL);

  return clamp01(score);
}

/**
 * 슬롯에 후보를 배정한다. 슬롯 하나에 스냅 하나, 스냅 하나는 슬롯 하나.
 *
 * 점수 내림차순 greedy 다. 최적 배정(헝가리안)이 아니라는 것을 알고 고른 것이다 — 후보가
 * 12개 이하이고 점수가 촘촘하지 않아 차이가 거의 없는데, 결과를 사람이 눈으로 따라갈 수
 * 있다는 이점이 크다.
 *
 * 남는 슬롯은 **비운다.** 못 쓸 스냅으로 채우는 것보다 빈 슬롯과 `지금 찍기` 가 정직하고,
 * 템플릿 화면은 원래 그 경우를 위해 설계됐다.
 */
export function assignSlots(
  slots: readonly ScoringSlot[],
  candidates: readonly ScoringCandidate[],
): SlotAssignmentResult {
  const orderedSlots = [...slots].sort((a, b) => a.position - b.position);
  const excluded: ExcludedCandidate[] = [];
  const usable: ScoringCandidate[] = [];

  for (const candidate of candidates) {
    if (!candidate.analysis) {
      excluded.push({ videoId: candidate.videoId, reason: 'analysis_failed' });
    } else if (candidate.analysis.usableForEdit === false) {
      // 분석이 "편집에 못 쓴다"고 판단한 스냅. 흔들렸거나 어둡거나 초점이 나갔다.
      excluded.push({ videoId: candidate.videoId, reason: 'unusable' });
    } else {
      usable.push(candidate);
    }
  }

  const pairs = orderedSlots.flatMap((slot) =>
    usable.map((candidate) => ({
      slot,
      candidate,
      score: scorePair(slot, orderedSlots.length, candidate, candidates.length),
    })),
  );

  // 동점의 순서까지 고정한다 — 같은 입력이 같은 배정을 내야 회귀를 잡을 수 있다.
  pairs.sort(
    (a, b) =>
      b.score - a.score ||
      a.candidate.index - b.candidate.index ||
      a.slot.position - b.slot.position,
  );

  const takenSlots = new Map<string, { videoId: string; score: number }>();
  const takenVideos = new Set<string>();
  for (const pair of pairs) {
    if (takenSlots.has(pair.slot.slotId) || takenVideos.has(pair.candidate.videoId)) continue;
    takenSlots.set(pair.slot.slotId, {
      videoId: pair.candidate.videoId,
      score: pair.score,
    });
    takenVideos.add(pair.candidate.videoId);
  }

  for (const candidate of usable) {
    // 슬롯보다 후보가 많으면 남는다. 버린 게 아니라 자리가 없었던 것이다.
    if (!takenVideos.has(candidate.videoId)) {
      excluded.push({ videoId: candidate.videoId, reason: 'no_match' });
    }
  }

  return {
    slots: orderedSlots.map((slot) => {
      const taken = takenSlots.get(slot.slotId);
      return {
        slotId: slot.slotId,
        position: slot.position,
        videoId: taken?.videoId ?? null,
        score: taken ? Math.round(taken.score * 1000) / 1000 : null,
      };
    }),
    excluded,
  };
}
