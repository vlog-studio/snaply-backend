# 진행 기록 — 연동/수익화 트랙 하드닝 (Dev B, 2026-08-03~08-10)

> **보관 문서** (2026-09-27 이동): [progress.md](../progress.md)에서 분리한 Dev B 연동/수익화 트랙 하드닝
> 기록이다(Phase 1~9 직후 — Phase 1~9 는 [progress-phase-1-9.md](./progress-phase-1-9.md)).
> **완료 시점의 기록이며 이후 뒤집힌 것이 있다** — 아래 "Phase 8 — 결제", "테스트 격리"의 Stripe 키,
> "Stripe 실키 웹훅 end-to-end 검증"은 2026-08-14 Stripe 제거로 모두 무효다(현행 결제는 크레딧+IAP —
> [decisions/payment-channel-iap.md](../decisions/payment-channel-iap.md)). "틱톡 — API 는 성공, 실물 미확인"의
> 미결은 [backlog.md](../backlog.md) C-2, SNS 실측의 현행 기록은 [sns-setup.md](../sns-setup.md)가 원천이다.
> 끝의 "후속 항목의 현행 위치"도 낡았다 — backlog 에 Stripe 항목은 없고, 이후 완료 기록은 그 절의 위에 있다.
> 이동하면서 상대 링크 두 곳(`sns-setup.md`·`backlog.md`)의 경로만 archive 위치에 맞게 고쳤다(그 외 본문 불변).

## 연동/수익화 트랙 하드닝 (Dev B, 2026-08-03)

**배경**: Phase 6~9는 "완료"였지만 검증이 일회성 스크립트로만 이뤄져 레포에 테스트가 없었고,
mock이 가려주던 실키 경로 결함이 남아 있었다. 회귀 안전망을 만들고 그 위에서 결함을 제거했다.

### 통합 테스트 하네스 (신규)

- `vitest` + `apps/api/test/` — **실제 로컬 Postgres/Redis/MinIO** 를 그대로 쓰는 통합 테스트. 84개.
- `apps/api/scripts/auth-stub.ts` — Supabase Auth를 대체하는 **ES256 + JWKS 스텁**.
  `plugins/auth.ts` 는 한 줄도 안 고치고 `SUPABASE_URL` 만 바꿔 붙인다. 실 Supabase 전환은 env 원복이 전부.
  수동 테스트용 CLI 겸용: `npm run auth:stub -w apps/api`
- 개발 DB(`snaply`)와 분리된 `snaply_test` DB를 globalSetup에서 생성·마이그레이션.
- `docker-compose.dev.yml` 에 로컬 Postgres 추가 (team.md §4 옵션 A) — 공유 Supabase 마이그레이션 충돌 회피.

### Phase 6 — 위치/FCM

- **쿨다운 원자성**: `조회 → 발송 → 기록` 이 원자적이지 않았다. 같은 패턴을 격리 재현하면
  10개 동시 요청에서 5건이 중복 기록된다(실서비스 경로에서는 재현되지 않았지만 보장은 없고,
  API 인스턴스가 2개 이상이면 in-process 직렬화가 사라진다).
  → `pg_advisory_xact_lock` 으로 (user, location) 임계구역을 만들어 **선점 → 발송 → 실패 시 보상 삭제** 로 변경.
  발송 실패가 쿨다운을 소모하지 않는 기존 성질은 유지.

### Phase 7 — SNS 연동

실키를 넣는 순간 실패했을 결함들:

- **인스타 컨테이너 처리 대기 누락** — 컨테이너 생성 직후 `media_publish` 를 호출하고 있었다.
  Meta는 `status_code` 가 `FINISHED` 가 될 때까지 폴링해야 한다. → 폴링 추가(기본 10초 간격/5분 한도).
- **API 계열 불일치** — 인증은 구 Basic Display(`api.instagram.com/oauth/authorize`, 2024-12 종료),
  게시는 Graph API 로 섞여 있었다. → **Instagram API with Instagram Login** 으로 통일
  (`www.instagram.com/oauth/authorize` + `graph.instagram.com`, scope `instagram_business_*`).
