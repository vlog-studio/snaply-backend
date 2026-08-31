import type { SnapRef } from '../model/movie';

/**
 * Granularity a trim is set at. The trim handles are dragged continuously but
 * land on a multiple of this, so every length the app prints is a value the user
 * could have aimed at — and a tenth of a second is fine enough to shave a beat
 * off a three-second snap.
 */
export const CutTrimStepSec = 0.1;

/** Shortest a cut may be. Below this a cut is a flicker, not a shot. */
export const MinCutSec = 0.4;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function snapToStep(sec: number): number {
  // Multiples of a tenth pick up float noise (3 * 0.1 !== 0.3); rounding to a
  // millisecond keeps stored windows printable.
  return Math.round(Math.round(sec / CutTrimStepSec) * CutTrimStepSec * 1000) / 1000;
}

/** How long a cut plays: its trim window, or the whole snap when untrimmed. */
export function cutDurationSec(ref: SnapRef, snapDurationSec: number): number {
  if (!ref.trim) return snapDurationSec;
  return Math.max(ref.trim.endSec - ref.trim.startSec, 0);
}

/**
 * How long a cut list plays.
 *
 * The snap lengths arrive as a lookup rather than as snaps, so this stays a movie
 * rule that `entities/snap` never has to be imported for — the same reason
 * `SnapRef` is declared structurally on the other side. A cut whose original was
 * deleted contributes nothing: it cannot be played, so it cannot be counted.
 */
export function cutsDurationSec(
  refs: readonly SnapRef[],
  snapDurationSec: (snapId: string) => number | undefined,
): number {
  return refs.reduce((total, ref) => {
    const duration = snapDurationSec(ref.snapId);
    return duration === undefined ? total : total + cutDurationSec(ref, duration);
  }, 0);
}

/** The same cut, playing whole again. */
export function withoutTrim(ref: SnapRef): SnapRef {
  if (!ref.trim) return ref;
  const { trim: _trim, ...rest } = ref;
  return rest;
}

/**
 * Whether two cuts play the same window: both whole, or the same trim. `withTrim`
 * drops a full-width window rather than storing it, so "plays whole" has exactly
 * one representation and this comparison never has to know the snap's length.
 */
export function sameTrimWindow(left: SnapRef, right: SnapRef): boolean {
  return left.trim?.startSec === right.trim?.startSec && left.trim?.endSec === right.trim?.endSec;
}

/**
 * The reference a trim edit lands on: snapped to {@link CutTrimStepSec}, held
 * inside the snap, and never shorter than {@link MinCutSec}.
 *
 * A window covering the whole snap drops `trim` altogether, so "plays whole" has
 * a single representation — otherwise a cut dragged out and back would compare as
 * changed and the screen would offer to save nothing. The end is placed first and
 * the start is then held behind it, so neither handle can pass the other however
 * the caller ordered the two values.
 */
export function withTrim(
  ref: SnapRef,
  startSec: number,
  endSec: number,
  snapDurationSec: number,
): SnapRef {
  if (snapDurationSec <= MinCutSec) return withoutTrim(ref);

  const end = clamp(snapToStep(endSec), MinCutSec, snapDurationSec);
  const start = clamp(snapToStep(startSec), 0, end - MinCutSec);
  if (start <= 0 && end >= snapDurationSec) return withoutTrim(ref);

  return { ...ref, trim: { startSec: start, endSec: end } };
}
