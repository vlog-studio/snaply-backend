import { queryOptions } from '@tanstack/react-query';

import { getRecommendation } from './get-recommendation';
import type { RecommendationDto } from './recommendation.dto';
import { requestRecommendation } from './request-recommendation';

/** How often the result is asked for while the server is still analysing. */
const PollIntervalMs = 2_000;

/**
 * Query factories for the two halves of a recommendation: the request that
 * starts one, and the poll that waits for it.
 *
 * Both are `retry: false`. Every failure here — the endpoint switched off, no
 * network, a candidate the server refuses — has the same answer: the screen
 * keeps the local match it already drew. Retrying would only delay a fallback
 * that costs the user nothing.
 *
 * The request key is built from the **sorted** candidate ids, matching how the
 * server decides two requests are the same. Reordering the same outing must not
 * look like a new recommendation to either side.
 */
export const recommendationQueries = {
  all: () => ['template-recommendation'] as const,
  request: (templateId: string, candidates: readonly string[]) =>
    queryOptions({
      queryKey: [
        ...recommendationQueries.all(),
        'request',
        templateId,
        [...candidates].sort().join(','),
      ] as const,
      queryFn: ({ signal }) => requestRecommendation(templateId, candidates, signal),
      // The id is stable for as long as the server reuses the recommendation;
      // asking again would spend a request to be told the same id.
      staleTime: Infinity,
      retry: false,
    }),
  result: (recommendationId: string) =>
    queryOptions({
      queryKey: [...recommendationQueries.all(), 'result', recommendationId] as const,
      queryFn: ({ signal }) => getRecommendation(recommendationId, signal),
      // Scoring happens when the server is polled, so this poll is what finishes
      // the work. It stops the moment the answer is final.
      refetchInterval: (query) =>
        query.state.data?.status === 'processing' ? PollIntervalMs : false,
      staleTime: 0,
      retry: false,
    }),
};

export type { RecommendationDto };
