# Snaply 모노레포 개발 진행 기록

각 Phase 완료 시점의 구현 내용, 완료 조건 검증 결과, 특이사항을 기록합니다.
**이 문서는 완료된 것만 담는다** — 아직 닫히지 않은 작업은 [backlog.md](./backlog.md)에 있다.

**저장소**: https://github.com/vlog-studio/snaply-backend — 모바일·API·AI 워커 통합 모노레포

> Phase 1~9의 착수 전 계획서는 [archive/snapvlog-backend-guide.md](./archive/snapvlog-backend-guide.md)에
> 보관돼 있다(현행 사실과 다름 — 판단 근거로 쓰지 말 것).
> Dev B → Dev A 인수인계 기록은 [archive/integrations-handover.md](./archive/integrations-handover.md)(확인 완료).
> 아래 Phase별 표와 기술명은 각 완료 시점의 기록이다. **현재 구조·명령은 README와 ONBOARDING,
> 현재 스키마·계약은 Prisma와 Swagger를 우선한다.**

---

## 개발 인프라 (로컬 Docker, `.env`는 git 제외)

| 서비스 | 컨테이너 | 포트 | 비고 |
|---|---|---|---|
| PostgreSQL | `snaply-postgres-dev` (PostgreSQL 16) | 5432 | `POSTGRES_HOST_PORT`로 호스트 포트 변경 가능 |
| 인증 | Supabase Auth (클라우드) | — | DB는 로컬 PostgreSQL과 분리 |
| 오브젝트 스토리지 | `snaply-minio-dev` (MinIO) | 9100 / 9101 | 9000은 타 프로젝트(skillhub-minio) 점유 |
| 큐 | `snaply-redis-dev` (Redis 7) | 6379 | |
| API 서버 | `npm run dev:api` (Node 26) | 3000 | 점유 시 `apps/api/.env`의 `API_PORT`로 변경 |
| 모바일 Metro | `npm run dev:mobile` (Expo SDK 57) | 8081 | Android 기준 dev client |
| 편집·분석 워커 | `apps/ai-worker/.venv` (Python 3.11) | HTTP 포트 없음 | `npm run worker` / `npm run worker:analysis` |

**개발/운영 전환 원칙**: 스토리지·큐는 endpoint/URL만 교체하면 운영으로 전환된다 (코드 분기 없음).
- S3: `S3_ENDPOINT` 설정 시 MinIO, 비우면 실제 AWS S3 + CloudFront
- Redis: `REDIS_URL` 개발 `redis://localhost:6379` → 운영 Upstash `rediss://...`

---

## Phase 1 — 프로젝트 초기 세팅 ✅

**목표**: 로컬에서 API 서버가 뜨고 DB 연결이 되는 상태.

**완료 조건 검증**
- `GET /health` 200 응답 (`{status:"ok", db:"connected"}`) ✅
- Prisma 마이그레이션으로 테이블 8개 생성, Studio 확인 가능 ✅
- GitHub Actions CI 구성 (Node 빌드/타입체크/린트 + Python compileall) ✅

**구현 내용**
- Turborepo 모노레포: `apps/api`(Fastify+TS), `apps/ai-worker`(Python), `packages/shared-types`(FE 공유 타입)
- Prisma 스키마 8개 테이블(users, locations, notification_logs, videos, edit_jobs, sns_connections, sns_uploads, subscriptions) + snake_case 매핑
- RLS 정책 SQL (`supabase_uid = auth.uid()` 본인 확인, locations 공용 읽기, subscriptions 웹훅 전용)
- 공통 응답 포맷(`{success, data}`/`{success, error}`) 전역 에러/404 핸들러, `.env` 자동 로딩

**특이사항**
- Supabase는 신규 API 키 체계(`sb_publishable_`/`sb_secret_`) 사용
- 프로젝트 리전이 서울이 아닌 싱가포르로 생성됨 (개발 지장 없음)

---

## Phase 2 — 인증 미들웨어 ✅

**목표**: Supabase JWT 검증 + 요청마다 유저 정보 주입.

**완료 조건 검증** (라이브 Supabase 대상 통합 테스트 9/9)
- 유효 JWT → `GET /auth/me` 200 + 프로필 반환 ✅
- 만료/위조 토큰 → 401 ✅
- 신규 유저 첫 로그인 → users 자동 생성(upsert 멱등) ✅

**구현 내용**
- `plugins/auth.ts`: 가이드의 HS256 대신, 실제 프로젝트가 쓰는 **ES256 비대칭 키를 JWKS로 검증**(`jose`). issuer/audience/알고리즘 검증, 헤더+쿼리 토큰 지원(WebSocket 대비)
- `services/user.service.ts`: 첫 로그인 시 JIT 자동 생성, `request.user`는 `{id, supabaseUid, plan}` 최소 정보
- `routes/auth.ts`: `GET/PATCH /auth/me`, `POST /auth/fcm-token` (Fastify 스키마 검증)
- `lib/errors.ts`: 커스텀 `AppError` 클래스

**특이사항 / 잡은 버그**
- 에러 핸들러를 라우트 등록 *뒤*에 설정하면 자식 컨텍스트가 Fastify 기본 핸들러를 캡처 → 401/400 응답이 공통 포맷으로 안 나감. 핸들러를 라우트 등록 *앞*으로 이동해 해결.
- 로그인 방식(구글/애플/카카오 등)은 Supabase 설정+FE 영역이며 백엔드는 JWT만 검증하므로 코드 변경 불필요.

---

## Phase 3 — 영상 업로드 파이프라인 ✅

**목표**: 클라이언트가 S3(MinIO)에 직접 업로드하고 백엔드에 등록하는 흐름.

**완료 조건 검증** (MinIO 대상 통합 테스트 14/14)
- presigned URL로 실제 PUT 업로드 성공 ✅
- `POST /videos` 후 status 'ready' ✅
- private 객체용 presigned GET URL 반환 (기본 1시간) ✅

**구현 내용**
- `services/storage.service.ts`: endpoint-aware S3 (MinIO/AWS 코드 분기 없음). presigned PUT/GET 발급, HEAD 크기 확인, 삭제, 개발용 버킷 자동 생성
- `services/video.service.ts` + `routes/videos.ts`: 5개 엔드포인트
  - `GET /videos/upload-url`(presigned + pending 레코드 선생성), `POST /videos`(업로드 확인 후 ready), `GET /videos`(커서 페이지네이션), `GET/DELETE /videos/:id`
- 소유자 UUID 경로 격리(`uploads/{userId}/{videoId}.mp4`), 소유권 격리(타 유저 404), S3 삭제 + 소프트 삭제
- 스키마에 `videos.s3_key`, `videos.deleted_at` 추가 + 마이그레이션

**특이사항**
- 500MB 제한: presigned PUT은 발급 시 최대 크기를 표현 못 하므로 `POST /videos` 확인 단계에서 HEAD로 검사 후 초과 시 삭제
- 스토리지는 MinIO(S3 호환)로 결정 — presigned URL이 개발환경에서도 동일하게 동작

---

## Phase 4 — AI 편집 큐 시스템 ✅

> 아래 월 3편 제한은 당시 구현·검증 기록이다. 2026-08-05 로직에서 제거됐으며,
> 현재 정책은 [decisions/plan-limits.md](./decisions/plan-limits.md)를 따른다.

**목표**: 편집 요청을 큐에 넣고 Python 워커가 처리하는 비동기 파이프라인.

**완료 조건 검증** (워커 실제 구동, 통합 테스트 11/11)
- `POST /edit-jobs` → BullMQ 큐 적재 ✅
- WebSocket → 진행률 `[10,30,70,95,100]` 실시간 수신 ✅
- 워커 down 중 적재 → 재기동 후 done 처리(작업 유실 없음) ✅
- 추가: 타 유저 영상 → 403, Free 4편째 → 403, 인증 없는 WS → 401

**구현 내용**
- **API**: `lib/redis.ts`(ioredis 연결 팩토리), `queue/edit-queue.ts`(재시도 3회/exponential backoff 5s, jobId 중복 방지), `services/edit-job.service.ts`(소유권·상태 검증, Free 월 3편 제한, 결과물 video 레코드 선생성), `routes/edit-jobs.ts`(POST/GET + WebSocket 진행률, Redis Pub/Sub 구독, 쿼리 토큰 인증)
- **워커(Python)**: `worker.py`(BullMQ 구독), `db.py`(asyncpg로 edit_jobs 상태 전이), 진행률 `edit-progress:{jobId}` 채널 발행. 실제 편집은 Phase 5 자리로 남긴 뼈대

**특이사항 / 막힌 지점**
- 시스템 Python 3.9는 `bullmq`(3.10+ 필요) 미지원 → 가이드 지정 Python 3.11로 venv 구성. `bullmq 2.x`가 `redis<6` 요구해 redis 5.3.1로 핀
- 워커 DB 연결은 asyncpg가 pgbouncer 파라미터를 이해 못 하므로 `DIRECT_URL`(session pooler) 사용, `statement_cache_size=0`

---

## Phase 5 — AI 편집 엔진 ✅

**목표**: Python 워커에서 실제 영상 편집이 완료되어 S3에 결과물이 저장.

