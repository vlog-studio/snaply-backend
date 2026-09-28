# 인스타그램 · 틱톡 연동 셋업 (Dev B)

실제 업로드를 로컬에서 검증하기 위한 준비 절차. 코드는 이미 실키를 받을 준비가 끝나 있고,
`INSTAGRAM_APP_ID` / `TIKTOK_CLIENT_KEY` 가 채워지면 자동으로 mock → 실호출로 전환된다.

> 진행 기록은 [progress.md](./progress.md), API 계약은
> [contract/sns.ts](../packages/shared-types/src/contract/sns.ts)(동작 안내는 [api-spec.md](./api-spec.md) §SNS 연동) 참고.
> 닫히지 않은 항목(받은함 미도착·심사·검수 URL·고정 도메인·prefix 재등록)은 [backlog.md](./backlog.md)
> C-2·C-3·C-5·D-1·D-3 에만 있다.

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

> cloudflared 설치와 임시 주소의 주의사항은 [local-tunnel.md](./local-tunnel.md) 가 원천이다.
> 여기서는 인스타·틱톡에 필요한 두 터널과 공개 버킷만 다룬다.

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

터널 주소가 바뀌면 위 세 값과 각 플랫폼 콘솔의 리디렉션 URI·URL prefix 검증을 **다시 등록**해야
한다(임시 주소의 성질과 주의사항은 [local-tunnel.md](./local-tunnel.md) §4). 고정 주소는
[local-tunnel.md](./local-tunnel.md) §6 의 `dev-tunnel.sh` 로 만든다 — SNS 용으로는 `api-dev.<도메인>`(API :3000)과
`media-dev.<도메인>`(MinIO :9100) 두 호스트가 생기고, 스크립트가 `.env` 와 콘솔에 넣을 값을 출력한다.

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

### 인스타 쪽 알아둘 점
- 토큰: 단기(1시간) → **장기(60일)** 교환까지 코드가 처리한다. 단기 토큰 응답에는 `expires_in` 이 없어
  만료 시각은 장기 교환이 채운다. 만료 7일 이내면 업로드 직전에 자동 갱신하고, 만료 시각을 모르면
  (`null`) 업로드 때 한 번 갱신을 시도해 알아낸다. **이미 만료된 토큰은 갱신 불가** → 재연동 안내 에러가 나간다.
- 장기 토큰 교환이나 프로필 조회가 실패해도 연동은 저장한다(토큰 자체는 유효하다). `account_type` 을
  못 읽으면 개인 계정 차단을 건너뛰고 경고만 남긴다 — 그 경우 게시 단계에서 Meta 가 거부한다.
- 게시는 컨테이너 생성 → `status_code=FINISHED` 폴링 → 게시 순서다. 처리에 수십 초(실측 약 50초)가
  걸려 `POST /sns/instagram/upload` 응답도 그만큼 걸린다(최대 5분, `INSTAGRAM_POLL_TIMEOUT_MS`).
- `user_id` 는 2^53 을 넘는 JSON 숫자로 온다. 코드는 토큰 응답에서 문자열로 추출하고, 게시는 ID 대신
  `/me/media` 로 한다(회귀 테스트: `test/sns-realkey.test.ts` 의 "user_id 정밀도").
- 영상 규격(길이·해상도·코덱)이 릴스 요건에 안 맞으면 컨테이너가 `ERROR` 로 떨어진다.

### 인스타 트러블슈팅

| 증상 | 원인 | 대응 |
|---|---|---|
| OAuth·토큰 교환은 통과하는데 `graph.instagram.com` 의 **모든** 엔드포인트가 `100 IGApiException: Unsupported request`(GET·POST 모두) | 연동한 계정이 프로페셔널(비즈니스/크리에이터)이 아니다. 다음 후보는 개발 모드에서 그 계정이 Instagram 테스터로 등록·수락되지 않은 경우 | 계정을 프로페셔널로 전환한다 — 전환 뒤 같은 토큰으로 전부 동작했다(2026-08-04) |

