# Snaply 모노레포 온보딩

새 개발자가 clone부터 API `GET /health` 200, Swagger `/docs`, Android dev client 실행까지
도달하기 위한 가이드.
**로컬 셋업·명령·트러블슈팅의 원천 문서다** — 다른 문서가 셋업 절차를 말하면 그쪽이 낡은 것이다.

문서 지도는 [README.md](./README.md), 작업 분담은 [docs/team.md](./docs/team.md),
미결 작업은 [docs/backlog.md](./docs/backlog.md), 진행 기록은 [docs/progress.md](./docs/progress.md),
API 명세는 [docs/api-spec.md](./docs/api-spec.md).

---

## 1. 필요한 툴

| 툴 | 버전 | 용도 | 설치 |
|---|---|---|---|
| **Node.js** | 26 (`.nvmrc`) | 모바일·API·공통 도구 | `nvm install` 후 `nvm use` |
| **npm** | 11.19.1 | workspace·lockfile 관리 | Node 설치 후 `npm --version` 확인 |
| **Python** | 3.11 | AI 편집 워커 | `brew install python@3.11` |
| **Docker** | 최신 | 로컬 PostgreSQL·MinIO·Redis | Docker Desktop |
| **FFmpeg** | 6+ | 영상 컷편집/BGM/자막 (워커) | `brew install ffmpeg` |
| **JDK** | 17 | Android 네이티브 빌드 | Android Studio 번들 JDK 또는 Temurin 17 |
| **Android Studio** | 최신 안정판 | Android SDK·에뮬레이터·adb | developer.android.com |
| **Supabase** | 클라우드 | Auth(JWT) — DB는 로컬 PostgreSQL | supabase.com 프로젝트 |
| Prisma | (npm 포함) | ORM/마이그레이션 | 설치 불필요 |

Python·FFmpeg는 AI 편집까지 실행할 때 필요하다. 모바일 UI와 API만 개발할 때는 나중에 설치해도 된다.
Android 실기기를 쓴다면 같은 Wi-Fi와 USB 또는 무선 디버깅 연결도 준비한다.

---

## 2. 아키텍처 한눈에

```
apps/mobile/          Expo SDK 57 + React Native 앱 (Expo Router)
apps/api/             Fastify + TypeScript API 서버 (:3000)
apps/ai-worker/       Python 워커 — BullMQ 큐 구독, FFmpeg/faster-whisper (HTTP 포트 없음)
                      편집 워커(worker.py)와 스냅 분석 워커(analysis_worker.py) 두 프로세스
packages/shared-types/ 앱·API가 공유하는 요청/응답 타입

인프라: 로컬 PostgreSQL(DB, :5432) · Supabase(Auth) · MinIO(S3 호환, :9100) · Redis(:6379)
```
> 워커는 `edit-jobs` Redis 큐를 구독하는 백그라운드 프로세스(`src/worker.py`)이고 HTTP 포트를 열지 않는다.
> `src/main.py`의 FastAPI(:8000)는 Phase 1 뼈대의 잔재로, compose·npm 스크립트 어디에서도 실행하지 않는다.
개발/운영 전환은 endpoint/URL만 교체(코드 분기 없음): S3_ENDPOINT 비우면 실제 AWS S3, REDIS_URL만 바꾸면 Upstash.

---

## 3. 처음 실행하는 순서

### 3-1. 저장소와 공용 서비스 접근 확인

시작 전에 팀에서 아래 항목을 받는다.

- GitHub 저장소 접근 권한
- 개발용 Supabase의 Project URL과 client-safe publishable/anon key
- 실제 SNS·FCM·결제를 만질 작업이라면 해당 콘솔 권한과 개발 키

Firebase·Instagram·TikTok·RevenueCat·Sentry 키는 첫 실행에는 없어도 된다. 값이 없으면
관련 기능이 mock 또는 dry-run으로 동작한다.

### 3-2. 클론과 의존성 설치

모든 Node 의존성과 lockfile은 저장소 루트에서 한 번만 관리한다.

```bash
git clone https://github.com/vlog-studio/snaply-backend.git
cd snaply-backend
nvm install
nvm use
npm ci
```

확인:

```bash
node --version
npm --version
npx expo install --check
```

