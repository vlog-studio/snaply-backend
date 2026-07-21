# vlog-studio — 백엔드 개발 가이드

> **문서 용도**: 바이브 코딩(Claude Code / Cursor) 세션에서 LLM에게 컨텍스트로 제공하는 백엔드 전용 개발 가이드입니다.
> 소스코드는 작성하지 않습니다. 기능 정의, 작업 순서, 주의사항만 기술합니다.
> **각 Phase 시작 시 이 문서 전체를 컨텍스트로 첨부하세요.**

---

## 프로젝트 개요

| 항목 | 내용 |
|------|------|
| 서비스명 | Snaply (레포명: vlog-studio) |
| 설명 | 20~30대를 위한 숏폼 브이로그 AI 자동 편집 앱 |
| 핵심 기능 | ① 위치 기반 촬영 알림 ② AI 자동 편집 ③ SNS 원클릭 업로드 |
| 수익 모델 | Freemium 구독 — Free / Standard(₩9,900) / Premium(₩24,900) |
| 개발 범위 | **백엔드 API + AI 편집 워커** (프론트엔드는 별도 담당자) |

---

## 기술 스택

| 역할 | 기술 |
|------|------|
| API 서버 | Node.js + Fastify v4 + TypeScript |
| DB | PostgreSQL (Supabase) |
| ORM | Prisma |
| 인증 | Supabase Auth (JWT) |
| 파일 스토리지 | AWS S3 + CloudFront |
| 큐 | BullMQ + Redis (Upstash) |
| 푸시 알림 | Firebase Admin SDK (FCM) |
| AI 편집 워커 | Python 3.11 + FastAPI |
| 영상 처리 | FFmpeg + MoviePy |
| 자막 | faster-whisper |
| 결제 | Stripe Billing |
| 이메일 | Resend |
| 모니터링 | Sentry |
| CI/CD | GitHub Actions |

---

## 프로젝트 구조

```
vlog-studio/
├── apps/
│   ├── api/                        # Fastify API 서버
│   │   ├── src/
│   │   │   ├── routes/             # 라우트 핸들러
│   │   │   ├── services/           # 비즈니스 로직
│   │   │   ├── middleware/         # 인증, 권한, rate limit
│   │   │   ├── plugins/            # Fastify 플러그인
│   │   │   ├── db/                 # Prisma 클라이언트, 마이그레이션
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   └── ai-worker/                  # Python AI 편집 워커
│       ├── src/
│       │   ├── main.py             # FastAPI 엔트리포인트
│       │   ├── worker.py           # BullMQ Redis 구독 워커
│       │   └── pipeline/
│       │       ├── editor.py       # FFmpeg 편집
│       │       ├── subtitle.py     # faster-whisper 자막
│       │       ├── music.py        # 음악 매칭
│       │       └── uploader.py     # S3 결과 업로드
│       ├── requirements.txt
│       └── Dockerfile
│
├── packages/
│   └── shared-types/               # API 요청/응답 공유 타입 (FE와 공유)
│
├── docs/
│   └── api-spec.md                 # FE 담당자에게 전달할 API 명세
│
├── turbo.json
├── package.json
└── .env.example
```

---

## DB 스키마

