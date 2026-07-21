import Fastify, { type FastifyInstance } from 'fastify';
import { healthRoutes } from './routes/health.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
    },
  });

  await app.register(healthRoutes);

  app.setErrorHandler((error, request, reply) => {
    request.log.error(error);
    const statusCode = error.statusCode && error.statusCode >= 400 ? error.statusCode : 500;
    reply.status(statusCode).send({
      success: false,
      error: {
        code: error.code ?? 'INTERNAL_SERVER_ERROR',
        message: statusCode >= 500 ? '서버 오류가 발생했습니다.' : error.message,
      },
    });
  });

  app.setNotFoundHandler((_request, reply) => {
    reply.status(404).send({
      success: false,
      error: { code: 'NOT_FOUND', message: '요청한 리소스를 찾을 수 없습니다.' },
    });
  });

  return app;
}
