import type { SnapRef } from '@/entities/movie';

/**
 * Why a cut can no longer be played or run, worded apart on screen (SNAP-12):
 * `expired` is our retention, `deleted` is the user's own act — on this device
 * (the original is gone here) or another (the server says `user`).
 */
export type CutGone = 'expired' | 'deleted';

/**
 * Reads a cut's fate from the server's mark and the snap library.
 *
 * An unavailable cut with no reason reads as expired, as every unavailable cut
 * did before the server sent one. A cut the server still has but whose
 * original is gone from this device was deleted here.
 */
export function cutGone(ref: SnapRef, hasSnap: boolean): CutGone | undefined {
  if (ref.unavailable) return ref.unavailableReason === 'user' ? 'deleted' : 'expired';
  return hasSnap ? undefined : 'deleted';
}
