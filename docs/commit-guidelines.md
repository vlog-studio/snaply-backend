# 커밋 지침

이 문서는 Snaply 통합 모노레포에서 일관된 커밋을 만들기 위한 기준이다. 최근 이력에서
사용 중인 Conventional Commits 스타일을 유지하며, 각 커밋이 독립적으로 이해되고
되돌릴 수 있게 만드는 것을 목표로 한다.

## 1. 기본 형식

```text
<type>(<scope>): <summary>
```

scope가 필요하지 않으면 생략한다.

```text
<type>: <summary>
```

예시:

```text
feat(api): add Supabase login to Swagger
fix(ai-worker): handle missing video duration
feat(db): add location seed
chore(api): add Stripe dependency
docs: document local development setup
```

## 2. Type 선택

| Type | 용도 |
|---|---|
| `feat` | 사용자 또는 개발자가 사용할 수 있는 새 기능 |
| `fix` | 잘못된 동작이나 회귀 수정 |
| `refactor` | 외부 동작을 바꾸지 않는 코드 구조 개선 |
| `test` | 테스트 추가·수정만 포함하는 변경 |
| `docs` | 문서와 주석만 변경 |
| `chore` | 의존성, 개발 도구, 설정, 유지보수 작업 |
| `build` | 빌드 시스템이나 패키징 변경 |
| `ci` | CI/CD 워크플로 변경 |
| `perf` | 측정 가능한 성능 개선 |
| `revert` | 기존 커밋 되돌리기 |

새 API 동작을 추가하면서 의존성도 추가하는 경우, 저장소 이력처럼 의존성을
`chore(api)`로 먼저 커밋하고 구현을 `feat(api)`로 분리할 수 있다. 단, 중간 커밋이
빌드 불가능해진다면 의존성과 구현을 하나의 완전한 커밋으로 묶는다.

## 3. Scope 선택

scope는 변경의 주된 소유 영역이 분명할 때 사용한다.

| Scope | 대상 |
|---|---|
| `mobile` | `apps/mobile` Expo/React Native 앱 |
| `api` | `apps/api` Fastify API |
| `ai-worker` | `apps/ai-worker` Python 워커 |
| `db` | Prisma 스키마, 마이그레이션, 시드 |
| `shared-types` | `packages/shared-types` |

저장소 루트 설정이나 여러 영역에 걸친 변경은 scope를 생략한다. 문서만 변경하는
커밋도 현재 이력에 맞춰 보통 `docs:`를 사용한다.

## 4. Summary 작성법

- 명령형 현재 시제의 영어로 작성한다: `add`, `fix`, `remove`, `document`.
- 첫 단어는 소문자로 시작하되 `Swagger`, `Supabase`, `OpenAPI` 같은 고유 명칭은
  정상 표기를 유지한다.
- 마침표를 붙이지 않는다.
- 무엇이 바뀌었는지 구체적으로 적고 `update code`, `misc changes`, `WIP`처럼 모호한
  표현을 피한다.
- 가능하면 한 줄에서 읽히도록 72자 안팎으로 작성한다.

좋은 예:

```text
feat(api): serve OpenAPI docs at /docs
fix(api): reject expired billing webhooks
docs: explain local Postgres migration flow
```

피해야 할 예:

```text
update files
feat: changes
WIP
fixed bug.
```

## 5. 변경 분할 기준

한 커밋은 하나의 이유로 되돌릴 수 있어야 한다.

같이 커밋할 항목:

- 기능 구현과 그 기능을 검증하는 테스트
- Prisma 스키마와 그에 대응하는 마이그레이션
- 의존성 선언과 해당 lockfile 변경
- 이름 변경과 그 이름을 사용하는 모든 참조

분리할 항목:

- 기능 구현과 독립적인 문서 보강
- 동작 변경과 관계없는 포맷팅 또는 리팩터링
- 서로 다른 앱이나 기능의 수정
- 배포 설정과 애플리케이션 기능 구현

예를 들어 Swagger의 Supabase 로그인을 추가할 때는 다음처럼 나눌 수 있다.

```text
feat(api): add Supabase login to Swagger
docs: document Swagger Supabase login
```

## 6. Body와 Footer

제목만으로 이유나 제약을 설명하기 어려울 때 본문을 추가한다. 제목 다음에 빈 줄을
두고, 구현 세부사항보다 변경 이유와 중요한 판단을 적는다.

```text
fix(api): use IPv4 loopback for local Postgres

Docker Desktop exposes the development database on IPv4, while localhost may
resolve to ::1 on Windows.
```

호환성을 깨는 변경은 `!`와 `BREAKING CHANGE:` footer로 표시한다.

```text
feat(api)!: replace legacy auth token format

BREAKING CHANGE: clients must send Supabase access tokens as bearer tokens.
```

이슈가 있다면 footer에 연결한다.

```text
Closes #123
```

## 7. 커밋 절차

1. 현재 브랜치와 변경 범위를 확인한다.

   ```bash
   git branch --show-current
   git status --short
   git diff
   ```

2. 변경에 맞는 검증을 실행한다.

   ```bash
   npm run typecheck
   npm run lint
   npm run build
   ```

   전체 검증이 과도하면 변경된 workspace의 관련 명령을 실행하고 그 범위를 기록한다.
   API 코드를 바꿨다면 관련 테스트도 실행한다 — 반드시 `npm test -w apps/api`
   (다른 형태로 실행하지 않는다, [AGENTS.md](../AGENTS.md) §테스트).
   모바일은 `npm run verify:mobile`.

3. 커밋 목적에 해당하는 파일만 명시적으로 스테이징한다.

   ```bash
   git add -- apps/api/src/app.ts apps/api/src/plugins/swagger.ts
   ```

4. 스테이징 결과를 확인한다.

   ```bash
   git diff --cached --check
   git diff --cached
   ```

5. 저장소 형식에 맞춰 커밋한다.

   ```bash
   git commit -m "feat(api): add Supabase login to Swagger"
   ```

6. 커밋 후 남은 변경과 커밋 순서를 확인한다.

   ```bash
   git status --short
   git log -3 --oneline
   ```

## 8. 커밋 전 체크리스트

- [ ] 커밋 하나가 하나의 변경 목적만 설명한다.
- [ ] type과 scope가 실제 변경 영역과 맞는다.
- [ ] 제목이 명령형 영어이고 구체적이며 마침표가 없다.
- [ ] 관련 테스트, 타입 검사, 린트 또는 빌드를 실행했다.
- [ ] `git diff --cached --check`가 통과한다.
- [ ] `.env`, 토큰, API 키, 비밀번호가 포함되지 않았다.
- [ ] 디버그 로그와 임시 파일, 생성된 빌드 산출물이 포함되지 않았다.
- [ ] 사용자가 만든 관련 없는 변경을 함께 스테이징하지 않았다.
