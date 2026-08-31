import { LocationGeofencingEventType } from 'expo-location';
import type { LocationRegion } from 'expo-location';
import { Platform } from 'react-native';
import * as TaskManager from 'expo-task-manager';

import { reportGeofenceEnter } from '../api/report-geofence-enter';

/** Stable task identifier shared by the task definition and `startGeofencing`. */
export const GEOFENCE_TASK_NAME = 'snaply-geofence-monitor';

type GeofenceTaskData = {
  eventType: LocationGeofencingEventType;
  region: LocationRegion;
};

// Lightweight client-side cooldown. The backend enforces the authoritative
// 30-minute dedup per (user, location); this only suppresses obvious duplicate
// reports within a single app process. It is intentionally in-memory: on a cold
// background relaunch the server-side cooldown still applies.
const CLIENT_COOLDOWN_MS = 5 * 60_000;
const lastReportedAt = new Map<string, number>();

async function handleGeofenceEvent(data: GeofenceTaskData): Promise<void> {
  if (data.eventType !== LocationGeofencingEventType.Enter) return;

  const locationId = data.region.identifier;
  if (!locationId) return;

  const now = Date.now();
  const last = lastReportedAt.get(locationId);
  if (last !== undefined && now - last < CLIENT_COOLDOWN_MS) return;
  lastReportedAt.set(locationId, now);

  // Awaited so the background task stays alive until the report completes.
  await reportGeofenceEnter(locationId);
}

// defineTask must run at global scope (not inside a component/lifecycle) so the
// OS can execute it when it relaunches the app in the background on a geofence
// event. Web has no geofencing, so skip the definition there.
if (Platform.OS !== 'web') {
  TaskManager.defineTask(GEOFENCE_TASK_NAME, async ({ data, error }) => {
    if (error) {
      if (__DEV__) console.warn('[geofence] task error:', error.message);
      return;
    }
    if (data) await handleGeofenceEvent(data as GeofenceTaskData);
  });
}
