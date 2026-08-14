/**
 * 크레딧 경제의 상수 원천.
 *
 * 결정된 것: **기본 단위는 100크레딧 = Movie export 1회**다. 100 단위를 쓰는 이유는
 * 광고 보상·가입 보너스·프로모션처럼 지급 사유가 늘어날 때 정수 단위로 조절하기 위해서다
 * (docs/meetings/2026-08-12-rewarded-credit-review.md §2). 이 단위를 나중에 바꾸면 이미
 * 지급된 잔액을 전부 리스케일해야 하므로 바꾸지 않는다.
 *
 * 아직 결정되지 않은 것: **팩별 크레딧 수량·가격과 가입 보너스 수량**이다
 * (docs/backlog.md A-2). 아래 값은 그 자리를 비워두지 않기 위한 잠정값이며,
 * 확정되면 이 파일의 숫자만 교체한다. 잠정값을 그대로 스토어에 등록하지 말 것 —
 * `CREDIT_PACKS.productId` 는 App Store Connect / Play Console 의 상품 ID와
 * **글자 그대로 일치**해야 웹훅이 지급할 크레딧을 찾을 수 있다.
 */

/** Movie export 1회의 차감량. 확정값 — 기본 단위 그 자체다. */
export const MOVIE_EXPORT_COST = 100;

export interface CreditPack {
  /** 스토어 상품 ID. 양 스토어에 같은 ID로 등록한다. */
  productId: string;
  /** 지급할 크레딧 수. 웹훅이 지급량을 정하는 유일한 근거다. */
  credits: number;
  /** 앱의 표시 순서 */
  displayOrder: number;
}

/**
 * 크레딧 팩 카탈로그. **가격·통화는 여기 두지 않는다** — 스토어가 원천이고 앱은
 * RevenueCat SDK 의 `getOfferings()` 로 현지 가격을 받는다
 * (docs/decisions/payment-channel-iap.md §5).
 *
 * 수량은 A-2 확정 전 잠정값이다 (각각 Movie 5 / 12 / 30편에 해당).
 */
export const CREDIT_PACKS: readonly CreditPack[] = [
  { productId: 'credit_pack_small', credits: 500, displayOrder: 1 },
  { productId: 'credit_pack_medium', credits: 1_200, displayOrder: 2 },
  { productId: 'credit_pack_large', credits: 3_000, displayOrder: 3 },
];

/**
 * 상품 ID로 지급할 크레딧 수를 찾는다. 모르는 상품이면 null —
 * 호출부는 **추정해서 지급하지 말고 실패로 처리**해야 한다. 카탈로그에 없는 상품이
 * 결제됐다는 것은 스토어 등록과 배포된 코드가 어긋났다는 뜻이고, 임의의 수량을 지급하면
 * 되돌리기 어렵다.
 */
export function creditsForProduct(productId: string): number | null {
  return CREDIT_PACKS.find((pack) => pack.productId === productId)?.credits ?? null;
}

/**
 * 신규 가입 보너스. 수량 미확정이라 기본값은 0(=지급 안 함)이고,
 * `CREDIT_SIGNUP_BONUS` 로 덮어쓴다. 로컬·테스트에서 결제 없이 export 흐름을 돌리려면
 * 이 값을 100 이상으로 두면 된다.
 */
export function signupBonusCredits(): number {
  const raw = Number(process.env.CREDIT_SIGNUP_BONUS ?? '0');
  return Number.isInteger(raw) && raw > 0 ? raw : 0;
}

/** 원장 `reason` 값. 스키마의 VARCHAR(30) 안에 들어가야 한다. */
export const CREDIT_REASON = {
  purchase: 'purchase',
  signupBonus: 'signup_bonus',
  exportReserve: 'export_reserve',
  exportRefund: 'export_refund',
  storeRefundRevoke: 'store_refund_revoke',
  promo: 'promo',
} as const;

export type CreditReason = (typeof CREDIT_REASON)[keyof typeof CREDIT_REASON];
