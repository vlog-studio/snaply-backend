import { useEffect } from 'react';

import { useCurrentUser, useSessionHydrated } from '@/entities/session';

import { purgeExpiredLibraries } from '../model/purge-local-library';

/**
 * Mount point for the deleted-account cleanup. Rendered once for the whole app
 * (`_app/providers`): the libraries it deletes belong to accounts that are not
 * signed in and have no screen of their own, so there is nowhere else for this
 * to live.
 *
 * It runs when the session settles and again whenever the signed-in account
 * changes, which is when the answer can differ — an account that was skipped as
 * "signed in" a moment ago is fair game once it signs out.
 */
export function DeletedLibraryPurgeGate(): null {
  const hydrated = useSessionHydrated();
  const userId = useCurrentUser()?.id ?? null;

  useEffect(() => {
    if (!hydrated) return;
    void purgeExpiredLibraries({ now: Date.now(), signedInUserId: userId });
  }, [hydrated, userId]);

  return null;
}
