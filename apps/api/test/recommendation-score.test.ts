/**
 * 규칙 기반 슬롯 배정. DB·인프라 없이 도는 순수 함수 테스트다.
 *
 * 여기서 고정하는 것은 "어떤 스냅이 뽑히는가"가 아니라 **규칙이 무엇을 보장하는가**다.
 *   - 키워드가 하나도 맞지 않아도 시간순 배치보다 나빠지지 않는다 (안전망)
 *   - 못 쓸 스냅은 슬롯을 채우지 않는다
 *   - 같은 입력이면 같은 배정이 나온다
 *
 * 결정: docs/decisions/template-snap-recommendation.md §7
 */
import { describe, it, expect } from 'vitest';
import {
  assignSlots,
  parseMatchHints,
  scorePair,
  SCORE_WEIGHTS,
  type CandidateAnalysis,
  type ScoringCandidate,
  type ScoringSlot,
} from '../src/services/recommendation/score-slots.js';

function analysis(over: Partial<CandidateAnalysis> = {}): CandidateAnalysis {
  return {
    topics: [],
    places: [],
    objects: [],
    actions: [],
    visualQualityScore: 0.8,
    usableForEdit: true,
    confidence: 0.9,
    ...over,
  };
}

function candidate(videoId: string, index: number, over?: Partial<CandidateAnalysis>) {
  return { videoId, index, analysis: analysis(over) } satisfies ScoringCandidate;
}

/** 시간 사전값만 가진 슬롯 n개 — 현행(시간순) 배치와 같은 조건. */
function plainSlots(count: number): ScoringSlot[] {
  return Array.from({ length: count }, (_, position) => ({
    slotId: `s${position}`,
    position,
    hints: {},
  }));
}

