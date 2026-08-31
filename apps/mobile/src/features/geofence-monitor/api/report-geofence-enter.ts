import { z } from 'zod';

import { apiRequest } from '@/shared/api';
import { USE_MOCK_API } from '@/shared/config/api';

async function reportFromApi(locationId: string, signal?: AbortSignal): Promise<void> {
  // The backend owns the authoritative decision (30-min cooldown, quiet hours,
  // notification_enabled) and sends the FCM push; the app only reports arrival.
  // The response body is not needed, so it is accepted permissively.
  await apiRequest('/notifications/geofence-enter', {
    method: 'POST',
    body: { locationId },
    schema: z.unknown(),
    signal,
  });
}

function reportMock(locationId: string): Promise<void> {
  if (__DEV__) {
    console.log('[geofence][mock] geofence-enter reported for location:', locationId);
  }
  return Promise.resolve();
}

/**
 * Report a geofence arrival to the backend. Routes to the mock until an API
 * origin is configured. Fire-and-forget from the caller's perspective.
 */
export function reportGeofenceEnter(locationId: string, signal?: AbortSignal): Promise<void> {
  return USE_MOCK_API ? reportMock(locationId) : reportFromApi(locationId, signal);
}
