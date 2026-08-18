# Snaply API 명세 (FE 전달용)

> 이 문서는 **FE 전달용 요약 + WebSocket 계약**이다. 스키마의 원천은 코드에서 생성되는
> Swagger(`/docs`)이므로, 라우트나 요청/응답을 바꾸면 **같은 커밋에서 이 문서도 갱신한다.**
> 과금 정책의 원천은 [decisions/credit-payment-model.md](./decisions/credit-payment-model.md)와
> [decisions/payment-channel-iap.md](./decisions/payment-channel-iap.md).

> **인터랙티브 문서(Swagger UI)**: 개발 서버 실행 후 **`http://localhost:3000/docs`** 에서 직접 호출·테스트할 수 있습니다. OpenAPI 스펙 JSON은 `http://localhost:3000/docs/json` (Postman/코드 생성용). 운영에서는 비활성(필요 시 `ENABLE_DOCS=true`). WebSocket은 OpenAPI로 표현되지 않아 아래 문서를 참고하세요.

- **Base URL**: `{API_BASE_URL}` (개발: `http://localhost:3000`)
- **인증**: 인증 필요 엔드포인트는 `Authorization: Bearer {supabase_jwt}` 헤더 필수. 토큰은 Supabase Auth 로그인으로 발급.
- **응답 형식(공통)**
  - 성공: `{ "success": true, "data": ... }`
  - 실패: `{ "success": false, "error": { "code": "STRING", "message": "..." } }`
    - 일부 에러는 `error` 에 부가 필드를 더 싣는다(예: `403 ACCOUNT_PENDING_DELETION` 의 `purgeAfter`).
- **에러 코드**: `UNAUTHORIZED`(401), `FORBIDDEN`(403), `ACCOUNT_PENDING_DELETION`(403, 삭제 대기 계정 — 복구는 `POST /auth/me/restore`), `NOT_FOUND`(404), `BAD_REQUEST`/`VALIDATION_ERROR`(400), `RATE_LIMITED`(429), `INTERNAL_SERVER_ERROR`(500)
- **Rate limit**: 기본 IP당 60req/분. `POST /edit-jobs` 유저당 5req/분, `POST /notifications/geofence-enter` 유저당 10req/분. 초과 시 429.

---

## 인증 / 프로필

### GET /auth/me  🔒
내 프로필 조회 (첫 호출 시 유저 자동 생성).
```json
{ "success": true, "data": {
  "id": "uuid", "nickname": "다연", "avatarUrl": null,
  "interests": ["여행","카페"], "notificationEnabled": true,
  "quietStart": 22, "quietEnd": 8
}}
```

> ⚠️ **변경**: 정기 구독 제거로 `plan` 필드가 응답에서 빠졌다. 크레딧 잔액은
> `GET /billing/credits`로 조회한다.

### PATCH /auth/me  🔒
프로필 수정. Body(모두 선택): `{ "nickname": "다연", "avatarUrl": "https://...", "interests": ["여행"] }` → 수정된 프로필 반환.

### DELETE /auth/me  🔒
계정 삭제 요청. 즉시: SNS 연동·FCM 토큰 삭제, 진행 중 편집 작업 취소(예약 크레딧 환급).
이후 30일 유예 기간 동안은 복구 가능하고, 유예가 지나면 배치가 모든 데이터(S3 원본 포함)를 영구 삭제한다.
```json
{ "success": true, "data": { "deleted": true, "purgeAfter": "2026-09-11T00:00:00.000Z" }}
```
삭제 대기 중에 다른 인증 API 를 호출하면 `403 ACCOUNT_PENDING_DELETION`. 이 403 은 위 삭제 응답과
동일한 `purgeAfter` 를 에러 객체에 함께 담으므로, 앱은 삭제 응답을 저장해 두지 않아도 남은 유예 기간을 보여줄 수 있다.
```json
{ "success": false, "error": {
  "code": "ACCOUNT_PENDING_DELETION",
  "message": "삭제 대기 중인 계정입니다. 복구하려면 POST /auth/me/restore 를 호출하세요.",
  "purgeAfter": "2026-09-11T00:00:00.000Z"
}}
```

