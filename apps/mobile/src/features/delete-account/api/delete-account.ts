import { z } from 'zod';

import { apiRequest } from '@/shared/api';
import { USE_MOCK_API } from '@/shared/config/api';

/**
 * When the soft-deleted account is purged for real. Everything else the
 * deletion does (subscription cancel, SNS/FCM cleanup, job cancellation)
 * happens server-side and is not part of the client's contract.
 */
export type AccountDeletion = {
  purgeAfter: Date;
};

const accountDeletionDtoSchema = z.object({
  purgeAfter: z.string(),
});

async function deleteAccountFromApi(signal?: AbortSignal): Promise<AccountDeletion> {
  const dto = await apiRequest('/auth/me', {
    method: 'DELETE',
    schema: accountDeletionDtoSchema,
    signal,
  });
  return { purgeAfter: new Date(dto.purgeAfter) };
}

// Mirrors the backend's 30-day grace period so the mock reads like the real
// response; the value is display-only and the backend stays authoritative.
function deleteAccountMock(): Promise<AccountDeletion> {
  if (__DEV__) console.log('[account][mock] account soft-deleted');
  return Promise.resolve({ purgeAfter: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) });
}

/**
 * Soft-delete the signed-in account (`DELETE /auth/me`): the backend starts
 * the 30-day grace period and returns when the purge becomes final. Routes to
 * the mock until an API origin is configured.
 */
export function deleteAccount(signal?: AbortSignal): Promise<AccountDeletion> {
  return USE_MOCK_API ? deleteAccountMock() : deleteAccountFromApi(signal);
}
