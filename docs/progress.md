# Snaply 모노레포 개발 진행 기록

**작성일**: 2026-07-22
**상태**: 현행 — 끝난 구현·검증만 담는다. 닫히지 않은 작업은 [backlog.md](./backlog.md)에 있다
**원천**: 완료된 구현·검증 결과와 그때 찾은 결함의 기록. 각 항목은 그 시점 기준이라 현재 구조·명령은
[README.md](../README.md)·[ONBOARDING.md](../ONBOARDING.md), 현재 스키마·계약은 `apps/api/prisma/schema.prisma`와
[`packages/shared-types/src/contract/`](../packages/shared-types/src/contract/)(Zod 계약, Swagger 의 원천)가 우선한다
**관련 문서**: [backlog.md](./backlog.md) · [archive/progress-phase-1-9.md](./archive/progress-phase-1-9.md) ·
[archive/progress-integrations-2026-08.md](./archive/progress-integrations-2026-08.md)

항목 제목은 `## YYYY-MM-DD — 제목`, 같은 날 이어지면 `## YYYY-MM-DD (이어서) — 제목`이다
([doc-conventions.md](./doc-conventions.md) §본문). 날짜로 찾고, 새 항목은 문서 끝에 붙인다. 이미 쓴 항목은
그 시점의 기록이라 본문을 현재에 맞게 고치지 않는다.

이 문서보다 앞선 기록은 archive 에 있다. Phase 1~9(초기 개발)는
[archive/progress-phase-1-9.md](./archive/progress-phase-1-9.md), 그 직후의 연동/수익화 트랙 하드닝(2026-08-03~08-10,
이후 제거된 Stripe 실키 검증 포함)은 [archive/progress-integrations-2026-08.md](./archive/progress-integrations-2026-08.md)다.
당시 기록이라 현행과 다른 부분이 있다(Stripe 구독·월 3편 제한은 제거됨). 착수 전 계획서는
[archive/snapvlog-backend-guide.md](./archive/snapvlog-backend-guide.md), Dev B → Dev A 인수인계 기록은
[archive/integrations-handover.md](./archive/integrations-handover.md)(확인 완료).

---

## 2026-08-04 — 실검증 라운드 1 — 미디어/편집 트랙 (Dev A)

**목표**: Phase 3~5를 mock/합성 클립이 아닌 **아이폰 실촬영 영상(HEVC/.MOV)** 으로 end-to-end 재검증 (team.md §2 "바로 착수" 항목).

**검증 결과** (아이폰 세로 MOV 3클립, `npm run media:e2e`)
- 업로드: presigned PUT → `POST /videos` → `ready`, HEVC/quicktime 그대로 통과 ✅
- 편집: 큐 적재 → 워커 → `done`, 진행률 0→100 실시간 ✅ (클립 3개 crossfade, 수초 내)
- 결과물: 1080x1920 세로 h264+aac, 썸네일 세로, `editedUrl` 인증 없이 재생 가능 ✅
- 자막: `subtitles: true` 시 whisper가 실음성("안녕하세용") 정확 인식 → mov_text 트랙 ✅

**발견·수정한 결함**
1. **결과물이 가로(1920x1080)로 렌더링** — 숏폼 앱인데 세로 클립이 레터박스로 박힘.
   Phase 5 검증이 가로 합성 클립이라 통과했던 것. → 세로 1080x1920 전환, 비율 다른
   원본은 확대·크롭·블러 배경 위 overlay, 회전 메타데이터(90/270도) 반영 (`editor.py`)
2. **`editedUrl` 403** — 개발 MinIO가 비공개 기본값이라 `publicUrl()` 주소가 재생 불가
   (운영은 CloudFront라 문제 없음). → `ensureBucketForDev()`가 기동 시 `s3:GetObject`만
   공개 정책 멱등 적용. 쓰기는 presigned PUT 전용 유지, 실제 AWS에선 no-op

**기획 반영: 자막 opt-in 전환**
- 쇼츠용이라 자막 불필요 → `POST /edit-jobs`에 `subtitles?: boolean` (기본 false) 추가
- false면 whisper 전사·삽입 건너뜀(가장 무거운 단계 절약). 워커의 whisper 선로드도
  제거해 lazy 로드로 — 기본 플로우에선 모델이 메모리에 안 올라감
- 소프트 자막(mov_text)은 플레이어에서 켜야 보이고 브라우저 `<video>`/SNS 업로드에선
  안 보임/유실됨. 자막을 살리는 기획이 되면 **burn-in**(영상에 굽기) 재검토 필요

**개발 도구 추가**
- `npm run media:e2e` — 로그인→업로드→편집→결과 URL 원커맨드 (--style/--subtitles/--upload-only)
- `npm run media:cleanup` — TEST_EMAIL 계정의 업로드·편집 테스트 데이터 정리

**특이사항**
- 개발 API 포트는 3000 유지 — 로컬에서 점유된 경우 각자 `.env`의 `API_PORT`로 변경 (개인 환경 설정, 레포 기본값 아님)
- 테스트 계정: `dayeon-test@dweax.com` (Supabase admin API로 생성, 비밀번호는 각자 관리)
- whisper 자막은 BGM 합성 후 음원에서도 정상 인식됨 (dev BGM 기준. 실BGM은 재확인 필요)

**남은 실검증 (A 트랙)**
- [x] AI 워커 Docker 이미지 빌드 + compose 풀스택에서 편집 1건 → **라운드 2에서 완료**
- 나머지(배포 인프라 확정 후 `deploy.yml` 활성화, HDR·장시간·10클립 스트레스 케이스)는
  [backlog.md](./backlog.md) B-1·F 로 이관

---

## 2026-08-05 — 실검증 라운드 2 — AI 워커 컨테이너 (Dev A)

**목표**: Phase 9에서 용량 문제로 생략했던 ai-worker 이미지 빌드와, compose 풀스택
(postgres+redis+minio+api+ai-worker)에서의 실제 편집 1건 검증.

**검증 결과**
- ai-worker 이미지 빌드 성공 (1.38GB, python:3.11-slim + ffmpeg 7.1.5) ✅
- 컨테이너 ffmpeg **HEVC 디코딩 확인** — 아이폰 MOV 2클립으로 실편집 ✅
- compose 풀스택 편집 e2e: 업로드→큐→컨테이너 워커→done, 1080x1920 + BGM + 자막 ✅
  (인증은 실제 Supabase JWT, DB는 compose postgres에 `prisma migrate deploy`)
- whisper lazy 로드 컨테이너 동작 확인 (기동 시 미로드 → 자막 job에서 모델 다운로드 ~27s) ✅
- 검증 방법: e2e 스크립트를 compose 네트워크의 node:20 컨테이너에서 실행
  (`API_BASE_URL=http://api:3000` 오버라이드, 클립은 볼륨 마운트)

**발견·수정한 것**
1. Dockerfile이 `assets/`(BGM)를 복사하지 않았고, `BGM_DIR` 기본값(상대경로)이 컨테이너
   CWD(/app/src)와 어긋남 → `COPY assets/` + `ENV BGM_DIR=/app/assets/bgm`
2. compose ai-worker에 `depends_on: postgres` 누락 → 마이그레이션 전 기동해 crash. 추가
3. **compose 프로젝트 이름 충돌** — docker-compose.yml과 docker-compose.dev.yml이 같은
   프로젝트(디렉토리명)를 공유해, 풀스택 `docker compose down -v`가 **dev 인프라 컨테이너·
   볼륨까지 삭제**(dev MinIO 데이터 유실 사고 1회, DB는 Supabase라 무사).
   → 각각 `name: snaply-stack` / `name: snaply-dev`로 분리

**참고**
- 이미지에 fontconfig/한글 폰트 없음 — 자막 burn-in 도입 시 Noto Sans KR 등 추가 필요
- 컨테이너 안 `editedUrl`은 `http://minio:9000/...`(네트워크 내부 주소). 운영은 CloudFront라
  무관하지만, compose를 FE 대상 데모로 쓰려면 S3_ENDPOINT/publicBaseUrl 조정 필요

---

## 2026-08-11 — 환경변수 관리 정리

**배경**: `.env` 가 세 곳(루트 · `apps/api` · `apps/ai-worker`)으로 갈라져 있었다. 루트 사본은
어느 문서에도 없었지만 `docker compose` 의 `${VAR}` 보간을 떠받치고 있었고, `apps/api/.env` 와
바이트 단위로 동일했다. 결정과 기각한 대안은 [decisions/env-management.md](./decisions/env-management.md).

**구현**
- `.env` 를 `apps/api/.env` 하나로 통일. compose 는 그 파일을 `env_file` 로 읽고 인프라 주소만
  `environment` 로 덮는다(compose 규격상 `environment` 가 우선).
- 컨테이너 테스트 서버를 1급 시나리오로 지원 — `npm run stack:up` / `stack:migrate` / `stack:down`.
  외부 연동은 기본 mock(`SNS_MOCK`/`STRIPE_MOCK` — 후자는 Stripe 제거 후 `BILLING_MOCK`으로 개명),
  `CLOUDFRONT_DOMAIN=""` 로 미디어 URL 을 스택 MinIO 로 고정.
- 워커가 `apps/ai-worker/.env` → 없으면 `apps/api/.env` 순으로 찾는다. `cp` 지시 삭제.
- 변수 목록의 단일 원천 `apps/api/src/env-spec.ts` 신설. `requireEnv` 의 인자 타입이 스펙에서
  파생돼(`RequiredEnvKey`) 강제 목록과 스펙이 어긋나면 타입체크에서 걸린다.
- `test/env-spec.test.ts` 가 스펙 ↔ `.env.example` ↔ 실제 코드 사용처를 대조한다.

**발견·수정한 것**
1. `CLOUDFRONT_DOMAIN` 이 빈 문자열이면 `publicBaseUrl` 이 `''` 가 됐다 — `config.ts` 가 `??` 를
   써서 빈 문자열이 통과했다. compose 가 `${CLOUDFRONT_DOMAIN:-}` 로 정확히 빈 문자열을 주입하고
   있었으므로, 루트 `.env` 에 실제 값이 있어서 가려져 있던 버그다. `|| undefined` 로 수정.
2. **Swagger·개발 로그인 판정을 `NODE_ENV !== 'production'` → `=== 'development'` 로 반전.**
   운영은 주입 모델이라 `NODE_ENV` 를 빠뜨려도 배포가 성공한다. 기존 조건이면 그 사고가
   "개발 로그인이 열린 채 운영 기동"으로 끝났다.
3. **파서 3종의 인라인 주석 처리가 달랐다.** `KEY=   # 설명` 을 Node 는 빈 값으로, compose 와
   워커 자체 파서는 **주석 문자열을 값으로** 읽는다. `.env.example` 이 이 형식이었으므로
   컨테이너에서만 `LEGAL_CONTACT_EMAIL` 등에 주석이 들어갔다. `.env.example` 의 설명을 줄 위로
   옮기고, 워커 파서를 Node 규칙에 맞췄다(`_parse_value` + `tests/test_config.py`).
4. `.env.example` 의 `S3_ENDPOINT` 예시가 `localhost:9000` 이었다 — snaply 는 9100 을 쓴다.
5. 코드가 읽지만 `.env.example` 에 없던 변수 12개를 채웠다(`NODE_ENV`, `API_HOST`, `ENABLE_DOCS`,
   `LOG_LEVEL`, `EDIT_QUEUE_NAME`, `SUPABASE_JWT_AUDIENCE`, `SENTRY_DEBUG`, `WHISPER_MODEL`,
   `EDIT_TIMEOUT_SECONDS`, `BGM_DIR`, `TEST_EMAIL`, `TEST_PASSWORD`).

**검증**
- `npm run typecheck` / `npm run lint` 통과
- `npm test -w apps/api` — 12 파일 154 테스트 통과 (env-spec 6개 신규)
- 워커 `python -m unittest tests.test_config` — 5개 통과
- `docker compose --env-file /dev/null config` 로 **루트 `.env` 가 없는 상태**를 렌더해,
  `env_file` 이 Supabase 자격증명을 공급하고 `environment` 가 인프라 주소를 덮는 것을 확인
- 드리프트 감지 확인 — `.env.example` 에 미선언 키와 `KEY=   #` 형식을 넣으면 테스트가 실패한다

**컨테이너 실기동 검증** (루트 `.env` 를 지운 상태에서 `docker compose up --build -d api`)
- `/health` 200, `db: connected` ✅ / `stack:migrate` 로 마이그레이션 전량 적용 ✅
- **`/health` 만 보지 않았다.** 컨테이너 안에서 JWKS(`$SUPABASE_URL/auth/v1/.well-known/jwks.json`)를
  직접 호출해 **200 + 키 1개** 확인 — `env_file` 이 `SUPABASE_URL` 을 제대로 공급했고 인증 경로가
  살아 있다는 뜻이다. 잘못된 토큰으로 `/auth/me` → `UNAUTHORIZED`(토큰 검증 실패), 토큰 없이 →
  `UNAUTHORIZED`(토큰 없음)로 분기도 정상 ✅
- `NODE_ENV=development` 가 주입돼 `/docs` 200, `securitySchemes` 에 `devLogin` 등록 확인 ✅
- 컨테이너 안 `SNS_MOCK=true` / `STRIPE_MOCK=true`(현 `BILLING_MOCK`) / `CLOUDFRONT_DOMAIN=""` 확인 ✅
- 주석 유입 회귀 확인 — `LEGAL_CONTACT_EMAIL`·`SITE_VERIFICATION_META`·`STRIPE_PRICE_*` 가 모두
  빈 값이고, `/legal/terms` 의 `<head>` 에 검증 메타 태그가 들어가지 않는다 ✅

**후속 작업의 현행 위치**: 배포 플랫폼 시크릿과 Deploy 스텝 연결은
[backlog.md](./backlog.md) B-1에서 관리한다. 이번 환경변수 정리 라운드에서는 JWKS 도달까지만
재확인했지만, 실제 Supabase JWT를 사용한 컨테이너 인증은 위 "실검증 라운드 2"에서 이미 완료했다.

---

## 2026-08-11 (이어서) — Firebase 서비스 계정 키 로테이션

새 키 발급 → `.env` 교체 → 기존 키 삭제. 키가 저장소에 들어온 적은 없다 — 이력 전체를 훑어도
private key 재료가 걸리는 곳은 [apps/api/test/fcm.test.ts](../apps/api/test/fcm.test.ts) 의 `fake`
픽스처뿐이고, `.env` 는 추적된 적이 없다. 레포 루트의 `snaply-66f8c-firebase-adminsdk-*.json` 도 이미
없으며 `.gitignore` 에 `*firebase-adminsdk*.json` 패턴이 있다.

---

## 2026-08-12 — 풀스택 Compose 공개 스토리지 주소 보간 수정

- `stack:up`이 Compose 보간용 env 파일을 지정하지 않아, `apps/api/.env`에
  `S3_PUBLIC_ENDPOINT=http://<PC의 LAN IP>:9200`을 설정해도 `docker-compose.yml`의 기본값
  `http://localhost:9200`이 API 컨테이너에 들어가던 문제를 수정했다.
- `stack:up`·`stack:migrate`·`stack:down`이 모두 `--env-file apps/api/.env`를 사용하도록 통일했다.
- AI 워커를 수동 기동하는 ONBOARDING 명령도 동일한 env 파일을 사용하도록 갱신했다.

---

## 2026-08-12 (이어서) — 원커맨드 로컬 스택 migration 자동화

- `npm run stack`이 최초 로컬 설치와 pull 후 업데이트를 모두 처리하도록 Compose에 일회성
  `migrate` 서비스를 추가했다.
- `migrate`는 Postgres healthcheck 통과 후 `prisma migrate deploy`를 실행한다. API와 AI 워커는
  migration 성공을 기다리며, 실패 시 시작하지 않는다.
- 이미 적용된 migration은 Prisma가 건너뛰므로 같은 명령을 반복 실행할 수 있다.

---

## 2026-08-12 (이어서) — 계정 삭제 기능

**정책**: soft delete + 30일 유예 + 배치 실삭제 — [decisions/account-deletion.md](./decisions/account-deletion.md).
약관이 이미 계정 삭제를 약속하고 있었으나(`routes/legal.ts`) 구현이 없던 갭을 닫았다.

**구현 내용**
- `users.deleted_at` 신설(마이그레이션 `20260812000000_add_user_deleted_at`) + 조회 인덱스
- `DELETE /auth/me` — Stripe 즉시 해지(실패 시 삭제 중단), SNS 연동·FCM 토큰 삭제,
  진행 중 편집 작업 실패 처리 + 큐 제거(최선 노력), soft delete. `purgeAfter` 반환
  → 대체: 2026-08-14 "크레딧 결제 구현 + Stripe·구독 제거" — Stripe 해지 단계는 없어졌다
- 삭제 대기 계정의 인증 요청은 `403 ACCOUNT_PENDING_DELETION` (`plugins/auth.ts`)
- `POST /auth/me/restore` — 유예 내 복구 (`authenticateAllowDeleted` 경유)
- purge 배치 `npm run accounts:purge -w apps/api` (dry-run 기본, `--yes` 실삭제):
  S3 prefix → Supabase Auth Admin → DB Cascade 순. 개별 실패는 Sentry 기록 후 계속
- 신규 서비스: `account.service.ts`, `supabase-admin.service.ts`.
  스토리지에 `deleteObjectsByPrefix`, 큐에 `removeEditJob`, Stripe 클라이언트에 `cancelImmediately` 추가
- `SUPABASE_SERVICE_ROLE_KEY` 를 서버 코드가 읽기 시작 — env-spec `origin: 'shared'` 로 변경.
  **운영 시크릿 주입 목록에 추가 필요** (B-1 배포 작업에서 함께 처리)
- auth 스텁에 Admin 삭제 엔드포인트 추가(테스트용), 개인정보처리방침에 30일 유예 명시

**검증**
- `npm test -w apps/api` — 13 파일 160 테스트 통과 (account-deletion 6개 신규:
  소프트 삭제·정리, 편집 작업 취소, 403 차단, 복구 2건, purge 유예 판정)
- `npm run typecheck` / `npm run lint` 통과

---

## 2026-08-12 (이어서) — 고아 pending 영상 정리 배치

**배경**: `GET /videos/upload-url` 은 presigned URL 발급과 함께 `status='pending'` 레코드를
선생성하는데, 클라이언트가 업로드에 실패하거나 confirm(`POST /videos`)을 생략하면 pending 행이
무한히 쌓였다(실사례: 로컬 배포에서 MinIO 공개 주소가 `localhost` 로 잘못 설정돼 모바일 업로드가
계속 실패 → snap 20개에 Video 249행). [decisions/snap-source-of-truth.md](./decisions/snap-source-of-truth.md)
§5 GC 병행 항목 ① 을 구현한 것.

**구현 내용**
- `video.service.ts` — `PENDING_VIDEO_TTL_HOURS`(24), `findStalePendingVideos`,
  `purgeStalePendingVideos`. 대상은 `kind='source' AND status='pending' AND createdAt <= now-TTL`.
  업로드만 되고 confirm 안 된 S3 객체가 있을 수 있어 S3 삭제(없으면 no-op) 후 행을 hard delete.
  개별 실패는 Sentry 기록 후 계속 (`accounts:purge` 와 동일 구조)
- 배치 `npm run videos:purge-pending -w apps/api` (dry-run 기본, `--yes` 실삭제).
  운영에서는 cron 하루 1회 상정
- 테스트 hermetic 보강: `test/setup/env.ts` 가 `S3_PUBLIC_ENDPOINT` 를 테스트 MinIO 로 고정하고
  `CLOUDFRONT_DOMAIN` 을 비운다 — 개인 `.env` 의 공개 주소(LAN IP)가 새면 presigned URL 을 쓰는
  테스트가 접속 불가로 실패했다

**검증**
- `npm test -w apps/api` — 14 파일 162 테스트 통과 (pending-video-purge 2개 신규:
  TTL·상태·kind 필터 판정, 미확정 S3 객체 동반 삭제 — 실제 MinIO 에 presigned PUT 후 확인)
- `npm run typecheck` / `npm run lint` 통과

---

## 2026-08-12 (이어서) — 삭제 대기 403 에 유예 만료 시각 동봉

**배경**: `DELETE /auth/me` 는 `purgeAfter` 를 반환하지만, 앱이 그 값을 놓치거나 다른 기기에서
로그인하면 남은 유예 기간을 알 방법이 없었다. 삭제 대기 계정이 받는
`403 ACCOUNT_PENDING_DELETION` 에 같은 값을 실어, 복구 안내 화면이 별도 조회 없이
기한을 표시할 수 있게 했다.

**구현 내용**
- `account.service.ts` — `purgeAfterFor(deletedAt)` export. 30일 규칙 계산을 한 곳으로 모으고
  `deleteAccount` 도 이 함수를 쓴다. 삭제 응답과 403 이 같은 `deletedAt` 에서 계산되므로
  두 값이 문자열까지 일치한다
- `AppError` 에 optional `details?: Record<string, unknown>` 추가. 에러 핸들러(`app.ts`)가
  `error` 객체에 병합하되 `{ ...details, code, message }` 순서 — 부가 정보가 `code`/`message` 를
  덮지 못하게 한다
- `schemas/responses.ts` — `FORBIDDEN_ERROR_SCHEMA` 신설, `AUTHENTICATED_ERROR_RESPONSES` 에
  `403` 으로 등록. **Fastify 는 선언되지 않은 상태 코드에 직렬화 스키마를 적용하지 않으므로**
  선언 없이도 런타임에는 값이 나가지만, OpenAPI 에 안 잡혀 앱 `schema.d.ts` 가 필드를 모르고,
  나중에 누가 403 을 선언하는 순간 `additionalProperties: false` 로 조용히 사라진다.
  `purgeAfter` 는 optional — `AppError.forbidden()` 의 일반 403 도 같은 스키마를 쓴다
- `routes/edit-jobs.ts` 의 `403: API_ERROR_SCHEMA` 제거 — 뒤따르는
  `...AUTHENTICATED_ERROR_RESPONSES` 스프레드에 덮여 이미 죽은 선언이었다(동작 변화 없음)

**검증**
- `npm test -w apps/api` — 14 파일 163 테스트 통과 (account-deletion 1개 신규:
  유예 중 요청의 403 `purgeAfter` 가 삭제 응답과 동일)
- `npm run typecheck` / `npm run lint` 통과

---

## 2026-08-13 — 편집 작업 취소 API + 실패 분류 코드

**배경**: FE 안건 2건을 닫은 것. ① `generating` 상태에서 잘못 시작한 편집을 멈출 방법이
없어 워커 타임아웃 10분이 사실상의 상한이었다 — 취소 엔드포인트와 취소된 작업의 최종 상태
정의가 필요했다. ② 실패 시 앱이 서버 `errorMessage` 원문을 그대로 화면에 그리고 있었다 —
앱이 사용자 문구로 분기할 수 있는 **분류 코드**가 문구 개선보다 먼저다.

**구현 내용**
- `DELETE /edit-jobs/:id` — `queued`/`processing` 작업을 취소. 최종 상태 **`canceled`** 신설
  (`EditJobStatus`에 추가). 이미 `canceled`면 200(멱등), `done`/`failed`면 409 `CONFLICT`
  (`AppError.conflict` 신설), 남의 작업은 404
- 취소 시: DB 상태 변경(원천) → 결과물 video `failed`+소프트 삭제(목록에서 숨김) →
  큐 제거(최선 노력) → 진행률 채널에 `{status:'canceled'}` 발행으로 열린 WebSocket 종료
- **워커의 취소 인지** (`ai-worker`): `mark_processing`/`update_progress`/`mark_done`을
  상태 조건부 UPDATE로 바꿔, 취소된 작업은 진행률 갱신 시점에 `JobCanceled`로 중단하고
  BullMQ 재시도 없이 종료. `canceled`가 `done`/`failed`로 되살아나지 않는다
- 계정 삭제의 편집 작업 취소도 같은 최종 상태(`canceled`)로 통일 (`account.service.ts`)
- **실패 분류 코드**: `edit_jobs.error_code` 컬럼 추가(마이그레이션
  `20260813000000_add_edit_job_error_code`), `EditJobErrorCode` 타입
  (`TIMEOUT | SOURCE_UNAVAILABLE | QUEUE_FAILED | INTERNAL`, append-only).
  워커가 실패 사유별로 기록하고, API는 큐 적재 실패에 `QUEUE_FAILED`를 기록.
  `GET /edit-jobs/:id` 응답과 WS 실패 메시지(`code`)에 노출
- `getRedisPublisher()` — API 쪽 Pub/Sub 발행 전용 공유 연결 (`lib/redis.ts`)

**검증**
- `npm test -w apps/api` — 15 파일 170 테스트 통과 (edit-jobs-cancel 7개 신규:
  queued/processing 취소, 결과물 video 정리, 멱등 재취소, done/failed 409, 남의 작업 404,
  canceled 조회, errorCode 노출) + tsc + storage 테스트 통과
- 워커 파이썬 변경은 문법 검증만 수행(로컬 pytest 미설치, 기존 테스트는 순수 함수 대상).
  실제 취소 중단·코드 기록은 로컬 워커 기동 시 실검증 필요

**후속(미결 아님, 정책 대기)**: 크레딧 차감/환급이 확정되면(backlog A-2) 취소 시 환급을
이 엔드포인트에 연결한다. 앱 쪽은 `errorCode`→문구 매핑과 취소 UI를 이어받는다.

## 2026-08-14 — 크레딧 결제 구현 + Stripe·구독 제거

기본 단위 **Movie export 1회 = 100크레딧**과 "유료 구독 없음"이 확정돼
[archive/iap-migration.md](./archive/iap-migration.md)를 구현했다. 정책 근거는
[decisions/credit-payment-model.md](./decisions/credit-payment-model.md) ·
[decisions/payment-channel-iap.md](./decisions/payment-channel-iap.md).

**스키마** (`20260814000000_add_credit_ledger_drop_subscriptions`)
- `credit_ledger` — append-only 증감 원장. **잔액은 delta 합계**이며 캐시 컬럼을 두지 않았다
  (원장과 잔액이 어긋날 여지를 없앰). 병목 시 `users.credit_balance` 증분 갱신으로 얹는다
- `purchases` — 스토어 거래 원장. `store_transaction_id` unique 가 중복 지급을 원천 차단
- `credit_ledger(edit_job_id, reason)` unique — 예약·환급 멱등성의 근거. 취소(API)와
  실패(워커)가 겹쳐도 환급이 한 번만 기록된다
- `subscriptions` 테이블 drop (운영에 유료 구독 행 없음 확인 후 이관 없이 제거)

**크레딧 서비스** (`services/credit.service.ts`, `services/billing/credit-policy.ts`)
- 지급/회수/예약/환급. "이미 처리했는지" 조회 후 분기하지 않고 **판정을 DB 제약에 맡긴다** —
  웹훅 재전송과 동시 요청은 조회와 삽입 사이를 파고들기 때문
- 환급은 금액을 인자로 받지 않고 원장에서 계산한다(실제 차감된 만큼만 되돌림)
- 미확정 수량(팩별 크레딧·가입 보너스)은 `credit-policy.ts` 한 곳에 격리 — backlog A-2 확정 시
  숫자만 교체한다

**결제 API** (`routes/billing.ts`, `routes/billing-webhook.ts`)
- `GET /billing/products` · `GET /billing/credits` · `POST /billing/sync`
- `POST /billing/webhook/revenuecat` — Authorization 헤더 시크릿 검증(서명 아님, raw body 불필요).
  이벤트 타입으로 **먼저 분기**시켜 두어 구독 이벤트가 붙어도 구조를 뒤집지 않는다
- 카탈로그에 없는 상품은 임의 지급 대신 500 — RevenueCat 재시도가 매핑 배포 후 지급으로 이어진다
- 제거: `GET /billing/plans` · `GET /billing/subscription` · `POST /billing/checkout` ·
  `POST /billing/cancel` · Stripe 웹훅

**export 연동** (`services/edit-job.service.ts`, `ai-worker/src/db.py`)
- 결과물 video + edit_job 생성과 예약이 한 트랜잭션. 잔액 부족은 `402 INSUFFICIENT_CREDITS`
  (+`required`·`balance`)이며 작업 레코드도 남지 않는다
- **잠금 순서가 중요하다**: 유저 행 `FOR UPDATE` 가 INSERT 보다 **먼저**여야 한다. 뒤에 두면
  `videos`/`edit_jobs` INSERT 의 FK 검사가 같은 `users` 행에 share 락을 걸어 동시 요청끼리
  데드락이 난다 — 실제로 40P01 로 재현됐고 순서를 바꿔 해결했다
- 취소·큐 적재 실패·워커 실패 모두 환급. 환급 로직은 **DB 함수 `refund_export_credits` 한 곳**에
  두고 API(TypeScript)와 워커(Python)가 호출만 한다 — 환급을 실행하는 주체가 둘이라 같은 SQL 을
  두 언어에 복사하면 한쪽만 고쳐질 수 있다
- BullMQ 자동 재시도로는 추가 차감이 없다 (`mark_processing` 이 `failed` 를 되살리지 않아
  첫 실패가 종료 상태다)

**정리**
- `rls-policies.sql`: 삭제된 `subscriptions` 정책을 `purchases`·`credit_ledger` 로 교체.
  둘 다 **본인 SELECT 만** 허용한다 — 원장이 잔액의 원천이라 클라이언트 쓰기를 열면 안 된다
- `plan` 개념 제거: `Plan` 타입, `UserProfile.plan`, `AuthUser.plan`, `GET /auth/me` 의 `plan` 필드.
  **FE 영향 있음** — 앱이 이 필드를 읽고 있으면 정리 필요
- `stripe.client.ts`, `billing-realkey.test.ts`, `stripe` 의존성, `STRIPE_*` 환경변수 제거
- 신규 환경변수: `REVENUECAT_API_KEY` · `REVENUECAT_WEBHOOK_AUTH_TOKEN` · `BILLING_MOCK` ·
  `CREDIT_SIGNUP_BONUS` (env-spec + `.env.example` 동기화)
- 약관·개인정보처리방침의 "유료 구독/Stripe" → 크레딧 결제/RevenueCat·Apple·Google

**검증**
- `npm test -w apps/api` — 15 파일 **161 테스트 통과** + tsc + storage 테스트.
  billing 17개 신규(웹훅 401·멱등 지급·환불 회수·중복 환불 방지·알 수 없는 상품 500·
  잔액 조회·sync 멱등·402 거절·예약·취소 환급·중복 환급 방지·동시 2건 중 1건만 성공)
- 워커 파이썬 변경(`_refund_export_credits`)은 문법 검증만 수행. 실제 실패 환급은 로컬 워커
  기동 시 실검증 필요
- **미검증**: RevenueCat 실키 경로(`/billing/sync` REST 조회)와 실제 스토어 sandbox 구매 —
  스토어 상품 등록이 선행돼야 한다 (backlog C-1)

## 2026-08-14 (이어서) — 보상형 광고 크레딧

앱 팀의 계약 요청을 [decisions/ad-reward-credits.md](./decisions/ad-reward-credits.md)로 확정하고
구현했다. 초안([archive/2026-08-12-rewarded-credit-review.md](./archive/2026-08-12-rewarded-credit-review.md) §4)의
출처별 버킷·만료·차감 우선순위는 **v1에서 채택하지 않았다** — 평면 델타 원장 위에
`reason: 'ad_reward'` 한 줄을 더하는 것으로 끝낸다.

**설계의 핵심**: "광고를 봤으니 지급해달라"는 엔드포인트를 두지 않았다. 지급의 유일한 트리거는
AdMob SSV 콜백이고, 앱은 세션을 열고 상태를 조회할 뿐이다. 콜백의 `reward_amount` 도 쓰지 않고
**세션 발급 시점에 스냅샷된 `ad_rewards.credits`** 를 지급한다.

**스키마** (`20260814020000_add_ad_rewards`)
- `ad_rewards` — 세션 왕복 상태(`pending | granted | expired | rejected`). `nonce` unique,
  `transaction_id` unique 가 SSV 재전송의 중복 지급을 원천 차단
- `credit_ledger.ad_reward_id` + `(ad_reward_id, reason)` unique — `edit_job_id` 와 같은 장치.
  한 세션은 `ad_reward` 원장 행을 최대 하나만 만든다
- `(user_id, granted_at)` 인덱스 — 한도·쿨다운을 **지급된 시각**으로 세기 때문

**서비스** (`services/ad-reward.service.ts`, `services/billing/admob-ssv.ts`)
- 서명 검증은 **수신한 raw 쿼리스트링을 `&signature=` 직전까지 잘라** ECDSA-SHA256 으로 한다.
  파싱 후 재조립하면 인코딩 차이만으로 정상 콜백이 위조로 판정된다
- 모르는 `key_id` 는 공개키 캐시를 1회 강제 갱신 후 재시도(키 로테이션 대응)
- 지급은 상태 전이 + 원장 insert 를 한 트랜잭션으로 묶고, 판정은 조회가 아니라 DB 제약에 맡긴다
- 만료된 pending 세션은 배치 없이 **조회 시점에 lazy 확정**한다 — 그 상태를 보는 사람이 곧
  그 상태에 막히는 사람이라 타이밍이 맞는다
- 검증 실패를 200 으로 삼키지 않는다(400). 삼키면 위조 시도와 정상 미지급이 로그에서 구분되지 않는다
- 거절 시에도 **수신한 `ad_unit` 을 그대로 기록**한다(검증되지 않은 값이며 진단용). Google 문서가
  `ad_unit` 형식을 못 박지 않아(설명은 "AdMob ad unit ID", 예시값은 숫자 `2747237135`) 첫 콘솔
  설정에서 허용 목록 형식이 어긋날 수 있는데, 남기지 않으면 DB만 보고 고칠 수 없다 (backlog C-6)

**API** (`routes/billing.ts`, `routes/billing-webhook.ts`)
- `GET /billing/ad-rewards`(가용성) · `POST /billing/ad-rewards`(세션 발급) ·
  `GET /billing/ad-rewards/{rewardId}`(상태) · `GET /billing/webhook/admob`(SSV, GET 쿼리스트링)
- 세션 발급 거절은 409 3종(`AD_REWARD_COOLDOWN` / `LIMIT_REACHED` / `SESSION_ACTIVE`)과
  503 `AD_REWARDS_DISABLED`. `402 INSUFFICIENT_CREDITS` 와 같은 방식으로 `error` 에
  `nextAvailableAt`·`resetsAt`·`rewardId` 를 함께 싣는다(`CONFLICT_ERROR_SCHEMA`)
- 남의 `rewardId` 는 404 — 403 으로 존재를 알리지 않는다

**앱 팀 요청 반영**
- `GET /billing/credits` 의 `entries[].reason` 을 OpenAPI **enum** 으로 고정
  (`ad_reward` 포함). 값의 원천은 `CREDIT_REASON` 이며 스키마가 그 목록을 그대로 쓴다
- `entries` 가 최대 50건이고 페이지네이션이 없다는 것을 Swagger 설명과 api-spec 에 명시
- `402 INSUFFICIENT_CREDITS` 의 `error.code` 문자열이 실제로 `INSUFFICIENT_CREDITS` 임을 확인
  (`credit.service.ts` `assertCreditsForExport`) — api-spec 예시와 일치한다

**정책값**: `AD_REWARD_ENABLED` 기본 **false**(킬 스위치). 보상 20 / 일일 3 / 쿨다운 300초 /
세션 TTL 900초는 잠정값이며 env 로 덮어쓴다. 일일 한도 기준 시각은 **KST 자정으로 확정**했다
(UTC 자정은 한국 사용자에게 오전 9시, 롤링 24시간은 앱이 한 문장으로 설명할 수 없다).
→ 대체: 2026-08-18 광고 보상 세 항목 — 세션 TTL 300초·일일 5회로 확정

**신규 환경변수**: `AD_REWARD_ENABLED` · `AD_REWARD_CREDITS` · `AD_REWARD_DAILY_LIMIT` ·
`AD_REWARD_COOLDOWN_SECONDS` · `AD_REWARD_SESSION_TTL_SECONDS` · `ADMOB_SSV_ALLOWED_AD_UNITS` ·
`ADMOB_VERIFIER_KEYS_URL` (env-spec + `.env.example` 동기화)

**검증**
- `npm test -w apps/api` — 16 파일 **186 테스트 통과** + tsc + storage 테스트.
  ad-reward 25개 신규. 테스트용 EC 키로 로컬 키셋(`file:` URL)을 물려 **서명 검증 경로를
  운영과 같은 코드로** 돌린다 — 검증을 우회하는 mock 플래그는 두지 않았다
- 커버: 정상 지급 · 같은 트랜잭션 재전송 1회 지급 · 위조 서명/만료 세션/남의 `user_id`/
  허용 밖 광고 단위/오래된 timestamp/삭제 대기 계정 거절 · 지급 시점 한도 재확인 ·
  일일 한도 409 · 쿨다운 409 · 세션 중복 409 · 만료 세션 lazy 정리 · 킬 스위치(enabled false + 503) ·
  남의 rewardId 404 · 내역의 `ad_reward` 노출
- **미검증**: 실제 AdMob 콘솔 연결(앱·광고 단위 등록, SSV 콜백 URL) — 저장소 밖 설정이
  선행돼야 한다 (backlog C-6)

---

## 2026-08-18 — 광고 보상 세션 수명·포기

앱 팀의 실기기 검증 리포트(2026-08-14, AdMob 미연동이라 모든 세션이 SSV 없이 `pending`)로
드러난 **대기 시간 역전**을 고쳤다 — 지급받은 사용자는 쿨다운 300초만 기다리는데, 콜백이 유실된
사용자는 진행 중 슬롯이 TTL(900초)로 풀릴 때까지 잠겼다. 결정과 기각한 대안(앱이 제안한 TTL 120초 등),
앱 팀 질문에 대한 답(한도·쿨다운의 기준 시각, 세션 남발)은
[decisions/ad-reward-credits.md](./decisions/ad-reward-credits.md) §4·§4-1.

