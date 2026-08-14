# Snaply 백엔드 온보딩

새 개발자가 clone부터 `GET /health` 200 + Swagger `/docs`까지 도달하기 위한 가이드.
**로컬 셋업·명령·트러블슈팅의 원천 문서다** — 다른 문서가 셋업 절차를 말하면 그쪽이 낡은 것이다.

문서 지도는 [README.md](./README.md), 작업 분담은 [docs/team.md](./docs/team.md),
미결 작업은 [docs/backlog.md](./docs/backlog.md), 진행 기록은 [docs/progress.md](./docs/progress.md),
API 명세는 [docs/api-spec.md](./docs/api-spec.md).

---

## 1. 필요한 툴

| 툴 | 버전 | 용도 | 설치 |
|---|---|---|---|
| **Node.js** | 20.x | API 서버(Fastify+TS) | `nvm install 20` 또는 `brew install node@20` |
| **Python** | 3.11 | AI 편집 워커 | `brew install python@3.11` |
| **Docker** | 최신 | MinIO/Redis(+옵션 Postgres) 컨테이너 | Docker Desktop |
| **FFmpeg** | 6+ | 영상 컷편집/BGM/자막 (워커) | `brew install ffmpeg` |
| **Supabase** | 클라우드 | PostgreSQL DB + Auth(JWT) | supabase.com 프로젝트 |
| Prisma | (npm 포함) | ORM/마이그레이션 | 설치 불필요 |

> 미디어/편집 트랙(Dev A)만 FFmpeg·Python 워커가 필수. 연동/수익화 트랙(Dev B)은 없어도 대부분 개발 가능.

---

## 2. 아키텍처 한눈에

```
apps/api/          Fastify + TypeScript API 서버 (:3000)
apps/ai-worker/    Python 워커 — BullMQ 큐 구독, FFmpeg/faster-whisper (HTTP 포트 없음)
packages/shared-types/  FE와 공유하는 API 타입

인프라: Supabase(DB+Auth) · MinIO(S3 호환, :9100) · Redis(:6379)
```
> 워커는 `edit-jobs` Redis 큐를 구독하는 백그라운드 프로세스(`src/worker.py`)이고 HTTP 포트를 열지 않는다.
> `src/main.py`의 FastAPI(:8000)는 Phase 1 뼈대의 잔재로, compose·npm 스크립트 어디에서도 실행하지 않는다.
개발/운영 전환은 endpoint/URL만 교체(코드 분기 없음): S3_ENDPOINT 비우면 실제 AWS S3, REDIS_URL만 바꾸면 Upstash.

---

## 3. 셋업 (순서대로)

### 3-1. 클론 & 의존성
```bash
git clone https://github.com/vlog-studio/snaply-backend.git
cd snaply-backend
npm install
```

### 3-2. 환경변수 (`apps/api/.env`)
```bash
cp .env.example apps/api/.env
```
> **`.env` 는 저장소에 이 하나뿐이다.** 루트나 `apps/ai-worker/` 에 사본을 만들지 않는다 —
> API·워커·Prisma·compose·e2e 스크립트가 전부 이 파일을 본다.
> 운영에는 이 파일이 가지 않는다(값은 배포 플랫폼에서 주입). 배경은
> [docs/decisions/env-management.md](docs/decisions/env-management.md).
개발에 **최소로 필요한 값** (나머지는 비워도 mock/dry-run으로 동작):

| 변수 | 얻는 곳 |
|---|---|
| `DATABASE_URL`, `DIRECT_URL` | Supabase → Connect → ORMs(Prisma) |
| `SUPABASE_URL` | Supabase → Settings → API (Project URL) |
| `SUPABASE_PUBLISHABLE_KEY` | Settings → API Keys (Publishable key, Swagger 개발 로그인용) |
| `SUPABASE_ANON_KEY` | Legacy API Keys의 anon key (레거시 fallback, 신규 설정에는 불필요) |
| `SUPABASE_SERVICE_ROLE_KEY` | Settings → API (Secret key) |
| `API_PORT` | `3000` (로컬에서 점유됐다면 다른 값으로, 예: 3002) |
| `S3_ENDPOINT` | `http://localhost:9100` (로컬 MinIO) |
| `S3_PUBLIC_ENDPOINT` | 클라이언트 접근 주소. PC만 테스트하면 `http://localhost:9100`, 휴대폰은 `http://<PC의 LAN IP>:9100` |
| `S3_BUCKET_NAME` | `snaply-dev` |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | `minioadmin` / `minioadmin123` |
| `REDIS_URL` | `redis://localhost:6379` |
| `SNS_TOKEN_ENCRYPTION_KEY` | 아무 랜덤 문자열(32바이트 권장) |

