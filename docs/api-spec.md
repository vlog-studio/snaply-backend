# Snaply API 안내 (FE 전달용)

> 이 문서는 **FE 가 다뤄야 할 동작 + WebSocket 계약**이다. 엔드포인트의 정확한 형태
> (경로·메서드·요청·응답 필드·enum·에러 코드별 부가 필드)의 원천은
> [`packages/shared-types/src/contract/`](../packages/shared-types/src/contract/)의 Zod 계약이고,
> 백엔드의 검증·직렬화·Swagger(`/docs`)·[`apps/api/openapi.json`](../apps/api/openapi.json)·앱의
> `apiRequest` 타입이 전부 거기서 나온다. **이 문서는 형태를 다시 적지 않는다** — 필드가 궁금하면
> 계약 파일이나 Swagger 를 본다. 여기에는 계약만 봐서는 모르는 것, 즉 호출 순서·멱등성·에러의
> 의미·앱이 하드코딩하면 안 되는 값·비동기 흐름을 적는다.
> 제품 요구·정책 값의 원천은 [specs/](./specs/README.md)이고 배경은 [decisions/](./decisions/)다.
> 라우트나 동작을 바꾸면 계약·스냅샷과 **같은 커밋에서 이 문서도 갱신한다.**

> **인터랙티브 문서(Swagger UI)**: 개발 서버 실행 후 **`http://localhost:3000/docs`** 에서 직접
> 호출·테스트할 수 있다. OpenAPI JSON 은 `http://localhost:3000/docs/json`, 커밋된 스냅샷은
> `apps/api/openapi.json`(Postman/외부 소비자용). 운영에서는 비활성(필요 시 `ENABLE_DOCS=true`).
> WebSocket 은 OpenAPI 로 표현되지 않아 아래 절이 계약의 설명이다.

- **Base URL**: `{API_BASE_URL}` (개발: `http://localhost:3000`)
- **인증**: 🔒 표시 엔드포인트는 `Authorization: Bearer {supabase_jwt}` 헤더 필수. 토큰은 Supabase Auth 로그인으로 발급.
- **응답 형식(공통)**: 성공 `{ "success": true, "data": … }` / 실패 `{ "success": false, "error": { "code", "message", …부가 필드 } }`.
  부가 필드는 상태 코드별로 계약(`common.ts`의 `*ErrorSchema`)에 선언된 것만 온다 — 예: `403 ACCOUNT_PENDING_DELETION` 의 `purgeAfter`, `402 INSUFFICIENT_CREDITS` 의 `required`·`balance`.
- **공통 에러 코드**: `UNAUTHORIZED`(401) · `FORBIDDEN`(403) · `ACCOUNT_PENDING_DELETION`(403, 삭제 대기 계정 — 복구는 `POST /auth/me/restore`) · `NOT_FOUND`(404) · `BAD_REQUEST`/`VALIDATION_ERROR`(400) · `RATE_LIMITED`(429) · `INTERNAL_SERVER_ERROR`(500).
  타 유저의 리소스는 **403 이 아니라 404** 다(존재를 알리지 않는다).
- **Rate limit**: 기본 IP당 60req/분. `POST /edit-jobs` 유저당 5req/분, `POST /notifications/geofence-enter`·`POST /movie-recommendations` 유저당 10req/분. 초과 시 `429 RATE_LIMITED`. 도메인 한도(`429 RECOMMENDATION_LIMIT`)는 다른 코드다 — 잠시 후 재시도로 풀리지 않는다.
- **알 수 없는 enum 값**: 서버가 값을 늘릴 수 있는 곳(편집 상태·에러 코드·템플릿 스타일 등)에서 앱은 모르는 값을 **버리지 말고 보수적으로 해석**한다(모르는 실패 코드는 `INTERNAL`처럼, 모르는 템플릿 스타일은 건너뛰기).

---

## 인증 / 프로필 (`contract/auth.ts`)

