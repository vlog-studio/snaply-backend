/**
 * AI 가 경계마다 고르는 전환의 규칙(docs/decisions/transition-director.md).
 *
 * DB 를 쓰지 않는 순수 검사다.
 */
import { describe, expect, it } from 'vitest';
import { SCENE_GAP_MS, pickTransitions, type DirectorBoundary } from '../src/services/transition-director.js';

const BASE = Date.parse('2026-05-01T09:00:00Z');

/** 1분 간격으로 찍은 스냅 n 개를 순서대로 이은 경계들. */
function sameScene(n: number, prefix = 'v'): DirectorBoundary[] {
  return Array.from({ length: n - 1 }, (_, i) => ({
    fromVideoId: `${prefix}${i}`,
    toVideoId: `${prefix}${i + 1}`,
    fromCapturedAt: BASE + i * 60_000,
    toCapturedAt: BASE + (i + 1) * 60_000,
  }));
}

/** 서로 다른 무비 여러 편에서 같은 장면 경계의 선택을 모은다 — 분포를 보려고. */
function sample(stylePreset: '감성' | '여행' | '일상', movies = 400): string[] {
  return Array.from({ length: movies }, (_, m) =>
    pickTransitions({ movieId: `movie-${m}`, stylePreset, boundaries: sameScene(4) }).slice(1),
  )
    .flat()
    .map((transition) => transition.kind);
}

function share(kinds: string[], kind: string): number {
  return kinds.filter((k) => k === kind).length / kinds.length;
}

describe('같은 입력이면 같은 전환', () => {
  it('무비 id 와 컷이 같으면 언제나 같은 결과다', () => {
    const params = { movieId: 'm-1', stylePreset: '감성' as const, boundaries: sameScene(6) };
    expect(pickTransitions(params)).toEqual(pickTransitions(params));
  });

  it('다른 곳의 순서를 바꿔도 이어진 채 남은 두 컷의 전환은 그대로다 — 키는 위치가 아니라 두 컷이다', () => {
    const [ab, bc, cd] = sameScene(4);
    const before = pickTransitions({ movieId: 'm-2', stylePreset: '감성', boundaries: [ab!, bc!, cd!] });
    // a·b 를 뒤로 보낸다: c → d → a → b. a→b 경계는 위치가 바뀌었지만 같은 두 컷이다.
    const da = { fromVideoId: 'v3', toVideoId: 'v0', fromCapturedAt: cd!.toCapturedAt, toCapturedAt: ab!.fromCapturedAt };
    const after = pickTransitions({ movieId: 'm-2', stylePreset: '감성', boundaries: [cd!, da, ab!] });
    expect(after[2]).toEqual(before[0]);
    expect(after[0]).toEqual(before[2]);
  });

  it('같은 두 스냅이 두 번 이어져도 각자 뽑힌다(몇 번째인지가 키에 들어간다)', () => {
    const repeated: DirectorBoundary[] = [
      { fromVideoId: 'a', toVideoId: 'b', fromCapturedAt: BASE, toCapturedAt: BASE },
      { fromVideoId: 'b', toVideoId: 'a', fromCapturedAt: BASE, toCapturedAt: BASE },
      { fromVideoId: 'a', toVideoId: 'b', fromCapturedAt: BASE, toCapturedAt: BASE },
    ];
    const kinds = new Set<string>();
    for (let m = 0; m < 50; m++) {
      const [first, , third] = pickTransitions({ movieId: `m-${m}`, stylePreset: '감성', boundaries: repeated });
      kinds.add(`${first!.kind}/${third!.kind}`);
    }
    // 두 경계가 늘 같은 값이면 occurrence 가 키에 들어가지 않은 것이다.
    expect(kinds.size).toBeGreaterThan(1);
  });
});

describe('장면 전환(촬영 시각이 30분 이상 떨어짐)', () => {
  const gap = (ms: number): DirectorBoundary[] => [
    { fromVideoId: 'a', toVideoId: 'b', fromCapturedAt: BASE, toCapturedAt: BASE + ms },
    { fromVideoId: 'b', toVideoId: 'c', fromCapturedAt: BASE + ms, toCapturedAt: BASE + ms + 60_000 },
  ];

  it('스타일마다 섞지 않는 전환으로 표시한다', () => {
    expect(pickTransitions({ movieId: 'm', stylePreset: '일상', boundaries: gap(SCENE_GAP_MS) })[0]).toEqual({
      kind: 'dip',
      durationMs: 400,
    });
    expect(pickTransitions({ movieId: 'm', stylePreset: '감성', boundaries: gap(SCENE_GAP_MS) })[0]).toEqual({
      kind: 'dip',
      durationMs: 600,
    });
    expect(pickTransitions({ movieId: 'm', stylePreset: '여행', boundaries: gap(SCENE_GAP_MS) })[0]).toEqual({
      kind: 'flash',
      durationMs: 200,
    });
  });

  it('30분 미만은 같은 장면이고, 순서가 거꾸로여도 간격으로 본다', () => {
    expect(pickTransitions({ movieId: 'm', stylePreset: '일상', boundaries: gap(SCENE_GAP_MS - 1) })[0]).toEqual({
      kind: 'hardcut',
    });
    expect(pickTransitions({ movieId: 'm', stylePreset: '일상', boundaries: gap(-SCENE_GAP_MS) })[0]).toEqual({
      kind: 'dip',
      durationMs: 400,
    });
  });

  it('장면 전환이 여행의 첫 경계 규칙보다 먼저다', () => {
    expect(pickTransitions({ movieId: 'm', stylePreset: '여행', boundaries: gap(SCENE_GAP_MS) })[0]?.kind).toBe(
      'flash',
    );
  });
});

describe('스타일의 경향', () => {
  it('일상은 같은 장면이면 언제나 바로 넘긴다', () => {
    expect(new Set(sample('일상'))).toEqual(new Set(['hardcut']));
  });

  it('감성은 대부분 겹쳐 녹이고 가끔 검게 넘긴다', () => {
    const kinds = sample('감성');
    expect(new Set(kinds)).toEqual(new Set(['crossfade', 'dip']));
    expect(share(kinds, 'crossfade')).toBeGreaterThan(0.7);
    expect(share(kinds, 'crossfade')).toBeLessThan(0.9);
  });

  it('여행은 첫 경계를 확대로 열고, 나머지는 대부분 바로 넘긴다', () => {
    for (let m = 0; m < 20; m++) {
      expect(pickTransitions({ movieId: `m-${m}`, stylePreset: '여행', boundaries: sameScene(4) })[0]).toEqual({
        kind: 'zoompunch',
        durationMs: 300,
      });
    }
    const kinds = sample('여행');
    expect(new Set(kinds)).toEqual(new Set(['hardcut', 'zoompunch', 'flash']));
    expect(share(kinds, 'hardcut')).toBeGreaterThan(0.6);
    expect(share(kinds, 'hardcut')).toBeLessThan(0.8);
  });

  it('컷이 하나면 고를 경계가 없다', () => {
    expect(pickTransitions({ movieId: 'm', stylePreset: '감성', boundaries: [] })).toEqual([]);
  });
});