- **세션 TTL 기본값 900초 → 300초**(= 쿨다운, `services/billing/credit-policy.ts`). TTL 이 쿨다운을
  넘기지 않는다는 관계를 타입 주석과 `.env.example`·env-spec 설명에 함께 남겼다
- **세션 포기** `DELETE /billing/ad-rewards/{rewardId}` — 새 상태 `abandoned`(`pending` 과 함께 아직 지급될
  수 있는 상태로, 만료 전에 도착한 SSV 는 그대로 지급). 컬럼은 `status VARCHAR(16)` 그대로라
  마이그레이션 없음. 멱등(확정된 세션·두 번째 포기에도 200 + 현재 상태), 남의 세션은 404

**검증**
- `npm test -w apps/api` — 16 파일 **194 테스트 통과** + tsc + storage 테스트. 포기 관련 8개 신규
- 커버: 포기 후 즉시 새 세션 발급 · 포기한 세션에 SSV 도착 시 지급 · 포기 세션을 한도 이상
  쌓아도 지급은 `dailyLimit` 까지 · 만료된 포기 세션은 거절 · 지급된 세션 포기 멱등 ·
  2회 포기 · 남의 세션 404(상태 불변) · 포기가 쿨다운을 우회하지 않음

---

## 2026-08-18 (이어서) — 광고 보상 정책 값 확정 — 20크레딧 · 일일 5회

`credit-policy.ts` 의 잠정값이던 보상량·한도를 확정했다 — 1회 보상 **20크레딧**, 일일 한도 **3 → 5회**
(`20 × 5 = 100 = MOVIE_EXPORT_COST`, 한도를 다 쓰면 정확히 export 1편). 값의 근거와 받아들인 트레이드오프는
[decisions/ad-reward-credits.md](./decisions/ad-reward-credits.md) §7.

**반영 위치**: `credit-policy.ts` 기본값·주석, `env-spec.ts`·`.env.example` 설명,
[api-spec.md](./api-spec.md) `GET /billing/ad-rewards` 예시와 표시 규칙, backlog A-2·C-6.

**검증**
- `npm test -w apps/api` — 16 파일 **196 테스트 통과** + tsc + storage 테스트
- 기본값 테스트 2개 추가(`ad-reward.test.ts`) — 다른 테스트는 env 로 한도를 3으로 덮어쓰므로
  기본값 자체가 검증되지 않았다. `credits × dailyLimit === MOVIE_EXPORT_COST` 와
  `sessionTtlSeconds <= cooldownSeconds` 를 못 박아 한쪽만 바뀌는 것을 막는다

---

## 2026-08-18 (이어서) — 광고 보상 쿨다운 300초 확정

A-2의 마지막 미결 값이었다. 값을 고른 것이 아니라 위아래가 모두 막혀 있음을 확인한 것이다 — 근거는
[decisions/ad-reward-credits.md](./decisions/ad-reward-credits.md) §7 "쿨다운 300초".

**반영**: `credit-policy.ts` 주석(하한·상한의 이유), `env-spec.ts`·`.env.example`,
[api-spec.md](./api-spec.md), backlog A-2 — **A-2에서 광고 보상 항목이 닫혔다.**
`AD_REWARD_ENABLED=true` 를 막는 것은 이제 C-6(AdMob 콘솔 설정) 하나뿐이다.

**검증**: `npm test -w apps/api` — 16 파일 196 테스트 통과 + tsc + storage 테스트.
기본값 300 은 이전 항목에서 추가한 `sessionTtlSeconds <= cooldownSeconds` 테스트가 계속 지킨다.

---

## 2026-08-19 — 스냅 내용 분석 — 방향 확정 + 스파이크 하네스

기능 방향(분석 결과는 내부 추천 입력 전용 · 추천 요청 시점의 후보 스냅만 분석 · 외부 vision API 에 프레임
4장 · 추천은 비동기 job)을 정했다 — 결정과 기각한 대안은
[decisions/snap-content-analysis.md](./decisions/snap-content-analysis.md) §1~§4. 기준선을 낼 스파이크 하네스
(`apps/ai-worker/scripts/analysis-spike/`)도 만들었지만 실행하지 않고 같은 날 본구현으로 넘어갔다 — 모듈은
`apps/ai-worker/src/pipeline/video_analysis/` 로 옮겨졌고 스파이크 디렉터리와 그 테스트는 제거됐다(결정 문서 §9,
아래 "스냅 내용 분석 본구현").

---

## 2026-08-19 (이어서) — 스냅 내용 분석 본구현 — 스키마·API·분석 워커·docker

`POST /videos/:videoId/analysis` 로 요청하면 분석 워커가 스냅의 대표 프레임을 vision 모델에
보내고, 결과가 `video_analyses` 에 남는다. 방향과 계획 대비 차이는
[decisions/snap-content-analysis.md](./decisions/snap-content-analysis.md) §9.

**DB** — `video_analyses` (마이그레이션 `20260819000000_add_video_analyses`)
- `(video_id, analysis_version)` unique 가 **버전당 1행**을 보장한다. 같은 스냅이 두 번
  분석되지 않는 것은 성능이 아니라 **과금** 문제다
- 결과 컬럼 외에 `model_version`·`prompt_version`·`input_tokens`·`output_tokens`·`attempts`·
  `error_code` 를 남긴다 — 기준선(처리시간·토큰·실패율)을 이 테이블 집계로 낸다
- `videos.status` 와 분리했다. 분석이 실패해도 원본은 `ready` 를 유지한다
- RLS 는 **select 만** 본인 것으로 허용한다. 생성·갱신은 service_role(API·워커)뿐

**API** — 라우트 2개, 재시도 전용 엔드포인트는 만들지 않았다
- `POST /videos/:videoId/analysis` → 202. 멱등: 진행 중이면 같은 `analysisId`,
  재시도 가능한 실패는 같은 행을 `queued` 로 되돌림, `done` 은 그대로,
  되돌릴 수 없는 실패는 **409**
- `GET /videos/:videoId/analysis` → 최신 버전 1건. 실패도 200 + `{ code, retryable }`,
  모델 원문 메시지는 노출하지 않는다
- 큐 적재 실패는 레코드를 `failed` 로 만들지 않고 `queued` 로 남긴 뒤 503 — 다음 요청이 다시 넣는다
- 기존 `Video` 응답에는 필드를 추가하지 않았다(테스트로 고정)

**워커** — `analysis_worker.py` (편집 워커와 별도 프로세스, 같은 이미지)
- `OPENAI_API_KEY` 가 없으면 **기동 단계에서 종료**한다. 작업을 받아놓고 전부 실패시키는
  것보다 낫다
- 프레임: FFprobe 실측 길이의 10/36.7/63.3/90% 시점을 **한 번의 ffmpeg 호출**로 뽑고,
  8x8 평균 해시로 유사 프레임을 제거한다. 실제 사용 장수는 `frame_timestamps_ms` 에 남는다
- 결과 반영은 `status='processing' AND videos.deleted_at IS NULL` 조건부 UPDATE 다.
  분석 중 영상이 삭제되면 모델 응답을 버린다
- 같은 트랜잭션에서 `videos.duration_seconds` 를 실측값으로 교정한다
- 재시도 가능한 실패만 다시 던져 BullMQ 백오프를 태운다. `AUTH_FAILED`·`SAFETY_REFUSED`·
  `FRAME_EXTRACTION_FAILED` 등은 기록만 하고 재시도하지 않는다
- `visualIssues` 는 코드 enum 으로 고정 — 자유 텍스트를 받으면 "왜 못 쓰는 스냅인가"를 집계할 수 없다

**docker** — `analysis-worker` 서비스 추가 (`docker-compose.yml`).
편집 워커와 같은 이미지에 `command: python analysis_worker.py`. `openai==1.68.2` 를
워커 requirements 에 고정했다.

**검증**
- `npm test -w apps/api` — 17 파일 **216 테스트 통과**(신규 `video-analysis.test.ts` 18개) + tsc + storage 테스트
- `cd apps/ai-worker && python3 -m unittest tests.test_video_analysis` — **38개 통과**
  (프레임 시점·유사 프레임 제거·요청 구성·오류 분류·결과 검증·analyze 오케스트레이션).
  ffmpeg·openai SDK 없이 돈다
- **docker 스택 실검증** (`docker compose up -d --build`):
  - 마이그레이션 적용 확인, `GET /health` 200
  - `OPENAI_API_KEY` 없이 뜬 `analysis-worker` 가 의도대로 기동 단계에서 종료
  - 더미 키로 기동 → 큐 구독 → 실제 mp4(MinIO)를 내려받아 ffprobe·프레임 추출까지 수행 →
    모델 호출에서 `AUTH_FAILED`(재시도 불가)로 분류 → DB 에
    `status=failed, error_code=AUTH_FAILED, attempts=1`, **원본 영상은 `ready` 유지**
  - 모델 응답만 스텁으로 바꾼 완료 경로: `status=done` 과 결과 전 컬럼·토큰(812/96)·
    `model_version`·`prompt_version` 기록, `videos.duration_seconds` 가 잘못된 값 99 →
    실측 3 으로 교정, 완료된 분석 재실행은 **모델 호출 0회로 skip**
  - 검증용으로 만든 행·MinIO 객체는 정리했다
- **실제 모델 응답으로 끝까지 돌린 적은 없다** — 유효한 `OPENAI_API_KEY` 가 필요하다.
  남은 작업은 [backlog.md](./backlog.md) A-3

**아직 켜지 않는 이유**: 생산 스냅의 프레임이 외부로 나가므로 약관 개정·제3자 제공 고지가
선행이고, 운영 모델과 단가 상한이 정해지지 않았다. 분석은 호출하지 않으면 돌지 않으므로
배포 자체는 안전하다(자동 적재 경로가 없다).

---

## 2026-08-19 (이어서) — 약관·개인정보처리방침의 분석 고지 초안

스냅 분석은 생산 스냅의 프레임을 외부 모델로 보내므로, `routes/legal.ts` 의 출시 전 초안에 분석 고지·
수탁자·국외 이전 절을 넣었다. 테스트(`test/legal.test.ts`)가 전송 범위(프레임 4장·오디오 미전송·영상
삭제 시 동시 파기)를 문구에 고정한다.

- **보유 기간·학습 이용** — 공개 문서 기준 학습 미이용, 남용 모니터링 로그 최대 30일. Responses API 의
  `store` 기본값이 true 라 30일 보관 축이 하나 더 생기는 것을 발견해 워커에서 `store: false` 로 껐다
- **국외 이전 표** — Firebase(리전 지정 불가)·RevenueCat(미국)·Sentry(미국, DSN 이
  `ingest.us.sentry.io`)를 채웠다. Meta·TikTok 은 우리가 직접 호출하므로 표에 내렸고, Apple·Google 은
  우리가 직접 보내지 않아 표가 아니라 문장으로 관계만 적었다

남은 법무 검토와 확정 항목은 [backlog.md](./backlog.md) D-2.

---

## 2026-08-19 (이어서) — 무비 템플릿 카탈로그 서버 이관

템플릿 4개가 앱의 로컬 상수에 있었다. 슬롯의 **매칭 규칙**이 생기는 순간 정의와 규칙이 서로
다른 저장소에 있게 되고, 그러면 한쪽만 고쳐진다. 그래서 카탈로그를 서버로 옮겼다 —
[decisions/template-snap-recommendation.md](./decisions/template-snap-recommendation.md) §2.
템플릿 기반 스냅 자동 추천(backlog A-6)의 1단계다.

**DB** — `movie_templates` · `movie_template_slots` (마이그레이션 `20260819010000_add_movie_templates`)
- 유저 데이터가 아니라 제품 데이터다. `user_id` 가 없고 **행은 마이그레이션이 넣는다**.
  시드 스크립트를 두지 않은 이유: 수동 실행을 빠뜨리면 앱이 조용히 내장 폴백으로 돌아가
  "서버가 카탈로그를 소유한다"가 사실이 아니게 된다
- 시드는 앱이 지금 내장한 4개(`walk`·`day`·`cafe`·`trip`)와 **id·label·hint 가 같다**.
  같아야 서버 응답과 오프라인 폴백이 같은 템플릿을 가리키고, 이 변경이 화면을 바꾸지 않는다
- 슬롯의 `match_hints`(jsonb)에 `{places, objects, actions, topics, temporalPrior}` 를 함께
  시드했다. **아직 읽는 쪽이 없다** — 2단계 점수화가 읽는다. jsonb 라 형태가 바뀌어도
  마이그레이션이 필요 없다
- `(template_id, position)` unique — 한 자리에 두 슬롯이 오면 장면 순서가 비결정적이 된다
- `retired_at` 으로 내린다. 행을 지우면 그 템플릿으로 만든 과거 추천이 고아가 된다
- RLS 는 **켜고 정책을 만들지 않았다.** 소유자 컬럼이 없어 "본인 것만" 규칙이 성립하지 않고,
  클라이언트에 직접 select 를 열면 점수화 내부값이 그대로 나간다. service_role 만 읽는다

**API** — `GET /movie-templates` 🔒 하나. 생성·수정 경로는 두지 않았다
- 내리지 않은 템플릿을 `sort_order` 순, 슬롯은 `position` 순
- `updatedAt` 은 목록에서 가장 최근에 바뀐 템플릿의 시각이다. 한 템플릿의 문구만 고쳐도
  앱 캐시가 갱신돼야 한다
- **`matchHints` 는 응답에 없다.** 응답 스키마의 `additionalProperties: false` 와 테스트가
  이걸 고정한다 — 앱이 읽기 시작하면 가중치 조정이 다시 앱 릴리스에 묶인다
- `style` 은 `POST /edit-jobs` 가 받는 프리셋 이름 그대로 내려간다. 서버가 새 프리셋을
  추가했을 때 **거르는 쪽은 앱**이다. 서버가 거르면 새 프리셋을 아는 앱에도 안 보인다

**검증**
- `npm test -w apps/api` — 18 파일 **223 테스트 통과**(신규 `movie-templates.test.ts` 7개) +
  tsc + storage 테스트. 신규 테스트가 고정하는 것: 401, 시드 4개의 id·순서, 슬롯 순서와
  label·hint, `style` 이 편집 프리셋 집합 안에 있음, `matchHints`·`temporalPrior` 문자열이
  응답 본문에 없음, `retired_at` 제외, `updatedAt` 이 갱신 시각을 따라감
- `npm run lint` · `npm run typecheck` 통과
- 마이그레이션은 테스트 DB(`snaply_test`)에 `migrate deploy` 로 적용돼 위 테스트가 그 위에서 돌았다
- 카탈로그 행은 하네스의 TRUNCATE 대상이 아니다(제품 데이터). 테스트가 행을 건드릴 때는
  `finally` 로 원복한다 — 다음 테스트 파일이 같은 DB 를 물려받는다

**로컬 dev DB 에는 적용하지 않았다**: `.env` 의 `DATABASE_URL`(`127.0.0.1:5433`)에 아무것도
떠 있지 않고, 로컬 `snaply`(5432)는 이번 것을 포함해 **7개 마이그레이션이 밀려 있는 상태**다.
이번 변경 이전부터 그랬고, 어느 쪽도 임의로 건드리지 않았다.

**다음**: 2단계 추천 job(`POST`/`GET /movie-recommendations`) — backlog A-6.

---

## 2026-08-19 (이어서) — 템플릿 스냅 추천 API — 규칙 기반 점수화

`POST /movie-recommendations` 로 후보 스냅과 템플릿을 주면, 후보의 분석 결과를 모아 슬롯에
배정한 결과를 `GET /movie-recommendations/:id` 로 돌려준다. backlog A-6 의 2단계이며,
방향과 기각안은
[decisions/template-snap-recommendation.md](./decisions/template-snap-recommendation.md).

**새 큐를 만들지 않았다** — 접수 시점에 후보 분석을 적재하고 채점은 조회(폴링) 시점에 한다. 동시 폴링은
`status='processing'` 조건부 갱신으로 하나만 이기고, 마감 시한(3분)이 지나면 끝난 분석만으로 채점한다.
계획과 달라진 이유는 결정 문서 §7.1.

**DB** — `movie_recommendations` · `movie_recommendation_items` (`20260819020000_add_movie_recommendations`)
- `candidate_video_ids` 는 **배열**이다. 앱이 보낸 촬영 시간 순서가 점수화의 시간 사전값이라
  집합으로 뭉갤 수 없다
- `candidate_hash` 는 **정렬한** 후보 집합의 해시다. 순서만 다른 재요청이 재분석을 돌리면 안 된다
- 영상이 삭제되면 `video_id` 만 `SET NULL` — 그 자리는 비고 추천은 남는다
- 템플릿 FK 는 `RESTRICT`. 템플릿은 지우지 않고 `retired_at` 으로 내린다

**점수화** — `services/recommendation/score-slots.ts`, DB 없이 도는 순수 함수. 공식·게이트·배정 규칙과
규칙 기반으로 시작한 근거는 결정 문서 §7. 힌트 jsonb 는 방어적으로 읽는다 — 한 행의 오타가 추천 전체를
무너뜨리지 않는다

**정책** — `services/recommendation/recommendation-policy.ts`. 상한(REC-3)과 재사용 창을 서버가 집행하고
크레딧은 차감하지 않는다(근거는 결정 문서 §4). 한도는 달력 하루가 아니라 직전 24시간이다.
`MOVIE_RECOMMENDATION_ENABLED` **기본 false** — 꺼져 있으면 503 `RECOMMENDATION_DISABLED`

**전역 에러 핸들러 순서를 바꿨다** (`app.ts`) — `AppError` 판정이 rate limit 판정보다 **앞**으로 왔다
(이유는 결정 문서 §7.2). 라우트별 rate limit 테스트 2건이 이 순서로도 그대로 통과한다

**검증**
- `npm test -w apps/api` — 20 파일 **257 테스트 통과**. 신규: `recommendation-score.test.ts` 14개
  (인프라 없이 도는 순수 테스트), `movie-recommendations.test.ts` 20개
- 통합 테스트가 고정하는 것: 멱등 재요청(순서만 다른 경우 포함) · 템플릿별 분리 ·
  후보 상한과 `max` 동봉 · 타 유저/미확정 스냅 403 · 내린 템플릿 404 · 24시간 한도 429와
  **재사용은 한도에 안 걸림** · 플래그 off 시 503 + 행 미생성 · 분석 미완료 시 `processing` ·
  완료 시 슬롯 배정 · `usableForEdit=false` 제외 · 분석 실패 후보 제외 후 나머지로 채움 ·
  마감 시한 초과 시 부분 채점 · 굳은 결과 재채점 안 함 · 남의 추천 404 · 영상 삭제 시 자리만 빔
- `npm run lint` · `npm run typecheck` 통과
- **실제 모델 응답으로 끝까지 돌린 적은 없다.** 통합 테스트는 분석 결과 행을 직접 만들어
  채점 경로를 검증한다. 유효한 `OPENAI_API_KEY` 로 도는 e2e 는 A-3 과 함께 남아 있다

**다음**: 앱 연동(카탈로그 원격화 + 2단계 병합) — backlog A-6.

---

## 2026-08-20 — 앵커 어휘 사전 + 워커 빌드 컨텍스트 루트 통일

editSpec v3 착수의 첫 단위. 계획과 결정 근거는
[archive/edit-spec-v3-kickoff.md](./archive/edit-spec-v3-kickoff.md) §3.

**사전은 원본 하나** — `packages/shared-types/src/anchor-vocabulary.json` 을 TS(`anchor.ts`)와 워커
(`pipeline/anchor.py`)가 같이 읽고, TS 상수와 JSON 의 대조가 정합성 장치다. 어휘의 형태(폴백 체인은 객체
배열, `defaultAnchor` 없음, 모든 kind 가 `ref`)는 [decisions/edit-spec-v3.md](./decisions/edit-spec-v3.md) §3.

**빌드 컨텍스트를 루트로, 로더는 편집 파이프라인에** — `docker-compose.yml` · `apps/ai-worker/Dockerfile` 의
워커 컨텍스트를 루트로 옮겼다(`packages/` 가 컨텍스트 밖이라 사전이 이미지에 들어갈 수 없었다). 로더
`pipeline/anchor.py` 는 사전이 없으면 기동에 실패하고, `config.py` 가 아니라 편집 파이프라인에 둬 분석 워커는
영향받지 않는다. 배치·로딩의 근거는 같은 결정 문서 §7. 부수 효과로 `.dockerignore` 의
`apps/ai-worker/assets/bgm/**/*.m4a` 제외가 작동하기 시작했다(루트 상대 경로라 그동안 no-op). 기동 로그에
`vocabulary=v1 derivation=v1` 을 남긴다.

**얼굴 앵커 파생** — MediaPipe 6키포인트에 없는 것을 만든다
- Face Detection 이 주는 것은 양 눈·코·입·양 귀뿐이다. `forehead` · `cheekL/R` · `chin` ·
  `aboveHead` 는 전부 bbox 와 두 눈에서 파생한다. FaceMesh 468 랜드마크는 도입하지 않았다
- 원점은 두 눈의 중점, 축은 눈 각도(roll)로 회전한 얼굴 로컬 프레임이다. 기울어진 샷에서
  스티커가 수직으로만 올라가면 즉시 어색해진다
- 좌표는 **소스 정규화**다. 앵커의 출처가 전부 소스 좌표계이고, 캔버스 기준으로 저장하면
  `fitMode` 가 섞여 출력 프로필을 바꿀 때 재계산해야 한다
- 정확도가 아니라 **재현성**이 계약이다. 계수를 손대면 `derivationVersion` 을 올리고
  `tests/fixtures/anchor-derivation.json` 을 다시 만든다. 픽스처가 버전을 함께 들고 있어
  버전을 안 올리면 테스트가 잡는다

**부동소수가 동률을 가르던 버그를 고쳤다**
- `object` 의 `beside` 는 프레임 여유가 큰 쪽을 고르고 동률이면 오른쪽으로 정했는데,
  `x=0.40 · w=0.20` 에서 `1.0 - (x + w)` 가 `0.3999999999999999` 로 떨어져 **동률이 왼쪽으로
  갈렸다.** 픽스처를 처음 생성할 때 주석과 반대 값이 나와서 드러났다
- 잡음(1e-16)보다 크고 화면에서 구분되지 않는(1e-9 는 1080px 에서 100만분의 1 픽셀) 여유를
  두고 비교한다. 같은 입력을 달리 표현했다고 스티커가 반대쪽에 붙으면 안 된다
- **여유값을 사전으로 뺐다**(`tieEpsilon`). 공식은 워커 단독 구현이지만 이 값은 **계약**이다 —
  앱 프리뷰 구현이 다른 값을 쓰면 픽스처가 계약 역할을 못 한다
- 픽스처에 **경계 케이스 7건**을 넣었다(13건 중). `beside` 가 동률에서만 드러났으므로,
  0.0/1.0 경계 · 정확한 동률 · 폭 0 · 수직 눈선을 일부러 넣어 남은 공식도 같은 방식으로
  드러나게 한다. 우연한 발견을 체계로 바꾼 것이다
- 겸사겸사 **클램프하지 않는다**를 결정으로 못박았다. 프레임 위에 붙은 얼굴의 `aboveHead` 는
  음수가 맞다 — 여기서 프레임 안으로 당기면 스티커가 조용히 다른 자리에 붙고 폴백 체인은
  "성공했다"고 판단한다. 배치 가능 여부는 세이프에어리어를 아는 배치 단계가 정한다

**검증**
- 워커: `python3.11 -m unittest discover -s tests` — **80 테스트 통과**(기존 58 + 신규 22).
  신규 `test_anchor.py` 는 사전 정합성 · 폴백 체인 규칙 · 사전 부재 시 예외 · 파생 픽스처 대조 ·
  기울기 반영 · 동률 결정론 · 경계 입력(클램프 금지, 수직 눈선, 폭 0)을 고정한다.
  ffmpeg·SDK 없이 돈다
- API: `npm test -w apps/api` — 21 파일 **279 테스트 통과**. 신규 `anchor-vocabulary.test.ts` 16개
  (TS 상수 ↔ JSON 대조, 사전 내부 정합성, 검증 헬퍼). `npm run lint` · `npm run typecheck` 통과
- 도커: 루트 컨텍스트로 이미지 빌드 성공(68초). 컨테이너에서 ① 사전 존재 ② 편집 워커 임포트 시
  `v1/v1` 로드 ③ **사전을 지우면 편집 워커 기동 실패**(경로 두 개를 안내하는 메시지)
  ④ 같은 상태에서 **분석 워커는 정상 임포트** ⑤ `sys.modules` 에 `pipeline.anchor` 없음 확인
- `.dockerignore`: 더미 `.m4a` 를 넣고 컨텍스트를 확인해 제외가 실제로 작동함을 확인
- **compose 풀스택 기동과 실제 편집 잡 e2e 는 돌리지 않았다.** 이 커밋은 파이프라인 동작을
  바꾸지 않으며(사전 로드와 기동 로그만 추가), 편집 경로에서 사전을 쓰는 코드는 아직 없다

**다음**: 스테이지별 `attempt` 와 해시 고정(kickoff §4) → 무효화 표 재작성(§5).

---

## 2026-08-20 (이어서) — 스테이지별 시드 — 재현과 "다시 생성"의 분리

editSpec v3 착수의 두 번째 단위. 계획은
[archive/edit-spec-v3-kickoff.md](./archive/edit-spec-v3-kickoff.md) §4.

**스테이지별 `attempt`** — `seed: { root, attempt: { <stage>: n } }` 로 재현과 "다시 생성"을 가른다. 스테이지
시드는 `sha256("{root}:{stage}:{attempt}")` 상위 8바이트 빅엔디언이며 알고리즘·템플릿·바이트 수·바이트 순서까지
사전에 뒀다. `root` 상한은 `Number.MAX_SAFE_INTEGER` 로 강제한다(넘으면 JavaScript 가 반올림해 API 와 워커의
`root` 가 에러 없이 달라진다). 전역 `attempt` 와 파이썬 `hash()` 를 쓰지 않는 근거는
[decisions/edit-spec-v3.md](./decisions/edit-spec-v3.md) §5.

**스테이지 이름을 닫힌 집합으로** — `packages/shared-types/src/stage-vocabulary.json`
- 열린 문자열이면 `attempt: {"style-directr": 2}` 같은 오타가 조용히 통과한다. 그 디렉터는
  `attempt=0` 을 보고, 사용자는 "다시 생성"을 눌렀는데 아무 일도 안 일어나며, 에러도 안 남는다
- 시드를 쓰는 것은 **디렉터 셋뿐**이다. 리더는 MediaPipe·VAD 라 결정적이고 `semantic-reader` 는
  결과가 `analysisVersion` 으로 핀되므로 다시 돌리지 않는다. 리더에 `attempt` 를 붙이면 거부한다
- 커밋 1의 앵커 사전과 같은 패턴이라 로더를 `pipeline/vocabulary.py` 로 뽑았다. Dockerfile 의
  COPY 도 `*-vocabulary.json` 으로 넓혀 사전이 늘어도 안 고친다

**TS·Python 검증이 갈라진 것을 테스트가 잡았다**
- `isValidSeed({ root: 7, attempt: [] })` 가 통과했다 — `Object.entries([])` 가 빈 배열이라
  `.every()` 가 참이 된다. 워커의 `parse_seed` 는 dict 만 받으므로 **API 가 통과시킨 스펙을
  워커가 거부하는** 상태였다. `Array.isArray` 를 막아 고쳤다
- 파생 함수 자체는 TS 에 없다. API 는 `root` 를 쓰고 `attempt` 를 올릴 뿐 파생값을 소비하지
  않는다 — `anchor.py` 의 파생 공식과 같은 구조이고, 골든 픽스처가 계약이다

**검증**
- 워커: `python3.11 -m unittest discover -s tests` — **97 테스트 통과**(신규 `test_seed.py` 17개).
  골든 27케이스(`root` 3종 × 디렉터 3종 × `attempt` 3종) 외에 **`PYTHONHASHSEED` 를 0·1·12345 로
  바꿔 별도 프로세스로 돌려 같은 값이 나오는지**를 테스트가 직접 확인한다. 골든 값만으로는
  한 프로세스 안에서 `hash()` 도 일관되므로 통과해 버린다
- API: `npm test -w apps/api` — 22 파일 **295 테스트 통과**(신규 `stage-vocabulary.test.ts` 16개).
  `npm run lint` · `npm run typecheck` 통과
- 도커: 와일드카드 COPY 로 사전 2개가 이미지에 들어가고, ① 편집 워커가 둘 다 읽으며
  ② **스테이지 사전만 지워도 편집 워커가 기동 실패**하고 ③ 사전을 전부 지워도 **분석 워커는
  정상 기동**(`sys.modules` 에 `pipeline.seed` 없음)한다
- 기동 로그를 `anchor=v1 derivation=v1 stage=v1` 로 확장했다

**다음**: 무효화 표 재작성(kickoff §5) — kickoff 의 결정 A-2·A-5·B-6 을 한 표가 흡수한다.

---

## 2026-08-20 (이어서) — 재생성 무효화 규칙 — 표가 아니라 데이터로

editSpec v3 착수의 세 번째 단위이자 이 계획의 중심 산출물. 계획은
[archive/edit-spec-v3-kickoff.md](./archive/edit-spec-v3-kickoff.md) §5.

**표를 문서에 두지 않았다**
- 무효화 규칙은 구현이 참조하는 계약이다. 문서의 표는 구현과 갈라지고, **갈라진 것을 아무도
  모른다.** 원본은 [`invalidation-vocabulary.json`](../packages/shared-types/src/invalidation-vocabulary.json)
  하나이고 TS·워커가 같은 파일을 읽는다. 앞 두 커밋의 사전과 같은 구조다
- 레이어 상태는 셋(`invalidated` · `retimed` · `preserved`)이고, 액션마다 **모든 레이어**의 상태를
  적는다 — 사전에 없는 조합은 기본값이 아니라 예외다. 액션·레이어 목록과 셀 단위 판단(`note`)은
  사전이 원천이므로 여기에 표로 옮기지 않는다. 판단의 근거는
  [kickoff §5](./archive/edit-spec-v3-kickoff.md)

**검증**
- 워커: **118 테스트 통과**(신규 `test_invalidation.py` 21개). 액션 × 레이어 판단이 하나도 빠지지 않았는지,
  `attemptBump` 가 스테이지 사전과 맞는지(리더를 지목하면 워커의 `parse_seed` 가 그 스펙을 거부해
  **액션 자체가 실행 불가**가 된다), 만료 재생성이 시드를 하나도 바꾸지 않는지
- API: 23 파일 **315 테스트 통과**(신규 `invalidation.test.ts` 20개). `lint`·`typecheck` 통과
- 도커: **Dockerfile 을 안 고쳤다.** 커밋 2 에서 COPY 를 `*-vocabulary.json` 으로 넓혀 둔 덕에
  셋째 사전이 그대로 들어갔다. 무효화 사전만 지우면 편집 워커가 기동 실패하고 분석 워커는
  정상 기동하는 것까지 확인
- 기동 로그: `anchor=v1 derivation=v1 stage=v1 invalidation=v1`

**커밋 2 와 같은 누락이 또 나왔다.** 새 사전을 만들어도 `worker.py` 가 그 모듈을 임포트하지
않으면 기동 시 검증되지 않는다 — 테스트는 전부 초록인데 컨테이너에서 사전을 지워도 워커가 떴다.
**사전을 추가할 때마다 `worker.py` 임포트와 기동 로그를 같이 늘려야 한다.**

**남은 것**: 두 초안의 잔여 개정(kickoff §6)은 [backlog.md](./backlog.md) A-7 이 맡는다.

---

## 2026-08-20 (이어서) — 사전 기동 검증을 기계가 하게

커밋 2·3 에서 **연속으로 같은 것을 빠뜨렸다.** 새 사전을 만들고 `worker.py` 가 그 모듈을
임포트하지 않으면 기동 시 검증이 일어나지 않는다 — 테스트는 전부 초록인데 컨테이너에서
사전을 지워도 워커가 떴다. 두 번 다 컨테이너 검증에서야 드러났다.

progress.md 에 주의를 적는 것으로는 세 번째를 못 막는다. E-6(낡은 Prisma 클라이언트)에서
"문서에 적힌 주의는 다음에도 같은 방식으로 실패한다"고 정리해 놓고 같은 방식을 쓸 뻔했다.

**디렉터리 스캔은 답이 아니다** — 스캔은 있는 파일을 찾지 **빠진 파일을 모른다.** 셋 중 하나가
이미지에 없으면 "둘 적재"로 조용히 성공한다. 부재를 감지하려면 기대 집합이 선언돼 있어야 한다.

**기대 집합을 저장소에 묶었다**
- `vocabulary.REQUIRED` 에 사전 목록을 두고, `tests/test_vocabulary.py` 가 이 목록을
  `packages/shared-types/src/*-vocabulary.json` **실제 파일 목록과 대조**한다. 사전을 새로
  만들면 `REQUIRED` 에 넣기 전까지 테스트가 실패한다
- `worker.py` 는 `vocabulary.verify_all()` 을 **한 번** 부른다. 목록에 들어가는 순간 기동 검증이
  자동으로 따라오므로 **사전이 넷째로 늘어도 `worker.py` 는 손대지 않는다** — 임포트 누락이라는
  실패 모드 자체가 사라진다
- 호출 위치는 `main()` 최상단이다. DB·Redis 를 건드리기 전에 멈춘다
- Dockerfile 의 와일드카드 COPY 가 지워지지 않았는지도 테스트가 본다

**검증**
- 워커 **124 테스트 통과**(신규 `test_vocabulary.py` 6개)
- 더미 `probe-vocabulary.json` 을 저장소에 넣어 **가드가 실제로 실패시키는지** 확인
- 컨테이너에서 무효화 사전만 지우고 `pipeline.invalidation` 을 **임포트하지 않은 채**
  `verify_all()` 을 불러 잡히는 것을 확인 — 이전 방식으로는 통과하던 경로다

**대비**: 같은 날 Dockerfile 와일드카드 COPY 는 셋째 사전을 아무 변경 없이 받아냈다.
한쪽은 기계가 막았고 한쪽은 문서가 못 막았다.

---

## 2026-08-20 (이어서) — `anchorAffinity` 검증 — `fallback` 과 정반대 규칙

매니페스트 개정에서 anchor 어휘 절의 값 테이블을 지우기로 하면서, 그 절이 **값 대신 무엇을
남겨야 하는지**를 정리하다 발견했다.

두 배열이 같은 `AnchorSpec` 을 담는데 규칙이 정반대다.

| 필드 | 규칙 |
|---|---|
| `fallback` (editSpec) | `drop` 으로 **끝나야** 한다 |
| `anchorAffinity` (매니페스트) | `drop` 을 **포함하면 안 된다** |

`drop` 은 "어디에도 못 붙이면 안 붙인다"는 폴백 종점이지 붙일 수 있는 자리가 아니다. 그런데
`isValidAnchor({kind:"drop"})` 는 **참**이므로, 전용 검증이 없으면 매니페스트에 들어가도
아무도 모른다 — 그 에셋은 "아무 데도 안 붙임"을 선호하는 팩 아이템이 된다.

`isValidAnchorAffinity()` 를 TS·워커 양쪽에 넣었다. 같은 배열이 한쪽에서는 통과하고 다른
쪽에서는 거부되는 것을 테스트가 한 줄로 고정한다.

**검증**: 워커 **125 테스트**, API **317 테스트** 통과. `lint`·`typecheck` 통과.

---

## 2026-09-02 — 모노레포 문서 정합성 및 모바일 의존성 단일화

분리 저장소 시절의 경로와 역할 설명을 현재 모노레포 구조에 맞춰 정리했다. 루트 문서 지도를
모바일 문서까지 확장하고, 환경변수·팀 소유권·API 계약·기능 상태 문서가 실제 코드와 같은 내용을
가리키도록 갱신했다. 완료된 IAP 전환 계획과 더 이상 현행 회의 입력으로 쓰지 않는 백엔드 결정
워크시트는 `docs/archive/`로 옮겼다.

계정 삭제 문서와 화면에 남아 있던 "구독 즉시 해지" 설명은 실제 서버 동작인 소셜·FCM 정리,
진행 중 작업 취소, 예약 크레딧 환급에 맞췄다. 영화 완료 알림과 위치 기반 추천 알림은 현재 구현
범위와 남은 실기기 검증을 구분해 기록했고, OpenAPI 스냅샷과 모바일 생성 타입도 다시 동기화했다.

모바일 타입 검증 실패는 루트와 `apps/mobile`에 서로 다른 React Native 타입이 설치된 것이
원인이었다. 루트 override로 Expo SDK 57 호환 버전인 `react-native@0.86.3`과
`@react-native/jest-preset@0.86.3`을 단일화하고 의존성을 dedupe했다. 화면 코드에 타입 단언을
추가하지 않고 `app-tabs.tsx`의 `PressableProps` 충돌을 제거했다.

**검증**
- `npm run verify:mobile`: **123 suites, 943 tests 통과**, format·lint·typecheck·API 스냅샷 검사 통과
  (`notification-settings-store.ts`의 기존 미사용 값 경고 1건은 유지)
- `npm test -w apps/api`: Vitest **23 files, 319 tests 통과**, 스토리지 Node 테스트 1건 통과
- `npm run typecheck -w apps/api`, `npm run lint -w apps/api`, `git diff --check` 통과
- 루트·`docs/`·모바일 문서 **77개**의 로컬 Markdown 링크 검사 통과

---

