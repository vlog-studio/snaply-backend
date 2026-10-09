# Snaply 모노레포 온보딩

새 개발자가 clone부터 API `GET /health` 200, Swagger `/docs`, Android dev client 실행까지
도달하기 위한 가이드.
**로컬 셋업·명령·트러블슈팅의 원천 문서다** — 다른 문서가 셋업 절차를 말하면 그쪽이 낡은 것이다.

문서 지도는 [README.md](./README.md), 작업 분담은 [docs/team.md](./docs/team.md),
미결 작업은 [docs/backlog.md](./docs/backlog.md), 진행 기록은 [docs/progress.md](./docs/progress.md),
API 계약은 [packages/shared-types/src/contract/](./packages/shared-types/src/contract/)(Swagger `/docs`),
계약만으로 알 수 없는 동작은 [docs/api-spec.md](./docs/api-spec.md).

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

디렉터리 구조는 [README.md](./README.md#구조) §구조. 로컬 인프라는 PostgreSQL(DB, `:5432`) ·
Supabase(Auth) · MinIO(S3 호환, `:9100`) · Redis(`:6379`)이고, API 서버는 `:3000`에 뜬다.

API 서버 밖에서 도는 상주 프로세스는 넷이다. 모두 Redis 큐를 구독하고 HTTP 포트를 열지 않는다.

| 프로세스 | 큐 | 하는 일 |
|---|---|---|
| 편집 워커 `apps/ai-worker/src/worker.py` | `edit-jobs` · `edit-v3` | 무비 렌더(컷·스타일·BGM·자막). `edit-v3`는 경계별 전환을 쓰는 editSpec v3 전용 큐 |
| 스냅 분석 워커 `apps/ai-worker/src/analysis_worker.py` | `video-analysis` | 스냅 내용 분석(OpenAI) |
| 배포 렌디션 워커 `apps/ai-worker/src/rendition_worker.py` | `renditions` | 업로드된 스냅의 H.264/SDR 재생용 사본 |
| 알림 발송 워커 `apps/api/src/notification-worker.ts` | `notifications` | 편집 워커가 넣은 알림 요청을 FCM으로 발송 |

`apps/ai-worker/src/main.py`의 FastAPI(`:8000`, `AI_WORKER_PORT`)는 Phase 1 뼈대의 잔재로, compose·npm
스크립트 어디에서도 실행하지 않는다.

개발/서버 전환은 endpoint/URL만 교체하고 코드 분기는 없다 — `S3_ENDPOINT`를 비우면 AWS S3, Redis는
`REDIS_URL`만 바꾼다. 서버 구성은 [docs/deployment-aws.md](./docs/deployment-aws.md).

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
npm run build -w @vlog-studio/shared-types
```

마지막 줄은 API 계약 패키지를 빌드한다. API·API 테스트·모바일이 `packages/shared-types/dist/`(git 제외)를
읽으므로, 빌드 전에는 `npm run dev:api`가 뜨지 않는다. 계약이 바뀐 커밋을 pull하거나 브랜치를 바꾼 뒤에도
다시 실행한다(`npm run dev:mobile`과 `npm run verify:mobile`은 매번 빌드한다).

확인:

```bash
node --version
npm --version
npm exec -w snaply-app -- expo install --check
```

Node는 `.nvmrc`의 26, npm은 `package.json`의 11.19.1을 기준으로 한다. 다른 버전으로 `npm install`하면
lockfile이 흔들린다. `expo install --check`는 앱 워크스페이스(`apps/mobile`)에서 돌아야 앱 의존성을
검사하므로 `-w snaply-app`으로 실행한다.

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

Android 실기기에서 업로드·재생까지 확인할 때, adb reverse 경로(§3-4 기본)면 `S3_PUBLIC_ENDPOINT`를
위 값(`localhost`) 그대로 두고, LAN IP 경로면 `localhost`를 개발 PC의 LAN IP로 바꾼다.
`SUPABASE_SERVICE_ROLE_KEY`처럼 서버 전용인 값은 절대 모바일 환경파일에 넣지 않는다. 운영에는 `.env` 파일을 배포하지 않으며 값은 플랫폼 시크릿으로 주입한다.

### 3-4. 모바일 환경변수 만들기

```bash
cp apps/mobile/.env.example apps/mobile/.env
```

가장 먼저 UI만 둘러보려면 모든 값을 비워 둔다. 이 경우 앱은 mock API와 mock auth로
부팅한다. 실제 로컬 API와 연결하려면 다음 값을 채운다.

```dotenv
EXPO_PUBLIC_SUPABASE_URL=<팀 개발 프로젝트 URL>
EXPO_PUBLIC_SUPABASE_ANON_KEY=<팀 개발 client-safe key>
EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:3000
EXPO_PUBLIC_USE_MOCK_API=false
```

| 실행 대상 | `EXPO_PUBLIC_API_BASE_URL` |
|---|---|
| Android 실기기 — adb reverse (기본) | `http://127.0.0.1:3000`. `npm run android:device:reverse -w snaply-app`이 폰의 이 포트와 `S3_PUBLIC_ENDPOINT`(`localhost`일 때)·Metro 8081 포트를 PC로 잇는다. `npm run dev:up`이 자동으로 부르고, adb를 다시 붙이면 풀리므로 그때 다시 실행한다 |
| Android 실기기 — LAN IP | `http://<개발 PC의 LAN IP>:3000`. `S3_PUBLIC_ENDPOINT`도 LAN IP로 두고, PC와 폰이 같은 네트워크에 있어야 하며 방화벽에서 `3000`·`9100`을 허용한다 |
| Android 에뮬레이터 | `http://10.0.2.2:3000` 또는 adb reverse 사용 시 `http://127.0.0.1:3000` |
| iOS 시뮬레이터 | `http://127.0.0.1:3000` |

reverse가 어떤 포트를 잇는지와 실기기 설치 스크립트의 나머지 동작은
[`apps/mobile/docs/workflows/local-development-and-testing.md`](apps/mobile/docs/workflows/local-development-and-testing.md)의
`apps/mobile/scripts/install-android-device.sh` 절이 원천이다.

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
MinIO 이미지는 공개 배포처가 없어 우리가 소스에서 빌드한 GHCR 이미지를 쓴다. `docker login ghcr.io`
가 되어 있으면 받아 오고, 아니면 첫 실행에서 `deploy/minio`로 로컬 빌드한다(몇 분, 한 번만)
— [`scripts/ensure-minio-image.sh`](scripts/ensure-minio-image.sh), 배경은 backlog E-7.
MinIO 콘솔은 `http://localhost:9101`이며 기본 로그인은 `minioadmin` / `minioadmin123`이다.
버킷은 API 첫 기동 시 자동 생성된다. 공유 Supabase DB를 쓰는 경우에는 `DATABASE_URL`과
`DIRECT_URL`만 팀 값으로 바꾸고 로컬 PostgreSQL 대신 그 DB에 migration을 적용한다.

공유 Supabase DB를 쓰는 경우, 그 DB를 새로 만든 담당자만 최초 한 번 Supabase SQL Editor에서 RLS 정책
`apps/api/prisma/rls-policies.sql`을 실행한다. 로컬 PostgreSQL에는 필요 없다.

### 3-6. API 실행과 확인 — 터미널 1

```bash
npm run dev:api
```

처음 한 번(`db:seed` 포함) 이후에는 3-5와 이 단계를 `npm run dev:up` 하나로 대신할 수 있다.
Docker Desktop이 꺼져 있으면 켜고, 인프라가 준비될 때까지 기다린 뒤 마이그레이션을 적용하고,
무선 adb로 붙은 폰이 있으면 `adb reverse`까지 다시 건 다음 API를 띄운다
([`scripts/dev-up.sh`](scripts/dev-up.sh)). 워커는 띄우지 않는다(§3-8).

다른 터미널에서 확인한다.

```bash
curl http://localhost:3000/health
```

- Health: `http://localhost:3000/health`
- Swagger: `http://localhost:3000/docs`
- OpenAPI JSON: `http://localhost:3000/docs/json`

계약(`packages/shared-types/src/contract/`)을 바꿨으면 `npm run openapi:write -w apps/api`로
스냅샷 `apps/api/openapi.json`을 다시 생성해 같은 커밋에 넣는다. 서버가 떠 있을 필요는 없고,
빠뜨리면 `apps/api/test/openapi-snapshot.test.ts`가 실패한다.

응답은 계약 스키마로 직렬화된다. 계약과 어긋난 값(타입·enum·필수 필드)은 **500**이 되고, 계약에 없는
필드는 조용히 빠진다 — 앱에 새 필드를 보내려면 계약부터 고친다.

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

실기기를 로컬 API에 붙일 때 adb reverse 경로(§3-4 기본)라면 API를 띄운 뒤
`npm run android:device:reverse -w snaply-app`을 한 번 실행한다(`npm run dev:up`을 썼다면 이미 걸려 있다).
LAN IP 경로라면 PC와 실기기가 같은 네트워크에 있어야 하며 방화벽에서 `3000`과 `9100` 포트 접근을
허용해야 한다. iOS는 Swift 6.2를 지원하는 Xcode에서
`npm run ios -w snaply-app`을 사용한다. 구형 Xcode 제약과 상세 기기 절차는
[`apps/mobile/docs/workflows/local-development-and-testing.md`](apps/mobile/docs/workflows/local-development-and-testing.md)를 본다.

Claude Code로 모바일을 작업할 때는 `apps/mobile`에서 세션을 연다 — `apps/mobile/.claude/settings.json`의
플러그인은 그 디렉터리에서 연 세션에만 적용된다. 모바일 전용 스킬(`hygiene-sweep`,
`apps/mobile/.claude/skills/`)은 루트 세션에서도 `apps/mobile` 아래 파일을 다룰 때 잡힌다.

### 3-8. 워커 실행 — 선택, 터미널 3~

실제 편집·분석·재생용 변환·완성 알림까지 처리할 때만 띄운다(§2의 네 프로세스). Python 워커 셋은
같은 venv를 쓴다.

```bash
npm run worker:install                     # 최초 1회 — apps/ai-worker/.venv
npm run worker                             # 편집 워커
npm run worker:rendition                   # 배포 렌디션 워커
npm run worker:analysis                    # 스냅 분석 워커
npm run worker:notifications -w apps/api   # 알림 발송 워커
```

- 렌디션 워커가 없으면 업로드한 스냅이 다른 플랫폼에서 재생되지 않을 수 있다(편집은 원본으로 돈다).
- 분석 워커는 `apps/api/.env`의 `OPENAI_API_KEY`가 없으면 기동 단계에서 종료된다.
- 알림 워커는 `FIREBASE_SERVICE_ACCOUNT_KEY`가 없으면 FCM을 dry-run(로그만)으로 보낸다.

워커는 기본적으로 `apps/api/.env`를 읽는다. pgbouncer URL이 asyncpg와 충돌하는 특수한
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

루트 `npm test`는 turbo로 모바일 jest까지 돌고, CI는 바꾼 경로와 상관없이 모든 PR에서 `verify:mobile`도
실행한다 — 백엔드만 고친 PR도 모바일 검증이 깨지면 실패하므로 위 명령으로 먼저 확인한다. 예외는 문서만 바꾼 변경이다
(`docs/**` · `*.md` 뿐이면 CI 가 돌지 않는다).

API 테스트는 `infra:up`으로 띄운 로컬 PostgreSQL·Redis·MinIO를 사용하고 `snaply_test` DB를 자동
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
| `npm run stack:up` / `stack:migrate` | API만 포그라운드로 기동 / migration 수동 재실행 |
| `npm run smoke:images` | API·워커 이미지를 빌드해 실제로 뜨는지 검사(API `/health`의 `db=connected`, 워커 이미지의 BGM 디렉터리·ffmpeg·워커 3종 임포트). 배포 워크플로가 이미지를 푸시하기 전에 같은 스크립트를 돈다 |
| `npm run dev:up` | Docker Desktop 기동 → 인프라 → `db:generate`·`db:migrate` → 폰 `adb reverse` → API까지 한 번에(Ctrl+C는 API만 종료) |
| `npm run dev:api` | API 서버(watch). `npm run dev`는 turbo로 `dev` 스크립트가 있는 워크스페이스(지금은 API뿐)를 띄운다 |
| `npm run dev:mobile` | shared-types 빌드 후 Android dev client용 Metro |
| `npm run build -w @vlog-studio/shared-types` | API 계약 패키지 빌드 (§3-2) |
| `npm run verify:mobile` | 모바일 자동 검증 게이트 — 검사 목록은 `apps/mobile/package.json`의 `verify` |
| `npm run worker` / `worker:rendition` / `worker:analysis` / `worker:install` | 편집 / 배포 렌디션 / 스냅 분석 워커 / venv 설치 (§3-8) |
| `npm run worker:notifications -w apps/api` | 알림 발송 워커 (§3-8) |
| `npm run build` / `typecheck` / `lint` | 전체 빌드/검사 (turbo) |
| `npm test` | turbo로 전체 테스트 — API 통합 테스트 + 모바일 jest |
| `npm test -w apps/api` | API 통합 테스트만 (실제 Postgres/Redis/MinIO 사용, `snaply_test` DB 자동 생성) |
| `npm run db:generate` / `db:migrate` / `db:seed` / `db:studio` | Prisma 클라이언트 생성 / 마이그레이션 / 시드 / Studio |
| `npm run openapi:write -w apps/api` | 계약을 바꾼 뒤 `apps/api/openapi.json` 재생성 (§3-6) |
| `npm run media:e2e` / `media:cleanup` | 업로드→편집→결과 e2e / 테스트 데이터 정리 (§5) |
| `npm run auth:stub -w apps/api` | 로컬 Supabase Auth 스텁 — 수동 테스트용 JWT 발급 |
| `npm run analysis:run` | 앱으로 올린 스냅 1건을 분석 요청·대기·결과 출력 (분석 워커가 떠 있어야 한다) |
| `npm run media:purge-expired -w apps/api` · `media:notify-expiring` · `accounts:purge` · `videos:purge-pending` | 정리·만료 예고 배치를 로컬 DB에 한 번 실행. 기본 dry-run이고 `-- --yes`를 붙여야 실행한다. 서버의 정기 실행은 [docs/deployment-aws.md](docs/deployment-aws.md#4-배치) §4 |
| `npm run ig:probe -w apps/api` 등 · `npm run dev:public-bucket -w apps/api` | SNS 연동 점검·개발 버킷 공개 — [docs/sns-setup.md](docs/sns-setup.md) |

### 외부에서 로컬 서버를 호출해야 할 때

AdMob SSV 콜백·RevenueCat 웹훅·SNS OAuth 콜백처럼 **외부 서비스가 우리 서버를 직접**
호출하는 테스트는 `localhost` 로 할 수 없다. cloudflared 로 임시 공개 주소를 띄운다 —
설치·절차·주의사항은 [docs/local-tunnel.md](docs/local-tunnel.md).

### 컨테이너로 테스트 서버 잠깐 띄우기

평소 개발은 "인프라만 컨테이너 + 앱은 네이티브"(`infra:up` + `dev:api`)다.
빌드된 이미지로 서버를 통째로 확인해야 할 때만 아래를 쓴다.

```bash
npm run stack           # 전체 빌드 + DB migration + api·워커 4종·인프라 백그라운드 기동
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
  보간 값도 같은 파일에서 읽는다. 휴대폰 테스트 시 이 값을 `http://<PC의 LAN IP>:9200`으로 두거나,
  adb reverse 경로면 `http://localhost:9200`으로 두고 `npm run android:device:reverse -w snaply-app`을 실행한다.
- API만 필요하면 `npm run stack:up`을 사용한다(포그라운드). 이 경우에도 필요한 인프라와 migration은
  자동으로 따라오지만 워커는 기동하지 않는다.
- 분석 워커 컨테이너는 `apps/api/.env`에 `OPENAI_API_KEY`가 없으면 기동 단계에서 종료된다(의도된 동작).
- 확인은 `/health` 만 보지 말 것 — `SUPABASE_URL` 이 비면 API 가 기동을 거부하지만, 값이 틀리면
  (다른 프로젝트·닿지 않는 주소) `/health` 는 200 인데 인증은 전부 실패한다. 인증이 필요한
  엔드포인트를 하나 찔러 봐야 한다.

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
- **포트 충돌(PostgreSQL 5432)**: 호스트 5432가 점유됐다면 `apps/api/.env`의 `POSTGRES_HOST_PORT`와 `DATABASE_URL`·`DIRECT_URL`의 포트를 함께 바꾼다(한쪽만 바꾸면 연결이 실패한다). 5433은 전체 스택(`npm run stack`)의 postgres가 쓰므로 피한다.
- **포트 충돌(API 3000)**: 다른 로컬 프로젝트가 3000을 쓰면 자기 `.env`의 `API_PORT`만 바꾼다(예: 3002). 컨테이너 스택(`npm run stack`)의 호스트 포트는 `API_HOST_PORT`(`apps/api/.env` 또는 셸 환경변수)로 바꾼다. 컨테이너/서버 내부 포트는 그대로 3000.
- **휴대폰에서 API·MinIO 접근 실패 — adb reverse 경로**: `EXPO_PUBLIC_API_BASE_URL`이 `http://127.0.0.1:3000`, `S3_PUBLIC_ENDPOINT`가 `http://localhost:9100`(또는 `127.0.0.1`)인지 확인하고 `npm run android:device:reverse -w snaply-app`을 다시 실행한다. adb 재연결·adb 서버 재시작은 reverse를 지운다. `localhost`가 아닌 주소의 포트는 reverse 대상이 아니다.
- **휴대폰에서 MinIO 접근 실패 — LAN IP 경로**: `S3_PUBLIC_ENDPOINT`를 `http://<PC의 LAN IP>:9100`으로 설정하고 OS/WSL 방화벽에서 MinIO API 포트를 허용한다. 관리 콘솔 포트(9101)는 필요한 관리자 대역에만 연다.
- **휴대폰에서 API 연결 실패 — LAN IP 경로**: `apps/mobile/.env`의 `EXPO_PUBLIC_API_BASE_URL`에 개발 PC의 LAN IP를 쓰고, API가 `0.0.0.0`에 bind됐는지와 방화벽의 3000 포트를 확인한다.
- **Android Expo Go 부팅 실패**: 정상적인 제한이다 — Android는 dev build가 기준이다(§3-7).
- **API·테스트가 `@vlog-studio/shared-types`를 찾지 못함**(`Failed to resolve entry for package` · `ERR_MODULE_NOT_FOUND`): 계약 패키지의 `dist/`가 없다. `npm run build -w @vlog-studio/shared-types`(§3-2). 계약이 바뀐 브랜치로 옮긴 뒤 API 응답이 이상할 때도 같은 명령으로 다시 빌드한다.
- **API가 `환경 변수 <KEY>가 설정되지 않았습니다`로 뜨지 않음**: 기동 필수 변수(`apps/api/src/env-spec.ts`의 `required: true` — `DATABASE_URL`·`SUPABASE_URL`·`S3_BUCKET_NAME`·`REDIS_URL`)가 `apps/api/.env`에 없다. §3-3의 최소값을 확인한다. `DATABASE_URL` 값은 있는데 붙지 못하면 서버는 뜨고 `/health`의 `db`가 `error`다.
- **워커 DB 연결 실패**: `DATABASE_URL`에 pgbouncer 파라미터가 있으면 asyncpg가 실패 → DIRECT_URL(5432) 사용.
- **Supabase 무료 프로젝트 일시정지**: 1주일 미사용 시 자동 정지. 대시보드에서 재개.
- **테스트 데이터 정리**: `npm run media:e2e`로 공유 DB(공유 Supabase 등)에 만든 데이터는 `npm run media:cleanup`으로 지운다 — `TEST_EMAIL` 계정의 데이터만 대상이고, 기본은 대상만 보여 주며 `npm run media:cleanup -- --yes`로 실제 삭제한다. 통합 테스트(`npm test -w apps/api`)는 로컬 `snaply_test` DB만 쓰므로 정리할 것이 없다.
- **⚠️ 테스트는 반드시 `npm test -w apps/api`로**: 다른 경로의 `npx vitest`는 개발 DB를 `TRUNCATE`할 수 있다 — 이유와 사고 이력은 [AGENTS.md](./AGENTS.md) §테스트.
- **크리덴셜 파일**: Firebase 서비스 계정 JSON 같은 키 파일은 `.gitignore` 에 패턴으로 막혀 있지만
  (`*firebase-adminsdk*.json`, `*.pem` 등), 레포 안에 두지 말고 `.env` 에 base64 로 넣는 것을 권장한다.
- **`apps/mobile` 의 이력**: 앱 저장소는 `d13f921 chore: unify app and backend monorepos` 에서 이 저장소로 합쳐졌다(2026-08-31).
  `apps/mobile` 아래 파일은 `git log` · `git blame` 이 그 커밋 이전으로 내려가지 않는다(이력이 squash 됐다) — 그 전 맥락은 옛 앱 저장소에서 찾는다.

---

## 6. 다음 단계

- 담당 트랙과 공유 파일 규칙: [docs/team.md](./docs/team.md)
- 커밋·PR·코드 규칙: [AGENTS.md](./AGENTS.md)
- 지금 막혀 있는 것: [docs/backlog.md](./docs/backlog.md)
- 기능별 구현·검증 내역: [docs/progress.md](./docs/progress.md)
- API 레퍼런스: `/docs`(Swagger) + [docs/api-spec.md](./docs/api-spec.md)
- 정책·설계 결정(확정·결정 대기): [docs/decisions/README.md](./docs/decisions/README.md)
- 서버 배포: [docs/deployment-aws.md](./docs/deployment-aws.md)