### POST /auth/me/restore  🔒
유예 기간 내 계정 복구 → `{ "success": true, "data": { "restored": true } }`.
FCM 토큰·SNS 연동은 삭제 시점에 이미 정리됐으므로 되살아나지 않는다(재등록 필요).
크레딧 잔액은 유예 기간 중 보존되며 복구 시 그대로 남는다.
삭제 대기 상태가 아니면 `400`.

### POST /auth/fcm-token  🔒
Body: `{ "fcmToken": "..." }` → `{ "success": true, "data": { "updated": true } }`

---

## 영상

### GET /videos/upload-url  🔒
Query: `filename`, `contentType`. presigned 업로드 URL 발급 + pending 레코드 생성.
```json
{ "success": true, "data": { "videoId": "uuid", "uploadUrl": "https://...", "s3Key": "uploads/{userId}/{videoId}.mp4" }}
```
클라이언트는 `uploadUrl`에 **PUT**으로 파일 업로드(헤더 `Content-Type` 동일). 단일 클립 최대 500MB.

### POST /videos  🔒
업로드 완료 후 등록. Body: `{ "videoId": "uuid", "durationSeconds": 12 }` → 201, `status: "ready"`인 영상 반환.

### GET /videos  🔒
Query: `kind`(`source | result`, 선택), `cursor`(선택), `limit`(기본 20, 최대 50). `kind`를 생략하면 전체 영상을 반환합니다. `{ "data": { "items": [Video...], "nextCursor": "uuid|null" } }`

### GET /videos/:id  🔒 · DELETE /videos/:id  🔒
상세 조회 / 삭제(S3 원본 삭제 + 소프트 삭제). 타 유저 리소스는 404.

**Video 객체**: `{ id, kind, originalUrls[], editedUrl, thumbnailUrl, durationSeconds, stylePreset, status, createdAt }`
`originalUrls`, `editedUrl`, `thumbnailUrl`은 private S3/MinIO 객체에 대한 presigned GET URL이며 기본 1시간 동안 유효합니다. 만료된 URL은 목록 또는 상세 API를 다시 호출해 갱신합니다.
`kind`: `source`(직접 업로드한 편집 원본) | `result`(합성·편집 결과물)
`status`: `pending | ready | processing | done | failed`

---

## AI 편집

### POST /edit-jobs  🔒  (5req/분)
```json
{
  "clips": [
    { "videoId": "uuid-1", "startMs": 3500, "endMs": 8000 },
    { "videoId": "uuid-2", "startMs": 0 },
    { "videoId": "uuid-1", "startMs": 12000, "endMs": 15500 }
  ],
  "stylePreset": "일상",
  "outputProfile": "short_vertical",
  "fitMode": "blur_background",
  "subtitles": false
}
```
→ 202 `{ "data": { "jobId": "uuid" } }`

- `clips`는 최종 합성 순서이며 최대 10개입니다. 같은 영상을 서로 다른 구간으로 반복 사용할 수 있습니다.
- `startMs`는 생략하면 0, `endMs`는 생략하면 실제 영상 끝까지 사용합니다. 지정한 구간은 최소 100ms여야 합니다.
- 이전 클라이언트의 `{ "videoIds": [...] }` 요청도 지원하지만 전체 영상을 사용하며, `clips`와 동시에 보낼 수 없습니다.
- `subtitles`(선택, 기본 false): true면 한국어 음성 인식으로 소프트 자막(mov_text 트랙) 삽입. 영상에 굽지 않으므로 플레이어에서 켜야 보이며, 처리 시간이 늘어난다.

`outputProfile` 기본값은 `short_vertical`(1080×1920), `fitMode` 기본값은 `blur_background`입니다. 작업 상태 응답에는 재현 가능한 `pipelineVersion`, `editSpec`, `renderSpec` 스냅샷이 포함됩니다.
- 소유·`source`·`ready` 상태 영상만 허용(아니면 403).
- **크레딧 100을 예약(차감)한다.** 잔액이 모자라면 `402 INSUFFICIENT_CREDITS` 이며 작업 자체가
  만들어지지 않는다(예약과 작업 생성이 한 트랜잭션). 에러 응답에 `required`·`balance`가 함께 온다:
  ```json
  { "success": false, "error": { "code":"INSUFFICIENT_CREDITS","message":"크레딧이 부족합니다.",
    "required":100, "balance":40 } }
  ```
