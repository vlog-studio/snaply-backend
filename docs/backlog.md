# 미결 작업 백로그

> 저장소 전체의 **닫히지 않은 작업**을 모은 단일 목록이다. 항목이 여러 문서에 흩어져 있으면
> 하나를 닫아도 나머지가 낡으므로, 미결 항목은 이 문서에만 둔다.
> 이 문서만 읽어도 다음에 결정하거나 구현할 일을 빠짐없이 찾을 수 있어야 한다.
> 결정 문서(`docs/decisions/`)는 **확정된 결정의 배경과 기각한 대안**을 담고,
> 계획 문서(`docs/plans/`)는 착수 전 구현 제안을 담으며,
> 진행 기록([progress.md](./progress.md))은 **완료된 것**만 담는다.
>
> 각 항목은 `왜 막혀 있는지` + `무엇이 있으면 닫히는지(완료 조건)` 형식이다.
> 마지막 정리: 2026-08-12 (출처: 구 `integrations-backlog.md`, `plan-limits.md` §5,
> `snap-source-of-truth.md` §7, `progress.md` 남은 것, `meetings/next-agenda.md`)

---

## A. 기획/제품 결정 대기

가장 앞단의 병목. 아래가 정해지지 않으면 구현을 시작할 수 없다.

### A-1. 영상 묶음(프로젝트) 구조 ★ 최우선

**결정됨**: 영상은 평면으로 보관하고, 편집할 클립을 참조하는 엔티티는 **`Movie`** 로 둔다.
3안 비교와 채택 근거는 [decisions/movie-model.md](./decisions/movie-model.md).

**남은 판단**: ① 내보내기 시 클립 순서 기본값 ② 재내보내기 정책(누적 vs 교체)
③ Movie 삭제 시 참조 영상 처리 ④ 날짜 기반 자동 그룹핑의 도입 범위
⑤ 기존 `POST /edit-jobs` 직접 편집 API의 공존·폐기 시점.
`capturedAt` 수집은 결정 완료이며 스냅 서버 원천화 1단계에서 구현한다. 위치 정보 저장
여부는 이 항목과 분리해 A-4에서만 관리한다.

**완료 조건**: 남은 세부 정책 확정 → `Movie` 스키마 PR → CRUD → export → e2e 실검증.

무비 파일의 **30일 보관 후 만료**와 만료분의 **크레딧 없는 무료 재생성**은 이 항목에서
함께 구현한다 —
[decisions/storage-and-subscription-policy.md](./decisions/storage-and-subscription-policy.md) §3.
재생성의 원천은 이미 영구 저장되는 `EditJob.editSpec`/`renderSpec`이라 추가 스키마가 필요 없다.
S3 삭제 실패분은 E-3의 정리 배치 경로를 쓴다.

### A-2. 크레딧 결제 세부 정책 확정

**결정됨**: 정기 구독과 Free/Standard/Premium 플랜을 제거하고, 무비 생성을 크레딧으로
과금한다. 근거와 전환 원칙은
[decisions/credit-payment-model.md](./decisions/credit-payment-model.md).
결제 채널은 Apple/Google IAP + RevenueCat
([decisions/payment-channel-iap.md](./decisions/payment-channel-iap.md)).

2026-08-14에 스토리지·구독 정책이 결정됐다 —
[decisions/storage-and-subscription-policy.md](./decisions/storage-and-subscription-policy.md).
Free 원본 스냅 한도 **2GB**(5GB에서 축소), 무비 서버 보관 **30일**(만료 후 크레딧 없이 무료
재생성), 보관 축의 **구독 상품 도입**과 "구독은 크레딧을 지급하지 않는다"는 경계 규칙이
확정됐다.

**2026-08-14 확정**: 기본 단위는 **Movie export 1회 = 100크레딧**이다. 100 단위를 쓰는 이유는
광고 보상·가입 보너스·프로모션처럼 지급 사유가 늘어날 때 정수 단위로 조절하기 위해서다.
**이 단위는 바꾸지 않는다** — 바꾸면 이미 지급된 잔액을 전부 리스케일해야 한다.

**2026-08-14 구현 완료**: 크레딧 원장(`credit_ledger`)·스토어 거래 원장(`purchases`),
RevenueCat 웹훅의 멱등 지급·환불 회수, `/billing/products`·`/billing/credits`·`/billing/sync`,
export 예약/환급, 레거시 Stripe·`subscriptions` 제거가 반영됐다
([progress.md](./progress.md) 2026-08-14). 아래 미결 항목은 **코드가 아니라 값**이며,
`apps/api/src/services/billing/credit-policy.ts` 의 숫자만 교체하면 닫힌다.

