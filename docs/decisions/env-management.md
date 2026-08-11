# 환경변수 관리 — 파일은 로컬만, 운영은 주입

**작성일**: 2026-08-11
**상태**: 결정 (구현 완료)
**원천**: 환경변수의 위치·주입 경로·목록 관리 방식은 이 문서가 원천이다.
변수 하나하나의 목록은 [`apps/api/src/env-spec.ts`](../../apps/api/src/env-spec.ts),
사람이 복사해 쓰는 표현은 [`.env.example`](../../.env.example).

관련: [ONBOARDING.md](../../ONBOARDING.md) §3-2 · [backlog.md](../backlog.md) B-1(배포 인프라)

---

## 결정

1. **로컬 개발용 `.env` 는 저장소에 하나만 둔다 — `apps/api/.env`.**
2. **운영은 파일을 쓰지 않는다.** 값은 배포 플랫폼의 시크릿에서 프로세스 환경변수로 주입된다.
3. **`docker-compose.yml` 로 컨테이너 테스트 서버를 띄우는 것을 1급 시나리오로 지원한다.**
   compose 는 `apps/api/.env` 를 `env_file` 로 읽고, 인프라 주소는 `environment` 로 덮는다.
4. **변수 목록의 단일 원천은 `apps/api/src/env-spec.ts` 다.** `.env.example`·코드와 어긋나면
   [`test/env-spec.test.ts`](../../apps/api/test/env-spec.test.ts) 가 실패한다.
5. **위험한 기본값은 닫히는 쪽으로 떨어뜨린다.** Swagger·개발 로그인은 `NODE_ENV === 'development'`
   일 때만 열린다.

## 배경 — 무엇이 문제였나

`.env` 가 세 곳으로 갈라져 있었다.

| 위치 | 읽는 주체 | 상태 |
|---|---|---|
| `apps/api/.env` | API 서버, Prisma CLI, `--env-file` 스크립트, 루트 e2e 스크립트 | 문서에 명시된 원천 |
| 루트 `.env` | `docker compose` 의 `${VAR}` 보간 | **어느 문서에도 없음.** `apps/api/.env` 와 바이트 단위로 동일한 사본이었다 |
| `apps/ai-worker/.env` | AI 워커 | ONBOARDING 이 `cp` 로 만들라고 지시 — 세 번째 사본 |

[AGENTS.md](../../AGENTS.md) 는 "루트에 두면 동작하지 않는다"고 단언했지만 compose 관점에서는 사실이
아니었다. 루트 `.env` 가 없으면 `SUPABASE_URL` 이 fallback(`https://example.supabase.co`)으로 떨어져
**JWKS 조회가 실패하고 인증이 전부 죽는다.** `/health` 는 200 이라 겉으로는 정상으로 보인다.

즉 문서에 없는 파일이 테스트 서버를 조용히 떠받치고 있었고, 사본 3개는 동기화가 깨져도
아무도 알 수 없는 구조였다.

## 왜 운영에서 파일을 쓰지 않는가

- 이미지에 비밀값이 굳는다. GHCR 에 푸시되고 레이어 히스토리에 남아 나중에 지워도 소용없다.
- 값 하나 바꾸려면 재빌드·재푸시·재배포가 필요하다. 주입이면 시크릿 갱신 후 재시작으로 끝난다.
- staging 과 production 이 같은 이미지를 쓸 수 없게 된다. "테스트한 그 이미지가 그대로 간다"가 깨진다.
- 시크릿 스토어는 접근 통제와 감사 기록을 제공한다. 노트북의 파일은 아무것도 하지 않는다.

[`.dockerignore`](../../.dockerignore) 가 `**/.env` 를 제외하고,
[`env.ts`](../../apps/api/src/env.ts) 가 파일이 없으면 건너뛰므로 코드는 이미 이 모델을 따르고 있었다.
문서와 파일 배치만 따라오지 못한 상태였다.

## 구현

### compose 의 2계층

```yaml
env_file:
  - path: apps/api/.env      # 개인 자격증명(Supabase·Stripe·SNS)의 베이스
    required: false
environment:
  DATABASE_URL: postgresql://postgres:postgres@postgres:5432/snaply   # 인프라는 덮는다
  CLOUDFRONT_DOMAIN: ""
  SNS_MOCK: "true"
  STRIPE_MOCK: "true"
```

compose 규격상 `environment` 가 `env_file` 보다 우선한다. 그래서 개인 `.env` 의 `localhost:9100`
같은 로컬 주소가 컨테이너 네트워크 주소를 덮지 않는다.

**테스트 서버는 기본 mock 이다.** `env_file` 로 실키가 들어오지만 `SNS_MOCK`·`STRIPE_MOCK` 이
외부 호출을 막는다. 잠깐 띄운 서버가 실제 Stripe·Instagram 을 호출하면 안 되기 때문이다.
실키 경로를 확인할 때만 해당 줄을 지운다. 테스트 하네스의
[hermetic.ts](../../apps/api/test/setup/hermetic.ts) 와 같은 원칙이다.

`CLOUDFRONT_DOMAIN: ""` 은 미디어 공개 URL 이 이 스택의 MinIO 를 가리키게 하기 위한 것이다.

### `NODE_ENV` 판정 반전

```
이전:  NODE_ENV !== 'production'   → 미주입·오타 시 Swagger·개발 로그인이 열림
현재:  NODE_ENV === 'development'  → 미주입·오타 시 닫힘
```

운영은 주입 모델이라 변수 하나를 빠뜨려도 **배포는 성공한다.** `!==` 로 두면 그 사고가
"개발 로그인이 열린 채 운영 기동"으로 끝난다. `requireEnv` 로 필수화하는 방법도 있었지만
로컬·CI 전부에 부담을 주면서 얻는 보호는 같아서, 판정 반전을 택했다.

