# 팀 작업 분담

**작성일**: 2026-07-28
**상태**: 현행
**원천**: 트랙 경계와 담당(§1), 공유 파일·협업 규칙(§2~§4). §1 의 기여 숫자는 담당을 정한 근거(2026-10-09 측정)이고
기여 현황의 원천이 아니다 — 지금 값은 git 이력에서 다시 잰다. 진행 기록·미결 작업·API 계약의 원천은 각각
[progress.md](./progress.md) · [backlog.md](./backlog.md) · [packages/shared-types/src/contract/](../packages/shared-types/src/contract/)
(계약만으로 알 수 없는 동작은 [api-spec.md](./api-spec.md))
**관련 문서**: [ONBOARDING.md](../ONBOARDING.md) · [AGENTS.md](../AGENTS.md) §공유 파일 ·
[commit-guidelines.md](./commit-guidelines.md) · [pull-request-guidelines.md](./pull-request-guidelines.md) ·
[deployment-aws.md](./deployment-aws.md) · [backlog.md](./backlog.md)

통합 모노레포를 트랙(기능 도메인) 단위로 나누어 맡고, 여러 트랙이 함께 건드리는 파일의 규칙을 정한 가이드다.

분담 축은 **기능 도메인(수직)** 이다. 모바일·API·워커를 별도 팀처럼 나누지 않고, 한 기능의
사용자 흐름과 서버 처리까지 같은 담당이 책임진다. 담당자가 바뀌어도 §1 의 트랙 경계와 §2 의 공유
surface 규칙은 유지한다.

---

## 0. 공통 기반

- Node 의존성과 `package-lock.json`은 저장소 루트에서 한 번만 관리한다.
- 로컬 DB는 `docker-compose.dev.yml`의 PostgreSQL이며, Supabase는 Auth에 사용한다.
- 서버·워커·compose는 `apps/api/.env`, 모바일 공개 변수는 `apps/mobile/.env`를 읽는다.
- 온보딩과 실행 명령의 원천은 [ONBOARDING.md](../ONBOARDING.md)다.

---

## 1. 수직 도메인 분담