**결정할 것 — 크레딧(생성 축)**:
- 크레딧 팩별 **수량과 가격** (현재 500 / 1,200 / 3,000 은 잠정값이며 스토어 미등록)
- 크레딧 유효기간 (권장: 구매 크레딧은 만료 없음)
- **가입 보너스 수량** (현재 `CREDIT_SIGNUP_BONUS` 기본 0 = 지급 안 함)
- 프로모션·운영 보상 지급 기준
- 고해상도 export의 추가 차감 여부 (현재 전 export 동일 100)

**광고 보상 — 미결 값 없음(2026-08-18 전부 확정)**: 지급 경로·검증 규칙·정책 값이
[decisions/ad-reward-credits.md](./decisions/ad-reward-credits.md) §7에서 확정됐고 구현·테스트가
끝났다. **A-2에서 광고 보상은 닫혔다.** 실제 지급은 C-6(AdMob 콘솔 설정)에만 막혀 있다.
- 보상 크레딧 **20** · 일일 한도 **5** · 쿨다운 **300초** · 세션 TTL **300초** · 만료 **없음**
- 두 관계를 깨지 않는다(테스트가 잡는다): `20 × 5 = export 1편`,
  `세션 TTL ≤ 쿨다운`. 어느 값이든 혼자 바꾸면 정책 의미가 조용히 달라진다
- 다시 열릴 조건은 **파일럿 실측**뿐이다. 원가·eCPM 실측은 아직 없고, 광고 순매출이 20원을
  밑돌면 한도가 아니라 **보상량을 먼저 내린다** — 한도 인하는 되돌릴 수 없는 혜택 축소다
- 출처별 버킷·차감 우선순위는 v1 범위 밖이며, 필요해지면 별도 결정 문서로 다룬다

**결정할 것 — 구독(보관 축)**: 용량 티어와 가격 · 연 구독 여부 · 구독 혜택에 워터마크
제거·고해상도 export를 포함할지 · 무비 만료 알림 발송 시점.
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

- [ ] **약관 개정·제3자 제공 고지** — 사용자 프레임이 외부 모델 제공자로 나가는 처리다.
      이것 없이 생산 스냅에 켜지 않는다 (결정 문서 §6)
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
- [x] 삭제 유예 기간 값 — **30일 확정**, 계정 삭제에 먼저 적용
      ([decisions/account-deletion.md](./decisions/account-deletion.md))
- [ ] egress 비용 실측 후 렌디션 기본 다운로드 정책 재평가
- [ ] 앱 선행 과제: 촬영 스냅 해상도 하드코딩(1080×1920) 해소 — 틀린 값이 서버 원천이 되면 백필 불가

### A-5. FE-BE 연동 범위·일정 확정

FE 담당 개발자가 백엔드 저장소의 문서·환경설정·API/worker 작업에도 직접 참여하기 시작했으므로,
이 항목을 별도 외부 팀에 대한 **FE 의존**으로 취급하지 않는다. 기능별로 FE 변경, BE 변경,
통합 검증을 나누고 같은 개발자가 양쪽 작업을 맡는 것도 허용한다.

다만 FCM 실기기 검증(C-4), SNS 사용자 안내, `capturedAt`·실제 해상도 전달처럼 앱이나
실기기가 있어야 닫히는 작업은 여전히 FE-BE 연동 순서가 필요하다. 위치 정보는 A-4에서 저장이
결정된 경우에만 전달 범위에 포함한다.

**완료 조건**: [meetings/next-agenda.md](./meetings/next-agenda.md) §4에서 기능별 FE 변경·BE 변경·
구현 담당·통합 검증일을 확정하고, 실기기 필요 항목은 검증 기기와 담당자까지 지정한다.

---

### A-6. 템플릿 기반 스냅 자동 추천 — 백엔드 완료, 앱 연동·활성화 대기

템플릿으로 무비를 시작할 때 슬롯에 들어갈 스냅을 분석 결과 기반으로 고른다. A-3의 후속 항목이며
방향·기각안은 [decisions/template-snap-recommendation.md](./decisions/template-snap-recommendation.md).

