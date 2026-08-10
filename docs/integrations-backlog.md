# 연동/수익화 트랙 — 남은 작업 및 재도입 체크리스트

> 2026-08-10, Dev B 기준. Phase 6~9 하드닝을 `main` 에 머지한 시점에 **아직 닫히지 않은 것**들.
> 각 항목에 **왜 막혀 있는지**와 **무엇이 있으면 닫히는지(완료 조건)** 를 적었다.
>
> 완료된 검증 내역은 [PROGRESS.md](./PROGRESS.md), Dev A 확인 사항은 [integrations-handover.md](./integrations-handover.md).

---

## A. 재도입 대기 — 의도적으로 빼둔 것

### A-1. 플랜별 제한 (Dev A 유예 결정)

[plan-limits.md](./plan-limits.md) 에 배경과 재도입 시 결정사항이 정리돼 있다. 기획 확정이 선행.

| 제한 | 현재 | 재도입 시 손댈 곳 |
|---|---|---|
| Free 월 3편 | 미적용 (`FREE_MONTHLY_LIMIT` 제거됨) | `services/edit-job.service.ts` + 아래 테스트 |
| 해상도 차등 (720p/1080p/4K) | 미구현 | 큐 페이로드에 `plan` 전달 → 워커 |
| 워터마크 | 미구현 | 〃 |

**월 3편을 재도입하면 이 테스트를 되돌려야 한다** — `test/billing.test.ts` 의 `플랜별 편집 제한` 블록.
현재는 "제한 없음"을 고정하고 있고, 되돌릴 기대값을 주석에 남겨뒀다:

```ts
// 재도입 시: 4편째 403 + error.message 에 '무료 플랜' 포함
```

같은 블록의 세 번째 테스트(`GET /billing/plans` 의 `features` 문구가 집행되지 않음)도
집행이 시작되면 의미가 바뀐다.

**완료 조건**: 기획 확정 → 제한 로직 재구현 → 위 테스트를 원래 기대값으로 복원.

---

## B. 외부 크리덴셜/승인 대기

### B-1. Stripe 상품·가격 생성 → 실제 Checkout 검증

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

### B-2. 틱톡 받은함 실물 미도착

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

### B-3. 틱톡 `video.publish` 심사 → 직접 게시 전환

**현재**: `video.upload`(받은함) 방식. 사용자가 틱톡 앱에서 마무리해야 게시된다.
응답에 `requiresUserAction: true` 가 실린다.

**완료 조건**: 앱 심사로 `video.publish` 승인 → `.env` 한 줄만 변경
```bash
TIKTOK_SCOPES=user.info.basic,video.publish
```
엔드포인트는 코드가 자동 분기한다(`/inbox/video/init/` → `/video/init/`).
`requiresUserAction` 이 응답에서 사라지므로 **FE 안내 문구도 함께 정리**해야 한다
([api-spec.md](./api-spec.md) 의 SNS 업로드 절 참고).

### B-4. FCM 실기기 수신

**이미 검증된 것**: 실크리덴셜로 FCM API 호출, 미등록 토큰 →
`registration-token-not-registered` → `users.fcm_token` 자동 정리까지 실동작 확인.

**막힌 이유**: 실기기 FCM 토큰이 필요하고, 그건 FE 앱에서만 나온다.

**완료 조건**: FE 앱에서 발급한 토큰을 `POST /auth/fcm-token` 으로 등록 →
geofence 진입 → 기기에서 푸시 수신 확인.

### B-5. Meta 앱 검수용 URL 2개

`routes/legal.ts` 가 서비스 소개·약관·개인정보처리방침은 서빙하지만, 앱 검수 제출 시
추가로 요구되는 두 개는 미구현이다 (OAuth 테스트에는 불필요해서 미뤘다).

- **승인 취소 콜백 URL** — 사용자가 앱 연결을 해제하면 Meta 가 호출 (`signed_request` POST)
- **데이터 삭제 요청 URL** — 개인정보 삭제 요청 처리. URL + 확인 코드를 반환해야 한다

**완료 조건**: 검수 제출 전 두 엔드포인트 구현 + 콘솔 등록.

---

## C. 합의 필요 — 공동 소유 영역이거나 정책 결정

### C-1. FCM 멀티 디바이스

`users.fcm_token` 이 **단일 컬럼**이라 기기 하나만 등록된다. 새 기기로 로그인하면
이전 기기 토큰을 덮어쓴다(`POST /auth/fcm-token` 이 항상 덮어쓰기).

`users` 테이블은 TEAM.md 상 **공동 소유**라 스키마 변경에 양쪽 합의가 필요하다.
별도 `user_devices` 테이블로 빼는 것이 자연스럽다.

**결정할 것**: 멀티 디바이스를 지원할지, 지원 시 발송을 어떻게 팬아웃할지(`sendEachForMulticast`),
무효 토큰 정리 범위.

### C-2. `AuthUser.email` 추가

`POST /billing/checkout` 이 Stripe 고객을 이메일 없이 생성하고 있었다.
현재는 검증된 JWT 의 email 클레임을 라우트에서 읽어 넘기지만,
`request.user` 에 email 을 싣는 것이 깔끔하다. `plugins/auth.ts` 는 **공동 소유**라 합의 필요.