**완료 조건 검증** (실제 clip 3개로 end-to-end, 8/8 + 실패경로 2/2)
- 클립 3개 → 편집 요청 → 완성본 S3 저장 (진행률 0→60→95→100, 수초 내) ✅
- 완성 영상에 BGM + 자막 포함 (ffprobe: 1080p 영상 + 오디오 + mov_text 자막 트랙) ✅
- 편집 실패 시 `edit_jobs.status='failed'` + error_message 저장 ✅

**구현 내용** (전부 워커 측, FFmpeg는 subprocess로 직접 호출)
- `storage.py`: boto3 endpoint-aware S3 다운로드/업로드 (MinIO/AWS 공통)
- `pipeline/editor.py`: 클립 1080p/30fps 정규화 + 프리셋별 색보정, 전환 처리
  - 감성=crossfade 0.8s(xfade/acrossfade) + saturation 0.8, 여행=cut + brightness +0.1, 일상=cut(원본 색감)
- `pipeline/music.py`: 태그 기반 BGM 무작위 선택 + 낮은 볼륨 합성 + 끝부분 fade-out. 음원 없으면 BGM 생략
- `pipeline/subtitle.py`: faster-whisper(small, CPU int8, 시작 시 1회 로드) → SRT → mov_text 소프트 자막
- `worker.py`: 다운로드→편집→BGM→자막→썸네일(1초 프레임)→S3 업로드→DB 반영. 단계별 진행률 발행, 10분 타임아웃(`asyncio.wait_for`), 임시 디렉토리 정리
- BGM 라이브러리: `assets/bgm/{calm,upbeat,daily}/` 구조 + `scripts/generate-dev-bgm.sh`(개발용 합성 톤). 실제 음원은 git 제외

**특이사항 / 가이드와 다른 점**
- 무거운 stage(ffmpeg/whisper)는 `asyncio.to_thread`로 실행해 이벤트 루프(BullMQ 하트비트) 논블로킹
- 가이드의 moviepy/ffmpeg-python 대신 **FFmpeg subprocess 직접 호출**(제어·안정성). 결과 반영도 "API 콜백" 대신 워커가 asyncpg로 직접 DB 업데이트 (Phase 4 패턴과 일관)
- 로컬 검증: macOS `say`로 한국어 음성 클립 생성 → whisper가 정확히 전사 확인. FFmpeg는 Homebrew로 설치(8.1.2)

---

## Phase 6 — 위치 알림 시스템 ✅

**목표**: Geofence 진입 이벤트 수신 시 조건에 맞으면 FCM 푸시 발송.

**완료 조건 검증** (통합 테스트 11/11)
- `POST /notifications/geofence-enter` 첫 진입 → 발송(dry-run) ✅
- 30분 이내 같은 위치 재호출 → 미발송(cooldown) ✅
- quiet_hours 구간 → 미발송 ✅ / `notification_enabled=false` → 미발송 ✅
- `GET /locations` Haversine 반경 필터 + 거리순 정렬 ✅ / 없는 위치 404, 미인증 401

**구현 내용**
- `services/fcm.service.ts`: firebase-admin 초기화 + `sendToUser`. 서비스 계정 미설정 시 **dry-run**(로그만), 무효 토큰(`registration-token-not-registered`)은 자동 정리
- `services/location.service.ts`: Haversine 거리 계산·필터, geofence 처리(위치 유효성 → 알림설정 → quiet_hours(KST) → 30분 쿨다운 → 발송 → 로그 기록)
- `routes/locations.ts`(`GET /locations`), `routes/notifications.ts`(`POST /notifications/geofence-enter`)
- 위치 시드: `prisma/seeds/locations.sql`(서울 관광지/카페 + 제주 여행지 50개, `md5(name)` 결정적 id로 멱등), `npm run seed:locations`

**특이사항 / 가이드와 다른 점**
- FCM 실제 수신은 Firebase 서비스 계정(운영) 필요. 개발은 dry-run으로 발송 로직·쿨다운·quiet_hours·enabled 분기를 모두 검증
- 발송 실패해도 200 유지(에러는 로깅), 실제 발송 성공 시에만 `notification_logs` 기록 → 쿨다운 기준
- quiet_hours는 KST(UTC+9) 기준, 자정 넘김(22~8시) 지원. `notification_enabled`/quiet 값은 가이드상 PATCH /auth/me 대상이 아니라 테스트에서 DB로 직접 설정해 검증

---

## Phase 7 — SNS 연동 업로드 ✅

**목표**: 편집 완료 영상을 인스타그램 릴스·틱톡에 업로드.

**완료 조건 검증** (mock 모드 통합 테스트 14/14)
- 인스타그램 연동 → 릴스 업로드 success + platform_post_id ✅
- 틱톡 연동 → 영상 업로드 success ✅
- `sns_uploads` 이력 기록 ✅
- 추가: state CSRF 변조 차단, PERSONAL 계정 거부, 토큰 만료 임박 자동 갱신, disconnect, 미연동 업로드 400

**구현 내용** (9개 엔드포인트: connections/connect/callback/disconnect/upload × instagram·tiktok)
- `lib/crypto.ts`: **AES-256-GCM**로 access/refresh 토큰 암호화 저장, OAuth **state HMAC 서명**(CSRF 방지, userId+nonce)
- `services/sns/*.client.ts`: 인스타그램(Graph API 릴스 컨테이너→게시)·틱톡(Content Posting API v2) 클라이언트. **실키 있으면 실제 호출 / 없으면 mock** 분기
- `services/sns.service.ts`: connect URL 생성, 콜백(토큰 교환→암호화 저장→앱 딥링크 리다이렉트), 업로드(소유권·편집완료 확인→업로드→이력), 틱톡 **토큰 만료 임박 시 refresh 자동 갱신**
- 인스타그램 **비즈니스/크리에이터 계정만 허용** (PERSONAL이면 `snaply://sns/error?reason=account_type` 리다이렉트, 미저장)

**특이사항 / 가이드와 다른 점**
- 실제 업로드는 인스타/틱톡 앱 등록 + 비즈니스 계정 + 실키 필요. 개발은 mock으로 OAuth·암호화·업로드 이력·자동 갱신 로직을 모두 검증 (운영에서 `INSTAGRAM_APP_ID`/`TIKTOK_CLIENT_KEY` 등 설정 시 실제 호출로 전환)
- 토큰은 평문 저장 금지 — DB에는 `iv.tag.ciphertext`(base64) 형태로만 저장됨을 테스트로 확인
- 업로드 실패 시 `sns_uploads.status='failed'` 기록 후 에러 메시지 반환 (동기 응답)

---

## Phase 8 — 결제 시스템 ✅

**목표**: Stripe 구독 결제 완성 및 플랜별 기능 제한 적용.

> 아래 월 3편 연동은 당시 구현·검증 기록이다. 2026-08-05 제거됐고 현재는 집행하지 않는다.
> 크레딧 기반 재설계 상태는 [decisions/plan-limits.md](./decisions/plan-limits.md)를 따른다.

**완료 조건 검증** (mock 모드 통합 테스트 13/13)
- 결제 완료(webhook created) → `subscriptions.plan='standard'` ✅
- 웹훅 해지(subscription.deleted) → `plan='free'` 복귀 ✅
- Free 플랜 4번째 편집 → 403 ✅ (Standard는 4편 모두 202로 무제한 확인)
- 추가: 웹훅 서명 검증(변조/누락 → 400), payment_failed → past_due, cancel은 기간말 해지(즉시 다운그레이드 아님), 결제 전 plan 미변경

**구현 내용**
- `services/billing/stripe.client.ts`: 고객 생성, Checkout Session, 기간말 해지, **웹훅 서명 검증**. 실키 있으면 stripe SDK / 없으면 mock(HMAC-SHA256 서명 검증)
- `services/billing.service.ts`: 플랜 카탈로그(Free/Standard ₩9,900/Premium ₩24,900), checkout(고객 저장·plan은 웹훅 후에만 변경), 구독 조회, 취소, 웹훅 동기화(created/updated/deleted/payment_failed)
- `routes/billing.ts`: `GET /billing/plans`(공개), `GET /billing/subscription`, `POST /billing/checkout`, `POST /billing/cancel`
- `routes/billing-webhook.ts`: **raw body 보존**을 위해 캡슐화 스코프에서 buffer 파서 등록 → 서명 검증 (전역 JSON 파서 미영향)
- 플랜 반영: 웹훅으로 `subscriptions.plan` 갱신 → `request.user.plan`이 자동 반영되어 편집 제한(Free 월 3편)에 연동

**특이사항 / 가이드와 다른 점**
- 실제 결제는 Stripe 테스트 키로 검증 가능하나, 이번엔 mock으로 결제 플로우·웹훅 동기화·서명 검증·플랜 제한을 모두 검증 (운영에서 `STRIPE_SECRET_KEY` 등 설정 시 실제 호출로 전환)
- 720p/1080p/4K·워터마크 등 해상도 제한은 편집 파라미터라 워커(편집 엔진) 몫 — 백엔드는 plan을 `request.user.plan`으로 노출하고 편집 횟수 제한을 강제
- 웹훅 raw body 파서를 전역이 아닌 웹훅 라우트 스코프에만 적용해 다른 JSON 라우트에 영향 없음

---

## Phase 9 — 마무리 및 배포 준비 ✅

**목표**: 운영 배포 및 모니터링 세팅.