**2026-08-19 완료 (백엔드 1·2단계)**: 카탈로그를 서버로 옮기고(`movie_templates`,
`GET /movie-templates`) 추천 API 를 붙였다(`movie_recommendations`,
`POST`/`GET /movie-recommendations`, 규칙 기반 점수화, 후보 12개·최근 24시간 20회 상한).
검증 내역은 [progress.md](./progress.md).

**남은 것**
- [ ] **앱 연동**: 카탈로그 원격화(캐시 + 내장 폴백), 로컬 매칭 위에 서버 결과를 얹는 2단계
      병합, `NN%` 의 의미 변경에 따른 문구. 사용자가 뺐거나·직접 찍었거나·순서를 바꾼 슬롯은
      덮지 않는다
- [ ] **활성화**: `MOVIE_RECOMMENDATION_ENABLED` 는 **기본 꺼짐**이다. 켜는 조건은 A-3 과 같다 —
      약관 개정·제3자 제공 고지·운영 모델 고정. 켜지 않으면 추천 경로에서 분석이 돌지 않는다
- [ ] **상한 값 재조정**: 후보 12개·24시간 20회는 잠정값이다(결정 문서 §4). A-3 의 단가 실측이
      나오면 `services/recommendation/recommendation-policy.ts` 의 숫자만 바꾼다

**후속 후보(아직 열지 않음)**: 스튜디오의 템플릿 카드를 서버가 사용자 라이브러리 기준으로
정렬하는 안, `다른 조합`(같은 템플릿에 다른 외출 제안). 둘 다 앱 연동이 끝난 뒤에 판단한다.

---

## B. 개발 합의 필요 (A·B 트랙 공동 소유)

### B-1. 배포 인프라 결정 ★

**막힌 이유**: 후보(Fly / Render / ECS 등)가 확정되지 않았다.
`.github/workflows/deploy.yml` 은 `DEPLOY_ENABLED` 게이트로 준비돼 있고,
워커 이미지는 검증 완료([progress.md](./progress.md) 실검증 라운드 2)라 결정만 되면 배포 가능하다.

**결정 후 할 일**: [`apps/api/src/env-spec.ts`](../apps/api/src/env-spec.ts) 에서
`origin !== 'local'` 인 항목을 그 플랫폼의 시크릿에 넣고 `deploy.yml` 의 Deploy 스텝을 연결한다.
현재 deploy.yml 이 정의하는 시크릿은 마이그레이션용 `DATABASE_URL`/`DIRECT_URL` 2개뿐이다.
`NODE_ENV=production` 주입을 빠뜨리지 말 것 — 빠뜨려도 배포는 성공한다
([decisions/env-management.md](./decisions/env-management.md)).

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

**결정할 것**: 보관 기간(감사 목적이 있는지), 정리 방식(주기적 삭제 / 파티셔닝).

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

### C-3. 틱톡 `video.publish` 심사 → 직접 게시 전환

**현재**: `video.upload`(받은함) 방식. 사용자가 틱톡 앱에서 마무리해야 게시되고,
응답에 `requiresUserAction: true` 가 실린다.

**완료 조건**: 앱 심사로 `video.publish` 승인 → `.env` 한 줄만 변경
```bash
TIKTOK_SCOPES=user.info.basic,video.publish
```
엔드포인트는 코드가 자동 분기한다(`/inbox/video/init/` → `/video/init/`).
`requiresUserAction` 이 응답에서 사라지므로 **FE 안내 문구도 함께 정리**해야 한다
([api-spec.md](./api-spec.md) SNS 업로드 절).

### C-4. FCM 실기기 수신

**이미 검증된 것**: 실크리덴셜로 FCM API 호출, 미등록 토큰 →
`registration-token-not-registered` → `users.fcm_token` 자동 정리까지 실동작 확인.

**막힌 이유**: 실기기 FCM 토큰이 필요하고, 그건 FE 앱에서만 나온다.

**완료 조건**: FE 앱에서 발급한 토큰을 `POST /auth/fcm-token` 으로 등록 →
geofence 진입 → 기기에서 푸시 수신 확인.

### C-5. Meta 앱 검수용 URL 2개

`routes/legal.ts` 가 서비스 소개·약관·개인정보처리방침은 서빙하지만, 앱 검수 제출 시
추가로 요구되는 두 개는 미구현이다 (OAuth 테스트에는 불필요해서 미뤘다).