- `GET /auth/me` 🔒 — 첫 호출 시 유저가 자동 생성된다. 앱이 직접 부를 일은 없다: 인증된 첫 요청이 upsert 를 일으킨다. 정기 구독 제거로 `plan` 필드는 없다 — 잔액은 `GET /billing/credits`.
- `PATCH /auth/me` 🔒 — 보낸 필드만 바뀐다. `avatarUrl: null` 은 지우기다.
- `DELETE /auth/me` 🔒 — 즉시: SNS 연동·FCM 토큰 삭제, 진행 중 편집 작업 취소(예약 크레딧 환급). 이후 **30일 유예** 동안 복구 가능하고, 유예가 지나면 배치가 S3 원본까지 영구 삭제한다. 응답의 `purgeAfter` 가 실삭제 예정 시각.
  삭제 대기 중에 다른 인증 API 를 부르면 `403 ACCOUNT_PENDING_DELETION` 이고 같은 `purgeAfter` 를 에러에 싣는다 — 앱은 삭제 응답을 저장해 두지 않아도 남은 유예를 보여줄 수 있다.
- `POST /auth/me/restore` 🔒 — 유예 내 복구. FCM 토큰·SNS 연동은 되살아나지 않는다(재등록 필요). 크레딧 잔액은 보존된다. 삭제 대기 상태가 아니면 400.
- `POST /auth/fcm-token` 🔒 — 항상 덮어쓴다(기기 하나만 등록됨 — [backlog B-2](./backlog.md)).

---

## 영상 (`contract/videos.ts`)

업로드는 2단계다. ① `GET /videos/upload-url` 🔒 로 presigned URL 과 `pending` 레코드를 받고 ② 그 URL 에 파일을 **PUT**(헤더 `Content-Type` 은 ①에서 보낸 `contentType` 과 동일해야 서명이 유효) ③ `POST /videos` 🔒 로 등록하면 `ready` 가 된다. 단일 클립 최대 500MB — 초과하면 ③에서 객체와 레코드를 지우고 400. S3 에 객체가 없어도 400.

- `GET /videos` 🔒 — 최신순 커서 페이지네이션. `nextCursor` 가 `null` 이 아니면 다음 페이지가 있다. 삭제한 영상은 제외, 편집 결과물(`kind: result`)도 같은 목록에 온다.
- `originalUrls`·`editedUrl`·`thumbnailUrl` 은 **presigned GET URL**(기본 1시간 유효). 만료되면 목록/상세를 다시 호출해 갱신한다.
- `status` 의미: `pending`(URL 만 발급) → `ready`(편집 가능) / 결과물은 `processing` → `done`(`editedUrl` 사용 가능) | `failed`.
- `DELETE /videos/{id}` 🔒 — S3 원본 실삭제 + 소프트 삭제. 되돌릴 수 없다.

---

## 스냅 내용 분석 (`contract/video-analyses.ts`)

업로드된 source 스냅의 대표 프레임을 AI 워커가 분석해 주제·장소·사물·행동·분위기와 **편집 사용
가능 여부**를 남긴다. 결과는 **자동 편집 추천의 입력**이며 사용자에게 보여주기 위한 문구가 아니다.
**업로드 시 자동으로 분석하지 않는다** — 편집에 쓸 후보가 정해진 시점에 요청한다.
요구: [specs/template-and-recommendation.md](./specs/template-and-recommendation.md) §스냅 내용 분석 ·
배경: [decisions/snap-content-analysis.md](./decisions/snap-content-analysis.md)

- `POST /videos/{videoId}/analysis` 🔒 — **비동기**. `202` + `{ analysisId, version, status }` 만 돌려주고 상태는 `GET` 으로 폴링한다.
  **멱등하다.** 진행 중이면 같은 `analysisId`, `failed` 이고 `error.retryable: true` 면 같은 레코드를 `queued` 로 되돌려 재시도(별도 retry API 없음), `done` 이면 그대로 반환, 되돌릴 수 없는 실패(손상된 영상·정책 거절)는 **409**.
  에러: 업로드 미확정(`status != ready`) 400 · 타 유저·`kind=result`·없는 영상 404 · 큐 접근 불가 `503 QUEUE_UNAVAILABLE`(잠시 후 재요청).