- 작업이 **실패하거나 취소되면 예약분은 전액 자동 환급**된다. 자동 재시도로 추가 차감되지 않는다.
- 해상도·워터마크 차등은 없다 — 모든 export가 동일 조건이다.

### GET /edit-jobs/:id  🔒
```json
{ "success": true, "data": {
  "id":"uuid","videoId":"uuid","status":"processing","progress":70,
  "errorMessage":null,"errorCode":null,"startedAt":"...","completedAt":null,"createdAt":"..."
}}
```
`status`: `queued | processing | done | failed | canceled`

- `errorMessage`: `failed`일 때의 서버 진단용 원문. **사용자 노출 문구가 아니다** — 화면 문구는
  `errorCode`로 분기해 앱이 만든다.
- `errorCode`: `failed`일 때의 분류 코드. `TIMEOUT`(처리 시간 초과) |
  `SOURCE_UNAVAILABLE`(원본 클립 없음) | `QUEUE_FAILED`(요청 시점 큐 적재 실패) |
  `INTERNAL`(그 외 서버 오류). append-only — 새 코드가 추가될 수 있으므로 앱은
  모르는 코드를 `INTERNAL`처럼 다룬다.

### DELETE /edit-jobs/:id  🔒
`queued`/`processing` 작업을 취소한다. → 200 `{ "data": { "canceled": true } }`

- 최종 상태는 `canceled`. 결과물 영상 레코드는 삭제 처리되어 목록에 나타나지 않는다.
- 대기 중 작업은 큐에서 제거되고, 처리 중 작업은 워커가 다음 진행률 갱신 시점에 감지해 중단한다.
  업로드 직전에 취소하면 산출물이 만들어질 수 있으나 `canceled`가 `done`으로 되살아나지는 않는다.
- 열려 있는 진행률 WebSocket에는 `{"status":"canceled"}` 후 연결 종료.
- 이미 `canceled`인 작업의 재취소는 200(멱등). `done`/`failed`는 409 `CONFLICT`. 남의 작업은 404.
- 크레딧 차감/환급 규칙 확정 전이므로 취소에 따른 환급 동작은 아직 없다
  ([decisions/credit-payment-model.md](./decisions/credit-payment-model.md) 확정 후 연결).

### WebSocket /edit-jobs/:id/progress
연결: `ws(s)://.../edit-jobs/{id}/progress?token={supabase_jwt}` (쿼리 파라미터 토큰).
서버 → 클라이언트 메시지(JSON):
```
{ "progress": 30, "step": "음악 매칭 중..." }
{ "progress": 100, "step": "완료", "outputUrl": "https://..." }
{ "status": "failed", "error": "편집 중 오류가 발생했습니다.", "code": "INTERNAL" }
{ "status": "canceled" }
```
완료/실패/취소 시 서버가 연결을 종료. `code`는 GET 응답의 `errorCode`와 같은 분류 코드.

- 이미 종료된 작업에 연결하면 최종 상태 메시지 1건만 받고 연결이 닫힌다.
  `done`이면 위 완료 메시지(`outputUrl` 포함)와 동일하다.
- 없는 작업이거나 남의 작업이면 `{ "status": "failed", "error": "편집 작업을 찾을 수 없습니다." }`
  후 연결 종료. 실제 편집 실패가 아니므로 `code`가 없다 — 앱은 `code` 유무로 구분할 수 있다.
- `errorCode` 도입 전에 실패한 옛 작업에 연결하면 `failed` 메시지에 `code`가 빠질 수 있다.
  앱은 `code` 없는 실패를 `INTERNAL`처럼 다룬다.

---

## 위치 알림

