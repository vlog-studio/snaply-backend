/**
 * A geofence point the app monitors for arrival. Coordinates and radius drive
 * `expo-location` geofencing; the arrival notification copy is owned entirely by
 * the backend, which decides and sends the push (the API exposes no message
 * template). This is the app's domain model (camelCase); the wire DTO is mapped
 * in the `api` segment.
 */
export type Location = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  /** Backend-defined free-form label ('관광지', '카페', …), not a fixed set. */
  category: string;
};
