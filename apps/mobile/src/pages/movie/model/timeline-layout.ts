/**
 * The seconds↔pixels layout of the timeline strip.
 *
 * The strip draws every cut at a width proportional to how long it plays, with
 * a ruler of second marks above, so the arithmetic that places things is one
 * pure module: the strip and the ruler cannot disagree about where a second
 * is. The trim gesture's own math stays in `@/shared/lib/trim-geometry` — this
 * module only decides how wide each cut is drawn and where the ruler's ticks
 * fall.
 */

/**
 * How many points one second of playback occupies in the strip. Wide enough
 * that one trim step (`CutTrimStepSec`) is a draggable distance, so a short cut
 * can still be adjusted by tenths.
 */
export const TimelinePxPerSec = 120;

/**
 * The stand-in length for a cut whose original was deleted. It plays nothing,
 * but it must stay visible and tappable — that is where it gets removed.
 */
export const DeadCutSec = 1;

/** What the layout needs to know about one cut. */
export type TimelineCutSize = {
  /** How long the cut plays (its trim window, or the whole snap). */
  usedSec: number;
  /** The whole snap's length, or `undefined` when the original was deleted. */
  fullSec: number | undefined;
};

/** Where one cut sits in the strip, in points from the first cut's left edge. */
export type TimelineCutMetric = {
  x: number;
  width: number;
};

/**
 * How many seconds of strip one cut occupies: what it plays. A cut being
 * trimmed widens and narrows live on the UI thread (`TimelineCut` drives its
 * own width from the handles); these metrics catch up when the window settles.
 * A dead cut gets the stand-in length.
 */
export function cutDisplaySec(size: TimelineCutSize): number {
  return size.fullSec === undefined ? DeadCutSec : size.usedSec;
}

/**
 * Every cut's place in the strip. Cuts sit flush against each other — a gap
 * would be pixels that stand for no time, and the ruler above would drift off
 * the cuts by one gap per boundary.
 */
export function timelineCutMetrics(
  sizes: readonly TimelineCutSize[],
  pxPerSec: number,
): TimelineCutMetric[] {
  let x = 0;
  return sizes.map((size) => {
    const width = cutDisplaySec(size) * pxPerSec;
    const metric = { x, width };
    x += width;
    return metric;
  });
}

/** Where the stage is, in the strip's terms: which cut, and how far into it. */
export type TimelinePlayhead = {
  /** Index into the cut list; `-1` when there is nothing to point at. */
  index: number;
  /**
   * Seconds since the cut's own start — the start of its trim window, because
   * that is where playback begins, not where the file does.
   */
  secIntoCut: number;
};

/**
 * Where the moment being played sits in the strip, in points from the first
 * cut's left edge.
 *
 * A clip draws exactly its trim window, so the offset into the cut lands as it
 * is. Held inside the clip — a report that arrives a beat after a cut ended
 * must not push the playhead into the next cut's clip.
 */
export function playheadXPx(
  metric: TimelineCutMetric,
  secIntoCut: number,
  pxPerSec: number,
): number {
  const offsetPx = Math.max(secIntoCut, 0) * pxPerSec;
  return metric.x + Math.min(offsetPx, metric.width);
}

/**
 * The inverse of `playheadXPx`: which moment sits `x` points from the first
 * cut's left edge — what a hand-scrolled strip has brought under the fixed
 * playhead. Clamped into the strip, so an overscroll on either end lands on
 * the movie's first or last moment. `index: -1` only for an empty strip.
 */
export function playheadAtX(
  metrics: readonly TimelineCutMetric[],
  x: number,
  pxPerSec: number,
): TimelinePlayhead {
  if (metrics.length === 0 || pxPerSec <= 0) return { index: -1, secIntoCut: 0 };
  const found = metrics.findIndex((metric) => x < metric.x + metric.width);
  const index = found === -1 ? metrics.length - 1 : found;
  const metric = metrics[index];
  const offsetPx = Math.min(Math.max(x - metric.x, 0), metric.width);
  return { index, secIntoCut: offsetPx / pxPerSec };
}

/** One ruler mark: a labelled second, or an unlabelled half-second dot. */
export type RulerTick = {
  x: number;
  /** Set on whole seconds; the half-second ticks stay dots. */
  labelSec?: number;
};

/**
 * The ruler's marks across the strip: a dot every half second, a numbered
 * label on the whole seconds. Zero is the strip's left edge and needs no mark.
 */
export function rulerTicks(totalWidthPx: number, pxPerSec: number): RulerTick[] {
  if (pxPerSec <= 0) return [];
  const ticks: RulerTick[] = [];
  for (let half = 1; (half / 2) * pxPerSec <= totalWidthPx; half += 1) {
    const sec = half / 2;
    ticks.push({ x: sec * pxPerSec, labelSec: Number.isInteger(sec) ? sec : undefined });
  }
  return ticks;
}
