# Snaply 백엔드 개발 진행 기록

각 Phase 완료 시점의 구현 내용, 완료 조건 검증 결과, 특이사항을 기록합니다.
전체 계획은 [SNAPVLOG_BACKEND_GUIDE.md](../SNAPVLOG_BACKEND_GUIDE.md) 참고.

**레포**: https://github.com/vlog-studio/snaply-backend

---

## 개발 인프라 (로컬 Docker, `.env`는 git 제외)

| 서비스 | 컨테이너 | 포트 | 비고 |
|---|---|---|---|
| PostgreSQL + Auth | Supabase (클라우드) | — | 리전 ap-southeast-1(싱가포르) |
| 오브젝트 스토리지 | `snaply-minio-dev` (MinIO) | 9100 / 9101 | 9000은 타 프로젝트(skillhub-minio) 점유 |
| 큐 | `snaply-redis-dev` (Redis 7) | 6379 | |
| AI 워커 | `apps/ai-worker/.venv` (Python 3.11) | 8000 | `python src/worker.py` |

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
- 공개 URL 반환 (개발은 MinIO URL, 운영은 CloudFront) ✅

**구현 내용**
- `services/storage.service.ts`: endpoint-aware S3 (MinIO/AWS 코드 분기 없음). presigned PUT 발급(만료 15분), HEAD 크기 확인, 삭제, 공개 URL, 개발용 버킷 자동 생성
- `services/video.service.ts` + `routes/videos.ts`: 5개 엔드포인트
  - `GET /videos/upload-url`(presigned + pending 레코드 선생성), `POST /videos`(업로드 확인 후 ready), `GET /videos`(커서 페이지네이션), `GET/DELETE /videos/:id`
- 소유자 UUID 경로 격리(`uploads/{userId}/{videoId}.mp4`), 소유권 격리(타 유저 404), S3 삭제 + 소프트 삭제
- 스키마에 `videos.s3_key`, `videos.deleted_at` 추가 + 마이그레이션

**특이사항**
- 500MB 제한: presigned PUT은 발급 시 최대 크기를 표현 못 하므로 `POST /videos` 확인 단계에서 HEAD로 검사 후 초과 시 삭제
- 스토리지는 MinIO(S3 호환)로 결정 — presigned URL이 개발환경에서도 동일하게 동작

---

## Phase 4 — AI 편집 큐 시스템 ✅

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
