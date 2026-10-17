# 결정 문서 인덱스

정책·설계 결정을 담는 디렉터리다. **결정 상태**(결정 · 결정(잠정) · 미결 · 과거 결정)의 원천은 각 문서 상단의
`**상태**` 줄이고, 이 표는 그것을 한곳에 모은 것이다. **구현 상태**는 상태 줄에 쓰지 않는다 — 요구별 원천은
[specs/](../specs/README.md)의 라벨이고, 아래 `구현` 열은 그 요약과 남은 일의 백로그 ID 다
([doc-conventions.md](../doc-conventions.md) §헤더). **문서를 추가하거나 결정·구현 상태가 바뀌면 이 표를 같은
변경에서 갱신한다.**

- **결정 대기(미결)** 문서는 배경·영향 범위·선택지·각 선택의 결과·권장안을 담고, 마지막의 "결정 기록"
  표가 비어 있다. 결정이 나면 같은 파일의 상태 줄과 결정 기록을 채우고, 해당 spec 을 **먼저** 고친다
  ([AGENTS.md](../../AGENTS.md) §문서 갱신 의무). 선례: [movie-model.md](movie-model.md)는 2026-08-10 작성,
  2026-08-11 결정을 같은 파일에 덧붙였다.
- 미결 **작업**은 여기가 아니라 [backlog.md](../backlog.md)에만 둔다. 결정 대기 문서는 "무엇을 고를지"를
  설명할 뿐 작업 목록을 갖지 않는다.

## 결정 대기 — 회의에서 정해야 하는 것

| 문서 | 무엇을 정하나 | 백로그 | 출처 |
|---|---|---|---|
| [subtitle-rendering.md](subtitle-rendering.md) | 자막: 소프트 유지 vs 번인 전환 | A-7 | 2026-08-31 회의 |
| [sns-webhook-scope.md](sns-webhook-scope.md) | "웹훅 연동"이 어느 웹훅을 뜻하는지 | D-1 | 2026-08-31 회의 |
| [sticker-asset-sourcing.md](sticker-asset-sourcing.md) | 스티커 조달 경로 · 등록 경로(관리자 페이지 시점) | A-7 | 2026-08-31 회의 |
| [bgm-sourcing.md](bgm-sourcing.md) | 정식 BGM 조달(AI 생성 · 라이선스 구독 · 커미션) — 법적 검토 6항목 선행. 공모전 기간은 무료 라이선스 9곡으로 잠정 결정(2026-10-15). 워커는 버킷 매니페스트에서 곡을 받고 무비마다 고정한다 — 올린 곡은 아직 없다 | A-7 · E-5 | 2026-08-31 회의 |

각 결정의 착수 순서와, 결정을 기다리지 않고 시작할 수 있는 일:

- **sns-webhook-scope** — 어느 답이든 외부에서 닿는 고정 도메인이 필요하다. 공모전 기간에는 AWS 공모전 서버([aws-contest-server.md](aws-contest-server.md))의
  `https://snaply-api.dweaxai.com` 이 그 조건을 채우고, 공모전이 끝나면 운영 도메인(D-1)이 필요하다 — D-1 은 결정 전에
  시작할 수 있다. 도메인이 있어야 웹훅 · 결제 검증(C-1 · C-6 · D-3)이 이어진다.
- **bgm-sourcing** — 법적 검토 → 조달 → `bgm_tracks` → E-5 해소 순이다. 후보 서비스의 약관 비교표는 결정
  전에 만들 수 있다.
- **sticker-asset-sourcing** — 에셋 조달 → 매니페스트 시드 등록 → (필요해지면) 관리자 페이지 순이다. 에셋
  라이선스 조사는 결정 전에 시작할 수 있다.
- **subtitle-rendering** — 다른 결정과 독립이다.

## 결정 완료 — 현행 정책의 근거

