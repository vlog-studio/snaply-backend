import { z } from 'zod';

import { apiRequest } from '@/shared/api';
import { USE_MOCK_API } from '@/shared/config/api';

async function registerFromApi(
  videoId: string,
  durationSeconds: number,
  capturedAt: string,
  signal?: AbortSignal,
): Promise<void> {
  // The response body is not needed — success of the envelope is the signal.
  await apiRequest('/videos', {
    method: 'POST',
    body: { videoId, durationSeconds, capturedAt },
    schema: z.unknown(),
    signal,
  });
}

function registerMock(videoId: string): Promise<void> {
  if (__DEV__) console.log(`[upload-snap][mock] video registered ready: ${videoId}`);
  return Promise.resolve();
}

/**
 * Tell the backend the presigned upload finished (`POST /videos`), moving the
 * video row to `ready`. `durationSeconds` is the spec's integer, so callers
 * round the snap's measured length.
 *
 * `capturedAt` is the snap's own capture time as ISO 8601. The server has no
 * way to recover it later — a snap registered without it keeps `null` forever
 * and falls back to its upload time for ordering — so it travels with the
 * registration rather than in a follow-up call.
 *
 * Routes to the mock until an API origin is configured.
 */
export function registerVideo(
  videoId: string,
  durationSeconds: number,
  capturedAt: number,
  signal?: AbortSignal,
): Promise<void> {
  return USE_MOCK_API
    ? registerMock(videoId)
    : registerFromApi(videoId, durationSeconds, new Date(capturedAt).toISOString(), signal);
}
