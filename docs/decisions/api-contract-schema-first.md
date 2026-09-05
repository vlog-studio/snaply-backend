# API 계약을 스키마 우선으로 — Zod 계약 패키지

**작성일**: 2026-09-05
**상태**: 결정 — API 계약의 원천을 `packages/shared-types`의 Zod 스키마 하나로 통일하고,
백엔드 검증·직렬화·OpenAPI와 모바일 타입·런타임 검증을 모두 그 스키마에서 유도한다.
§4의 5단계는 2026-09-05에 구현됐다(검증 내역은 [progress.md](../progress.md)). 모바일의 런타임
검증을 계약 스키마의 파생으로 바꾸는 일은 [backlog.md](../backlog.md) B-5 후속으로 남았다.
**범위**: 결정과 근거, 기각한 대안, 이행 단계의 형태를 기록한다. 단계별 진행 상태는
[backlog.md](../backlog.md) B-5가 관리한다.
**관련 문서**: [constitution.md](../constitution.md) 제2조·제6조 ·
[api-spec.md](../api-spec.md) · [team.md](../team.md) §2 ·
[apps/mobile/docs/workflows/openapi-api-integration.md](../../apps/mobile/docs/workflows/openapi-api-integration.md)

---

## 1. 결정 요약

| 항목 | 결정 |
|---|---|
| 계약의 원천 | `packages/shared-types`의 **Zod 스키마**. 요청(body·query·params)·응답 `data`·에러 바디 전부 |
| 백엔드 | `fastify-type-provider-zod`로 요청 검증·응답 직렬화·OpenAPI 변환. 수기 JSON 스키마(`schemas/responses.ts`)와 라우트 안의 요청 인터페이스는 폐기 |
| TS 타입 | `z.infer`로 유도. `domain.ts`의 수기 인터페이스 중 와이어 계약에 해당하는 것은 스키마 유도 타입으로 대체 |
| 모바일 | 계약 패키지를 직접 import. `openapi-typescript`·`schema.d.ts`·`api:pull`/`api:gen`/`api:check` 폐기. 엔티티 경계의 Zod는 계약 스키마의 **파생**(`.pick()`, enum 완화)으로만 쓴다 |
| OpenAPI | 여전히 생성한다(Swagger UI·Postman·워커·외부 소비자용). 커밋된 스펙 스냅샷과 생성 결과의 일치를 백엔드 테스트가 검사한다 |
| 선행 조건 | **Fastify 5 업그레이드**. Zod 4를 받는 type provider가 Fastify ≥5.5·`@fastify/swagger` ≥9.5를 요구한다 |
| `api-spec.md` | WebSocket 계약과 FE 안내문만 남기고 엔드포인트 스키마 서술은 Swagger로 위임 |

## 2. 배경 — 한 사실이 여섯 번 적혀 있다

2026-09-05 기준으로 하나의 엔드포인트 계약이 다음 여섯 곳에 각각 손으로 적힌다.

1. `packages/shared-types/src/domain.ts` — 응답 도메인 타입(TS 인터페이스)
2. `apps/api/src/schemas/responses.ts` — 응답 JSON 스키마 770줄. **실제 와이어 계약**이다.
   Fastify가 이 스키마로 직렬화하고 `additionalProperties: false`가 미선언 필드를 지운다
3. `apps/api/src/routes/*.ts` — 요청 body·query의 로컬 인터페이스 12개와 인라인 JSON 스키마
4. `apps/mobile/docs/api/openapi.json` + `src/shared/api/schema.d.ts` — 실행 중인 서버의
   `/docs/json`을 curl로 받아 커밋한 스냅샷과 그 생성 타입 5,300여 줄
5. `apps/mobile/src/**/api/*.ts` — 엔티티 경계의 Zod 스키마 23개
6. `docs/api-spec.md` — FE 전달용 수동 문서 599줄

1과 2의 일치를 검사하는 것은 없다. 실제로 `VideoStatus`에는 `deleted`가 있으나
`VIDEO_SCHEMA`의 enum에는 없다. 4는 서버를 띄워야 갱신되고, 커밋된 스냅샷이 현재
백엔드와 같은지 CI가 검사하지 않는다(2026-09-05 오프라인 생성으로 대조한 결과 우연히
동일했다). 이 상태는 [constitution.md](../constitution.md) 제2조 "각 사실의 원천은 한 곳"에
정면으로 어긋난다.

모노레포에 두 앱을 같이 둔 이유가 계약을 import로 닿게 하고 어긋남을 컴파일러가 잡게
하려는 것인데, 현재는 마이크로서비스 사이에서나 쓰는 HTTP 추출 절차를 쓰고 있다.

## 3. 기각한 대안

