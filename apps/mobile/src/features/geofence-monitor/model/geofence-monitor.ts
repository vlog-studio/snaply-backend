import {
  getBackgroundLocationPermission,
  getForegroundLocationPermission,
  hasStartedGeofencing,
  startGeofencing,
  stopGeofencing,
} from '@/shared/lib/location';
import type { Location } from '@/entities/location';

import { selectNearestRegions } from '../lib/select-nearest-regions';
import { GEOFENCE_TASK_NAME } from './geofence-task';

type Origin = { latitude: number; longitude: number };

/**
 * Whether geofencing already holds what it needs: foreground and background
 * ("Always" on iOS) location. Check-only — never prompts. Requesting is the
 * 위치 알림 받기 switch's job (`useLocationAlerts`), where the user's own action
 * gives the OS prompt its context; an app-start gate that prompted would ask
 * with none.
 */
export async function hasGeofencePermissions(): Promise<boolean> {
  const foreground = await getForegroundLocationPermission();
  if (!foreground.granted) return false;
  const background = await getBackgroundLocationPermission();
  return background.granted;
}

/**
 * Start monitoring arrivals for the nearest points to `origin`. Replaces any
 * existing monitoring so the active region set always reflects the latest
 * `locations`. No-op when there is nothing nearby to monitor. Assumes
 * permissions are already granted (see `hasGeofencePermissions`).
 */
export async function startGeofenceMonitoring(
  locations: Location[],
  origin: Origin,
): Promise<void> {
  const regions = selectNearestRegions(locations, origin);
  if (regions.length === 0) return;

  if (await hasStartedGeofencing(GEOFENCE_TASK_NAME)) {
    await stopGeofencing(GEOFENCE_TASK_NAME);
  }
  await startGeofencing(GEOFENCE_TASK_NAME, regions);
}

/** Stop all arrival monitoring, if any is active. */
export async function stopGeofenceMonitoring(): Promise<void> {
  if (await hasStartedGeofencing(GEOFENCE_TASK_NAME)) {
    await stopGeofencing(GEOFENCE_TASK_NAME);
  }
}
