import type { FastifyInstance } from 'fastify';
import type { ApiSuccess } from '@vlog-studio/shared-types';
import {
  AUTHENTICATED_ERROR_RESPONSES,
  COMMON_ERROR_RESPONSES,
  CREDIT_BALANCE_SCHEMA,
  CREDIT_PACK_SCHEMA,
  CREDIT_SYNC_SCHEMA,
  successResponseSchema,
} from '../schemas/responses.js';
import { getProducts, syncPurchases } from '../services/billing.service.js';
import type { CreditPack } from '../services/billing/credit-policy.js';
import { getBalance, listEntries, type CreditEntryDto } from '../services/credit.service.js';

const ENTRY_LIMIT = 50;

export async function billingRoutes(app: FastifyInstance): Promise<void> {
  // GET /billing/products — 크레딧 팩 메타 (인증 불필요)
  //
  // 가격·통화는 응답에 없다. 현지 가격의 원천은 스토어이고, 앱은 RevenueCat SDK 의
  // getOfferings() 로 표시 가격을 받는다.
  app.get(
    '/billing/products',
    {
      schema: {
        tags: ['billing'],
        summary: '크레딧 팩 목록',
        description:
          '크레딧 팩의 상품 ID와 지급 크레딧 수. **가격은 스토어가 원천이므로 응답에 없다.**',
        response: {
          200: successResponseSchema({ type: 'array', items: CREDIT_PACK_SCHEMA }),
          ...COMMON_ERROR_RESPONSES,
        },
      },
    },
    async (): Promise<ApiSuccess<CreditPack[]>> => {
      return { success: true, data: getProducts() };
    },
  );

  // GET /billing/credits — 내 잔액과 최근 내역
  app.get(
    '/billing/credits',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['billing'],
        summary: '크레딧 잔액과 내역',
        description:
          '잔액의 원천은 항상 백엔드다. 클라이언트·RevenueCat 의 상태는 표시·동기화용이다.',
        response: {
          200: successResponseSchema(CREDIT_BALANCE_SCHEMA),
          ...AUTHENTICATED_ERROR_RESPONSES,
        },
      },
    },
    async (request): Promise<ApiSuccess<{ balance: number; entries: CreditEntryDto[] }>> => {
      const [balance, entries] = await Promise.all([
        getBalance(request.user.id),
        listEntries(request.user.id, ENTRY_LIMIT),
      ]);
      return { success: true, data: { balance, entries } };
    },
  );

  // POST /billing/sync — 웹훅 유실 보정
  //
  // 앱이 구매 완료 직후 호출한다. 이미 지급된 거래는 건너뛰므로 몇 번 호출해도 안전하다.
  app.post(
    '/billing/sync',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['billing'],
        summary: '구매 동기화',
        description: '스토어 구매 이력을 조회해 웹훅이 유실된 지급을 보정한다. 멱등하다.',
        response: {
          200: successResponseSchema(CREDIT_SYNC_SCHEMA),
          ...AUTHENTICATED_ERROR_RESPONSES,
        },
      },
    },
    async (request): Promise<ApiSuccess<{ granted: number; balance: number }>> => {
      const { granted } = await syncPurchases(request.user.id);
      return { success: true, data: { granted, balance: await getBalance(request.user.id) } };
    },
  );
}