**완료 조건 검증** (rate-limit 통합 테스트 5/5, compose 실기동)
- Rate limit: `/edit-jobs` 6번째 429, `/notifications/geofence-enter` 11번째 429, 공통 포맷(`RATE_LIMITED`) ✅
- Docker Compose로 core 스택(postgres+redis+minio+api) 실제 기동 → `/health` 200 (db connected) ✅
- Sentry는 `SENTRY_DSN` 있을 때만 캡처(없으면 no-op) — 전역 에러 핸들러 5xx 캡처 경로 구현 ✅
- `docs/api-spec.md` 작성(FE 전달용)

**구현 내용**
- `lib/sentry.ts` + `index.ts`: SENTRY_DSN 있을 때만 초기화, 전역 에러 핸들러에서 5xx `captureException`. 워커도 `SENTRY_DSN` 시 init + 편집 실패 캡처
- 전역 에러 핸들러: rate limit(429)·AppError·검증(400)·5xx(500+Sentry) 분기, 공통 응답 포맷 유지
- 로그 PII 마스킹: `authorization`/`stripe-signature`/`token`/`accessToken`/`refreshToken`/`fcmToken` redact
- Rate limiting(`@fastify/rate-limit`): 전역 IP 60/분, `/edit-jobs` 토큰당 5/분, `/notifications/geofence-enter` 토큰당 10/분
- `docs/api-spec.md`: 전 엔드포인트 요청/응답 예시 + 에러 코드 + rate limit
- `apps/api/Dockerfile`(모노레포 빌드), `docker-compose.yml`(api+ai-worker+redis+postgres+minio), `.dockerignore`
- `.github/workflows/deploy.yml`: main push 시 GHCR 이미지 빌드/푸시 + 마이그레이션 + 배포 훅(`vars.DEPLOY_ENABLED`로 게이트)

**특이사항 / 가이드와 다른 점**
- Sentry 실수집은 운영 DSN 필요. 개발은 no-op이며 캡처 호출 경로만 구현
- rate-limit 초과 에러는 statusCode를 잃고 전역 핸들러로 던져져 500이 되던 문제 → 핸들러에서 429/`FST_ERR_RATE_LIMIT` 감지해 `RATE_LIMITED`로 매핑
- 인증 전 단계(onRequest)라 유저별 제한 키는 `request.user` 대신 Authorization 토큰 기준
- compose 빠른 검증은 core 스택(api+인프라)까지 실기동 확인. ai-worker 이미지는 torch/faster-whisper로 용량이 커서 이 검증에선 빌드 생략(워커 자체는 Phase 5에서 네이티브 실행 검증 완료)
- 컨테이너 최초 1회 마이그레이션: `docker compose exec api npx prisma migrate deploy --schema prisma/schema.prisma`

---

## 연동/수익화 트랙 하드닝 (Dev B, 2026-08-03)

**배경**: Phase 6~9는 "완료"였지만 검증이 일회성 스크립트로만 이뤄져 레포에 테스트가 없었고,
mock이 가려주던 실키 경로 결함이 남아 있었다. 회귀 안전망을 만들고 그 위에서 결함을 제거했다.

### 통합 테스트 하네스 (신규)

- `vitest` + `apps/api/test/` — **실제 로컬 Postgres/Redis/MinIO** 를 그대로 쓰는 통합 테스트. 84개.
- `apps/api/scripts/auth-stub.ts` — Supabase Auth를 대체하는 **ES256 + JWKS 스텁**.
  `plugins/auth.ts` 는 한 줄도 안 고치고 `SUPABASE_URL` 만 바꿔 붙인다. 실 Supabase 전환은 env 원복이 전부.
  수동 테스트용 CLI 겸용: `npm run auth:stub -w apps/api`
- 개발 DB(`snaply`)와 분리된 `snaply_test` DB를 globalSetup에서 생성·마이그레이션.
- `docker-compose.dev.yml` 에 로컬 Postgres 추가 (team.md §4 옵션 A) — 공유 Supabase 마이그레이션 충돌 회피.

### Phase 6 — 위치/FCM

- **쿨다운 원자성**: `조회 → 발송 → 기록` 이 원자적이지 않았다. 같은 패턴을 격리 재현하면
  10개 동시 요청에서 5건이 중복 기록된다(실서비스 경로에서는 재현되지 않았지만 보장은 없고,
  API 인스턴스가 2개 이상이면 in-process 직렬화가 사라진다).
  → `pg_advisory_xact_lock` 으로 (user, location) 임계구역을 만들어 **선점 → 발송 → 실패 시 보상 삭제** 로 변경.
  발송 실패가 쿨다운을 소모하지 않는 기존 성질은 유지.

### Phase 7 — SNS 연동

실키를 넣는 순간 실패했을 결함들:

- **인스타 컨테이너 처리 대기 누락** — 컨테이너 생성 직후 `media_publish` 를 호출하고 있었다.
  Meta는 `status_code` 가 `FINISHED` 가 될 때까지 폴링해야 한다. → 폴링 추가(기본 10초 간격/5분 한도).
- **API 계열 불일치** — 인증은 구 Basic Display(`api.instagram.com/oauth/authorize`, 2024-12 종료),
  게시는 Graph API 로 섞여 있었다. → **Instagram API with Instagram Login** 으로 통일
  (`www.instagram.com/oauth/authorize` + `graph.instagram.com`, scope `instagram_business_*`).
- **장기 토큰 교환 누락** — 단기(1시간) 토큰을 그대로 저장하고 있었다. → 60일 장기 토큰 교환 추가.
- **account_type 하드코딩** — `'BUSINESS'` 고정이라 PERSONAL 차단이 mock에서만 동작했다. → `/me` 실조회.
- **인스타 토큰 갱신 없음** — `ensureFreshToken` 이 tiktok 만 처리해 60일 뒤 조용히 죽었다.
  → 플랫폼별 갱신 창(틱톡 5분 / 인스타 7일) + 이미 만료 시 재연동 안내 에러.
- **공개 URL 가드** — 인스타·틱톡은 URL을 직접 내려받는데 로컬 MinIO 주소가 그대로 넘어갔다.
  → 사설/로컬 호스트·비 https 를 외부 호출 전에 400으로 차단.

### Phase 8 — 결제

- **STRIPE_MOCK 분리** — Stripe mock 여부가 `SNS_MOCK` 에 묶여 있어 "SNS는 mock, Stripe만 실키" 조합이 불가능했다.
- **웹훅 전역 rate limit 제외** — Stripe 발신 IP가 소수라 이벤트가 몰리면 429 → 재시도가 쌓인다.
- **웹훅 순서 보정** — `subscriptions.last_stripe_event_at` 추가(마이그레이션).
  지연 도착한 과거 이벤트가 최신 상태를 덮어쓰지 않는다. 중복 전달은 재적용해도 결과가 같다(멱등).
- **current_period_end 위치 대응** — 2025+ API 버전에서 subscription item 하위로 이동. 양쪽 모두 읽는다.
- **실제 Stripe 서명 형식 검증** — mock 은 단순 `HMAC(body)` 였지만 실제는 `t=<unix>,v1=<HMAC("t.body")>` +
  타임스탬프 허용 오차(5분)다. 두 형식이 호환되지 않음을 테스트로 고정(`test/billing-realkey.test.ts`).
  네트워크가 필요 없어 Stripe CLI 의 whsec 을 꽂기 전에 미리 검증 완료.
- **Checkout 이메일 전달** — Stripe 고객이 이메일 없이 생성되고 있었다. 검증된 JWT에서 email 클레임을 읽어 전달.
  (`AuthUser` 에 email 추가는 인증 모듈 공동 소유라 Dev A 합의 후 정리 — 현재는 billing 라우트에 국소화)

### 테스트 격리 (실키를 넣자마자 드러난 문제)

`.env` 에 실제 `STRIPE_SECRET_KEY` 를 넣는 순간 결제 테스트 16개가 깨졌다. 원인이 두 겹이었다:

1. Vitest 가 `apps/api/.env` 를 `process.env` 에 주입한다.
2. `@prisma/client` 를 import 하면 Prisma 가 dotenv 로 `.env` 를 **다시** 읽는다.
   dotenv 는 기존 값을 덮지 않지만 *지워진* 값은 채우므로, setupFiles 에서 한 번 지우는 것으로는 부족했다.

→ `test/setup/hermetic.ts` 로 외부 크리덴셜 목록을 관리하고, setupFiles 와
`createHarness()` 의 `loadConfig()` 직전 **두 지점**에서 정리한다.
기본 상태는 항상 "외부 연동 전부 mock/dry-run" 이고, 실키 경로 테스트만 `createHarness({...})` 로 켠다.

교훈: 테스트가 개발자 개인 `.env` 에 좌우되면 CI 와 로컬이 갈린다. 실키를 받기 전에 이걸 먼저 고정해야 한다.

### Phase 9

- rate limit 검증 추가: 전역(IP), `/edit-jobs`(토큰당 5/분), `/notifications/geofence-enter`(토큰당 10/분),
  웹훅 예외, 공통 `RATE_LIMITED` 포맷. `RATE_LIMIT_GLOBAL_MAX` 로 조정 가능.

### 연동 추가 하드닝 (2026-08-04, 크리덴셜 없이 가능한 범위)

