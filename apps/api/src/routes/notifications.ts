import type { FastifyInstance } from 'fastify';
import type { ApiSuccess } from '@vlog-studio/shared-types';
import { handleGeofenceEnter, type GeofenceResult } from '../services/location.service.js';

interface GeofenceBody {
  locationId: string;
}

export async function notificationRoutes(app: FastifyInstance): Promise<void> {
  // POST /notifications/geofence-enter — Geofence 진입 → 조건 통과 시 FCM
  app.post<{ Body: GeofenceBody }>(
    '/notifications/geofence-enter',
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
        tags: ['locations'],
        summary: 'Geofence 진입 → FCM',
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['locationId'],
          properties: {
            locationId: { type: 'string', format: 'uuid' },
          },
        },
      },
    },
    async (request): Promise<ApiSuccess<GeofenceResult>> => {
      const data = await handleGeofenceEnter({
        userId: request.user.id,
        locationId: request.body.locationId,
        logger: request.log,
      });
      return { success: true, data };
    },
  );
}