### GET /locations  🔒
Query: `lat`, `lng`(필수), `radius`(m, 기본 5000, 최대 50000). Haversine 반경 필터 + 거리순.
```json
{ "success": true, "data": [
  { "id":"uuid","name":"성수동 카페거리","lat":37.5440,"lng":127.0558,
    "radiusMeters":500,"category":"카페","distanceMeters":120 }
]}
```

### POST /notifications/geofence-enter  🔒  (10req/분)
Body: `{ "locationId": "uuid" }` → 200
```json
{ "success": true, "data": { "notified": true } }
{ "success": true, "data": { "notified": false, "reason": "cooldown" } }
```
`reason`: `cooldown`(30분 내 재진입) | `quiet_hours` | `notifications_disabled` | `no_token` | `send_failed`. 없는 위치는 404.

---

## SNS 연동

### GET /sns/connections  🔒
연동된 계정 목록: `[{ "platform":"instagram","platformUsername":"...","connectedAt":"..." }]`

### GET /sns/{instagram|tiktok}/connect  🔒
`{ "data": { "authorizeUrl": "https://..." } }` — 앱에서 이 URL로 OAuth 진행.

### GET /sns/{instagram|tiktok}/callback  (인증 불필요)
OAuth 콜백. 완료 후 앱 딥링크로 302 리다이렉트:
`snaply://sns/connected?platform=instagram` (성공) / `snaply://sns/error?platform=...&reason=<사유>` (실패).
`reason`: `invalid_state`(state 위조) | `account_type`(인스타 개인계정) | `missing_params` | `access_denied`(사용자 취소) | `exchange_failed`(토큰 교환 실패).
※ 콜백은 **항상 302 딥링크**로 응답한다 — 실패해도 JSON을 반환하지 않으므로 앱은 딥링크만 처리하면 된다.
※ 인스타그램은 비즈니스/크리에이터 계정만 허용.

### DELETE /sns/{instagram|tiktok}/disconnect  🔒
`{ "data": { "disconnected": true } }`

### POST /sns/{instagram|tiktok}/upload  🔒
Body: `{ "videoId": "uuid", "caption": "문구(선택)" }`
```json
{ "success": true, "data": { "uploadId":"uuid","platform":"instagram","status":"success","platformPostId":"..." }}
```
편집 완료(`editedUrl` 존재) 영상만 업로드 가능. 미연동 시 400.

실패 시 `sns_uploads.error_message` 에 플랫폼이 준 사유가 저장된다(최대 500자).
운영에서 업로드 실패를 추적하는 단서다.

400이 나는 경우:
- 미연동 / 편집 미완료 / 남의 영상(404)
- **영상이 공개 URL이 아님** — 인스타·틱톡이 URL을 직접 내려받으므로 `https` 공개 주소여야 한다. 로컬 MinIO 주소는 호출 전에 차단된다.
- **연동 만료** — `SNS 연동이 만료되었습니다. 계정을 다시 연동해 주세요.` → 앱은 재연동 플로우로 유도.

응답에 `requiresUserAction: true` 가 오면 **업로드는 끝났지만 사용자가 플랫폼 앱에서 마무리해야** 게시된다.
틱톡을 `video.upload`(받은함) 스코프로 운영할 때 발생하며, 앱은 "틱톡 앱에서 마무리해 주세요" 를 안내해야 한다.
(`video.publish` 심사를 통과하면 직접 게시로 바뀌고 이 필드는 오지 않는다.)

`status` 는 `success` | `pending` 두 가지로 돌아온다:
- **인스타그램**은 컨테이너 처리 완료까지 서버가 대기하므로 응답이 수십 초 걸릴 수 있다(최대 5분). 완료되면 `success`.
- **틱톡**은 영상을 자기 서버로 내려받아 게시하므로, 게시 완료까지 상태를 폴링한다(최대 2분).
  그 안에 끝나면 `success`, 아직 진행 중이면 **`pending`**(실패가 아님, `uploadedAt`은 `null`).
  앱은 `pending`이면 "업로드 중" 으로 표시하면 된다.

---

## 결제