Node는 `.nvmrc`의 26, npm은 `package.json`의 11.19.1을 기준으로 한다.

### 3-3. 서버 환경변수 만들기

```bash
cp .env.example apps/api/.env
```

`apps/api/.env`는 API·Prisma·AI worker·compose·e2e 스크립트가 함께 읽는다. 루트에는
`.env`를 만들지 않는다. 로컬 Docker 인프라를 쓸 때 최소값은 다음과 같다.

```dotenv
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/snaply
DIRECT_URL=postgresql://postgres:postgres@localhost:5432/snaply
SUPABASE_URL=<팀 개발 프로젝트 URL>
SUPABASE_PUBLISHABLE_KEY=<팀 개발 publishable key>
AWS_ACCESS_KEY_ID=minioadmin
AWS_SECRET_ACCESS_KEY=minioadmin123
AWS_REGION=ap-northeast-2
S3_BUCKET_NAME=snaply-dev
S3_ENDPOINT=http://localhost:9100
S3_PUBLIC_ENDPOINT=http://localhost:9100
REDIS_URL=redis://localhost:6379
NODE_ENV=development
API_PORT=3000
SNS_TOKEN_ENCRYPTION_KEY=<32바이트 이상의 개인 개발용 랜덤 문자열>
```

실기기에서 업로드·재생까지 확인하려면 `S3_PUBLIC_ENDPOINT`의 `localhost`를 개발 PC의
LAN IP로 바꾼다. `SUPABASE_SERVICE_ROLE_KEY`처럼 서버 전용인 값은 절대 모바일 환경파일에
넣지 않는다. 운영에는 `.env` 파일을 배포하지 않으며 값은 플랫폼 시크릿으로 주입한다.

### 3-4. 모바일 환경변수 만들기

```bash
cp apps/mobile/.env.example apps/mobile/.env
```

가장 먼저 UI만 둘러보려면 모든 값을 비워 둔다. 이 경우 앱은 mock API와 mock auth로
부팅한다. 실제 로컬 API와 연결하려면 다음 값을 채운다.

```dotenv
EXPO_PUBLIC_SUPABASE_URL=<팀 개발 프로젝트 URL>
EXPO_PUBLIC_SUPABASE_ANON_KEY=<팀 개발 client-safe key>
EXPO_PUBLIC_API_BASE_URL=http://<개발 PC의 LAN IP>:3000
EXPO_PUBLIC_USE_MOCK_API=false
```

| 실행 대상 | `EXPO_PUBLIC_API_BASE_URL` |
|---|---|
| Android 실기기 | `http://<개발 PC의 LAN IP>:3000` |
| Android 에뮬레이터 | `http://10.0.2.2:3000` 또는 adb reverse 사용 시 `http://127.0.0.1:3000` |
| iOS 시뮬레이터 | `http://127.0.0.1:3000` |

`EXPO_PUBLIC_*`는 앱 번들에 포함되는 공개 값이다. 비밀키·service role key·서버 토큰을 넣지 않는다.

### 3-5. 로컬 인프라와 DB 준비

Docker Desktop을 실행한 뒤 저장소 루트에서 순서대로 실행한다.

```bash
npm run infra:up
npm run db:generate
npm run db:migrate
npm run db:seed
```

`infra:up`은 PostgreSQL `:5432`, MinIO `:9100/:9101`, Redis `:6379`를 시작한다.
MinIO 콘솔은 `http://localhost:9101`이며 기본 로그인은 `minioadmin` / `minioadmin123`이다.
버킷은 API 첫 기동 시 자동 생성된다. 공유 Supabase DB를 쓰는 경우에는 `DATABASE_URL`과
`DIRECT_URL`만 팀 값으로 바꾸고 로컬 PostgreSQL 대신 그 DB에 migration을 적용한다.

RLS 정책은 Supabase를 새로 만든 담당자만 최초 한 번 Supabase SQL Editor에서
`apps/api/prisma/rls-policies.sql`을 실행한다.

### 3-6. API 실행과 확인 — 터미널 1

```bash
npm run dev:api
```

다른 터미널에서 확인한다.

```bash
curl http://localhost:3000/health
```

- Health: `http://localhost:3000/health`
- Swagger: `http://localhost:3000/docs`
- OpenAPI JSON: `http://localhost:3000/docs/json`

