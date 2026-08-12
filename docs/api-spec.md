# Snaply API 명세 (FE 전달용)

> 이 문서는 **FE 전달용 요약 + WebSocket 계약**이다. 스키마의 원천은 코드에서 생성되는
> Swagger(`/docs`)이므로, 라우트나 요청/응답을 바꾸면 **같은 커밋에서 이 문서도 갱신한다.**
> 제한·플랜 정책의 원천은 [decisions/plan-limits.md](./decisions/plan-limits.md).

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
  "quietStart": 22, "quietEnd": 8, "plan": "free"
}}
```

### PATCH /auth/me  🔒
프로필 수정. Body(모두 선택): `{ "nickname": "다연", "avatarUrl": "https://...", "interests": ["여행"] }` → 수정된 프로필 반환.

### DELETE /auth/me  🔒
계정 삭제 요청. 즉시: 구독 해지(Stripe 즉시 취소), SNS 연동·FCM 토큰 삭제, 진행 중 편집 작업 취소.
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
FCM 토큰·SNS 연동·구독은 삭제 시점에 이미 정리됐으므로 되살아나지 않는다(재등록 필요).
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
- **플랜 차등은 현재 전혀 집행되지 않는다** — 편집 횟수 제한 미적용, 해상도·워터마크 미구현.
  즉 무료 플랜과 유료 플랜의 편집 동작이 같다. 현행 상태와 재도입 계획은
  [decisions/plan-limits.md](./decisions/plan-limits.md).

### GET /edit-jobs/:id  🔒
```json
{ "success": true, "data": {
  "id":"uuid","videoId":"uuid","status":"processing","progress":70,
  "errorMessage":null,"startedAt":"...","completedAt":null,"createdAt":"..."
}}
```
`status`: `queued | processing | done | failed`

### WebSocket /edit-jobs/:id/progress
연결: `ws(s)://.../edit-jobs/{id}/progress?token={supabase_jwt}` (쿼리 파라미터 토큰).
서버 → 클라이언트 메시지(JSON):
```
{ "progress": 30, "step": "음악 매칭 중..." }
{ "progress": 100, "step": "완료", "outputUrl": "https://..." }
{ "status": "failed", "error": "편집 중 오류가 발생했습니다." }
```
완료/실패 시 서버가 연결을 종료.

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

### GET /billing/plans  (인증 불필요)
`[{ "plan":"free","name":"Free","priceKrw":0,"features":[...] }, ...]` (standard ₩9,900 / premium ₩24,900)

> ⚠️ `features` 는 **FE 표시용 문구일 뿐 백엔드가 집행하지 않는다.** 현재 실동작과 불일치하므로
> (편집 횟수·해상도·워터마크 전부 미적용) 그대로 화면에 노출하면 실제와 다른 약속이 된다.
> 정책 확정 시 문구와 집행을 함께 맞춘다 — [decisions/plan-limits.md](./decisions/plan-limits.md).

### GET /billing/subscription  🔒
`{ "data": { "plan":"standard","status":"active","currentPeriodEnd":"..." } }`

### POST /billing/checkout  🔒
Body: `{ "plan": "standard|premium" }` → `{ "data": { "checkoutUrl": "https://checkout.stripe.com/..." } }`
success/cancel 시 앱 딥링크(`snaply://billing/success|cancel`)로 복귀.

### POST /billing/cancel  🔒
기간 만료 후 해지 예약. `{ "data": { "canceling": true } }`

### POST /billing/webhook  (Stripe 전용, 서명 검증)
Stripe에서 호출. `customer.subscription.created/updated/deleted`, `invoice.payment_failed` 처리.
- 서명 실패 → 400 (Stripe 재시도 유도), 그 외에는 항상 200.
- 전역 rate limit 제외 — 발신 IP가 소수라 429가 나면 재시도가 쌓인다.
- 이벤트 순서를 보장하지 않으므로, 이미 반영한 것보다 **오래된 이벤트는 무시**한다(`subscriptions.last_stripe_event_at`).

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
