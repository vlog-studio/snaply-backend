import {
  formatPositionSec,
  initialWindow,
  stripRulerTicks,
  stripTiles,
  windowAtTap,
} from './extract-strip-layout';

describe('stripTiles', () => {
  it('splits a short source into one-second tiles, the last clipped to the end', () => {
    const tiles = stripTiles(2.5, 60);
    expect(tiles).toHaveLength(3);
    expect(tiles.map((tile) => tile.widthPx)).toEqual([60, 60, 30]);
  });

  it('samples each tile just inside its own span', () => {
    const tiles = stripTiles(2.5, 60);
    expect(tiles.map((tile) => tile.timeMs)).toEqual([200, 1200, 2200]);
  });

  // The last span can be shorter than the skip-the-leader offset; the sample
  // must stay inside it rather than ask for a frame past the file's end.
  it('keeps the sample inside a span shorter than the leader offset', () => {
    const tiles = stripTiles(1.2, 60);
    const last = tiles[tiles.length - 1];
    expect(last.timeMs).toBe(1100);
  });

  it('widens tiles instead of exceeding the thumbnail budget', () => {
    const tiles = stripTiles(600, 60);
    expect(tiles.length).toBeLessThanOrEqual(60);
    // 600s over a 60-tile budget → 10s per tile.
    expect(tiles[0].widthPx).toBe(600);
  });

  it.each([
    ['zero duration', 0, 60],
    ['zero scale', 10, 0],
  ])('draws nothing for %s', (_case, durationSec, pxPerSec) => {
    expect(stripTiles(durationSec, pxPerSec)).toEqual([]);
  });
});

describe('stripRulerTicks', () => {
  it('labels every second on a short source', () => {
    const ticks = stripRulerTicks(4, 60);
    expect(ticks.map((tick) => tick.labelSec)).toEqual([1, 2, 3, 4]);
  });

  it('labels every fifth second on a long source, dots between', () => {
    const ticks = stripRulerTicks(21, 60);
    expect(
      ticks.filter((tick) => tick.labelSec !== undefined).map((tick) => tick.labelSec),
    ).toEqual([5, 10, 15, 20]);
    expect(ticks).toHaveLength(21);
  });

  it('places a mark on the strip scale', () => {
    const ticks = stripRulerTicks(3, 60);
    expect(ticks[0].x).toBe(60);
  });
});

describe('initialWindow', () => {
  it('opens on the first three seconds — the capture default', () => {
    expect(initialWindow(96)).toEqual({ startSec: 0, endSec: 3 });
  });

  it('is the whole video when the source is shorter than the default', () => {
    expect(initialWindow(1.8)).toEqual({ startSec: 0, endSec: 1.8 });
  });

  // A source under the extraction floor is still workable: the window is the
  // file, and the floor concerns cutting a moment down, not refusing one.
  it('is the whole video even under the extraction floor', () => {
    expect(initialWindow(0.3)).toEqual({ startSec: 0, endSec: 0.3 });
  });
});

describe('windowAtTap', () => {
  it('centres the window on the tapped moment at its current length', () => {
    expect(windowAtTap(42.5, 3, 96, 0.1)).toEqual({ startSec: 41, endSec: 44 });
  });

  it('snaps the landing to the window step', () => {
    expect(windowAtTap(10.34, 3, 96, 0.1)).toEqual({ startSec: 8.8, endSec: 11.8 });
  });

  it('clamps against the source start', () => {
    expect(windowAtTap(0.4, 3, 96, 0.1)).toEqual({ startSec: 0, endSec: 3 });
  });

  it('clamps against the source end', () => {
    expect(windowAtTap(95.9, 3, 96, 0.1)).toEqual({ startSec: 93, endSec: 96 });
  });

  // The clamp wins over the step: a snapped start must never push the end
  // past the file.
  it('never lands past the file when the clamp is not step-aligned', () => {
    const { startSec, endSec } = windowAtTap(12, 3, 12.34, 0.1);
    expect(startSec).toBe(9.3);
    expect(endSec).toBeLessThanOrEqual(12.34);
  });

  it('keeps a window longer than the source at the whole source', () => {
    expect(windowAtTap(1, 3, 2, 0.1)).toEqual({ startSec: 0, endSec: 2 });
  });
});

describe('formatPositionSec', () => {
  it.each([
    [0, '0:00.0'],
    [42.5, '0:42.5'],
    [61.1, '1:01.1'],
    // A float-noise value prints as the step it stands for.
    [0.30000000000000004, '0:00.3'],
    [-1, '0:00.0'],
  ])('prints %s as %s', (sec, expected) => {
    expect(formatPositionSec(sec)).toBe(expected);
  });
});
