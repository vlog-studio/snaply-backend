/**
 * The pixel↔seconds arithmetic the trim bar's gesture evaluates.
 *
 * Extracted from the component and `'worklet'`-marked so the drag can run
 * entirely on the UI thread while the rules stay plain functions with table-driven
 * tests (the directive is inert under Jest). Nothing here knows about a movie or a
 * snap: it converts between a track's width and a video's length. The domain rules
 * about what a trim may be stay with each consumer — `entities/movie` for a cut's
 * trim, `features/extract-snap` for an extraction window.
 */

/** The track a trim is dragged along. */
export type TrimTrack = {
  /** Track width in points; the whole snap spans it. */
  width: number;
  /** Length of the snap the track represents, in seconds. */
  durationSec: number;
  /** Granularity a dragged handle reports at. */
  stepSec: number;
};

export function clampPx(x: number, min: number, max: number): number {
  'worklet';
  return Math.min(Math.max(x, min), Math.max(min, max));
}

/** Where a moment in the snap sits along the track. */
export function secToX(sec: number, track: TrimTrack): number {
  'worklet';
  if (track.durationSec <= 0) return 0;
  return clampPx(sec / track.durationSec, 0, 1) * track.width;
}

/** Which moment in the snap a point on the track is, snapped to `stepSec`. */
export function xToSec(x: number, track: TrimTrack): number {
  'worklet';
  if (track.width <= 0 || track.stepSec <= 0) return 0;
  const raw = (clampPx(x, 0, track.width) / track.width) * track.durationSec;
  // Multiples of a tenth pick up float noise (3 * 0.1 !== 0.3); rounding to a
  // millisecond keeps every reported window printable.
  return Math.round(Math.round(raw / track.stepSec) * track.stepSec * 1000) / 1000;
}

/** How far apart the two handles must stay for the cut to keep a minimum length. */
export function minGapPx(minSec: number, track: TrimTrack): number {
  'worklet';
  return secToX(minSec, track);
}

/**
 * A one-number stand-in for the window the handles currently describe, so the
 * drag can tell a step change from a frame and cross to JS only for the former.
 * Both values are multiples of a tenth of a second on a track of a few seconds,
 * so the shift is far larger than any pair it has to separate.
 */
export function windowSignature(startSec: number, endSec: number): number {
  'worklet';
  return startSec * 10_000 + endSec;
}