| 대안 | 기각 이유 |
|---|---|
| **지금의 `shared-types` 타입을 모바일이 그대로 import** | 원천이 뒤바뀐다. shared-types는 아무도 검증하지 않는 사본이라 §2의 `deleted` 같은 불일치가 앱 타입으로 흘러간다. 경로·메서드·요청 계약이 없어 엔드포인트 맵을 손으로 하나 더 써야 한다. 런타임 검증이 없어 모바일 Zod 중복도 남는다 |
| **OpenAPI 유지 + 스펙만 오프라인 생성** | curl 절차는 사라지지만 사본은 하나도 줄지 않는다. 응급처치로는 맞고, 그 오프라인 생성 스크립트는 §4의 스냅샷 테스트에 흡수한다 |
| **TypeBox** | Fastify 4에서도 되고 JSON Schema와 동형이라 변환이 없지만, 모바일이 이미 Zod 4로 폼·경계 검증을 하고 있어 두 번째 런타임 검증기를 들이거나 Zod 중복을 남긴다. 한 정의가 다섯 역할(검증·직렬화·OpenAPI·타입·앱 런타임 검증)을 모두 맡는 것은 Zod만 가능하다 |
| **풀 코드젠(orval 등)** | 모바일 워크플로우 문서가 이미 기각했다. FSD 슬라이스를 무시하는 평면 출력, DTO의 앱 전역 노출, `queryOptions` 팩토리 우회 |

## 4. 이행 단계

각 단계가 CI를 깨지 않고 따로 머지되도록 잡았다. 진행 상태와 체크리스트는
[backlog.md](../backlog.md) B-5에만 둔다.

1. Fastify 5와 플러그인(`@fastify/rate-limit`·`swagger`·`swagger-ui`·`websocket`·`fastify-plugin`) 메이저 업. 계약과 무관하게 독립 가치가 있다
2. `responses.ts`와 라우트의 요청 인터페이스를 Zod 스키마로 `packages/shared-types`에 이전.
   **한 변경에서 전부 옮긴다** — `fastify-type-provider-zod`의 컴파일러는 Zod 전용이라 한 앱 안에서
   JSON Schema 라우트와 섞을 수 없다(결정 시점에 확인). 리뷰는 라우트 파일 단위로 한다.
   기존 OpenAPI 파이프라인은 스키마의 원천만 바뀐 채 그대로 동작한다
3. 백엔드에 OpenAPI 스냅샷 테스트. `buildApp` 후 `app.swagger()`로 생성한 스펙이
   커밋된 파일과 같아야 통과. 스펙 파일의 위치는 `apps/api/openapi.json` 하나로 옮긴다
4. 모바일이 계약 패키지를 import. `apiRequest`의 `paths` 의존을 패키지가 export하는
   라우트 맵으로 교체하고 `openapi-typescript`와 pull·gen·check 스크립트 제거
5. `api-spec.md` 축소

## 5. 이전 중 드러난 불일치 (2단계, 2026-09-05)

수기 JSON 스키마가 `additionalProperties: false`로 조용히 지우던 것들이 Zod 직렬화에서는
계약 위반으로 드러난다. 2단계에서 계약을 **실제 의도**에 맞춰 고친 것:

- `POST /sns/{platform}/upload` — `status`가 `success`만 허용돼 있었으나 서비스는 `pending`도
  낸다(틱톡 폴링 시한 초과). `requiresUserAction`은 `api-spec.md`가 안내하는 필드인데 스키마에
  없어 **앱에 도달한 적이 없었다.** 둘 다 계약에 넣었다
- `GET /billing/credits` — `entries[].reason`이 서비스 DTO에서 `string`이었다. 계약의 닫힌
  집합(`creditReasonSchema`)으로 좁혔다
- SNS 라우트는 플랫폼별 리터럴 경로 8개에서 `{platform}` 경로 파라미터 4개로 합쳤다.
  알 수 없는 플랫폼은 404가 아니라 400이다
- OpenAPI에 `components.schemas`가 생겼다(`.meta({ id })`). 같은 이름의 `*Input` 사본이
  함께 나오는 것은 type provider의 동작이며 소비자에게 무해하다

## 6. 결정 시점에 확인해야 할 것

- Metro가 shared-types의 `.js` 확장자 specifier를 해석하는지. 안 되면 `react-native` export
  조건으로 `src`를 가리키거나 빌드 산출물을 쓴다. 모바일 `verify`가 turbo를 우회하므로
  `^build` 의존도 같이 정한다
- Zod 직렬화는 `fast-json-stringify`보다 느리다. 현재 규모에서 문제는 아니라고 보나
  2단계 전에 응답 크기가 큰 엔드포인트(`GET /videos`, 추천 결과)로 한 번 재본다
- 라우트 맵의 형태. 경로·메서드에서 요청·응답 스키마를 찾는 맵을 패키지가 export해야
  모바일의 컴파일 타임 경로·query·body 검사가 유지된다. 4단계의 핵심 설계다
- 모바일의 "소비하는 필드만 검증, 모르는 enum은 통과"는 유지한다. 계약 스키마에서
  `.pick()`으로 좁히고 enum은 `z.string()`으로 넓힌 파생 스키마를 엔티티 경계에 둔다.
  정의는 하나이고 앱은 그 위에서 관대해지는 방향으로만 갈라진다
