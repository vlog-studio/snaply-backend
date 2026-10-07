import type { Snap } from '@/entities/snap';

import { preRollSec, toCutIndex, toPlaybackCuts, toPlaybackIndex } from './playback-cuts';
import type { Cut } from './use-movie-cuts';

function makeSnap(id: string, durationSec = 3): Snap {
  return {
    id,
    uri: `file:///doc/recordings/${id}.mp4`,
    durationSec,
    capturedAt: 1_753_200_000_000,
    width: 1080,
    height: 1920,
    orientation: 'portrait',
  };
}

function makeCut(
  id: string,
  options: {
    durationSec?: number;
    trim?: Cut['ref']['trim'];
    missing?: boolean;
    transition?: Cut['ref']['transition'];
  } = {},
): Cut {
  const snap = options.missing ? undefined : makeSnap(id, options.durationSec ?? 3);
  return {
    ref: {
      snapId: id,
      order: 0,
      trim: options.trim,
      ...(options.transition ? { transition: options.transition } : null),
    },
    snap,
    gone: snap ? undefined : 'deleted',
    usedSec: snap
      ? options.trim
        ? options.trim.endSec - options.trim.startSec
        : snap.durationSec
      : 0,
  };
}

describe('toPlaybackCuts', () => {
  it('plays every cut whole when nothing is trimmed', () => {
    expect(
      toPlaybackCuts([makeCut('s1', { durationSec: 3 }), makeCut('s2', { durationSec: 5 })]),
    ).toEqual([
      { snapId: 's1', uri: 'file:///doc/recordings/s1.mp4', startSec: 0, endSec: 3 },
      { snapId: 's2', uri: 'file:///doc/recordings/s2.mp4', startSec: 0, endSec: 5 },
    ]);
  });

  it('plays a trimmed cut inside its window', () => {
    const cuts = toPlaybackCuts([
      makeCut('s1', { durationSec: 5, trim: { startSec: 1.5, endSec: 4 } }),
    ]);
    expect(cuts[0]).toMatchObject({ startSec: 1.5, endSec: 4 });
  });

  it('skips a cut whose original was deleted', () => {
    const cuts = toPlaybackCuts([makeCut('s1', { missing: true }), makeCut('s2')]);
    expect(cuts.map((cut) => cut.snapId)).toEqual(['s2']);
  });

  it('has nothing to play when every original is gone', () => {
    expect(toPlaybackCuts([makeCut('s1', { missing: true })])).toEqual([]);
  });
});

describe('toPlaybackIndex', () => {
  const cuts = [makeCut('s1'), makeCut('s2', { missing: true }), makeCut('s3')];

  it('maps a timeline position onto the playlist', () => {
    expect(toPlaybackIndex(cuts, 0)).toBe(0);
    expect(toPlaybackIndex(cuts, 2)).toBe(1);
  });

  it('answers undefined for a cut that cannot play', () => {
    expect(toPlaybackIndex(cuts, 1)).toBeUndefined();
  });

  it('answers undefined outside the list', () => {
    expect(toPlaybackIndex(cuts, -1)).toBeUndefined();
    expect(toPlaybackIndex(cuts, 3)).toBeUndefined();
  });
});

describe('toCutIndex', () => {
  const cuts = [makeCut('s1', { missing: true }), makeCut('s2'), makeCut('s3')];

  it('maps a playlist position back onto the timeline', () => {
    expect(toCutIndex(cuts, 0)).toBe(1);
    expect(toCutIndex(cuts, 1)).toBe(2);
  });

  it('clamps a position past the end to the last cut', () => {
    expect(toCutIndex(cuts, 9)).toBe(2);
  });

  it('answers 0 for an empty list', () => {
    expect(toCutIndex([], 0)).toBe(0);
  });
});

describe('boundary transitions in the playlist', () => {
  const into = (
    toSnapId: string,
    kind: 'crossfade' | 'dip' | 'zoompunch' | 'hardcut',
    durationMs?: number,
  ) => ({
    kind,
    ...(durationMs !== undefined ? { durationMs } : null),
    owner: 'user' as const,
    toSnapId,
  });

  it('plans a crossfade half before and half after the boundary, on spare frames', () => {
    const [first, second] = toPlaybackCuts([
      makeCut('s1', {
        trim: { startSec: 0.5, endSec: 2.5 },
        transition: into('s2', 'crossfade', 400),
      }),
      makeCut('s2', { trim: { startSec: 0.5, endSec: 2.5 } }),
    ]);
    expect(first.transitionOut).toEqual({
      kind: 'crossfade',
      durationSec: 0.4,
      leadSec: 0.2,
      tailSec: 0.2,
    });
    // The incoming cut is parked that far before its window.
    expect(preRollSec(first)).toBe(0.2);
    expect(second.transitionOut).toBeUndefined();
  });

  it('plays a crossfade without spare frames as the render does — a dip', () => {
    // Untrimmed cuts have no frames outside their windows.
    const [first] = toPlaybackCuts([
      makeCut('s1', { transition: into('s2', 'crossfade', 800) }),
      makeCut('s2'),
    ]);
    expect(first.transitionOut).toEqual({
      kind: 'dip',
      durationSec: 0.4,
      leadSec: 0.2,
      tailSec: 0.2,
    });
    expect(preRollSec(first)).toBe(0);
  });

  it('puts a zoom punch wholly on the incoming cut', () => {
    const [first] = toPlaybackCuts([
      makeCut('s1', { transition: into('s2', 'zoompunch', 300) }),
      makeCut('s2'),
    ]);
    expect(first.transitionOut).toEqual({
      kind: 'zoompunch',
      durationSec: 0.3,
      leadSec: 0,
      tailSec: 0.3,
    });
  });

  it('cuts where the boundary is a hardcut, not read back yet, or chosen for another cut', () => {
    const cuts = toPlaybackCuts([
      makeCut('s1', { transition: into('s2', 'hardcut') }),
      makeCut('s2'),
      makeCut('s3', { transition: into('s9', 'dip', 400) }),
      makeCut('s4'),
    ]);
    expect(cuts.map((cut) => cut.transitionOut)).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
  });

  it('cuts past a dead cut instead of handing over to it', () => {
    const cuts = toPlaybackCuts([
      makeCut('s1', { transition: into('s2', 'dip', 400) }),
      makeCut('s2', { missing: true }),
      makeCut('s3'),
    ]);
    expect(cuts).toHaveLength(2);
    expect(cuts[0].transitionOut).toBeUndefined();
  });
});