```sql
-- users: Supabase Auth와 연동되는 앱 유저 테이블
users (
  id            UUID PK
  supabase_uid  UUID UNIQUE   -- Supabase auth.users 참조
  nickname      VARCHAR(50)
  avatar_url    TEXT
  fcm_token     TEXT
  interests     TEXT[]        -- ['여행', '일상', '카페']
  notification_enabled  BOOLEAN DEFAULT true
  quiet_start   INTEGER DEFAULT 22   -- 조용한 시간 시작 (시)
  quiet_end     INTEGER DEFAULT 8    -- 조용한 시간 종료 (시)
  created_at    TIMESTAMPTZ
  updated_at    TIMESTAMPTZ
)

-- locations: Geofence 포인트 DB
locations (
  id              UUID PK
  name            VARCHAR(100)
  lat             DOUBLE PRECISION
  lng             DOUBLE PRECISION
  radius_meters   INTEGER DEFAULT 500
  message_template TEXT           -- "{name}에서 기록을 남겨보세요!"
  category        VARCHAR(50)     -- 관광지 | 카페 | 여행지
  is_active       BOOLEAN DEFAULT true
  created_at      TIMESTAMPTZ
)

-- notification_logs: 알림 쿨다운 관리 (30분 중복 방지)
notification_logs (
  id           UUID PK
  user_id      UUID FK → users
  location_id  UUID FK → locations
  sent_at      TIMESTAMPTZ
)

-- videos: 영상 원본 및 편집 결과
videos (
  id               UUID PK
  user_id          UUID FK → users
  original_urls    TEXT[]     -- S3 원본 클립 URL 배열
  edited_url       TEXT       -- 편집 완료 영상 URL
  thumbnail_url    TEXT
  duration_seconds INTEGER
  style_preset     VARCHAR(20)  -- 감성 | 여행 | 일상
  status           VARCHAR(20)  -- pending | processing | done | failed
  created_at       TIMESTAMPTZ
)

-- edit_jobs: AI 편집 작업 상태 추적
edit_jobs (
  id               UUID PK
  video_id         UUID FK → videos
  user_id          UUID FK → users
  status           VARCHAR(20)  -- queued | processing | done | failed
  progress         INTEGER DEFAULT 0   -- 0~100
  error_message    TEXT
  started_at       TIMESTAMPTZ
  completed_at     TIMESTAMPTZ
  created_at       TIMESTAMPTZ
)

-- sns_connections: SNS 연동 계정
sns_connections (
  id                  UUID PK
  user_id             UUID FK → users
  platform            VARCHAR(20)   -- instagram | tiktok
  platform_user_id    VARCHAR(100)
  platform_username   VARCHAR(100)
  access_token        TEXT
  refresh_token       TEXT
  token_expires_at    TIMESTAMPTZ
  created_at          TIMESTAMPTZ
  UNIQUE(user_id, platform)
)

-- sns_uploads: SNS 업로드 이력
sns_uploads (
  id                UUID PK
  video_id          UUID FK → videos
  user_id           UUID FK → users
  platform          VARCHAR(20)
  platform_post_id  VARCHAR(100)
  status            VARCHAR(20)   -- pending | success | failed
  uploaded_at       TIMESTAMPTZ
  created_at        TIMESTAMPTZ
)

-- subscriptions: Stripe 구독 상태
subscriptions (
  id                       UUID PK
  user_id                  UUID FK → users UNIQUE
  plan                     VARCHAR(20) DEFAULT 'free'   -- free | standard | premium
  stripe_customer_id       VARCHAR(100)
  stripe_subscription_id   VARCHAR(100)
  current_period_end       TIMESTAMPTZ
  status                   VARCHAR(20) DEFAULT 'active'
  created_at               TIMESTAMPTZ
  updated_at               TIMESTAMPTZ
)
```

**RLS 정책 원칙**
- 모든 테이블 RLS 활성화
- 유저는 자신의 데이터만 SELECT / INSERT / UPDATE / DELETE 가능
- `supabase_uid = auth.uid()` 조건으로 본인 확인

---

## API 명세

> 모든 인증 필요 엔드포인트는 `Authorization: Bearer {supabase_jwt}` 헤더 필수
> 응답 형식 통일: `{ success: true, data: {...} }` / `{ success: false, error: { code, message } }`

### 인증

| Method | Path | 인증 | 설명 |
|--------|------|------|------|
| GET | /auth/me | ✅ | 내 프로필 조회 |
| PATCH | /auth/me | ✅ | 프로필 수정 (nickname, avatar_url, interests) |
| POST | /auth/fcm-token | ✅ | FCM 토큰 등록/갱신 |

### 영상

