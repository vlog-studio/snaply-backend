import { useMovieSync } from '../model/use-movie-sync';

/**
 * Headless mount point for movie ↔ server sync. Render once high in the tree,
 * after the library scope is bound, so edits reach the server wherever the user
 * is and the server's movies arrive whichever screen is open.
 */
export function MovieSyncGate(): null {
  useMovieSync();
  return null;
}
