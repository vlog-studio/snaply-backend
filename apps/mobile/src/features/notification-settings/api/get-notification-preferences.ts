import { apiRequest } from '@/shared/api';
import { USE_MOCK_API } from '@/shared/config/api';

import type { NotificationPreferences } from '../model/notification-preferences';

import { mockReadNotificationPreferences } from './mock-notification-preferences';
import {
  mapNotificationPreferences,
  notificationPreferencesDtoSchema,
} from './notification-preferences.dto';

/** The account's preferences as the server holds them (`GET /auth/me`). */
export async function getNotificationPreferences(
  signal?: AbortSignal,
): Promise<NotificationPreferences> {
  if (USE_MOCK_API) return mockReadNotificationPreferences();
  const dto = await apiRequest('/auth/me', {
    method: 'GET',
    schema: notificationPreferencesDtoSchema,
    signal,
  });
  return mapNotificationPreferences(dto);
}
