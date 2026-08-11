# 보관 문서

여기 있는 문서는 **작성 시점의 기록**이다. 현행 사실과 다를 수 있으므로 판단 근거로 쓰지 말 것.
당시 맥락을 되짚을 때만 참고한다.

| 문서 | 무엇이었나 | 현행 원천 |
|---|---|---|
| [snapvlog-backend-guide.md](./snapvlog-backend-guide.md) | Phase 1~9 착수 전 작성한 계획 가이드. Phase 전부 완료 | 스키마 `apps/api/prisma/schema.prisma` · API `/docs`(Swagger) + [api-spec.md](../api-spec.md) · 셋업 [ONBOARDING.md](../../ONBOARDING.md) · 규칙 [AGENTS.md](../../AGENTS.md) |
| [integrations-handover.md](./integrations-handover.md) | Dev B → Dev A 인수인계 4건. "Dev A 확인 결과"로 상호 확인 완료 | 미결 항목은 [backlog.md](../backlog.md) |
| [integrations-backlog.md](./integrations-backlog.md) | 연동/수익화 트랙 미결 목록 | [backlog.md](../backlog.md) 로 통합됨 |

## 왜 옮겼는지

- **가이드**: 환경변수 9개 누락, 미설치 패키지 4개 등재, DB 스키마·API 명세가 실제와 어긋난
  상태로 "각 Phase 시작 시 전체 첨부" 지시가 남아 있어, 에이전트가 틀린 사실을 믿는 경로였다.
  가이드의 코드 컨벤션은 [AGENTS.md](../../AGENTS.md) 로 옮겼다. "자주 발생하는 문제" 표의
  내용은 이미 전부 코드에 반영되고 [api-spec.md](../api-spec.md) 에 문서화돼 있어 따로 옮기지 않았다.
- **인수인계**: 확인이 끝나 액션이 남지 않았다. 회신에서 나온 후속 작업만 백로그로 옮겼다(E-2).
- **연동 백로그**: 미결 항목이 5개 문서에 흩어져 있던 문제를 [backlog.md](../backlog.md) 하나로 합쳤다.
