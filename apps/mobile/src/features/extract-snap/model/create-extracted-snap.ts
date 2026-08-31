import type { Snap, SnapOrientation } from '@/entities/snap';
import type { LocalRecording } from '@/shared/lib/recording-files';
import type { TrimmedVideo } from '@/shared/lib/video-trim';

// What a snap claims when the trimmer could not read the output back — the
// same portrait stand-in the capture path stores (see
// `features/capture-moment/model/create-snap.ts`).
const DEFAULT_PORTRAIT_WIDTH = 1080;
const DEFAULT_PORTRAIT_HEIGHT = 1920;

export type CreateExtractedSnapInput = {
  /** What the trimmer measured off the output file. */
  trimmed: TrimmedVideo;
  /** The window that was asked for — the fallback when the file is unreadable. */
  requestedDurationSec: number;
};

function orientationOf(width: number, height: number): SnapOrientation {
  if (width > height) return 'landscape';
  if (width < height) return 'portrait';
  return 'square';
}

/**
 * Builds snap metadata for a cut extracted out of a gallery video. The snap id
 * reuses the recording's id (its unique filename), exactly like a captured
 * snap, so everything downstream — upload, deletion, movies — treats the two
 * identically.
 *
 * Unlike the capture path, the dimensions are real: a gallery video is as
 * often landscape or square as portrait, and the stand-in 1080×1920 would
 * mis-describe it. They fall back to the portrait stand-in only when the
 * trimmer could not read the output back.
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
  const width = hasDimensions ? trimmed.width : DEFAULT_PORTRAIT_WIDTH;
  const height = hasDimensions ? trimmed.height : DEFAULT_PORTRAIT_HEIGHT;

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
  };
}
