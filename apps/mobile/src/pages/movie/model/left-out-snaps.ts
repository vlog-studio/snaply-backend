import type { Movie } from '@/entities/movie';

/**
 * The edit draft's left-out snaps still worth offering back (MOV-21): those the
 * library still holds and the movie does not. A snap re-added, or deleted since,
 * leaves the count on its own — so the notice needs no bookkeeping beyond the
 * list the draft left, and goes once nothing is left to offer.
 */
export function offerableLeftOut(
  movie: Pick<Movie, 'leftOut' | 'snapRefs'>,
  inLibrary: (snapId: string) => boolean,
): string[] {
  if (!movie.leftOut || movie.leftOut.length === 0) return [];
  const held = new Set(movie.snapRefs.map((ref) => ref.snapId));
  return movie.leftOut.filter((snapId) => !held.has(snapId) && inLibrary(snapId));
}
