# 미결 작업 백로그

> 저장소 전체의 **닫히지 않은 작업**을 모은 단일 목록이다. 항목이 여러 문서에 흩어져 있으면
> 하나를 닫아도 나머지가 낡으므로, 미결 항목은 이 문서에만 둔다.
> 이 문서만 읽어도 다음에 결정하거나 구현할 일을 빠짐없이 찾을 수 있어야 한다.
> 결정 문서(`docs/decisions/`)는 **확정된 결정의 배경과 기각한 대안**을 담고,
> 계획 문서(`docs/plans/`)는 착수 전 구현 제안을 담으며,
> 진행 기록([progress.md](./progress.md))은 **완료된 것**만 담는다.
>
> 각 항목은 `왜 막혀 있는지` + `무엇이 있으면 닫히는지(완료 조건)` 형식이다.
> 마지막 정리: 2026-09-12 — A-1 의 앱 항목을 구현했다(무비 서버 전환·끝내기·로컬 완료 알림 제거·컷
> 만료 표시·푸시 탭 라우팅, A-4 해상도 하드코딩). 결정은
> [decisions/movie-client-cache.md](./decisions/movie-client-cache.md). 남은 앱 항목은 **실기기 검증**,
> 스냅 목록의 만료 표시(reconcile 뒤), reconcile 3단계다. 알림 설정이 서버 판정에 닿지 않는 틈은 B-6.
> 그 전 정리(2026-09-11): 서버의 생애주기 작업이 끝난 뒤 앱 소스를 대조해 A-1 의 `앱` 항목을 실제
> 상태로 다시 썼다.

---

## A. 기획/제품 결정 대기

가장 앞단의 병목. 아래가 정해지지 않으면 구현을 시작할 수 없다.
회의에서 정해야 하는 결정 요청 문서의 목록은 [decisions/README.md](./decisions/README.md) §결정 대기.
(번호는 재사용하지 않는다 — **A-5는 결번**이며, 누락된 문서가 아니다.)

### A-1. 영상 묶음(프로젝트) 구조 ★ 최우선

**결정됨**: 영상은 평면으로 보관하고, 편집할 클립을 참조하는 엔티티는 **`Movie`** 로 둔다.
3안 비교와 채택 근거는 [decisions/movie-model.md](./decisions/movie-model.md).

**①~⑤ 세부 규칙은 2026-09-09 결정 완료** —
[decisions/movie-export-policy.md](./decisions/movie-export-policy.md):
① 순서는 **촬영 시각 순이 기본, 사용자가 옮기면 고정**(`arranger`) ② 재내보내기는 **교체**
(무비당 살아 있는 결과물 1개) ③ 무비를 지워도 **스냅은 남는다** ④ 자동 그룹핑은 **앱 표시만**
(서버 제안은 A-6 후속) ⑤ `POST /edit-jobs` 는 **한 버전 공존 후 폐기**.

⑥ **영상·프로젝트·결과물 생애주기 재정의**(2026-08-31 개발자 회의 제안 —
[meetings/2026-08-31-dev-sync.md](./meetings/2026-08-31-dev-sync.md) §4) — **2026-09-09 세 축 모두 결정 완료.**

| 축 | 결정 | 요구 |
|---|---|---|
| 스냅 보관 | 서버 원본은 업로드 후 **15일** 만료. 구독 연장은 미확정이라 구현은 전원 15일 가정(A-2) | SNAP-9·12·13 |
| 로컬 파일 | 최종적으로 캐시가 되지만 **삭제를 켜는 것은 렌디션·동기화 검증 뒤로 연기**. 그때까지 기기 파일이 원천 | SNAP-14 |
| 내보내기 후 | **끝내면 결과물 파일만 삭제, 프로젝트는 보존.** 다시 보기 없음, 다시 만들기는 유료(크레딧 100) | MOV-16~19 |

근거: [snap-retention-period.md](./decisions/snap-retention-period.md) ·
[local-copy-after-upload.md](./decisions/local-copy-after-upload.md) ·
[movie-cleanup-after-export.md](./decisions/movie-cleanup-after-export.md).

⚠️ **구현 시 주의 둘**
- 로컬 삭제 전환을 켜는 시점에 **15일 만료와 겹쳐 영상이 완전히 사라지는 조합**이 다시 열린다.
  지금은 기기 파일이 남아 그 조합이 생기지 않는다.
- 시스템 공유 시트는 저장 여부를 알려주지 않으므로 **다운로드 경로의 "끝내기"는 사용자의 명시적
  행동이어야 한다**(MOV-18). 시트를 연 것만으로 지우면 취소한 사용자의 파일이 사라진다.

만료의 동작 구조(2단계 삭제 · 만료 스냅 식별 · 사전 알림)는
[plans/lifecycle-alignment.md](./plans/lifecycle-alignment.md) §6 에서 설계를 마쳤다.
`capturedAt` 수집은 결정 완료이며 스냅 서버 원천화 1단계에서 구현한다. 위치 정보 저장
여부는 이 항목과 분리해 A-4에서만 관리한다.

**완료 조건**: ~~남은 세부 정책 확정~~ → ~~`Movie` 스키마~~ → ~~CRUD → export~~ (2026-09-09 완료,
[progress.md](./progress.md)) → **앱 전환** → e2e 실검증.
착수 계획과 순서는 [plans/lifecycle-alignment.md](./plans/lifecycle-alignment.md) §5-A.

서버 API 는 2026-09-09 에 끝났고 **앱 전환은 2026-09-12 에 구현됐다**
([decisions/movie-client-cache.md](./decisions/movie-client-cache.md) · 인수인계와 착수 계획은
[archive/](./archive/README.md)). 아래는 그 결과다 — 닫힌 것은 취소선, 남은 것은 체크박스.

- [x] ~~**`앱`** **무비 서버 전환**~~ — **2026-09-12 완료.** `entities/movie` 스토어는 서버 무비의 캐시 +
      아웃박스가 됐고(훅 계약 유지, 34개 소비자 무변경), 생성은 `POST /movies/{id}/export` 로 간다.
      무비 id 는 앱이 정한 uuid 를 서버가 받는다(`POST /movies` `id`, 멱등). 서버 계약 변경:
      `Movie.jobId` 노출 · `PATCH` `clips: []` 허용 · 취소된 작업은 `draft` 로 보정. 기존 로컬 무비는
      이관하지 않았다(스토어 v1 마이그레이션이 비운다). **실기기 미검증** — 아래 "서버 전환 실기기 검증"
- [x] ~~**`앱`** **끝내기 버튼**~~ — **2026-09-12 완료.** `features/finish-movie`: ⋯ 시트의 끝내기 행과, 공유
      시트가 올라온 뒤 감상 화면에 뜨는 안내 → "저장했나요?" 확인 시트 → `POST /movies/{id}/finish`.
      시트를 연 것만으로는 부르지 않는다(MOV-18). 스토어 액션 `finishMovieJob` 은 `completeMovieJob` 로
      바꿔 사용자의 끝내기(`useFinishMovie`)와 이름을 분리했다
- [ ] **`앱`** **만료 표시 — 스냅 목록** — 무비 컷의 `unavailable` 그리기는 **2026-09-12 완료**(타임라인의
      "만료" 배지, 삭제된 원본과 문구 구분, export 400 은 서버 문구로 표시). **남은 것**: 스냅 라이브러리에서
      만료된 스냅을 "만료됨"으로, 남은 보관 기간 표시(SNAP-13). 앱은 서버의 스냅 목록을 읽지 않으므로
      **A-4 3단계(reconcile)와 같은 변경**에서 붙인다 — 그 전에는 서버 만료를 알 방법이 없다
- [x] ~~**`앱`** **로컬 완료 알림 제거**~~ — **2026-09-12 완료.** export 전환과 같은 변경에서
      `announce-job-end.ts` 의 성공 알림을 뺐다. 실패 알림은 서버가 보내지 않으므로 로컬로 남기고, 서버에서
      읽어 온(`adopted`) 작업의 실패는 알리지 않는다. 스위치와 서버 판정의 정합은 **B-6**
- [x] ~~**`앱`** **푸시 탭 라우팅**~~ — **2026-09-12 완료**([progress.md](./progress.md)).
      `_app/providers/notification-tap-router.tsx` 가 FCM(`onNotificationOpenedApp`·`getInitialNotification`)과
      로컬 알림 응답 두 채널을 듣고 `kind` 별 목적지(`movie_ready`·`movie_failed` → 무비, `snap_expiry` →
      라이브러리)로 보낸다. cold start 는 네비게이터·로그인 준비 뒤 도달. **실기기 미검증** — Android 에서
      FCM 과 expo-notifications 가 같은 탭을 둘 다 보고하는지(중복 억제 창 2초)를 확인해야 닫힌다
- [x] ~~**`앱`** **모바일 기능 문서 갱신**~~ — **2026-09-12 완료.** movie.md 에 "Movies live on the server" ·
      "Finishing it" 절을 추가하고 생성 경로·완료 알림·소유권·제한을 고쳤다. studio.md · snaps.md ·
      README · app-shell · me.md · location-and-push 도 같은 변경에서
- [ ] ~~**e2e 실검증**~~ — **2026-09-11 완료**. `media:e2e` 가 앱과 같은 길을 간다
      (`POST /movies` → `export` → 무비에서 결과물 찾기). 실제 아이폰 영상으로의 재검증은 남아 있다
- [ ] **`앱`** **서버 전환 실기기 검증** ⚠️ 2026-09-12 신규. 단위 테스트와 인메모리 목으로만 검증됐다.
      Android dev build 에서 실제 서버에 대해: ① 촬영 직후 담은 초안이 업로드가 끝난 뒤 서버에 생긴다
      ② 편집이 PATCH 된다 ③ 생성 → **완성 푸시가 한 번만** 오고 탭하면 그 무비가 열린다(cold start 포함)
      ④ 끝내기 → 결과물이 사라지고 초안으로 돌아온다 ⑤ 앱 삭제·재설치 → 로그인 → 무비 목록이 돌아온다
      (컷 원본은 reconcile 전이라 없다) ⑥ 계정 전환 → 다른 계정 무비가 보이지 않는다.
      **완료 조건**: 여섯 가지가 통과하면 MOV-2·17·18·19·NTF-6 의 "실기기 미검증" 표기를 지운다

