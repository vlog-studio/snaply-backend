import type { FastifyInstance } from 'fastify';
import type { ApiSuccess, NearbyLocation } from '@vlog-studio/shared-types';
import {
  API_ERROR_SCHEMA,
  AUTHENTICATED_ERROR_RESPONSES,
  NEARBY_LOCATION_SCHEMA,
  successResponseSchema,
} from '../schemas/responses.js';
import { listNearby } from '../services/location.service.js';

interface NearbyQuery {
  lat: number;
  lng: number;
  radius?: number;
}

export async function locationRoutes(app: FastifyInstance): Promise<void> {
  // GET /locations?lat=&lng=&radius= — 주변 위치 목록
  app.get<{ Querystring: NearbyQuery }>(
    '/locations',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['locations'],
        summary: '주변 위치 목록 (Haversine)',
        querystring: {
          type: 'object',
          required: ['lat', 'lng'],
          properties: {
            lat: { type: 'number', minimum: -90, maximum: 90 },
            lng: { type: 'number', minimum: -180, maximum: 180 },
            radius: { type: 'number', minimum: 1, maximum: 50000, default: 5000 },
          },
        },
        response: {
          200: successResponseSchema({ type: 'array', items: NEARBY_LOCATION_SCHEMA }),
          400: API_ERROR_SCHEMA,
          ...AUTHENTICATED_ERROR_RESPONSES,
        },
      },
    },
    async (request): Promise<ApiSuccess<NearbyLocation[]>> => {
      const data = await listNearby({
        lat: request.query.lat,
        lng: request.query.lng,
        radius: request.query.radius ?? 5000,
      });
      return { success: true, data };
    },
  );
}
