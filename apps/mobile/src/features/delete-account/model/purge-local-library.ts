import { purgeMovieScope } from '@/entities/movie';
import { purgeSnapScope, purgeSnapSyncScope, readScopedSnaps } from '@/entities/snap';
import { deleteLocalRecording } from '@/shared/lib/recording-files';
import { deleteVideoThumbnail } from '@/shared/lib/video-thumbnails';

import { forgetDeletedAccount, readDeletedAccounts } from './deleted-account-ledger';

/**
 * Deletes everything one account left on this device: its recordings, their
 * cached thumbnails, and the three store files holding its snaps, movies, and
 * upload state.
 *
 * Files first, metadata last, for the reason `delete-snap` gives: the file is
 * the irreversible step, and the metadata that names it must outlive it so an
 * interrupted purge can be finished on the next start rather than leaving
 * videos nothing points at.
 *
 * Only the URIs this account's own metadata names are deleted. The `recordings`
 * folder is shared by every account on the device, so nothing here may walk it.
 */
export async function purgeLocalLibrary(userId: string): Promise<void> {
  for (const snap of await readScopedSnaps(userId)) {
    try {
      await deleteLocalRecording(snap.uri);
    } catch {
      // A file already gone, or one the OS refuses, must not strand the rest of
      // the purge — the metadata that named it goes below either way.
    }
    try {
      deleteVideoThumbnail(snap.uri);
    } catch {
      // Derived cache; losing the delete costs nothing but disk.
    }
  }

  await Promise.all([purgeSnapScope(userId), purgeSnapSyncScope(userId), purgeMovieScope(userId)]);
}

/**
 * Cleans up after every deleted account whose grace period has run out, and
 * returns the ids it purged.
 *
 * Deletion is a soft delete: 30일 안에 로그인하면 복구 가능 is what the
 * confirmation screen promises, and a restored account whose videos were
 * deleted the moment it asked would find nothing to come back to — the local
 * originals are the only copy of a snap that exists. So a deletion is recorded
 * with its deadline and the files are kept until that deadline passes, which is
 * what this sweep then acts on.
 *
 * The signed-in account is never purged, whatever the ledger says: if it can
 * still sign in, it can still restore.
 */
export async function purgeExpiredLibraries(options: {
  now: number;
  signedInUserId: string | null;
}): Promise<string[]> {
  const expired = (await readDeletedAccounts()).filter(
    (entry) => entry.purgeAfter <= options.now && entry.userId !== options.signedInUserId,
  );

  for (const entry of expired) {
    await purgeLocalLibrary(entry.userId);
    await forgetDeletedAccount(entry.userId);
  }

  return expired.map((entry) => entry.userId);
}
