# Snaply

20~30대를 위한 숏폼 브이로그 AI 자동 편집 앱 — 모바일·API·AI worker 통합 모노레포.

**처음 왔다면 [ONBOARDING.md](ONBOARDING.md)** — clone부터 API와 모바일 dev client 실행까지
순서대로 안내한다.

## 구조

```
apps/
  mobile/       # Expo SDK 57 + React Native 모바일 앱
  api/          # Fastify + TypeScript API 서버 (:3000) + 알림 발송 워커
  ai-worker/    # Python 워커 3개 — 편집·스냅 분석·배포 렌디션 (프로세스·큐는 ONBOARDING §2)
packages/
  shared-types/ # API 계약(Zod 스키마)과 앱·API·워커가 공유하는 타입·어휘
```

인프라: 로컬 PostgreSQL(DB) · Supabase(Auth) · MinIO(S3 호환, :9100) · Redis(:6379).
개발/운영 전환은 endpoint/URL만 교체하고 코드 분기는 없다.

## 어디를 봐야 하는가 (원천 문서)

각 항목의 **사실은 아래 한 곳에만 있다.** 다른 문서가 같은 내용을 말하면 그쪽이 낡은 것이다.

| 알고 싶은 것 | 원천 | 비고 |
|---|---|---|
| 저장소 최상위 원칙 | [docs/constitution.md](docs/constitution.md) | 모든 spec·plan·구현·문서에 우선. 개정 절차 포함 |
| 제품 요구사항 (무엇을·왜) | [docs/specs/](docs/specs/README.md) | 요구 ID + 구현 상태 라벨. 동작 계약 변경은 spec 갱신이 먼저 |
| DB 스키마 | `apps/api/prisma/schema.prisma` | 마이그레이션 `prisma/migrations/`, RLS `prisma/rls-policies.sql` |
| API 계약 | [packages/shared-types/src/contract/](packages/shared-types/src/contract/) (Zod 스키마). Swagger `/docs`와 스냅샷 [apps/api/openapi.json](apps/api/openapi.json)은 여기서 생성 | [docs/api-spec.md](docs/api-spec.md)는 계약만으로 알 수 없는 동작(호출 순서·멱등성·에러 의미·비동기 흐름) + WebSocket — **라우트를 바꾸면 같이 갱신** |
| 로컬 셋업·명령·트러블슈팅 | [ONBOARDING.md](ONBOARDING.md) | |
| 서버 환경변수 — 변수 목록 | `apps/api/src/env-spec.ts` | `.env.example`은 이 목록의 복사용 표현. 어긋나면 테스트가 실패 |
| 모바일 공개 환경변수 | `apps/mobile/.env.example` | `EXPO_PUBLIC_*`만 허용. 서버 시크릿 금지 |
| 서버 환경변수 — 배치·주입 방식 | [docs/decisions/env-management.md](docs/decisions/env-management.md) | 로컬은 `apps/api/.env`, 운영은 주입 |
| 커밋·PR·코드 규칙 | [AGENTS.md](AGENTS.md) | 상세: [docs/commit-guidelines.md](docs/commit-guidelines.md) · [docs/pull-request-guidelines.md](docs/pull-request-guidelines.md) |
| 모바일 에이전트 규칙 | [apps/mobile/AGENTS.md](apps/mobile/AGENTS.md) | `apps/mobile/**` 작업에 추가 적용. 경로는 별도 표기가 없으면 `apps/mobile` 기준 |
| 모바일의 현재 사용자 동작 | [apps/mobile/docs/features/README.md](apps/mobile/docs/features/README.md) | 기능별 상태·라우트·소유 계층의 원천 |
| 다음에 결정·구현할 일 | [docs/backlog.md](docs/backlog.md) | 닫히지 않은 작업은 여기에만 둔다. `decisions/` 전체를 훑지 않는다 |
| 완료된 구현·검증 내역 | [docs/progress.md](docs/progress.md) | 완료된 것만 |
| 작업 분담·공유 파일 규칙 | [docs/team.md](docs/team.md) | |
| 무비가 서버에 사는 방식(앱 캐시·아웃박스) | [apps/mobile/docs/features/movie.md](apps/mobile/docs/features/movie.md#movies-live-on-the-server) | 앱 id·멱등 생성·읽기 병합. 결정 배경·기각한 대안은 [docs/decisions/movie-client-cache.md](docs/decisions/movie-client-cache.md), 미결 목록은 backlog |
| 정책·설계 결정 — 확정과 결정 대기 | [docs/decisions/README.md](docs/decisions/README.md) | 인덱스가 **결정 완료 / 결정 대기 / 대체됨**을 구분한다. 배경·논점·기각한 대안 포함 |
| 착수 전 구현 계획 | [docs/plans/](docs/plans/) | |
| 외부 연동 셋업 절차 | [docs/sns-setup.md](docs/sns-setup.md) | 인스타·틱톡 앱 등록 |
| 로컬 서버를 외부에 노출 | [docs/local-tunnel.md](docs/local-tunnel.md) | 웹훅·SSV 콜백·OAuth 테스트용 cloudflared 임시 주소 |
| 회의 안건·결과 | [docs/meetings/](docs/meetings/) | |
| 지난 기록 | [docs/archive/](docs/archive/) | **현행 사실과 다를 수 있음 — 판단 근거로 쓰지 말 것** |

문서를 새로 만들거나 옮길 때의 위치·이름 규칙은 [docs/doc-conventions.md](docs/doc-conventions.md)에 있다.
요약: `docs/` 직하는 계속 갱신되는 문서, 한 시점에 굳는 문서는 `decisions/`·`plans/`·`meetings/`,
수명이 끝나면 `archive/`. 파일명은 kebab-case 소문자(루트 진입점 4개와 `README.md`만 예외).

### 결정 문서

| 문서 | 내용 |
|---|---|
| [decisions/snap-source-of-truth.md](docs/decisions/snap-source-of-truth.md) | 스냅 원천을 서버로 전환 + 스토리지 용량 정책 결정. 한도 값은 아래 문서가 대체 |
| [decisions/storage-and-subscription-policy.md](docs/decisions/storage-and-subscription-policy.md) | Free 한도 2GB 축소 + 무비 30일 보관 + 크레딧·구독 2축 분리 |
| [decisions/env-management.md](docs/decisions/env-management.md) | 환경변수 — 파일은 로컬만, 운영은 주입. 목록의 단일 원천 |
| [decisions/plan-limits.md](docs/decisions/plan-limits.md) | 구독 폐기 전 플랜 차등 집행을 보류했던 과거 결정과 근거 |
| [decisions/credit-payment-model.md](docs/decisions/credit-payment-model.md) | 정기 구독 제거 + 무비 생성 크레딧 결제 전환 결정 (단위: export 1회 = 100크레딧) |
| [decisions/payment-channel-iap.md](docs/decisions/payment-channel-iap.md) | 결제 채널을 Apple/Google IAP + RevenueCat으로 확정, Stripe 제거 |
| [decisions/movie-model.md](docs/decisions/movie-model.md) | 영상 묶음 구조 3안 비교와 `Movie` 엔티티 채택 결정 |
| [decisions/snap-content-analysis.md](docs/decisions/snap-content-analysis.md) | 스냅 내용 분석의 소비자·분석 시점(추천 요청 시점)·스파이크 착수 범위 결정 |
| [decisions/template-snap-recommendation.md](docs/decisions/template-snap-recommendation.md) | 템플릿 기반 스냅 자동 추천 — 2단계 실행 구조, 카탈로그를 서버가 소유, 추천 1회는 무료 |
| [decisions/ad-reward-credits.md](docs/decisions/ad-reward-credits.md) | 보상형 광고 크레딧 — 지급 경로(AdMob SSV)·검증 규칙·정책 값(§7) 확정 |
| [decisions/account-deletion.md](docs/decisions/account-deletion.md) | 계정 삭제 — 30일 유예·복구·purge 정책 |

작업을 고를 때는 [docs/backlog.md](docs/backlog.md)에서 시작한다. 결정 문서는 선택한 항목의
배경과 제약을 확인할 때만 따라간다. 구현을 마치면 백로그에서 닫고
[docs/progress.md](docs/progress.md)에 검증 결과를 기록하되, 결정 문서는 근거 기록으로 남긴다.

## 빠른 시작

clone부터 API·모바일 dev client·워커 실행까지의 순서, 자주 쓰는 루트 명령, 트러블슈팅은
[ONBOARDING.md](ONBOARDING.md)가 원천이다 — 처음이면 §3을 순서대로, 명령 표는 §4.