- **장기 토큰 교환 누락** — 단기(1시간) 토큰을 그대로 저장하고 있었다. → 60일 장기 토큰 교환 추가.
- **account_type 하드코딩** — `'BUSINESS'` 고정이라 PERSONAL 차단이 mock에서만 동작했다. → `/me` 실조회.
- **인스타 토큰 갱신 없음** — `ensureFreshToken` 이 tiktok 만 처리해 60일 뒤 조용히 죽었다.
  → 플랫폼별 갱신 창(틱톡 5분 / 인스타 7일) + 이미 만료 시 재연동 안내 에러.
- **공개 URL 가드** — 인스타·틱톡은 URL을 직접 내려받는데 로컬 MinIO 주소가 그대로 넘어갔다.
  → 사설/로컬 호스트·비 https 를 외부 호출 전에 400으로 차단.

### Phase 8 — 결제

- **STRIPE_MOCK 분리** — Stripe mock 여부가 `SNS_MOCK` 에 묶여 있어 "SNS는 mock, Stripe만 실키" 조합이 불가능했다.
- **웹훅 전역 rate limit 제외** — Stripe 발신 IP가 소수라 이벤트가 몰리면 429 → 재시도가 쌓인다.
- **웹훅 순서 보정** — `subscriptions.last_stripe_event_at` 추가(마이그레이션).
  지연 도착한 과거 이벤트가 최신 상태를 덮어쓰지 않는다. 중복 전달은 재적용해도 결과가 같다(멱등).
- **current_period_end 위치 대응** — 2025+ API 버전에서 subscription item 하위로 이동. 양쪽 모두 읽는다.
- **실제 Stripe 서명 형식 검증** — mock 은 단순 `HMAC(body)` 였지만 실제는 `t=<unix>,v1=<HMAC("t.body")>` +
  타임스탬프 허용 오차(5분)다. 두 형식이 호환되지 않음을 테스트로 고정(`test/billing-realkey.test.ts`).
  네트워크가 필요 없어 Stripe CLI 의 whsec 을 꽂기 전에 미리 검증 완료.
- **Checkout 이메일 전달** — Stripe 고객이 이메일 없이 생성되고 있었다. 검증된 JWT에서 email 클레임을 읽어 전달.
  (`AuthUser` 에 email 추가는 인증 모듈 공동 소유라 Dev A 합의 후 정리 — 현재는 billing 라우트에 국소화)

### 테스트 격리 (실키를 넣자마자 드러난 문제)

`.env` 에 실제 `STRIPE_SECRET_KEY` 를 넣는 순간 결제 테스트 16개가 깨졌다. 원인이 두 겹이었다:

1. Vitest 가 `apps/api/.env` 를 `process.env` 에 주입한다.
2. `@prisma/client` 를 import 하면 Prisma 가 dotenv 로 `.env` 를 **다시** 읽는다.
   dotenv 는 기존 값을 덮지 않지만 *지워진* 값은 채우므로, setupFiles 에서 한 번 지우는 것으로는 부족했다.

→ `test/setup/hermetic.ts` 로 외부 크리덴셜 목록을 관리하고, setupFiles 와
`createHarness()` 의 `loadConfig()` 직전 **두 지점**에서 정리한다.
기본 상태는 항상 "외부 연동 전부 mock/dry-run" 이고, 실키 경로 테스트만 `createHarness({...})` 로 켠다.

교훈: 테스트가 개발자 개인 `.env` 에 좌우되면 CI 와 로컬이 갈린다. 실키를 받기 전에 이걸 먼저 고정해야 한다.

### Phase 9

- rate limit 검증 추가: 전역(IP), `/edit-jobs`(토큰당 5/분), `/notifications/geofence-enter`(토큰당 10/분),
  웹훅 예외, 공통 `RATE_LIMITED` 포맷. `RATE_LIMIT_GLOBAL_MAX` 로 조정 가능.

### 연동 추가 하드닝 (2026-08-04, 크리덴셜 없이 가능한 범위)

**틱톡 게시 결과 확인** (기존 "남은 것" 항목 해소)
- init 성공만으로 `success` 를 기록하던 것을 `post/publish/status/fetch` 폴링으로 교체.
  `PUBLISH_COMPLETE`/`SEND_TO_USER_INBOX` → `success`, `FAILED` → 사유 포함 실패,
  **시간 초과(기본 2분) → `pending`** (실패로 단정하지 않음, `uploaded_at` 은 null).
