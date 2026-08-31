import { z } from 'zod';

import { apiRequest } from '@/shared/api';
import { USE_MOCK_API } from '@/shared/config/api';

async function registerFromApi(fcmToken: string, signal?: AbortSignal): Promise<void> {
  // The backend stores the raw FCM token and sends pushes via Firebase Admin
  // SDK. The response body is not needed, so it is accepted permissively.
  await apiRequest('/auth/fcm-token', {
    method: 'POST',
    body: { fcmToken },
    schema: z.unknown(),
    signal,
  });
}

// Never log the token value itself (treated as sensitive), only that it ran.
function registerMock(): Promise<void> {
  if (__DEV__) console.log('[push][mock] fcm token registered');
  return Promise.resolve();
}

/**
 * Register (or refresh) the device's FCM token with the backend
 * (`POST /auth/fcm-token`). Routes to the mock until an API origin is
 * configured. Call on first token acquisition and again on token refresh.
 */
export function registerFcmToken(fcmToken: string, signal?: AbortSignal): Promise<void> {
  return USE_MOCK_API ? registerMock() : registerFromApi(fcmToken, signal);
}
