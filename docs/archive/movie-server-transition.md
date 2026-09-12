# 계획 — 무비 서버 전환 (앱)

**작성일**: 2026-09-12
**상태**: 2026-09-12 보관 — 같은 날 §2 의 권장안이 승인되어 구현됐다. 구현은 계획과 두 곳에서 다르다:
① 무비 id 를 **앱이 uuid 로 정해 서버가 그대로 받는다**(§2-1 의 "아웃박스"를 id 변경 없이 만드는 방법) ②
jobId 는 `Movie.jobId` 로 항상 노출한다(진행 중만이 아니라 실패 사유 조회에도 쓴다). 현행 사실은
[decisions/movie-client-cache.md](../decisions/movie-client-cache.md) 와
[apps/mobile/docs/features/movie.md](../../apps/mobile/docs/features/movie.md) 를 본다.
남은 미결(reconcile·스냅 만료 표시·`POST /edit-jobs` 폐기)은 [backlog.md](../backlog.md) 에만 있다.
> 보관 시 깨지는 상대 링크 하나(인수인계 문서)를 archive 경로로 고쳤다.
**관련**: [backlog.md](../backlog.md) A-1 · [mobile-handover-lifecycle.md](./mobile-handover-lifecycle.md) ·
[specs/movie.md](../specs/movie.md) MOV-2 · [specs/notifications.md](../specs/notifications.md) NTF-6 ·
[decisions/movie-export-policy.md](../decisions/movie-export-policy.md) ·
[decisions/movie-ready-notification.md](../decisions/movie-ready-notification.md)

---

## 0. 이 문서가 답하는 것

앱의 로컬 무비 저장소(`entities/movie`, zustand `persist`)를 서버 `Movie` 로 옮기는 **순서**와,
착수 전에 **정해야 하는 것**. 서버 API 는 2026-09-09 에 끝났고 계약 타입은 shared-types 로 앱에
이미 도달해 있다. 남은 것은 앱의 구조 결정이다.

## 1. 2026-09-12 소스 대조에서 확인한 사실

- `@/entities/movie` 를 import 하는 파일이 **34개**(pages 15 · features 9 · widgets 2 · entities 2 ·
  `_app` 2 · 기타). 스토어 액션 훅 17개가 그 안에서 100회 이상 쓰인다. 훅의 **공개 계약을 유지**하고
  스토어 내부만 바꾸는 편이 화면 수정 없이 전환할 수 있는 유일한 경로다.
- 생성은 `features/compose-movie/api/create-edit-job.ts` 가 `POST /edit-jobs` 를 직접 부른다.
  **그래서 서버의 완성 푸시는 지금 앱 사용자에게 오지 않는다** — `notifyMovieReady` 는 결과물이
  속한 서버 `Movie` 를 찾지 못하면(`no_movie`) 보내지 않는다. 백로그가 "완료 알림이 두 번 온다"고
  적은 상태는 export 전환 **뒤에** 생기는 상태다. 로컬 알림 제거는 반드시 export 전환과 **같은
  변경**에서 한다 — 먼저 빼면 알림이 아예 없고, 나중에 빼면 두 번 온다.
- 앱의 `SnapRef.snapId` 는 로컬 파일명이고 서버 `clips[].videoId` 는 업로드가 준 id 다. 둘의 매핑은
  `entities/snap` 의 sync store(`entries[snapId] = { status: 'uploaded', videoId }`)에만 있다.
  **업로드가 끝나지 않은 스냅은 videoId 가 없다** — 촬영 직후 무비에 담는 흐름이 바로 그 경우다.
- 서버 `Movie` 의 `status` 는 읽을 때 `resultVideoId` 가 가리키는 편집 작업에서 유도된다
  (`movie.service.ts` L171). **`jobId` 는 `POST /movies/{id}/export` 응답에만 있다** — 앱이 재시작으로
  잃으면 진행률 소켓을 다시 열 수 없다.
- `PATCH /auth/me` 는 `notificationEnabled` 를 받지 않는다. 서버 발송 판정(기본 `true`)을 앱이 바꿀
  길이 없어 앱의 "무비 완성 알림" 스위치는 서버 푸시에 닿지 않는다(NTF-7 틈, backlog B-6).
- 알림 **탭 라우팅**은 2026-09-12 에 먼저 넣었다(`_app/providers/notification-tap-router.tsx`).
  `movie_ready`·`movie_failed`·`snap_expiry` 를 목적지로 바꾼다 — export 전환 뒤 서버 푸시가 오기
  시작해도 앱 쪽은 준비돼 있다.

## 2. 결정이 필요한 것

