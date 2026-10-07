import type { NotificationPreferences } from '../model/notification-preferences';

/** A new account's values, as the server starts them. */
const Defaults: NotificationPreferences = {
  locationAlerts: false,
  movieReady: false,
  quietStart: 22,
  quietEnd: 8,
};

let stored: NotificationPreferences = Defaults;

/** Mock mode keeps the preferences in memory, the way the server would keep them. */
export function mockReadNotificationPreferences(): Promise<NotificationPreferences> {
  return Promise.resolve(stored);
}

export function mockUpdateNotificationPreferences(
  change: Partial<NotificationPreferences>,
): Promise<NotificationPreferences> {
  stored = { ...stored, ...change };
  return Promise.resolve(stored);
}
