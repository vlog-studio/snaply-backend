import { useState } from 'react';

import { useSnapSyncEntries } from '@/entities/snap';
import { canDeleteFromDevice, useDeleteSnaps } from '@/features/delete-snap';
import { useLocalRecordings } from '@/features/manage-recordings';
import type { LocalRecording } from '@/shared/lib/recording-files';

/**
 * The in-screen library of already-saved originals: the list, the modal's
 * visibility, which recording is being previewed, and deletion.
 *
 * Deletion goes through the delete-snap feature because an original may already
 * be a cut inside a movie — removing the file alone would
 * leave those dangling. The list is read from disk, so it is reloaded once the
 * file is actually gone. A recording whose snap the server still keeps can
 * instead be deleted from this device only (SNAP-19): its file leaves this list,
 * and the snap stays in the snap tab, playing from the kept copy.
 */
export function useRecordingLibrary() {
  const {
    recordings,
    isLoading,
    errorMessage: listError,
    clearError: clearListError,
    reloadRecordings,
  } = useLocalRecordings();
  const {
    deleteSnaps,
    deleteFromDevice,
    deletingIds,
    errorMessage: deleteError,
    clearError: clearDeleteError,
  } = useDeleteSnaps();
  const syncEntries = useSnapSyncEntries();
  // Deletion in the library is one snap at a time.
  const [deletingId] = deletingIds;

  const [isVisible, setIsVisible] = useState(false);
  const [selected, setSelected] = useState<LocalRecording>();

  /**
   * Delete an original. Returns whether the recording that was being previewed
   * is the one that just disappeared, so the caller can leave that preview.
   */
  const remove = async (recording: LocalRecording): Promise<boolean> => {
    const deletedIds = await deleteSnaps([recording]);
    if (deletedIds.length === 0) return false;
    await reloadRecordings();
    return selected?.id === recording.id;
  };

  /** Same contract as {@link remove}, deleting the file from this device only. */
  const removeFromDevice = async (recording: LocalRecording): Promise<boolean> => {
    const removedIds = await deleteFromDevice([recording]);
    if (removedIds.length === 0) return false;
    await reloadRecordings();
    return selected?.id === recording.id;
  };

  return {
    recordings,
    isLoading,
    /** Re-read the list from disk, e.g. after a capture saved a new original. */
    reload: reloadRecordings,
    errorMessage: listError ?? deleteError,
    deletingId,
    isVisible,
    open: () => setIsVisible(true),
    close: () => setIsVisible(false),
    selected,
    select: (recording: LocalRecording) => {
      setSelected(recording);
      setIsVisible(false);
    },
    clearSelection: () => setSelected(undefined),
    remove,
    /** The recording's snap is kept on the server, so there is a choice of where to delete. */
    canRemoveFromDevice: (recording: LocalRecording) =>
      canDeleteFromDevice(recording, syncEntries[recording.id]),
    removeFromDevice,
    clearError: () => {
      clearListError();
      clearDeleteError();
    },
  };
}
