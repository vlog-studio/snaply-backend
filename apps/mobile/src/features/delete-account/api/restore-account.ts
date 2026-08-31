import { z } from 'zod';

import { apiRequest } from '@/shared/api';
import { USE_MOCK_API } from '@/shared/config/api';

async function restoreAccountFromApi(signal?: AbortSignal): Promise<void> {
  // The response body (`{ restored: true }`) carries no information beyond
  // success, so it is accepted permissively.
  await apiRequest('/auth/me/restore', {
    method: 'POST',
    schema: z.unknown(),
    signal,
  });
}

function restoreAccountMock(): Promise<void> {
  if (__DEV__) console.log('[account][mock] account restored');
  return Promise.resolve();
}

/**
 * Restore a soft-deleted account inside its grace period
 * (`POST /auth/me/restore`). Only `deletedAt` is reverted server-side — the
 * subscription, SNS connections, and FCM token cleaned up at deletion time do
 * not come back. Routes to the mock until an API origin is configured.
 */
export function restoreAccount(signal?: AbortSignal): Promise<void> {
  return USE_MOCK_API ? restoreAccountMock() : restoreAccountFromApi(signal);
}