- `GET /videos/{videoId}/analysis` 🔒 — 최신 버전 1건. 요청한 적 없으면 404. `failed` 여도 조회는 200 이다.
  - `result` 는 `done` 일 때만, `error` 는 `failed` 일 때만 채워진다. 모델의 원문 오류 메시지는 노출하지 않는다.
  - `error.code` 는 계약에 **문자열로 열려 있다**(알려진 값은 `vocab.ts` 의 `VIDEO_ANALYSIS_ERROR_CODES`). `retryable: false` 면 다시 요청해도 같은 결과다.
  - `result.durationMs` 는 워커가 FFprobe 로 **실측한** 길이다. `Video.durationSeconds` 도 이 값으로 교정된다.
  - `frameTimestampsMs` 는 실제로 모델에 보낸 프레임 시점이다. 거의 같은 화면은 제거하므로 최대 4장보다 적을 수 있다.
  - `visualQuality.usableForEdit` 가 추천이 1차로 보는 값이다. `issues` 는 고정 코드: `shaky | blurry | out_of_focus | too_dark | overexposed | black_frame | obstructed | subject_unclear | repetitive_frames`.
- **분석 실패는 원본 영상에 영향을 주지 않는다** — `Video.status` 는 `ready` 로 남는다.

---

## AI 편집 (`contract/edit-jobs.ts`)

- `POST /edit-jobs` 🔒 (5req/분) — **비동기**. `202` + `jobId`. `npm run worker` 가 떠 있지 않으면 `queued` 에 머문다.
  - `clips`(권장) 또는 `videoIds`(구버전, 전체 영상) 중 **하나만**. `clips` 는 최종 합성 순서이며 같은 영상을 다른 구간으로 반복 사용할 수 있다. `startMs` 생략은 0, `endMs` 생략은 영상 끝까지. 지정 구간은 최소 100ms.
  - 소유·`source`·`ready` 영상만 허용(아니면 403). `outputProfile`·`fitMode` 는 생략하면 서버 기본값(계약의 `.default()`) — 앱은 세로 숏폼만 만들므로 명시해서 보낸다.
  - **크레딧 100 을 예약(차감)한다.** 잔액이 모자라면 `402 INSUFFICIENT_CREDITS` 이며 작업이 만들어지지 않는다(예약과 생성이 한 트랜잭션). 에러의 `required`·`balance` 로 부족분을 그린다. 작업이 **실패하거나 취소되면 전액 자동 환급**, 자동 재시도로 추가 차감 없음. 해상도·워터마크 차등은 없다.
- `GET /edit-jobs/{id}` 🔒 — 폴링용. `videoId` 는 **결과물** 영상 id 다(원본이 아니다). 완료 후 `GET /videos/{videoId}` 로 `editedUrl` 을 얻는다.
  - `errorMessage` 는 서버 진단용 원문 — **사용자 노출 문구가 아니다.** 화면 문구는 `errorCode` 로 분기해 앱이 만든다. `errorCode` 는 append-only 라 앱은 모르는 코드를 `INTERNAL` 처럼 다룬다.
  - `pipelineVersion`·`editSpec`·`renderSpec` 은 재현 가능한 작업 스냅샷이다.
- `DELETE /edit-jobs/{id}` 🔒 — `queued`/`processing` 취소. 최종 상태 `canceled`, 결과물 레코드는 목록에서 사라진다. 대기 중은 큐에서 제거, 처리 중은 워커가 다음 진행률 갱신 시점에 중단(업로드 직전이면 산출물이 생길 수 있으나 `canceled` 가 `done` 으로 되살아나지 않는다). 재취소는 200(멱등), `done`/`failed` 는 `409 CONFLICT`. 예약 크레딧은 전액 환급(한 번만 기록).

### WebSocket `/edit-jobs/{id}/progress`

메시지 계약의 원천은 `contract/edit-jobs.ts` 의 `editProgressEventSchema` 다(OpenAPI 에는 없다).
연결: `ws(s)://…/edit-jobs/{id}/progress?token={supabase_jwt}` (쿼리 파라미터 토큰).
서버 → 클라이언트 메시지(JSON), 한 형태이고 어느 필드가 있는지로 종류를 읽는다 — **`status` 를 먼저 보고, 없으면 진행 메시지**:

```
{ "progress": 12, "step": "연결됨" }                     ← 연결 직후 현재 진행률 스냅샷 1건
{ "progress": 30, "step": "음악 매칭 중..." }
{ "progress": 100, "step": "완료", "outputUrl": "https://..." }
{ "status": "failed", "error": "편집 중 오류가 발생했습니다.", "code": "INTERNAL" }
{ "progress": 0, "step": "취소됨", "status": "canceled" }
```

