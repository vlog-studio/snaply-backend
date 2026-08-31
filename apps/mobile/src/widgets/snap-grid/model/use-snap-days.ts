import { useMemo } from 'react';

import { useSnaps, useSnapsHydrated, type Snap } from '@/entities/snap';
import { formatDayHeading } from '@/shared/lib/datetime';

/** One day's worth of snaps — one section of the grid. */
export type SnapDay = {
  /** Local `YYYY-MM-DD`, the section's stable key. */
  key: string;
  /** `오늘` / `어제` / `2026년 7월 20일`. */
  label: string;
  snaps: Snap[];
};

export type SnapLibrary = {
  days: SnapDay[];
  /** Every snap, whatever day it falls on. */
  totalCount: number;
  /** Those snaps' lengths added up — what the library holds, in seconds. */
  totalDurationSec: number;
  /** False until the snap store has read itself back from disk. */
  isHydrated: boolean;
};

/**
 * Formats an epoch timestamp as a local `YYYY-MM-DD` grouping key. Local (not
 * UTC) components deliberately, so a day break matches the user's own midnight.
 */
function toDayKey(epochMs: number): string {
  const date = new Date(epochMs);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * The snap library grouped into day sections, newest day and newest snap first.
 *
 * Grouping by day is presentation, not domain: no rule ties a snap to a day any
 * more (the daily roll is gone), the grid just reads better in date sections.
 * That is why this lives with the grid rather than in the entity.
 */
export function useSnapDays(): SnapLibrary {
  const snaps = useSnaps();
  const isHydrated = useSnapsHydrated();

  return useMemo(() => {
    const newestFirst = [...snaps].sort((left, right) => right.capturedAt - left.capturedAt);

    const days: SnapDay[] = [];
    const byKey = new Map<string, SnapDay>();

    for (const snap of newestFirst) {
      const key = toDayKey(snap.capturedAt);
      let day = byKey.get(key);
      if (!day) {
        day = { key, label: formatDayHeading(snap.capturedAt), snaps: [] };
        byKey.set(key, day);
        days.push(day);
      }
      day.snaps.push(snap);
    }

    const totalDurationSec = newestFirst.reduce((sum, snap) => sum + snap.durationSec, 0);

    return { days, totalCount: newestFirst.length, totalDurationSec, isHydrated };
  }, [snaps, isHydrated]);
}