## 2026-09-05 — API 계약을 스키마 우선으로 — Zod 계약 패키지

**배경**: 한 엔드포인트의 계약이 여섯 곳(shared-types 타입, 수기 JSON 스키마, 라우트 요청 인터페이스,
모바일의 OpenAPI 스냅샷·생성 타입, 모바일 Zod, `api-spec.md`)에 손으로 적혀 있었고 어느 둘의 일치도
검사되지 않았다. 모바일 스냅샷은 실행 중인 서버를 curl 해 갱신했다. 결정과 기각한 대안은
[decisions/api-contract-schema-first.md](./decisions/api-contract-schema-first.md).

**구현** (5단계, 각각 독립 검증):

1. **Fastify 5** — `fastify@5.12`, `@fastify/rate-limit@11`, `@fastify/swagger@9`, `@fastify/swagger-ui@6`,
   `@fastify/websocket@11`, `fastify-plugin@5`. 코드 변경은 WebSocket 핸들러 시그니처(`(socket, req)`),
   `setErrorHandler<FastifyError>`, `decorateRequest('user')` 세 곳. swagger 9 는 body 있는 라우트의
   `requestBody.required: true` 를 내기 시작했다(정확해진 것).
2. **계약 패키지** — `packages/shared-types/src/contract/` 에 Zod 스키마·`defineRoute`·레지스트리
   `apiContract`(35 라우트). `apps/api/src/schemas/responses.ts`(770줄)와 라우트의 요청 인터페이스 12개,
   `domain.ts`·`api.ts` 의 수기 타입을 삭제하고 `z.infer` 로 대체. 백엔드는 `fastify-type-provider-zod@7`로
   검증·직렬화·OpenAPI 변환. `CREDIT_REASON`·`MAX_CANDIDATES` 같은 계약 상수는 패키지로 옮기고
   서비스는 다시 내보낸다.
   - 드러난 불일치(계약을 실제 의도에 맞춤): `POST /sns/{platform}/upload` 의 `status` 가 `success` 만
     허용돼 있었고 `api-spec.md` 가 안내하는 `requiresUserAction` 은 스키마에 없어 **앱에 도달한 적이
     없었다**. `GET /billing/credits` 의 `entries[].reason` 이 DTO 에서 `string` 이었다. SNS 라우트는
     플랫폼별 리터럴 8개에서 `{platform}` 파라미터 4개로.
   - Zod 직렬화는 `additionalProperties: false` 처럼 미선언 필드를 지우되, 계약과 어긋난 응답은
     `500 FST_ERR_RESPONSE_SERIALIZATION` 으로 드러낸다.
3. **OpenAPI 스냅샷** — `buildApp(config, { docs })` 오버라이드로 서버·DB 없이 문서를 만드는
   `src/openapi.ts`, `npm run openapi:write|check -w apps/api`, `test/openapi-snapshot.test.ts`.
   스펙 파일은 `apps/api/openapi.json` 하나(2칸 들여쓰기)로 옮겼다.
4. **모바일** — `apiRequest`·`apiPath` 가 `apiContract` **타입 전용 import** 에서 경로·메서드·query·body·
   응답 `data` 타입을 유도. `openapi-typescript`, `schema.d.ts`(5,300줄), `api:pull`/`api:gen`/`api:check`,
   `.gitattributes` 제거. `verify` 는 `contract:build` 를 먼저 실행하고 루트 `dev:mobile` 도 빌드 후 Metro.
   기존 `@ts-expect-error` 계약 테스트 7건은 그대로 통과. `docs/workflows/openapi-api-integration.md` →
   `api-contract-integration.md`.
5. **`api-spec.md`** — 599줄에서 필드 형태 서술을 걷어내고 "FE 가 다뤄야 할 동작 + WebSocket" 만 남겼다.
   WebSocket 메시지 계약은 `editProgressEventSchema` 가 원천.

**검증**
- `npm test -- --filter=@vlog-studio/api` — 24 파일 321 테스트 통과(스냅샷 테스트 2건 신규), API typecheck·lint 통과
- `npm run openapi:check -w apps/api` — 최신
- `npm run verify:mobile` — contract:build → format → lint(기존 경고 1) → typecheck → jest 통과
- 1단계 직후 Fastify 5 에서 생성한 스펙과 기존 스냅샷을 대조해 `PATCH /auth/me` 의 `requestBody.required` 외
  차이가 없음을 확인했다

**남은 것**: [backlog.md](./backlog.md) B-5 후속 — 엔티티 경계 Zod 를 계약 스키마의 파생으로(런타임 import 의
Metro/Jest 해석 확인 필요), `openapi.json` 의 `*Input` 사본 스키마.

---

## 2026-09-09 — 촬영 시각 저장 · 무비 서버 엔티티 (Dev A)

생애주기 결정 세 축이 닫히면서([backlog.md](./backlog.md) A-1) 막혀 있던 구현이 풀렸다.
착수 계획은 [archive/lifecycle-alignment.md](./archive/lifecycle-alignment.md).

### 1. `capturedAt` 서버 저장 (SNAP-10 `구현됨`)

앱은 촬영 시각을 갖고 있었지만 보내지 않아 서버는 업로드 시각만 알았고, 시간 기준 정렬이
전송 순서 정렬이 되고 있었다. `POST /videos` 요청에 실어 보내 `videos.captured_at` 에 저장한다.

**서버가 소급할 수 없는 값**이라 컬럼은 nullable 이고, 전달 이전에 올라온 행은 업로드 시각으로
백필하지 않는다(틀린 값이 원천이 된다) — 읽는 쪽이 `createdAt` 으로 폴백한다.

- 검증: 아이폰 클립(`creation_time` 2026-08-04T09:14:46Z)을 로컬 MinIO 에 올려 등록 → 조회까지
  같은 시각으로 왕복 확인. 계약 테스트 5건 신설, 모바일 943 통과
- Supabase 가 일시정지 상태라 `npm run auth:stub` 으로 인증을 대신했다

### 2. 낡은 Prisma 클라이언트 프리체크 (E-6 닫힘)

스키마 변경을 pull 하고 `db:generate` 를 빼먹으면 무관해 보이는 실패가 무더기로 났다(08-20 에
72건). 이제 테스트 global setup 이 스키마와 생성물의 스키마 사본을 대조해 **한 줄로 멈추고
해결 방법을 알려준다.** 사본은 정렬만 다시 맞춘 판본이라 공백을 정규화해 비교한다.

### 3. 무비(프로젝트) 서버 엔티티 — A-1 본체

무비가 앱 로컬에만 있어 기기를 바꾸면 사라졌고, 서버는 프로젝트의 존재를 몰랐다.

- **스키마**: `movies` · `movie_clips` + RLS 정책. 컷은 스냅을 **참조**만 하므로 한 스냅을 여러
  무비가 다르게 쓰고, 무비를 지워도 스냅은 남는다. `result_video_id` 하나로 살아 있는 결과물을
  가리키고(교체, 누적 아님), `finished_at` 이 "사용자가 가져갔다"를 기록한다
- **계약·API**: `contract/movies.ts` + 6개 엔드포인트(생성·목록·상세·수정·삭제·내보내기·끝내기).
  **내보내기는 기존 편집 엔진을 그대로 재사용**한다 — 워커·파이프라인 무변경
- **순서**: 배열 순서가 곧 재생 순서다(`order` 필드를 응답에 두지 않아 두 표현이 어긋날 수 없다).
  `arranger` 가 순서의 주인이며 `ai` 일 때만 촬영 시각 순으로 정렬한다
- **사라진 스냅**: 컷을 빼지 않고 `unavailable` 로 표시한다 — 무비는 열려야 하고 사용자가
  무엇을 잃었는지 알아야 한다(SNAP-12). 그 상태로 내보내면 400
- **끝내기**: 결과물 파일을 지우고 무비는 남긴다. 다시 만들기는 새 생성이라 크레딧 100 을 다시 낸다

**구현 중 잡은 결함**: 워커는 무비를 모르므로 생성이 끝나도 무비가 `generating` 에 갇혀
수정·끝내기가 영원히 409 였다. 읽는 시점에 편집 작업을 보고 따라잡되 `updatedAt` 은 건드리지
않는다(스튜디오 보드의 정렬 기준이라 조회가 목록 순서를 바꾸면 안 된다).

**검증**: API 26 파일 349 테스트 통과(무비 23건 신설), typecheck·lint·OpenAPI 스냅샷 최신.

**남은 것**: 앱 전환(무비를 서버 쿼리로), 끝내기 호출 붙이기, e2e 갱신 — [backlog.md](./backlog.md) A-1.

---

## 2026-09-09 (이어서) — 보관 기간 만료 정리 배치 (Dev A)

결정된 보관 정책(스냅 15일 · 무비 결과물 30일)이 코드가 됐다. 세 정리 경로가 한 배치로 묶인다:
`npm run media:purge-expired -w apps/api` (dry-run 기본, `--yes` 실삭제 — `accounts:purge` 와 동일).

1. **스냅 원본** — 업로드 후 15일(SNAP-9)
2. **끝내지 않은 무비 결과물** — 생성 후 30일(MOV-16). 끝낸 것은 그때 이미 사라졌다
3. **남은 S3 객체** — 삭제가 스토리지 실패로 반쯤 끝난 행 회수(backlog E-3 닫힘)

**설계에서 지킨 두 가지**

- **만료는 유도한다.** 어떤 행도 "언제 만료된다"를 들고 있지 않고, 업로드·생성 시각과 현재
  정책 값(`services/retention-policy.ts`)으로 매번 계산한다. 구독이 사용자별로 다른 기간을
  팔기 시작해도 백필이 없다
- **삭제는 파일만, 행은 툼스톤으로 남긴다.** 그래야 사용자가 무엇을 잃었는지 알고, 그 스냅을
  참조하던 무비가 컷 하나를 `unavailable` 로 표시한 채 열린다. `사용자 삭제`와 `기간 만료`를
  `removal_reason` 으로 구분하고, `purged_at` 은 "일어난 사실"만 기록한다

**만료 → 실삭제 2단계**를 구조로 두되 간격은 **0**이다. 스냅 원본은 재생성이 불가능해서 파일을
지운 뒤에는 어떤 요금제로도 복구할 수 없으므로, 나중에 복구를 팔면 이 값만 늘리면 된다.

**검증**: API 27 파일 358 테스트(만료 9건 신설), dry-run 실행 확인, typecheck·lint 통과.

**앱에 넘긴 것**: [mobile-handover-lifecycle.md](./archive/mobile-handover-lifecycle.md) —
무비 서버 전환·만료 표시·끝내기 버튼과 그 계약. 백로그 항목에 `앱`/`서버` 라벨을 달았다.

---

## 2026-09-09 (이어서) — 배포 렌디션 워커 (Dev A)

서버 원천 전환 2단계([decisions/snap-source-of-truth.md](./decisions/snap-source-of-truth.md) §5).
아이폰 원본은 HEVC·종종 HDR 이라 다른 플랫폼에서 재생되지 않을 수 있어, 업로드가 확정되면
**H.264/SDR 사본**을 만든다. 원본은 지우지 않는다 — 편집은 계속 원본을 쓴다.

- **세 번째 워커 프로세스**(`npm run worker:rendition`, compose `rendition-worker`). 편집·분석
  워커와 같은 이미지에 커맨드만 다르다. 적재는 `POST /videos` 가 한다
- **계약**: `Video.playbackUrl`(시한부 URL, 없으면 `originalUrls` 폴백) · `durationMs`(FFprobe 실측)
- **실패는 치명적이지 않다** — 렌디션이 없으면 일부 플랫폼에서 재생이 안 될 뿐이라 `videos.status`
  를 건드리지 않고, 큐 적재 실패도 삼킨다(파일은 이미 올라갔고 스냅은 쓸 수 있다). 변환 자체가
  안 되는 파일은 재시도하지 않는다 — 다음에도 같은 결과다
- **HDR 은 `zscale` 톤매핑 대신 `format=yuv420p` 강제 변환**으로 떨어뜨린다. zscale 이 없는
  ffmpeg 빌드가 흔해서다. HDR 원본이 다소 어두워질 수 있지만 재생되지 않는 것보다 낫다 —
  정밀 톤매핑은 A-7 렌더 파이프라인의 몫
  → 대체: 2026-09-15 "스트레스 실검증과 HDR 색 태그 결함" — `zscale` 이 있으면 톤매핑하고,
  어느 경로든 색 태그를 bt709 로 적는다
- 기존 스냅은 마이그레이션에서 `skipped` 로 표시했다. 소급 변환하지 않으며, `pending` 으로
  두면 있지도 않은 밀린 작업처럼 보인다

**검증**: 합성 HEVC(1080×1920) 업로드 → 큐 → 변환 → `playbackUrl` 발급까지 로컬 MinIO 로 확인.
결과물은 h264 High/yuv420p 이고 `moov` 가 `mdat` 앞에 있다(faststart). API 358 테스트 통과.

**FE 에 열린 것**: 3단계(reconcile)의 선행 조건이 풀렸다 —
[mobile-handover-lifecycle.md](./archive/mobile-handover-lifecycle.md).

---

## 2026-09-09 (이어서) — SNS 게시 자동 끝내기 · 만료 예고 알림 (Dev A)

**SNS 게시가 성공하면 그 결과물을 쓰던 무비를 자동으로 끝낸다.** 다운로드 경로는 시스템 공유
시트가 저장 여부를 알려주지 않아 사용자의 명시적 행동을 받아야 하지만, 게시는 **서버가
플랫폼의 성공 응답을 직접 봤으므로** 추측이 아니다. `finishMovie` 의 본체를 `applyFinish` 로
뽑아 두 진입점이 나눠 쓴다. 틱톡의 `pending`(PULL_FROM_URL)은 제외한다 — 플랫폼이 나중에
영상을 가져가므로 지금 지우면 가져갈 대상이 사라진다. 자동 끝내기가 실패해도 게시는 성공으로
보고한다(이미 성공했고 `sns_uploads` 에 남았다).

**만료 예고 알림**(SNAP-13)이 서버에서 나간다: 삭제 **D-3 · D-1** 두 번, **KST 오전 10시**에
도는 별도 배치 `npm run media:notify-expiring -w apps/api` (dry-run 기본, `--yes` 발송).
값과 근거는 [decisions/expiry-notice-schedule.md](decisions/expiry-notice-schedule.md).

정리 배치와 **일부러 분리했다** — 이유는 결정 문서의 "발송 시각" 절.

`notification_logs` 가 geofence 전용을 벗어났다(`NotificationKind` + nullable `location_id`).
발송보다 **먼저 행을 선점**하고 실패하면 되돌리며, `@@unique([userId, videoId, noticeDaysBefore])`
가 중복을 DB 에서 막는다. **dry-run 은 발송으로 치지 않는다**(이유는 같은 결정 문서 "함께 정한 것").

검증: `npm test -w apps/api` 374건 통과(만료 예고 13건 신규 · SNS 자동 끝내기 3건 신규).

---

## 2026-09-11 — 이미지 스모크 검사 · e2e 무비 경로 전환 (Dev A)

**빌드한 이미지가 실제로 뜨는지 CI 가 확인한다**(backlog E-4 닫힘). `deploy.yml` 이
**빌드 → 스모크 → 푸시** 순서가 됐고, 검사한 그 이미지에 태그만 붙여 올린다 — 다시 빌드하면
검사 대상과 배포 대상이 갈라진다. 전에는 Dockerfile 이 깨져도 CI 가 초록이었고 실행되지 않는
이미지가 `:latest` 로 올라갔다(실제로 두 번: BGM 자산 누락, `BGM_DIR` 경로 어긋남).

검사는 [`scripts/smoke-images.sh`](../scripts/smoke-images.sh) 하나이고 로컬에서도 같은 명령으로
돈다(`npm run smoke:images`). API 는 compose 로 실제 기동해 `/health` 가 `db=connected` 를
돌려주는지 본다 — `status:ok` 만 보면 마이그레이션이 실패해도 통과한다. 워커는 이미지가 커서
기동 대신 정적 검사(BGM 자산·ffmpeg/ffprobe·워커 3종 임포트)를 하는데, **경로를 스크립트에
다시 적지 않고 `config.BGM_DIR` 에서 읽는다** — 다시 적으면 config 와 어긋나도 통과하고,
과거 결함이 정확히 그렇게 숨었다.

검증: 로컬에서 두 이미지를 빌드해 스모크 통과(`db=connected` 확인). `BGM_DIR` 을 일부러
어긋나게 준 실행이 exit 1 로 떨어지는 것까지 확인했다 — 통과만 하는 검사가 아니다.

**`media:e2e` 가 앱과 같은 길을 간다**: `POST /movies` → `POST /movies/{id}/export` → 편집 작업
폴링 → 무비에서 결과물 찾기. 옛 `POST /edit-jobs` 직접 호출은 한 릴리스 더 살아 있지만
(backlog A-1), 검증이 앱이 가지 않는 길을 확인하면 의미가 없다. 무비 상태가 `ready` 로
반영됐는지까지 함께 본다.

**같은 날, `S3_PUBLIC_ENDPOINT` 기동 경고**(backlog E-2 닫힘). SNS 는 우리가 준 URL 을 플랫폼이
직접 내려받으므로, 도달할 수 없는 주소면 **업로드를 시도해야 비로소 400** 이 난다 — 실패 시점이
설정 시점에서 멀어 "SNS 가 안 된다" 는 신고를 받고 나서야 설정을 본다. `snsUploadReadiness()` 가
기동 때 판정해 이유와 함께 한 줄 남긴다. 미설정만 보는 대신 **업로드 때와 같은 기준**을 쓴다 —
값이 있어도 `localhost` 나 사설 IP, http 면 결과는 같기 때문이다. 전부 mock 이면 경고하지 않는다.

---

## 2026-09-11 (이어서) — 무비 완성 알림의 서버 전환 (Dev A)

완료 알림이 앱의 로컬 알림에서 **서버 푸시**로 옮겨졌다. 발송 주체가 결정 사항이었고
([decisions/movie-ready-notification.md](decisions/movie-ready-notification.md)),
**편집 워커(Python)가 큐에 넣고 Node 쪽 전용 워커가 꺼내 보낸다.**

워커가 FCM 을 직접 부르지 않는 이유, pub/sub 대신 큐인 이유, API 프로세스 밖에 두는 이유는 결정 문서에 있다.
조용한 시간대 판정은 [`lib/quiet-hours.ts`](../apps/api/src/lib/quiet-hours.ts) 로 뽑아 장소 추천과
나눠 쓴다. 완성 알림은 조용한 시간대면 **버린다**.

검증: `npm test -w apps/api` 387건 통과(완성 알림 7건 신규). **Python 이 넣은 작업을 Node 가
실제로 꺼내는지** 로컬 Redis 로 확인했다 — 라이브러리가 갈라지면 테스트가 전부 초록인 채
알림만 도착하지 않는다.

---

## 2026-09-12 — 촬영 스냅 해상도 하드코딩 해소 (Dev A 트랙, 앱)

백로그 A-4 의 앱 선행 과제. 촬영 스냅은 카메라가 720p 로 찍는데도 `1080×1920` 세로 스탠드인을
치수로 저장했고, 가로로 든 폰의 촬영도 세로로 기록됐다. 기기 안에서는 참아졌지만 **서버가
원천이 된 뒤에는 스탠드인과 실측을 구분할 수 없어 백필이 불가능**하다 — 그래서 무비 서버 전환(A-1)
보다 먼저 닦았다.

**측정 경로**: `expo-video` 는 iOS `naturalSize`·Android `Format.width/height` 를 그대로 넘겨
**회전 플래그를 반영하지 않는다**(세로 촬영이 가로 치수로 읽힘). 대신 이미 추출 스냅이 쓰던
네이티브 `VideoTrim` 모듈의 회전 반영 읽기를 `probe(uri)` 로 분리해 노출했다(Swift·Kotlin 양쪽,
`trim` 의 출력 기술과 같은 코드). 앱 쪽은 `shared/lib/video-metadata` 가 네이티브 probe →
`expo-video` 길이 폴백으로 `{ durationSec, width, height }` 를 한 번에 돌려준다. Expo Go 처럼
모듈이 없는 곳에서는 길이만 측정되고 치수는 스탠드인으로 남는다.

**모델**: `Snap.dimensionsMeasured` 플래그를 `durationMeasured` 와 같은 꼴로 추가했다.
스탠드인은 **플래그 없이만** 기록되므로 나중에 `POST /videos` 에 치수를 실을 때 스탠드인을
실측처럼 보내는 일이 없다. `orientationOf`·`SNAP_STAND_IN_SIZE` 는 두 feature 에 중복돼 있던 것을
`entities/snap` 으로 올렸다. 스토어 액션은 `setMeasuredDuration` → `recordMeasurement`(길이·치수
각각 독립 보정, 변화 없으면 같은 객체 반환)로 일반화했고, 시작 시 백필도
`SnapDurationBackfill` → `SnapMetadataBackfill` 로 확장해 기존 라이브러리의 스탠드인을 고친다.

**서버 계약은 건드리지 않았다** — `createVideoBodySchema` 와 `Video` 모델에 치수 컬럼이 없다.
치수를 서버에 싣는 시점은 A-4 3단계(reconcile) 설계에서 정한다.

검증: `npm run verify:mobile` 통과 — 124 스위트 963건(신규: `video-metadata` 6건, `probeVideo` 4건,
스토어 보정 8건, 촬영·추출 치수 케이스). Swift 는 `swiftc -parse` 로 구문만 확인했고
**Kotlin 은 컴파일하지 않았다.** 네이티브 변경이라 dev build 재빌드가 필요하며, **실기기(Android)
검증은 아직이다** — 세로·가로 촬영 각각 저장된 `width/height/orientation` 과 기존 스냅의 백필을
확인해야 닫힌다. iOS 는 기기가 없어 미검증.

---

## 2026-09-12 (이어서) — 알림 탭 라우팅 · 무비 서버 전환 계획 (Dev A 트랙, 앱)

백로그 A-1 의 앱 항목 "푸시 탭 라우팅" 을 구현했다. `shared/lib/notifications` 에 탭 채널 어댑터를
추가하고(FCM `onNotificationOpenedApp`·`getInitialNotification`, expo-notifications 응답 리스너·
`getLastNotificationResponseAsync`), `_app/providers/notification-tap-router.tsx` 가 두 채널을 한 번씩
듣고 시작 시 각각 "앱을 연 탭"을 묻는다. 목적지는 순수 함수 `notificationTarget` 이 `kind` 로 정한다 —
`movie_ready`·`movie_failed` 는 그 무비, `snap_expiry` 는 라이브러리(SNAP-13). 네비게이터와 로그인이
준비되기 전에 온 탭은 보류하고 준비되는 순간 보낸다(cold start). 같은 탭이 두 채널로 오면 한 번만
움직인다(id 기억 + 같은 목적지 2초 창). 앱의 로컬 알림 데이터도 서버와 같은 `kind` 꼴로 바꿨다.

**정정한 사실**: 백로그가 "완료 알림이 두 번 온다"고 적었지만, 서버의 `notifyMovieReady` 는 결과물이
속한 서버 `Movie` 가 없으면(`no_movie`) 보내지 않고 앱은 아직 `POST /edit-jobs` 를 직접 쓴다 —
**지금은 서버 완성 푸시가 오지 않는다.** 로컬 알림 제거는 export 전환과 같은 변경에서 해야 한다.
같은 조사에서 `PATCH /auth/me` 가 `notificationEnabled` 를 받지 않아 앱 스위치가 서버 발송에 닿지
않는 틈을 찾아 B-6 으로 올렸다(스키마·라우트가 공동 소유).

**무비 서버 전환은 착수하지 않고 계획으로 남겼다**([archive/movie-server-transition.md](archive/movie-server-transition.md)).
34개 파일이 `entities/movie` 에 의존하고, 업로드 전 스냅을 담은 초안의 자리·진행 중 jobId 복구·
실패 안내 세 가지가 구조를 갈라 결정 없이 진행하면 되돌릴 비용이 크다. 훅 계약을 유지하는
"서버 캐시 + 아웃박스" 설계를 권했다.

검증: `npm run verify:mobile` 통과 — 126 스위트 981건(신규: 목적지 매핑 9건, 탭 라우터 9건).
**실기기 미검증** — Android 에서 FCM 과 expo-notifications 가 같은 탭을 둘 다 보고하는지, cold start
에서 무비까지 도달하는지 확인해야 닫힌다.

---

## 2026-09-12 (이어서) — 무비 서버 전환 · 끝내기 · 완료 알림 정리 (Dev A 트랙, 앱 + API)

권장안이 승인되어 [archive/movie-server-transition.md](archive/movie-server-transition.md) 의 순서대로
구현했다. 결정과 기각 대안은 [decisions/movie-client-cache.md](decisions/movie-client-cache.md).

**API(계약 변경 3건 + 보정 1건)**: `Movie.jobId` 노출(목록은 결과물 id 를 모아 한 번에 조회) ·
`POST /movies` 의 `id`(앱이 정한 uuid, 같은 id 재전송은 멱등, 타인 id 는 409) · `PATCH` 의 `clips: []` 허용
(마지막 스냅을 지운 무비도 초안으로 남는다) · 취소된 작업은 읽기 시 `draft` 로 보정하고 결과물 포인터를
비운다(전에는 `failed`). OpenAPI 재생성, [api-spec.md](api-spec.md) 갱신. 테스트 394건 통과.

**앱 — 엔티티**: `entities/movie` 스토어를 서버 무비의 **캐시 + 아웃박스**로 바꿨다. 훅 계약을 유지해 34개
소비자 파일은 그대로다. 로컬 쓰기는 `pending`(`create`/`update`)·버전을 남기고, 삭제는 `pendingDeletes` 로.
`api/movie.dto.ts`(양방향 매퍼 — 스타일↔프리셋, 트림 ms, `videoId`↔`snapId` 는 주입된 리졸버) ·
`api/get-movies.ts`(전 페이지) · `api/write-movie.ts`(create/update/delete/export/finish) ·
`api/mock-movies.ts`(인메모리 목 서버) · `lib/movie-sync.ts`(순수 병합: pending 은 로컬, 나머지는 서버,
이 기기만 아는 렌더·진행률·실패 문구는 같은 결과물일 때 유지, 본 적 없는 결과물은 `adopted` 작업으로 러너에
넘김, `settledJobId` 로 재채택 방지). 무비 id 는 `shared/lib/uuid`. `SnapRef` 에 `videoId`·`unavailable`,
`Movie` 에 `finishedAt`·`settledJobId`, `MovieJob` 에 `adopted`. 기존 로컬 무비는 스토어 v1 마이그레이션이
비운다(이관 안 함, 결정 그대로). 자막 기본값을 서버와 같이 `false` 로(MOV-9).

**앱 — 기능**: `features/compose-movie` 에 `MovieSyncGate`(`use-movie-sync.ts`: 로그인·포그라운드 복귀 시
읽기, 아웃박스·업로드 상태 변화 시 드레인; `movie-outbox.ts`: 무비 하나 전송, 스냅 리졸버) 추가.
`startGeneration` 은 아웃박스를 먼저 보낸 뒤 `POST /movies/{id}/export`. `create-edit-job.ts` 삭제.
러너는 `completeMovieJob`(개명) 을 쓰고 **완료 알림을 띄우지 않는다** — 서버 푸시가 대신한다; 실패 알림만
로컬로 남기며 `adopted` 작업의 실패는 알리지 않는다. 새 기능 `features/finish-movie`(끝내기: 서버 먼저,
스토어는 응답에 따름; 확인 시트 문구). 화면: ⋯ 시트에 끝내기 단계, 공유 시트가 올라온 뒤(`useShareMovie.offered`)
감상 화면에 끝내기 안내, 타임라인에 만료 컷 "만료" 배지(삭제된 원본과 문구 구분). 앱 프로바이더에
`MovieSyncGate` 마운트.

**문서**: 모바일 기능 문서 7개(movie.md 에 "Movies live on the server"·"Finishing it" 절), specs
MOV-2·17·18·19·NTF-6·SNAP-12 상태, decisions README, 인수인계·계획 문서 archive 이동, backlog A-1 정리.

**검증**: `npm run verify:mobile` 통과 — 128 스위트 1,016건(신규: 병합 17건, 스토어 아웃박스 14건, 끝내기 4건,
uuid 3건, 컴포즈·러너 갱신). API 394건. **실기기 미검증** — 여섯 가지 확인 항목은 backlog A-1.

---

## 2026-09-15 — 알림 설정이 서버에 닿는다 (Dev A)

**사용자가 끈 알림을 서버가 계속 보내고 있었다**(backlog B-6 의 서버 쪽을 닫았다 — 앱 쪽은 남음) —
서버 발송 세 종류가 `notificationEnabled` 하나로만 판정되는데 `PATCH /auth/me` 가 그 필드를 받지 않았다.
이제 `PATCH /auth/me` 가 `notificationEnabled`(전체) · `locationNotificationEnabled` ·
`movieNotificationEnabled` · `quietStart` · `quietEnd` 를 받고, 만료 예고는 전체 스위치만 따른다. 종류별로
나눈 이유와 만료 예고만 예외인 이유는 [decisions/notification-preferences.md](decisions/notification-preferences.md).

검증: `npm test -w apps/api` 403건 통과(신규 9건 — 저장·부분 수정·기본값·범위 검증과, 종류별
스위치가 서로 간섭하지 않는 것, 그리고 **무비·위치를 꺼도 만료 예고는 나간다**는 것).

---

## 2026-09-15 (이어서) — 만료 시각을 모르는 SNS 연동 (Dev A)

`token_expires_at = null` 인 연동(개인 계정 시절 장기 토큰 교환이 실패해 생긴 상태)은 지금까지
만료 검사도 갱신도 없이 그냥 쓰였다. 그러면 그 토큰은 **조용히 만료되고**, 그 뒤 게시는 우리 쪽
"재연동 안내" 가 아니라 플랫폼 에러로 실패해 사용자가 원인을 알 수 없다(backlog E-1 코드 쪽 닫힘).

**가짜 만료값을 넣지 않았다.** 지어낸 값은 멀쩡한 토큰에 "재연동 필요" 를 띄우고, 그쪽이 더 나쁘다.
대신 **업로드 때 갱신을 한 번 시도해 진짜 값을 알아낸다** — 성공하면 데이터가 실제로 고쳐지고,
실패하면 오늘과 똑같이 현재 토큰으로 진행한다. 상태를 고치려다 되던 게시를 깨지 않는 것이 요점이다.

게시가 실패하면 재연동을 안내한다. 이 안내는 `AppError` 재던지기보다 **앞**에 두어야 한다 —
플랫폼 거절은 클라이언트가 이미 `AppError` 로 감싸 올리므로, 뒤에 두면 가장 흔한 경로가 안내를
받지 못한다(테스트를 쓰다가 실제로 이 순서 때문에 실패했다). 원인(플랫폼 응답)은 사후 추적에
필요하므로 지우지 않고 뒤에 덧붙인다.

`GET /sns/connections` 가 `tokenExpiresAt` 을 싣는다. **`null` 은 "모른다"** 이지 "만료되지
않는다" 가 아니며, 앱은 그 경우와 이미 지난 경우에 재연동을 안내할 수 있다.

검증: `npm test -w apps/api` 409건 통과(신규 6건). **남은 것은 운영 조치 하나** — 현재 저장된
인스타 연동을 재연동하면 장기 토큰이 발급돼 만료 시각이 채워진다([backlog.md](./backlog.md) G).

---

## 2026-09-15 (이어서) — 산출물 계약 테스트와 CI 의 ffmpeg (Dev A)

파이썬 테스트는 "ffmpeg 없이 돈다" 가 설계 원칙이라 **명령줄만** 검사해 왔다. 그 방식으로는
잡히지 않는 결함이 실제로 두 번 났다 — 쇼츠 앱인데 편집 결과가 **가로 1920x1080** 으로 나온 것,
배포본이 아이폰 원본 그대로라 다른 기기에서 재생되지 않은 것. 둘 다 명령줄은 멀쩡했다.

`tests/test_ffmpeg_contract.py` 가 진짜 ffmpeg 을 돌려 **파일**을 본다: 가로 입력을 넣어도
1080x1920 세로가 나오는지, H.264/yuv420p 인지, faststart 인지(moov 박스 위치를 직접 읽는다),
길이가 실측값인지, 세로 상한을 넘지 않고 작은 원본을 키우지도 않는지, 무음 원본도 변환되는지.
입력은 저장소에 두지 않고 `lavfi` 로 만든다 — 바이너리 픽스처는 커지고 썩는다.

**관행은 깨지 않았다.** ffmpeg 이 없으면 건너뛴다. 다만 CI 에서까지 조용히 건너뛰면 검사가
있으나 마나이므로 `REQUIRE_FFMPEG=1` 이면 건너뛰지 않고 **실패**하며, CI 가 그 값을 준다.

검증: 파이썬 134건 통과(신규 6건). **검사가 실제로 잡는지도 확인했다** — 기본 렌더 스펙을 일부러
가로로 되돌리자 `(1920, 1080) != (1080, 1920)` 으로 실패했다. 통과만 하는 검사는 검사가 아니다.

---

## 2026-09-15 (이어서) — 스트레스 실검증과 HDR 색 태그 결함 (Dev A)

실제 아이폰 영상(1080x1920 H.264 High **60fps**, 데이터 트랙 5개)으로 남은 스트레스 케이스를
검증했다(backlog F).

- **10클립 상한** — 43.5초 산출물, 1080x1920 세로, 60fps 원본이 30fps 로 정규화되고 데이터
  트랙은 떨어졌다. 정상
- **장시간** — 원본을 이어붙인 182초(358MB) 단일 클립. 업로드부터 완료까지 **96초**
  (`EDIT_TIMEOUT_SECONDS=600` 대비 여유). 산출물 182.13초. 정상

**HDR 에서 결함을 찾았다.** 편집 결과물과 배포 렌디션 **둘 다** 픽셀은 8bit 로 내려놓고 색
메타데이터를 `smpte2084`/`bt2020` 으로 남기고 있었다. 플레이어는 그 태그를 보고 이미 평평해진
영상에 **HDR 톤매핑을 한 번 더** 건다 — 코드 주석이 예상한 "다소 어둡게" 가 아니라 눈에 띄게
망가지는 경로다. 파일이 자기 자신에 대해 거짓말을 하고 있었다.

고치면서 알게 된 것 둘:

- **워커 이미지(Debian)에는 `zscale`+`tonemap` 이 있다.** 코드는 "많은 빌드에 없다" 는 이유로
  쓰지 않고 있었는데, 없는 쪽은 macOS Homebrew 빌드였다. 이제 있으면 제대로 톤매핑하고
  없으면 기존 방식으로 물러난다(`pipeline/hdr.py`).
- **출력 인자 `-color_trc`/`-color_primaries` 만으로는 태그가 안 바뀐다.** mov/mp4 muxer 가
  입력의 `colr` 박스를 다시 써서 `colorspace` 만 바뀌고 전달함수·프라이머리는 PQ/bt2020 으로
  남는다(실측 확인). 프레임 속성을 바꾸는 `setparams` 필터라야 인코더·muxer 가 함께 따라온다.

검증: 파이썬 137건 통과(HDR 계약 3건 신규). **양쪽 빌드에서 확인했다** — 로컬(zscale 없음,
폴백 경로)과 워커 이미지(zscale 있음, 톤매핑 경로) 모두 산출물이 `bt709,bt709,bt709` 로 나온다.
실제 e2e 도 다시 돌려 `bt2020nc,smpte2084,bt2020` → `bt709,bt709,bt709` 로 바뀐 것을 확인했다.

**남은 것**: 돌비비전 실물은 아직 검증하지 못했다(합성 HDR10 으로만 확인, [backlog.md](./backlog.md) F). `media:e2e` 에
`--token` 을 추가해 Supabase 없이 auth 스텁 토큰으로도 돌릴 수 있게 했다.

---

## 2026-09-23 — iOS 시뮬레이터 모바일 검증 + 첫 로그인 경합 수정

iPhone 17 시뮬레이터(Xcode 27, Expo Go 57.0.9)에서 앱을 실제 로컬 API 에 붙여 검증했다.
로그인 전 화면(로그인·가입·재설정, 유효성 메시지, OS 다크 전환), 4개 탭, 설정 5화면(크레딧·알림·
테마·관심사·소셜), 뷰파인더 모달, 재시작 후 세션 유지가 모두 정상이었다. 이 Mac 에는 Simulator.app 이
없고 Xcode 번들 안의 `DeviceHub.app` 이 시뮬레이터 창이다 — 상세 절차는
[`apps/mobile/docs/workflows/local-development-and-testing.md`](../apps/mobile/docs/workflows/local-development-and-testing.md).

**첫 로그인에서 500 을 찾았다.** 새 계정이 앱에 들어가면 템플릿·크레딧·무비 요청이 동시에 나가고,
인증 미들웨어의 `resolveUser` 가 요청마다 Prisma `user.upsert` 를 돈다. 이 upsert 는 원자적이지 않아
(findUnique → create) 같은 `supabase_uid` 의 create 가 경합했고, 진 쪽이 P2002 로 500 을 받았다 —
앱은 그 결과 무비 탭을 빈 상태로 보여줬다. 유니크 위반을 "이미 만들어졌다"로 읽어 그 행을 다시
조회하도록 고쳤다(`apps/api/src/services/user.service.ts`). 유니크 위반이 아닌 에러는 그대로 전파한다.

검증: `test/auth.test.ts` 에 3건 추가 — upsert 가 P2002 를 던지는 결정적 재현(수정 전 실패 확인),
다른 에러의 전파, 같은 sub 6개 동시 요청. API 전체 412건 + tsc 통과.

