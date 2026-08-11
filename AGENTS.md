# Repository instructions

이 지침은 저장소 전체에 적용된다. 문서 지도와 각 주제의 원천은 [`README.md`](README.md)를 본다.

## 작업 환경

- `.env`는 **`apps/api/.env`** 에 둔다. Prisma CLI와 API 서버가 이 위치에서 읽는다. 루트에 두면 동작하지 않는다.
- 환경변수의 원천은 [`.env.example`](.env.example)이다. 새 변수를 추가하면 여기에도 공개 가능한 예시를 넣는다.
- 로컬 인프라·명령·트러블슈팅은 [`ONBOARDING.md`](ONBOARDING.md)를 본다.
- 스키마 변경을 pull한 뒤에는 `npm run db:generate`가 필수다. 빼먹으면 낡은 Prisma 클라이언트가
  새 컬럼을 몰라 테스트가 500으로 실패한다(실제로 웹훅 테스트 13개가 이 이유로 실패한 적 있다).

## 테스트

- **테스트는 반드시 `npm test -w apps/api` (또는 루트 `npm test`)로 실행한다.**
  다른 디렉터리에서 `npx vitest`를 돌리면 `apps/api/vitest.config.ts`가 로드되지 않아 `setupFiles`가
  적용되지 않고, `DATABASE_URL`이 **개발 DB**를 가리킨 채 테스트의 `TRUNCATE`가 실행될 수 있다.
  실제로 이 경로로 개발 DB 시드가 삭제된 사고가 있었다. 지금은 `assertTestDatabase()`가 막지만
  애초에 그러지 말 것.
- 통합 테스트는 실제 Postgres/Redis를 사용하고 `snaply_test` DB를 자동 생성한다.
- 기존 기대값을 "제한 없음" 같은 현행 동작으로 고정한 테스트가 있다. 정책을 되돌릴 때 함께
  복원해야 하므로, 그런 고정에는 되돌릴 기대값을 주석으로 남긴다.

## 문서 갱신 의무

- 라우트·요청/응답 스키마를 바꾸면 [`docs/api-spec.md`](docs/api-spec.md)도 같은 커밋에서 갱신한다.
  Swagger는 코드에서 생성되지만 api-spec은 수동 문서이고 FE 전달용이다.
- 미결 작업은 [`docs/backlog.md`](docs/backlog.md)에만 기록한다. 결정 문서·진행 기록에 미결
  체크리스트를 새로 만들지 않는다 — 여러 곳에 있으면 하나를 닫아도 나머지가 낡는다.
- 완료된 구현·검증은 [`docs/progress.md`](docs/progress.md)에 기록한다.
- 정책·설계 결정은 [`docs/decisions/`](docs/decisions/)에 배경·기각한 대안과 함께 남긴다.
- [`docs/archive/`](docs/archive/)의 문서는 지난 기록이다. **판단 근거로 인용하지 말고, 수정하지 않는다.**

## 문서 컨벤션

### 어디에 두는가 — 문서의 수명으로 결정한다

| 위치 | 담는 것 | 수명 |
|---|---|---|
| 저장소 루트 | 진입점 4개(`README` · `ONBOARDING` · `AGENTS` · `CLAUDE`)만. **늘리지 않는다** | 상시 |
| `docs/` 직하 | 계속 갱신되는 현행 문서 (계약·상태·규칙·절차) | 상시 |
| `docs/decisions/` | 한 시점에 내린 정책·설계 결정. 배경·기각한 대안 포함 | 결정 시점 고정 |
| `docs/plans/` | 착수 전 구현 계획. **제안이며 현행 사실이 아니다** | 구현 시작까지 |
| `docs/meetings/` | 회의 안건과 결과 | 회의 단위 |
| `docs/archive/` | 수명이 끝난 문서 | 보관 |

판단 기준: **"이 문서를 계속 고칠 것인가?"** 계속 고친다면 `docs/` 직하,
한 시점의 기록으로 굳는다면 `decisions/`·`plans/`·`meetings/`.
어느 것도 아니게 되면 `archive/`로 옮기고 상단에 상태 배너를 남긴다(원본은 고치지 않는다).

### 이름

- **kebab-case 소문자 + `.md`** — `api-spec.md`, `commit-guidelines.md`, `snap-source-of-truth.md`.
  저장소 코드 컨벤션(파일명 kebab-case)과 같은 규칙이다.