진단 스크립트 — **실토큰으로만** 판별된다(가짜 토큰은 인증 `190` 이 먼저 걸려 구분이 안 된다):

| 명령 | 용도 |
|---|---|
| `npm run ig:probe -w apps/api` | 저장된 실토큰으로 호스트·메서드·버전 10조합 시험 |
| `npm run ig:publish-probe -w apps/api` | 어느 게시 경로(`/me` vs ID)가 유효한지 판별 |
| `npm run ig:container-probe -w apps/api -- <video_url>` | 컨테이너 생성+처리 완료까지만 확인(**게시 안 함**) |

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
4. 스코프: `user.info.basic`(Login Kit), `video.upload` 또는 `video.publish`(Content Posting API)

### Sandbox client_key 의 이력 노출 — 수용된 위험 (2026-08-11 판정)

Sandbox 는 Production 과 **별도의 `client_key`/`secret`** 을 가지며 `sb` 접두사가 붙는다.
이 값이 문서 예시에 실값으로 들어갔다가 커밋 `9174295` 에서 플레이스홀더로 교체됐다.
현재 트리·HEAD 에는 없지만 **커밋 `49d0d1a` 의 diff 와 커밋 메시지에는 남아 있다.**

**제거하지 않기로 판정했다.** 근거:

- `client_key` 는 authorize URL 에 실려 사용자 브라우저에도 노출되는 **준공개 식별자**다.
- 짝이 되는 `client_secret` 은 이력에 없다. `.env` 는 추적된 적이 없고(`.env.example` 만),
  코드의 `client_secret=${secret}` 은 변수 보간이다. secret 없이 `client_key` 만으로는 할 수 있는 것이 없다.
- 완전 제거에는 history rewrite + force push 가 필요해 양 트랙에 영향이 간다 — 위험보다 비용이 크다.

Production 앱의 키가 같은 방식으로 새면 판정이 달라진다. 그때는 콘솔에서 secret 재발급이 먼저다.

### 틱톡 스코프 — 심사 전/후로 게시 방식이 다르다

| 스코프 | 엔드포인트 | 동작 | 심사 |
|---|---|---|---|
| `video.upload` | `/v2/post/publish/inbox/video/init/` | 사용자 **받은함(초안)** 에 전달. 사용자가 틱톡 앱에서 마무리해야 게시 | 불필요 |
| `video.publish` | `/v2/post/publish/video/init/` | **직접 게시** | **필요** |

심사 전 콘솔에는 `video.upload` 만 나온다. `TIKTOK_SCOPES` 로 전환하며, **엔드포인트는 코드가 자동 선택**한다.

```bash
# 심사 전 (지금)
TIKTOK_SCOPES=user.info.basic,video.upload
# 심사 통과 후
TIKTOK_SCOPES=user.info.basic,video.publish   # 기본값
```

받은함 모드에서는 업로드 응답에 `requiresUserAction: true` 가 실린다(FE 안내용).
제목·공개범위는 사용자가 틱톡 앱에서 직접 정하므로 `post_info` 를 보내지 않는다.

### 콘솔 저장에 필요한 필수 항목

틱톡은 앱 설정을 **저장**하는 것만으로도 아래를 요구한다(심사 제출 전에도).
그래서 API 가 필요한 페이지를 직접 서빙한다(`routes/legal.ts`):

| 필드 | 값 |
|---|---|
| Web/Desktop URL | `https://<A>.trycloudflare.com/` |
| Terms of Service URL | `https://<A>.trycloudflare.com/legal/terms` |
| Privacy Policy URL | `https://<A>.trycloudflare.com/legal/privacy` |

> 법률 문서는 **출시 전 초안**이다(페이지 상단에도 표기) — 정식화는 [backlog.md](./backlog.md) D-2.

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

