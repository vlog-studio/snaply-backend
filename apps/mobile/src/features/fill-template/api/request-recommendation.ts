import { apiRequest } from '@/shared/api';

import { recommendationAcceptedDtoSchema } from './recommendation.dto';

/**
 * Ask the server to propose snaps for a template's slots
 * (`POST /movie-recommendations`). Returns the id to poll.
 *
 * `candidates` must be in capture order, oldest first — the server reads that
 * order as where each snap sits in the outing, which is what keeps a proposal
 * starting where the outing started even when no keyword matches anything.
 *
 * Safe to call again with the same candidates: the server answers with the
 * existing recommendation rather than paying for the analysis twice.
 */
export function requestRecommendation(
  templateId: string,
  candidates: readonly string[],
  signal?: AbortSignal,
): Promise<string> {
  return apiRequest('/movie-recommendations', {
    method: 'POST',
    body: { templateId, candidates: [...candidates] },
    schema: recommendationAcceptedDtoSchema,
    signal,
  }).then((accepted) => accepted.id);
}
