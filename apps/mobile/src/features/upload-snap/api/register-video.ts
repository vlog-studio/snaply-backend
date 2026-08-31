import { z } from 'zod';

import { apiRequest } from '@/shared/api';
import { USE_MOCK_API } from '@/shared/config/api';

async function registerFromApi(
  videoId: string,
  durationSeconds: number,
  signal?: AbortSignal,
): Promise<void> {
  // The response body is not needed — success of the envelope is the signal.
  await apiRequest('/videos', {
    method: 'POST',
    body: { videoId, durationSeconds },
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
 * round the snap's measured length. Routes to the mock until an API origin is
 * configured.
 */
export function registerVideo(
  videoId: string,
  durationSeconds: number,
  signal?: AbortSignal,
): Promise<void> {
  return USE_MOCK_API ? registerMock(videoId) : registerFromApi(videoId, durationSeconds, signal);
}
