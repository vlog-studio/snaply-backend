const EarthRadiusM = 6_371_000;

export type Coordinates = {
  latitude: number;
  longitude: number;
};

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/**
 * Great-circle distance between two coordinates, in metres.
 *
 * Business-agnostic geometry — it knows nothing about snaps or outings. The
 * haversine formula is accurate to well under a metre at the distances this app
 * asks about (a walk around a neighbourhood), and needs no projection or
 * external library.
 */
export function distanceMeters(from: Coordinates, to: Coordinates): number {
  const deltaLatitude = toRadians(to.latitude - from.latitude);
  const deltaLongitude = toRadians(to.longitude - from.longitude);
  const fromLatitude = toRadians(from.latitude);
  const toLatitude = toRadians(to.latitude);

  const a =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.sin(deltaLongitude / 2) ** 2 * Math.cos(fromLatitude) * Math.cos(toLatitude);

  return 2 * EarthRadiusM * Math.asin(Math.min(1, Math.sqrt(a)));
}
