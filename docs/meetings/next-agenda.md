# 다음 회의 안건 — 백엔드 검증 완료 이후

> 2026-08-10 Dev A 작성, 2026-08-11 백로그 통합에 맞춰 정리.
> **아직 열려 있는 문서다** — 회의가 끝나면 §4(회의 결과 기록)를 채우고, 결정된 항목을
> [backlog.md](../backlog.md)와 해당 [decisions/](../decisions/) 문서에 반영한다.
> 그다음 이 파일을 `YYYY-MM-DD-<주제>.md`(회의일 기준)로 rename해 회의록으로 남긴다.
> 다음 회의 안건은 새 `next-agenda.md`로 시작한다.
>
> 안건의 내용·배경은 백로그 항목을 참조한다(여기에 다시 적지 않는다).
> 이 문서가 정하는 것은 **무엇을 어떤 순서로 논의할지**다.

---

## 1. 회의 전 즉시 처리 (담당 지정만 하면 되는 것)

| 항목 | 근거 | 담당 |
|---|---|---|
| 보안 정리 4건 (Firebase 키 로테이션 · 레포 루트 키 파일 삭제 · 틱톡 client_key · 테스트 게시물) | [BACKLOG](../backlog.md) §G — **지연될수록 위험** | B |
| 인스타 재연동 (토큰 만료 시각이 `null`) | [BACKLOG](../backlog.md) E-1 — 승인 한 번 | B |
| 인수인계 상호 확인 | A ✅ 완료(2026-08-10, [archive/integrations-handover.md](../archive/integrations-handover.md)) / B: main pull 후 `npm run db:generate` + [decisions/plan-limits.md](../decisions/plan-limits.md) 확인 | A·B |

---

## 2. 기획 회의 안건 (제품 결정 — 우선순위 순)

| # | 안건 | 근거 | 왜 지금 |
|---|---|---|---|
| 1 ★ | 영상 묶음(프로젝트) 구조 | [BACKLOG](../backlog.md) A-1 · [decisions/video-grouping-proposals.md](../decisions/video-grouping-proposals.md) | **A 트랙 개발 전체가 여기서 막혀 있다.** 촬영 메타데이터 수집은 소급 불가라 특히 시급 |
| 2 | 플랜 차등 정책 일괄 확정 | [BACKLOG](../backlog.md) A-2 · [decisions/plan-limits.md](../decisions/plan-limits.md) | 부분 구현이 어긋남의 원인이었으므로 한 번에 확정해 한 번에 반영 |
| 3 | 영상 분석(하이라이트 추천) 승인 | [BACKLOG](../backlog.md) A-3 · [plans/video-analysis-implementation-plan.md](../plans/video-analysis-implementation-plan.md) | 안건 1의 export 순서와 얽힘 |
| 4 | FE 앱 일정 확인 | [BACKLOG](../backlog.md) A-5 | FCM 실기기·SNS 검수 URL·촬영 메타데이터가 전부 FE 의존 |
| 5 | 스냅 서버 원천 전환의 미결 판단 | [BACKLOG](../backlog.md) A-4 · [decisions/snap-source-of-truth.md](../decisions/snap-source-of-truth.md) | 위치 저장 여부는 프라이버시/약관 검토 선행 |

## 3. 개발 회의 안건 (A·B 합의)

| # | 안건 | 근거 | 왜 지금 |
|---|---|---|---|
| 6 ★ | 배포 인프라 결정 | [BACKLOG](../backlog.md) B-1 | **고정 도메인(D-1)이 SNS 콜백·Stripe webhook·Meta 검수의 전제 — B 트랙 잔여 검증이 전부 여기서 막힌다.** 워커 이미지는 검증 완료 |
| 7 | 공동 소유 정책 4건 (FCM 멀티 디바이스 · `AuthUser.email` · 미납 정책 · `notification_logs` 보관) | [BACKLOG](../backlog.md) B-2~B-5 | 공동 소유 파일·테이블이라 한쪽이 못 정한다 |
| 8 | 외부 대기 현황 공유 (결정 아님, 체크만) | [BACKLOG](../backlog.md) §C | Stripe 실결제 · 틱톡 심사 · Meta 검수 · FCM 실기기 |

---

## 4. 결정 이후 진행 순서 (제안)

```
즉시     §1 (보안 정리 · 인스타 재연동 · 인수인계 확인)
회의     안건 1·2 확정 (기획) / 안건 6 확정 (개발)
   ↓
A 트랙   묶음 구조 구현: 스키마 PR → CRUD → export → e2e 실검증
         + 촬영 메타데이터 수집 (POST /videos 확장 — 스냅 서버 원천화 1단계와 같은 작업)
         + 플랜 제한 재도입 (확정분 — 워커 해상도/워터마크 포함)
B 트랙   영상 분석 구현 (안건 3 승인 시) / Stripe 실결제 검증
병행     배포: 인프라 결정 → 스테이징 1회 배포 → 고정 도메인 확보
   ↓
FE 합류  FCM 실기기 · SNS 검수/실업로드 · 촬영 메타데이터 전달
잔여     스트레스 케이스 (BACKLOG §F) · 운영 전환 항목 (BACKLOG §D)
```

**요약**: 병목은 두 개다 — **묶음 구조 결정(A 트랙 막힘)** 과 **배포+도메인(B 트랙 잔여 검증 막힘)**.
이 둘을 이번 회의에서 확정하면 나머지는 순차적으로 풀린다.

---

## 회의 결과 기록

> 회의 후 아래에 결정 사항을 기록한다. 미결 안건은 다음 회의로 이월하고 사유를 남긴다.
> 결정된 내용은 해당 [decisions/](../decisions/) 문서와 [backlog.md](../backlog.md)에 반영한다.

- 안건 1 (묶음 구조):
- 안건 2 (플랜 정책):
- 안건 3 (영상 분석):
- 안건 4 (FE 일정):
- 안건 5 (스냅 원천 미결):
- 안건 6 (배포 인프라):
- 안건 7 (공동 정책 4건):
