# 미결 작업 백로그

> 저장소 전체의 **닫히지 않은 작업**을 모은 단일 목록이다. 항목이 여러 문서에 흩어져 있으면
> 하나를 닫아도 나머지가 낡으므로, 미결 항목은 이 문서에만 둔다.
> 이 문서만 읽어도 다음에 결정하거나 구현할 일을 빠짐없이 찾을 수 있어야 한다.
> 결정 문서(`docs/decisions/`)는 **확정된 결정의 배경과 기각한 대안**을 담고,
> 계획 문서(`docs/plans/`)는 착수 전 구현 제안을 담으며,
> 진행 기록([progress.md](./progress.md))은 **완료된 것**만 담는다.
>
> 각 항목은 `왜 막혀 있는지` + `무엇이 있으면 닫히는지(완료 조건)` 형식이다.
> 닫힌 항목은 본문을 지우고 문서 끝 [닫은 항목](#닫은-항목)에 한 줄만 남긴다. 번호는 재사용하지 않으며,
> 빠진 번호는 거기에 있다.

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
      ② 편집이 PATCH 된다 ③ 생성 → **완성 푸시가 한 번만** 오고 탭하면 그 무비가 열린다(cold start 포함 —
      Android 에서 FCM 과 expo-notifications 가 같은 탭을 둘 다 보고하는지, 중복 억제 창 2초)
      ④ 끝내기 → 결과물이 사라지고 초안으로 돌아온다 ⑤ 앱 삭제·재설치 → 로그인 → 무비 목록이 돌아온다 —
      **2026-09-27 통과**(Galaxy S22, [progress.md](./progress.md) 2026-09-27) ⑥ 계정 전환 → 다른 계정 무비가 보이지 않는다.
      **완료 조건**: 여섯 가지가 통과하면 MOV-2·17·18·19·NTF-6 의 "실기기 미검증" 표기를 지운다

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
      D-3 알림을 적었다). 완성 알림은 서버 FCM 이라(`services/movie-ready-notice.service.ts`) 문구를 서버가
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
  권장은 폐기하고 남용 방지 상한만 별도로 두는 것(결정 문서 §후속 판단). SNAP-9 가 미결로 표시 중
- [ ] **구독 만료·보관 정책 변경 때의 사전 고지** — 스냅 만료 예고(D-3 · D-1, KST 10시)는 정해졌지만
  ([decisions/expiry-notice-schedule.md](decisions/expiry-notice-schedule.md)), 사용자 구독이 끝날 때와
  우리가 보관 정책을 바꿀 때 언제 알릴지는 정해지지 않았다

경계 규칙상 **구독에 크레딧을 얹는 안은 검토 대상이 아니다**
([decisions/storage-and-subscription-policy.md](./decisions/storage-and-subscription-policy.md) §4.3).

**앱에 전달할 것**: 잔액·차감·402 의 형태는 계약([`contract/billing.ts`](../packages/shared-types/src/contract/billing.ts) ·
[`contract/movies.ts`](../packages/shared-types/src/contract/movies.ts))이 원천이다 — 무비 생성의 402 가 부족분
숫자를 싣지 못하는 결함은 E-9.

**완료 조건**: 위 수량·가격 확정 → `credit-policy.ts` 값 교체 → 양 스토어에 동일 상품 ID로
등록 + RevenueCat 프로젝트·웹훅 URL 연결 → 구독을 팔기로 하면 entitlement 반영(용량 한도를 남기기로
하면 그 집행 — 유예 → 읽기 전용 전이 포함) → 결제·편집 e2e 실검증.

### A-3. 스냅 내용 분석 — 구현 완료, 생산 활성화 대기

스키마·API·분석 워커·docker 배선은 2026-08-19 에 들어갔다([progress.md](./progress.md) 2026-08-19,
계획 대비 차이는 [decisions/snap-content-analysis.md](./decisions/snap-content-analysis.md) §9).

분석은 `POST /videos/:videoId/analysis` 로만 시작된다 — **업로드 시 자동 분석은 없다.**

**2026-09-27 실동작화 착수 결정**: 분석·추천 경로를 실제 모델로 돌리고 넓히는 순서는
[plans/snap-analysis-recommendation-rollout.md](./plans/snap-analysis-recommendation-rollout.md).
그 1·2단계의 미결이 이 항목에 있다. **첫 단계는 회사 OpenAI API 키(C-7)를 기다린다.**

