# 구현 계획 인덱스

착수 전 구현 계획을 담는 디렉터리다. **계획은 제안이며 현행 사실이 아니다** — 현행 동작은 코드와
[specs/](../specs/README.md), 확정한 규칙은 [decisions/](../decisions/README.md)가 원천이다.
**계획을 추가하거나 옮기면, 또는 계획의 일부가 구현되면 이 표를 같은 변경에서 갱신한다.**

- **수명은 구현 시작까지다.** 구현되면 코드·문서가 근거로 인용하는 살아 있는 설계·결정은 `decisions/`로,
  완료 기록은 [progress.md](../progress.md)로 옮기고, 계획은 상단 배너를 붙여 [archive/](../archive/README.md)로
  보낸다([doc-conventions.md](../doc-conventions.md)).
- 미결 작업은 [backlog.md](../backlog.md)에만 둔다. 계획에는 체크리스트나 "남은 일" 목록을 두지 않고 백로그 ID 로 가리킨다.
- 각 계획의 `**상태**` 줄은 `제안` 이다. 어디까지 구현됐는지는 아래 표의 상태 열이 요약하고, 근거는
  [progress.md](../progress.md)의 같은 날짜 항목이다.

| 문서 | 무엇을 제안하나 | 상태 | 백로그 | 따르는 결정 |
|---|---|---|---|---|
| [trend-editing-pipeline.md](trend-editing-pipeline.md) | 트렌드 숏폼 편집 파이프라인의 층별 설계(분석 · 자막·스티커·전환 표현 · 소스·출력), `bgm_tracks`, 스티커 팩 운영, 오픈소스·라이선스 선정, 구현 순서. 아래 v3 스키마 초안들의 상위 계획 | 일부 구현 — 공유 어휘 사전, HDR 톤매핑(`pipeline/hdr.py`), 산출물 계약 테스트(`tests/test_ffmpeg_contract.py`, CI `REQUIRE_FFMPEG=1`), v3 를 Movie export 에 붙이기(§2.4) | A-7 · E-5 · F | [edit-spec-v3.md](../decisions/edit-spec-v3.md) · 결정 대기 [subtitle-rendering.md](../decisions/subtitle-rendering.md) · [bgm-sourcing.md](../decisions/bgm-sourcing.md) · [sticker-asset-sourcing.md](../decisions/sticker-asset-sourcing.md) |
| [edit-spec-v3.md](edit-spec-v3.md) | editSpec v3 의 필드 정의 — `seed`·`intent`·`assetRefs`·`music`·`timeline`·`overlays`·`grade`·`audio`·`userEdits`·`provenance`, 무효화 사전의 레이어 바인딩 | 일부 구현 — `timeline` 의 컷·경계 전환과 `edit-v3` 큐(2026-10-01, 모양이 초안과 다르다 — 문서 상단 배너), 어휘 사전 5종(앵커 · 스테이지·시드 · 무효화 · 전환 · 컷 역할) | A-7 · A-11 | [edit-spec-v3.md](../decisions/edit-spec-v3.md) |
| [asset-pack-manifest.md](asset-pack-manifest.md) | 스티커·LUT·효과음·BGM·폰트·세이프에어리어 팩의 레지스트리·매니페스트·스타일 번들 스키마, 재렌더·상태·라이선스·캐싱 규칙 | 제안 — 매니페스트·레지스트리·번들은 없다. §9 가 쓰는 앵커 어휘와 검증 함수(`isValidAnchorAffinity`·`isValidFallbackChain`), 전환 어휘만 있다 | A-7 | [edit-spec-v3.md](../decisions/edit-spec-v3.md) §2·§3 · 결정 대기 [sticker-asset-sourcing.md](../decisions/sticker-asset-sourcing.md) · [bgm-sourcing.md](../decisions/bgm-sourcing.md) |
| [edit-recipe-tools.md](edit-recipe-tools.md) | AI 편집 초안(MOV-21·MOV-22)이 쓸 편집 툴 — 툴 카드, v1 툴 목록, 컷 역할, 툴보다 먼저 필요한 신호, 착수 순서 | 일부 구현(2026-10-01) — v1 전환 5종(사전·렌더·편집 화면 미리보기), 여분 프레임 규칙(§1.1, `editor.edit_timeline`), 컷 역할 사전, 로컬 신호(`video_signals`), 초안 제안 API(`POST /movie-drafts`) | A-11 · A-7 | [auto-edit-draft.md](../decisions/auto-edit-draft.md) · [transition-director.md](../decisions/transition-director.md) · [edit-director.md](../decisions/edit-director.md) |
| [snap-analysis-recommendation-rollout.md](snap-analysis-recommendation-rollout.md) | 이미 구현된 스냅 분석·템플릿 추천을 실제 모델로 돌려 실측하고, 속도를 줄이고, 추천이 쓰이는 곳을 넓히는 5단계 | 일부 구현 — 1단계 첫 실행(스냅 4건, 2026-09-29), 3단계 (b)를 넓힌 AI 편집 초안(2026-10-01) | A-3 · A-6 · A-9 · A-11 · D-2 | [snap-content-analysis.md](../decisions/snap-content-analysis.md) · [template-snap-recommendation.md](../decisions/template-snap-recommendation.md) · [auto-edit-draft.md](../decisions/auto-edit-draft.md) |
| [content-vocabulary.md](content-vocabulary.md) (사전 초안 [content-vocabulary-draft.json](content-vocabulary-draft.json)) | 분석값과 슬롯 힌트의 부분 문자열 매칭을 닫힌 개념 사전(정규화기 · 트리 관계 매칭)으로 바꾸는 방법과 테스트 계획 | 제안 — 착수 전 | A-6 | [template-snap-recommendation.md](../decisions/template-snap-recommendation.md) §7 · [edit-director.md](../decisions/edit-director.md) §6 |

수명이 끝나 보관한 계획(영상 분석 · IAP 전환 · 스냅 reconcile · editSpec v3 착수 등)은
[archive/README.md](../archive/README.md)에 있다.