| # | 질문 | 선택지 | 권장 |
|---|---|---|---|
| 1 | **업로드 전 스냅을 담은 초안**을 어디에 두나 | (a) 스토어를 서버 캐시 + **아웃박스**로: 화면은 즉시 반영, 서버 쓰기는 컷의 videoId 가 모두 생기면 실행 (b) 초안은 로컬, 첫 export 때 서버 무비 생성 (c) 서버 계약에 "업로드 대기 컷" 표현 추가 | **(a)**. (b) 는 원천이 둘로 남아 "기기를 바꾸면 무비가 사라진다"가 초안에 계속 남고, (c) 는 서버가 로컬 파일명을 알게 된다. (a) 는 훅 계약을 유지해 34개 소비자를 건드리지 않는다 |
| 2 | 진행 중 작업의 **jobId 복구** | (a) `Movie` 응답에 진행 중 `jobId` 노출(계약 변경, `routes/movies` Dev A 소유) (b) jobId 없으면 `GET /movies/{id}` 폴링으로 종료만 감지 | **(a)** + (b) 폴백. 진행률·취소가 jobId 에 걸려 있다 |
| 3 | **실패 안내** — 서버는 성공만 보낸다 | (a) 앱 로컬 알림 유지(`movie_failed`) (b) 서버 발송 추가 | **(a)**. 앱이 실패를 이미 알고 있고 무비 탭에도 실패 안내가 있다. 지금 코드와 문서(NTF-6)가 이 전제다 |
| 4 | **알림 스위치와 서버 판정** | backlog B-6 (User 스키마·`routes/auth` 는 Dev B 소유) | 이 계획의 범위 밖. 결정 전까지 앱 스위치는 로컬 실패 알림·OS 권한 획득만 다룬다고 문서에 적는다 |
| 5 | 만료 스냅을 쓰던 무비의 표시 | [mobile-handover-lifecycle.md](./mobile-handover-lifecycle.md) §4 | 이 계획의 5단계에서 화면 설계와 함께 |

## 3. 구현 순서 (각 단계가 독립 머지)

1. **`entities/movie/api`** — shared-types `movieSchema` 를 DTO 로, 도메인 `Movie` 매퍼, `queryOptions`
   팩토리, 뮤테이션 함수. `stylePreset(감성·여행·일상) ↔ MovieStyle` 표는 `create-edit-job.ts` 에서
   엔티티 경계로 옮긴다. `videoId → snapId` 해석은 엔티티 간 import 금지 규칙상 **앱 레이어가
   리졸버로 주입**한다(sync store 역방향 인덱스).
2. **스토어 전환(§2-1 (a))** — `LibraryScopeGate` 가 `applyMovieScope` 대신 `GET /movies` 를 전 페이지
   읽어 스토어를 채운다(`hasHydrated` 의미 유지). 액션은 즉시 로컬 반영 + 아웃박스 기록; 워커가
   videoId 가 갖춰진 항목부터 `POST /movies` · `PATCH /movies/{id}`(clips 통째 교체 · 사용자
   재정렬 시 `arranger: 'user'`) · `DELETE` 를 보내고 응답으로 덮어쓴다. 기존 로컬 무비는
   이관하지 않는다(결정 완료). `bgm` 필드는 서버에 없으므로 버린다(2026-08-13 부터 아무도 읽지 않음).
3. **생성 경로** — `createEditJob(clips)` → `exportMovie(movieId)`. 러너는 export 응답의 jobId 로
   기존 소켓·폴링을 그대로 쓰고, jobId 가 없으면(§2-2) `GET /movies/{id}` 폴링. **이 단계에서
   `announceJobEnd('ready')` 를 제거**한다(서버 푸시로 대체, 실패는 로컬 유지) → backlog A-1
   "로컬 완료 알림 제거" 가 닫힌다. `resultVideoId` 가 `render.videoId` 의 원천이 된다.
4. **끝내기(MOV-17·18)** — 공유 시트 뒤 명시적 확인으로만 `POST /movies/{id}/finish`; SNS 게시는
   서버가 끝내므로 게시 응답 뒤 무비를 다시 읽는다. 앱의 `finishMovieJob` 은 `completeMovieJob` 로
   이름을 바꿔 서버의 finish 와 뜻을 분리한다.
5. **만료 표시(SNAP-12·13, `unavailable`)** — 스냅 엔티티에 `removalReason`·`purgedAt`, 컷의
   `unavailable` 그리기, 남은 보관 기간. §2-5 와 함께.
6. **`POST /edit-jobs` 폐기** — 3단계가 나간 릴리스의 다음 릴리스(서버, backlog A-1).

## 4. 검증

- 단계마다 `npm run verify:mobile`.
- 3단계 뒤 Android 실기기: 생성 → **완성 푸시가 한 번만** 온다 → 탭 → 그 무비가 열린다(cold start
  포함). 조용한 시간대면 오지 않고 앱을 열면 무비가 `ready` 다.
- 2단계 뒤: 앱 삭제·재설치 → 로그인 → 무비 목록이 돌아온다. 계정 전환 → 다른 계정의 무비가 보이지
  않는다. 촬영 직후 담기 → 업로드가 끝나면 서버에 무비가 생긴다.

## 5. 같은 변경에서 갱신할 문서

[specs/movie.md](../specs/movie.md) MOV-2 · [specs/notifications.md](../specs/notifications.md) NTF-6 ·
[apps/mobile/docs/features/movie.md](../../apps/mobile/docs/features/movie.md)(생성 경로·Announce the end) ·
[studio.md](../../apps/mobile/docs/features/studio.md) · [snaps.md](../../apps/mobile/docs/features/snaps.md) ·
[api-spec.md](../api-spec.md)(jobId 노출 시) · [backlog.md](../backlog.md) A-1 · 이 문서는 착수 시
archive 로 옮긴다.
