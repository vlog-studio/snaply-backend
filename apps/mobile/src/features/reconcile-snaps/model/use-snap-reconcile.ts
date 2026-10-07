import { useEffect } from 'react';
import { AppState } from 'react-native';

import { useIsAuthenticated } from '@/entities/session';
import { useSnapsHydrated, useSnapSyncHydrated } from '@/entities/snap';
import { USE_MOCK_API } from '@/shared/config/api';

import { runSnapReconcile } from './run-snap-reconcile';
import { onSnapReconcileRequest } from './snap-reconcile-requests';

/**
 * Keeps this device's snap library in step with the account's snaps on the
 * server (SNAP-15, SNAP-16): snaps shot on another device or before a
 * reinstall come in, snaps deleted elsewhere go, and snaps whose server copy
 * expired are marked so (SNAP-12).
 *
 * Runs when an account's library is bound, on every return to the foreground —
 * the same moments the movie sync reads the server's movies — and whenever a
 * screen asks for a pass (`requestSnapReconcile`, after a restore). A
 * pass is serial by construction: one runs at a time, and a trigger landing
 * mid-pass queues exactly one more. A pass that fails leaves everything as it
 * was, and the next trigger starts over.
 *
 * Off in mock mode, where there is no server to meet, and while signed out,
 * where the library is nobody's.
 */
export function useSnapReconcile(): void {
  const isAuthenticated = useIsAuthenticated();
  const snapsHydrated = useSnapsHydrated();
  const syncHydrated = useSnapSyncHydrated();

  const enabled = !USE_MOCK_API && isAuthenticated && snapsHydrated && syncHydrated;

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let running = false;
    let queuedPass = false;
    const controller = new AbortController();
    const isCancelled = () => cancelled;

    const reconcile = async () => {
      if (running) {
        queuedPass = true;
        return;
      }
      running = true;
      try {
        do {
          queuedPass = false;
          try {
            await runSnapReconcile(isCancelled, controller.signal);
          } catch (error) {
            // Nothing was written; the library stands as it was until the next chance.
            if (__DEV__ && !cancelled) {
              console.warn('[reconcile-snaps] could not reconcile snaps:', String(error));
            }
          }
        } while (queuedPass && !cancelled);
      } finally {
        running = false;
      }
    };

    const subscription = AppState.addEventListener('change', (status) => {
      if (status === 'active') void reconcile();
    });
    const unsubscribeRequests = onSnapReconcileRequest(() => void reconcile());
    void reconcile();

    return () => {
      cancelled = true;
      controller.abort();
      subscription.remove();
      unsubscribeRequests();
    };
  }, [enabled]);
}
