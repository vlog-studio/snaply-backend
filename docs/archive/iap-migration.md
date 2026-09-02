# IAP 전환 구현 계획 — Stripe 제거와 RevenueCat 연동 (구현됨·보관)

> **구현 완료 (2026-08-14).** 이 계획은 실행됐다 — 결과와 계획에서 달라진 점은
> [progress.md](../progress.md) 2026-08-14 항목에 있다. 현행 API 계약의 원천은
> [api-spec.md](../api-spec.md)이며, 아래 본문은 **착수 시점의 제안**으로 남긴다(수정하지 않는다).
>
> 계획과 달라진 것: ① 크레딧 기본 단위가 **100**으로 확정돼 export 1회 = 100크레딧이다
> (§4는 단위를 명시하지 않았다) ② §4의 `export_confirm`은 두지 않았다 — 예약이 곧 차감이고
> 성공 시 아무 기록도 남기지 않는 쪽이 단순하다 ③ 예약 시 유저 행 잠금을 **트랜잭션의 첫
> 문장**으로 두어야 한다(§4의 "직렬화 이상"만으로는 부족했다 — FK share 락과 데드락이 났다).
> 결정 배경은 [payment-channel-iap.md](../decisions/payment-channel-iap.md), 과금 모델은
> [credit-payment-model.md](../decisions/credit-payment-model.md), 미결 정책(크레딧 수량·가격)은
> [backlog.md](../backlog.md) A-2, 현행 API 계약은 [api-spec.md](../api-spec.md).

**작성일**: 2026-08-13 · **상태**: 구현 완료 (2026-08-14)

## 1. 목표

Stripe 구독 결제 구현을 제거하고, Apple StoreKit 2 / Google Play Billing의 consumable
크레딧 팩 구매를 RevenueCat 경유로 백엔드에 반영한다. 완료 시점에 다음이 성립한다.

- 앱에서 크레딧 팩을 구매하면 백엔드 크레딧 잔액이 중복 없이 정확히 1회 증가한다.
- 스토어 환불 시 지급분이 회수된다.
- export(무비 생성)는 크레딧을 예약하고 성공 시 확정 차감, 실패 시 환급한다.
- 코드·API·문서에서 Stripe와 구독(plan) 표현이 사라진다.

## 2. 전체 구조

```
React Native 앱
 ├─ react-native-purchases (RevenueCat SDK)
 │   ├─ iOS: StoreKit 2 — consumable 상품 (credit_pack_*)
 │   └─ Android: Play Billing Library 8+ — 동일 상품
 │   app_user_id = Snaply User.id
 │
 │  구매 → RevenueCat이 영수증 검증
 ▼
RevenueCat ──(웹훅: NON_RENEWING_PURCHASE / REFUND)──▶ POST /billing/webhook/revenuecat
                                                        (Authorization 헤더 시크릿 검증)
Backend (Fastify)
 ├─ 웹훅: 멱등 지급/회수 (Purchase + CreditLedger 트랜잭션)
 ├─ POST /billing/sync            ← 웹훅 유실 대비 능동 동기화
 ├─ GET  /billing/products        ← 크레딧 팩 메타 (가격 표시는 SDK getOfferings()가 원천)
 ├─ GET  /billing/credits         ← 잔액 + 최근 내역 (원천은 항상 백엔드)
 └─ EditJob: 크레딧 예약 → 확정 차감 / 실패 환급
```

역할 분리 원칙: 앱은 구매와 표시만 한다. **사용 가능 여부 판정은 서버가 잔액으로만
한다.** RevenueCat 상태는 동기화 입력이지 판정 근거가 아니다.

## 3. DB 스키마

`Subscription` 모델을 제거하고 두 모델을 추가한다.

```prisma
enum Store {
  apple
  google
}

// 스토어 거래 원장 — 웹훅 멱등성의 기준
model Purchase {
  id                 String    @id @default(uuid()) @db.Uuid
  userId             String    @map("user_id") @db.Uuid
  store              Store
  productId          String    @map("product_id") @db.VarChar(100)
  // 스토어 트랜잭션 ID. unique 제약이 중복 지급을 원천 차단한다.
  storeTransactionId String    @unique @map("store_transaction_id") @db.VarChar(200)
  status             String    @default("completed") @db.VarChar(20) // completed | refunded
  creditsGranted     Int       @map("credits_granted")
  environment        String    @default("production") @db.VarChar(20) // production | sandbox
  purchasedAt        DateTime  @map("purchased_at") @db.Timestamptz(6)
  refundedAt         DateTime? @map("refunded_at") @db.Timestamptz(6)
  createdAt          DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, createdAt])
  @@map("purchases")
}

// 크레딧 증감 원장 — append-only. 잔액은 delta 합계.
model CreditLedger {
  id         String   @id @default(uuid()) @db.Uuid
  userId     String   @map("user_id") @db.Uuid
  delta      Int      // +지급 / -차감
  reason     String   @db.VarChar(30)
  // purchase | signup_bonus | export_reserve | export_confirm | export_refund
  // | store_refund_revoke | promo
  purchaseId String?  @map("purchase_id") @db.Uuid
  editJobId  String?  @map("edit_job_id") @db.Uuid
  createdAt  DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  @@index([userId, createdAt])
  @@map("credit_ledger")
}
```

