import { z } from 'zod';

import type { NotificationPreferences } from '../model/notification-preferences';

/**
 * The notification fields of the account profile (`GET`/`PATCH /auth/me`).
 * Only these are declared; Zod strips the rest of the profile.
 *
 * `notificationEnabled`, the master switch, is not read: the app has no control
 * for it and never writes it (docs/decisions/notification-preferences.md).
 */
export const notificationPreferencesDtoSchema = z.object({
  locationNotificationEnabled: z.boolean(),
  movieNotificationEnabled: z.boolean(),
  quietStart: z.number(),
  quietEnd: z.number(),
});

export type NotificationPreferencesDto = z.infer<typeof notificationPreferencesDtoSchema>;

export function mapNotificationPreferences(
  dto: NotificationPreferencesDto,
): NotificationPreferences {
  return {
    locationAlerts: dto.locationNotificationEnabled,
    movieReady: dto.movieNotificationEnabled,
    quietStart: dto.quietStart,
    quietEnd: dto.quietEnd,
  };
}

/** A change, in the profile's field names. Only what changed is sent. */
export function toPreferencesPatch(change: Partial<NotificationPreferences>) {
  return {
    ...(change.locationAlerts !== undefined
      ? { locationNotificationEnabled: change.locationAlerts }
      : null),
    ...(change.movieReady !== undefined ? { movieNotificationEnabled: change.movieReady } : null),
    ...(change.quietStart !== undefined ? { quietStart: change.quietStart } : null),
    ...(change.quietEnd !== undefined ? { quietEnd: change.quietEnd } : null),
  };
}
