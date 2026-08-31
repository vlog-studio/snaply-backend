import type { LocationRegion } from 'expo-location';

import type { Location } from '@/entities/location';

/**
 * The platform ceiling on simultaneously monitored regions is 20 on iOS and 100
 * on Android. We stay within the stricter iOS limit so the same set works on
 * both platforms.
 */
export const MAX_MONITORED_REGIONS = 20;

type Origin = { latitude: number; longitude: number };

const EARTH_RADIUS_METERS = 6_371_000;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** Great-circle distance in meters between two coordinates (Haversine). */
function distanceMeters(a: Origin, b: Origin): number {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLng = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);

  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
}

/**
 * Pick the geofence regions closest to the device and map them to the
 * expo-location region shape. We only care about arrivals, so `notifyOnExit` is
 * disabled. Capped at `limit` to respect the platform region ceiling.
 */
export function selectNearestRegions(
  locations: Location[],
  origin: Origin,
  limit: number = MAX_MONITORED_REGIONS,
): LocationRegion[] {
  return [...locations]
    .map((location) => ({ location, distance: distanceMeters(origin, location) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit)
    .map(({ location }) => ({
      identifier: location.id,
      latitude: location.latitude,
      longitude: location.longitude,
      radius: location.radiusMeters,
      notifyOnEnter: true,
      notifyOnExit: false,
    }));
}
