import type { Movie, SnapRef } from '@/entities/movie';

import type { Cut } from './use-movie-cuts';
import { watchDurationSec, watchRefs } from './watch-cuts';

function ref(snapId: string, order: number): SnapRef {
  return { snapId, order };
}

function makeMovie(
  snapRefs: SnapRef[],
  render?: Partial<Movie['render']> & object,
): Pick<Movie, 'snapRefs' | 'render'> {
  return {
    snapRefs,
    render: render ? { renderedAt: 1_753_200_000_000, durationSec: 6, ...render } : undefined,
  };
}

describe('watchRefs', () => {
  it('plays the render snapshot, not the live list, when the render remembers one', () => {
    const movie = makeMovie([ref('edited', 0)], {
      snapRefs: [ref('rendered-1', 0), ref('rendered-2', 1)],
    });
    expect(watchRefs(movie).map((cut) => cut.snapId)).toEqual(['rendered-1', 'rendered-2']);
  });

  it('sorts the snapshot by its stored order', () => {
    const movie = makeMovie([], { snapRefs: [ref('second', 1), ref('first', 0)] });
    expect(watchRefs(movie).map((cut) => cut.snapId)).toEqual(['first', 'second']);
  });

  it('falls back to the live list when the render carries no snapshot', () => {
    const movie = makeMovie([ref('live-2', 1), ref('live-1', 0)], { snapRefs: undefined });
    expect(watchRefs(movie).map((cut) => cut.snapId)).toEqual(['live-1', 'live-2']);
  });

  it('falls back to the live list when every snapshot cut lost its original', () => {
    // `removeSnapsEverywhere` strips deleted snaps from the snapshot too, so an
    // all-deleted snapshot reads as empty rather than as a movie with no cuts.
    const movie = makeMovie([ref('live', 0)], { snapRefs: [] });
    expect(watchRefs(movie).map((cut) => cut.snapId)).toEqual(['live']);
  });

  it('falls back to the live list when there is no render at all', () => {
    const movie = makeMovie([ref('live', 0)]);
    expect(watchRefs(movie).map((cut) => cut.snapId)).toEqual(['live']);
  });
});

describe('watchDurationSec', () => {
  const cut = (snapId: string, usedSec: number): Cut => ({
    ref: ref(snapId, 0),
    snap: undefined,
    usedSec,
  });

  it('quotes the render length while the render remembers its composition', () => {
    const movie = makeMovie([ref('live', 0)], { durationSec: 18, snapRefs: [ref('rendered', 0)] });
    expect(watchDurationSec(movie, [cut('rendered', 2.5)])).toBe(18);
  });

  it('quotes the render length whenever a file plays, even with nothing else left', () => {
    // The file outlives the snaps it was made from: with every original (and
    // so the snapshot) gone, the stage still plays `render.uri`, and the cut
    // sum would put 0초 beside a movie that runs.
    const movie = makeMovie([], {
      uri: 'https://cdn.example/m.mp4',
      durationSec: 18,
      snapRefs: [],
    });
    expect(watchDurationSec(movie, [])).toBe(18);
  });

  it('sums the cuts that actually play when the render kept no snapshot', () => {
    // The stored length describes a composition the fallback is not playing.
    const movie = makeMovie([ref('live', 0)], { durationSec: 18, snapRefs: undefined });
    expect(watchDurationSec(movie, [cut('live', 0.9)])).toBe(0.9);
  });

  it('sums the cuts when there is no render at all', () => {
    const movie = makeMovie([ref('a', 0), ref('b', 1)]);
    expect(watchDurationSec(movie, [cut('a', 1.5), cut('b', 2)])).toBe(3.5);
  });
});
