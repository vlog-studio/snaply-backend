import { ApiError } from '@/shared/api';

/**
 * The movie the backend says is being made right now, from its
 * `GENERATION_IN_PROGRESS` 409 (`error.movieId`, MOV-11). The transport carries
 * the field blind (`ApiError.details`); narrowing it is this slice's job, the
 * same split as `readCreditShortfall`.
 *
 * Returns `undefined` for anything else — a different error, a run the backend
 * holds no movie for (`movieId: null`, a job made without one), or a backend
 * that stopped sending the field. The id only lets the screen point at the
 * running movie; the refusal stands without it.
 */
export function readGeneratingMovieId(error: unknown): string | undefined {
  if (!(error instanceof ApiError)) return undefined;

  const movieId = error.details?.movieId;
  return typeof movieId === 'string' && movieId.length > 0 ? movieId : undefined;
}
