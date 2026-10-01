/**
 * AI 편집 초안의 선택 규칙(docs/decisions/edit-director.md). 절 번호는 그 문서의 것이다.
 *
 * DB·Redis 를 쓰지 않는 순수 검사다. 문턱값은 잠정값이라 경계값을 박지 않고 `DRAFT_THRESHOLDS` 에서 읽는다.
 */
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CUT_LENGTHS,
  DRAFT_THRESHOLDS,
  SIGNALS_VERSION,
  chooseRange,
  directDraft,
  draftSeedRoot,
  type DraftCandidate,
  type DraftSignals,
} from '../src/services/edit-director.js';

const REPO = fileURLToPath(new URL('../../..', import.meta.url));
const T0 = Date.parse('2026-10-01T09:00:00Z');
const MINUTE = 60_000;

function signals(overrides: Partial<DraftSignals> = {}): DraftSignals {
  return {
    durationMs: 3000,
    stepMs: 100,
    brightness: 0.5,
    sharpness: 300,
    frameHashes: ['0000000000000000', '0000000000000000', '0000000000000000'],
    motion: Array.from({ length: 29 }, () => 0.01),
    speech: [],
    ...overrides,
  };
}

/** 장면마다 다른 해시 — sha256 에서 뽑아 서로 다른 장면끼리는 중복 문턱값과 멀다(22개 사이 최소 거리 21). */
function sceneHash(i: number): string[] {
  const value = createHash('sha256').update(`scene-${i}`).digest('hex').slice(0, 16);
  return [value, value, value];
}

function snap(key: string, minute: number, overrides: Partial<DraftSignals> = {}, index = minute): DraftCandidate {
  return {
    key,
    uploaded: true,
    capturedAt: T0 + minute * MINUTE,
    signals: signals({ frameHashes: sceneHash(index), ...overrides }),
    analysis: null,
  };
}

function pending(key: string, minute: number): DraftCandidate {
  return { key, uploaded: false, capturedAt: T0 + minute * MINUTE, signals: null, analysis: null };
}

function draft(candidates: DraftCandidate[], stylePreset: '일상' | '감성' | '여행' = '일상') {
  return directDraft({ seedRoot: draftSeedRoot('user-1', candidates.map((c) => c.key)), stylePreset, candidates });
}

const keysOf = (result: ReturnType<typeof draft>) => result.cuts.map((cut) => cut.key);

describe('신호 버전', () => {
  it('워커의 SIGNALS_VERSION 과 같다 — 다르면 다른 방법으로 잰 신호에 같은 문턱값을 쓰게 된다', () => {
    const source = readFileSync(join(REPO, 'apps/ai-worker/src/pipeline/snap_signals.py'), 'utf-8');
    expect(Number(/^SIGNALS_VERSION = (\d+)$/m.exec(source)?.[1])).toBe(SIGNALS_VERSION);
  });
});

describe('§4·§5 컷 수와 순서', () => {
  it('넘긴 것을 모두 쓰고 촬영순으로 놓는다', () => {
    const result = draft([snap('c', 20), snap('a', 0), snap('b', 10)]);
    expect(keysOf(result)).toEqual(['a', 'b', 'c']);
    expect(result.excluded).toEqual([]);
  });

  it('스냅 하나면 컷 하나이고 역할은 hook 이다', () => {
    const result = draft([snap('a', 0)]);
    expect(result.cuts).toEqual([expect.objectContaining({ key: 'a', role: 'hook' })]);
  });

  it('10을 넘으면 촬영 흐름을 10묶음으로 나눠 묶음마다 점수가 높은 것을 고른다', () => {
    // 20개 → 묶음 10개, 두 개씩. 둘째(홀수 분) 스냅이 더 선명하다.
    const snaps = Array.from({ length: 20 }, (_, i) => snap(`s${i}`, i, { sharpness: i % 2 === 1 ? 900 : 100 }));
    const result = draft(snaps);
    expect(keysOf(result)).toEqual(Array.from({ length: 10 }, (_, i) => `s${i * 2 + 1}`));
    expect(result.excluded).toHaveLength(10);
  });

  it('같은 입력은 같은 초안이다 — 점수가 같으면 시드로 가른다', () => {
    const snaps = Array.from({ length: 14 }, (_, i) => snap(`s${i}`, i));
    expect(draft(snaps)).toEqual(draft([...snaps].reverse()));
  });
});

