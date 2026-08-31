import { queryOptions } from '@tanstack/react-query';

import { getMovieTemplates } from './get-movie-templates';

/**
 * Query factory for the template catalog.
 *
 * Long `staleTime` on purpose: the catalog is product data that changes when
 * someone ships a migration, not per session. Asking again on every mount would
 * spend a request to learn nothing — and the screen has a built-in fallback for
 * the case where the answer never arrives.
 *
 * `retry: false` for the same reason. A failed fetch is not a failure the user
 * should wait through: the fallback catalog renders immediately and a later
 * mount will ask again.
 */
export const movieTemplateQueries = {
  all: () => ['movie-template'] as const,
  catalog: () =>
    queryOptions({
      queryKey: [...movieTemplateQueries.all(), 'catalog'] as const,
      queryFn: ({ signal }) => getMovieTemplates(signal),
      staleTime: 60 * 60 * 1000,
      retry: false,
    }),
};
