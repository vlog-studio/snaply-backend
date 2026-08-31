import * as Location from 'expo-location';

/**
 * The device's current coordinates, or `null` if none can be resolved. Prefers a
 * cached last-known fix (instant, no GPS wake) and falls back to an active read.
 * Thin wrapper — transport/native only; the owning feature decides how to use it
 * and assumes foreground permission is already granted.
 */
export async function getCurrentCoordinates(): Promise<{
  latitude: number;
  longitude: number;
} | null> {
  const position =
    (await Location.getLastKnownPositionAsync()) ??
    (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
  if (!position) return null;
  return { latitude: position.coords.latitude, longitude: position.coords.longitude };
}