**남은 것**: 재설정 화면 카피가 "인증 코드"라 말하지만 구현은 딥링크다(모바일, 미수정). 실제 촬영·
푸시·햅틱은 시뮬레이터에서 검증 대상이 아니며 iOS 실기기는 없다.

---

## 2026-09-24 — 앱 전반 카피 정리(UX 검토 P0·P1)

시뮬레이터 화면과 전체 문구 인벤토리를 [`ux-writing.md`](../apps/mobile/docs/ux/ux-writing.md) 기준으로
검토하고, 오너 결정에 따라 동작과 어긋난 문구(P0)와 말투·용어 불일치(P1)를 고쳤다. 화면 구조는 바꾸지 않았다.

- **동작과 어긋나던 문구**: 재설정·미인증 안내의 "인증 코드" → 재설정/인증 **링크**. 구매 기능이 없는데
  "크레딧에서 채울 수 있어요"라던 안내는 광고 보상이 켜져 있을 때만 광고로 받는 길을 안내한다.
  아무 동작도 없던 촬영 리마인더·하루 빈도·소셜 연결은 `준비 중` 행으로 바꿨다(값은 보존).
- **서버 원문 노출 제거**: `rejected` 거절 메시지·`errorDetail`·워커 진행 단계 문자열을 화면에 그대로
  보여주지 않는다. 진행 단계는 `features/compose-movie/lib/edit-step-label.ts` 가 앱 문구로 옮긴다.
- **용어·말투 통일**: 스냅/컷/무비/만들기/올리기/삭제로 고정하고(생성·업로드·지우기·칸·슬롯·장면·
  완성 파일 제거), 합니다체·~시 존대를 해요체로, `주세요` 띄어쓰기를 통일했다. 카메라 버튼은 `찍기`,
  확인 배지는 `담김`. 서버에서 결과 파일을 지우는 "끝내기"는 화면에서 `정리하기`로 부른다.
- **첫 화면**: 헤드라인 "3초씩 찍으면 / 한 편의 무비가 돼요"(브랜드 오기 "스냅리" 제거).
- **푸시(API)**: 무비 완성·스냅 만료 예고·위치 알림의 제목/본문을 앱 용어의 해요체로 바꾸고 위치 시드
  문구도 맞췄다. 템플릿 설명은 마이그레이션 `20260924000000_reword_movie_template_descriptions` 로 갱신
  (운영자가 고친 설명은 건드리지 않는다).

검증: `npm run verify:mobile`(1035건), API 전체 412건 통과. iPhone 17 시뮬레이터에서 스튜디오·나·알림·
소셜 연결 화면의 새 문구를 확인했다. 로그인 화면·촬영·추출·무비 화면은 코드로만 확인했다.

---

## 2026-09-25 — MinIO 이미지를 소스 빌드 GHCR 미러로(quay.io 차단 복구)

quay.io 의 `minio/minio` 가 익명 pull 에 401 을 돌려주기 시작해 CI 통합 테스트와 Deploy 스모크가
MinIO 기동 단계에서 깨졌다(backlog E-7 이 예고한 상황). 아카이브된 업스트림 소스의 같은 릴리스
(`RELEASE.2025-09-07T16-13-09Z`, 커밋 `07c3a42` 고정)를 [`deploy/minio/Dockerfile`](../deploy/minio/Dockerfile)
로 빌드하고 [`minio-image.yml`](../.github/workflows/minio-image.yml) 이 main 에서 amd64·arm64 로 GHCR 에
올린다. compose 2곳과 CI 가 그 이미지를 가리키고, 받을 수 없으면(비공개 패키지 · 미러 전)
[`scripts/ensure-minio-image.sh`](../scripts/ensure-minio-image.sh) 가 같은 Dockerfile 로 빌드한다.

검증: 로컬 빌드 이미지의 `minio --version` 이 quay.io 이미지와 같은 버전·커밋을 찍는다. amd64·arm64
buildx 빌드 성공. 개발 MinIO 를 새 이미지로 교체(기존 볼륨 데이터 유지)한 뒤 `npm test -w apps/api`
412건 통과, 컨테이너 안 curl 헬스체크 200. GitHub Actions 에서의 실행(push · 스모크)은 PR 에서 확인한다.

---

## 2026-09-26 — Android 에뮬레이터 모바일 검증 + 촬영 화면 라이브러리 갱신 수정

Android 35 에뮬레이터(google_apis arm64)에 dev client 디버그 APK 를 올려 로컬 API·MinIO·편집/렌디션
워커에 붙여 검증했다. 4개 탭, 설정 5화면, 다크 테마, 카메라·마이크·위치·알림 권한 요청, 촬영, 무비 편집
미리보기, 무비 만들기 → 워커 편집 → 완성 화면 재생, 크레딧 100 차감까지 정상이었다. 위치 알림은
"항상 허용" 없이 돌아오는 경로(직전 수정)와 허용 후 켜는 경로 모두 확인했다. iOS 에서 보였던 탭 빈 화면은
Android 에서 재현되지 않았다.

**촬영 화면 라이브러리가 방금 찍은 스냅을 몰랐다.** 좌하단 `스냅 N` 과 `찍은 스냅` 목록은 디스크의 녹화
파일을 화면이 열릴 때 한 번만 읽고, 촬영은 capture-moment 액션이 파일을 따로 저장해서, 찍은 뒤에도 촬영
전 개수가 남았다(스냅 탭에는 정상 반영). 저장이 끝나면 세션이 `onCaptureCollected` 를 부르고 recorder 가
라이브러리를 다시 읽도록 고쳤다(`apps/mobile/src/pages/capture-record/model/`).

검증: `npm run verify:mobile`(1037건) 통과 — 저장 성공 시 1회 호출·저장 실패 시 미호출 단언 추가.
에뮬레이터에서 촬영 직후 `스냅 2` 와 목록 2개로 바뀌는 것을 확인했다. 기존 계정은 로컬 크레딧이 0이라
(가입 보너스 0 · 광고 보상 꺼짐) dev DB 원장에 `promo` 500 을 넣고 무비 생성을 확인했다. 호스트에
Python 3.11·ffmpeg 가 없어 워커는 `apps/ai-worker/Dockerfile` 이미지를 dev 인프라에 붙여 돌렸다.

---

## 2026-09-26 (이어서) — 비어 보이던 화면 채우기 + 나 탭 크레딧 잔액 갱신 수정

Android 에뮬레이터에서 화면을 돌며 콘텐츠가 비어 보이는 화면을 골라, 설명 문구 없이(프로젝트 규칙)
사용자 자신의 스냅과 상태 표시로 채웠다.

- **스튜디오**: `스냅 골라 새 무비` 블록에 스냅 탭 헤더와 같은 `N개 · m:ss` 와 최신 스냅 5개 프레임을
  붙였다(스냅 0개면 기존 한 줄). 템플릿 카드는 슬롯 수만큼의 스트립으로 시작한다 — 채워진 슬롯은 내 스냅
  프레임, 빈 슬롯은 점선. 스트립은 템플릿 화면과 같은 `spreadAcrossSlots` 배치(`TemplateOffer.slots`)다.
- **무비 화면**: 완성 무비 시청 화면이 검은 9:16 으로 열리던 것을, 첫 재생 전까지 렌더 커버(없으면 첫 컷
  프레임) 포스터로 채웠다. 편집 화면 스테이지는 처음 건드리기 전까지 첫 컷의 트림 시작 프레임을 보여 준다.
  원인은 일시정지로 연 플레이어가 `onFirstFrameRender` 를 보내고도 그 프레임이 화면에 안 나오는 것이라
  (에뮬레이터에서 관찰 — seek·재생 후에는 정상), 포스터를 첫 프레임 이벤트가 아니라 재생/조작 시점에 내린다.
- **크레딧 화면**: 잔액 아래 줄이 `보유 크레딧 · 무비 N편을 만들 수 있어요`(100 미만·음수·로딩은 기존 문구).
- **버그**: 무비 생성이 크레딧을 예약해도 나 탭 크레딧 줄이 이전 잔액(500)을 계속 보였다. 생성 시작 경로가
  크레딧 쿼리를 무효화하지 않았기 때문이다. 진행 중 실행 목록이 바뀔 때마다 잔액을 다시 읽는
  `useRunCreditRefresh` 를 `MovieGenerationGate` 에 붙였다(예약·실패/취소 환급 모두 서버에서 일어난다).
- 같은 스냅을 여러 곳에 동시에 그리게 되어, 썸네일 훅이 같은 프레임의 추출을 공유하도록 했고
  `VideoFrame` 에 시간 지정(`atSec`)을 더했다.

검증: `npm run verify:mobile`(1054건) 통과 — 실행 시작·실패·취소·교체 시 잔액 무효화와 진행률 보고 시
미무효화, 잔액 문구 경계값, 템플릿 슬롯 배치, 동시 추출 1회·시간별 프레임 분리 단언 추가. 에뮬레이터에서
스튜디오·템플릿 스트립, 시청 화면 포스터 → 재생 → 끝, 편집 화면 포스터 → 스크럽, 크레딧 문구를 확인했고,
새 초안 무비를 만든 뒤 크레딧 화면을 열지 않고 나 탭이 400 → 300 으로 바뀌는 것을 확인했다. iOS 와 실기기는
확인하지 않았다.

---

## 2026-09-26 (이어서) — 나 탭의 `준비 중` 행 정리(관심사·소셜 연결)

**관심사는 고른 값이 어디에도 닿지 않았다.** 앱은 기기에만 저장하고 `PATCH /auth/me` 를 부르지 않았고,
서버의 위치 알림 판단(`location.service.ts`)은 알림 스위치·조용한 시간·쿨다운만 본다. 촬영
리마인더(2026-09-24)와 같은 기준으로 나 탭 행을 이동 없는 `준비 중` 으로 바꾸고 `/settings/interests`
화면을 걷었다(오너 결정). 기기에 저장된 기존 선택값은 지우지 않았다. 스펙 ACC-5 를 `부분` 으로 고쳤다 —
서버는 닉네임·아바타·관심사를 받지만 앱에는 닉네임·아바타 수정 화면도 없다. 남은 일은 backlog A-9.
`me.md`·`location-and-push-notifications.md` 의 "관심사는 서버에서 적용된다" 는 서술도 바로잡았다.

**소셜 연결도 같은 모양으로 맞췄다.** 행이 `준비 중` 인데 눌러 들어가면 플랫폼별 `준비 중` 두 줄만 있는
화면이었다. 행이 `TikTok · Instagram 준비 중` 을 직접 보여 주고 이동하지 않으며, `/settings/social`
화면은 첫 연결 컨트롤이 생길 때 되돌린다. 두 `준비 중` 행이 이제 같은 방식으로 동작한다.

검증: `npm run verify:mobile` 통과 — 두 행이 버튼이 아니고 읽는 값이 맞다는 단언 추가. Android 에뮬레이터에서
두 행을 눌러도 이동하지 않는 것을 확인했다. iOS 와 실기기는 확인하지 않았다.

---

## 2026-09-27 — 영상 삭제가 자기가 소유한 객체만 지운다(backlog E-8)

스냅 reconcile 계획(0단계)의 선행 결함 둘을 재현하고 고쳤다. 영상을 지우는 모든 경로(사용자 삭제 ·
기간 만료 · 남은 객체 회수)가 [`video-assets.ts`](../apps/api/src/services/video-assets.ts) 의 한 규칙으로
"그 행이 소유한 객체"만 지운다.

- **무비 생성을 취소하면 원본 스냅 파일이 지워졌다.** 결과물 행은 원본 스냅의 S3 키를 복사해 들고 있는데
  (`createEditJob`), 취소나 `DELETE /videos/{id}` 로 soft-delete 된 결과물을 남은 객체 회수 배치가 훑으면서
  그 키, 즉 원본 스냅의 파일을 지웠다. 원본 행은 `ready` 로 남아 목록에 떴다. 결과물은 이제 원본 키를
  소유하지 않는다(컬럼은 그대로 — 워커는 읽지 않는다).
- **렌디션이 지워지지 않았다.** 사용자 삭제·만료·회수 어디에도 `renditionS3Key` 가 없어, 지운 스냅의 재생
  가능한 사본이 계정 purge 전까지 남았다. 셋 다 렌디션을 지운다. 렌디션 워커는 변환 중 스냅이 지워져
  키를 반영하지 못하면 올려 둔 배포본·썸네일을 스스로 지운다(키가 행에 없어서 회수 배치도 모른다).

검증: `test/retention.test.ts` 에 실제 MinIO 객체로 5건 추가 — **수정 전 코드에서 5건 모두 실패**,
수정 후 통과. 워커 `tests/test_rendition_worker.py` 3건(워커 이미지에서 실행).

**이미 파일을 잃은 원본 행 찾기**: 회수 배치가 결과물 행의 키를 비워 두므로 DB 조인으로는 흔적이 없다.
`kind='source' AND status='ready' AND deleted_at IS NULL` 행마다 `s3_key` 를 HEAD 해 없는 것을 찾는다
(렌디션은 남아 있을 수 있다). 개발 DB 의 업로드 완료 스냅 5건은 모두 원본이 있다.

---

## 2026-09-27 (이어서) — 스냅이 기기와 재설치를 넘어 보인다(reconcile 1~3단계)

[`archive/snap-reconcile.md`](./archive/snap-reconcile.md) 의 1~3단계와
[`decisions/snap-sync-across-devices.md`](./decisions/snap-sync-across-devices.md) 의 규칙(SNAP-15·16,
SNAP-12 범위 조정)을 구현했다.

- **서버**: `GET /videos` 항목에 `width`·`height`(렌디션 워커가 배포본에서 회전 반영해 잰다)·`clientId`·
  `expiresAt`(보관 정책에서 유도 — 정리 배치와 같은 식) 추가, 정렬에 `id` 동점 처리. `POST /videos/lookup`
  (목록에서 사라진 스냅의 사유 — `live` / `removed` + `user`·`expired`, 남의 id 는 없는 id 와 같다).
  `POST /videos` 가 `clientId` 를 받는다. 마이그레이션 `20260927000000_add_video_dimensions_and_client_id`.
  테스트 환경의 렌디션 큐 이름을 `renditions-test` 로 나눴다(개발 워커가 테스트 작업을 가져가지 않게).
- **앱**: `features/reconcile-snaps`(`SnapReconcileGate`) 가 계정이 정해질 때와 포그라운드 복귀마다 서버
  목록을 끝까지 읽고, 목록에서 빠진 것만 lookup 으로 묻는다. 다른 기기 스냅은 서버 `videoId` 를 id 로
  `origin: 'server'`·`uploaded` 로 들어오고(업로드되지 않는다), 섬네일은 서버 것을 먼저 받아 두며, 영상은
  처음 재생할 때 받는다(`<cache>/server-snaps/`, 렌디션 우선). 다른 기기에서 지운 스냅은 원본까지 지우고,
  만료된 스냅은 `만료됨`(촬영한 기기는 파일을 둔다), 무비에는 담을 수 없다. 마지막 3일은 `N일 남음`.
  목록에 없다는 이유만으로는 지우지 않고, 한 단계라도 실패하거나 계정이 바뀌면 아무것도 쓰지 않는다.
  새 기기에서 만료 컷은 원본이 없어도 "만료"로 읽는다. 삭제 확인 문구가 모든 기기에서 지워진다고 말한다.

검증: API 전체 테스트, 워커 테스트 141건(회전 치수 계약 1건 신규), `npm run verify:mobile` 통과
(병합 규칙 17건 · 실제 스토어 통합 6건 · 파일 받기 5건 등 신규). **Android 에뮬레이터 + 로컬 서버 실검증**:
개발 DB·MinIO 에 "다른 기기 스냅" 2개를 넣고 렌디션 워커로 배포본을 만들자(720×1280 기록), 포그라운드
복귀에 스냅 5 → 7개, 서버 섬네일 표시, 13일 된 스냅에 `2일 남음`, 탭하면 `불러오는 중…` 뒤 캐시에 배포본이
받아졌다. 서버에서 삭제·만료로 바꾸자 하나는 사라지고(받은 사본도 삭제) 하나는 `만료됨`, 그 스냅으로
새 무비를 만들면 거절됐다. 넣었던 행·객체는 지웠다.

**남은 것**: 에뮬레이터의 H.264 디코더가 Main/High 프로필을 검은 화면으로 그려(받은 배포본과 기존 무비
완성본 모두, 자체 녹화인 Baseline 은 정상) 받은 사본의 화면은 확인하지 못했다. 재설치(로그인을 여기서 할 수
없다)·두 번째 실기기·iOS 는 backlog A-4 의 실기기 검증 항목에 남는다.

---

## 2026-09-27 (이어서) — 스냅 reconcile 실기기 검증(휴대폰 · 에뮬레이터 · iOS 시뮬레이터)

오너의 Galaxy S22 Ultra(무선 adb, 9월 25일 dev 빌드에 새 JS 번들), Android 35 에뮬레이터, iPhone 17 시뮬레이터
(Expo Go)를 **같은 계정**으로 로컬 API·MinIO·렌디션 워커에 붙여 계획 §5.5 의 시나리오를 돌렸다. 버림용 스냅은
에뮬레이터 카메라(가상 장면)로 찍어 쓰고, 끝난 뒤 모든 기기에서 지웠다 — 기기와 서버 모두 원래대로 스냅 5개다.

- **① 도착**: 에뮬레이터에서 찍은 스냅이 휴대폰과 iOS 에 서버 섬네일로 나타났다. 등록에 `clientId` 가 실리고
  렌디션 워커가 720×1280 을 기록했다. **받은 사본은 휴대폰과 iOS 에서 정상 재생된다** — 에뮬레이터에서 검게 나온
  것은 에뮬레이터 디코더의 한계였다(같은 High 프로필 파일).
- **② 새 기기·재설치**: 자기 스냅이 없던 iOS 시뮬레이터가 계정의 스냅 5개를 모두 서버에서 받아 왔다
  (`origin: server`). 이어서 **휴대폰에서 앱을 지우고 다시 설치해 로그인**하자, 앱 삭제로 기기에서 사라진 자기 스냅
  3개를 포함해 서버의 스냅 5개가 모두 다른 기기 스냅으로 돌아왔다. 치수 기록 이전에 올라온 행이라 크기는 스탠드인
  (1080×1920)이고, 파일을 받은 뒤 다음 시작의 백필이 잰다. 무비 2개도 돌아왔다(오너 확인 — 무비 서버 전환
  검증 A-1 ⑤ 도 이로써 통과).
- **⑤ 계정 전환**: 다른 계정으로 로그인하면 이 계정의 스냅이 보이지 않는 것을 오너가 확인했다.
- **⑥ 오프라인 복귀**: 오프라인에서 돌아와도 아무것도 지워지지 않는 것을 오너가 확인했다.
- **③ 삭제 전파**: 휴대폰에서 지운 스냅이 서버에서 `user` 로 지워지고(원본·렌디션·섬네일 즉시 삭제), 그 스냅을
  찍은 에뮬레이터에서 포그라운드 복귀에 원본 파일까지 사라졌다.
- **④ 만료**: 업로드 시각을 16일 전으로 당기고 **실제 정리 배치**(`media:purge-expired --yes`)를 돌렸다 — 드라이런
  대상은 버림용 스냅뿐이었고, 배치가 원본과 함께 **렌디션까지** 지웠다(E-8 수정의 실동작). 휴대폰과 에뮬레이터 모두
  "만료됨"이 됐고, 찍은 에뮬레이터는 파일을 남긴 채 "보관 기간이 끝났어요" 와 함께 재생했다.

**남은 것**: iPhone 실기기의 HEVC 스냅 → Android 는 iOS 출시 전으로 옮겼다 — 1차 운영 배포 대상은 Android 만이다
(2026-09-27 오너, backlog A-4). 곁가지로 재생 화면의 길이 표시가 라이트 테마에서 검은 바탕 위 어두운
글자로 거의 보이지 않는 것을 찾았다(이번 변경 이전부터 있던 문제, 별도 작업).

무선 adb 참고: 휴대폰이 `adb mdns services` 에 안 보이고 `adb connect` 가 "No route to host" 로 실패했는데, 같은
셸의 `ping` 은 됐다. 먼저 떠 있던 adb 서버가 macOS 로컬 네트워크 권한 없이 시작된 것이었다 — `adb kill-server &&
adb start-server` 로 풀렸고 기존 페어링은 그대로 유효했다.

## 2026-09-28 — 경계별 전환의 편집 화면 미리보기 검증(임시 화면)

AI 편집 초안은 경계마다 고를 수 있는 전환을 편집 화면에서 보여줘야 한다(MOV-22). 무대(`cut-player.tsx`)와 같은
구조 — `expo-video` 플레이어 둘, Android 는 `surfaceType="textureView"`, 보이는 슬롯을 불투명도로 고름 — 의 임시 화면을
만들어 v1 전환을 돌렸다(검증 뒤 삭제, 커밋하지 않음). 테스트 클립은 단색 3개(720×1280, H.264 Baseline — 에뮬레이터
디코더가 Main/High 를 검게 그리기 때문)이고, 각 클립의 0.5~2.5초 구간만 써서 앞뒤 0.5초를 여분 프레임으로 남겼다.
화면 녹화를 30fps 로 풀어 무대 세 영역(왼쪽·가운데·오른쪽)의 색을 프레임마다 분류해 판정했다.

| 전환 | iOS 시뮬레이터(iPhone 17, Expo Go) | Android 에뮬레이터(API 35, dev 빌드) |
|---|---|---|
| `hardcut` | ✅ | ✅ |
| `crossfade` — 영상 두 개를 겹쳐 불투명도로 | ✅ 두 색이 섞인 프레임이 0.8초 동안 이어진다 | ❌ 위 영상이 반투명인 동안 아래 영상이 검다 — 검정에서 페이드인하는 것처럼 보인다(4회 모두) |
| `crossfade` — 나가는 컷의 마지막 프레임을 이미지로 올려 사라지게 | 돌리지 않음 | ✅ |
| `dip` · `flash` | ✅ | ✅ |
| `zoompunch`(1.12 → 1.0) | ✅ | ✅ |
| `slide` | ✅ 오른쪽부터 바뀐다 | ✅ 같다 — 영상 두 개가 동시에 재생되며 둘 다 보인다 |

- 전환 시작 시각의 오차(플레이어 시계 기준)는 iOS 3~16ms, Android 에뮬레이터 2~50ms 였다. `timeUpdate` 를 50ms
  간격으로 받고 남은 시간을 타이머로 보정했다. 지금 무대는 250ms 간격이라 그대로 쓰면 전환이 최대 250ms 늦는다.
- `crossfade`·`slide` 는 계획의 여분 프레임 규칙(경계를 중심으로 나가는 컷은 뒤 여분까지, 들어오는 컷은 앞 여분부터)으로
  구현했다. 여분 없이 들어오는 전환(`zoompunch`)의 컷은 자른 구간의 시작 프레임(한 프레임 이내)에서 시작했다.
- Android 에뮬레이터에서는 반투명 단색 아래 영상(`dip`·`flash`)과 나란한 영상 두 개(`slide`)는 그려지고, **반투명 영상
  아래의 영상만** 검다. 디코더 수가 아니라 합성의 문제다. 에뮬레이터는 전환과 무관하게 평소 재생 중에도 0.5초마다
  무대가 1~2프레임 검게 깜빡였는데 iOS 에서는 없었다 — 에뮬레이터 렌더링의 현상으로 본다.
- 오너의 Galaxy 는 이번에 무선 adb 로 잡히지 않아 실기기는 확인하지 못했다. 남은 확인은 backlog A-11.

## 2026-09-29 — 스냅 분석 옵트인 동의(ANA-5 · REC-4)

법무 검토 전에도 **동의한 사용자에게만** 분석을 켜는 결정([decisions/snap-content-analysis.md](./decisions/snap-content-analysis.md)
§6.1)을 구현했다.

- **서버**: 동의 기록 `user_consents`(종류 · 문구 버전 · 동의 시각 · 철회 시각, 마이그레이션
  `20260929000000_add_user_consents`), `GET`·`POST`·`DELETE /auth/me/analysis-consent`. 분석 요청과 추천 요청은
  서버 스위치(`MOVIE_RECOMMENDATION_ENABLED`)와 현재 문구 버전(`2026-09-29`)의 동의가 모두 있어야 받는다 — 스위치가
  꺼져 있으면 503, 동의가 없으면 403, 옛 문구로 동의하려 하면 409. 전에는 분석 요청에 스위치 검사도 없었다. 철회는 한
  트랜잭션에서 동의에 철회 시각을 찍고 그 사용자의 분석 결과와 추천 기록을 지운다. 약관 §5와 개인정보처리방침 §2의 분석
  절이 "동의한 경우에만"을 말한다. `scripts/analysis-run.mjs` 도 동의 없는 사용자의 스냅은 거부한다.
- **앱**: 템플릿 화면이 로컬 매칭을 먼저 채운 뒤 슬롯 아래에서 한 번 묻고(`스냅을 분석해서 컷에 더 어울리게 채울까요?`),
  `분석해서 채우기`가 동의 문구 전체를 담은 시트를 연다. 추천은 동의한 계정만 요청한다. 나 탭 `스냅 분석` 행과
  `/settings/analysis` 스위치에서 켜고 끈다.
- **자동 검증**: API 테스트 442개 통과(동의 15개 · 약관의 동의 문구 1개 신규) · 모바일 `npm run verify:mobile` 143 suites / 1144 tests.

**Android 에뮬레이터(API 35, dev 빌드) 검증** — 스위치를 켠 로컬 API 를 따로 띄워 붙였다. 분석 워커는 돌지 않았고 OpenAI
키도 없어서 분석 작업은 큐에 쌓이기만 했다(외부 전송 없음).

| 단계 | 결과 |
|---|---|
| 템플릿 화면 진입 | 로컬 매칭으로 4컷 중 3컷을 채운 뒤 슬롯 아래에 질문 카드. 동의 전에는 동의 상태 조회만 있고 추천 요청은 없다 ✅ |
| `분석해서 채우기` | 시트에 보내는 것 · 받는 곳 · 용도 · 보관 · 끄는 방법 · 거절해도 된다는 점이 모두 뜬다 ✅ |
| `분석 켜기` | `POST /auth/me/analysis-consent` 200 → `user_consents` 1행(`snap_analysis`, `2026-09-29`). 곧바로 `POST /movie-recommendations` 202, 분석 3건 queued. 카드가 사라지고 로컬 매칭은 그대로 ✅ |
| 나 탭 | `스냅 분석 · 켜짐`, 설정 화면은 `2026년 9월 29일에 켰어요. 끄면 분석 결과를 지워요.`(기기 시간대 날짜) ✅ |
| 스위치 끄기 | `DELETE` 200 → 철회 시각 기록, 분석 결과 · 추천 기록 0건, 문구가 `켜면 템플릿의 컷을…`으로 ✅ |
| 철회 뒤 템플릿 재진입 | 다시 묻지 않고, API 요청도 하나도 나가지 않는다 ✅ |

- 추천 폴링은 2초 간격이었고 템플릿 화면을 떠나자 멈췄다.
- 철회 순간 큐에 있던 작업은 행이 지워져 워커가 건너뛴다(`fetch_context` → `AnalysisSkipped`). 이번 3건도 분석 워커가
  뜨면 그렇게 끝난다.
- 확인하지 못한 것: 분석이 끝난 추천으로 행이 다시 채워지는 것(분석 워커 없음 — A-3 의 실제 모델 실행과 함께), iOS
  (시뮬레이터에서 로그인 입력이 되지 않아 중단), 실기기.

## 2026-09-29 (이어서) — 워커가 `apps/ai-worker/.env` 와 `apps/api/.env` 를 겹쳐 읽는다

[AGENTS.md](../AGENTS.md) 와 [ONBOARDING.md](../ONBOARDING.md) §3-8 은 `apps/ai-worker/.env` 에 `DATABASE_URL` 한 줄만
두어 덮어쓰라고 안내하지만, `config.py` 는 워커 파일이 있으면 **그 파일만** 읽었다. 안내대로 하면 `REDIS_URL`·S3·
`OPENAI_API_KEY` 가 모두 빠져 분석 워커가 기동 단계에서 종료된다. 회사 OpenAI 키(C-7)를 넣기 전에 키를 읽는 곳을
확인하다 발견했다. 로컬에 워커 파일이 없어 실제로 걸린 적은 없다.

- 두 파일을 모두 읽고 같은 키만 워커 파일이 이긴다. 주입값이 둘 다 이기는 것은 그대로다(`setdefault`).
- 결정 문서 [env-management.md](./decisions/env-management.md) 의 옛 설명에 정정 배너를 붙였다.
- **검증**: `tests/test_config.py` 에 3개 추가. 워커 파일이 한 키만 덮어쓰는 경우는 고치기 전 코드에서 실패(`REDIS_URL`
  이 `None`)하는 것을 먼저 확인했다. CI 와 같은 Python 3.11 · `REQUIRE_FFMPEG=1 python -m unittest discover -s tests` 로
  144개 통과(`snaply-ai-worker:local` 이미지, 네트워크 차단).

## 2026-09-29 (이어서) — 실제 모델로 스냅 분석 · 템플릿 추천 첫 실행(backlog C-7 닫음)

회사 OpenAI 키를 `apps/api/.env` 에 넣고 분석 → 추천 → 앱 표시를 처음으로 실제 모델로 돌렸다. 전에는 스텁 응답과
직접 만든 분석 행으로만 검증했다(2026-08-19).

- **워커**: 개발 인프라에 붙인 분석 워커 컨테이너가 `video-analysis 워커 시작 (model=gpt-5.6-luna concurrency=3)` 을
  남겼다. 키는 `apps/api/.env` 를 컨테이너의 `/apps/api/.env` 에 읽기 전용으로 연결해 `config.py` 가 읽게 했다 —
  `--env-file` 과 달리 컨테이너 설정(`docker inspect`)에 키가 남지 않는다. 동의 흐름 확인 때 큐에 남은 3건은 분석 행이
  없어 모델 호출 없이 건너뛰었다.
- **모델**: 키의 프로젝트에서 `gpt-5.6-luna` 를 쓸 수 있다(`models.list`). 계획 §4.1 의 비교에 쓸 저비용 후보
  (`gpt-5.4-mini` · `gpt-5.4-nano` 등)도 있다.

**분석 4건** — 개발 계정은 동의를 철회한 상태여서 동의 행을 DB 에 직접 넣었다. `scripts/analysis-run.mjs` 로 1건, 앱의
추천 요청으로 3건을 돌렸고 모두 `done` · 재시도 없음 · `usableForEdit=true` · 품질 0.90~0.98 이었다. 요약과 사물 목록은
4건 모두 영상 내용과 맞았다(눈으로 확인). 모델 원문은 저장소에 두지 않는다([결정 문서](./decisions/snap-content-analysis.md) §5).

| 스냅 | 프레임 | 소요 | 토큰(입력 / 출력) |
|---|---|---|---|
| 에뮬레이터 가상 장면 | 1 | 4.2초 | 614 / 208 |
| 휴대폰 촬영 A | 2 | 5.2초 | 787 / 290 |
| 휴대폰 촬영 B | 1 | 4.8초 | 614 / 190 |
| 휴대폰 촬영 C | 4 | 5.7초 | 1133 / 291 |

- **앱 경로**(Android 에뮬레이터 dev 빌드, 스위치를 켠 API 를 3001 에 따로 띄움): `하루 요약` 템플릿을 열자
  `POST /movie-recommendations` 202, 후보 3건이 동시에 분석되고 폴링 시점 채점으로 **6.4초 만에** `done` 이 앱에
  닿았다. 화면은 서버 추천이 도착했을 때만 붙는 `어울림` 라벨로 49% · 46% · 48% 를 보였다. 외출의 스냅이 3개라 4칸 중
  3칸만 찼다. 추천 도착 전의 로컬 매칭 배치는 캡처하지 못해, 추천이 배치를 바꿨는지는 확인하지 않았다.
- **C-7 완료 조건과 다른 점**: 워커는 compose 서비스가 아니라 개발 인프라에 붙인 컨테이너로 띄웠고, 분석은
  `POST /videos/:videoId/analysis` 대신 스크립트와 추천 경로로 요청했다. 추천 경로도 같은 `requestAnalysis` 를 거친다.
- **남은 것**: 계획 §4.1 의 팀 스냅 30~100편 실측(사람 채점 · 모델 비교)과 키 프로젝트의 사용 한도 · rate limit 확인은
  A-3. 후보가 12개일 때의 첫 추천 대기는 재지 않았다. 스크립트의 워커 수 경고가 틀리는 결함은 E-11.
- 검증용 동의 행과 분석 결과 4건은 개발 DB 에 남겼다.

## 2026-09-29 (이어서) — 스냅 앨범 저장과 "이 기기에서만 삭제"(SNAP-17 · 18 · 19)

서버가 스냅을 업로드 후 15일만 보관하는데 녹화 파일은 앱 전용 폴더에만 있어, 앱을 지우거나 기기를 바꾸면 사용자에게
남는 사본이 없었다. 저장공간 검토 끝에 오너가 정한 대로([결정 문서](./decisions/snap-album-save-and-device-delete.md))
사용자가 기기 앨범에 사본을 갖게 하고, 삭제할 때 서버 사본을 남길지 고르게 했다.

- **앨범 저장**: 재생 화면 위쪽의 `앨범에 저장`. 이 기기에 파일이 없는 스냅은 보관 사본을 받아 저장한다. Android 는
  `Pictures/Snaply`(갤러리의 `Snaply` 앨범), iOS 는 앨범 없이 보관함에 넣는다. `expo-media-library`(SDK 57 의 `Album.create` ·
  `Asset.create`)를 들였고, 읽기 권한은 매니페스트에 들이지 않았다 — 빌드한 APK 에 `READ_MEDIA_*` 가 없다(`aapt2 dump
  permissions`).
- **자동 앨범 저장**: 나 → `앨범 저장`(`/settings/album`)의 스위치. 기본 꺼짐, 찍은 스냅만 대상이다. 촬영은 앨범 사본을
  기다리지 않고, 사본을 만들지 못하면 촬영 화면에 알린다.
- **이 기기에서만 삭제**: 보관 중인 스냅을 삭제할 때 시트가 `이 기기에서만 삭제` / `모든 기기에서 삭제` 를 묻는다(촬영
  화면의 녹화 목록은 시스템 알림으로). 파일만 지우고 스냅은 id 를 그대로 둔 채 보관 사본으로 보는 상태가 된다 — 무비의
  컷과 동기화 기록은 바뀌지 않는다. reconcile 은 이런 스냅을 다른 기기에서 온 스냅처럼 다루되 중복으로 더하지 않고,
  원본에서 잰 길이·크기를 덮어쓰지 않는다.
- **검증**: `npm run verify:mobile` 통과(152개 스위트 · 1211개). Android 에뮬레이터(`snaply_api35`, API 35)의 새 dev 빌드로 로컬
  API 에 대해 확인했다.

| 단계 | 결과 |
|---|---|
| 다른 기기에서 온 스냅의 `앨범에 저장` | 보관 사본을 받아 `Pictures/Snaply/` 에 저장, 버튼이 `앨범에 저장했어요` 로 바뀜 ✅ |
| 자동 앨범 저장 켜기 | Android 11+ 라 권한 질문 없이 켜지고 나 탭 읽기가 `자동 저장 켜짐` ✅ |
| 켠 채로 촬영(두 번) | 찍을 때마다 앨범에 저장, `datetaken` 이 촬영 시각 ✅ |
| 업로드된 내 스냅 삭제 | 시트가 두 답을 묻고, 만료일을 아직 모를 때는 날짜 없는 문구 ✅ |
| `이 기기에서만 삭제` | 원본 파일 삭제, 스냅은 같은 id · 길이 · 위치로 `origin: 'server'`, 업로드 기록 유지, 삭제 요청 없음, 표지가 새 경로로 옮겨져 목록에 그대로 ✅ |
| 그 스냅 재생 · 앨범 저장 · 새 무비 | 보관 사본을 받아 재생, 앨범에 저장, 초안이 서버에 그 `videoId` 컷으로 생김 ✅ |
| 녹화 목록에서 삭제 | 시스템 알림이 `취소 · 이 기기에서만 삭제 · 모든 기기에서 삭제`, 모든 기기에서 삭제 → 서버 행 `deleted` · `user` ✅ |
| 이 기기에서만 지운 스냅을 다시 삭제 | 선택 없이 기존 삭제, 서버 행 `deleted` · `user`, 받아 둔 사본 제거 ✅ |

- 찾은 것: 서버 사본을 앨범에 저장하면 `datetaken` 이 비어 저장한 날짜 자리에 놓인다. 배포본이 원본의 `creation_time` 을
  잃기 때문이다(backlog E-12).
- 확인하지 못한 것: 휴대폰 실기기, Android 10 이하의 저장소 권한 질문, iOS(추가 전용 권한), 이 기기에서만 지운 스냅의
  만료(단위 테스트만), 만료일이 알려진 한 개 스냅의 날짜 문구(단위 테스트만) — backlog A-4.
- 두 번째 촬영이 에뮬레이터 카메라 HAL 의 버퍼 대기(`Can't dequeue next output buffer`)로 멈췄고, 화면을 다시 열어 찍으니
  됐다. 이번 변경과 무관하다.
- 확인용으로 만든 스냅 2개와 무비 초안 1개는 앱에서 지웠고, 에뮬레이터 앨범의 테스트 영상과 자동 저장 설정도 되돌렸다.

## 2026-10-01 — Android 실기기에서 영상 두 개를 겹친 `crossfade`(backlog A-11 ①)

