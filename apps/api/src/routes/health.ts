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
      // `DATABASE_URL` 은 기동 시점에 강제되므로(config.ts) 여기서는 연결 여부만 본다.
      // 계약의 `not_configured` 는 남겨 둔다 — 값이 있어도 못 붙는 경우와 구분이 필요했던
      // 이력이 있고, 응답 형태를 바꾸면 앱 계약이 바뀐다.
      let db: HealthData['db'];
      try {
        await getPrisma().$queryRaw`SELECT 1`;
        db = 'connected';
      } catch (err) {
        app.log.error(err, 'health check DB query failed');
        db = 'error';
      }

      return ok<HealthData>({
        status: 'ok',
        uptimeSeconds: Math.floor(process.uptime()),
        db,
      });
    },
  );
}