크레딧으로 과금한다. 판매 채널은 앱 내 인앱결제(Apple StoreKit 2 / Google Play Billing)이며,
두 스토어의 영수증 검증·통지는 RevenueCat을 경유한다. **정기 구독 상품은 없다.**

**단위**: Movie export 1회 = **100크레딧**.

> **잔액과 사용 가능 여부의 원천은 항상 백엔드다.** 클라이언트·RevenueCat의 상태는 표시·동기화용이다.
> 앱은 RevenueCat SDK의 `app_user_id`를 **Snaply `User.id`로 고정**해야 한다 — 웹훅이 이 값으로
> 지급 대상을 찾는다.

### GET /billing/products  (인증 불필요)
```json
{ "success": true, "data": [
  { "productId":"credit_pack_small","credits":500,"displayOrder":1 }
]}
```
- **가격·통화는 응답에 없다.** 현지 가격의 원천은 스토어이므로 앱이 SDK `getOfferings()`로 받는다.
- `credits` 수량은 회의 확정 전 잠정값이다 — [backlog.md](./backlog.md) A-2.

### GET /billing/credits  🔒
```json
{ "success": true, "data": {
  "balance": 400,
  "entries": [{ "id":"uuid","delta":-100,"reason":"export_reserve","createdAt":"..." }]
}}
```
- `entries`는 **최신순 최대 50건이며 전체 내역이 아니다.** 페이지네이션은 없다 —
  더 오래된 내역을 받는 방법이 현재 없으므로 앱은 "최근 내역"으로 표시한다.
- `reason` (OpenAPI enum): `purchase` | `signup_bonus` | `export_reserve` | `export_refund` |
  `store_refund_revoke` | `promo` | `ad_reward`
- `balance`는 **음수가 될 수 있다** — 크레딧을 쓴 뒤 스토어 환불이 들어온 경우다. 음수면 신규
  export만 막히고 기존 결과물은 회수하지 않는다.

### POST /billing/sync  🔒
`{ "success": true, "data": { "granted": 1, "balance": 500 } }`

웹훅 유실 보정. **앱이 구매 완료 직후 호출한다.** 스토어 구매 이력을 조회해 누락된 지급을 채운다.
이미 반영된 거래는 건너뛰므로 몇 번 호출해도 잔액이 중복 증가하지 않는다(`granted: 0`).

### POST /billing/webhook/revenuecat  (RevenueCat 전용)
`Authorization` 헤더가 `REVENUECAT_WEBHOOK_AUTH_TOKEN`과 일치해야 한다(서명이 아니라 헤더 시크릿).
- 헤더 불일치·누락 → **401**, 본문은 처리하지 않는다.
- `NON_RENEWING_PURCHASE` → 크레딧 지급. 같은 `transaction_id`가 재전송돼도 **한 번만** 지급한다.
- `REFUND` → 지급분 회수. 두 번 와도 한 번만 회수한다.
- 카탈로그에 없는 상품 → **500**. 임의 수량을 지급하지 않고 RevenueCat이 재시도하게 둔다
  (매핑을 배포하면 그 재시도가 지급으로 이어진다).
- 그 밖의 이벤트는 무시하고 200.
- 전역 rate limit 제외 — 발신 IP가 소수라 429가 나면 재시도가 쌓인다.

---

## 보상형 광고 크레딧

정책의 원천은 [decisions/ad-reward-credits.md](./decisions/ad-reward-credits.md).

> **앱이 지급을 요청하는 API는 없다.** 지급의 유일한 트리거는 AdMob SSV 콜백이고, 앱은
> 세션을 열고 상태를 조회할 뿐이다. 지급량도 앱이 정하지 않는다 — 세션 발급 시점에 서버가
> 스냅샷한 값이다.

**앱의 흐름**: `POST /billing/ad-rewards`(광고 로드 직전) → `nonce`를 AdMob SDK의 `customData`,
`ssvUserId`를 `userId`로 전달 → 광고 시청 → 닫힘 직후 `GET /billing/ad-rewards/{rewardId}`를
짧게 폴링(~10초).

