import { z } from 'zod';

import {
  AUTHENTICATED_ERROR_RESPONSES,
  COMMON_ERROR_RESPONSES,
  apiErrorSchema,
  apiSuccess,
  conflictErrorSchema,
} from './common.js';
import { defineRoute } from './define-route.js';
import { adRewardStatusSchema, creditReasonSchema } from './vocab.js';

/** 내역 응답 상한. 페이지네이션은 없다 — 앱이 "전체 내역" 으로 오해하지 않도록 스펙에 명시한다. */
export const CREDIT_ENTRY_LIMIT = 50;

/** 크레딧 팩. 가격·통화는 스토어가 원천이라 응답에 넣지 않는다. */
export const creditPackSchema = z.object({
  productId: z.string().describe('스토어 상품 ID. 양 스토어에 같은 ID로 등록한다.'),
  credits: z.int().min(1).describe('지급할 크레딧 수. 웹훅이 지급량을 정하는 유일한 근거다.'),
  displayOrder: z.int().min(0).describe('앱의 표시 순서'),
});
export type CreditPack = z.infer<typeof creditPackSchema>;

export const creditEntrySchema = z
  .object({
    id: z.uuid(),
    delta: z.int().describe('+지급 / -차감'),
    reason: creditReasonSchema.describe('앱이 내역 화면 문구를 매핑하는 값. 닫힌 집합이다.'),
    createdAt: z.iso.datetime(),
  })
  .meta({ id: 'CreditEntry' });
export type CreditEntry = z.infer<typeof creditEntrySchema>;

export const creditBalanceSchema = z.object({
  // 스토어 환불로 지급분이 회수되면 음수가 될 수 있다 — minimum 을 걸지 않는다.
  balance: z.int(),
  entries: z
    .array(creditEntrySchema)
    .describe(`최신순 **최대 ${CREDIT_ENTRY_LIMIT}건**. 전체 내역이 아니다 — 페이지네이션은 없다.`),
});
export type CreditBalance = z.infer<typeof creditBalanceSchema>;

export const creditSyncSchema = z.object({
  granted: z.int().min(0).describe('이번 호출로 새로 지급된 거래 수. 0 이면 이미 모두 반영돼 있었다는 뜻이다.'),
  balance: z.int(),
});
export type CreditSync = z.infer<typeof creditSyncSchema>;

/** 광고 보상 가용성. 앱은 보상량·한도·쿨다운을 하드코딩하지 않고 이 응답만 본다. */
export const adRewardAvailabilitySchema = z.object({
  enabled: z.boolean().describe('false 면 앱은 진입점 자체를 숨긴다 (킬 스위치).'),
  rewardCredits: z.int().min(1),
  dailyLimit: z.int().min(1),
  remainingToday: z.int().min(0),
  nextAvailableAt: z.iso.datetime().nullable().describe('쿨다운 중일 때만 채운다. null 이면 지금 가능.'),
  resetsAt: z.iso.datetime().describe('일일 한도 초기화 시각(KST 자정).'),
});
export type AdRewardAvailability = z.infer<typeof adRewardAvailabilitySchema>;

export const adRewardSessionSchema = z.object({
  rewardId: z.uuid().describe('상태 폴링용 식별자. SSV 비밀(`nonce`)과 분리돼 있다.'),
  nonce: z.string().describe('AdMob SDK 의 `customData` 로 그대로 전달한다.'),
  ssvUserId: z.string().describe('AdMob SDK 의 `userId` 로 그대로 전달한다.'),
  rewardCredits: z.int().min(1),
  expiresAt: z.iso.datetime(),
});
export type AdRewardSession = z.infer<typeof adRewardSessionSchema>;

export const adRewardStatusResponseSchema = z.object({
  rewardId: z.uuid(),
  status: adRewardStatusSchema.describe(
    '`pending` 은 실패가 아니다(SSV 대기). `abandoned` 는 앱이 슬롯을 비운 상태이며, 만료 전에 SSV 가 도착하면 그대로 `granted` 가 된다.',
  ),
  credits: z.int().nullable().describe('granted 일 때만 채워진다.'),
  balance: z.int().describe('항상 현재 잔액 — 앱이 별도 호출을 하지 않아도 되게.'),
});
export type AdRewardStatusResponse = z.infer<typeof adRewardStatusResponseSchema>;

/** 웹훅 수신 확인. 봉투 없이 바로 나간다 — 수신자는 우리 앱이 아니라 외부 플랫폼이다. */
export const webhookReceivedSchema = z.object({ received: z.literal(true) });

const rewardIdParamsSchema = z.object({ rewardId: z.uuid() });

export const getBillingProducts = defineRoute({
  method: 'GET',
  path: '/billing/products',
  schema: {
    response: {
      200: apiSuccess(z.array(creditPackSchema)),
      ...COMMON_ERROR_RESPONSES,
    },
  },
});

export const getCredits = defineRoute({
  method: 'GET',
  path: '/billing/credits',
  schema: {
    response: {
      200: apiSuccess(creditBalanceSchema),
      ...AUTHENTICATED_ERROR_RESPONSES,
    },
  },
});

export const syncPurchases = defineRoute({
  method: 'POST',
  path: '/billing/sync',
  schema: {
    response: {
      200: apiSuccess(creditSyncSchema),
      ...AUTHENTICATED_ERROR_RESPONSES,
    },
  },
});

export const getAdRewardAvailability = defineRoute({
  method: 'GET',
  path: '/billing/ad-rewards',
  schema: {
    response: {
      200: apiSuccess(adRewardAvailabilitySchema),
      ...AUTHENTICATED_ERROR_RESPONSES,
    },
  },
});

export const createAdRewardSession = defineRoute({
  method: 'POST',
  path: '/billing/ad-rewards',
  schema: {
    response: {
      200: apiSuccess(adRewardSessionSchema),
      409: conflictErrorSchema,
      503: apiErrorSchema,
      ...AUTHENTICATED_ERROR_RESPONSES,
    },
  },
});

export const getAdRewardStatus = defineRoute({
  method: 'GET',
  path: '/billing/ad-rewards/{rewardId}',
  schema: {
    params: rewardIdParamsSchema,
    response: {
      200: apiSuccess(adRewardStatusResponseSchema),
      404: apiErrorSchema,
      ...AUTHENTICATED_ERROR_RESPONSES,
    },
  },
});

export const abandonAdRewardSession = defineRoute({
  method: 'DELETE',
  path: '/billing/ad-rewards/{rewardId}',
  schema: {
    params: rewardIdParamsSchema,
    response: {
      200: apiSuccess(adRewardStatusResponseSchema),
      404: apiErrorSchema,
      ...AUTHENTICATED_ERROR_RESPONSES,
    },
  },
});

export const revenuecatWebhook = defineRoute({
  method: 'POST',
  path: '/billing/webhook/revenuecat',
  schema: {
    response: {
      200: webhookReceivedSchema,
      400: apiErrorSchema,
      ...COMMON_ERROR_RESPONSES,
    },
  },
});

/**
 * AdMob SSV 콜백. 파라미터는 AdMob 이 정하며 스키마로 강제하지 않는다 — 서명 검증 전에 걸러
 * 봐야 의미가 없고, 스펙이 늘어나면 정상 콜백을 400 으로 떨어뜨린다.
 */
export const admobSsvCallback = defineRoute({
  method: 'GET',
  path: '/billing/webhook/admob',
  schema: {
    response: {
      200: webhookReceivedSchema,
      400: apiErrorSchema,
      ...COMMON_ERROR_RESPONSES,
    },
  },
});
