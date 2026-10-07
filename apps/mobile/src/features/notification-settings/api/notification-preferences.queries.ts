import { queryOptions } from '@tanstack/react-query';

import { getNotificationPreferences } from './get-notification-preferences';

/**
 * The account's notification preferences. Not keyed by account: the query
 * cache is cleared whenever the signed-in account changes
 * (`library-scope-gate.tsx`), so one account's switches never answer for
 * another.
 */
export const notificationPreferencesQueries = {
  all: () => ['notification-preferences'] as const,
  current: () =>
    queryOptions({
      queryKey: [...notificationPreferencesQueries.all()] as const,
      queryFn: ({ signal }) => getNotificationPreferences(signal),
      // Only this account changes them, and every change here writes the
      // server's answer straight into the cache.
      staleTime: 5 * 60_000,
    }),
};
