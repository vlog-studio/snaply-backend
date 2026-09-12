import { z } from 'zod';

import { apiPath, apiRequest } from '@/shared/api';
import { USE_MOCK_API } from '@/shared/config/api';

import type { RemoteMovie } from '../model/remote-movie';
import {
  mockCreateMovie,
  mockDeleteMovie,
  mockExportMovie,
  mockFinishMovie,
  mockUpdateMovie,
} from './mock-movies';
import { mapRemoteMovie, movieDtoSchema, type MovieBody, type SnapIdResolver } from './movie.dto';

/**
 * Create the movie on the server under the id the device gave it
 * (`POST /movies` with `id`).
 *
 * The id travels with the body so the movie keeps the identity every screen,
 * route and notification already uses for it. The server treats a repeated id
 * as the same request — a retry after a lost response does not make a second
 * movie — which is what lets the outbox send this again until it is answered.
 */
export async function createRemoteMovie(
  id: string,
  body: MovieBody,
  snapIdOf: SnapIdResolver,
  signal?: AbortSignal,
): Promise<RemoteMovie> {
  if (USE_MOCK_API) return mapRemoteMovie(mockCreateMovie(id, body), snapIdOf);
  const dto = await apiRequest('/movies', {
    method: 'POST',
    body: { id, ...body },
    schema: movieDtoSchema,
    signal,
  });
  return mapRemoteMovie(dto, snapIdOf);
}

/**
 * Replace the movie's settings and whole cut list (`PATCH /movies/{id}`).
 *
 * Refused with a 409 while a run owns the movie, and a 404 for a movie the
 * server no longer has — both are the caller's to read (`ApiError.status`).
 */
export async function updateRemoteMovie(
  id: string,
  body: MovieBody,
  snapIdOf: SnapIdResolver,
  signal?: AbortSignal,
): Promise<RemoteMovie | undefined> {
  if (USE_MOCK_API) {
    const dto = mockUpdateMovie(id, body);
    return dto ? mapRemoteMovie(dto, snapIdOf) : undefined;
  }
  const dto = await apiRequest(apiPath('/movies/{id}', { id }), {
    method: 'PATCH',
    body,
    schema: movieDtoSchema,
    signal,
  });
  return mapRemoteMovie(dto, snapIdOf);
}

/** Delete the movie on the server (`DELETE /movies/{id}`). The snaps it used stay. */
export async function deleteRemoteMovie(id: string, signal?: AbortSignal): Promise<void> {
  if (USE_MOCK_API) {
    mockDeleteMovie(id);
    return;
  }
  await apiRequest(apiPath('/movies/{id}', { id }), {
    method: 'DELETE',
    schema: z.object({ deleted: z.boolean() }),
    signal,
  });
}

/**
 * Queue a run over the movie's cuts as the server holds them
 * (`POST /movies/{id}/export`) and return the job to follow.
 *
 * The server reserves the run's 100 credits (402 `INSUFFICIENT_CREDITS` when
 * they do not fit, carrying `required`/`balance`), refuses a movie already
 * generating with 409, and refuses with 400 a movie holding a cut whose snap
 * has expired or been deleted (`unavailable`) or no cuts at all. A remake
 * replaces the previous result rather than adding to it.
 */
export async function exportRemoteMovie(id: string, signal?: AbortSignal): Promise<string> {
  if (USE_MOCK_API) {
    const started = mockExportMovie(id);
    if (!started) throw new Error(`[movie][mock] no movie ${id} to export`);
    if (__DEV__) console.log(`[movie][mock] export queued for ${id}`);
    return started.jobId;
  }
  const { jobId } = await apiRequest(apiPath('/movies/{id}/export', { id }), {
    method: 'POST',
    schema: z.object({ jobId: z.string() }),
    signal,
  });
  return jobId;
}

export type MovieFinished = { finishedAt: number; resultDeleted: boolean };

const finishSchema = z.object({ finishedAt: z.string(), resultDeleted: z.boolean() });

/**
 * Tell the server the user has taken the result (`POST /movies/{id}/finish`):
 * the result file is deleted there, the movie itself stays and can be made
 * again as a new run.
 *
 * **Irreversible, and never to be guessed** (MOV-18): the caller must have the
 * user's explicit word — a share sheet closing says nothing about whether the
 * file was saved.
 */
export async function finishRemoteMovie(id: string, signal?: AbortSignal): Promise<MovieFinished> {
  if (USE_MOCK_API) {
    const finished = mockFinishMovie(id);
    if (!finished) throw new Error(`[movie][mock] no movie ${id} to finish`);
    return { finishedAt: Date.parse(finished.finishedAt), resultDeleted: finished.resultDeleted };
  }
  const dto = await apiRequest(apiPath('/movies/{id}/finish', { id }), {
    method: 'POST',
    schema: finishSchema,
    signal,
  });
  return { finishedAt: Date.parse(dto.finishedAt), resultDeleted: dto.resultDeleted };
}
