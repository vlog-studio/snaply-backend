import type { Movie, SnapRef } from '../model/movie';

/**
 * Whether the AI still owns this movie's cut order.
 *
 * Read through this rather than off the field: a movie stored before `arranger`
 * existed has none, and the safe reading of a missing value is that the order is
 * the user's. Getting that backwards would let a re-match rewrite a cut list
 * someone arranged by hand.
 */
export function isAiArranged(movie: Pick<Movie, 'arranger'>): boolean {
  return movie.arranger === 'ai';
}

/**
 * Whether two cut lists put the same snaps in the same places.
 *
 * Trim is deliberately not compared: shortening a cut is not rearranging one,
 * and it must not cost the user the AI's arrangement. Order is read from the
 * list's own sequence, because that is what a commit renumbers into `order`.
 */
export function sameArrangement(left: readonly SnapRef[], right: readonly SnapRef[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((ref, index) => ref.snapId === right[index].snapId);
}