외부 실키(Firebase/Instagram/TikTok/RevenueCat/Sentry)는 **없어도 됨** — 해당 기능이 mock/dry-run으로 동작하고, 나중에 키만 넣으면 실제 호출로 전환된다.

### 3-3. 인프라 기동 (MinIO + Redis)
```bash
npm run infra:up      # docker-compose.dev.yml (MinIO :9100/:9101, Redis :6379)
```
콘솔: http://localhost:9101 (minioadmin / minioadmin123). 버킷은 API 첫 기동 시 자동 생성.

### 3-4. DB 마이그레이션 & 시드
```bash
npm run db:generate   # Prisma 클라이언트
npm run db:migrate    # 테이블 생성
npm run db:seed       # 위치 50개 시드 (Phase 6)
```
RLS 정책은 최초 1회 Supabase SQL Editor에 `apps/api/prisma/rls-policies.sql` 실행.

### 3-5. 서버 실행
```bash
npm run dev:api       # http://localhost:3000
curl http://localhost:3000/health        # {"data":{"status":"ok","db":"connected"}}
open http://localhost:3000/docs          # Swagger UI (인터랙티브 테스트)
```

`SUPABASE_PUBLISHABLE_KEY`가 설정되어 있으면 Swagger의 `Authorize`에 `devLogin`
항목이 나타난다. Username에는 Supabase 테스트 이메일을, Password에는 비밀번호를
입력하고 `Authorize`를 누르면 발급된 access token이 이후 요청의 Bearer 토큰으로
자동 주입된다. Client ID/Secret은 비워둔다. 키가 없으면 기존 `bearerAuth`에 JWT를
직접 입력하는 방식만 제공된다.
운영 환경에서는 `ENABLE_DOCS=true`로 문서를 열더라도 `devLogin`은 등록되지 않는다.

### 3-6. AI 워커 (미디어 트랙만)
```bash
brew install ffmpeg
npm run worker:install                   # python3.11 venv + requirements
npm run worker                           # edit-jobs 큐 구독 시작
```
> 워커는 `apps/api/.env` 를 그대로 읽는다 — 사본을 만들지 않는다.
> 워커만 다른 값을 써야 할 때만 `apps/ai-worker/.env` 를 두면 그쪽이 우선한다.
> 워커의 `DATABASE_URL`은 asyncpg 호환을 위해 **DIRECT_URL(세션 풀러, 5432)** 값이어야 한다.
> 공유 `.env` 의 `DATABASE_URL` 에 pgbouncer 파라미터가 붙어 있다면, 그때가 바로
> `apps/ai-worker/.env` 에 `DATABASE_URL` 한 줄만 두어 덮을 상황이다.

---

## 4. 자주 쓰는 명령 (루트)

| 명령 | 설명 |
|---|---|
| `npm run infra:up` / `infra:down` | 개발 인프라 기동/중지 |
| `npm run stack` / `stack:down` | 전체 컨테이너 스택 빌드·migration·기동 / 중지 |
| `npm run stack:up` / `stack:migrate` | API만 기동 / migration 수동 재실행 |
| `npm run dev:api` | API 서버(watch) |
| `npm run worker` | AI 워커 |
| `npm run build` / `typecheck` / `lint` | 전체 빌드/검사 |
| `npm run db:migrate` / `db:seed` / `db:studio` | 마이그레이션 / 시드 / Prisma Studio |
| `npm test -w apps/api` | 통합 테스트 (실제 Postgres/Redis/MinIO 사용, `snaply_test` DB 자동 생성) |
| `npm run auth:stub -w apps/api` | 로컬 Supabase Auth 스텁 — 수동 테스트용 JWT 발급 |

### 컨테이너로 테스트 서버 잠깐 띄우기

평소 개발은 "인프라만 컨테이너 + 앱은 네이티브"(`infra:up` + `dev:api`)다.
빌드된 이미지로 서버를 통째로 확인해야 할 때만 아래를 쓴다.

```bash
npm run stack           # 전체 빌드 + DB migration + api/ai-worker/인프라 백그라운드 기동
npm run stack:down
```

최초 설치와 pull 후 업데이트 모두 `npm run stack`을 사용한다. Prisma migration은 API와 워커보다
먼저 실행되며, 이미 적용된 항목은 자동으로 건너뛴다. migration이 실패하면 API와 워커는 시작하지 않는다.

- 인프라 포트가 개발용과 다르다(**5433 / 6380 / 9200**). 프로젝트 이름도 `snaply-dev` 와
  분리돼 있어 **개발 인프라를 켜둔 채로 동시에 띄울 수 있다.**
