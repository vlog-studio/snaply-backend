# 연동/수익화 트랙 인수인계 — Dev A 확인 필요 사항

> 2026-08-10, Dev B. `feat/integrations/hardening` 을 `main` 에 머지하면서
> **Dev A 의 코드·전제를 건드린 부분**만 모았다. TEAM.md 의 리뷰 절차를 거치지 않고
> 머지했으므로, 아래 4건은 확인이 필요하다.
>
> 전체 변경 내역은 [PROGRESS.md](./PROGRESS.md), 남은 작업은 [integrations-backlog.md](./integrations-backlog.md).

---

## 1. SNS 업로드에는 `S3_PUBLIC_ENDPOINT` 가 필요하다

**무엇이 바뀌었나**

`services/sns.service.ts` 의 영상 URL 획득은 Dev A 가 도입한 presigned 방식
(`editedS3Key` → `createDownloadUrl`)을 그대로 채택했다. 영상이 world-readable 이 되지 않아
운영에 더 맞다. 다만 그 URL 을 **플랫폼 서버가 직접 내려받는다**는 제약이 추가로 걸린다.

병합 과정에서 가드 위치를 한 곳 옮겼다:

```ts
// 변경 전 — editedUrl 을 검사한다. s3Key 만 있는 영상에서는 null 을 검사하게 된다.
assertPubliclyFetchable(video.editedUrl, params.platform);
const videoUrl = video.editedS3Key ? await createDownloadUrl(...) : video.editedUrl;

// 변경 후 — 최종적으로 플랫폼에 넘길 URL 을 검사한다.
const videoUrl = video.editedS3Key ? await createDownloadUrl(...) : video.editedUrl;
assertPubliclyFetchable(videoUrl, params.platform);
```

**왜 설정이 필요한가**

`createDownloadUrl` 은 `publicEndpoint ?? endpoint` 로 presign 한다. 로컬에서
`S3_PUBLIC_ENDPOINT` 를 비워두면 URL 이 `http://localhost:9100/...` 로 생성되고,
가드가 **400 으로 막는다.**

이건 버그가 아니라 의도된 동작이다. 인스타·틱톡 서버도 `localhost` 에는 도달할 수 없어서,
가드가 없으면 플랫폼 쪽에서 원인 불명 에러로 실패한다(실제로 겪었다).

**로컬에서 SNS 실업로드를 검증하려면**

```bash
cloudflared tunnel --url http://localhost:9100     # → https://<B>.trycloudflare.com
# apps/api/.env
S3_PUBLIC_ENDPOINT=https://<B>.trycloudflare.com
```

가드가 거부하는 조건 (`services/sns.service.ts` 의 `assertPubliclyFetchable`):
- `localhost`, `*.local`, `*.internal`, `10.x`, `127.x`, `192.168.x`, `172.16~31.x`, `169.254.x`
- `https` 가 아닌 경우

**확인 부탁**: 가드 위치가 맞는지, 그리고 `S3_PUBLIC_ENDPOINT` 미설정 시 400 으로 막는 동작이
의도에 맞는지. 미설정 상태를 "SNS 업로드 비활성"으로 볼지, 아니면 기동 시 경고를 띄울지도 판단이 필요하다.

---

## 2. 테스트는 반드시 `apps/api` 기준으로 실행한다

```bash
npm test -w apps/api        # ✅
cd apps/api && npm test     # ✅
npx vitest                  # ❌ 레포 루트에서 실행하면 위험
```

**왜 위험한가**

`apps/api/vitest.config.ts` 가 로드되지 않으면 `setupFiles` 가 건너뛰어진다. 그러면
`DATABASE_URL` 이 테스트 DB(`snaply_test`)가 아니라 **개발 DB(`snaply`)** 를 가리킨 채
`resetDb()` 의 `TRUNCATE` 가 돈다.

**이 경로로 실제 사고가 났다.** 개발 DB 의 시드 위치 50개가 날아갔고
`npm run db:seed` 로 복구했다. 공유 Supabase 에 붙은 상태였다면 팀 데이터가 날아갔을 것이다.

**넣어둔 가드**

`test/helpers/harness.ts` 의 `assertTestDatabase()` 가 TRUNCATE 전에
`SELECT current_database()` 를 확인하고, 테스트 DB 가 아니면 예외를 던진다.
회귀 테스트는 `test/harness-safety.test.ts` (앱 테이블이 없는 `postgres` DB 로 붙여서,
가드가 깨져도 아무것도 지워지지 않게 설계).

**추가로 알아둘 것 — 테스트 격리**

Vitest 가 `apps/api/.env` 를 `process.env` 에 주입하고, `@prisma/client` import 가
dotenv 로 `.env` 를 **다시** 읽는다. dotenv 는 기존 값은 덮지 않지만 *지워진* 값은 채우므로,
setupFiles 에서 한 번 지우는 것으로는 개인 `.env` 오염을 막을 수 없다.
→ `test/setup/hermetic.ts` 가 setupFiles 와 `createHarness()` **두 지점**에서 정리한다.

호출 시점에 읽는 값(`TIKTOK_SCOPES` 등)은 "지우기"로 막을 수 없어
`test/setup/env.ts` 에서 기본값을 명시적으로 박아둔다.

**테스트 스크립트**

```json
"test": "vitest run && tsc -p tsconfig.json && node --test --experimental-test-isolation=none test/storage.service.test.mjs"
```

vitest(통합 148개)와 Dev A 의 node:test 를 모두 실행한다.
node:test 가 `dist/` 를 import 하므로 **그 앞의 `tsc` 빌드 단계를 지워선 안 된다**
(병합 때 한 번 빠뜨려 깨졌다).

