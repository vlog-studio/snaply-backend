import { useQuery } from '@tanstack/react-query';

import { useIsAuthenticated } from '@/entities/session';

import { notificationPreferencesQueries } from '../api/notification-preferences.queries';

import type { NotificationPreferences } from './notification-preferences';

/**
 * The signed-in account's notification preferences, or `undefined` until the
 * server has answered (and while signed out, or when the read failed).
 *
 * Callers treat `undefined` as "not known" rather than as off: the geofence
 * gate leaves monitoring as it is, the settings screen holds its controls, and
 * nothing announces. Reading it as off would stop monitoring on every cold
 * start before the network is up.
 */
export function useNotificationPreferences(): NotificationPreferences | undefined {
  const isAuthenticated = useIsAuthenticated();
  return useQuery({ ...notificationPreferencesQueries.current(), enabled: isAuthenticated }).data;
}
