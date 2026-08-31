import { clampPx, minGapPx, secToX, windowSignature, xToSec } from './trim-geometry';

const track = { width: 200, durationSec: 4, stepSec: 0.1 };

describe('secToX', () => {
  it.each([
    [0, 0],
    [1, 50],
    [4, 200],
    // Outside the snap is held at the ends rather than drawn off the track.
    [-1, 0],
    [9, 200],
  ])('puts %p seconds at %p points', (sec, expected) => {
    expect(secToX(sec, track)).toBe(expected);
  });

  it('is zero for a snap of unknown length', () => {
    expect(secToX(2, { ...track, durationSec: 0 })).toBe(0);
  });
});

describe('xToSec', () => {
  it.each([
    [0, 0],
    [50, 1],
    [200, 4],
    // Between two steps, the nearer one wins.
    [7, 0.1],
    [12, 0.2],
    [400, 4],
  ])('reads %p points as %p seconds', (x, expected) => {
    expect(xToSec(x, track)).toBe(expected);
  });

  it('lands on a printable tenth, not a float-noise neighbour', () => {
    // 15pt is 0.3s here, which naive step arithmetic renders 0.30000000000000004.
    expect(xToSec(15, track)).toBe(0.3);
  });

  it.each([
    ['a track with no width', { ...track, width: 0 }],
    ['a step of zero', { ...track, stepSec: 0 }],
  ])('is zero for %s rather than dividing by it', (_name, degenerate) => {
    expect(xToSec(50, degenerate)).toBe(0);
  });
});

describe('clampPx', () => {
  it.each([
    [5, 0, 10, 5],
    [-5, 0, 10, 0],
    [50, 0, 10, 10],
    // A window narrower than the minimum gap inverts the bounds; the lower one
    // wins, so a handle never jumps behind its own limit.
    [5, 10, 0, 10],
  ])('clamps %p within %p..%p to %p', (value, min, max, expected) => {
    expect(clampPx(value, min, max)).toBe(expected);
  });
});

describe('minGapPx', () => {
  it('measures the minimum cut length in track points', () => {
    expect(minGapPx(1, track)).toBe(50);
  });
});

describe('windowSignature', () => {
  it('separates every window a tenth-second grid can produce', () => {
    const windows: number[] = [];
    for (let startTenths = 0; startTenths <= 50; startTenths += 1) {
      for (let endTenths = startTenths + 10; endTenths <= 50; endTenths += 1) {
        windows.push(windowSignature(startTenths / 10, endTenths / 10));
      }
    }
    expect(new Set(windows).size).toBe(windows.length);
  });
});
