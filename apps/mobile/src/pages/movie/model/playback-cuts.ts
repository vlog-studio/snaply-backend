import type { Cut } from './use-movie-cuts';

/**
 * How often the stage reports where it is, in seconds.
 *
 * It is one number for two readers on purpose. The player needs it because a cut
 * ends on a trim boundary rather than at the end of its file, so the boundary has
 * to be watched for; the timeline needs it because its playhead glides between
 * reports and has to know how far apart they are. A quarter second is close
 * enough not to be seen and far cheaper than every frame.
 */
export const PlaybackProgressIntervalSec = 0.25;

/** One cut as the player needs it: a file, and the window of it that plays. */
export type PlaybackCut = {
  snapId: string;
  uri: string;
  /** Seconds into the file where this cut starts. */
  startSec: number;
  /** Seconds into the file where it ends; the player advances here. */
  endSec: number;
};

/**
 * The working cut list resolved into a playlist.
 *
 * The player previews the list *as the user is editing it* — a reorder or a trim
 * shows up in the stage immediately, which is the whole point of the timeline
 * layout. A cut whose original was deleted is dropped rather than shown as a
 * gap; the timeline strip is where a dead cut is seen and removed, playback can
 * only skip it.
 */
export function toPlaybackCuts(cuts: readonly Cut[]): PlaybackCut[] {
  return cuts.flatMap<PlaybackCut>((cut) => {
    if (!cut.snap) return [];
    return [
      {
        snapId: cut.snap.id,
        uri: cut.snap.uri,
        startSec: cut.ref.trim?.startSec ?? 0,
        endSec: cut.ref.trim?.endSec ?? cut.snap.durationSec,
      },
    ];
  });
}

/**
 * Where a timeline cut lands in the playlist, or `undefined` for a cut that
 * cannot play (its original is gone). The two lists disagree exactly when a
 * dead cut sits somewhere before `cutIndex`.
 */
export function toPlaybackIndex(cuts: readonly Cut[], cutIndex: number): number | undefined {
  if (cutIndex < 0 || cutIndex >= cuts.length) return undefined;
  if (!cuts[cutIndex].snap) return undefined;
  return cuts.slice(0, cutIndex).filter((cut) => cut.snap !== undefined).length;
}

/** The timeline position of the cut the player is on. */
export function toCutIndex(cuts: readonly Cut[], playbackIndex: number): number {
  let remaining = playbackIndex;
  for (let index = 0; index < cuts.length; index += 1) {
    if (!cuts[index].snap) continue;
    if (remaining === 0) return index;
    remaining -= 1;
  }
  return Math.max(cuts.length - 1, 0);
}