**틱톡 게시 결과 확인** (기존 "남은 것" 항목 해소)
- init 성공만으로 `success` 를 기록하던 것을 `post/publish/status/fetch` 폴링으로 교체.
  `PUBLISH_COMPLETE`/`SEND_TO_USER_INBOX` → `success`, `FAILED` → 사유 포함 실패,
  **시간 초과(기본 2분) → `pending`** (실패로 단정하지 않음, `uploaded_at` 은 null).
- `UploadResult.status` 추가 → `sns_uploads.status` 가 실제 상태와 일치한다. FE 는 `pending` 을 "업로드 중" 으로 표시.

**FCM 초기화 결함 수정**
- `admin.initializeApp()` 을 이름 없이 호출해서, 한 프로세스에서 앱을 두 번 구성하면
  `app/duplicate-app` 이 던져지고 **buildApp 이 실패해 서버가 아예 뜨지 않았다**.
  → 이름 붙인 앱(`snaply`) + 기존 앱 재사용으로 멱등하게 변경.
- FCM 계층 테스트 11개 추가(firebase-admin 대체): dry-run 전환, 정상 발송 payload,
  **무효 토큰 자동 정리**, 일시 오류 시 토큰 보존, `errorInfo` 없는 에러 형태,
  깨진 서비스 계정 → dry-run 폴백, geofence 연동(무효 토큰 정리 후 다음 진입이 no_token).

### FCM 실크리덴셜 검증 (2026-08-04, 실기기 없이 통과)

Firebase 서비스 계정(`snaply-66f8c`)을 `.env` 에 넣고 **실제 FCM API** 로 검증했다.
실기기 토큰이 없어도, 미등록 토큰을 보내면 FCM 이 실제로 응답하므로 크리덴셜 유효성과 정리 경로를 모두 확인할 수 있다.

| 검증 | 결과 |
|---|---|
| 서비스 계정 로드 → 발송 모드 전환 | `dryRun=false` |
| 형식이 틀린 토큰 | `messaging/invalid-argument` → `send_error` (토큰 보존) |
| 형식만 맞춘 미등록 토큰 | `messaging/registration-token-not-registered` → `token_invalid` |
| 무효 토큰 자동 정리 | `users.fcm_token` → `null` |
| HTTP 경로(`POST /notifications/geofence-enter`) | 1차 `send_failed` → 2차 `no_token`, `notification_logs=0` |
| 실크리덴셜로 서버 기동 | 정상 (`app/duplicate-app` 예외 없음 — 위 수정 덕분) |

발송 실패가 쿨다운을 소모하지 않는 것(Phase 6 의 보상 삭제)도 실크리덴셜 경로에서 확인됐다.
**남은 것은 실기기 수신 확인뿐이며 FE 앱이 필요하다.**

### 사고 기록 — 테스트가 개발 DB를 TRUNCATE 했다

`vitest` 를 `apps/api` 밖에서 실행하면 `vitest.config.ts` 가 로드되지 않아 `setupFiles` 가 건너뛰어지고,
`DATABASE_URL` 이 **개발 DB(`snaply`)** 를 가리킨 채 `resetDb()` 의 `TRUNCATE` 가 돌았다.
그 결과 시드 위치 50개가 날아갔다(`npm run db:seed` 로 복구).

→ `assertTestDatabase()` 추가: `SELECT current_database()` 가 `snaply_test` 가 아니면
TRUNCATE 전에 예외를 던진다. 회귀 테스트는 `test/harness-safety.test.ts`.
**테스트는 반드시 `apps/api` 에서 실행할 것** (`npm test -w apps/api` 또는 `npm test` in apps/api).

### SNS 실키 투입 — 크리덴셜 검증 + 결함 2건 (2026-08-04)

인스타/틱톡 앱 등록 후 실키를 넣고, **브라우저 로그인 없이 검증 가능한 범위**를 전부 확인했다.

| 검증 | 방법 | 결과 |
|---|---|---|
| mock → 실호출 전환 | `/sns/*/connect` 응답 | `mock://` 대신 실제 authorize URL |
| 인스타 client_id + redirect_uri | authorize URL 직접 요청 | 200 + 실제 OAuth 로그인 페이지. `Invalid platform app`/`URL Blocked` 등 Meta 에러 문구 0건 |
| 틱톡 client_key + redirect_uri | authorize URL 직접 요청 | 302 → `tiktok.com/login?...enter_from=dev_<client_key>` (앱 인식됨) |
| 인스타 **app secret** | 잘못된 code 로 토큰 교환 | `Invalid authorization code` — 시크릿 오류가 아니므로 인증 통과 |
| 틱톡 **client secret** | 잘못된 code 로 토큰 교환 | `invalid_grant` — 동일하게 인증 통과 |

이 과정에서 실제 결함 2건이 드러났다. 둘 다 **실 OAuth 첫 시도에서 바로 터질 것**이었다.

**(1) 틱톡은 실패를 `HTTP 200` + 에러 본문으로 준다** — `res.ok` 만 확인하고 있어서 실패 응답을
성공으로 취급했고, `undefined` 토큰을 암호화하려다 `ERR_INVALID_ARG_TYPE` → **500** 이 났다.
(code 가 만료되기만 해도 발생. 실측으로 확인)
→ `assertTikTokOk()` 추가. OAuth 형태(`{error, error_description}`)와
Content Posting 형태(`{error:{code,message}}`) 둘 다 검사하고, `access_token` 부재도 명시적으로 잡는다.
토큰 교환·갱신·업로드 init·상태 조회 4곳 모두 적용.

**(2) 콜백 실패 시 사용자가 JSON 에러 페이지에 갇혔다** — `handleCallback` 이 던지는 예외가
전역 핸들러로 가서 JSON 400/500 이 브라우저에 그대로 표시됐다. OAuth 도중이라 앱으로 돌아갈 방법이 없다.
→ 라우트에서 catch 후 `snaply://sns/error?platform=<p>&reason=exchange_failed` 로 302. 에러는 로그로 남긴다.

회귀 테스트 7개 추가(`test/sns-realkey.test.ts`). **남은 것은 브라우저 로그인 1회뿐이다.**

### 틱톡 — API 는 성공, **실물 미확인** (2026-08-10, 진행 중)

⚠️ **주의**: 아래는 "틱톡 API 가 업로드를 수락하고 성공을 반환했다"는 것까지다.
**사용자 계정에 실제로 도착했는지는 확인되지 않았다** — 받은함 알림이 오지 않았다.
API 응답만으로 "검증 완료"라고 판단하면 안 되는 사례다.

```
POST /sns/tiktok/upload → 200 (16.8초)
  { status:"success", platformPostId:"v_inbox_url~v2.7672...", requiresUserAction:true }
틱톡 상태 조회 → SEND_TO_USER_INBOX (error.code=ok)
```

막혔던 관문은 **전부 콘솔 설정**이었고 코드 문제는 없었다:
Login Kit 제품 미추가 → Sandbox 별도 client_key(`sb` 접두, 문서 미명시) →
Target users 미등록 → 영상 URL 호스트의 prefix 소유권 미검증.

이 과정에서 코드 쪽으로 확인된 것:
- 틱톡이 403 으로 준 URL 검증 에러 메시지가 **문서 링크까지 그대로** 로그·응답에 실렸다.
  인스타에서 "Meta 응답 본문을 버리던" 문제를 고쳐둔 것이 여기서 바로 효과를 봤다.
- 스코프 기반 엔드포인트 자동 분기(`video.upload` → `/inbox/video/init/`)와
  `requiresUserAction` 이 실제 응답에서 의도대로 동작했다.

**미해결 — 받은함 알림 미도착**

틱톡 상태 API 는 `SEND_TO_USER_INBOX` / `error.code=ok` 를 계속 반환하는데 앱에는 아무것도 오지 않았다.
문서상 Sandbox 에서도 받은함 도착이 정상 동작(privacy=SELF_ONLY)이므로 제약이 아니라 설정 문제로 보인다.

**중요한 단서**: `user.info.basic` 스코프가 실제로는 부여되지 않았다.
```
GET /v2/user/info/                    → scope_not_authorized
POST /v2/post/publish/creator_info/query/ → scope_not_authorized
```
`video.upload` 는 동작했는데(업로드 수락됨) `user.info.basic` 은 거부된다. 즉 **동의가 부분적으로만
이루어진 상태**다. 이 때문에 어느 계정에 전달됐는지 우리 쪽에서 확인할 수단이 없다 —
진단의 가장 큰 사각지대.

다음 확인 순서:
1. Sandbox → Scopes 에 `user.info.basic` 이 실제로 켜져 있는지
2. 재인증 시 동의 화면에 **두 권한이 모두** 표시되는지
3. 부여되면 `/v2/user/info/` 로 **어느 계정에 연동됐는지 확정** 후 그 계정의 받은함 확인
4. TikTok 앱 받은 편지함은 초안(Drafts)이 아니라 **알림** 탭이다

**Phase 7 상태: 인스타(직접 게시) 실검증 완료 / 틱톡은 API 수락까지만 확인.**

### 인스타그램 실업로드 성공 — Phase 7 end-to-end 완료 (2026-08-04)

실제 앱·실제 프로페셔널 계정(`gagejigi`)으로 릴스 게시까지 통과했다.

**게시된 릴스**: https://www.instagram.com/reel/DbnYK8qiXxg/ (`media_product_type: REELS`)

