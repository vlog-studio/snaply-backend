import type { FastifyInstance, FastifyRequest } from 'fastify';
import { decodeJwt } from 'jose';
import type { ApiSuccess } from '@vlog-studio/shared-types';
import {
  getPlans,
  createCheckout,
  getSubscription,
  cancelSubscription,
  type PlanInfo,
  type SubscriptionDto,
} from '../services/billing.service.js';

interface CheckoutBody {
  plan: 'standard' | 'premium';
}

/**
 * Stripe 고객에 붙일 이메일을 토큰에서 꺼낸다.
 * `request.user`(공통 소유)에는 email이 없어서 이미 검증된 JWT를 다시 디코드만 한다.
 * 서명 검증은 preHandler(app.authenticate)가 이미 끝냈으므로 여기선 파싱만 한다.
 * TODO: AuthUser 에 email 추가는 인증 모듈 공동 소유라 Dev A와 합의 후 정리.
 */
function emailFromToken(request: FastifyRequest): string | undefined {
  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return undefined;
  }
  try {
    const { email } = decodeJwt(header.slice('Bearer '.length).trim());
    return typeof email === 'string' && email.length > 0 ? email : undefined;
  } catch {
    return undefined;
  }
}

export async function billingRoutes(app: FastifyInstance): Promise<void> {
  // GET /billing/plans — 플랜 목록 (인증 불필요)
  app.get(
    '/billing/plans',
    { schema: { tags: ['billing'], summary: '플랜 목록' } },
    async (): Promise<ApiSuccess<PlanInfo[]>> => {
      return { success: true, data: getPlans() };
    },
  );

  // GET /billing/subscription — 내 구독 상태
  app.get(
    '/billing/subscription',
    { preHandler: app.authenticate, schema: { tags: ['billing'], summary: '내 구독 상태' } },
    async (request): Promise<ApiSuccess<SubscriptionDto>> => {
      return { success: true, data: await getSubscription(request.user.id) };
    },
  );

  // POST /billing/checkout — Checkout Session 생성
  app.post<{ Body: CheckoutBody }>(
    '/billing/checkout',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['billing'],
        summary: 'Checkout Session 생성',
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['plan'],
          properties: { plan: { type: 'string', enum: ['standard', 'premium'] } },
        },
      },
    },
    async (request): Promise<ApiSuccess<{ checkoutUrl: string }>> => {
      const data = await createCheckout({
        userId: request.user.id,
        email: emailFromToken(request),
        plan: request.body.plan,
      });
      return { success: true, data };
    },
  );

  // POST /billing/cancel — 기간 만료 후 해지
  app.post(
    '/billing/cancel',
    { preHandler: app.authenticate, schema: { tags: ['billing'], summary: '구독 해지(기간말)' } },
    async (request): Promise<ApiSuccess<{ canceling: true }>> => {
      await cancelSubscription(request.user.id);
      return { success: true, data: { canceling: true } };
    },
  );
}
