import { readVideoDuration } from '@/shared/lib/video-duration';
import { probeVideo } from '@/shared/lib/video-trim';

/**
 * What could be read off a local video file. Every field is optional on its
 * own: a platform may know the length and not the size, or neither.
 */
export type VideoMetadata = {
  /** The file's real length in seconds. */
  durationSec?: number;
  /** Display width in pixels, rotation applied. */
  width?: number;
  /** Display height in pixels, rotation applied. */
  height?: number;
};

/**
 * Reads a local video file's length and display size in one pass.
 *
 * The native probe (`shared/lib/video-trim`) is asked first because it is the
 * only reader that applies the file's rotation flag — `expo-video` reports the
 * encoded frame, which a phone held upright records landscape — and because
 * it answers both questions with one open of the file. Where it is not linked
 * (Expo Go) or could not read a length, the `expo-video` reader still answers
 * the length; the size then stays unknown rather than being guessed, so a
 * stand-in never gets recorded as a measurement.
 */
export async function readVideoMetadata(uri: string): Promise<VideoMetadata> {
  const probed = await probeVideo(uri);
  const durationSec =
    probed && probed.durationMs > 0 ? probed.durationMs / 1000 : await readVideoDuration(uri);
  return {
    ...(durationSec !== undefined ? { durationSec } : {}),
    ...(probed && probed.width > 0 && probed.height > 0
      ? { width: probed.width, height: probed.height }
      : {}),
  };
}
