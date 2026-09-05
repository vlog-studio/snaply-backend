import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getHealth, type HealthData, ok } from '@vlog-studio/shared-types';
import { getPrisma } from '../db/client.js';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  const routes = app.withTypeProvider<ZodTypeProvider>();

  routes.get(
    getHealth.fastifyPath,
    { schema: { ...getHealth.schema, tags: ['system'], summary: '헬스체크' } },
    async () => {
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

      return ok<HealthData>({
        status: 'ok',
        uptimeSeconds: Math.floor(process.uptime()),
        db,
      });
    },
  );
}
