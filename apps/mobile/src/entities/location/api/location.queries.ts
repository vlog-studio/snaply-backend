import { queryOptions } from '@tanstack/react-query';

import { getLocations, type GetLocationsParams } from './get-locations';

/**
 * Query key + options factory for location reads. Consumers use these so keys
 * stay consistent for caching and invalidation instead of hand-writing arrays.
 */
export const locationQueries = {
  all: () => ['location'] as const,
  nearby: (params: GetLocationsParams) =>
    queryOptions({
      queryKey: [
        ...locationQueries.all(),
        'nearby',
        params.latitude,
        params.longitude,
        params.radiusMeters ?? null,
      ] as const,
      queryFn: ({ signal }) => getLocations(params, signal),
    }),
};