```
POST /sns/instagram/upload → 200 (38.9초)
  { status: "success", platformPostId: "18103750871175163" }
sns_uploads: status=success, uploaded_at 기록
Graph 조회: media_product_type=REELS, caption 한글+이모지 정상
```

검증된 전 구간: OAuth(state HMAC) → 토큰 교환 → 토큰 암호화 저장 → 공개 URL 가드 →
컨테이너 생성 → Meta 가 우리 터널에서 영상 다운로드 → status 폴링 → 게시 → 이력 기록.

**막혔던 원인 2가지 (둘 다 mock 으로는 절대 안 드러남)**

1. **계정 유형** — 개인 계정이었다. 개인 계정도 OAuth 는 통과해 토큰을 받지만
   `graph.instagram.com` 의 **모든** 엔드포인트가 `IGApiException 100` 으로 거부한다(`/me` 포함).
   프로페셔널(BUSINESS/CREATOR) 전환 후 같은 토큰으로 전부 동작했다.
   → 진단이 어려운 이유: 가짜 토큰으로는 인증(190)이 먼저 걸려 이 구분이 안 된다.
   `npm run ig:probe -w apps/api` 가 이 판별을 자동화한다.

2. **`user_id` 정밀도 손실** — Instagram user_id 는 2^53 을 넘고 JSON **숫자**로 온다.
   `JSON.parse` 가 `27899354646370752` → `27899354646370750` 로 값을 바꿨고,
   그 ID 로 게시하면 `Object with ID ... does not exist` (실측 확인).
   → 토큰 응답을 텍스트로 받아 정규식으로 문자열 추출 + 게시 경로를 **`/me/media`** 로 변경.
   저장된 ID 가 망가진 상태에서도 게시가 성공한 것으로 수정 효과가 입증됐다.

**폴링 필수 입증**: 컨테이너 처리에 ~50초가 걸렸다. 생성 직후 `media_publish` 를 호출하던
원래 코드는 사실상 항상 실패했을 것이다.

### SNS 실업로드 준비 (2026-08-04)

앱 등록 전에 필요한 인프라를 먼저 확보했다. 상세 절차는 [sns-setup.md](./sns-setup.md).

- **공개 콜백 URL** — `cloudflared tunnel --url http://localhost:3000` (다른 프로젝트의 ngrok 컨테이너는 건드리지 않음).
  터널 경유로 `/health` 200, `/sns/instagram/callback` 302(에러 딥링크) 확인.
- **공개 영상 URL** — MinIO(:9100) 터널 + 버킷 익명 읽기 정책.
  개발 버킷은 기본이 비공개라 익명 GET 이 **403** 이었고, 그대로면 플랫폼이 영상을 못 내려받는다.
  → `scripts/dev-public-bucket.ts` 추가(`npm run dev:public-bucket -w apps/api`).
  `s3:GetObject` 만 열고 목록·쓰기는 닫는다. **S3_ENDPOINT 가 없으면 실행을 거부**해
  실제 AWS 버킷을 공개로 바꾸는 사고를 막는다(가드 동작 확인).
  터널 경유 익명 GET 200 확인.
- `.env` 에 리디렉션 URI 2개 + `CLOUDFRONT_DOMAIN`(= 공개 미디어 베이스) 설정.

주의: trycloudflare 주소는 터널 재시작 시 바뀐다. 장기 작업이면 고정 도메인이 필요하다.

### Stripe 실키 웹훅 end-to-end 검증 (2026-08-04, 실제로 통과함)

`sk_test_` 키 + Stripe CLI(`stripe listen`)로 **실제 Stripe 이벤트**를 로컬로 흘려 검증했다.
계정 API 버전은 **2026-07-29.dahlia**.

| 검증 | 결과 |
|---|---|
| `stripe trigger customer.subscription.created` (fixture 11개 이벤트) | 전부 `200` — 실제 서명이 실제 whsec 로 검증됨 |
| 실제 `customer.subscription.updated` → DB 반영 | `plan: free → standard`, `stripeSubscriptionId`, `currentPeriodEnd=2026-09-04` 기록 |
| 오래된 실제 이벤트(2분 전) 재전송 | `200` 이지만 **무시** — `last_stripe_event_at` 유지. 순서 보정 가드 실동작 확인 |
| 처리 대상 아닌 이벤트(charge/invoice/payment_intent 등) | 전부 `200` no-op |

확인된 사실 정정: `current_period_end` 는 이 API 버전에서 subscription **최상위와 item 하위 양쪽에** 들어온다.
즉 `readPeriodEnd()` 의 item 폴백은 (이 버전 기준) 필수가 아니라 방어 코드다. 동작 차이는 없다.

재현 방법:
```bash
stripe listen --api-key $STRIPE_SECRET_KEY --forward-to localhost:3000/billing/webhook
# 출력된 whsec_... 을 .env STRIPE_WEBHOOK_SECRET 에 넣고 API 서버 재시작
stripe trigger customer.subscription.created --api-key $STRIPE_SECRET_KEY
```
※ `stripe listen` 은 localhost:3000 으로 연결을 유지하므로 `lsof -ti:3000 | xargs kill` 하면 같이 죽는다.
서버만 죽이려면 `lsof -nP -iTCP:3000 -sTCP:LISTEN -t` 를 쓸 것.

### Sentry 실수집 검증 (2026-08-04)

| 검증 | 결과 |
|---|---|
| DSN 유효성 — ingest 엔드포인트에 envelope 직접 POST | `200` + `{"id":"8632...48f1"}` |
| `lib/sentry.ts` 경로 — `initSentry` → `captureException` → `flush` | `flush: true`, 전송 오류 없음 |
| 실제 500 캡처 — Postgres 중지 후 `GET /auth/me` | `500` (공통 포맷, 내부 정보 미노출) + 전역 핸들러의 5xx 분기 실행 확인 |
| 4xx 는 안 보냄 | 401/400/404 는 캡처 대상 아님 (설계대로) |

주의: Sentry SDK 는 자기 전송 요청을 http 계측에서 제외하므로, `ingest.us.sentry.io` 로 나간 요청이
디버그 로그에 안 보이는 것이 정상이다. 캡처 실행 여부는 같은 분기의 `request.log.error` (level:50) 로 확인한다.

**추가로 고친 것 — 종료 시 flush 누락**: Sentry 전송은 비동기 버퍼링인데 `index.ts` 의 shutdown 이
`process.exit(0)` 를 바로 호출해서, 5xx 발생 직후 재시작·배포되면 그 이벤트가 유실됐다.
`flushSentry()` 를 추가해 종료 전에 전송을 기다린다. (`SENTRY_DEBUG=true` 로 SDK 전송 로그 확인 가능)

### 후속 항목의 현행 위치

이 시점에 닫히지 않았던 항목(Stripe 상품·가격 생성, 틱톡 받은함, FCM 실기기, 멀티 디바이스 푸시,
`notification_logs` 보관 정책)은 [backlog.md](./backlog.md) C·B 절로 옮겼다.
이후 완료된 것 — Sentry 실수집(2026-08-04), 인스타 실업로드(2026-08-04),
틱톡 게시 결과 폴링(2026-08-04) — 은 아래 각 절에 기록돼 있다.

## 실검증 라운드 1 — 미디어/편집 트랙 (Dev A, 2026-08-04) ✅

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

## 실검증 라운드 2 — AI 워커 컨테이너 (Dev A, 2026-08-05) ✅

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

## 환경변수 관리 정리 (2026-08-11)

**배경**: `.env` 가 세 곳(루트 · `apps/api` · `apps/ai-worker`)으로 갈라져 있었다. 루트 사본은
어느 문서에도 없었지만 `docker compose` 의 `${VAR}` 보간을 떠받치고 있었고, `apps/api/.env` 와
바이트 단위로 동일했다. 결정과 기각한 대안은 [decisions/env-management.md](./decisions/env-management.md).

**구현**
- `.env` 를 `apps/api/.env` 하나로 통일. compose 는 그 파일을 `env_file` 로 읽고 인프라 주소만
  `environment` 로 덮는다(compose 규격상 `environment` 가 우선).
- 컨테이너 테스트 서버를 1급 시나리오로 지원 — `npm run stack:up` / `stack:migrate` / `stack:down`.
  외부 연동은 기본 mock(`SNS_MOCK`/`STRIPE_MOCK`), `CLOUDFRONT_DOMAIN=""` 로 미디어 URL 을
  스택 MinIO 로 고정.
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
- 컨테이너 안 `SNS_MOCK=true` / `STRIPE_MOCK=true` / `CLOUDFRONT_DOMAIN=""` 확인 ✅
- 주석 유입 회귀 확인 — `LEGAL_CONTACT_EMAIL`·`SITE_VERIFICATION_META`·`STRIPE_PRICE_*` 가 모두
  빈 값이고, `/legal/terms` 의 `<head>` 에 검증 메타 태그가 들어가지 않는다 ✅

**후속 작업의 현행 위치**: 배포 플랫폼 시크릿과 Deploy 스텝 연결은
[backlog.md](./backlog.md) B-1에서 관리한다. 이번 환경변수 정리 라운드에서는 JWKS 도달까지만
재확인했지만, 실제 Supabase JWT를 사용한 컨테이너 인증은 위 "실검증 라운드 2"에서 이미 완료했다.

---

## 풀스택 Compose 공개 스토리지 주소 보간 수정 (2026-08-12)

