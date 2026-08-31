import { isAiArranged, sameArrangement } from './movie-arrangement';

describe('isAiArranged', () => {
  it.each([
    ['ai', true],
    ['user', false],
    [undefined, false],
  ] as const)('reads %s as %s', (arranger, expected) => {
    expect(isAiArranged({ arranger })).toBe(expected);
  });
});

describe('sameArrangement', () => {
  const refs = (...snapIds: string[]) => snapIds.map((snapId, order) => ({ snapId, order }));

  it('accepts an identical sequence', () => {
    expect(sameArrangement(refs('a', 'b', 'c'), refs('a', 'b', 'c'))).toBe(true);
  });

  it.each([
    ['a swapped pair', refs('b', 'a', 'c')],
    ['a dropped cut', refs('a', 'b')],
    ['an added cut', refs('a', 'b', 'c', 'd')],
    ['a replaced cut', refs('a', 'b', 'd')],
  ])('rejects %s', (_case, next) => {
    expect(sameArrangement(refs('a', 'b', 'c'), next)).toBe(false);
  });

  it('ignores trim, because shortening a cut is not rearranging one', () => {
    const trimmed = [
      { snapId: 'a', order: 0, trim: { startSec: 0.5, endSec: 2 } },
      { snapId: 'b', order: 1 },
    ];

    expect(sameArrangement(refs('a', 'b'), trimmed)).toBe(true);
  });
});
