import type { FastifyInstance } from 'fastify';
import type { ApiSuccess } from '@vlog-studio/shared-types';
import { getPrisma } from '../db/client.js';
import {
  COMMON_ERROR_RESPONSES,
  HEALTH_DATA_SCHEMA,
  successResponseSchema,
} from '../schemas/responses.js';

interface HealthData {
  status: 'ok';
  uptimeSeconds: number;
  db: 'connected' | 'not_configured' | 'error';
}

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/health',
    {
      schema: {
        tags: ['system'],
        summary: '헬스체크',
        response: {
          200: successResponseSchema(HEALTH_DATA_SCHEMA),
          ...COMMON_ERROR_RESPONSES,
        },
      },
    },
    async (): Promise<ApiSuccess<HealthData>> => {
      let db: HealthData['db'] = 'not_configured';

      if (process.env.DATABASE_URL) {
        try {
          await getPrisma().$queryRaw`SELECT 1`;
          db = 'connected';
        } catch (err) {
          app.log.error(err, 'health check DB query failed');
          db = 'error';
        }
      }

      return {
        success: true,
        data: {
          status: 'ok',
          uptimeSeconds: Math.floor(process.uptime()),
          db,
        },
      };
    },
  );
}
