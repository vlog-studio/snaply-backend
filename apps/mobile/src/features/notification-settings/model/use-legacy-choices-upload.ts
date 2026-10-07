import { useEffect, useRef } from 'react';

import { useClearLegacyChoices, useLegacyChoices } from './notification-settings-store';
import { useNotificationPreferences } from './use-notification-preferences';
import { useUpdateNotificationPreferences } from './use-update-notification-preferences';

/**
 * Hands the server, once, the preferences an older build kept on this device
 * (`legacyChoices`) — only what the user had changed from that build's
 * defaults. Waits for the account's preferences to load, so the write lands on
 * the signed-in account and the screen moves with it; clears the choices only
 * once the server took them, so a failed attempt is retried on the next start.
 */
export function useLegacyChoicesUpload(): void {
  const choices = useLegacyChoices();
  const clear = useClearLegacyChoices();
  const loaded = useNotificationPreferences() !== undefined;
  const { update } = useUpdateNotificationPreferences();
  const sending = useRef(false);

  useEffect(() => {
    if (!choices || !loaded || sending.current) return;
    sending.current = true;
    void update(choices).then((took) => {
      sending.current = false;
      if (took) clear();
    });
    // `update` is rebuilt every render; the effect follows the inputs above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [choices, loaded, clear]);
}
