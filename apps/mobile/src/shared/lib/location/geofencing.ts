import * as Location from 'expo-location';
import type { LocationRegion } from 'expo-location';

/**
 * Thin wrappers over expo-location geofencing. The task named `taskName` must be
 * defined via `TaskManager.defineTask` at global scope before geofencing starts;
 * that definition lives in the feature that owns the arrival behavior.
 */
export function startGeofencing(taskName: string, regions: LocationRegion[]) {
  return Location.startGeofencingAsync(taskName, regions);
}

export function stopGeofencing(taskName: string) {
  return Location.stopGeofencingAsync(taskName);
}

export function hasStartedGeofencing(taskName: string) {
  return Location.hasStartedGeofencingAsync(taskName);
}
