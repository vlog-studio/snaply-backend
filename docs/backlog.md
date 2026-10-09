# 미결 작업 백로그

**작성일**: 2026-08-10
**상태**: 현행 — 저장소 전체의 닫히지 않은 작업을 모은 단일 목록
**원천**: 다음에 결정하거나 구현할 일의 유일한 원천. 확정된 결정의 배경·기각한 대안은
[decisions/](./decisions/README.md), 착수 전 구현 제안은 [plans/](./plans/README.md), 요구별 구현 상태는
[specs/](./specs/README.md)의 라벨, 끝난 일은 [progress.md](./progress.md)가 원천이다
**관련 문서**: [progress.md](./progress.md) · [decisions/README.md](./decisions/README.md) ·
[specs/README.md](./specs/README.md) · [doc-conventions.md](./doc-conventions.md) §본문

미결 항목은 이 문서에만 둔다 — 여러 문서에 흩어져 있으면 하나를 닫아도 나머지가 낡는다. 이 문서만 읽어도
다음에 결정하거나 구현할 일을 빠짐없이 찾을 수 있어야 하고, 다른 문서는 항목을 ID(`A-4`)로 가리킨다.

**항목 형식**: 각 항목은 **왜 막혀 있는지**와 **무엇이 있으면 닫히는지(완료 조건)**를 적는다. 결정의 배경은
결정 문서에 두고 여기서는 링크한다. 항목 앞의 `앱` · `서버` · `서버작업` 라벨은 작업할 곳(모바일 앱 · 저장소의
서버 코드 · 서버 머신에서 손으로 하는 일)이다.

