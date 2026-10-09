# Repository instructions

이 지침은 저장소 전체에 적용된다. 문서 지도와 각 주제의 원천은 [`README.md`](README.md)를 본다.
`apps/mobile/**` 아래에서는 [`apps/mobile/AGENTS.md`](apps/mobile/AGENTS.md)의 모바일 전용 지침도
함께 적용한다. 모바일 문서의 상대 경로는 별도 표기가 없으면 `apps/mobile` 기준이며, 루트에서
명령을 실행할 때는 workspace 스크립트(`npm run verify:mobile` 등)를 사용한다.

## 응답 언어

- 사용자에게 하는 답변·진행 상황 보고·질문·변경 보고는 **한국어**로 쓴다. 사용자가 다른 언어로
  물어도 따로 요청하지 않는 한 한국어로 답한다.
- 코드 식별자, 파일 경로, 명령어, 로그·에러 원문, API·제품 이름은 번역하지 않고 원문 그대로 둔다.
- 이 규칙은 **대화 응답**에만 적용된다. 문서와 커밋의 언어는 각자의 규칙을 따른다 — 커밋 제목은
  영어(아래 [커밋](#커밋)), 모바일 에이전트 문서는 영어([`apps/mobile/AGENTS.md`](apps/mobile/AGENTS.md)
  "Documentation language").

## 작업 환경

- 서버 환경변수는 **`apps/api/.env`** 하나를 API 서버·Prisma CLI·AI 워커·compose·e2e
  스크립트가 함께 읽는다. 루트나 `apps/ai-worker/`에 사본을 만들지 않는다.
  유일한 예외: pgbouncer URL이 asyncpg와 충돌할 때 `apps/ai-worker/.env`에
  `DATABASE_URL=<DIRECT_URL 값>` 한 줄만 두어 덮어쓸 수 있다([ONBOARDING.md](ONBOARDING.md) §3-8).
- 모바일의 공개 빌드 변수(`EXPO_PUBLIC_*`)는 **`apps/mobile/.env`**에 둔다. 서버 시크릿을
  이 파일에 복사하면 앱 번들에 노출되므로 금지한다.
- **운영에는 `.env` 파일이 가지 않는다.** 값은 배포 플랫폼의 시크릿에서 주입된다
  ([`docs/decisions/env-management.md`](docs/decisions/env-management.md)). 그래서 새 변수를 쓸 때
  "로컬에서 되니까 됐다"가 아니라 운영에서 누가 주입하는지를 같이 정해야 한다.
- 환경변수의 원천은 [`apps/api/src/env-spec.ts`](apps/api/src/env-spec.ts)다. 새 변수를 읽기
  시작하면 **여기부터** 선언하고 [`.env.example`](.env.example)에도 공개 가능한 예시를 넣는다.
  빠뜨리면 `apps/api/test/env-spec.test.ts`가 실패한다.
- 로컬 인프라·명령·트러블슈팅은 [`ONBOARDING.md`](ONBOARDING.md)를 본다.
- 스키마 변경을 pull한 뒤에는 `npm run db:generate`가 필수다. 빼먹으면 낡은 Prisma 클라이언트가
  새 컬럼을 몰라 API가 500을 낸다. 테스트는 global setup의 `assertPrismaClientFresh()`
  (`apps/api/test/setup/assert-prisma-client-fresh.ts`)가 먼저 멈추고 이 명령을 알려 준다.

## 테스트

- **테스트는 반드시 `npm test -w apps/api` (또는 루트 `npm test`)로 실행한다.**
  다른 디렉터리에서 `npx vitest`를 돌리면 `apps/api/vitest.config.ts`가 로드되지 않아 `setupFiles`가
  적용되지 않고, `DATABASE_URL`이 **개발 DB**를 가리킨 채 테스트의 `TRUNCATE`가 실행될 수 있다.
  실제로 이 경로로 개발 DB 시드가 삭제된 사고가 있었다. 지금은 `assertTestDatabase()`가 막지만
  애초에 그러지 말 것.
- 통합 테스트는 실제 Postgres/Redis/MinIO를 사용하고 `snaply_test` DB를 자동 생성한다.
- 기존 기대값을 "제한 없음" 같은 현행 동작으로 고정한 테스트가 있다. 정책을 되돌릴 때 함께
  복원해야 하므로, 그런 고정에는 되돌릴 기대값을 주석으로 남긴다.

## 문서 갱신 의무

아래 표의 왼쪽을 바꾸는 변경은 오른쪽을 **같은 변경**에서 함께 갱신한다. 동작 계약(사용자가
관찰하는 동작·API 계약·정책 값)은 [constitution](docs/constitution.md) 제1조·제3조가, 나머지는
원천이 낡지 않게 하는 제2조가 근거다. 어디를 고칠지 매번 원칙에서 재조립하지 말고 이 표에서 찾는다.

| 바꾼 것 | 같은 변경에서 갱신할 곳 |
|---|---|
| 사용자 가시 동작·정책 값 | [`docs/specs/`](docs/specs/README.md)의 해당 요구 — **구현보다 먼저** 고친다 |
| 라우트·요청/응답 스키마 | [`packages/shared-types/src/contract/`](packages/shared-types/src/contract/)의 Zod 계약(백엔드 검증·직렬화·Swagger·앱 타입의 원천) · `npm run openapi:write -w apps/api`로 재생성한 [`apps/api/openapi.json`](apps/api/openapi.json) · [`docs/api-spec.md`](docs/api-spec.md)(FE 안내 + WebSocket) · 관련 테스트 |
| 앱(모바일)의 사용자 가시 동작 | [`apps/mobile/docs/features/`](apps/mobile/docs/features/README.md)의 해당 기능 문서 |
| 새 정책·설계 결정, 결정 상태 | [`docs/decisions/`](docs/decisions/)에 배경·기각한 대안과 함께 + [`docs/decisions/README.md`](docs/decisions/README.md) 인덱스 행 |
| DB 스키마 | 마이그레이션(같은 커밋) — pull 한 쪽은 `npm run db:generate` |
| 새 환경변수 | [`apps/api/src/env-spec.ts`](apps/api/src/env-spec.ts) 선언 + [`.env.example`](.env.example) 예시 |
| 명령·로컬 인프라·CI 검사 (루트 `package.json` scripts · `scripts/` · `docker-compose.dev.yml`·`docker-compose.yml` · `.github/workflows/ci.yml`) | [`ONBOARDING.md`](ONBOARDING.md) — §3 절차 · §4 명령 표 · §5 트러블슈팅 |
| 서버 배포 구성 (`docker-compose.aws.yml` · `.github/workflows/deploy.yml` · `deploy/`) | [`docs/deployment-aws.md`](docs/deployment-aws.md) |
| 새 모듈 (모바일 feature·entity·page, API 라우트·서비스, DB 모델, 워커·배치) | [`docs/team.md`](docs/team.md) §1 표의 해당 트랙 칸 |
| 백로그 항목을 끝냄 | [`docs/backlog.md`](docs/backlog.md)에서 "닫은 항목"으로 옮기고 [`docs/progress.md`](docs/progress.md)에 검증 결과를 기록 |

- 미결 작업은 [`docs/backlog.md`](docs/backlog.md)에만 기록한다. 결정 문서·진행 기록에 미결
  체크리스트를 새로 만들지 않는다 — 여러 곳에 있으면 하나를 닫아도 나머지가 낡는다.
- [`docs/archive/`](docs/archive/)의 문서는 지난 기록이다. **판단 근거로 인용하지 말고,
  archive로 옮기는 시점에 붙이는 상단 상태 배너 외에는 수정하지 않는다.**

## 문서 컨벤션

문서의 위치는 **수명**으로 결정한다 — 계속 갱신되는 현행 문서는 `docs/` 직하(최상위 원칙은
[`docs/constitution.md`](docs/constitution.md), 제품 요구는 [`docs/specs/`](docs/specs/README.md)),
한 시점에 굳는 기록은 `decisions/`·`plans/`·`meetings/`, 수명이 끝나면 상태 배너를 붙여
`archive/`로 옮긴다. 파일명은 kebab-case 소문자다.

문서를 **새로 만들거나 옮기기 전에** [`docs/doc-conventions.md`](docs/doc-conventions.md)를
읽는다 — 배치 표, 이름 규칙, 새 문서 헤더 양식, "절 하나로 끝나면 새 파일을 만들지 않는다"
기준이 거기에 있다.

## 코드 컨벤션

| 항목 | 규칙 |
|---|---|
| 파일명 | kebab-case (`edit-job.ts`, `fcm.service.ts`) |
| 함수/변수 | camelCase |
| 클래스/타입/인터페이스 | PascalCase |
| 상수 | UPPER_SNAKE_CASE |
| API 응답 | 항상 `{ success, data }` 또는 `{ success, error }` — 계약의 `apiSuccess`·`apiErrorSchema`(`packages/shared-types/src/contract/common.ts`) |
| 에러 처리 | 요청 처리 중 오류는 커스텀 에러 `AppError`(`apps/api/src/lib/errors.ts`)로 던지고 `app.ts`의 전역 에러 핸들러가 응답으로 바꾼다(5xx는 Sentry로 보고). 삼키는 예외는 try-catch에서 `captureException`(`apps/api/src/lib/sentry.ts`)으로 보고한다. Python 워커는 각 워커의 `_capture()`(`sentry_sdk.capture_exception`) |
| 로깅 (Python) | loguru 사용, `print` 금지 |

## 공유 파일

`config.ts`, `app.ts`, `schema.prisma`, `packages/shared-types`는 두 트랙이 함께 건드리는
파일이라 별도 규칙이 있다 — [`docs/team.md`](docs/team.md) §2. 특히 `app.ts`에서
**에러/404 핸들러는 라우트 등록보다 앞**이라는 순서를 바꾸지 않는다.

## 커밋

사용자가 커밋을 요청한 경우 먼저 [`docs/commit-guidelines.md`](docs/commit-guidelines.md)를 읽고 따른다 — 제목의
type·scope, 커밋을 나누는 기준, 스테이징과 확인 절차, 체크리스트가 거기 있다. 여기에는 그 문서를 열기 전에도
지켜야 하는 것만 둔다.

- 제목은 저장소 이력과 같은 Conventional Commits 형식 — `<type>(<scope>): <영문 요약>` 또는 `<type>: <영문 요약>`.
  명령형 현재 시제의 간결한 영어로 쓰고 마침표를 붙이지 않는다(예: `feat(api): add Supabase login to Swagger`).
- 커밋할 경로를 명시해 스테이징한다. 전체 파일을 한꺼번에 스테이징하지 않는다.
- `.env`, API 키, 토큰, 비밀번호와 다른 비밀값은 커밋하지 않는다. 공개 가능한 예시만 `.env.example`에 둔다.
- 사용자의 별도 요청 없이 기존 커밋을 amend, squash, rebase하거나 원격으로 push하지 않는다.

## Pull Request

- 사용자가 PR 생성을 요청한 경우 먼저 [`docs/pull-request-guidelines.md`](docs/pull-request-guidelines.md)를 읽고 따른다.
- PR 본문에는 실제 변경 범위와 실행한 검증만 기록하며, 실행하지 않은 검증을 통과한 것으로 표시하지 않는다.
- 별도 요청이 없으면 PR은 Draft로 생성하고, 생성 후 링크와 검증 결과를 사용자에게 알린다.