| Method | Path | 인증 | 설명 |
|--------|------|------|------|
| GET | /videos/upload-url | ✅ | S3 presigned URL 발급 |
| POST | /videos | ✅ | 영상 메타데이터 등록 (S3 업로드 완료 후 호출) |
| GET | /videos | ✅ | 내 영상 목록 (페이지네이션) |
| GET | /videos/:id | ✅ | 영상 상세 |
| DELETE | /videos/:id | ✅ | 영상 삭제 (S3 파일 + DB 동시 삭제) |

### AI 편집

| Method | Path | 인증 | 설명 |
|--------|------|------|------|
| POST | /edit-jobs | ✅ | 편집 요청 (BullMQ 큐에 추가) |
| GET | /edit-jobs/:id | ✅ | 편집 작업 상태 조회 |
| GET | /edit-jobs/:id/progress | ✅ | **WebSocket** — 실시간 진행률 스트리밍 |

**POST /edit-jobs 요청 바디**
```
{
  videoIds: string[]     // 편집할 클립 video.id 배열 (최대 10개)
  stylePreset: string    // 감성 | 여행 | 일상
}
```

**WebSocket /edit-jobs/:id/progress 이벤트**
```
// 서버 → 클라이언트
{ progress: 30, step: "음악 매칭 중..." }
{ progress: 70, step: "자막 생성 중..." }
{ progress: 100, step: "완료", outputUrl: "https://..." }
{ status: "failed", error: "편집 중 오류가 발생했습니다." }
```

### 위치 알림

| Method | Path | 인증 | 설명 |
|--------|------|------|------|
| GET | /locations | ✅ | 주변 위치 목록 (`?lat=&lng=&radius=5000`) |
| POST | /notifications/geofence-enter | ✅ | Geofence 진입 이벤트 수신 → FCM 발송 |

**POST /notifications/geofence-enter 요청 바디**
```
{
  locationId: string
}
```
**처리 로직**: notification_logs에서 30분 이내 같은 locationId 발송 이력 확인 → 없으면 FCM 발송 + 로그 기록

### SNS 연동

| Method | Path | 인증 | 설명 |
|--------|------|------|------|
| GET | /sns/connections | ✅ | 연동된 SNS 계정 목록 |
| GET | /sns/instagram/connect | ✅ | Instagram OAuth URL 반환 |
| GET | /sns/instagram/callback | ❌ | OAuth 콜백 (토큰 저장 후 앱 딥링크로 리다이렉트) |
| DELETE | /sns/instagram/disconnect | ✅ | 인스타그램 연동 해제 |
| POST | /sns/instagram/upload | ✅ | 인스타그램 릴스 업로드 |
| GET | /sns/tiktok/connect | ✅ | TikTok OAuth URL 반환 |
| GET | /sns/tiktok/callback | ❌ | OAuth 콜백 |
| DELETE | /sns/tiktok/disconnect | ✅ | 틱톡 연동 해제 |
| POST | /sns/tiktok/upload | ✅ | 틱톡 영상 업로드 |

**POST /sns/instagram/upload 요청 바디**
```
{
  videoId: string
  caption: string   // 게시글 문구 (선택)
}
```

### 결제

| Method | Path | 인증 | 설명 |
|--------|------|------|------|
| GET | /billing/plans | ❌ | 플랜 목록 및 가격 조회 |
| GET | /billing/subscription | ✅ | 내 구독 상태 조회 |
| POST | /billing/checkout | ✅ | Stripe Checkout Session 생성 → URL 반환 |
| POST | /billing/webhook | ❌ | Stripe 웹훅 (서명 검증 필수) |
| POST | /billing/cancel | ✅ | 구독 해지 (즉시 취소 아닌 기간 만료 후 해지) |

### 공통

| Method | Path | 인증 | 설명 |
|--------|------|------|------|
| GET | /health | ❌ | 서버 헬스체크 |

---

## 개발 Phase

### Phase 1 — 프로젝트 초기 세팅
**목표**: 로컬에서 API 서버가 뜨고, DB 연결이 되는 상태