- [ ] **실제 모델로 끝까지 한 번 돌리기** — C-7 선행. 개발 환경에서만 `MOVIE_RECOMMENDATION_ENABLED=true`,
      팀 스냅 30~100편으로 분석 → 추천 → 앱 병합까지 확인하고, 드러난 결함을 고친다(계획 §4.1).
      지금까지는 스텁 응답과 직접 만든 분석 행으로만 검증했다([progress.md](./progress.md) 2026-08-19)

**막힌 이유**: 생산 스냅에 켤 수 없다. 아래 항목이 남았다.

- [ ] **약관·개인정보처리방침의 분석 고지 확정** — 초안은 `routes/legal.ts` 에 있다. 법무 검토와 남은 확정
      항목(DPA · AWS 리전 · Apple·Google 취급 · Sentry 보관 기간 · 별도 동의 필요 여부)은 D-2 가 원천이다
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

### A-4. 스냅 서버 원천 전환의 미결 항목

[decisions/snap-source-of-truth.md](./decisions/snap-source-of-truth.md) 에서 결정을 마쳤으나 남은 판단:

- [ ] 위치(`place`) 정보의 서버 저장 여부 — 프라이버시/약관 검토 선행
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
- [ ] **스냅 휴지통(삭제 유예)** — soft delete + 유예 후 실삭제는 결정돼 있지만
      ([snap-source-of-truth.md](./decisions/snap-source-of-truth.md) §1) 스냅 삭제에는 구현되지 않았다.
      지금 서버는 삭제 즉시 파일을 지운다. reconcile 이 삭제를 모든 기기로 전파하므로
      ([snap-sync-across-devices.md](./decisions/snap-sync-across-devices.md) ①) 한 번의 실수 삭제가 모든
      기기에서 되돌릴 수 없게 된다
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
      법무 검토를 마친 약관·방침(D-2)과 운영 모델 고정(A-3). 켜지 않으면
      추천 경로에서 분석이 돌지 않는다
- [ ] **상한 값 재조정**: 추천 상한(REC-3, [specs/template-and-recommendation.md](./specs/template-and-recommendation.md))은
      잠정값이다. A-3 의 단가 실측이 나오면 `services/recommendation/recommendation-policy.ts` 의 숫자만 바꾼다
- [ ] **추천이 쓰이는 곳 결정** — 지금은 템플릿 슬롯에만 쓰인다. 선택지와 권장은
      [plans/snap-analysis-recommendation-rollout.md](./plans/snap-analysis-recommendation-rollout.md) §4.3.
      2026-08-31 개발자 회의의 "AI 추천 프로젝트"([meetings/2026-08-31-dev-sync.md](./meetings/2026-08-31-dev-sync.md) §5)가
      이 항목의 확장인지 별개 기능인지도 여기서 함께 정한다. A-3 의 실측 뒤에 정한다

**후속 후보(아직 열지 않음)**: 스튜디오의 템플릿 카드를 서버가 사용자 라이브러리 기준으로
정렬하는 안, `다른 조합`(같은 템플릿에 다른 외출 제안).

---

### A-7. 트렌드 숏폼 편집 — 타임라인 스펙 v3

현행 편집은 컷 + 프리셋 색보정 한 줄이 전부라, 틱톡·릴스형 브이로그가 요구하는
**비트 그리드 · 레이어 · 키프레임**을 `editSpec` v2 가 표현하지 못한다. 오픈소스를 더 붙여도
스펙이 "0.48초에 컷, 이 좌표에 스티커 300ms pop-in"을 담지 못하면 전달할 방법이 없다.
층별 설계·오픈소스 선정·라이선스 판정은
[plans/trend-editing-pipeline.md](./plans/trend-editing-pipeline.md),
스펙 v3 의 확정 결정은 [decisions/edit-spec-v3.md](./decisions/edit-spec-v3.md).

**진행 상황(2026-08-20)**: 스펙 v3 의 설계 결정이 확정됐고 공유 어휘 사전 3종(앵커 · 스테이지·시드 ·
재생성 무효화)이 구현·검증됐다 — [progress.md](./progress.md). **아래 미결은 그대로다** — 사전은
계약을 고정한 것이지 파이프라인을 구현한 것이 아니다.

v3 는 **Movie export 에 붙인다** — `POST /edit-jobs` 는 한 버전 공존 후 폐기하기로 했으므로
(A-1, [decisions/movie-export-policy.md](./decisions/movie-export-policy.md) ⑤) 두 곳에 붙이지 않는다.

**막힌 이유**: 선행 결정 둘(번인 자막·워터마크)과 음원·스티커 조달이 열려 있다.

