# 인스타그램 · 틱톡 연동 셋업 (Dev B)

실제 업로드를 로컬에서 검증하기 위한 준비 절차. 코드는 이미 실키를 받을 준비가 끝나 있고,
`INSTAGRAM_APP_ID` / `TIKTOK_CLIENT_KEY` 가 채워지면 자동으로 mock → 실호출로 전환된다.

> 진행 기록은 [PROGRESS.md](./PROGRESS.md), API 계약은 [api-spec.md](./api-spec.md) 참고.

---

## 0. 왜 준비가 필요한가

두 플랫폼 모두 **우리가 준 영상 URL을 자기 서버가 직접 내려받는다**(PULL 방식).
그래서 로컬 개발 환경에는 두 가지가 없다:

| 필요한 것 | 왜 | 지금 해결책 |
|---|---|---|
| 공개 HTTPS **콜백 URL** | OAuth 리디렉션 URI 는 https 공개 주소만 등록 가능 | cloudflared 터널 → API(:3000) |
| 공개 HTTPS **영상 URL** | 플랫폼이 영상을 내려받아야 함. `localhost:9100` 은 도달 불가 | cloudflared 터널 → MinIO(:9100) + 버킷 익명 읽기 |

코드에는 이미 가드가 있어서, 로컬 주소나 http 를 넘기면 외부 호출 **전에** 400 으로 막는다
(`services/sns.service.ts` 의 `assertPubliclyFetchable`). 그래서 준비 없이 실키를 넣으면 바로 걸린다.

---

## 1. 터널 + 공개 버킷 준비

```bash
# 1) 개발 버킷에 익명 읽기 정책 (로컬 MinIO 전용 — S3_ENDPOINT 없으면 실행 거부됨)
npm run dev:public-bucket -w apps/api

# 2) API 터널 (OAuth 콜백용)
cloudflared tunnel --url http://localhost:3000
#    → https://<A>.trycloudflare.com

# 3) MinIO 터널 (영상 URL용)
cloudflared tunnel --url http://localhost:9100
#    → https://<B>.trycloudflare.com
```

`apps/api/.env` 에 반영:

```bash
API_BASE_URL=https://<A>.trycloudflare.com
INSTAGRAM_REDIRECT_URI=https://<A>.trycloudflare.com/sns/instagram/callback
TIKTOK_REDIRECT_URI=https://<A>.trycloudflare.com/sns/tiktok/callback

# publicUrl() 의 베이스. 운영에서는 실제 CloudFront 도메인이 들어간다.
CLOUDFRONT_DOMAIN=https://<B>.trycloudflare.com/snaply-dev
```

확인:
```bash
curl https://<A>.trycloudflare.com/health                       # {"status":"ok"}
curl https://<B>.trycloudflare.com/snaply-dev/<some-key>        # 200 (익명 읽기)
```

> ⚠️ **trycloudflare 주소는 터널을 재시작하면 바뀐다.** 바뀌면 `.env` 와 각 플랫폼 콘솔의
> 리디렉션 URI를 다시 맞춰야 한다. 며칠 이상 붙잡고 갈 거라면 고정 도메인(cloudflared named tunnel +
> 보유 도메인, 또는 ngrok 유료 static domain)을 쓰는 게 낫다.

---

## 2. 인스타그램 앱 등록

우리 구현은 **"Instagram API with Instagram Login"** 계열이다
(`www.instagram.com/oauth/authorize` + `graph.instagram.com`).
페이스북 페이지 연결이 필요 없어 모바일 앱에 붙이기 쉽다.
구 Basic Display API 는 2024-12 종료됐고 게시 기능도 없었다.

1. https://developers.facebook.com/apps → **앱 만들기**
2. 제품에서 **Instagram** 추가 → **API setup with Instagram login** 선택
3. 여기서 나오는 **Instagram 앱 ID / 앱 시크릿** 을 사용한다
   (페이스북 앱 ID 와 다른 값이다 — 헷갈리기 쉬움)
4. **Business login settings** 에서 리디렉션 URI 등록:
   ```
   https://<A>.trycloudflare.com/sns/instagram/callback
   ```
5. 권한(스코프)에 다음이 포함되어야 한다 — 코드가 요청하는 값과 일치해야 한다:
   ```
   instagram_business_basic,instagram_business_content_publish
   ```
6. 연동할 인스타 계정을 **프로페셔널(비즈니스 또는 크리에이터)** 로 전환한다.
   개인 계정은 우리 코드가 콜백에서 거부한다(`reason=account_type`).
7. 앱이 개발 모드인 동안에는 **앱 역할에 테스터로 추가된 계정만** 인증할 수 있다.