계약(`packages/shared-types/src/contract/`)을 바꿨으면 `npm run openapi:write -w apps/api`로
스냅샷 `apps/api/openapi.json`을 다시 생성해 같은 커밋에 넣는다. 서버가 떠 있을 필요는 없고,
빠뜨리면 `test/openapi-snapshot.test.ts`가 실패한다.

`SUPABASE_PUBLISHABLE_KEY`가 있으면 Swagger `Authorize`의 `devLogin`에 개발 계정 이메일과
비밀번호를 넣어 Bearer token을 받을 수 있다. 키가 없으면 `bearerAuth`에 JWT를 직접 넣는다.

### 3-7. 모바일 실행 — 터미널 2

Android는 Expo Go에서 부팅되지 않으므로 dev build가 기준이다. 최초 한 번은 네이티브 앱을
빌드·설치한다.

```bash
npm run android:device -w snaply-app
```

에뮬레이터라면 `npm run android -w snaply-app`을 사용한다. 개발 빌드가 이미 설치된 뒤에는
Metro만 실행하면 된다.

```bash
npm run dev:mobile
```

API와 모바일을 함께 쓸 때는 PC와 실기기가 같은 네트워크에 있어야 하며 방화벽에서 `3000`과
`9100` 포트 접근을 허용해야 한다. iOS는 Swift 6.2를 지원하는 Xcode에서
`npm run ios -w snaply-app`을 사용한다. 구형 Xcode 제약과 상세 기기 절차는
[`apps/mobile/docs/workflows/local-development-and-testing.md`](apps/mobile/docs/workflows/local-development-and-testing.md)를 본다.

### 3-8. AI worker 실행 — 선택, 터미널 3

실제 편집 job까지 처리할 때만 설치하고 실행한다.

```bash
npm run worker:install
npm run worker
```

스냅 내용 분석 worker는 별도 프로세스이며 `apps/api/.env`의 `OPENAI_API_KEY`가 필요하다.

```bash
npm run worker:analysis
```

worker는 기본적으로 `apps/api/.env`를 읽는다. pgbouncer URL이 asyncpg와 충돌하는 특수한
경우에만 `apps/ai-worker/.env`에 `DATABASE_URL=<DIRECT_URL 값>` 한 줄을 두어 덮어쓴다.

### 3-9. 자동 검증

기능 작업을 시작하기 전에 기준 상태가 통과하는지 확인한다.

```bash
npm run verify:mobile
npm run build -- --filter=@vlog-studio/api
npm run typecheck -- --filter=@vlog-studio/api
npm run lint -- --filter=@vlog-studio/api
npm test -w apps/api
```

API 테스트는 `infra:up`으로 띄운 로컬 PostgreSQL·Redis를 사용하고 `snaply_test` DB를 자동
생성한다. `apps/api` 밖에서 `npx vitest`를 직접 실행하지 않는다. AI worker 테스트는 다음과 같다.

```bash
cd apps/ai-worker
.venv/bin/python -m unittest discover -s tests
cd ../..
```

작업을 마치고 로컬 인프라를 내릴 때는 `npm run infra:down`을 실행한다.

---

## 4. 자주 쓰는 명령 (루트)

| 명령 | 설명 |
|---|---|
| `npm run infra:up` / `infra:down` / `infra:logs` | 개발 인프라 기동/중지/로그 |
| `npm run stack` / `stack:down` | 전체 컨테이너 스택 빌드·migration·기동 / 중지 |
| `npm run stack:up` / `stack:migrate` | API만 기동 / migration 수동 재실행 |
| `npm run dev:api` | API 서버(watch) |
| `npm run dev:mobile` | Android dev client용 Metro |
| `npm run verify:mobile` | 모바일 포맷·린트·타입·API 타입·Jest 검증 |
| `npm run worker` / `worker:install` | AI 편집 워커 (`edit-jobs` 큐) / venv 설치 |
| `npm run worker:analysis` | 스냅 분석 워커 (`video-analysis` 큐, `OPENAI_API_KEY` 필요) |
| `npm run build` / `typecheck` / `lint` | 전체 빌드/검사 |
| `npm run db:generate` / `db:migrate` / `db:seed` / `db:studio` | Prisma 클라이언트 생성 / 마이그레이션 / 시드 / Studio |
| `npm run media:e2e` / `media:cleanup` | 업로드→편집→결과 e2e / 테스트 데이터 정리 |
| `npm test -w apps/api` | 통합 테스트 (실제 Postgres/Redis/MinIO 사용, `snaply_test` DB 자동 생성) |
| `npm run auth:stub -w apps/api` | 로컬 Supabase Auth 스텁 — 수동 테스트용 JWT 발급 |
| `npm run analysis:run` | 앱으로 올린 스냅 1건을 분석 요청·대기·결과 출력 (분석 워커가 떠 있어야 한다) |