**작업 목록**
1. Turborepo 모노레포 초기화 — apps/api, apps/ai-worker, packages/shared-types
2. Fastify + TypeScript 기본 서버 구성 — `GET /health` 동작 확인
3. Prisma 설치 및 DB 스키마 작성 — 위 DB 스키마 전체 반영
4. Supabase 프로젝트 연결 및 마이그레이션 적용
5. .env.example 작성 — 아래 환경 변수 섹션 참고
6. GitHub Actions CI 구성 — 빌드, 타입체크, 린트

**주의사항**
- Prisma schema.prisma와 Supabase SQL 스키마를 동기화 상태로 유지할 것
- `SUPABASE_SERVICE_ROLE_KEY`는 서버 전용, 절대 클라이언트에 노출 금지
- RLS 정책은 Supabase SQL Editor에서 직접 적용

**완료 조건**
- `GET /health` 200 응답
- Prisma Studio에서 테이블 전체 확인 가능
- GitHub Actions green

---

### Phase 2 — 인증 미들웨어
**목표**: Supabase JWT를 검증하고 요청마다 유저 정보를 주입하는 미들웨어 완성

**작업 목록**
1. Fastify JWT 플러그인 설정 — Supabase JWT secret으로 검증
2. `authMiddleware` 구현 — Authorization 헤더 파싱 → JWT 검증 → `request.user` 주입
3. `GET /auth/me` 구현 — Supabase UID로 users 테이블 조회, 없으면 자동 생성(upsert)
4. `PATCH /auth/me` 구현 — nickname, avatar_url, interests 업데이트
5. `POST /auth/fcm-token` 구현 — fcm_token 컬럼 업데이트

**주의사항**
- JWT 검증 실패 시 401, 유저 없음은 자동 생성(첫 로그인 처리)
- `request.user`에는 `{ id, supabaseUid, plan }` 최소 정보만 담을 것
- FCM 토큰은 기기 교체를 고려해 항상 upsert

**완료 조건**
- 유효한 Supabase JWT → `GET /auth/me` 200 + 유저 정보 반환
- 만료/위조 토큰 → 401 반환
- 신규 유저 첫 로그인 → users 테이블 자동 생성

---

### Phase 3 — 영상 업로드 파이프라인
**목표**: 클라이언트가 S3에 직접 영상을 올리고 백엔드에 등록하는 흐름 완성

**작업 목록**
1. AWS S3 서비스 모듈 구현 — presigned PUT URL 발급 (만료 15분)
2. `GET /videos/upload-url` 구현
   - 쿼리 파라미터: `filename`, `contentType`
   - 반환: `{ uploadUrl, videoId, s3Key }`
   - DB에 status='pending'으로 video 레코드 미리 생성
3. `POST /videos` 구현 — S3 업로드 완료 후 클라이언트가 호출, status를 'ready'로 업데이트
4. `GET /videos` 구현 — 내 영상 목록, 커서 기반 페이지네이션 (limit 20)
5. `GET /videos/:id` 구현
6. `DELETE /videos/:id` 구현 — S3 파일 삭제 + DB 소프트 삭제

**주의사항**
- presigned URL은 video 소유자 UUID를 S3 key 경로에 포함시켜 격리 (`uploads/{userId}/{videoId}.mp4`)
- CloudFront 도메인을 통해 영상 URL을 반환할 것 (S3 직접 URL 노출 금지)
- 파일 크기 제한: 단일 클립 최대 500MB — presigned URL 발급 시 `Content-Length` 조건 추가

**완료 조건**
- presigned URL로 S3 업로드 성공
- `POST /videos` 호출 후 DB status 'ready' 확인
- CloudFront URL로 영상 재생 가능

---

### Phase 4 — AI 편집 큐 시스템
**목표**: 편집 요청을 큐에 넣고 Python 워커가 처리하는 비동기 파이프라인 완성

**작업 목록**

**[API 서버]**
1. BullMQ Queue 초기화 — `edit-jobs` 큐, Redis 연결
2. `POST /edit-jobs` 구현
   - videoIds, stylePreset 검증 (소유권 확인 필수)
   - edit_jobs 테이블에 status='queued' 레코드 생성
   - BullMQ에 job 추가 — `{ jobId, userId, videoIds, stylePreset }`
   - 반환: `{ jobId }`
