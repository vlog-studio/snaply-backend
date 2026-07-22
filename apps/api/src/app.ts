import Fastify, { type FastifyInstance } from 'fastify';
import websocket from '@fastify/websocket';
import type { AppConfig } from './config.js';
import { AppError } from './lib/errors.js';
import { authPlugin } from './plugins/auth.js';
import { initStorage } from './services/storage.service.js';
import { initRedis } from './lib/redis.js';
import { initEditQueue } from './queue/edit-queue.js';
import { healthRoutes } from './routes/health.js';
import { authRoutes } from './routes/auth.js';
import { videoRoutes } from './routes/videos.js';
import { editJobRoutes } from './routes/edit-jobs.js';

export async function buildApp(config: AppConfig): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
    },
  });

  // 에러/404 핸들러는 라우트 등록보다 먼저 설정해야 자식 컨텍스트가 상속받는다.
  app.setErrorHandler((error, request, reply) => {
    // 커스텀 도메인 에러
    if (error instanceof AppError) {
      reply.status(error.statusCode).send({
        success: false,
        error: { code: error.code, message: error.message },
      });
      return;
    }

    // Fastify 스키마 검증 실패 → 400
    if (error.validation) {
      reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: error.message },
      });
      return;
    }

    const statusCode = error.statusCode && error.statusCode >= 400 ? error.statusCode : 500;
    if (statusCode >= 500) {
      request.log.error(error);
    }
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

  initStorage(config.storage);
  initRedis(config.redis);
  initEditQueue(config.redis.editQueueName);

  await app.register(websocket);
  await app.register(authPlugin, config);
  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(videoRoutes);
  await app.register(editJobRoutes);

  return app;
}
