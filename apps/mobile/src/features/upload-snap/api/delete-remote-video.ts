import { z } from 'zod';

import { ApiError, apiPath, apiRequest } from '@/shared/api';
import { USE_MOCK_API } from '@/shared/config/api';

async function deleteFromApi(videoId: string, signal?: AbortSignal): Promise<void> {
  try {
    await apiRequest(apiPath('/videos/{id}', { id: videoId }), {
      method: 'DELETE',
      schema: z.unknown(),
      signal,
    });
  } catch (error) {
    // A 404 is the outcome this call wanted, reached without it: the row is
    // already deleted, or was never this account's (the backend answers both
    // the same way, on purpose). Reporting it as a failure is what turned a
    // dead videoId into a tombstone retried at every launch forever, so the
    // absence of the video counts as its deletion.
    if (error instanceof ApiError && error.status === 404) return;
    throw error;
  }
}

function deleteMock(videoId: string): Promise<void> {
  if (__DEV__) console.log(`[upload-snap][mock] remote video deleted: ${videoId}`);
  return Promise.resolve();
}

/**
 * Delete a snap's remote copy (`DELETE /videos/{id}`). Called by the upload
 * worker when it drains the delete tombstones that `features/delete-snap`
 * leaves behind. Resolves when the video is gone, whether this call is what
 * removed it or it was already gone; only a delete that might still succeed
 * later rejects. Routes to the mock until an API origin is configured.
 */
export function deleteRemoteVideo(videoId: string, signal?: AbortSignal): Promise<void> {
  return USE_MOCK_API ? deleteMock(videoId) : deleteFromApi(videoId, signal);
}
