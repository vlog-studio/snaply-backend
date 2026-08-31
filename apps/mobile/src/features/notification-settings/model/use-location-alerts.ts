import { useState } from 'react';

import {
  requestBackgroundLocationPermission,
  requestForegroundLocationPermission,
} from '@/shared/lib/location';

import { useNotificationEnabled, useSetNotificationEnabled } from './notification-settings-store';

export type LocationAlerts = {
  enabled: boolean;
  /** True when the OS refused the last attempt to turn the preference on. */
  blocked: boolean;
  setEnabled: (next: boolean) => void;
};

/**
 * The 위치 알림 받기 switch, permission included — the same contract as
 * useMovieReadyAlerts: turning it on asks the OS first, and a refusal leaves
 * the switch off and says so, rather than storing a preference geofencing can
 * never honor. Geofencing needs background ("항상 허용") location, which the OS
 * only grants on top of foreground access, so the requests run in that order
 * and both must succeed.
 *
 * Turning it off never asks anything — it just stops the monitoring.
 */
export function useLocationAlerts(): LocationAlerts {
  const enabled = useNotificationEnabled();
  const setStoredEnabled = useSetNotificationEnabled();
  const [blocked, setBlocked] = useState(false);

  const setEnabled = (next: boolean) => {
    if (!next) {
      setBlocked(false);
      setStoredEnabled(false);
      return;
    }
    void (async () => {
      const foreground = await requestForegroundLocationPermission();
      const granted = foreground.granted
        ? (await requestBackgroundLocationPermission()).granted
        : false;
      setBlocked(!granted);
      setStoredEnabled(granted);
    })();
  };

  return { enabled, blocked, setEnabled };
}