### 외부에서 로컬 서버를 호출해야 할 때

AdMob SSV 콜백·RevenueCat 웹훅·SNS OAuth 콜백처럼 **외부 서비스가 우리 서버를 직접**
호출하는 테스트는 `localhost` 로 할 수 없다. cloudflared 로 임시 공개 주소를 띄운다 —
설치·절차·주의사항은 [docs/local-tunnel.md](docs/local-tunnel.md).

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
- **휴대폰에서 API 연결 실패**: `apps/mobile/.env`의 `EXPO_PUBLIC_API_BASE_URL`에 `localhost`가 아니라 개발 PC의 LAN IP를 쓰고, API가 `0.0.0.0`에 bind됐는지와 방화벽의 3000 포트를 확인한다.
- **Android Expo Go 부팅 실패**: 정상적인 제한이다. `expo-notifications`가 포함돼 있으므로 `npm run android:device -w snaply-app`으로 dev build를 설치한다.
- **`db: not_configured`**: `DATABASE_URL` 미설정. `apps/api/.env`에 로컬 PostgreSQL 값(`postgresql://postgres:postgres@localhost:5432/snaply`)이 있는지 확인.
- **워커 DB 연결 실패**: `DATABASE_URL`에 pgbouncer 파라미터가 있으면 asyncpg가 실패 → DIRECT_URL(5432) 사용.
- **Supabase 무료 프로젝트 일시정지**: 1주일 미사용 시 자동 정지. 대시보드에서 재개.
- **테스트 데이터 정리**: 공유 Supabase를 쓸 땐 통합 테스트 후 자기 데이터 정리(닉네임/이메일 접두사로 구분).
- **⚠️ 테스트는 반드시 `apps/api` 기준으로 실행**: `npm test -w apps/api`.
  다른 디렉토리에서 `npx vitest` 를 돌리면 `apps/api/vitest.config.ts` 가 로드되지 않아 `setupFiles` 가
  적용되지 않고, `DATABASE_URL` 이 **개발 DB** 를 가리킨 채 테스트의 `TRUNCATE` 가 돌 수 있다.
  (실제로 이 경로로 개발 DB 시드가 날아간 적이 있다. 지금은 `assertTestDatabase()` 가 막지만 애초에 그러지 말 것.)
- **크리덴셜 파일**: Firebase 서비스 계정 JSON 같은 키 파일은 `.gitignore` 에 패턴으로 막혀 있지만
  (`*firebase-adminsdk*.json`, `*.pem` 등), 레포 안에 두지 말고 `.env` 에 base64 로 넣는 것을 권장한다.

### 모노레포 통합(2026-08-31) 전후 주의사항

앱 저장소는 `d13f921 chore: unify app and backend monorepos`에서 이 저장소로 합쳐졌다. 그 이전에
만든 브랜치·로컬 환경·에이전트 세션은 아래 차이를 한꺼번에 만난다. 내 브랜치가 통합 전 분기인지는
다음으로 확인한다(종료 코드 0이면 통합 후 분기).

```bash
git merge-base --is-ancestor d13f921 <branch>
```

**환경 — 통합 후 툴체인이 바뀌었다**

| 항목 | 통합 전 | 통합 후 |
|---|---|---|
| Node | `>=20` | `>=22.13` (`.nvmrc`는 26) |
| npm | 10.8.2 | 11.19.1 |
| 루트 `npm test` | API만 | turbo가 모바일 jest까지 실행 |
| CI | API 잡만 | 모든 PR에서 `verify:mobile`도 실행(경로 필터 없음) |

