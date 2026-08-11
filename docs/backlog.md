# 미결 작업 백로그

> 저장소 전체의 **닫히지 않은 작업**을 모은 단일 목록이다. 항목이 여러 문서에 흩어져 있으면
> 하나를 닫아도 나머지가 낡으므로, 미결 항목은 이 문서에만 둔다.
> 결정 문서(`docs/decisions/`)와 계획 문서(`docs/plans/`)는 **배경과 논점**을 담고,
> 진행 기록([progress.md](./progress.md))은 **완료된 것**만 담는다.
>
> 각 항목은 `왜 막혀 있는지` + `무엇이 있으면 닫히는지(완료 조건)` 형식이다.
> 마지막 정리: 2026-08-11 (출처: 구 `integrations-backlog.md`, `plan-limits.md` §5,
> `snap-source-of-truth.md` §7, `progress.md` 남은 것, `meetings/next-agenda.md`)

---

## A. 기획/제품 결정 대기

가장 앞단의 병목. 아래가 정해지지 않으면 구현을 시작할 수 없다.

### A-1. 영상 묶음(프로젝트) 구조 ★ 최우선

**막힌 이유**: 묶음 모델이 정해지지 않아 A 트랙(미디어/편집) 개발 전체가 대기 중이다.
3안 비교와 권장안은 [decisions/video-grouping-proposals.md](./decisions/video-grouping-proposals.md).

**결정할 것**: ① 묶음 모델(폴더형/자동묶음형/초안형/권장안) ② 내보내기 시 클립 순서 기본값
③ 재내보내기 정책(누적 vs 교체) ④ 묶음 삭제 시 소속 영상 처리
⑤ **촬영 메타데이터(`capturedAt`·위치) 수집 시작 여부 — 소급 불가라 시급**

**완료 조건**: 모델 확정 → 스키마 PR → CRUD → export → e2e 실검증.

### A-2. 플랜 차등 정책 일괄 확정

**막힌 이유**: 부분 구현이 어긋남의 원인이었으므로 한 번에 확정해 한 번에 반영해야 한다.
배경·논점·재도입 시 코드 변경 지점은 [decisions/plan-limits.md](./decisions/plan-limits.md).

현재 상태: 편집 횟수 제한 **미적용**, 해상도 차등·워터마크 **미구현**,
스토리지 한도 Free 5GB는 [decisions/snap-source-of-truth.md](./decisions/snap-source-of-truth.md) §6에서 **결정됨(미구현)**.

**결정할 것**: 무비 생성 과금 모델(크레딧 기반 재설계 예정) · 해상도 차등 · 워터마크 ·
Standard/Premium 스토리지 한도 · `GET /billing/plans` 의 `features` 문구 정합.

**완료 조건**: 정책 확정 → plan-limits §5 체크리스트 6항목 반영 →
`test/billing.test.ts` 의 `플랜별 편집 제한` 블록을 원래 기대값으로 복원
(현재는 "제한 없음"을 고정하고 되돌릴 기대값을 주석에 남겨뒀다:
`// 재도입 시: 4편째 403 + error.message 에 '무료 플랜' 포함`).

### A-3. 영상 분석(하이라이트 추천) 기능 승인

**막힌 이유**: 구현 계획은 작성됐으나 진행 승인이 없다 —
[plans/video-analysis-implementation-plan.md](./plans/video-analysis-implementation-plan.md).

**결정할 것**: 진행 여부·시점, OpenAI 호출 비용 한도, A-1(묶음 export)과의 연동 순서.

### A-4. 스냅 서버 원천 전환의 미결 항목

[decisions/snap-source-of-truth.md](./decisions/snap-source-of-truth.md) 에서 결정을 마쳤으나 남은 판단:

- [ ] 위치(`place`) 정보의 서버 저장 여부 — 프라이버시/약관 검토 선행
- [ ] 비로그인 사용자의 스냅 지위 (현행: 업로드 워커가 로그인 시에만 동작)
- [ ] 삭제 유예 기간 값 (업계 30~60일, 30일 제안)
- [ ] egress 비용 실측 후 렌디션 기본 다운로드 정책 재평가
- [ ] 앱 선행 과제: 촬영 스냅 해상도 하드코딩(1080×1920) 해소 — 틀린 값이 서버 원천이 되면 백필 불가

### A-5. FE 앱 일정 확인

FCM 실기기 검증(C-4), SNS 앱 검수용 URL(C-5), 촬영 메타데이터 전달(A-1 ⑤)이 **전부 FE 의존**이다.
FE 일정이 없으면 해당 항목의 목표 시점을 정할 수 없다.

---

## B. 개발 합의 필요 (A·B 트랙 공동 소유)

### B-1. 배포 인프라 결정 ★

**막힌 이유**: 후보(Fly / Render / ECS 등)가 확정되지 않았다.
`.github/workflows/deploy.yml` 은 `DEPLOY_ENABLED` 게이트로 준비돼 있고,
워커 이미지는 검증 완료([progress.md](./progress.md) 실검증 라운드 2)라 결정만 되면 배포 가능하다.

**연결된 병목**: **고정 도메인**(D-1)이 SNS 콜백·Stripe webhook·Meta 검수의 전제 —
B 트랙 잔여 검증이 전부 여기서 막힌다.

### B-2. FCM 멀티 디바이스

