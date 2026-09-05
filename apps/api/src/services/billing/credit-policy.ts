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

/**
 * 원장 `reason` 값. 앱이 내역 문구를 매핑하는 와이어 계약이라 원천은 shared-types 의 계약이다
 * (`creditReasonSchema`). 여기서는 서비스 코드의 편의를 위해 다시 내보낸다.
 */
export { CREDIT_REASON, CREDIT_REASONS, type CreditReason } from '@vlog-studio/shared-types';

// ── 보상형 광고 ────────────────────────────────────────

/**
 * 일일 한도의 기준 시각은 **KST(UTC+9) 자정**이다.
 *
 * UTC 자정은 한국 사용자에게 오전 9시라 "오늘 5번"이 하루 중간에 초기화되고, 롤링 24시간은
 * 앱이 "언제 다시 볼 수 있는지"를 한 문장으로 설명할 수 없다. 한국은 서머타임이 없으므로
 * 고정 오프셋으로 계산해도 어긋나지 않는다 (docs/decisions/ad-reward-credits.md §4).
 *
 * 이 값을 바꾸면 앱이 표시하는 `resetsAt` 의 의미가 함께 바뀐다 — 서버가 정한 시각을 앱이
 * 그대로 그리므로, 기준을 바꿀 때 앱 배포는 필요 없지만 문서는 같이 고쳐야 한다.
 */
export const AD_REWARD_DAY_OFFSET_MINUTES = 9 * 60;

/**
 * 광고 보상 정책.
 *
 * **아래 값은 전부 확정됐다** (2026-08-18, docs/decisions/ad-reward-credits.md §7).
 * `CREDIT_SIGNUP_BONUS` 와 같은 이유로 여전히 env 로 덮어쓸 수 있게 둔다 — 운영에서
 * 배포 없이 되돌리거나 실험할 수 있어야 하기 때문이며, 잠정값이라는 뜻은 아니다.
 *
 * 기본값 `enabled: false` 는 킬 스위치다. AdMob 콘솔 설정(광고 단위 생성·SSV 콜백 URL 등록)
 * 이 끝나기 전에는 앱이 진입점 자체를 숨겨야 하므로, 켜는 쪽이 아니라 **꺼진 쪽으로
 * 떨어뜨린다**.
 */
export interface AdRewardPolicy {
  enabled: boolean;
  /** 광고 1편 완료당 지급 크레딧 */
  credits: number;
  /** KST 하루 최대 지급 횟수 */
  dailyLimit: number;
  /** 마지막 지급 이후 다음 세션을 발급하기까지 대기 시간 */
  cooldownSeconds: number;
  /**
   * 세션 만료. SSV 가 이 시간 뒤에 도착하면 지급하지 않는다.
   *
   * **쿨다운을 넘기지 않는다.** 넘기면 지급받은 사용자(쿨다운만 기다림)보다 콜백이 유실된
   * 사용자(슬롯이 비기까지 TTL 을 기다림)가 더 오래 잠기는 역전이 생긴다
   * (docs/decisions/ad-reward-credits.md §4-1).
   */
  sessionTtlSeconds: number;
}

const AD_REWARD_DEFAULTS: AdRewardPolicy = {
  enabled: false,
  credits: 20,
  // 20 × 5 = 100 = MOVIE_EXPORT_COST. 한도를 다 쓰면 정확히 export 1편이며, 이는 의도된
  // 값이다 (docs/decisions/ad-reward-credits.md §7). 크레딧과 한도를 따로 바꾸면 이 관계가
  // 깨지므로 둘 중 하나만 손대지 않는다.
  dailyLimit: 5,
  // 세션 TTL 의 하한(300초)이 이 값의 하한이기도 하다 — 더 내리면 TTL 이 쿨다운을 넘어
  // 대기 시간 역전이 되살아난다. 더 올리면 "부족한 만큼만 채우는" 제작 흐름이 끊긴다
  // (docs/decisions/ad-reward-credits.md §7).
  cooldownSeconds: 300,
  // 쿨다운과 같은 값. 더 짧게 잡으면 광고가 길어졌을 때 정상 시청분의 SSV 가 만료로 거절된다.
  sessionTtlSeconds: 300,
};

function positiveInt(raw: string | undefined, fallback: number): number {
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

/** 쿨다운만 0 을 허용한다 — "쿨다운 없음" 은 실제로 고를 수 있는 설정이다. */
function nonNegativeInt(raw: string | undefined, fallback: number): number {
  const value = Number(raw);
  return Number.isInteger(value) && value >= 0 ? value : fallback;
}

/**
 * 현재 정책 스냅샷. 요청마다 env 를 다시 읽는다 — 값이 프로세스 수명보다 자주 바뀌지 않지만,
 * 테스트가 하네스를 다시 세우지 않고 킬 스위치를 토글할 수 있어야 한다.
 */
export function adRewardPolicy(): AdRewardPolicy {
  return {
    enabled: process.env.AD_REWARD_ENABLED === 'true',
    credits: positiveInt(process.env.AD_REWARD_CREDITS, AD_REWARD_DEFAULTS.credits),
    dailyLimit: positiveInt(process.env.AD_REWARD_DAILY_LIMIT, AD_REWARD_DEFAULTS.dailyLimit),
    cooldownSeconds: nonNegativeInt(
      process.env.AD_REWARD_COOLDOWN_SECONDS,
      AD_REWARD_DEFAULTS.cooldownSeconds,
    ),
    sessionTtlSeconds: positiveInt(
      process.env.AD_REWARD_SESSION_TTL_SECONDS,
      AD_REWARD_DEFAULTS.sessionTtlSeconds,
    ),
  };
}

/** `at` 이 속한 KST 하루의 시작(=UTC 기준 시각). 일일 한도를 세는 창의 하한이다. */
export function adRewardDayStart(at: Date): Date {
  const offsetMs = AD_REWARD_DAY_OFFSET_MINUTES * 60_000;
  const shifted = at.getTime() + offsetMs;
  return new Date(Math.floor(shifted / 86_400_000) * 86_400_000 - offsetMs);
}

/** 다음 초기화 시각. 앱이 "내일 다시 볼 수 있어요"를 그리는 근거. */
export function adRewardDayEnd(at: Date): Date {
  return new Date(adRewardDayStart(at).getTime() + 86_400_000);
}
