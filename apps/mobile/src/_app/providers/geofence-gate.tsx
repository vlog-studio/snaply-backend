import { useGeofenceMonitoring } from '@/features/geofence-monitor';
import { useNotificationEnabled } from '@/features/notification-settings';

/**
 * Headless bridge between the location-alert setting and OS geofencing. Composes
 * the two features at the app layer (they must not import each other): reads the
 * `enabled` preference from notification-settings and drives geofence-monitor.
 * Toggling 위치 알림 받기 in Settings starts or stops monitoring here.
 */
export function GeofenceGate(): null {
  const enabled = useNotificationEnabled();
  useGeofenceMonitoring({ enabled });
  return null;
}