3. `GET /edit-jobs/:id` 구현 — edit_jobs 테이블 상태 조회
4. WebSocket `GET /edit-jobs/:id/progress` 구현
   - Redis Pub/Sub 채널 구독 (`edit-progress:{jobId}`)
   - 메시지 수신 시 클라이언트로 전달
   - 완료/실패 시 연결 종료

**[AI 워커]**
5. Redis 연결 및 `edit-jobs` 큐 구독 워커 구현
6. 편집 파이프라인 뼈대 구현 (실제 편집은 다음 Phase)
   - 큐에서 job 수신
   - edit_jobs status → 'processing', started_at 업데이트
   - 진행률을 Redis Pub/Sub으로 주기적 발행 (`edit-progress:{jobId}`)
   - 완료 시 status → 'done', completed_at 업데이트
   - 실패 시 status → 'failed', error_message 저장

**주의사항**
- `POST /edit-jobs`에서 videoIds 소유권 반드시 검증 (다른 유저 영상 편집 요청 차단)
- Free 플랜은 월 3편 제한 — subscriptions 테이블에서 이번 달 편집 횟수 체크
- BullMQ job 재시도 설정: `attempts: 3`, `backoff: { type: 'exponential', delay: 5000 }`
- WebSocket 연결은 인증 미들웨어 적용 (쿼리 파라미터로 토큰 전달 허용)

**완료 조건**
- `POST /edit-jobs` 호출 → BullMQ 큐 적재 확인
- WebSocket 연결 → 진행률 0→100 실시간 수신
- 워커 프로세스 재시작 시 큐 작업 유실 없음

---

### Phase 5 — AI 편집 엔진 구현
**목표**: Python 워커에서 실제 영상 편집이 완료되어 S3에 결과물이 저장되는 상태

**작업 목록**

1. S3에서 원본 클립 다운로드 (boto3) — `/tmp/{jobId}/` 임시 디렉토리에 저장
2. FFmpeg 컷편집 파이프라인 구현
   - 스타일 프리셋별 편집 파라미터 정의
     - `감성`: crossfade 0.8s, 저채도 필터(saturation 0.8)
     - `여행`: 빠른 컷 0.3s, 밝은 색감(brightness +0.1)
     - `일상`: 자연스러운 컷 0.5s, 원본 색감 유지
   - 클립 연결 및 전환 효과 적용
   - 최종 1080p MP4 렌더링
3. 음악 자동 매칭 구현 (v1 — 태그 기반)
   - 로컬 BGM 라이브러리 20곡 (라이선스 클리어 음원)
   - 스타일 프리셋 → 태그 매핑 → 랜덤 선택
   - FFmpeg로 BGM 합성, 영상 길이에 맞게 fade-out
4. faster-whisper 자막 생성 구현
   - 모델: `small` (서버 사양에 따라 `medium` 전환)
   - 음성 인식 → SRT 생성 → FFmpeg 소프트 자막 삽입
5. 완성 영상 S3 업로드 및 썸네일 추출
   - 완성 영상: `uploads/{userId}/edited/{jobId}.mp4`
   - 썸네일: `uploads/{userId}/thumbnails/{jobId}.jpg` (1초 시점 프레임)
6. 완료 후 API 서버에 결과 콜백
   - videos 테이블: edited_url, thumbnail_url, status='done' 업데이트
   - edit_jobs 테이블: status='done', progress=100, completed_at 업데이트
   - Redis Pub/Sub으로 완료 이벤트 발행

**주의사항**
- 임시 파일은 처리 완료 후 반드시 삭제 (`/tmp/{jobId}/` 전체)
- GPU 없는 환경에서도 동작해야 함 — CPU 폴백 모드 확인
- 단일 편집 작업 타임아웃: 10분 설정, 초과 시 failed 처리
- faster-whisper 모델은 컨테이너 시작 시 한 번만 로드 (요청마다 재로드 금지)

