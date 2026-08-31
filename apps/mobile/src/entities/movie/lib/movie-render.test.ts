import type { Movie, SnapRef } from '../model/movie';
import { isEditedSinceRender, sameCuts } from './movie-render';

function ref(snapId: string, order: number, trim?: SnapRef['trim']): SnapRef {
  return { snapId, order, ...(trim ? { trim } : null) };
}

describe('sameCuts', () => {
  const base = [ref('s1', 0), ref('s2', 1, { startSec: 1, endSec: 3 })];

  it.each([
    ['an identical list', [ref('s1', 0), ref('s2', 1, { startSec: 1, endSec: 3 })], true],
    // Sequence is the composition; `order` is only its storage form.
    [
      'the same sequence renumbered',
      [ref('s1', 5), ref('s2', 9, { startSec: 1, endSec: 3 })],
      true,
    ],
    ['a reordered list', [ref('s2', 0, { startSec: 1, endSec: 3 }), ref('s1', 1)], false],
    ['a removed cut', [ref('s1', 0)], false],
    ['an added cut', [...base, ref('s3', 2)], false],
    ['a re-trimmed cut', [ref('s1', 0), ref('s2', 1, { startSec: 1, endSec: 4 })], false],
    ['a trim dropped', [ref('s1', 0), ref('s2', 1)], false],
  ])('reads %s', (_name, right, expected) => {
    expect(sameCuts(base, right)).toBe(expected);
  });
});

describe('isEditedSinceRender', () => {
  const source = [ref('s1', 0), ref('s2', 1)];

  function movie(overrides: Partial<Pick<Movie, 'snapRefs' | 'render'>> = {}) {
    return {
      snapRefs: [ref('s1', 0), ref('s2', 1)],
      render: { renderedAt: 1, durationSec: 8, snapRefs: source },
      ...overrides,
    };
  }

  it('reads an untouched finished movie as unchanged', () => {
    expect(isEditedSinceRender(movie())).toBe(false);
  });

  it.each([
    ['a reorder', [ref('s2', 0), ref('s1', 1)]],
    ['a removal', [ref('s1', 0)]],
    ['a new trim', [ref('s1', 0, { startSec: 0, endSec: 1 }), ref('s2', 1)]],
  ])('reads %s as drift', (_name, snapRefs) => {
    expect(isEditedSinceRender(movie({ snapRefs }))).toBe(true);
  });

  it('compares by stored order, not array position', () => {
    expect(isEditedSinceRender(movie({ snapRefs: [ref('s2', 1), ref('s1', 0)] }))).toBe(false);
  });

  it('reads a movie with no render as unchanged — there is nothing to restore', () => {
    expect(isEditedSinceRender(movie({ render: undefined }))).toBe(false);
  });

  it('reads a render stored before it carried its snapshot as unchanged', () => {
    expect(isEditedSinceRender(movie({ render: { renderedAt: 1, durationSec: 8 } }))).toBe(false);
  });
});
