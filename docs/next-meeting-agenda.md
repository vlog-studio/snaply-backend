# 다음 회의 안건 — 백엔드 검증 완료 이후

> 2026-08-10, Dev A 작성.
> 양 트랙(A: 미디어/편집, B: 연동/수익화) 실검증이 완료된 시점 기준으로,
> 남은 작업을 "즉시 처리 / 회의 결정 / 결정 후 구현"으로 나눠 정리한다.
> 근거: [PROGRESS.md](./PROGRESS.md) · [integrations-backlog.md](./integrations-backlog.md) ·
> [integrations-handover.md](./integrations-handover.md) · [plan-limits.md](./plan-limits.md) ·
> [video-grouping-proposals.md](./video-grouping-proposals.md) ·
> [video-analysis-implementation-plan.md](./video-analysis-implementation-plan.md)

---

## 1. 회의 전 즉시 처리 (담당 지정만 하면 되는 것)

### 1-1. 보안 정리 4건 (backlog §F — 지연될수록 위험)

| 항목 | 내용 | 담당 |
|---|---|---|
| Firebase 키 로테이션 | 대화 로그에 private key 전문 노출 → 새 키 발급·교체 | B |
| 레포 루트 키 파일 삭제 | `snaply-66f8c-firebase-adminsdk-*.json` | B |
| 틱톡 client_key 교체 | git 이력(`49d0d1a`)에 실제 값 잔존 | B |
| 테스트 게시물 삭제 | 검증 중 올라간 인스타 릴스 등 | B |

### 1-2. 인수인계 상호 확인

- **A**: ✅ 완료 (2026-08-10) — 회신은 [integrations-handover.md](./integrations-handover.md)
  "Dev A 확인 결과" 참고. 전체 테스트 148/148 + node:test 통과 재현, CI 잡 구성 동의,
  신규 마이그레이션 2건 Supabase deploy 완료
- **B**: main pull 후 `npm run db:generate` (완료 여부 확인), [plan-limits.md](./plan-limits.md) 확인

---

## 2. 기획 회의 안건 (제품 결정 — 우선순위 순)

### 안건 1. 영상 묶음(프로젝트) 구조 ★ 최우선

- 근거: [video-grouping-proposals.md](./video-grouping-proposals.md) (3안 비교 + 권장안)
- 결정할 것:
  1. 묶음 모델 — 폴더형 / 자동묶음형 / 초안형 / 권장안(초안+자동그룹핑)
  2. 내보내기 시 클립 순서 기본값
  3. 재내보내기 정책 (누적 vs 교체)
  4. 묶음 삭제 시 소속 영상 처리
  5. **촬영 메타데이터(capturedAt·위치) 수집 시작 여부** — 소급 불가라 시급
- **이후 A 트랙 개발 전체가 이 결정에 걸려 있음 (병목)**

### 안건 2. 플랜 차등 정책 일괄 확정

- 근거: [plan-limits.md](./plan-limits.md)
- 결정할 것: 월 편집 횟수(현재 미적용) · 해상도 차등 · 워터마크 · 묶음/영상 개수 제한 · billing `features` 문구 정합
- 부분 구현이 어긋남의 원인이었으므로 **한 번에 확정하고 한 번에 반영**

### 안건 3. 영상 분석(하이라이트 추천) 기능 승인

- 근거: [video-analysis-implementation-plan.md](./video-analysis-implementation-plan.md) (B 작성)
- 결정할 것: 진행 여부·시점, OpenAI 호출 비용 한도, 안건 1(묶음 export)과의 연동 순서

### 안건 4. FE 앱 일정 확인

- FCM 실기기 검증, SNS 앱 검수용 URL, 촬영 메타데이터 전달이 **전부 FE 의존**
- FE 일정이 없으면 위 항목들의 목표 시점을 정할 수 없음

---

## 3. 개발 회의 안건 (A·B 합의)

### 안건 5. 배포 인프라 결정 ★

- 후보: Fly / Render / ECS 등. `.github/workflows/deploy.yml`은 `DEPLOY_ENABLED` 게이트로 준비됨
- **고정 도메인**(backlog D-1)이 SNS 콜백·Stripe webhook·Meta 검수의 전제 — **B 트랙 잔여 검증의 병목**
- 워커 이미지는 검증 완료(PROGRESS 실검증 라운드 2) — 결정만 되면 배포 가능

### 안건 6. 공동 소유 정책 4건 (backlog §C)

| 항목 | 결정할 것 |
|---|---|
| FCM 멀티 디바이스 | 유저당 토큰 1개 유지 vs 기기별 복수 |
| `AuthUser.email` | request.user에 email 추가 여부 (users 테이블 공동 소유) |
| 결제 미납(past_due) | 즉시 free 강등 vs 유예 기간 |
| notification_logs 보관 | 보관 기간/정리 주기 |

### 안건 7. 외부 대기 현황 공유 (결정 아님, 체크만)

- Stripe 상품/Price 생성 → 실결제 검증 (B-1)
- 틱톡 심사(`video.publish`), Meta 앱 검수 (B-3, B-5)
- FCM 실기기 (B-4 — FE 대기)

---

## 4. 결정 이후 진행 순서 (제안)

```
즉시     §1 보안 정리 + 인수인계 확인
회의     안건 1·2 확정 (기획) / 안건 5 확정 (개발)
   ↓
A 트랙   묶음 구조 구현: 스키마 PR → CRUD → export → e2e 실검증
         + 촬영 메타데이터 수집 (POST /videos 확장)
         + 플랜 제한 재도입 (안건 2 확정분 — 워커 해상도/워터마크 포함)
B 트랙   영상 분석 구현 (안건 3 승인 시) / Stripe 실결제 검증
병행     배포: 인프라 결정 → 스테이징 1회 배포 → 고정 도메인 확보
   ↓
FE 합류  FCM 실기기 · SNS 검수/실업로드 · 촬영 메타데이터 전달
잔여     스트레스 케이스 (HDR/장시간/10클립 — A), 운영 전환 항목 (backlog §D)
```

**요약**: 병목은 두 개다 — **묶음 구조 결정(A 트랙 막힘)** 과 **배포+도메인(B 트랙 잔여 검증 막힘)**.
이 둘을 이번 회의에서 확정하면 나머지는 순차적으로 풀린다.

---

## 회의 결과 기록

> 회의 후 아래에 결정 사항을 기록한다. 미결 안건은 다음 회의로 이월하고 사유를 남긴다.

- 안건 1 (묶음 구조):
- 안건 2 (플랜 정책):
- 안건 3 (영상 분석):
- 안건 4 (FE 일정):
- 안건 5 (배포 인프라):
- 안건 6 (공동 정책 4건):