**완료 조건**
- 클립 3개 업로드 → 편집 요청 → 5분 내 완성 영상 S3 저장
- 완성 영상에 BGM + 자막 포함 확인
- 편집 실패 시 edit_jobs.status = 'failed' + error_message 저장

---

### Phase 6 — 위치 알림 시스템
**목표**: 앱에서 Geofence 진입 이벤트를 받으면 서버가 FCM 푸시를 발송하는 흐름 완성

**작업 목록**

1. Firebase Admin SDK 초기화
2. FCM 서비스 모듈 구현 — `sendToUser(userId, { title, body, data })` 함수
3. 위치 초기 데이터 시딩 (50개)
   - 서울 주요 관광지 (경복궁, 남산타워, 북촌한옥마을 등)
   - 감성 카페 밀집 지역 (성수동, 연남동, 홍대)
   - 여행지 (제주도 주요 스팟)
   - 각 위치: name, lat, lng, radius_meters(500), message_template, category
4. `GET /locations` 구현
   - 쿼리: `lat`, `lng`, `radius` (기본값 5000m)
   - Haversine 공식으로 주변 위치 필터링
5. `POST /notifications/geofence-enter` 구현
   - locationId 유효성 확인
   - notification_logs에서 30분 이내 중복 발송 여부 확인
   - 유저 quiet_start~quiet_end 시간대 확인 (해당 시간이면 발송 안 함)
   - `notification_enabled = false`이면 발송 안 함
   - 조건 통과 시 FCM 발송 + notification_logs 기록

**주의사항**
- `POST /notifications/geofence-enter`는 클라이언트에서 중복 호출될 수 있음 — 서버에서 반드시 중복 방지 처리
- FCM 발송 실패(토큰 만료 등)해도 200 응답 유지, 에러는 로깅만
- quiet_hours는 유저 디바이스 시간대(KST) 기준
- 위치 데이터는 Supabase SQL seed 파일로 관리

**완료 조건**
- `POST /notifications/geofence-enter` → FCM 수신 확인
- 30분 이내 같은 locationId 재호출 시 FCM 미발송 확인
- quiet_hours 적용 확인

---

### Phase 7 — SNS 연동 업로드
**목표**: 편집 완료 영상을 인스타그램 릴스와 틱톡에 업로드하는 기능 완성

**작업 목록**

**[인스타그램]**
1. Instagram OAuth URL 생성 — `GET /sns/instagram/connect`
   - scope: `instagram_basic,instagram_content_publish`
   - state에 userId 인코딩 (CSRF 방지)
2. OAuth 콜백 처리 — `GET /sns/instagram/callback`
   - code → access_token 교환
   - sns_connections 테이블에 저장
   - 앱 딥링크로 리다이렉트: `snaply://sns/connected?platform=instagram`
3. 릴스 업로드 구현 — `POST /sns/instagram/upload`
   - Instagram Graph API: Container 생성 → 업로드 → 게시
   - 업로드 전 토큰 만료 여부 확인 및 자동 갱신
   - sns_uploads 테이블에 이력 기록

**[틱톡]**
4. TikTok OAuth URL 생성 — `GET /sns/tiktok/connect`
5. OAuth 콜백 처리 — `GET /sns/tiktok/callback`
6. 영상 업로드 구현 — `POST /sns/tiktok/upload`
   - TikTok Content Posting API v2
   - sns_uploads 테이블에 이력 기록

**주의사항**
- Instagram API는 **비즈니스/크리에이터 계정만** 릴스 업로드 가능 — 연결 시 계정 타입 확인 후 일반 계정이면 안내 메시지 반환
- access_token은 암호화하여 DB 저장 (AES-256 권장)
- TikTok access_token 만료 주기는 24시간 — refresh_token으로 자동 갱신 로직 필수
- SNS 업로드는 비동기 처리 불필요 — 동기 응답으로 충분 (최대 2분 타임아웃)
- 업로드 실패 시 sns_uploads.status = 'failed' 저장, 에러 메시지 클라이언트에 전달

