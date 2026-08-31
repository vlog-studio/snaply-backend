import { z } from 'zod';

import type { Location } from '../model/location';

/**
 * The wire fields of a location the app consumes from `GET /locations`
 * (camelCase, per the backend API spec). Validated at the transport boundary and
 * mapped to the `Location` domain model so wire field names never leak into the
 * app.
 *
 * The endpoint also returns `distanceMeters` and orders by it; the app re-derives
 * distance from its own resolved position when it picks which regions to monitor
 * (`features/geofence-monitor/lib/select-nearest-regions`), so that field is not
 * mapped and Zod strips it.
 */
export const locationDtoSchema = z.object({
  id: z.string(),
  name: z.string(),
  lat: z.number(),
  lng: z.number(),
  radiusMeters: z.number().int(),
  // Free-form text on the backend ('카페', '관광지', …). Deliberately not
  // narrowed to a union: a category the app has not seen must not fail the
  // whole response and silently disable geofencing.
  category: z.string(),
});

export type LocationDto = z.infer<typeof locationDtoSchema>;

export const locationsDtoSchema = z.array(locationDtoSchema);

export function mapLocation(dto: LocationDto): Location {
  return {
    id: dto.id,
    name: dto.name,
    latitude: dto.lat,
    longitude: dto.lng,
    radiusMeters: dto.radiusMeters,
    category: dto.category,
  };
}
