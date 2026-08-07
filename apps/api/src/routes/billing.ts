import type { FastifyInstance } from 'fastify';
import type { ApiSuccess } from '@vlog-studio/shared-types';
import {
  API_ERROR_SCHEMA,
  AUTHENTICATED_ERROR_RESPONSES,
  CANCELING_DATA_SCHEMA,
  CHECKOUT_URL_SCHEMA,
  COMMON_ERROR_RESPONSES,
  PLAN_INFO_SCHEMA,
  SUBSCRIPTION_SCHEMA,
  successResponseSchema,
} from '../schemas/responses.js';
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

export async function billingRoutes(app: FastifyInstance): Promise<void> {
  // GET /billing/plans — 플랜 목록 (인증 불필요)
  app.get(
    '/billing/plans',
    {
      schema: {
        tags: ['billing'],
        summary: '플랜 목록',
        response: {
          200: successResponseSchema({ type: 'array', items: PLAN_INFO_SCHEMA }),
          ...COMMON_ERROR_RESPONSES,
        },
      },
    },
    async (): Promise<ApiSuccess<PlanInfo[]>> => {
      return { success: true, data: getPlans() };
    },
  );

  // GET /billing/subscription — 내 구독 상태
  app.get(
    '/billing/subscription',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['billing'],
        summary: '내 구독 상태',
        response: {
          200: successResponseSchema(SUBSCRIPTION_SCHEMA),
          ...AUTHENTICATED_ERROR_RESPONSES,
        },
      },
    },
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
        response: {
          200: successResponseSchema(CHECKOUT_URL_SCHEMA),
          400: API_ERROR_SCHEMA,
          ...AUTHENTICATED_ERROR_RESPONSES,
        },
      },
    },
    async (request): Promise<ApiSuccess<{ checkoutUrl: string }>> => {
      const data = await createCheckout({ userId: request.user.id, plan: request.body.plan });
      return { success: true, data };
    },
  );

  // POST /billing/cancel — 기간 만료 후 해지
  app.post(
    '/billing/cancel',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['billing'],
        summary: '구독 해지(기간말)',
        response: {
          200: successResponseSchema(CANCELING_DATA_SCHEMA),
          400: API_ERROR_SCHEMA,
          ...AUTHENTICATED_ERROR_RESPONSES,
        },
      },
    },
    async (request): Promise<ApiSuccess<{ canceling: true }>> => {
      await cancelSubscription(request.user.id);
      return { success: true, data: { canceling: true } };
    },
  );
}
