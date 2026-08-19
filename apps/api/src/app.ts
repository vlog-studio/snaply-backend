import Fastify, { type FastifyInstance } from 'fastify';
import websocket from '@fastify/websocket';
import type { AppConfig } from './config.js';
import rateLimit from '@fastify/rate-limit';
import { AppError } from './lib/errors.js';
import { registerDocs } from './plugins/swagger.js';
import { captureException } from './lib/sentry.js';
import { authPlugin } from './plugins/auth.js';
import { initStorage } from './services/storage.service.js';
import { initRedis } from './lib/redis.js';
import { initEditQueue } from './queue/edit-queue.js';
import { initVideoAnalysisQueue } from './queue/video-analysis-queue.js';
import { initFcm } from './services/fcm.service.js';
import { initCrypto } from './lib/crypto.js';
import { initSns } from './services/sns.service.js';
import { initBilling } from './services/billing.service.js';
import { initSupabaseAdmin } from './services/supabase-admin.service.js';
import { healthRoutes } from './routes/health.js';
import { legalRoutes } from './routes/legal.js';
import { authRoutes } from './routes/auth.js';
import { videoRoutes } from './routes/videos.js';
import { videoAnalysisRoutes } from './routes/video-analyses.js';
import { editJobRoutes } from './routes/edit-jobs.js';
import { movieTemplateRoutes } from './routes/movie-templates.js';
import { locationRoutes } from './routes/locations.js';
import { notificationRoutes } from './routes/notifications.js';
import { snsRoutes } from './routes/sns.js';
import { snsWebhookRoutes } from './routes/sns-webhook.js';
import { billingRoutes } from './routes/billing.js';
import { billingWebhookRoutes } from './routes/billing-webhook.js';

export async function buildApp(config: AppConfig): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
      // 개인정보/자격증명 로그 마스킹
      redact: [
        'req.headers.authorization',
        'req.query.token',
        '*.accessToken',
        '*.refreshToken',
        '*.fcmToken',
        '*.access_token',
      ],
    },
  });

  // 에러/404 핸들러는 라우트 등록보다 먼저 설정해야 자식 컨텍스트가 상속받는다.
  app.setErrorHandler((error, request, reply) => {
    // 커스텀 도메인 에러. **rate limit 판정보다 앞이다** — 도메인에도 429 를 쓰는 한도가 있고
    // (예: 추천 일일 한도 RECOMMENDATION_LIMIT), 뒤에 두면 그 코드가 전부 RATE_LIMITED 로
    // 뭉개져 앱이 "잠시 후 다시"와 "오늘은 끝"을 구분할 수 없다.
    if (error instanceof AppError) {
      reply.status(error.statusCode).send({
        success: false,
        // details 를 먼저 펼친다 — code/message 는 어떤 부가 정보로도 덮이지 않아야 한다.
        error: { ...error.details, code: error.code, message: error.message },
      });
      return;
    }

    // 플러그인이 만든 rate limit 초과 → 429
    if (error.statusCode === 429 || error.code === 'FST_ERR_RATE_LIMIT') {
      reply.status(429).send({
        success: false,
        error: { code: 'RATE_LIMITED', message: '요청이 너무 많습니다. 잠시 후 다시 시도하세요.' },
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
      captureException(error, { url: request.url, method: request.method });
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
  initVideoAnalysisQueue(config.redis.analysisQueueName);
  initFcm(config.firebase);
  initCrypto(config.sns.tokenEncryptionKey);
  initSns(config.sns);
  initBilling(config.billing);
  initSupabaseAdmin({ url: config.supabaseUrl, serviceRoleKey: config.supabaseServiceRoleKey });

  // 전역 rate limit: IP당 분당 60 (라우트별로 override 가능)
  await app.register(rateLimit, {
    global: true,
    max: Number(process.env.RATE_LIMIT_GLOBAL_MAX ?? 60),
    timeWindow: '1 minute',
    keyGenerator: (req) => req.ip,
    // RevenueCat 웹훅은 소수의 발신 IP에서 몰려 오므로 IP 기준 제한에 걸리면 안 된다.
    // (429를 주면 재시도가 쌓이고, Authorization 헤더 검증으로 이미 위조는 막힌다.)
    allowList: (req) => req.url.startsWith('/billing/webhook'),
  });

  // OpenAPI 문서(개발 환경에서만) — 라우트 등록 전에 등록해야 스키마가 수집된다.
  //
  // 판정은 `!== 'production'` 이 아니라 `=== 'development'` 다. 운영은 .env 파일이 아니라
  // 주입으로 값을 받는데, NODE_ENV 주입을 빠뜨리거나 오타를 내도 배포는 성공한다.
  // `!==` 로 두면 그 경우 문서와 개발 로그인이 열린 채로 뜬다 — 닫히는 쪽으로 떨어뜨린다.
  const isDevelopment = process.env.NODE_ENV === 'development';
  const docsEnabled = isDevelopment || process.env.ENABLE_DOCS === 'true';
  if (docsEnabled) {
    await registerDocs(app, {
      supabaseUrl: config.supabaseUrl,
      supabasePublishableKey: config.supabasePublishableKey,
      allowDevLogin: isDevelopment,
    });
  }

  await app.register(websocket);
  await app.register(authPlugin, config);
  await app.register(healthRoutes);
  await app.register(legalRoutes);
  await app.register(authRoutes);
  await app.register(videoRoutes);
  await app.register(videoAnalysisRoutes);
  await app.register(editJobRoutes);
  await app.register(movieTemplateRoutes);
  await app.register(locationRoutes);
  await app.register(notificationRoutes);
  await app.register(snsRoutes);
  await app.register(snsWebhookRoutes);
  await app.register(billingRoutes);
  await app.register(billingWebhookRoutes);

  return app;
}
