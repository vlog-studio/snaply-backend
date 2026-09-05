import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { reportGeofenceEnter, ok } from '@vlog-studio/shared-types';
import { handleGeofenceEnter } from '../services/location.service.js';

export async function notificationRoutes(app: FastifyInstance): Promise<void> {
  const routes = app.withTypeProvider<ZodTypeProvider>();

  // POST /notifications/geofence-enter — Geofence 진입 → 조건 통과 시 FCM
  routes.post(
    reportGeofenceEnter.fastifyPath,
    {
      preHandler: app.authenticate,
      config: {
        // 유저(토큰)당 분당 10회
        rateLimit: {
          max: 10,
          timeWindow: '1 minute',
          keyGenerator: (req) => req.headers.authorization ?? req.ip,
        },
      },
      schema: {
        ...reportGeofenceEnter.schema,
        tags: ['locations'],
        summary: 'Geofence 진입 → FCM',
      },
    },
    async (request) => {
      const data = await handleGeofenceEnter({
        userId: request.user.id,
        locationId: request.body.locationId,
        logger: request.log,
      });
      return ok(data);
    },
  );
}
