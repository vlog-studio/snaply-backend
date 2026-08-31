import * as ImagePicker from 'expo-image-picker';

import type { PickedVideo } from './picked-video';

/**
 * Opens the system photo picker for a single video and answers with a local
 * copy of what was chosen, or `undefined` when the user backed out.
 *
 * The system picker (Android 13+'s Photo Picker, iOS's PHPicker) needs no
 * media-library permission — the OS shows the library and hands over only the
 * chosen item, already copied into the app's cache directory as a `file://`
 * URI the player and the trimmer can read directly.
 */
export async function pickVideoFromLibrary(): Promise<PickedVideo | undefined> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['videos'],
    allowsEditing: false,
    quality: 1,
  });
  if (result.canceled || result.assets.length === 0) return undefined;

  const asset = result.assets[0];
  return {
    uri: asset.uri,
    // The picker reports milliseconds, or null when the container hid it.
    durationSec:
      typeof asset.duration === 'number' && asset.duration > 0 ? asset.duration / 1000 : undefined,
  };
}