2026-09-28 에 Android 에뮬레이터에서만 실패한 `crossfade` 를 오너의 Galaxy S22 Ultra(dev 빌드)에서 다시 돌렸다. 같은
구조의 임시 화면(`expo-video` 플레이어 둘 · `surfaceType="textureView"` · 감싼 `Animated.View` 의 불투명도)을 만들어
돌린 뒤 지웠다(커밋하지 않음). 클립은 720×1280 H.264 High 세 개 — 처음에는 단색, 마지막에는 시간에 따라 초록 성분이
늘어나는 색(전환 중에도 영상이 움직이는지 보려고). 각 클립의 0.5~2.5초를 쓰고 앞뒤 0.5초를 여분 프레임으로 남겼다.
`screenrecord` 를 30fps 로 풀어 무대 색을 프레임마다 읽었고, 각 경우를 두 번씩 돌렸다.

| 경우 | 결과 |
|---|---|
| `hardcut` · `dip` · `flash` | ✅ |
| `crossfade` — 들어오는 컷을 위에, 또는 나가는 컷을 위에(쌓는 순서를 바꿈) | ❌ 에뮬레이터와 같다. 위 영상이 반투명인 동안 아래 영상이 검다 |
| `crossfade` — 쌓는 순서 고정 | ❌ 같다. 순서 변경이 원인이 아니다 |
| `crossfade` — 감싼 뷰에 `needsOffscreenAlphaCompositing` 만 | ❌ 같다 |
| `crossfade` — 감싼 뷰에 `renderToHardwareTextureAndroid` | ✅ 두 색이 고르게 섞이고(중간 프레임 R≈B), 섞이는 동안 두 영상 모두 계속 움직인다 |
| `crossfade` — `renderToHardwareTextureAndroid` 를 페이드 0.8초 동안만 켬 | ✅ 켜고 끄는 순간 깜빡임이 없다 |
| `crossfade` — 나가는 컷의 프레임을 이미지로 올려 사라지게 | ✅ 섞이지만, 이미지 소스를 바꿀 때 이전 이미지가 한 프레임 보였다 |

- **영상 두 개를 겹친 `crossfade` 는 Android 실기기에서 된다** — 페이드하는 플레이어를 감싼 뷰에 그 동안만
  `renderToHardwareTextureAndroid` 를 켠다. 정지 프레임 방식(계획 §2.1의 대안)은 필요 없다.
- 전환 시작 오차(플레이어 시계 기준)는 -1~21ms 였다. `timeUpdate` 를 50ms 간격으로 받고 남은 시간을 타이머로 보정했다.
- `zoompunch` 는 단색 클립이라 배율 변화를 색으로 읽지 못해 이번에 확인하지 않았다(에뮬레이터 확인은 2026-09-28).

## 2026-10-01 (이어서) — 전환 어휘와 사용자 수정의 무효화 액션(backlog A-7 · A-11)

경계별 전환(MOV-22)의 첫 단계로 전환 `kind` 를 닫힌 집합으로 만들고, 사용자가 구간·전환을 고칠 때의
무효화 판단을 사전에 넣었다. 아직 무비 계약·렌더·앱이 쓰지 않는 어휘다.

- **`transition-vocabulary.json`(신규)** — v1 5종 `hardcut` · `crossfade` · `dip` · `flash` · `zoompunch`.
  종류마다 timing(경계형/겹침형) · 길이 범위(정수 ms, 범위 밖은 거부) · 경계형의 걸침 비율 · easing · 폴백
  (`hardcut`)을 담는다. `crossfade` 상한은 지금 `감성` 프리셋의 0.8초를 표현하도록 800ms 로 잡았다(계획의
  툴 카드는 600 이었다). TS `transition.ts`, 워커 `pipeline/transition.py` 가 같은 파일을 읽고, 워커는 기동 시
  검증 목록(`vocabulary.REQUIRED`)에 넣었다.
- **해석 규칙 `resolveTransition` / `resolve_transition`** — 고른 전환을 경계 양쪽 컷의 길이·여분 프레임에 맞춰
  줄이고, 사전의 최소 길이보다 짧아지면 `hardcut` 으로 바꾼다. 겹침형은 양쪽 여분 프레임의 두 배와 양쪽 컷
  길이를, 경계형은 걸치는 몫이 컷 절반을 넘지 않게 상한을 잡는다. 앱 미리보기와 렌더가 같은 답을 내야 하므로
  두 구현을 공용 픽스처 `packages/shared-types/fixtures/transition-resolution.json`(15건, 정확히 최소 길이 ·
  여분 0 · 컷 절반 같은 경계값 포함)으로 함께 검사한다.
- **무효화 사전에 `cut-trim` · `transition-edit`** — 둘 다 `attempt` 를 올리지 않는다. 트림은 컷 쌍이 그대로라
  전환을 다시 고르지 않고 길이만 다시 해석한다(`timeline.transitions: retimed`). 전환 하나를 바꾸면 겹침형도
  여분 프레임을 써서 무비 길이가 컷 길이의 합이라 컷이 움직이지 않는다(`timeline.cuts: preserved`) — 전환과
  효과음만 무효화한다. 셀별 근거는 사전의 `note`.
- **자동 검증**: API 테스트 473개(전환 어휘 신규 · 무효화 규칙 2개 추가) · 워커 155개(Docker 이미지, ffmpeg 포함) ·
  모바일 `npm run verify:mobile` 152 suites / 1211 tests · shared-types·API lint·typecheck 통과.

## 2026-10-01 (이어서) — 무비 계약에 경계별 전환과 그 주인(MOV-22, backlog A-11)

모든 무비의 컷이 다음 컷으로의 전환을 갖고, 그 전환을 누가 골랐는지 남는다. 앱 화면과 렌더는 아직 이 값을
쓰지 않는다(생성은 지금도 `stylePreset` 하나로 전환을 정한다).

- **스펙**: MOV-22 에 규칙을 구체화했다 — 모든 무비에 적용 · 경계마다 `ai`/`user` · 사용자 전환은 두 컷이
  이어진 동안만 · 들어가지 않으면 짧아지거나 바로 넘기지만 고른 값은 남음 · 무비 길이는 컷 길이의 합.
- **DB**: `movie_clips` 에 `transition_kind`(varchar — 새 종류가 마이그레이션을 요구하지 않게) · `transition_ms` ·
  `transition_owner`(`MovieArranger`, 기본 `ai`). 마이그레이션 `20261001000000_add_movie_clip_transitions` 가 기존
  무비를 지금 렌더되는 값으로 채운다(`감성` = `crossfade` 800ms, 나머지 `hardcut`, 마지막 컷 NULL). 별도 DB 에
  감성·여행·컷 없는 무비를 넣고 적용해 그대로 채워지는 것을 확인했다.
- **계약**: 응답 컷의 `transition`(`kind` · `durationMs?` · `owner`, 마지막 컷 `null`)과 입력 컷의 선택 `transition`.
  보낸 경계만 `user` 이고 나머지는 서버가 고른다. 범위 밖 길이 · `hardcut` 의 길이 · 마지막 컷의 전환은 400.
  `arranger: ai` 정렬로 두 컷이 떨어지면 그 사용자 전환은 버리고 AI 가 고른다. 스타일만 바꾸면 `ai` 경계만
  다시 고른다. `openapi.json` 재생성 · [api-spec.md](./api-spec.md) 갱신.
- **AI 의 선택**: `services/transition-director.ts` — 지금은 스타일 기본값이라 경계별 저장으로 바뀐 뒤에도 사용자가
  보는 결과가 그대로다. 규칙은 다음 단계(backlog A-11).
- **자동 검증**: API 테스트 486개(경계 전환 13개 신규) · 모바일 `npm run verify:mobile` 152 suites / 1211 tests ·
  shared-types·API lint·typecheck. 앱은 자체 DTO 스키마가 모르는 필드를 걸러 내 영향이 없다.
- **사고**: 백필 검증 중 URL 치환(`sed`)이 macOS 에서 동작하지 않아 이 마이그레이션이 **개발 DB(`snaply`)에 먼저
  적용됐다.** 추가 전용 변경이고 기존 일상 무비 4개의 컷 4개가 의도대로 채워졌다(main 코드는 새 열을 모르고
  기본값이 있어 그대로 동작한다). 검증은 치환 결과를 확인한 뒤 별도 DB 에서 다시 했다.

## 2026-10-01 (이어서) — 경계별 전환의 렌더(editSpec v3 · `edit-v3` 큐, backlog A-11)

무비를 생성하면 경계마다 고른 전환이 결과물에 들어간다. 편집 화면의 선택·미리보기(MOV-22 의 나머지)는 아직이다.

- **editSpec v3** — v3 초안의 `timeline` 부분만 먼저 쓴다: `timeline.cuts`(`cutId`·`videoId`·`sourceInMs`·
  `sourceOutMs?`)와 이어진 두 컷마다의 `timeline.transitions`(`fromCutId`·`toCutId`·`kind`·`durationMs?`). 색보정·
  음악은 아직 `stylePreset` 이 정한다. 무비 생성만 v3 를 쓰고 `POST /edit-jobs` 는 v2 그대로다. 최상위 `clips` 는
  v3 작업에 싣지 않는다.
- **큐 분리** — v3 는 `EDIT_V3_QUEUE_NAME`(기본 `edit-v3`)으로만 간다. 구버전 워커는 이 큐를 모르므로 전환을 버리고
  v2 로 "성공"하는 일이 없다(edit-spec-v3.md §4). 워커는 두 큐를 같은 처리기로 소비하고 스펙 버전이 경로를 가른다.
  `env-spec.ts` · `.env.example` · `docker-compose.yml` 에 넣었다(기본값이 있어 운영 주입은 필요 없다).
- **워커 렌더(`editor.edit_timeline`)** — 원본 길이를 재서 경계마다 `resolve_transition` 으로 해석한다(앱과 같은
  규칙·픽스처). `crossfade` 는 양쪽 컷을 여분 프레임으로 절반씩 늘려 정규화한 뒤 `xfade`·`acrossfade` 로 겹쳐 무비 길이가
  컷 길이의 합이 된다. `dip`·`flash` 는 각 컷 끝·앞의 `fade`(검정·흰색), `zoompunch` 는 들어오는 컷의 `zoompan`
  (1.08 → 1.0, easeOutCubic)이다. 빠진 경계를 hardcut 으로 채우지 않고 실패시킨다.
- **ffmpeg 함정 두 가지** — `xfade` 는 두 입력의 타임베이스가 같아야 해서 구간마다 마지막에 `settb=AVTB` 를 둔다(`fps` 가
  타임베이스를 다시 바꾸므로 그 뒤에). `zoompan` 은 출력 타임베이스를 1/fps 로 선언하면서 입력 pts 를 그대로 써서, 2초 컷이
  17분짜리가 되고 뒤의 `fps` 가 프레임을 복제하느라 메모리가 바닥났다 — 앞에서 `fps,settb=1/fps,setpts=N` 으로 맞춘다.
- **자동 검증**: API 487개(생성이 v3 스펙으로 `edit-v3` 큐에만 들어가고 작업 API 가 같은 스펙을 돌려주는 것 포함) · 워커
  164개(Docker 이미지, `REQUIRE_FFMPEG=1`) — 실제 ffmpeg 로 길이가 컷 합인지, 경계 프레임이 섞이고(crossfade) 어두워지고
  (dip) 확대에서 제자리로 오는지(zoompunch), 여분이 없으면 바로 넘기는지를 색으로 읽는다 · 모바일 `verify:mobile` 1211개.
- **로컬 끝-끝 확인** — 이 브랜치 코드를 마운트한 임시 편집 워커를 개발 인프라에 붙이고, 개발 계정의 실제 스냅 3개
  (0.5~2.5초씩, 경계에 사용자 `crossfade` 500ms · `dip` 400ms)로 무비를 만들어 서비스 함수로 생성했다. 워커가 `edit-v3` 에서
  받아 렌더·업로드까지 마쳤고(`done`), 결과는 1080×1920 · 6.04초, 경계 프레임이 각각 반씩 섞이고 어두워졌다. 확인 뒤 무비 ·
  작업 · 결과 영상 · 크레딧 예약 기록 · MinIO 파일 · 큐 항목을 지웠다(잔액 200 그대로).

## 2026-10-01 (이어서) — AI 가 경계마다 전환을 고르는 규칙 · `crossfade` 폴백을 `dip` 으로

사용자가 고르지 않은 경계에 서버가 넣는 전환을 스타일 기본값에서 규칙으로 바꿨다. 근거·기각한 대안은
[decisions/transition-director.md](./decisions/transition-director.md).

- **폴백(오너 결정)** — 앱은 컷을 기본으로 잘라 두지 않아 트림하지 않은 컷에는 여분 프레임이 없다(개발 DB 의 컷이
  전부 그랬다). 그대로면 감성의 `crossfade` 가 대부분 `hardcut` 이 되므로, `crossfade` 가 최소 길이보다 짧아지면
  `dip`(400ms)으로 다시 해석한다. 사전 `fallback` 한 값의 변경이라 앱 미리보기·API·워커가 같이 따른다. 공용 픽스처를
  17건으로 늘렸다(→ `dip`, `dip` 마저 안 들어가면 `hardcut`, 짧은 컷에 맞춰 줄어드는 `dip`). 워커 계약 테스트는 여분이
  없는 경계가 섞이지 않고 어두워지는 것을 색으로 본다.
- **규칙(`services/transition-director.ts`)** — 장면 전환(촬영 시각 30분 이상: 일상 `dip` 400 · 감성 `dip` 600 · 여행
  `flash` 200) → 여행의 첫 경계 `zoompunch` 300 → 같은 장면은 시드로(일상 `hardcut` · 감성 `crossfade` 800 80%/`dip`
  500 20% · 여행 `hardcut` 70%/`zoompunch` 20%/`flash` 10%). 시드는 경계 위치가 아니라 두 컷이 키라 다른 곳의 순서를
  바꿔도 이어진 두 컷의 전환은 그대로다. 컷 길이는 입력이 아니다(트림은 다시 고르지 않는다). 무비 id 가 시드에 들어가므로
  `POST /movies` 에 id 가 없으면 서버가 저장 전에 정한다.
- **스펙**: MOV-6 을 "프리셋이 AI 가 고르는 전환의 경향을 정한다"로, MOV-22 의 폴백 문장을 고쳤다.
- **자동 검증**: API 테스트 501개(규칙 10개 신규 · 경계 전환 테스트는 기대값을 규칙 함수로 계산해 시드 운에 기대지 않게) ·
  워커 164개(Docker 이미지, `REQUIRE_FFMPEG=1`) · 모바일 `npm run verify:mobile` 152 suites / 1211 tests · lint·typecheck.

## 2026-10-01 (이어서) — 앱: 경계별 전환 고르기와 미리보기(MOV-22, backlog A-11)

스튜디오에서 컷 사이 전환을 경계마다 보고 고를 수 있다. 기능 문서는
[apps/mobile/docs/features/movie.md](../apps/mobile/docs/features/movie.md) "Transitions between cuts".

- **데이터** — `SnapRef.transition`(종류 · 길이 · 주인 · 이끌던 다음 컷 `toSnapId`). 읽을 때 서버의 선택을 그대로 담고,
  보낼 때는 사용자 선택 중 아직 그 다음 컷으로 이어지는 것만 싣는다 — 순서를 바꿔 떨어진 경계는 서버가 다시 고른다.
  편집 기록은 컷 구성만 비교해 서버가 채워 준 선택을 바깥 편집으로 오인하지 않고, 렌더 이후 변경 감지와 되돌리기는
  전환까지 비교한다. 전환 사전과 해석 규칙은 앱에 사본을 두고(계약 패키지는 아직 앱 번들에 넣지 않는다 — B-5) 테스트가
  서버 사전과 공용 픽스처로 대조한다.
- **미리보기** — 무대가 경계를 렌더와 같은 규칙으로 맞춰 재생한다. `crossfade` 는 두 플레이어를 여분 프레임으로 겹치고
  위 슬롯만 페이드하며 그 동안 `renderToHardwareTextureAndroid` 를 켠다. `dip`·`flash` 는 색 오버레이, `zoompunch` 는
  들어오는 슬롯의 확대. 경계 직전 보고에서 남은 시간을 타이머로 채워 시작이 늦지 않게 했다. 멈추거나 건너뛰면 전환을
  치우고 시계가 가리키는 컷에 선다.
- **고르기** — 컷 줄 아래 경계마다 칩(자동은 청록, 직접 고름은 주홍, 고르는 중은 `…`). 누르면 `자동으로 고르기` + 다섯 전환
  시트. 고르면 시트가 닫히고 그 경계를 1초 전부터 재생한다. 들어가지 않는 선택은 `검게 넘기기로 보여요` 처럼 보일 모습을
  적는다. UX 용어표에 `전환`·`자동으로 고르기` 를 넣었다(화면에 "AI" 라는 말을 쓰지 않는다).
- **자동 검증**: 모바일 `npm run verify:mobile` 156 suites / 1262 tests(전환 사본 대조 31 · DTO · 편집 훅 · 재생 목록의 경계 계획 ·
  시트 행).
- **Android 에뮬레이터(API 35, dev 빌드, 로컬 API)** — 스냅 3개로 새 무비 → 서버가 고른 경계가 칩으로 읽혀 옴(일상 · 같은
  장면 → `바로 넘기기 · 자동`) → 칩 → 시트(`자동으로 고르기 · 지금 바로 넘기기`) → `겹쳐 녹이기` → `PATCH` 후 DB 에
  `crossfade 500 user`, 다른 경계는 `hardcut ai` → 칩이 `직접 고름` → 미리보기에서 트림하지 않은 컷의 `crossfade` 가
  어두워졌다 밝아지는 `dip` 으로 재생. 에뮬레이터는 평소에도 0.5초마다 무대가 검게 깜빡여 전환 그림의 판정은 실기기로 미뤘다
  (backlog A-11).

## 2026-10-01 (이어서) — 경계별 전환 실기기 확인(MOV-22 `구현됨`, backlog A-11)

오너의 Galaxy S22 Ultra(dev 빌드, 로컬 API, 이 브랜치 코드를 마운트한 임시 편집 워커)에서 확인했다.

| 확인 | 결과 |
|---|---|
| 서버 값 읽기 | 각 컷을 0.5~2.5초로 트림하고 경계를 사용자 `crossfade` 600 · `flash` 200 으로 바꾼 서버 값이 앱에 그대로 읽혀 왔다 — 눈금 6초, 칩 `겹쳐 녹이기 · 직접 고름` · `번쩍 넘기기 · 직접 고름` ✅ |
| `crossfade` 미리보기 | 두 영상이 움직이는 채로 겹쳐 섞인다. 검게 나오지 않는다 ✅ |
| `flash` 미리보기 | 흰 프레임을 지나 다음 컷 ✅ |
| 미리보기 = 결과물 | 앱의 `무비 만들기` 로 실제 생성(editSpec v3 · `edit-v3` 큐 · `crossfade:600`, `flash:200`) — 결과물 6.015초. flash 정점으로 두 영상을 맞추자(렌더 4.0초) crossfade 구간은 15fps 로 한 프레임 이내, flash 는 30fps 로 한 프레임 이내로 같은 흐름이었다 ✅ |
| 폰에서 고르기 | 칩 → 시트 → `확대하며 넘기기` → 시트가 닫히고 경계 1초 전부터 자동 재생, DB `zoompunch 300 user`, 칩이 확대 아이콘으로 ✅ |
| `zoompunch` 미리보기 | 경계 직후 첫 프레임이 확대돼 들어와 제자리로 돌아온다 ✅ |

- 정리: 테스트 무비 · 편집 작업 · 결과 영상 · 크레딧 예약 기록(잔액 200 그대로) · MinIO 파일 · 큐 항목을 지웠고, 폰과
  에뮬레이터 모두 다시 읽은 뒤 그 무비가 사라졌다. 임시 워커와 API 는 내렸다.
- 기록용 화면 녹화는 확인 뒤 지웠다(가족 영상이 담겨 있다).

## 2026-10-01 (이어서) — 컷 역할 사전(MOV-21 1단계, backlog A-11·A-7)

AI 편집 초안(MOV-21)을 시작했다. 상한·표시 시점·미업로드·빠진 스냅은 오너가 정했다([결정 §5](./decisions/auto-edit-draft.md)).

- **사전** — [`cut-role-vocabulary.json`](../packages/shared-types/src/cut-role-vocabulary.json): 역할 v1 일곱(계획 §3)과
  자리(`first`·`last`·`any`), 판단에 쓰는 신호와 그 출처(`capture`·`local`·`analysis`). 사용자에게 보이지 않는 값이라
  `label` 이 없고 앱 사본도 두지 않는다. 첫·마지막 자리는 `hook`·`closer` 로만 채우고, 컷이 하나면 `hook` 이다.
  분석이 꺼지면 분석 신호만 쓰는 `establish`·`detail` 은 판단할 수 없어 기본값 `body` 로 남는다.
- **TS** `cut-role.ts`(`cutRolesAllowedAt`·`isCutRoleJudgeable`) · **워커** `pipeline/cut_role.py`(`validate_role`) 와
  기동 검증 목록 `REQUIRED`. editSpec v3 의 `cuts[].role` 에 싣는 일은 초안 제안 API 와 함께 한다.
- **자동 검증**: API 514개(사전 대조·자리 규칙 13 신규) · 워커 173개(Docker 이미지, `REQUIRE_FFMPEG=1`, 9 신규) · 모바일
  `npm run verify:mobile` 156 suites / 1262 tests. `REQUIRED` 에서 새 사전을 빼면 `test_vocabulary` 가 실패하는 것을 확인했다.

## 2026-10-01 (이어서) — 무비 계약: 컷 구간의 주인(MOV-21 3단계, backlog A-11)

- **스펙** — MOV-22 에 "구간도 AI 가 자른 것이거나 사용자가 자른 것이고 무비에 남는다"를 넣었다. AI 가 자르는 것은 초안뿐이라
  직접 고른 무비와 이전 무비의 구간(스냅 전체 포함)은 사용자 것이다.
- **마이그레이션** `20261001010000_add_movie_clip_trim_owner` — `movie_clips.trim_owner`(`MovieArranger`, 기본 `user`). 전환의
  기본값 `ai` 와 반대인 이유는 지금까지의 구간이 모두 사용자가 정한 것이라서다.
- **계약** — 응답 컷에 `trimOwner` 를 항상 싣고, 입력은 선택(생략하면 `user`). 주인은 컷을 따라간다 — `arranger: ai` 정렬로 사용자
  전환이 떨어지는 컷도, 스타일만 바꿔 다시 저장하는 컷도 주인을 잃지 않는다. `openapi.json` · [api-spec.md](./api-spec.md) 갱신.
- **자동 검증**: API 520개(주인 계약 6 신규 — 정렬로 전환이 떨어지는 경로에서 주인을 빼면 실패하는 것을 확인) · 워커 173개(Docker,
  `REQUIRE_FFMPEG=1`) · 모바일 `npm run verify:mobile` 156 suites / 1262 tests. 앱은 아직 `trimOwner` 를 보내지 않으므로 앱의
  저장은 모두 `user` 다 — 초안 흐름(5단계)에서 붙인다.

## 2026-10-01 (이어서) — 스냅 로컬 신호(MOV-21 4단계, backlog A-11)

- **워커** [`pipeline/snap_signals.py`](../apps/ai-worker/src/pipeline/snap_signals.py) — 밝기 · 흐림(라플라시안 분산) · 대표 프레임
  셋의 8×8 평균 해시 · 100ms 마다의 움직임 · silero VAD 발화 구간. 모델을 부르지 않고 새 의존성도 없다(numpy · VAD 는
  faster-whisper 에 이미 있다). 합성 3초 클립 하나에 0.35초.
- **렌디션 워커** — 렌디션을 반영한 뒤 받아 둔 원본으로 신호를 계산해 `video_signals` 에 upsert 한다. 신호가 실패해도
  렌디션은 성공이다. `only: "signals"` 작업은 렌디션 없이 신호만 계산한다(예전 스냅용, 적재는 초안 API 에서).
- **DB** `20261001020000_add_video_signals` — 스냅당 한 행, `signals_version`. 지운 스냅에는 쓰지 않고, 스냅 파일 purge
  (만료·회수 배치) 때 함께 지운다. 분석 동의와 무관하다.
- **자동 검증**: 워커 196개(Docker, `REQUIRE_FFMPEG=1`, 23 신규 — 검은 화면은 어둡고, 흐린 사본은 선명도가 1/10 아래로
  떨어지되 해시는 같고, 정지 화면은 움직임이 0, 가로 스냅도 같은 짧은 변으로 읽고, 무음은 발화가 없다) · API 522개(purge 2
  신규) · 모바일 1262 tests. `save_signals` 의 SQL 은 `snaply_test` 에 실제로 써서 삽입 · 덮어쓰기 · 지운 스냅 거부를 확인했다.
  두 마이그레이션은 `prisma migrate diff` 로 스키마와 어긋나지 않음을 확인했다(남은 차이는 이전 테이블의 기본값·인덱스
  이름뿐이다).
- 문턱값은 아직이다 — 실제 스냅의 분포로 정한다(backlog A-11).

## 2026-10-01 (이어서) — 편집 초안 제안 API(MOV-21 5단계, backlog A-11)

- **선택 단계** [`edit-director.ts`](../apps/api/src/services/edit-director.ts) — 거르기(절반 한도) · 중복(연쇄) · 10컷을 넘으면 촬영
  흐름을 묶음으로 나눠 고르기 · 촬영순 · 역할 · 스타일별 길이와 여분 · 발화를 자르지 않고 움직임이 큰 창. 규칙과 시드만 쓰는 순수
  함수다. 문턱값은 잠정값(`DRAFT_THRESHOLDS`).
- **규칙을 고친 곳**([edit-director.md](./decisions/edit-director.md)): 검사 없는 스냅(업로드 전 · 신호 없음)은 자리를 먼저 차지하고 남은 자리를
  고른다 — "그 스냅이 든 묶음은 그것을 고른다"는 한 묶음에 둘이 들면 하나가 빠졌다. `action` 은 움직임이 중앙값보다 커야 한다.
  구간 창은 걸친 만큼만 움직임을 세고, 발화 끝점에 맞춘 창도 후보에 넣는다.
- **API** `POST /movie-drafts` — 동기. 업로드된 스냅 `{ videoId }` 와 업로드 전 스냅 `{ localId, capturedAt }`. 상한 30개
  (`TOO_MANY_SNAPS`+`max`) · 24시간 10번(`DRAFT_LIMIT`) · 같은 요청 재사용(신호가 다 있었던 제안만). 신호가 없는 스냅은 렌디션 큐에
  `only: "signals"` 로 적재한다. vision 은 부르지 않고 이미 있는 분석만 얹는다. 분석 동의 철회 때 초안 기록도 지운다.
- **DB** `20261001030000_add_movie_drafts`. 계약 `contract/movie-drafts.ts` · `openapi.json` · [api-spec.md](./api-spec.md).
- **자동 검증**: API 556개(규칙 25 · API 9 신규 — 제안 그대로 `POST /movies` 가 `trimOwner: ai` 로 받는 것 포함) · 모바일 1262 tests.
  세 마이그레이션 모두 `prisma migrate diff` 로 스키마와 어긋나지 않는다.

## 2026-10-01 (이어서) — 앱: 자동 편집(MOV-21 6단계, backlog A-11)

화면 흐름은 오너와 정했다 — 스튜디오 블록 하나, 스타일은 마지막 무비의 것, 실패는 안내 + 다시 시도.

- **컷 구간의 주인** — `SnapRef.trimOwner`(`ai` 일 때만 있고 없으면 사용자 것). 구간을 끌거나 `전체 사용` 을 누르면 사용자 것이
  된다(`withTrim`·`withoutTrim`). 보낼 때 `ai` 만 싣고, 읽어 올 때 서버 값을 따른다.
- **제안으로 무비 만들기** — `entities/movie` 의 `requestMovieDraft`(목업 모드 포함) · `compose-movie` 의 `startMovieFromDraft`: 촬영순으로
  업로드된 스냅은 `videoId`, 업로드 중인 스냅은 `localId`+촬영 시각으로 보내고, 답의 컷으로 `arranger: ai` 무비를 만든다. 넣지 않은
  스냅은 무비에 기기 전용(`Movie.leftOut`)으로 남긴다.
- **화면** — 스튜디오 `스냅 골라 자동 편집` → `/snaps?select=draft`(상한 30, `자동 편집 · 최대 30개`) → `자동으로 편집하기`(요청 중
  `편집하는 중…`, 고르기·해제·삭제·취소·뒤로가기 잠금) → 편집 화면. 실패는 선택 바에 `자동 편집을 하지 못했어요.` + `다시 시도`, 하루 한도는
  `오늘은 자동 편집을 다 썼어요.` + `이 스냅으로 새 무비`(10개 이하일 때). 편집 화면 위에 `스냅 N개는 넣지 않았어요 · 다시 넣기 · ✕`,
  `다시 넣기` 는 컷 추가 화면의 `?only=left-out`.
- **문서**: 모바일 기능 문서 `studio.md`·`movie.md`·`snaps.md`·`app-shell-and-navigation.md`·`README.md`, UX 용어표에 `자동 편집`.
- **자동 검증**: 모바일 `npm run verify:mobile` 160 suites / 1296 tests(신규 — 구간 주인 왕복 · 제안 매핑 · `startMovieFromDraft` 8 ·
  선택 바 확정 상태 9 · 선택 바 대기 2 · 넣지 않은 스냅 4 등). **기기·에뮬레이터에서는 아직 보지 않았다**(backlog A-11 실기기 확인).

## 2026-10-01 (이어서) — 자동 편집 에뮬레이터 확인(MOV-21, backlog A-11)

개발 DB 에 이 브랜치의 마이그레이션 셋(`trim_owner` · `video_signals` · `movie_drafts`)을 `migrate deploy` 로 적용했다(대상이 `snaply` 인 것을
먼저 확인). 로컬 API 와 이 브랜치 코드를 넣은 편집·렌디션 워커 컨테이너, Android 에뮬레이터(`snaply_api35`, dev 빌드)로 확인했다.

| 확인 | 결과 |
|---|---|
| 렌디션 뒤 신호 | 대기 중이던 렌디션이 신호를 저장했다. 신호가 없던 업로드 스냅은 초안 요청이 `only: "signals"` 로 적재해 렌디션 워커가 계산했다 ✅ |
| 진입 | 스튜디오 `스냅 골라 자동 편집` → `자동 편집 · 최대 30개` → `자동으로 편집하기` → `POST /movie-drafts` 200 → `POST /movies` 201 → 편집 화면(`찍은 시각 순`) ✅ |
| 초안 내용 | 신호가 있는 스냅은 규칙대로 잘렸다(일상 `closer` 2.5초 · `hook` 1.5초), 신호가 없던 스냅은 스냅 전체(`complete=false` 라 재사용 안 함). 서버 컷 전부 `trim_owner=ai`, 전환은 서버가 골랐다(9/29→9/30 장면 전환에 `dip 400`) ✅ |
| 구간을 고치면 | 4번 컷 왼쪽 핸들을 끌자 `사용 2.5초`, `PATCH` 후 그 컷만 `300–2800 user`, 나머지는 `ai` ✅ |
| 넣지 않은 스냅 | 한 스냅의 밝기 신호를 잠시 0.01 로 바꿔 초안 → `스냅 1개는 넣지 않았어요 · 다시 넣기` → `넣지 않은 스냅` 화면에 그 스냅만 → 넣자 6컷, 안내 사라짐, 서버에 `user` 스냅 전체 ✅ (신호는 되돌렸다) |
| 실패 | API 를 내린 채 요청 → 선택 유지, `자동 편집을 하지 못했어요.` · `다시 시도` ✅ |
| 하루 한도 | 시험 기록 6행을 넣어 10회에 맞춤 → `오늘은 자동 편집을 다 썼어요.` · `이 스냅으로 새 무비` → `user` 무비 ✅ (시험 기록은 지웠다) |

- **고친 버그**: 스튜디오의 같은 줄을 두 번째 누르면(무비를 하나 만든 뒤) 스냅 탭이 고르기가 아니라 보기로 열렸다. 탭이 마운트된 채 같은
  `?select=` 가 오면 내비게이션이 같은 중첩 params 를 다시 적용하지 않아 prop 이 바뀌지 않는다. 기존 `스냅 골라 새 무비`(`?select=1`)도
  같았다. 요청마다 `?at=` 토큰을 붙여 고쳤다 — 토큰을 빼면 다시 보기로 열리는 것까지 에뮬레이터에서 확인했다.
- 정리: 시험 무비 6편은 앱의 무비 탭에서 지웠다(서버도 삭제됨). 시험용 `movie_drafts` 행은 모두 지웠다. 계산된 `video_signals` 는 실제 스냅의
  값이라 남겼다.
- 휴대폰에서 초안 → 구간·전환 수정 → 생성 → 결과물이 편집 화면과 같은지는 에뮬레이터로 판정할 수 없어(서버 사본을 검게 그린다)
  다음 절에서 실기기로 확인했다.

## 2026-10-01 (이어서) — 자동 편집 실기기 확인(MOV-21, backlog A-11)

오너의 Galaxy S22 Ultra(dev 빌드, 이 브랜치의 Metro, 로컬 API, 이 브랜치 코드를 넣은 편집·렌디션 워커)에서 확인했다.

| 확인 | 결과 |
|---|---|
| 초안 | 스냅 6개 → `자동으로 편집하기` → 6컷, 모든 컷 `ai` 구간(신호가 다 있어 전부 잘렸다) ✅ |
| 고치기 | 경계 1→2 를 `겹쳐 녹이기`(500ms, `user`), 6번 컷 왼쪽 핸들을 끌어 `사용 2.2초`(`user`) ✅ |
| 생성 | `무비 만들기` → editSpec v3 의 컷 구간·전환이 편집한 무비와 하나하나 같았다(`600–2800`, `crossfade 500`, 서버가 고른 `dip 400`) ✅ |
| 결과물 | 11.77초(컷 합 11.7초). 컷마다 가운데 프레임이 **자기 구간의 가운데**와 맞았다(오차 1.6–12.8, 다른 스냅 ≥60, 같은 스냅 다른 위치 15–79). 1.5초의 경계 프레임은 두 컷의 50:50 섞임에 가장 가까웠고(5.9, 한쪽만 ≈27) — 초안이 남긴 여분 프레임으로 실제로 겹쳤다 — 5.5초의 `dip` 은 밝기 0 ✅ |
| 미리보기 = 결과물 | 편집 화면 무대를 녹화해 결과물 프레임열과 맞추자 오프셋이 맞을 때만 오차가 낮았다(0.34, ±0.2–0.5초 어긋나면 0.52–0.76). 컷1 → 겹쳐 녹이기 → 컷2 → 컷3 내내 0.23–0.37(녹화의 색·축소·압축 차이). `dip` 근처는 거의 검은 프레임이라 정규화 비교가 크게 나온다(0.60) ✅ |

- **고친 것 두 가지**:
  - 서버가 고른 구간이 50ms 격자(예: 250·2750)라, 앱(100ms 격자)에서 한쪽 핸들을 끌자 건드리지 않은 끝이 2750 → 2800 으로 움직였다.
    창을 앱의 트림 격자 위에 놓게 고쳤고(`ac183b2`), 폰에서 왼쪽 핸들을 끌어도 끝이 2700 그대로인 것을 확인했다.
  - 같은 요청 24시간 재사용이 규칙을 고친 뒤에도 예전 제안을 돌려줄 수 있었다. 재사용 키에 규칙 버전(`EDIT_DIRECTOR_VERSION`)과 신호 버전을
    넣었다(`886f527`).
- 측정 방법: 결과물과 원본은 워커 이미지의 ffmpeg 로 72×128 회색 프레임을 뽑아 평균 절대 오차로 비교했고, 미리보기는 `adb shell screenrecord`
  를 무대 영역만 잘라 같은 방식으로 정규화해 비교했다.
- 시험 무비 두 편(생성한 `무비 10-01` · 초안 `무비 10-01 (2)`)과 생성에 쓴 크레딧 100 은 남아 있다 — 정리는 오너 확인 뒤.
- 거르기·중복 문턱값 실측(시험 스냅 촬영 뒤)은 backlog A-11 에 있다.

## 2026-10-02 — 자동 편집 리뷰 후속: 발화 구간 · 신호 시간 제한(MOV-21, backlog A-11)

머지된 자동 편집을 다시 읽다가 찾은 결함 셋을 고쳤다. 규칙은 [edit-director.md](./decisions/edit-director.md) §7 · §8.1 에 반영했다.

- **발화가 격자 밖이면 잘렸다** — 창이 발화를 담는지를 발화 길이(`up(끝 − 시작)`)로 따져, 끝점이 100ms 격자 밖이면(VAD 구간은
  대개 그렇다) 담는 창이 하나도 없었다. 그때는 "시작이라도 담기"로도 가지 않고 움직임만으로 골랐다. 3초 일상 스냅의 발화
  `350–2350` 이 `700–2700` 으로 잘렸다. 발화를 덮는 격자 구간 `[down(시작), up(끝)]` 으로 따지게 고쳤다.
- **앞 여분 안에서 시작한 발화는 보지 않았다** — 찍자마자 말한 스냅(발화 `0–1500`)이 `700–2700` 으로 잘렸다. 그 컷만 앞 여분을
  발화 시작까지 줄인다. 뒤 여분은 그대로다(끝이 잘리는 것은 받아들인다).
- 규칙이 바뀌어 `EDIT_DIRECTOR_VERSION` 을 3 으로 올렸다 — 24시간 재사용 창이 예전 제안을 돌려주지 않는다.
- **늦은 신호 계산이 렌디션을 `failed` 로 덮었다** — 렌디션 작업의 시간 제한 안에서 신호까지 돌아, 신호가 늦으면 반영한
  렌디션이 `failed` 가 되고 작업이 재시도됐다. 신호는 렌디션 뒤 따로 제한을 받는다(`_render` 를 제한 안에, `_record_signals`
  는 따로).