- [ ] **`서버`** **`POST /edit-jobs` 폐기** — 결정 ⑤ 는 "한 버전 공존 후 폐기"다. 앱이 Movie export 로
      옮긴 릴리스의 **다음 릴리스**에서 제거한다. 시점을 항목으로 남기지 않으면 영구 공존이
      되어 editSpec v3 를 두 곳에 붙이게 된다(A-7 부착 지점)

**스냅 15일 만료 구현**(SNAP-9·12·13) — 결정은 끝났고 값도 정해졌다(전원 15일 가정).
구현 설계는 [plans/lifecycle-alignment.md](./plans/lifecycle-alignment.md) §5-C·§6:

- [ ] ~~**만료 배치**~~ — **2026-09-09 완료**(`media:purge-expired`). 만료 시각을 행에 굳히지 않고 **업로드 시각 + 정책 값으로 유도**한다.
      나중에 구독이 기간을 팔면 사용자마다 만료가 달라지는데, 유도 방식이어야 그것이 표현된다.
      실행 방식은 계정 purge 배치(스케줄 + dry-run 기본)를 따른다
- [ ] ~~**툼스톤과 만료 상태**~~ — **2026-09-09 완료**. 파일(원본·썸네일)은 지우고 행은 남겨 "만료됨"으로 보이게 하고,
      `사용자 삭제`와 `기간 만료`를 구분한다(SNAP-12). 삭제는 **에셋 단위**로 나눠 두고,
      **만료 → 실삭제 2단계**로 만들되 지금은 간격 0(나중에 복구를 팔면 이 값만 늘린다)
- [ ] ~~**무비 완료 알림의 FCM 전환**~~ — **2026-09-11 완료**. 편집 워커가 큐에 넣고 Node 쪽
      알림 워커가 발송한다([decisions/movie-ready-notification.md](decisions/movie-ready-notification.md)).
      앱의 로컬 알림을 걷어내는 것은 위 `앱` 항목 "로컬 완료 알림 제거와 설정 정합" 이다
- [ ] **무비가 참조 중인 스냅의 만료 예외 여부**(정책) — **2026-09-15 잠정 결정: 예외를 두지
      않는다**(현행 유지, 코드 변경 없음). **다음 회의 안건**이며, 다시 볼 때는 선택지 C(무비를
      편집하면 기간이 갱신)에서 시작하는 것이 빠르다. 검토한 선택지 넷과 기각 사유는
      [decisions/movie-snap-expiry-exemption.md](decisions/movie-snap-expiry-exemption.md).
      요금제 설계(A-2)와 함께 보는 것이 자연스럽다 — 비용이 아니라 유료 전환 경계의 문제다

무비 결과물의 정리도 이 항목에서 함께 구현한다: **끝내기 시 삭제**(MOV-17)와, 끝내지 않은
결과물의 **30일 상한**(MOV-16). 프로젝트 자동 삭제는 **기능만 만들고 기본 꺼짐**으로 둔다.
다시 만들기는 유료(MOV-19)라 무료 재생성 경로는 만들지 않는다 —
[decisions/storage-and-subscription-policy.md](./decisions/storage-and-subscription-policy.md) §3 의
무료 재생성은 대체됐다. S3 삭제 실패분은 E-3의 정리 배치 경로를 쓴다.

같은 결정 §3.5의 "생성 완료 FCM 알림에 보관 기간 명시"의 선행 조건은 2026-09-11 에 풀렸다 —
완료 알림이 서버 FCM 으로 옮겨져(`services/movie-ready-notice.service.ts`) 문구를 서버가 쥔다.
남은 것은 그 본문에 결과물 30일 상한(MOV-16)을 적을지의 판단이며, 끝내기(MOV-17)가 붙은 뒤
사용자가 실제로 결과물을 얼마나 방치하는지 보고 정한다.

### A-2. 크레딧 결제 세부 정책 확정

**결정·구현 완료분**: 과금 모델(구독 제거, export 1회 = 100크레딧 불변, 생성/보관 2축 분리),
결제 채널(IAP + RevenueCat), 스토리지 정책(무비 30일 보관·무료 재생성, 스냅은 2026-09-09부터
기간 기준 — 무료 15일)은 확정됐다.
현행 요구는 [specs/credits-and-payment.md](./specs/credits-and-payment.md)·
[specs/snap-library.md](./specs/snap-library.md)·[specs/movie.md](./specs/movie.md)가,
배경은 [decisions/](./decisions/)의 결제·스토리지 결정 3편이 담는다. 크레딧 원장·웹훅
멱등 지급·export 예약/환급 등 백엔드 구현도 끝났다([progress.md](./progress.md) 2026-08-14).
아래 미결 항목은 **코드가 아니라 값**이며,
`apps/api/src/services/billing/credit-policy.ts` 의 숫자만 교체하면 닫힌다.

**결정할 것 — 크레딧(생성 축)**:
- 크레딧 팩별 **수량과 가격** (현재 500 / 1,200 / 3,000 은 잠정값이며 스토어 미등록)
- 크레딧 유효기간 (권장: 구매 크레딧은 만료 없음)
- **가입 보너스 수량** (현재 `CREDIT_SIGNUP_BONUS` 기본 0 = 지급 안 함)
- 프로모션·운영 보상 지급 기준
- 고해상도 export의 추가 차감 여부 (현재 전 export 동일 100)

**광고 보상 — 미결 값 없음(2026-08-18 전부 확정, A-2에서 닫힘)**: 정책 값과 불변 관계는
[specs/credits-and-payment.md](./specs/credits-and-payment.md) ADR-1·ADR-6, 검증 규칙과 배경은
[decisions/ad-reward-credits.md](./decisions/ad-reward-credits.md) §7. 실제 지급은 C-6(AdMob
콘솔 설정)에만 막혀 있다. 다시 열릴 조건은 **파일럿 실측**뿐이며, 광고 순매출이 보상 원가를
밑돌면 한도가 아니라 **보상량을 먼저 내린다**(한도 인하는 되돌릴 수 없는 혜택 축소).
출처별 버킷·차감 우선순위는 v1 범위 밖 — 필요해지면 별도 결정 문서로 다룬다.

**결정할 것 — 구독(보관 축)**: 용량 티어와 가격 · 연 구독 여부 · 구독 혜택에 워터마크
제거·고해상도 export를 포함할지 · 무비 만료 알림 발송 시점.

2026-09-09 에 스냅 보관이 **기간 기준(업로드 후 15일)** 으로 바뀌면서
([snap-retention-period.md](./decisions/snap-retention-period.md)) 이 축에 세 가지가 더해졌다:
- **구독으로 보관 기간을 팔 것인가** ⚠️ **예정일 뿐 미확정이다.** 판다면 연장(며칠/몇 달)인지
  무제한인지, 티어별로 다른지를 정해야 하고 구독 상품의 축이 "용량"에서 "기간"으로 옮겨간다.
  **정해지기 전까지 스냅 만료 구현은 전원 15일을 가정한다**
- **용량 한도(2GB)를 존치할지** — 기간 만료가 누적을 대신 막아 평균 사용자는 닿지 않는다.
  권장은 폐기하고 남용 방지 상한만 별도로 두는 것(결정 문서 §후속 판단). SNAP-9 가 미결로 표시 중
- ~~**만료 예고의 최소 리드타임**~~ — **2026-09-09 결정**: D-3 · D-1 두 번, KST 오전 10시 발송
  ([decisions/expiry-notice-schedule.md](decisions/expiry-notice-schedule.md))
  (SNAP-13). 사용자 구독 만료의 경우와 우리가 정책을 바꾸는 경우를 각각 정한다
경계 규칙상 **구독에 크레딧을 얹는 안은 검토 대상이 아니다**
([decisions/storage-and-subscription-policy.md](./decisions/storage-and-subscription-policy.md) §4.3).

**앱에 전달할 것** (계약은 확정됐다): 잔액 조회 `GET /billing/credits`, 1회 차감량 100,
잔액 부족 시 `402 INSUFFICIENT_CREDITS` (+`required`·`balance`). RevenueCat SDK의
`app_user_id`를 **Snaply `User.id`로 고정**해야 웹훅이 지급 대상을 찾는다.
`GET /auth/me` 응답에서 `plan` 필드가 제거됐으므로 앱이 이 값을 읽고 있으면 함께 정리한다.

**완료 조건**: 위 수량·가격 확정 → `credit-policy.ts` 값 교체 → 양 스토어에 동일 상품 ID로
등록 + RevenueCat 프로젝트·웹훅 URL 연결 → 구독 entitlement 반영과 한도 집행(유예 → 읽기 전용
전이 포함) → 결제·편집 e2e 실검증.

### A-3. 스냅 내용 분석 — 구현 완료, 생산 활성화 대기

**2026-08-19 구현 완료**: 스키마·API·분석 워커·docker 배선이 들어갔다. 검증 내역은
[progress.md](./progress.md), 방향과 계획 대비 차이는
[decisions/snap-content-analysis.md](./decisions/snap-content-analysis.md) (§9).
착수 전 계획 문서는 [archive/](./archive/video-analysis-implementation-plan.md)로 옮겼다.

분석은 `POST /videos/:videoId/analysis` 로만 시작된다 — **업로드 시 자동 분석은 없다.**

**막힌 이유**: 생산 스냅에 켤 수 없다. 아래 세 가지가 남았다.

