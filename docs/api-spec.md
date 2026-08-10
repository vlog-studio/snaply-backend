# Snaply API 명세 (FE 전달용)

> **인터랙티브 문서(Swagger UI)**: 개발 서버 실행 후 **`http://localhost:3000/docs`** 에서 직접 호출·테스트할 수 있습니다. OpenAPI 스펙 JSON은 `http://localhost:3000/docs/json` (Postman/코드 생성용). 운영에서는 비활성(필요 시 `ENABLE_DOCS=true`). WebSocket은 OpenAPI로 표현되지 않아 아래 문서를 참고하세요.

- **Base URL**: `{API_BASE_URL}` (개발: `http://localhost:3000`)
- **인증**: 인증 필요 엔드포인트는 `Authorization: Bearer {supabase_jwt}` 헤더 필수. 토큰은 Supabase Auth 로그인으로 발급.
- **응답 형식(공통)**
  - 성공: `{ "success": true, "data": ... }`
  - 실패: `{ "success": false, "error": { "code": "STRING", "message": "..." } }`
- **에러 코드**: `UNAUTHORIZED`(401), `FORBIDDEN`(403), `NOT_FOUND`(404), `BAD_REQUEST`/`VALIDATION_ERROR`(400), `RATE_LIMITED`(429), `INTERNAL_SERVER_ERROR`(500)
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
  "fitMode": "blur_background"
}
```
→ 202 `{ "data": { "jobId": "uuid" } }`

- `clips`는 최종 합성 순서이며 최대 10개입니다. 같은 영상을 서로 다른 구간으로 반복 사용할 수 있습니다.
- `startMs`는 생략하면 0, `endMs`는 생략하면 실제 영상 끝까지 사용합니다. 지정한 구간은 최소 100ms여야 합니다.
- 이전 클라이언트의 `{ "videoIds": [...] }` 요청도 지원하지만 전체 영상을 사용하며, `clips`와 동시에 보낼 수 없습니다.

`outputProfile` 기본값은 `short_vertical`(1080×1920), `fitMode` 기본값은 `blur_background`입니다. 작업 상태 응답에는 재현 가능한 `pipelineVersion`, `editSpec`, `renderSpec` 스냅샷이 포함됩니다.
- 소유·`source`·`ready` 상태 영상만 허용(아니면 403). Free 플랜 월 3편 초과 시 403.

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
`snaply://sns/connected?platform=instagram` (성공) / `snaply://sns/error?platform=...&reason=account_type|invalid_state` (실패).
※ 인스타그램은 비즈니스/크리에이터 계정만 허용.

### DELETE /sns/{instagram|tiktok}/disconnect  🔒
`{ "data": { "disconnected": true } }`

### POST /sns/{instagram|tiktok}/upload  🔒
Body: `{ "videoId": "uuid", "caption": "문구(선택)" }`
```json
{ "success": true, "data": { "uploadId":"uuid","platform":"instagram","status":"success","platformPostId":"..." }}
```
편집 완료(`editedUrl` 존재) 영상만 업로드 가능. 미연동 시 400.

---

## 결제

### GET /billing/plans  (인증 불필요)
`[{ "plan":"free","name":"Free","priceKrw":0,"features":[...] }, ...]` (standard ₩9,900 / premium ₩24,900)

### GET /billing/subscription  🔒
`{ "data": { "plan":"standard","status":"active","currentPeriodEnd":"..." } }`

### POST /billing/checkout  🔒
Body: `{ "plan": "standard|premium" }` → `{ "data": { "checkoutUrl": "https://checkout.stripe.com/..." } }`
success/cancel 시 앱 딥링크(`snaply://billing/success|cancel`)로 복귀.

### POST /billing/cancel  🔒
기간 만료 후 해지 예약. `{ "data": { "canceling": true } }`

### POST /billing/webhook  (Stripe 전용, 서명 검증)
Stripe에서 호출. `customer.subscription.created/updated/deleted`, `invoice.payment_failed` 처리.

---

## 공통

### GET /health  (인증 불필요)
`{ "success": true, "data": { "status":"ok","uptimeSeconds":123,"db":"connected" } }`