- **자동 검증**: API 567개(5 신규) · typecheck · lint · 워커 198개(Docker 이미지 `snaply-ai-worker:local` 에 소스를 마운트, `REQUIRE_FFMPEG=1`, 2 신규) ·
  새 테스트는 고치기 전 코드에서 실패하는 것을 확인했다(API 4개 · 워커 1개 — 나머지 2개는 지켜야 할 기존 동작의 고정).

## 2026-10-02 (이어서) — 대표 프레임 해시의 자리(backlog E-16)

워커가 대표 프레임(25·50·75%) 중 뽑지 못한 위치를 건너뛰어 `frame_hashes` 에 둘만 남길 수 있었고, 편집 초안의 중복 판정은 두 스냅의
해시를 인덱스끼리 비교해 다른 위치의 프레임끼리 거리를 쟀다. 2초 클립을 3초로 읽게 하면 75%(2.25초) seek 가 끝을 넘는데, ffmpeg 는
종료 코드 0 으로 끝나고 파일만 쓰지 않는 것을 워커 이미지에서 확인했다.

- **워커** — 뽑지 못한 위치를 `None` 으로 남기고(`_detail_frames`), 하나라도 비면 해시를 비운다(`representative_hashes`). 선명도는
  뽑은 프레임으로 잰다.
- **API** — 대표 프레임 셋(`FRAME_HASH_COUNT = 3`, 워커의 `HASH_POSITIONS` 와 대조하는 테스트)을 다 가진 스냅끼리만 중복을 잰다.
  이 규칙 전에 저장한 둘짜리 목록도 빈 목록처럼 중복 검사에서 빠지므로 `SIGNALS_VERSION` 은 올리지 않았다
  ([edit-director.md](./decisions/edit-director.md) §2.2 · §8.1). `EDIT_DIRECTOR_VERSION` 은 같은 PR 에서 이미 3 으로 올렸다.
- **자동 검증**: API 569개(2 신규 — 둘짜리 목록 테스트는 고치기 전 비교에서 실패) · typecheck · lint · 워커 201개(Docker,
  `REQUIRE_FFMPEG=1`, 3 신규 — 비우기 두 개는 고치기 전 동작에서 실패, 순서 하나는 기존 동작의 고정).

## 2026-10-03 — 편집 초안의 스냅 상한을 서버에서 배운다(backlog E-15)

앱이 편집 초안의 스냅 상한을 30 으로 박아 두고, 서버의 `400 TOO_MANY_SNAPS` 를 다른 실패처럼 받아 `다시 시도` 를 보여 줬다 — 서버
상한(잠정값)을 낮추면 그 사이 개수를 고른 사용자는 다시 시도해도 계속 거절됐다. 계약은 상한을 스키마에 걸지 않고 `max` 로 답해
앱이 하드코딩하지 않게 해 두었는데 앱이 그 값을 읽지 않았다.

- **`features/compose-movie`** — `TOO_MANY_SNAPS` 를 `too-many` 거절로 받고 `max` 를 싣는다(`readDraftSnapLimit`, 크레딧 부족분의
  `readCreditShortfall` 과 같은 방식 — 전송층은 `details` 를 그대로 나르고 이 슬라이스가 좁힌다).
- **`pages/snaps`** — `useEditDraft` 가 서버가 말한 상한을 기억하고(스냅 탭이 살아 있는 동안), 고르기 상한 · 거절 문구 · 확인 버튼이
  그 값을 따른다. 상한을 넘은 고르기는 `자동 편집에는 스냅 N개까지 넣을 수 있어요. M개를 빼 주세요.` 와 함께 버튼이 꺼진다 —
  `다시 시도` 는 보이지 않는다. `useEditDraft` 의 `start` 는 만든 무비를 돌려주고 화면이 연다(고르기 상한을 정하기 전에 훅이 있어야 해서).
- 앱 기능 문서 [studio.md](../apps/mobile/docs/features/studio.md) · [snaps.md](../apps/mobile/docs/features/snaps.md) 갱신.
- **자동 검증**: `npm run verify:mobile` 162 suites / 1309 tests(format · lint · typecheck 포함) · 새 테스트 중 `TOO_MANY_SNAPS` 두 경우는 고치기 전 코드에서 `unreachable` 로 실패하는
  것을 확인했다. 실기기 확인은 하지 않았다 — 서버 상한이 30 이라 지금 앱에서는 이 거절이 나지 않는다.

## 2026-10-03 (이어서) — 서버가 쓸 수 없는 스냅을 따로 알린다(backlog E-14)

`POST /movie-drafts` 는 넘긴 업로드 스냅 중 하나라도 `ready` · 삭제되지 않은 자기 스냅이 아니면 요청 전체를 403 으로 거절했다. 다른
기기에서 지웠거나 보관 기간이 끝났는데 이 기기는 아직 `uploaded` 로 아는 스냅이 섞이면, 앱은 `다시 시도` 를 보여 줬지만 다시 물어도
같은 거절이었다.

- **API** — 남의 id · 없는 id 는 그대로 요청 전체가 403(어느 것인지 알리지 않는다). 자기 스냅이지만 지워졌거나 준비되지 않은 것은
  빼고 응답의 새 필드 `unavailable` 로 알린다 — `excluded` 가 아니다, 앱이 다시 넣으라고 권하기 때문이다. 나머지로 초안을 만들고
  재사용 키와 시드도 나머지만으로 따져, 스냅이 사라진 뒤에는 그 스냅을 담은 예전 제안이 재사용되지 않는다. 모두 쓸 수 없으면 컷
  없이 돌려주고 기록하지 않는다(횟수에 세지 않는다). 계약 · `openapi.json` · [api-spec.md](./api-spec.md) · 스펙 MOV-21 ·
  [edit-director.md](./decisions/edit-director.md) §8.2 갱신.
- **앱** — `unavailable` 을 읽고(없는 예전 서버는 빈 목록), 넘긴 스냅을 서버가 하나도 쓸 수 없으면 `unavailable` 거절로
  `고른 스냅을 자동 편집에 쓸 수 없어요. 다른 스냅을 골라 주세요.` 를 보이고 고르기가 바뀔 때까지 버튼을 끈다. 일부만 그렇다면
  나머지로 무비를 만들고 그 스냅은 다시 넣기로 권하지 않는다. [studio.md](../apps/mobile/docs/features/studio.md) 갱신.
- **자동 검증**: API 574개(5 신규) · typecheck · lint · `npm run verify:mobile` 162 suites / 1314 tests(5 신규). 새 API 테스트는 고치기 전
  서비스에서 실패하고(403 · 계약의 `unavailable` 없음), 앱의 "모두 쓸 수 없음" 테스트는 고치기 전 코드에서 `unreachable` 로 실패했다.
  실기기 확인은 하지 않았다.

## 2026-10-03 (이어서) — 끝난 신호 작업을 다시 적재한다(backlog E-13)

편집 초안은 신호가 없는 스냅의 신호 계산을 `signals-<videoId>` 로 적재하는데, 렌디션 큐는 끝난 작업을 남겨 두고 같은 job id 의 적재를
무시한다. 그래서 그 작업이 한 번 끝나면 — 재시도를 소진했든, 읽을 수 없는 파일이었든 — 그 스냅은 다시 계산되지 않았고, 그 스냅이 든
초안은 매번 `complete: false` 로 새 행을 만들어 같은 요청마다 하루 한도를 썼다.

- **워커** — 읽을 수 없는 파일(`SignalsError`)로 끝난 신호 작업이 결과에 신호 버전을 남긴다(`{ status: 'failed', signalsVersion }`).
- **API** — `enqueueSignals` 가 남아 있는 작업의 상태를 본다. 기다리거나 도는 중이면 그대로 두고, 끝났으면(재시도 소진 · 신호를
  남기지 못하고 끝남 · 다른 버전이나 버전 없이 읽지 못함) 지우고 다시 넣는다. 이 신호 버전으로 읽을 수 없다고 끝난 스냅은 다시
  돌리지 않고 "검사 없음"으로 확정한다 — 초안은 신호를 **기다리는** 스냅이 없으면 `complete` 라 재사용되고 한도를 쓰지 않는다.
  적재는 스냅마다 순서대로 기다리지 않고 함께 보낸다. 실패의 기록은 큐의 끝난 작업에 둔다(마이그레이션 없음 — 큐가 오래된 작업을
  지우면 한 번 더 계산할 뿐이다). [edit-director.md](./decisions/edit-director.md) §8.2 · [api-spec.md](./api-spec.md) 갱신.
- **자동 검증**: API 579개(5 신규 — 테스트가 워커처럼 작업을 끝내 두고 요청한다. 다섯 모두 고치기 전 코드에서 실패) · typecheck ·
  lint · 워커 201개(Docker, `REQUIRE_FFMPEG=1`, 읽지 못한 결과에 신호 버전이 실리는지 단언 추가).

## 2026-10-03 (이어서) — 자동 편집 리뷰의 나머지(MOV-21, backlog A-11)

2026-10-02 리뷰에서 backlog 로 옮기지 않았던 나머지 항목이다.

- **하루 한도가 동시 요청에 뚫렸다** — 한도를 계산 전에 세고 계산 뒤에 기록해, 동시에 온 요청들이 같은 남은 횟수를 보고 모두
  기록됐다. 기록할 때 사용자별 잠금(`pg_advisory_xact_lock`, 쿨다운 슬롯과 같은 방식) 안에서 다시 세어 집행한다. 앞의 확인은
  계산을 아끼는 빠른 거절로 남겼다. 템플릿 추천의 하루 한도도 같은 모양(세고 나서 만들기)이라 같은 경합이 있다 — 이번 범위 밖이다.
- **막 올린 스냅의 신호를 두 번 계산했다** — 렌디션이 아직 돌지 않은 스냅에도 신호 전용 작업을 넣어, 원본을 두 번 받아 두 번
  계산했다. 렌디션 작업이 기다리거나 도는 중이면 넣지 않는다(렌디션이 신호도 계산한다).
- **문서** — 점수·거르기의 `quality` 는 선명도이고 밝기는 어둠 문턱값에만 쓴다고 [edit-director.md](./decisions/edit-director.md)
  §2.1 · §4 를 구현에 맞췄다(밝기를 점수에 넣을지는 A-11 실측과 함께). 선택 단계가 정한 가운데 컷의 역할이 어디에도 실리지 않는
  것은 코드를 걷어 내지 않고 A-11 의 후속으로 적었다 — 결정 §6 의 규칙이고, editSpec 의 `cuts[].role` 로 싣기로 했던 일이 빠진
  것이다. 진행 기록의 두 "남은 것" 줄을 사실에 맞게 고쳤다(하나는 이미 실기기로 확인했고, 하나는 backlog 에 있다).
- **자동 검증**: API 581개 · typecheck · lint · 새 테스트 2개(동시 요청 · 렌디션 대기)는 고치기 전 코드에서 세 번 모두 실패했다.

## 2026-10-03 (이어서) — 무비 생성의 402 가 부족분 숫자를 싣는다(backlog E-9)

무비 생성 `POST /movies/{id}/export` 의 402 응답이 계약에서 `apiErrorSchema` 로 선언돼, 서버가 `INSUFFICIENT_CREDITS` 에 싣는
`required`·`balance` 가 응답 직렬화에서 지워졌다(선언되지 않은 키는 지워진다). 앱은 그 두 숫자로
`크레딧이 부족해요 · {balance}/{required}.` 를 그리게 돼 있었지만 이 경로에서는 숫자 없는 문구만 나왔다.

- **계약** — export 의 402 를 `POST /edit-jobs` 와 같은 `paymentRequiredErrorSchema` 로 선언했다. `openapi.json` · [api-spec.md](./api-spec.md) 갱신.
- **앱** — 코드는 바꾸지 않았다(`readCreditShortfall` 가 이미 읽는다). 기능 문서
  [credits-and-rewarded-ads.md](../apps/mobile/docs/features/credits-and-rewarded-ads.md) · [movie.md](../apps/mobile/docs/features/movie.md) 를
  고치고 `Partial` 을 풀었다 — 이 경로로는 아직 실기기에서 숫자를 보지 않았다는 단서를 달았다.
- **자동 검증**: API 582개 · typecheck · lint · `npm run verify:mobile` 162 suites / 1314 tests · 새 테스트(크레딧 하나 모자란 export → 402 + `required`·`balance`)는 고치기 전 계약에서 실패했다.

## 2026-10-06 — 운영 compose 호출이 시크릿 파일을 넘긴다(backlog B-1)

사내 서버 배포(B-1)는 아직 켜지 않았다(`DEPLOY_ENABLED` 없음 — 서버 배포 잡은 매번 건너뛰었다). 켜기 전에 배포 경로를 다시 읽다가,
켜는 순간 배포 · 배치 · 백업이 모두 멈출 결함 넷을 찾았다.

- **`--env-file` 이 없었다** — `docker-compose.prod.yml` 의 `${POSTGRES_PASSWORD:?}` 같은 치환은 셸 환경과 `--env-file` 만 읽고,
  서비스의 `env_file` 은 컨테이너 안의 값만 정한다. 배포 워크플로와 `deploy/run-batch.sh` · `deploy/backup-db.sh` 가 compose 를
  `--env-file` 없이 불러, 시크릿 파일이 있어도 `required variable … is missing a value` 로 멈췄다. 모든 호출에 넘긴다.
- **배치가 이미지 태그를 compose 에 넘기지 못했다** — `run-batch.sh` 가 `deploy/.current-images` 를 `.` 로 읽기만 하고 내보내지
  않아 자식 프로세스인 compose 가 태그를 보지 못했다. `set -a` 로 읽는다. `backup-db.sh` 는 태그를 아예 읽지 않았는데, postgres 에
  exec 만 해도 compose 는 파일 전체(`API_IMAGE:?` 포함)를 해석하므로 같은 방식으로 읽는다.
- **태그 기록이 cron 이 읽는 곳에 없었다** — 워크플로가 `.current-images` 를 runner 의 작업 폴더에 써, cron 이 도는 `/opt/snaply`
  에서는 찾을 수 없었다. `/opt/snaply/deploy/.current-images` 에 쓴다.
- **시크릿 파일 권한** — 절차가 `600 root:root` 로 만들게 했는데 runner · cron 은 `snaply` 로 돌고 compose 는 이 파일을 부른 쪽에서
  읽는다. `640 root:snaply` 로 바꿨다(`snaply` 는 `docker` 그룹이라 root 전용으로 둬도 막아 주는 것이 없다). 워크플로는 compose 를
  부르기 전에 파일을 읽을 수 있는지 먼저 확인한다.
- [archive/deployment-on-prem.md](./archive/deployment-on-prem.md) §1-2 · §2 · §4 · §5 와 backlog B-1 의 서버 작업 항목을 함께 고쳤다. 배포는 `/opt/snaply`
  체크아웃을 갱신하지 않으므로 `deploy/` 를 고친 커밋이 들어오면 거기서 `git pull` 한다는 절차도 적었다.
- **검증**: 더미 시크릿 파일로 `docker compose config` 를 돌려 `--env-file` 없이는 치환에서 멈추고 있으면 통과하는 것을 확인했다.
  두 스크립트를 `docker` 대역(인자 · 환경을 기록하고 같은 인자로 `compose config` 를 돌린다)으로 실행해, main 의 스크립트는 태그 없이
  치환에서 멈추고 고친 스크립트는 `--env-file` 과 태그를 넘겨 통과하는 것을 확인했다. `bash -n` · shellcheck 통과, actionlint 는
  main 과 같은 기존 경고만 남는다. 실제 서버에서는 아직 돌려 보지 않았다(서버 준비 전).

## 2026-10-07 — 템플릿 추천의 하루 한도가 동시 요청에 뚫리지 않는다(REC-3, backlog A-6)

2026-10-03 편집 초안의 하루 한도를 고칠 때 "같은 모양이라 같은 경합이 있다 — 이번 범위 밖"으로 남겼던 것이다. backlog 에 올라가
있지 않았다.

- **결함** — `POST /movie-recommendations` 가 하루 횟수를 센 뒤 잠금 없이 추천을 만들어, 남은 한 번을 동시에 다툰 요청 다섯이 모두
  202 를 받았다(한도 20 을 넘겨 24). 같은 후보 집합을 동시에 보내면 재사용 대신 추천이 여러 개 생겼다.
- **고침** — 기록할 때 사용자별 잠금(`pg_advisory_xact_lock`, 편집 초안과 같은 방식) 안에서 재사용할 추천을 다시 찾고 횟수를 다시
  센다. 앞의 확인은 분석을 적재하기 전의 빠른 거절로 남겼다. 잠금 안에서 거절된 요청도 후보 분석은 이미 적재했다 — 빠른 확인을 함께
  지난 요청에서만 생기고, 분석은 스냅마다 한 번이라 다음 추천이 그 결과를 쓴다.
- **자동 검증**: API 584개 · typecheck · lint. 새 테스트 2개(동시 요청 다섯 → 202 하나 · 429 넷, 같은 후보 동시 세 번 → 추천 하나)는
  고치기 전 코드에서 둘 다 실패했고 고친 뒤 세 번 연속 통과했다.

## 2026-10-07 (이어서) — Python 워커가 Node 에서 보인다(backlog E-11 닫음)

Node BullMQ 의 `Queue.getWorkers()` 는 `CLIENT LIST` 에서 `bull:<base64 큐 이름>`(또는 `…:w:<이름>`)으로 이름 붙은 연결을 워커로
센다. Python bullmq 2.14 는 연결에 이름을 붙이지 않아, 떠 있는 분석 워커가 `scripts/analysis-run.mjs` 에 늘 0개로 보였다.

- **워커** — 세 워커(편집 · 렌디션 · 분석)가 `queue_connection.worker_connection()` 으로 Redis URL 에 `client_name=bull:<base64>:w:<호스트>-<pid>`
  를 얹는다. redis-py 가 연결을 열 때마다 `CLIENT SETNAME` 을 보내므로 다시 접속한 연결도 같은 이름이다. 다른 쿼리 인자는 그대로 둔다.
- **스크립트** — 워커 하나가 연결을 여럿 연다(일반 · 블로킹 · 동시 처리만큼). `getWorkers()` 의 길이가 아니라 연결 이름을 중복 없이 세어
  프로세스 수를 낸다.
- **검증**: 워커 이미지에서 Python 206 테스트(새 5개, CI 와 같은 `REQUIRE_FFMPEG=1 python -m unittest discover -s tests`). 개발 Redis 에
  시험용 큐(`e11-probe`)로 Python 워커(동시 처리 3)를 띄우고 Node `getWorkers()` 가 연결 3개 · 프로세스 1개로 세는 것을 확인한 뒤 큐 키를
  지웠다. 실제 분석을 적재하는 스크립트 경로는 키 비용이 들어 돌리지 않았다.

## 2026-10-07 (이어서) — 배포본이 촬영 시각을 싣는다(backlog E-12 닫음)

ffmpeg 은 원본의 전역 메타데이터를 출력에 옮기면서 `creation_time` 만은 일부러 지운다. 그래서 배포본에 촬영 시각이 없었고, 서버 사본을
앨범에 저장하면(SNAP-17) 갤러리가 저장한 날 자리에 놓았다.

- **고침** — 렌디션 변환이 `-metadata creation_time=…` 을 적는다. 원본의 태그가 먼저고, 없으면 앱이 보낸 촬영 시각(`videos.captured_at`,
  UTC)이다. 이미 만든 배포본은 다시 만들지 않으므로 그대로다.
- **찾은 것** — 같은 확인에서 원본의 위치 태그(`location`)는 배포본과 편집본에 **그대로 따라간다**는 것을 봤다. 정할 것이 있어 고치지 않고
  backlog E-17 로 올렸다.
- **검증**: 산출물 계약 테스트 2개(태그가 있는 원본 → 그 값, 태그가 없는 원본 → KST 로 준 촬영 시각이 UTC 로)와 워커 흐름 테스트 1개
  (변환이 행의 `captured_at` 을 받는다). 고치기 전 코드로 같은 원본을 변환해 `creation_time` 이 사라지는 것을 먼저 확인했다. Python 209 통과.
  실제 휴대폰 갤러리에서 저장 위치를 보는 것은 backlog A-4 앨범 저장 실기기 확인 ③ 에 남는다.

## 2026-10-07 (이어서) — 재생 화면은 테마와 상관없이 어둡다(backlog E-10 닫음)

전체 화면 재생(`shared/ui/video-player-modal`)의 바탕은 늘 검정인데, 하단 길이 표시만 테마 글자색을 따라 라이트 테마에서 거의 검은 글자가
됐다. 닫기 · 앨범에 저장 · 캡션은 흰색을 직접 적어 괜찮았다. 화면 전체를 `ThemeScope scheme="dark"`(촬영 · 스냅 추출 화면과 같은 방식)로 감쌌다.

- **검증**: `npm run verify:mobile` 163 suites / 1324 tests(이 변경 전부터 있던 lint 경고 1개). 색 값은 Jest 로 고정하지 않는다는 앱 규칙대로
  Android 에뮬레이터에서 봤다 — 라이트 테마에서 고치기 전 번들은 `3초` 가 검은 바탕에 거의 보이지 않았고 고친 번들은 흰 글자로 읽혔다.
  에뮬레이터의 테마는 원래대로 다크로 돌려 놓았다.

## 2026-10-07 (이어서) — 무비 컷이 사라진 사유를 싣는다(SNAP-12 `구현됨`, backlog A-4)

서버는 사라진 스냅을 쓰는 컷을 `unavailable` 로만 표시해, 다른 기기에서 지운 스냅의 컷이 그 기기의 무비 수정이 서버에 닿기 전 "보관 기간이
끝났어요"로 보였다. 사유는 서버가 이미 안다(`videos.removal_reason`).

- **계약** — 무비 컷에 `unavailableReason`(`user` · `expired` · `null`). `openapi.json` · [api-spec.md](./api-spec.md) 갱신. 사유 컬럼이
  생기기 전에 지워진 행은 `user` 다(`POST /videos/lookup` 과 같은 규칙).
- **앱** — 컷이 왜 쓸 수 없는지를 한 함수(`pages/movie/model/cut-gone.ts`)가 정하고 편집 화면 · 시청 화면이 그것으로 문구를 고른다.
  사유가 없는 `unavailable`(이 필드보다 오래된 서버, 그 전에 캐시한 무비)은 지금처럼 만료로 읽는다. 기능 문서
  [movie.md](../apps/mobile/docs/features/movie.md) 갱신.
- **자동 검증**: API 584개(사용자 삭제 → `user`, 만료 정리 → `expired`) · `npm run verify:mobile`(새 테스트: 판정 표 7가지, DTO 가 사유를 읽고
  모르는 사유는 버린다). 다른 기기에서 지운 스냅의 컷을 실기기에서 보지는 않았다 — 기기의 원본을 지워야 해서 개발 데이터로 하지 않았다.

## 2026-10-07 (이어서) — 무비 결과물이 찍은 곳을 싣고 나가지 않는다(backlog E-17 닫음)

ffmpeg 은 첫 입력의 전역 메타데이터를 출력에 옮긴다. 휴대폰 원본에는 찍은 곳(`location`) · 기기 · 소프트웨어 태그가 있어, 무비 결과물이
공유 · SNS 게시로 첫 컷을 찍은 좌표를 싣고 나갔다. 오너가 권장안대로 결과물에서 지우기로 했다.

- **고침** — 원본이 편집 파이프라인에 들어오는 유일한 자리인 컷 정규화(`editor.normalize_clip`, 예전 편집과 경계별 전환 편집이 함께 쓴다)에
  `-map_metadata -1` 을 붙였다. 이어 붙이기 · BGM · 자막 단계는 이 파일에서 시작하므로 끝까지 깨끗하다. 결과물에는 원래 촬영 시각 태그가 없어
  (ffmpeg 이 옮기지 않는다) 날짜가 달라지는 것은 없다.
- **배포본은 그대로** — 같은 계정의 기기만 받으므로 위치를 서버에 둘지(A-4)와 함께 본다. backlog A-4 위치 항목에 적었다.
- **검증**: 산출물 계약 테스트 1개 — 위치 · 기기 태그를 넣은 원본을 컷 편집 · 경계별 전환 편집 · BGM · 자막까지 돌려 세 산출물 모두 태그가 없다. 고치기
  전 코드로는 실패했다(2026-10-07 에 "최종 결과물로는 확인하지 않았다"고 적었던 것이 이 테스트로 확인됐다). 워커 이미지에서 Python 210 통과.

## 2026-10-07 (이어서) — 알림 설정은 계정에 있다(NTF-7 `구현됨`, backlog B-6 닫음)

앱의 무비 완성 · 위치 알림 스위치와 조용한 시간이 기기에만 저장돼, 사용자가 끈 알림을 서버가 계속 보냈다(서버는 2026-09-15 에 종류별
스위치를 받기 시작했다). 앱이 서버에 쓰기로 하면서 기본값도 어긋나 있었다 — 서버는 켜짐, 앱은 꺼짐에서 시작해 켤 때 권한을 묻는다. 오너가
"서버가 원천, 기본은 꺼짐"을 골랐다([decisions/notification-preferences.md](./decisions/notification-preferences.md) 같은 이름의 절,
기각한 대안 포함).

- **서버** — 위치 · 무비 알림의 기본값을 꺼짐으로 바꿨다(마이그레이션 `20261007000000_notification_kinds_default_off`). 앱이 쓴 적이 없어
  누가 고른 값이 아니었으므로 이미 있는 행도 꺼짐으로 되돌린다. 발송 테스트는 사용자를 명시적으로 켜고, 기본 꺼짐 테스트 둘을 더했다.
  스펙 NTF-6 · NTF-7, [api-spec.md](./api-spec.md), 계약 설명과 `openapi.json` 갱신.
- **앱** — 설정을 `GET /auth/me` 로 읽고 `PATCH /auth/me` 로 쓴다(`features/notification-settings` 의 `api/`). 바꾸면 곧바로 보이고 서버의 답이
  덮으며, 거절되면 되돌리고 "알림 설정을 바꾸지 못했어요. 다시 시도해 주세요." 를 띄운다. 늦게 온 이전 답은 더 새로운 변경을 덮지 않는다.
  읽기 전에는 화면의 조작을 막고, 위치 감시는 그대로 둔다(오프라인 시작에 OS 의 감시 영역을 지우지 않게). 계정에서 켜져 있는데 이 기기에 권한이
  없으면 지금 쓰는 "기기 설정에서 … 받을 수 있어요" 와 `설정에서 권한 켜기` 를 띄우고, 앱으로 돌아올 때마다 권한을 다시 읽는다.
- **기기에 남은 선택** — 저장소 persist v2 가 이전 빌드의 스위치 · 조용한 시간 중 기본값과 다른 것만 `legacyChoices` 로 옮기고, 앱이 계정에
  한 번 올린 뒤 지운다(`LegacyChoicesUploadGate`). 고르지 않은 기본값까지 올리면 다른 기기에서 고른 값을 덮는다.
- 기능 문서 [me.md](../apps/mobile/docs/features/me.md) · [location-and-push-notifications.md](../apps/mobile/docs/features/location-and-push-notifications.md) ·
  [movie.md](../apps/mobile/docs/features/movie.md) · [app-shell-and-navigation.md](../apps/mobile/docs/features/app-shell-and-navigation.md) 갱신.
- **자동 검증**: API 584개(기본 꺼짐 2개 포함) · typecheck · lint · `npm run verify:mobile` 164 suites / 1340 tests(이 변경 전부터 있던 lint 경고 1개).
  새 앱 테스트: 읽기 · 쓰기(즉시 반영 · 거절 시 되돌림 · 늦은 답 · 읽기 전), 두 스위치의 권한 규칙과 "켜졌는데 이 기기에 권한 없음", persist v2 이전
  표, 한 번 올리기(실패하면 남김), 위치 감시가 모르는 값에 손대지 않음, 설정 화면(읽기 전 막힘 · 거절 안내).
- **Android 에뮬레이터**(실제 로컬 API, 이 브랜치의 마이그레이션은 개발 DB 에 적용하지 않음): 시작하자마자 `GET /auth/me` 다음 기기에 남은 선택의
  `PATCH /auth/me` 가 한 번 갔고, 다시 실행하면 조회만 했다. 설정 화면이 계정 값을 보였고 무비 스위치 끄기 · 켜기와 조용한 시작 시각 22→23→22 가
  매번 DB 에 닿았다. API 를 내린 채 시각을 바꾸면 22:00 으로 돌아가고 거절 안내가 떴다. DB 값은 처음과 같게 끝났다.
- **남은 것**: 휴대폰에서 권한이 없는 새 기기로 "켜졌는데 권한 없음" 안내를 본 적은 없다(에뮬레이터는 권한이 이미 있었다,
  [backlog.md](./backlog.md) F). OS 설정에서 권한을 준
  뒤의 푸시 토큰 등록은 다음 실행이나 무비 스위치를 바꿀 때 일어난다 — 기능 문서 me.md 의 한계에 적었다.

## 2026-10-07 (이어서) — 지운 스냅을 보관 기간이 끝날 때까지 되살린다(SNAP-20, backlog A-4 휴지통 닫음)

"모든 기기에서 삭제"가 서버 파일과 모든 기기의 원본을 즉시 지워, 실수 한 번을 되돌릴 수 없었다. 결정 요청
[decisions/snap-trash.md](./decisions/snap-trash.md)의 권장안(① C · ② A · ③ A · ④ A · ⑤ C)을 오너가 채택했다 — 서버에 사본이 있던 스냅만,
원래 보관 기간(업로드 후 15일)이 끝날 때까지, 스냅만 되살린다. 스펙 SNAP-16 을 고치고 SNAP-20 을 새로 적었다.

- **서버** — `DELETE /videos/{id}` 가 업로드가 끝났고 보관 기간 안인 스냅은 파일을 남기고 `kept_for_restore` 로 표시한다(마이그레이션
  `20261007010000_add_video_kept_for_restore`). 이 변경 전에 지운 행은 파일을 그 자리에서 지웠으므로 표시가 없고 되살리지 않는다 — 표시가 없으면
  "삭제 · 정리 전" 행과 구분할 수 없었다. 남은 객체를 회수하는 밤 배치(E-3)는 표시된 행을 보관 기간이 끝날 때까지 건너뛴다(그대로 두면 그날 밤 지웠다).
  `GET /videos/trash`(최근 삭제, 최대 200개) · `POST /videos/{id}/restore`(멱등, 보관 기간이 끝났거나 표시 없는 행은 409 `NOT_RESTORABLE`)를 더했고,
  되살릴 때 지운 동안 건너뛴 렌디션을 다시 적재한다(같은 job id 의 끝난 작업을 지우고 넣는다 — 그대로는 무시된다). 다른 기기가 보는 `lookup` 은
  그대로 `removed`(`user`)다 — 새 상태를 만들면 예전 앱이 스냅을 잘못 다룬다. 계약 · `openapi.json` · [api-spec.md](./api-spec.md) 갱신.
- **앱** — 확인 시트가 되살릴 수 있는지와 언제까지인지를 말한다. 모든 기기에서 삭제 직후 `스냅 N개를 삭제했어요 · 되돌리기` 토스트(6초,
  새 `shared/ui/toast`). 스냅 탭 끝의 `최근 삭제` → `/recently-deleted` 에서 행마다 `되살리기`. 아직 서버에 가지 않은 삭제(묘비)는 먼저 거둬 오프라인에서도
  되살리고, 그 밖에는 서버에 되살리기를 요청한 뒤 동기화를 바로 한 번 돌린다(`requestSnapReconcile`) — 되살린 스냅은 다른 기기에서 온 스냅처럼 들어온다.
  촬영 화면의 삭제 알림 문구도 고쳤다. 새 용어 `최근 삭제` · `되살리기` · `되돌리기` 를 UX 용어표에 올렸다. 기능 문서 snaps.md · README · app-shell 갱신.
- **자동 검증**: API 597개(새 `video-trash.test.ts` 14개 — 렌디션 재적재 테스트는 그냥 add 로 바꾸면 실패하는 것을 확인) · typecheck · lint ·
  `npm run verify:mobile` 169 suites / 1342 tests(이 변경 전부터 있던 lint 경고 1개).
- **Android 에뮬레이터**: 개발 DB 의 복사본(`snaply_trash_check`, 마이그레이션은 그 복사본에만 적용, 확인 뒤 지움)에 API 를 붙였다. 무비에 쓰이지
  않은 다른 기기의 스냅으로: 확인 시트가 `모든 기기에서 삭제돼요. 2026년 10월 15일까지는 최근 삭제에서 되살릴 수 있어요.` 를 보였고, 지우자 서버 행이
  `kept_for_restore` 로 남았다. 최근 삭제에 `3초 · 9일 남음` 으로 나타났고 되살리자 `스냅을 되살렸어요` · 목록이 비고 스냅 탭이 6개로 돌아왔다.
  다른 스냅을 지운 직후 되돌리기를 누르자 `스냅 1개를 되돌렸어요` 로 돌아왔다. 개발 DB 에는 아무 변화가 없었다.
- **남은 것**: 휴대폰 두 대 사이의 전파와 되살림은 보지 않았다 — backlog A-4 "최근 삭제의 실기기 확인". 법률 문서의 보관 · 파기에 적을 일은 D-2 에 더했다.

## 2026-10-08 — AWS 공모전 서버에 올릴 준비: 키 없는 S3 · ALB 뒤 클라이언트 IP · 단독 compose(backlog B-8)

인프라팀이 공모전 테스트용 AWS 서버를 만들었다(backlog B-8). 저장소 그대로는 거기서 뜨지 않거나 뜨더라도 막혀서 세 가지를 고쳤고,
확인하다 사내 서버와 같이 쓰는 배치 결함을 하나 찾았다.

- **키 없이 인스턴스 역할로 S3** — API 는 `AWS_ACCESS_KEY_ID` 를 필수로 요구했고, 워커는 빈 키를 빈 문자열로 넘겨 boto3 가 기본 체인을
  타지 않고 빈 키로 서명했다. 이제 둘 다 키가 비면 SDK 기본 체인(→ 인스턴스 메타데이터)을 쓴다. API 는 키가 한쪽만 있거나, MinIO
  (`S3_ENDPOINT`)인데 키가 없으면 기동을 거부한다. 워커의 S3 클라이언트는 리전 호스트(`버킷.s3.ap-northeast-2.amazonaws.com`)로
  고정했다 — 기본값은 presigned URL 을 전역 호스트로 만들어 새 버킷에서 307 을 받을 수 있고 API 가 만드는 URL 과 호스트가 갈렸다.
  env-spec 에서 두 키를 선택 · `local` 로 바꿨다.
- **ALB 뒤 클라이언트 IP** — Fastify 가 프록시를 믿지 않아 모든 요청이 ALB 주소로 보였다. 전역 rate limit(IP당 분당 60)을 사용자 전체가
  나눠 쓰고, `/health` 도 그 한도에 걸려 ALB 가 대상을 빼면 도메인 전체가 502 가 된다. 새 변수 `TRUST_PROXY`(믿을 프록시의 IP · CIDR ·
  프리셋)를 두었다. 홉 수(`1`)와 `true` 는 기동을 거부한다 — Fastify 5.12 는 홉 수만으로는 직접 접속한 클라이언트의 위조를 막을 수
  없어 숫자를 주면 아무것도 믿지 않는다(처음 홉 수로 만든 구현이 새 테스트에서 실패해 드러났다). `true` 는 누구의 헤더든 믿는다.
- **`docker-compose.aws.yml`** — base 에 겹치지 않는 단독 파일이다. 같은 방식인 사내 서버 오버레이를 `docker compose config` 로 풀어 보니
  postgres · redis 포트가 `127.0.0.1` 과 모든 주소에 둘 다 잡히고 base 의 `SENTRY_DSN: ""` 가 시크릿을 덮었다(backlog B-1 에 적었다).
  MinIO 없음, S3 키와 MinIO 주소는 ""로 덮어 인스턴스 역할만, `TRUST_PROXY: uniquelocal`, DB 는 `127.0.0.1:5433`(담당자 포트 포워딩)만,
  Redis 볼륨, 컨테이너 로그 상한(20MB × 5), SHA 태그라 `pull_policy` 기본값.
- **배치가 하나도 돌지 않던 결함(사내 서버 공통)** — `deploy/run-batch.sh` 가 API 이미지 안에서 `npm run <배치> -w apps/api` 를 불렀는데
  이미지의 작업 디렉터리가 이미 `apps/api` 라 `No workspaces found` 로 끝났다. `-w` 를 뺐다. 2026-10-06 검증은 docker 대역으로 인자만
  봐서 드러나지 않았다.
- **자동 검증**: API 612개(새 `config.test.ts` · `trust-proxy.test.ts`) · tsc · lint · `storage.service.test.mjs`(키 없이 기본 체인으로
  서명 · 리전 호스트 · 세션 토큰). 워커 212개(새 `test_storage.py` — 깨끗한 하위 프로세스에서 compose 처럼 키를 빈 값으로 주고 기본
  체인으로 서명하는지 본다. 같은 프로세스에서는 다른 테스트가 boto3 를 MagicMock 으로 바꿔 끼운다).
- **로컬 실행**: 작업 트리로 이미지를 빌드해 `docker-compose.aws.yml` 을 띄웠다(분석 워커는 OpenAI 키가 없어 뺐다). migrate 뒤 api healthy ·
  `/health` 가 `db=connected`. 시크릿 파일에 넣은 키와 MinIO 주소가 네 컨테이너 모두에서 ""로 덮였다. Docker 포트 매핑을 거친 요청에서
  X-Forwarded-For 별로 한도가 갈리고 앞쪽에 끼운 위조 주소는 무시됐다. 배치 4종 dry-run 과 `--yes`, `pg_dump` 가 돌았다. 확인 뒤
  스택 · 볼륨 · 이미지를 지웠다.