describe('assignSlots', () => {
  it('힌트가 없으면 촬영 순서대로 채운다 — 현행 배치가 하한선이다', () => {
    const slots = plainSlots(3);
    const candidates = [candidate('a', 0), candidate('b', 1), candidate('c', 2)];

    const { slots: assigned } = assignSlots(slots, candidates);

    expect(assigned.map((s) => s.videoId)).toEqual(['a', 'b', 'c']);
  });

  it('키워드가 맞는 스냅을 시간 순서보다 앞세운다', () => {
    const slots: ScoringSlot[] = [
      { slotId: 'front', position: 0, hints: { objects: ['간판'], temporalPrior: 0 } },
      { slotId: 'drink', position: 1, hints: { objects: ['커피', '잔'], temporalPrior: 1 } },
    ];
    // 시간순으로는 커피가 먼저지만, 슬롯이 원하는 신호는 반대다.
    const candidates = [
      candidate('coffee', 0, { objects: ['커피', '케이크'] }),
      candidate('sign', 1, { objects: ['간판'] }),
    ];

    const { slots: assigned } = assignSlots(slots, candidates);

    expect(assigned.find((s) => s.slotId === 'front')?.videoId).toBe('sign');
    expect(assigned.find((s) => s.slotId === 'drink')?.videoId).toBe('coffee');
  });

  it('부분 문자열로 맞춘다 — 분석은 자유 문자열을 돌려준다', () => {
    const slot: ScoringSlot = { slotId: 'alley', position: 0, hints: { places: ['골목'] } };

    const score = scorePair(slot, 1, candidate('x', 0, { places: ['좁은 골목길'] }), 1);
    const noMatch = scorePair(slot, 1, candidate('y', 0, { places: ['해변'] }), 1);

    expect(score - noMatch).toBeCloseTo(SCORE_WEIGHTS.keyword, 5);
  });

  it('편집에 못 쓰는 스냅은 슬롯을 채우지 않고 이유와 함께 빠진다', () => {
    const slots = plainSlots(2);
    const candidates = [
      candidate('shaky', 0, { usableForEdit: false, visualQualityScore: 0.2 }),
      candidate('good', 1),
    ];

    const { slots: assigned, excluded } = assignSlots(slots, candidates);

    expect(assigned.map((s) => s.videoId)).toContain('good');
    expect(assigned.map((s) => s.videoId)).not.toContain('shaky');
    expect(excluded).toContainEqual({ videoId: 'shaky', reason: 'unusable' });
  });

  it('분석이 없는 후보는 analysis_failed 로 빠진다', () => {
    const slots = plainSlots(1);
    const candidates: ScoringCandidate[] = [{ videoId: 'nope', index: 0, analysis: null }];

    const { slots: assigned, excluded } = assignSlots(slots, candidates);

    expect(assigned[0]).toMatchObject({ videoId: null, score: null });
    expect(excluded).toEqual([{ videoId: 'nope', reason: 'analysis_failed' }]);
  });

  it('후보가 슬롯보다 적으면 남는 슬롯을 비워 둔다', () => {
    const { slots: assigned } = assignSlots(plainSlots(4), [candidate('a', 0), candidate('b', 1)]);

    expect(assigned.filter((s) => s.videoId === null)).toHaveLength(2);
  });

  it('슬롯보다 후보가 많으면 남은 후보는 no_match 다', () => {
    const { excluded } = assignSlots(plainSlots(1), [
      candidate('a', 0),
      candidate('b', 1),
      candidate('c', 2),
    ]);

    expect(excluded.map((e) => e.reason)).toEqual(['no_match', 'no_match']);
  });

  it('한 스냅이 두 슬롯을 차지하지 않는다', () => {
    const slots: ScoringSlot[] = [
      { slotId: 'a', position: 0, hints: { objects: ['커피'] } },
      { slotId: 'b', position: 1, hints: { objects: ['커피'] } },
    ];
    const candidates = [candidate('one', 0, { objects: ['커피'] }), candidate('two', 1)];

    const { slots: assigned } = assignSlots(slots, candidates);

    expect(new Set(assigned.map((s) => s.videoId))).toEqual(new Set(['one', 'two']));
  });

  it('같은 입력이면 같은 배정이 나온다 — 동점도 순서가 고정돼 있다', () => {
    const slots = plainSlots(3);
    const candidates = [candidate('a', 0), candidate('b', 1), candidate('c', 2)];

    const first = assignSlots(slots, candidates);
    const again = assignSlots(slots, candidates);

    expect(again).toEqual(first);
  });

  it('화질이 낮은 쪽이 같은 조건에서 밀린다', () => {
    const slots = plainSlots(1);
    const candidates = [
      candidate('blurry', 0, { visualQualityScore: 0.1 }),
      candidate('sharp', 0, { visualQualityScore: 1 }),
    ];

    const { slots: assigned } = assignSlots(slots, candidates);

    expect(assigned[0]).toMatchObject({ videoId: 'sharp' });
  });

  it('후보가 하나뿐이어도 시간 항이 무너지지 않는다', () => {
    const { slots: assigned } = assignSlots(plainSlots(1), [candidate('only', 0)]);

    expect(assigned[0]).toMatchObject({ videoId: 'only' });
    expect(assigned[0]?.score ?? 0).toBeGreaterThan(0);
  });
});

describe('parseMatchHints', () => {
  it('시드가 넣는 형태를 그대로 읽는다', () => {
    const hints = parseMatchHints({
      places: ['카페'],
      objects: ['메뉴판'],
      actions: [],
      topics: ['카페'],
      temporalPrior: 0.2,
    });

    expect(hints).toEqual({
      places: ['카페'],
      objects: ['메뉴판'],
      actions: [],
      topics: ['카페'],
      temporalPrior: 0.2,
    });
  });

  it('형태가 어긋난 힌트는 그 슬롯만 힌트 없이 돌게 한다', () => {
    // 한 행의 오타가 추천 전체를 무너뜨리면 안 된다.
    expect(parseMatchHints(null)).toEqual({});
    expect(parseMatchHints('nope')).toEqual({});
    expect(parseMatchHints({ places: 'cafe', temporalPrior: 'soon' })).toEqual({});
    expect(parseMatchHints({ places: ['카페', 3] })).toEqual({ places: ['카페'] });
  });

  it('temporalPrior 를 0~1 로 가둔다', () => {
    expect(parseMatchHints({ temporalPrior: 4 }).temporalPrior).toBe(1);
    expect(parseMatchHints({ temporalPrior: -2 }).temporalPrior).toBe(0);
  });
});
