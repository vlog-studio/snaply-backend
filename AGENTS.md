# Repository instructions

이 지침은 저장소 전체에 적용된다.

## 커밋

- 사용자가 커밋을 요청한 경우 먼저 [`docs/COMMIT_GUIDELINES.md`](docs/COMMIT_GUIDELINES.md)를 읽고 따른다.
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