- **번인 자막 전환은 FE 계약 변경** — 단어 단위 애니메이션은 ASS/libass 로만 되고, 그러면
  현행 mov_text 소프트 자막이 번인으로 바뀐다. 현행 동작("플레이어에서 켜야 보인다")은 계약
  `subtitles` 설명([`contract/edit-jobs.ts`](../packages/shared-types/src/contract/edit-jobs.ts))과
  MOV-9 가 안내한다. 새 라이브러리는 0이지만 **결정 문서가 선행**이다
- **워터마크 결정이 레이어 설계 입력** — A-2에서 넣기로 하면 v3 `layers` 가 표현해야 한다
- **BGM 음원이 없다** — `assets/bgm/` 에 README 뿐이라 비트 싱크·덕킹·무드 매칭이 전부 검증
  불가다. 확보는 F 의 "실BGM 기준 whisper 자막 인식 재확인"의 선행이기도 하다
- **스티커 에셋도 없다** — 배치 코드가 있어도 아트가 없으면 검증할 게 없다

**결정할 것**

- [ ] 번인 자막으로 전환할 것인가 — [decisions/subtitle-rendering.md](./decisions/subtitle-rendering.md)(미결)
- [ ] BGM 을 어디서 확보할 것인가(AI 생성 음원 포함)와 예산 — [decisions/bgm-sourcing.md](./decisions/bgm-sourcing.md)(미결)
- [ ] `bgm_tracks` 스키마 신설 — `schema.prisma` 는 공유 파일이라 [team.md](./team.md) §2·§3 적용
- [ ] **스티커 팩 매니페스트 스키마** — 에셋 URL·앵커 적합성·무드 태그·스케일 범위·기본 모션.
      뒤로 미룰수록 마이그레이션 비용이 커진다(trend-editing-pipeline §8.3).
      **설계는 확정됐다**(edit-spec-v3 결정 C·D) — 앵커 어휘는 이미 공유 사전에 있고, 남은 것은
      매니페스트 본문을 저장소에 들이는 일이다. 폰트는 woff2 가 아니라 TTF/OTF 여야 한다
- [ ] 스티커를 어디서 확보할 것인가(디자이너 커미션 여부와 스타일 방향) —
      [decisions/sticker-asset-sourcing.md](./decisions/sticker-asset-sourcing.md) 결정 1(미결)
- [ ] 스티커를 어떤 경로로 등록·관리할 것인가(관리자 페이지 도입 여부) — 같은 문서 결정 2(미결)
- [ ] **세이프 에어리어 실측값** — 상단 약 10%·하단 약 20%·우측 버튼 레일은 추정치다.
      실기기 캡처가 필요하다. 값은 스펙에 굽지 않고 **버전드 팩**으로 둔다(edit-spec-v3 결정 B-3) —
      스펙에 값으로 넣으면 플랫폼 UI 가 바뀌어도 이미 저장된 스펙을 못 고친다
- [ ] **에셋 라이선스에 영구(perpetual) 조항을 필수로 걸 것인가** — 근거는 **다시 만들기가
      계속 가능하다**는 것이다([movie-cleanup-after-export.md](./decisions/movie-cleanup-after-export.md):
      프로젝트는 보존되고 유료로 다시 생성한다). 라이선스가 만료돼 에셋 서빙을 멈추면 사용자는 예전
      프로젝트를 **돈을 내고도** 다시 만들 수 없게 된다. 구독형 BGM 라이선스(Epidemic·Uppbeat 등)는 대개 "구독 기간 중
      제작한 콘텐츠는 이후에도 사용 가능" 구조지만, **만료 후 재렌더가 "기존 콘텐츠 사용"인지
      "신규 제작"인지**가 계약서마다 다를 수 있다. 법률 판단이 필요하고 스키마로는 풀리지 않는다.
      조달 단계에서 **"신규 배포 중단 / 기존 저작물 유지" 분리 조항**을 협상 항목으로 올린다.
      이 조항이 확보되면 팩 상태를 셋(`experimental → active → deprecated`)으로 줄이고
      `retired` 를 법적 차단 전용으로 좁힌다(edit-spec-v3 결정 C-2)

**완료 조건**: 위 선행 결정·조달 확정 → `editSpec` v3 확정 → `bgm_tracks` + 오프라인 비트 그리드 →
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

---

## B. 개발 합의 필요 (A·B 트랙 공동 소유)

### B-1. 배포 — 사내 서버 가동 ★

