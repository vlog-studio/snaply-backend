import { apiPath, apiRequest } from '@/shared/api';

import { recommendationDtoSchema, type RecommendationDto } from './recommendation.dto';

/** Read a recommendation's state and, once it is `done`, its slot assignments. */
export function getRecommendation(
  recommendationId: string,
  signal?: AbortSignal,
): Promise<RecommendationDto> {
  return apiRequest(apiPath('/movie-recommendations/{id}', { id: recommendationId }), {
    method: 'GET',
    schema: recommendationDtoSchema,
    signal,
  });
}
