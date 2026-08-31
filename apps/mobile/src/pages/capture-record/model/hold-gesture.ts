/**
 * Press-and-hold collect gesture rules for the 담기 링 (see
 * `docs/features/capture-flow.md`).
 * Holds shorter than the threshold are accidental taps: the recording is
 * discarded instead of being saved as a snap.
 */
export const MIN_COLLECT_HOLD_MS = 250;

export function shouldCollectHold(heldMs: number): boolean {
  return heldMs > MIN_COLLECT_HOLD_MS;
}