**2026-09-15 방향 결정**: **사내 물리 서버**에 docker compose 로 올린다. 고른 이유는
[decisions/on-prem-deployment.md](./decisions/on-prem-deployment.md), 절차·시크릿·배치는
[deployment.md](./deployment.md). 사내망 전용이라 실사용자는 받을 수 없고 팀 공용 통합 서버가 된다 —
외부에서 우리를 불러야 하는 SNS 게시·결제 웹훅·광고 검증은 mock 이다(deployment.md §0).

저장소 쪽 준비(운영 compose 오버레이 · self-hosted runner 배포 잡 · 배치 cron · DB 백업)는 끝났다.
**남은 것은 서버에서 하는 일**이다(단계는 deployment.md §1):

- [ ] **`서버작업`** Docker 설치 · `snaply` 계정 · 저장소 체크아웃(`/opt/snaply`)
- [ ] **`서버작업`** 시크릿 파일 `/etc/snaply/snaply.env` 작성 (개발 기본 자격증명 금지)
- [ ] **`서버작업`** self-hosted runner 설치 — 라벨에 `snaply` 포함, 서비스로 등록
- [ ] **`서버작업`** `deploy/batches.cron` 등록 · 로그·백업 디렉터리 생성
- [ ] **`서버작업`** 저장소 Variables 에 `DEPLOY_ENABLED=true` → 첫 배포 확인
- [ ] **DB 백업의 외부 보관** — 지금 덤프는 같은 서버에 쌓인다. 서버가 통째로 죽으면 함께 사라진다
- [ ] **실사용 서버** — 사내망 전용이라 이 서버로는 사용자를 받을 수 없다. 외부 접속이 되는
      곳이 생기면 고정 도메인(D-1)과 SNS·결제·광고 mock 해제만 추가하면 된다

**API 만 띄우면 안 된다** — 상주 프로세스와 스케줄 배치를 하나라도 빠뜨리면 배포는 성공하고 에러도 없이
알림이 영영 안 가거나 파일이 무한히 쌓인다. 특히 만료 예고가 빠진 채 정리만 돌면 사용자가 예고 없이
영상을 잃는다. 배치 시각과 "예고와 정리를 같은 시각에 묶지 않는다"는 규칙은 [deployment.md](./deployment.md) §3,
만료 예고가 FCM 서비스 계정 없이는 시작하지 않는 것은 §5 가 원천이다.

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

**완료 조건**: email 이 필요한 기능이 생기면 공동 소유 합의 후 추가하고 닫는다. 그런 기능이 없다고
판단되면 추가 없이 닫는다.

### B-4. `notification_logs` 보관 정책

geofence 쿨다운 판정용 이력이 무한히 쌓인다. 쿨다운은 30분 기준이라 그보다 오래된 행은
조회에 쓰이지 않는다.

**2026-09-11 이후 만료 예고 행도 여기 쌓인다**(`kind = snap_expiry`). 다만 성격이 다르다 —
이쪽은 "이 스냅의 D-3 을 보냈는가" 를 판정하는 **유일한 근거**라, 스냅이 살아 있는 동안은
지우면 안 된다(지우면 예고가 다시 나간다). 스냅이 purge 되면 FK Cascade 로 함께 사라지므로
방치해도 무한히 쌓이지는 않는다. 보관 정책을 정할 때 두 종류를 같은 기준으로 묶지 말 것.

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

### B-6. 앱의 알림 설정을 서버에 쓰기

