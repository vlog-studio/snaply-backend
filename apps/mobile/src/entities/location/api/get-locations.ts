import { apiRequest } from '@/shared/api';
import { USE_MOCK_API } from '@/shared/config/api';

import type { Location } from '../model/location';
import { locationsDtoSchema, mapLocation } from './location.dto';
import { mockLocationDtos } from './mock-locations';

export type GetLocationsParams = {
  latitude: number;
  longitude: number;
  /** Search radius in meters; defaults to 5000 to match the backend spec. */
  radiusMeters?: number;
};

const DEFAULT_RADIUS_METERS = 5000;

async function getLocationsFromApi(
  params: GetLocationsParams,
  signal?: AbortSignal,
): Promise<Location[]> {
  const dtos = await apiRequest('/locations', {
    method: 'GET',
    query: {
      lat: params.latitude,
      lng: params.longitude,
      radius: params.radiusMeters ?? DEFAULT_RADIUS_METERS,
    },
    schema: locationsDtoSchema,
    signal,
  });
  return dtos.map(mapLocation);
}

// The real endpoint filters by radius server-side (Haversine); the mock returns
// the full seed set so all categories are available during development.
function getLocationsMock(): Promise<Location[]> {
  return Promise.resolve(mockLocationDtos.map(mapLocation));
}

/**
 * Fetch geofence points near a coordinate. Routes to the in-code mock until a
 * backend origin is configured (see `USE_MOCK_API`); the return type is
 * identical either way so consumers never branch on the mode.
 */
export function getLocations(
  params: GetLocationsParams,
  signal?: AbortSignal,
): Promise<Location[]> {
  return USE_MOCK_API ? getLocationsMock() : getLocationsFromApi(params, signal);
}