**닫는 법**: 끝난 항목(끝난 체크 항목 `[x]` 포함)은 본문을 지우고 문서 끝 [닫은 항목](#닫은-항목)에
`- **ID** 요약 — 날짜 → progress 날짜 "제목"` 한 줄만 남긴다. 일부만 끝났으면 끝난 부분만 옮기고 남은 것을
둔다. 번호는 재사용하지 않으며, 빠진 번호는 닫은 항목에 있다.

---

## A. 기획/제품 결정 대기

가장 앞단의 병목. 아래가 정해지지 않으면 구현을 시작할 수 없다.
회의에서 정해야 하는 결정 요청 문서의 목록은 [decisions/README.md](./decisions/README.md) §결정 대기.

### A-1. 영상 묶음(프로젝트) 구조 ★

**결정됨**: 영상은 평면으로 보관하고, 편집할 클립을 참조하는 엔티티는 **`Movie`** 다
([decisions/movie-model.md](./decisions/movie-model.md)). 세부 규칙 ①~⑤는
[movie-export-policy.md](./decisions/movie-export-policy.md), 생애주기 세 축(스냅 보관 · 로컬 파일 · 내보내기 후)은
[snap-retention-period.md](./decisions/snap-retention-period.md) ·
[local-copy-after-upload.md](./decisions/local-copy-after-upload.md) ·
[movie-cleanup-after-export.md](./decisions/movie-cleanup-after-export.md)가 원천이고, 요구는 SNAP-9·12·13·14 ·
MOV-16~19 다. 만료의 동작 구조(2단계 삭제 · 만료 스냅 식별 · 사전 알림)는
[snap-retention-period.md](./decisions/snap-retention-period.md#만료의-동작-구조). 위치 정보 저장 여부는 A-4 에서만
관리하고, 로컬 삭제 전환과 15일 만료가 겹치는 문제는 A-4 "전환을 켤 때 함께 볼 것"이 맡는다.

서버 API(2026-09-09)와 앱 전환(2026-09-12, [decisions/movie-client-cache.md](./decisions/movie-client-cache.md))은
끝났다 — 닫힌 항목은 [닫은 항목](#닫은-항목). 남은 것:

- [ ] **`앱`** **서버 전환 실기기 검증** — 단위 테스트와 인메모리 목으로만 검증됐다.
      Android dev build 에서 실제 서버에 대해: ① 촬영 직후 담은 초안이 업로드가 끝난 뒤 서버에 생긴다
      ② 편집이 PATCH 된다 — **2026-10-01 통과**(Galaxy S22 Ultra 에서 고른 전환 · 구간이 DB 에 `user` 로 닿았다,
      [progress.md](./progress.md) 2026-10-01 "경계별 전환 실기기 확인" · "자동 편집 실기기 확인")
      ③ 생성 → **완성 푸시가 한 번만** 오고 탭하면 그 무비가 열린다(cold start 포함 —
      Android 에서 FCM 과 expo-notifications 가 같은 탭을 둘 다 보고하는지, 중복 억제 창 2초)
      ④ 끝내기 → 결과물이 사라지고 초안으로 돌아온다 ⑤ 앱 삭제·재설치 → 로그인 → 무비 목록이 돌아온다 —
      **2026-09-27 통과**(Galaxy S22, [progress.md](./progress.md) 2026-09-27) ⑥ 계정 전환 → 다른 계정 무비가 보이지 않는다.
      **완료 조건**: 여섯 가지가 통과하면 MOV-2·17 · NTF-6·8 의 "실기기 미검증" 표기를 지운다

- [ ] **`서버`** **`POST /edit-jobs` 폐기** — 결정 ⑤ 는 "한 버전 공존 후 폐기"다. 앱이 Movie export 로
      옮긴 릴리스의 **다음 릴리스**에서 제거한다. 시점을 항목으로 남기지 않으면 영구 공존이
      되어 editSpec v3 를 두 곳에 붙이게 된다(A-7 부착 지점)

- [ ] **무비가 참조 중인 스냅의 만료 예외 여부**(정책) — **2026-09-15 잠정 결정: 예외를 두지
      않는다**(현행 유지, 코드 변경 없음). **다음 회의 안건**이며, 다시 볼 때는 선택지 C(무비를
      편집하면 기간이 갱신)에서 시작하는 것이 빠르다. 검토한 선택지 넷과 기각 사유는
      [decisions/movie-snap-expiry-exemption.md](decisions/movie-snap-expiry-exemption.md).
      요금제 설계(A-2)와 함께 보는 것이 자연스럽다 — 비용이 아니라 유료 전환 경계의 문제다

- [ ] **`서버`** **프로젝트(무비) 자동 삭제 킬스위치** — 프로젝트는 지우지 않되 자동 삭제를
      "기능만 만들고 기본 꺼짐"으로 두기로 했다([movie-cleanup-after-export.md](./decisions/movie-cleanup-after-export.md)
      파생 결정 3). 결과물 정리(끝내기 시 삭제 MOV-17 · 30일 상한 MOV-16)는 구현됐지만 이 스위치는
      코드에 없다. 언제 지울지는 결정에 없으므로 구현 전에 정한다.
      **완료 조건**: 기본 꺼짐 설정과 삭제 경로가 테스트와 함께 들어간다

- [ ] **결과물 만료 안내** — 끝내지 않은 결과물의 30일 상한(MOV-16)을 어떤 알림으로 줄지 정해지지 않았다:
      완성 알림 본문에 보관 기간을 적을지와 만료 전 알림을 언제 보낼지
      ([storage-and-subscription-policy.md](./decisions/storage-and-subscription-policy.md) §3.5 는 본문 명시와
      D-3 알림을 적었다). 완성 알림은 서버 FCM 이라(`apps/api/src/services/movie-ready-notice.service.ts`) 문구를 서버가
      쥔다. 끝내기(MOV-17)가 붙은 뒤 사용자가 실제로 결과물을 얼마나 방치하는지 보고 정한다

### A-2. 크레딧 결제 세부 정책 확정

과금 모델·결제 채널·보관 정책은 확정됐고 백엔드 구현도 끝났다([progress.md](./progress.md) 2026-08-14) —
현행 요구는 [specs/credits-and-payment.md](./specs/credits-and-payment.md)·[snap-library.md](./specs/snap-library.md)·
[movie.md](./specs/movie.md), 배경은 [decisions/](./decisions/README.md)의 결제·스토리지 결정이 담는다.
크레딧 쪽 미결은 **코드가 아니라 값**이며 `apps/api/src/services/billing/credit-policy.ts` 의 숫자만 교체하면 닫힌다.

**결정할 것 — 크레딧(생성 축)**:
- 크레딧 팩별 **수량과 가격** (현재 500 / 1,200 / 3,000 은 잠정값이며 스토어 미등록)
- 크레딧 유효기간 (권장: 구매 크레딧은 만료 없음)
- **가입 보너스 수량** (현재 `CREDIT_SIGNUP_BONUS` 기본 0 = 지급 안 함)
- 프로모션·운영 보상 지급 기준
- 고해상도 export의 추가 차감 여부 (현재 전 export 동일 100)

**결정할 것 — 구독(보관 축)**: 스냅 보관이 **기간 기준(업로드 후 15일)** 으로 바뀌어
([snap-retention-period.md](./decisions/snap-retention-period.md)) 구독이 무엇을 팔지부터 다시 정해야 한다 —
종전의 "용량 티어" 설계는 용량 한도(2GB)를 전제로 했다. 결과물 만료 안내는 A-1.
- **구독으로 보관 기간을 팔 것인가** ⚠️ **예정일 뿐 미확정이다.** 판다면 연장(며칠/몇 달)인지
  무제한인지, 티어별로 다른지와 가격 · 연 구독 여부를 정해야 하고 구독 상품의 축이 "용량"에서
  "기간"으로 옮겨간다. **정해지기 전까지 스냅 만료 구현은 전원 15일을 가정한다**
- **구독 혜택에 워터마크 제거·고해상도 export를 포함할지**
- **용량 한도(2GB)를 존치할지** — 기간 만료가 누적을 대신 막아 평균 사용자는 닿지 않는다.
  권장은 폐기하고 남용 방지 상한만 별도로 두는 것([snap-retention-period.md](./decisions/snap-retention-period.md#이-결정이-남긴-후속-판단)).
  SNAP-9 가 미결로 표시 중
- [ ] **구독 만료·보관 정책 변경 때의 사전 고지** — 스냅 만료 예고(D-3 · D-1, KST 10시)는 정해졌지만
  ([decisions/expiry-notice-schedule.md](decisions/expiry-notice-schedule.md)), 사용자 구독이 끝날 때와
  우리가 보관 정책을 바꿀 때 언제 알릴지는 정해지지 않았다

경계 규칙상 **구독에 크레딧을 얹는 안은 검토 대상이 아니다**
([decisions/storage-and-subscription-policy.md](./decisions/storage-and-subscription-policy.md) §4.3).

**앱에 전달할 것**: 잔액·차감·402 의 형태는 계약([`contract/billing.ts`](../packages/shared-types/src/contract/billing.ts) ·
[`contract/movies.ts`](../packages/shared-types/src/contract/movies.ts))이 원천이다.

**완료 조건**: 위 수량·가격 확정 → `credit-policy.ts` 값 교체 → 양 스토어에 동일 상품 ID로
등록 + RevenueCat 프로젝트·웹훅 URL 연결 → 구독을 팔기로 하면 entitlement 반영(용량 한도를 남기기로
하면 그 집행 — 유예 → 읽기 전용 전이 포함) → 결제·편집 e2e 실검증.

### A-3. 스냅 내용 분석 — 구현 완료, 생산 활성화 대기

스키마·API·분석 워커·docker 배선은 2026-08-19 에 들어갔다([progress.md](./progress.md) 2026-08-19,
계획 대비 차이는 [decisions/snap-content-analysis.md](./decisions/snap-content-analysis.md) §9).

분석은 명시적 요청으로만 시작된다(ANA-1) — `POST /videos/:videoId/analysis` 와 추천 요청
(`POST /movie-recommendations` 가 후보 스냅의 분석을 적재한다). **업로드 시 자동 분석은 없다.**

**2026-09-27 실동작화 착수 결정**: 분석·추천 경로를 실제 모델로 돌리고 넓히는 순서는
[plans/snap-analysis-recommendation-rollout.md](./plans/snap-analysis-recommendation-rollout.md).
그 1·2단계의 미결이 이 항목에 있다. 회사 OpenAI 키(C-7)는 2026-09-29 에 받아 스냅 4건으로 분석 → 추천 → 앱
표시까지 한 번 돌았다([progress.md](./progress.md) 2026-09-29).

- [ ] **키 프로젝트의 사용 한도와 rate limit 확인** — 실측 전에 예산 상한을 걸어 비용이 새지 않게 한다. rate limit
      등급은 `VIDEO_ANALYSIS_CONCURRENCY`(기본 3)를 올릴 수 있는 상한이다(C-7 에서 옮김)
- [ ] **팀 스냅 30~100편으로 실측** — 개발 환경에서만 `MOVIE_RECOMMENDATION_ENABLED=true`, 계획 §4.1 의 카테고리를
      채운 팀 스냅으로 분석 → 추천 → 앱 병합까지 확인하고, 드러난 결함을 고친다. 2026-09-29 첫 실행은 스냅 4건
      (에뮬레이터 1 · 휴대폰 3)이라 품질·모델 비교의 근거가 되지 못한다([progress.md](./progress.md) 2026-09-29)

**2026-09-29 옵트인 결정**: 법무 검토 전에도 **분석에 동의한 사용자에게는** 켤 수 있다(ANA-5·REC-4,
[결정 문서](./decisions/snap-content-analysis.md) §6.1). 동의 기록·서버 집행·앱의 동의 화면·약관 초안 반영은
같은 날 들어갔다([progress.md](./progress.md) 2026-09-29). 그래서 생산 활성화를 막는 것은 법무 검토가 아니라
위의 팀 스냅 실측과 아래 운영 모델 고정이다. 분석 고지의 법무 확정(동의 문구 포함)은 여전히 필요하지만 켜는
조건이 아니며, D-2 "분석 고지"에서만 관리한다.

- [ ] **운영 모델 고정** — `OPENAI_VISION_MODEL` 기본값 `gpt-5.6-luna` 는 잠정값이다.
      실제 스냅으로 모델을 비교해 고정한다
- [ ] **품질·단가 기준선** — 요약 사실성·핵심 사물/행동 포함률·환각 비율·`usableForEdit`
      정확도는 사람이 채점해야 한다. 처리시간·토큰·실패율·모델별 비교는 `video_analyses`
      테이블 집계로 나온다 (결정 문서 §9.3, 집계 쿼리는 계획 §4.1)
- [ ] **분석 시점 재결정** — 첫 추천이 후보 분석이 끝날 때까지 기다리는 원인이다. 현행 "추천 요청
      시점"은 단가 실측 없이 정해졌으므로(결정 문서 §3), 기준선 단가로 현행 / 외출 확정 시 선분석 /
      업로드 직후 전량 중 하나를 고른다(계획 §4.2). 바꾸면 스펙 ANA-1 을 먼저 고치고 결정 문서 §3 을 갱신한다

**기준선이 나오면 정할 것**: 스냅당 단가 상한 · 추천 1회당 후보 수 상한 ·
프레임 수(현재 최대 4)·`OPENAI_IMAGE_DETAIL`(현재 low) 재탐색 여부 ·
유사 프레임 제거 임계값(`DUPLICATE_HAMMING_THRESHOLD`) 적정성 — 실제 스냅에서 4장이
2장으로 줄어드는 비율을 `frame_timestamps_ms` 로 확인한다 · 출력 토큰을 줄이는 프롬프트 v2
(`VIDEO_ANALYSIS_PROMPT_VERSION` 올림)와 키의 rate limit 이 허락하는 `VIDEO_ANALYSIS_CONCURRENCY`.

**후속 기능**: 대주제 기반 자동 스냅 선택은 **A-6** 으로 열렸다(2026-08-19).
`usableForEdit=true` 인 분석 결과를 점수화해 슬롯을 채우는 경로다.

**계획 문서의 보관**: 실측(위 "팀 스냅 30~100편으로 실측")이 끝나면
[plans/snap-analysis-recommendation-rollout.md](./plans/snap-analysis-recommendation-rollout.md)를 archive 로 보낸다 — §4.1 의
실측 절차는 [decisions/snap-content-analysis.md](./decisions/snap-content-analysis.md) §9.3 으로, 아직 시작하지 않은 2~5단계는
이 항목과 A-6 · A-9 의 체크박스로 옮긴다(2026-10-09 결정 — 실측 결과가 2단계 이후 결정의 입력이라 그때까지 둔다).

### A-4. 스냅 서버 원천 전환의 미결 항목

[decisions/snap-source-of-truth.md](./decisions/snap-source-of-truth.md) 에서 결정을 마쳤으나 남은 판단:

- [ ] 위치(`place`) 정보의 서버 저장 여부 — 프라이버시/약관 검토 선행. 함께 볼 것: 원본 파일 자체에 휴대폰이 적은 GPS 태그가 있고,
      **배포본(렌디션)은 그 태그를 그대로 옮긴다**(ffmpeg 이 전역 메타데이터를 복사한다). 배포본은 같은 계정의 기기만 받는다. 무비 결과물에서는
      2026-10-07 에 지웠다(E-17)
- [ ] 비로그인 사용자의 스냅 지위 (현행: 업로드 워커가 로그인 시에만 동작)
- [ ] egress 비용 실측 후 렌디션 기본 다운로드 정책 재평가

로컬 파일은 최종적으로 캐시가 되지만 **켜는 것은 렌디션·동기화가 실기기에서 검증된 뒤로 연기**했다
(SNAP-14, [local-copy-after-upload.md](./decisions/local-copy-after-upload.md)) — 그때까지 기기 파일이 원천이다.
선행이던 렌디션(2단계)과 reconcile(3단계)은 Android 실기기 검증까지 끝났다([닫은 항목](#닫은-항목)). 남은 것:

- [ ] **`앱`** **촬영 스냅 치수 실측의 실기기 확인** — 촬영 스냅이 파일에서 회전 반영 치수를 읽게 한
      변경(2026-09-12)은 단위 테스트와 `swiftc -parse` 로만 확인했다. Android dev build 에서 세로·가로 촬영
      각각 저장된 `width`·`height`·`orientation` 과 기존 스냅의 백필(`SnapMetadataBackfill`)을 확인하면 닫힌다

- [ ] **iOS 출시 전 — iPhone 에서 찍은 스냅이 Android 에서 재생되는지** — 1차 운영 배포는 Android 만이라 지금은
      대상이 아니다(2026-09-27 오너). 아이폰 원본은 HEVC/HDR 이라 다른 기기는 렌디션(H.264/SDR)으로 재생하는데, 그
      변환은 워커 계약 테스트(합성 HDR10)로만 확인됐다 — 2026-09-15 스트레스 검증의 아이폰 영상은 H.264 였고,
      **실제 아이폰 HEVC·돌비비전 원본으로 돌린 적이 없다**(아래 F 의 돌비비전 항목과 같은 공백). iPhone 실기기가
      생기면 iPhone 촬영 → Android 도착·재생, 그리고 그 반대를 확인한다. iOS 시뮬레이터에서 받은 사본의 재생은 확인했다
- [ ] **iOS 출시 전 — iOS 실기기 검증 절차 문서** — 계획만 있고 아직 없는 문서다
      (`apps/mobile/docs/workflows/ios-device-verification.md`, [apps/mobile/AGENTS.md](../apps/mobile/AGENTS.md)
      "Planned documentation" 표). 오너에게 iOS 기기가 없어 쓰지 못했다. 그때까지는 시뮬레이터 절차로 대신하고
      실기기 미검증을 밝힌다. **완료 조건**: iPhone 실기기가 생기면 절차를 써서 `apps/mobile/AGENTS.md` 의 문서 표로
      옮기고 "Planned documentation" 행을 지운다
- [ ] **`앱`** **최근 삭제의 실기기 확인**(SNAP-20 `구현됨(실기기 미검증)`) — 서버 · 앱 자동 테스트와 Android 에뮬레이터(개발 DB 의
      복사본)로만 확인했다([progress.md](./progress.md) 2026-10-07). 휴대폰 두 대(또는 휴대폰 + 에뮬레이터)에서: ① 한 기기에서 모든 기기에서 삭제 →
      다른 기기에서도 사라진다 ② 되돌리기 → 두 기기 모두에 다시 나타나고, 지운 기기에서는 처음 재생할 때 받아 온다 ③ 최근 삭제에서 되살리기도 같다
      ④ 지울 때 빠진 무비의 컷은 돌아오지 않는다. **완료 조건**: 네 가지가 통과하면 SNAP-20 의 `(실기기 미검증)` 을 지운다
- [ ] **전환을 켤 때 함께 볼 것**: 로컬이 캐시가 되는 순간 서버 만료(SNAP-9, 15일)가 곧 영상의
      소멸이 된다. 보관 기간·구독 연장과 **같은 자리에서** 판단한다. 사용자가 고르는 "이 기기에서만 삭제"는
      2026-09-29 에 들였고(SNAP-19, [snap-album-save-and-device-delete.md](./decisions/snap-album-save-and-device-delete.md)),
      여기 남은 것은 앱이 **스스로** 기기의 파일을 지우는 전환이다. 그때는 자동 앨범 저장(SNAP-18)의 기본값(꺼짐)도
      다시 본다 — 앨범의 사본이 사용자의 유일한 영구 사본이 된다
- [ ] **`앱`** **앨범 저장 · 이 기기에서만 삭제의 실기기 확인**(SNAP-17·18·19 `부분`) — 단위 테스트와 Android
      에뮬레이터로만 확인했다([progress.md](./progress.md) 2026-09-29). Android 휴대폰에서: ① 재생 화면의 `앨범에 저장`
      → 권한 질문 없이 갤러리의 `Snaply` 앨범에 보이고, 촬영한 날짜 자리에 놓인다 ② 자동 앨범 저장을 켜고 찍으면
      찍을 때마다 앨범에 쌓인다 ③ 다른 기기에서 온 스냅을 저장하면 보관 사본을 받아 저장되고 촬영한 날짜 자리에
      놓인다(2026-10-07 이후 만든 배포본만 — 그 전 배포본은 촬영 시각이 없어 저장한 날짜 자리다, E-12) ④ 이 기기에서만 삭제 → 목록에 남고, 재생하면 받아서 재생되고, 그 스냅이 든 무비를 만들 수
      있다 ⑤ 보관 기간이 끝나면 "만료됨"이 되고 볼 수 없다. Android 10 이하 기기가 있으면 저장소 권한 질문도 본다.
      **완료 조건**: 다섯 가지가 통과하면 세 요구의 `부분` 을 `구현됨` 으로 바꾼다
- [ ] **iOS 출시 전 — 앨범 저장의 iOS 확인** — "추가만" 사진 권한 질문과 보관함 저장, 거절한 뒤의 `설정에서 권한 켜기`.
      앱이 사진 전체 접근을 요청하지 않아도 App Store 정적 검사가 `NSPhotoLibraryUsageDescription` 을 요구하는지도
      본다(지금은 두 문구를 모두 넣었다)
- [ ] **만료 전에 앨범 저장을 권하기** — 저장공간 검토(2026-09-29)에서 남은 권장안이다. 다른 기기에서 온 스냅과
      이 기기에서만 삭제한 스냅은 보관 기간이 끝나면 받을 파일이 없어 만료 전에만 저장할 수 있다. 곧 끝나는 스냅
      모아보기와 일괄 저장, 그리고 D-3 · D-1 예고 푸시(지금 문구는 "남기려면 무비로 만들어 주세요")를 거기로 잇는 안이다.
      재생 화면에서도 남은 기간을 보이는 것(SNAP-13 `부분`)과 함께 정한다
      ([snap-album-save-and-device-delete.md](./decisions/snap-album-save-and-device-delete.md) ①의 B)

### A-6. 템플릿 기반 스냅 자동 추천 — 앱·백엔드 완료, 생산 활성화 대기

템플릿으로 무비를 시작할 때 슬롯에 들어갈 스냅을 분석 결과 기반으로 고른다. A-3의 후속 항목이며
방향·기각안은 [decisions/template-snap-recommendation.md](./decisions/template-snap-recommendation.md).

**2026-08-19 완료 (1·2·3단계)**: 서버 카탈로그·추천 API·앱 연동까지 전부 구현됐다.
현행 요구는 [specs/template-and-recommendation.md](./specs/template-and-recommendation.md),
앱 동작은 [모바일 기능 문서](../apps/mobile/docs/features/movie-templates.md),
검증 내역은 [progress.md](./progress.md).

**남은 것**
- [ ] **활성화**: `MOVIE_RECOMMENDATION_ENABLED` 는 **기본 꺼짐**이다. 켜는 조건은 A-3 과 같다 —
      팀 스냅 실측과 운영 모델 고정(A-3). 2026-09-29 옵트인 결정으로 법무 검토(D-2)는 켜는 조건에서 빠졌고,
      켜도 분석에 동의한 사용자에게만 돈다(REC-4). 켜지 않으면 추천 경로에서 분석이 돌지 않는다
- [ ] **상한 값 재조정**: 추천 상한(REC-3, [specs/template-and-recommendation.md](./specs/template-and-recommendation.md))은
      잠정값이다. A-3 의 단가 실측이 나오면 `apps/api/src/services/recommendation/recommendation-policy.ts` 의 숫자만 바꾼다
- [ ] **키워드 매칭의 오탐·미탐** — 슬롯 힌트와 분석값을 부분 문자열로 맞춰 `담` 이 `담요` 에 맞고 `커피` 가 `아메리카노` 에
      맞지 않는다(개발 DB 분석 7건에서도 맞은 3쌍 중 2쌍이 오탐). 개념 사전으로 바꾸는 계획과 테스트 순서는
      [plans/content-vocabulary.md](./plans/content-vocabulary.md) — 현행 고정 테스트(§5.1) → A-3 실측에 매칭 채점을 얹기(§5.4) → 도입.
      **완료 조건**: 도입 기준(§5.4)을 넘은 사전과 규칙이 들어가거나, 실측으로 들이지 않기로 정한다
- [ ] **추천이 쓰이는 곳 결정** — 지금은 템플릿 슬롯에만 쓰인다. 선택지와 권장은
      [plans/snap-analysis-recommendation-rollout.md](./plans/snap-analysis-recommendation-rollout.md) §4.3.
      **2026-09-28**: 고른 스냅으로 AI 편집 초안을 만드는 쓰임(§4.3 (b)를 넓힌 것)이 오너 결정으로 열렸다 — A-11.
      남은 것은 그 밖의 쓰임((c) 스튜디오의 선제 제안 등)이다.
      2026-08-31 개발자 회의의 "AI 추천 프로젝트"([meetings/2026-08-31-dev-sync.md](./meetings/2026-08-31-dev-sync.md) §5)가
      이 항목의 확장인지 별개 기능인지도 여기서 함께 정한다. A-3 의 실측 뒤에 정한다

**후속 후보(아직 열지 않음)**: 스튜디오의 템플릿 카드를 서버가 사용자 라이브러리 기준으로
정렬하는 안, `다른 조합`(같은 템플릿에 다른 외출 제안).

### A-7. 트렌드 숏폼 편집 — 타임라인 스펙 v3

현행 편집은 컷 + 프리셋 색보정 한 줄이 전부라, 틱톡·릴스형 브이로그가 요구하는
**비트 그리드 · 레이어 · 키프레임**을 `editSpec` v2 가 표현하지 못한다. 오픈소스를 더 붙여도
스펙이 "0.48초에 컷, 이 좌표에 스티커 300ms pop-in"을 담지 못하면 전달할 방법이 없다.
층별 설계·오픈소스 선정·라이선스 판정은
[plans/trend-editing-pipeline.md](./plans/trend-editing-pipeline.md),
스펙 v3 의 확정 결정은 [decisions/edit-spec-v3.md](./decisions/edit-spec-v3.md).

**진행 상황**: 스펙 v3 의 설계 결정이 확정됐고 공유 어휘 사전 3종(앵커 · 스테이지·시드 · 재생성 무효화)이
구현·검증됐다([progress.md](./progress.md) 2026-08-20). 2026-10-01 에는 v3 의 `timeline`(컷 · 경계별 전환)만
먼저 들어가 무비 생성이 `edit-v3` 큐로 렌더한다(A-11, [progress.md](./progress.md) 2026-10-01 "경계별 전환의 렌더") —
색보정·음악은 아직 v2 프리셋(`stylePreset`)이 정한다. 두 스키마 초안(editSpec v3 · 에셋 팩 매니페스트)은
2026-10-03 main 에 들어왔다([닫은 항목](#닫은-항목)). **아래 미결은 그대로다** — 사전과 초안은 계약을 고정한
것이지 파이프라인을 구현한 것이 아니다.

v3 는 **Movie export 에 붙인다** — `POST /edit-jobs` 는 한 버전 공존 후 폐기하기로 했으므로
(A-1, [decisions/movie-export-policy.md](./decisions/movie-export-policy.md) ⑤) 두 곳에 붙이지 않는다.

**막힌 이유**: 선행 결정 둘(번인 자막·워터마크)과 음원·스티커 조달이 열려 있다.

- **번인 자막 전환은 FE 계약 변경** — 단어 단위 애니메이션은 ASS/libass 로만 되고, 그러면
  현행 mov_text 소프트 자막이 번인으로 바뀐다. 현행 동작("플레이어에서 켜야 보인다")은 계약
  `subtitles` 설명([`contract/edit-jobs.ts`](../packages/shared-types/src/contract/edit-jobs.ts))과
  MOV-9 가 안내한다. 새 라이브러리는 0이지만 **결정 문서가 선행**이다
- **워터마크 결정이 레이어 설계 입력** — A-2에서 넣기로 하면 v3 `layers` 가 표현해야 한다
- **BGM 음원이 없다** — `apps/ai-worker/assets/bgm/` 에 README 뿐이라 비트 싱크·덕킹·무드 매칭이 전부 검증
  불가다. 확보는 F 의 "실BGM 기준 whisper 자막 인식 재확인"의 선행이기도 하다
- **스티커 에셋도 없다** — 배치 코드가 있어도 아트가 없으면 검증할 게 없다

**결정할 것**

- [ ] 번인 자막으로 전환할 것인가 — [decisions/subtitle-rendering.md](./decisions/subtitle-rendering.md)(미결).
      어느 쪽이든 앱에서 자막을 켤 길이 없어 MOV-9 가 `부분`이다 — 소프트 유지면 앱에 스위치를, 번인이면 계약 변경을 함께 한다
- [ ] BGM 을 어디서 확보할 것인가(AI 생성 음원 포함)와 예산 — [decisions/bgm-sourcing.md](./decisions/bgm-sourcing.md)(미결)
- [ ] `bgm_tracks` 스키마 신설 — `schema.prisma` 는 공유 파일이라 [team.md](./team.md) §2·§3 적용
- [ ] 스티커를 어디서 확보할 것인가(디자이너 커미션 여부와 스타일 방향) —
      [decisions/sticker-asset-sourcing.md](./decisions/sticker-asset-sourcing.md) 결정 1(미결)
- [ ] 스티커를 어떤 경로로 등록·관리할 것인가(관리자 페이지 도입 여부) — 같은 문서 결정 2(미결)
- [ ] **세이프 에어리어 실측값** — 상단 약 10%·하단 약 20%·우측 버튼 레일은 추정치라 실기기 캡처가
      필요하다. 값은 스펙이 아니라 버전드 팩에 둔다([edit-spec-v3.md](./decisions/edit-spec-v3.md) §1 B-3)
- [ ] **에셋 라이선스에 영구(perpetual) 조항을 필수로 걸 것인가** — 근거는 **다시 만들기가
      계속 가능하다**는 것이다([movie-cleanup-after-export.md](./decisions/movie-cleanup-after-export.md):
      프로젝트는 보존되고 유료로 다시 생성한다). 라이선스가 만료돼 에셋 서빙을 멈추면 사용자는 예전
      프로젝트를 **돈을 내고도** 다시 만들 수 없게 된다. 구독형 BGM 라이선스(Epidemic·Uppbeat 등)는 대개 "구독 기간 중
      제작한 콘텐츠는 이후에도 사용 가능" 구조지만, **만료 후 재렌더가 "기존 콘텐츠 사용"인지
      "신규 제작"인지**가 계약서마다 다를 수 있다. 법률 판단이 필요하고 스키마로는 풀리지 않는다.
      조달 단계에서 **"신규 배포 중단 / 기존 저작물 유지" 분리 조항**을 협상 항목으로 올린다.
      이 조항이 확보되면 팩 상태를 셋(`experimental → active → deprecated`)으로 줄이고
      `retired` 를 법적 차단 전용으로 좁힌다([edit-spec-v3.md](./decisions/edit-spec-v3.md) §2 C-2)
- [ ] **강조·수정 어휘를 사전 파일로** — v3 초안은 `accents[].kind` · `reason.code` · `userEdits.locked` 의 자리만 두고 값을 닫지 않았다. 전환 `kind` 와
      컷 `role` 은 사전으로 닫혔다([`transition-vocabulary.json`](../packages/shared-types/src/transition-vocabulary.json) ·
      [`cut-role-vocabulary.json`](../packages/shared-types/src/cut-role-vocabulary.json), 2026-10-01)
- [ ] **컷 타이밍의 기준을 컷마다** — 결정 B-6(`beatLength` 가 기준)은 사용자가 자른 컷과 음악 없는 무비를
      다루지 못한다. 사용자가 자른 컷은 ms, AI 가 정한 컷은 음악이 있을 때 비트가 기준이다
      ([auto-edit-draft.md](./decisions/auto-edit-draft.md) §2.4). 사용자 수정을 값별 주인으로 표현할지,
      v3 초안의 `userEdits` 로 표현할지도 함께 정한다(같은 문서 §2.2)

- [ ] **v3 의 정본 모양** — 2026-10-01 에 들어간 `editSpecV3Schema`([`contract/edit-jobs.ts`](../packages/shared-types/src/contract/edit-jobs.ts))는
      컷에 `videoId` 를 직접 두고 최상위 `stylePreset` 을 쓰지만, 초안([plans/edit-spec-v3.md](./plans/edit-spec-v3.md))은
      `clipId` → `source.clips` · `intent.styleBundleId` 다. 확정 때 어느 쪽으로 맞출지 정한다
- [ ] **끝낸 무비를 구성 그대로 다시 만들 때의 재현** — 무료 "만료 후 재생성"은 2026-09-09 에 폐기됐다(MOV-16 · MOV-19 —
      다시 만들기는 유료 새 생성). 그래서 [decisions/edit-spec-v3.md](./decisions/edit-spec-v3.md) §5 · §6 과 무효화 사전의
      `expired-regenerate`(시드 `attempt` 유지 → 같은 결과) 행이 쓰일 곳을 잃었다. 구성을 바꾸지 않고 다시 만들 때
      (a) `attempt` 를 유지해 같은 결과를 낼지(MOV-14 의 재현 약속과 맞다) (b) "다시 생성"처럼 `attempt` 를 올릴지 정하고,
      사전 행과 그 `note`(`packages/shared-types/src/invalidation-vocabulary.json` — 폐기된 전제인 storage-and-subscription-policy §3
      을 아직 근거로 든다)를 고치거나 지운다. E-5(BGM 재현성)와 함께 본다
- [ ] **팩을 긴급 차단(`retired`)할 때 사용자에게 무엇을 보일지** — [plans/asset-pack-manifest.md](./plans/asset-pack-manifest.md) §12
- [ ] **편집 경로의 기본 처리** — 회전 검증 · 클립별 음량 정규화 · 컷 경계 마이크로 페이드 · `loudnorm` 과 클립 간 색 맞춤
      `grade.match` 는 [plans/edit-recipe-tools.md](./plans/edit-recipe-tools.md) §2 가 v1 로 두었으나 편집 워커
      (`apps/ai-worker/src/pipeline/`)에 없다([plans/trend-editing-pipeline.md](./plans/trend-editing-pipeline.md) §10 의 5번)
- [ ] **편집 워커 동시성** — 단계별 CPU·메모리를 실측한 뒤 값을 정한다(같은 문서 §10 의 16번 · §2.3)

**완료 조건**: 위 선행 결정·조달 확정 → `editSpec` v3 확정(계약 `editSpecSchema` 와 `openapi.json` 을 같은
변경에서 갱신하고, `parseEditSpec` 이 모르는 스펙을 v1 `일상` 으로 삼키는 폴백을 거절로 바꾼다 —
[decisions/edit-spec-v3.md](./decisions/edit-spec-v3.md) §1 A-1) → `bgm_tracks` + 오프라인 비트 그리드 →
1단계(출력 옵션 · ASS 자막 · VAD 무음 컷 · 비트 스냅) 구현 → 계약·골든 프레임 테스트 위에서
e2e 실검증.

**의존**: A-1(`POST /edit-jobs` 폐기) · A-2(해상도·워터마크) · E-5.

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

**왜 막혀 있는지**: 관심사를 읽는 곳이 없어, 앱은 고르는 화면을 걷고 나 탭에 `준비 중` 으로 두었다
([progress.md](./progress.md) 2026-09-26). 무엇에 쓸지는 스냅 분석 추천 계획의 4단계에서 정한다
([plans/snap-analysis-recommendation-rollout.md](./plans/snap-analysis-recommendation-rollout.md) §4.4 — 출처와
소비처의 선택지). 추천이 어디에 쓰일지(A-6 "추천이 쓰이는 곳 결정")가 정해진 뒤에 아래 첫 항목을 정한다.

**완료 조건** (스펙 ACC-5):

- [ ] 관심사가 무엇을 바꾸는지와 관심사의 출처를 정한다 — 계획 §4.4 의 선택지에 더해, 원래 의도는
      위치 알림 장소 고르기였다
- [ ] 그 소비처를 구현하고, 앱이 선택을 `PATCH /auth/me` 의 `interests` 로 보낸다
- [ ] 나 탭의 `준비 중` 을 걷고 편집 화면을 되살린다(되살릴 화면은 계획 §4.4)
- [ ] 닉네임·아바타 수정 화면 — 서버는 받지만 앱에 화면이 없다(같은 ACC-5)

### A-10. 제품 콘셉트에서 정하지 않은 것 — 앱 안 피드 · 재생성 버전 · 무비 길이 · 출력 비율 · 동시 생성

제품 방향(스튜디오 · 스냅/무비 모델 · 무비 화면)은 [decisions/product-concept.md](./decisions/product-concept.md)가
정했지만 아래는 정하지 않은 채 남았다. 앱이 지금 하는 일은 [무비 기능 문서](../apps/mobile/docs/features/movie.md).

- [ ] **앱 안 피드(소셜)를 들일 것인가** — 지금은 내보내기와 외부 앱 공유만 있다. 피드를 들이면 탭 구조가
      바뀐다. **완료 조건**: 들일지 정하고, 들인다면 탭 구조까지 정한 결정 문서가 생긴다
- [ ] **다시 만들 때 이전 완성본을 남길 것인가** — 지금 규칙은 "버전은 없다"(다시 만들면 이전 결과물이
      사라진다 — 무비 기능 문서 "There are no versions"). 되돌릴 수 있어야 하는지는 정하지 않았고, 결과물
      보관·끝내기 규칙(MOV-15~19)과 맞물린다. **완료 조건**: 남길지 정하고, 남긴다면 보관 규칙과 함께 스펙에 적는다
- [ ] **무비 길이 상한** — 지금은 컷 10개 × 스냅 최대 5초 = 최대 50초다. 트림으로 줄일지, 목표 길이를 먼저
      정할지 정하지 않았다(editSpec v3 는 목표 길이를 `intent.targetDurationMs` 로 받는다 — A-7).
      **완료 조건**: 상한 또는 목표 길이를 정해 스펙에 적는다
- [ ] **출력 비율을 고르게 할 것인가(MOV-8 `부분`)** — 무비에는 출력 프로필·맞춤 방식이 없어 생성은 늘 기본값(세로 ·
      블러 배경)이다. 고를 수 있는 길은 폐기 예정인 `POST /edit-jobs`(A-1) 뿐이라, 그대로 폐기하면 고를 길이 사라진다.
      **완료 조건**: 9:16 하나로 두기로 하면 MOV-8 을 그렇게 고치고, 고르게 한다면 무비 계약과 앱에 넣는다
- [ ] **진행 중인 생성을 사용자당 하나로 묶을 것인가(MOV-11 `부분`)** — 지금은 앱이 한 무비의 중복 생성만 막고
      서로 다른 무비는 동시에 생성된다. **완료 조건**: 사용자당 1개를 유지하면 서버·앱에 구현하고, 무비당 1개로
      바꾸면 MOV-11 을 고친다

### A-11. AI 편집 초안 — 구현됨, 문턱값 실측 남음

고른 스냅 여러 개로 AI 가 고칠 수 있는 무비 초안을 만든다(MOV-21·MOV-22). 범위와 규칙은
[decisions/auto-edit-draft.md](./decisions/auto-edit-draft.md), 툴 목록과 착수 순서의 제안은
[plans/edit-recipe-tools.md](./plans/edit-recipe-tools.md).

컷 역할 사전 · 구간의 주인 · 로컬 신호 · 초안 제안 API · 앱 흐름 · 실기기 확인(초안의 구간·전환을 고쳐 만든
결과물이 편집 화면과 같다)과 경계별 전환(MOV-22)은 2026-10-01 에 끝났다([닫은 항목](#닫은-항목)). 상한(30 / 분석 12 /
24시간 10)·바로 표시·미업로드 포함·빠진 스냅 알림은 같은 날 정했다([auto-edit-draft.md](./decisions/auto-edit-draft.md) §5).

**막힌 이유**: 거르기·중복 문턱값(`DRAFT_THRESHOLDS`)이 잠정값이다 — 합성 클립과 개발 DB 의 실제 스냅 6개로만 잡았고,
어둡고 흐린 시험 스냅으로 다시 정해야 한다([edit-director.md](./decisions/edit-director.md) §2.1 · §2.2).

- [ ] **거르기·중복의 문턱값** — 실제 스냅의 신호 분포로 어둠·흐림·해시 거리 문턱값을 정해
      [edit-director.md](./decisions/edit-director.md) §2 를 고친다. 이때 점수·거르기의 `quality` 에 밝기를 넣을지도 정한다 —
      지금은 선명도(`log1p(sharpness)`)만 쓰고 밝기는 어둠 문턱값에만 쓴다(같은 문서 §4)

- [ ] **초안의 vision 분석** — 초안 1회에 분석을 최대 12개 요청하고 늦게 도착한 결과를 다음 초안에 얹기로
      정했지만([auto-edit-draft.md](./decisions/auto-edit-draft.md) §5) 구현되지 않았다 — `apps/api/src/services/movie-draft.service.ts`
      는 신호만 계산하고 분석을 요청하지 않는다. 켜는 조건은 A-3 · REC-4 를 따른다

**완료 조건에 넣지 않는 후속**: "다시 편집"은 v1 에 두지 않았다([auto-edit-draft.md](./decisions/auto-edit-draft.md) §5).
붙일 때는 시드 `attempt` 를 올려 `ai` 값만 다시 고른다.

- [ ] **컷 역할을 선택 단계 밖으로 싣기** — 선택 단계(`apps/api/src/services/edit-director.ts`)가 컷마다 역할을 정하지만([edit-director.md](./decisions/edit-director.md) §6), v1 에서 결과를 바꾸는
      것은 `hook`·`closer` 의 컷 길이뿐이다. 가운데 컷의 역할(`establish`·`detail`·`action`)과 그것을 위한 움직임 순위는 계산만 되고
      제안 응답에도 무비에도 실리지 않는다 — 초안 제안 API 와 함께 싣기로 했던 일이 빠졌다(2026-10-02 리뷰). editSpec 의
      `timeline.cuts[].role`([plans/edit-recipe-tools.md](./plans/edit-recipe-tools.md) §3)로 싣거나(무비에 역할을 저장해야 한다),
      쓸 곳이 생기기 전까지 가운데 컷의 계산을 걷어 낼지 정한다

**완료 조건**: 문턱값이 실측으로 정해져 결정 문서 §2 가 고쳐지고 초안의 vision 분석이 붙으면 MOV-21 이
`구현됨` 이 된다(실기기 확인은 2026-10-01 에 끝났다).

**의존**: 컷 타이밍의 기준(A-7 "컷 타이밍의 기준을 컷마다")과 역할을 싣는 `timeline.cuts[].role`(A-7 editSpec v3).
분석을 쓰는 부분은 A-3 의 활성화 조건과 분석 동의(REC-4)를 따른다.

---

## B. 개발 합의 필요 (A·B 트랙 공동 소유)

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
`request.user`에 email을 싣는 것이 필요한지는 별도 판단이다. `apps/api/src/plugins/auth.ts`는
**공동 소유**라 변경 시 합의가 필요하다.

**완료 조건**: email 이 필요한 기능이 생기면 공동 소유 합의 후 추가하고 닫는다. 그런 기능이 없다고
판단되면 추가 없이 닫는다.

### B-4. `notification_logs` 보관 정책

geofence 쿨다운 판정용 이력이 무한히 쌓인다. 쿨다운은 30분 기준이라 그보다 오래된 행은
조회에 쓰이지 않는다.

**2026-09-11 이후 만료 예고 행도 여기 쌓인다**(`kind = snap_expiry`). 다만 성격이 다르다 —
이쪽은 "이 스냅의 D-3 을 보냈는가" 를 판정하는 **유일한 근거**라, 스냅이 보관 기간 안에 있는 동안은
지우면 안 된다(지우면 예고가 다시 나간다). 스냅 파일이 purge 돼도 `videos` 행은 툼스톤으로 남으므로
(`apps/api/src/services/retention.service.ts` 의 `purgeVideoAssets`, SNAP-12) FK Cascade 로 사라지지 않는다 — 스냅당 최대 2행(D-3 · D-1)이
계정이 지워질 때까지 남는다. 보관 기간이 끝난 스냅은 예고 대상이 아니므로(`apps/api/src/services/expiry-notice.service.ts` 의
`findDueSnaps`) 그 뒤의 행은 판정에 쓰이지 않는다. 보관 정책을 정할 때 두 종류를 같은 기준으로 묶지 말 것.

**결정할 것**: 보관 기간(감사 목적이 있는지), 정리 방식(주기적 삭제 / 파티셔닝).

### B-5. API 계약 스키마 우선 — 남은 다듬기

계약 원천 통일(1~5단계)은 끝났다([닫은 항목](#닫은-항목)) — 결정과 기각한 대안은
[decisions/api-contract-schema-first.md](./decisions/api-contract-schema-first.md). 모바일 `shared/api`와
`packages/shared-types`는 [team.md](./team.md) §2의 공유 surface라 변경에 양 트랙 합의가 필요하다.

- [ ] 엔티티 경계의 Zod 를 계약 스키마의 **파생**(`videoSchema.pick(...)` 등)으로 바꾸기. 계약 패키지가
  앱 **런타임** 번들에 들어가므로 Metro 가 `dist`(또는 `react-native` export 조건으로 `src`)를 해석하는지,
  Jest 가 워크스페이스 심링크 밖 ESM 을 변환하는지 한 엔티티로 먼저 확인한다. 지금은 타입만 쓰고
  경계 스키마는 `apiRequest`의 할당 가능성 규칙으로 계약과 대조한다
- [ ] `openapi.json`의 `*Input` 사본 스키마 — type provider 가 입력/출력 레지스트리를 둘 다 내는 동작.
  무해하지만 Swagger 가독성을 위해 upstream 옵션이 생기면 끈다
- [ ] **모바일 응답 검증 범위** — 앱은 경계 Zod 로 자기가 쓰는 필드만 검증한다
  ([api-contract-integration.md](../apps/mobile/docs/workflows/api-contract-integration.md) "Zod validation policy").
  그보다 엄격한 필드 단위 검증이 필요한 응답이 있는지는 정해지지 않았다. **완료 조건**: 대상 응답(없음 포함)을
  정하고 그 문서의 정책 절에 반영한다

### B-8. AWS 공모전 서버 가동 ★

**2026-10-08**: 사내 공모전 테스트용으로 회사 AWS 계정에 서버가 생겼다 — 사내 위키 "snaply — AWS 구성 · 인프라 접속"
(인프라팀)과 우리가 낸 "AWS 서비스 요청서 — snaply". EC2 한 대(`t3.large`, 공인 IP 없음) 앞에 공용 ALB
(`https://snaply-api.dweaxai.com` → 인스턴스 3000), 영상은 S3, 시크릿은 Secrets Manager `dweax/service/snaply/env`,
접속은 Session Manager. 바깥에서 닿으므로 SNS · 결제 · 광고를 실제로 켤 수 있다(D-1 의 도메인 조건을 이 서버가 채운다).
공모전이 끝나면 내린다.

저장소 쪽은 끝났다 — 키 없이 인스턴스 역할로 S3 에 붙기 · ALB 뒤 클라이언트 IP(`TRUST_PROXY`) · 단독 compose
`docker-compose.aws.yml` · 배포 잡(`deploy.yml` 의 `deploy-aws`) · 설치 스크립트(`deploy/aws/install.sh`). 왜 이렇게 했는지는
[decisions/aws-contest-server.md](./decisions/aws-contest-server.md), 절차는 [deployment-aws.md](./deployment-aws.md),
기록은 [progress.md](./progress.md) 2026-10-08. 배포 방식(GitHub runner + GHCR)은 인프라 담당이 그대로 가도 된다고 답했다.
**2026-10-08 첫 배포 완료** — runner 설치 · 시크릿 · `DEPLOY_AWS_ENABLED` 를 마쳤고 main 머지가 이 서버로 배포된다
(`https://snaply-api.dweaxai.com/health` → `db=connected`). 남은 것:

- [ ] **테스터 앱 빌드** — `EXPO_PUBLIC_API_BASE_URL=https://snaply-api.dweaxai.com` 으로 빌드해 폰에서 업로드 → 편집 → 재생을 확인한다
      (완료 조건)
- [ ] **외부 연동 켜기** — RevenueCat · AdMob · Instagram · TikTok 콘솔에 콜백 · 웹훅 주소를 등록한 뒤 시크릿을 채운다
      (deployment-aws.md §2). 지금은 비어 있어 mock · 꺼짐이다
- [ ] **`OPENAI_API_KEY` 를 로컬 개발 키와 분리** — 서버 시크릿에는 다른 프로젝트 키를 넣는다. 한쪽이 새거나
      폐기돼도 다른 쪽이 살아 있어야 한다(C-7 에서 B-1 을 거쳐 옮겨 온 항목)
- [ ] **TikTok 게시** — 버킷이 퍼블릭 차단이고 CloudFront 가 없어 미디어 호스트의 URL prefix 검증(D-3) 파일을 둘 곳이 없다.
      공모전 시연에 필요하면 인프라에 CloudFront(또는 검증 경로 공개)를 요청하거나 C-3(직접 업로드)으로 간다
- [ ] **백업의 사각** — DB 덤프는 `/data/backup` 에 쌓이고 인프라가 그 볼륨을 매일 스냅샷하므로(7개)
      사내 서버 때의 "덤프가 같은 서버에만 남는다" 는 해소됐다. 남은 것은 **S3 영상이다** — 버킷의
      버전 관리가 꺼져 있어 지운 영상은 되돌릴 수 없다(deployment-aws.md §5). 만료 정리 배치가
      매일 돌므로 잘못 지우면 복구 수단이 없다 (B-1 에서 승계)
- [ ] **수명** — 요청서의 종료일이 비어 있다
- [ ] **DB 복구 리허설과 절차** — [deployment-aws.md](./deployment-aws.md) §5 의 복구는 "빈 DB 에 붓는다"까지만 있다.
      api · 워커를 멈추고 DB 를 비우고 덤프를 부은 뒤 다시 올리는 순서를 한 번 리허설해 그 절에 적는다(덤프는 `pg_dump`
      기본값이라 DROP 문이 없어 데이터가 있는 DB 에 부으면 섞인다)
- [ ] **용량 실측** — `t3.large`(2 vCPU · 8GiB, 24시간 평균 CPU 30% 를 넘으면 추가 요금)에 편집 · 렌디션 · 분석 워커가 함께 돈다.
      이미지가 배포마다 약 3GB 라 `/data`(50GB)의 이미지 정리 주기도 함께 본다

**완료 조건**: main 머지가 이 서버에 자동 배포되고 배치가 돌며, 테스터 폰이 도메인으로 업로드 → 편집 → 재생까지 된다.

---

## C. 외부 크리덴셜/승인 대기

### C-1. 스토어 상품 등록(크레딧 팩, 구독은 A-2 뒤) → IAP 구매·웹훅 검증

**막힌 이유**: 백엔드 구현은 끝났다(2026-08-14, [progress.md](./progress.md)). 남은 것은
저장소 밖 설정이다 — 크레딧 묶음의 수량·가격(A-2)이 확정되지 않아 양 스토어에 consumable
상품을 등록할 수 없고, App Store Connect / Play Console / RevenueCat 프로젝트 설정도 아직 없다.

**등록 시 맞춰야 할 것**: 스토어 상품 ID는
[`credit-policy.ts`](../apps/api/src/services/billing/credit-policy.ts)의 `CREDIT_PACKS.productId`와
**글자 그대로 일치**해야 한다. 어긋나면 웹훅이 지급량을 못 찾아 500으로 떨어진다(재시도로 복구는 된다).
RevenueCat 웹훅 URL은 `POST /billing/webhook/revenuecat`, Authorization 헤더 값은
`REVENUECAT_WEBHOOK_AUTH_TOKEN`과 같아야 한다. 앱의 RevenueCat SDK 는 `app_user_id` 를
**Snaply `User.id` 로 고정**해야 웹훅이 지급 대상을 찾는다(앱에는 아직 SDK 가 없다).

**완료 조건**: A-2에서 크레딧 묶음 확정 → `credit-policy.ts` 값 교체 → 양 스토어 consumable 상품 등록 →
RevenueCat 프로젝트·웹훅 URL 설정 → 앱에 구매 화면과 RevenueCat SDK(CRD-4 `부분`의 빠진 것) → sandbox 구매 → 웹훅 수신 → 크레딧 지급 →
같은 트랜잭션 웹훅 재전송 시 중복 지급 없음까지 한 번 통과하면 닫힌다.

**구독 상품은 A-2 결정 뒤다.** 무엇을 팔지(용량인지 보관 기간인지)부터 미확정이다(A-2, CRD-7).
팔기로 정해지면 크레딧 팩(consumable)과 별도로 **auto-renewable subscription**
(Apple Subscription Group / Google base plan)으로 등록한다
([decisions/storage-and-subscription-policy.md](./decisions/storage-and-subscription-policy.md) §5).
그때 sandbox 검증에 갱신·해지·만료·결제실패 전이가 추가되며, 앱 쪽에는
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
조사 기록은 [archive/progress-integrations-2026-08.md](./archive/progress-integrations-2026-08.md)의
"틱톡 — API 는 성공, 실물 미확인 (2026-08-10)" 절, 콘솔 쪽 대처는 [sns-setup.md](./sns-setup.md) §3 "틱톡 트러블슈팅".

**완료 조건**: 받은함 알림 도착 확인. 또는 Sandbox 제약임이 확인되면 심사 통과 후 재검증.
2026-08-31 개발자 회의에서 테스트 계정으로 "영상 업로드 정상 동작"이 보고됐으나 받은함 실물 도착까지
확인한 것인지는 기록에 없다 — 참석자에게 재확인하고, 확인됐다면 이 항목을 닫고
[progress.md](./progress.md)에 기록한다.

### C-3. 틱톡 `video.publish` 심사 → 직접 게시 전환

**현재**: `video.upload`(받은함) 방식. 사용자가 틱톡 앱에서 마무리해야 게시되고,
응답에 `requiresUserAction: true` 가 실린다.

**완료 조건**: 앱 심사로 `video.publish` 승인 → `TIKTOK_SCOPES` 값만 바꾼다(로컬은 `apps/api/.env`, 서버는 시크릿)
```bash
TIKTOK_SCOPES=user.info.basic,video.publish
```
이 값은 코드 기본값이기도 하다 — 심사 전에는 `user.info.basic,video.upload` 를 **명시해야** 받은함 방식이 된다
([sns-setup.md](./sns-setup.md) §3 "틱톡 스코프"). 엔드포인트는 코드가 자동 분기한다(`/inbox/video/init/` → `/video/init/`).
`requiresUserAction` 이 응답에서 사라지므로 **모바일 안내 문구도 함께 정리**해야 한다
([api-spec.md](./api-spec.md) SNS 연동 절).

**대안 후보(미결정)**: 영상 바이트를 우리가 직접 올리는 `FILE_UPLOAD` 방식 — 틱톡이 우리 URL 에서 영상을
가져가지 않으므로 URL prefix 소유권 검증(D-3)이 필요 없어진다. 클라이언트 구현이 추가로 필요하고, 지금은
`PULL_FROM_URL` 만 구현돼 있다(`apps/api/src/services/sns/tiktok.client.ts`).

### C-4. FCM 실기기 수신

**이미 검증된 것**: 실크리덴셜로 FCM API 호출, 미등록 토큰 →
`registration-token-not-registered` → `users.fcm_token` 자동 정리까지 실동작 확인.

**막힌 이유**: 앱의 FCM 토큰 발급·`POST /auth/fcm-token` 등록과 서버 발송 파이프라인은
구현돼 있지만, 실기기 토큰으로 geofence 진입부터 수신까지 한 번에 검증하지 않았다.

**완료 조건**: dev/release build에서 발급한 토큰 등록 → geofence 진입 보고 → 서버 쿨다운·
quiet hours 판정 → 기기 푸시 수신을 한 번 통과하고, 실패 시 Firebase·서버 로그를 함께 남긴다.

### C-5. Meta 앱 검수용 URL 2개

`apps/api/src/routes/legal.ts` 가 서비스 소개·약관·개인정보처리방침은 서빙하지만, 앱 검수 제출 시
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
(NS: linode.com). 보유 도메인이 생기면 쓸 절차: [local-tunnel.md](./local-tunnel.md) §6.

**2026-10-08 — 공모전 기간에는 채워졌다.** AWS 공모전 서버(B-8)가 ALB 뒤에서
`https://snaply-api.dweaxai.com` 으로 바깥에서 닿는다. 콜백 · 웹훅 · 검수에 쓸 HTTPS 주소가 생겼으므로
그 기간에는 cloudflared 임시 터널이 필요 없다. "웹훅 연동"이 어느 웹훅을 뜻하는지는
[decisions/sns-webhook-scope.md](./decisions/sns-webhook-scope.md)(미결)에서 정한다 — 도메인 작업은 그 답과 무관하다.

**그래서 아직 열려 있다**: 이 주소는 **공모전이 끝나면 내려간다**(B-8 "수명"). 콘솔에 등록한 리디렉션 URI 와
URL prefix 소유권 검증은 주소가 바뀌면 다시 등록해야 하므로, 서버가 내려가기 전에 **계속 쓸 도메인**을
정해 두어야 한다. 또 이 서버에는 CloudFront 가 없고 버킷이 퍼블릭 차단이라 **미디어 호스트 주소는 아직 없다**
(B-8 "TikTok 게시").

**완료 조건**: 공모전과 무관하게 유지되는 도메인이 정해지고, 그것이 `CLOUDFRONT_DOMAIN` /
`S3_PUBLIC_ENDPOINT` 의 실제 값이 된다.

### D-2. 법률 문서 정식화

`apps/api/src/routes/legal.ts` 의 약관·개인정보처리방침은 **코드 기준으로 실제 수집 항목을 정확히 기술했지만
법률 검토를 받지 않은 출시 전 초안**이다(페이지 상단에도 표기). 아직 출시 전이므로 약관 "개정" 절차
(사전 공지·재동의)는 필요 없다 — 정식 문서화에 합친다. 남은 것(`apps/api/src/routes/legal.ts` 상단 주석에도 적혀 있다):

- [ ] **분석 고지** — 동의 문구와 함께 확정한다. 2026-09-29 옵트인 결정으로 생산 활성화의 조건은 아니게 됐다
      (동의한 사용자에게만 돈다 — [snap-content-analysis.md](./decisions/snap-content-analysis.md) §6.1)
  - 사업자·모델 확정 (지금 문서는 OpenAI 전제, `OPENAI_VISION_MODEL` 은 잠정값 — A-3 "운영 모델 고정")
  - [ ] **계약 문구 대조와 DPA 체결** — 보유 기간·학습 이용은 공개 문서로만 확인했다. ZDR 승인을
    받으면 보관 기간을 "없음" 으로 바꿀 수 있다
  - [ ] **AWS 리전 확정** — `AWS_REGION=ap-northeast-2`(서울) 기준으로 "국외 이전 아님"이라고 적었다.
    2026-10-08 에 AWS 서버가 떠서(B-8) 이제 확인할 수 있다 — 배포된 버킷의 실제 리전과 CloudFront
    사용 여부(엣지는 전 세계)로 확정한다. 공모전 서버는 끝나면 내려가므로 서버가 옮겨 가면 다시 본다
  - [ ] **Apple·Google 취급의 법무 확인** — 우리가 직접 보내지 않아 표가 아니라 문장으로 관계만 적었다
  - [ ] **Sentry 보관 기간** — 요금제(무료 30일 / 유료 90일)가 정해지면 좁힌다
  - [ ] **별도 동의가 필요한가**(법무 판단) — 2026-09-29 결론을 기다리지 않고 옵트인을 먼저 들이기로 했다
    ([snap-content-analysis.md](./decisions/snap-content-analysis.md) §6.1). "고지로 충분하다"로 나오면 동의의
    기본값을 그때 다시 정하고, "필요하다"로 나오면 동의 문구만 검토 결과에 맞춘다
- [ ] **광고(AdMob)가 법률 문서에 없다** — 앱은 `react-native-google-mobile-ads` 로 보상형 광고를 띄우는데
      수집 항목·위탁·국외 이전 어디에도 광고가 없다. 광고 SDK 는 광고 식별자와 기기 정보를 Google 로 보내므로
      세 곳 모두에 들어가야 한다. 어떤 식별자가 실제로 나가는지는 맞춤 광고 설정과 동의(UMP) 처리 방식에
      달렸으므로 그 정책을 먼저 정하고 쓴다. 스토어 신고(App Store 개인정보·Play 데이터 안전성)는 C-6
- [ ] **스냅 보관 기간이 법률 문서에 없다** — 개인정보처리방침의 "보관 및 파기"와 이용약관 어디에도 스냅의 서버
      보관(업로드 후 15일, SNAP-9)과 끝내지 않은 결과물의 보관 상한(30일, MOV-16)이 없다. 사용자가 지운 스냅도 원래 보관 기간이
      끝날 때까지 서버가 파일을 남긴다는 것(최근 삭제, SNAP-20)도 함께 적어야 한다. 보관 기간을 정할 때 고지가
      필요하다고 적어 두었다([snap-retention-period.md](./decisions/snap-retention-period.md#이-결정이-영향을-주는-곳)).
      사본을 남기는 방법(앨범 저장, SNAP-17)을 함께 적는다
- [ ] `LEGAL_CONTACT_EMAIL` 이 미설정이면 `support@snaply.app` 로 표시된다 — 실제 주소로 교체

**완료 조건**: 법무 검토를 거친 정식 문서로 교체하고 페이지 상단의 "출시 전 초안" 배너를 걷는다.

### D-3. URL prefix 소유권 검증 재등록

운영 도메인(D-1)이 정해지면 틱톡 URL prefix 소유권 검증을 그 호스트로 다시 등록한다. 검증할 prefix 두 곳
(API 호스트 `/legal/` · 미디어 호스트 `/snaply-dev/`)과 서빙 방식·서명 발급 단위의 실측은
[sns-setup.md](./sns-setup.md) §3 "URL prefix 소유권 검증". 운영에서 CloudFront 도메인 하나로 합쳐지면
검증도 한 번으로 줄어든다. 운영에서도 **검증 파일 경로만은 익명 읽기**여야 한다 — 개발용
`npm run dev:public-bucket -w apps/api` 는 로컬 MinIO 전용이라(`S3_ENDPOINT` 없으면 실행 거부) 운영에서는 쓰지 않는다.

**완료 조건**: 운영 도메인에서 필요한 prefix 가 검증되고, 그 도메인의 영상 URL 로 PULL_FROM_URL 업로드가
`403 URL ownership` 없이 통과한다.

### D-5. 만료된 광고 보상 세션 정리 배치

`ad_rewards` 의 만료 확정은 **조회 시점 lazy** 다([decisions/ad-reward-credits.md](./decisions/ad-reward-credits.md) §4-1).
다시 들어오지 않는 사용자의 세션은 `pending` 으로 남는다. 상태 오독을 만들지는 않지만
(그 사용자가 다시 오면 그 자리에서 확정된다) 행이 계속 쌓인다.

**지금 하지 않는 이유**: 크레딧이 아니라 행만 늘고, 상한도 "진행 중 1개 + TTL 300초"가 정한다
(사용자당 하루 최대 288행). 실사용 규모에서 실제로 문제가 되면 고아 pending 영상 정리
(`npm run videos:purge-pending -w apps/api`, [progress.md](./progress.md) 2026-08-12)와 같은 방식의 배치를 붙인다.

---

## E. 코드 결함 / 판단 필요

### E-5. BGM 무작위 선택이 같은 구성의 재현성을 깬다 ⚠️

BGM 선택이 디렉터리 스캔 + `random.choice` 라
([`apps/ai-worker/src/pipeline/music.py`](../apps/ai-worker/src/pipeline/music.py))
**같은 구성으로 다시 만들어도 BGM 이 달라진다.** MOV-14 는 같은 구성이면 같은 결과를 요구한다.
다시 만들기는 사용자가 편집한 뒤 크레딧을 내는 새 생성이라(MOV-19) 결과가 달라지는 것 자체가
배신은 아니지만, 사용자는 자기가 바꾸지 않은 것이 바뀐 이유를 알 수 없다.
A-7 의 비트 싱크가 들어오면 컷 지점까지 달라져 피해가 커진다.

**완료 조건**: 선택된 트랙 ID·난수 시드를 `editSpec` 에 핀으로 남기고, 재생성이 같은 산출물을
내는 것을 테스트로 고정한다. 트랙 ID 를 가지려면 `bgm_tracks` 가 필요하므로 A-7 과 함께 간다.

### E-7. MinIO 커뮤니티 이미지의 수명 — 로컬·CI 스토리지 대체 검토

MinIO 커뮤니티 에디션은 이미지 배포를 멈췄고(Docker Hub 이미지 삭제, quay.io 익명 pull 차단) 유료 AIStor 로
대체되는 중이다. 지금은 같은 릴리스(`RELEASE.2025-09-07T16-13-09Z`)를 아카이브된 소스에서 빌드한 GHCR 미러를
쓴다 — [`deploy/minio/Dockerfile`](../deploy/minio/Dockerfile) · [`minio-image.yml`](../.github/workflows/minio-image.yml) ·
받지 못하면 로컬 빌드하는 [`scripts/ensure-minio-image.sh`](../scripts/ensure-minio-image.sh)
([progress.md](./progress.md) 2026-09-25). 태그를 올릴 때는 amd64·arm64 매니페스트를 둘 다 확인한다
(`.hotfix.*` 태그는 amd64 만 있어 Apple Silicon 에서 pull 이 실패한다).

**왜 열려 있는지**: 미러는 공급 문제만 푼다.

- 커뮤니티 릴리스는 2025-09-07 이후 패치가 없다. 보안 수정은 AIStor 에만 간다 — 우리가 빌드해도 같다
- **2026-10-09 로 급박함이 줄었다.** 사내 서버를 접으면서(배포 대상은 AWS S3 하나다) MinIO 가 네트워크에
  노출되는 자리가 없어졌다 — 남은 쓰임은 로컬 개발과 CI 뿐이다. 패치가 끊긴 서버를 **운영에서**
  노출하던 문제는 사라졌고, 공급(이미지를 못 받는 것)만 남았다

**결정할 것**: 대체 S3 호환 서버(RustFS · Garage · SeaweedFS 등)로 바꿀지, 미러로 둘지. 코드는 `S3_ENDPOINT` 만 바꾸는
구조라 교체 비용은 compose 2곳(`docker-compose.yml` · `docker-compose.dev.yml`) · CI(`.github/workflows/ci.yml` 의 MinIO 단계) ·
[ONBOARDING.md](../ONBOARDING.md) · [deployment-aws.md](./deployment-aws.md)
와, MinIO 전용 API 에 기대는 곳이 있는지 확인(`dev:public-bucket` 스크립트 · 헬스체크 경로) 정도다.
GHCR 패키지를 공개로 돌릴지도 정한다 — 공개면 새 개발자가 로그인 없이 받고, 로컬 빌드(몇 분)를 건너뛴다.

**완료 조건**: 대체 여부 결정 → 바꾼다면 compose 2곳 · CI + 문서 갱신 + `npm test -w apps/api`
(통합 테스트가 MinIO 를 쓴다) 통과. 두기로 하면 이 항목을 "소스 빌드 미러 유지"로 좁혀 닫는다.

### E-18. 지운 스냅의 분석 결과가 남는다 — 개인정보처리방침과 다르다 ⚠️

ANA-3 은 영상을 지우면 그 분석 결과도 파기하라고 하고, 개인정보처리방침(`apps/api/src/routes/legal.ts` "파기")도
"영상을 삭제하면 그 영상의 분석 결과도 함께 삭제됩니다"라고 고지한다. 그런데 서버는 지운 영상(최근 삭제)과 만료된
영상의 `videos` 행을 툼스톤으로 남기고(`apps/api/src/services/retention.service.ts` `purgeVideoAssets`),
`video_analyses` 는 행이 실제로 삭제될 때만 Cascade 로 지워지므로 분석 결과가 계정 삭제 때까지 남는다.

**완료 조건**: 되살릴 수 없게 되는 시점(최근 삭제의 보관 기간이 끝나거나 만료로 정리될 때)에 `video_analyses` 를
지우고 테스트로 고정한다(권장 — 고지와 맞춘다). 아니면 방침 문구를 실제 동작으로 고친다(D-2 와 함께).
어느 쪽이든 ANA-3 이 `구현됨` 이 된다.

### E-19. RLS 정책이 없는 테이블이 다섯 개다

[`apps/api/prisma/rls-policies.sql`](../apps/api/prisma/rls-policies.sql)은 "모든 테이블에 RLS 를 켠다"는 원칙으로 쓰였는데, 그 뒤에
생긴 `user_consents` · `video_signals` · `movie_recommendations` · `movie_recommendation_items` · `movie_drafts` 에는 정책이 없다.
API 는 서버 권한으로 DB 에 붙고 소유권을 코드에서 검사하므로 지금 새는 것은 없다. RLS 가 실제로 효력을 갖는 것은 클라이언트가
Supabase 로 DB 에 직접 닿을 수 있는 공유 Supabase DB 를 쓸 때뿐이다 — 로컬과 AWS 서버는 각자의 Postgres 를 쓴다
([ONBOARDING.md](../ONBOARDING.md) §3).

**결정할 것**: (a) 다섯 테이블에 다른 테이블과 같은 모양(`user_id = auth.uid()`)의 정책을 더한다 — 원칙 유지, 공유 DB 로 돌아가도 안전
(b) RLS 를 쓰지 않는 구성이 현행이므로 파일의 원칙 문구를 "공유 Supabase DB 에서만 쓰는 방어선"으로 고치고 정책 추가를 멈춘다.

**완료 조건**: 고른 쪽으로 SQL 이나 원칙 문구를 고치고, (a) 면 새 테이블을 만들 때 정책을 함께 쓰라는 줄을
[team.md](./team.md) §3 에 넣는다.

### E-21. SNS 업로드 준비 경고가 실제 업로드 주소를 보지 않는다

인스타 · 틱톡은 우리가 넘긴 URL 에서 영상을 내려받는다. 그 URL 은 결과물의 presigned GET 이고 서명 호스트는
`S3_PUBLIC_ENDPOINT ?? S3_ENDPOINT` 다(`apps/api/src/services/storage.service.ts` `presignClient`). 그런데 기동 때 이 주소가 외부에서
닿는지 미리 경고하는 `snsUploadReadiness`(`apps/api/src/services/sns.service.ts`, `apps/api/src/app.ts` 에서 호출)는
`config.storage.publicBaseUrl` — `CLOUDFRONT_DOMAIN` 우선의 공개 URL — 을 판정한다. `CLOUDFRONT_DOMAIN` 만 터널 주소이고
`S3_PUBLIC_ENDPOINT` 가 localhost 면 **경고 없이** 업로드가 400 이 된다. 터널 안내 스크립트(`apps/api/scripts/dev-tunnel.sh`)의 출력에도
`S3_PUBLIC_ENDPOINT` 가 없어 문서([sns-setup.md](./sns-setup.md) §1 · [local-tunnel.md](./local-tunnel.md) §6)가 손으로 넣으라고 보완하고 있다.

**완료 조건**: 판정 대상을 presign 호스트로 바꾸고 테스트로 고정한다 · `dev-tunnel.sh` 가 `S3_PUBLIC_ENDPOINT=https://<미디어 호스트>`
줄을 출력하게 한다 · presigned 전환(2026-08-10) 이후 이 터널 경로로 실키 업로드를 다시 돌린 기록이 없으므로 한 번 실검증한다
(C-2 · D-3 와 같은 자리에서).

### E-22. `API_HOST_PORT` 가 환경변수 원천에 없다

`API_HOST_PORT` 는 `docker-compose.yml` · `docker-compose.ci.yml` 의 포트 매핑, `scripts/smoke-images.sh`, 배포 잡의 헬스체크
(`deploy.yml` 의 `vars.API_HOST_PORT`)가 읽는데 [`apps/api/src/env-spec.ts`](../apps/api/src/env-spec.ts)에 선언되지 않았다
(AGENTS.md: 새 변수는 env-spec 부터). `env-spec.test.ts` 는 앱 코드가 읽는 변수만 검사해 잡지 못한다.

**완료 조건**: `API_HOST_PORT` 를 `POSTGRES_HOST_PORT` 처럼 `origin: 'local'` 로 선언하고 [`.env.example`](../.env.example)에 예시를 넣는다 ·
`npm test -w apps/api`(env-spec 테스트) 통과.

### E-23. 같은 동작의 권한 버튼 라벨이 둘이다

권한이 거절된 뒤 시스템 설정으로 보내는 버튼이 앨범 · 알림 화면은 `설정에서 권한 켜기`인데
(`apps/mobile/src/features/save-snap-to-album/model/album-save-copy.ts` · `pages/me/ui/me-album-page.tsx` · `pages/me/ui/me-notifications-page.tsx`),
촬영 화면의 카메라 · 마이크 거절만 `설정에서 권한 열기`다(`apps/mobile/src/pages/capture-record/ui/capture-record-page.tsx`).
UX 규칙상 같은 동작에 라벨이 둘인 `Inconsistent Twin` 이다([interaction-patterns.md](../apps/mobile/docs/ux/interaction-patterns.md) §8).

**완료 조건**: 촬영 화면을 `설정에서 권한 켜기`로 맞추고 그 화면의 테스트 · [capture-flow.md](../apps/mobile/docs/features/capture-flow.md)를 함께 고친다.

---

## F. 남은 실검증

- [ ] **돌비비전 실물 원본으로 HDR 경로 확인** — 스트레스 검증(2026-09-15)의 HDR 수정은 합성 HDR10 으로만
      확인했다. 실제 DV 원본이 생기면 편집 결과물과 렌디션 모두 다시 확인한다(아이폰 원본은 A-4 "iOS 출시 전"과
      같은 공백)
- [ ] 실BGM 기준 whisper 자막 인식 재확인 (현재는 dev BGM 기준으로만 확인) — 실BGM 이 아직 없다(A-7 BGM 조달)
- [ ] **워커 쪽 취소 중단·실패 환급** — 취소된 작업이 진행률 갱신에서 멈추는 것(`JobCanceled`)과 워커 실패 시
      예약 크레딧 환급(`refund_export_credits` 호출)은 문법 검증만 했다([progress.md](./progress.md)
      2026-08-13 · 2026-08-14). 실제 워커로 각각 한 번 확인한다. 취소 쪽은 앱 기능 문서에 2026-08-13 실서버 기기 검증 기록
      (취소한 작업이 40초 뒤에도 `canceled`)이 있다([movie.md](../apps/mobile/docs/features/movie.md) "만들기 취소") — 워커 로그로
      중단을 확인하면 취소 쪽은 닫고 실패 환급만 남긴다
- [ ] **`앱`** **다른 기기에서 지운 스냅의 컷 표시**(SNAP-12) — 컷이 사라진 사유(`unavailableReason`)는 2026-10-07 에 들어갔지만
      다른 기기에서 지운 스냅의 컷이 "스냅이 삭제됐어요"로 보이는 것을 실기기에서 보지 않았다([progress.md](./progress.md)
      2026-10-07 "무비 컷이 사라진 사유를 싣는다"). 두 기기로 한 번 확인한다
- [ ] **`앱`** **알림 설정의 실기기 확인**(NTF-7 `구현됨(실기기 미검증)`) — 앱이 계정의 알림 설정을 읽고 쓰는 것은
      Android 에뮬레이터로만 확인했고, 에뮬레이터는 권한이 이미 있었다([progress.md](./progress.md) 2026-10-07
      "알림 설정은 계정에 있다"). 휴대폰에서: 권한이 없는 새 기기로 로그인하면 계정에서 켜진 알림에 "기기 설정에서 …
      받을 수 있어요" 안내와 `설정에서 권한 켜기` 가 뜬다.
      **완료 조건**: 통과하면 NTF-7 의 `(실기기 미검증)` 을 지운다

---

## G. 정리 필요 (일회성)

- [ ] **인스타 연동 재연동** ⚠️ — 현재 저장된 연동은 `token_expires_at` 이 **`null`** 이다(개인 계정
      시절 장기 토큰 교환이 실패한 흔적). 이 토큰은 **조용히 만료되고** 그 뒤 게시가 실패한다.
      `GET /sns/instagram/connect` → 승인 한 번이면 60일짜리 만료 시각이 채워진다. 계정이
      프로페셔널로 바뀌어 실패 원인은 사라졌다. 코드 쪽 대응은 E-1 에서 끝났지만(다음 게시 때
      서버가 갱신을 시도해 만료 시각을 알아낸다) **이미 만료된 뒤라면 갱신도 실패**하므로
      재연동이 확실한 길이다
- [ ] **자동 편집 실기기 확인에 쓴 시험 데이터** — 2026-10-01 실기기 확인에서 만든 시험 무비 두 편과 지급한 크레딧 100 은
      "정리는 오너 확인 뒤"로 남았다([progress.md](./progress.md) 2026-10-01 "자동 편집 실기기 확인"). 이미 정리했는지 확인하고
      남았으면 지운다
- [ ] **낡은 코드 주석·설명** — 동작은 맞고 글만 낡았다. 한 번에 고친다(API 설명을 바꾸면 `npm run openapi:write -w apps/api`):
  - `.github/workflows/deploy.yml` 머리 주석의 "실제 배포 대상/자격증명은 리포지토리 Secrets로 주입" — 지금은 self-hosted runner 와
    Secrets Manager 에서 배포 때 만든 env 파일이다([deployment-aws.md](./deployment-aws.md) §2)
  - `apps/api/src/routes/auth.ts` 분석 동의 철회(`DELETE /auth/me/analysis-consent`)의 description — 파기 대상에 편집 초안 기록이 빠졌다
    (`withdrawAnalysisConsent` 는 `movieDraft` 도 지운다)
  - `apps/api/prisma/schema.prisma` `AdReward.status` 주석이 `pending | granted | expired | rejected` — `abandoned` 가 빠졌다
    (`apps/api/src/services/ad-reward.service.ts` `AD_REWARD_STATUS`)
  - `.env.example` Redis 섹션 머리말의 "운영: Upstash" — AWS 서버도 compose 의 redis 컨테이너를 쓴다
  - `scripts/media-cleanup.mjs` 상단 주석 "공유 Supabase 라 통합 테스트 후 자기 데이터를 정리" — 통합 테스트는 `snaply_test` 만 쓰고,
    정리 대상은 `media:e2e` 가 만든 데이터다
  - `apps/api/src/services/retention-policy.ts` `EXPIRY_NOTICE_HOUR_KST`(10) 는 로그 표시용이고 실제 시각은 `deploy/batches.cron` 이 정한다 —
    둘이 따로 움직이지 않게 주석에 원천을 적는다
  - 앱의 "(global) deep-link handler" 주석 — 실제로는 Expo Router 가 `/auth/callback` · `/auth/reset` 화면(`pages/auth-callback`)으로 보내
    코드를 교환한다: `apps/mobile/src/features/sign-up/model/supabase-sign-up-provider.ts` · `features/sign-up/ui/email-sent-notice.tsx` ·
    `features/reset-password/model/reset-password-provider.ts` · `features/reset-password/model/supabase-reset-password-provider.ts` ·
    `entities/session/model/session-store.ts` · `entities/session/api/session-gateway.ts` · `shared/lib/supabase/auth-redirect.ts`
  - `apps/mobile/.prettierignore` — 없는 대상(`src/shared/api/schema.d.ts` · `docs/api/openapi.json` · `docs/guides/**/*.html`)과 없는 스크립트
    (`api:gen` · `api:pull`)를 가리키는 줄을 지운다
- [ ] **테스트 게시물 정리** — 인스타 릴스는 API 로 삭제할 수 없으므로 앱에서 수동으로 지운다.
      **틱톡 받은함 초안 3건은 지우지 않는다** — C-2("API 는 ok 인데 알림 미도착")의 유일한 증거물이라
      C-2 가 닫힌 뒤에 정리한다.

---

## H. 작은 판단 — 문서 · 규칙 · 문구

2026-10-09 문서 전수 감사에서 나온, 코드 동작은 그대로이고 **규칙이나 문서를 어느 쪽으로 맞출지만 정하면 되는** 판단이다.
각 항목에 배경 · 선택지 · 권장(있으면) · 완료 조건을 적었다. 정하면 해당 문서(와 필요한 경우 코드 · 테스트)를 고치고 닫는다.

### H-1. UX 문구 규칙의 범위 — `지워요` · `촬영` · `장면`

[ux-writing.md](../apps/mobile/docs/ux/ux-writing.md) 용어표의 금지어와 앱의 실제 문구가 세 곳에서 어긋난다. 규칙을 좁힐지
문구를 바꿀지 하나씩 정한다.

- **`삭제` 행** — `지우기` · `지울까요` 를 금지하는데, 앱은 결과를 설명하는 문장에 `지워요` 를 쓴다: `보관 중인 N개만 지워요`
  (스냅 삭제 확인), `끄면 분석 결과를 지워요`(분석 동의 시트 · 설정 — 동의 문구), `최대 30일 보관한 뒤 지워요`.
  (a) 규칙을 "사용자가 누르는 버튼과 묻는 질문"으로 좁힌다 — **권장**, 동의 문구를 건드리지 않는다 (b) 문구를 `삭제해요` 로 바꾼다
- **`촬영`** — 2026-09-24 결정은 "카메라 컨트롤에 `촬영` · `담기` 금지"인데, 캡처의 ✕ 접근성 라벨이 `촬영 닫기` 이고 오류 문구에
  `촬영을 완료하지 못했어요` · `소리와 함께 촬영하려면…` 이 있다. 규칙이 컨트롤 라벨(접근성 라벨 포함)만인지 메시지까지인지 정한다
- **`장면`** — `컷` 행은 `장면` 을 금지하는데, 템플릿 슬롯 힌트 `처음 본 장면`
  (`apps/mobile/src/entities/movie-template/lib/movie-template-catalog.ts`, 서버 카탈로그를 못 받을 때의 fallback)에 있다.
  컷이 아니라 찍을 대상을 묘사하는 말이라 금지 대상인지 정한다

**완료 조건**: 정한 대로 ux-writing.md 용어표를 고치거나 앱 문구와 그 테스트를 바꾼다.

### H-2. 결정이 끝난 결정 문서의 제목

`snap-retention-period.md` · `local-copy-after-upload.md` · `movie-cleanup-after-export.md` · `movie-export-policy.md` 의 제목이
아직 "결정 요청 —"으로 시작한다(상태 줄은 이미 `결정`). `storage-and-subscription-policy.md` 의 제목 "구독 상품 도입"은 구독이
미확정(CRD-7 `보류`)인 지금 "구독을 들였다"로 읽힌다. 선례 [movie-model.md](./decisions/movie-model.md)는 결정 뒤 제목이 결정을
말한다. 제목을 가리키는 앵커 링크는 없다(2026-10-09 확인).

**선택지**: (a) 접두사를 걷고 결정 내용을 말하는 제목으로 바꾼다 — **권장**, 인덱스 · 검색에서 미결처럼 보이지 않는다
(b) 결정 당시의 기록으로 둔다.

**완료 조건**: (a) 면 다섯 문서의 제목을 바꾸고 [decisions/README.md](./decisions/README.md)가 그대로 맞는지 확인한다.

### H-3. `movie-snap-expiry-exemption.md` 의 형식

상태는 `결정(잠정)`인데 [decisions/README.md](./decisions/README.md)에서는 "결정 대기" 표에 있다. 미결 문서 규격(배경 · 영향 ·
선택지 · 결과 · 권장 · 빈 결정 기록 표)과 비교하면 앞의 넷은 있으나 "권장" 절과 "결정 기록" 표가 없다 — "유력한 대안"으로 적은
C 문단이 사실상 권장이다.

**선택지**: (a) `결정(잠정)` 을 유지하고 결정 기록 표를 만들어 잠정 결정 A(예외 없음)를 채운다 — 2026-09-15 잠정 결정의
결정자 기록이 커밋에도 없어 그 칸은 비운다 (b) `미결` 로 되돌리고 권장 = C 로 구조화한다 — 현행 동작(예외 없음)의 근거가
약해진다 (c) 그대로 둔다.

**완료 조건**: 고른 형식으로 문서와 인덱스의 표 위치를 맞춘다. 요금제(A-2) · A-1 과 같은 자리에서 본다.

### H-4. 테스트의 한국어 문자열 이스케이프 관례

[writing-unit-tests.md](../apps/mobile/docs/workflows/writing-unit-tests.md)는 테스트 안의 한국어를 `\uXXXX` 이스케이프로 쓰는 것이
관례라고 하는데, 모바일 테스트 172개 중 46개 파일이 코드(주석 제외)에 한글 리터럴을 그대로 쓴다(예: `me-notifications-page.test.tsx`,
`client.test.ts`). 관례를 둔 이유(편집 도구가 이스케이프를 풀어 쓰는 문제)가 지금도 유효한지 먼저 본다.

**선택지**: (a) 규칙을 "권장"으로 완화하고 리터럴을 허용한다 (b) 46개 파일을 일괄 변환해 규칙을 지킨다.

**완료 조건**: writing-unit-tests.md 와 실제 테스트가 같은 말을 한다.

### H-6. 모바일 로컬 개발 문서의 환경 프로필

[local-development-and-testing.md](../apps/mobile/docs/workflows/local-development-and-testing.md)의 명령 예시가 구형 Intel Mac 기준이다
(Xcode 16.4, `iPhone 16` 시뮬레이터, AVD `Pixel_API_35`, `~/.expo` 캐시의 `Expo-Go-57.0.4`). 지금 작업하는 Mac 은 Xcode 27 ·
`iPhone 17` · AVD `snaply_api35` 이고 Expo Go 를 api.expo.dev 에서 받는다. 코드로는 확인할 수 없어 정리 때 고치지 않았다.

**완료 조건**: 지금 프로필을 기본으로 바꾸거나 두 프로필을 함께 적는다(구형 장비가 더는 없으면 구형 절을 걷는다).

### H-7. 모바일 런타임 에셋의 위치 규칙

[expo-router.md](../apps/mobile/docs/frameworks/expo-router.md)와 [feature-sliced-design.md](../apps/mobile/docs/architecture/feature-sliced-design.md)는
"여러 slice 가 쓰면 `shared/assets`, 한 slice 만 쓰면 그 근처"라고 하는데 `src/shared/assets` 는 없고 화면 이미지가 루트
`apps/mobile/assets/images`(`@/assets/*` 별칭)에 있다 — 로그인 화면 하나만 쓰는 `brand-glyph-white.png` 도 그렇다.

**선택지**: (a) 루트 `assets` 를 규칙에 반영한다(앱 아이콘 · 스플래시처럼 네이티브가 읽는 파일과 같은 곳) (b) 파일을 규칙대로 옮긴다.

**완료 조건**: 두 문서와 실제 위치가 같다.

### H-8. `runOnJS` 와 `scheduleOnRN`

[animations-and-gestures.md](../apps/mobile/docs/frameworks/animations-and-gestures.md)는 UI 스레드에서 JS 로 넘길 때 `runOnJS` 를
처방하고 코드 5개 파일이 그렇게 쓰는데, `apps/mobile/src/_app/routes/animated-splash-overlay.tsx` 만 `react-native-worklets` 의
`scheduleOnRN` 을 쓴다.

**완료 조건**: Reanimated 4.5 · worklets 의 권장에 맞춰 하나로 통일하고 문서와 코드를 맞춘다.

### H-9. ONBOARDING 의 "모노레포 통합 이전에 분기한 브랜치" 절

[ONBOARDING.md](../ONBOARDING.md) §5 의 이 절은 통합 전에 분기한 브랜치를 옮기는 법을 다루는데, 원격에는 `main` 만 있고 로컬에도
통합 전 브랜치가 없다(2026-10-09 확인).

**선택지**: (a) 지우고 "`apps/mobile` 이력은 통합 커밋 이전으로 내려가지 않는다"는 한 줄만 남긴다 (b) 그대로 둔다.

### H-10. 결정 문서의 결정 ID 가 백로그 ID 와 같은 모양이다

[decisions/edit-spec-v3.md](./decisions/edit-spec-v3.md)와 그 초안([plans/edit-spec-v3.md](./plans/edit-spec-v3.md) ·
[plans/asset-pack-manifest.md](./plans/asset-pack-manifest.md))은 결정 항목을 `A-1`~`D-8`(`B-6` · `B-9` · `D-4` …)로 부른다.
백로그 ID 와 모양이 같아 grep 과 독자가 헷갈린다 — 예: 닫힌 백로그 B-6(알림 설정)과 결정 B-6(컷 타이밍 기준). 2026-10-09 에 두
초안에는 "괄호 안의 A-1~D-8 은 결정 항목이다"는 안내를 넣었다.

**선택지**: (a) 결정 쪽 ID 에 접두를 붙인다(`결정 B-6` 또는 `V3-B6`) — 이 ID 를 인용하는 백로그 A-7 · 코드 주석도 함께 바꾼다
(b) 안내만으로 둔다.

### H-11. `env-management.md` 의 "후속 연계" 절

[decisions/env-management.md](./decisions/env-management.md)의 "후속 연계"는 작성 뒤에 덧붙인 내용인데 배너가 아니라 본문 절로 남아
있다([doc-conventions.md](./doc-conventions.md) §헤더: 작성 뒤의 정정 · 후속은 헤더 아래 배너). 현재 사실을 가리키는 링크 위주라
2026-10-09 정리에서는 구조를 유지했다.

**완료 조건**: 배너로 압축하거나, 본문 절로 두는 이유를 그 절 첫 줄에 적는다.

### H-12. 모바일 UX 문서 체계의 두 군데

- [guardrails.md](../apps/mobile/docs/ux/guardrails.md)는 자체 규칙 없이 "잘못된 수 → 원천 규칙 링크" 22개로 된 색인이 됐다.
  그대로 둘지 [agent-protocol.md](../apps/mobile/docs/ux/agent-protocol.md)의 한 절로 합칠지 — 짧고 중복이 없어 **유지 권장**
- [principle-priority.md](../apps/mobile/docs/ux/principle-priority.md)의 목표 문장이 [philosophy.md](../apps/mobile/docs/ux/philosophy.md)의
  같은 문장과 표현이 다르다(능력 · 통제를 잃게 하지 않는다는 조건이 더해졌다). 하나로 통일할지

**완료 조건**: 정한 대로 두 문서를 맞추고 [ux/README.md](../apps/mobile/docs/ux/README.md)의 라우팅 표를 확인한다.

### H-13. 모바일 기능 문서의 상태 라벨 두 개와 앱 맵 순서

- [snap-extract.md](../apps/mobile/docs/features/snap-extract.md)의 `Partial` 근거가 "Android 실기기 검증 대기, iOS 미빌드"인데 추출
  화면을 Android 실기기로 검증한 기록은 progress 에 없다. 휴대폰에서 추출을 써 봤다면 `Functional` 로 올리고 기록한다
- [movie-templates.md](../apps/mobile/docs/features/movie-templates.md)의 Stage 2(서버 추천)는 앱이 다 만들어졌지만 서버 플래그
  (`MOVIE_RECOMMENDATION_ENABLED`)가 꺼져 사용자에게 효과가 없다. 상태 어휘로는 `Not implemented`(효과를 완료할 수 없음)에 가깝다 —
  (a) 앱 기준 `Functional`(dormant) 유지 (b) `Not implemented`(dormant)로
- 2026-10-09 정리에서 [features/README.md](../apps/mobile/docs/features/README.md)의 앱 맵을 `root-layout.tsx` 의 실제 선언 순서
  (= 가드의 우선순위)로 재정렬했다. 예전 "개념 순서"가 더 낫다면 되돌린다

### H-14. 백로그 A-1 ② 의 통과 판정

2026-10-09 정리에서 A-1 "서버 전환 실기기 검증"의 ② "편집이 PATCH 된다"를, 경계별 전환 · 자동 편집 화면에서 고친 값이 DB 에
닿은 실기기 기록([progress.md](./progress.md) 2026-10-01)으로 통과 처리했다. ② 가 더 좁은 경로(촬영 직후 아웃박스의 PATCH 등)를
뜻했다면 되돌린다.

---

## 닫은 항목

닫힌 항목의 한 줄 색인이다 — 같은 일을 다시 올리지 않기 위해 둔다. 구현·검증 내역은
[progress.md](./progress.md)의 같은 날짜 항목이 원천이다.

- **B-1. 배포 — 사내 서버 가동** — **2026-10-09 접었다.** 사내망 전용이라 실사용자를 받을 수 없었고,
  외부에서 닿는 AWS 공모전 서버(B-8)가 뜨면서 둘을 함께 둘 이유가 사라졌다. 저장소 쪽 산출물
  (`docker-compose.prod.yml`, `deploy.yml` 의 `deploy` 잡, `docs/deployment.md`)은 지우거나
  [archive/](./archive/README.md)로 옮겼다. 배치 cron · 백업 스크립트는 AWS 와 공유라 남아 있다.
  그때의 기록은 [archive/on-prem-deployment.md](./archive/on-prem-deployment.md).

- **A-1** 무비 서버 엔티티 · CRUD · export — 2026-09-09 → progress 2026-09-09 "촬영 시각 저장 · 무비 서버 엔티티"
- **A-1** 스냅 15일 · 결과물 30일 만료 정리 배치(툼스톤, 만료 → 실삭제 2단계) — 2026-09-09 → progress 2026-09-09 "보관 기간 만료 정리 배치"
- **A-1** 무비 완성 알림의 FCM 전환 — 2026-09-11 → progress 2026-09-11 "무비 완성 알림의 서버 전환"
- **A-1** e2e 를 앱과 같은 무비 경로로 — 2026-09-11 → progress 2026-09-11 "이미지 스모크 검사 · e2e 무비 경로 전환"(실제 아이폰 영상은 2026-09-15 "스트레스 실검증")
- **A-1** 앱의 무비 서버 전환 · 끝내기 버튼 · 로컬 완료 알림 제거 · 모바일 기능 문서 — 2026-09-12 → progress 2026-09-12 "무비 서버 전환 · 끝내기 · 완료 알림 정리"
- **A-1** 푸시 탭 라우팅 — 2026-09-12 → progress 2026-09-12 "알림 탭 라우팅"(실기기 확인은 A-1 "서버 전환 실기기 검증" ③)
- **A-1** 스냅 목록의 만료 표시 — 2026-09-27 → progress 2026-09-27 "스냅이 기기와 재설치를 넘어 보인다"
- **A-2** 광고 보상 정책 값(20크레딧 · 일일 5회 · 쿨다운 300초 · 세션 TTL 300초) — 2026-08-18 → progress 2026-08-18 "광고 보상 세션 수명·포기" · "광고 보상 정책 값 확정 — 20크레딧 · 일일 5회" · "광고 보상 쿨다운 300초 확정" · [ad-reward-credits.md](./decisions/ad-reward-credits.md) §7
- **A-2** 스냅 만료 예고 리드타임(D-3 · D-1, KST 10시) — 2026-09-09 → [expiry-notice-schedule.md](./decisions/expiry-notice-schedule.md) · progress 2026-09-09 "SNS 게시 자동 끝내기 · 만료 예고 알림"
- **A-3** 분석 고지의 보유 기간 · 학습 이용 확인과 국외 이전 표의 수탁자 — 2026-08-19 → progress 2026-08-19 "약관·개인정보처리방침의 분석 고지 초안"
- **A-4** `capturedAt` 전달 · 저장(SNAP-10) — 2026-09-09 → progress 2026-09-09 "촬영 시각 저장 · 무비 서버 엔티티"
- **A-4** 삭제 유예 기간 30일(계정 삭제에 먼저 적용) — 2026-08-12 → [account-deletion.md](./decisions/account-deletion.md) · progress 2026-08-12 "계정 삭제 기능"
- **A-4** 2단계 ingest 렌디션 — 2026-09-09 → progress 2026-09-09 "배포 렌디션 워커"
- **A-4** 촬영 스냅 해상도 하드코딩 해소(앱) — 2026-09-12 → progress 2026-09-12 "촬영 스냅 해상도 하드코딩 해소"(실기기 확인은 A-4 에 남음)
- **A-4** reconcile 착수 전 제품 결정 셋 — 2026-09-27 → [snap-sync-across-devices.md](./decisions/snap-sync-across-devices.md)
- **A-4** 3단계 reconcile(구현 · Android 실기기 검증) — 2026-09-27 → progress 2026-09-27 "스냅이 기기와 재설치를 넘어 보인다" · "스냅 reconcile 실기기 검증"
- **A-4** 무비 컷의 `unavailable` 에 사유가 없다(SNAP-12) — 2026-10-07 → progress 2026-10-07 "무비 컷이 사라진 사유를 싣는다"
- **A-4** 스냅 휴지통(삭제 유예) — 2026-10-07 → [decisions/snap-trash.md](./decisions/snap-trash.md) · progress 2026-10-07 "지운 스냅을 보관 기간이 끝날 때까지 되살린다"(실기기 확인은 A-4 에 남음)
- **A-5** FE-BE 연동 범위 · 일정 확정 — 2026-09-02, 같은 개발자가 FE·BE 를 함께 맡게 되어 따로 둘 이유가 없어졌다
- **A-7** CI 의 ffmpeg 설치(골든 프레임 · ffprobe 계약 테스트) — 2026-09-15 → progress 2026-09-15 "산출물 계약 테스트와 CI 의 ffmpeg"
- **A-7** 스티커 팩 매니페스트 스키마와 editSpec v3·에셋 매니페스트 초안의 남은 개정 — 2026-10-03, 2026-08-20 에 개정된 초안이 미병합 브랜치에서 main 에 들어왔다 → [plans/edit-spec-v3.md](./plans/edit-spec-v3.md) · [plans/asset-pack-manifest.md](./plans/asset-pack-manifest.md) §5 · §9(들일 때 `prefer` 가 남지 않고(`ref`), anchor 어휘가 매니페스트 §9 로 떨어져 `defaultAnchor` 가 없으며, editSpec §10.3 이 `resolved.xy` 를 범위 무제약으로 적는 것을 확인했다. 결정 A-1~D-8 은 초안에서 대응하는 서술을 찾는 정도로 대조했다)
- **A-11** 경계별 전환(MOV-22) — 전환 어휘 · 무효화 액션 `cut-trim`·`transition-edit` · 무비 계약의 경계별 전환과 주인 · editSpec v3 렌더(`edit-v3` 큐) · AI 의 전환 규칙 · 편집 화면의 선택과 미리보기 · 실기기 확인 — 2026-10-01 → progress 2026-10-01 "Android 실기기에서 영상 두 개를 겹친 `crossfade`" ~ "경계별 전환 실기기 확인"
- **A-11** 컷 역할 사전(`cut-role-vocabulary.json`, TS·워커 로더와 정합성 테스트) — 2026-10-01 → progress 2026-10-01 "컷 역할 사전"
- **A-11** 무비 계약: 컷 구간의 주인(`trimOwner`) — 2026-10-01 → progress 2026-10-01 "무비 계약: 컷 구간의 주인"
- **A-11** 로컬 신호 reader(밝기 · 흐림 · 프레임 해시 · 움직임 · VAD 발화 → `video_signals`) — 2026-10-01 → progress 2026-10-01 "스냅 로컬 신호"
- **A-11** 초안 제안 API 와 선택 단계(`POST /movie-drafts`, edit-director) — 2026-10-01 → progress 2026-10-01 "편집 초안 제안 API"
- **A-11** 앱의 진입 경로와 흐름(스튜디오 `스냅 골라 자동 편집`, 에뮬레이터 확인) — 2026-10-01 → progress 2026-10-01 "앱: 자동 편집" · "자동 편집 에뮬레이터 확인"
- **A-11** 실기기 확인(초안 → 구간·전환 수정 → 생성한 결과물이 편집 화면과 같다) — 2026-10-01 → progress 2026-10-01 "자동 편집 실기기 확인"
- **B-5** API 계약 스키마 우선 1~5단계 — 2026-09-05 → progress 2026-09-05 "API 계약을 스키마 우선으로 — Zod 계약 패키지" · [api-contract-schema-first.md](./decisions/api-contract-schema-first.md)(남은 다듬기는 B-5)
- **B-6** 알림 설정의 서버 반영(서버) — 2026-09-15 → progress 2026-09-15 "알림 설정이 서버에 닿는다"
- **B-6** 앱의 알림 설정을 서버에 쓰기(서버가 원천 · 위치 · 무비 기본 꺼짐) — 2026-10-07 → progress 2026-10-07 "알림 설정은 계정에 있다"
- **B-7** 트랙 소유 표에 새 모듈 배정 — 2026-10-09, 만든 사람 · 고쳐 온 사람의 커밋 이력으로 트랙과 담당을 정해 [team.md](./team.md) §1 표에 모두 넣었다 → progress 2026-10-09 "문서 전수 정리 · constitution 확정 · 팀 분담"
- **C-7** 회사 OpenAI API 키 발급 — 2026-09-29 → progress 2026-09-29 "실제 모델로 스냅 분석 · 템플릿 추천 첫 실행"(남은 확인 중 사용 한도 · rate limit 은 A-3, 운영 키 분리는 B-8 로 옮김)
- **D-4** 개발 버킷 익명 읽기 정책 — D-3 에 합쳤다(운영의 검증 파일 경로 익명 읽기)
- **E-1** 만료 시각을 모르는 인스타 토큰의 코드 대응 — 2026-09-15 → progress 2026-09-15 "만료 시각을 모르는 SNS 연동"(재연동은 G)
- **E-2** `S3_PUBLIC_ENDPOINT` 기동 경고 — 2026-09-11 → progress 2026-09-11 "이미지 스모크 검사 · e2e 무비 경로 전환"
- **E-3** S3 삭제 실패분 정리 배치 — 2026-09-09 → progress 2026-09-09 "보관 기간 만료 정리 배치" ③
- **E-4** 빌드한 이미지의 스모크 검사(빌드 → 스모크 → 푸시) — 2026-09-11 → progress 2026-09-11 "이미지 스모크 검사 · e2e 무비 경로 전환"
- **E-6** 낡은 Prisma 클라이언트 프리체크 — 2026-09-09 → progress 2026-09-09 "촬영 시각 저장 · 무비 서버 엔티티" ②
- **E-8** 영상 삭제·정리가 자기 소유 객체만 지운다 — 2026-09-27 → progress 2026-09-27 "영상 삭제가 자기가 소유한 객체만 지운다"
- **E-9** 무비 생성의 402 가 부족분 숫자를 싣지 못한다 — 2026-10-03 → progress 2026-10-03 "무비 생성의 402 가 부족분 숫자를 싣는다"
- **E-10** 재생 화면의 길이 표시가 라이트 테마에서 거의 보이지 않는다 — 2026-10-07 → progress 2026-10-07 "재생 화면은 테마와 상관없이 어둡다"
- **E-11** `scripts/analysis-run.mjs` 가 떠 있는 분석 워커를 못 본다 — 2026-10-07 → progress 2026-10-07 "Python 워커가 Node 에서 보인다"
- **E-12** 배포본(렌디션)이 촬영 시각을 잃는다 — 2026-10-07 → progress 2026-10-07 "배포본이 촬영 시각을 싣는다"
- **E-13** 신호를 한 번 못 계산한 스냅은 다시 계산되지 않는다 — 2026-10-03 → progress 2026-10-03 "끝난 신호 작업을 다시 적재한다"
- **E-14** 서버에서 사라진 스냅 하나가 편집 초안 전체를 막는다 — 2026-10-03 → progress 2026-10-03 "서버가 쓸 수 없는 스냅을 따로 알린다"
- **E-15** 앱이 편집 초안의 스냅 상한(`max`)을 읽지 않는다 — 2026-10-03 → progress 2026-10-03 "편집 초안의 스냅 상한을 서버에서 배운다"
- **E-16** 대표 프레임 하나를 못 뽑으면 중복 비교의 위치가 어긋난다 — 2026-10-02 → progress 2026-10-02 "대표 프레임 해시의 자리"
- **E-17** 결과물이 원본의 위치 태그를 싣는다(무비 결과물에서 지움 — 배포본은 A-4 위치 항목으로) — 2026-10-07 → progress 2026-10-07 "무비 결과물이 찍은 곳을 싣고 나가지 않는다"
- **E-20** 사내 서버 오버레이만 바꾼 머지는 배포되지 않는다 — 2026-10-09 사내 서버 경로를 지우면서(`docker-compose.prod.yml` 삭제) 사라졌다 → progress 2026-10-09 "사내 서버를 접고 배포 대상을 AWS 하나로"(낡은 머리 주석은 G)
- **F** HDR · 장시간 · 10클립 스트레스 실검증 — 2026-09-15 → progress 2026-09-15 "스트레스 실검증과 HDR 색 태그 결함"(돌비비전 실물은 F 에 남음)
- **G** Firebase 서비스 계정 키 로테이션(루트 키 파일 없음 확인 포함) — 2026-08-11 → progress 2026-08-11 "Firebase 서비스 계정 키 로테이션"
- **G** 틱톡 Sandbox `client_key` 이력 노출 — 2026-08-11 제거하지 않기로 판정 → [sns-setup.md](./sns-setup.md) §3 "Sandbox client_key 의 이력 노출"
- **H-5** 배포 문서 두 개를 합칠지 — 2026-10-09 사내 서버를 접으며 `docs/deployment.md` 가 보관돼 [deployment-aws.md](./deployment-aws.md) 하나가 됐다 → progress 2026-10-09 "사내 서버를 접고 배포 대상을 AWS 하나로"