- 잔액 조회가 병목이 되면 `users.credit_balance` 캐시 컬럼을 트랜잭션 내 증분 갱신으로
  추가한다(원장이 원천, 컬럼은 파생). v1은 합계 쿼리로 시작한다.
- 기존 `subscriptions` 테이블: 운영 데이터에 유료 구독 행이 있는지 확인 후 drop
  마이그레이션을 작성한다. sandbox/모의 데이터뿐이면 이관 없이 drop.

## 4. 크레딧 상태 규칙

| 이벤트 | 처리 |
|---|---|
| 구매 (웹훅 `NON_RENEWING_PURCHASE`) | `Purchase` 생성 + `CreditLedger(+N, purchase)` 한 트랜잭션. `storeTransactionId` 충돌 시 이미 처리된 것 — 200 반환 |
| 스토어 환불 (웹훅 `REFUND`) | `Purchase.status = refunded` + `CreditLedger(-N, store_refund_revoke)`. 잔액이 음수가 되면 신규 export만 차단, 기존 결과물은 회수하지 않음 |
| export 시작 | 잔액 검증 → `CreditLedger(-cost, export_reserve, editJobId)` |
| export 성공 | reserve를 확정으로 인정 (`export_confirm`은 0-delta 기록 또는 생략 — 구현 시 단순한 쪽 선택) |
| export 실패/취소 | `CreditLedger(+cost, export_refund, editJobId)` |
| 가입 보너스 | `CreditLedger(+N, signup_bonus)` — 수량은 A-2에서 확정 |
| 계정 삭제 | 잔여 크레딧 소멸(약관 고지). Stripe 즉시 해지 로직(`cancelSubscriptionImmediately`)은 제거 |

예약 시 잔액 검증과 차감은 직렬화 이상(`SELECT ... FOR UPDATE` 또는 Prisma 트랜잭션 +
잔액 재확인)으로 동시 요청 이중 차감을 막는다.

## 5. API 변경

| 현행 | 변경 |
|---|---|
| `GET /billing/plans` | 제거 → `GET /billing/products`: 크레딧 팩 메타(productId, 크레딧 수량, 표시 순서). 가격·통화는 스토어가 원천이므로 응답에 넣지 않는다 |
| `GET /billing/subscription` | 제거 → `GET /billing/credits`: `{ balance, entries: [...] }` |
| `POST /billing/checkout` | 제거 (구매는 앱 내 IAP) |
| `POST /billing/cancel` | 제거 (consumable에는 해지 개념 없음) |
| `POST /billing/webhook` (Stripe) | 제거 → `POST /billing/webhook/revenuecat`: Authorization 헤더가 `REVENUECAT_WEBHOOK_AUTH_TOKEN`과 일치해야 처리. raw body 서명 검증은 불필요(RevenueCat은 헤더 시크릿 방식) |
| (신규) | `POST /billing/sync`: 서버가 RevenueCat REST API로 해당 유저 구매 이력을 조회해 누락 지급 보정. 앱이 구매 완료 직후 호출 |

응답은 저장소 규칙대로 `{ success, data }` / `{ success, error }`. 라우트 변경과 같은
커밋에서 [api-spec.md](../api-spec.md)를 갱신한다.

## 6. 환경변수 (env-spec)

