import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { useIsAuthenticated } from '@/entities/session';
import {
  addSnapDeleteTombstone,
  clearSnapDeleteTombstone,
  getDeleteTombstones,
  getSnaps,
  getSnapSyncEntries,
  markSnapDeleteFailed,
  markSnapUploaded,
  markSnapUploadFailed,
  markSnapUploading,
  useDeleteTombstones,
  useSnaps,
  useSnapsHydrated,
  useSnapSyncEntries,
  useSnapSyncHydrated,
  type Snap,
} from '@/entities/snap';

import { deleteRemoteVideo } from '../api/delete-remote-video';
import { putRecordingFile } from '../api/put-recording-file';
import { registerVideo } from '../api/register-video';
import { requestUploadUrl } from '../api/request-upload-url';
import { videoContentType } from '../lib/video-content-type';

import { MaxAutoUploadAttempts, pickNextUpload } from './pick-next-upload';

/**
 * Waits between automatic retries of one snap, by how often it has failed.
 * In-memory only: a restart retries immediately, which is the right reading of
 * "the app came back" — the failure may have been the network's.
 */
const RetryDelaysMs = [5_000, 30_000, 120_000];

/**
 * A remote delete that keeps being refused is given up on after this many
 * recorded failures, and its tombstone is dropped.
 *
 * Uploads can wait for a manual "다시 시도" because a snap that failed to
 * upload is on screen with a badge on it; an owed delete has no surface and no
 * user waiting on it, so an unbounded queue of them is only a queue of requests
 * replayed at every launch forever. The count is persisted with the tombstone,
 * so five launches against a delete the server will never accept end it — at
 * the price of possibly leaving a remote copy behind, which is the cheaper
 * failure of the two.
 */
const MaxRemoteDeleteAttempts = 5;

/** The spec's `durationSeconds` is an integer within a day. */
function toDurationSeconds(durationSec: number): number {
  return Math.min(86_400, Math.max(0, Math.round(durationSec)));
}

function isSnapGone(snapId: string): boolean {
  return !getSnaps().some((snap) => snap.id === snapId);
}

/**
 * Carries every snap to the backend, one at a time, without ever being asked.
 *
 * Capture stays local-first: `features/capture-moment` writes a snap into the
 * library and knows nothing about uploads. This worker subscribes to the
 * library and treats its own absence of a sync entry as the queue — so a new
 * capture, a signed-out backlog, and a transfer the app died inside all become
 * "snaps whose status is pending", found and uploaded the same way.
 *
 * Per snap the pipeline is the backend's three steps: presign
 * (`GET /videos/upload-url`), PUT the bytes, register ready (`POST /videos`).
 * Any failure marks the snap failed and backs off; after
 * {@link MaxAutoUploadAttempts} it waits for a manual retry. Deletions owe the
 * server too: the worker also drains the tombstones `features/delete-snap`
 * leaves in the sync store, and a snap deleted mid-upload leaves one behind if
 * its remote row was already registered. Those get the same treatment as an
 * upload — one attempt at a time, a backoff between failures, and an end after
 * {@link MaxRemoteDeleteAttempts} of them.
 *
 * Runs only while authenticated (the endpoints tie videos to the caller) and
 * strictly serially — a few-MB file every few seconds does not need
 * parallelism, and one transfer at a time keeps capture bandwidth free.
 * Foreground-only by design: a transfer cut off by backgrounding simply fails
 * and is retried when the app is active again (the AppState listener below).
 */
