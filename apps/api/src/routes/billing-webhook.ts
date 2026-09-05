import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { admobSsvCallback, revenuecatWebhook } from '@vlog-studio/shared-types';
import {
  getAdMobConfig,
  handleWebhookEvent,
  parseWebhookEvent,
  verifyWebhookAuth,
} from '../services/billing.service.js';
import { handleSsvCallback } from '../services/ad-reward.service.js';

/**
 * RevenueCat 웹훅.
 *
 * Stripe 와 달리 서명이 아니라 **Authorization 헤더 시크릿**으로 검증하므로 raw body 가
 * 필요 없다. 전역 JSON 파서를 그대로 쓴다.
 */
export async function billingWebhookRoutes(app: FastifyInstance): Promise<void> {
  const routes = app.withTypeProvider<ZodTypeProvider>();

  routes.post(
    revenuecatWebhook.fastifyPath,
    { schema: { ...revenuecatWebhook.schema, tags: ['system'], summary: 'RevenueCat 웹훅' } },
    async (request, reply) => {
      // 인증 실패는 401 이며 본문을 아예 읽지 않는다.
      verifyWebhookAuth(request.headers.authorization);
      await handleWebhookEvent(parseWebhookEvent(request.body));
      reply.status(200);
      return { received: true as const };
    },
  );

  /**
   * AdMob 보상형 광고 SSV 콜백.
   *
   * **GET + 쿼리스트링**이다 (https://developers.google.com/admob/android/ssv). 인증
   * 미들웨어를 붙이지 않는다 — 인증이 곧 서명이고, 서명 대상은 쿼리스트링 원문이다.
   * 그래서 `request.query` 로 재조립한 문자열이 아니라 `request.raw.url` 의 원문을 넘긴다.
   *
   * 검증 실패를 200 으로 삼키지 않는다. 삼키면 위조 시도와 정상 미지급이 로그에서
   * 구분되지 않는다.
   */
  routes.get(
    admobSsvCallback.fastifyPath,
    {
      schema: {
        ...admobSsvCallback.schema,
        tags: ['system'],
        summary: 'AdMob 보상형 광고 SSV 콜백',
      },
    },
    async (request, reply) => {
      const rawUrl = request.raw.url ?? '';
      const queryStart = rawUrl.indexOf('?');
      await handleSsvCallback({
        config: getAdMobConfig(),
        rawQuery: queryStart < 0 ? '' : rawUrl.slice(queryStart + 1),
      });
      reply.status(200);
      return { received: true as const };
    },
  );
}