describe('§2.1 거르기', () => {
  it('거의 검은 화면 · 초점이 전혀 맞지 않은 화면 · 너무 짧은 스냅을 뺀다', () => {
    const result = draft([
      snap('ok-1', 0),
      snap('dark', 1, { brightness: DRAFT_THRESHOLDS.darkBrightness / 2 }),
      snap('ok-2', 2),
      snap('blur', 3, { sharpness: DRAFT_THRESHOLDS.blurSharpness / 2 }),
      snap('short', 4, { durationMs: DRAFT_THRESHOLDS.minDurationMs - 100 }),
      snap('ok-3', 5),
    ]);
    expect(keysOf(result)).toEqual(['ok-1', 'ok-2', 'ok-3']);
    expect(result.excluded).toEqual(['dark', 'blur', 'short']);
  });

  it('분석이 쓸 수 없다고 한 스냅도 뺀다', () => {
    const unusable = { ...snap('bad', 1), analysis: { usableForEdit: false, visualQualityScore: 0.1, hasPlaces: false, hasObjects: false, hasActions: false } };
    expect(draft([snap('a', 0), unusable, snap('b', 2)]).excluded).toEqual(['bad']);
  });

  it('넘긴 스냅의 절반을 넘게 빼지 않는다 — 밤 외출이 통째로 빠지지 않게', () => {
    const dark = DRAFT_THRESHOLDS.darkBrightness / 2;
    const result = draft([
      snap('n1', 0, { brightness: dark, sharpness: 50 }),
      snap('n2', 1, { brightness: dark, sharpness: 400 }),
      snap('n3', 2, { brightness: dark, sharpness: 100 }),
      snap('n4', 3, { brightness: dark, sharpness: 800 }),
    ]);
    // 화질이 나쁜 쪽부터 절반(2개)만 뺀다.
    expect(result.excluded).toEqual(['n1', 'n3']);
    expect(keysOf(result)).toEqual(['n2', 'n4']);
  });

  it('모두 빠지면 화질이 가장 좋은 하나를 남긴다 — 컷은 하나 이상이다', () => {
    const short = DRAFT_THRESHOLDS.minDurationMs - 100;
    const result = draft([snap('a', 0, { durationMs: short, sharpness: 100 }), snap('b', 1, { durationMs: short, sharpness: 500 })]);
    expect(keysOf(result)).toEqual(['b']);
    expect(result.excluded).toEqual(['a']);
  });
});

describe('§2.2 중복', () => {
  it('해시가 가깝고 10분 안이면 하나만 남긴다 — 선명한 쪽', () => {
    const same = sceneHash(7);
    const result = draft([
      snap('blurry-copy', 0, { frameHashes: same, sharpness: 40 }),
      snap('sharp-copy', 1, { frameHashes: same, sharpness: 800 }),
      snap('other', 2),
    ]);
    expect(keysOf(result)).toEqual(['sharp-copy', 'other']);
    expect(result.excluded).toEqual(['blurry-copy']);
  });

  it('비슷해 보여도 10분 넘게 떨어져 찍었으면 다른 장면이다', () => {
    const same = sceneHash(7);
    const gap = DRAFT_THRESHOLDS.duplicateWindowMs / MINUTE + 1;
    const result = draft([snap('a', 0, { frameHashes: same }), snap('b', gap, { frameHashes: same })]);
    expect(keysOf(result)).toEqual(['a', 'b']);
  });

  it('연쇄로 묶는다 — A≈B, B≈C 면 셋이 한 묶음', () => {
    // 이웃끼리는 문턱값 이내, 양 끝은 그 두 배.
    const step = DRAFT_THRESHOLDS.duplicateHashDistance;
    const bits = (n: number) => ((1n << BigInt(n)) - 1n).toString(16).padStart(16, '0');
    const hashes = (n: number) => [bits(n), bits(n), bits(n)];
    const result = draft([
      snap('a', 0, { frameHashes: hashes(0), sharpness: 100 }),
      snap('b', 1, { frameHashes: hashes(step), sharpness: 900 }),
      snap('c', 2, { frameHashes: hashes(step * 2), sharpness: 100 }),
    ]);
    expect(keysOf(result)).toEqual(['b']);
  });
});

describe('§1·§4 검사 없이 들어가는 스냅', () => {
  it('업로드되지 않은 스냅은 빼지 않고 촬영 시각 자리에 구간 없이 놓는다', () => {
    const result = draft([snap('a', 0), pending('local-1', 5), snap('b', 10)]);
    expect(result.cuts).toEqual([
      expect.objectContaining({ key: 'a' }),
      { key: 'local-1', role: 'body' },
      expect.objectContaining({ key: 'b' }),
    ]);
  });

  it('신호가 아직 없는 업로드된 스냅도 같다', () => {
    const noSignals: DraftCandidate = { ...snap('old', 5), signals: null };
    const result = draft([snap('a', 0), noSignals, snap('b', 10)]);
    expect(result.cuts[1]).toEqual({ key: 'old', role: 'body' });
  });

  it('자리를 먼저 차지하고, 남은 자리를 검사한 스냅 중에서 고른다', () => {
    const snaps = Array.from({ length: 12 }, (_, i) => snap(`s${i}`, i));
    const result = draft([...snaps, pending('p1', 3.5), pending('p2', 7.5), pending('p3', 11.5)]);
    expect(result.cuts).toHaveLength(10);
    expect(keysOf(result)).toEqual(expect.arrayContaining(['p1', 'p2', 'p3']));
    expect(result.excluded).toHaveLength(5);
    expect(result.excluded.every((key) => key.startsWith('s'))).toBe(true);
  });

  it('검사 없는 스냅만으로 10을 넘으면 그것들끼리 나눠 고르고 먼저 찍은 것이 이긴다', () => {
    const locals = Array.from({ length: 12 }, (_, i) => pending(`p${i}`, i));
    const result = draft([...locals, snap('uploaded', 5.5)]);
    // 12개 → 묶음 10개(앞의 둘이 두 개씩).
    expect(keysOf(result)).toEqual(['p0', 'p2', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'p10', 'p11']);
    expect(result.excluded).toEqual(['p1', 'p3', 'uploaded']);
  });
});

