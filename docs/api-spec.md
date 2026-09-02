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

## 스냅 내용 분석

업로드된 source 스냅의 대표 프레임을 AI 워커가 분석해 주제·장소·사물·행동·분위기와 **편집 사용
가능 여부**를 남긴다. 결과는 **자동 편집 추천의 입력**이며 사용자에게 보여주기 위한 문구가 아니다.
정책: [decisions/snap-content-analysis.md](./decisions/snap-content-analysis.md)

**업로드 시 자동으로 분석하지 않는다.** 편집에 쓸 후보가 정해진 시점에 앱(또는 이후의 추천 경로)이
분석을 요청한다. 스냅은 대량으로 올라오고 실제 편집에 쓰이는 것은 일부라, 업로드마다 분석하면
버려질 스냅까지 과금된다.

### POST /videos/:videoId/analysis  🔒
분석 요청. **비동기** — `202` + `{ analysisId, version, status }` 만 돌려주고 실제 분석은 분석
워커가 큐에서 꺼내 처리한다. 상태는 아래 조회 API 로 폴링한다.

**멱등하다.** 같은 영상에 여러 번 호출해도 분석은 버전당 한 번만 돈다.
- 진행 중(`queued`/`processing`) → 같은 `analysisId` 를 그대로 반환
- `failed` 이고 `error.retryable: true` → 같은 레코드를 `queued` 로 되돌려 재시도 (**별도 retry API 는 없다**)
- `done` → 다시 돌리지 않고 그대로 반환
- `failed` 이고 재시도 무의미(손상된 영상·정책 거절) → **409**

에러: 업로드 미확정(`status != ready`) 400 · 타 유저·`kind=result`·없는 영상 404 ·
되돌릴 수 없는 실패 409 · 큐 접근 불가 503(`QUEUE_UNAVAILABLE`, 잠시 후 재요청)

### GET /videos/:videoId/analysis  🔒
최신 버전 분석 1건. 분석을 요청한 적이 없으면 404.

```json
{ "success": true, "data": {
  "id": "uuid", "videoId": "uuid", "version": 1, "status": "done",
  "result": {
    "durationMs": 3012, "frameTimestampsMs": [301, 1105, 1907, 2711],
    "summary": "카페에서 디저트와 커피를 촬영한 영상",
    "topics": ["카페", "디저트"], "places": ["카페"],
    "objects": ["케이크", "커피"], "actions": ["디저트를 가까이 보여줌"],
    "moods": ["차분한"],
    "visualQuality": { "score": 0.86, "issues": [], "usableForEdit": true },
    "confidence": 0.91
  },
  "error": null,
  "modelVersion": "gpt-5.6-luna", "promptVersion": "v1", "attempts": 1,
  "createdAt": "2026-08-19T02:00:00.000Z", "completedAt": "2026-08-19T02:00:04.000Z"
}}
```

`status`: `queued | processing | done | failed`
- `result` 는 `done` 일 때만 채워진다. 그 전에는 `null`
- `error` 는 `failed` 일 때만 채워진다: `{ code, retryable }`.
  모델의 원문 오류 메시지는 노출하지 않는다
- `error.code`: `TIMEOUT | RATE_LIMITED | UPSTREAM_ERROR | NETWORK | SCHEMA_INVALID |
  AUTH_FAILED | BAD_REQUEST | MODEL_NOT_FOUND | SAFETY_REFUSED | EMPTY_OUTPUT |
  SOURCE_UNAVAILABLE | FRAME_EXTRACTION_FAILED | INTERNAL`
- `error.retryable: false` 면 다시 요청해도 같은 결과다 (요청 시 409)
- `durationMs` 는 워커가 FFprobe 로 **실측한** 길이다. 클라이언트가 보고한
  `Video.durationSeconds` 도 이 값으로 교정된다
- `frameTimestampsMs` 는 실제로 모델에 보낸 프레임 시점이다. 거의 같은 화면은 제거하므로
  최대 4장보다 적을 수 있다