**(2) PULL_FROM_URL 은 영상 URL의 URL prefix 소유권 검증을 요구한다.**
영상을 내주는 호스트(로컬은 MinIO 터널)의 prefix 를 API 호스트와 **별개로** 검증해야 한다.
`trycloudflare.com` 같은 공유 도메인도 파일 서빙 방식으로 통과한다 — 아래 "URL prefix 소유권 검증".

### URL prefix 소유권 검증

- `trycloudflare.com` 같은 공유 도메인도 **파일 서빙 방식으로 검증된다**(DNS TXT 불필요).
- 검증 파일명은 generic 이 아니라 `tiktok<CODE>.txt`, 내용은 `tiktok-developers-site-verification=<CODE>`.
- **서명은 property 별로 따로 발급된다.** `/legal/` 과 `/snaply-dev/` 가 서로 다른 코드를 받았다
  (앱 단위로 하나를 재사용하면 통과하지 못했다).
- 검증할 prefix 가 2개다:
  · API 호스트 `.../legal/` — 약관·개인정보 URL(콘솔 저장용) → `routes/legal.ts` 가 서빙(`SITE_VERIFICATION_*`)
  · MinIO 호스트 `.../snaply-dev/` — 영상 URL(PULL_FROM_URL) → 버킷에 파일 업로드(익명 읽기는 §1 의 `dev:public-bucket`)
- 재등록의 미결 상태·완료 조건은 [backlog.md](./backlog.md) D-3.

### 틱톡 트러블슈팅

authorize·업로드에서 만난 에러는 전부 콘솔 설정 문제였다(코드 문제 아님).

| 에러 | 원인 | 대응 |
|---|---|---|
| authorize 에서 `client_key` | **Login Kit 제품 미추가** — OAuth 는 Content Posting API 가 아니라 Login Kit 이 담당한다 | Login Kit 을 추가하고 리디렉션 URI 를 Login Kit 설정에 등록 |
| Login Kit 을 넣어도 `client_key` | **Sandbox 는 자체 `client_key`/`secret`(`sb` 접두사)을 가진다.** Production 키로는 심사 전 authorize 가 안 된다(문서 미명시) | Manage apps → 앱 → 이름 옆 스위치를 **Sandbox** 로 → 그 상태의 Client key/secret 을 `.env` 에 |
| `non_sandbox_target` | 로그인한 계정이 Sandbox **Target users** 에 없다 | Target users 에 실제로 로그인할 계정 추가 · 브라우저의 다른 TikTok 계정 로그아웃 · 반영에 최대 1시간 |
| 업로드가 `403 URL ownership` | **영상 URL 호스트**의 prefix 소유권 미검증 — API 호스트와 **별개** | 위 "URL prefix 소유권 검증" |

- 에러가 `client_key` → `non_sandbox_target` 으로 바뀌면 앞 단계(앱·제품·리디렉션 URI·URL 검증)는 통과한 것이다.
- **API 성공은 받은함 도착을 뜻하지 않는다.** 받은함 모드 업로드는 `platformPostId` 가 `v_inbox_url~` 로
  시작하고 상태 조회가 `SEND_TO_USER_INBOX`(`error.code=ok`)를 돌려주지만, 실제 도착은 틱톡 앱에서 따로
  확인해야 한다 — 미도착 조사는 [backlog.md](./backlog.md) C-2.

---

## 4. 키를 넣은 뒤 검증 순서

```bash
# 1) 서버 재기동 (.env 반영)
npm run dev:api

# 2) 연동 URL 받기 — 이제 mock:// 이 아니라 실제 authorize URL 이 나와야 한다
npm run auth:stub -w apps/api          # 토큰 발급
curl -H "Authorization: Bearer <토큰>" http://localhost:3000/sns/instagram/connect

# 3) 그 URL을 브라우저에서 열어 인스타 로그인 → 승인
#    → 콜백이 터널로 들어와 snaplyapp://sns/connected?platform=instagram 로 리다이렉트되면 성공
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