`.env`:
```bash
INSTAGRAM_APP_ID=...
INSTAGRAM_APP_SECRET=...
INSTAGRAM_WEBHOOK_VERIFY_TOKEN=...   # 웹훅 등록을 요구할 때만
```

### 사용 사례(use case) 고르기

Meta 에는 "Instagram 로그인" 이라는 사용 사례가 **없다**. Instagram Login 은 사용 사례가 아니라
그 안에서 쓰는 인증 방식이다. 필요한 권한이 담긴 사용 사례는 하나뿐이다:

> **인스타그램에서 메시지 및 콘텐츠 관리**

이름에 "메시지"가 앞에 붙지만 게시 권한이 같은 묶음에 있다. 우리가 요청하는 건 아래 둘뿐이다:

| 권한 | 용도 |
|---|---|
| `instagram_business_basic` | 프로필·`account_type` 조회(개인 계정 거부 판정) |
| `instagram_business_content_publish` | 릴스 게시 |

`instagram_business_manage_messages` / `..._manage_comments` 는 요청하지 않는다.

### 비즈니스 로그인 설정의 나머지 필드

| 필드 | 지금 필요? | 비고 |
|---|---|---|
| OAuth 리디렉션 URI | **필수** | `https://<A>.trycloudflare.com/sns/instagram/callback` |
| 승인 취소 콜백 URL | 비워도 됨 | 앱 검수(출시) 시 필요. 사용자가 앱 연결을 해제하면 Meta 가 호출 |
| 데이터 삭제 요청 URL | 비워도 됨 | 앱 검수(출시) 시 필요. 개인정보 삭제 요청 처리용 |

OAuth 테스트에는 리디렉션 URI 하나만 있으면 된다. 위 두 개는 **앱 검수를 받을 때** 구현하면 된다.

### 웹훅 (요구될 때만)

콘솔이 웹훅 설정을 요구하면 "인증 토큰"을 물어본다. 이건 Meta 가 주는 값이 아니라 **우리가 정하는 문자열**이다.
Meta 가 등록 시 그 값을 담아 우리 서버로 GET 을 보내고, `hub.challenge` 를 평문으로 되돌려받아야 통과한다.

```
콜백 URL:   https://<A>.trycloudflare.com/sns/instagram/webhook
인증 토큰:   INSTAGRAM_WEBHOOK_VERIFY_TOKEN 에 넣은 값
```

구현은 `routes/sns-webhook.ts`. 릴스 게시 자체에는 웹훅이 필요 없고, 수신한 이벤트는 서명만 확인하고 무시한다.

### 실측 결과 — 인스타그램 게시 파이프라인 통과 (2026-08-04)

계정을 **프로페셔널(BUSINESS)** 로 전환한 뒤 같은 토큰으로 전부 동작했다. 즉 원인은 계정 유형이었다.

```
GET /v23.0/me → 200 {user_id:"17841439086162200", username:"gagejigi", account_type:"BUSINESS"}
GET /access_token?grant_type=ig_exchange_token → 200 (장기 토큰 발급됨)
POST /me/media (실제 영상) → 200 컨테이너 생성
  폴링: IN_PROGRESS ×10 → FINISHED  (약 50초)
```

**폴링이 필수임이 실증됐다.** 처리에 ~50초가 걸리므로, 컨테이너 생성 직후 `media_publish` 를
호출하던 원래 코드는 사실상 항상 실패했다.

#### 여기서 잡은 버그 — `user_id` 정밀도 손실 (게시를 깨뜨림)

Instagram user_id 는 `27899354646370752` 처럼 **2^53 을 넘고 응답에서 JSON 숫자로** 온다.
`JSON.parse` 하면 `27899354646370750` 으로 값이 바뀐다(부동소수점). 이 ID 로 게시를 시도하면:

```
POST /{27899354646370750}/media → 400 "Object with ID ... does not exist"   ← 정밀도 깨진 값
POST /{27899354646370752}/media → 200                                        ← 정확한 값
POST /me/media                  → 200
```

→ 두 가지로 대응했다:
1. 토큰 응답을 **텍스트로 먼저 받아** 정규식으로 `user_id` 를 문자열 추출(정밀도 보존).
2. 게시 경로를 **`/me/media`** 로 변경 — 토큰이 계정을 특정하므로 ID 불일치 위험이 아예 없다.

회귀 테스트: `test/sns-realkey.test.ts` 의 "user_id 정밀도" 블록.

#### 진단 스크립트

