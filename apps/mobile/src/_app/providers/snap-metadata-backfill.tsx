import { useEffect } from 'react';

import { getSnaps, useRecordSnapMeasurement, useSnapsHydrated } from '@/entities/snap';
import { readVideoMetadata } from '@/shared/lib/video-metadata';

/**
 * Corrects the stored length and size of snaps that were never measured.
 *
 * A snap used to record the capture option it was shot with (3초 / 5초) rather
 * than how long the file turned out, and a press-and-hold capture ends when the
 * finger lifts — so most of the library claimed to be longer than it was. The
 * timeline strip draws each cut at its length on a shared seconds scale, which
 * made the difference impossible to miss there, but every read-out of a snap's
 * or a movie's length was wrong by the same amount.
 *
 * A captured snap likewise used to claim an upright 1080×1920 frame it was
 * never measured for: the camera records 720p, and a phone held sideways
 * records landscape. The device tolerated that, but a size that reaches the
 * server as a measurement can never be told apart from a real one and fixed —
 * so every stand-in still in the library is measured here before that day.
 *
 * Startup work rather than a feature: nothing here is an action the user takes,
 * and the repair belongs to the app's lifecycle the way `GeofenceGate` and
 * `MovieGenerationBridge` do. Captures made from now on measure their own file
 * (`features/capture-moment`), so this only ever has the backlog to walk.
 *
 * It walks the library **in sequence**, one file at a time: measuring may open
 * a real video player, and the platform's pool of hardware decoders is small
 * enough that a parallel sweep would start failing silently. The list is read
 * once, non-reactively, so the corrections it writes cannot restart it — and it
 * runs on hydration only, so a file that cannot be read is simply retried on a
 * later start instead of being hammered at. Where the size cannot be measured
 * at all (Expo Go links no native probe), the snap keeps its stand-in unmarked
 * and is measured on the first start in a build that can.
 */
export function SnapMetadataBackfill(): null {
  const hydrated = useSnapsHydrated();
  const recordMeasurement = useRecordSnapMeasurement();

  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;

    void (async () => {
      for (const snap of getSnaps()) {
        if (cancelled) return;
        if (snap.durationMeasured && snap.dimensionsMeasured) continue;
        const measured = await readVideoMetadata(snap.uri);
        if (cancelled) return;
        recordMeasurement(snap.id, measured);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hydrated, recordMeasurement]);

  return null;
}
