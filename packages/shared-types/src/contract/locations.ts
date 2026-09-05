import { z } from 'zod';

import { AUTHENTICATED_ERROR_RESPONSES, apiErrorSchema, apiSuccess } from './common.js';
import { defineRoute } from './define-route.js';
import { geofenceSkipReasonSchema, locationCategorySchema } from './vocab.js';

export const NEARBY_DEFAULT_RADIUS_METERS = 5000;

export const nearbyLocationSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    lat: z.number(),
    lng: z.number(),
    radiusMeters: z.int(),
    category: locationCategorySchema,
    distanceMeters: z.int().min(0),
  })
  .meta({ id: 'NearbyLocation' });
export type NearbyLocation = z.infer<typeof nearbyLocationSchema>;

export const nearbyQuerySchema = z.object({
  lat: z.coerce.number<number>().min(-90).max(90),
  lng: z.coerce.number<number>().min(-180).max(180),
  radius: z.coerce.number<number>().min(1).max(50000).default(NEARBY_DEFAULT_RADIUS_METERS),
});
export type NearbyQuery = z.input<typeof nearbyQuerySchema>;

export const geofenceBodySchema = z.object({ locationId: z.uuid() });
export type GeofenceBody = z.infer<typeof geofenceBodySchema>;

export const geofenceResultSchema = z.union([
  z.object({ notified: z.literal(true) }),
  z.object({ notified: z.literal(false), reason: geofenceSkipReasonSchema }),
]);
export type GeofenceResult = z.infer<typeof geofenceResultSchema>;

export const listNearbyLocations = defineRoute({
  method: 'GET',
  path: '/locations',
  schema: {
    querystring: nearbyQuerySchema,
    response: {
      200: apiSuccess(z.array(nearbyLocationSchema)),
      400: apiErrorSchema,
      ...AUTHENTICATED_ERROR_RESPONSES,
    },
  },
});

export const reportGeofenceEnter = defineRoute({
  method: 'POST',
  path: '/notifications/geofence-enter',
  schema: {
    body: geofenceBodySchema,
    response: {
      200: apiSuccess(geofenceResultSchema),
      400: apiErrorSchema,
      404: apiErrorSchema,
      ...AUTHENTICATED_ERROR_RESPONSES,
    },
  },
});