- `stack:up`이 Compose 보간용 env 파일을 지정하지 않아, `apps/api/.env`에
  `S3_PUBLIC_ENDPOINT=http://<PC의 LAN IP>:9200`을 설정해도 `docker-compose.yml`의 기본값
  `http://localhost:9200`이 API 컨테이너에 들어가던 문제를 수정했다.
- `stack:up`·`stack:migrate`·`stack:down`이 모두 `--env-file apps/api/.env`를 사용하도록 통일했다.
- AI 워커를 수동 기동하는 ONBOARDING 명령도 동일한 env 파일을 사용하도록 갱신했다.

---

## 원커맨드 로컬 스택 migration 자동화 (2026-08-12)

- `npm run stack`이 최초 로컬 설치와 pull 후 업데이트를 모두 처리하도록 Compose에 일회성
  `migrate` 서비스를 추가했다.
- `migrate`는 Postgres healthcheck 통과 후 `prisma migrate deploy`를 실행한다. API와 AI 워커는
  migration 성공을 기다리며, 실패 시 시작하지 않는다.
- 이미 적용된 migration은 Prisma가 건너뛰므로 같은 명령을 반복 실행할 수 있다.

---

## 계정 삭제 기능 (2026-08-12)

**정책**: soft delete + 30일 유예 + 배치 실삭제 — [decisions/account-deletion.md](./decisions/account-deletion.md).
약관이 이미 계정 삭제를 약속하고 있었으나(`routes/legal.ts`) 구현이 없던 갭을 닫았다.

**구현 내용**
- `users.deleted_at` 신설(마이그레이션 `20260812000000_add_user_deleted_at`) + 조회 인덱스
- `DELETE /auth/me` — Stripe 즉시 해지(실패 시 삭제 중단), SNS 연동·FCM 토큰 삭제,
  진행 중 편집 작업 실패 처리 + 큐 제거(최선 노력), soft delete. `purgeAfter` 반환
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

## 고아 pending 영상 정리 배치 (2026-08-12)

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

## 삭제 대기 403 에 유예 만료 시각 동봉 (2026-08-12)

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

## 편집 작업 취소 API + 실패 분류 코드 (2026-08-13)

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

## 크레딧 결제 구현 + Stripe·구독 제거 (2026-08-14)

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

## 보상형 광고 크레딧 (2026-08-14)

앱 팀의 계약 요청을 [decisions/ad-reward-credits.md](./decisions/ad-reward-credits.md)로 확정하고
구현했다. 초안([meetings/2026-08-12-rewarded-credit-review.md](./meetings/2026-08-12-rewarded-credit-review.md) §4)의
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

## 광고 보상 세션 수명·포기 (2026-08-18)

앱 팀의 실기기 검증 리포트(2026-08-14, AdMob 미연동이라 모든 세션이 SSV 없이 `pending`)로
드러난 **대기 시간 역전**을 고쳤다. 지급받은 사용자는 쿨다운 300초만 기다리는데, 콜백이
유실된 사용자는 진행 중 슬롯이 TTL(900초)로 풀릴 때까지 잠겼다. 결정과 기각한 대안은
[decisions/ad-reward-credits.md](./decisions/ad-reward-credits.md) §4-1.

**정책** (`services/billing/credit-policy.ts`)
- 세션 TTL 기본값 **900초 → 300초**(= 쿨다운). TTL 은 쿨다운을 넘기지 않는다는 관계를
  타입 주석과 `.env.example`·env-spec 설명에 함께 남겼다
- 앱이 제안한 120초는 채택하지 않았다 — 광고 로드·엔드카드가 길어지면 **정상 시청분의 SSV 가
  만료로 거절**된다. `pending` 은 나중에 지급될 수 있지만 `expired` 는 확정적으로 죽인다

**세션 포기** (`DELETE /billing/ad-rewards/{rewardId}`)
- 앱이 중도 이탈·노필·로드 실패를 확정적으로 알았을 때 슬롯을 즉시 비운다. 결과가 확정된
  경우의 대기가 0이 된다
- 새 상태 `abandoned` 추가. `pending` 과 함께 "아직 지급될 수 있는 상태"이며 **만료 전에 도착한
  SSV 는 그대로 지급**한다(포기는 슬롯만 비우고 지급 자격은 남긴다). 컬럼은
  `status VARCHAR(16)` 그대로라 **마이그레이션 없음**
- 멱등 — 이미 확정된 세션이나 두 번째 포기에도 200 + 현재 상태. 남의 세션은 404
- 지급을 만들 수 있는 경로가 아니라서 "앱은 지급을 요청할 수 없다"(§3)는 설계는 그대로다
- 받아들인 트레이드오프: 포기한 세션과 새 세션이 함께 지급되면 쿨다운보다 짧은 간격의 연속
  지급이 가능하다. 상한은 지급 시점 한도 재확인이 잡고, 그 경우 사용자는 광고를 두 편 다 봤다

**앱 팀 질문에 대한 확인**
- 한도·쿨다운을 **지급 시각** 기준으로 잡은 것은 의도다(받지 못한 보상을 소진으로 치지 않는다)
- 세션 남발은 경제적 공격면이 아니다 — 지급에는 Google 서명이 필요하고 한도는 지급 시점에
  다시 센다. 늘어나는 것은 `ad_rewards` 행뿐이며 정리 배치는 backlog D-5 로 남겼다

**검증**
- `npm test -w apps/api` — 16 파일 **194 테스트 통과** + tsc + storage 테스트. 포기 관련 8개 신규
- 커버: 포기 후 즉시 새 세션 발급 · 포기한 세션에 SSV 도착 시 지급 · 포기 세션을 한도 이상
  쌓아도 지급은 `dailyLimit` 까지 · 만료된 포기 세션은 거절 · 지급된 세션 포기 멱등 ·
  2회 포기 · 남의 세션 404(상태 불변) · 포기가 쿨다운을 우회하지 않음

---

## 광고 보상 정책 값 확정 — 20크레딧 · 일일 5회 (2026-08-18)

`credit-policy.ts` 의 잠정값이던 보상량·한도를 확정했다. 결정과 트레이드오프는
[decisions/ad-reward-credits.md](./decisions/ad-reward-credits.md) §7.

**확정값**
- 1회 보상 **20크레딧**, 일일 한도 **3 → 5회**. `20 × 5 = 100 = MOVIE_EXPORT_COST` 라
  **한도를 다 쓰면 정확히 export 1편**이다 — 의도된 값이며 둘을 따로 바꾸지 않는다
- 세션 TTL·만료 없음·KST 자정 기준은 이미 확정돼 있었다. 남았던 쿨다운도 같은 날 확정됐다
  (아래 항목)

**받아들인 것**
- 회의안 §2가 피하려던 `광고 5편 = 무비 1편` 프레이밍을 사용자가 스스로 발견할 수 있다.
  UI 원칙(진척도·완주 과제로 표시하지 않음)은 유지하고 api-spec 의 표시 규칙에 명시했다
- **원가·eCPM 실측 없이 정한 값이다.** 손익분기는 보상량만이 정하고(한도와 무관) 한도는 손실
  규모·무료 상한(사용자당 월 최대 30편)을 정한다. 파일럿에서 순매출이 20원을 밑돌면
  **보상량을 먼저 내린다** — 한도 인하는 되돌릴 수 없는 혜택 축소다

**반영 위치**: `credit-policy.ts` 기본값·주석, `env-spec.ts`·`.env.example` 설명,
[api-spec.md](./api-spec.md) `GET /billing/ad-rewards` 예시와 표시 규칙, backlog A-2·C-6.

**검증**
- `npm test -w apps/api` — 16 파일 **196 테스트 통과** + tsc + storage 테스트
- 기본값 테스트 2개 추가(`ad-reward.test.ts`) — 다른 테스트는 env 로 한도를 3으로 덮어쓰므로
  기본값 자체가 검증되지 않았다. `credits × dailyLimit === MOVIE_EXPORT_COST` 와
  `sessionTtlSeconds <= cooldownSeconds` 를 못 박아 한쪽만 바뀌는 것을 막는다

---

## 광고 보상 쿨다운 300초 확정 (2026-08-18)

A-2의 마지막 미결 값이었다. 근거는
[decisions/ad-reward-credits.md](./decisions/ad-reward-credits.md) §7 —
**값을 고른 것이 아니라 위아래가 모두 막혀 있음을 확인한 것**이다.

- **아래로 못 내린다**: 세션 TTL ≤ 쿨다운(§4-1)이고 TTL 은 300초보다 짧을 수 없으므로,
  300초 밑으로 내리면 3일 전에 고친 대기 시간 역전이 되살아난다. 포기 엔드포인트로도 못
  막는다 — SSV 유실은 앱이 "광고를 다 봤다"고 아는 상태라 포기를 호출하지 않는다
- **위로 올릴 이유가 없다**: 쿨다운은 마지막 **지급 시각** 기준이라
  (`ad-reward.service.ts` 세션 발급) 값이 그대로 "부족분을 채우는 도중의 대기"다.
  60크레딧에서 export 까지 300초면 5분, 600초면 10분. 비용 상한은 이미 일일 한도 5가 잡는다
- 쿨다운 0(한도만으로 제어)은 가장 큰 역전이 되어 기각했다

