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
| [subtitle-rendering.md](subtitle-rendering.md) | 자막: 소프트 유지 vs 번인 전환 | A-7 | 2026-08-31 회의 |
| [sns-webhook-scope.md](sns-webhook-scope.md) | "웹훅 연동"이 어느 웹훅을 뜻하는지 | D-1 | 2026-08-31 회의 |
| [sticker-asset-sourcing.md](sticker-asset-sourcing.md) | 스티커 조달 경로 · 등록 경로(관리자 페이지 시점) | A-7 | 2026-08-31 회의 |
| [bgm-sourcing.md](bgm-sourcing.md) | BGM 조달(AI 생성 · 라이선스 구독 · 커미션) — 법적 검토 6항목 선행 | A-7 · E-5 | 2026-08-31 회의 |
| [movie-snap-expiry-exemption.md](movie-snap-expiry-exemption.md) | 무비가 참조 중인 스냅의 만료 예외 — 잠정 결정은 "예외 없음"(현행 유지), 다음 회의에서 다시 본다 | A-1 · A-2 | 2026-09-15 잠정 결정 |

각 결정의 착수 순서와, 결정을 기다리지 않고 시작할 수 있는 일:

- **sns-webhook-scope** — 어느 답이든 고정 도메인이 필요하다. 도메인·인증서·배포 타깃(D-1·B-1)은 결정 전에
  시작할 수 있고, 도메인이 생겨야 웹훅·검수·결제 검증(C-1·C-5·C-6·D-3)이 이어진다.
- **bgm-sourcing** — 법적 검토 → 조달 → `bgm_tracks` → E-5 해소 순이다. 후보 서비스의 약관 비교표는 결정
  전에 만들 수 있다.
- **sticker-asset-sourcing** — 에셋 조달 → 매니페스트 시드 등록 → (필요해지면) 관리자 페이지 순이다. 에셋
  라이선스 조사는 결정 전에 시작할 수 있다.
- **subtitle-rendering** — 다른 결정과 독립이다.
- **movie-snap-expiry-exemption** — 요금제 설계(A-2)와 같은 자리에서 본다.

## 결정 완료 — 현행 정책의 근거