`users.fcm_token` 이 **단일 컬럼**이라 기기 하나만 등록된다. 새 기기로 로그인하면
이전 기기 토큰을 덮어쓴다(`POST /auth/fcm-token` 이 항상 덮어쓰기).
`users` 테이블은 [team.md](./team.md) 상 **공동 소유**라 스키마 변경에 양쪽 합의가 필요하다.
별도 `user_devices` 테이블로 빼는 것이 자연스럽다.

**결정할 것**: 멀티 디바이스 지원 여부, 지원 시 발송 팬아웃 방식(`sendEachForMulticast`), 무효 토큰 정리 범위.

### B-3. `AuthUser.email` 추가

`POST /billing/checkout` 이 Stripe 고객을 이메일 없이 생성하고 있었다. 현재는 검증된 JWT 의
email 클레임을 라우트에서 읽어 넘기지만, `request.user` 에 email 을 싣는 것이 깔끔하다.
`plugins/auth.ts` 는 **공동 소유**라 합의 필요.

### B-4. 미납(`past_due`) 정책

웹훅으로 `status='past_due'` 는 반영되지만 `plan` 은 유지된다. 즉 **미납 상태에서 유료 기능이
계속 열려 있다**(현재는 플랜 제한 자체가 미적용이라 무의미하지만, A-2 반영 시 정책이 필요하다).

**결정할 것**: 유예 기간, 유예 후 강등, 안내 방식.

### B-5. `notification_logs` 보관 정책

geofence 쿨다운 판정용 이력이 무한히 쌓인다. 쿨다운은 30분 기준이라 그보다 오래된 행은
조회에 쓰이지 않는다.

**결정할 것**: 보관 기간(감사 목적이 있는지), 정리 방식(주기적 삭제 / 파티셔닝).

---

## C. 외부 크리덴셜/승인 대기

### C-1. Stripe 상품·가격 생성 → 실제 Checkout 검증

**막힌 이유**: 테스트 키는 확보·검증했지만 계정에 상품이 0개다. Price ID 없이는
`POST /billing/checkout` 이 Stripe 단계에서 실패한다.

**이미 검증된 것**: 실제 웹훅 이벤트로 `plan: free → standard` 전이, 순서 보정 가드,
실키 서명 형식(`t=,v1=` + 5분 허용 오차). 즉 **결제 후 처리는 검증돼 있고 결제 진입만 남았다.**

**완료 조건**
```bash
stripe products create --name "Snaply Standard"
stripe prices create --product prod_xxx --currency krw --unit-amount 9900 \
  -d "recurring[interval]=month"
# → Price ID 2개를 .env 의 STRIPE_PRICE_STANDARD / STRIPE_PRICE_PREMIUM 에
```
그 뒤 `POST /billing/checkout` 이 실제 `checkout.stripe.com` URL 을 반환하고,
테스트 카드로 결제 → 웹훅 → `plan` 전이까지 한 번 통과하면 닫힌다.

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
- **데이터 삭제 요청 URL** — 개인정보 삭제 요청 처리. URL + 확인 코드를 반환해야 한다

**완료 조건**: 검수 제출 전 두 엔드포인트 구현 + 콘솔 등록.

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

---

## E. 코드 결함 / 판단 필요

### E-1. 인스타 연동 토큰의 만료 시각이 `null` 이다 ⚠️

현재 저장된 인스타 연동은 `token_expires_at = null` 이다. 계정이 개인 계정이던 시점에
장기 토큰 교환이 실패해서, 1단계 토큰(만료 정보 없음)으로 저장됐기 때문이다.

**영향**: `ensureFreshToken()` 은 `expiresAt === null` 이면 만료 검사도 갱신도 하지 않고
그대로 반환한다. 즉 **이 토큰은 조용히 만료되고, 만료 후 업로드는 플랫폼 에러로 실패한다**
(우리 쪽 "재연동 안내" 경로를 타지 않는다).

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

---

## F. 남은 실검증

- [ ] HDR(돌비비전)·장시간(수분)·10클립 상한 등 스트레스 케이스 (A 트랙)
- [ ] 배포 인프라 확정 후 `deploy.yml` 활성화 (B-1 선행)
- [ ] 실BGM 기준 whisper 자막 인식 재확인 (현재는 dev BGM 기준으로만 확인)

---

## G. 정리 필요 (일회성 — 지연될수록 위험)

- [ ] **Firebase 서비스 계정 키 로테이션** — 대화 로그에 private key 전문이 노출됐다.
      Firebase Console → 프로젝트 설정 → 서비스 계정 → 키 관리에서 기존 키 삭제 후 재발급.
      `.env` 의 `FIREBASE_SERVICE_ACCOUNT_KEY`(base64) 만 교체하면 된다.
- [ ] **레포 루트의 `snaply-66f8c-firebase-adminsdk-*.json` 삭제** —
      `.gitignore` 로 커밋은 막혀 있고 `.env` 에 base64 로 들어가 있어 원본 파일은 불필요하다.
- [ ] **테스트 게시물 정리** — 인스타 릴스(API 로는 삭제 불가하므로 앱에서 수동), 틱톡 받은함 초안 3건.
- [ ] **틱톡 Sandbox client_key** — 커밋 `49d0d1a` 이력에 실제 값이 남아 있다.
      authorize URL 에 실려 사용자에게도 보이는 준공개 값이라 위험도는 낮지만,
      완전 제거를 원하면 history rewrite + force push 가 필요하다(양 트랙 영향 있음).
