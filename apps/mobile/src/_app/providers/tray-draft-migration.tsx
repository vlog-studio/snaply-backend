import { useEffect } from 'react';

import { useCreateMovie, useMoviesHydrated } from '@/entities/movie';
import { localStore } from '@/shared/lib/local-store';

/** The removed tray store's persistence key, still on disk from older builds. */
const LegacyTrayKey = 'snaply.tray';

/**
 * Promotes a leftover 담기 트레이 to a draft movie, once, then deletes the key.
 *
 * The tray was removed on 2026-08-12 — picks become a draft movie directly —
 * but a device that last ran an older build may still hold snaps in
 * `snaply.tray`, and dropping them silently would lose picks the user made on
 * purpose. A draft is exactly what those picks were headed for, so that is what
 * they become; in pick order, `user`-arranged, like every hand-picked movie.
 *
 * Startup work rather than a feature, like `SnapDurationBackfill`: nothing here
 * is an action the user takes. It waits for the movie store to hydrate because
 * a write that lands before hydration is overwritten by it, and it removes the
 * key afterwards so the promotion can never run twice. Delete this provider
 * once every device has run a build that carries it.
 */
export function TrayDraftMigration(): null {
  const hydrated = useMoviesHydrated();
  const createMovie = useCreateMovie();

  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;

    void (async () => {
      const raw = await localStore.getItem(LegacyTrayKey);
      if (cancelled || raw === null) return;
      try {
        // The zustand persist envelope the tray store wrote: { state, version }.
        const persisted = JSON.parse(raw) as { state?: { snapIds?: unknown } };
        const snapIds = Array.isArray(persisted.state?.snapIds)
          ? persisted.state.snapIds.filter((id): id is string => typeof id === 'string')
          : [];
        if (snapIds.length > 0) createMovie({ snapIds, arranger: 'user' });
      } catch {
        // An unreadable tray holds nothing recoverable; removing the key below
        // is all that is left to do.
      }
      await localStore.removeItem(LegacyTrayKey);
    })();

    return () => {
      cancelled = true;
    };
  }, [hydrated, createMovie]);

  return null;
}