트랙은 기능 도메인의 경계다. 한 트랙의 앱 화면·API·워커·DB 모델은 그 트랙의 담당이 끝까지 책임진다.
2026-07-28 에는 백엔드 개발자 2명이 트랙을 하나씩 맡았고(Dev A · Dev B), 2026-10-09 에 커밋 이력에 맞춰
담당과 모듈을 다시 적었다 — 근거는 [담당 배정의 근거](#담당-배정의-근거).

| | **미디어/편집 트랙** | **플랫폼/수익화 트랙** |
|---|---|---|
| 담당 | youngtaek_hong | youngtaek_hong — 인증·나/설정·크레딧/IAP·보상형 광고<br>최다연 — 위치/푸시·알림(`notification-worker.ts`, 만료 예고 배치 포함)<br>yoojinhee03 — SNS·법무 페이지 |
| 사용자 흐름 | 촬영·가져오기·스냅 보관함(기기 간 동기화·앨범 저장·최근 삭제)·무비·템플릿·AI 편집 초안·스냅 분석과 그 동의·렌더링 | 인증·나/설정·위치/푸시·알림·SNS·크레딧/IAP·보상형 광고·법무 페이지 |
| 모바일 | `src/features/{capture-moment,extract-snap,upload-snap,delete-snap,restore-snap,reconcile-snaps,save-snap-to-album,manage-recordings,compose-movie,fill-template,finish-movie,rename-movie,share-movie,analysis-consent}`<br>`src/entities/{snap,capture-session,movie,movie-template}`<br>관련 `pages`·`widgets`·기능 문서 | `src/features/{sign-in,sign-up,reset-password,delete-account,notification-settings,geofence-monitor,register-push-token,watch-reward-ad}`<br>`src/entities/{session,location,credit}`<br>관련 `pages`·기능 문서 |
| API | `apps/api/src/routes/{videos,edit-jobs,movies,movie-drafts,movie-templates,movie-recommendations,video-analyses}`<br>관련 서비스·queue | `apps/api/src/routes/{auth,locations,notifications,sns,sns-webhook,billing,billing-webhook,legal}`<br>관련 서비스·외부 연동 |
| 워커·배치 | `apps/ai-worker/**` — 편집 렌더·렌디션·스냅 신호·스냅 분석<br>`apps/api/scripts/{purge-expired-media,purge-stale-pending-videos}.ts` | `apps/api/src/notification-worker.ts`<br>`apps/api/scripts/{notify-expiring-media,purge-deleted-accounts}.ts`<br>외부 서비스 webhook·콘솔 설정과 API 쪽 검증 |
| DB 모델 | `Video`, `VideoSignals`, `VideoAnalysis`, `UserConsent`, `EditJob`, `Movie`, `MovieClip`, `MovieDraft`, `MovieTemplate*`, `MovieRecommendation*` | `User`, `Location`, `NotificationLog`, `SnsConnection`, `SnsUpload`, `Purchase`, `AdReward`, `CreditLedger` |
| 크리덴셜 | S3/CloudFront, OpenAI | Firebase, Instagram/TikTok, RevenueCat, AdMob |

- **담당**은 그 트랙을 지금 고치고 검증하는 사람이고, 그 트랙의 파일과 공유 surface(§2) 변경을 합의할
  상대다. 사람이 바뀌면 `담당` 행만 고친다.
- 새 모듈(기능·엔티티·페이지·라우트·서비스·DB 모델·워커·배치)을 만들면 같은 변경에서 이 표의 해당 칸에
  넣는다. 트랙이 애매하면 그 모듈을 낳은 사용자 흐름을 따른다 — `UserConsent`는 스냅 분석 동의의
  기록이라 미디어/편집, `notification-worker.ts`는 FCM 발송이라 플랫폼/수익화다.
- `User`와 인증 플러그인, API 응답 envelope는 공통 소유다. `apps/api/src/routes/health.ts`, 공유
  surface(§2), 배포 구성(`docker-compose*.yml` · `.github/workflows/**` · `deploy/`)과 그 시크릿
  (Supabase · Sentry · 배포 서버)도 어느 트랙에도 속하지 않는다. 두 트랙의 담당이 다르면 바꾸기 전에
  합의한다. 배포 구성(AWS 서버 하나 — `docker-compose.aws.yml` · `.github/workflows/deploy.yml` · `deploy/`)은
  youngtaek_hong 이 세웠고(2026-10-08) 최다연이 함께 고친다(2026-10-09 사내 서버 정리 · 백업 · ALB 뒤 WebSocket).
  나머지 공통 기반은 youngtaek_hong 이 담당한다.
- Swagger `/docs`에는 각 트랙이 자기 라우트 파일의 `tags`·`summary`와 계약 스키마
  (`packages/shared-types/src/contract/`)를 함께 유지한다.
- 기능 상태가 달라지면 같은 변경에서 `apps/mobile/docs/features/`의 해당 문서를 갱신한다.

### 담당 배정의 근거

2026-10-09 에 잰 커밋 기여다. 대상은 `main`(`395cbde`)의 커밋 434개에서 머지 커밋 3개와 대량 이동 커밋
2개(`d13f921` 앱 저장소 통합 · `db08ea9` 문서 정리 squash)를 뺀 429개이고, youngtaek_hong 의 작성자 이메일
3개는 한 사람으로 합쳤다. `코드 줄`은 문서·`package-lock.json`·생성 파일 `apps/api/openapi.json`을 뺀
추가+삭제 줄의 비율이다. 마지막 열의 괄호 속 비율은 그 영역의 지금 코드 줄 중 그 사람이 쓴 몫(`git blame`)이다.
앱(`apps/mobile`)은 통합 이전 이력이 이 저장소에 없어 통합 이후만 셌다.

| 작성자 | 이전 역할명 | 커밋 (전 기간) | 2026-08-31 이후 | 2026-09-16 이후 | 코드 줄 | 커밋한 기간 | 지금 코드에 주로 남은 곳 |
|---|---|---|---|---|---|---|---|
| youngtaek_hong | — | 285 (66%) | 195 (79%) | 150 (100%) | 74% | 2026-08-07 ~ 2026-10-09 | 모바일 앱(통합 이후 앱 코드 커밋 44개 중 43개) · 미디어/편집 API(67%) · 워커(59%) · 크레딧·IAP·보상형 광고(97%) · 인증·계정(62%) · Zod 계약(86%) · AWS 서버 배포 |
| 최다연 | Dev A | 113 (26%) | 52 (21%) | 0 | 15% | 2026-07-21 ~ 2026-09-15 | Phase 1~9 초기 구현(API·워커·DB·CI) · 위치·푸시·알림 서버(87%, `notification-worker.ts` 포함) · SNS(44%) · 무비 엔티티·보관 만료 배치·렌디션 워커 · 사내 서버 배포(2026-10-09 에 접어 코드는 지워졌다) |
| yoojinhee03 | Dev B | 31 (7%) | 1 (0.4%) | 0 | 11% | 2026-08-04 ~ 2026-08-31 | SNS(49%) · 법무 페이지(63%) · API 통합 테스트 하네스 · editSpec v3 어휘(`packages/shared-types`의 invalidation·anchor·stage·seed) |

`Dev A`·`Dev B`는 2026-07-28 분담에서 쓴 역할명이고 [progress.md](./progress.md)와 `docs/archive/`에 그대로
남아 있다. Dev A 는 최다연이다 — progress.md 의 `(Dev A)` 항목(2026-08-04 · 2026-08-05 · 2026-09-09~09-15)과
Dev B 인수인계에 단 Dev A 회신(`011b632`)을 최다연이 썼다. Dev B 는 yoojinhee03 이다 — "2026-08-10, Dev B"로
서명한 인수인계 문서(`6d5c7f9`)를 yoojinhee03 이 썼다. progress.md 2026-09-12 항목의 "Dev A 트랙"은 사람이
아니라 미디어/편집 트랙을 가리킨다(작성 youngtaek_hong).

트랙 하나를 사람 하나가 맡는 2026-07-28 의 대응은 2026-08-31 앱 저장소 통합 뒤로 맞지 않는다. 그 뒤
youngtaek_hong 이 두 트랙의 앱·API·워커를 함께 고쳤고(2026-08-31 이후 API 커밋 — 미디어/편집 31개 중 24개,
플랫폼/수익화 15개 중 8개), 2026-09-16 이후의 커밋은 모두 youngtaek_hong 이다. 그래서 트랙 경계는 두고 두
트랙은 youngtaek_hong 이 맡되, 세 사람 모두 개발에 참여하고 있으므로(2026-10-09 확인) 지금 코드의 대부분을
쓴 영역은 쓴 사람이 담당한다 — 위치·푸시·알림 서버는 최다연(87%), SNS 는 yoojinhee03(49%, 최다연 44%) ·
법무 페이지는 yoojinhee03(63%)이다. 위 숫자는 측정 시점(`395cbde`)의 이 저장소 기준이고 원격의 미병합 브랜치는 세지
않았다 — 측정 직후 같은 날 최다연의 커밋 10개(사내 서버 정리 · 백업 · ALB 뒤 WebSocket keepalive)가 main 에 더 들어왔다.

---

## 2. 공유 surface

아래 파일은 두 트랙이 동시에 건드릴 가능성이 높다. 작은 변경으로 자주 병합하고, 수정 전에
다른 트랙·브랜치의 진행 중 변경을 확인한다.

| Surface | 규칙 |
|---|---|
| `package.json`, `package-lock.json`, `turbo.json`, `.github/workflows/**` | workspace 전체에 영향을 주므로 의존성·CI 변경 이유를 분리해 검토한다 |
| `apps/mobile/app.json`, `apps/mobile/src/_app/**`, `apps/mobile/src/shared/api/**` | 네이티브 설정·provider 순서·전역 transport 변경은 양 트랙 기능에 영향을 준다 |
| `apps/api/src/config.ts` | 각자 자기 섹션만 추가하고 초기화 순서를 바꾸지 않는다 |
| `apps/api/src/app.ts` | 플러그인·라우트 등록만 추가한다. **에러/404 핸들러는 라우트 등록보다 앞**이라는 순서를 유지한다 |
| `apps/api/prisma/schema.prisma` | 마이그레이션 규칙(§3)을 따른다 |
| `packages/shared-types` | API 계약(Zod 스키마·라우트 레지스트리)과 워커 어휘의 원천. 값은 append-only를 우선하고, 계약을 바꾸면 API 테스트·`openapi.json` 재생성·모바일 `verify`를 같이 돌린다 |

---

## 3. 데이터베이스와 마이그레이션

**채택: 로컬 PostgreSQL로 개발 환경을 격리한다.**

- `npm run infra:up`이 띄우는 `snaply-postgres-dev`를 개발과 통합 테스트에 사용한다
  (포트 충돌 대처는 [ONBOARDING.md](../ONBOARDING.md) §5).
- 스키마 변경은 마이그레이션과 함께 커밋하고, pull 뒤 `npm run db:generate`를 실행한다.
- 운영 DB 반영은 손으로 하지 않는다 — main 머지 때 배포 잡이 컨테이너 교체 전에 마이그레이션을
  적용한다([deployment-aws.md](./deployment-aws.md) §3).
- API 통합 테스트는 `snaply_test`를 자동 생성한다. 실행 규칙은 [AGENTS.md](../AGENTS.md) §테스트.
- **새 테이블을 만들면 같은 변경에서 [`rls-policies.sql`](../apps/api/prisma/rls-policies.sql)에 정책을 쓴다.**
  로컬과 AWS 서버는 RLS 를 쓰지 않지만, 공유 Supabase DB 로 돌아가면 정책 없는 테이블은 앱에 든 공개 키로 열린다.
  소유자 컬럼이 있으면 `user_id = current_app_user_id()`, 없으면 부모를 거쳐(`exists`) 판정하고, 서버만 쓰는 데이터는
  조회 정책만 둔다. 소유자가 없는 제품 데이터는 RLS 를 켜고 정책을 두지 않는다(`movie_templates`).

---

## 4. Git과 검증

- 브랜치와 PR은 레이어가 아니라 독립적인 기능 또는 유지보수 목적 단위로 나눈다.
- 커밋 형식은 [commit-guidelines.md](./commit-guidelines.md), PR 본문은
  [pull-request-guidelines.md](./pull-request-guidelines.md)를 따른다.
- 모바일 변경은 `npm run verify:mobile`, API 변경은 저장소 루트의 관련 Turbo 명령 또는
  `npm test -w apps/api`로 검증한다(전체 목록은 [ONBOARDING.md](../ONBOARDING.md) §3-9).
- 아직 닫히지 않은 항목과 외부 승인 대기는 [backlog.md](./backlog.md)에만 기록한다.
