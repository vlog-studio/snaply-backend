/**
 * How long one snap runs. Short by design — a snap is raw material, not a take.
 *
 * Mood used to live here too. It moved to the movie: the look belongs to the
 * finished vlog, chosen once on the movie screen with the whole cut list in view,
 * rather than to each fragment as it is shot (concept §8).
 */
export type CaptureDuration = 3 | 5;

export function normalizeCaptureDuration(value: string | undefined): CaptureDuration {
  return value === '5' ? 5 : 3;
}
