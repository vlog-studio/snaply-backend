/**
 * RevenueCat REST 클라이언트.
 *
 * 웹훅은 유실될 수 있고(네트워크·배포 중 다운) 스토어 결제는 그 사이에도 일어난다.
 * 앱이 구매 직후 호출하는 `/billing/sync` 가 이 클라이언트로 구매 이력을 직접 조회해
 * 누락된 지급을 보정한다. 지급 자체의 멱등성은 `store_transaction_id` 가 보장하므로
 * 웹훅과 동시에 들어와도 중복 지급되지 않는다.
 */
import type { BillingConfig } from '../../config.js';

const API_BASE = 'https://api.revenuecat.com/v1';

export interface StorePurchase {
  productId: string;
  storeTransactionId: string;
  store: 'apple' | 'google';
  environment: 'production' | 'sandbox';
  purchasedAt: Date;
}

/** RevenueCat 의 store 표기를 우리 enum 으로. 두 스토어 외에는 취급하지 않는다. */
export function toStore(raw: unknown): 'apple' | 'google' | null {
  const value = String(raw ?? '').toUpperCase();
  if (value === 'APP_STORE' || value === 'MAC_APP_STORE') {
    return 'apple';
  }
  if (value === 'PLAY_STORE') {
    return 'google';
  }
  return null;
}

export function toEnvironment(raw: unknown): 'production' | 'sandbox' {
  return String(raw ?? '').toUpperCase() === 'SANDBOX' ? 'sandbox' : 'production';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 유저의 일회성 구매(non_subscriptions) 목록.
 *
 * mock 모드에서는 빈 배열을 돌려준다 — 로컬·테스트에서 지급 경로는 웹훅으로 검증하고,
 * 여기서 외부 호출이 일어나지 않게 한다.
 */
export async function fetchNonSubscriptions(
  config: BillingConfig,
  appUserId: string,
): Promise<StorePurchase[]> {
  if (config.mock) {
    return [];
  }

  const res = await fetch(`${API_BASE}/subscribers/${encodeURIComponent(appUserId)}`, {
    headers: { Authorization: `Bearer ${config.apiKey}`, Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`RevenueCat 조회 실패: ${res.status}`);
  }

  const body: unknown = await res.json();
  const subscriber = isRecord(body) && isRecord(body.subscriber) ? body.subscriber : null;
  const groups = subscriber && isRecord(subscriber.non_subscriptions)
    ? subscriber.non_subscriptions
    : {};

  const purchases: StorePurchase[] = [];
  for (const [productId, list] of Object.entries(groups)) {
    if (!Array.isArray(list)) {
      continue;
    }
    for (const item of list) {
      if (!isRecord(item)) {
        continue;
      }
      const store = toStore(item.store);
      // store_transaction_id 가 없는 과거 레코드는 RevenueCat 내부 id 로 대체한다.
      // 지급 멱등성의 키이므로 둘 다 없으면 건너뛴다 — 키 없이 지급하면 중복을 막을 수 없다.
      const transactionId = String(item.store_transaction_id ?? item.id ?? '');
      if (!store || !transactionId) {
        continue;
      }
      purchases.push({
        productId,
        storeTransactionId: transactionId,
        store,
        environment: item.is_sandbox === true ? 'sandbox' : 'production',
        purchasedAt: new Date(String(item.purchase_date ?? Date.now())),
      });
    }
  }
  return purchases;
}
