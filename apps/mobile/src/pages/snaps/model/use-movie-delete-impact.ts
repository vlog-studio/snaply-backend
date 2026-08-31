import { useMemo } from 'react';

import { useMovies } from '@/entities/movie';

/**
 * A movie a deletion is about to change, with the cut count it holds now and the
 * one it will hold afterwards. Deleting an original strips it from every movie,
 * so this is what a confirmation needs in order to name the damage instead of
 * counting it.
 */
export type MovieDeleteImpact = {
  movieId: string;
  title: string;
  cutCount: number;
  /** What it will hold once the deletion lands. */
  nextCutCount: number;
};

const NoImpact: MovieDeleteImpact[] = [];

/**
 * What deleting these snaps would do to every movie referencing them, most
 * recently edited first.
 *
 * Cross-entity composition, but only one screen asks the question, so it stays
 * page-local rather than becoming a widget. Promote it if a movie screen needs
 * the same answer.
 */
export function useMovieDeleteImpact(snapIds: readonly string[]): MovieDeleteImpact[] {
  const movies = useMovies();

  return useMemo(() => {
    const removed = new Set(snapIds);
    if (removed.size === 0) return NoImpact;

    return [...movies]
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .filter((movie) => movie.snapRefs.some((ref) => removed.has(ref.snapId)))
      .map((movie) => ({
        movieId: movie.id,
        title: movie.title,
        cutCount: movie.snapRefs.length,
        nextCutCount: movie.snapRefs.filter((ref) => !removed.has(ref.snapId)).length,
      }));
  }, [movies, snapIds]);
}
