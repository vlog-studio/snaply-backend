import {
  orientationOf,
  SNAP_STAND_IN_SIZE,
  type ServerSnap,
  type ServerSnapFate,
  type Snap,
  type SnapSyncEntry,
} from '@/entities/snap';

/**
 * What this device holds when the plan is made. Read fresh right before
 * planning — the upload worker and the user keep changing it while the
 * network calls are out.
 */
export type ReconcileLocal = {
  snaps: readonly Snap[];
  entries: Readonly<Record<string, SnapSyncEntry>>;
  /** Server video ids a local delete still owes a `DELETE` for. */
  tombstones: readonly string[];
};

export type ReconcileRemote = {
  /** The server's whole snap list. Must be complete — see {@link planSnapReconcile}. */
  snaps: readonly ServerSnap[];
  /** The video ids that were asked about, and what the server answered for each. */
  asked: ReadonlySet<string>;
  fates: ReadonlyMap<string, ServerSnapFate>;
};

/** A snap to take off this device, with the file it leaves behind. */
export type SnapRemoval = { snapId: string; uri: string };

export type ReconcilePlan = {
  /** Snaps to merge into the library: new ones from elsewhere, and refreshed ones. */
  merge: Snap[];
  /** Cover frames to fetch for the snaps from elsewhere; one already cached is kept. */
  thumbnails: { uri: string; url: string }[];
  /** Sync entries to set. */
  entries: Record<string, SnapSyncEntry>;
  /** Sync entries to drop, leaving no tombstone. */
  dropped: string[];
  /** Snaps to remove, file and all — deleted on another device, or gone from the server. */
  removed: SnapRemoval[];
  /** Fetched copies to delete while the snap itself stays (as expired). */
  evicted: string[];
};

/**
 * The server video ids worth asking about: this device's uploaded snaps that
 * the server's list no longer has. Snaps already recorded as expired are not
 * asked about again — expiry is final.
 */
export function videoIdsToLookUp(
  local: Pick<ReconcileLocal, 'snaps' | 'entries'>,
  liveIds: ReadonlySet<string>,
): string[] {
  const held = new Set(local.snaps.map((snap) => snap.id));
  const ids: string[] = [];
  for (const [snapId, entry] of Object.entries(local.entries)) {
    if (entry.status !== 'uploaded' || !held.has(snapId)) continue;
    if (!liveIds.has(entry.videoId)) ids.push(entry.videoId);
  }
  return ids;
}

/** The ids of the server's finished uploads — the list's "these exist". */
export function liveVideoIds(remote: readonly ServerSnap[]): Set<string> {
  return new Set(remote.filter((snap) => snap.ready).map((snap) => snap.videoId));
}

/** How far apart two capture times may be and still be the same snap. */
const SameCaptureToleranceMs = 1_000;

function snapFromServer(remote: ServerSnap, uriOf: (videoId: string) => string): Snap {
  const size =
    remote.width !== undefined && remote.height !== undefined
      ? { width: remote.width, height: remote.height, dimensionsMeasured: true as const }
      : SNAP_STAND_IN_SIZE;
  return {
    id: remote.videoId,
    uri: uriOf(remote.videoId),
    origin: 'server',
    durationSec: remote.durationSec,
    ...(remote.durationMeasured ? { durationMeasured: true } : null),
    capturedAt: remote.capturedAt,
    ...size,
    orientation: orientationOf(size.width, size.height),
  };
}

function uploadedEntry(remote: ServerSnap): SnapSyncEntry {
  return {
    status: 'uploaded',
    videoId: remote.videoId,
    ...(remote.expiresAt !== undefined ? { expiresAt: remote.expiresAt } : null),
  };
}

/**
 * Decides how this device's library meets the server's (docs/plans/snap-reconcile.md §4.1).
 *
 * Adding is the easy half: a finished upload this device has never heard of is
 * a snap shot somewhere else, and it joins the library under its server id,
 * already `uploaded`, its file to be fetched when played.
 *
 * Removing is the dangerous half, and two rules keep it safe:
 * - **Nothing is removed for being absent from the list.** Absence only earns a
 *   question (`asked`); a snap is taken off only when the server answers why.
 * - The caller hands in a list that is **complete** — every page read — and
 *   plans nothing when any request failed. A missing page would otherwise
 *   look like deleted snaps.
 *
 * What the server answered decides the rest:
 * - deleted by the user (on another device) → removed here too, file and all
 *   (SNAP-16). Movies are left to the movie sync: the device that deleted it
 *   has already sent its movies without the cut.
 * - expired → this device's own snap keeps its file and is marked expired
 *   (SNAP-12, SNAP-14); a fetched copy of someone else's is evicted, the snap
 *   staying as a record of what expired.
 * - no such row → this device's own snap is uploaded again, since its file is
 *   the source; a snap from elsewhere has nothing left anywhere and goes.
 */