- [ ] **약관·개인정보처리방침 — 초안 완료, 법무 검토 대기** (2026-08-19). 분석 고지·수탁자·
      국외 이전 절을 `routes/legal.ts` 초안에 넣었고 테스트가 전송 범위(프레임 4장·오디오
      미전송·영상 삭제 시 동시 파기)를 문구에 고정한다. **남은 것은 아래 넷이며 전부
      `routes/legal.ts` 상단 주석에도 적혀 있다.**
  - 사업자·모델 확정 (지금 문서는 OpenAI 전제, `OPENAI_VISION_MODEL` 은 잠정값)
  - ~~보유 기간·학습 이용 여부~~ **2026-08-19 확인 완료** — 공개 문서 기준 학습 미이용,
    남용 모니터링 로그 최대 30일. Responses API 의 `store` 기본값이 true 라 30일 보관 축이
    하나 더 생기는 것을 발견해 워커에서 껐다. **남은 일은 계약 문구 대조와 DPA 체결**이며,
    ZDR 승인을 받으면 보관 기간을 "없음" 으로 바꿀 수 있다
  - ~~국외 이전 표의 나머지 수탁자 리전~~ **2026-08-19 확인** — Firebase(리전 지정 불가)·
    RevenueCat(미국)·Sentry(미국, 우리 DSN 이 `ingest.us.sentry.io`)를 표에 채웠다.
    **남은 것 둘**: ① AWS 는 `AWS_REGION=ap-northeast-2`(서울) 기준으로 "국외 이전 아님"이라고
    적었지만 운영 배포가 없어(B-1) 아직 의도값이다 — 배포 시 실제 리전과 CloudFront 사용 여부
    (엣지는 전 세계)를 확인해 확정할 것. ② Meta·TikTok 은 확인해 표에 내렸고(2026-08-19),
    Apple·Google 은 **우리가 직접 보내지 않아** 표가 아니라 문장으로 관계만 적었다 — 이 취급이
    맞는지는 법무 확인 대상. Sentry 보관 기간도 요금제(무료 30일 / 유료 90일) 확정 시 좁힌다
- [ ] **광고(AdMob)가 법률 문서에 아예 없다** (2026-08-19 발견). 앱은
      `react-native-google-mobile-ads` 로 보상형 광고를 띄우는데 수집 항목·위탁·국외 이전
      어디에도 광고가 없다. 광고 SDK 는 광고 식별자와 기기 정보를 Google 로 보내므로 세 곳
      모두에 들어가야 하고, **Play 데이터 안전성 신고와도 맞물린다.** 어떤 식별자가 실제로
      나가는지는 맞춤 광고 설정과 동의(UMP) 처리 방식에 달렸으므로, 그 정책을 먼저 정하고 쓴다.
      이번 추천 기능과 무관하게 **출시 전 필수**다
  - **법무 판단: 별도 동의가 필요한가.** "필요" 로 나오면 옵트인 UI 와 미동의 폴백이 새 작업이다
      (결정 문서 §6 의 기각이 다시 열린다)

  아직 출시 전이므로 **약관 "개정" 절차(사전 공지·재동의)는 필요 없다.** 출시 전 정식 문서화에
  합치면 된다 — 페이지 상단의 "출시 전 초안" 배너가 그 작업의 표시다.
- [ ] **운영 모델 고정** — `OPENAI_VISION_MODEL` 기본값 `gpt-5.6-luna` 는 잠정값이다.
      실제 스냅으로 모델을 비교해 고정한다
- [ ] **품질·단가 기준선** — 요약 사실성·핵심 사물/행동 포함률·환각 비율·`usableForEdit`
      정확도는 사람이 채점해야 한다. 처리시간·토큰·실패율·모델별 비교는 `video_analyses`
      테이블 집계로 나온다 (결정 문서 §9.3)

**기준선이 나오면 정할 것**: 스냅당 단가 상한 · 추천 1회당 후보 수 상한 ·
프레임 수(현재 최대 4)·`OPENAI_IMAGE_DETAIL`(현재 low) 재탐색 여부 ·
유사 프레임 제거 임계값(`DUPLICATE_HAMMING_THRESHOLD`) 적정성 — 실제 스냅에서 4장이
2장으로 줄어드는 비율을 `frame_timestamps_ms` 로 확인한다.

**후속 기능**: 대주제 기반 자동 스냅 선택은 **A-6** 으로 열렸다(2026-08-19).
`usableForEdit=true` 인 분석 결과를 점수화해 슬롯을 채우는 경로다.

### A-4. 스냅 서버 원천 전환의 미결 항목

[decisions/snap-source-of-truth.md](./decisions/snap-source-of-truth.md) 에서 결정을 마쳤으나 남은 판단:

- [ ] 위치(`place`) 정보의 서버 저장 여부 — 프라이버시/약관 검토 선행
- [ ] 비로그인 사용자의 스냅 지위 (현행: 업로드 워커가 로그인 시에만 동작)
- [x] 앱이 이미 보유한 `capturedAt`을 `POST /videos`와 DB에 전달·저장 — **2026-09-09 완료**
      (계약·마이그레이션·업로드 워커를 한 변경에서 갱신. 기존 행은 `createdAt` 폴백,
      백필하지 않는다. SNAP-10 `구현됨`)
- [x] 삭제 유예 기간 값 — **30일 확정**, 계정 삭제에 먼저 적용
      ([decisions/account-deletion.md](./decisions/account-deletion.md))
- [ ] egress 비용 실측 후 렌디션 기본 다운로드 정책 재평가
- [x] ~~**`앱`** 선행 과제: 촬영 스냅 해상도 하드코딩(1080×1920) 해소~~ — **2026-09-12 완료**
      ([progress.md](./progress.md)). 촬영 스냅도 파일에서 회전 반영 치수를 읽고(`shared/lib/video-metadata`,
      네이티브 `VideoTrim.probe`), 못 읽은 스냅만 스탠드인을 **`dimensionsMeasured` 없이** 갖는다.
      기존 라이브러리는 시작 시 백필(`SnapMetadataBackfill`)이 고친다. **서버 계약에는 아직 치수가 없다** —
      `POST /videos` 에 `width`·`height` 를 싣는 것은 reconcile(3단계) 설계 때 함께 정하며, 그때
      플래그 없는 스탠드인은 보내지 않는다

**2026-09-09**: 로컬 파일을 언제 지울지는 결정됐다 — 최종 목표는 "로컬은 캐시"이되 **켜는 것은
아래 두 단계가 실기기에서 검증된 뒤**로 연기한다(SNAP-14,
[local-copy-after-upload.md](./decisions/local-copy-after-upload.md)). 그때까지 기기 파일이 원천이다.
전환의 선행 작업이자 이 항목의 실질적 남은 일:

- [x] **2단계 — ingest 렌디션**: **2026-09-09 완료.** 업로드 확정 시 워커가 H.264/SDR 배포본 +
      썸네일을 만들고 `playbackUrl`·`durationMs` 로 노출한다(`npm run worker:rendition`).
      **3단계의 선행 조건이 풀렸다**
- [ ] **`앱`** **3단계 — reconcile**: 서버 목록 대조·파일 온디맨드 다운로드, 삭제 유예·전파 규칙.
      이것이 없으면 재설치 시 서버에 있어도 앱이 모른다. **2단계가 끝나 지금 착수 가능하다.**
      서버가 주는 `playbackUrl`·`durationMs` 는 앱 어디서도 읽지 않는다(2026-09-11 확인) — 로컬 파일이
      원천인 지금은 문제가 아니고, 이 단계에서 재생 소스로 붙인다(`null` 이면 `originalUrls` 폴백)
- [ ] **전환을 켤 때 함께 볼 것**: 로컬이 캐시가 되는 순간 서버 만료(SNAP-9, 15일)가 곧 영상의
      소멸이 된다. 보관 기간·구독 연장과 **같은 자리에서** 판단한다

### A-6. 템플릿 기반 스냅 자동 추천 — 앱·백엔드 완료, 생산 활성화 대기

템플릿으로 무비를 시작할 때 슬롯에 들어갈 스냅을 분석 결과 기반으로 고른다. A-3의 후속 항목이며
방향·기각안은 [decisions/template-snap-recommendation.md](./decisions/template-snap-recommendation.md).

**2026-08-19 완료 (1·2·3단계)**: 서버 카탈로그·추천 API·앱 연동까지 전부 구현됐다.
현행 요구는 [specs/template-and-recommendation.md](./specs/template-and-recommendation.md),
앱 동작은 [모바일 기능 문서](../apps/mobile/docs/features/movie-templates.md),
검증 내역은 [progress.md](./progress.md).

**남은 것**
- [ ] **활성화**: `MOVIE_RECOMMENDATION_ENABLED` 는 **기본 꺼짐**이다. 켜는 조건은 A-3 과 같다 —
      법무 검토를 마친 약관·방침(초안은 2026-08-19 작성 완료)과 운영 모델 고정. 켜지 않으면
      추천 경로에서 분석이 돌지 않는다
- [ ] **상한 값 재조정**: 후보 12개·24시간 20회는 잠정값이다(결정 문서 §4). A-3 의 단가 실측이
      나오면 `services/recommendation/recommendation-policy.ts` 의 숫자만 바꾼다

**후속 후보(아직 열지 않음)**: 스튜디오의 템플릿 카드를 서버가 사용자 라이브러리 기준으로
정렬하는 안, `다른 조합`(같은 템플릿에 다른 외출 제안). 둘 다 앱 연동이 끝난 뒤에 판단한다.
2026-08-31 개발자 회의의 "AI 추천 프로젝트"는 좀 더 고민이 필요하다고만 남았다 — 이 항목의 확장인지
별개 기능인지부터 정한다([meetings/2026-08-31-dev-sync.md](./meetings/2026-08-31-dev-sync.md) §5).

---

### A-7. 트렌드 숏폼 편집 — 타임라인 스펙 v3

현행 편집은 컷 + 프리셋 색보정 한 줄이 전부라, 틱톡·릴스형 브이로그가 요구하는
**비트 그리드 · 레이어 · 키프레임**을 `editSpec` v2 가 표현하지 못한다. 오픈소스를 더 붙여도
스펙이 "0.48초에 컷, 이 좌표에 스티커 300ms pop-in"을 담지 못하면 전달할 방법이 없다.
층별 설계·오픈소스 선정·라이선스 판정은
[plans/trend-editing-pipeline.md](./plans/trend-editing-pipeline.md),
스펙 v3 의 확정 사항과 착수 순서는 [plans/edit-spec-v3-kickoff.md](./plans/edit-spec-v3-kickoff.md).

