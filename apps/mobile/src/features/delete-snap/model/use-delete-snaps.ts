import { useCallback, useEffect, useRef, useState } from 'react';

import { useRemoveSnapsEverywhere } from '@/entities/movie';
import { useForgetSnapSync, useRemoveSnaps } from '@/entities/snap';
import { deleteLocalRecording } from '@/shared/lib/recording-files';
import { deleteVideoThumbnail } from '@/shared/lib/video-thumbnails';

const PartialFailureMessage = '일부 스냅을 삭제하지 못했어요.'; // 일부 스냅을 삭제하지 못했어요.
const TotalFailureMessage = '스냅을 삭제하지 못했어요.'; // 스냅을 삭제하지 못했어요.

/**
 * The minimum a delete needs to know: which snap, and where its file is. Stated
 * structurally so both a `Snap` (what the library holds) and a `LocalRecording`
 * (what the capture library holds) can be handed to it directly.
 */
export type DeletableSnap = { id: string; uri: string };

/**
 * Deletes originals from the library, permanently and completely.
 *
 * A snap exists in five places — the video file, its cached thumbnail, its snap
 * metadata, the references movies hold to it, and its sync state (plus a remote
 * copy once uploaded) — so deleting only the file leaves movies pointing at a
 * video that is gone. This action removes all five, which is why it is a
 * feature composing two entities rather than a call on any one of them. The
 * remote copy is not deleted here: retiring the sync entry leaves a tombstone,
 * and the upload worker owes the server that DELETE.
 *
 * Order matters. The file is deleted first because it is the irreversible,
 * failure-prone step: if it fails, nothing else has changed yet and the snap
 * stays whole. The metadata for everything that did succeed is then committed
 * in one synchronous block, so an interruption cannot leave a snap whose file
 * is gone but whose movie references remain.
 *
 * Taking a snap out of one movie while keeping the original is the cut list's
 * list, not this; this one takes the snap out of everything.
 */
export function useDeleteSnaps() {
  const isMounted = useRef(true);
  const removeSnaps = useRemoveSnaps();
  const removeSnapsEverywhere = useRemoveSnapsEverywhere();
  const forgetSnapSync = useForgetSnapSync();
  const [deletingIds, setDeletingIds] = useState<ReadonlySet<string>>(() => new Set());
  const [errorMessage, setErrorMessage] = useState<string>();

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  /** Returns the ids actually deleted, so the caller can refresh its list. */
  const deleteSnaps = useCallback(
    async (targets: readonly DeletableSnap[]): Promise<string[]> => {
      if (targets.length === 0) return [];

      setDeletingIds(new Set(targets.map((target) => target.id)));

      const deletedIds: string[] = [];
      let hadFailure = false;

      // Sequential, so a mid-batch failure still commits the snaps that did
      // succeed instead of aborting the whole batch.
      for (const target of targets) {
        try {
          await deleteLocalRecording(target.uri);
          deletedIds.push(target.id);
        } catch {
          hadFailure = true;
          continue;
        }
        try {
          deleteVideoThumbnail(target.uri);
        } catch {
          // The thumbnail is a derived cache, so losing it only forces
          // re-extraction. Failing to clear it must never turn a completed
          // delete into a failed one — that would strand the snap's metadata
          // and movie references pointing at a file that is already gone.
        }
      }

      // References first, then the snap metadata: both are synchronous store
      // writes, and this order never leaves a movie referencing a snap the
      // library no longer knows about. Run even when the component has
      // unmounted — the files are already gone, so the stores must catch up.
      if (deletedIds.length > 0) {
        removeSnapsEverywhere(deletedIds);
        removeSnaps(deletedIds);
        // Retire the sync entries last: an uploaded snap leaves a tombstone
        // behind, which is how the upload worker learns it owes the backend a
        // DELETE for the remote copy.
        forgetSnapSync(deletedIds);
      }

      if (isMounted.current) {
        setDeletingIds(new Set());
        if (!hadFailure) setErrorMessage(undefined);
        else setErrorMessage(deletedIds.length > 0 ? PartialFailureMessage : TotalFailureMessage);
      }

      return deletedIds;
    },
    [removeSnaps, removeSnapsEverywhere, forgetSnapSync],
  );

  return {
    deleteSnaps,
    deletingIds,
    errorMessage,
    clearError: () => setErrorMessage(undefined),
  };
}