| 명령 | 용도 |
|---|---|
| `npm run ig:probe -w apps/api` | 저장된 실토큰으로 호스트·메서드·버전 10조합 시험 |
| `npm run ig:publish-probe -w apps/api` | 어느 게시 경로(`/me` vs ID)가 유효한지 판별 |
| `npm run ig:container-probe -w apps/api -- <video_url>` | 컨테이너 생성+처리 완료까지만 확인(**게시 안 함**) |

> 가짜 토큰으로는 인증(190)이 먼저 걸려 라우팅 유효성을 판별할 수 없다. 반드시 실토큰으로 확인해야 한다.

### 실측 진단 기록 — `IGApiException 100: Unsupported request`

2026-08-04 실제 앱·실제 계정으로 OAuth 를 끝까지 돌렸을 때 관측한 내용. 같은 증상을 만나면 여기서부터 보면 된다.

**성공한 단계**
- authorize → 승인 → code 발급 → 콜백 도달 → `state` HMAC 검증 → `POST api.instagram.com/oauth/access_token`
- 응답: `{ access_token, user_id, permissions }` — **`expires_in` 이 없다**
- `permissions` = `["instagram_business_basic","instagram_business_content_publish"]` (정상 부여)

**실패한 단계** — `graph.instagram.com` 의 **모든** 엔드포인트가 거부:

| 요청 | 응답 |
|---|---|
| `GET /me`, `GET /v23.0/me`, `GET /{ig-user-id}` | `100 IGApiException: Unsupported request - method type: get` |
| 같은 경로들 `POST` | `... method type: post` |
| `GET/POST /access_token`, `/refresh_access_token`, `/debug_token` | 동일 |
| `GET graph.facebook.com/v23.0/me` | `190 OAuthException: Cannot parse access token` |

**해석**: 메서드 문제가 아니다(POST 도 거부). 경로 문제도 아니다(모든 경로 동일).
토큰은 인스타 계열로 인식되지만(IGApiException) Business API 표면에서 **아무 동작도 허용되지 않는 상태**다.
가짜 토큰으로는 인증(190)이 먼저 걸려 이 구분이 안 되므로, **실토큰으로만 판별된다** → `npm run ig:probe -w apps/api`

**가장 유력한 원인**: 연동한 인스타 계정이 **프로페셔널(비즈니스/크리에이터)이 아님**.
개인 계정도 OAuth 자체는 통과해 토큰을 받지만, Business API 는 전부 막힌다.
그 다음 후보는 앱 개발 모드에서 해당 계정이 **Instagram 테스터로 등록/수락되지 않은 경우**.

**코드 쪽 대응(이미 반영)**: 장기 토큰 교환과 프로필 조회가 실패해도 연동은 저장한다.
토큰은 유효한데 부가 조회가 실패했다고 연동을 막으면 사용자가 아무것도 못 하기 때문이다.
`account_type` 을 못 읽으면 PERSONAL 차단을 건너뛰고 경고를 남긴다(게시 단계에서 Meta 가 거부한다).

### 인스타 쪽 알아둘 점
- 토큰: 단기(1시간) → **장기(60일)** 교환까지 코드가 처리한다. 만료 7일 이내면 업로드 직전에 자동 갱신.
  **이미 만료된 토큰은 갱신 불가** → 재연동 안내 에러가 나간다.
- 게시는 컨테이너 생성 → `status_code=FINISHED` 폴링 → 게시 순서다.
  그래서 `POST /sns/instagram/upload` 응답이 수십 초 걸릴 수 있다(최대 5분, `INSTAGRAM_POLL_TIMEOUT_MS`).
- 영상 규격(길이·해상도·코덱)이 릴스 요건에 안 맞으면 컨테이너가 `ERROR` 로 떨어진다.

---

## 3. 틱톡 앱 등록

1. https://developers.tiktok.com → **Manage apps** → 앱 생성
2. **제품을 두 개 추가해야 한다** — 이걸 빠뜨리면 authorize 단계에서
   "TikTok으로 로그인할 수 없습니다 … client_key" 로 막힌다:
   - **Login Kit** — OAuth(로그인) 담당. **리디렉션 URI 는 여기에 등록한다.**
   - **Content Posting API** — 게시 담당. `video.publish` 스코프 제공.
3. Login Kit 설정에 리디렉션 URI 등록 (https 필수, 파라미터/프래그먼트 불가):
   ```
   https://<A>.trycloudflare.com/sns/tiktok/callback
   ```
4. 스코프: `user.info.basic`(Login Kit), `video.publish`(Content Posting API)