- **승인 취소 콜백 URL** — 사용자가 앱 연결을 해제하면 Meta 가 호출 (`signed_request` POST)
- **데이터 삭제 요청 URL** — 개인정보 삭제 요청 처리. URL + 확인 코드를 반환해야 한다.
  삭제 자체는 계정 삭제 파이프라인(`account.service.ts` 의 `deleteAccount`)을 재사용한다 —
  [decisions/account-deletion.md](./decisions/account-deletion.md)

**완료 조건**: 검수 제출 전 두 엔드포인트 구현 + 콘솔 등록.

### C-6. AdMob 콘솔 설정 → 보상형 광고 지급 실검증

**막힌 이유**: 백엔드 구현은 끝났다(2026-08-14, [progress.md](./progress.md) ·
[decisions/ad-reward-credits.md](./decisions/ad-reward-credits.md)). 남은 것은 저장소 밖 설정이다 —
AdMob 앱 등록, 보상형 광고 단위 생성, SSV 콜백 URL 입력, 생성된 광고 단위 ID 전달이 없으면
검증이 통과할 수 없다. C-1(스토어 등록)과 같은 성격의 외부 블로커다.

**설정 시 맞춰야 할 것**
- SSV 콜백 URL은 **`GET {고정 도메인}/billing/webhook/admob`** — 쿼리 파라미터를 임의로 덧붙이지
  않는다(서명 대상이 쿼리스트링 원문이다). 고정 도메인은 D-1에 걸려 있다.
- 생성된 광고 단위 ID를 `ADMOB_SSV_ALLOWED_AD_UNITS`(쉼표 구분)에 넣어야 한다. **비어 있으면
  모든 콜백이 거절된다** — 지급 경로를 "설정 안 함 = 전부 허용"으로 열지 않기 때문이다.
  **형식이 확정되지 않았다**: Google 문서의 `ad_unit` 설명은 "AdMob ad unit ID" 인데 예시값은
  `2747237135` 같은 숫자다(전체 형식 `ca-app-pub-…/2747237135` 가 아니다). 숫자 부분과 전체
  형식을 **둘 다 넣고 시작**한 뒤, 첫 지급이 통과하면 실제로 온 값을 `ad_rewards.ad_unit` 에서
  확인해 정리한다. 거절 시에도 수신한 `ad_unit` 을 기록하므로 로그 없이 판정할 수 있다.
- 앱은 SDK에 `customData = nonce`, `userId = ssvUserId`를 그대로 넣어야 한다
  (`POST /billing/ad-rewards` 응답값). 값이 어긋나면 세션을 못 찾아 지급되지 않는다.
- 보상량 20·한도 5는 확정됐다(A-2). 콘솔 설정이 끝날 때까지 `AD_REWARD_ENABLED=false`다.

**완료 조건**: AdMob 앱·보상형 광고 단위 생성 → SSV 콜백 URL 등록 →
`ADMOB_SSV_ALLOWED_AD_UNITS`·`AD_REWARD_ENABLED=true` 주입 → 테스트 광고 시청 →
실제 SSV 수신 → 크레딧 지급 → 같은 트랜잭션 재전송 시 중복 지급 없음까지 통과하면 닫힌다.

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

**완료 조건**: Cloudflare 에 등록된 보유 도메인 확보. 운영 도메인이 정해지면
그것이 `CLOUDFRONT_DOMAIN` / `S3_PUBLIC_ENDPOINT` 의 실제 값이 되므로 자연스럽게 해결된다.

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

### E-1. 인스타 연동 토큰의 만료 시각이 `null` 이다 ⚠️

현재 저장된 인스타 연동은 `token_expires_at = null` 이다. 계정이 개인 계정이던 시점에
장기 토큰 교환이 실패해서, 1단계 토큰(만료 정보 없음)으로 저장됐기 때문이다.

**영향**: `ensureFreshToken()` 은 `expiresAt === null` 이면 만료 검사도 갱신도 하지 않고
그대로 반환한다. 즉 **이 토큰은 조용히 만료되고, 만료 후 업로드는 플랫폼 에러로 실패한다**
(우리 쪽 "재연동 안내" 경로를 타지 않는다).

**확인 방법**: `sns_connections` 의 `platform` · `token_expires_at` 을 보면 된다.
(2026-08-11 재판정 시점에는 로컬 인프라가 내려가 있어 DB 실상태를 재확인하지 못했다 —
`ensureFreshToken()` 의 `null` 취급이 위와 같다는 것만 코드로 확인했다.)

**해결**: 계정이 이제 프로페셔널이므로 **재연동하면** 장기 토큰 교환이 성공해
`expires_in`(60일)이 채워진다. `GET /sns/instagram/connect` → 승인 한 번.