### C-3. 미납(`past_due`) 정책

웹훅으로 `status='past_due'` 는 반영되지만 `plan` 은 유지된다.
즉 **미납 상태에서 유료 기능이 계속 열려 있다**(현재는 플랜 제한 자체가 미적용이라 무의미하지만,
A-1 재도입 시 정책이 필요하다).

**결정할 것**: 유예 기간, 유예 후 강등, 안내 방식.

### C-4. `notification_logs` 보관 정책

geofence 쿨다운 판정용 이력이 무한히 쌓인다. 쿨다운은 30분 기준이라
그보다 오래된 행은 조회에 쓰이지 않는다.

**결정할 것**: 보관 기간(감사 목적이 있는지), 정리 방식(주기적 삭제 / 파티셔닝).

---

## D. 운영 전환 시

### D-1. 고정 도메인

현재 로컬 검증은 cloudflared 임시 터널(`*.trycloudflare.com`)을 쓴다.
**재시작하면 주소가 바뀌고, 그때마다 인스타·틱톡 콘솔의 리디렉션 URI 와
URL prefix 소유권 검증을 다시 등록해야 한다.** 이번 세션에 실제로 여러 번 겪었다.

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

## E. 전체 검토(2026-08-10)에서 추가로 확인된 것

### E-1. 인스타 연동 토큰의 만료 시각이 `null` 이다 ⚠️

현재 저장된 인스타 연동은 `token_expires_at = null` 이다. 계정이 개인 계정이던 시점에
장기 토큰 교환이 실패해서, 1단계 토큰(만료 정보 없음)으로 저장됐기 때문이다.

**영향**: `ensureFreshToken()` 은 `expiresAt === null` 이면 만료 검사도 갱신도 하지 않고
그대로 반환한다. 즉 **이 토큰은 조용히 만료되고, 만료 후 업로드는 플랫폼 에러로 실패한다**
(우리 쪽 "재연동 안내" 경로를 타지 않는다).

**해결**: 계정이 이제 프로페셔널이므로 **재연동하면** 장기 토큰 교환이 성공해
`expires_in`(60일)이 채워진다. `GET /sns/instagram/connect` → 승인 한 번.

**코드 쪽 판단 필요**: 만료 시각을 모를 때 어떻게 다룰지.
지금은 "모르면 그냥 사용"인데, 경고 로그를 남기거나 보수적 기본값을 두는 선택지가 있다.
가짜 만료값을 넣으면 멀쩡한 토큰에 "재연동 필요"가 뜰 수 있어 단순 적용은 위험하다.

### E-2. presigned URL 만료는 문제없음 (확인 완료)

`S3_DOWNLOAD_URL_EXPIRY_SECONDS` 기본값이 **1시간**이다. 인스타 컨테이너 처리가 실측 ~50초,
틱톡 다운로드도 분 단위이므로 플랫폼이 내려받는 중 만료될 위험은 없다.
단축할 때는 이 점을 고려해야 한다.

### E-3. CI 가 통합 테스트를 실행하지 않던 문제 (해결)

`ci.yml` 이 build/typecheck/lint 만 돌려서 **테스트 146개가 PR 에서 한 번도 실행되지 않았다.**
안전망을 만들어도 CI 가 안 돌리면 회귀를 못 잡는다.

→ `api-tests` 잡 추가. Postgres·Redis 서비스 컨테이너만 띄운다(MinIO 불필요 —
S3 를 실제 호출하는 테스트가 없고 Dev A 의 storage 테스트도 URL 문자열만 검증한다).
`.env` 없이·MinIO 없이 148/148 + 1/1 통과를 로컬에서 재현 검증했다.

> `ci.yml` 은 TEAM.md 상 Dev A 영역이라 **리뷰가 필요한 변경**이다.

---

## F. 정리 필요 (일회성)

- [ ] **Firebase 서비스 계정 키 로테이션** — 대화 로그에 private key 전문이 노출됐다.
      Firebase Console → 프로젝트 설정 → 서비스 계정 → 키 관리에서 기존 키 삭제 후 재발급.
      `.env` 의 `FIREBASE_SERVICE_ACCOUNT_KEY`(base64) 만 교체하면 된다.
- [ ] **레포 루트의 `snaply-66f8c-firebase-adminsdk-*.json` 삭제** —
      `.gitignore` 로 커밋은 막혀 있고 `.env` 에 base64 로 들어가 있어 원본 파일은 불필요하다.
- [ ] **테스트 게시물 정리** — 인스타 릴스 (https://www.instagram.com/reel/DbnYK8qiXxg/,
      API 로는 삭제 불가하므로 앱에서 수동), 틱톡 받은함 초안 3건.
- [ ] **틱톡 Sandbox client_key** — 커밋 `49d0d1a` 이력에 실제 값이 남아 있다.
      authorize URL 에 실려 사용자에게도 보이는 준공개 값이라 위험도는 낮지만,
      완전 제거를 원하면 history rewrite + force push 가 필요하다(Dev A 영향 있음).