- **남은 것**: 실제 인스턴스 역할로 S3 에 붙는 것은 AWS 서버에서만 볼 수 있다. 배포 잡 · 설치 스크립트 · 배포 방식 확인은 backlog B-8.

## 2026-10-08 (이어서) — AWS 공모전 서버의 배포 잡과 설치 스크립트(backlog B-8)

인프라 담당이 배포 방식(GitHub self-hosted runner + GHCR)을 그대로 가도 된다고 답했고, 그 전에 인스턴스에서 직접 확인했다 —
Session Manager 셸에서 GitHub · GHCR · Docker Hub · 외부 API 로 나가는 연결이 모두 열려 있고, 인스턴스 역할로 S3 에 붙고, 컨테이너에서
메타데이터에 닿고(IMDS 홉 2), Compose 가 v2.32.4, `/data` 가 별도 볼륨이다. 결정과 기각한 대안은
[decisions/aws-contest-server.md](./decisions/aws-contest-server.md), 절차는 [deployment-aws.md](./deployment-aws.md).

- **배포 잡** — `deploy.yml` 에 `deploy-aws` 를 더했다(`runs-on: [self-hosted, snaply-aws]`, `DEPLOY_AWS_ENABLED` 일 때만). 배포 파일을
  `/data/compose` 로 덮어쓰고 → Secrets Manager 를 env 파일로 → GHCR 로그인(패키지가 비공개라 필요하다) → pull → 마이그레이션 → up →
  태그 기록 → `/health` 의 `db=connected` → 72시간 넘은 이미지 정리. GitHub 에 AWS 키를 두지 않는다. 사내 서버 잡은 그대로다.
- **`deploy/aws/`** — `install.sh`(인스턴스마다 한 번, 멱등: cron 패키지 — Amazon Linux 2023 에 기본으로 없다 —, `snaply` 계정, Docker
  data-root 를 `/data/docker` 로 옮기고 `/data` 마운트 대기, runner 2.338.0 해시 검증 · 등록 · 서비스, cron) · `runner-job-started.sh`(작업 전
  검사 — main 의 `deploy.yml` push 만 받는다. 저장소가 public 이고 GitHub Free 플랜에는 runner 를 워크플로로 묶는 설정이 없다) ·
  `write-env.sh`(빈 값은 빼고 값은 작은따옴표로 — compose 가 글자 그대로 읽는다. 작은따옴표 · 줄바꿈이 든 값은 거부) · `render-cron.sh`
  (`batches.cron` 에서 경로만 바꾼다 — 배치 시각의 원천은 하나다).
- **배치 · 백업 스크립트가 compose 파일을 고른다** — `run-batch.sh` · `backup-db.sh` 가 `-f` 대신 `COMPOSE_FILE`(기본값은 사내 서버의 두 파일)을
  쓴다. AWS cron 이 `docker-compose.aws.yml` 을 준다.
- **만료 예고 배치의 안내 문구** — FCM 이 꺼져 멈출 때 `FIREBASE_SERVICE_ACCOUNT_JSON` 미설정이라고 했는데 그런 변수는 없다.
  `FIREBASE_SERVICE_ACCOUNT_KEY` 로 고쳤다.
- **검증**: shellcheck 통과. actionlint 는 새 잡에서도 사용자 정의 라벨(`snaply-aws`) 경고만 — main 의 `snaply` 와 같은 종류다.
  Amazon Linux 2023 컨테이너에서 스크립트 동작 29건(작업 전 검사가 브랜치 · 다른 워크플로 · PR · 수동 실행 · 포크 · 변수 없음을 거부, cron
  시각이 `batches.cron` 과 같음, env 변환이 빈 값 · null 을 빼고 숫자 · 불리언을 문자열로, `$` · `#` · 공백을 보존, 한 줄 JSON 키가 PEM 으로
  풀림, 권한 600, 작은따옴표 · 줄바꿈 · 잘못된 키 이름 · 빈 `POSTGRES_PASSWORD` · 객체가 아닌 시크릿 거부). 같은 컨테이너에 서버와 같은
  Compose v2.32.4 를 깔고 `deploy-aws` 단계를 그대로 두 번 돌렸다(인프라처럼 빈 키 9개를 섞은 시크릿, 로컬 빌드 이미지): 마이그레이션 →
  일곱 서비스 기동 → `db=connected`, 두 번째도 같고 태그 기록이 남았다. 빈 키는 빠져 `/health` 가 429 없이 200 이었다. 이어서 cron 환경 그대로
  배치 4종과 백업이 돌았다(만료 예고는 FCM 키가 없어 의도대로 멈췄고, 그 안내 문구가 위 결함이었다). 확인 뒤 스택 · 볼륨 · 이미지를 지웠다.
- **남은 것**: runner 설치 · 시크릿 · `DEPLOY_AWS_ENABLED` 는 서버에서 하는 일이다 — backlog B-8. 실제 runner 위의 첫 배포는 아직이다.

## 2026-10-08 (이어서) — AWS 공모전 서버 첫 배포(backlog B-8)

인스턴스에서 `deploy/aws/install.sh` 로 runner(`dweax-snaply`, 라벨 `snaply-aws`)를 등록하고, 시크릿을 채우고(필수 10개 — 외부 연동 키는
비워 둠), 저장소 Variables 에 `DEPLOY_AWS_ENABLED=true`, 포크 PR 워크플로 승인을 "모든 외부 협업자"로 올렸다. `97e7f7c` 의 Deploy 를
다시 돌려 첫 배포가 끝까지 갔다 — 작업 전 검사 통과 → 시크릿 10개 키(빈 값 15개 제외) → GHCR 로그인 → 마이그레이션 30개 → 일곱
서비스 기동 → `db=connected`. 공개 도메인 `https://snaply-api.dweaxai.com/health` 가 ALB 를 거쳐 200 · `db=connected` 를 돌려줬다.

- **알게 된 것** — snaply 역할에 `DescribeSecret` · `ListSecrets` 가 없어 콘솔의 Secrets Manager 화면이 열리지 않고 CloudShell 도 막혀 있다.
  CLI 프로필로는 읽기 · 쓰기가 되고 인스턴스 역할로도 읽힌다. 절차를 [deployment-aws.md](./deployment-aws.md) §2 에 적었다. 첫 배포
  전에는 `/data/compose/deploy` 가 비어 있어 시크릿 형식 확인은 체크아웃의 스크립트로 한다(같은 절).
- **남은 것**: 테스터 앱 빌드로 폰에서 업로드 → 편집 → 재생 확인, 외부 연동 켜기 — backlog B-8.

## 2026-10-09 — 편집 진행률 WebSocket 이 ALB 유휴 제한을 넘기지 않는다(backlog B-8)

인프라 문서("snaply — AWS 구성 · 인프라 접속")를 요청서·저장소와 대조했다. 보안그룹 · 포트 · 인스턴스 역할 · 시크릿의 빈 값 ·
`/health` 200 · `/data` 배치는 이미 `main` 이 맞춰 두었고, 남은 불일치는 하나였다 — **공용 ALB 의 유휴 제한이 180초**인데
진행률 WebSocket 은 ping 이 없어 편집 단계 사이가 길면 끊겼다.

- **고침** — `/edit-jobs/{id}/progress` 가 열려 있는 동안 서버가 30초마다 프로토콜 ping 을 보낸다(`edit-jobs.ts`). 제어 프레임이라
  메시지 계약은 그대로다. [api-spec.md](./api-spec.md) WebSocket 절 · [deployment-aws.md](./deployment-aws.md) §6 갱신.
- **검증**: `npm test -w apps/api` 612 통과 · `typecheck` · `lint` 통과. ALB 뒤에서 180초 넘게 열어 두는 실측은 하지 않았다
  (테스터 앱 빌드 뒤 긴 편집으로 확인 — backlog B-8).

## 2026-10-09 (이어서) — 사내 서버를 접고 배포 대상을 AWS 하나로

**결정**: 사내 물리 서버에는 올리지 않는다. 사내망 전용이라 실사용자를 받을 수 없었고, 바깥에서
닿는 AWS 공모전 서버(backlog B-8)가 뜨면서 두 서버를 함께 둘 이유가 사라졌다. 배포 대상은
[decisions/aws-contest-server.md](./decisions/aws-contest-server.md) 하나다.

지운 것 — **쓰이지 않는 배포 경로를 남겨 두면 다음 사람이 어느 쪽이 현행인지 묻게 된다.**

- `docker-compose.prod.yml`(사내 서버 전용 오버레이)
- `deploy.yml` 의 `deploy` 잡(`runs-on: [self-hosted, snaply]`). 남은 배포 잡은 `deploy-aws` 하나다
- `docs/deployment.md` → [archive/deployment-on-prem.md](./archive/deployment-on-prem.md),
  `docs/decisions/on-prem-deployment.md` → [archive/on-prem-deployment.md](./archive/on-prem-deployment.md)
  (둘 다 상단 배너로 뒤집힌 사실을 적었다)

남긴 것 — **배치 cron · 배치 실행 · DB 백업 스크립트는 AWS 와 공유**다(`deploy/aws/render-cron.sh` 가
`deploy/batches.cron` 에서 경로와 compose 파일만 바꿔 깐다). 다만 `run-batch.sh` · `backup-db.sh` 의
`COMPOSE_FILE` 기본값이 지워진 오버레이를 가리키고 있어 `docker-compose.aws.yml` 로 바꿨다 — 그대로
뒀으면 `COMPOSE_FILE` 없이 손으로 돌릴 때 없는 파일을 찾았다.

[deployment-aws.md](./deployment-aws.md) §4 가 배치 시각표를 **직접** 담는다. 전에는 사내 서버 문서에
맡겨 두었는데 그 문서가 archive 로 가면서 현행 문서가 보관 문서를 가리키게 되기 때문이다.

함께 닫힌 것: 사내 서버 운영 오버레이의 포트·`SENTRY_DSN` 결함(파일이 사라졌다), B-8 의
"사내 서버와의 관계" 항목.

**뒤이어 놓친 전제 다섯 군데**(같은 날 점검표 대조에서 찾았다). 파일을 지우는 것만으로는 사내 서버
전제가 사라지지 않는다 — 문장과 기본값에 남아 있었다.

- `deploy/batches.cron` 이 "(사내 서버)" 제목과 수동 설치 안내를 달고 있었다. 실제로는
  `render-cron.sh` 가 `SNAPLY_DIR` 줄을 바꿔 깔므로, 손으로 깔라는 안내는 사본을 만들게 한다.
  백업 주석의 "영상 파일은 MinIO 에 있지만" 도 AWS 에서는 S3 다
- `render-cron.sh` 와 `minio-image.yml` 의 주석이 사라진 문서·서버를 가리켰다
- **D-1(고정 도메인)** — AWS 서버가 `https://snaply-api.dweaxai.com` 으로 그 조건을 채웠지만,
  **공모전이 끝나면 내려간다.** 콘솔에 등록한 리디렉션 URI 는 주소가 바뀌면 다시 등록해야 하므로
  항목을 닫지 않고 "계속 쓸 도메인을 그 전에 정한다" 로 바꿨다
- **E-7(MinIO 수명)** — 사내 서버가 MinIO 를 운영 스토리지로 **노출**하던 것이 이 결정의 핵심 위험이었다.
  그 자리가 없어져 남은 쓰임은 로컬 · CI 뿐이므로 ⚠️ 를 뗐다
- **`OPENAI_API_KEY` 운영 키 분리** — C-7 에서 B-1 로 옮겨 둔 항목이라 B-1 을 닫으면서 함께 사라질 뻔했다.
  B-8 로 옮겼다

`decisions/aws-contest-server.md` 의 "이 결정이 정하지 않는 것"(사내 서버와의 관계)도 결정된 사실로 바꿨다 —
현행 결정 문서가 이미 답이 난 질문을 열린 것으로 두면 다음 사람이 다시 묻는다.

**푸시 전 최종 검토(같은 날)** — 독립 리뷰를 한 번 더 받아 **같은 유형을 네 번째로** 찾았다.
파일을 지우고 나서 "지운 전제" 를 세 라운드에 걸쳐 하나씩 찾은 것이 이 작업의 교훈이다 —
처음에 `deploy/` 의 **모든 기본값과 모든 절대 경로를 한 번에 전수 조사**했어야 했다(이번에 그렇게 했다).

- `deploy/backup-db.sh` 헤더가 "영상 파일은 MinIO 에" 라고 적고 있었다. 같은 커밋이 `batches.cron` 의
  **똑같은 문장**은 S3 로 고치면서 옆 파일을 빠뜨렸다. 닫힌 B-1 참조도 함께 있었다
- **승계 누락** — B-1 의 `DB 백업의 외부 보관` 이 어디에도 옮겨지지 않았다. D-1 · E-7 ·
  `OPENAI_API_KEY` 는 챙겼는데 이것만 빠졌다. `/data` 를 인프라가 매일 스냅샷해 DB 쪽 위험은
  해소됐지만 **S3 영상은 버전 관리가 꺼져 있어 지우면 복구 불가**다 — 그 사실이 런북에만 있고
  백로그에 없었다(AGENTS "미결은 backlog 에만"). B-8 에 사각을 좁혀 다시 적었다
- `apps/api/src/routes/legal.ts` 가 국외 이전 판단 근거로 **"운영 배포가 없어서 로컬은 MinIO 로 돈다"**
  를 들고 있었다. 서버가 떴으므로 이제 실제 값을 확인할 수 있다 — 법적 판단은 D-2 에 남겼다
- 현행 결정 문서 네 곳이 닫힌 B-1 을 가리켰다: `env-management.md` 헤더 두 줄(같은 커밋이 본문
  §후속 연계만 고쳤다) · `decisions/README.md` 착수 순서 · `sns-webhook-scope.md` 관련 문서 줄과
  권장안(도메인 현황 파악이 끝난 사실을 반영하지 못했다) · `aws-contest-server.md` 의 기각 근거

검증: 저장소 전체 마크다운 상대 링크 **깨짐 0건**, API 612 · Python 212 · typecheck · lint 통과,
`render-cron.sh` 실행 확인. `README.md` 문서 지도에 현행 배포 런북 행을 추가했다 — 전에는 배포
문서가 지도에 아예 없었다.

## 2026-10-09 (이어서) — 지운 스냅의 분석 결과를 지운다(ANA-3 `구현됨`, backlog E-18 닫음)

개인정보처리방침은 "영상을 삭제하면 그 영상의 분석 결과도 함께 삭제됩니다"라고 고지하는데, 서버는 지운 스냅(최근 삭제)과 만료된
스냅의 `videos` 행을 툼스톤으로 남기고 `video_analyses` 는 행이 실제로 지워질 때만 Cascade 로 사라져서 분석 결과가 계정 삭제 때까지
남았다(2026-10-09 문서 감사에서 발견). 고지에 코드를 맞췄다(오너 결정).

- **지우는 순간 파기한다** — `deleteVideo`(`apps/api/src/services/video.service.ts`)가 휴지통에 보내는 경우와 파일을 바로 지우는 경우
  모두 같은 트랜잭션에서 그 영상의 분석 결과를 지운다. 되살린 스냅은 분석이 필요해질 때 다시 분석된다(분석은 요청 시점에만 돈다,
  ANA-1). 진행 중이던 분석은 워커가 결과를 쓸 행이 없어 버린다(`apps/ai-worker/src/analysis_db.py` `save_result`).
- **정리 배치도 거둔다** — 만료 정리(`purgeVideoAssets`)와 남은 객체 회수(`purgeOrphanedObjects`, `apps/api/src/services/retention.service.ts`)가
  로컬 신호와 함께 분석 결과를 지운다. 지우는 순간과 겹친 분석 요청이 남긴 행을 회수 배치가 거둔다.
- **API 설명** — `DELETE /videos/{id}` 의 description 이 "무비에서 곧바로 사라진다"고 했는데 무비의 컷은 `unavailable` 로 남는다.
  함께 고치고 분석 결과 파기를 적었다(`openapi.json` 재생성, [api-spec.md](./api-spec.md)).
- **검증**: `video-trash.test.ts` 3건(휴지통으로 가도 · 되돌릴 수 없는 삭제도 · 되살려도 결과가 돌아오지 않는다)과 `retention.test.ts` 2건
  (만료 정리 · 회수 배치)을 더했다. 수정을 빼면 다섯 건 모두 실패하는 것을 확인했다. `npm test -w apps/api` 41개 파일 624건 통과.

## 2026-10-09 (이어서) — 문서 전수 정리 · constitution 확정 · 팀 분담(backlog B-7 닫음)

저장소 문서 약 130개를 영역 10개로 나눠 코드와 대조했다(2026-09-27 정리 이후 두 번째).

- **공통 규격** — [doc-conventions.md](./doc-conventions.md)에 §헤더(라벨 다섯 개 · 상태어 · 상태 줄에 구현 진척을 쓰지 않는다 · 정정과
  후속 결정은 배너)와 §본문(미결은 백로그에만, ID · 절 링크로 가리킨다, 절대 날짜, 줄 번호 대신 경로 + 심볼)을 정했다. 규격 위반
  33개 문서를 0으로, progress 항목 제목 87개를 `## YYYY-MM-DD — 제목` 으로 맞췄다. 계획 인덱스 [plans/README.md](./plans/README.md)를 새로 만들었다.
- **코드와의 정합성** — 새로 clone 하면 API 가 뜨지 않던 ONBOARDING 의 빠진 단계(`shared-types` 빌드), 없는 함수명 · 낡은 UI 문구 ·
  빠진 라우트 6개(모바일 기능 문서), 실제와 달랐던 스펙 라벨(MOV-8 · MOV-9 · MOV-11 · ANA-3 · CRD-4 → `부분`), 터널 업로드에 필요한
  `S3_PUBLIC_ENDPOINT`(sns-setup · local-tunnel) 등을 고쳤다. 이미 구현된 요구를 역으로 뽑아 MOV-23 · MOV-24 를 붙였다.
- **빠진 것** — AGENTS.md 문서 갱신 의무 표에 명령 · 인프라 → ONBOARDING, 배포 구성 → 배포 문서, 새 모듈 → team.md §1, 백로그 항목을
  끝냄 → 닫은 항목 + progress 행을 더했다. 스펙 · 계획에만 있던 미결을 백로그로 옮겼다(A-7 · A-10 · A-11 · C-1 · E-18~E-23 · G · 새 절 H).
- **constitution 확정** — 2026-09-02 부터 `초안` 이던 [constitution.md](./constitution.md)를 오너가 확정했다(상태 `현행`). 조항은 바꾸지 않았다.
- **팀 분담** — [team.md](./team.md) §1 을 커밋 이력(2026-10-09, `main` 429개 — 머지 · 대량 이동 커밋 제외)에 맞췄다. 트랙(미디어/편집 ·
  플랫폼/수익화)은 그대로 두고 담당을 실제로 고쳐 온 사람으로 적었으며, 표에 없던 모듈(backlog B-7)을 모두 배정했다. 근거 표는
  team.md 의 "담당 배정의 근거"에 있다.
- **검증**: 깨진 상대 링크 · 앵커 0, 헤더 규격 위반 0(스크립트), 문서에 적힌 `npm run` 스크립트가 모두 실재. 코드 · 설정에서 발견해
  고치지 않은 것은 백로그 E-19~E-23 · G 에 있다.

## 2026-10-09 (이어서) — 무비는 한 번에 하나씩 만든다(MOV-11 `구현됨(실기기 미검증)`, backlog A-10)

MOV-11 은 사용자당 진행 중 생성을 한 번에 하나로 요구하는데, 앱은 한 무비의 중복 생성만 막고 서버도 무비당 하나만 막아 서로 다른
무비는 동시에 생성됐다(2026-10-09 문서 감사에서 발견). 요구를 유지하고 구현했다(오너 결정).

- **서버가 강제한다** — `createEditJob`(`apps/api/src/services/edit-job.service.ts`)이 크레딧 확인과 같은 유저 행 잠금 안에서 같은 사용자의
  `queued` · `processing` 작업을 찾아, 있으면 `409 GENERATION_IN_PROGRESS` 와 그 작업의 무비 id(`error.movieId`, 무비 없는 작업이면 `null`)를
  돌려준다. 무비 생성과 `POST /edit-jobs` 가 같은 길을 지나므로 둘 다 막힌다. 크레딧 부족(402)이 먼저다. 갇힌 작업은 그 무비에서 취소하면
  풀린다. 계약: `packages/shared-types/src/contract/common.ts` 의 `generationConflictErrorSchema` 를 두 라우트의 409 에 선언했다(`openapi.json` 재생성).
- **앱이 미리 막고 안내한다** — `startGeneration`(`apps/mobile/src/features/compose-movie/model/use-compose-movie.ts`)이 이 기기가 아는 다른
  `generating` 무비가 있으면 아무것도 보내지 않고 `busy` 로 거절하고, 다른 기기에서 시작한 생성은 서버의 409 를 같은 사유로 읽는다
  (`lib/read-generating-movie.ts`). 무비 화면은 "다른 무비를 만드는 중이에요. 다 만들어지거나 취소하면 만들 수 있어요."와
  `만드는 중인 무비 보기` 를 보인다(`pages/movie/ui/refusal-notice.tsx`). 기능 문서 [movie.md](../apps/mobile/docs/features/movie.md) · studio.md.
- **검증**: API — `movies.test.ts` 에 다른 무비가 생성 중이면 409 · 동시에 두 무비를 보내도 하나 · 앞선 작업이 `done` · `failed` · `canceled`
  면 다음을 만든다 · 다른 사용자는 막지 않는다 · 무비 없는 작업이면 `movieId: null` 을 더했다. 검사를 빼면 셋이 실패한다.
  `npm test -w apps/api` 41개 파일 624건 통과. 앱 — 거절 사유 · 409 매핑 · 문구 테스트를 더했고 `npm run verify:mobile` 통과
  (173개 스위트 1390건, lint 경고 1건은 원래 있던 `notification-settings-store.ts` 의 것). 실기기는 확인하지 않았다 — backlog F.
- **남은 것**: 보드 · 그리드의 `다시 시도` 는 거절 이유를 말하지 않는다(원래 있던 한계, 이제 더 자주 보인다) — backlog E-24.

## 2026-10-09 (이어서) — 실패한 무비 카드가 다시 시도의 거절을 말한다(MOV-12, backlog E-24 닫음)

스튜디오 보드와 무비 탭의 실패 카드에서 `다시 시도` 가 거절되면(다른 무비를 만드는 중 · 올라가는 중 · 크레딧 부족 등) 아무것도 바뀌지
않았다 — 거절 문구는 무비 화면에만 있었다. 한 번에 하나씩 만들게 된 뒤(MOV-11) 이 거절이 흔해져서 카드에서 답하게 했다.

- **스펙** — MOV-12 에 "재시도가 시작되지 못하면 누른 자리에서 그 이유를 알린다"를 더했다([specs/movie.md](./specs/movie.md)).
- **카드에 짧게 답한다** — `MovieFailureNotice`(`apps/mobile/src/widgets/movie-shelf/ui/movie-failure-notice.tsx`)가 거절되면 실패 사유 줄
  자리에 거절의 첫 문장을 띄운다("다른 무비를 만드는 중이에요.", "크레딧이 부족해요 · 40/100." 등). 그리드에서는 사유처럼 한 줄로 잘라
  타일 높이가 그대로다. 다음 누름의 답이 올 때까지 남고, 시작 요청이 진행 중이면 버튼을 막아 두 번째 누름이 첫 요청 때문에 거절되지 않게 했다.
  무비 화면으로 보내는 안은 누른 자리와 다른 곳에 떨어뜨리는 이동이라(UX `Unpredictable Jump`) 고르지 않았다.
- **문구 원천을 하나로** — 생성 거절 문구를 `pages/movie/ui/refusal-notice.tsx` 에서 `features/compose-movie/lib/generation-refusal-copy.ts` 로
  옮겼다. 무비 화면(`generationRefusalMessage`, 전체 문장)과 카드(`generationRefusalHeadline`, 첫 문장)가 한 표에서 읽는다 — 페이지와 위젯은
  서로 import 할 수 없다. 기능 문서 [movie.md](../apps/mobile/docs/features/movie.md) · [studio.md](../apps/mobile/docs/features/studio.md).
- **검증**: 카드 테스트(거절 이유 표시 · 누를 때마다 그 답 · 진행 중 중복 시작 없음)와 문구 테스트를 더했다. 카드의 수정을 빼면 카드 테스트
  네 건이 모두 실패한다. `npm run verify:mobile` 통과
  (175개 스위트 1397건, lint 경고는 원래 있던 것). 실기기 · 에뮬레이터에서는 보지 않았다 — backlog F 의 MOV-11 실기기 확인에 합쳤다.

## 2026-10-09 (이어서) — 서버와 로컬의 OpenAI 키를 나눠 둔다(backlog B-8 항목 닫음)

C-7 에서 받은 회사 OpenAI 키를 로컬 개발과 AWS 서버가 함께 쓰면 한쪽이 새거나 폐기될 때 둘 다 멈춘다. 서버 시크릿과 로컬 `apps/api/.env`
가 서로 다른 키인 것을 오너가 해시 비교로 확인했다(`DIFFERENT` — 값은 꺼내지 않는다). 새 키를 어느 쪽에 줄지는 고정하지 않는다 —
한쪽이 새면 그쪽만 바꾸고, 로컬을 바꿔도 된다(오너). 규칙과 비교 명령은 [deployment-aws.md](./deployment-aws.md) §2.

- **재배포** — `146d618` 의 `Deploy to the AWS server` 잡을 다시 돌렸다(성공, `/health` → `db=connected`). env 파일의 키 수(10개, 빈 값 15개)가
  앞 실행과 같고 다시 만들어진 컨테이너가 없어, 서버가 쓰는 값은 그대로다.
- **확인하지 않은 것**: 서버의 `OPENAI_API_KEY` 가 비어 있지 않은지는 보지 않았다 — 비어 있어도 비교는 `DIFFERENT` 다. 비어 있으면
  `analysis-worker` 가 기동 단계에서 종료한다(같은 문서 §6).

## 2026-10-09 (이어서) — AWS 서버로 휴대폰에서 업로드 → 편집 → 재생(backlog B-8 테스터 앱 빌드 닫음)

오너의 Galaxy S22 Ultra 에 이 서버를 보는 release 빌드를 깔아 도메인(`https://snaply-api.dweaxai.com`)으로 한 바퀴 돌았다. 테스터 앱을 만들고
까는 법과 주의는 [deployment-aws.md](./deployment-aws.md) §8.

