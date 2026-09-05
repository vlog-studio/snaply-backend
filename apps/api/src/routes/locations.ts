import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { listNearbyLocations, ok } from '@vlog-studio/shared-types';
import { listNearby } from '../services/location.service.js';

export async function locationRoutes(app: FastifyInstance): Promise<void> {
  const routes = app.withTypeProvider<ZodTypeProvider>();

  // GET /locations?lat=&lng=&radius= — 주변 위치 목록
  routes.get(
    listNearbyLocations.fastifyPath,
    {
      preHandler: app.authenticate,
      schema: {
        ...listNearbyLocations.schema,
        tags: ['locations'],
        summary: '주변 위치 목록 (Haversine)',
      },
    },
    async (request) => {
      const data = await listNearby({
        lat: request.query.lat,
        lng: request.query.lng,
        radius: request.query.radius,
      });
      return ok(data);
    },
  );
}