**완료 조건**
- 인스타그램 연동 → 릴스 업로드 성공
- 틱톡 연동 → 영상 업로드 성공
- sns_uploads 테이블에 이력 저장 확인

---

### Phase 8 — 결제 시스템
**목표**: Stripe 구독 결제 완성 및 플랜별 기능 제한 적용

**작업 목록**

1. Stripe 초기 설정
   - Stripe Dashboard에서 Product 3개 생성 (Free / Standard / Premium)
   - Price 생성: Standard ₩9,900/월, Premium ₩24,900/월
2. `GET /billing/plans` 구현 — 플랜 정보 정적 반환
3. `POST /billing/checkout` 구현
   - Stripe Customer 생성 또는 기존 고객 조회
   - Checkout Session 생성 (success_url, cancel_url은 앱 딥링크)
   - 반환: `{ checkoutUrl }`
4. `POST /billing/webhook` 구현
   - 처리 이벤트: `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`
   - subscriptions 테이블 동기화
5. `GET /billing/subscription` 구현 — 내 현재 구독 상태 반환
6. `POST /billing/cancel` 구현 — `cancel_at_period_end: true` 설정
7. 플랜별 기능 제한 미들웨어 구현
   - Free: 월 3편 편집, 720p, 워터마크 강제 삽입
   - Standard: 무제한 편집, 1080p, 워터마크 없음
   - Premium: 무제한 편집, 4K, 워터마크 없음, 추가 기능

**주의사항**
- Stripe 웹훅은 raw body로 서명 검증 필수 — Fastify에서 `addContentTypeParser`로 raw body 보존
- 웹훅 처리 실패 시 400 반환 (Stripe 재시도 트리거), 성공 시 200
- 결제 성공 전까지 플랜 업그레이드 반영 금지 — 웹훅 수신 후에만 업데이트
- 구독 만료 체크는 `current_period_end` 기준 (Stripe 웹훅으로 항상 최신 상태 유지)

**완료 조건**
- Stripe Test 모드에서 결제 완료 → subscriptions.plan = 'standard' 업데이트
- 웹훅으로 해지 처리 → plan = 'free' 복귀
- Free 플랜 편집 4번째 시도 시 403 반환

---

### Phase 9 — 마무리 및 배포 준비
**목표**: 운영 환경 배포 및 모니터링 세팅 완성

**작업 목록**

1. Sentry 연동
   - API 서버: `@sentry/node` 초기화, 전역 에러 핸들러에 캡처 추가
   - AI 워커: `sentry-sdk` 초기화, 편집 실패 시 캡처
2. API 전역 에러 핸들러 구현
   - Fastify `setErrorHandler` — 에러 코드별 적절한 HTTP 상태 코드 반환
   - 예상치 못한 에러 → 500 + Sentry 캡처
3. Rate Limiting 적용
   - 기본: IP당 분당 60 요청
   - `/edit-jobs`: 유저당 분당 5 요청
   - `/notifications/geofence-enter`: 유저당 분당 10 요청
4. API 명세 문서화 (`docs/api-spec.md`)
   - FE 담당자에게 전달할 목적
   - 엔드포인트별 요청/응답 예시 포함
5. Docker Compose 구성 — 로컬 개발용 (api + ai-worker + redis + postgres)
6. GitHub Actions 배포 파이프라인 — main 브랜치 머지 시 자동 배포

**주의사항**
- 운영 환경에서 `.env` 직접 노출 금지 — AWS Secrets Manager 또는 환경 변수 주입 방식 사용
- 로그에 개인정보(access_token, FCM 토큰 등) 출력 금지

**완료 조건**
- Sentry에 에러 자동 수집 확인
- `docs/api-spec.md` FE 담당자에게 전달 완료
- Docker Compose로 전체 스택 로컬 실행 가능

---

## 오픈소스 활용 계획

