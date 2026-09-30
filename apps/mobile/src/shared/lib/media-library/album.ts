import { Album, Asset, getPermissionsAsync, requestPermissionsAsync } from 'expo-media-library';
import { Platform } from 'react-native';

// Thin wrapper over expo-media-library for the one thing this app does with the
// device's photo library: add a video to it. Transport/native concerns only —
// which video to add, when to ask, and what to say belong to the caller. A
// `.web.ts` sibling provides inert stubs so callers stay platform-agnostic.
//
// Write-only on purpose: the app never reads the user's photos, so it asks for no
// read access anywhere. iOS gets the add-only authorization, Android 11+ needs no
// permission at all to add a file of the app's own to MediaStore, and the read
// permissions (`READ_MEDIA_*`) are kept out of the Android manifest (app.json).

/**
 * The album a saved video lands in on Android — a folder of its own under
 * Pictures, which galleries list by this name. iOS saves into the library without
 * an album: creating one there needs full photo access, adding does not.
 */
const ALBUM_NAME = 'Snaply';

/** Android 11: from this API level an app adds its own files to MediaStore without a permission. */
const PERMISSION_FREE_API_LEVEL = 30;

export type AlbumPermission = {
  /** The app may add a video to the album right now. */
  granted: boolean;
  /** Asking again could still change the answer — the OS has not stopped showing its prompt. */
  canAskAgain: boolean;
};

const NO_PERMISSION_NEEDED: AlbumPermission = { granted: true, canAskAgain: true };

function needsPermission(): boolean {
  if (Platform.OS !== 'android') return true;
  return typeof Platform.Version === 'number' && Platform.Version < PERMISSION_FREE_API_LEVEL;
}

// `writeOnly` asks for adding and nothing else. The empty granular list keeps
// Android 13+'s read permissions out of the request — they are not declared.
async function readPermission(): Promise<AlbumPermission> {
  const { granted, canAskAgain } = await getPermissionsAsync(true, []);
  return { granted, canAskAgain };
}

/** Whether the app may add a video to the album. Checks only — never prompts. */
export async function getAlbumPermission(): Promise<AlbumPermission> {
  if (!needsPermission()) return NO_PERMISSION_NEEDED;
  return readPermission();
}

/**
 * Makes sure the app may add a video to the album, showing the OS prompt once
 * if it still can. Call it from a control the user just touched — a background
 * caller would raise the system prompt out of nowhere.
 */
export async function requestAlbumPermission(): Promise<AlbumPermission> {
  if (!needsPermission()) return NO_PERMISSION_NEEDED;
  const current = await readPermission();
  if (current.granted || !current.canAskAgain) return current;
  const { granted, canAskAgain } = await requestPermissionsAsync(true, []);
  return { granted, canAskAgain };
}

/**
 * Adds a copy of a local video file to the device's photo album. The file stays
 * where it is; the album gets its own copy, which outlives the app. Rejects when
 * the copy could not be made — a missing permission included.
 */
export async function saveVideoToAlbum(fileUri: string): Promise<void> {
  if (Platform.OS === 'android') {
    // On Android an album is a folder: "creating" one that already exists only
    // adds the file to it, so every save goes through the same call.
    await Album.create(ALBUM_NAME, [fileUri]);
    return;
  }
  await Asset.create(fileUri);
}
