import type { FastifyInstance } from 'fastify';
import {
  API_ERROR_SCHEMA,
  COMMON_ERROR_RESPONSES,
  WEBHOOK_RECEIVED_SCHEMA,
} from '../schemas/responses.js';
import {
  handleWebhookEvent,
  parseWebhookEvent,
  verifyWebhookAuth,
} from '../services/billing.service.js';

/**
 * RevenueCat 웹훅.
 *
 * Stripe 와 달리 서명이 아니라 **Authorization 헤더 시크릿**으로 검증하므로 raw body 가
 * 필요 없다. 전역 JSON 파서를 그대로 쓴다.
 */
export async function billingWebhookRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/billing/webhook/revenuecat',
    {
      schema: {
        tags: ['system'],
        summary: 'RevenueCat 웹훅',
        response: {
          200: WEBHOOK_RECEIVED_SCHEMA,
          400: API_ERROR_SCHEMA,
          ...COMMON_ERROR_RESPONSES,
        },
      },
    },
    async (request, reply) => {
      // 인증 실패는 401 이며 본문을 아예 읽지 않는다.
      verifyWebhookAuth(request.headers.authorization);
      await handleWebhookEvent(parseWebhookEvent(request.body));
      reply.status(200);
      return { received: true };
    },
  );
}
