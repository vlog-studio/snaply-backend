# 결정 문서 인덱스

정책·설계 결정을 담는 디렉터리다. 각 문서 상단의 `**상태**` 줄이 원천이고, 이 표는 그것을 한곳에 모은
것이다. **문서를 추가하거나 상태가 바뀌면 이 표를 같은 변경에서 갱신한다.**

- **결정 대기(미결)** 문서는 배경·영향 범위·선택지·각 선택의 결과·권장안을 담고, 마지막의 "결정 기록"
  표가 비어 있다. 결정이 나면 같은 파일의 상태 줄과 결정 기록을 채우고, 해당 spec 을 **먼저** 고친다
  ([AGENTS.md](../../AGENTS.md) §문서 갱신 의무). 선례: [movie-model.md](movie-model.md)는 08-10 작성,
  08-11 결정을 같은 파일에 덧붙였다.
- 미결 **작업**은 여기가 아니라 [backlog.md](../backlog.md)에만 둔다. 결정 대기 문서는 "무엇을 고를지"를
  설명할 뿐 작업 목록을 갖지 않는다.

## 결정 대기 — 회의에서 정해야 하는 것

| 문서 | 무엇을 정하나 | 백로그 | 출처 |
|---|---|---|---|
| [snap-retention-period.md](snap-retention-period.md) | 영상(스냅) 서버 보관: 15일 만료 vs 2GB 용량 한도 vs 병행 | A-1 ⑥ | 2026-08-31 회의 |
| [local-copy-after-upload.md](local-copy-after-upload.md) | 업로드 성공 시 로컬 파일 삭제를 언제 켤지 | A-1 ⑥ · A-4 | 2026-08-31 회의 |
| [movie-cleanup-after-export.md](movie-cleanup-after-export.md) | 내보내기 후 프로젝트·결과물 삭제 vs 30일 보관 + 무료 재생성 | A-1 ⑥ | 2026-08-31 회의 |
| [movie-export-policy.md](movie-export-policy.md) | 무비 내보내기 세부 규칙 5개(순서 기본값 · 재내보내기 · 삭제 시 스냅 · 자동 그룹핑 · 기존 API 폐기) | A-1 ①~⑤ | backlog A-1 |
| [subtitle-rendering.md](subtitle-rendering.md) | 자막: 소프트 유지 vs 번인 전환 | A-7 | 2026-08-31 회의 |
| [sns-webhook-scope.md](sns-webhook-scope.md) | "웹훅 연동"이 어느 웹훅을 뜻하는지 | D-1 | 2026-08-31 회의 |
| [sticker-asset-sourcing.md](sticker-asset-sourcing.md) | 스티커 조달 경로 · 등록 경로(관리자 페이지 시점) | A-7 | 2026-08-31 회의 |
| [bgm-sourcing.md](bgm-sourcing.md) | BGM 조달(AI 생성 · 라이선스 구독 · 커미션) — 법적 검토 6항목 선행 | A-7 · E-5 | 2026-08-31 회의 |

여덟 건의 선후관계와 착수 순서는 [plans/2026-08-31-dev-sync-follow-up.md](../plans/2026-08-31-dev-sync-follow-up.md) §2.

## 결정 완료 — 현행 정책의 근거

| 문서 | 결정 | 구현 |
|---|---|---|
| [api-contract-schema-first.md](api-contract-schema-first.md) | API 계약 원천을 `packages/shared-types` Zod 스키마로 통일 | 완료 |
| [snap-content-analysis.md](snap-content-analysis.md) | 스냅 내용 분석(vision) 도입 | 완료, 생산 활성화 대기(A-3) |
| [template-snap-recommendation.md](template-snap-recommendation.md) | 템플릿 기반 스냅 자동 추천 | 완료, 생산 활성화 대기(A-6) |
| [ad-reward-credits.md](ad-reward-credits.md) | 보상형 광고 크레딧 지급 규칙 | 완료, 기본 꺼짐(C-6) |
| [storage-and-subscription-policy.md](storage-and-subscription-policy.md) | Free 2GB · 무비 30일 보관 + 무료 재생성 · 크레딧/구독 2축 | 정책 확정, 한도 집행·만료 미구현(A-1·A-2) |
| [payment-channel-iap.md](payment-channel-iap.md) | 결제 채널 IAP + RevenueCat, Stripe 제거 | 완료, 스토어 등록 대기(C-1) |
| [credit-payment-model.md](credit-payment-model.md) | 구독 제거, 무비 생성 = 크레딧 100 | 완료 |
| [snap-source-of-truth.md](snap-source-of-truth.md) | 스냅 원천을 서버로 전환(1~4단계) | 결정만, 미착수(A-4) |
| [movie-model.md](movie-model.md) | 영상 묶음은 평면 `Video`를 참조하는 `Movie` 엔티티 | 결정만, 세부 규칙은 위 movie-export-policy |
| [env-management.md](env-management.md) | 로컬은 `apps/api/.env`, 운영은 플랫폼 시크릿 주입 | 완료 |

## 과거 결정 — 일부 또는 전부 대체됨

| 문서 | 상태 |
|---|---|
| [account-deletion.md](account-deletion.md) | 과거 결정 — 결제 모델 전환으로 일부 대체. 삭제 유예 30일은 유효 |
| [plan-limits.md](plan-limits.md) | 대체됨 — 플랜 차등·정기 구독 제거 |