describe('§6 역할', () => {
  it('첫 컷 hook · 마지막 컷 closer · 가운데는 움직임이 큰 것만 action', () => {
    const result = draft([
      snap('a', 0),
      snap('busy', 1, { motion: Array.from({ length: 29 }, () => 0.2) }),
      snap('calm-1', 2),
      snap('calm-2', 3),
      snap('z', 4),
    ]);
    expect(result.cuts.map((cut) => cut.role)).toEqual(['hook', 'action', 'body', 'body', 'closer']);
  });

  it('분석이 있으면 places 가 establish 가 된다', () => {
    const place = {
      ...snap('place', 1),
      analysis: { usableForEdit: true, visualQualityScore: 0.8, hasPlaces: true, hasObjects: true, hasActions: false },
    };
    expect(draft([snap('a', 0), place, snap('z', 2)]).cuts[1]?.role).toBe('establish');
  });
});

describe('§3·§7 구간', () => {
  it('스타일의 길이와 앞뒤 여분 — 3초 감성은 길이를 줄여 여분 400 을 지킨다', () => {
    const range = chooseRange(signals({ motion: [] }), '감성', 'body');
    expect(range).not.toBeNull();
    expect(range!.endMs - range!.startMs).toBe(3000 - 2 * CUT_LENGTHS.감성.spare);
    expect(range!.startMs).toBe(CUT_LENGTHS.감성.spare);
  });

  it('역할이 길이를 바꾼다 — hook 은 짧고 closer 는 길다', () => {
    const long = signals({ durationMs: 5000, motion: [] });
    const lengthOf = (role: 'hook' | 'body' | 'closer') => {
      const range = chooseRange(long, '일상', role)!;
      return range.endMs - range.startMs;
    };
    expect(lengthOf('hook')).toBe(1500);
    expect(lengthOf('body')).toBe(2000);
    expect(lengthOf('closer')).toBe(2500);
  });

  it('범위 최솟값보다 짧은 스냅은 전체를 쓴다', () => {
    expect(chooseRange(signals({ durationMs: 1500 }), '감성', 'body')).toBeNull();
  });

  it('신호가 고르면 가운데, 움직임이 몰린 곳이 있으면 그 창', () => {
    const flat = chooseRange(signals({ durationMs: 5000, motion: Array(49).fill(0.01) }), '여행', 'body')!;
    // 창은 100ms 격자에서 움직이므로 가운데와 반 칸까지 어긋날 수 있다.
    expect(Math.abs(flat.startMs + (flat.endMs - flat.startMs) / 2 - 2500)).toBeLessThanOrEqual(50);

    const motion = Array(49).fill(0.01);
    for (let i = 38; i < 46; i += 1) motion[i] = 0.3; // 3.8~4.6초
    const busy = chooseRange(signals({ durationMs: 5000, motion }), '여행', 'body')!;
    expect(busy.startMs).toBeLessThanOrEqual(3800);
    expect(busy.endMs).toBeGreaterThanOrEqual(4600);
    expect(busy.endMs).toBeLessThanOrEqual(5000 - CUT_LENGTHS.여행.spare);
  });

  it('발화를 자르지 않는다 — 움직임이 다른 곳에 몰려 있어도', () => {
    const motion = Array(49).fill(0.01);
    for (let i = 40; i < 48; i += 1) motion[i] = 0.3;
    const range = chooseRange(signals({ durationMs: 5000, motion, speech: [[600, 2400]] }), '일상', 'body')!;
    expect(range.startMs).toBeLessThanOrEqual(600);
    expect(range.endMs).toBeGreaterThanOrEqual(2400);
  });

  it('발화를 담을 만큼 늘린다 — 범위 최댓값까지', () => {
    const range = chooseRange(signals({ durationMs: 5000, motion: [], speech: [[1000, 3800]] }), '일상', 'body')!;
    expect(range.endMs - range.startMs).toBe(2800);
    expect(range.startMs).toBeLessThanOrEqual(1000);
    expect(range.endMs).toBeGreaterThanOrEqual(3800);
  });

  it('너무 길어 못 담으면 발화의 시작을 담는다', () => {
    const range = chooseRange(signals({ durationMs: 5000, motion: [], speech: [[1500, 4700]] }), '여행', 'body')!;
    expect(range.startMs).toBeLessThanOrEqual(1500);
    expect(range.endMs).toBeGreaterThan(1500);
  });
});