**코드 쪽 판단 필요**: 만료 시각을 모를 때 어떻게 다룰지. 지금은 "모르면 그냥 사용"인데,
경고 로그를 남기거나 보수적 기본값을 두는 선택지가 있다. 가짜 만료값을 넣으면 멀쩡한 토큰에
"재연동 필요"가 뜰 수 있어 단순 적용은 위험하다.

### E-2. `S3_PUBLIC_ENDPOINT` 미설정 시 기동 경고 로그

Dev A 가 인수인계 회신에서 요청한 항목. 미설정 동작은 "SNS 업로드 비활성 + 400"으로 두되,
기동 시 경고 로그 한 줄(`S3_PUBLIC_ENDPOINT 미설정 — SNS 실업로드 불가`)을 추가하면
원인 추적이 빨라진다. B 트랙 파일이라 구현은 B 판단.

### E-3. S3 삭제 실패분 정리 배치 (미구현)

`video.service.ts` 의 주석이 가리키는 미구현 배치. 스냅 서버 원천 전환의 GC 배치
(pending TTL 회수 / 삭제 유예 만료분 실삭제)와 함께 설계하는 것이 자연스럽다 —
[decisions/snap-source-of-truth.md](./decisions/snap-source-of-truth.md) §5 병행 항목.
계정 실삭제 배치(`accounts:purge`, [decisions/account-deletion.md](./decisions/account-deletion.md))가
먼저 생겼으므로, 이 배치를 만들 때 같은 실행 방식(스케줄 실행 + dry-run 기본)을 따르면 된다.
단 계정 purge 는 유저 prefix 전체를 지우므로 **영상 단건** S3 실패분 회수는 여전히 필요하다.
GC ①(pending TTL 회수)은 `videos:purge-pending` 으로 구현 완료(2026-08-12, progress.md 참고) —
남은 것은 ③ 이 항목뿐이다.

### E-4. 빌드한 이미지가 실제로 뜨는지 아무도 확인하지 않는다

`.github/workflows/ci.yml` 은 Postgres·Redis 를 GitHub Actions 의 service container 로 직접 띄우고,
`deploy.yml` 은 이미지를 **빌드해서 GHCR 에 푸시만** 한다. 두 워크플로 어디에서도
`docker-compose.yml` 을 참조하지 않는다.

**영향**: Dockerfile 이 깨져도 CI 는 초록이고, 실행되지 않는 이미지가 `:latest` 로 올라간다.
이 종류의 결함은 실제로 두 번 나왔다 — Dockerfile 이 `assets/`(BGM)를 복사하지 않은 것과
`BGM_DIR` 상대경로가 컨테이너 CWD 와 어긋난 것([progress.md](./progress.md) 실검증 라운드 2).
둘 다 네이티브 실행으로는 재현되지 않는다. 현재 이미지 실행을 검증하는 경로는
사람이 수동으로 `npm run stack:up` 을 칠 때뿐이다.

**선택지**: ① `deploy.yml` 에 빌드한 이미지를 띄워 `/health` 를 찌르는 스모크 스텝 추가
② `ci.yml` 에 compose 기동 잡 추가. ①이 더 정확하다 — 실제로 배포될 그 이미지를 검사한다.
다만 ai-worker 이미지는 torch/faster-whisper 로 커서(1.38GB) 매 푸시 기동은 비싸다.
api 만 스모크하고 워커는 빌드 성공까지만 볼지 판단이 필요하다.

**연결**: B-1(배포 인프라 결정)과 함께 보는 것이 자연스럽다 — Deploy 스텝을 연결할 때
같은 워크플로에 넣게 된다.

---

## F. 남은 실검증

- [ ] HDR(돌비비전)·장시간(수분)·10클립 상한 등 스트레스 케이스 (A 트랙)
- [ ] 배포 인프라 확정 후 `deploy.yml` 활성화 (B-1 선행)
- [ ] 실BGM 기준 whisper 자막 인식 재확인 (현재는 dev BGM 기준으로만 확인)

---

## G. 정리 필요 (일회성)

> 2026-08-11 재판정. 원래 4건이었으나 실제 상태를 확인해 1건으로 줄였다 —
> Firebase 키는 로테이션 완료, 루트 키 파일은 이미 없고,
> 틱톡 `client_key` 는 제거하지 않기로 판정했다(아래 "닫은 항목").

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
