import type { Movie, SnapRef } from '../model/movie';
import { sameTrimWindow } from './movie-trim';

/**
 * Whether two cut lists are the same composition: the same snaps in the same
 * places, each playing the same window. Sequence is compared rather than the
 * `order` field, because sequence is what a commit renumbers into `order` —
 * the same reading `sameArrangement` uses, plus the trim it deliberately
 * ignores (rearranging and re-cutting are different questions).
 */
export function sameCuts(left: readonly SnapRef[], right: readonly SnapRef[]): boolean {
  if (left.length !== right.length) return false;
  return left.every(
    (ref, index) => ref.snapId === right[index].snapId && sameTrimWindow(ref, right[index]),
  );
}

/**
 * Whether this movie's cut list has drifted from what its render was made from.
 *
 * The composition the user edits and the render a run produced are different
 * objects, and only `generating` freezes edits — so a `ready` movie's cuts can
 * lawfully move on after the run. This is the predicate that tells an edited
 * finished movie from an untouched one, so the screen can say so and offer the
 * render's own composition back.
 *
 * A movie with no render — or one whose render was stored before it carried its
 * snapshot — reads as unchanged: there is nothing to compare against and
 * nothing to restore, so the honest answer is the quiet one.
 */
export function isEditedSinceRender(movie: Pick<Movie, 'snapRefs' | 'render'>): boolean {
  const source = movie.render?.snapRefs;
  if (!source) return false;
  const byOrder = (refs: readonly SnapRef[]) =>
    [...refs].sort((left, right) => left.order - right.order);
  return !sameCuts(byOrder(movie.snapRefs), byOrder(source));
}