- `UploadResult.status` 추가 → `sns_uploads.status` 가 실제 상태와 일치한다. FE 는 `pending` 을 "업로드 중" 으로 표시.

**FCM 초기화 결함 수정**
- `admin.initializeApp()` 을 이름 없이 호출해서, 한 프로세스에서 앱을 두 번 구성하면
  `app/duplicate-app` 이 던져지고 **buildApp 이 실패해 서버가 아예 뜨지 않았다**.
  → 이름 붙인 앱(`snaply`) + 기존 앱 재사용으로 멱등하게 변경.
- FCM 계층 테스트 11개 추가(firebase-admin 대체): dry-run 전환, 정상 발송 payload,
  **무효 토큰 자동 정리**, 일시 오류 시 토큰 보존, `errorInfo` 없는 에러 형태,
  깨진 서비스 계정 → dry-run 폴백, geofence 연동(무효 토큰 정리 후 다음 진입이 no_token).

### FCM 실크리덴셜 검증 (2026-08-04, 실기기 없이 통과)

Firebase 서비스 계정(`snaply-66f8c`)을 `.env` 에 넣고 **실제 FCM API** 로 검증했다.
실기기 토큰이 없어도, 미등록 토큰을 보내면 FCM 이 실제로 응답하므로 크리덴셜 유효성과 정리 경로를 모두 확인할 수 있다.

| 검증 | 결과 |
|---|---|
| 서비스 계정 로드 → 발송 모드 전환 | `dryRun=false` |
| 형식이 틀린 토큰 | `messaging/invalid-argument` → `send_error` (토큰 보존) |
| 형식만 맞춘 미등록 토큰 | `messaging/registration-token-not-registered` → `token_invalid` |
| 무효 토큰 자동 정리 | `users.fcm_token` → `null` |
| HTTP 경로(`POST /notifications/geofence-enter`) | 1차 `send_failed` → 2차 `no_token`, `notification_logs=0` |
| 실크리덴셜로 서버 기동 | 정상 (`app/duplicate-app` 예외 없음 — 위 수정 덕분) |

발송 실패가 쿨다운을 소모하지 않는 것(Phase 6 의 보상 삭제)도 실크리덴셜 경로에서 확인됐다.
**남은 것은 실기기 수신 확인뿐이며 FE 앱이 필요하다.**

### 사고 기록 — 테스트가 개발 DB를 TRUNCATE 했다

`vitest` 를 `apps/api` 밖에서 실행하면 `vitest.config.ts` 가 로드되지 않아 `setupFiles` 가 건너뛰어지고,
`DATABASE_URL` 이 **개발 DB(`snaply`)** 를 가리킨 채 `resetDb()` 의 `TRUNCATE` 가 돌았다.
그 결과 시드 위치 50개가 날아갔다(`npm run db:seed` 로 복구).

→ `assertTestDatabase()` 추가: `SELECT current_database()` 가 `snaply_test` 가 아니면
TRUNCATE 전에 예외를 던진다. 회귀 테스트는 `test/harness-safety.test.ts`.
**테스트는 반드시 `apps/api` 에서 실행할 것** (`npm test -w apps/api` 또는 `npm test` in apps/api).

### SNS 실키 투입 — 크리덴셜 검증 + 결함 2건 (2026-08-04)

인스타/틱톡 앱 등록 후 실키를 넣고, **브라우저 로그인 없이 검증 가능한 범위**를 전부 확인했다.

| 검증 | 방법 | 결과 |
|---|---|---|
| mock → 실호출 전환 | `/sns/*/connect` 응답 | `mock://` 대신 실제 authorize URL |
| 인스타 client_id + redirect_uri | authorize URL 직접 요청 | 200 + 실제 OAuth 로그인 페이지. `Invalid platform app`/`URL Blocked` 등 Meta 에러 문구 0건 |
| 틱톡 client_key + redirect_uri | authorize URL 직접 요청 | 302 → `tiktok.com/login?...enter_from=dev_<client_key>` (앱 인식됨) |
| 인스타 **app secret** | 잘못된 code 로 토큰 교환 | `Invalid authorization code` — 시크릿 오류가 아니므로 인증 통과 |
| 틱톡 **client secret** | 잘못된 code 로 토큰 교환 | `invalid_grant` — 동일하게 인증 통과 |

