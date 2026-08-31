import { queryOptions } from '@tanstack/react-query';

import { getCreditBalance } from './get-credit-balance';

/**
 * Query key + options factory for credit reads. Anything that changes the
 * balance server-side (a generation start, an ad reward, a purchase sync)
 * invalidates `creditQueries.all()` and lets the refetch tell the truth,
 * because the backend is the balance's only source.
 */
export const creditQueries = {
  all: () => ['credit'] as const,
  balance: () =>
    queryOptions({
      queryKey: [...creditQueries.all(), 'balance'] as const,
      queryFn: ({ signal }) => getCreditBalance(signal),
    }),
};
