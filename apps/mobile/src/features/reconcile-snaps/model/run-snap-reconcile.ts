import {
  applyServerSnapState,
  deleteSnapFile,
  getDeleteTombstones,
  getServerSnaps,
  getSnaps,
  getSnapSyncEntries,
  lookupServerSnaps,
  mergeServerSnaps,
  removeSnaps,
} from '@/entities/snap';
import { deleteServerSnapFile, serverSnapFileUri } from '@/shared/lib/server-snap-files';
import { deleteVideoThumbnail, primeVideoThumbnail } from '@/shared/lib/video-thumbnails';

import { liveVideoIds, planSnapReconcile, videoIdsToLookUp } from '../lib/plan-snap-reconcile';

/**
 * One reconcile pass: read the server's list, ask about what left it, and apply
 * the plan.
 *
 * `isCancelled` is checked after every network call and before anything is
 * written. The pass belongs to the account that was signed in when it started;
 * a sign-out or account switch in the middle must not write that account's
 * server state into the next account's library. Any failure throws before the
 * first write — a pass is applied whole or not at all.
 */
export async function runSnapReconcile(isCancelled: () => boolean, signal?: AbortSignal) {
  const remoteSnaps = await getServerSnaps(signal);
  if (isCancelled()) return;

  const live = liveVideoIds(remoteSnaps);
  const asked = videoIdsToLookUp({ snaps: getSnaps(), entries: getSnapSyncEntries() }, live);
  const fates = await lookupServerSnaps(asked, signal);
  if (isCancelled()) return;

  const plan = planSnapReconcile(
    { snaps: getSnaps(), entries: getSnapSyncEntries(), tombstones: getDeleteTombstones() },
    { snaps: remoteSnaps, asked: new Set(asked), fates },
    serverSnapFileUri,
  );

  // Covers first, so a cell drawn for a new snap finds its frame on the way
  // rather than trying to extract one from a video that is not here.
  for (const { uri, url } of plan.thumbnails) void primeVideoThumbnail(uri, url);

  // Entries before snaps: a snap from elsewhere must be `uploaded` the moment
  // it appears, or the upload worker would take it for a new capture.
  applyServerSnapState({ entries: plan.entries, dropped: [] });
  mergeServerSnaps(plan.merge);

  // Files before metadata, for the reason delete-snap gives: the file is the
  // step that can fail, and a snap whose file could not go stays whole.
  const removedIds: string[] = [];
  for (const removal of plan.removed) {
    try {
      await deleteSnapFile(removal.uri);
    } catch (error) {
      if (__DEV__)
        console.warn(`[reconcile-snaps] could not delete ${removal.uri}:`, String(error));
      continue;
    }
    removedIds.push(removal.snapId);
    try {
      deleteVideoThumbnail(removal.uri);
    } catch {
      // A derived cache; the snap is already gone.
    }
  }
  removeSnaps(removedIds);
  const removed = new Set(plan.removed.map((removal) => removal.snapId));
  applyServerSnapState({
    entries: {},
    // A removal whose file refused to go keeps its entry, and is asked about again next time.
    dropped: plan.dropped.filter((snapId) => !removed.has(snapId) || removedIds.includes(snapId)),
  });

  for (const uri of plan.evicted) {
    try {
      deleteServerSnapFile(uri);
    } catch {
      // Only a cache; the next pass does not need it gone to be right.
    }
  }
}
