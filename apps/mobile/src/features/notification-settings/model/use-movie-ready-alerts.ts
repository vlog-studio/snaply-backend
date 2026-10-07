import { useState } from 'react';

import {
  hasLocalNotificationPermission,
  requestLocalNotificationPermission,
} from '@/shared/lib/notifications';

import { useDeviceGrant } from './use-device-grant';
import { useNotificationPreferences } from './use-notification-preferences';
import { useUpdateNotificationPreferences } from './use-update-notification-preferences';

export type MovieReadyAlerts = {
  /** The account's switch. False until the preferences have loaded. */
  enabled: boolean;
  /** False until the preferences have loaded — the switch holds still. */
  ready: boolean;
  /**
   * True when this device will not show what the switch allows: the OS refused
   * the last attempt to turn it on, or it is on for the account but this
   * device has no notification grant (a new device, or one turned off in the
   * OS settings).
   */
  blocked: boolean;
  setEnabled: (next: boolean) => void;
  /** Set when the server did not take the last change. */
  error: string | null;
};

/**
 * The 무비 완성 알림 switch, permission included.
 *
 * Turning it on is the moment to ask the OS: it is a control the user just
 * touched, so the system prompt has a reason the user can see, and there is no
 * point turning on a preference the device will never honor. A refusal leaves
 * the switch off and says so rather than looking on and staying silent. The
 * switch itself is the account's (NTF-7) — off for a new account.
 *
 * Turning it off never asks anything — a denied grant is the OS's to change, and
 * the user can still stop the server from announcing anything.
 */
export function useMovieReadyAlerts(): MovieReadyAlerts {
  const preferences = useNotificationPreferences();
  const { update, error } = useUpdateNotificationPreferences();
  const [refused, setRefused] = useState(false);
  const enabled = preferences?.movieReady === true;
  const granted = useDeviceGrant(hasLocalNotificationPermission, enabled);

  const setEnabled = (next: boolean) => {
    if (!next) {
      setRefused(false);
      void update({ movieReady: false });
      return;
    }
    void (async () => {
      const allowed = await requestLocalNotificationPermission();
      setRefused(!allowed);
      if (allowed) await update({ movieReady: true });
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
