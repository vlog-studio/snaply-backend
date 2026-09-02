/**
 * 크레딧 판매(IAP) 처리.
 *
 * 판매 채널은 Apple StoreKit 2 / Google Play Billing 의 consumable 이고, 두 스토어의
 * 영수증 검증·통지는 RevenueCat 을 경유해 단일 웹훅으로 받는다
 * (docs/decisions/payment-channel-iap.md). 정기 구독은 제품 모델에 없다.
 *
 * 이 모듈은 "스토어 이벤트를 우리 크레딧 원장으로 옮기는 일"만 한다. 잔액 계산과
 * 멱등성은 credit.service 가 책임진다.
 */
import type { AdMobConfig, BillingConfig } from '../config.js';
import { AppError } from '../lib/errors.js';
import { captureException } from '../lib/sentry.js';
import { CREDIT_PACKS, creditsForProduct, type CreditPack } from './billing/credit-policy.js';
import {
  fetchNonSubscriptions,
  toEnvironment,
  toStore,
  type StorePurchase,
} from './billing/revenuecat.client.js';
import { grantForPurchase, revokeForStoreRefund } from './credit.service.js';

let cfg: BillingConfig | null = null;

export function initBilling(billingConfig: BillingConfig): void {
  cfg = billingConfig;
}

function config(): BillingConfig {
  if (!cfg) {
    throw new Error('billing이 초기화되지 않았습니다. initBilling()을 먼저 호출하세요.');
  }
  return cfg;
}

/** 보상형 광고 SSV 설정. 라우트가 요청마다 들고 다니지 않도록 여기서 꺼낸다. */
export function getAdMobConfig(): AdMobConfig {
  return config().admob;
}

/**
 * 크레딧 팩 메타. **가격·통화는 넣지 않는다** — 현지 가격의 원천은 스토어이고,
 * 앱은 RevenueCat SDK 의 `getOfferings()` 로 표시 가격을 받는다. 서버가 가격을 내리면
 * 스토어 가격과 어긋난 값이 화면에 뜰 수 있다.
 */
export function getProducts(): CreditPack[] {
  return [...CREDIT_PACKS].sort((a, b) => a.displayOrder - b.displayOrder);
}

// ── 웹훅 ────────────────────────────────────────────────

/** 웹훅 Authorization 헤더 검증. RevenueCat 은 서명이 아니라 헤더 시크릿 방식이다. */
export function verifyWebhookAuth(header: string | undefined): void {
  if (!header || header !== config().webhookAuthToken) {
    throw AppError.unauthorized('웹훅 인증에 실패했습니다.');
  }
}

export interface RevenueCatEvent {
  type: string;
  appUserId: string;
  productId: string;
  transactionId: string;
  store: unknown;
  environment: unknown;
  purchasedAtMs: number | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseWebhookEvent(body: unknown): RevenueCatEvent {
  const event = isRecord(body) && isRecord(body.event) ? body.event : null;
  if (!event || typeof event.type !== 'string') {
    throw AppError.badRequest('웹훅 본문을 해석할 수 없습니다.');
  }
  const purchasedAtMs = Number(event.purchased_at_ms);
  return {
    type: event.type,
    // app_user_id 는 앱이 Snaply User.id 로 고정한다 (payment-channel-iap.md §5).
    appUserId: String(event.app_user_id ?? ''),
    productId: String(event.product_id ?? ''),
    // 스토어 거래 ID 가 지급 멱등성의 키다. 환불 이벤트는 원 거래를 가리켜야 하므로
    // transaction_id 를 우선 쓰고 없으면 original_transaction_id 로 떨어진다.
    transactionId: String(event.transaction_id ?? event.original_transaction_id ?? ''),
    store: event.store,
    environment: event.environment,
    purchasedAtMs: Number.isFinite(purchasedAtMs) ? purchasedAtMs : null,
  };
}

/**
 * 웹훅 처리. **이벤트 타입으로 먼저 분기**한다 — 지금 크레딧이 받는 것은
 * `NON_RENEWING_PURCHASE` / `REFUND` 둘뿐이지만, 보관 축 구독이 붙으면
 * `RENEWAL`·`EXPIRATION` 같은 이벤트가 여기로 함께 들어온다. 그때 구조를 뒤집지 않도록
 * 크레딧 경로를 좁게 잡아 둔다 (docs/archive/iap-migration.md §10).
 *
 * 처리하지 않는 이벤트는 조용히 무시한다(200). RevenueCat 에 재시도를 시켜 봐야
 * 결과가 같기 때문이다.
 */
export async function handleWebhookEvent(event: RevenueCatEvent): Promise<void> {
  switch (event.type) {
    case 'NON_RENEWING_PURCHASE':
      await applyPurchase(event);
      return;
    case 'REFUND':
      // 크레딧 환불은 소비분 회수(잔액 음수 허용)이고, 구독 환불은 entitlement 소급
      // 만료다. 둘을 한 핸들러로 묶지 않는다.
      await revokeForStoreRefund(event.transactionId);
      return;
    default:
      return;
  }
}

async function applyPurchase(event: RevenueCatEvent): Promise<void> {
  if (!event.appUserId || !event.transactionId) {
    throw AppError.badRequest('구매 이벤트에 app_user_id 또는 거래 ID가 없습니다.');
  }
  const store = toStore(event.store);
  if (!store) {
    return; // 우리가 파는 두 스토어가 아니다 — 지급 대상이 아니므로 조용히 넘어간다
  }
  const credits = creditsForProduct(event.productId);
  if (credits === null) {
    // 카탈로그에 없는 상품이 결제됐다 = 스토어 등록과 배포된 코드가 어긋났다.
    // 임의 수량을 지급하지 말고 실패로 남겨 RevenueCat 이 재시도하게 한다.
    // 매핑을 배포하면 그 재시도가 그대로 지급으로 이어진다.
    captureException(new Error(`알 수 없는 크레딧 상품: ${event.productId}`), {
      appUserId: event.appUserId,
      transactionId: event.transactionId,
    });
    throw new AppError(500, 'UNKNOWN_PRODUCT', '알 수 없는 상품입니다.');
  }

  await grantForPurchase({
    userId: event.appUserId,
    store,
    productId: event.productId,
    storeTransactionId: event.transactionId,
    credits,
    environment: toEnvironment(event.environment),
    purchasedAt: event.purchasedAtMs ? new Date(event.purchasedAtMs) : new Date(),
  });
}

// ── 능동 동기화 ─────────────────────────────────────────

/**
 * 웹훅 유실 보정. 앱이 구매 완료 직후 호출한다.
 * 이미 지급된 거래는 `store_transaction_id` unique 에 걸려 건너뛰므로,
 * 몇 번을 호출해도 잔액은 변하지 않는다.
 */
export async function syncPurchases(userId: string): Promise<{ granted: number }> {
  const purchases = await fetchNonSubscriptions(config(), userId);
  let granted = 0;
  for (const purchase of purchases) {
    const credits = creditsForProduct(purchase.productId);
    if (credits === null) {
      continue; // 카탈로그 밖 상품은 동기화에서 조용히 건너뛴다 (웹훅 경로가 알림을 남긴다)
    }
    const result = await grantForPurchase({
      userId,
      store: purchase.store,
      productId: purchase.productId,
      storeTransactionId: purchase.storeTransactionId,
      credits,
      environment: purchase.environment,
      purchasedAt: purchase.purchasedAt,
    });
    if (result.granted) {
      granted += 1;
    }
  }
  return { granted };
}

export type { StorePurchase };
