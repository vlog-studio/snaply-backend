import type { SnapPlace } from '@/entities/snap';
import { getCurrentCoordinates, requestForegroundLocationPermission } from '@/shared/lib/location';

/**
 * How long a capture waits for a fix before filing the snap without one.
 *
 * A snap is the point of the screen and a coordinate is a bonus, so the read is
 * given a short window rather than the seconds an active GPS fix can take. The
 * adapter prefers the cached last-known position, which returns immediately, so
 * this timeout only bites on the first read of a cold location stack.
 */
const PlaceReadTimeoutMs = 2_000;

function withTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), timeoutMs);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Where the capture is happening, or `undefined` when that cannot be answered.
 *
 * Asking for foreground permission here is deliberate: capture is the moment
 * where "where was this taken" is intelligible to the user, and the OS shows its
 * dialog only once — a refusal makes every later call return immediately. Every
 * failure path (refusal, no fix, a slow fix, a throwing adapter) resolves to
 * `undefined`, because **a snap is never worth losing over a coordinate**. The
 * caller files the snap either way and whatever reads `Snap.place` degrades to
 * time alone.
 */
export async function readCapturePlace(): Promise<SnapPlace | undefined> {
  try {
    const permission = await requestForegroundLocationPermission();
    if (!permission.granted) return undefined;
    const coordinates = await withTimeout(getCurrentCoordinates(), PlaceReadTimeoutMs);
    return coordinates ?? undefined;
  } catch {
    return undefined;
  }
}
