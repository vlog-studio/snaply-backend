import type { Snap, SnapSyncEntry } from '@/entities/snap';

/**
 * Whether a snap can be deleted from this device only (SNAP-19): its file here is
 * the original, its upload has finished, and the server's copy is still kept —
 * so once the file is gone there is still something to play it from, to put it
 * in a movie with, and to save it to the album from.
 *
 * The rest have nothing to choose between. A snap not uploaded yet, or whose
 * copy has expired, exists only here; a snap from another device already plays
 * from the server's copy. Deleting any of them is the one ordinary delete.
 *
 * A copy whose expiry is not known yet was registered moments ago and is there.
 */
export function canDeleteFromDevice(
  snap: Pick<Snap, 'id' | 'origin'>,
  entry: SnapSyncEntry | undefined,
  now: number = Date.now(),
): boolean {
  if (snap.origin === 'server') return false;
  if (entry?.status !== 'uploaded') return false;
  return entry.expiresAt === undefined || entry.expiresAt > now;
}