| 문서 | 결정 | 구현 |
|---|---|---|
| [api-contract-schema-first.md](api-contract-schema-first.md) | API 계약 원천을 `packages/shared-types` Zod 스키마로 통일 | 완료 |
| [snap-content-analysis.md](snap-content-analysis.md) | 스냅 내용 분석(vision) 도입. 법무 검토 전에는 사용자 동의(옵트인)로 켠다(2026-09-29 §6.1) | 분석·동의 완료. 생산 활성화는 A-3 |
| [template-snap-recommendation.md](template-snap-recommendation.md) | 템플릿 기반 스냅 자동 추천 | 완료, 생산 활성화 대기(A-6) |
| [edit-spec-v3.md](edit-spec-v3.md) | editSpec v3·에셋 매니페스트·어휘 사전의 설계 규칙(시드·핀·무효화·큐 분리·사전 로딩) | 어휘 사전 3종 구현. 스키마 본문과 남은 개정은 A-7 |
| [transition-director.md](transition-director.md) | AI 가 경계마다 전환을 고르는 규칙 — 스타일 경향 · 30분 장면 전환 · 두 컷을 키로 한 시드. 여분이 없어 들어가지 않는 `crossfade` 는 `dip` 으로 | 완료(2026-10-01, 편집 화면의 선택·미리보기 포함 — Galaxy 실기기 확인) |
| [edit-director.md](edit-director.md) | AI 편집 초안이 스냅을 고르고 자르는 규칙 — 극단만 거르기(절반 한도) · 10분 안의 중복 · 10컷을 넘으면 촬영 흐름을 묶음으로 나눠 고르기 · 촬영순 · 스타일별 컷 길이와 겹침용 여분 | 미구현 — 신호 문턱값은 로컬 신호와 함께 |
| [auto-edit-draft.md](auto-edit-draft.md) | 고른 스냅 여러 개로 AI 가 고칠 수 있는 무비 초안을 만든다 — 결과는 렌더가 아닌 초안, 구간·경계별 전환까지 사용자가 고친다 | 미구현 — 툴 어휘·무효화 액션(A-7)과 계약·앱(A-11) 선행 |
| [ad-reward-credits.md](ad-reward-credits.md) | 보상형 광고 크레딧 지급 규칙 | 완료, 기본 꺼짐(C-6) |
| [snap-retention-period.md](snap-retention-period.md) | 스냅 서버 보관은 기간 기준 — 업로드 후 15일 만료 (구독 혜택으로 연장할지는 미확정, A-2) | 완료(서버 2026-09-09 · 앱 만료 표시 2026-09-27). 용량 한도 존치는 A-2 |
| [expiry-notice-schedule.md](expiry-notice-schedule.md) | 스냅 만료 예고는 삭제 전 두 번, 정리 배치와 분리된 낮 시간 배치가 보낸다 | 완료(서버 2026-09-09). 앱의 남은 기간 표시는 SNAP-13 |
| [notification-preferences.md](notification-preferences.md) | 알림 설정은 서버에 종류별로 둔다. 스냅 만료 예고에는 종류별 스위치가 없다 | 서버 완료(2026-09-15), 앱 연결 대기(B-6) |
| [local-copy-after-upload.md](local-copy-after-upload.md) | 로컬은 최종적으로 캐시. 삭제를 켜는 것은 렌디션·동기화 검증 후로 연기 | 결정만, 전환 전. reconcile 은 Android 실기기에서 검증됐고 렌디션은 iPhone HEVC 원본의 실기기 확인이 남음. 켤 때 15일 만료와 함께 판단(A-4) |
| [snap-sync-across-devices.md](snap-sync-across-devices.md) | 기기 간 동기화 — 삭제는 모든 기기로 전파(원본 포함), 만료 스냅은 촬영한 기기에 남되 무비에 못 담음, 새 기기는 만료분을 되살리지 않음 | 완료(2026-09-27, Android 실기기 검증) — iPhone 실기기는 iOS 출시 전(A-4) |
| [snap-album-save-and-device-delete.md](snap-album-save-and-device-delete.md) | 스냅의 사용자 사본은 기기 앨범 — 하나씩 저장 + 자동 저장(기본 꺼짐). 보관 중인 스냅은 삭제할 때 "이 기기에서만"(목록에 남고 파일만 지움)과 "모든 기기에서"를 고른다 | 완료(2026-09-29, Android 에뮬레이터 확인) — 휴대폰·iOS 확인은 A-4 |
| [movie-cleanup-after-export.md](movie-cleanup-after-export.md) | 끝내면 결과물 파일만 삭제, 프로젝트는 보존. 다시 만들기는 유료 | 완료(서버 2026-09-09 · 앱 끝내기 2026-09-12, 실기기 미검증) |
| [movie-export-policy.md](movie-export-policy.md) | 무비 세부 규칙 5개 — 촬영순 기본·결과물 교체·스냅 보존·앱 그룹핑·edit-jobs 한 버전 후 폐기 | ①~④ 완료, ⑤ `POST /edit-jobs` 폐기는 다음 릴리스(A-1) |
| [movie-client-cache.md](movie-client-cache.md) | 앱의 무비 스토어는 서버 캐시 + 아웃박스, 무비 id 는 앱이 정한 uuid, `Movie.jobId` 노출 | 완료(2026-09-12), 실기기 미검증(A-1) |
| [movie-ready-notification.md](movie-ready-notification.md) | 무비 완성 알림은 편집 워커가 큐에 넣고 Node 쪽 알림 워커가 발송 | 완료(2026-09-11), 실기기 미검증(A-1) |
| [payment-channel-iap.md](payment-channel-iap.md) | 결제 채널 IAP + RevenueCat, Stripe 제거 | 완료, 스토어 등록 대기(C-1) |
| [credit-payment-model.md](credit-payment-model.md) | 구독 제거, 무비 생성 = 크레딧 100 | 완료 |
| [product-concept.md](product-concept.md) | 제품 방향 — 필름 은유를 걷고 스튜디오(작업대형)를 채택, 이름(스냅·무비·컷·초안 무비·스튜디오·나), 원본/조합 모델, 무비 한 화면·실행 밖 편집·순서 고정 | 완료 |
| [movie-model.md](movie-model.md) | 영상 묶음은 평면 `Video`를 참조하는 `Movie` 엔티티 | 완료(서버 2026-09-09 · 앱 전환 2026-09-12). 세부 규칙은 movie-export-policy |
| [on-prem-deployment.md](on-prem-deployment.md) | 팀 공용 통합 서버를 사내 물리 서버 한 대에 compose 로 올린다 — DB 는 서버 컨테이너(Supabase 는 Auth 전용), 배포는 self-hosted runner | 저장소 쪽 완료(2026-09-15). 서버 작업은 B-1 |
| [env-management.md](env-management.md) | 로컬은 `apps/api/.env`, 운영은 서버 측 주입(플랫폼 시크릿 — 사내 서버는 root 전용 파일) | 완료 |

## 과거 결정 — 일부 또는 전부 대체됨

| 문서 | 상태 |
|---|---|
| [account-deletion.md](account-deletion.md) | 과거 결정 — 결제 모델 전환으로 일부 대체. 삭제 유예 30일은 유효 |
| [storage-and-subscription-policy.md](storage-and-subscription-policy.md) | 과거 결정 — 일부 대체. Free 2GB 한도는 snap-retention-period 가, 무비 30일 보관 + 무료 재생성은 movie-cleanup-after-export 가 대체. 크레딧/구독 2축과 경계 규칙은 유효 |
| [snap-source-of-truth.md](snap-source-of-truth.md) | 과거 결정 — 일부 대체. 스냅 원천을 서버로 옮기는 방향은 유효(SNAP-14, 렌디션·reconcile·Movie 는 구현, 로컬 캐시 전환·휴지통·위치는 A-4). §6 용량 정책(Free 5GB)은 snap-retention-period 가 대체 |

보관된 결정(예: 플랜 차등 보류 `plan-limits`)은 [archive/README.md](../archive/README.md)에 있다.