- **빌드** — `f6be057`(main `146d618` 에 E-24 수정을 얹은 PR #57 의 브랜치)을 `EXPO_PUBLIC_API_BASE_URL` 로 release 빌드했다. 번들에 그 주소와
  E-24 의 문구 형태가 들어간 것을 확인했다. 이 빌드가 release 출력 폴더를 비워 먼저 있던 `snaply-tester-395cbde.apk` 가 지워졌다.
- **설치** — 개발용 앱 위에 `install -r` 로 깔려 로그인과 기기의 라이브러리가 남았다. 라이브러리는 계정으로만 나뉘므로 별도 계정
  (테스트 계정)으로 진행했다. 처음 뜬 약 20초는 이미 로그인돼 있던 계정으로 이 서버에 붙었는데, 로그아웃 뒤 테스트 계정의 화면이
  똑같아 처음부터 테스트 계정이었던 것으로 본다.
- **크레딧** — 새 계정은 0 이다. 오너가 서버 셸에서 `credit_ledger` 에 `promo` 500 을 넣었고 나 탭이 500 을 읽었다.
- **확인한 것** — 새로 찍은 스냅을 넣은 무비의 생성이 `uploading` 으로 거절되지 않았다(업로드가 서버에 닿았다) → 스타일을 일상에서 감성으로
  바꿨다 → 생성이 1분 안에 끝났다(19:59:45 시작, 20:00 완성) → 감상 화면이 "감성"으로 읽고, 재생 중 세 번 찍은 화면에 세 컷이 순서대로 나왔다.
- **MOV-11(이 기기 쪽)** — 한 무비를 다시 만드는 동안(20:02:23 시작) 다른 무비의 `무비 만들기` 를 누르니 "다른 무비를 만드는 중이에요. 다 만들어지거나
  취소하면 만들 수 있어요."와 `만드는 중인 무비 보기` 가 떴다. 링크는 그 무비를 열었고(그사이 완성), ← 는 거절된 무비로 돌아와 링크 없이 문구만 남았다.
- **확인하지 않은 것** — 다른 기기에서 시작한 생성의 409(같은 서버를 보는 기기가 둘 필요하다), 실패 카드의 거절 안내(E-24 — 실패한 무비가 없었다),
  완성 푸시(무비 알림은 기본 꺼짐), 배치(cron)의 실행. MOV-11 의 `(실기기 미검증)` 은 남은 409 확인 뒤에 지운다(backlog F).

## 2026-10-09 (이어서) — 휴대폰 실기기 확인 — 알림 · 정리 · 앨범(SNAP-18 `구현됨`, backlog A-1 · A-4 · F)

이 서버를 보는 테스터 앱(Galaxy S22 Ultra, 테스트 계정)으로 실기기 미검증 항목을 이어서 확인했다. 기기는 하나였다.

- **알림 권한(NTF-7)** — 무비 완성 알림을 켜자 OS 가 물었고, 거절하니 스위치는 꺼진 채 "기기 설정에서 Snaply 알림을 켜야 받을 수 있어요."와
  `설정에서 권한 켜기` 가 떴다. 그 줄은 OS 설정의 앱 화면을 열었다. 켠 뒤 `pm revoke` 로 권한을 회수하고 다시 여니 스위치는 켜진 채 같은 안내가
  떴다(권한이 없는 기기로 로그인한 것과 같은 상태). 위치 알림의 같은 안내는 보지 않았다 — backlog F.
- **완성 푸시(A-1 ③)** — 앱이 뒤에 있을 때와 프로세스가 없을 때 각각 알림이 한 건 왔고, 탭하니 그 무비가 한 번 열렸다(종료 상태에서도 스튜디오가
  아니라 그 무비). **앱을 연 채로는 두 건이 떴다** — 앱 시작 때 계정 설정이 첫 푸시 등록 도중에 도착해 등록이 두 번 돌고, 첫 실행이 정리된 뒤에
  포그라운드 리스너를 남겼다. `fix(mobile): show a foreground push once`([#59](https://github.com/vlog-studio/snaply-backend/pull/59))로 고쳤고,
  고친 빌드에서 한 건이 뜨고 그 알림의 탭도 그 무비를 열었다.
- **정리하기(A-1 ④)** — `저장했어요, 정리하기` 뒤 감상 화면과 결과물이 사라지고 무비가 초안으로 돌아왔다(보드 `초안 · 컷 1`).
- **앨범(A-4 ① ② ④)** — 재생 화면의 `앨범에 저장` 은 권한 질문 없이 `Pictures/Snaply/` 에 찍은 시각(`datetaken`)으로 저장됐다. 자동 앨범 저장을
  켜고 찍은 스냅은 찍는 순간 같은 곳에 쌓였다. 이 기기에서만 삭제한 스냅은 목록에 남고 재생됐으며(3초 파일이라 받아 오는 화면은 보지 못했다)
  그 스냅이 든 무비가 만들어졌다. 갤러리에 테스트 사본 두 개가 남아 있다.
- **찾은 것** — 어떤 알림도 앱이 만든 `default` 채널로 가지 않는다: 뒤에서 받은 푸시는 FCM 기본 채널, 앱을 연 채로 띄운 알림은 expo 기본 채널이다.
  backlog E-25 로 올렸다.
- **남은 것** — A-1 ①(찍자마자 담은 초안이 서버에 생기는지) · ⑥(계정 전환), 다른 기기에서 온 스냅의 앨범 저장(SNAP-17), 이 기기에서만 삭제한 스냅의
  만료(SNAP-19), 위치 알림의 권한 안내(NTF-7), 다른 기기에서 시작한 생성의 409(MOV-11). ⑥ · SNAP-17 · MOV-11 은 같은 서버를 보는 기기가 하나 더 필요하다.

## 2026-10-09 (이어서) — 휴대폰과 에뮬레이터로 — 다른 기기 · 삭제 · 업로드 전 무비(MOV-11 · SNAP-17 `구현됨`, backlog A-1 · A-4 · F)

에뮬레이터(`snaply_api35`)에도 테스터 앱을 깔아(이미 같은 테스트 계정으로 이전 테스터 빌드가 있었다) 휴대폰과 두 기기로 같은 AWS 서버를 봤다.

- **다른 기기의 스냅 앨범 저장(SNAP-17 ③)** — 에뮬레이터에서 찍은 스냅을 휴대폰에서 저장하니 보관 사본(서버 영상 id 이름)이 찍은 시각 자리에
  놓였다(`datetaken` 20:42:17). 먼저 고른 표본은 영상에서 가져온 스냅이었는데, 앱은 가져온 순간을 촬영 시각으로 써서 "오늘"에 묶는 반면
  앨범 사본은 파일에 든 원본 영상의 날짜(10/1) 자리에 놓였다 — 가져온 스냅에서만 둘이 갈린다.
- **다른 기기에서 시작한 생성(MOV-11)** — 휴대폰이 생성을 시작하고 1.6초 뒤 에뮬레이터에서 다른 무비를 다시 만들기 하니, 서버의 409 로
  "다른 무비를 만드는 중이에요…"가 링크 없이 떴다(에뮬레이터는 그 무비가 만드는 중인 줄 몰랐다). 이 기기 쪽은 앞서 확인했으므로 MOV-11 은 `구현됨`.
- **다른 기기에서 지운 스냅의 컷(SNAP-12)** — 에뮬레이터가 스냅 X 로 무비를 만들고, 그 무비를 아직 모르는 휴대폰이 X 를 모든 기기에서 지웠다.
  에뮬레이터를 다시 여니 그 컷이 "컷 1 · 스냅 삭제됨", 무대가 "이 무비가 쓰던 스냅이 모두 삭제됐어요."였다. X 를 되살리자 컷이 다시 쓰였다.
- **최근 삭제(SNAP-20)** — 휴대폰에서 지운 X 가 에뮬레이터에서도 사라졌고, 휴대폰의 최근 삭제에서 되살리자 두 기기에 돌아왔다. 에뮬레이터에서
  지운 9월 30일 스냅도 최근 삭제에서 되살리자 휴대폰에 돌아왔고, 지울 때 빠진 `무비 10-09 (2)` 의 컷은 돌아오지 않았다(컷 2). 토스트의
  `되돌리기` 는 지운 기기에서 스냅을 돌려놓았지만 다른 기기가 그사이 동기화하지 않아 그쪽 반영은 보지 못했다 — backlog A-4. 토스트는
  UI 자동화 트리에 잡히지 않고 몇 초 만에 사라져 한 번은 누르기 전에 사라졌다.
- **업로드 전에 만든 무비(A-1 ①)** — 에뮬레이터를 비행기 모드로 두고 찍은 스냅("올리지 못함")으로 무비를 만들고 네트워크를 돌리자, 업로드가
  끝난 뒤 무비가 서버에 갔고 휴대폰에 나타났다. 이때 앱이 다시 열린 편집 화면의 `무비 만들기` 자리를 스냅 탭으로 가려던 탭이 눌러 생성이 한 번
  더 돌았다(크레딧 100, 테스트 계정 잔액 600).
- **찾은 것** — 이어받은 작업의 완성 시각이 그 기기가 알게 된 시각으로 보인다(8:20 에 끝난 무비가 에뮬레이터에서 "오후 8:37 완성") — backlog E-26.
  완성 푸시는 나중에 켠 기기 하나에만 간다 — 서버가 계정당 FCM 토큰 하나만 둔다(backlog B-2, 알려진 것).
- **남은 것** — A-1 ⑥(계정 전환), 실패 카드의 거절 안내(E-24 — 실패한 무비가 없었다), 되돌리기의 다른 기기 반영(SNAP-20), 이 기기에서만 지운 스냅의
  만료(SNAP-19, 2026-10-24), 위치 알림의 권한 안내(NTF-7), 촬영 스냅 치수(A-4).
## 2026-10-09 (이어서) — 테스터 앱을 EAS 로도 만든다

로컬 Gradle release 빌드(앞의 "AWS 서버로 휴대폰에서 업로드 → 편집 → 재생")와 따로, Android SDK 가 없는 컴퓨터에서 같은 서버를 보는
앱을 EAS 클라우드 빌드로 만들었다. 결과가 설치 링크라 테스터에게 그대로 보낼 수 있다. 절차는 [deployment-aws.md](./deployment-aws.md)
§8 "EAS 로 빌드해 링크로 나눠 주기".

- **빌드** — [`apps/mobile/eas.json`](../apps/mobile/eas.json) 에 `tester` 프로필(내부 배포 APK, API 주소)을 두고 Expo 계정 `dayomi` 의
  `snaply-app` 에 연결했다(`app.json` 의 `owner` · `extra.eas.projectId`). Supabase 클라이언트 값은 EAS 환경변수(`preview`)에 두었다 —
  서버 시크릿에는 anon 키가 없다(서버는 JWKS 로 검증해 필요 없다). 이 Mac 에 Android SDK 가 없어 EAS 를 골랐다.
- **`eas init` 이 `app.json` 을 풀어 썼다** — 플러그인이 계산한 위치 · 저장소 권한과 `extra` 까지 박아 넣었고,
  `READ_MEDIA_VISUAL_USER_SELECTED` 가 `permissions` 와 `blockedPermissions` 양쪽에 들어갔다. 되돌리고 `owner` · `projectId` 만 남겼다.
- **검증** — 실기기가 없어 Android 35(Play Store 이미지) 에뮬레이터에 APK 를 깔았다. 로그인 → 합성 세로 클립(3초 × 3)을 `가져오기` →
  무비 생성 → 서버 렌더 완성("10월 9일 오후 9:25 완성 · 2.6초") → 재생까지 됐다. 실기기 확인은 앞 항목의 Galaxy S22 Ultra 가 했다.
- **찾은 것** — 새 계정은 크레딧이 0 이라(가입 보너스 0 · 광고 보상 꺼짐 · 결제 mock) 무비를 만들 수 없다. 이번에는 서버 셸에서
  `credit_ledger` 에 `promo` 1000 을 넣었다(처음에 Supabase UID 를 `users.id` 자리에 넣어 FK 오류가 났다 — 둘은 다른 값이다).
  공모전 동안의 지급 방식은 바로 아래 항목, iOS 는 backlog B-8.

## 2026-10-09 (이어서) — 공모전 서버의 가입 보너스(CRD-8) · 중복 지급 경합 수정

테스터 앱 확인에서 새 계정이 크레딧 0 이라 무비를 만들 수 없음을 찾았다(바로 위 항목). 공모전 서버만 가입 보너스 **500**(무비 5편)을
주기로 했다 — 광고 보상을 켜는 안은 AdMob 콘솔 · SSV · 앱 재빌드가 필요해 늦고, 손으로 주는 안은 테스터마다 서버 셸이 필요하다.

- **스펙** — CRD-8 에 공모전 서버의 값과 "계정마다 한 번 · 켜기 전 계정도 다음 요청에서 받는다"를 적었다
  ([specs/credits-and-payment.md](./specs/credits-and-payment.md)). 기본값 0 은 그대로라 코드 기본값은 바꾸지 않았다.
- **켜기 전에 고친 결함** — `grantSignupBonus`(`apps/api/src/services/credit.service.ts`)는 인증된 요청마다 "없으면 넣는다"를 해서,
  앱이 시작할 때 보내는 동시 요청에서 두 번 들어갈 수 있었다. 값이 0 이라 드러나지 않았다. 부분 유니크 인덱스는 Prisma 스키마로
  선언할 수 없어(다음 마이그레이션이 지운다) 예약처럼 유저 행 `FOR UPDATE` 로 직렬화하고 잠금 안에서 다시 확인한다. 이미 받은 계정은
  잠그기 전에 돌아간다.
- **검증** — `billing.test.ts` 에 "동시 요청 20개에도 한 번만" · "켜기 전에 가입한 계정도 다음 요청에서 한 번"을 더했다. 수정을 빼면
  첫 테스트가 `expected 2 to be 1` 로 실패한다. `npm test -w apps/api` 41개 파일 626건 통과.
- **남은 것** — 서버 시크릿에 값을 넣는 일(backlog B-8).

## 2026-10-09 (이어서) — 가입 보너스를 서버에서 켰다(backlog B-8 테스터 크레딧 닫음)

- **반영** — 경합 수정이 든 `d4f40bc` 를 배포하고, 시크릿 `dweax/service/snaply/env` 에 `CREDIT_SIGNUP_BONUS=500` 을 더했다(키 25 → 26개,
  나머지 값은 그대로). 배포가 시크릿을 고친 뒤에 env 파일을 만들어 `/data/compose/.env` 에 `CREDIT_SIGNUP_BONUS='500'` 이 들어갔다 —
  `write-env.sh` 가 값을 작은따옴표로 감싸므로 `grep '=500'` 으로는 찾지 못한다.
- **확인** — 배포 직후 `signup_bonus` 행은 0 이었고(요청이 아직 없었다), 에뮬레이터에서 테스트 계정으로 앱을 다시 열자 그 계정에
  `signup_bonus` 가 **1행** 들어왔다. 앱은 시작할 때 요청을 여러 개 동시에 보내므로 중복 없이 한 번이다.

## 2026-10-09 (이어서) — 촬영 화면의 권한 버튼 라벨을 맞춘다(backlog E-23 닫음)

권한이 거절된 뒤 OS 설정으로 보내는 버튼이 앨범 · 알림 화면은 `설정에서 권한 켜기` 인데 촬영 화면만 `설정에서 권한 열기` 였다(UX `Inconsistent Twin`).
촬영 화면(`apps/mobile/src/pages/capture-record/ui/capture-record-page.tsx`)을 `설정에서 권한 켜기` 로 맞추고, 두 라벨이 언제 나오는지를
[capture-flow.md](../apps/mobile/docs/features/capture-flow.md)에 적었다. 이 화면에는 테스트가 없고 문구 하나만 바뀌어 새로 더하지 않았다.

- **검증**: `npm run verify:mobile` 통과(175개 스위트 1398건, lint 경고 1건은 원래 있던 것). 기기에서는 보지 않았다.

## 2026-10-09 (이어서) — `API_HOST_PORT` 를 환경변수 원천에 선언한다(backlog E-22 닫음)

컨테이너 스택(`docker-compose.yml`)의 api 호스트 포트 `API_HOST_PORT` 가 [`env-spec.ts`](../apps/api/src/env-spec.ts)에 없었다(AGENTS.md: 새 변수는
env-spec 부터). `POSTGRES_HOST_PORT` 처럼 `origin: 'local'` 로 선언하고 [`.env.example`](../.env.example)에 빈 예시와 설명을 넣었다. 지금 이 값을
읽는 곳은 `docker-compose.yml` 과, 값을 스스로 정해 넘기는 `scripts/smoke-images.sh` 다 — 백로그가 들던 배포 잡의 헬스체크는 AWS 로 옮기며 고정
3000 을 쓰게 되어 더는 읽지 않는다.

- **검증**: `npm test -w apps/api` 41개 파일 624건 통과(`env-spec.test.ts` 포함).

## 2026-10-09 (이어서) — 낡은 코드 주석 · 설명을 고친다(backlog G 항목 닫음)

동작은 맞고 글만 낡았던 곳을 한 번에 고쳤다(2026-10-09 문서 감사에서 모은 목록).

- `.github/workflows/deploy.yml` 머리 주석 — 배포 대상은 AWS 서버의 self-hosted runner, 시크릿은 Secrets Manager 에서 배포 때 만든 env 파일이다.
  주석만 바뀌었지만 이 파일은 `deploy.yml` 의 `paths` 에 들어 있어 머지하면 같은 코드로 배포가 한 번 돈다.
- `DELETE /auth/me/analysis-consent` 설명 — 파기 대상에 편집 초안 기록을 더했다(`withdrawAnalysisConsent` 가 `movieDraft` 도 지운다).
  `openapi.json` 은 그 한 줄만 바뀌었고, [api-spec.md](./api-spec.md)는 이미 맞게 적혀 있었다.
- `schema.prisma` `AdReward.status` 주석에 `abandoned` 를 더했다(`npm run db:generate` 로 클라이언트를 다시 만들었다, 마이그레이션 없음).
- `.env.example` Redis 머리말의 "운영: Upstash" 를 걷었다 — AWS 서버도 compose 의 redis 컨테이너다.
- `scripts/media-cleanup.mjs` 머리 주석 — 정리 대상은 `media:e2e` 가 공유 DB 에 만든 데이터이고, 통합 테스트는 `snaply_test` 만 쓴다.
- `retention-policy.ts` `EXPIRY_NOTICE_HOUR_KST` — 배치 로그용 표시값이고 실제 시각은 `deploy/batches.cron` 이 정한다고 적었다.
- 앱의 "(global) deep-link handler" 주석 9곳 — 인증 메일의 링크는 Expo Router 가 `pages/auth-callback` 화면으로 보내 그 화면이 코드를 교환한다.
  백로그 목록의 7개 파일에 같은 표현을 쓰던 `use-sign-up-flow.ts` · `sign-up-provider.ts` 를 더했다.
- `apps/mobile/.prettierignore` — 없는 대상(`src/shared/api/schema.d.ts` · `docs/api/openapi.json` · `docs/guides/**/*.html`)과 없는 스크립트를 가리키던 줄을 지웠다.
- **검증**: `npm test -w apps/api` 41개 파일 624건 · API typecheck · `npm run verify:mobile`(175개 스위트 1398건, lint 경고 1건은 원래 있던 것) 통과.

## 2026-10-09 (이어서) — 무비의 완성 시각은 서버가 기록한 작업 종료 시각이다(backlog E-26 닫음)

다른 기기에서 8:20 에 끝난 무비가 늦게 켠 에뮬레이터에서 "오후 8:37 완성"으로 보였다 — 진행 중이던 작업을 이어받은 기기가 끝을 확인한 순간의
`Date.now()` 를 `render.renderedAt` 으로 썼기 때문이다(`apps/mobile/src/features/compose-movie/model/use-generation-runner.ts` `finish`).
백로그는 무비 계약에 시각을 더해야 한다고 적었지만, 앱이 끝을 확인하는 `GET /edit-jobs/{id}` 가 이미 `completedAt` 을 싣고 있어 계약은 그대로 두었다.

- **고친 것** — `getEditJob` 이 `completedAt` 을 epoch ms 로 읽고(`api/get-edit-job.ts`, 없거나 읽을 수 없으면 뺀다), 러너가 그 값을 `renderedAt` 으로
  쓴다. 서버가 시각을 주지 않았을 때만 지금 시각으로 떨어진다. 받아 온 `ready` 무비 중 작업 id 가 없는 것은 그대로 무비의 `updatedAt` 을 쓴다
  (`entities/movie/lib/movie-sync.ts`). 기능 문서 [movie.md](../apps/mobile/docs/features/movie.md) Watch mode.
- **검증**: 러너 테스트(서버의 종료 시각으로 날짜를 매긴다 — 수정 전 실패)와 `get-edit-job` 테스트(읽기 · 없을 때 빼기)를 더했다. `npm run verify:mobile` 통과
  (175개 스위트 1403건, lint 경고 1건은 원래 있던 것). 기기에서는 보지 않았다 — 테스터 앱을 다시 빌드해 두 기기로 보면 된다.

## 2026-10-09 (이어서) — 모든 알림을 앱의 채널 하나로 보낸다(backlog E-25 닫음)

휴대폰 확인에서 어떤 알림도 앱이 만든 Android 채널(`default`)로 가지 않는 것이 드러났다 — 서버 푸시는 채널을 지정하지 않아 FCM 기본 채널로,
앱이 띄우는 알림은 채널을 넘기지 않아 expo 기본 채널로 들어갔다. 오너 결정으로 채널은 **하나**로 둔다(종류별 끄기는 계정의 알림 설정이 맡고,
만료 예고는 기기에서 따로 끌 수 없게 둔다). 결정은 [notification-preferences.md](./decisions/notification-preferences.md) §Android 알림 채널은 하나.

- **서버** — `sendToUser`(`apps/api/src/services/fcm.service.ts`)가 FCM 메시지에 `android.notification.channelId: 'default'` 를 싣는다.
- **앱** — `presentLocalNotification` 이 Android 에서 같은 채널을 지정하고, 채널 이름을 "기본 알림"에서 "알림"으로 바꿨다
  (`apps/mobile/src/shared/lib/notifications/local.ts` — 같은 id 라 이미 있는 채널은 이름만 바뀐다). 기능 문서
  [location-and-push-notifications.md](../apps/mobile/docs/features/location-and-push-notifications.md).
- **검증**: `fcm.test.ts` 의 발송 형태에 채널을 더했고(수정 전 실패), 앱에 `local.test.ts` 를 새로 두어 Android 의 채널 지정 · iOS 의 즉시 표시 ·
  같은 채널 생성을 본다(수정 전 Android 사례 실패). 기기에서는 아직 보지 않았다 — 테스터 앱을 다시 빌드한 뒤 `dumpsys notification` 으로
  세 경로(꺼짐 · 뒤 · 연 채로)의 채널을 본다. 서버 쪽은 배포된 뒤에야 휴대폰에서 효과가 보인다.

## 2026-10-09 (이어서) — 알림 채널과 완성 시각을 두 기기에서 확인한다(E-25 · E-26)

`main` `f356f81`(E-25 · E-26 머지 뒤)로 테스터 앱을 다시 빌드해 휴대폰과 에뮬레이터에 깔고, 같은 커밋이 AWS 서버에 배포된 뒤(22:12 KST) 확인했다.

- **알림 채널(E-25)** — 두 기기 모두 Snaply 의 `default` 채널 이름이 "알림"으로 바뀌었다. 앱을 연 채로 받은 완성 알림(앱이 띄움)과
  프로세스를 없앤 뒤 받은 완성 푸시(시스템이 띄움, 서버가 채널을 지정) 모두 `channel=default` 였다(`dumpsys notification`). 앱이 뒤에 있을 때는
  프로세스가 없을 때와 같은 시스템 표시 경로라 따로 돌리지 않았다. 이전 빌드를 썼던 기기에는 그 빌드가 만든 두 기본 채널(Miscellaneous)이 남아
  있다 — 출시 전이라 테스트 기기에만 있고 이제 아무것도 보내지 않는다.
- **완성 시각(E-26)** — 휴대폰이 22:14 · 22:16 · 22:17 에 만든 세 무비를, 그동안 동기화하지 않은 에뮬레이터가 22:18 에 받아 오니 "오후 10:14 ·
  10:16 · 10:17 완성"이었다(고치기 전이면 모두 10:18).
- **확인 중 바꾼 것** — 22시가 넘어 테스트 계정의 조용한 시간(22-08시)에 걸려 서버가 완성 푸시를 보내지 않으므로, 확인하는 동안 시작을 23시로
  미뤘다가 22시로 되돌렸다. 생성 세 번으로 테스트 계정 크레딧 300 을 썼다.

## 2026-10-09 (이어서) — 워커 쪽 취소 중단 · 실패 환급 실검증(backlog F 닫음, E-27 올림)

2026-08-13 · 08-14 에 문법 검증만 했던 두 경로를 로컬에서 실제 편집 워커(`npm run worker`)로 돌렸다. API 는 `auth:stub` 으로 인증하고
(`SUPABASE_URL=http://127.0.0.1:54321` — 스텁이 `127.0.0.1` 로 발급해 `localhost` 로 주면 issuer 가 달라 401 이다), 새 사용자에 20초 세로
합성 클립 셋을 `media-e2e.mjs --upload-only --token` 으로 올렸다. 로컬 `.env` 의 가입 보너스 1000 과 `promo` 300 으로 잔액 1300 에서 시작했다.

- **취소** — `export`(잔액 1300 → 1200) 직후 작업이 `processing` · 10 일 때 `DELETE /edit-jobs/{id}` → 잔액이 바로 1300 으로 돌아왔다(API 의 환급).
  워커는 그때 돌던 컷편집을 마친 뒤 다음 진행률 갱신(35)에서 "편집 취소 감지, 중단"으로 멈췄다(취소 12초 뒤). BGM · 업로드로 가지 않았고 MinIO 에
  그 작업의 결과물이 없다. 원장은 `export_reserve -100` · `export_refund +100` 한 번씩, 40초 뒤에도 작업 `canceled` · 무비 `draft` · 결과물 없음.
- **실패 환급** — 워커를 끈 채 `export`(1300 → 1200)하고 원본 하나를 MinIO 에서 지운 뒤 워커를 켰다. 다운로드가 404 로 실패해 작업이
  `failed`(`INTERNAL`)가 되고 워커가 `refund_export_credits` 로 환급했다 — 원장 `export_refund +100` 한 번, 잔액 1300.
- **찾은 것** — 실패 5초 뒤 BullMQ 가 같은 작업을 다시 넘겼고(`attempts: 3`), 워커는 `mark_processing` 거절을 "편집 취소 감지"로 적고 끝냈다.
  재시도가 실제로는 재시도하지 않고 일시적 실패도 첫 시도에서 확정된다 — backlog E-27. 환급은 두 번 되지 않았다.

## 2026-10-10 — 일시적 실패는 워커가 다시 시도한다(MOV-12, backlog E-27 닫음)

편집 큐는 `attempts: 3` 으로 넣는데 워커가 첫 예외에서 실패를 확정하고 환급해, 큐의 재시도는 시작에서 거절되며 "편집 취소 감지"로
찍히기만 했다(2026-10-09 "워커 쪽 취소 중단 · 실패 환급 실검증"). S3 일시 오류도 사용자에게 바로 실패로 갔다. 스펙 MOV-10 은 이미
"자동 재시도로 추가 차감되지 않는다"고 재시도를 전제하고 있었다.

- **스펙** — MOV-12 에 "일시적인 오류는 서버가 스스로 다시 시도(최대 3회) · 그동안 만드는 중 · 진행 줄이 '다시 시도하는 중' · 진행률은
  뒤로 가지 않음 · 마지막 시도까지 실패해야 실패로 알림 · 원본 없음 · 시간 초과는 바로 알림"을 더했다([specs/movie.md](./specs/movie.md)).
- **워커** — `process_edit_job`(`apps/ai-worker/src/worker.py`)이 마지막 시도(`attemptsMade + 1 >= attempts`)에서만 `failed` · 환급을
  확정한다. 그 전의 실패는 작업을 `queued` · 진행률 0 으로 되돌리고(`db.requeue_for_retry`, 그 사이 취소됐으면 다시 시도하지 않는다)
  `{progress: 0, step: "다시 시도"}` 를 보낸 뒤 큐에 맡긴다. 원본 없음 · 시간 초과는 `job.discarded` 로 남은 시도를 버리고 바로 확정한다
  (bullmq 파이썬 2.14 는 `UnrecoverableError` 를 따로 다루지 않는다). 시작이 거절되면 상태를 읽어 취소와 이미 끝난 작업(`JobSettled`)을
  가른다 — 끝난 작업을 "취소"로 적지 않는다.
- **앱** — 단계 문구 표에 `다시 시도` → "다시 시도하는 중"을 더하고(`lib/edit-step-label.ts`), 러너가 보여 준 진행률보다 낮게 보고된 단계는
  반영하지 않는다(`reportedStep`) — 다시 시작한 작업의 앞 단계가 문구를 거꾸로 돌리지 않게, 재시도 알림만 예외다. 기능 문서
  [movie.md](../apps/mobile/docs/features/movie.md) Progress.
- **API 문서** — 작업 상태가 `processing` → `queued` 로 돌아갈 수 있음을 route 설명(`openapi.json` 재생성)과 [api-spec.md](./api-spec.md)
  WebSocket 절에 적었다. 코드 변경은 없다(앱은 `queued` 를 "계속 기다림"으로 읽고, MOV-11 판정 · 취소는 `queued` 를 이미 다룬다).
- **검증** — 워커: `tests/test_edit_worker.py` 8건(일시적 실패는 되돌리고 확정하지 않음 · 마지막에 확정 · 재시도 없는 큐는 바로 확정 · 실패 중
  취소면 다시 시도 안 함 · 원본 없음 · 시간 초과는 바로 확정 · 끝난 작업은 settled · 취소된 작업은 canceled). 수정을 빼면 5건이 실패한다.
  앱: 문구 · `reportedStep` · 러너 테스트, 수정을 빼면 6건 실패. 로컬 실스택(auth 스텁 · API · 워커)으로 두 번 돌렸다 — 원본을 지운 채
  시작해 첫 시도 실패(작업 `queued` · 0, 환급 없음) 뒤 원본을 되돌리자 5초 뒤 재시도가 `done`(원장은 예약 -100 하나), 원본을 지운 채
  두면 0 · 5 · 10초 뒤 세 번 시도하고 마지막에만 `failed`(INTERNAL) · 환급 1회. 워커 220건 · `npm test -w apps/api` 41개 파일 626건 ·
  `npm run verify:mobile` 176개 스위트 1412건 통과(lint 경고 1건은 원래 있던 것). 기기 화면은 보지 않았다.

## 2026-10-10 (이어서) — SNS 업로드 준비 경고가 서명 호스트를 본다(backlog E-21 닫음)

인스타 · 틱톡에 넘기는 영상 URL 은 결과물의 presigned GET 이고, 서명 호스트는 `S3_PUBLIC_ENDPOINT` → `S3_ENDPOINT` → AWS S3 순이다
(`apps/api/src/services/storage.service.ts` `presignClient`). 그런데 기동 때 외부 도달 여부를 경고하는 `snsUploadReadiness` 는 CloudFront 를 먼저 보는
`publicBaseUrl` 을 판정해, `CLOUDFRONT_DOMAIN` 만 터널 주소이고 `S3_PUBLIC_ENDPOINT` 가 localhost 면 경고 없이 업로드가 400 이 됐다.

- **고친 것** — `StorageConfig.presignOrigin` 을 `presignClient` 와 같은 순서로 정하고(`apps/api/src/config.ts`), 기동 경고가 그 값을 본다
  (`apps/api/src/app.ts`). 경고와 업로드 거절(400) 문구가 고칠 값으로 `CLOUDFRONT_DOMAIN` 대신 `S3_PUBLIC_ENDPOINT` 를 말한다. 터널 스크립트
  (`apps/api/scripts/dev-tunnel.sh`)가 `.env` 에 넣을 값으로 `S3_PUBLIC_ENDPOINT=https://media-dev.<도메인>` 도 출력하고, 그 값을 손으로 넣으라던
  [local-tunnel.md](./local-tunnel.md) §6 · [sns-setup.md](./sns-setup.md) §1 을 고쳤다. AWS 서버는 엔드포인트가 비어 서명 호스트가 AWS S3 라 경고가 없다.
- **검증**: `config.test.ts` 에 서명 호스트 세 경우(AWS S3 · 공개 엔드포인트 · CloudFront 만 공개 — 수정 전 셋 다 실패)를 더했다. `npm test -w apps/api` 41개 파일 629건 ·
  typecheck · lint 통과.
- **남은 것**: 터널로 실제 키 업로드를 다시 돌리는 확인은 backlog F 로 옮겼다(C-2 · D-3 와 같은 자리에서).

## 2026-10-10 (이어서) — UX 문구 규칙의 범위를 좁힌다(backlog H-1 닫음)

오너가 권장안을 골랐다. [ux-writing.md](../apps/mobile/docs/ux/ux-writing.md) 용어표를 좁혔다. `지우기` · `지울까요` 금지는 사용자가 누르는 버튼과
묻는 질문에만 걸고, 결과를 설명하는 문장의 `지워요`(분석 동의 문구 등)는 허용한다. `촬영` 금지는 카메라 컨트롤의 보이는 라벨과 접근성 라벨에만
걸고 메시지(`촬영을 완료하지 못했어요`)는 둔다 — 그래서 캡처 화면 ✕ 의 접근성 라벨 두 곳을 `촬영 닫기` 에서 `카메라 닫기` 로 바꿨다
(`apps/mobile/src/pages/capture-record/ui/capture-record-page.tsx`). 템플릿 힌트의 `장면`(`처음 본 장면`)은 컷이 아니라 찍을 대상을 말하므로 허용한다.

## 2026-10-10 (이어서) — 결정이 끝난 결정 문서의 제목을 바꾼다(backlog H-2 닫음)

오너가 권장안을 골랐다. "결정 요청 —"으로 시작하던 네 문서(`snap-retention-period` · `local-copy-after-upload` · `movie-cleanup-after-export` ·
`movie-export-policy`)와 구독을 들인 것처럼 읽히던 `storage-and-subscription-policy` 의 제목을 결정을 말하는 제목으로 바꿨다. 옛 제목을 인용하거나
앵커로 가리키는 곳은 없었고, [decisions/README.md](./decisions/README.md)는 파일 이름과 요약으로 적혀 있어 그대로 맞다.

## 2026-10-10 (이어서) — 테스트의 한국어는 리터럴도 된다(backlog H-4 닫음)

오너가 권장안을 골랐다. [writing-unit-tests.md](../apps/mobile/docs/workflows/writing-unit-tests.md)가 리터럴과 `\uXXXX` 이스케이프를 둘 다 허용한다.
편집 도구가 리터럴로 되써 규칙이 지켜지지 않았다(46개 파일). 스타일을 바꾸려고 파일을 변환하지 않는다.

## 2026-10-10 (이어서) — 모바일 에셋은 루트 assets 에 둔다(backlog H-7 닫음)

오너가 권장안을 골랐다. 규칙은 "여러 slice 가 쓰면 `shared/assets`, 한 slice 만 쓰면 그 근처"였지만 `src/shared/assets` 는 없고 화면이 그리는
브랜드 글리프도 루트 `apps/mobile/assets/images` 에 있었다. 지금 구조를 규칙으로 적었다 — 이미지와 폰트는 모두 루트 `assets` 에 두고
`@/assets/*` 로 불러온다([expo-router.md](../apps/mobile/docs/frameworks/expo-router.md) §Asset placement,
[feature-sliced-design.md](../apps/mobile/docs/architecture/feature-sliced-design.md)의 `shared` 트리에서 `assets` 를 뺐다). 파일은 옮기지 않았다.

## 2026-10-10 (이어서) — ONBOARDING 의 통합 전 브랜치 절을 걷는다(backlog H-9 닫음)

오너가 권장안을 골랐다. [ONBOARDING.md](../ONBOARDING.md) §5 의 "모노레포 통합(2026-08-31) 이전에 분기한 브랜치" 절은 그런 브랜치가 원격 · 로컬
어디에도 없어 지우고, 지금도 쓸모 있는 한 가지 — `apps/mobile` 의 `git log` · `git blame` 이 통합 커밋 `d13f921` 이전으로 내려가지 않는다는 것 — 만
§5 목록의 한 줄로 남겼다. 그 절을 가리키는 링크는 없었다.

## 2026-10-10 (이어서) — editSpec v3 결정 ID 에 접두를 붙인다(backlog H-10 닫음)

[decisions/edit-spec-v3.md](./decisions/edit-spec-v3.md)의 결정 항목 ID(`A-1`~`D-8`, 27개)가 백로그 ID 와 모양이 같아 grep 과 독자가 헷갈렸다
(백로그 B-6 은 알림 설정, 결정 B-6 은 컷 타이밍). 오너 결정으로 `V3-A1` · `V3-B6` 꼴로 바꿨다 — 접두를 붙이고 가운데 하이픈을 빼 백로그 ID 와
겹치지 않는다.

- **바꾼 곳** — 결정 문서(34곳)와 두 초안 [plans/edit-spec-v3.md](./plans/edit-spec-v3.md) · [plans/asset-pack-manifest.md](./plans/asset-pack-manifest.md)
  (24 · 14곳), 이 ID 를 인용하는 [backlog.md](./backlog.md) A-7 · [auto-edit-draft.md](./decisions/auto-edit-draft.md) ·
  [trend-editing-pipeline.md](./plans/trend-editing-pipeline.md), 무효화 사전의 `note` 세 곳(`packages/shared-types/src/invalidation-vocabulary.json`),
  코드 주석(`invalidation.ts` · `invalidation.py` · 두 무효화 테스트). 같은 문서에 섞인 백로그 ID(A-3 · A-7 · C-7 등)와 만료 예고의 D-3 · D-1 은 그대로다.
  결정 문서 헤더에 정정 배너를 달아, 그 전의 기록(이 progress 포함)은 옛 ID 를 쓴다고 적었다.

## 2026-10-10 (이어서) — 문서만 바꾼 변경에는 CI 를 돌리지 않는다

CI(`.github/workflows/ci.yml`)가 문서만 바꾼 PR 과 `main` push 에도 네 작업(API 빌드 · 모바일 검증 · API 통합 테스트 · 워커 테스트)을 모두 돌렸다.
어떤 검사도 `docs/` 나 마크다운을 읽지 않으므로(모바일 prettier 도 `*.md` 를 무시한다, `docs/` 의 마크다운 아닌 두 파일도 코드가 쓰지 않는다)
`push` · `pull_request` 에 `paths-ignore: ['docs/**', '**/*.md']` 를 두었다. 코드가 하나라도 섞이면 지금처럼 전부 돈다. `main` 에 브랜치 보호 ·
필수 검사가 없어(2026-10-10 확인) 건너뛴 PR 의 머지가 막히지 않는다 — 나중에 필수 검사를 걸면 문서 PR 이 "대기"로 남지 않게 다시 봐야 한다.
[ONBOARDING.md](../ONBOARDING.md) §3 의 CI 설명을 맞췄다.

## 2026-10-10 (이어서) — 만료 예외 결정 문서에 결정 기록을 채운다(backlog H-3 닫음)

오너가 권장안을 골랐다. [movie-snap-expiry-exemption.md](./decisions/movie-snap-expiry-exemption.md)는 상태가 `결정(잠정)` 인데 결정 기록이 없고
인덱스에서는 "결정 대기" 표에 있었다. 상태는 그대로 두고 결정 기록 표를 새로 만들어 잠정 결정 A(예외 없음, 2026-09-15)와 기각 이유를 채웠다 —
결정자는 커밋에도 남지 않아 "기록 없음"으로 적었다. [decisions/README.md](./decisions/README.md)에서는 "결정 완료" 표로 옮기고 "잠정 · 다음 회의에서
C 부터"라고 밝혔다. 다시 볼 안건은 그대로 backlog A-1 에 있다.

## 2026-10-10 (이어서) — 모바일 로컬 개발 문서를 지금 Mac 에 맞춘다(backlog H-6 닫음)

[local-development-and-testing.md](../apps/mobile/docs/workflows/local-development-and-testing.md)의 명령이 구형 Intel Mac(Xcode 16.4 · `iPhone 16` ·
AVD `Pixel_API_35` · 캐시의 Expo Go)을 기준으로 했다. 지금 작업하는 Mac(Xcode 27 · `iPhone 17` · 손으로 만든 AVD `snaply_api35` · Expo Go 를
api.expo.dev 에서 받는다)을 기본으로 바꾸고, 두 프로필을 표로 나란히 적었다. 구형 장비가 아직 쓰이는지 알 수 없어 구형 절은 걷지 않았다.
Expo Go 를 받는 명령은 `https://api.expo.dev/v2/versions` 의 응답(`sdkVersions["57.0.0"].iosClientUrl` → `Expo-Go-57.0.9.tar.gz`)으로 확인했다.

## 2026-10-10 (이어서) — 워크릿에서 JS 로 넘길 때는 scheduleOnRN 을 쓴다(backlog H-8 닫음)

[animations-and-gestures.md](../apps/mobile/docs/frameworks/animations-and-gestures.md)는 `runOnJS` 를 처방하고 다섯 파일이 그렇게 썼는데, 스플래시만
`react-native-worklets` 의 `scheduleOnRN` 을 썼다. 설치된 Reanimated 4.5.1 이 `runOnJS` 를 `@deprecated` 로 표시하고 `scheduleOnRN` 을 쓰라고
안내하므로 그쪽으로 통일했다 — `bottom-sheet.tsx` · `timeline-cut.tsx` · `extract-window.tsx` · `capture-flight.tsx` 의 `runOnJS(fn)(...args)` 를
`scheduleOnRN(fn, ...args)` 로 바꾸고, 문서에 규칙과 이유를 적었다. Gesture Handler 의 `.runOnJS(true)`(`extract-strip.tsx`)는 다른 API 라 그대로다.

- **검증**: `npm run verify:mobile` 통과(176개 스위트 1412건, lint 경고 1건은 원래 있던 것). 기기에서는 보지 않았다 — 바텀 시트 닫기 · 컷 다듬기 · 추출 창 · 촬영 비행 애니메이션의 완료 콜백이 대상이다.

## 2026-10-10 (이어서) — env-management 의 후속 연계를 배너로 옮긴다(backlog H-11 닫음)

[decisions/env-management.md](./decisions/env-management.md)의 "후속 연계"는 작성 뒤에 덧붙인 결정(배포 플랫폼 = AWS 공모전 서버)인데 본문 절로 남아
있었다([doc-conventions.md](./doc-conventions.md) §헤더: 후속 결정은 헤더 아래 배너). 헤더의 `> **후속 결정**(2026-10-08)` 배너로 압축하고 절을 지웠다.
빈 값을 옮기지 않는 이유 같은 쓸모 있는 사실은 배너에 남겼고, 지운 절을 가리키는 링크는 없었다.

## 2026-10-10 (이어서) — UX 목표 문장을 하나로 맞춘다(backlog H-12 닫음)

오너가 권장안을 골랐다. [guardrails.md](../apps/mobile/docs/ux/guardrails.md)는 그대로 둔다. 목표 문장은 [philosophy.md](../apps/mobile/docs/ux/philosophy.md)를
원천으로 두고 [principle-priority.md](../apps/mobile/docs/ux/principle-priority.md)에만 있던 조건("능력 · 통제를 잃지 않고")을 더했으며,
principle-priority 는 그 문장을 그대로 인용한다. [ux/README.md](../apps/mobile/docs/ux/README.md)의 라우팅 표는 바꿀 것이 없었다.

## 2026-10-10 (이어서) — A-1 ② 의 통과를 유지한다(backlog H-14 닫음)

2026-10-09 정리에서 A-1 "서버 전환 실기기 검증"의 ② "편집이 PATCH 된다"를 2026-10-01 실기기 기록으로 통과 처리한 것을 오너가 그대로 두기로 했다 —
② 는 무비 편집이 서버에 PATCH 로 닿는다는 뜻이다. 2026-10-09 휴대폰에서 바꾼 스타일이 결과물에 반영된 것도 같은 경로다.

## 2026-10-10 (이어서) — RLS 정책이 없던 테이블 다섯 개(backlog E-19 닫음)

`rls-policies.sql` 은 "모든 테이블에 RLS 를 켠다"는 원칙인데 뒤에 생긴 `user_consents` · `video_signals` · `movie_recommendations` ·
`movie_recommendation_items` · `movie_drafts` 는 RLS 를 켜는 줄도 없었다. 로컬과 AWS 서버는 각자의 Postgres 라 새는 것은 없지만,
공유 Supabase DB 로 돌아가면 이 다섯은 앱에 든 공개(anon) 키로 Data API 에서 열린다. (a) 원칙을 지키기로 했다.

- **정책** — 다섯 모두 서버(API · 워커)만 쓰는 데이터라 기존 `video_analyses` · `credit_ledger` 처럼 **본인 것 조회만** 연다. 소유자 컬럼이
  없는 `video_signals` 는 `videos` 를, `movie_recommendation_items` 는 `movie_recommendations` 를 거쳐(`exists`) 판정한다. 동의 기록은
  클라이언트가 쓰면 이력을 지어낼 수 있어 특히 쓰기를 열지 않는다. 새 테이블을 만들 때 정책을 같이 쓰라는 규칙을 [team.md](./team.md) §3 에 넣었다.
- **검증** — 로컬 Postgres 에 임시 DB 를 만들어 `snaply_test` 스키마를 복사하고, Supabase 의 `auth.uid()` · `authenticated` 역할을 흉내 낸 뒤
  파일 전체를 `ON_ERROR_STOP` 으로 적용했다(오류 없음). 사용자 A · B 의 행을 넣고 A 로 읽으면 다섯 테이블 모두 A 의 1행만, 로그인 없이 읽으면
  0행이었다. 쓰기 권한을 일부러 준 상태에서도 A 의 동의 기록 추가는 `violates row-level security policy` 로 거절되고 초안 수정은 0행이었다.
  임시 DB 와 역할은 지웠다. 실제 Supabase 에는 적용하지 않았다 — 공유 DB 를 쓰지 않는다.

## 2026-10-10 (이어서) — MinIO 는 소스 빌드 미러를 유지한다(backlog E-7 닫음)

MinIO 커뮤니티판은 이미지 배포와 보안 패치를 멈췄고, 우리는 같은 릴리스(`RELEASE.2025-09-07T16-13-09Z`)를 소스에서 빌드한 GHCR 미러를
쓴다(2026-09-25). 2026-10-09 사내 서버를 접어 운영 저장소는 AWS S3 하나가 됐고, MinIO 는 로컬 개발과 CI(통합 테스트 · 이미지 스모크)에서만
돈다 — 패치 없는 서버가 네트워크에 노출되던 문제가 사라졌다.

- **결정** — 대체 서버(RustFS · Garage · SeaweedFS)로 바꾸지 않고 미러를 유지한다. 바꾸면 통합 테스트 · CI 의 저장소 동작을 새로 검증해야
  하는데 얻는 것은 로컬 · CI 의 패치뿐이다. 미러 빌드가 깨지거나 운영에서 MinIO 를 다시 쓰게 되면 다시 연다.
- **패키지 공개** — 새 개발자가 로그인 · 로컬 빌드 없이 받도록 GHCR 패키지 `vlog-studio/snaply-backend/minio` 를 공개로 하기로 했다.
  같은 날 확인 때는 익명 토큰이 발급되지 않고 manifest 가 `403` 이라 아직 비공개였다 — 설정 변경과 ONBOARDING 문구는 backlog G.
- **옮겨 둔 것** — 백로그 본문에만 있던 "업스트림 `.hotfix.*` 태그는 amd64 만 있다"는 주의를 태그를 올리는 `minio-image.yml` 주석으로 옮겼다.
- **실수** — 익명 pull 을 확인하려고 이 Mac 에서 `docker logout ghcr.io` 를 실행했다. 로그인이 있었다면 풀렸다(`docker login ghcr.io` 로 되돌린다).

## 2026-10-10 (이어서) — MinIO 미러 패키지는 비공개로 둔다(backlog G 항목 지움)

바로 위에서 공개하기로 했던 GHCR 패키지 `vlog-studio/snaply-backend/minio` 를 **비공개로 유지**한다. 공개는 새 개발자의 첫 실행 몇 분을
줄이는 편의일 뿐이고, 비공개여도 막히는 곳이 없다 — `ensure-minio-image.sh` 가 받지 못하면 같은 Dockerfile 로 로컬 빌드하고(CI 도 같다),
배포 잡은 잡 토큰으로 받는다. 회사 조직 이름으로 이미지를 외부에 내놓는 일과 MinIO(AGPL) 바이너리 공개 배포의 의무를 따질 필요도 없어진다.
ONBOARDING §3 의 "`docker login ghcr.io` 가 되어 있으면 받아 오고, 아니면 로컬 빌드" 는 그대로 맞다.
