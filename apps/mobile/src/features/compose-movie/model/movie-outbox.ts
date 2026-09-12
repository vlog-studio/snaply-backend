import {
  createRemoteMovie,
  deleteRemoteMovie,
  getMovieById,
  getMovieOutbox,
  markMovieDeleteSent,
  markMovieGone,
  markMovieSent,
  toMovieBody,
  updateRemoteMovie,
  type SnapIdResolver,
  type VideoIdResolver,
} from '@/entities/movie';
import { getSnapSyncEntries } from '@/entities/snap';
import { ApiError } from '@/shared/api';

/**
 * Both directions of the snap ↔ server-video mapping, read from the upload
 * state at call time.
 *
 * The movie entity may not import the snap entity, so it takes these as
 * arguments; this feature, which may import both, is where they are built.
 * Read fresh per call rather than memoized: a send decides "can this go *now*",
 * and the answer changes the moment an upload finishes.
 */
export function snapResolvers(): { videoIdOf: VideoIdResolver; snapIdOf: SnapIdResolver } {
  const entries = getSnapSyncEntries();
  const snapByVideo = new Map<string, string>();
  for (const [snapId, entry] of Object.entries(entries)) {
    if (entry.status === 'uploaded') snapByVideo.set(entry.videoId, snapId);
  }
  return {
    videoIdOf: (snapId) => {
      const entry = entries[snapId];
      return entry?.status === 'uploaded' ? entry.videoId : undefined;
    },
    snapIdOf: (videoId) => snapByVideo.get(videoId),
  };
}

/** How one pending movie's send ended. */
export type SendOutcome =
  /** The server has the movie as it is here. */
  | 'sent'
  /** A cut's snap has not reached the server yet; nothing was sent. */
  | 'waiting'
  /** The server refused for now (a run owns the movie); try again later. */
  | 'busy'
  /** The server does not have the movie any more; it was dropped here too. */
  | 'gone'
  /** The request itself failed; the movie stays pending. */
  | 'failed';

/**
 * Carries one movie's pending write to the server.
 *
 * A `create` goes as `POST /movies` under the device's own id — the server
 * takes it and treats a repeat as the same request, so a lost response is
 * simply sent again. An `update` goes as `PATCH /movies/{id}` with the whole
 * movie. Either way the server's answer replaces the local copy unless an edit
 * landed mid-request (`markMovieSent` keeps it pending then).
 *
 * Nothing is sent while a cut's snap is still uploading: the server takes the
 * cut list whole, and it must exist there before it can be named.
 */
export async function sendMovie(movieId: string): Promise<SendOutcome> {
  const { pending, versions } = getMovieOutbox();
  const kind = pending[movieId];
  const movie = getMovieById(movieId);
  if (!kind || !movie) return 'sent';

  const { videoIdOf, snapIdOf } = snapResolvers();
  const body = toMovieBody(movie, videoIdOf);
  if (!body) return 'waiting';
  const version = versions[movieId] ?? 0;

  try {
    const remote =
      kind === 'create'
        ? await createRemoteMovie(movieId, body, snapIdOf)
        : await updateRemoteMovie(movieId, body, snapIdOf);
    if (!remote) {
      markMovieGone(movieId);
      return 'gone';
    }
    markMovieSent(movieId, remote, version);
    return 'sent';
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      markMovieGone(movieId);
      return 'gone';
    }
    if (error instanceof ApiError && error.status === 409) return 'busy';
    if (__DEV__) console.warn(`[compose-movie] could not send ${movieId}:`, String(error));
    return 'failed';
  }
}

/**
 * Tells the server about one movie deleted here. A movie the server has
 * already lost counts as done — the delete's purpose is met.
 */
export async function sendMovieDelete(movieId: string): Promise<'sent' | 'failed'> {
  try {
    await deleteRemoteMovie(movieId);
  } catch (error) {
    if (!(error instanceof ApiError && error.status === 404)) {
      if (__DEV__) console.warn(`[compose-movie] could not delete ${movieId}:`, String(error));
      return 'failed';
    }
  }
  markMovieDeleteSent(movieId);
  return 'sent';
}

/**
 * One pass over the outbox: every owed delete, then every pending movie whose
 * cuts have all reached the server. Serial — an account's outbox is a handful
 * of requests, and one at a time keeps a burst of edits from racing each other
 * onto the same row.
 */
export async function drainMovieOutbox(isCancelled: () => boolean): Promise<void> {
  const { pending, deletes } = getMovieOutbox();
  for (const movieId of deletes) {
    if (isCancelled()) return;
    await sendMovieDelete(movieId);
  }
  for (const movieId of Object.keys(pending)) {
    if (isCancelled()) return;
    await sendMovie(movieId);
  }
}
