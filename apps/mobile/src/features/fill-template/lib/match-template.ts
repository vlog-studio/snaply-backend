import type { SnapPlace } from '@/entities/snap';
import { distanceMeters } from '@/shared/lib/geo';

/**
 * What matching needs to know about a snap. Structural on purpose: the matcher
 * is a pure function and its test builds these by hand.
 */
export type MatchableSnap = {
  id: string;
  capturedAt: number;
  durationSec: number;
  place?: SnapPlace;
};

/** Snaps more than this far apart in time belong to different outings. */
export const SessionGapMs = 3 * 60 * 60 * 1000;

/** …and so do snaps further than this from where the outing started. */
const SessionRadiusM = 2_000;

/** Inside this, a snap is unmistakably part of the same outing. */
const CloseEnoughM = 300;

/**
 * How much a snap with no coordinates can be trusted, relative to one with them.
 *
 * Not a penalty for the user — a statement about the evidence. Time alone really
 * is a weaker reason to believe two snaps belong together, and pretending
 * otherwise is how a confidence number becomes decoration.
 */
const NoPlaceConfidence = 0.7;

/**
 * A run of snaps that were shot on one outing — close together in time, and
 * where coordinates exist, close together on the ground.
 *
 * This is the whole of what the app can infer. It cannot tell an alley from a
 * shopfront, so it does not pretend to fill a slot *by its label*; it finds the
 * one outing worth making a movie out of and lays it down in the order it
 * happened. The slot labels stay what they always were: instructions to a person.
 */
export type SnapSession<T extends MatchableSnap = MatchableSnap> = {
  snaps: T[];
  startedAt: number;
  endedAt: number;
  /** Where the outing started, when the first snap that has a place says so. */
  anchor?: SnapPlace;
  /** Whether any snap in the session carried coordinates at all. */
  hasPlaces: boolean;
};

/**
 * Splits a library into outings, oldest first.
 *
 * A snap joins the session before it when it was taken within {@link SessionGapMs}
 * of the previous one **and** within {@link SessionRadiusM} of where that session
 * started. Coordinates only ever break a session, never hold one together: two
 * snaps an hour apart with no places are still one outing, because time is all
 * there is to go on and the alternative is refusing to group anything at all.
 */
export function groupIntoSessions<T extends MatchableSnap>(snaps: readonly T[]): SnapSession<T>[] {
  const ordered = [...snaps].sort((left, right) => left.capturedAt - right.capturedAt);
  const sessions: SnapSession<T>[] = [];

  for (const snap of ordered) {
    const current = sessions[sessions.length - 1];
    const previous = current?.snaps[current.snaps.length - 1];
    const withinTime =
      previous !== undefined && snap.capturedAt - previous.capturedAt <= SessionGapMs;
    const withinPlace =
      current?.anchor === undefined ||
      snap.place === undefined ||
      distanceMeters(current.anchor, snap.place) <= SessionRadiusM;

    if (current && withinTime && withinPlace) {
      current.snaps.push(snap);
      current.endedAt = snap.capturedAt;
      current.anchor = current.anchor ?? snap.place;
      current.hasPlaces = current.hasPlaces || snap.place !== undefined;
      continue;
    }

    sessions.push({
      snaps: [snap],
      startedAt: snap.capturedAt,
      endedAt: snap.capturedAt,
      anchor: snap.place,
      hasPlaces: snap.place !== undefined,
    });
  }

  return sessions;
}

/**
 * The outing worth offering, or `undefined` when there is nothing to offer.
 *
 * The one that fills the most slots wins, and the most recent breaks a tie: a
 * template is a thing to do with *this* weekend, not with the best weekend of
 * the year. A single snap is not an outing and never wins.
 */
export function pickBestSession<T extends MatchableSnap>(
  sessions: readonly SnapSession<T>[],
  slotCount: number,
): SnapSession<T> | undefined {
  return sessions
    .filter((session) => session.snaps.length > 1)
    .reduce<SnapSession<T> | undefined>((best, session) => {
      if (!best) return session;
      const bestFill = Math.min(best.snaps.length, slotCount);
      const fill = Math.min(session.snaps.length, slotCount);
      if (fill > bestFill) return session;
      if (fill === bestFill && session.endedAt > best.endedAt) return session;
      return best;
    }, undefined);
}

/**
 * Lays a session's snaps into the template's slots, in the order they happened.
 *
 * Fewer snaps than slots leaves the tail empty, which is the point: an empty slot
 * is the app asking for a shot it does not have. More snaps than slots takes an
 * evenly spaced sample that always keeps the first and the last, so a movie made
 * from a long walk still starts where the walk started and ends where it ended,
 * rather than covering its first ten minutes.
 */
export function spreadAcrossSlots<T>(snaps: readonly T[], slotCount: number): (T | undefined)[] {
  if (slotCount <= 0) return [];
  if (snaps.length <= slotCount) {
    return Array.from({ length: slotCount }, (_, index) => snaps[index]);
  }
  if (slotCount === 1) return [snaps[0]];

  const step = (snaps.length - 1) / (slotCount - 1);
  const taken = new Set<number>();
  return Array.from({ length: slotCount }, (_, index) => {
    let position = Math.round(index * step);
    // Rounding can land twice on the same snap; walking forward keeps every slot
    // a different one, which matters more than hitting the exact interval.
    while (taken.has(position) && position < snaps.length - 1) position += 1;
    taken.add(position);
    return snaps[position];
  });
}

/**
 * How sure the app is that this snap belongs to this outing, 0–1.
 *
 * Two pieces of evidence and nothing else: how close in time it sits to the snap
 * before or after it, and how far it is from where the outing started. A snap
 * with no coordinates is scored on time alone and scaled down, because that is
 * genuinely a weaker claim. **It is not a claim that the snap suits the slot's
 * label** — no part of this app can read a picture.
 */
export function sessionConfidence(snap: MatchableSnap, session: SnapSession): number {
  const neighbours = session.snaps.filter((other) => other.id !== snap.id);
  const nearestGap = neighbours.reduce(
    (closest, other) => Math.min(closest, Math.abs(other.capturedAt - snap.capturedAt)),
    Number.POSITIVE_INFINITY,
  );
  const timeScore = Number.isFinite(nearestGap) ? 1 - Math.min(1, nearestGap / SessionGapMs) : 0.5;

  if (!snap.place || !session.anchor) {
    return round(timeScore * NoPlaceConfidence);
  }

  const distance = distanceMeters(session.anchor, snap.place);
  const placeScore =
    distance <= CloseEnoughM ? 1 : 1 - Math.min(1, (distance - CloseEnoughM) / SessionRadiusM);

  return round((timeScore + placeScore) / 2);
}

function round(value: number): number {
  return Math.round(Math.max(0, Math.min(1, value)) * 100) / 100;
}