export function useUploadWorker(): void {
  const isAuthenticated = useIsAuthenticated();
  const snapsHydrated = useSnapsHydrated();
  const syncHydrated = useSnapSyncHydrated();
  const snaps = useSnaps();
  const entries = useSnapSyncEntries();
  const tombstones = useDeleteTombstones();
  const kickRef = useRef<(() => void) | undefined>(undefined);

  const enabled = isAuthenticated && snapsHydrated && syncHydrated;

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let running = false;
    let queuedPass = false;
    const blocked = new Set<string>();
    const blockedDeletes = new Set<string>();
    const timers = new Set<ReturnType<typeof setTimeout>>();

    const backOff = (attempts: number, resume: () => void) => {
      const timer = setTimeout(
        () => {
          timers.delete(timer);
          resume();
        },
        RetryDelaysMs[Math.min(attempts - 1, RetryDelaysMs.length - 1)],
      );
      timers.add(timer);
    };

    const scheduleRetry = (snapId: string) => {
      const entry = getSnapSyncEntries()[snapId];
      const attempts = entry?.status === 'failed' ? entry.attempts : 1;
      if (attempts >= MaxAutoUploadAttempts) return;
      blocked.add(snapId);
      backOff(attempts, () => {
        blocked.delete(snapId);
        void drain();
      });
    };

    /**
     * A refused delete waits out the same backoff an upload does, and is held
     * back meanwhile — without that, a pass queued by any other write (an
     * upload writing its progress, most of all) walks straight back into the
     * delete that just failed, several times a second.
     */
    const scheduleDeleteRetry = (videoId: string, attempts: number) => {
      blockedDeletes.add(videoId);
      backOff(attempts, () => {
        blockedDeletes.delete(videoId);
        void drain();
      });
    };

    const uploadOne = async (snap: Snap) => {
      markSnapUploading(snap.id);
      const contentType = videoContentType(snap.uri);
      try {
        const target = await requestUploadUrl(snap.id, contentType);
        // The snap can be deleted while any of these steps is in flight;
        // `forgetSnaps` has already cleaned its entry up, so just stop. Before
        // the row is registered ready it is the backend GC's to collect.
        if (cancelled || isSnapGone(snap.id)) return;
        await putRecordingFile(target.uploadUrl, snap.uri, contentType);
        if (cancelled || isSnapGone(snap.id)) return;
        await registerVideo(target.videoId, toDurationSeconds(snap.durationSec));
        if (isSnapGone(snap.id)) {
          // Registered ready, then deleted mid-transfer: the remote copy is an
          // orphan now, owed the same delete as any other removed snap.
          addSnapDeleteTombstone(target.videoId);
          return;
        }
        markSnapUploaded(snap.id, target.videoId);
      } catch (error) {
        if (cancelled || isSnapGone(snap.id)) return;
        markSnapUploadFailed(snap.id);
        scheduleRetry(snap.id);
        if (__DEV__) console.warn(`[upload-snap] upload failed for ${snap.id}:`, String(error));
      }
    };

    const pass = async () => {
      // Deletes owed first: they are cheap, and a queue of uploads must not
      // keep a deleted snap's remote copy alive meanwhile.
      for (const videoId of getDeleteTombstones()) {
        if (cancelled) return;
        if (blockedDeletes.has(videoId)) continue;
        try {
          await deleteRemoteVideo(videoId);
          clearSnapDeleteTombstone(videoId);
        } catch (error) {
          if (cancelled) return;
          const attempts = markSnapDeleteFailed(videoId);
          if (attempts >= MaxRemoteDeleteAttempts) {
            clearSnapDeleteTombstone(videoId);
            if (__DEV__) {
              console.warn(
                `[upload-snap] giving up on remote delete for ${videoId} after ${attempts} attempts:`,
                String(error),
              );
            }
            continue;
          }
          // Still owed: the tombstone stays, and its backoff decides when.
          scheduleDeleteRetry(videoId, attempts);
        }
      }
      for (;;) {
        if (cancelled) return;
        const snap = pickNextUpload(getSnaps(), getSnapSyncEntries(), blocked);
        if (!snap) return;
        await uploadOne(snap);
      }
    };

    // Serial by construction: one drain owns the loop, and triggers that land
    // mid-drain queue one more pass instead of a second concurrent loop.
    const drain = async () => {
      if (running) {
        queuedPass = true;
        return;
      }
      running = true;
      try {
        do {
          queuedPass = false;
          await pass();
        } while (queuedPass && !cancelled);
      } finally {
        running = false;
      }
    };

    kickRef.current = () => void drain();
    // Foreground return is the retry moment for everything that failed while
    // the app was away or backgrounded mid-transfer.
    const subscription = AppState.addEventListener('change', (status) => {
      if (status === 'active') void drain();
    });
    void drain();

    return () => {
      cancelled = true;
      kickRef.current = undefined;
      subscription.remove();
      timers.forEach((timer) => clearTimeout(timer));
    };
  }, [enabled]);

  // The values themselves are unused — their identity changing is the signal
  // that queue material may exist: a new capture, a new tombstone, a manual
  // retry clearing failed entries. Self-triggered kicks from the worker's own
  // writes fold into the running drain as one extra (empty) pass.
  useEffect(() => {
    void snaps;
    void entries;
    void tombstones;
    kickRef.current?.();
  }, [snaps, entries, tombstones]);
}
