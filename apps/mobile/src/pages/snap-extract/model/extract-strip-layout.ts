/**
 * The seconds↔pixels layout of the extraction strip.
 *
 * The strip draws the *whole* source video once — a gallery video can run
 * minutes where a movie runs seconds — so its scale and its thumbnail budget
 * differ from the movie timeline's (`pages/movie/model/timeline-layout.ts`)
 * even though the two share the trim arithmetic in
 * `@/shared/lib/trim-geometry`. Pure functions so the strip, its ruler, and
 * the window gesture cannot disagree about where a second is.
 */

/**
 * How many points one second of source occupies. Narrower than the movie
 * timeline's 120 — a minutes-long strip at that scale would be tens of
 * thousands of points of scrolling — but still wide enough that one window
 * step (0.1s = 6pt) is a draggable distance.
 */
export const ExtractPxPerSec = 60;

/**
 * The most thumbnails one strip extracts. Frames come from one-shot native
 * extraction calls run in sequence, so the budget bounds how long a long
 * video's strip takes to fill in — past this, tiles get wider (one frame
 * stands for more seconds) instead of more numerous.
 */
const MaxStripTiles = 60;

/** One thumbnail tile: the frame at `timeMs`, drawn `widthPx` wide. */
export type StripTile = {
  timeMs: number;
  widthPx: number;
};

/**
 * The strip's thumbnail tiles: the video split into equal whole-second spans
 * (the last one clipped to the real end), each showing a frame from just
 * inside its own span. "Just inside" skips the black leader frame some videos
 * open on, the same reason `video-thumbnails` samples past t=0.
 */
export function stripTiles(durationSec: number, pxPerSec: number): StripTile[] {
  if (durationSec <= 0 || pxPerSec <= 0) return [];
  const tileSec = Math.max(1, Math.ceil(durationSec / MaxStripTiles));
  const count = Math.ceil(durationSec / tileSec);
  return Array.from({ length: count }, (_, index) => {
    const startSec = index * tileSec;
    const endSec = Math.min(startSec + tileSec, durationSec);
    const sampleSec = startSec + Math.min(0.2, (endSec - startSec) / 2);
    return {
      timeMs: Math.round(sampleSec * 1000),
      widthPx: (endSec - startSec) * pxPerSec,
    };
  });
}

/** One ruler mark: a labelled second, or an unlabelled dot. */
export type StripTick = {
  x: number;
  /** Set on the seconds that carry a label; the rest stay dots. */
  labelSec?: number;
};

/**
 * The ruler's marks across the strip: a dot every second, a label on every
 * fifth — every second on a source short enough that fifths would leave the
 * ruler nearly bare. Zero is the strip's left edge and needs no mark.
 */
export function stripRulerTicks(durationSec: number, pxPerSec: number): StripTick[] {
  if (durationSec <= 0 || pxPerSec <= 0) return [];
  const labelStepSec = durationSec <= 20 ? 1 : 5;
  const ticks: StripTick[] = [];
  for (let sec = 1; sec <= Math.floor(durationSec); sec += 1) {
    ticks.push({ x: sec * pxPerSec, labelSec: sec % labelStepSec === 0 ? sec : undefined });
  }
  return ticks;
}

/**
 * Where the window opens on a fresh source: the first three seconds — the
 * capture default — or the whole video when it is shorter than that. A source
 * shorter than the extraction floor simply *is* the window; the floor is about
 * not cutting a moment down below half a second, not about refusing short
 * videos.
 */
export function initialWindow(
  durationSec: number,
  defaultSec = 3,
): { startSec: number; endSec: number } {
  return { startSec: 0, endSec: Math.min(defaultSec, durationSec) };
}

/**
 * Where the window lands when the strip is tapped: centred on the tapped
 * moment, at its current length, clamped into the source and snapped to the
 * window step. Tap-to-move is the coarse positioning a minutes-long source
 * needs — dragging the window covers only a finger's width per gesture, while
 * a tap (plus the strip's fling) reaches anywhere in two motions.
 */
export function windowAtTap(
  tapSec: number,
  lengthSec: number,
  durationSec: number,
  stepSec: number,
): { startSec: number; endSec: number } {
  if (durationSec <= 0) return { startSec: 0, endSec: 0 };
  const length = Math.min(lengthSec, durationSec);
  const maxStart = durationSec - length;
  const centred = Math.min(Math.max(tapSec - length / 2, 0), maxStart);
  // Snapping can push the start a fraction of a step past the clamp; the
  // clamp wins, so the window never asks for footage past the file's end.
  const snapped =
    stepSec > 0 ? Math.round(Math.round(centred / stepSec) * stepSec * 1000) / 1000 : centred;
  const startSec = Math.min(snapped, maxStart);
  return { startSec, endSec: Math.round((startSec + length) * 1000) / 1000 };
}

/**
 * A moment in the source as `m:ss.d` — tenths, because that is the step the
 * window's edges settle at, and two windows a step apart must not print alike.
 */
export function formatPositionSec(sec: number): string {
  const tenths = Math.round(Math.max(sec, 0) * 10);
  const minutes = Math.floor(tenths / 600);
  const rest = tenths % 600;
  return `${minutes}:${String(Math.floor(rest / 10)).padStart(2, '0')}.${rest % 10}`;
}
