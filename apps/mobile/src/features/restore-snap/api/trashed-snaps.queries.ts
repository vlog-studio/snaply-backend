import { queryOptions } from '@tanstack/react-query';

import { getTrashedSnaps } from './get-trashed-snaps';

/**
 * The account's 최근 삭제. Not keyed by account: the query cache is cleared
 * whenever the signed-in account changes (`library-scope-gate.tsx`).
 */
export const trashedSnapQueries = {
  all: () => ['trashed-snaps'] as const,
  list: () =>
    queryOptions({
      queryKey: [...trashedSnapQueries.all(), 'list'] as const,
      queryFn: ({ signal }) => getTrashedSnaps(signal),
      // A delete or a restore here invalidates it; another device's delete is
      // picked up the next time a screen that shows it mounts.
      staleTime: 30_000,
    }),
};
