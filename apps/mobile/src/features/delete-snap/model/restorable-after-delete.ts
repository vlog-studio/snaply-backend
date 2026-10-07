import type { SnapSyncEntry } from '@/entities/snap';

/**
 * The server copy a delete everywhere leaves behind for 최근 삭제 (SNAP-20), or
 * `undefined` when the delete cannot be undone: the upload has finished and the
 * copy's retention has not ended — the same copy the server then keeps until
 * that retention runs out. A snap from another device counts too; it was never
 * anything but that copy here.
 *
 * Not uploaded yet, or already expired, there is no copy, and the delete is
 * final. A copy whose expiry is not known yet was registered moments ago.
 */
export function restorableAfterDelete(
  entry: SnapSyncEntry | undefined,
  now: number = Date.now(),
): { videoId: string; until?: number } | undefined {
  if (entry?.status !== 'uploaded') return undefined;
  if (entry.expiresAt !== undefined && entry.expiresAt <= now) return undefined;
  return {
    videoId: entry.videoId,
    ...(entry.expiresAt !== undefined ? { until: entry.expiresAt } : null),
  };
}