제거: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_STANDARD`,
`STRIPE_PRICE_PREMIUM`, `STRIPE_MOCK`

추가 (`apps/api/src/env-spec.ts`부터 선언, `.env.example` 동기화, 운영 주입 주체 지정):

| 키 | 용도 |
|---|---|
| `REVENUECAT_API_KEY` | REST API 조회용 시크릿 키 (`/billing/sync`) |
| `REVENUECAT_WEBHOOK_AUTH_TOKEN` | 웹훅 Authorization 헤더 검증 값 |
| `BILLING_MOCK` | 로컬·테스트에서 RevenueCat 호출 없이 지급 흐름 모의 (`STRIPE_MOCK` 대체) |

## 7. 구현 순서

1. **스키마**: `Purchase`·`CreditLedger` 추가 + `subscriptions` drop 마이그레이션
   (운영 데이터 확인 선행). `npm run db:generate`.
2. **크레딧 서비스**: 잔액 계산, 멱등 지급, 예약/확정/환급. 단위·통합 테스트 포함.
3. **웹훅 + sync**: RevenueCat 웹훅 핸들러와 `/billing/sync`. `BILLING_MOCK` 경로 포함.
4. **라우트 교체**: §5의 API 변경 + `api-spec.md` 갱신.
5. **EditJob 연동**: export 시작/성공/실패에 예약·확정·환급 연결.
6. **Stripe 제거**: `stripe.client.ts`, 구독 관련 서비스 함수, `account.service.ts`의
   즉시 해지 호출, `STRIPE_*` 환경변수, 구독 테스트 제거.
7. **스토어·RevenueCat 설정**(코드 외): 양 스토어 consumable 상품 등록(A-2 확정 후),
   RevenueCat 프로젝트·웹훅 URL 등록, 앱 트랙에 `react-native-purchases` 연동 전달.

커밋은 목적 단위로 분리한다(스키마+마이그레이션 / 서비스+테스트 / 라우트+api-spec /
Stripe 제거 / 문서).

## 8. 테스트 계획

- 같은 `storeTransactionId` 웹훅 2회 수신 → 크레딧 1회만 지급.
- 환불 웹훅 → 회수, 잔액 음수 시 export 차단.
- 동시 export 2건, 잔액 1 → 1건만 예약 성공.
- export 실패 → 환급으로 잔액 복원.
- 웹훅 미수신 상태에서 `/billing/sync` → 지급 보정.
- 인증 헤더 불일치 웹훅 → 401, 본문 미처리.
- 기존 규칙대로 `npm test -w apps/api`로만 실행.

## 9. 이 계획에서 다루지 않는 것

- 크레딧 묶음 수량·가격·차감량·가입 보너스 — [backlog.md](../backlog.md) A-2
- 웹 결제 병행 채널 — [payment-channel-iap.md](../decisions/payment-channel-iap.md) 참조
- **스토리지 구독의 구현 상세** — 도입은 2026-08-14에 결정됐으나
  ([storage-and-subscription-policy.md](../decisions/storage-and-subscription-policy.md) §5)
  이 계획은 크레딧 팩(consumable)만 다룬다. 아래 §10에 접점만 적는다.
- React Native 앱 쪽 SDK 연동 상세 (앱 저장소 소관)

## 10. 구독 상품과의 접점 (후속 단계)

스토리지 구독은 이 계획 완료 후 별도 단계로 얹는다. 지금 단계에서 **미리 열어둘 것**만
기록한다 — 나중에 구조를 뒤집지 않기 위한 최소 조치다.

- **웹훅 핸들러 분기**: 구독은 `INITIAL_PURCHASE` · `RENEWAL` · `CANCELLATION` ·
  `EXPIRATION` · `BILLING_ISSUE` · `GRACE_PERIOD` · `PRODUCT_CHANGE` · `UNCANCELLATION` ·
  `REFUND`를 처리해야 한다. §2의 핸들러를 이벤트 타입으로 먼저 분기시키고, 크레딧 경로는
  `NON_RENEWING_PURCHASE` / `REFUND`만 받도록 좁혀 둔다.
- **환불 경로를 합치지 않는다**: 크레딧 환불은 소비분 회수(잔액 음수 가능), 구독 환불은
  entitlement 소급 만료 → 한도 초과 전이다. 처리가 완전히 다르므로 하나의 함수로 묶지 않는다.
- **`app_user_id` 고정**: 이미 `Snaply User.id`로 잡혀 있다. 구독은 entitlement가 지속돼
  한 스토어 계정으로 여러 Snaply 계정에 복원을 시도하는 악용이 가능하므로, RevenueCat
  transfer 정책을 구독 도입 시 함께 설정한다.
- **잔액/자격의 원천은 백엔드**: [payment-channel-iap.md](../decisions/payment-channel-iap.md)
  §5의 원칙을 구독 entitlement에도 동일하게 적용한다. `GET /billing/credits`와 같은 사상의
  자격 조회를 구독 단계에서 추가한다.

정책 근거와 한도 전이(30일 유예 → 읽기 전용 → 90일 후 정리)는
[storage-and-subscription-policy.md](../decisions/storage-and-subscription-policy.md) §4.4에 있다.
