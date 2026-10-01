import {
  resolveCutTransition,
  transitionAfter,
  transitionSpec,
  type TransitionKind,
} from '@/entities/movie';

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

/**
 * How the stage hands one cut over to the next — the boundary's transition
 * already fitted to the two cuts (`resolveCutTransition`, the render's rule), in
 * the seconds the player works in.
 *
 * Everything is measured from the boundary, which is where the movie's clock
 * moves from one cut to the next: `leadSec` before it the effect starts, and
 * `tailSec` after it the effect ends. A crossfade is half on each side and plays
 * spare frames — the outgoing cut runs on past its window end, and the incoming
 * one starts `leadSec` before its window start — so the user's windows are seen
 * whole and the movie is the sum of its cuts, as rendered. A dip or flash darkens
 * or lights the end of one cut and the start of the next; a zoom punch is all on
 * the incoming cut.
 */
export type BoundaryPlan = {
  kind: Exclude<TransitionKind, 'hardcut'>;
  durationSec: number;
  leadSec: number;
  tailSec: number;
};

/** One cut as the player needs it: a file, and the window of it that plays. */
export type PlaybackCut = {
  snapId: string;
  uri: string;
  /** Seconds into the file where this cut starts. */
  startSec: number;
  /** Seconds into the file where it ends; the player advances here. */
  endSec: number;
  /** How the stage hands over to the next cut; absent for a cut (and after the last). */
  transitionOut?: BoundaryPlan;
};

/**
 * Where a cut's player should be parked so it is ready for its boundary: a
 * crossfade's incoming cut starts `leadSec` before its window, on spare frames.
 */
export function preRollSec(previous: PlaybackCut | undefined): number {
  return previous?.transitionOut?.kind === 'crossfade' ? previous.transitionOut.leadSec : 0;
}

/**
 * The plan for the boundary between `outgoing` and `incoming`, or `undefined`
 * for a plain cut — no transition read back yet (the server picks it), a
 * hardcut, or one that does not fit and falls all the way back to a cut. Each
 * snap's length is where the spare frames come from.
 */
export function boundaryPlan(
  outgoing: Pick<Cut, 'ref' | 'snap'>,
  incoming: Pick<Cut, 'ref' | 'snap'>,
  chosen: { kind: TransitionKind; durationMs?: number } | undefined,
): BoundaryPlan | undefined {
  if (!chosen || !outgoing.snap || !incoming.snap) return undefined;
  const window = (cut: Pick<Cut, 'ref' | 'snap'>) => ({
    startMs: Math.round((cut.ref.trim?.startSec ?? 0) * 1000),
    endMs: Math.round((cut.ref.trim?.endSec ?? cut.snap!.durationSec) * 1000),
    fileMs: Math.floor(cut.snap!.durationSec * 1000),
  });
  const out = window(outgoing);
  const inc = window(incoming);
  const played = resolveCutTransition(chosen, {
    outgoing: { cutMs: out.endMs - out.startMs, spareAfterMs: Math.max(out.fileMs - out.endMs, 0) },
    incoming: { cutMs: inc.endMs - inc.startMs, spareBeforeMs: inc.startMs },
  });
  if (played.kind === 'hardcut') return undefined;
  const durationSec = played.durationMs / 1000;
  const split = transitionSpec(played.kind).split ?? { outgoing: 0.5, incoming: 0.5 };
  return {
    kind: played.kind,
    durationSec,
    leadSec: durationSec * split.outgoing,
    tailSec: durationSec * split.incoming,
  };
}

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
  const refs = cuts.map((cut) => cut.ref);
  return cuts.flatMap<PlaybackCut>((cut, index) => {
    if (!cut.snap) return [];
    // A boundary hands over only between two cuts that both play; with a dead
    // cut in between, the stage simply cuts past it.
    const next = cuts[index + 1];
    const transitionOut = next ? boundaryPlan(cut, next, transitionAfter(refs, index)) : undefined;
    return [
      {
        snapId: cut.snap.id,
        uri: cut.snap.uri,
        startSec: cut.ref.trim?.startSec ?? 0,
        endSec: cut.ref.trim?.endSec ?? cut.snap.durationSec,
        ...(transitionOut ? { transitionOut } : null),
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
