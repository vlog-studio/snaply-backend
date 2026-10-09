# 보관 문서

여기 있는 문서는 **작성 시점의 기록**이다. 현행 사실과 다를 수 있으므로 판단 근거로 쓰지 말 것.
당시 맥락을 되짚을 때만 참고한다.

| 문서 | 무엇이었나 | 현행 원천 |
|---|---|---|
| [snapvlog-backend-guide.md](./snapvlog-backend-guide.md) | Phase 1~9 착수 전 작성한 계획 가이드. Phase 전부 완료 | 스키마 `apps/api/prisma/schema.prisma` · API `/docs`(Swagger) + [api-spec.md](../api-spec.md) · 셋업 [ONBOARDING.md](../../ONBOARDING.md) · 규칙 [AGENTS.md](../../AGENTS.md) |
| [progress-phase-1-9.md](./progress-phase-1-9.md) | Phase 1~9의 완료 기록. 2026-09-03에 [progress.md](../progress.md)에서 분리 — Stripe 구독·월 3편 제한 등 이후 뒤집힌 내용 포함 | 이후 진행은 [progress.md](../progress.md) · 현행 요구는 [specs/](../specs/README.md) |
| [integrations-handover.md](./integrations-handover.md) | Dev B → Dev A 인수인계 4건. "Dev A 확인 결과"로 상호 확인 완료 | 미결 항목은 [backlog.md](../backlog.md) |
| [integrations-backlog.md](./integrations-backlog.md) | 연동/수익화 트랙 미결 목록 | [backlog.md](../backlog.md) 로 통합됨 |
| [video-analysis-implementation-plan.md](./video-analysis-implementation-plan.md) | 스냅 내용 분석 착수 전 구현 계획. 2026-08-19 구현 완료 | 정책 [decisions/snap-content-analysis.md](../decisions/snap-content-analysis.md) · 코드 `apps/ai-worker/src/pipeline/video_analysis/` · 계약 [api-spec.md](../api-spec.md) |
| [iap-migration.md](./iap-migration.md) | Stripe 제거와 RevenueCat 전환 계획. 2026-08-14 구현 완료 | 정책 [decisions/payment-channel-iap.md](../decisions/payment-channel-iap.md) · 미결 [backlog.md](../backlog.md) A-2·C-1 |
| [2026-08-12-backend-decision-workshop.md](./2026-08-12-backend-decision-workshop.md) | 열리지 않은 회의의 사전 워크시트. 이후 결정과 미결 항목이 각각 원천 문서로 이동 | 결정 [decisions/](../decisions/) · 미결 [backlog.md](../backlog.md) |
| [mobile-handover-lifecycle.md](./mobile-handover-lifecycle.md) | 무비 서버 전환·만료 표시의 앱 인수인계(2026-09-09). 2026-09-12 앱 전환 구현 완료 | 앱 동작 [apps/mobile/docs/features/movie.md](../../apps/mobile/docs/features/movie.md) · 남은 것 [backlog.md](../backlog.md) A-1·A-4 |
| [movie-server-transition.md](./movie-server-transition.md) | 무비 서버 전환의 앱 착수 계획과 결정 요청 3건(2026-09-12). 같은 날 승인·구현 | 결정 [decisions/movie-client-cache.md](../decisions/movie-client-cache.md) · 앱 동작 [apps/mobile/docs/features/movie.md](../../apps/mobile/docs/features/movie.md) |
| [2026-08-12-rewarded-credit-review.md](./2026-08-12-rewarded-credit-review.md) | 열리지 않은 회의의 광고 보상 제안(한도 3회·쿨다운 5~15분 등). 다른 값으로 확정됨 | 정책 [decisions/ad-reward-credits.md](../decisions/ad-reward-credits.md) §7 · 미결 [backlog.md](../backlog.md) C-6 |
| [progress-integrations-2026-08.md](./progress-integrations-2026-08.md) | 연동/수익화 트랙 하드닝 기록(2026-08-03~08-10). 2026-09-27 에 [progress.md](../progress.md) 에서 분리 — Stripe 하드닝·Stripe 웹훅 e2e 등 이후 뒤집힌 내용 포함 | 이후 진행 [progress.md](../progress.md) · SNS 셋업 [sns-setup.md](../sns-setup.md) · 결제 [decisions/payment-channel-iap.md](../decisions/payment-channel-iap.md) · 미결 [backlog.md](../backlog.md) C-2 |
| [lifecycle-alignment.md](./lifecycle-alignment.md) | 영상·프로젝트·결과물 생애주기 정합 계획(2026-09-09). 결정 셋과 트랙이 2026-09-09~09-27 에 끝남 | 만료 구조 [decisions/snap-retention-period.md](../decisions/snap-retention-period.md#만료의-동작-구조) · 요구 [specs/movie.md](../specs/movie.md)·[specs/snap-library.md](../specs/snap-library.md) · 미결 [backlog.md](../backlog.md) |
| [snap-reconcile.md](./snap-reconcile.md) | 스냅 reconcile(기기 간·재설치 동기화) 계획(2026-09-27). 0~3단계 구현·Android 실기기 검증 완료 | 설계 [decisions/snap-sync-across-devices.md](../decisions/snap-sync-across-devices.md#동기화-설계) · 앱 동작 [apps/mobile/docs/features/snaps.md](../../apps/mobile/docs/features/snaps.md) · 미결 [backlog.md](../backlog.md) A-4 |
| [2026-08-31-dev-sync-follow-up.md](./2026-08-31-dev-sync-follow-up.md) | 2026-08-31 개발자 회의 후속 계획(2026-09-05). T2·T3 는 2026-09-09 결정 | 남은 결정과 착수 순서 [decisions/README.md](../decisions/README.md) §결정 대기 · 미결 [backlog.md](../backlog.md) |
| [movie-cleanup-ux-comparison.md](./movie-cleanup-ux-comparison.md) | 끝내기 후 정리 결정의 선택지별 화면 비교(2026-09-09) | 결정 [decisions/movie-cleanup-after-export.md](../decisions/movie-cleanup-after-export.md) · 앱 화면 [apps/mobile/docs/features/movie.md](../../apps/mobile/docs/features/movie.md) |
| [on-prem-deploy.md](./on-prem-deploy.md) | 사내 서버 배포 계획(2026-09-15 착수). 2026-10-09 사내 서버를 접음 | 현행 배포 [deployment-aws.md](../deployment-aws.md) · 그때의 절차 [deployment-on-prem.md](./deployment-on-prem.md) · 구성을 고른 이유 [on-prem-deployment.md](./on-prem-deployment.md) |
| [deployment-on-prem.md](./deployment-on-prem.md) | 사내 서버의 배포·운영 절차(2026-09-15~10-09). 원래 위치는 `docs/deployment.md` | 현행 배포 [deployment-aws.md](../deployment-aws.md) · 남은 작업 [backlog.md](../backlog.md) B-8 |
| [on-prem-deployment.md](./on-prem-deployment.md) | 사내 서버 구성을 고른 이유와 기각한 대안(2026-09-27). 원래 위치는 `docs/decisions/` | 뒤집은 결정 [decisions/aws-contest-server.md](../decisions/aws-contest-server.md) |
| [edit-spec-v3-kickoff.md](./edit-spec-v3-kickoff.md) | editSpec v3 착수 계획(어휘 사전·시드·무효화 규칙 커밋 1~4). 커밋 1~3 은 2026-08-20 구현 | 확정 결정 [decisions/edit-spec-v3.md](../decisions/edit-spec-v3.md) · 남은 개정 [backlog.md](../backlog.md) A-7 |
| [plan-limits.md](./plan-limits.md) | 정기 구독 시절 플랜 차등 집행 보류 결정과 기술 보호 제한 표 | 기각 근거 [decisions/credit-payment-model.md](../decisions/credit-payment-model.md) · 현행 요청 제한 [api-spec.md](../api-spec.md) |
| [ai-vlog-studio/concept.md](./ai-vlog-studio/concept.md) (+ [목업](./ai-vlog-studio/studio-mockup.html)) | 2026-08-03 확정 제품 기획과 그 시점의 화면 목업. 원래 위치는 `apps/mobile/docs/guides/ai-vlog-studio/` | 결정 [decisions/product-concept.md](../decisions/product-concept.md) · 앱 동작 [apps/mobile/docs/features/](../../apps/mobile/docs/features/README.md) |
| [edit-recipe-tools.md](./edit-recipe-tools.md) | AI 편집 초안(MOV-21·MOV-22)이 쓸 편집 툴의 계획(2026-09-28) — 툴 카드 · v1 툴 목록 · 컷 역할 · 신호 · 착수 순서. 착수 순서 1~5 는 2026-10-01 에 대부분 구현 | 툴 카드·v1 범위 [decisions/auto-edit-draft.md](../decisions/auto-edit-draft.md#6-편집-툴--툴마다-정할-것과-v1-범위) §6 · 전환 범위·여분 프레임·줌 상한 [decisions/transition-director.md](../decisions/transition-director.md#0-전제--고를-수-있는-전환과-겹침형의-여분-프레임) §0 · 컷 역할·신호 [decisions/edit-director.md](../decisions/edit-director.md) §6·§8.1 · 미결 [backlog.md](../backlog.md) A-7·A-11 |

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
- **착수·완료된 계획**(lifecycle-alignment · snap-reconcile · dev-sync follow-up · on-prem-deploy ·
  edit-spec-v3-kickoff): `plans/` 의 수명(구현 시작까지)을 넘겨 착수 전이거나 현행인 것처럼 보였고, 일부는
  진행 추적기로 쓰였다. 코드·문서가 근거로 인용하던 살아 있는 설계·결정은 결정 문서로 옮기고 인용을 바꿨다.
- **plan-limits · 정리 화면 비교**: 대체됐거나 결정이 끝나 쓸 곳이 없는 판단 자료다. plan-limits 는 낡은
  "현행 사실" 표가 api-spec 보다 우선한다고 주장하고 있었다.
- **2026-08 연동 하드닝 기록**: Phase 1~9 와 같은 기준 — 이후 뒤집힌 Stripe 내용과 틀린 이동 안내가 현행
  진행 기록에 표시 없이 남아 있었다.
- **제품 콘셉트**: 실무 가이드 폴더에 놓인 결정 기록이었고, 구현과 어긋난 부분까지 현행 문서가 근거로
  인용했다. 아직 유효한 결정만 [decisions/product-concept.md](../decisions/product-concept.md)로 옮겼다.
- **편집 레시피의 툴**(2026-10-09): 착수 순서가 대부분 구현됐는데 코드 주석·어휘 사전의 `_note` 가 계획의 절을 규칙의
  근거로 인용하고 있었다. 살아 있는 규칙(툴 카드 · v1 범위 · 겹침형의 여분 프레임 · 줌 계열의 상한 · 역할 어휘)은 결정
  문서 셋으로 옮기고 인용을 바꿨다. 남은 일(기본 처리 · 초안의 vision 분석 · 컷 역할 싣기)은 이미 백로그에 있다.
