import { queryOptions } from '@tanstack/react-query';

import { getAdRewardAvailability } from './get-ad-reward-availability';

/**
 * Query key + options factory for the reward-availability read. Invalidated
 * together with `creditQueries` after a grant, because a grant consumes one
 * of `remainingToday`.
 */
export const adRewardQueries = {
  all: () => ['ad-reward'] as const,
  availability: () =>
    queryOptions({
      queryKey: [...adRewardQueries.all(), 'availability'] as const,
      queryFn: ({ signal }) => getAdRewardAvailability(signal),
    }),
};
