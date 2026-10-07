import { z } from 'zod';

import { apiPath, apiRequest } from '@/shared/api';
import { USE_MOCK_API } from '@/shared/config/api';

/** The restored video. Only its id is read: the snap comes back through the library's reconcile. */
const restoredDtoSchema = z.object({ id: z.string() });

/**
 * Brings a deleted snap back (`POST /videos/{id}/restore`). Idempotent: a snap
 * that is live already answers as restored. `409 NOT_RESTORABLE` (its retention
 * ended, or it was deleted before files were kept) and `404` are the caller's
 * to read from `ApiError`.
 */
export async function restoreServerSnap(videoId: string): Promise<void> {
  if (USE_MOCK_API) return;
  await apiRequest(apiPath('/videos/{id}/restore', { id: videoId }), {
    method: 'POST',
    schema: restoredDtoSchema,
  });
}
