import { useEffect } from 'react';

import { getSnaps, useSetMeasuredSnapDuration, useSnapsHydrated } from '@/entities/snap';
import { readVideoDuration } from '@/shared/lib/video-duration';

/**
 * Corrects the stored length of snaps captured before the length was measured.
 *
 * A snap used to record the capture option it was shot with (3초 / 5초) rather
 * than how long the file turned out, and a press-and-hold capture ends when the
 * finger lifts — so most of the library claims to be longer than it is. The
 * timeline strip draws each cut at its length on a shared seconds scale, which
 * makes the difference impossible to miss there, but every read-out of a snap's
 * or a movie's length was wrong by the same amount.
 *
 * Startup work rather than a feature: nothing here is an action the user takes,
 * and the repair belongs to the app's lifecycle the way `GeofenceGate` and
 * `MovieGenerationBridge` do. Captures made from now on measure their own file
 * (`features/capture-moment`), so this only ever has the backlog to walk.
 *
 * It walks the library **in sequence**, one file at a time: measuring opens a
 * real video player, and the platform's pool of hardware decoders is small
 * enough that a parallel sweep would start failing silently. The list is read
 * once, non-reactively, so the corrections it writes cannot restart it — and it
 * runs on hydration only, so a file that cannot be read is simply retried on a
 * later start instead of being hammered at.
 */
export function SnapDurationBackfill(): null {
  const hydrated = useSnapsHydrated();
  const setMeasuredDuration = useSetMeasuredSnapDuration();

  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;

    void (async () => {
      for (const snap of getSnaps()) {
        if (cancelled) return;
        if (snap.durationMeasured) continue;
        const measured = await readVideoDuration(snap.uri);
        if (cancelled) return;
        if (measured !== undefined) setMeasuredDuration(snap.id, measured);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hydrated, setMeasuredDuration]);

  return null;
}
