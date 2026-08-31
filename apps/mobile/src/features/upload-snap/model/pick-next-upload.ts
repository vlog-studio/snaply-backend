import type { Snap, SnapSyncEntry } from '@/entities/snap';

/**
 * Automatic retries stop after this many failures; the snap then waits for a
 * manual "다시 시도" (which clears its failed entry) or keeps its failed badge.
 * Persisted with the entry, so an app restart does not resume hammering a
 * file the backend has rejected five times.
 */
export const MaxAutoUploadAttempts = 5;

/**
 * The next snap the worker should upload, oldest capture first — the queue is
 * derived from state, never stored. A snap qualifies when nothing has been
 * recorded about it (`pending`), or when it failed retryably and is not
 * currently held back by the worker's in-memory backoff (`blockedIds`).
 * Oldest-first because earlier snaps are likelier to be picked into a movie.
 */
export function pickNextUpload(
  snaps: readonly Snap[],
  entries: Record<string, SnapSyncEntry>,
  blockedIds: ReadonlySet<string>,
): Snap | undefined {
  let candidate: Snap | undefined;
  for (const snap of snaps) {
    if (blockedIds.has(snap.id)) continue;
    const entry = entries[snap.id];
    if (entry !== undefined) {
      if (entry.status !== 'failed') continue;
      if (entry.attempts >= MaxAutoUploadAttempts) continue;
    }
    if (candidate === undefined || snap.capturedAt < candidate.capturedAt) candidate = snap;
  }
  return candidate;
}
