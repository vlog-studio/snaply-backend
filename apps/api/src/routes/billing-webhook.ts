import type { FastifyInstance } from 'fastify';
import {
  API_ERROR_SCHEMA,
  COMMON_ERROR_RESPONSES,
  WEBHOOK_RECEIVED_SCHEMA,
} from '../schemas/responses.js';
import { parseWebhook, handleWebhookEvent } from '../services/billing.service.js';

/**
 * Stripe 웹훅은 서명 검증을 위해 raw body가 필요하다.
 * 이 플러그인은 캡슐화된 스코프이므로 여기 추가한 buffer 파서가 전역 JSON 파서에 영향을 주지 않는다.
 */
export async function billingWebhookRoutes(app: FastifyInstance): Promise<void> {
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_req, body, done) => {
    done(null, body);
  });

  app.post(
    '/billing/webhook',
    {
      schema: {
        tags: ['system'],
        summary: 'Stripe 웹훅',
        response: {
          200: WEBHOOK_RECEIVED_SCHEMA,
          400: API_ERROR_SCHEMA,
          ...COMMON_ERROR_RESPONSES,
        },
      },
    },
    async (request, reply) => {
      const signature = request.headers['stripe-signature'];
      const rawBody = request.body as Buffer;
      // 서명 검증 실패 → 400 (Stripe 재시도 트리거), 성공 → 200
      const event = await parseWebhook(rawBody, Array.isArray(signature) ? signature[0] : signature);
      await handleWebhookEvent(event);
      reply.status(200);
      return { received: true };
    },
  );
}
