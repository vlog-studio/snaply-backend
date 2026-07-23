import type { FastifyInstance } from 'fastify';
import type { ApiSuccess, NearbyLocation } from '@vlog-studio/shared-types';
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
        querystring: {
          type: 'object',
          required: ['lat', 'lng'],
          properties: {
            lat: { type: 'number', minimum: -90, maximum: 90 },
            lng: { type: 'number', minimum: -180, maximum: 180 },
            radius: { type: 'number', minimum: 1, maximum: 50000, default: 5000 },
          },
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
