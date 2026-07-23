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
