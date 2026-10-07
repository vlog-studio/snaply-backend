import { useState } from 'react';

import {
  getBackgroundLocationPermission,
  getForegroundLocationPermission,
  requestBackgroundLocationPermission,
  requestForegroundLocationPermission,
} from '@/shared/lib/location';

import { useDeviceGrant } from './use-device-grant';
import { useNotificationPreferences } from './use-notification-preferences';
import { useUpdateNotificationPreferences } from './use-update-notification-preferences';

export type LocationAlerts = {
  /** The account's switch. False until the preferences have loaded. */
  enabled: boolean;
  /** False until the preferences have loaded — the switch holds still. */
  ready: boolean;
  /**
   * True when this device cannot watch for arrivals: the OS refused the last
   * attempt to turn the switch on, or it is on for the account but this device
   * lacks background ("항상 허용") location.
   */
  blocked: boolean;
  setEnabled: (next: boolean) => void;
  /** Set when the server did not take the last change. */
  error: string | null;
};

/** Foreground and background location — what geofencing needs. Check-only. */
async function hasAlwaysLocation(): Promise<boolean> {
  if (!(await getForegroundLocationPermission()).granted) return false;
  return (await getBackgroundLocationPermission()).granted;
}

/**
 * The 위치 알림 받기 switch, permission included — the same contract as
 * useMovieReadyAlerts: turning it on asks the OS first, and a refusal leaves
 * the switch off and says so, rather than turning on a preference geofencing
 * can never honor. Geofencing needs background ("항상 허용") location, which
 * the OS only grants on top of foreground access, so the requests run in that
 * order and both must succeed.
 *
 * Turning it off never asks anything — it just stops the monitoring.
 */
export function useLocationAlerts(): LocationAlerts {
  const preferences = useNotificationPreferences();
  const { update, error } = useUpdateNotificationPreferences();
  const [refused, setRefused] = useState(false);
  const enabled = preferences?.locationAlerts === true;
  const granted = useDeviceGrant(hasAlwaysLocation, enabled);

  const setEnabled = (next: boolean) => {
    if (!next) {
      setRefused(false);
      void update({ locationAlerts: false });
      return;
    }
    void (async () => {
      const foreground = await requestForegroundLocationPermission();
      const allowed = foreground.granted
        ? (await requestBackgroundLocationPermission()).granted
        : false;
      setRefused(!allowed);
      if (allowed) await update({ locationAlerts: true });
    })();
  };

  return {
    enabled,
    ready: preferences !== undefined,
    blocked: refused || (enabled && granted === false),
    setEnabled,
    error,
  };
}