- 완료/실패/취소 시 서버가 연결을 종료한다. `code` 는 GET 응답의 `errorCode` 와 같은 분류다.
- 이미 종료된 작업에 연결하면 최종 상태 메시지 1건만 받고 닫힌다. `done` 이면 위 완료 메시지(`outputUrl` 포함)와 동일, `canceled` 는 `{ "status": "canceled" }` 한 건.
- 없는 작업이거나 남의 작업이면 `{ "status": "failed", "error": "편집 작업을 찾을 수 없습니다." }` 후 종료. 실제 편집 실패가 아니라 `code` 가 없다 — 앱은 `code` 유무로 구분한다.
- `errorCode` 도입 전에 실패한 옛 작업은 `failed` 메시지에 `code` 가 빠질 수 있다. 앱은 `code` 없는 실패를 `INTERNAL` 처럼 다룬다.
- 소켓은 실시간 채널이지 원천이 아니다. 앱이 백그라운드에 있는 동안 끝난 작업은 소켓으로 알 수 없으므로 포그라운드 복귀 시 `GET /edit-jobs/{id}` 로 확인한다.

---

## 무비 템플릿 (`contract/movie-templates.ts`)

사용자가 "템플릿으로 시작"할 때 고르는 무비의 **형태**다. 슬롯의 `label`·`hint` 는 사람에게
보여주는 **촬영 지시**이지, 그 자리에 들어간 스냅의 내용에 대한 주장이 아니다. 카탈로그는 서버가
소유하고 마이그레이션이 넣는다(생성·수정 API 없음). 요구:
[specs/template-and-recommendation.md](./specs/template-and-recommendation.md) §템플릿 ·
배경: [decisions/template-snap-recommendation.md](./decisions/template-snap-recommendation.md)

- `GET /movie-templates` 🔒 — 내리지 않은 템플릿을 정렬 순서대로.
  - **앱은 응답을 캐시하고, 실패하면 내장 카탈로그로 폴백한다.** 캐시 갱신 판단은 `updatedAt`.
  - 템플릿 `id` 와 슬롯 `id` 는 앱의 내장 폴백 카탈로그와 **같은 값**이어야 한다.
  - `style` 은 `POST /edit-jobs` 프리셋 이름 그대로. 서버가 새 프리셋을 추가했는데 앱이 모를 수 있으므로 **모르는 프리셋의 템플릿은 앱이 건너뛴다** — 서버는 거르지 않는다.
  - `bgm` 은 앱에서만 쓰는 트랙 키. 점수화용 매칭 힌트(`matchHints`)는 **응답에 없다**(내부값).

---

## 스냅 추천 (`contract/movie-recommendations.ts`)