**광고가 성립하지 않은 경우**(사용자 중도 이탈 · 노필 · 로드 실패)는
`DELETE /billing/ad-rewards/{rewardId}`로 세션을 포기해 진행 중 슬롯을 즉시 비운다.
호출하지 않으면 세션 TTL(기본 300초)이 지나야 다음 세션을 받을 수 있다.

### GET /billing/ad-rewards  🔒
"광고 보고 +N크레딧" 버튼의 표시·비활성·남은 횟수·다음 가능 시각을 정하는 **유일한 근거**.
```json
{ "success": true, "data": {
  "enabled": true, "rewardCredits": 20, "dailyLimit": 5, "remainingToday": 2,
  "nextAvailableAt": "2026-08-14T09:15:00.000Z", "resetsAt": "2026-08-15T00:00:00.000Z"
}}
```
- **앱은 보상량·한도·쿨다운을 하드코딩하지 않는다.** 값은 2026-08-18에 전부 확정됐지만
  ([decisions/ad-reward-credits.md](./decisions/ad-reward-credits.md) §7) env 로 바뀔 수 있다 —
  앱은 항상 이 응답을 그대로 그린다.
- `enabled: false` → 진입점 자체를 숨긴다(킬 스위치). 이때 세션 발급은 `503`.
- `nextAvailableAt`은 쿨다운 중일 때만 채워진다. `null`이면 지금 가능.
- `resetsAt`은 **KST 자정** 기준이다. 한도는 "실제로 지급된 횟수"로만 센다 — 광고를 끝까지
  보지 못했거나 콜백이 유실된 세션은 한도를 깎지 않는다.
- `remainingToday: 0`이면 버튼을 비활성화하되 `2/5회`처럼 진척도로 보이지 않게 한다(서버는 숫자만 준다).
  한도를 다 쓰면 정확히 export 1편(100크레딧)이 되지만 **"광고 5편 = 무비 1편"으로 묶어 표시하지 않는다.**

### POST /billing/ad-rewards  🔒
보상 세션 발급. **요청 본문 없음.**
```json
{ "success": true, "data": {
  "rewardId": "uuid", "nonce": "9c1b…", "ssvUserId": "user-uuid",
  "rewardCredits": 20, "expiresAt": "2026-08-14T09:25:00.000Z"
}}
```
- `nonce` → SDK `customData`, `ssvUserId` → SDK `userId`. `rewardId`는 폴링 전용이며
  `nonce`와 분리돼 있다(폴링 경로에 SSV 비밀을 흘리지 않기 위해).
- `expiresAt` 이후 도착한 SSV는 지급되지 않는다. TTL은 기본 **300초**이며 쿨다운을 넘기지
  않는다 — 넘기면 콜백이 유실된 사용자가 지급받은 사용자보다 오래 잠긴다
  ([decisions/ad-reward-credits.md](./decisions/ad-reward-credits.md) §4-1).

| 상태 | code | 조건 | `error`의 추가 필드 |
|---:|---|---|---|
| 409 | `AD_REWARD_COOLDOWN` | 쿨다운 중 | `nextAvailableAt` |
| 409 | `AD_REWARD_LIMIT_REACHED` | 일일 한도 소진 | `resetsAt` |
| 409 | `AD_REWARD_SESSION_ACTIVE` | 아직 pending인 세션이 있음 | `rewardId` (이걸 계속 폴링하면 된다) |
| 503 | `AD_REWARDS_DISABLED` | 킬 스위치 off | — |

### GET /billing/ad-rewards/{rewardId}  🔒
```json
{ "success": true, "data": {
  "rewardId": "uuid", "status": "granted", "credits": 20, "balance": 80
}}
```
- `status`: `pending` | `abandoned` | `granted` | `expired` | `rejected`
- `abandoned`는 앱이 세션을 포기해 슬롯을 비운 상태다. **실패가 아니다** — 만료 전에 SSV가
  도착하면 그대로 `granted`가 된다.
