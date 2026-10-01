import type { SnapRef } from '../model/movie';
import {
  TransitionCatalog,
  resolveCutTransition,
  sameTransitions,
  transitionAfter,
  withTransitionAfter,
  type TransitionBoundary,
} from './movie-transition';

// The server's originals. The app keeps a copy (the contract package is not in
// the app bundle — root backlog B-5), so these tests are what keeps the copy
// honest: a stage that fits a transition differently from the render previews
// a different movie.
const vocabulary = jest.requireActual(
  '../../../../../../packages/shared-types/src/transition-vocabulary.json',
) as {
  kinds: Record<
    string,
    {
      order: number;
      label: string;
      timing: string;
      durationMs: { min: number; max: number; default: number } | null;
      split?: { outgoing: number; incoming: number };
      color?: string;
      scaleFrom?: number;
      easing?: string;
      fallback: string | null;
    }
  >;
};
const fixture = jest.requireActual(
  '../../../../../../packages/shared-types/fixtures/transition-resolution.json',
) as {
  cases: {
    name: string;
    transition: { kind: string; durationMs?: number };
    outgoing: TransitionBoundary['outgoing'];
    incoming: TransitionBoundary['incoming'];
    expected: { kind: string; durationMs?: number };
  }[];
};

describe('the app catalog matches the server vocabulary', () => {
  it('lists the same kinds in the same order', () => {
    const serverOrder = Object.entries(vocabulary.kinds)
      .sort(([, a], [, b]) => a.order - b.order)
      .map(([kind]) => kind);
    expect(TransitionCatalog.map((spec) => spec.kind)).toEqual(serverOrder);
  });

  it.each(TransitionCatalog.map((spec) => [spec.kind, spec] as const))(
    'carries the server values for %s',
    (kind, spec) => {
      const server = vocabulary.kinds[kind];
      expect(spec).toEqual({
        kind,
        label: server.label,
        timing: server.timing,
        durationMs: server.durationMs,
        ...(server.split ? { split: server.split } : null),
        ...(server.color ? { color: server.color } : null),
        ...(server.scaleFrom ? { scaleFrom: server.scaleFrom } : null),
        easing: server.easing ?? 'linear',
        fallback: server.fallback,
      });
    },
  );
});

describe('resolveCutTransition runs the shared fixture', () => {
  it.each(fixture.cases.map((c) => [c.name, c] as const))('%s', (_name, c) => {
    const played = resolveCutTransition(c.transition as never, {
      outgoing: c.outgoing,
      incoming: c.incoming,
    });
    // The server writes a hardcut without a length; the app plays it as 0.
    expect(played).toEqual({ kind: c.expected.kind, durationMs: c.expected.durationMs ?? 0 });
  });
});

function ref(snapId: string, transition?: SnapRef['transition']): SnapRef {
  return { snapId, order: 0, ...(transition ? { transition } : null) };
}

describe('transitionAfter', () => {
  const dip = { kind: 'dip' as const, durationMs: 400, owner: 'user' as const, toSnapId: 'b' };

  it('reads the transition chosen for the cut that follows', () => {
    expect(transitionAfter([ref('a', dip), ref('b')], 0)).toBe(dip);
  });

  it('drops a pick made for a different next cut — a reorder separated the pair', () => {
    expect(transitionAfter([ref('a', dip), ref('c'), ref('b')], 0)).toBeUndefined();
  });

  it('has nothing after the last cut', () => {
    expect(transitionAfter([ref('b'), ref('a', dip)], 1)).toBeUndefined();
  });
});

describe('withTransitionAfter', () => {
  it("stores the user's pick at its default length, aimed at the next cut", () => {
    const next = withTransitionAfter([ref('a'), ref('b')], 0, 'crossfade');
    expect(next[0].transition).toEqual({
      kind: 'crossfade',
      durationMs: 500,
      owner: 'user',
      toSnapId: 'b',
    });
  });

  it('gives a hardcut no length', () => {
    const next = withTransitionAfter([ref('a'), ref('b')], 0, 'hardcut');
    expect(next[0].transition).toEqual({ kind: 'hardcut', owner: 'user', toSnapId: 'b' });
  });

  it('hands the boundary back by dropping the stored value', () => {
    const picked = withTransitionAfter([ref('a'), ref('b')], 0, 'dip');
    expect(withTransitionAfter(picked, 0, undefined)[0]).not.toHaveProperty('transition');
  });
});

describe('sameTransitions', () => {
  const ai = { kind: 'crossfade' as const, durationMs: 800, owner: 'ai' as const, toSnapId: 'b' };

  it('compares what plays, not who chose it', () => {
    expect(
      sameTransitions([ref('a', ai), ref('b')], [ref('a', { ...ai, owner: 'user' }), ref('b')]),
    ).toBe(true);
  });

  it('sees a changed kind', () => {
    expect(
      sameTransitions([ref('a', ai), ref('b')], [ref('a', { ...ai, kind: 'dip' }), ref('b')]),
    ).toBe(false);
  });
});