| 문서 | 결정 | 구현 |
|---|---|---|
| [movie-snap-expiry-exemption.md](movie-snap-expiry-exemption.md) | **잠정** — 무비가 참조 중인 스냅도 만료 예외 없음(현행 유지). 다음 회의에서 요금제(A-2)와 함께 C(편집하면 기간 갱신)부터 다시 본다 | 코드 변경 없음(현행) |
| [api-contract-schema-first.md](api-contract-schema-first.md) | API 계약 원천을 `packages/shared-types` Zod 스키마로 통일 | 완료 |
| [snap-content-analysis.md](snap-content-analysis.md) | 스냅 내용 분석(vision) 도입. 법무 검토 전에는 사용자 동의(옵트인)로 켠다(2026-09-29 §6.1) | 분석·동의 완료. 결과는 AI 초안 · 취향에도 쓰인다(2026-10-13). 추천의 생산 활성화는 A-3 |
| [template-snap-recommendation.md](template-snap-recommendation.md) | 템플릿 기반 스냅 자동 추천 — 앱 로컬 매칭 + 서버 추천 2단계, 서버 카탈로그, 무료 추천과 상한, 규칙 기반 점수화. 켜는 조건은 2026-09-29 부터 옵트인 | 완료, 생산 활성화 대기(A-6) |
| [edit-spec-v3.md](edit-spec-v3.md) | editSpec v3·에셋 매니페스트·어휘 사전의 설계 규칙(시드·핀·무효화·큐 분리·사전 로딩) | 어휘 사전 6종 구현(전환·컷 역할은 2026-10-01, 내용 개념은 2026-10-13) · 큐 분리(`edit-v3`)와 v3 `timeline`(컷·경계별 전환) 부분 구현(2026-10-01). 스키마 본문은 [plans/](../plans/README.md) 초안, 확정·파이프라인은 A-7 |
| [transition-director.md](transition-director.md) | 고를 수 있는 전환 v1 다섯과 겹침형의 여분 프레임 규칙. AI 가 경계마다 전환을 고르는 규칙 — 스타일 경향 · 30분 장면 전환 · 두 컷을 키로 한 시드. 여분이 없어 들어가지 않는 `crossfade` 는 `dip` 으로 | 완료(2026-10-01, 편집 화면의 선택·미리보기 포함 — Galaxy 실기기 확인) |
| [edit-director.md](edit-director.md) | AI 편집 초안이 스냅을 고르고 자르는 규칙 — 극단만 거르기(절반 한도) · 10분 안의 중복 · 10컷을 넘으면 촬영 흐름을 묶음으로 나눠 고르기 · 촬영순 · 스타일별 컷 길이와 겹침용 여분 | 구현됨(2026-10-01) — 문턱값은 잠정 |
| [auto-edit-draft.md](auto-edit-draft.md) | 고른 스냅 여러 개로 AI 가 고칠 수 있는 무비 초안을 만든다 — 결과는 렌더가 아닌 초안, 구간·경계별 전환까지 사용자가 고친다. 편집 툴마다 정할 것(툴 카드)과 v1 범위 | 구현됨(2026-10-01, `POST /movie-drafts` · 앱의 자동 편집, Galaxy 실기기 확인) — 거르기·중복 문턱값은 잠정(A-11). §6.3 의 기본 처리 · 색 맞춤은 2026-10-12 구현 |
| [ai-edit-agent.md](ai-edit-agent.md) | AI 편집 초안을 LLM 에이전트가 만든다 — 의도 추론 → 계획 → 기존 디렉터를 툴로 호출 → 검토 · 재시도, 판단은 에이전트 · 실행은 규칙(시드), 계획을 저장(재사용은 저장한 결과 — 2026-10-16 정정), 실패 시 규칙 폴백. 초안은 하루 3회 무료 뒤 1회 20크레딧(2026-10-13, 공모전 주제 Agentic AI) | 구현됨(2026-10-13 — 에이전트 · 초안 과금 · 전환 고르기, 공모전 서버에서 `agent` 모드 확인). 잠정값 실측은 A-12 |
| [ontology-personalization.md](ontology-personalization.md) | 스냅 내용과 취향을 같은 개념 체계(온톨로지)로 — JSON 사전이 원천(OWL/Turtle 은 내보내기), 관심사 부활(`topics`), 행동에서 배우는 개념별 취향(조금씩 · 음수는 감점 · 시간 감쇠), 분석은 요청 시점 유지, 스냅 삭제 시 합산값 유지 · 동의 철회 시 파기, 이유 노출 보류(2026-10-13, 공모전 주제 Ontology AI) | 구현됨(2026-10-13 — 개념 사전 · 관계 · 관심사 · 취향 프로필과 반영 · 스타일 기본값 · 발표용 내보내기, 2026-10-15 템플릿 카드 순서). 잠정값(신호 강도 · 학습률 · 감쇠)은 A-13 |
| [junk-journal-design-system.md](junk-journal-design-system.md) | 앱 화면을 정크 저널 시안(종이 바탕 · 테이프 · 폴라로이드 · 손글씨 제목)으로 바꾼다. 동작 계약은 스펙을 따른다. 대응표의 여섯 가지 — AI 선 색 `lavender-ink` · D2Coding 내장과 Pretendard 400 · 700 만 · 밤 탭 바 `tabbar` · 터치 48dp · 손글씨는 제목에만 · 촬영 · 가져오기는 다크 고정. 캔버스 검토 뒤 글자 단계 15/22 · 17/24 추가 · 촬영 영역 시트도 어두운 무지 · 비활성 입장권은 바랜 종이(2026-10-17) | 착수 전 — 대응표 [plans/junk-journal-redesign.md](../plans/junk-journal-redesign.md), 화면별 모습은 [캔버스](https://claude.ai/artifact/7SURcRJRzVowNeB7WVeFye)(보드 103개), 구현과 캔버스에 없는 화면은 A-15 |
| [ad-reward-credits.md](ad-reward-credits.md) | 보상형 광고 크레딧 지급 규칙 | 완료, 기본 꺼짐(C-6) |
| [snap-retention-period.md](snap-retention-period.md) | 스냅 서버 보관은 기간 기준 — 업로드 후 15일 만료 (구독 혜택으로 연장할지는 미확정, A-2) | 완료(서버 2026-09-09 · 앱 만료 표시 2026-09-27). 용량 한도 존치는 A-2 |
| [expiry-notice-schedule.md](expiry-notice-schedule.md) | 스냅 만료 예고는 삭제 전 두 번, 정리 배치와 분리된 낮 시간 배치가 보낸다 | 완료(서버 2026-09-09). 앱의 남은 기간 표시는 SNAP-13 |
| [snap-trash.md](snap-trash.md) | 지운 스냅은 서버에 사본이 있던 것만 원래 보관 기간이 끝날 때까지 되살린다. 스냅만 돌아온다. 되돌리기 + 최근 삭제 | 완료(2026-10-07, 휴대폰 확인 2026-10-09) — 되돌리기의 다른 기기 반영은 A-4 |
| [notification-preferences.md](notification-preferences.md) | 알림 설정은 서버에 종류별로 둔다. 스냅 만료 예고에는 종류별 스위치가 없다. 서버가 원천이고 위치 · 무비 알림은 기본 꺼짐(2026-10-07). Android 알림 채널은 하나(2026-10-09) | 완료(서버 2026-09-15, 앱 2026-10-07, 채널 2026-10-09) |
| [local-copy-after-upload.md](local-copy-after-upload.md) | 로컬은 최종적으로 캐시. 삭제를 켜는 것은 렌디션·동기화 검증 후로 연기 | 결정만, 전환 전. 렌디션 · reconcile 은 Android 실기기에서 검증됨(iPhone HEVC 원본은 iOS 출시 전). 켤지는 15일 만료와 함께 판단(A-4) |
| [snap-sync-across-devices.md](snap-sync-across-devices.md) | 기기 간 동기화 — 삭제는 모든 기기로 전파(원본 포함), 만료 스냅은 촬영한 기기에 남되 무비에 못 담음, 새 기기는 만료분을 되살리지 않음 | 완료(2026-09-27, Android 실기기 검증) — iPhone 실기기는 iOS 출시 전(A-4) |
| [snap-album-save-and-device-delete.md](snap-album-save-and-device-delete.md) | 스냅의 사용자 사본은 기기 앨범 — 하나씩 저장 + 자동 저장(기본 꺼짐). 보관 중인 스냅은 삭제할 때 "이 기기에서만"(목록에 남고 파일만 지움)과 "모든 기기에서"를 고른다 | 완료(2026-09-29 · 휴대폰 확인 2026-10-09). 만료 전 저장 유도(①B)는 2026-10-12. 남은 것은 SNAP-19 ⑤(F) · iOS 확인(A-4) |
| [movie-cleanup-after-export.md](movie-cleanup-after-export.md) | 끝내면 결과물 파일만 삭제, 프로젝트는 보존. 다시 만들기는 유료 | 완료(서버 2026-09-09 · 앱 끝내기 2026-09-12 · 실기기 확인 2026-10-11). 프로젝트 자동 삭제 킬스위치(파생 결정 3)는 A-1 |
| [movie-export-policy.md](movie-export-policy.md) | 무비 세부 규칙 5개 — 촬영순 기본·결과물 교체·스냅 보존·앱 그룹핑·edit-jobs 한 버전 후 폐기 | 완료(①~④ 2026-09, ⑤ `POST /edit-jobs` 폐기 2026-10-11) |
| [movie-client-cache.md](movie-client-cache.md) | 앱의 무비 스토어는 서버 캐시 + 아웃박스, 무비 id 는 앱이 정한 uuid, `Movie.jobId` 노출 | 완료(2026-09-12, 실기기 확인 2026-10-11) |
| [movie-ready-notification.md](movie-ready-notification.md) | 무비 완성 알림은 편집 워커가 큐에 넣고 Node 쪽 알림 워커가 발송 | 완료(2026-09-11, 휴대폰 확인 2026-10-09) |
| [payment-channel-iap.md](payment-channel-iap.md) | 결제 채널 IAP + RevenueCat, Stripe 제거 | 완료, 스토어 등록 대기(C-1) |
| [credit-payment-model.md](credit-payment-model.md) | 구독 제거, 무비 생성 = 크레딧 100 · AI 초안 하루 3회 무료 뒤 20크레딧(2026-10-13) | 완료 |
| [product-concept.md](product-concept.md) | 제품 방향 — 필름 은유를 걷고 스튜디오(작업대형)를 채택, 이름(스냅·무비·컷·초안 무비·스튜디오·나), 원본/조합 모델, 무비 한 화면·실행 밖 편집·순서 고정 · 2026-10-12 피드 없음 · 버전 없음 · 최대 50초 · 세로 9:16 하나 | 완료 |
| [movie-model.md](movie-model.md) | 영상 묶음은 평면 `Video`를 참조하는 `Movie` 엔티티 | 완료(서버 2026-09-09 · 앱 전환 2026-09-12). 세부 규칙은 movie-export-policy |
| [instagram-app-handoff.md](instagram-app-handoff.md) | Instagram 게시 시트에 "Instagram 앱에서 올리기"(앨범 저장 → Instagram 앱 열기)를 함께 둔다 — Meta 고급 액세스는 회사 비즈니스의 Tech Provider(액세스 인증)가 먼저라 보류했다가 같은 날 진행, 앱은 주식회사 디윅스 소유로 옮김 | 완료(2026-10-12). 이후 액세스 인증을 마치고 검수 제출(2026-10-12) — 결과는 C-8 |
| [aws-contest-server.md](aws-contest-server.md) | 공모전 테스트 서버를 인프라팀 EC2 에 올린다 — GitHub self-hosted runner + GHCR(main 배포만 받음), S3 는 인스턴스 역할, 단독 compose, Secrets Manager → 배포 때 env 파일. **2026-10-09 부터 유일한 배포 대상** — 사내 서버 안은 접었다([archive/on-prem-deployment.md](../archive/on-prem-deployment.md)). 2026-10-11: 운영은 11월까지, S3 영상 백업 없음, 편집 워커 동시성 1 | 완료(첫 배포 2026-10-08 · 휴대폰 한 바퀴 2026-10-09). 남은 일은 iOS 테스터(A-4) · TikTok 게시(C-3) · OpenAI 예산 상한(D-6) |
| [env-management.md](env-management.md) | 로컬은 `apps/api/.env`, 운영은 서버 측 주입(AWS 서버는 Secrets Manager 에서 배포 때 만든 파일) | 완료 |
| [progress-monthly-archive.md](progress-monthly-archive.md) | progress.md 에는 이번 달만 두고 지난달은 `archive/progress-YYYY-MM.md` 로 옮긴다. 보관본은 언제 무엇을 검증했는지의 기록으로 인용할 수 있다(constitution 제7조 단서) | 완료(2026-10-16, 8 · 9월 이동) |

## 과거 결정 — 일부 또는 전부 대체됨

| 문서 | 상태 |
|---|---|
| [account-deletion.md](account-deletion.md) | 과거 결정 — 결제 모델 전환으로 일부 대체. 삭제 유예 30일은 유효 |
| [storage-and-subscription-policy.md](storage-and-subscription-policy.md) | 과거 결정 — 일부 대체. Free 2GB 한도는 snap-retention-period 가, 무비 30일 보관 + 무료 재생성은 movie-cleanup-after-export 가 대체. 크레딧/구독 2축과 경계 규칙은 유효 |
| [snap-source-of-truth.md](snap-source-of-truth.md) | 과거 결정 — 일부 대체. 스냅 원천을 서버로 옮기는 방향은 유효(SNAP-14 — 렌디션·reconcile·Movie·휴지통은 구현, 로컬 캐시 전환·위치는 A-4). §6 용량 정책(Free 5GB)은 storage-and-subscription-policy(2GB)를 거쳐 snap-retention-period(15일)가 대체 |

보관된 결정(예: 플랜 차등 보류 `plan-limits`)은 [archive/README.md](../archive/README.md)에 있다.