| 패키지 | 용도 | 설치 |
|--------|------|------|
| `@fastify/jwt` | JWT 검증 미들웨어 | npm |
| `@fastify/websocket` | WebSocket 지원 | npm |
| `@fastify/rate-limit` | Rate Limiting | npm |
| `@aws-sdk/client-s3` | S3 presigned URL | npm |
| `bullmq` | 편집 작업 큐 | npm |
| `ioredis` | Redis 클라이언트 | npm |
| `@turf/turf` | 서버사이드 Geofence 판정 | npm |
| `firebase-admin` | FCM 서버 발송 | npm |
| `stripe` | 결제 SDK | npm |
| `resend` | 트랜잭션 이메일 | npm |
| `@sentry/node` | 에러 모니터링 | npm |
| `ffmpeg-python` | 영상 편집 엔진 | pip |
| `moviepy` | 편집 파이프라인 | pip |
| `faster-whisper` | 자막 생성 | pip |
| `boto3` | S3 파일 업다운로드 | pip |
| `loguru` | Python 로깅 | pip |
| `sentry-sdk` | AI 워커 에러 추적 | pip |

---

## 환경 변수

```bash
# Supabase
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=        # 서버 전용, 클라이언트 노출 금지

# AWS
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=ap-northeast-2
S3_BUCKET_NAME=
CLOUDFRONT_DOMAIN=                # https://xxxxx.cloudfront.net

# Firebase
FIREBASE_PROJECT_ID=
FIREBASE_SERVICE_ACCOUNT_KEY=     # JSON base64 인코딩

# Redis
REDIS_URL=                        # rediss://...

# Stripe
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_STANDARD=
STRIPE_PRICE_PREMIUM=

# Instagram
INSTAGRAM_APP_ID=
INSTAGRAM_APP_SECRET=
INSTAGRAM_REDIRECT_URI=           # https://api.도메인/sns/instagram/callback

# TikTok
TIKTOK_CLIENT_KEY=
TIKTOK_CLIENT_SECRET=
TIKTOK_REDIRECT_URI=              # https://api.도메인/sns/tiktok/callback

# API
API_PORT=3000
API_BASE_URL=
SNS_TOKEN_ENCRYPTION_KEY=         # access_token 암호화 키 (32바이트)

# AI Worker
AI_WORKER_PORT=8000

# Sentry
SENTRY_DSN=
```

---

## 코드 컨벤션

| 항목 | 규칙 |
|------|------|
| 파일명 | kebab-case (`edit-job.ts`, `fcm.service.ts`) |
| 함수/변수 | camelCase |
| 클래스/타입/인터페이스 | PascalCase |
| 상수 | UPPER_SNAKE_CASE |
| API 응답 | 항상 `{ success, data }` 또는 `{ success, error }` 형식 |
| 에러 처리 | try-catch + Sentry.captureException, 에러 전파는 커스텀 Error 클래스 사용 |
| 로깅 (Python) | loguru 사용, print 금지 |
| 커밋 | Conventional Commits (`feat:`, `fix:`, `chore:` 등) |

---

## 자주 발생하는 문제 및 해결책

| 문제 | 원인 | 해결책 |
|------|------|--------|
| Stripe 웹훅 서명 검증 실패 | Fastify가 body를 자동 파싱함 | `addContentTypeParser('application/json')` 으로 raw buffer 유지 |
| Instagram 업로드 403 | 일반 계정으로 릴스 업로드 시도 | 연동 시 계정 타입 확인, 비즈니스/크리에이터만 허용 |
| TikTok 토큰 만료 | access_token 24시간 만료 | 업로드 전 만료 여부 확인, refresh_token으로 자동 갱신 |
| AI 편집 큐 적체 | 워커 다운 또는 GPU 부족 | BullMQ 재시도 3회 설정, 최소 1개 워커 상시 유지 |
| FCM 토큰 무효 | 앱 재설치 또는 토큰 만료 | FCM 발송 실패 시 `messaging/registration-token-not-registered` 에러 → fcm_token null 처리 |
| Geofence 중복 알림 | 클라이언트에서 반복 호출 | notification_logs 30분 쿨다운 서버에서 강제 적용 |

---

*vlog-studio 백엔드 개발 가이드 v1.0*