- 루트에서 `nvm use && npm ci`를 다시 한다. 구 Node/npm으로 `npm install`하면 lockfile이 흔들린다.
  pull 뒤 `npm run db:generate`도 잊지 않는다.
- 백엔드만 고친 PR도 모바일 verify가 깨지면 CI가 실패한다. 로컬 확인은 §3-9의 범위 좁힌 명령을 쓴다.
- 환경변수 파일이 `apps/api/.env` 하나에서 `apps/mobile/.env`(`EXPO_PUBLIC_*`)까지 둘이 됐다.
  서버 시크릿을 모바일 `.env`에 복사하면 앱 번들에 노출되므로 금지. `APP_DEEPLINK_SCHEME` 기본값은
  `snaplyapp://`로 바뀌었다.

**API 계약 — 통합 후 Zod 계약이 스키마의 원천이다** (`855cf05`, [결정 문서](./docs/decisions/api-contract-schema-first.md))

- `apps/api/src/schemas/responses.ts`, `packages/shared-types/src/api.ts`, `domain.ts`는 **삭제**됐다.
  통합 전 브랜치가 이 파일들을 고쳤다면 rebase 시 삭제 충돌이 난다. 내용은
  `packages/shared-types/src/contract/*.ts`로 옮긴다.
- 라우트를 추가·수정하면 계약 파일 수정 → `npm run openapi:write -w apps/api` → `apps/api/openapi.json`
  커밋 순서가 필수다. 스냅샷 테스트가 있어 빠뜨리면 테스트가 실패한다.
- 응답 직렬화가 strict다. 계약에 없는 필드를 내려보내면 조용히 빠지지 않고 **500**이 난다.
- 같은 날 Fastify 5로 올라갔다. WebSocket 핸들러는 소켓을 직접 받고, `setErrorHandler`의 에러 타입은
  `FastifyError`로 고정하며, `decorateRequest`는 `null` 초기값을 받지 않는다.

**이력 — 모바일 쪽 git 이력은 squash됐다**

- `apps/mobile` 아래 파일은 `git log`·`git blame`이 통합 커밋(08-31) 이전으로 내려가지 않는다.
  그 이전 맥락은 옛 앱 저장소에서 찾는다.
- 통합 전에 분기한 원격 브랜치는 커밋이 다른 해시로 main에 들어가 있을 수 있다. 그대로 rebase하면
  같은 내용끼리 충돌하니 `git cherry -v main <branch>`로 미병합 커밋(`+`)만 골라 cherry-pick한다.

**에이전트(Claude Code) 세션**

- [`AGENTS.md`](./AGENTS.md)가 통합 후 크게 바뀌었다. 문서 갱신 의무가 표로 재편됐고,
  [`docs/constitution.md`](./docs/constitution.md)와 [`docs/specs/`](./docs/specs/README.md)가 새로 생겨
  사용자 가시 동작은 **스펙을 구현보다 먼저** 고친다. 통합 전 컨텍스트를 이어가던 세션은 새로 열어
  지침을 다시 읽힌다.
- [`apps/mobile/AGENTS.md`](./apps/mobile/AGENTS.md)는 영어로 쓰인 별도 지침이며 루트 헌법·스펙이 그 위에
  있다. 모바일 전용 스킬(`apps/mobile:hygiene-sweep`)과 `apps/mobile/.claude/settings.json`의 플러그인은
  `apps/mobile`에서 세션을 열어야 온전히 적용된다.
- `packages/shared-types`는 이제 API 계약까지 담는다. 계약을 바꾸면 API 테스트·`openapi.json` 재생성·
  모바일 verify를 함께 돌린다([docs/team.md](./docs/team.md) §2).

---

## 6. 다음 단계

- 담당 트랙과 공유 파일 규칙: [docs/team.md](./docs/team.md)
- 커밋·PR·코드 규칙: [AGENTS.md](./AGENTS.md)
- 지금 막혀 있는 것: [docs/backlog.md](./docs/backlog.md)
- 기능별 구현·검증 내역: [docs/progress.md](./docs/progress.md)
- API 레퍼런스: `/docs`(Swagger) + [docs/api-spec.md](./docs/api-spec.md)
- 확정된 정책·설계 결정: [docs/decisions/](./docs/decisions/)