---

## 3. 인스타 게시에서 `platformUserId` 전달을 제거했다

**무엇이 바뀌었나**

```ts
// 변경 전
await instagram.uploadReel(pc, {
  accessToken,
  platformUserId: connection.platformUserId ?? '',   // ← 제거
  videoUrl,
  caption,
});
```

게시 경로도 `/{ig-user-id}/media` → **`/me/media`** 로 바꿨다.

**왜인가 — user_id 정밀도 손실**

Instagram user_id 는 `27899354646370752` 처럼 **2^53 을 넘고 응답에서 JSON 숫자로** 온다.
`JSON.parse` 를 거치면 값이 바뀐다:

```
JSON 원문       : 27899354646370752
JSON.parse 결과 : 27899354646370750     ← 부동소수점 정밀도 손실
```

그 ID 로 게시를 시도하면 Meta 가 거부한다. **실측 확인:**

```
POST /{27899354646370750}/media → 400 "Object with ID ... does not exist"
POST /{27899354646370752}/media → 200
POST /me/media                  → 200
```

**두 가지로 대응했다**

1. 토큰 응답을 **텍스트로 먼저 받아** 정규식으로 `user_id` 를 문자열 추출(정밀도 보존).
   `services/sns/instagram.client.ts` 의 `extractUserId()`.
2. 게시 경로를 `/me/media` 로 변경 — 토큰이 계정을 특정하므로 ID 불일치 위험이 아예 없다.

**효과가 입증된 방식**: 저장된 `platform_user_id` 가 정밀도 깨진 값(`...750`)인 상태에서도
실제 릴스 게시가 성공했다 (https://www.instagram.com/reel/DbnYK8qiXxg/).

회귀 테스트: `test/sns-realkey.test.ts` 의 "user_id 정밀도" 블록.

**주의**: 큰 정수를 JSON 으로 받는 다른 곳에도 같은 함정이 있다.
`sns_connections.platform_user_id` 는 문자열 컬럼이지만, 값이 이미 깨진 채 저장된 행이 있을 수 있다.
재연동하면 정확한 값으로 갱신된다.

---

## 4. CI 에 통합 테스트 잡을 추가했다 (Dev A 영역)

`ci.yml` 이 build/typecheck/lint 만 돌리고 있어서 **통합 테스트 148개가 PR 에서
한 번도 실행되지 않았다.** 안전망을 만들어도 CI 가 안 돌리면 회귀를 못 잡는다.

`api-tests` 잡을 추가했다:
- Postgres·Redis **서비스 컨테이너만** 띄운다. MinIO 는 불필요하다 —
  S3 를 실제 호출하는 테스트가 없고, Dev A 의 `storage.service.test.mjs` 도
  presign URL 문자열만 검증한다(네트워크 미사용).
- `npm test -w apps/api` 로 실행한다(§2 의 이유로 위치가 중요하다).
- `.env` 없이·MinIO 없이 **148/148 + node:test 1/1** 통과를 로컬에서 재현 검증했다.

**확인 부탁**: `ci.yml` 은 TEAM.md 상 Dev A 영역이다. 서비스 컨테이너 구성과
잡 분리 방식(별도 잡 vs 기존 node 잡에 통합)에 대한 의견을 주시면 맞추겠다.
실행 시간은 로컬 기준 테스트만 ~20초, 전체 잡은 npm ci 포함 2~3분 예상.

## 그 외 공유 surface 변경

| 파일 | 변경 |
|---|---|
| `src/app.ts` | 전역 rate limit 상한을 `RATE_LIMIT_GLOBAL_MAX` 로 조정 가능화 / `/billing/webhook` 을 제한에서 제외 / `legalRoutes`·`snsWebhookRoutes` 등록 |
| `src/config.ts` | `STRIPE_MOCK` 을 `SNS_MOCK` 에서 분리 (기존엔 하나로 묶여 "SNS 는 mock, Stripe 만 실키" 조합이 불가능했다) / `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` |
| `apps/api/package.json` | 테스트 러너 공존 (위 §2), 진단 스크립트 5개 추가 |
| `.gitignore` | 크리덴셜 파일 패턴 (`*firebase-adminsdk*.json`, `*service-account*.json`, `*.pem`, `*.p8`, `*.p12`) |
| `docker-compose.dev.yml` | 로컬 Postgres 추가 (TEAM.md §4 옵션 A) |
| `prisma/schema.prisma` | `subscriptions.last_stripe_event_at` (웹훅 순서 보정), `sns_uploads.error_message` (업로드 실패 사유) |

## 새로 생긴 명령

| 명령 | 용도 |
|---|---|
| `npm run auth:stub -w apps/api` | Supabase 없이 로컬 JWT 발급 (ES256+JWKS 스텁). `plugins/auth.ts` 무수정 |
| `npm run dev:public-bucket -w apps/api` | 개발 버킷 익명 읽기 정책. `S3_ENDPOINT` 없으면 실행 거부(실 AWS 사고 방지) |
| `npm run ig:probe -w apps/api` | 저장된 실토큰으로 인스타 호스트·메서드·버전 조합 진단 |
| `npm run ig:publish-probe -w apps/api` | 게시 경로(`/me` vs ID) 유효성 판별 |
| `npm run ig:container-probe -w apps/api -- <url>` | 컨테이너 처리까지만 확인 (**게시 안 함**) |
| `./apps/api/scripts/dev-tunnel.sh <도메인>` | 고정 주소 개발 터널 (Cloudflare 도메인 필요) |
