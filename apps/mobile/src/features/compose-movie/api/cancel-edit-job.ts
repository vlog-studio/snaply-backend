import { z } from 'zod';

import { apiPath, apiRequest } from '@/shared/api';
import { USE_MOCK_API } from '@/shared/config/api';

const cancelSchema = z.object({ canceled: z.boolean() });

async function cancelFromApi(jobId: string, signal?: AbortSignal): Promise<void> {
  await apiRequest(apiPath('/edit-jobs/{id}', { id: jobId }), {
    method: 'DELETE',
    schema: cancelSchema,
    signal,
  });
}

function cancelMock(jobId: string): Promise<void> {
  if (__DEV__) console.log(`[compose-movie][mock] edit job ${jobId} canceled`);
  return Promise.resolve();
}

/**
 * Stop a queued or running run (`DELETE /edit-jobs/{id}`).
 *
 * The server is the one that actually stops it: a `queued` job leaves the queue,
 * a `processing` one is abandoned by the worker at its next progress update, and
 * either way the job's terminal state is `canceled` and its result video is
 * deleted — a canceled run never resurrects as `done`. Re-canceling an already
 * canceled job is a 200 (idempotent).
 *
 * Refusals surface as `ApiError`s for the caller to interpret: a `409` means the
 * run already ended (`done`/`failed`) and there is nothing left to stop, and a
 * `404` means the backend has never heard of the job. Both are answered by
 * `useComposeMovie.cancelGeneration`, which owns what each does to the movie.
 *
 * Routes to the mock until an API origin is configured.
 */
export function cancelEditJob(jobId: string, signal?: AbortSignal): Promise<void> {
  return USE_MOCK_API ? cancelMock(jobId) : cancelFromApi(jobId, signal);
}