서버는 종류별 알림 설정을 받는다(`PATCH /auth/me`, 종류별로 나눈 이유는
[decisions/notification-preferences.md](./decisions/notification-preferences.md)). 닫힌 서버 쪽은 [닫은 항목](#닫은-항목).

- [ ] **`앱`** 설정 화면의 스위치를 `PATCH /auth/me` 로 쓰기. 지금은 기기 저장만이라 서버
      발송에 닿지 않는다. **조용한 시간도 서버로 보내야 실제로 억제된다** — 현재 앱의 조용한
      시간 UI 는 아무것도 억제하지 않는다

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
RevenueCat 프로젝트·웹훅 URL 설정 → sandbox 구매 → 웹훅 수신 → 크레딧 지급 →
같은 트랜잭션 웹훅 재전송 시 중복 지급 없음까지 한 번 통과하면 닫힌다.

**구독 상품은 A-2 결정 뒤다.** 무엇을 팔지(용량인지 보관 기간인지)부터 미확정이다(A-2).
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

**완료 조건**: 앱 심사로 `video.publish` 승인 → `.env` 한 줄만 변경
```bash
TIKTOK_SCOPES=user.info.basic,video.publish
```
엔드포인트는 코드가 자동 분기한다(`/inbox/video/init/` → `/video/init/`).
  `requiresUserAction` 이 응답에서 사라지므로 **모바일 안내 문구도 함께 정리**해야 한다
([api-spec.md](./api-spec.md) SNS 연동 절).

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

### C-7. 회사 OpenAI API 키 발급 — 스냅 분석 실측의 선행 조건 ★

**막힌 이유**: 분석 워커는 `OPENAI_API_KEY` 가 없으면 기동 단계에서 스스로 종료된다(의도된 동작).
로컬 `apps/api/.env` 에 키가 없어서, 분석·추천 경로를 실제 모델로 끝까지 돌린 적이 한 번도 없다.
이 키가 [스냅 분석 추천 계획](./plans/snap-analysis-recommendation-rollout.md)의 1단계(A-3 "실제 모델로
끝까지 한 번 돌리기")를 막고 있다. **개인 키가 아니라 회사 키**여야 한다 — 팀 스냅 프레임이 외부로
나가고, 비용·데이터 보관 조건이 회사 계정 기준이어야 D-2 의 법무 검토(DPA·보관 기간)와 맞는다.

**받을 때 확인할 것**
- 회사 조직 안의 프로젝트 키로 받는다. 개발용과 운영용을 분리하면 운영 배포(B-1) 때 개발 키를
  폐기하지 않고 운영 키만 주입하면 된다
- 그 프로젝트가 분석 모델(`OPENAI_VISION_MODEL`, 기본값 `gpt-5.6-luna` 는 잠정값)과 비교할 저비용
  모델 하나에 접근할 수 있는가 — 1단계가 두 모델을 비교한다
- 프로젝트 사용 한도(예산 상한)를 걸 수 있는가 — 실측 중 비용이 새지 않게 한다
- rate limit 등급 — `VIDEO_ANALYSIS_CONCURRENCY`(기본 3)를 얼마나 올릴 수 있는지의 상한이다
- 데이터 보관: 워커는 `store: false` 로 보낸다. 남는 것은 남용 모니터링 로그 보관(공개 문서 기준 최대
  30일)이며, ZDR 승인 가능 여부는 D-2 법무 항목의 입력이다
- 키는 커밋하지 않는다. 로컬은 `apps/api/.env`, 사내 서버는 `/etc/snaply/snaply.env`(B-1)에 둔다

**완료 조건**: 키를 `apps/api/.env` 에 넣고 `docker compose up -d analysis-worker` 가
`video-analysis 워커 시작` 로그를 남긴 뒤, 팀 스냅 1건의 `POST /videos/:videoId/analysis` 가
`video_analyses.status=done` 으로 끝나면 닫힌다. 그 뒤의 실측은 A-3 이 맡는다.

---

## D. 운영 전환 시

### D-1. 고정 도메인

현재 로컬 검증은 cloudflared 임시 터널(`*.trycloudflare.com`)을 쓴다.
**재시작하면 주소가 바뀌고, 그때마다 인스타·틱톡 콘솔의 리디렉션 URI 와
URL prefix 소유권 검증을 다시 등록해야 한다.**

`snaply.com` / `snaply.co` 는 제3자 소유이고 Cloudflare 가 아니라 named tunnel 을 쓸 수 없다
(NS: linode.com). 보유 도메인이 생기면 쓸 절차: [local-tunnel.md](./local-tunnel.md) §6.

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
법률 검토를 받지 않은 출시 전 초안**이다(페이지 상단에도 표기). 아직 출시 전이므로 약관 "개정" 절차
(사전 공지·재동의)는 필요 없다 — 정식 문서화에 합친다. 남은 것(`routes/legal.ts` 상단 주석에도 적혀 있다):

- [ ] **분석 고지** — 스냅 분석(A-3)을 생산 스냅에 켜기 전에 확정한다
  - 사업자·모델 확정 (지금 문서는 OpenAI 전제, `OPENAI_VISION_MODEL` 은 잠정값 — A-3 "운영 모델 고정")
  - [ ] **계약 문구 대조와 DPA 체결** — 보유 기간·학습 이용은 공개 문서로만 확인했다. ZDR 승인을
    받으면 보관 기간을 "없음" 으로 바꿀 수 있다
  - [ ] **AWS 리전 확정** — `AWS_REGION=ap-northeast-2`(서울) 기준으로 "국외 이전 아님"이라고 적었지만
    운영 배포 전이라 의도값이다. 배포 시 실제 리전과 CloudFront 사용 여부(엣지는 전 세계)로 확정한다
  - [ ] **Apple·Google 취급의 법무 확인** — 우리가 직접 보내지 않아 표가 아니라 문장으로 관계만 적었다
  - [ ] **Sentry 보관 기간** — 요금제(무료 30일 / 유료 90일)가 정해지면 좁힌다
  - [ ] **별도 동의가 필요한가**(법무 판단) — "필요"로 나오면 옵트인 UI 와 미동의 폴백이 새 작업이다
    ([snap-content-analysis.md](./decisions/snap-content-analysis.md) §6 의 기각이 다시 열린다)
- [ ] **광고(AdMob)가 법률 문서에 없다** — 앱은 `react-native-google-mobile-ads` 로 보상형 광고를 띄우는데
      수집 항목·위탁·국외 이전 어디에도 광고가 없다. 광고 SDK 는 광고 식별자와 기기 정보를 Google 로 보내므로
      세 곳 모두에 들어가야 한다. 어떤 식별자가 실제로 나가는지는 맞춤 광고 설정과 동의(UMP) 처리 방식에
      달렸으므로 그 정책을 먼저 정하고 쓴다. 스토어 신고(App Store 개인정보·Play 데이터 안전성)는 C-6
- [ ] `LEGAL_CONTACT_EMAIL` 이 미설정이면 `support@snaply.app` 로 표시된다 — 실제 주소로 교체

**완료 조건**: 법무 검토를 거친 정식 문서로 교체하고 페이지 상단의 "출시 전 초안" 배너를 걷는다.

### D-3. URL prefix 소유권 검증 재등록

운영 도메인(D-1)이 정해지면 틱톡 URL prefix 소유권 검증을 그 호스트로 다시 등록한다. 검증할 prefix 두 곳
(API 호스트 `/legal/` · 미디어 호스트 `/snaply-dev/`)과 서빙 방식·서명 발급 단위의 실측은
[sns-setup.md](./sns-setup.md) §3 "URL prefix 소유권 검증". 운영에서 CloudFront 도메인 하나로 합쳐지면
검증도 한 번으로 줄어든다. 운영에서도 **검증 파일 경로만은 익명 읽기**여야 한다 — 개발용
`npm run dev:public-bucket` 은 로컬 MinIO 전용이라(`S3_ENDPOINT` 없으면 실행 거부) 운영에서는 쓰지 않는다.

**완료 조건**: 운영 도메인에서 필요한 prefix 가 검증되고, 그 도메인의 영상 URL 로 PULL_FROM_URL 업로드가
`403 URL ownership` 없이 통과한다.

### D-5. 만료된 광고 보상 세션 정리 배치

`ad_rewards` 의 만료 확정은 **조회 시점 lazy** 다([decisions/ad-reward-credits.md](./decisions/ad-reward-credits.md) §4-1).
다시 들어오지 않는 사용자의 세션은 `pending` 으로 남는다. 상태 오독을 만들지는 않지만
(그 사용자가 다시 오면 그 자리에서 확정된다) 행이 계속 쌓인다.

**지금 하지 않는 이유**: 크레딧이 아니라 행만 늘고, 상한도 "진행 중 1개 + TTL 300초"가 정한다
(사용자당 하루 최대 288행). 실사용 규모에서 실제로 문제가 되면
`orphan-video-cleanup` 과 같은 방식의 배치를 붙인다.

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

### E-7. MinIO 커뮤니티 이미지의 수명 — 로컬·CI·사내 서버 스토리지 대체 검토 ⚠️

MinIO 커뮤니티 에디션은 이미지 배포를 멈췄고(Docker Hub 이미지 삭제, quay.io 익명 pull 차단) 유료 AIStor 로
대체되는 중이다. 지금은 같은 릴리스(`RELEASE.2025-09-07T16-13-09Z`)를 아카이브된 소스에서 빌드한 GHCR 미러를
쓴다 — [`deploy/minio/Dockerfile`](../deploy/minio/Dockerfile) · [`minio-image.yml`](../.github/workflows/minio-image.yml) ·
받지 못하면 로컬 빌드하는 [`scripts/ensure-minio-image.sh`](../scripts/ensure-minio-image.sh)
([progress.md](./progress.md) 2026-09-25). 태그를 올릴 때는 amd64·arm64 매니페스트를 둘 다 확인한다
(`.hotfix.*` 태그는 amd64 만 있어 Apple Silicon 에서 pull 이 실패한다).

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

### E-9. 무비 생성의 402 가 부족분 숫자를 싣지 못한다

무비 생성 `POST /movies/{id}/export` 의 402 응답 스키마가 `apiErrorSchema` 라
(`packages/shared-types/src/contract/movies.ts:241`) `INSUFFICIENT_CREDITS` 의 `required`·`balance` 가
응답에서 빠진다. 두 필드는 `POST /edit-jobs` 의 `paymentRequiredErrorSchema`(`contract/edit-jobs.ts:151`)에만
선언돼 있고, 선언되지 않은 키는 응답 직렬화에서 지워진다(`contract/common.ts` 의 `apiErrorWith` 주석).
서버는 값을 싣는다(`apps/api/src/services/credit.service.ts:105`). 그래서 앱은 부족분 숫자 없이 일반
문구만 보인다 — `features/compose-movie/lib/read-credit-shortfall.ts` 는 두 필드가 없으면 숫자를 그리지 않는다.

**완료 조건**: export 의 402 를 `paymentRequiredErrorSchema` 로 선언 · `apps/api/test/movies.test.ts` 에 402
`required`·`balance` 단언 추가 · `npm run openapi:write -w apps/api` 로 스냅샷 재생성 · `npm test -w apps/api` 통과.

---

## F. 남은 실검증

- [ ] **돌비비전 실물 원본으로 HDR 경로 확인** — 스트레스 검증(2026-09-15)의 HDR 수정은 합성 HDR10 으로만
      확인했다. 실제 DV 원본이 생기면 편집 결과물과 렌디션 모두 다시 확인한다(아이폰 원본은 A-4 "iOS 출시 전"과
      같은 공백)
- [ ] 실BGM 기준 whisper 자막 인식 재확인 (현재는 dev BGM 기준으로만 확인)

---

## G. 정리 필요 (일회성)

- [ ] **인스타 연동 재연동** ⚠️ — 현재 저장된 연동은 `token_expires_at` 이 **`null`** 이다(개인 계정
      시절 장기 토큰 교환이 실패한 흔적). 이 토큰은 **조용히 만료되고** 그 뒤 게시가 실패한다.
      `GET /sns/instagram/connect` → 승인 한 번이면 60일짜리 만료 시각이 채워진다. 계정이
      프로페셔널로 바뀌어 실패 원인은 사라졌다. 코드 쪽 대응은 E-1 에서 끝났지만(다음 게시 때
      서버가 갱신을 시도해 만료 시각을 알아낸다) **이미 만료된 뒤라면 갱신도 실패**하므로
      재연동이 확실한 길이다
- [ ] **테스트 게시물 정리** — 인스타 릴스는 API 로 삭제할 수 없으므로 앱에서 수동으로 지운다.
      **틱톡 받은함 초안 3건은 지우지 않는다** — C-2("API 는 ok 인데 알림 미도착")의 유일한 증거물이라
      C-2 가 닫힌 뒤에 정리한다.

---

## 닫은 항목

닫힌 항목의 한 줄 색인이다 — 같은 일을 다시 올리지 않기 위해 둔다. 구현·검증 내역은
[progress.md](./progress.md)의 같은 날짜 항목이 원천이다.

- **A-1** 무비 서버 엔티티 · CRUD · export — 2026-09-09 → progress 2026-09-09 "촬영 시각 저장 · 무비 서버 엔티티"
- **A-1** 스냅 15일 · 결과물 30일 만료 정리 배치(툼스톤, 만료 → 실삭제 2단계) — 2026-09-09 → progress 2026-09-09 "보관 기간 만료 정리 배치"
- **A-1** 무비 완성 알림의 FCM 전환 — 2026-09-11 → progress 2026-09-11 "무비 완성 알림의 서버 전환"
- **A-1** e2e 를 앱과 같은 무비 경로로 — 2026-09-11 → progress 2026-09-11 "이미지 스모크 검사 · e2e 무비 경로 전환"(실제 아이폰 영상은 2026-09-15 "스트레스 실검증")
- **A-1** 앱의 무비 서버 전환 · 끝내기 버튼 · 로컬 완료 알림 제거 · 모바일 기능 문서 — 2026-09-12 → progress 2026-09-12 "무비 서버 전환 · 끝내기 · 완료 알림 정리"
- **A-1** 푸시 탭 라우팅 — 2026-09-12 → progress 2026-09-12 "알림 탭 라우팅"(실기기 확인은 A-1 "서버 전환 실기기 검증" ③)
- **A-1** 스냅 목록의 만료 표시 — 2026-09-27 → progress 2026-09-27 "스냅이 기기와 재설치를 넘어 보인다"
- **A-2** 광고 보상 정책 값(20크레딧 · 일일 5회 · 쿨다운 300초 · 세션 TTL 300초) — 2026-08-18 → progress 2026-08-18 · [ad-reward-credits.md](./decisions/ad-reward-credits.md) §7
- **A-2** 스냅 만료 예고 리드타임(D-3 · D-1, KST 10시) — 2026-09-09 → [expiry-notice-schedule.md](./decisions/expiry-notice-schedule.md) · progress 2026-09-09 "SNS 게시 자동 끝내기 · 만료 예고 알림"
- **A-3** 분석 고지의 보유 기간 · 학습 이용 확인과 국외 이전 표의 수탁자 — 2026-08-19 → progress 2026-08-19 "약관·개인정보처리방침의 분석 고지 초안"
- **A-4** `capturedAt` 전달 · 저장(SNAP-10) — 2026-09-09 → progress 2026-09-09 "촬영 시각 저장 · 무비 서버 엔티티"
- **A-4** 삭제 유예 기간 30일(계정 삭제에 먼저 적용) — 2026-08-12 → [account-deletion.md](./decisions/account-deletion.md) · progress 2026-08-12 "계정 삭제 기능"
- **A-4** 2단계 ingest 렌디션 — 2026-09-09 → progress 2026-09-09 "배포 렌디션 워커"
- **A-4** 촬영 스냅 해상도 하드코딩 해소(앱) — 2026-09-12 → progress 2026-09-12 "촬영 스냅 해상도 하드코딩 해소"(실기기 확인은 A-4 에 남음)
- **A-4** reconcile 착수 전 제품 결정 셋 — 2026-09-27 → [snap-sync-across-devices.md](./decisions/snap-sync-across-devices.md)
- **A-4** 3단계 reconcile(구현 · Android 실기기 검증) — 2026-09-27 → progress 2026-09-27 "스냅이 기기와 재설치를 넘어 보인다" · "스냅 reconcile 실기기 검증"
- **A-5** FE-BE 연동 범위 · 일정 확정 — 2026-09-02, 같은 개발자가 FE·BE 를 함께 맡게 되어 따로 둘 이유가 없어졌다
- **A-7** CI 의 ffmpeg 설치(골든 프레임 · ffprobe 계약 테스트) — 2026-09-15 → progress 2026-09-15 "산출물 계약 테스트와 CI 의 ffmpeg"
- **B-5** API 계약 스키마 우선 1~5단계 — 2026-09-05 → progress 2026-09-05 · [api-contract-schema-first.md](./decisions/api-contract-schema-first.md)(남은 다듬기는 B-5)
- **B-6** 알림 설정의 서버 반영(서버) — 2026-09-15 → progress 2026-09-15 "알림 설정이 서버에 닿는다"(앱은 B-6 에 남음)
- **D-4** 개발 버킷 익명 읽기 정책 — D-3 에 합쳤다(운영의 검증 파일 경로 익명 읽기)
- **E-1** 만료 시각을 모르는 인스타 토큰의 코드 대응 — 2026-09-15 → progress 2026-09-15 "만료 시각을 모르는 SNS 연동"(재연동은 G)
- **E-2** `S3_PUBLIC_ENDPOINT` 기동 경고 — 2026-09-11 → progress 2026-09-11 "이미지 스모크 검사 · e2e 무비 경로 전환"
- **E-3** S3 삭제 실패분 정리 배치 — 2026-09-09 → progress 2026-09-09 "보관 기간 만료 정리 배치" ③
- **E-4** 빌드한 이미지의 스모크 검사(빌드 → 스모크 → 푸시) — 2026-09-11 → progress 2026-09-11 "이미지 스모크 검사 · e2e 무비 경로 전환"
- **E-6** 낡은 Prisma 클라이언트 프리체크 — 2026-09-09 → progress 2026-09-09 "촬영 시각 저장 · 무비 서버 엔티티" ②
- **E-8** 영상 삭제·정리가 자기 소유 객체만 지운다 — 2026-09-27 → progress 2026-09-27 "영상 삭제가 자기가 소유한 객체만 지운다"
- **F** HDR · 장시간 · 10클립 스트레스 실검증 — 2026-09-15 → progress 2026-09-15 "스트레스 실검증과 HDR 색 태그 결함"(돌비비전 실물은 F 에 남음)
- **G** Firebase 서비스 계정 키 로테이션(루트 키 파일 없음 확인 포함) — 2026-08-11 → progress 2026-08-11 "Firebase 서비스 계정 키 로테이션"
- **G** 틱톡 Sandbox `client_key` 이력 노출 — 2026-08-11 제거하지 않기로 판정 → [sns-setup.md](./sns-setup.md) §3 "Sandbox client_key 의 이력 노출"
