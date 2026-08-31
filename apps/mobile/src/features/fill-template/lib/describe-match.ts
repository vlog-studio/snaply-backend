import { distanceMeters } from '@/shared/lib/geo';
import { formatDayHeading } from '@/shared/lib/datetime';

import type { MatchableSnap, SnapSession } from './match-template';

/** Inside this, snaps read as "같은 동네". Beyond it, only the time is claimed. */
const SameAreaM = 1_200;

const MinuteMs = 60 * 1000;
const HourMs = 60 * MinuteMs;

/**
 * Why these snaps, in one line the user can check against their own memory.
 *
 * The sentence is assembled from what was actually measured and nothing else —
 * how many snaps, how long the outing ran, and whether their coordinates were
 * close enough to call it one area. **Every clause it prints is a clause it can
 * defend.** Snaps with no coordinates simply lose the place clause, which is why
 * the line reads "2시간 안에 찍은 스냅 5개" for a library recorded before location
 * was ever available and "같은 동네에서 …" once it is.
 *
 * `now` is injected so the day label ("오늘") is testable and matches whatever
 * clock the caller already read.
 */
export function describeSession(
  session: SnapSession,
  used: readonly MatchableSnap[],
  now: number = Date.now(),
): string {
  if (used.length === 0) return '아직 묶을 만한 스냅을 못 찾았어요.';

  const day = formatDayHeading(session.startedAt, now);
  const place = sameArea(session) ? '같은 동네에서 ' : '';
  const span = spanPhrase(used);

  return `${day} ${place}${span} 찍은 스냅 ${used.length}개를 묶었어요.`;
}

/** Whether every snap that has a place sits within one neighbourhood. */
function sameArea(session: SnapSession): boolean {
  const anchor = session.anchor;
  if (!anchor || !session.hasPlaces) return false;
  return session.snaps.every(
    (snap) => !snap.place || distanceMeters(anchor, snap.place) <= SameAreaM,
  );
}

/**
 * How long the chosen snaps span, rounded the way a person would say it. A span
 * under a minute is not worth a clause, so the phrase collapses to "잇따라".
 */
function spanPhrase(used: readonly MatchableSnap[]): string {
  const times = used.map((snap) => snap.capturedAt);
  const span = Math.max(...times) - Math.min(...times);

  if (span < MinuteMs) return '잇따라';
  if (span < HourMs) return `${Math.max(1, Math.round(span / MinuteMs))}분 안에`;
  return `${Math.max(1, Math.round(span / HourMs))}시간 안에`;
}
