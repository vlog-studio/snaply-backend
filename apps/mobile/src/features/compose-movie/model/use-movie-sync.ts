import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import {
  applyRemoteMovies,
  getMovies,
  useMovieOutbox,
  useMoviesHydrated,
  useMoviesSynced,
} from '@/entities/movie';
import { useIsAuthenticated } from '@/entities/session';
import { useSnapSyncEntries, useSnapSyncHydrated } from '@/entities/snap';

import { drainMovieOutbox, snapResolvers } from './movie-outbox';

/**
 * Keeps this device's movies and the server's in step, both ways.
 *
 * **Down**: the server's list is read once per account (the store's `hasSynced`
 * goes false when the account changes) and again on every return to the
 * foreground — a movie made or finished on another device, or a run that ended
 * while the app was away, arrives that way. The read merges (`applyRemoteMovies`):
 * a movie with a pending write here keeps its local state, everything else takes
 * the server's, and a run this device has not followed is handed to the
 * generation runner as an adopted job.
 *
 * **Up**: the outbox is drained whenever it may have gained something the
 * server can take — an edit, a delete, or an upload finishing, which is what
 * lets a movie holding that snap be sent at all. Drains are serial by
 * construction (one loop owns the pass; triggers landing mid-pass queue one
 * more), and a movie whose send is refused or fails simply stays pending for
 * the next trigger.
 *
 * Mounted once for the whole app (`MovieSyncGate`) and only while signed in:
 * every request here is the account's.
 */
export function useMovieSync(): void {
  const isAuthenticated = useIsAuthenticated();
  const moviesHydrated = useMoviesHydrated();
  const syncHydrated = useSnapSyncHydrated();
  const synced = useMoviesSynced();
  const outbox = useMovieOutbox();
  const entries = useSnapSyncEntries();
  const kickRef = useRef<(() => void) | undefined>(undefined);

  const enabled = isAuthenticated && moviesHydrated && syncHydrated;

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let running = false;
    let queuedPass = false;

    const pull = async () => {
      try {
        const remote = await getMovies(snapResolvers().snapIdOf);
        if (!cancelled) applyRemoteMovies(remote);
      } catch (error) {
        // The cache stands in until the next chance; nothing on screen is
        // wrong, only possibly behind.
        if (__DEV__) console.warn('[compose-movie] could not read movies:', String(error));
      }
    };

    const drain = async () => {
      if (running) {
        queuedPass = true;
        return;
      }
      running = true;
      try {
        do {
          queuedPass = false;
          await drainMovieOutbox(() => cancelled);
        } while (queuedPass && !cancelled);
      } finally {
        running = false;
      }
    };

    kickRef.current = () => void drain();
    const subscription = AppState.addEventListener('change', (status) => {
      if (status === 'active') {
        void pull();
        void drain();
      }
    });
    void drain();

    return () => {
      cancelled = true;
      kickRef.current = undefined;
      subscription.remove();
    };
  }, [enabled]);

  // The first read for an account: `hasSynced` is false until it lands, and
  // goes false again when the account changes.
  useEffect(() => {
    if (!enabled || synced) return;
    let cancelled = false;
    void (async () => {
      try {
        const remote = await getMovies(snapResolvers().snapIdOf);
        if (!cancelled) applyRemoteMovies(remote);
      } catch (error) {
        if (__DEV__) console.warn('[compose-movie] could not read movies:', String(error));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, synced]);

  // The values themselves are unused — their identity changing is the signal
  // that the outbox may hold something sendable now.
  useEffect(() => {
    void outbox;
    void entries;
    kickRef.current?.();
  }, [outbox, entries]);
}