- 자격증명은 `apps/api/.env` 를 읽어 오지만, **외부 연동은 기본 mock 이다**
  (`SNS_MOCK`/`BILLING_MOCK`). 잠깐 띄운 서버가 실제 RevenueCat·Instagram 을 호출하지 않게 하려는 것.
  실키 경로를 봐야 하면 `docker-compose.yml` 의 해당 줄을 지운다.
- `stack:*` 명령은 `--env-file apps/api/.env` 를 넘기므로 Compose의 `${S3_PUBLIC_ENDPOINT}` 같은
  보간 값도 같은 파일에서 읽는다. 휴대폰 테스트 시 이 값을 `http://<PC의 LAN IP>:9200`으로 둔다.
- API만 필요하면 `npm run stack:up`을 사용한다. 이 경우에도 필요한 인프라와 migration은 자동으로
  따라오지만 AI 워커는 기동하지 않는다.
- 확인은 `/health` 만 보지 말 것 — `SUPABASE_URL` 이 비면 `/health` 는 200 인데 인증은 전부 실패한다.
  인증이 필요한 엔드포인트를 하나 찔러 봐야 한다.

### 인증 없이 로컬에서 API 찔러보기

Supabase 프로젝트가 없어도 개발할 수 있다. `SUPABASE_URL` 을 로컬 스텁으로 돌리면 된다:

```bash
npm run auth:stub -w apps/api      # :54321 기동, 바로 쓸 토큰 출력
# apps/api/.env → SUPABASE_URL=http://127.0.0.1:54321
curl -H "Authorization: Bearer <출력된 토큰>" http://localhost:3000/auth/me
```
실제 Supabase로 돌아갈 땐 `SUPABASE_URL` 만 원래 값으로 되돌린다 (코드 변경 없음).

---

## 5. 트러블슈팅

- **포트 충돌(MinIO 9000)**: 다른 프로젝트가 9000을 쓰는 경우가 있어 snaply는 **9100/9101**을 쓴다. `.env`의 `S3_ENDPOINT`도 9100.
- **포트 충돌(API 3000)**: 다른 로컬 프로젝트가 3000을 쓰면 자기 `.env`의 `API_PORT`만 바꾼다(예: 3002). compose는 `API_HOST_PORT` 환경변수로 호스트 포트 변경 가능. 컨테이너/운영 내부 포트는 그대로 3000.
- **휴대폰에서 MinIO 접근 실패**: `S3_PUBLIC_ENDPOINT`를 `http://<PC의 LAN IP>:9100`으로 설정하고 OS/WSL 방화벽에서 MinIO API 포트를 허용한다. 관리 콘솔 포트(9101)는 필요한 관리자 대역에만 연다.
- **`db: not_configured`**: `DATABASE_URL` 미설정. Supabase 값 확인.
- **워커 DB 연결 실패**: `DATABASE_URL`에 pgbouncer 파라미터가 있으면 asyncpg가 실패 → DIRECT_URL(5432) 사용.
- **Supabase 무료 프로젝트 일시정지**: 1주일 미사용 시 자동 정지. 대시보드에서 재개.
- **테스트 데이터 정리**: 공유 Supabase를 쓸 땐 통합 테스트 후 자기 데이터 정리(닉네임/이메일 접두사로 구분).
- **⚠️ 테스트는 반드시 `apps/api` 기준으로 실행**: `npm test -w apps/api`.
  다른 디렉토리에서 `npx vitest` 를 돌리면 `apps/api/vitest.config.ts` 가 로드되지 않아 `setupFiles` 가
  적용되지 않고, `DATABASE_URL` 이 **개발 DB** 를 가리킨 채 테스트의 `TRUNCATE` 가 돌 수 있다.
  (실제로 이 경로로 개발 DB 시드가 날아간 적이 있다. 지금은 `assertTestDatabase()` 가 막지만 애초에 그러지 말 것.)
- **크리덴셜 파일**: Firebase 서비스 계정 JSON 같은 키 파일은 `.gitignore` 에 패턴으로 막혀 있지만
  (`*firebase-adminsdk*.json`, `*.pem` 등), 레포 안에 두지 말고 `.env` 에 base64 로 넣는 것을 권장한다.

---

## 6. 다음 단계

- 담당 트랙과 공유 파일 규칙: [docs/team.md](./docs/team.md)
- 커밋·PR·코드 규칙: [AGENTS.md](./AGENTS.md)
- 지금 막혀 있는 것: [docs/backlog.md](./docs/backlog.md)
- 기능별 구현·검증 내역: [docs/progress.md](./docs/progress.md)
- API 레퍼런스: `/docs`(Swagger) + [docs/api-spec.md](./docs/api-spec.md)
- 확정된 정책·설계 결정: [docs/decisions/](./docs/decisions/)
