import * as Location from 'expo-location';

/**
 * Thin wrappers over expo-location permission calls. These are transport/native
 * concerns only — no product copy or flow decisions. The owning feature decides
 * when to ask, in what order, and what to tell the user.
 *
 * Background (geofencing) permission requires foreground permission first, and
 * on iOS corresponds to the "Always" authorization.
 */
export function requestForegroundLocationPermission() {
  return Location.requestForegroundPermissionsAsync();
}

export function requestBackgroundLocationPermission() {
  return Location.requestBackgroundPermissionsAsync();
}

/** Check-only variants: read the current grant without ever prompting. */
export function getForegroundLocationPermission() {
  return Location.getForegroundPermissionsAsync();
}

export function getBackgroundLocationPermission() {
  return Location.getBackgroundPermissionsAsync();
}
