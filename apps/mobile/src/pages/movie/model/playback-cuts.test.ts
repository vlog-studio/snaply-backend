import type { Snap } from '@/entities/snap';

import { toCutIndex, toPlaybackCuts, toPlaybackIndex } from './playback-cuts';
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
  options: { durationSec?: number; trim?: Cut['ref']['trim']; missing?: boolean } = {},
): Cut {
  const snap = options.missing ? undefined : makeSnap(id, options.durationSec ?? 3);
  return {
    ref: { snapId: id, order: 0, trim: options.trim },
    snap,
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
