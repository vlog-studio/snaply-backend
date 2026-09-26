import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef } from 'react';

import { creditQueries } from '@/entities/credit';
import { useMovies } from '@/entities/movie';

/**
 * Re-reads the credit balance whenever a run starts or ends.
 *
 * Every balance change a run causes happens on the server: starting one
 * reserves its credits (spec MOV-10), and a failure or a cancel refunds them.
 * The app never computes a balance (CRD-3), so the only honest answer is to ask
 * again — and the moment to ask is when the set of runs in flight changes,
 * which is the one signal all of those share, whichever screen or session
 * started the run. Without it a surface that stayed mounted across a run — the
 * 나 tab's 크레딧 row — kept printing the balance from before the spend.
 *
 * A finished run moves nothing (the reservation is simply kept); asking again
 * then costs one read, which is cheaper than a rule about which ending refunds.
 * Keyed on the job ids rather than a count, so one run ending as another starts
 * still reads as a change.
 */
export function useRunCreditRefresh(): void {
  const queryClient = useQueryClient();
  const movies = useMovies();

  const runningKey = useMemo(
    () =>
      movies
        .flatMap((movie) => (movie.status === 'generating' && movie.job ? [movie.job.id] : []))
        .sort()
        .join('|'),
    [movies],
  );

  // What the balance was last read against. Seeded with the first render's
  // runs, so mounting is not itself a reason to refetch.
  const seenKey = useRef(runningKey);

  useEffect(() => {
    if (seenKey.current === runningKey) return;
    seenKey.current = runningKey;
    void queryClient.invalidateQueries({ queryKey: creditQueries.all() });
  }, [queryClient, runningKey]);
}