### 목록의 단일 원천

`env-spec.ts` 가 키·필수여부·`origin`(shared/local/production)·설명을 선언한다.
`requireEnv` 의 인자 타입이 스펙에서 파생된 `RequiredEnvKey` 라서, 스펙에 없는 키를
강제하려 하면 **타입체크에서 걸린다.**

`test/env-spec.test.ts` 가 세 방향을 고정한다.

- 스펙 ↔ `.env.example` 양방향 일치
- `required: true` 인 키는 `.env.example` 에서 주석 처리되어 있지 않다
- `apps/api/src`·`apps/ai-worker/src`·`scripts` 가 읽는 키가 모두 스펙에 선언되어 있다

배포 플랫폼이 정해지면 **`origin !== 'local'` 인 항목이 시크릿 스토어에 넣을 목록**이다.

## 기각한 대안

**`.env` 를 저장소 루트로 통일한다.** `.env.example` 이 루트에 있으니 자연스러워 보였다.
그러나 Prisma CLI 가 cwd(`apps/api`) 기준으로 `.env` 를 찾고 `--env-file=.env` 스크립트 5개도
같은 전제다. 옮기면 `dotenv-cli` 의존성이 필요하고, [`env.ts`](../../apps/api/src/env.ts) 의 경로
계산이 `src/` 와 `dist/` 에서 깊이가 달라져 깨진다. 얻는 것보다 잃는 것이 컸다.

**`NODE_ENV` 를 `requireEnv` 로 필수화한다.** 보호 효과는 판정 반전과 같은데 로컬·테스트·CI
모두가 값을 주입해야 한다. 부담만 늘어 기각했다.

**워커가 자기 `.env` 사본을 계속 갖는다.** `cp apps/api/.env apps/ai-worker/.env` 는 사본을 하나 더
만든다. 대신 [`config.py`](../../apps/ai-worker/src/config.py) 가 `apps/ai-worker/.env` → 없으면
`apps/api/.env` 순으로 찾게 했다. `os.environ.setdefault` 라 주입 우선순위는 그대로다.

## 파서가 서로 다르다 — `.env` 주석 형식 규칙

같은 파일을 세 파서가 읽는데 인라인 주석 처리가 달랐다. `KEY=   # 설명` (빈 값 + 주석)을 넣고
확인한 결과다.

| 파서 | `KEY=   # 설명` | `KEY=val   # 설명` |
|---|---|---|
| Node `--env-file` / `loadEnvFile` | `''` | `val` |
| docker compose `env_file` | **`'# 설명'`** | `val` |
| AI 워커(기존 자체 파서) | **`'# 설명'`** | **`'val   # 설명'`** |

`.env.example` 이 `KEY=            # 설명` 형식을 쓰고 있었으므로, 이걸 복사한 `.env` 를
compose 가 읽으면 `LEGAL_CONTACT_EMAIL`·`SITE_VERIFICATION_META`·`STRIPE_PRICE_*` 등에
**주석 문자열이 값으로 들어간다.** 네이티브 실행에서는 멀쩡하고 컨테이너에서만 달라진다.

두 가지를 고쳤다.

1. `.env.example` 의 모든 설명을 **줄 위로** 옮겼다. `test/env-spec.test.ts` 가
   `KEY=<공백>#` 형식이 다시 들어오면 실패시킨다.
2. 워커 파서가 인라인 주석과 따옴표를 Node 와 같은 규칙으로 처리하게 고쳤다
   (`_parse_value`, [tests/test_config.py](../../apps/ai-worker/tests/test_config.py)).
   값 안의 `pa#ss` 같은 `#` 는 그대로 둔다 — 앞에 공백이 있을 때만 주석으로 본다.

> 이미 만들어 둔 개인 `apps/api/.env` 에는 옛 형식이 남아 있다. compose 로 테스트 서버를
> 띄울 계획이라면 빈 값 뒤의 주석을 줄 위로 옮겨두는 것이 좋다.

## 함께 고친 결함

- `CLOUDFRONT_DOMAIN` 이 빈 문자열이면 공개 URL 이 깨졌다. `config.ts` 가 `??` 를 써서
  빈 문자열이 통과했고, `publicBaseUrl` 이 `''` 가 됐다. compose 가 `${CLOUDFRONT_DOMAIN:-}` 로
  정확히 빈 문자열을 주입하고 있었으므로, 루트 `.env` 에 실제 값이 있어서 가려져 있던 버그다.
  `|| undefined` 로 바꿔 같은 파일의 `S3_ENDPOINT` 처리와 맞췄다.
- `.env.example` 의 `S3_ENDPOINT` 예시가 `http://localhost:9000` 이었다. snaply 는 포트 충돌을 피해
  **9100** 을 쓴다 — 예시대로 복사하면 처음부터 붙지 않았다.
- 코드가 읽지만 `.env.example` 에 없던 변수 12개를 채웠다 (`NODE_ENV`, `API_HOST`, `ENABLE_DOCS`,
  `LOG_LEVEL`, `EDIT_QUEUE_NAME`, `SUPABASE_JWT_AUDIENCE`, `SENTRY_DEBUG`, `WHISPER_MODEL`,
  `EDIT_TIMEOUT_SECONDS`, `BGM_DIR`, `TEST_EMAIL`, `TEST_PASSWORD`).

## 후속 연계

이 결정은 배포 플랫폼을 고르지 않는다. Fly / Render / ECS 어느 쪽이든 위 구조는 유지하며,
플랫폼 선택과 시크릿·Deploy 스텝 연결의 미결 상태는 [backlog.md](../backlog.md) B-1에서만 관리한다.