- `visualQuality.usableForEdit` 가 추천이 1차로 보는 값이다.
  `issues` 는 고정 코드: `shaky | blurry | out_of_focus | too_dark | overexposed |
  black_frame | obstructed | subject_unclear | repetitive_frames`

**분석 실패는 원본 영상에 영향을 주지 않는다** — `Video.status` 는 `ready` 로 남고,
조회 자체는 성공이므로 HTTP 200 이다. 기존 `Video` 응답에는 분석 관련 필드가 추가되지 않았다.

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

## 무비 템플릿

사용자가 "템플릿으로 시작"할 때 고르는 무비의 **형태**다. 슬롯의 `label`·`hint` 는 사람에게
보여주는 **촬영 지시**이지, 그 자리에 들어간 스냅의 내용에 대한 주장이 아니다.
정책: [decisions/template-snap-recommendation.md](./decisions/template-snap-recommendation.md)

카탈로그는 앱의 로컬 상수에서 서버로 옮겨왔다. 슬롯의 매칭 규칙과 슬롯 정의가 서로 다른
런타임 소유자에 있으면 한쪽만 고쳐지고, 모노레포여도 앱 릴리스와 서버 배포 시점이 갈리기 때문이다.

### GET /movie-templates  🔒
내리지 않은 템플릿을 정렬 순서대로.

```json
{ "success": true, "data": {
  "updatedAt": "2026-08-19T00:00:00.000Z",
  "templates": [
    { "id": "walk", "name": "동네 산책", "description": "걸으며 담은 여섯 장면",
      "style": "감성", "bgm": "lofi-walk",
      "slots": [
        { "id": "start", "label": "출발", "hint": "집 앞이나 지하철 출구" },
        { "id": "alley", "label": "골목", "hint": "좁은 길, 걷는 발" }
      ] }
  ]
}}
```

- **앱은 이 응답을 캐시하고, 실패하면 내장 카탈로그로 폴백한다.** 그래서 이 API 가 죽어도
  템플릿 화면은 동작한다. 캐시 갱신 판단은 `updatedAt`(목록에서 가장 최근에 바뀐 템플릿의
  시각)으로 한다.
- `id` 와 슬롯 `id` 는 앱의 내장 폴백 카탈로그와 **같은 값**이다. 같아야 서버 응답과 폴백이
  같은 템플릿을 가리킨다.
- `style` 은 `POST /edit-jobs` 가 받는 프리셋 이름 그대로다(`감성`·`여행`·`일상`). 서버가
  프리셋을 새로 추가했는데 앱이 모를 수 있으므로 **모르는 프리셋의 템플릿은 앱이 건너뛴다** —
  서버는 거르지 않는다.
- `bgm` 은 앱에서만 쓰는 트랙 키다. 편집 파이프라인은 BGM 을 받지 않는다.
- `slots` 는 촬영 순서다.
- 점수화가 쓰는 매칭 힌트(`matchHints`)는 **응답에 없다.** 내부값이고, 앱이 읽으면 가중치
  조정이 다시 앱 릴리스에 묶인다.
- 카탈로그 행은 마이그레이션이 넣는다. 생성·수정 API 는 없다.

---

## 스냅 추천 (템플릿 슬롯 채우기)