- `credits`는 `granted`일 때만 채워진다. `balance`는 **항상** 현재 잔액(앱이 별도 호출을 줄이도록).
- **`pending`은 실패가 아니다.** AdMob이 실패한 콜백을 재전송한다고 가정하지 않으므로 폴링이
  타임아웃하면 "지급 확인 중"으로 표시하고 끝낸다. IAP의 `POST /billing/sync` 같은 보정 경로는
  광고 쪽에 **의도적으로 없다**(앱이 지급을 트리거할 수 있으면 그 자체가 공격면이 된다).
- 남의 `rewardId`는 **404**다(403으로 존재를 알리지 않는다).

### DELETE /billing/ad-rewards/{rewardId}  🔒
세션 포기. 앱이 SDK로부터 **결과가 확정됐음**(중도 이탈 · 노필 · 로드 실패)을 알았을 때 호출해
진행 중 슬롯을 즉시 비운다. 응답 본문은 `GET /billing/ad-rewards/{rewardId}`와 같은 모양이다.
```json
{ "success": true, "data": {
  "rewardId": "uuid", "status": "abandoned", "credits": null, "balance": 0
}}
```
- **지급 자격은 남는다.** 포기는 슬롯만 비운다 — 만료 전에 SSV가 도착하면 그대로 지급된다
  (사용자는 실제로 광고를 봤을 수 있다). 포기 후 새 세션을 열어도 하루 지급 횟수는
  지급 시점의 한도 재확인이 막는다.
- **멱등이다.** 이미 확정된(`granted`·`expired`·`rejected`) 세션이나 이미 포기한 세션에 다시
  호출해도 200이고 현재 상태를 그대로 돌려준다. 앱이 재시도를 특별히 다룰 필요가 없다.
- 남의 `rewardId`는 **404**다(상태도 바뀌지 않는다).
- 이 경로는 **지급을 만들 수 없다** — 자기 세션의 슬롯을 비우는 것뿐이라 "앱은 지급을 요청할 수
  없다"는 설계를 깨지 않는다.

### GET /billing/webhook/admob  (AdMob 전용)
보상형 광고 SSV 콜백. **GET + 쿼리스트링**이며 인증 미들웨어가 없다 — 인증이 곧 서명이다.
- 서명(ECDSA-SHA256)·timestamp(±10분)·세션·사용자 일치·광고 단위 허용 목록·일일 한도·계정 상태를
  전부 통과해야 지급한다. 지급량은 `reward_amount`가 아니라 세션에 스냅샷된 값이다.
- 같은 세션의 재전송 → 지급 없이 **200**.
- 검증 실패 → **400**. 원장에는 아무것도 쓰지 않고 `ad_rewards.status = rejected`만 남긴다.
- 전역 rate limit 제외(`/billing/webhook` 접두사).

---

## 공통

### GET /health  (인증 불필요)
`{ "success": true, "data": { "status":"ok","uptimeSeconds":123,"db":"connected" } }`

### 공개 페이지 (HTML, 인증 불필요)

플랫폼 콘솔(틱톡 Login Kit, Meta 앱 검수)이 앱 설정 **저장** 단계에서 요구하는 페이지들.
FE가 호출할 일은 없지만, 앱 내 링크로 노출할 수 있다.

| 경로 | 내용 |
|---|---|
| `GET /` | 서비스 소개 |
| `GET /legal/terms` | 이용약관 |
| `GET /legal/privacy` | 개인정보처리방침 |

> ⚠️ 약관·개인정보처리방침은 **법률 검토를 받지 않은 출시 전 초안**이다(페이지 상단에도 표기).
> 앱 심사 제출·서비스 출시 전 정식 문서로 교체해야 한다.

### 인스타그램 웹훅 (Meta 전용)

| 경로 | 용도 |
|---|---|
| `GET /sns/instagram/webhook` | 콘솔 등록 시 검증 핸드셰이크 (`hub.challenge` 를 평문 반환) |
| `POST /sns/instagram/webhook` | 이벤트 수신. `X-Hub-Signature-256` 검증 후 200 (현재 처리하는 이벤트 없음) |

릴스 게시 자체에는 웹훅이 필요 없다. 콘솔이 등록을 요구할 때 통과시키기 위한 것이다.
`INSTAGRAM_WEBHOOK_VERIFY_TOKEN` 미설정 시 403.
