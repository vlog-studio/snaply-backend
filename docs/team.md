# 팀 작업 분담 (2인)

개발자 2명이 통합 모노레포를 기능 도메인 단위로 나누어 구현·검증하기 위한 가이드다.
**소유권과 협업 규칙의 원천 문서다.** 진행 기록은 [progress.md](./progress.md), 미결 작업은
[backlog.md](./backlog.md), API 명세는 [api-spec.md](./api-spec.md)를 본다.

> 분담 축은 **기능 도메인(수직)** 이다. 모바일·API·워커를 별도 팀처럼 나누지 않고, 한 기능의
> 사용자 흐름과 서버 처리까지 같은 트랙이 책임진다. 실제 담당자가 바뀌어도 아래 경계와 공유
> surface 규칙은 유지한다.

---

## 0. 공통 기반

- Node 의존성과 `package-lock.json`은 저장소 루트에서 한 번만 관리한다.
- 로컬 DB는 `docker-compose.dev.yml`의 PostgreSQL이며, Supabase는 Auth에 사용한다.
- 서버·워커·compose는 `apps/api/.env`, 모바일 공개 변수는 `apps/mobile/.env`를 읽는다.
- 온보딩과 실행 명령의 원천은 [ONBOARDING.md](../ONBOARDING.md)다.

---

## 1. 수직 도메인 분담

| | **Dev A — 미디어/편집 트랙** | **Dev B — 플랫폼/수익화 트랙** |
|---|---|---|
| 사용자 흐름 | 촬영·가져오기·스냅 보관함·무비·템플릿·렌더링 | 인증·나/설정·위치/푸시·SNS·크레딧/IAP·보상형 광고 |
| 모바일 | `src/features/{capture-moment,extract-snap,upload-snap,delete-snap,compose-movie,fill-template,share-movie}`<br>`src/entities/{snap,movie,movie-template}`<br>관련 `pages`·기능 문서 | `src/features/{sign-in,sign-up,reset-password,delete-account,notification-settings,geofence-monitor,register-push-token,watch-reward-ad}`<br>`src/entities/{location,credit}`<br>관련 `pages`·기능 문서 |
| API | `apps/api/src/routes/{videos,edit-jobs,movie-templates,movie-recommendations}`<br>관련 서비스·queue | `apps/api/src/routes/{auth,locations,notifications,sns,billing,legal}`<br>관련 서비스·외부 연동 |
| 워커 | `apps/ai-worker/**` — 편집·스냅 분석 파이프라인 | 외부 서비스 webhook·콘솔 설정과 API 쪽 검증 |
| DB 모델 | `Video`, `EditJob`, `VideoAnalysis`, `MovieTemplate*`, `MovieRecommendation*` | `User`, `Location`, `NotificationLog`, `SnsConnection`, `SnsUpload`, `Purchase`, `AdReward`, `CreditLedger` |
| 크리덴셜 | S3/CloudFront, OpenAI | Firebase, Instagram/TikTok, RevenueCat, AdMob |

- `User`와 인증 플러그인, API 응답 envelope는 공통 소유다.
- Swagger `/docs`에는 각 트랙이 자기 라우트의 `tags`·`summary`·스키마를 함께 유지한다.
- 기능 상태가 달라지면 같은 변경에서 `apps/mobile/docs/features/`의 해당 문서를 갱신한다.

---

## 2. 공유 surface

아래 파일은 두 트랙이 동시에 건드릴 가능성이 높다. 작은 변경으로 자주 병합하고, 수정 전에
상대 트랙의 진행 중 변경을 확인한다.

| Surface | 규칙 |
|---|---|
| `package.json`, `package-lock.json`, `turbo.json`, `.github/workflows/**` | workspace 전체에 영향을 주므로 의존성·CI 변경 이유를 분리해 검토한다 |
| `apps/mobile/app.json`, `apps/mobile/src/_app/**`, `apps/mobile/src/shared/api/**` | 네이티브 설정·provider 순서·전역 transport 변경은 양 트랙 기능에 영향을 준다 |
| `apps/api/src/config.ts` | 각자 자기 섹션만 추가하고 초기화 순서를 바꾸지 않는다 |
| `apps/api/src/app.ts` | 플러그인·라우트 등록만 추가한다. **에러/404 핸들러는 라우트 등록보다 앞**이라는 순서를 유지한다 |
| `apps/api/prisma/schema.prisma` | 마이그레이션 규칙(§3)을 따른다 |
| `packages/shared-types` | 타입은 append-only를 우선하고 API·워커 소비자를 같이 검증한다 |

---

## 3. 데이터베이스와 마이그레이션

**채택: 로컬 PostgreSQL로 개발 환경을 격리한다.**

- `npm run infra:up`이 띄우는 `snaply-postgres-dev`를 개발과 통합 테스트에 사용한다.
- 호스트 5432가 점유되면 `apps/api/.env`의 `POSTGRES_HOST_PORT`, `DATABASE_URL`, `DIRECT_URL`을
  함께 바꾼다. 5433은 전체 스택용 compose가 사용하므로 피한다.
- 스키마 변경은 마이그레이션과 함께 커밋하고, pull 뒤 `npm run db:generate`를 실행한다.
- 운영 DB 반영은 머지 순서대로 한 명이 `prisma migrate deploy`를 실행한다.
- API 통합 테스트는 `snaply_test`를 자동 생성한다. 루트 또는 API workspace 스크립트 외의
  `npx vitest` 직접 실행은 금지한다.

---

## 4. Git과 검증

- 브랜치와 PR은 레이어가 아니라 독립적인 기능 또는 유지보수 목적 단위로 나눈다.
- 커밋 형식은 [commit-guidelines.md](./commit-guidelines.md), PR 본문은
  [pull-request-guidelines.md](./pull-request-guidelines.md)를 따른다.
- 모바일 변경은 `npm run verify:mobile`, API 변경은 저장소 루트의 관련 Turbo 명령 또는
  `npm test -w apps/api`로 검증한다.
- 아직 닫히지 않은 항목과 외부 승인 대기는 [backlog.md](./backlog.md)에만 기록한다.
