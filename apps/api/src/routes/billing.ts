import type { FastifyInstance } from 'fastify';
import type { ApiSuccess } from '@vlog-studio/shared-types';
import {
  AD_REWARD_AVAILABILITY_SCHEMA,
  AD_REWARD_SESSION_SCHEMA,
  AD_REWARD_STATUS_SCHEMA,
  API_ERROR_SCHEMA,
  AUTHENTICATED_ERROR_RESPONSES,
  COMMON_ERROR_RESPONSES,
  CONFLICT_ERROR_SCHEMA,
  CREDIT_BALANCE_SCHEMA,
  CREDIT_PACK_SCHEMA,
  CREDIT_SYNC_SCHEMA,
  successResponseSchema,
} from '../schemas/responses.js';
import { getProducts, syncPurchases } from '../services/billing.service.js';
import type { CreditPack } from '../services/billing/credit-policy.js';
import { getBalance, listEntries, type CreditEntryDto } from '../services/credit.service.js';
import {
  abandonSession,
  createSession,
  getAvailability,
  getSessionStatus,
  type AdRewardAvailability,
  type AdRewardSession,
  type AdRewardStatusDto,
} from '../services/ad-reward.service.js';

/** 내역 응답 상한. 페이지네이션은 없다 — 앱이 "전체 내역" 으로 오해하지 않도록 스펙에 명시한다. */
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
          '잔액의 원천은 항상 백엔드다. 클라이언트·RevenueCat 의 상태는 표시·동기화용이다.\n\n'
          + `\`entries\` 는 최신순 **최대 ${ENTRY_LIMIT}건**이며 전체 내역이 아니다(페이지네이션 없음).`,
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

  // ── 보상형 광고 ──────────────────────────────────────
  //
  // 여기에는 "광고를 봤으니 지급해달라" 는 엔드포인트가 **의도적으로 없다.** 지급의 유일한
  // 트리거는 AdMob SSV 콜백(`/billing/webhook/admob`)이고, 앱은 세션을 열고 결과를 볼 뿐이다
  // (docs/decisions/ad-reward-credits.md §3).

  // GET /billing/ad-rewards — 가용성 조회
  app.get(
    '/billing/ad-rewards',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['billing'],
        summary: '광고 보상 가용성',
        description:
          '앱이 "광고 보고 +N크레딧" 버튼의 표시·비활성·남은 횟수를 정하는 유일한 근거다.\n\n'
          + '**앱은 보상량·한도·쿨다운을 하드코딩하지 않는다.** `enabled: false` 면 진입점 자체를 숨긴다.',
        response: {
          200: successResponseSchema(AD_REWARD_AVAILABILITY_SCHEMA),
          ...AUTHENTICATED_ERROR_RESPONSES,
        },
      },
    },
    async (request): Promise<ApiSuccess<AdRewardAvailability>> => {
      return { success: true, data: await getAvailability(request.user.id) };
    },
  );

  // POST /billing/ad-rewards — 보상 세션 발급
  //
  // 앱이 광고를 **로드하기 직전에** 호출한다. 요청 본문은 없다 — 보상량을 앱이 요청할 수
  // 있으면 그 값이 곧 공격면이 된다.
  app.post(
    '/billing/ad-rewards',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['billing'],
        summary: '광고 보상 세션 발급',
        description:
          '`nonce` 는 AdMob SDK 의 `customData`, `ssvUserId` 는 `userId` 로 전달한다.\n\n'
          + '거절: `409 AD_REWARD_COOLDOWN`(+`nextAvailableAt`) · '
          + '`409 AD_REWARD_LIMIT_REACHED`(+`resetsAt`) · '
          + '`409 AD_REWARD_SESSION_ACTIVE`(+`rewardId`) · `503 AD_REWARDS_DISABLED`.',
        response: {
          200: successResponseSchema(AD_REWARD_SESSION_SCHEMA),
          409: CONFLICT_ERROR_SCHEMA,
          503: API_ERROR_SCHEMA,
          ...AUTHENTICATED_ERROR_RESPONSES,
        },
      },
    },
    async (request): Promise<ApiSuccess<AdRewardSession>> => {
      return { success: true, data: await createSession(request.user.id) };
    },
  );

  // GET /billing/ad-rewards/:rewardId — 지급 상태 조회
  //
  // 앱이 광고 닫힘 직후 짧게 폴링한다. **`pending` 은 실패가 아니다** — SSV 가 늦거나
  // 유실됐을 뿐이므로 앱은 포기하고 "지급 확인 중" 으로 표시한다.
  app.get<{ Params: { rewardId: string } }>(
    '/billing/ad-rewards/:rewardId',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['billing'],
        summary: '광고 보상 지급 상태',
        params: {
          type: 'object',
          required: ['rewardId'],
          properties: { rewardId: { type: 'string', format: 'uuid' } },
        },
        response: {
          200: successResponseSchema(AD_REWARD_STATUS_SCHEMA),
          // 남의 rewardId 도 404 다 — 403 으로 존재를 알리지 않는다.
          404: API_ERROR_SCHEMA,
          ...AUTHENTICATED_ERROR_RESPONSES,
        },
      },
    },
    async (request): Promise<ApiSuccess<AdRewardStatusDto>> => {
      return {
        success: true,
        data: await getSessionStatus(request.user.id, request.params.rewardId),
      };
    },
  );

  // DELETE /billing/ad-rewards/:rewardId — 세션 포기
  //
  // 앱이 SDK 로부터 결과가 확정됐음(중도 이탈·노필·로드 실패)을 알았을 때 슬롯을 즉시 비운다.
  // **지급을 만들 수 있는 경로가 아니다** — 자기 세션을 포기하는 것뿐이라 §3의 설계를 깨지
  // 않는다. 만료 전에 SSV 가 도착하면 포기한 세션도 그대로 지급된다.
  app.delete<{ Params: { rewardId: string } }>(
    '/billing/ad-rewards/:rewardId',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['billing'],
        summary: '광고 보상 세션 포기',
        description:
          '진행 중 슬롯을 즉시 비워 TTL 을 기다리지 않고 다음 세션을 발급받게 한다.\n\n'
          + '**지급 자격은 남는다** — 만료 전에 SSV 가 도착하면 `granted` 가 된다. '
          + '이미 확정된 세션에 호출해도 현재 상태를 그대로 돌려준다(멱등).',
        params: {
          type: 'object',
          required: ['rewardId'],
          properties: { rewardId: { type: 'string', format: 'uuid' } },
        },
        response: {
          200: successResponseSchema(AD_REWARD_STATUS_SCHEMA),
          404: API_ERROR_SCHEMA,
          ...AUTHENTICATED_ERROR_RESPONSES,
        },
      },
    },
    async (request): Promise<ApiSuccess<AdRewardStatusDto>> => {
      return {
        success: true,
        data: await abandonSession(request.user.id, request.params.rewardId),
      };
    },
  );
}
