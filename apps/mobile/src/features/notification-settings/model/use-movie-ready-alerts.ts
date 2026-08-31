import { useState } from 'react';

import { requestLocalNotificationPermission } from '@/shared/lib/notifications';

import { useMovieReadyEnabled, useSetMovieReadyEnabled } from './notification-settings-store';

export type MovieReadyAlerts = {
  enabled: boolean;
  /** True when the OS refused the last attempt to turn the preference on. */
  blocked: boolean;
  setEnabled: (next: boolean) => void;
};

/**
 * The 무비 완성 알림 switch, permission included.
 *
 * Turning it on is the moment to ask the OS: it is a control the user just
 * touched, so the system prompt has a reason the user can see, and there is no
 * point storing a preference the device will never honor. A refusal leaves the
 * switch off and says so rather than looking on and staying silent.
 *
 * Turning it off never asks anything — a denied grant is the OS's to change, and
 * the user can still stop the app from announcing anything.
 */
export function useMovieReadyAlerts(): MovieReadyAlerts {
  const enabled = useMovieReadyEnabled();
  const setStoredEnabled = useSetMovieReadyEnabled();
  const [blocked, setBlocked] = useState(false);

  const setEnabled = (next: boolean) => {
    if (!next) {
      setBlocked(false);
      setStoredEnabled(false);
      return;
    }
    void (async () => {
      const granted = await requestLocalNotificationPermission();
      setBlocked(!granted);
      setStoredEnabled(granted);
    })();
  };

  return { enabled, blocked, setEnabled };
}
