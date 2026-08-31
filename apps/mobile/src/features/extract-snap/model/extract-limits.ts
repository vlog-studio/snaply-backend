/**
 * What an extraction window may be.
 *
 * Extraction cuts a snap out of a longer gallery video, so the ceiling matches
 * what capture can produce (a 5-second hold) — an extracted snap is the same
 * kind of material as a captured one, and every surface downstream (the movie's
 * per-cut trim, upload) already assumes that scale. The floor is a
 * product choice: anything under half a second reads as a glitch, not a moment.
 * The floor is deliberately *not* `entities/movie`'s `MinCutSec` (0.4s) — that
 * rule is about how far a cut may be trimmed inside a movie, not about how
 * short a snap is worth keeping.
 */
export const MinExtractSec = 0.5;
export const MaxExtractSec = 5;

/** Granularity the window's edges settle at — one movie trim step. */
export const ExtractStepSec = 0.1;
