# Snaply

20~30대를 위한 숏폼 브이로그 AI 자동 편집 앱 — 모바일·API·AI worker 통합 모노레포.

**처음 왔다면 [ONBOARDING.md](ONBOARDING.md)** — clone부터 API와 모바일 dev client 실행까지
순서대로 안내한다.

## 구조

```
apps/
  mobile/       # Expo SDK 57 + React Native 모바일 앱
  api/          # Fastify + TypeScript API 서버 (:3000)
  ai-worker/    # Python 워커 2개 — edit-jobs·video-analysis 큐 구독 (HTTP 포트 없음)
packages/
  shared-types/ # 앱·API가 공유하는 요청/응답 타입
```

인프라: 로컬 PostgreSQL(DB) · Supabase(Auth) · MinIO(S3 호환, :9100) · Redis(:6379).
개발/운영 전환은 endpoint/URL만 교체하고 코드 분기는 없다.

## 어디를 봐야 하는가 (원천 문서)

각 항목의 **사실은 아래 한 곳에만 있다.** 다른 문서가 같은 내용을 말하면 그쪽이 낡은 것이다.

| 알고 싶은 것 | 원천 | 비고 |
|---|---|---|
| DB 스키마 | `apps/api/prisma/schema.prisma` | 마이그레이션 `prisma/migrations/`, RLS `prisma/rls-policies.sql` |
| API 계약 | `/docs` (Swagger, 코드에서 생성) | [docs/api-spec.md](docs/api-spec.md)는 FE 전달용 요약 + WebSocket — **라우트를 바꾸면 같이 갱신** |
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
| 확정된 정책·설계 결정 | [docs/decisions/](docs/decisions/) | 배경·논점·기각한 대안 포함 |
| 착수 전 구현 계획 | [docs/plans/](docs/plans/) | |
| 외부 연동 셋업 절차 | [docs/sns-setup.md](docs/sns-setup.md) | 인스타·틱톡 앱 등록 |
| 로컬 서버를 외부에 노출 | [docs/local-tunnel.md](docs/local-tunnel.md) | 웹훅·SSV 콜백·OAuth 테스트용 cloudflared 임시 주소 |
| 회의 안건·결과 | [docs/meetings/](docs/meetings/) | |
| 지난 기록 | [docs/archive/](docs/archive/) | **현행 사실과 다를 수 있음 — 판단 근거로 쓰지 말 것** |

문서를 새로 만들거나 옮길 때의 위치·이름 규칙은 [AGENTS.md](AGENTS.md) §문서 컨벤션에 있다.
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

전체 절차와 환경변수는 [ONBOARDING.md](ONBOARDING.md)에 있다. 요약:

```bash
nvm use                         # .nvmrc: Node 26
npm ci
cp .env.example apps/api/.env
cp apps/mobile/.env.example apps/mobile/.env
npm run infra:up                # MinIO(:9100/:9101) + Redis(:6379) + 로컬 Postgres
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev:api                 # http://localhost:3000 · /docs
npm run dev:mobile              # Android dev client용 Metro
```

두 환경파일에 넣을 값과 최초 네이티브 앱 빌드 순서는 [ONBOARDING.md](ONBOARDING.md)를 따른다.
RLS 정책은 최초 1회 `apps/api/prisma/rls-policies.sql`을 Supabase SQL Editor에서 실행한다.
AI 편집 워커는 `npm run worker:install` 후 `npm run worker`.
스냅 분석 워커는 같은 venv 에서 `npm run worker:analysis` — `OPENAI_API_KEY` 가 없으면 기동 단계에서 종료된다.

## 스크립트 (루트)

| 명령 | 설명 |
|---|---|
| `npm run infra:up` / `infra:down` / `infra:logs` | 개발 인프라 |
| `npm run stack` / `stack:down` | 전체 컨테이너 스택 빌드·migration·기동 / 중지 (기본 mock) |
| `npm run stack:up` / `stack:migrate` | API만 기동 / migration 수동 재실행 |
| `npm run dev:api` | API 서버(watch) |
| `npm run dev:mobile` | Android dev client용 Expo Metro |
| `npm run verify:mobile` | 모바일 포맷·린트·타입·API 타입·Jest 검증 |
| `npm run worker` / `worker:analysis` / `worker:install` | AI 편집 워커 / 스냅 분석 워커 / venv 설치 |
| `npm run analysis:run` | 분석 워커 단발 실행(디버그) |
| `npm run build` / `typecheck` / `lint` | 전체 빌드·검사 |
| `npm run db:generate` / `db:migrate` / `db:seed` / `db:studio` | Prisma |
| `npm test -w apps/api` | API 통합 테스트 — **반드시 API workspace 기준으로 실행** ([이유](AGENTS.md)) |
| `npm run media:e2e` / `media:cleanup` | 업로드→편집→결과 e2e / 테스트 데이터 정리 |
