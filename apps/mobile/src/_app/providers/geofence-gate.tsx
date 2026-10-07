import { useGeofenceMonitoring } from '@/features/geofence-monitor';
import { useNotificationPreferences } from '@/features/notification-settings';

/**
 * Headless bridge between the location-alert setting and OS geofencing. Composes
 * the two features at the app layer (they must not import each other): reads the
 * account's 위치 알림 preference from notification-settings and drives
 * geofence-monitor. Toggling 위치 알림 받기 in Settings starts or stops
 * monitoring here. Until the server has answered the preference is unknown, and
 * monitoring is left as it is.
 */
export function GeofenceGate(): null {
  const enabled = useNotificationPreferences()?.locationAlerts;
  useGeofenceMonitoring({ enabled });
  return null;
}
