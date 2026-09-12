import type { CaptureDuration } from '@/entities/capture-session';
import {
  orientationOf,
  SNAP_STAND_IN_SIZE,
  type Snap,
  type SnapMeasurement,
  type SnapPlace,
} from '@/entities/snap';
import type { LocalRecording } from '@/shared/lib/recording-files';

export type CreateSnapInput = {
  /**
   * The capture length that was asked for. Only a fallback: a press-and-hold
   * capture ends when the finger lifts, so this is the snap's *maximum* length,
   * not its length.
   */
  durationSec: CaptureDuration;
  /** What could be read back off the recorded file, when anything could. */
  measured?: SnapMeasurement;
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
 *
 * The size comes from the file too, rotation applied: the camera records 720p,
 * not the 1080×1920 the stand-in claims, and a phone held sideways records
 * landscape. The stand-in is what an unreadable file gets, unmarked, so the
 * backfill knows to come back for it.
 */
export function createSnap(recording: LocalRecording, input: CreateSnapInput): Snap {
  const measured = input.measured ?? {};
  const measuredSize =
    measured.width !== undefined && measured.height !== undefined
      ? { width: measured.width, height: measured.height }
      : undefined;
  const { width, height } = measuredSize ?? SNAP_STAND_IN_SIZE;

  return {
    id: recording.id,
    uri: recording.uri,
    durationSec: measured.durationSec ?? input.durationSec,
    ...(measured.durationSec !== undefined ? { durationMeasured: true as const } : {}),
    capturedAt: recording.createdAt,
    width,
    height,
    orientation: orientationOf(width, height),
    ...(measuredSize ? { dimensionsMeasured: true as const } : {}),
    // Spread rather than assign, so a snap with no fix carries no `place` key at
    // all instead of an explicit `undefined` the store would persist as null.
    ...(input.place ? { place: input.place } : {}),
  };
}