**진행 상황(2026-08-20)**: 스펙 v3 의 설계 결정이 확정됐고 공유 어휘 사전 3종(앵커 · 스테이지·시드 ·
재생성 무효화)이 구현·검증됐다 — [progress.md](./progress.md). **아래 미결은 그대로다** — 사전은
계약을 고정한 것이지 파이프라인을 구현한 것이 아니다.

**막힌 이유**: 선행 결정 세 가지와 음원 조달이 모두 열려 있다.

- **부착 지점 미정** — v3 를 `POST /edit-jobs` 에 붙일지 Movie export 에 붙일지는 A-1의
  기존 직접 편집 API 공존·폐기 판단에 달려 있다. 타임라인 모델 설계는 진행할 수 있으나
  **요청 스키마·라우트는 A-1 확정 이후**다
- **번인 자막 전환은 FE 계약 변경** — 단어 단위 애니메이션은 ASS/libass 로만 되고, 그러면
  현행 mov_text 소프트 자막이 번인으로 바뀐다. [api-spec.md](./api-spec.md) 가 "플레이어에서
  켜야 보인다"고 이미 고지했다. 새 라이브러리는 0이지만 **결정 문서가 선행**이다
- **워터마크 결정이 레이어 설계 입력** — A-2에서 넣기로 하면 v3 `layers` 가 표현해야 한다
- **BGM 음원이 없다** — `assets/bgm/` 에 README 뿐이라 비트 싱크·덕킹·무드 매칭이 전부 검증
  불가다. 15~20트랙이면 착수 가능하며, **최종 사용자의 소셜 업로드 허용**과 Content ID 클레임
  면제 조항이 있는 상업 라이선스여야 한다(없으면 사용자 영상이 무음 처리되고 CS 로 돌아온다).
  확보는 F 의 "실BGM 기준 whisper 자막 인식 재확인"의 선행이기도 하다 — 그 검증 항목은 F 에 그대로 둔다
- **스티커 에셋도 같은 함정이다** — 배치 코드가 완벽해도 아트가 없으면 검증할 게 없다. 스톡
  라이선스 다수가 "최종 사용자가 파생물을 만드는 앱에 포함"을 금지해 이 제품 형태에 정확히 걸린다

**결정할 것**

- [ ] 번인 자막 전환 여부 (소프트 자막 폐기 = 사용자에게 보이는 변경, 재인코딩 1회 증가) —
      선택지·결과는 [decisions/subtitle-rendering.md](./decisions/subtitle-rendering.md)(미결)
- [ ] BGM 조달 경로와 예산 — Uppbeat / Epidemic Sound / Artlist 등, 위 라이선스 조항 확인 포함.
      **AI 생성 음원**도 후보다(2026-08-31 개발자 회의 제안). 생성 음원의 상업 이용·소셜 업로드 허용·
      저작권 귀속 등 **법적 정책을 먼저 확인한 뒤 결정**한다 — 위 라이선스 조건은 AI 음원에도 그대로 적용된다.
      경로별 선택지·검토 항목 6개는 [decisions/bgm-sourcing.md](./decisions/bgm-sourcing.md)(미결)
- [ ] `bgm_tracks` 스키마 신설 — `schema.prisma` 는 공유 파일이라 [team.md](./team.md) §2·§3 적용
- [x] ~~골든 프레임·ffprobe 계약 테스트를 위한 **CI 의 ffmpeg 설치**~~ — **2026-09-15 완료.**
      `tests/test_ffmpeg_contract.py` 가 진짜 ffmpeg 을 돌려 산출물을 검사한다(세로 1080x1920 ·
      H.264/yuv420p · faststart · 실측 길이 · 세로 상한 · 무음 원본). "ffmpeg 없이 돈다" 는
      관행은 유지한다 — 없으면 건너뛰되 `REQUIRE_FFMPEG=1`(CI 가 준다) 이면 **실패**한다
- [ ] **스티커 팩 매니페스트 스키마** — 에셋 URL·앵커 적합성·무드 태그·스케일 범위·기본 모션.
      뒤로 미룰수록 마이그레이션 비용이 커진다(계획 §8.3).
      **설계는 확정됐다**(kickoff §1.2 C·D) — 앵커 어휘는 이미 공유 사전에 있고, 남은 것은
      매니페스트 본문을 저장소에 들이는 일이다. 폰트는 woff2 가 아니라 TTF/OTF 여야 한다
- [ ] **디자이너 커미션 여부와 스타일 방향** — 권장 40~60종 / 3~4스타일. 유니코드 이모지를 쓰면
      플랫폼 기본 스티커와 구분되지 않아 제품의 이유가 사라진다
- [ ] **관리자 페이지(에셋 관리) 도입 여부** — 2026-08-31 개발자 회의에서 스티커·에셋 확보의 전제로
      제기됐다([meetings/2026-08-31-dev-sync.md](./meetings/2026-08-31-dev-sync.md) §3). 관리자 인증·권한
      모델이 아직 없으므로 착수 전에 결정 문서(범위 · 인증 방식 · 팩 매니페스트 등록 UI 인지 파일 업로드만인지)가 선행이다.
      조달 경로와 등록 경로(시드 스크립트 → 관리자 페이지)의 선택지는
      [decisions/sticker-asset-sourcing.md](./decisions/sticker-asset-sourcing.md)(미결)
- [ ] **세이프 에어리어 실측값** — 상단 약 10%·하단 약 20%·우측 버튼 레일은 추정치다.
      실기기 캡처가 필요하다. 값은 스펙에 굽지 않고 **버전드 팩**으로 둔다(kickoff §1.1 B-3) —
      스펙에 값으로 넣으면 플랫폼 UI 가 바뀌어도 이미 저장된 스펙을 못 고친다
- [ ] **에셋 라이선스에 영구(perpetual) 조항을 필수로 걸 것인가** ⚠️ 2026-08-20 신규.
      **2026-09-09 재판정 — 여전히 열려 있다.** 근거가 "무료 재생성 약속"에서
      "**다시 만들기가 계속 가능하다**"로 바뀌었을 뿐이다
      ([movie-cleanup-after-export.md](./decisions/movie-cleanup-after-export.md): 프로젝트는
      보존되고 유료로 다시 생성한다). 라이선스가 만료돼 에셋 서빙을 멈추면 사용자는 예전
      프로젝트를 **돈을 내고도** 다시 만들 수 없게 된다. 구독형 BGM 라이선스(Epidemic·Uppbeat 등)는 대개 "구독 기간 중
      제작한 콘텐츠는 이후에도 사용 가능" 구조지만, **만료 후 재렌더가 "기존 콘텐츠 사용"인지
      "신규 제작"인지**가 계약서마다 다를 수 있다. 법률 판단이 필요하고 스키마로는 풀리지 않는다.
      조달 단계에서 **"신규 배포 중단 / 기존 저작물 유지" 분리 조항**을 협상 항목으로 올린다.
      이 조항이 확보되면 팩 상태를 셋(`experimental → active → deprecated`)으로 줄이고
      `retired` 를 법적 차단 전용으로 좁힌다(kickoff §1.2 C-2)

**완료 조건**: 위 4건 확정 → `editSpec` v3 확정 → `bgm_tracks` + 오프라인 비트 그리드 →
1단계(출력 옵션 · ASS 자막 · VAD 무음 컷 · 비트 스냅) 구현 → 계약·골든 프레임 테스트 위에서
e2e 실검증.

**의존**: A-1(Movie와 직접 편집 API 수명) · A-2(해상도·워터마크) · E-5.

### A-8. 카카오 로그인 — 서비스 완성 후 인증 추가 계획