**반영**: `credit-policy.ts` 주석(하한·상한의 이유), `env-spec.ts`·`.env.example`,
[api-spec.md](./api-spec.md), backlog A-2 — **A-2에서 광고 보상 항목이 닫혔다.**
`AD_REWARD_ENABLED=true` 를 막는 것은 이제 C-6(AdMob 콘솔 설정) 하나뿐이다.

**검증**: `npm test -w apps/api` — 16 파일 196 테스트 통과 + tsc + storage 테스트.
기본값 300 은 이전 항목에서 추가한 `sessionTtlSeconds <= cooldownSeconds` 테스트가 계속 지킨다.

---

## 스냅 내용 분석 — 방향 확정 + 스파이크 하네스 (2026-08-19)

기능 방향과 착수 범위를 정하고, 기준선을 낼 하네스까지 구현했다. 결정과 기각한 대안은
[decisions/snap-content-analysis.md](./decisions/snap-content-analysis.md).

**확정된 방향**
- 분석 결과는 **내부 추천 입력 전용** — 사용자에게 요약·태그를 노출하지 않는다
- 분석은 **추천 요청 시점의 후보 스냅만**. 계획 문서의 "업로드 즉시 전량"을 채택하지 않았다 —
  버려질 스냅까지 과금되고, 스냅당 단가 실측이 없는 상태에서 비용을 업로드량에 비례시킬 근거가 없다
- 엔진은 외부 vision API(프레임 4장 단일 요청, 오디오 미전송), 추천 실행은 **비동기 job**
- 이번 사이클은 **스파이크만** — 스키마·API·큐는 만들지 않았다

**구현 (`apps/ai-worker/scripts/analysis-spike/`)**
- `frame_sampler.py` — FFprobe 실측 길이 기준 상대 위치(10/36.7/63.3/90%), **한 번의 ffmpeg
  호출**로 4장 추출, 8x8 평균 해시로 유사 프레임 제거. 계획 문서 §7 그대로
- `vision_client.py` — 프레임 전체를 한 요청에 시간순으로, `detail=low`, Structured Outputs
  strict. 오류를 재시도 가능/불가로 분류(`RATE_LIMITED`·`TIMEOUT`·`AUTH_FAILED`·`SAFETY_REFUSED` …)
- `result_schema.py` — JSON Schema 강제와 별개로 애플리케이션에서 범위·목록 길이·빈 문자열을
  다시 검증한다. `visualIssues` 는 코드 enum 으로 고정 — 자유 텍스트를 받으면 집계가 불가능하다
- `report.py` — 모델별 성공률·지연 p50/p95·평균 토큰·스냅당 단가·`usableForEdit` 비율,
  사람이 채점할 `labels.csv` 생성과 채점 집계
- **단가가 비어 있으면 비용을 추측하지 않고 `null`** 로 남긴다. 스냅당 단가가 이 스파이크의
  산출물이라 임의 값을 채우면 결론이 오염된다
- `OPENAI_API_KEY` 는 셸 환경에서만 읽는다 — `env-spec.ts`·`.env.example` 선언은 본구현 착수와
  같은 변경에서 한다(아무도 읽지 않는 변수를 원천 문서에 먼저 남기지 않는다)

**검증**
- `cd apps/ai-worker && python3 -m unittest tests.test_config tests.test_edit_spec
  tests.test_render_spec tests.test_editor tests.test_analysis_spike` — **64개 통과**
  (신규 45개). 프레임 시점 계산·유사 프레임 제거·요청 구성·오류 분류·단가 계산·결과 검증·
  집계·채점을 ffmpeg·SDK 없이 검증한다
- 오케스트레이션(`run_spike.py`)은 ffmpeg·모델 호출을 스텁으로 바꿔 스모크 확인 — 성공/
  `RATE_LIMITED`/`SCHEMA_INVALID` 3경로가 각각 행으로 남고, 단가 없는 모델의 비용이 `null` 로
  집계되며, 요청 하나에 텍스트 1 + 이미지 4가 담기는 것을 확인했다
- **실제 모델 호출과 ffmpeg 경로는 아직 돌리지 않았다** — 이 개발 머신에 ffmpeg 가 없고
  평가셋(팀원 폰 촬영 30~100편)과 API 키가 아직 없다. 남은 일은 backlog A-3

**아직 없는 것**: 품질·단가 기준선 숫자. 그것이 나와야 운영 모델 고정과 비용 한도를 정하고
본구현을 승인할 수 있다.

> **같은 날 후속**: 스파이크를 실행하지 않고 본구현으로 진행했다. 이 하네스의 모듈은
> `apps/ai-worker/src/pipeline/video_analysis/` 로 옮겨졌고 스파이크 디렉터리는 제거됐다 —
> 아래 "스냅 내용 분석 본구현" 항목.

---

## 스냅 내용 분석 본구현 — 스키마·API·분석 워커·docker (2026-08-19)

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

## 무비 템플릿 카탈로그 서버 이관 (2026-08-19)

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

## 템플릿 스냅 추천 API — 규칙 기반 점수화 (2026-08-19)

`POST /movie-recommendations` 로 후보 스냅과 템플릿을 주면, 후보의 분석 결과를 모아 슬롯에
배정한 결과를 `GET /movie-recommendations/:id` 로 돌려준다. backlog A-6 의 2단계이며,
방향과 기각안은
[decisions/template-snap-recommendation.md](./decisions/template-snap-recommendation.md).

**새 큐를 만들지 않았다** — 계획( `snap-content-analysis.md` §4)과 다른 지점
- 비싼 일(분석)은 이미 `video-analysis` 큐가 진다. 추천은 그 결과를 모으는 오케스트레이션이라
  두 번째 큐의 워커는 첫 번째 큐를 기다리는 것 말고 할 일이 없다
- **접수 시점에 후보 분석을 적재하고, 채점은 조회(폴링) 시점에** 한다. 아무도 폴링하지 않으면
  채점도 돌지 않는다 — 낭비가 아니라 절약이다
- 동시 폴링은 `status='processing'` 조건부 갱신으로 하나만 이긴다. 채점이 순수 함수라 진 쪽이
  버린 계산의 결과도 같다
- **마감 시한**(3분)을 둔다. 분석 워커가 죽어도 추천이 영원히 `processing` 에 머물지 않는다

**DB** — `movie_recommendations` · `movie_recommendation_items` (`20260819020000_add_movie_recommendations`)
- `candidate_video_ids` 는 **배열**이다. 앱이 보낸 촬영 시간 순서가 점수화의 시간 사전값이라
  집합으로 뭉갤 수 없다
- `candidate_hash` 는 **정렬한** 후보 집합의 해시다. 순서만 다른 재요청이 재분석을 돌리면 안 된다
- 영상이 삭제되면 `video_id` 만 `SET NULL` — 그 자리는 비고 추천은 남는다
- 템플릿 FK 는 `RESTRICT`. 템플릿은 지우지 않고 `retired_at` 으로 내린다

**점수화** — `services/recommendation/score-slots.ts`, DB 없이 도는 순수 함수
- `0.5×keyword + 0.2×visualQuality + 0.2×temporal + 0.1×confidence`, greedy 배정(1스냅 1슬롯)
- `temporal` 이 현행 시간순 배치를 계승하므로 **키워드가 하나도 맞지 않아도 지금보다
  나빠지지 않는다**. 이게 규칙 기반으로 시작할 수 있는 근거다
- `usableForEdit=false` 는 배정에서 빠지고 남는 슬롯은 **비운다**. 못 쓸 스냅으로 채우는 것보다
  빈 슬롯과 `지금 찍기` 가 정직하다
- 힌트 jsonb 는 방어적으로 읽는다 — 한 행의 오타가 추천 전체를 무너뜨리지 않는다

**정책** — `services/recommendation/recommendation-policy.ts`
- 후보 12개 · 최근 24시간 20회 · 재사용 창 24시간 · 마감 3분. **전부 서버가 집행한다**
- 달력 하루가 아니라 직전 24시간이다. 자정 리셋은 서버 시간대를 사용자 시간대로 가정하게 된다
- 크레딧 차감 없음. 채택할지 모르는 제안에 과금하지 않는다
- `MOVIE_RECOMMENDATION_ENABLED` **기본 false** — 이 경로는 생산 스냅 프레임을 외부 모델로
  보내므로 약관 개정·제3자 제공 고지 전에는 켜지 않는다. 꺼져 있으면 503 `RECOMMENDATION_DISABLED`

**전역 에러 핸들러 순서를 바꿨다** (`app.ts`)
- `AppError` 판정이 rate limit 판정보다 **앞**으로 왔다. 전에는 모든 429 가 `RATE_LIMITED` 로
  뭉개져, 앱이 "잠시 후 다시"(`RATE_LIMITED`)와 "오늘은 끝"(`RECOMMENDATION_LIMIT`)을 구분할
  수 없었다. 플러그인 제한은 `AppError` 가 아니므로 그대로 `RATE_LIMITED` 다
- 라우트별 rate limit 테스트 2건이 이 순서로도 그대로 통과한다

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

## 앵커 어휘 사전 + 워커 빌드 컨텍스트 루트 통일 (2026-08-20)

editSpec v3 착수의 첫 단위. 계획과 결정 근거는
[plans/edit-spec-v3-kickoff.md](./plans/edit-spec-v3-kickoff.md) §3.

