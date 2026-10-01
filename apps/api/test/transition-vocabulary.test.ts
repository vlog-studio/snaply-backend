/**
 * 전환 어휘의 정합성과 해석 규칙을 고정한다.
 *
 * 원본은 `packages/shared-types/src/transition-vocabulary.json` **하나**이고 워커
 * (`pipeline/transition.py`)도 같은 파일을 읽는다. 해석 규칙은 앱 미리보기와 렌더가 같은 답을
 * 내야 하므로 워커 테스트와 **같은 픽스처**로 검사한다.
 *
 * DB·Redis 를 쓰지 않는 순수 검사다.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  TRANSITION_EASINGS,
  TRANSITION_KINDS,
  TRANSITION_TIMINGS,
  TRANSITION_VOCABULARY_VERSION,
  TransitionError,
  defaultTransition,
  resolveTransition,
  transitionDurationRange,
  validateTransition,
  type Transition,
} from '@vlog-studio/shared-types';

const SHARED_TYPES = join(fileURLToPath(new URL('../../..', import.meta.url)), 'packages', 'shared-types');

interface KindEntry {
  order: number;
  timing: string;
  durationMs: { min: number; max: number; default: number } | null;
  split?: { outgoing: number; incoming: number };
  scaleFrom?: number;
  easing?: string;
  fallback: string | null;
}

interface VocabularyFile {
  transitionVocabularyVersion: number;
  timings: Record<string, string>;
  easings: Record<string, string>;
  kinds: Record<string, KindEntry>;
}

interface FixtureCase {
  name: string;
  transition: Transition;
  outgoing: { cutMs: number; spareAfterMs: number };
  incoming: { cutMs: number; spareBeforeMs: number };
  expected: Transition;
}

const vocabulary = JSON.parse(
  readFileSync(join(SHARED_TYPES, 'src', 'transition-vocabulary.json'), 'utf-8'),
) as VocabularyFile;

const fixture = JSON.parse(
  readFileSync(join(SHARED_TYPES, 'fixtures', 'transition-resolution.json'), 'utf-8'),
) as { cases: FixtureCase[] };

const kindsInOrder = Object.entries(vocabulary.kinds)
  .sort(([, a], [, b]) => a.order - b.order)
  .map(([name]) => name);

describe('전환 사전 ↔ TypeScript 상수', () => {
  it('종류 목록과 순서가 사전과 같다', () => {
    expect([...TRANSITION_KINDS]).toEqual(kindsInOrder);
  });

  it('timing · easing 목록이 사전과 같다', () => {
    expect([...TRANSITION_TIMINGS].sort()).toEqual(Object.keys(vocabulary.timings).sort());
    expect([...TRANSITION_EASINGS].sort()).toEqual(Object.keys(vocabulary.easings).sort());
  });

  it('버전이 사전에서 온다', () => {
    expect(TRANSITION_VOCABULARY_VERSION).toBe(vocabulary.transitionVocabularyVersion);
  });
});

describe('사전 자체의 내부 정합성', () => {
  it('order 가 0부터 빈틈없다', () => {
    const orders = Object.values(vocabulary.kinds)
      .map((entry) => entry.order)
      .sort((a, b) => a - b);
    expect(orders).toEqual(orders.map((_, i) => i));
  });

  it('길이가 없는 것은 hardcut 하나뿐이고, 모든 폴백은 hardcut 에서 끝난다', () => {
    for (const [kind, entry] of Object.entries(vocabulary.kinds)) {
      expect(entry.durationMs === null, kind).toBe(kind === 'hardcut');
      expect(entry.fallback, kind).toBe(kind === 'hardcut' ? null : 'hardcut');
    }
  });

  it('길이 범위가 min ≤ default ≤ max 인 양의 정수다', () => {
    for (const kind of TRANSITION_KINDS) {
      const range = transitionDurationRange(kind);
      if (range === null) continue;
      for (const value of [range.min, range.default, range.max]) {
        expect(Number.isInteger(value) && value > 0, kind).toBe(true);
      }
      expect(range.min <= range.default && range.default <= range.max, kind).toBe(true);
    }
  });

  it('timing · easing 은 사전에 선언된 값만 쓴다', () => {
    for (const [kind, entry] of Object.entries(vocabulary.kinds)) {
      expect(Object.keys(vocabulary.timings), kind).toContain(entry.timing);
      if (entry.easing !== undefined) expect(Object.keys(vocabulary.easings), kind).toContain(entry.easing);
    }
  });

  it('경계형 전환은 split 을 갖고 합이 1이다, 겹침형은 갖지 않는다', () => {
    for (const [kind, entry] of Object.entries(vocabulary.kinds)) {
      if (kind === 'hardcut') continue;
      if (entry.timing === 'boundary') {
        expect(entry.split, kind).toBeDefined();
        expect((entry.split?.outgoing ?? 0) + (entry.split?.incoming ?? 0), kind).toBeCloseTo(1);
      } else {
        expect(entry.split, kind).toBeUndefined();
      }
    }
  });

  it('zoompunch 배율이 720p 원본의 상한(1.1)을 넘지 않는다', () => {
    // 720p 원본은 1080×1920 출력에서 이미 1.5배다 — plans/edit-recipe-tools.md §2.4
    const scale = vocabulary.kinds.zoompunch?.scaleFrom ?? 0;
    expect(scale).toBeGreaterThan(1);
    expect(scale).toBeLessThanOrEqual(1.1);
  });
});

describe('validateTransition', () => {
  it('범위 안의 값과 hardcut 을 받는다', () => {
    expect(validateTransition({ kind: 'hardcut' })).toEqual({ kind: 'hardcut' });
    expect(validateTransition({ kind: 'crossfade', durationMs: 200 })).toEqual({
      kind: 'crossfade',
      durationMs: 200,
    });
  });

  it('범위 밖 길이는 고치지 않고 거부한다', () => {
    expect(() => validateTransition({ kind: 'crossfade', durationMs: 199 })).toThrow(TransitionError);
    expect(() => validateTransition({ kind: 'crossfade', durationMs: 801 })).toThrow(TransitionError);
    expect(() => validateTransition({ kind: 'dip', durationMs: 300.5 })).toThrow(TransitionError);
    expect(() => validateTransition({ kind: 'dip' })).toThrow(TransitionError);
  });

  it('hardcut 에 길이를 주거나 모르는 종류를 주면 거부한다', () => {
    expect(() => validateTransition({ kind: 'hardcut', durationMs: 100 })).toThrow(TransitionError);
    expect(() => validateTransition({ kind: 'whip', durationMs: 300 })).toThrow(TransitionError);
  });

  it('기본값은 모두 유효하다', () => {
    for (const kind of TRANSITION_KINDS) {
      const transition = defaultTransition(kind);
      expect(validateTransition(transition), kind).toEqual(transition);
    }
  });
});

describe('resolveTransition — 공용 픽스처', () => {
  it('픽스처가 hardcut 이 아닌 모든 종류의 폴백을 덮는다', () => {
    const fellBack = new Set(
      fixture.cases
        .filter((c) => c.transition.kind !== 'hardcut' && c.expected.kind === 'hardcut')
        .map((c) => c.transition.kind),
    );
    expect([...fellBack].sort()).toEqual(TRANSITION_KINDS.filter((k) => k !== 'hardcut').sort());
  });

  for (const c of fixture.cases) {
    it(c.name, () => {
      expect(resolveTransition(c.transition, { outgoing: c.outgoing, incoming: c.incoming })).toEqual(
        c.expected,
      );
    });
  }
});
