# 제품 스펙 (요구사항)

**작성일**: 2026-09-02
**상태**: 현행 — 계속 갱신되는 제품 요구사항의 단일 원천
**원천**: 제품이 "무엇을, 왜" 해야 하는지(비기술 요구사항)의 원천
**관련 문서**: [constitution.md](../constitution.md) · [README.md](../../README.md) §원천 지도 · [backlog.md](../backlog.md)

## 이 디렉터리의 지위

- [constitution.md](../constitution.md) 제1조의 **spec** 이 이 디렉터리다. 동작 계약을 만들거나
  바꾸는 작업은 여기의 해당 spec 을 먼저 고친 뒤 구현한다.
- spec 은 **무엇을·왜**만 담는다. 어떻게(설계·구현 계획)는 [docs/plans/](../plans/),
  결정의 배경·기각한 대안은 [docs/decisions/](../decisions/), API 의 정확한 형태는
  Swagger 와 [api-spec.md](../api-spec.md)가 담는다.
- 최초 작성(2026-09-02)은 **기존 구현과 확정된 결정에서 역으로 추출**했다. 이후부터는
  spec 이 앞서고 구현이 따라온다.

## 요구사항 표기 규칙

- 요구사항마다 도메인 접두 ID(`ACC-1`, `MOV-3` …)를 붙인다. ID 는 재사용하지 않는다 —
  폐기된 요구는 삭제하지 않고 `폐기` 로 표시한다.
- 각 요구사항은 지켰는지 확인할 수 있는 문장으로 쓰고, 구현 상태를 라벨로 단다:

| 라벨 | 뜻 |
|---|---|
| `구현됨` | 요구가 현재 코드에서 동작하고 검증됐다 |
| `부분` | 핵심은 동작하나 명시된 일부가 빠졌다 (빠진 것을 함께 적는다) |
| `결정·미구현` | 결정 문서로 확정됐지만 코드가 없다 |
| `보류` | 요구 자체가 선행 판단(법무·기획)에 걸려 있다 |

- `구현됨` 이 아닌 항목의 **미결 작업은 [backlog.md](../backlog.md)가 원천**이다.
  spec 은 요구와 상태만 말하고 작업 목록을 만들지 않는다.
- 정책 값(크레딧 수량, 한도, 기간)은 spec 이 현행 값의 원천이다. 값이 잠정이면 그렇게 적는다.

## 다른 문서와의 관계

- **[apps/mobile/docs/features/](../../apps/mobile/docs/features/README.md)** 는 앱의 현재
  동작을 서술하는 기록(구현 상태의 원천)이고, spec 은 요구의 원천이다. 서로 어긋나면
  요구가 틀렸는지 구현이 틀렸는지를 판단해 한쪽을 고친다 — 어긋난 채 두지 않는다.
- **[docs/decisions/](../decisions/)** 는 결정 시점에 굳는 기록이다. spec 이 결정을 반영해
  갱신되면, 이후 현행 요구의 원천은 spec 이다.

## 제품 개요

Snaply 는 20~30대를 위한 **숏폼 브이로그 AI 자동 편집 앱**이다. 사용자는 하루의 순간을
**스냅**(0.5~5초의 짧은 클립)으로 모으고, 스냅 묶음을 골라 **무비**(AI 가 자동 편집한
숏폼 영상)로 만들어 보관·공유한다. 제품 콘셉트의 배경은
[apps/mobile/docs/guides/ai-vlog-studio/concept.md](../../apps/mobile/docs/guides/ai-vlog-studio/concept.md).

## 스펙 목록

| 스펙 | 범위 |
|---|---|
| [account.md](account.md) | 가입·로그인, 프로필, 계정 삭제와 복구 |
| [snap-library.md](snap-library.md) | 스냅 촬영·추출, 라이브러리, 서버 보관과 한도 |
| [movie.md](movie.md) | 무비 구성(초안 편집)과 AI 생성, 결과물 보관·공유 |
| [template-and-recommendation.md](template-and-recommendation.md) | 템플릿으로 시작, 스냅 자동 추천, 스냅 내용 분석 |
| [credits-and-payment.md](credits-and-payment.md) | 크레딧 과금, 인앱결제, 보상형 광고 |
| [notifications.md](notifications.md) | 위치 도착 알림, 무비 완성 알림, 알림 설정 |
| [sns-sharing.md](sns-sharing.md) | 인스타그램·틱톡 연동과 업로드 |