> ⚠️ **틱톡 크리덴셜은 사전 검증이 불가능하다.** 토큰 엔드포인트
> (`/v2/oauth/token/`)는 `code` 를 먼저 검사해서, **존재하지 않는 client_key 로도**
> `invalid_grant: Authorization code is expired` 를 반환한다(실측 확인).
> 즉 client_key/secret 이 맞는지는 **authorize 를 실제로 통과해봐야만** 알 수 있다.
> (인스타는 authorize URL 요청만으로도 일부 판별이 되지만 틱톡은 안 된다.)

`.env`:
```bash
TIKTOK_CLIENT_KEY=...
TIKTOK_CLIENT_SECRET=...
```

### 틱톡의 두 가지 관문 (인스타보다 까다롭다)

**(1) `video.publish` 스코프는 심사 대상이다.**
심사 전에도 테스트는 되지만, **심사 미통과 앱이 올린 콘텐츠는 무조건 비공개로만 게시된다.**
코드도 이에 맞춰 `privacy_level: 'SELF_ONLY'` 를 보낸다. 기능 검증에는 충분하다.

**(2) PULL_FROM_URL 은 영상 URL의 도메인/URL prefix 소유권 검증을 요구한다.**
이게 로컬 검증의 실질적 걸림돌이다. `trycloudflare.com` 은 우리 도메인이 아니다.

선택지:
- **a. URL prefix 검증을 터널 주소로 시도** — TikTok 콘솔이 주는 검증 파일을 해당 prefix 아래에
  올려서 서빙하면 통과할 수도 있다. MinIO 버킷에 그 파일을 넣으면 터널로 서빙된다. 먼저 이걸 시도.
- **b. 보유 도메인으로 검증** — 운영 CloudFront 도메인이 정해지면 그걸 검증하는 게 정공법이다.
- **c. `FILE_UPLOAD` 방식으로 전환** — 영상 바이트를 우리가 직접 틱톡에 업로드한다.
  도메인 검증이 아예 필요 없다. 다만 클라이언트 구현이 추가로 필요하다(현재 미구현).

> 정리: **인스타는 터널만으로 로컬 실업로드가 될 가능성이 높고, 틱톡은 (2) 때문에 막힐 수 있다.**
> 틱톡이 막히면 위 c 안(FILE_UPLOAD)을 추가 구현하는 것이 다음 단계다.

---

## 4. 키를 넣은 뒤 검증 순서

```bash
# 1) 서버 재기동 (.env 반영)
npm run dev:api

# 2) 연동 URL 받기 — 이제 mock:// 이 아니라 실제 authorize URL 이 나와야 한다
npm run auth:stub -w apps/api          # 토큰 발급
curl -H "Authorization: Bearer <토큰>" http://localhost:3000/sns/instagram/connect

# 3) 그 URL을 브라우저에서 열어 인스타 로그인 → 승인
#    → 콜백이 터널로 들어와 snaply://sns/connected?platform=instagram 로 리다이렉트되면 성공
#    (딥링크는 브라우저가 열지 못하므로 주소창에서 확인하면 된다)

# 4) 연동 확인
curl -H "Authorization: Bearer <토큰>" http://localhost:3000/sns/connections

# 5) 편집 완료 영상으로 업로드
#    videos.edited_url 이 https://<B>.trycloudflare.com/snaply-dev/... 형태여야 한다
curl -X POST -H "Authorization: Bearer <토큰>" -H 'content-type: application/json' \
  -d '{"videoId":"<uuid>","caption":"테스트"}' \
  http://localhost:3000/sns/instagram/upload
```

검증 포인트:
- `sns_connections.access_token` 이 **암호화된 형태**(`iv.tag.ciphertext`)로만 저장되는지
- 콜백 `state` 가 변조되면 `reason=invalid_state` 로 거부되는지
- 개인 계정으로 시도하면 `reason=account_type` 으로 거부되는지
- 업로드 후 `sns_uploads` 에 `success`(또는 틱톡은 `pending`) 로 기록되는지

---

## 5. 상태 요약

| 항목 | 상태 |
|---|---|
| 코드 (OAuth·암호화·폴링·장기토큰·가드) | 완료, 테스트 38개 |
| 공개 콜백 URL | cloudflared 터널로 확보 |
| 공개 영상 URL + 버킷 익명 읽기 | 확보 (`npm run dev:public-bucket`) |
| 인스타 앱 등록·연동·게시 파이프라인 | **완료** — 컨테이너 FINISHED 까지 실검증. 남은 건 실제 게시 1회 |
| 틱톡 앱 등록 | **진행 중** — Login Kit 제품 추가 필요(누락 시 client_key 에러). 이후 도메인 검증 관문 |
| 틱톡 FILE_UPLOAD 대안 | 미구현 (필요 시) |
