# 결제 채널 확정 — Stripe 제거와 Apple/Google 인앱결제 채택

**작성일**: 2026-08-13
**상태**: 결정 — 크레딧 판매 채널을 Apple StoreKit / Google Play Billing(IAP)으로 확정하고 Stripe를 제거한다.
**관련 문서**: [credit-payment-model.md](credit-payment-model.md)(과금 모델), 구현 계획은
[../plans/iap-migration.md](../plans/iap-migration.md), 미결 항목은 [../backlog.md](../backlog.md) A-2·C-1.
**후속 결정**: 2026-08-14에 보관 축의 구독 상품이 추가됐다 —
[storage-and-subscription-policy.md](storage-and-subscription-policy.md) §5.
아래 §결정 1의 "consumable"은 크레딧 팩에 한하며, 스토리지 구독은 **auto-renewable
subscription**(iOS StoreKit 2 / Android Play Billing)으로 양 스토어에 함께 등록한다.
채널(IAP + RevenueCat)과 §5의 "원천은 항상 백엔드" 원칙은 그대로 적용된다.

## 결정

1. 크레딧 팩 판매는 앱 내 인앱결제(IAP)로만 한다 — iOS는 StoreKit 2 consumable,
   Android는 Play Billing consumable. 같은 상품을 양 스토어에 동일하게 등록한다.
2. 두 스토어의 영수증 검증·이벤트 통지는 RevenueCat을 경유해 단일 웹훅으로 받는다.
3. Stripe는 결제 채널에서 제거한다. [credit-payment-model.md](credit-payment-model.md)의
   "Stripe를 계속 사용하더라도 Checkout은 일회성 크레딧 구매를 처리한다"는 전환 원칙은
   이 결정으로 무효가 된다.
4. 국내 PG(토스페이먼츠 등)·MoR(Paddle, Polar 등)·웹 결제는 v1에서 도입하지 않는다.
   웹 서비스가 생기면 병행 채널로 재검토한다.
5. 크레딧 잔액과 사용 가능 여부의 원천은 항상 백엔드다. 클라이언트·RevenueCat의 상태는
   표시·동기화용이다.

## 배경

기존 설계는 Stripe Billing + Checkout + Webhook으로 구독(이후 크레딧) 결제를 처리하는
구조였다. 2026-08-13 조사(공식 문서 직접 확인)로 두 가지 전제가 무너졌다.

1. **앱스토어 정책**: 앱 내부의 디지털 기능·구독·크레딧 해금은 결제 수단과 무관하게
   Apple App Review Guideline 3.1.1과 Google Play Payments policy가 IAP 사용을 강제한다.
   앱 안에서 외부 결제 페이지(Stripe Checkout이든 국내 PG든)로 보내는 흐름 자체가
   심사 거절·앱 퇴출 사유다.
2. **Stripe 한국 미지원**: 2026-08 기준 stripe.com/global 지원 국가에 한국이 없다.
   한국 법인은 Stripe merchant account를 개설해 한국 계좌로 정산받을 수 없다.

수수료는 Apple/Google 모두 기본 30%이나, Snaply는 Apple Small Business Program
(연 수취액 $100만 이하 15%)과 Google 15% 티어(연 $100만까지) 대상이므로 실질 15%다.
Google은 Epic 합의에 따라 2026-12-31부터 한국에 새 수수료 체계(구독 10% + 결제수수료
분리)를 적용할 예정이라 장기적으로 더 내려갈 수 있다.

## 기각한 대안

### 국내 PG로 교체 (토스페이먼츠·포트원)

PG 수수료(약 3%)는 낮지만 앱 내 디지털 상품 결제에 쓰면 양 스토어 정책 위반이다.
한국의 전기통신사업법 예외를 쓰더라도 Apple은 26% 수수료 + 한국 전용 별도 바이너리
+ IAP 공존 불가 + 월별 판매 보고, Google은 4%p 인하(15%→11%)에 그쳐 PG 수수료와
운영 부담을 더하면 실익이 없거나 오히려 손해다.

### Stripe + 해외 법인 (Stripe Atlas)

설립비 $500에 연간 유지비(franchise tax, registered agent, 미국 세무 신고 대행)가
현실적으로 연 100만~300만 원대이고, 외국환거래법상 해외직접투자 신고와 양국 세무
신고가 추가된다. 법인을 세워도 앱 내 판매는 여전히 IAP 강제라서 웹 채널에만 쓸 수
있다. 이 규모의 서비스에 과하다.

### Merchant of Record (Paddle, Polar 등)

수수료 5% + $0.50로 저렴하고 글로벌 VAT를 대행하지만, 역시 웹 결제 채널에만 쓸 수
있다. 앱 내 판매 대체가 불가능하므로 v1 채널로는 기각한다. 웹 병행 시 재검토 후보로
남긴다(Polar는 한국 사업자 정산을 공식 지원).

### 웹 결제 전용 + 앱은 사용만 (consumption-only)

Google은 허용하지만 Apple은 3.1.3(b)에서 "웹에서 산 아이템을 앱에서 쓰려면 같은
아이템을 앱 내 IAP로도 팔아야 한다"고 요구한다. 결국 IAP 구현을 피할 수 없고,
앱 안에서 웹 결제 유도도 금지라 전환율이 낮다. 단독 채널로는 성립하지 않는다.

### 스토어 API 직접 연동 (RevenueCat 없이)

App Store Server Notifications V2 + Play RTDN(Pub/Sub)을 직접 받는 방식. 벤더 종속이
없지만 두 스토어의 JWS 서명 검증·상태 기계를 각각 구현·테스트해야 한다. RevenueCat은
월 추적 매출 $2,500까지 무료, 초과분 1%이고 React Native 공식 SDK가 있어 현재 팀
규모에서는 경유가 낫다. 매출이 커져 1% 비용이 부담되면 이 대안으로 전환한다.

## 이번 결정에서 확정하지 않은 것

- 크레딧 묶음별 수량·가격·차감량 — [../backlog.md](../backlog.md) A-2에서 관리
- 웹 결제 병행 채널 도입 여부와 시점
- 구독제 재도입 여부 (재도입 시 같은 구조에서 auto-renewable IAP + RevenueCat
  entitlement로 확장한다)

## 재검토 트리거

다음이 발생하면 이 결정을 다시 본다.

- Stripe가 한국 사업자 직접 가입을 공식 지원
- 미국 Epic v. Apple 소송 확정으로 외부 링크 수수료 구조 확정 (미국 storefront 한정)
- Google 새 수수료 체계의 한국 적용(2026-12-31 예정) 세부 공표
- 월 매출이 RevenueCat 1% 비용을 정당화하지 못할 만큼 성장
