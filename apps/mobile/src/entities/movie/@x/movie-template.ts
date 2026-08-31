/**
 * Cross-reference API for `entities/movie-template`.
 *
 * A template says what a movie made from it should start out looking like, so it
 * has to name a real style rather than a loose string — the relationship is
 * type-level and intrinsic to the model, which is the one case the boundary rules
 * allow an `@x` for. Nothing runtime crosses here.
 */
export type { MovieStyle } from '../model/movie';