이 과정에서 실제 결함 2건이 드러났다. 둘 다 **실 OAuth 첫 시도에서 바로 터질 것**이었다.

**(1) 틱톡은 실패를 `HTTP 200` + 에러 본문으로 준다** — `res.ok` 만 확인하고 있어서 실패 응답을
성공으로 취급했고, `undefined` 토큰을 암호화하려다 `ERR_INVALID_ARG_TYPE` → **500** 이 났다.
(code 가 만료되기만 해도 발생. 실측으로 확인)
→ `assertTikTokOk()` 추가. OAuth 형태(`{error, error_description}`)와
Content Posting 형태(`{error:{code,message}}`) 둘 다 검사하고, `access_token` 부재도 명시적으로 잡는다.
토큰 교환·갱신·업로드 init·상태 조회 4곳 모두 적용.

**(2) 콜백 실패 시 사용자가 JSON 에러 페이지에 갇혔다** — `handleCallback` 이 던지는 예외가
전역 핸들러로 가서 JSON 400/500 이 브라우저에 그대로 표시됐다. OAuth 도중이라 앱으로 돌아갈 방법이 없다.
→ 라우트에서 catch 후 `sns/error?platform=<p>&reason=exchange_failed` 딥링크(현 스킴 `snaplyapp://`)로 302. 에러는 로그로 남긴다.

회귀 테스트 7개 추가(`test/sns-realkey.test.ts`). **남은 것은 브라우저 로그인 1회뿐이다.**

### 틱톡 — API 는 성공, **실물 미확인** (2026-08-10, 진행 중)

⚠️ **주의**: 아래는 "틱톡 API 가 업로드를 수락하고 성공을 반환했다"는 것까지다.
**사용자 계정에 실제로 도착했는지는 확인되지 않았다** — 받은함 알림이 오지 않았다.
API 응답만으로 "검증 완료"라고 판단하면 안 되는 사례다.

```
POST /sns/tiktok/upload → 200 (16.8초)
  { status:"success", platformPostId:"v_inbox_url~v2.7672...", requiresUserAction:true }
틱톡 상태 조회 → SEND_TO_USER_INBOX (error.code=ok)
```

막혔던 관문은 **전부 콘솔 설정**이었고 코드 문제는 없었다:
Login Kit 제품 미추가 → Sandbox 별도 client_key(`sb` 접두, 문서 미명시) →
Target users 미등록 → 영상 URL 호스트의 prefix 소유권 미검증.

이 과정에서 코드 쪽으로 확인된 것:
- 틱톡이 403 으로 준 URL 검증 에러 메시지가 **문서 링크까지 그대로** 로그·응답에 실렸다.
  인스타에서 "Meta 응답 본문을 버리던" 문제를 고쳐둔 것이 여기서 바로 효과를 봤다.
- 스코프 기반 엔드포인트 자동 분기(`video.upload` → `/inbox/video/init/`)와
  `requiresUserAction` 이 실제 응답에서 의도대로 동작했다.

**미해결 — 받은함 알림 미도착**

틱톡 상태 API 는 `SEND_TO_USER_INBOX` / `error.code=ok` 를 계속 반환하는데 앱에는 아무것도 오지 않았다.
문서상 Sandbox 에서도 받은함 도착이 정상 동작(privacy=SELF_ONLY)이므로 제약이 아니라 설정 문제로 보인다.

**중요한 단서**: `user.info.basic` 스코프가 실제로는 부여되지 않았다.
```
GET /v2/user/info/                    → scope_not_authorized
POST /v2/post/publish/creator_info/query/ → scope_not_authorized
```
`video.upload` 는 동작했는데(업로드 수락됨) `user.info.basic` 은 거부된다. 즉 **동의가 부분적으로만
이루어진 상태**다. 이 때문에 어느 계정에 전달됐는지 우리 쪽에서 확인할 수단이 없다 —
진단의 가장 큰 사각지대.