- 예외는 루트 진입점 4개와 디렉터리 인덱스 `README.md`뿐. 그 밖에 대문자·`UPPER_SNAKE`를 쓰지 않는다.
- 이름은 **주제**로 짓는다. `notes.md`·`temp.md`·`new-doc.md`처럼 내용을 알 수 없는 이름을 쓰지 않는다.
- `docs/meetings/`는 **날짜 접두사**를 쓴다: `YYYY-MM-DD-<주제>.md` (예: `2026-08-14-backend-review.md`).
  아직 날짜가 안 잡힌 예정 회의는 `next-agenda.md`로 두고, 날짜가 정해지면 위 형식으로 rename한다.
- 디렉터리 안내가 필요하면 그 디렉터리의 `README.md`에 쓴다(예: [`docs/archive/README.md`](docs/archive/README.md)).

### 새 문서를 만들기 전에

기존 문서에 절이 하나 늘어나는 것으로 끝나는 내용이면 **새 파일을 만들지 않는다.**
문서를 새로 만들 때는 상단에 ① 작성일 ② 무엇의 원천인지 또는 어떤 상태인지(결정/미결/제안/보관)
③ 관련 문서 링크를 적는다.

## 코드 컨벤션

| 항목 | 규칙 |
|---|---|
| 파일명 | kebab-case (`edit-job.ts`, `fcm.service.ts`) |
| 함수/변수 | camelCase |
| 클래스/타입/인터페이스 | PascalCase |
| 상수 | UPPER_SNAKE_CASE |
| API 응답 | 항상 `{ success, data }` 또는 `{ success, error }` |
| 에러 처리 | try-catch + `Sentry.captureException`, 에러 전파는 커스텀 Error 클래스 |
| 로깅 (Python) | loguru 사용, `print` 금지 |

## 공유 파일

`config.ts`, `app.ts`, `schema.prisma`, `packages/shared-types`는 두 트랙이 함께 건드리는
파일이라 별도 규칙이 있다 — [`docs/team.md`](docs/team.md) §3. 특히 `app.ts`에서
**에러/404 핸들러는 라우트 등록보다 앞**이라는 순서를 바꾸지 않는다.

## 커밋

- 사용자가 커밋을 요청한 경우 먼저 [`docs/commit-guidelines.md`](docs/commit-guidelines.md)를 읽고 따른다.
- 커밋 제목은 저장소 이력과 동일한 Conventional Commits 형식을 사용한다.
  - 형식: `<type>(<scope>): <영문 요약>` 또는 `<type>: <영문 요약>`
  - 예: `feat(api): add Supabase login to Swagger`
  - 예: `docs: document local development setup`
- 제목은 명령형 현재 시제의 간결한 영어로 작성하고 마침표를 붙이지 않는다.
- 한 커밋에는 하나의 독립적인 변경 목적만 담는다. 구현, 문서, 의존성, 리팩터링처럼 되돌리는 이유가 다른 변경은 분리한다.
- 코드와 해당 테스트, 스키마와 해당 마이그레이션, 의존성과 lockfile처럼 함께 있어야 완전한 변경은 같은 커밋에 둔다.
- 전체 파일을 한꺼번에 스테이징하지 말고 커밋 목적에 맞는 경로를 명시적으로 스테이징한다.
- 커밋 전에 `git diff --cached`, `git diff --cached --check`, 관련 테스트를 확인한다.
- `.env`, API 키, 토큰, 비밀번호와 다른 비밀값은 커밋하지 않는다. 공개 가능한 예시만 `.env.example`에 둔다.
- 사용자의 별도 요청 없이 기존 커밋을 amend, squash, rebase하거나 원격으로 push하지 않는다.

## Pull Request

- 사용자가 PR 생성을 요청한 경우 먼저 [`docs/pull-request-guidelines.md`](docs/pull-request-guidelines.md)를 읽고 따른다.
- PR 본문에는 실제 변경 범위와 실행한 검증만 기록하며, 실행하지 않은 검증을 통과한 것으로 표시하지 않는다.
- 별도 요청이 없으면 PR은 Draft로 생성하고, 생성 후 링크와 검증 결과를 사용자에게 알린다.
