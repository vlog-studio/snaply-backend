import type { SnapRef } from '../model/movie';
import {
  MinCutSec,
  cutDurationSec,
  cutsDurationSec,
  sameTrimWindow,
  withTrim,
  withoutTrim,
} from './movie-trim';

function ref(snapId: string, trim?: SnapRef['trim']): SnapRef {
  return { snapId, order: 0, trim };
}

describe('cutDurationSec', () => {
  it('uses the whole snap when untrimmed', () => {
    expect(cutDurationSec(ref('s1'), 5)).toBe(5);
  });

  it('uses the trim window when trimmed', () => {
    expect(cutDurationSec(ref('s1', { startSec: 1, endSec: 3.5 }), 5)).toBe(2.5);
  });

  it('never reports a negative length for an inverted window', () => {
    expect(cutDurationSec(ref('s1', { startSec: 4, endSec: 1 }), 5)).toBe(0);
  });
});

describe('cutsDurationSec', () => {
  const durations: Record<string, number> = { s1: 5, s2: 3 };
  const lookup = (snapId: string) => durations[snapId];

  it('sums the cuts, each at its own played length', () => {
    const refs = [ref('s1', { startSec: 0, endSec: 2 }), ref('s2')];
    expect(cutsDurationSec(refs, lookup)).toBe(5);
  });

  it('skips a cut whose original was deleted — it cannot play', () => {
    expect(cutsDurationSec([ref('s1'), ref('gone')], lookup)).toBe(5);
  });

  it('is zero for an empty cut list', () => {
    expect(cutsDurationSec([], lookup)).toBe(0);
  });
});

describe('withTrim', () => {
  it.each([
    ['snaps to the tenth of a second', 0.84, 3.16, { startSec: 0.8, endSec: 3.2 }],
    // Naive step arithmetic renders 0.8 as 0.8000000000000001; the stored
    // window must be the printable value.
    ['lands on a printable tenth', 0.8, 3.1, { startSec: 0.8, endSec: 3.1 }],
    ['holds the start inside the snap', -2, 3, { startSec: 0, endSec: 3 }],
    ['holds the end inside the snap', 1, 9, { startSec: 1, endSec: 5 }],
    [
      'keeps the minimum length when the end is dragged onto the start',
      2,
      2,
      {
        startSec: 1.6,
        endSec: 2,
      },
    ],
    [
      'keeps the minimum length when the handles are given inverted',
      4,
      1,
      {
        startSec: 0.6,
        endSec: 1,
      },
    ],
  ])('%s', (_name, startSec, endSec, expected) => {
    expect(withTrim(ref('s1'), startSec, endSec, 5).trim).toEqual(expected);
  });

  it('drops the trim when the window covers the whole snap', () => {
    expect(withTrim(ref('s1', { startSec: 1, endSec: 3 }), 0, 5, 5)).toEqual({
      snapId: 's1',
      order: 0,
    });
  });

  it('leaves a snap too short to trim playing whole', () => {
    expect(withTrim(ref('s1'), 0, 0.5, MinCutSec).trim).toBeUndefined();
  });
});

describe('sameTrimWindow', () => {
  it.each([
    ['two whole cuts', ref('s1'), ref('s1'), true],
    [
      'the same window',
      ref('s1', { startSec: 1, endSec: 3 }),
      ref('s1', { startSec: 1, endSec: 3 }),
      true,
    ],
    [
      'a moved window',
      ref('s1', { startSec: 1, endSec: 3 }),
      ref('s1', { startSec: 1, endSec: 3.5 }),
      false,
    ],
    ['a whole cut against a trimmed one', ref('s1'), ref('s1', { startSec: 0, endSec: 3 }), false],
  ])('compares %s', (_name, left, right, expected) => {
    expect(sameTrimWindow(left, right)).toBe(expected);
  });
});

describe('withoutTrim', () => {
  it('removes the window', () => {
    expect(withoutTrim(ref('s1', { startSec: 1, endSec: 2 }))).toEqual({ snapId: 's1', order: 0 });
  });

  it('returns an untrimmed cut unchanged, so nothing re-renders', () => {
    const untrimmed = { snapId: 's1', order: 0 };
    expect(withoutTrim(untrimmed)).toBe(untrimmed);
  });
});

// MOV-22: a window the edit draft chose stays the draft's until the user edits it.
describe('trim owner', () => {
  const drafted: SnapRef = { snapId: 's1', order: 0, trim: { startSec: 0.4, endSec: 2.6 }, trimOwner: 'ai' };

  it('hands the window to the user when it is dragged', () => {
    expect(withTrim(drafted, 0.5, 2.6, 3)).toEqual({ snapId: 's1', order: 0, trim: { startSec: 0.5, endSec: 2.6 } });
  });

  it('hands it to the user when the cut is set to play whole', () => {
    expect(withoutTrim(drafted)).toEqual({ snapId: 's1', order: 0 });
    expect(withTrim(drafted, 0, 3, 3)).toEqual({ snapId: 's1', order: 0 });
  });

  it('keeps a whole-snap cut the draft chose when nothing was edited', () => {
    const whole: SnapRef = { snapId: 's1', order: 0, trimOwner: 'ai' };
    expect(withoutTrim(whole)).toBe(whole);
  });
});
