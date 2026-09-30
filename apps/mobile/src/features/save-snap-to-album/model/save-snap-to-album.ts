import { fetchSnapFile, type Snap } from '@/entities/snap';
import {
  getAlbumPermission,
  requestAlbumPermission,
  saveVideoToAlbum,
} from '@/shared/lib/media-library';

/**
 * How one save ended. `blocked` — the device does not let the app add to the
 * album, and only the OS settings can change that; `failed` — anything else
 * (the server copy could not be fetched, the copy could not be written).
 */
export type AlbumSaveOutcome = 'saved' | 'blocked' | 'failed';

/**
 * Puts a copy of a snap in the device's photo album (SNAP-17) — the user's own
 * copy, which outlives the app and the server's retention.
 *
 * `ask` says whether a missing permission may raise the OS prompt: a tap the
 * user just made may; a save that runs on its own (a capture's automatic one)
 * only checks — its switch asked when it was turned on.
 *
 * A snap whose file is not on this device — one from another device, or one
 * deleted from this device only — is fetched first: the server's playable copy
 * is what gets saved. Never throws; the caller decides what to say.
 */
export async function saveSnapToAlbum(
  snap: Snap,
  { ask }: { ask: boolean },
): Promise<AlbumSaveOutcome> {
  try {
    const permission = ask ? await requestAlbumPermission() : await getAlbumPermission();
    if (!permission.granted) return 'blocked';
    await fetchSnapFile(snap);
    await saveVideoToAlbum(snap.uri);
    return 'saved';
  } catch (error) {
    if (__DEV__) console.warn(`[save-snap-to-album] could not save ${snap.id}:`, String(error));
    return 'failed';
  }
}