템플릿의 각 슬롯에 어떤 스냅을 넣을지 서버가 제안한다. 결과의 근거는 [스냅 내용 분석](#스냅-내용-분석)이고,
정책은 [decisions/template-snap-recommendation.md](./decisions/template-snap-recommendation.md).

**앱은 이 결과를 기다리지 않는다.** 로컬 매칭(촬영 시각·좌표)이 먼저 화면을 채우고, 도착한
추천은 **사용자가 손대지 않은 슬롯에만** 얹힌다. 그래서 이 API 가 느리거나 죽어도, 꺼져 있어도
템플릿 화면은 그대로 동작한다.

**후보는 앱이 고른다.** 서버는 스냅이 언제 어디서 찍혔는지 모른다(`POST /videos` 가 촬영
시각·좌표를 받지 않는다). 한 번의 외출을 묶는 계산은 앱만 할 수 있다.

**크레딧을 차감하지 않는다.** 비용은 후보 수 상한(12)과 최근 24시간 추천 횟수 상한(20)으로 막는다.

**`MOVIE_RECOMMENDATION_ENABLED=true` 일 때만 동작한다.** 기본은 꺼짐이며, 꺼져 있으면
`503 RECOMMENDATION_DISABLED` 다. 이 경로는 생산 스냅의 프레임을 외부 모델로 보내므로
약관 개정·제3자 제공 고지 전에는 켜지 않는다.

### POST /movie-recommendations  🔒  (10req/분)
```json
{ "templateId": "cafe", "candidates": ["uuid-1", "uuid-2", "uuid-3"] }
```
→ 202 `{ "data": { "id": "uuid", "status": "processing" } }`

- `candidates` 는 **촬영 시간 오름차순**이어야 한다. 이 순서가 점수화의 시간 사전값이다.
- **멱등하다.** 같은 (유저·템플릿·후보 집합)이 24시간 안에 다시 오면 새로 만들지 않고 기존
  추천을 돌려준다. 순서만 다른 재요청도 같은 집합으로 본다.
- 소유·`kind=source`·`status=ready` 인 스냅만 후보가 된다(아니면 403, 어느 것이 문제인지는
  알려주지 않는다).
- 에러: 후보 0개 400 · 후보 초과 **400 `TOO_MANY_CANDIDATES`** (`max` 동봉) ·
  없거나 내린 템플릿 404 · 최근 24시간 한도 초과 **429 `RECOMMENDATION_LIMIT`**
  (`RATE_LIMITED` 와 다르다 — 잠시 후 재시도로 풀리지 않는다) ·
  분석 큐 접근 불가 503 · 기능 꺼짐 503 `RECOMMENDATION_DISABLED`

```json
{ "success": false, "error": { "code":"TOO_MANY_CANDIDATES",
  "message":"후보 스냅은 한 번에 12개까지 보낼 수 있습니다.", "max":12 } }
```

### GET /movie-recommendations/:id  🔒
```json
{ "success": true, "data": {
  "id": "uuid", "templateId": "cafe", "status": "done",
  "slots": [
    { "slotId": "front", "videoId": "uuid-1", "score": 0.82 },
    { "slotId": "menu",  "videoId": "uuid-2", "score": 0.71 },
    { "slotId": "room",  "videoId": null,     "score": null }
  ],
  "excluded": [ { "videoId": "uuid-9", "reason": "unusable" } ],
  "createdAt": "2026-08-19T02:00:00.000Z", "completedAt": "2026-08-19T02:00:12.000Z"
}}
```

`status`: `processing | done | failed`
- `processing` 동안 `slots` 는 **빈 배열**이다. 앱은 로컬 매칭 결과를 그대로 두고 계속 폴링한다.
- **채점은 이 조회 시점에 일어난다.** 후보 분석이 다 끝났으면 배정하고 `done` 으로 굳힌다.
  접수 후 일정 시간이 지나면 끝난 분석만으로 채점하고 닫는다 — 분석 워커가 죽었을 때 추천이
  영원히 걸려 있으면 안 된다.
- `slots` 는 템플릿의 슬롯 순서 그대로다. `videoId: null` 은 **그 자리에 넣을 후보가 없었다**는
  뜻이고, 화면에서는 `지금 찍기` 로 남는다. 못 쓸 스냅으로 채우지 않는다.
- `score` 는 0~1 **슬롯 적합도**다. 스냅이 무엇을 담고 있는지에 대한 주장이 **아니다** —
  슬롯 이름은 사람에게 주는 촬영 지시이고, 서버는 "이 스냅이 골목이다"라고 말하지 않는다.
- `excluded[].reason`: `unusable`(분석이 편집에 못 쓴다고 판단) ·
  `analysis_failed`(분석 실패 또는 시한 초과) · `no_match`(슬롯보다 후보가 많아 자리 없음)
- 분석의 `summary`·`topics` 등 모델 출력은 **이 응답에 나오지 않는다.** 추천은 내부 신호이지
  사용자에게 보여주는 문구가 아니다.

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
