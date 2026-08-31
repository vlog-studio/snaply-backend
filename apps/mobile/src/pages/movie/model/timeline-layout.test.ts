import {
  DeadCutSec,
  cutDisplaySec,
  playheadAtX,
  playheadXPx,
  rulerTicks,
  timelineCutMetrics,
  type TimelineCutSize,
} from './timeline-layout';

const alive = (usedSec: number, fullSec: number): TimelineCutSize => ({ usedSec, fullSec });
const dead: TimelineCutSize = { usedSec: 0, fullSec: undefined };

describe('cutDisplaySec', () => {
  it.each([
    // A cut is drawn at what it plays, trimmed or not.
    ['untrimmed', alive(4, 4), 4],
    ['trimmed', alive(1.5, 4), 1.5],
    // A dead cut has no length of its own; the stand-in keeps it visible.
    ['dead', dead, DeadCutSec],
  ])('measures a %s cut', (_name, size, expected) => {
    expect(cutDisplaySec(size)).toBe(expected);
  });
});

describe('timelineCutMetrics', () => {
  it('lays the cuts flush, each starting where the previous one ends', () => {
    expect(timelineCutMetrics([alive(2, 2), alive(1.5, 4), alive(3, 3)], 60)).toEqual([
      { x: 0, width: 120 },
      { x: 120, width: 90 },
      { x: 210, width: 180 },
    ]);
  });

  it('gives a dead cut the stand-in width', () => {
    expect(timelineCutMetrics([dead, alive(2, 2)], 60)).toEqual([
      { x: 0, width: DeadCutSec * 60 },
      { x: DeadCutSec * 60, width: 120 },
    ]);
  });

  it('is empty for no cuts', () => {
    expect(timelineCutMetrics([], 60)).toEqual([]);
  });
});

describe('playheadXPx', () => {
  const metric = { x: 120, width: 240 };

  it('measures from the clip left edge, since that is where the cut starts', () => {
    expect(playheadXPx(metric, 2, 60)).toBe(240);
  });

  it('sits at the left edge at the start of the cut', () => {
    expect(playheadXPx(metric, 0, 60)).toBe(120);
  });

  it('is held inside the clip when a report arrives after the cut ended', () => {
    expect(playheadXPx(metric, 99, 60)).toBe(360);
  });

  it('never points before the clip on a negative report', () => {
    expect(playheadXPx(metric, -1, 60)).toBe(120);
  });
});

describe('playheadAtX', () => {
  // Two cuts: [0, 120) and [120, 360), at 60 px per second.
  const metrics = [
    { x: 0, width: 120 },
    { x: 120, width: 240 },
  ];

  it('finds the cut under the point and measures into it in seconds', () => {
    expect(playheadAtX(metrics, 180, 60)).toEqual({ index: 1, secIntoCut: 1 });
  });

  it('gives a boundary point to the cut that starts there', () => {
    expect(playheadAtX(metrics, 120, 60)).toEqual({ index: 1, secIntoCut: 0 });
  });

  it('lands an overscroll past the end on the last moment', () => {
    expect(playheadAtX(metrics, 999, 60)).toEqual({ index: 1, secIntoCut: 4 });
  });

  it('lands an overscroll before the start on the first moment', () => {
    expect(playheadAtX(metrics, -50, 60)).toEqual({ index: 0, secIntoCut: 0 });
  });

  it('round-trips with playheadXPx', () => {
    const at = playheadAtX(metrics, 210, 60);
    expect(playheadXPx(metrics[at.index], at.secIntoCut, 60)).toBe(210);
  });

  it.each([
    ['an empty strip', [], 60],
    ['a degenerate scale', metrics, 0],
  ])('points at nothing on %s', (_name, input, pxPerSec) => {
    expect(playheadAtX(input, 100, pxPerSec)).toEqual({ index: -1, secIntoCut: 0 });
  });
});

describe('rulerTicks', () => {
  it('marks every half second, labelling the whole ones, with no mark at zero', () => {
    expect(rulerTicks(150, 60)).toEqual([
      { x: 30, labelSec: undefined },
      { x: 60, labelSec: 1 },
      { x: 90, labelSec: undefined },
      { x: 120, labelSec: 2 },
      { x: 150, labelSec: undefined },
    ]);
  });

  it('stops at the strip edge rather than marking past the last cut', () => {
    expect(rulerTicks(149, 60)).toHaveLength(4);
  });

  it.each([
    ['an empty strip', 0, 60],
    ['a degenerate scale', 150, 0],
  ])('is empty for %s', (_name, widthPx, pxPerSec) => {
    expect(rulerTicks(widthPx, pxPerSec)).toEqual([]);
  });
});
