import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { notificationPreferencesQueries } from '../api/notification-preferences.queries';
import { updateNotificationPreferences } from '../api/update-notification-preferences';

import type { NotificationPreferences } from './notification-preferences';

const UpdateErrorMessage = '알림 설정을 바꾸지 못했어요. 다시 시도해 주세요.';

/**
 * The newest write per query client. A write's answer is the server's whole
 * record, so an older answer landing after a newer optimistic change would put
 * the older value back on screen; only the newest write commits its answer.
 */
const latestWrite = new WeakMap<QueryClient, number>();

export type UpdateNotificationPreferences = {
  /** Writes `change`; resolves whether the server took it. */
  update: (change: Partial<NotificationPreferences>) => Promise<boolean>;
  error: string | null;
};

/**
 * Writing the account's preferences.
 *
 * The change shows at once (a switch that waits for the network feels broken)
 * and the server's answer replaces it. A refusal puts the changed fields back,
 * says so, and re-reads, so the screen never keeps a value the server does not
 * hold. Before the preferences have loaded there is nothing to change.
 */
export function useUpdateNotificationPreferences(): UpdateNotificationPreferences {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const { queryKey } = notificationPreferencesQueries.current();

  async function update(change: Partial<NotificationPreferences>): Promise<boolean> {
    const before = queryClient.getQueryData(queryKey);
    if (!before) return false;
    const write = (latestWrite.get(queryClient) ?? 0) + 1;
    latestWrite.set(queryClient, write);
    setError(null);
    queryClient.setQueryData(queryKey, { ...before, ...change });

    try {
      const saved = await updateNotificationPreferences(change);
      if (latestWrite.get(queryClient) === write) queryClient.setQueryData(queryKey, saved);
      return true;
    } catch {
      if (latestWrite.get(queryClient) === write) {
        queryClient.setQueryData(queryKey, (current) =>
          current ? { ...current, ...pick(before, change) } : current,
        );
      }
      setError(UpdateErrorMessage);
      void queryClient.invalidateQueries({ queryKey });
      return false;
    }
  }

  return { update, error };
}

/** `before`'s values for the fields `change` names. */
function pick(
  before: NotificationPreferences,
  change: Partial<NotificationPreferences>,
): Partial<NotificationPreferences> {
  return Object.fromEntries(
    (Object.keys(change) as (keyof NotificationPreferences)[]).map((key) => [key, before[key]]),
  );
}
