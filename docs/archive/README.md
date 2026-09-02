# 보관 문서

여기 있는 문서는 **작성 시점의 기록**이다. 현행 사실과 다를 수 있으므로 판단 근거로 쓰지 말 것.
당시 맥락을 되짚을 때만 참고한다.

| 문서 | 무엇이었나 | 현행 원천 |
|---|---|---|
| [snapvlog-backend-guide.md](./snapvlog-backend-guide.md) | Phase 1~9 착수 전 작성한 계획 가이드. Phase 전부 완료 | 스키마 `apps/api/prisma/schema.prisma` · API `/docs`(Swagger) + [api-spec.md](../api-spec.md) · 셋업 [ONBOARDING.md](../../ONBOARDING.md) · 규칙 [AGENTS.md](../../AGENTS.md) |
| [integrations-handover.md](./integrations-handover.md) | Dev B → Dev A 인수인계 4건. "Dev A 확인 결과"로 상호 확인 완료 | 미결 항목은 [backlog.md](../backlog.md) |
| [integrations-backlog.md](./integrations-backlog.md) | 연동/수익화 트랙 미결 목록 | [backlog.md](../backlog.md) 로 통합됨 |
| [video-analysis-implementation-plan.md](./video-analysis-implementation-plan.md) | 스냅 내용 분석 착수 전 구현 계획. 2026-08-19 구현 완료 | 정책 [decisions/snap-content-analysis.md](../decisions/snap-content-analysis.md) · 코드 `apps/ai-worker/src/pipeline/video_analysis/` · 계약 [api-spec.md](../api-spec.md) |
| [iap-migration.md](./iap-migration.md) | Stripe 제거와 RevenueCat 전환 계획. 2026-08-14 구현 완료 | 정책 [decisions/payment-channel-iap.md](../decisions/payment-channel-iap.md) · 미결 [backlog.md](../backlog.md) A-2·C-1 |
| [2026-08-12-backend-decision-workshop.md](./2026-08-12-backend-decision-workshop.md) | 열리지 않은 회의의 사전 워크시트. 이후 결정과 미결 항목이 각각 원천 문서로 이동 | 결정 [decisions/](../decisions/) · 미결 [backlog.md](../backlog.md) |

## 왜 옮겼는지

- **가이드**: 환경변수 9개 누락, 미설치 패키지 4개 등재, DB 스키마·API 명세가 실제와 어긋난
  상태로 "각 Phase 시작 시 전체 첨부" 지시가 남아 있어, 에이전트가 틀린 사실을 믿는 경로였다.
  가이드의 코드 컨벤션은 [AGENTS.md](../../AGENTS.md) 로 옮겼다. "자주 발생하는 문제" 표의
  내용은 이미 전부 코드에 반영되고 [api-spec.md](../api-spec.md) 에 문서화돼 있어 따로 옮기지 않았다.
- **인수인계**: 확인이 끝나 액션이 남지 않았다. 회신에서 나온 후속 작업만 백로그로 옮겼다(E-2).
- **연동 백로그**: 미결 항목이 5개 문서에 흩어져 있던 문제를 [backlog.md](../backlog.md) 하나로 합쳤다.
- **영상 분석 계획**: 구현이 끝나 계획 문서의 수명이 끝났다. 실제 구현이 제안과 다른 지점이
  여러 곳이라(분석 시점·재시도 API·스키마), 남겨 두면 두 문서 중 어느 쪽이 현행인지 헷갈린다.
- **IAP 계획**: 구현이 완료된 계획을 `plans/`에 두면 아직 착수 전인 것처럼 보인다. 결과는
  진행 기록과 결제 결정 문서로 이동했다.
- **의사결정 워크시트**: 회의 전 제안 상태로 남은 `next-agenda.md`가 이미 확정된 정책과 오래된
  FE/BE 분리를 다시 미결처럼 보이게 했다. 실제 미결만 backlog에 남겼다.
