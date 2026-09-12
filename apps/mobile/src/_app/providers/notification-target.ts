import type { Href } from 'expo-router';

import { movieHref } from '@/shared/routes';

/** The snap library tab — where an expiry notice has to land (SNAP-13). */
export const SnapLibraryHref: Href = '/snaps';

/**
 * Where a tapped notification should take the user, from the data it carried.
 *
 * The `kind` vocabulary is the server's (`movie_ready`, `snap_expiry`, sent as
 * FCM `data`) plus the one local notice the app still raises itself
 * (`movie_failed`, `features/compose-movie`). A notification with no kind this
 * build knows — an older payload, a kind added later — resolves to nothing, and
 * the tap just opens the app, which is what it did before any routing existed.
 */
export function notificationTarget(data: unknown): Href | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const { kind, movieId } = data as Record<string, unknown>;
  switch (kind) {
    case 'movie_ready':
    case 'movie_failed':
      return typeof movieId === 'string' && movieId.length > 0 ? movieHref(movieId) : undefined;
    case 'snap_expiry':
      return SnapLibraryHref;
    default:
      return undefined;
  }
}
