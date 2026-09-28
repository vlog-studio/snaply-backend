import { queryOptions } from '@tanstack/react-query';

import { getAnalysisConsent } from './get-analysis-consent';

/**
 * The account's analysis consent. Not keyed by account: the query cache is
 * cleared whenever the signed-in account changes (`library-scope-gate.tsx`), so
 * one account's yes can never answer for another.
 */
export const analysisConsentQueries = {
  all: () => ['analysis-consent'] as const,
  status: () =>
    queryOptions({
      queryKey: [...analysisConsentQueries.all(), 'status'] as const,
      queryFn: ({ signal }) => getAnalysisConsent(signal),
      // Only this account changes it, and every change here writes the answer
      // straight into the cache — a refetch would re-learn the same thing.
      staleTime: 5 * 60_000,
    }),
};
