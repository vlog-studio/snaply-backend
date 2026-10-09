# 결제 모델 전환 — 정기 구독 제거와 크레딧 결제

**작성일**: 2026-08-12
**상태**: 결정 — 정기 구독을 제품 모델에서 제거하고 무비 생성을 크레딧으로 과금한다.
**원천**: 결제 방식이 다시 변경되기 전까지 수익 모델의 원천이다. 현행 요구는
[specs/credits-and-payment.md](../specs/credits-and-payment.md) CRD-1~8 이다.
**관련 문서**: [payment-channel-iap.md](payment-channel-iap.md) ·
[storage-and-subscription-policy.md](storage-and-subscription-policy.md) · [backlog.md](../backlog.md) A-2 · C-1

> **후속 결정**(2026-08-13): 결제 채널이 Stripe에서 Apple/Google IAP로 확정됐다 →
> [payment-channel-iap.md](payment-channel-iap.md).

> **후속 결정**(2026-08-14): 결정 5의 기본 단위 **Movie export 1회 = 100크레딧**이 확정됐다
> (단위의 이유는 [specs/credits-and-payment.md](../specs/credits-and-payment.md) CRD-1). 같은 날 **유료
> 정기 구독을 두지 않는다**는 것도 재확인됐고, 레거시 `subscriptions` 테이블은 이관 없이 제거됐다
> ([progress.md](../progress.md) 2026-08-14). 아래 §"기각한 대안 — 월 정기 구독 유지"는 **생성 축(크레딧
> 지급형 구독)에 한해** 유효하다 — 보관 혜택(기간 연장 등)을 구독으로 팔지는 예정이나 미확정이고(CRD-7,
> [backlog.md](../backlog.md) A-2), 두 축을 섞지 않는 경계 규칙은
> [storage-and-subscription-policy.md](storage-and-subscription-policy.md) §4.3에 있다.

> **대체**(2026-09-09): 결정 4의 보관 한도(결정 당시 Free 5GB 용량 한도)는 기간 기준으로 바뀌었다 — 현행 원천은
> [specs/snap-library.md](../specs/snap-library.md) SNAP-9(업로드 후 15일) → [snap-retention-period.md](snap-retention-period.md).

## 결정

1. Free/Standard/Premium 월 정기 구독 모델을 사용하지 않는다.
2. 무비 생성 비용은 사용자가 보유한 크레딧에서 차감한다.
3. 기존 Stripe 구독 Checkout, 구독 조회·해지, `subscriptions` 기반 플랜 판정,
   `past_due` 처리는 현행 정책이 아니라 제거·대체할 레거시 구현이다.
4. Free 원본 스냅 한도 정책은 결제 모델과 별도로 유지한다. *(결정 당시 5GB 용량 한도.
   현행 보관 정책은 [specs/snap-library.md](../specs/snap-library.md) SNAP-9)*
5. export 1회는 100크레딧이며 예약·환급 규칙은 구현됐다. 팩 수량·가격·유효기간·최초
   지급량·고해상도 export 의 추가 차감처럼 남은 값은 [backlog.md](../backlog.md) A-2에서만 관리한다.

## 배경

초기 구현은 Free/Standard/Premium 구독과 플랜별 편집 횟수·해상도·워터마크를 전제로 했다.
그러나 플랜 차등이 일관되게 구현되지 않았고, 무비 생성이라는 실제 비용 발생 행위와 월 구독의
대응도 명확하지 않았다. 기존 월 3편 제한은 이미 제거됐으며, 무비 생성 비용을 직접 표현하는
크레딧 방식으로 전환하기로 했다.

## 기각한 대안

### 월 정기 구독 유지

매월 크레딧을 지급하는 Standard/Premium 구독을 유지할 수 있지만, 사용량이 불규칙한 초기
서비스에서 결제 주기·이월·미납·강등 정책이 추가되고 실제 편집 비용과 결제 단위가 멀어진다.
이번 결정에서는 채택하지 않는다.

### 편집 횟수 무제한

사용자 설명은 단순하지만 FFmpeg·AI worker 비용에 상한이 없어 초기 운영에서 위험하다.
기술 보호 제한과 별도로 크레딧을 사용한다.

### 월 3편 편집 제한 복원

구독 시절의 Free 월 3편 제한은 되살리지 않는다. 작업 생성 시점에 횟수를 깎아
**실패한 편집도 차감**했고(워커 실패 세 번이면 그 달 편집 불가), 해상도·워터마크 차등이 구현되지
않아 유료와 무료의 차이가 횟수뿐이었다. 크레딧 예약과 실패·취소 시 전액 환급
([specs/movie.md](../specs/movie.md) MOV-10)이 이 문제를 대신 푼다.
