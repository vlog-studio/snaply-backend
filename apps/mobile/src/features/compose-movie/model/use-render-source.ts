import { useQuery } from '@tanstack/react-query';

import type { Movie } from '@/entities/movie';

import { editedVideoQueries } from '../api/edited-video.queries';

/**
 * What watch mode should play for this movie's render, resolved now.
 *
 * `uri` — the file's address, fresh when the render remembers its result id.
 * `resolving` — a fresh address is still being asked for; the stage shows its
 * loading face rather than opening a link already known to be second-hand.
 */
export type RenderSource = {
  uri: string | undefined;
  resolving: boolean;
  /**
   * The ask failed and left nothing to play: the movie *has* a file, and this
   * device could not learn its address. Distinct from "no file was ever
   * produced" — the same empty `uri` for two opposite situations, and the
   * surfaces that report why (the stage, 공유) would otherwise tell the user a
   * finished movie was never finished.
   */
  unresolved: boolean;
  /** Asks again — what a failure offers instead of a dead end. */
  retry: () => void;
};

/**
 * Resolves the movie's rendered file to an address that is good *now*.
 *
 * The stored `render.uri` is whatever the finish-time lookup got, and the
 * backend hands out time-limited links to a private bucket — so a movie opened
 * tomorrow holds a link that no longer works. When the render kept its result
 * id (`render.videoId`), this asks `GET /videos/{id}` again on every visit and
 * plays the answer; the stored uri stands in only when the ask fails (offline —
 * where an expired link will fail too, but a still-valid one plays) or when an
 * old render kept no id. A movie without a render, or whose result row carries
 * no file (mock mode), resolves to no uri — the cut player's case.
 *
 * **The wait is bounded** (2026-08-13). The request carries its own deadline
 * (`getEditedVideo`) and the query retries once, so an unreachable server ends
 * in a failure the screens can state rather than in a `resolving` that never
 * clears. When that failure leaves nothing to play, `unresolved` says which
 * kind of empty this is — the movie has a file and this device could not reach
 * its address — and `retry` is what the screen offers instead of a dead end.
 */
export function useRenderSource(movie: Movie | undefined): RenderSource {
  const videoId = movie?.render?.videoId;
  const query = useQuery({
    ...editedVideoQueries.byId(videoId ?? ''),
    enabled: videoId !== undefined,
  });
  const retry = () => void query.refetch();

  if (videoId === undefined) {
    return { uri: movie?.render?.uri, resolving: false, unresolved: false, retry };
  }
  if (query.data !== undefined) {
    // The fresh answer is authoritative — including "no file": a row that has
    // lost its file must not resurrect as the stale link the store remembers.
    return { uri: query.data.editedUrl, resolving: false, unresolved: false, retry };
  }
  if (query.isError) {
    // A stored link is worth trying — it may still be inside its window, and
    // the player says so when it is not. Only with nothing left to try is this
    // an unresolved render.
    const stored = movie?.render?.uri;
    return { uri: stored, resolving: false, unresolved: stored === undefined, retry };
  }
  return { uri: undefined, resolving: true, unresolved: false, retry };
}
