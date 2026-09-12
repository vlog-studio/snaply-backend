import { orientationOf, SNAP_STAND_IN_SIZE, type Snap } from '@/entities/snap';
import type { LocalRecording } from '@/shared/lib/recording-files';
import type { TrimmedVideo } from '@/shared/lib/video-trim';

export type CreateExtractedSnapInput = {
  /** What the trimmer measured off the output file. */
  trimmed: TrimmedVideo;
  /** The window that was asked for — the fallback when the file is unreadable. */
  requestedDurationSec: number;
};

/**
 * Builds snap metadata for a cut extracted out of a gallery video. The snap id
 * reuses the recording's id (its unique filename), exactly like a captured
 * snap, so everything downstream — upload, deletion, movies — treats the two
 * identically.
 *
 * The dimensions are the trimmed file's own, rotation applied — a gallery
 * video is as often landscape or square as portrait, and the stand-in would
 * mis-describe it. They fall back to the stand-in, unmarked, only when the
 * trimmer could not read the output back; the backfill measures those later.
 *
 * No `place`: where a gallery video was shot is metadata the picker's cache
 * copy does not carry, and where the user is *now* is not where the video
 * happened.
 */
export function createExtractedSnap(
  recording: LocalRecording,
  input: CreateExtractedSnapInput,
): Snap {
  const { trimmed, requestedDurationSec } = input;
  const measured = trimmed.durationMs > 0;
  const hasDimensions = trimmed.width > 0 && trimmed.height > 0;
  const width = hasDimensions ? trimmed.width : SNAP_STAND_IN_SIZE.width;
  const height = hasDimensions ? trimmed.height : SNAP_STAND_IN_SIZE.height;

  return {
    id: recording.id,
    uri: recording.uri,
    // Rounded to a millisecond so a length that started as an integer number
    // of ms never prints with float noise.
    durationSec: measured
      ? Math.round(trimmed.durationMs) / 1000
      : Math.round(requestedDurationSec * 1000) / 1000,
    ...(measured ? { durationMeasured: true as const } : {}),
    capturedAt: recording.createdAt,
    width,
    height,
    orientation: orientationOf(width, height),
    ...(hasDimensions ? { dimensionsMeasured: true as const } : {}),
  };
}