다음 확인 순서:
1. Sandbox → Scopes 에 `user.info.basic` 이 실제로 켜져 있는지
2. 재인증 시 동의 화면에 **두 권한이 모두** 표시되는지
3. 부여되면 `/v2/user/info/` 로 **어느 계정에 연동됐는지 확정** 후 그 계정의 받은함 확인
4. TikTok 앱 받은 편지함은 초안(Drafts)이 아니라 **알림** 탭이다

**Phase 7 상태: 인스타(직접 게시) 실검증 완료 / 틱톡은 API 수락까지만 확인.**

### 인스타그램 실업로드 성공 — Phase 7 end-to-end 완료 (2026-08-04)

실제 앱·실제 프로페셔널 계정(`gagejigi`)으로 릴스 게시까지 통과했다.

**게시된 릴스**: https://www.instagram.com/reel/DbnYK8qiXxg/ (`media_product_type: REELS`)

```
POST /sns/instagram/upload → 200 (38.9초)
  { status: "success", platformPostId: "18103750871175163" }
sns_uploads: status=success, uploaded_at 기록
Graph 조회: media_product_type=REELS, caption 한글+이모지 정상
```

검증된 전 구간: OAuth(state HMAC) → 토큰 교환 → 토큰 암호화 저장 → 공개 URL 가드 →
컨테이너 생성 → Meta 가 우리 터널에서 영상 다운로드 → status 폴링 → 게시 → 이력 기록.

**막혔던 원인 2가지 (둘 다 mock 으로는 절대 안 드러남)**

1. **계정 유형** — 개인 계정이었다. 개인 계정도 OAuth 는 통과해 토큰을 받지만
   `graph.instagram.com` 의 **모든** 엔드포인트가 `IGApiException 100` 으로 거부한다(`/me` 포함).
   프로페셔널(BUSINESS/CREATOR) 전환 후 같은 토큰으로 전부 동작했다.
   → 진단이 어려운 이유: 가짜 토큰으로는 인증(190)이 먼저 걸려 이 구분이 안 된다.
   `npm run ig:probe -w apps/api` 가 이 판별을 자동화한다.

2. **`user_id` 정밀도 손실** — Instagram user_id 는 2^53 을 넘고 JSON **숫자**로 온다.
   `JSON.parse` 가 `27899354646370752` → `27899354646370750` 로 값을 바꿨고,
   그 ID 로 게시하면 `Object with ID ... does not exist` (실측 확인).
   → 토큰 응답을 텍스트로 받아 정규식으로 문자열 추출 + 게시 경로를 **`/me/media`** 로 변경.
   저장된 ID 가 망가진 상태에서도 게시가 성공한 것으로 수정 효과가 입증됐다.

**폴링 필수 입증**: 컨테이너 처리에 ~50초가 걸렸다. 생성 직후 `media_publish` 를 호출하던
원래 코드는 사실상 항상 실패했을 것이다.

### SNS 실업로드 준비 (2026-08-04)

앱 등록 전에 필요한 인프라를 먼저 확보했다. 상세 절차는 [sns-setup.md](../sns-setup.md).

- **공개 콜백 URL** — `cloudflared tunnel --url http://localhost:3000` (다른 프로젝트의 ngrok 컨테이너는 건드리지 않음).
  터널 경유로 `/health` 200, `/sns/instagram/callback` 302(에러 딥링크) 확인.
- **공개 영상 URL** — MinIO(:9100) 터널 + 버킷 익명 읽기 정책.
  개발 버킷은 기본이 비공개라 익명 GET 이 **403** 이었고, 그대로면 플랫폼이 영상을 못 내려받는다.
  → `scripts/dev-public-bucket.ts` 추가(`npm run dev:public-bucket -w apps/api`).
  `s3:GetObject` 만 열고 목록·쓰기는 닫는다. **S3_ENDPOINT 가 없으면 실행을 거부**해
  실제 AWS 버킷을 공개로 바꾸는 사고를 막는다(가드 동작 확인).
  터널 경유 익명 GET 200 확인.
