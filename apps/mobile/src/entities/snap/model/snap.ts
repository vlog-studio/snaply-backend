/** Which way a snap's frame is taller: derived from `width`/`height`. */
export type SnapOrientation = 'portrait' | 'landscape' | 'square';

export function orientationOf(width: number, height: number): SnapOrientation {
  if (width > height) return 'landscape';
  if (width < height) return 'portrait';
  return 'square';
}

/**
 * What a snap claims to be when its file could not be measured: the upright
 * phone frame every capture is shot in. A stand-in, never a measurement —
 * `dimensionsMeasured` stays unset on a snap carrying it, so the backfill knows
 * to come back for the real size and nothing downstream mistakes it for one.
 */
export const SNAP_STAND_IN_SIZE = { width: 1080, height: 1920 } as const;

/**
 * What was read back from a snap's own file. Each field is independent — a
 * platform may answer the length and not the size — and only what is present
 * is written over the snap.
 */
export type SnapMeasurement = {
  durationSec?: number;
  width?: number;
  height?: number;
};

/**
 * Where a snap was captured.
 *
 * Coordinates only — no place name, no reverse geocoding. This is what makes
 * "같은 동네에서 찍은 스냅" answerable: two snaps are near each other when their
 * coordinates are, and that is the entire question the template matcher asks.
 */
export type SnapPlace = {
  latitude: number;
  longitude: number;
};

/**
 * A captured 3–5 second original — the raw material a movie is cut from. The
 * underlying video file lives on disk (see `shared/lib/recording-files`,
 * addressed by `uri`); this is the metadata a snap carries on top of that file.
 *
 * Snaps are referenced by movies (N:M) and are never mutated by movie edits —
 * per-movie order and trim live on the movie's snap references (see
 * `entities/movie`), so the same snap can appear differently in two movies.
 */
export type Snap = {
  id: string;
  /** File URI of the source video, as returned by `recording-files`. */
  uri: string;
  /**
   * How long the recorded file actually runs, in seconds.
   *
   * Capture is press-and-hold with a maximum, so a finger released early ends
   * the recording before the requested length is up — the field is measured
   * from the file (`shared/lib/video-metadata`) rather than set to the option
   * the user picked. Storing the requested length instead made every surface
   * that draws a snap by time wrong by exactly that difference, the timeline
   * strip most visibly: a 1.2-second snap was drawn taking three seconds.
   */
  durationSec: number;
  /**
   * True once `durationSec` came from the file rather than from the capture
   * option. Absent on snaps captured before the length was measured and on
   * those whose file could not be read; those are measured again in the
   * background on a later start and corrected in place.
   */
  durationMeasured?: boolean;
  /** Epoch milliseconds when the snap was captured. */
  capturedAt: number;
  /**
   * Display size in pixels, rotation applied — a phone held upright records
   * landscape frames with a 90° flag, and these are the numbers the video is
   * seen at. Read from the file (`shared/lib/video-metadata`); the
   * `SNAP_STAND_IN_SIZE` when the file could not be read.
   */
  width: number;
  height: number;
  orientation: SnapOrientation;
  /**
   * True once `width`/`height` came from the file rather than the stand-in.
   * Absent on snaps captured before the size was measured and on those whose
   * file could not be read; those are measured again in the background on a
   * later start and corrected in place. The distinction matters beyond the
   * device: once snaps live on the server, a stand-in sent as a measurement
   * could never be told apart from a real one and backfilled.
   */
  dimensionsMeasured?: boolean;
  /**
   * Where the snap was captured, when a fix was available at the time.
   *
   * Optional on purpose and permanently so: location permission may be refused,
   * a fix may not arrive in time, and every snap captured before this field
   * existed has none. Anything reading it must degrade to time alone rather
   * than treat a missing place as an error.
   */
  place?: SnapPlace;
};