export function planSnapReconcile(
  local: ReconcileLocal,
  remote: ReconcileRemote,
  uriOf: (videoId: string) => string,
): ReconcilePlan {
  const plan: ReconcilePlan = {
    merge: [],
    thumbnails: [],
    entries: {},
    dropped: [],
    removed: [],
    evicted: [],
  };

  const snapsById = new Map(local.snaps.map((snap) => [snap.id, snap]));
  const snapIdByVideo = new Map<string, string>();
  for (const [snapId, entry] of Object.entries(local.entries)) {
    if ((entry.status === 'uploaded' || entry.status === 'expired') && snapsById.has(snapId)) {
      snapIdByVideo.set(entry.videoId, snapId);
    }
  }
  for (const snap of local.snaps) {
    if (snap.origin === 'server') snapIdByVideo.set(snap.id, snap.id);
  }
  const tombstoned = new Set(local.tombstones);

  for (const remoteSnap of remote.snaps) {
    if (!remoteSnap.ready) continue;

    const known = snapIdByVideo.get(remoteSnap.videoId);
    if (known !== undefined) {
      plan.entries[known] = uploadedEntry(remoteSnap);
      const held = snapsById.get(known);
      if (held?.origin === 'server') {
        plan.merge.push(snapFromServer(remoteSnap, uriOf));
        // A cover the OS reclaimed with the cache comes back; one still cached costs a lookup.
        if (remoteSnap.thumbnailUrl) {
          plan.thumbnails.push({ uri: held.uri, url: remoteSnap.thumbnailUrl });
        }
      }
      continue;
    }

    // The device that shot it may have lost the record of the upload — an app
    // killed between the server's answer and the store write, or a store file
    // that did not survive. Its own name for the snap finds it again, and the
    // capture time guards against another device's snap of the same name.
    const own = remoteSnap.clientId ? snapsById.get(remoteSnap.clientId) : undefined;
    if (
      own &&
      own.origin !== 'server' &&
      Math.abs(own.capturedAt - remoteSnap.capturedAt) <= SameCaptureToleranceMs
    ) {
      // Already uploaded under another row: a duplicate upload of the same
      // snap, which is not a second snap either.
      if (local.entries[own.id]?.status !== 'uploaded') {
        plan.entries[own.id] = uploadedEntry(remoteSnap);
      }
      continue;
    }

    // Deleted here a moment ago and the DELETE is still owed; bringing it back
    // would undo the user's delete.
    if (tombstoned.has(remoteSnap.videoId)) continue;

    const snap = snapFromServer(remoteSnap, uriOf);
    plan.merge.push(snap);
    plan.entries[snap.id] = uploadedEntry(remoteSnap);
    if (remoteSnap.thumbnailUrl)
      plan.thumbnails.push({ uri: snap.uri, url: remoteSnap.thumbnailUrl });
  }

  for (const [snapId, entry] of Object.entries(local.entries)) {
    if (entry.status !== 'uploaded' || !remote.asked.has(entry.videoId)) continue;
    const snap = snapsById.get(snapId);
    if (!snap) continue;
    const fromElsewhere = snap.origin === 'server';
    const fate = remote.fates.get(entry.videoId);

    if (fate?.state === 'live') continue;
    if (fate?.state === 'removed' && fate.reason === 'expired') {
      plan.entries[snapId] = { status: 'expired', videoId: entry.videoId };
      if (fromElsewhere) plan.evicted.push(snap.uri);
      continue;
    }
    if (fate?.state === 'removed' || fromElsewhere) {
      plan.removed.push({ snapId, uri: snap.uri });
      plan.dropped.push(snapId);
      continue;
    }
    // No row at all, for a snap whose file is here: upload it again.
    plan.dropped.push(snapId);
  }

  return plan;
}
