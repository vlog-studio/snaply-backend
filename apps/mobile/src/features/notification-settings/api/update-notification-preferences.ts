import { apiRequest } from '@/shared/api';
import { USE_MOCK_API } from '@/shared/config/api';

import type { NotificationPreferences } from '../model/notification-preferences';

import { mockUpdateNotificationPreferences } from './mock-notification-preferences';
import {
  mapNotificationPreferences,
  notificationPreferencesDtoSchema,
  toPreferencesPatch,
} from './notification-preferences.dto';

/** Writes the fields in `change` (`PATCH /auth/me`) and returns what the server now holds. */
export async function updateNotificationPreferences(
  change: Partial<NotificationPreferences>,
): Promise<NotificationPreferences> {
  if (USE_MOCK_API) return mockUpdateNotificationPreferences(change);
  const dto = await apiRequest('/auth/me', {
    method: 'PATCH',
    body: toPreferencesPatch(change),
    schema: notificationPreferencesDtoSchema,
  });
  return mapNotificationPreferences(dto);
}
