import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { clearPendingDeletion, useCurrentUser } from '@/entities/session';
import { ApiError } from '@/shared/api';

import { restoreAccount } from '../api/restore-account';

import { forgetDeletedAccount } from './deleted-account-ledger';

const RESTORE_ERROR_MESSAGE = '계정을 복구하지 못했어요. 다시 시도해 주세요.';

/**
 * The restore action for an account inside its deletion grace period.
 * Clearing the pending-deletion flag is what releases the route guard back
 * into the app, so the hook never navigates. Queries are invalidated because
 * everything fetched while blocked errored with the 403.
 *
 * The backend answers `400 BAD_REQUEST` when the account is not pending
 * deletion — the flag is stale in that case, so it is cleared the same way.
 *
 * An account that is back is owed no cleanup, so its ledger entry goes with the
 * flag: whichever way the account turns out to be active, its local library
 * stops being scheduled for deletion.
 */
export function useRestoreAccount() {
  const queryClient = useQueryClient();
  const user = useCurrentUser();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(): Promise<void> {
    if (isPending) return;
    setIsPending(true);
    setError(null);
    try {
      await restoreAccount();
      if (user) await forgetDeletedAccount(user.id);
      await queryClient.invalidateQueries();
      clearPendingDeletion();
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 400) {
        if (user) await forgetDeletedAccount(user.id);
        clearPendingDeletion();
      } else {
        setError(RESTORE_ERROR_MESSAGE);
      }
    } finally {
      setIsPending(false);
    }
  }

  return { restoreAccount: run, isPending, error };
}
