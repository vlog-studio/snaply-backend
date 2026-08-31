import { useEffect } from 'react';

import { applyMovieScope } from '@/entities/movie';
import { useCurrentUser, useSessionHydrated } from '@/entities/session';
import { applySnapScope, applySnapSyncScope } from '@/entities/snap';
import type { StoreScope } from '@/shared/lib/scoped-store';

import { queryClient } from './query-client';

/** The scope the local library is currently bound to; `undefined` = not yet bound. */
let boundScope: StoreScope | undefined;

/**
 * Hands the local library to whoever is signed in: the snaps, the movies, and
 * the upload state each swap to that account's own store file, and the query
 * cache — which is keyed by request, not by account — is dropped so no answer
 * the backend gave one account is shown to the next.
 *
 * The device holds several accounts' libraries at once, and until this ran they
 * were one pile: an account that signed in second saw the first one's snaps and
 * movies, and its upload worker would have carried them to the backend under
 * its own token.
 *
 * Signing out binds the empty scope rather than erasing anything. A local
 * library has no copy anywhere else, so signing out must not be what destroys
 * it — the snaps come back when their owner does.
 */
export function LibraryScopeGate(): null {
  const hydrated = useSessionHydrated();
  const userId = useCurrentUser()?.id ?? null;

  useEffect(() => {
    // Before the session is read back, "nobody is signed in" is not yet a fact.
    if (!hydrated) return;
    void bindLibraryTo(userId);
  }, [hydrated, userId]);

  return null;
}

async function bindLibraryTo(scope: StoreScope): Promise<void> {
  if (scope === boundScope) return;
  boundScope = scope;
  queryClient.clear();
  await Promise.all([applySnapScope(scope), applySnapSyncScope(scope), applyMovieScope(scope)]);
}