- `.env` 에 리디렉션 URI 2개 + `CLOUDFRONT_DOMAIN`(= 공개 미디어 베이스) 설정.

주의: trycloudflare 주소는 터널 재시작 시 바뀐다. 장기 작업이면 고정 도메인이 필요하다.

### Stripe 실키 웹훅 end-to-end 검증 (2026-08-04, 실제로 통과함)

`sk_test_` 키 + Stripe CLI(`stripe listen`)로 **실제 Stripe 이벤트**를 로컬로 흘려 검증했다.
계정 API 버전은 **2026-07-29.dahlia**.

| 검증 | 결과 |
|---|---|
| `stripe trigger customer.subscription.created` (fixture 11개 이벤트) | 전부 `200` — 실제 서명이 실제 whsec 로 검증됨 |
| 실제 `customer.subscription.updated` → DB 반영 | `plan: free → standard`, `stripeSubscriptionId`, `currentPeriodEnd=2026-09-04` 기록 |
| 오래된 실제 이벤트(2분 전) 재전송 | `200` 이지만 **무시** — `last_stripe_event_at` 유지. 순서 보정 가드 실동작 확인 |
| 처리 대상 아닌 이벤트(charge/invoice/payment_intent 등) | 전부 `200` no-op |

확인된 사실 정정: `current_period_end` 는 이 API 버전에서 subscription **최상위와 item 하위 양쪽에** 들어온다.
즉 `readPeriodEnd()` 의 item 폴백은 (이 버전 기준) 필수가 아니라 방어 코드다. 동작 차이는 없다.

재현 방법:
```bash
stripe listen --api-key $STRIPE_SECRET_KEY --forward-to localhost:3000/billing/webhook
# 출력된 whsec_... 을 .env STRIPE_WEBHOOK_SECRET 에 넣고 API 서버 재시작
stripe trigger customer.subscription.created --api-key $STRIPE_SECRET_KEY
```
※ `stripe listen` 은 localhost:3000 으로 연결을 유지하므로 `lsof -ti:3000 | xargs kill` 하면 같이 죽는다.
서버만 죽이려면 `lsof -nP -iTCP:3000 -sTCP:LISTEN -t` 를 쓸 것.

### Sentry 실수집 검증 (2026-08-04)

| 검증 | 결과 |
|---|---|
| DSN 유효성 — ingest 엔드포인트에 envelope 직접 POST | `200` + `{"id":"8632...48f1"}` |
| `lib/sentry.ts` 경로 — `initSentry` → `captureException` → `flush` | `flush: true`, 전송 오류 없음 |
| 실제 500 캡처 — Postgres 중지 후 `GET /auth/me` | `500` (공통 포맷, 내부 정보 미노출) + 전역 핸들러의 5xx 분기 실행 확인 |
| 4xx 는 안 보냄 | 401/400/404 는 캡처 대상 아님 (설계대로) |

주의: Sentry SDK 는 자기 전송 요청을 http 계측에서 제외하므로, `ingest.us.sentry.io` 로 나간 요청이
디버그 로그에 안 보이는 것이 정상이다. 캡처 실행 여부는 같은 분기의 `request.log.error` (level:50) 로 확인한다.

**추가로 고친 것 — 종료 시 flush 누락**: Sentry 전송은 비동기 버퍼링인데 `index.ts` 의 shutdown 이
`process.exit(0)` 를 바로 호출해서, 5xx 발생 직후 재시작·배포되면 그 이벤트가 유실됐다.
`flushSentry()` 를 추가해 종료 전에 전송을 기다린다. (`SENTRY_DEBUG=true` 로 SDK 전송 로그 확인 가능)

### 후속 항목의 현행 위치

이 시점에 닫히지 않았던 항목(Stripe 상품·가격 생성, 틱톡 받은함, FCM 실기기, 멀티 디바이스 푸시,
`notification_logs` 보관 정책)은 [backlog.md](../backlog.md) C·B 절로 옮겼다.
이후 완료된 것 — Sentry 실수집(2026-08-04), 인스타 실업로드(2026-08-04),
틱톡 게시 결과 폴링(2026-08-04) — 은 아래 각 절에 기록돼 있다.