템플릿의 각 슬롯에 어떤 스냅을 넣을지 서버가 제안한다. 근거는 [스냅 내용 분석](#스냅-내용-분석-contractvideo-analysests),
요구는 [specs/template-and-recommendation.md](./specs/template-and-recommendation.md) §스냅 자동 추천,
배경은 [decisions/template-snap-recommendation.md](./decisions/template-snap-recommendation.md).

**앱은 이 결과를 기다리지 않는다.** 로컬 매칭(촬영 시각·좌표)이 먼저 화면을 채우고, 도착한 추천은
**사용자가 손대지 않은 슬롯에만** 얹힌다. **후보는 앱이 고른다** — 서버는 스냅이 언제 어디서
찍혔는지 모른다. **크레딧을 차감하지 않는다** — 비용은 후보 수 상한(계약의
`MAX_RECOMMENDATION_CANDIDATES`)과 최근 24시간 추천 횟수 상한(20)으로 막는다.
**`MOVIE_RECOMMENDATION_ENABLED=true` 일 때만 동작한다.** 꺼져 있으면 `503 RECOMMENDATION_DISABLED`.

- `POST /movie-recommendations` 🔒 (10req/분) — **비동기**. `202` + `{ id, status }`.
  - `candidates` 는 **촬영 시간 오름차순**이어야 한다(점수화의 시간 사전값).
  - **멱등하다.** 같은 (유저·템플릿·후보 집합)이 24시간 안에 다시 오면 기존 추천을 돌려준다. 순서만 다른 재요청도 같은 집합이다.
  - 소유·`kind=source`·`status=ready` 스냅만 후보(아니면 403, 어느 것이 문제인지는 알려주지 않는다).
  - 에러: 후보 0개 400 · 후보 초과 **`400 TOO_MANY_CANDIDATES`**(`max` 동봉 — 앱은 상한을 하드코딩하지 않는다) · 없거나 내린 템플릿 404 · 24시간 한도 **`429 RECOMMENDATION_LIMIT`** · 분석 큐 접근 불가 503 · 기능 꺼짐 `503 RECOMMENDATION_DISABLED`.
- `GET /movie-recommendations/{id}` 🔒
  - `processing` 동안 `slots` 는 **빈 배열**이다. 앱은 로컬 매칭을 그대로 두고 폴링한다.
  - **채점은 이 조회 시점에 일어난다.** 접수 후 일정 시간이 지나면 끝난 분석만으로 채점하고 닫는다 — 분석 워커가 죽어도 추천이 영원히 걸리지 않는다.
  - `slots` 는 템플릿 슬롯 순서 그대로. `videoId: null` 은 **넣을 후보가 없었다**는 뜻이고 화면에서는 `지금 찍기` 로 남는다.
  - `score` 는 **슬롯 적합도**다. 스냅이 무엇을 담고 있는지에 대한 주장이 아니다.
  - 분석의 `summary`·`topics` 등 모델 출력은 **응답에 없다.**

---

## 위치 알림 (`contract/locations.ts`)

- `GET /locations` 🔒 — `lat`·`lng` 필수, `radius`(m) 생략 시 계약 기본값. Haversine 반경 필터 + 거리순.
- `POST /notifications/geofence-enter` 🔒 (10req/분) — 조건을 통과하면 FCM 을 보내고 `{ notified: true }`, 아니면 `{ notified: false, reason }`. `reason` 은 계약의 `GEOFENCE_SKIP_REASONS`(`cooldown` 은 30분 내 재진입). 없는 위치는 404.

---

## SNS 연동 (`contract/sns.ts`)

경로는 `/sns/{platform}/…` 이고 `platform` 은 `instagram | tiktok` 이다(그 외 값은 400).

- `GET /sns/connections` 🔒 — 연동된 계정 목록.
- `GET /sns/{platform}/connect` 🔒 — `authorizeUrl` 로 앱에서 OAuth 를 진행한다. 인스타그램은 비즈니스/크리에이터 계정만 허용.
- `GET /sns/{platform}/callback` (인증 없음) — OAuth 콜백. **항상 302 딥링크**로 응답한다(실패해도 JSON 을 주지 않으므로 앱은 딥링크만 처리한다):
  `snaplyapp://sns/connected?platform=…`(성공) / `snaplyapp://sns/error?platform=…&reason=<사유>`(실패).
  스킴은 `APP_DEEPLINK_SCHEME`(기본 `snaplyapp://`)이며 앱(`apps/mobile/app.json`)의 `scheme` 과 같아야 한다.
  `reason`: `invalid_state`(state 위조) | `account_type`(인스타 개인계정) | `missing_params` | `access_denied`(사용자 취소) | `exchange_failed`(토큰 교환 실패).
- `DELETE /sns/{platform}/disconnect` 🔒
- `POST /sns/{platform}/upload` 🔒 — 편집 완료(`editedUrl` 존재) 영상만. 400 이 나는 경우: 미연동 / 편집 미완료 / **영상이 공개 URL 이 아님**(인스타·틱톡이 URL 을 직접 내려받으므로 `https` 공개 주소여야 한다 — 로컬 MinIO 는 호출 전에 차단) / **연동 만료**(`SNS 연동이 만료되었습니다. 계정을 다시 연동해 주세요.` → 재연동 플로우로 유도). 남의 영상은 404.
  - `status`: **인스타그램**은 컨테이너 처리 완료까지 서버가 대기하므로 응답이 수십 초(최대 5분) 걸릴 수 있고 완료되면 `success`. **틱톡**은 게시 완료까지 폴링(최대 2분)하며 그 안에 끝나면 `success`, 진행 중이면 `pending`(실패가 아니다 — "업로드 중" 으로 표시).
  - `requiresUserAction: true` 면 **업로드는 끝났지만 사용자가 플랫폼 앱에서 마무리해야** 게시된다(틱톡 `video.upload` 받은함 스코프). 앱은 "틱톡 앱에서 마무리해 주세요" 를 안내한다. `video.publish` 심사를 통과하면 이 필드는 오지 않는다.
  - 실패 사유는 `sns_uploads.error_message` 에 저장된다(운영 추적용, 응답에는 없다).

---

## 결제 (`contract/billing.ts`)

크레딧으로 과금한다. 판매 채널은 앱 내 인앱결제(Apple StoreKit 2 / Google Play Billing)이며
영수증 검증·통지는 RevenueCat 을 경유한다. **정기 구독 상품은 없다.**
요구: [specs/credits-and-payment.md](./specs/credits-and-payment.md). **단위**: Movie export 1회 = **100크레딧**.

> **잔액과 사용 가능 여부의 원천은 항상 백엔드다.** 클라이언트·RevenueCat 의 상태는 표시·동기화용이다.
> 앱은 RevenueCat SDK 의 `app_user_id` 를 **Snaply `User.id` 로 고정**해야 한다 — 웹훅이 이 값으로 지급 대상을 찾는다.

- `GET /billing/products` (인증 불필요) — **가격·통화는 응답에 없다.** 현지 가격은 스토어가 원천이라 앱이 SDK `getOfferings()` 로 받는다. `credits` 수량은 잠정값 — [backlog A-2](./backlog.md).
- `GET /billing/credits` 🔒 — `entries` 는 **최신순 최대 `CREDIT_ENTRY_LIMIT`(50)건이며 전체 내역이 아니다**(페이지네이션 없음) — 앱은 "최근 내역" 으로 표시한다. `reason` 은 닫힌 집합(`creditReasonSchema`)이라 문구 매핑에 그대로 쓴다. `balance` 는 **음수가 될 수 있다**(사용 후 스토어 환불) — 음수면 신규 export 만 막히고 기존 결과물은 회수하지 않는다.
- `POST /billing/sync` 🔒 — 웹훅 유실 보정. **앱이 구매 완료 직후 호출한다.** 이미 반영된 거래는 건너뛰므로 몇 번 호출해도 중복 지급되지 않는다(`granted: 0`).
- `POST /billing/webhook/revenuecat` (RevenueCat 전용) — `Authorization` 헤더가 `REVENUECAT_WEBHOOK_AUTH_TOKEN` 과 일치해야 한다(불일치 401, 본문 미처리). `NON_RENEWING_PURCHASE` 는 같은 `transaction_id` 재전송에도 **한 번만** 지급, `REFUND` 도 한 번만 회수. 카탈로그에 없는 상품은 **500**(임의 지급 대신 RevenueCat 재시도에 맡긴다). 그 외 이벤트는 무시하고 200. 전역 rate limit 제외.

---

## 보상형 광고 크레딧 (`contract/billing.ts`)

요구: [specs/credits-and-payment.md](./specs/credits-and-payment.md) §보상형 광고 · 배경: [decisions/ad-reward-credits.md](./decisions/ad-reward-credits.md).

> **앱이 지급을 요청하는 API 는 없다.** 지급의 유일한 트리거는 AdMob SSV 콜백이고, 앱은 세션을
> 열고 상태를 조회할 뿐이다. 지급량도 앱이 정하지 않는다 — 세션 발급 시점에 서버가 스냅샷한 값이다.

**앱의 흐름**: `POST /billing/ad-rewards`(광고 로드 직전) → `nonce` 를 AdMob SDK 의 `customData`,
`ssvUserId` 를 `userId` 로 전달 → 광고 시청 → 닫힘 직후 `GET /billing/ad-rewards/{rewardId}` 를
짧게 폴링(~10초). 광고가 성립하지 않으면(중도 이탈·노필·로드 실패) `DELETE /billing/ad-rewards/{rewardId}` 로
세션을 포기해 슬롯을 즉시 비운다 — 안 하면 세션 TTL(기본 300초)이 지나야 다음 세션을 받는다.

- `GET /billing/ad-rewards` 🔒 — "광고 보고 +N크레딧" 버튼의 표시·비활성·남은 횟수·다음 가능 시각을 정하는 **유일한 근거**. **앱은 보상량·한도·쿨다운을 하드코딩하지 않는다**(env 로 바뀔 수 있다). `enabled: false` 면 진입점을 숨긴다(세션 발급은 503). `nextAvailableAt` 은 쿨다운 중일 때만. `resetsAt` 은 **KST 자정**. 한도는 실제로 지급된 횟수로만 센다. `remainingToday: 0` 이면 비활성화하되 `2/5회` 같은 진척도로 보이지 않게 하고, **"광고 5편 = 무비 1편" 으로 묶어 표시하지 않는다.**
- `POST /billing/ad-rewards` 🔒 — 세션 발급. **요청 본문 없음.** `rewardId` 는 폴링 전용이며 `nonce`(SSV 비밀)와 분리돼 있다. `expiresAt` 이후 도착한 SSV 는 지급되지 않는다. 거절은 전부 409 이고 에러에 "언제 다시 가능한지" 가 실린다: `AD_REWARD_COOLDOWN`(+`nextAvailableAt`) · `AD_REWARD_LIMIT_REACHED`(+`resetsAt`) · `AD_REWARD_SESSION_ACTIVE`(+`rewardId`, 이걸 계속 폴링하면 된다). 킬 스위치 off 는 `503 AD_REWARDS_DISABLED`.
- `GET /billing/ad-rewards/{rewardId}` 🔒 — `abandoned` 는 앱이 포기해 슬롯을 비운 상태이며 **실패가 아니다**(만료 전 SSV 가 오면 `granted`). `credits` 는 `granted` 일 때만, `balance` 는 **항상** 현재 잔액. **`pending` 은 실패가 아니다** — 폴링이 타임아웃하면 "지급 확인 중" 으로 표시하고 끝낸다. IAP 의 `sync` 같은 보정 경로는 광고 쪽에 **의도적으로 없다**. 남의 `rewardId` 는 404.
- `DELETE /billing/ad-rewards/{rewardId}` 🔒 — 세션 포기. 응답은 `GET` 과 같은 모양. **지급 자격은 남는다**(포기는 슬롯만 비운다). **멱등** — 이미 확정된 세션에 불러도 200 과 현재 상태. 이 경로로는 지급을 만들 수 없다.
- `GET /billing/webhook/admob` (AdMob 전용) — SSV 콜백. **GET + 쿼리스트링**, 인증 미들웨어 없음(인증이 곧 서명). 서명·timestamp(±10분)·세션·사용자·광고 단위·일일 한도·계정 상태를 전부 통과해야 지급하고, 지급량은 세션 스냅샷 값이다. 재전송은 지급 없이 200, 검증 실패는 400(`ad_rewards.status = rejected`만 남김). 전역 rate limit 제외.

---

## 공통

- `GET /health` (인증 불필요) — `contract/health.ts`.

### 공개 페이지 (HTML, 인증 불필요)

플랫폼 콘솔(틱톡 Login Kit, Meta 앱 검수)이 앱 설정 **저장** 단계에서 요구하는 페이지들. FE 가 호출할 일은 없지만 앱 내 링크로 노출할 수 있다. 계약 레지스트리 밖이다(`routes/legal.ts`).

| 경로 | 내용 |
|---|---|
| `GET /` | 서비스 소개 |
| `GET /legal/terms` | 이용약관 |
| `GET /legal/privacy` | 개인정보처리방침 |
| `GET /:filename` · `GET /legal/:filename` | 플랫폼 URL/도메인 소유권 검증 파일 (`SITE_VERIFICATION_FILE_NAME`/`_CONTENT` 로 구동, 미설정 시 404) |

> ⚠️ `GET /:filename` 은 최상위 파라미터 라우트다. 새 최상위 경로를 추가할 때 라우팅 충돌 여부를
> [`routes/legal.ts`](../apps/api/src/routes/legal.ts)와 함께 확인한다.

> ⚠️ 약관·개인정보처리방침은 **법률 검토를 받지 않은 출시 전 초안**이다(페이지 상단에도 표기).
> 앱 심사 제출·서비스 출시 전 정식 문서로 교체해야 한다.

### 인스타그램 웹훅 (Meta 전용)

| 경로 | 용도 |
|---|---|
| `GET /sns/instagram/webhook` | 콘솔 등록 시 검증 핸드셰이크 (`hub.challenge` 를 평문 반환) |
| `POST /sns/instagram/webhook` | 이벤트 수신. `X-Hub-Signature-256` 검증 후 200 (현재 처리하는 이벤트 없음) |

릴스 게시 자체에는 웹훅이 필요 없다. 콘솔이 등록을 요구할 때 통과시키기 위한 것이다.
`INSTAGRAM_WEBHOOK_VERIFY_TOKEN` 미설정 시 403. 계약 레지스트리 밖이다(`routes/sns-webhook.ts`).