**사전은 원본 하나** — `packages/shared-types/src/anchor-vocabulary.json`
- `anchor` 어휘(kind 6 · kind별 ref · scaleRef)를 editSpec v3 와 에셋 매니페스트가 공유한다.
  코드젠도 수동 동기화도 두지 않았다 — `errors.py` ↔ `domain.ts` 식 주석 동기화는 이 규모에서
  깨진다
- TS(`anchor.ts`)와 워커(`pipeline/anchor.py`)가 **같은 파일**을 읽는다. TS 는 타입이 컴파일
  타임에만 있어 런타임 배열을 따로 들 수밖에 없고, 그 배열과 JSON 의 대조가 정합성 장치다
- 폴백 체인은 **객체 배열**로 통일했다. `"face:aboveHead"` 문자열은 `offset` 을 담지 못해
  확장 불가다. 같은 이유로 매니페스트의 `defaultAnchor` 는 두지 않는다 — `anchorAffinity[0]`
  이 곧 기본값이라 두 값이 어긋날 여지가 없다
- 초안이 `freezone` 에만 쓰던 `prefer` 를 없애고 모든 kind 가 `ref` 를 쓰게 했다.
  한 사전을 공유하는데 필드 이름이 갈릴 이유가 없다

**빌드 컨텍스트를 루트로** — `docker-compose.yml` · `apps/ai-worker/Dockerfile`
- 워커 컨텍스트가 `./apps/ai-worker` 라 `packages/` 가 컨텍스트 밖이었다. 사전이 이미지에
  들어갈 방법이 없어 이 변경이 사전의 **전제**였다
- API 가 이미 `context: .` 를 쓰고 있어(`apps/api/Dockerfile`) 새 규약이 아니라 워커만
  예외였던 것을 맞춘 것이다. `ai-worker` · `analysis-worker` 두 서비스가 같은 이미지를 쓰므로
  양쪽 다 바뀌었다
- 부수 효과로 `.dockerignore` 의 `apps/ai-worker/assets/bgm/**/*.m4a` 가 **작동하기 시작했다.**
  루트 상대 경로로 쓰여 있어 지금까지 no-op 이었다 — 음원이 들어오면 이미지에 딸려 들어갔을 줄이다
- 사전을 `dist/` 가 아니라 `src/` 에서 가져가므로 워커 이미지가 Node 빌드에 의존하지 않는다

**로더는 없으면 죽는다** — `pipeline/anchor.py`
- 컨테이너(`/app/anchor-vocabulary.json`)와 네이티브 개발(저장소 경로)에서 사전 위치가 다르다.
  `config.py` 의 `ENV_CANDIDATES` 와 같은 후보 목록 패턴을 쓰되 **실패 동작은 반대**다 —
  `.env` 는 없어도 되지만(주입이 이긴다) 사전은 없으면 렌더 시점에 터지고 원인이 안 보인다
- **로더를 `config.py` 에 두지 않았다.** `analysis_worker.py` 도 `config` 를 임포트하므로
  거기 모듈 레벨 로드를 넣으면 사전 하나 때문에 분석 워커까지 못 뜬다. 편집 파이프라인 모듈에
  두고 `worker.py` 가 임포트한다
- 기동 로그에 `vocabulary=v1 derivation=v1` 을 남긴다. 렌더 결과를 되짚을 때 첫 단서다

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

## 스테이지별 시드 — 재현과 "다시 생성"의 분리 (2026-08-20)

editSpec v3 착수의 두 번째 단위. 계획은
[plans/edit-spec-v3-kickoff.md](./plans/edit-spec-v3-kickoff.md) §4.

**시드가 하나면 둘 중 하나가 깨진다**

```json
"seed": { "root": 1837462, "attempt": { "edit-director": 0, "style-director": 2 } }
```

- 시드를 스펙에 하나만 고정하면 만료 후 재생성은 같은 산출물을 내지만
  ([storage-and-subscription-policy.md](./decisions/storage-and-subscription-policy.md) §3의 약속)
  사용자가 "다시 생성"을 눌러도 같은 영상이 나온다. 명백한 버그로 보인다
- `root` 는 고정하고 `attempt` 만 올린다. 재현도 "다시 생성"도 성립하고, **다시 생성한 결과
  자체도 여전히 재현 가능**하다
- `attempt` 가 **스테이지별**인 이유는 부분 재생성이다. 전역 하나면 "스티커만 다시"가
  `music`·`timeline` 시드까지 바꿔 무효화 표가 약속한 유지 범위가 무너진다

**해시를 이름으로 박았다** — `sha256("{root}:{stage}:{attempt}")` 상위 8바이트 빅엔디언
- **파이썬 내장 `hash()` 를 쓰면 안 된다.** `PYTHONHASHSEED` 가 프로세스마다 달라서 같은 스펙이
  실행할 때마다 다른 영상을 만든다. 재현성이 이 스펙의 존재 이유인데 그게 프로세스 기동 시각에
  좌우되면 의미가 없다
- 알고리즘·템플릿·바이트 수·**바이트 순서**까지 사전에 둔다. 두 번째 구현이 같은 값을 내려면
  넷 다 필요하다
- `root` 상한을 `Number.MAX_SAFE_INTEGER` 로 강제한다. 2^53 을 넘으면 JavaScript 가 반올림해
  API 가 쓴 `root` 와 워커가 읽은 `root` 가 달라지고, **에러 없이 다른 영상이 나온다**

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

**다음**: 무효화 표 재작성(kickoff §5) — A-2·A-5·B-6 를 한 표가 흡수한다.

---

## 재생성 무효화 규칙 — 표가 아니라 데이터로 (2026-08-20)

editSpec v3 착수의 세 번째 단위이자 이 계획의 중심 산출물. 계획은
[plans/edit-spec-v3-kickoff.md](./plans/edit-spec-v3-kickoff.md) §5.

**표를 문서에 두지 않았다**
- 무효화 규칙은 구현이 참조하는 계약이다. 문서의 표는 구현과 갈라지고, **갈라진 것을 아무도
  모른다.** 원본은 `packages/shared-types/src/invalidation-vocabulary.json` 하나이고
  TS·워커가 같은 파일을 읽는다. 앞 두 커밋의 사전과 같은 구조다
- 문서에는 요약과 근거만 남겼다. 셀 단위 판단은 사전의 `note` 에 있다

**레이어 상태가 셋이다** — B-6 이 세 번째를 요구했다
- `invalidated`(다시 계산) · `retimed`(구성 유지, 시각만 재투영) · `preserved`(손대지 않음)
- 둘로는 "컷 구성은 그대로인데 시각만 바뀐다"를 표현할 수 없다. BGM 을 가드 안에서 교체하면
  `timeline.cuts` 가 정확히 그 상태가 된다

**액션 10건 × 레이어 9종 = 90개 판단을 전부 적었다**
- 생략을 허용하고 기본값을 두면 레이어를 새로 추가했을 때 아무도 판단하지 않은 채 굳는다 —
  `preserved` 기본값은 새 레이어를 조용히 낡게 하고 `invalidated` 기본값은 조용히 낭비한다.
  **사전에 없는 조합은 기본값이 아니라 예외다**

| 액션 | 무효화 / 재투영 / 유지 | attempt |
|---|---|---|
| 만료 후 재생성 | 0 / 0 / 9 | — |
| 사용자 "다시 생성" | 7 / 0 / 2 | music · edit · style |
| BGM 교체 (≤ ±20%) | 2 / 5 / 2 | music |
| BGM 교체 (> ±20%) | 7 / 0 / 2 | music · edit · style |
| 스티커 팩 교체 | 2 / 0 / 7 | style |
| 전환 스타일 스왑 | 2 / 0 / 7 | edit |
| 컷 순서 수동 변경 | 2 / 3 / 4 | — |
| 컷 삭제 | 4 / 1 / 4 | — |
| 클립 추가 | 5 / 0 / 4 | edit · style |
| 출력 프로필·`fitMode` 변경 | 0 / 0 / 9 | — |

**표가 담은 판단 넷**
- **첫 두 행은 레이어가 아니라 `attempt` 로 갈린다.** 만료 재생성은 `attempt` 를 그대로 둬
  산출물이 같고, 사용자 재생성은 올려서 달라진다. 인접 배치한 이유이며 `attempt` 열의 존재 이유다
- **핀 승격은 사용자 재생성에서만.** 더 나은 `analysisVersion` 이 나중에 생겨도 만료 재생성은
  올리지 않는다 — 올리면 "복원"이 다른 영상을 낸다. A-5 의 세 번째 축이 이 열이다
- **팩 교체는 재렌더가 아니라 재생성이다.** "재렌더는 레지스트리·번들을 다시 조회하지 않는다"는
  핀을 바꾸지 않는 재렌더에만 적용된다
- **수동 컷 편집은 어떤 `attempt` 도 올리지 않는다.** 사용자가 순서를 정했으므로 선택이 없다

**검증**
- 워커: **118 테스트 통과**(신규 `test_invalidation.py` 21개). 90개 판단이 하나도 빠지지 않았는지,
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

**다음**: 잔여 개정(kickoff §6) — 두 초안 · trend-editing-pipeline.md §3 · api-spec.md · backlog A-7.

---

## 사전 기동 검증을 기계가 하게 (2026-08-20)

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

## `anchorAffinity` 검증 — `fallback` 과 정반대 규칙 (2026-08-20)

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

## 모노레포 문서 정합성 및 모바일 의존성 단일화 (2026-09-02)

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
