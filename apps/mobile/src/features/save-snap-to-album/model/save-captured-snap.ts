import type { Snap } from '@/entities/snap';

import { isAlbumAutoSaveOn } from './album-auto-save-store';
import { saveSnapToAlbum, type AlbumSaveOutcome } from './save-snap-to-album';

/**
 * The capture's half of 자동 앨범 저장 (SNAP-18): once a snap shot here is
 * saved, a copy goes to the album too — if the user turned that on.
 *
 * Never asks for a permission (the switch did) and never fails the capture: the
 * snap is already in the library, and the outcome only tells the capture screen
 * whether to say that the copy was not made. `undefined` when automatic saving
 * is off. Snaps extracted from a gallery video do not come through here — their
 * source video is already in the album.
 */
export async function saveCapturedSnapToAlbum(snap: Snap): Promise<AlbumSaveOutcome | undefined> {
  if (!(await isAlbumAutoSaveOn())) return undefined;
  return saveSnapToAlbum(snap, { ask: false });
}
