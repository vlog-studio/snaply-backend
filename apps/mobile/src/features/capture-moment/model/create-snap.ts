import type { CaptureDuration } from '@/entities/capture-session';
import type { Snap, SnapPlace } from '@/entities/snap';
import type { LocalRecording } from '@/shared/lib/recording-files';

// Portrait is the capture default; real orientation/dimension detection lands
// when a movie can target a ratio other than 9:16.
const DEFAULT_PORTRAIT_WIDTH = 1080;
const DEFAULT_PORTRAIT_HEIGHT = 1920;

export type CreateSnapInput = {
  /**
   * The capture length that was asked for. Only a fallback: a press-and-hold
   * capture ends when the finger lifts, so this is the snap's *maximum* length,
   * not its length.
   */
  durationSec: CaptureDuration;
  /** The recorded file's real length, when it could be read back. */
  measuredDurationSec?: number;
  /** Where the capture happened, when a fix was available (see `readCapturePlace`). */
  place?: SnapPlace;
};

/**
 * Builds snap metadata from a persisted recording and the capture options. The
 * snap id reuses the recording's id (its unique filename) so a snap and its
 * source video file stay tied together and re-capturing the same file is
 * idempotent in the snap store.
 *
 * The length comes from the file when it could be measured and from the capture
 * option only when it could not, because the two differ on every capture the
 * user ended by lifting their finger — and the timeline draws a snap by that
 * number.
 */
export function createSnap(recording: LocalRecording, input: CreateSnapInput): Snap {
  return {
    id: recording.id,
    uri: recording.uri,
    durationSec: input.measuredDurationSec ?? input.durationSec,
    ...(input.measuredDurationSec !== undefined ? { durationMeasured: true as const } : {}),
    capturedAt: recording.createdAt,
    width: DEFAULT_PORTRAIT_WIDTH,
    height: DEFAULT_PORTRAIT_HEIGHT,
    orientation: 'portrait',
    // Spread rather than assign, so a snap with no fix carries no `place` key at
    // all instead of an explicit `undefined` the store would persist as null.
    ...(input.place ? { place: input.place } : {}),
  };
}