**왜 막혀 있는지**: 오너 결정(2026-09-24)으로 서비스 기능을 먼저 완성하고 인증 수단은 그 뒤에
늘린다. 앱 구현은 한 번 해 봤다가 되돌렸다 — 닫힌 PR
[#32](https://github.com/vlog-studio/snaply-backend/pull/32)(커밋 `a2ee3d6`)에 그대로 남아 있어,
재개할 때 참고하거나 가져다 쓰면 된다.

조사로 확인된 사실(재개 시 다시 조사하지 않아도 되는 것):

- Supabase Auth 에 **내장 `kakao` 프로바이더**가 있어 커스텀 OIDC 가 필요 없다. 앱은 Google 과 같은
  PKCE 흐름(`signInWithOAuth({ provider: 'kakao' })`)을 타고, 백엔드는 사용자를 `supabase_uid` 로만
  식별하므로 서버 변경이 없다.
- Supabase 는 카카오에 **`account_email` 동의항목을 항상 요청**한다(끄는 옵션 없음 —
  `supabase/auth` 의 `internal/api/provider/kakao.go`). 항목이 없으면 카카오가 KOE205 로 거부한다.
  `account_email` 은 **비즈 앱**에서만 쓸 수 있으므로 비즈 앱 전환(사업자 정보, 또는 본인인증 기반
  개인 개발자 비즈 앱)이 선행 조건이다. 이메일을 선택 동의로 두고 Supabase 에서
  **Allow users without an email** 을 켜면 이메일을 거부한 사용자도 로그인된다.
- 버튼은 [카카오 로그인 디자인 가이드](https://developers.kakao.com/docs/ko/kakaologin/design-guide)
  규격을 따른다: 라벨 `카카오 로그인`(`카카오로 시작하기`는 카카오싱크 전용), 배경 `#FEE500`, 검정 심볼,
  검정 85% 라벨, 다른 로그인 버튼보다 약하게 보이면 안 된다. 심볼은 공식 리소스를 쓴다.
- Supabase 는 **같은 인증 이메일일 때만** identity 를 합친다 — 이메일을 동의하지 않은 카카오 사용자가
  Google 로도 로그인하면 계정이 둘이 된다. 병합 정책을 같이 정해야 한다.

**완료 조건**: 카카오 앱 비즈 앱 전환 → Kakao Developers 설정(REST API 키·Client Secret·Redirect URI
`https://<project-ref>.supabase.co/auth/v1/callback`·카카오 로그인 ON·동의항목) → Supabase Kakao 프로바이더
활성화 → 앱 버튼 추가(#32 참고) → 개발 빌드에서 실제 로그인 확인 → 스펙 ACC-1 갱신.

### A-9. 관심사의 쓰임새 — 앱은 `준비 중`

**왜 막혀 있는지**: 관심사를 읽는 곳이 없다. 앱은 고른 값을 기기에만 저장하고 `PATCH /auth/me` 로
보내지 않았으며, 서버의 위치 알림 판단(`location.service.ts`)은 알림 스위치·조용한 시간·쿨다운만
본다. 골라도 결과가 달라지지 않는 컨트롤이었으므로, 촬영 리마인더(2026-09-24)와 같은 기준으로 앱의
편집 화면을 걷고 나 탭에 `준비 중` 으로 둔다(2026-09-26 오너 결정). 기기의 기존 선택값은 지우지 않았다.

**완료 조건** (스펙 ACC-5):

- [ ] 관심사가 무엇을 바꾸는지 정한다 — 예: 위치 알림 장소 고르기(원래 의도), 또는 앱 안에서 템플릿
      순서나 새 무비의 기본 스타일(태그 5개 중 `감성`·`여행`·`일상` 은 스타일 이름과 같다)
- [ ] 그 소비처를 구현하고, 앱이 선택을 `PATCH /auth/me` 의 `interests` 로 보낸다
- [ ] 나 탭의 `준비 중` 을 걷고 편집 화면을 되살린다(되살릴 코드는 이 결정의 커밋 이전에 있다)
- [ ] 닉네임·아바타 수정 화면 — 서버는 받지만 앱에 화면이 없다(같은 ACC-5)

---

## B. 개발 합의 필요 (A·B 트랙 공동 소유)

### B-1. 배포 인프라 결정 ★

**2026-09-15 방향 결정**: **사내 물리 서버**에 docker compose 로 올린다. 계획은
[plans/on-prem-deploy.md](./plans/on-prem-deploy.md). 사내망 전용이라 **실사용자를 받을 수는 없고**
팀 공용 통합 서버가 된다 — 외부에서 우리를 불러야 하는 SNS 게시·결제 웹훅·광고 검증은 mock 으로
둔다. DB 는 같은 서버 컨테이너(Supabase 는 로그인 전용 유지). 실사용 서버는 그때 따로 만들며
이미지·파이프라인은 그대로 재사용한다.

**2026-09-15 저장소 쪽 준비 완료** — 운영 compose 오버레이(`docker-compose.prod.yml`),
self-hosted runner 배포 잡(`.github/workflows/deploy.yml`), 배치 cron·DB 백업(`deploy/`),
절차 문서([deployment.md](./deployment.md)). **남은 것은 서버에서 하는 일**이다:

- [ ] **`서버작업`** Docker 설치 · `snaply` 계정 · 저장소 체크아웃(`/opt/snaply`)
- [ ] **`서버작업`** 시크릿 파일 `/etc/snaply/snaply.env` 작성 (개발 기본 자격증명 금지)
- [ ] **`서버작업`** self-hosted runner 설치 — 라벨에 `snaply` 포함, 서비스로 등록
- [ ] **`서버작업`** `deploy/batches.cron` 등록 · 로그·백업 디렉터리 생성
- [ ] **`서버작업`** 저장소 Variables 에 `DEPLOY_ENABLED=true` → 첫 배포 확인
- [ ] **DB 백업의 외부 보관** — 지금 덤프는 같은 서버에 쌓인다. 서버가 통째로 죽으면 함께 사라진다
- [ ] **실사용 서버** — 사내망 전용이라 이 서버로는 사용자를 받을 수 없다. 외부 접속이 되는
      곳이 생기면 고정 도메인(D-1)과 SNS·결제·광고 mock 해제만 추가하면 된다

**막혀 있던 이유**(해소): 후보(Fly / Render / ECS 등)가 확정되지 않았다.
`.github/workflows/deploy.yml` 은 `DEPLOY_ENABLED` 게이트로 준비돼 있고,
워커 이미지는 검증 완료([progress.md](./progress.md) 실검증 라운드 2)라 결정만 되면 배포 가능하다.

**결정 후 할 일**: [`apps/api/src/env-spec.ts`](../apps/api/src/env-spec.ts) 에서
`origin !== 'local'` 인 항목을 그 플랫폼의 시크릿에 넣고 `deploy.yml` 의 Deploy 스텝을 연결한다.
현재 deploy.yml 이 정의하는 시크릿은 마이그레이션용 `DATABASE_URL`/`DIRECT_URL` 2개뿐이다.
`NODE_ENV=production` 주입을 빠뜨리지 말 것 — 빠뜨려도 배포는 성공한다
([decisions/env-management.md](./decisions/env-management.md)).

**API 만 띄우면 안 된다** (2026-09-14 추가). 상주 프로세스와 스케줄 배치가 따로 있고, 빠뜨려도
**배포는 성공하며 아무 에러도 나지 않는다** — 대신 알림이 영영 안 가거나 파일이 무한히 쌓인다.
특히 만료 예고 배치는 "유예 없이 바로 삭제" 결정의 근거라, 삭제 배치만 돌고 예고 배치가 빠지면
**사용자가 예고 없이 영상을 잃는다.**

| 무엇 | 실행 | 주기 |
|---|---|---|
| API 서버 | `node dist/index.js` | 상주 |
| 편집·분석·렌디션 워커 | `python worker.py` / `analysis_worker.py` / `rendition_worker.py` | 상주 |
| **알림 발송 워커** | `node dist/notification-worker.js` | 상주 |
| **만료 예고 알림** | `npm run media:notify-expiring -w apps/api -- --yes` | 매일 **KST 10시** |
| 만료 정리(스냅·결과물·남은 객체) | `npm run media:purge-expired -w apps/api -- --yes` | 매일 1회(새벽) |
| 계정 실삭제 | `npm run accounts:purge -w apps/api -- --yes` | 매일 1회 |
| pending 영상 회수 | `npm run videos:purge-pending -w apps/api -- --yes` | 매일 1회 |

예고와 정리를 **같은 시각에 묶지 말 것** — 조용한 시간대(기본 22-08시)에 예고를 보내면
발송되지 않고 버려진다([decisions/expiry-notice-schedule.md](./decisions/expiry-notice-schedule.md)).
또한 만료 예고 배치는 FCM 서비스 계정이 없으면 **시작하지 않고 멈춘다**(dry-run 을 발송으로
기록하지 않기 위해서다) — `FIREBASE_SERVICE_ACCOUNT_KEY` 주입이 이 배치의 전제다.

**연결된 병목**: **고정 도메인**(D-1)이 SNS 콜백·결제(RevenueCat) 웹훅·Meta 검수의 전제 —
B 트랙 잔여 검증이 전부 여기서 막힌다.

### B-2. FCM 멀티 디바이스

`users.fcm_token` 이 **단일 컬럼**이라 기기 하나만 등록된다. 새 기기로 로그인하면
이전 기기 토큰을 덮어쓴다(`POST /auth/fcm-token` 이 항상 덮어쓰기).
`users` 테이블은 [team.md](./team.md) 상 **공동 소유**라 스키마 변경에 양쪽 합의가 필요하다.
별도 `user_devices` 테이블로 빼는 것이 자연스럽다.

**결정할 것**: 멀티 디바이스 지원 여부, 지원 시 발송 팬아웃 방식(`sendEachForMulticast`), 무효 토큰 정리 범위.

### B-3. `AuthUser.email` 추가

원래 `POST /billing/checkout` 이 결제 고객을 이메일 없이 생성하던 문제에서 나온
항목인데, IAP 전환으로 Checkout 이 제거되면서(2026-08-14) 그 필요성은 사라졌다
([decisions/payment-channel-iap.md](./decisions/payment-channel-iap.md)). 결제 외 용도로
`request.user`에 email을 싣는 것이 필요한지는 별도 판단이다. `plugins/auth.ts`는
**공동 소유**라 변경 시 합의가 필요하다.

### B-4. `notification_logs` 보관 정책

geofence 쿨다운 판정용 이력이 무한히 쌓인다. 쿨다운은 30분 기준이라 그보다 오래된 행은
조회에 쓰이지 않는다.

**2026-09-11 이후 만료 예고 행도 여기 쌓인다**(`kind = snap_expiry`). 다만 성격이 다르다 —
이쪽은 "이 스냅의 D-3 을 보냈는가" 를 판정하는 **유일한 근거**라, 스냅이 살아 있는 동안은
지우면 안 된다(지우면 예고가 다시 나간다). 스냅이 purge 되면 FK Cascade 로 함께 사라지므로
방치해도 무한히 쌓이지는 않는다. 보관 정책을 정할 때 두 종류를 같은 기준으로 묶지 말 것.

**결정할 것**: 보관 기간(감사 목적이 있는지), 정리 방식(주기적 삭제 / 파티셔닝).

### B-5. API 계약을 스키마 우선으로 — Zod 계약 패키지 ★

**결정됨** (2026-09-05): 계약의 원천을 `packages/shared-types`의 Zod 스키마 하나로 통일하고
백엔드 검증·직렬화·OpenAPI와 모바일 타입·런타임 검증을 그 스키마에서 유도한다. 배경(여섯 겹
사본)과 기각한 대안은 [decisions/api-contract-schema-first.md](./decisions/api-contract-schema-first.md).

**왜 열려 있는지**: 단계가 다섯이고 각 단계가 독립 머지되어야 한다. 모바일 `shared/api`와
`packages/shared-types`는 [team.md](./team.md) §2의 공유 surface라 4단계는 양 트랙 합의가 필요하다.

- [x] 1. Fastify 5 + 플러그인 메이저 업 (`@fastify/rate-limit`·`swagger`·`swagger-ui`·`websocket`·`fastify-plugin`) — 2026-09-05
- [x] 2. `schemas/responses.ts`·라우트 요청 인터페이스 → `packages/shared-types` Zod 스키마 (컴파일러가 Zod 전용이라 한 변경에서 전부) — 2026-09-05
- [x] 3. OpenAPI 스냅샷 테스트 — `test/openapi-snapshot.test.ts`가 생성 스펙과 커밋된 `apps/api/openapi.json` 일치를 검사. 모바일 `api:pull` 제거, `api:gen`은 이 파일을 읽는다 — 2026-09-05
- [x] 4. 모바일: `apiRequest`·`apiPath`가 `apiContract` 타입(타입 전용 import)에서 경로·메서드·query·body·응답 타입을 유도. `openapi-typescript`·`schema.d.ts`·`api:gen`/`api:check` 제거, `verify`가 `contract:build`를 먼저 실행 — 2026-09-05
- [x] 5. `api-spec.md`를 "FE 가 다뤄야 할 동작 + WebSocket" 으로 축소, 필드 형태는 계약 파일·Swagger 로 위임 — 2026-09-05

**완료 조건(충족)**: 엔드포인트 계약을 손으로 적는 곳이 `packages/shared-types` 하나이고, 모바일
`verify`(typecheck)와 백엔드 테스트(`openapi-snapshot`)가 서버 실행 없이 그 계약과의 일치를 검사한다.

**남은 후속** (계약 원천 통일 뒤의 다듬기):
- [ ] 엔티티 경계의 Zod 를 계약 스키마의 **파생**(`videoSchema.pick(...)` 등)으로 바꾸기. 계약 패키지가
  앱 **런타임** 번들에 들어가므로 Metro 가 `dist`(또는 `react-native` export 조건으로 `src`)를 해석하는지,
  Jest 가 워크스페이스 심링크 밖 ESM 을 변환하는지 한 엔티티로 먼저 확인한다. 지금은 타입만 쓰고
  경계 스키마는 `apiRequest`의 할당 가능성 규칙으로 계약과 대조한다
- [ ] `openapi.json`의 `*Input` 사본 스키마 — type provider 가 입력/출력 레지스트리를 둘 다 내는 동작.
  무해하지만 Swagger 가독성을 위해 upstream 옵션이 생기면 끈다

### B-6. ~~알림 설정의 서버 반영~~ — 2026-09-15 완료(서버)

`PATCH /auth/me` 가 `notificationEnabled` · `locationNotificationEnabled` ·
`movieNotificationEnabled` · `quietStart` · `quietEnd` 를 받는다. 종류별로 나눈 이유와
**만료 예고에만 종류별 스위치를 두지 않은 이유**는
[decisions/notification-preferences.md](./decisions/notification-preferences.md).

- [ ] **`앱`** 설정 화면의 스위치를 `PATCH /auth/me` 로 쓰기. 지금은 기기 저장만이라 서버
      발송에 닿지 않는다. **조용한 시간도 서버로 보내야 실제로 억제된다** — 현재 앱의 조용한
      시간 UI 는 아무것도 억제하지 않는다

---

## C. 외부 크리덴셜/승인 대기

### C-1. 스토어 상품 등록(크레딧 팩 + 구독) → IAP 구매·웹훅 검증

**막힌 이유**: 백엔드 구현은 끝났다(2026-08-14, [progress.md](./progress.md)). 남은 것은
저장소 밖 설정이다 — 크레딧 묶음의 수량·가격(A-2)이 확정되지 않아 양 스토어에 consumable
상품을 등록할 수 없고, App Store Connect / Play Console / RevenueCat 프로젝트 설정도 아직 없다.

**등록 시 맞춰야 할 것**: 스토어 상품 ID는
[`credit-policy.ts`](../apps/api/src/services/billing/credit-policy.ts)의 `CREDIT_PACKS.productId`와
**글자 그대로 일치**해야 한다. 어긋나면 웹훅이 지급량을 못 찾아 500으로 떨어진다(재시도로 복구는 된다).
RevenueCat 웹훅 URL은 `POST /billing/webhook/revenuecat`, Authorization 헤더 값은
`REVENUECAT_WEBHOOK_AUTH_TOKEN`과 같아야 한다.

**완료 조건**: A-2에서 크레딧 묶음 확정 → `credit-policy.ts` 값 교체 → 양 스토어 consumable 상품 등록 →
RevenueCat 프로젝트·웹훅 URL 설정 → sandbox 구매 → 웹훅 수신 → 크레딧 지급 →
같은 트랜잭션 웹훅 재전송 시 중복 지급 없음까지 한 번 통과하면 닫힌다.

**구독 상품이 추가된다** (2026-08-14,
[decisions/storage-and-subscription-policy.md](./decisions/storage-and-subscription-policy.md) §5).
크레딧 팩(consumable)과 별도로 스토리지 구독을 **auto-renewable subscription**
(Apple Subscription Group / Google base plan)으로 등록해야 하고, A-2의 용량 티어·가격
확정이 선행된다. sandbox 검증에 갱신·해지·만료·결제실패 전이가 추가되며, 앱 쪽에는
**"구매 복원(Restore Purchases)" 버튼**이 필수다(Apple App Review 3.1.2(a) — 누락 시 리젝).

### C-2. 틱톡 받은함 실물 미도착

**막힌 이유**: 업로드 API 는 성공(`SEND_TO_USER_INBOX` / `error.code=ok`)을 반환하는데
사용자 앱에 알림이 오지 않는다. 3회 시도 모두 동일.

**진단의 벽**: `user.info.basic` 스코프가 재인증 후에도 부여되지 않아
(`/v2/user/info/` → `scope_not_authorized`) **어느 계정에 전달됐는지 확인할 수단이 없다.**
받은함 내용을 조회하는 API 도 없다.

**다음 확인 순서**
1. Sandbox → Scopes 에 `user.info.basic` 이 실제로 켜져 있는지 → `Apply changes`
2. TikTok 앱에서 기존 앱 연결 해제 후 재인증 (기존 승인 재사용을 막아야 새 동의가 뜬다)
3. 동의 화면에 권한이 **두 개** 표시되는지 확인
4. 부여되면 `/v2/user/info/` 로 계정 확정 → 그 계정의 **받은 편지함(알림)** 확인
   (초안/Drafts 가 아니다 — 알림을 탭해야 편집 화면으로 들어간다)

계정이 확정되면 "계정 불일치"인지 "Sandbox 가 실제 전달을 하지 않음"인지 갈린다.
상세 기록은 [sns-setup.md](./sns-setup.md).

**완료 조건**: 받은함 알림 도착 확인. 또는 Sandbox 제약임이 확인되면 심사 통과 후 재검증.
2026-08-31 개발자 회의에서 테스트 계정으로 "영상 업로드 정상 동작"이 보고됐으나 받은함 실물 도착까지
확인한 것인지는 기록에 없다 — 참석자에게 재확인하고, 확인됐다면 이 항목을 닫고
[progress.md](./progress.md)에 기록한다.

### C-3. 틱톡 `video.publish` 심사 → 직접 게시 전환

**현재**: `video.upload`(받은함) 방식. 사용자가 틱톡 앱에서 마무리해야 게시되고,
응답에 `requiresUserAction: true` 가 실린다.

**완료 조건**: 앱 심사로 `video.publish` 승인 → `.env` 한 줄만 변경
```bash
TIKTOK_SCOPES=user.info.basic,video.publish
```
엔드포인트는 코드가 자동 분기한다(`/inbox/video/init/` → `/video/init/`).
  `requiresUserAction` 이 응답에서 사라지므로 **모바일 안내 문구도 함께 정리**해야 한다
([api-spec.md](./api-spec.md) SNS 업로드 절).

### C-4. FCM 실기기 수신

**이미 검증된 것**: 실크리덴셜로 FCM API 호출, 미등록 토큰 →
`registration-token-not-registered` → `users.fcm_token` 자동 정리까지 실동작 확인.

**막힌 이유**: 앱의 FCM 토큰 발급·`POST /auth/fcm-token` 등록과 서버 발송 파이프라인은
구현돼 있지만, 실기기 토큰으로 geofence 진입부터 수신까지 한 번에 검증하지 않았다.

**완료 조건**: dev/release build에서 발급한 토큰 등록 → geofence 진입 보고 → 서버 쿨다운·
quiet hours 판정 → 기기 푸시 수신을 한 번 통과하고, 실패 시 Firebase·서버 로그를 함께 남긴다.

### C-5. Meta 앱 검수용 URL 2개

`routes/legal.ts` 가 서비스 소개·약관·개인정보처리방침은 서빙하지만, 앱 검수 제출 시
추가로 요구되는 두 개는 미구현이다 (OAuth 테스트에는 불필요해서 미뤘다).

- **승인 취소 콜백 URL** — 사용자가 앱 연결을 해제하면 Meta 가 호출 (`signed_request` POST)
- **데이터 삭제 요청 URL** — 개인정보 삭제 요청 처리. URL + 확인 코드를 반환해야 한다.
  삭제 자체는 계정 삭제 파이프라인(`account.service.ts` 의 `deleteAccount`)을 재사용한다 —
  [decisions/account-deletion.md](./decisions/account-deletion.md)

**완료 조건**: 검수 제출 전 두 엔드포인트 구현 + 콘솔 등록.

### C-6. AdMob 콘솔 설정 → 보상형 광고 지급 실검증

**현재**: 백엔드, 앱 SDK/provider, Android AdMob 앱·광고 단위·SSV URL 설정은 끝났다
(2026-08-19 — 구현 상세는 [모바일 기능 문서](../apps/mobile/docs/features/credits-and-rewarded-ads.md),
**미결 상태·완료 조건의 원천은 이 항목이다**).
그러나 Snaply의 공개 Play 스토어 등록이 없어 AdMob 앱 검토를 통과할 수 없고, 자체 광고 단위가
`no-fill`을 반환한다. Google 공개 테스트 단위는 Snaply의 SSV URL을 갖지 않아 크레딧 지급을
검증할 수 없다.

**출시·검증 전에 남은 것**
- SSV 콜백 URL은 **`GET {고정 도메인}/billing/webhook/admob`** — 쿼리 파라미터를 임의로 덧붙이지
  않는다(서명 대상이 쿼리스트링 원문이다). 고정 도메인은 D-1에 걸려 있다.
- 생성된 광고 단위 ID를 `ADMOB_SSV_ALLOWED_AD_UNITS`(쉼표 구분)에 넣어야 한다. **비어 있으면
  모든 콜백이 거절된다** — 지급 경로를 "설정 안 함 = 전부 허용"으로 열지 않기 때문이다.
  **형식이 확정되지 않았다**: Google 문서의 `ad_unit` 설명은 "AdMob ad unit ID" 인데 예시값은
  `2747237135` 같은 숫자다(전체 형식 `ca-app-pub-…/2747237135` 가 아니다). 숫자 부분과 전체
  형식을 **둘 다 넣고 시작**한 뒤, 첫 지급이 통과하면 실제로 온 값을 `ad_rewards.ad_unit` 에서
  확인해 정리한다. 거절 시에도 수신한 `ad_unit` 을 기록하므로 로그 없이 판정할 수 있다.
- 앱의 `customData = nonce`, `userId = ssvUserId` 배선은 완료됐다. 변경 시 이 계약을 유지한다.
- 앱의 무비 생성 화면이 생성 버튼을 누르기 **전에** 잔액과 100크레딧 비용을 보여주지 않는다 —
  유료 플로우 활성화 전에 붙인다(현재는 부족 시 402 안내로만 드러난다).
- 보상량 20·한도 5는 확정됐다(A-2). 콘솔 설정이 끝날 때까지 `AD_REWARD_ENABLED=false`다.
- Google UMP와 iOS ATT 동의 흐름, iOS AdMob App ID·광고 단위·SKAdNetwork 설정이 필요하다.
- App Store Connect 개인정보와 Play Console 광고·데이터 안전성 신고를 실제 SDK 수집 범위와 맞춘다.

**완료 조건**: 공개 스토어 등록 → AdMob 앱 검토 통과 → 운영 도메인·allowlist·동의 흐름 주입 →
등록한 테스트 기기에서 자체 광고 단위 시청 → 실제 SSV 수신 → 크레딧 지급 → 같은 트랜잭션
재전송 시 중복 지급 없음까지 통과하면 닫힌다. iOS 출시 전에는 iOS 설정과 수신도 별도로 통과한다.

---

## D. 운영 전환 시

### D-1. 고정 도메인

현재 로컬 검증은 cloudflared 임시 터널(`*.trycloudflare.com`)을 쓴다.
**재시작하면 주소가 바뀌고, 그때마다 인스타·틱톡 콘솔의 리디렉션 URI 와
URL prefix 소유권 검증을 다시 등록해야 한다.**

`snaply.com` / `snaply.co` 는 제3자 소유이고 Cloudflare 가 아니라 named tunnel 을 쓸 수 없다
(NS: linode.com). 스크립트는 준비돼 있다:

```bash
cloudflared tunnel login                        # 브라우저 인증, 1회
./apps/api/scripts/dev-tunnel.sh <도메인>        # 터널·DNS·설정 자동
```

**2026-08-31 개발자 회의**: SNS 웹훅 연동에 HTTPS 도메인이 필요해 **사내 AWS 등록 현황을 파악한 뒤
도메인을 추가**하기로 했다([meetings/2026-08-31-dev-sync.md](./meetings/2026-08-31-dev-sync.md) §1).
사내 AWS 도메인으로 가면 위 cloudflared named tunnel 경로는 쓰지 않고 운영 배포(B-1) 경로에서
해결된다 — 그 경우 개발 검증은 임시 터널을 계속 쓴다. "웹훅 연동"이 어느 웹훅을 뜻하는지는
[decisions/sns-webhook-scope.md](./decisions/sns-webhook-scope.md)(미결)에서 정한다 — 도메인 작업은 그 답과 무관하게 진행한다.

**완료 조건**: Cloudflare 에 등록된 보유 도메인 확보, 또는 사내 AWS 도메인을 운영 도메인으로 확정.
운영 도메인이 정해지면 그것이 `CLOUDFRONT_DOMAIN` / `S3_PUBLIC_ENDPOINT` 의 실제 값이 되므로
자연스럽게 해결된다.

### D-2. 법률 문서 정식화

`routes/legal.ts` 의 약관·개인정보처리방침은 **코드 기준으로 실제 수집 항목을 정확히 기술했지만
법률 검토를 받지 않은 초안**이다(페이지 상단에도 표기). 앱 심사 제출·서비스 출시 전
정식 문서로 교체해야 한다.

`LEGAL_CONTACT_EMAIL` 이 미설정이면 `support@snaply.app` 로 표시된다 — 실제 주소로 교체 필요.

### D-3. URL prefix 소유권 검증 재등록

틱톡은 검증할 prefix 가 **호스트별로 따로** 필요하고 **서명도 property 별로 따로** 발급된다:

| prefix | 용도 | 서빙 방법 |
|---|---|---|
| `<API 호스트>/legal/` | 약관·개인정보 URL (콘솔 저장) | `routes/legal.ts` (`SITE_VERIFICATION_*`) |
| `<미디어 호스트>/snaply-dev/` | 영상 URL (PULL_FROM_URL) | 버킷에 검증 파일 업로드 |

운영에서 CloudFront 도메인 하나로 합쳐지면 검증도 한 번으로 줄어든다.
`trycloudflare.com` 같은 공유 도메인도 파일 서빙 방식으로 검증된다는 것은 실측 확인했다.

### D-4. 개발 버킷 익명 읽기 정책

`npm run dev:public-bucket` 은 로컬 MinIO 전용이다(`S3_ENDPOINT` 없으면 실행 거부).
운영에서는 CloudFront 가 공개 서빙하므로 이 스크립트를 쓰지 않는다.
단, 틱톡 **검증 파일**은 익명 읽기가 필요하므로 운영에서도 그 경로만은 공개여야 한다.

### D-5. 만료된 광고 보상 세션 정리 배치

`ad_rewards` 의 만료 확정은 **조회 시점 lazy** 다([decisions/ad-reward-credits.md](./decisions/ad-reward-credits.md) §4-1).
다시 들어오지 않는 사용자의 세션은 `pending` 으로 남는다. 상태 오독을 만들지는 않지만
(그 사용자가 다시 오면 그 자리에서 확정된다) 행이 계속 쌓인다.

**지금 하지 않는 이유**: 크레딧이 아니라 행만 늘고, 상한도 "진행 중 1개 + TTL 300초"가 정한다
(사용자당 하루 최대 288행). 실사용 규모에서 실제로 문제가 되면
`orphan-video-cleanup` 과 같은 방식의 배치를 붙인다.

---

## E. 코드 결함 / 판단 필요

### E-1. ~~인스타 연동 토큰의 만료 시각이 `null` 이다~~ — 2026-09-15 코드 쪽 완료

**남은 운영 조치**(인스타 재연동)는 G 섹션으로 옮겼다.

코드 쪽은 "만료 시각을 모를 때 어떻게 다룰지" 가 판단 대기였고, **가짜 만료값을 넣지 않기로**
했다 — 멀쩡한 토큰에 "재연동 필요" 가 뜨는 쪽이 더 나쁘다. 대신 셋을 한다.

- **업로드 때 갱신을 한 번 시도해 진짜 만료 시각을 알아낸다.** 성공하면 데이터가 실제로
  고쳐지고, 실패하면 오늘과 똑같이 현재 토큰으로 진행한다(되던 게시가 깨지지 않는다)
- **게시가 실패하면 재연동을 안내한다.** 단정하지 않고 원인(플랫폼 응답)은 남긴 채 덧붙인다
- **`GET /sns/connections` 가 `tokenExpiresAt` 을 싣는다.** `null` 은 "만료되지 않는다" 가
  아니라 **"모른다"** 이며, 앱은 그 경우와 이미 지난 경우에 재연동을 안내할 수 있다

### E-2. ~~`S3_PUBLIC_ENDPOINT` 미설정 시 기동 경고 로그~~ — 2026-09-11 완료

`snsUploadReadiness()` 가 기동 시 판정해 불가하면 이유와 함께 경고 한 줄을 남긴다.
**미설정만 보지 않는다** — `S3_PUBLIC_ENDPOINT=http://localhost:9200` 처럼 값이 있어도
플랫폼이 도달하지 못하면 결과가 같으므로, 업로드 때와 같은 기준(사설/로컬 주소·https)으로
판정한다. 전부 mock 이면 경고하지 않는다(실업로드를 하지 않는다).
미설정 동작은 기존대로 "SNS 업로드 비활성 + 400" 이다.

### E-3. ~~S3 삭제 실패분 정리 배치~~ — 2026-09-09 완료

만료 정리 배치(`media:purge-expired`)의 세 번째 경로로 들어갔다 —
`deleted_at` 은 있는데 `purged_at` 이 없고 키가 남은 행을 찾아 객체를 회수한다
(`findOrphanedObjects`/`purgeOrphanedObjects`). 계정 purge 는 유저 prefix 전체를 지우므로
**영상 단건** 회수는 이 경로가 맡는다.

### E-4. ~~빌드한 이미지가 실제로 뜨는지 아무도 확인하지 않는다~~ — 2026-09-11 완료

`deploy.yml` 이 **빌드 → 스모크 → 푸시** 순서가 됐다. 검사한 그 이미지에 태그만 붙여 올리므로
검사 대상과 배포 대상이 갈라지지 않는다. 검사 내용은 [`scripts/smoke-images.sh`](../scripts/smoke-images.sh):

- **API** — 이미지를 실제로 띄워 `/health` 가 `db=connected` 를 돌려주는지. `status:ok` 만 보면
  마이그레이션이 실패해도 통과한다(뜨지만 아무 요청도 처리하지 못하는 상태)
- **워커** — BGM 자산·ffmpeg/ffprobe·워커 3종 임포트. 경로는 `config.BGM_DIR` 에서 읽는다 —
  스크립트에 다시 적으면 config 와 어긋나도 통과하고, 실제로 그렇게 숨었던 결함이다

로컬에서도 같은 명령으로 돈다: `npm run smoke:images`.
ai-worker 는 이미지가 커서 기동 대신 정적 검사만 한다 — 과거 두 결함(자산 누락·경로 어긋남)이
모두 이 검사에 걸리므로 모델을 올리지 않고도 목적을 달성한다.

### E-5. BGM 무작위 선택이 레시피 재생성 결정론을 깬다 ⚠️

[decisions/storage-and-subscription-policy.md](./decisions/storage-and-subscription-policy.md) §3.2 는
만료된 무비를 영구 보관된 `editSpec`+`renderSpec` 으로 **크레딧 없이 무료 재생성**한다고
확정했다. 그런데 BGM 선택이 디렉터리 스캔 + `random.choice` 라
([`apps/ai-worker/src/pipeline/music.py`](../apps/ai-worker/src/pipeline/music.py))
**같은 레시피로 재생성해도 BGM 이 달라진다.** 사용자는 "복원"을 눌렀는데 다른 영상을 받는다.

**2026-09-09 재판정 — 급박함은 줄었지만 사라지지는 않았다.** 무료 재생성(위 §3.2)이
폐기되면서([movie-cleanup-after-export.md](./decisions/movie-cleanup-after-export.md))
"복원을 눌렀는데 다른 영상" 이라는 시나리오는 없어졌다. 다시 만들기는 이제 **사용자가 편집한 뒤
크레딧을 내고 하는 새 생성**이라, 결과가 달라지는 것이 배신은 아니다.

그러나 결함 자체는 남는다: **같은 구성으로 다시 만들었는데 BGM 이 바뀌면** 사용자는 자기가
바꾸지 않은 것이 바뀐 이유를 알 수 없다. MOV-14(같은 구성 → 같은 결과)도 여전히 그렇게 요구한다.
A-7 의 비트 싱크가 들어오면 컷 지점까지 달라져 피해가 커진다.

**완료 조건**: 선택된 트랙 ID·난수 시드를 `editSpec` 에 핀으로 남기고, 재생성이 같은 산출물을
내는 것을 테스트로 고정한다. 트랙 ID 를 가지려면 `bgm_tracks` 가 필요하므로 A-7 과 함께 간다.

### E-7. MinIO 커뮤니티 이미지의 수명 — 로컬·CI·사내 서버 스토리지 대체 검토 ⚠️ 2026-09-23 신규 · 2026-09-25 미러로 복구

MinIO 가 **2026-09-11 에 Docker Hub 의 `minio/minio`·`minio/mc` 를 삭제했다.** 2025-10 무료 이미지
배포 중단, 2026-02 OSS 저장소 아카이브에 이은 마지막 단계이며, 커뮤니티 에디션은 유료 AIStor 로
대체되는 중이다. `npm run infra:up` 이 pull 거부로 깨져 compose 3곳(dev · 풀스택 · CI)을
`quay.io/minio/minio:RELEASE.2025-09-07T16-13-09Z` 로 옮기고 **태그를 고정**했다(2026-09-23).
이 태그는 amd64·arm64 둘 다 있다 — `.hotfix.*` 태그들은 amd64 만 있어 Apple Silicon 에서
pull 이 실패하므로 태그를 올릴 때 매니페스트를 확인한다.

**2026-09-25 quay.io 도 막혔다**(익명 pull 401). 위에서 걱정한 대로 CI · Deploy 가 같은 날 깨졌다.
같은 릴리스를 **아카이브된 소스에서 빌드해 우리 GHCR 로 올리는 것**으로 옮겼다 —
[`deploy/minio/Dockerfile`](../deploy/minio/Dockerfile)(태그 커밋 SHA 고정, 버전 문자열·커밋이
업스트림 이미지와 같다), [`minio-image.yml`](../.github/workflows/minio-image.yml)(main 에서
amd64·arm64 로 `ghcr.io/vlog-studio/snaply-backend/minio:RELEASE.2025-09-07T16-13-09Z` push).
패키지는 비공개라 로그인 없이 받을 수 없으므로 [`scripts/ensure-minio-image.sh`](../scripts/ensure-minio-image.sh)
가 받지 못하면 같은 Dockerfile 로 로컬 빌드한다(CI · Deploy 스모크 · `infra:up` · `stack` 이 부른다).
이제 외부 배포처가 사라져도 깨지지 않는다 — 남는 의존은 GitHub 의 소스 아카이브와 Go 모듈뿐이다.

**왜 열려 있는지**: 미러는 공급 문제만 푼다.

- 커뮤니티 릴리스는 2025-09-07 이후 패치가 없다. 보안 수정은 AIStor 에만 간다 — 우리가 빌드해도 같다
- **사내 서버(B-1)는 MinIO 를 운영 스토리지로 쓰고 사내망에 열려 있다** — 패치가 끊긴 S3 서버를
  계속 노출하는 것은 로컬 개발용보다 무거운 문제다

**결정할 것**: 대체 S3 호환 서버(RustFS · Garage · SeaweedFS 등)로 바꿀지, 사내 서버만 바꿀지,
실사용 서버는 AWS S3 라 무관하므로 로컬 · CI 는 미러로 둘지. 코드는 `S3_ENDPOINT` 만 바꾸는
구조라 교체 비용은 compose 3곳 · [ONBOARDING.md](../ONBOARDING.md) · [deployment.md](./deployment.md)
와, MinIO 전용 API 에 기대는 곳이 있는지 확인(`dev:public-bucket` 스크립트 · 헬스체크 경로) 정도다.
GHCR 패키지를 공개로 돌릴지도 정한다 — 공개면 새 개발자가 로그인 없이 받고, 로컬 빌드(몇 분)를 건너뛴다.

**완료 조건**: 대체 여부 결정 → 바꾼다면 compose 3곳 + 문서 갱신 + `npm test -w apps/api`
(통합 테스트가 MinIO 를 쓴다) 통과. 두기로 하면 이 항목을 "소스 빌드 미러 유지"로 좁혀 닫는다.

---

## F. 남은 실검증

- [x] ~~HDR·장시간(수분)·10클립 상한 등 스트레스 케이스 (A 트랙)~~ — **2026-09-15 완료.**
      실제 아이폰 영상(1080x1920 H.264 60fps)으로 검증했다. 10클립 43초·장시간 182초(96초 소요,
      타임아웃 600초) 모두 정상. **HDR 에서 결함 하나를 찾아 고쳤다** — 픽셀은 SDR 로 내리고
      색 태그는 PQ/bt2020 으로 남겨, 플레이어가 톤매핑을 한 번 더 걸었다(progress.md 참고).
      **돌비비전 실물은 아직 미검증** — 합성 HDR10 으로만 확인했다. 실제 DV 영상이 생기면 재확인
      **HDR 은 실검증 이전에 톤매핑 필터 자체가 없다** — 아이폰 기본 촬영이 돌비비전이라
      들어오는 즉시 드러난다. [plans/trend-editing-pipeline.md](./plans/trend-editing-pipeline.md) §6.1
- [ ] 배포 인프라 확정 후 `deploy.yml` 활성화 (B-1 선행)
- [ ] 실BGM 기준 whisper 자막 인식 재확인 (현재는 dev BGM 기준으로만 확인)

---

## G. 정리 필요 (일회성)

> 2026-08-11 재판정. 원래 4건이었으나 실제 상태를 확인해 1건으로 줄였다 —
> Firebase 키는 로테이션 완료, 루트 키 파일은 이미 없고,
> 틱톡 `client_key` 는 제거하지 않기로 판정했다(아래 "닫은 항목").

- [ ] **인스타 연동 재연동** ⚠️ — 현재 저장된 연동은 `token_expires_at` 이 **`null`** 이다(개인 계정
      시절 장기 토큰 교환이 실패한 흔적). 이 토큰은 **조용히 만료되고** 그 뒤 게시가 실패한다.
      `GET /sns/instagram/connect` → 승인 한 번이면 60일짜리 만료 시각이 채워진다. 계정이
      프로페셔널로 바뀌어 실패 원인은 사라졌다. 코드 쪽 대응은 E-1 에서 끝났지만(다음 게시 때
      서버가 갱신을 시도해 만료 시각을 알아낸다) **이미 만료된 뒤라면 갱신도 실패**하므로
      재연동이 확실한 길이다
- [ ] **테스트 게시물 정리** — 인스타 릴스는 API 로 삭제할 수 없으므로 앱에서 수동으로 지운다.
      **틱톡 받은함 초안 3건은 지우지 않는다** — C-2("API 는 ok 인데 알림 미도착")의 유일한 증거물이라
      C-2 가 닫힌 뒤에 정리한다.

### 닫은 항목 (다시 올리지 않기 위한 기록)

- **Firebase 서비스 계정 키** — 2026-08-11 로테이션 완료(새 키 발급 → `.env` 교체 → 기존 키 삭제).
  키가 저장소에 들어온 적은 없다 — 이력 전체를 훑어도 private key 재료가 걸리는 곳은
  [apps/api/test/fcm.test.ts](../apps/api/test/fcm.test.ts) 의 `fake` 픽스처뿐이고, `.env` 는 추적된 적이 없다.
  레포 루트의 `snaply-66f8c-firebase-adminsdk-*.json` 도 이미 없으며 `.gitignore` 에
  `*firebase-adminsdk*.json` 패턴이 있다.
- **틱톡 Sandbox `client_key` 이력 노출** — 제거하지 않기로 판정했다. 준공개 식별자이고
  짝이 되는 secret 은 이력에 없어 위험이 낮은 데 비해 history rewrite 비용이 크다.
  근거와 판정이 달라지는 조건은 [sns-setup.md](./sns-setup.md) §3.
