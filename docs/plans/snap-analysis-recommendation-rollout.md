# 스냅 분석 기반 추천 — 실제로 돌게 하고 넓히는 계획

**작성일**: 2026-09-27
**상태**: 제안 — 1단계 진행 중. 회사 OpenAI 키(C-7)는 2026-09-29 에 닫혔고, 스냅 4건 첫 실행은
[progress.md](../progress.md) 2026-09-29
**원천**: 이미 구현된 스냅 분석·템플릿 추천 경로를 실제 모델로 돌리고, 추천이 쓰이는 곳을 넓히는 순서
**관련 문서**: [decisions/snap-content-analysis.md](../decisions/snap-content-analysis.md) ·
[decisions/template-snap-recommendation.md](../decisions/template-snap-recommendation.md) ·
[specs/template-and-recommendation.md](../specs/template-and-recommendation.md) ·
[모바일 템플릿 기능 문서](../../apps/mobile/docs/features/movie-templates.md) ·
[모바일 무비 화면 문서](../../apps/mobile/docs/features/movie.md)

---

## 0. 이 문서의 범위

**담는 것**: 지금 상태의 진단, 단계 순서, 단계마다 무엇을 보고 다음으로 넘어가는지.

**담지 않는 것**

- **미결 항목**: [backlog.md](../backlog.md)의 A-3·A-6·A-9·D-2에만 둔다(§5). 이 문서에 체크리스트를 만들지 않는다.
- **확정된 결정**: 단계를 진행하면서 결정이 바뀌면(예: §4.2의 분석 시점) 해당 `decisions/` 문서를
  갱신한다. 이 문서는 제안이지 현행 사실이 아니다.

---

## 1. 이름 정리

오너가 말하는 "무비 만들 때의 `useInterest`"는 코드상 **두 개의 다른 기능**이다. 둘 다 지금은
사용자에게 효과가 없다.

| 코드 | 무엇인가 | 상태 |
|---|---|---|
| `useInterests` · `useToggleInterest` · `INTEREST_OPTIONS` (`apps/mobile/src/features/notification-settings`) | 나 탭의 관심사 태그(`여행`·`일상`·`카페`·`맛집`·`감성`) | 읽는 곳이 없어 `준비 중` (backlog A-9) |
| `useTemplateRecommendation` (`apps/mobile/src/features/fill-template`) + `POST /videos/:id/analysis` + `POST`/`GET /movie-recommendations` | 스냅 프레임을 분석해 내용을 파악하고, 템플릿 슬롯에 넣을 스냅을 추천 | 양쪽 구현 완료, 플래그로 꺼짐 (backlog A-3·A-6) |

"사용자가 올린 스냅을 빠르고 간결하게 분석해 무비에 자동 추천"은 두 번째다. 이 계획은 두 번째를
살리고 넓히며, 관심사는 4단계(§4.4)에서 거기에 연결한다.

---

## 2. 지금 상태 — 구현됐지만 끝까지 돈 적이 없다

| 구성 | 하는 일 |
|---|---|
| 분석 워커 (`apps/ai-worker/src/analysis_worker.py`) | 대표 프레임 최대 4장(유사 프레임 제거 후)을 `detail: low` 로 OpenAI vision 에 보내 `summary`·`topics`·`places`·`objects`·`actions`·`moods`·`visualQuality`·`confidence` 를 받아 `video_analyses` 에 `videoId`+버전 단위로 캐시 |
| 추천 API (`apps/api/src/services/movie-recommendation.service.ts`) | 접수 시 후보 분석을 적재하고, 폴링 시 규칙 기반으로 채점해 슬롯 배정(`recommendation/score-slots.ts`) |
| 앱 (`use-template-recommendation.ts`) | 로컬 매칭이 먼저 화면을 채우고, 서버 추천이 도착하면 사용자가 손대지 않은 슬롯에 얹는다 |

제대로 동작하지 않는 이유는 다섯 가지다.

1. **`MOVIE_RECOMMENDATION_ENABLED` 가 기본 꺼짐**이다. 서버는 503 을 주고, 앱은 오류 없이 로컬 매칭을
   유지하므로 **꺼져 있다는 사실이 화면에 드러나지 않는다.**
2. **로컬 `apps/api/.env` 에 `OPENAI_API_KEY` 가 없다.** 키가 없으면 분석 워커는 기동 단계에서
   스스로 종료된다(의도된 동작).
3. **실제 모델 응답으로 끝까지 돌린 적이 없다**([progress.md](../progress.md) 2026-08-19). 통합 테스트는
   분석 결과 행을 직접 만들어 채점 경로만 검증했다. 운영 모델(`OPENAI_VISION_MODEL` 기본값)도 잠정값이다.
4. **템플릿 경로에만 붙어 있다.** 새 무비(스냅 골라 만들기)의 "AI 배치"는 촬영 시각 정렬이 전부이고
   분석 결과를 읽지 않는다([movie.md](../../apps/mobile/docs/features/movie.md) `arranger`).
5. **첫 추천이 느리다.** 분석은 추천 요청 시점에만 돌기 때문에 후보(최대 `MAX_RECOMMENDATION_CANDIDATES`)를
   `VIDEO_ANALYSIS_CONCURRENCY` 동시성으로 분석할 때까지 기다린다. 마감 시한은 `SCORING_DEADLINE_MS` 다.

---

## 3. 방향 — 새로 만들지 않는다

분석은 이미 "빠르고 간결하게"를 목표로 설계돼 있다: 프레임 4장 이하, 저해상도, 오디오 미전송,
스키마 고정 JSON 한 번. 없는 것은 **이 설계가 실제 스냅에서 충분히 빠르고 맞는지의 증거**다. 그래서
순서는 ① 실제 모델로 돌려 숫자를 얻고 ② 그 숫자로 속도를 조정한 뒤 ③ 추천이 쓰이는 곳을 넓힌다.
1단계의 실측값이 2~4단계의 모든 판단(모델, 분석 시점, 어디에 쓸지)의 입력이다.

---

## 4. 단계

### 4.1 1단계 — 실제 모델로 끝까지 돌린다 (C-7 선행)

- **준비**: 회사 키를 `apps/api/.env` 의 `OPENAI_API_KEY` 에 넣고, **개발 환경에서만**
  `MOVIE_RECOMMENDATION_ENABLED=true` 로 켠다. `docker compose up -d analysis-worker` 가
  `video-analysis 워커 시작` 로그를 남기는지 확인한다.
- **입력**: 팀원 폰으로 찍은 스냅 30~100편. 카테고리(음식·셀카·반려동물·빠른 움직임·야간·역광·흔들림·
  초점 불량·유사 프레임·중간 장면 전환)를 의도적으로 채운다(평가셋 결정은 [snap-content-analysis.md](../decisions/snap-content-analysis.md) §1).
  팀 촬영분만 쓰므로 생산 활성화의 법무 선행 조건(§4.5)과 무관하게 진행할 수 있다. 원본 영상·추출 프레임·
  모델 원문 응답은 저장소에 커밋하지 않는다(같은 결정 §5).
- **자동 측정**: `video_analyses` 집계로 처리시간·토큰·실패율·모델별 비교를 낸다([snap-content-analysis.md](../decisions/snap-content-analysis.md) §9.3).

  ```sql
  SELECT model_version, prompt_version, status,
         count(*)                                                                    AS n,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM completed_at - started_at)) AS p50_sec,
         percentile_cont(0.9) WITHIN GROUP (ORDER BY extract(epoch FROM completed_at - started_at)) AS p90_sec,
         avg(input_tokens)  AS avg_in,
         avg(output_tokens) AS avg_out,
         avg(cardinality(frame_timestamps_ms)) AS avg_frames
  FROM video_analyses
  GROUP BY model_version, prompt_version, status;
  ```

- **사람 채점**: 요약의 사실성 · 핵심 사물/행동 포함률 · 환각 비율 · `usableForEdit` 정확도.
- **앱 경로**: 시뮬레이터나 실기기에서 템플릿 화면을 열어 추천이 도착하고 병합되는지 본다. 도착까지
  걸린 시간이 2단계의 기준값이다.
- **비교**: 잠정 모델과 저비용 모델 하나. 프레임 4장·`low` 는 고정한다. 변수를 하나로 제한해야
  "운영 모델을 무엇으로 고정할지"에 답할 수 있다.
- **산출**: 스냅당 지연·단가, 운영 모델 후보, 1단계에서 드러난 결함 수정.

### 4.2 2단계 — 빠르고 간결하게

- **분석 자체를 줄인다**: 프롬프트 v2 로 출력 토큰을 줄이고(`VIDEO_ANALYSIS_PROMPT_VERSION` 올림),
  프레임 4장과 2장을 비교하고, 키의 rate limit 이 허락하는 만큼 `VIDEO_ANALYSIS_CONCURRENCY` 를 올린다.
- **분석 시점을 다시 연다**: 지연에 가장 크게 영향을 준다. 현행 결정([snap-content-analysis.md](../decisions/snap-content-analysis.md) §3)은
  "업로드 시 전량 분석은 버려질 스냅까지 과금한다"는 이유로 요청 시점 분석을 택했다. 그때는 단가
  실측이 없었다. 1단계 단가를 보고 셋 중 하나를 고른다.

  | 선택지 | 첫 추천 대기 | 비용 |
  |---|---|---|
  | 현행 — 추천 요청 시점 | 후보 분석이 끝날 때까지 | 편집 의사를 밝힌 후보만 |
  | 외출이 확정될 때 그 외출의 스냅만 선분석 | 대부분 0 | 템플릿을 열지 않은 외출분이 낭비 |
  | 업로드 직후 전량 | 0 | 업로드량에 비례 |

  바꾸면 스펙 ANA-1 을 **구현보다 먼저** 고치고, 결정 문서 §3 을 기각안과 함께 갱신한다.
- **넘어가는 기준**: 템플릿 화면에 들어간 뒤 추천이 도착하기까지의 시간.

### 4.3 3단계 — 추천이 쓰이는 곳을 넓힌다

"무비에 자동 추천"이 구체적으로 무엇인지가 여기서 정해진다.

| 선택지 | 내용 | 필요한 것 |
|---|---|---|
| (a) 템플릿 슬롯 채우기 | 이미 있는 기능 | 1·2단계만 |
| (b) 새 무비에 반영 | 스타일 프리셋(`감성`/`여행`/`일상`) 추천, 못 쓰는 컷(`usableForEdit=false`) 제외 제안, AI 배치 개선 | 새 무비 경로는 지금 서버 추천을 부르지 않으므로 새 계약이 필요 — `packages/shared-types` Zod 계약 · `openapi.json` · [api-spec.md](../api-spec.md) |
| (c) 스튜디오의 무비 초안 제안 | 최근 외출 하나로 무비 초안 자체를 제안 (A-6 후속 후보, [2026-08-31 회의](../meetings/2026-08-31-dev-sync.md) §5 "AI 추천 프로젝트") | 서버는 촬영 시각(`capturedAt`, SNAP-10)을 알아 시간 기준 묶음은 서버도 할 수 있다. 다만 현행 외출 규칙(시간 + 거리)은 좌표가 있는 앱만 계산한다 — 서버는 위치를 모른다([template-snap-recommendation.md](../decisions/template-snap-recommendation.md) §6) |

**권장은 (b)의 스타일 추천이다.** 모델이 만든 문구를 사용자에게 보여주지 않는다는 원칙(ANA-2·REC-2)을
지키면서 결과가 화면에 드러나고, 관심사 태그 5개 중 3개가 `STYLE_PRESETS` 와 이름이 같아
4단계와 바로 이어진다. 어느 선택지든 추천은 크레딧을 차감하지 않는다(REC-3).

### 4.4 4단계 — 관심사 연결 (A-9)

- **관심사의 출처**: 사용자가 고르는 태그로 둘지, 분석된 `topics` 를 모아 추정할지 정한다. 추정이면
  분석 결과를 사용자에게 노출하지 않는다는 원칙([snap-content-analysis.md](../decisions/snap-content-analysis.md) §2)과
  충돌하지 않는 표현이 필요하다.
- **소비처**: 템플릿 카드 순서, 새 무비 기본 스타일의 사전값(3단계 (b)).
- **앱**: 동기화·`준비 중` 걷기·편집 화면 복구의 구현 항목은 [backlog.md](../backlog.md) A-9 에만 둔다.

### 4.5 5단계 — 운영에서 켠다

선행 조건은 D-2 의 법무 항목(약관·개인정보처리방침 법무 검토, 광고 누락)과 A-3 의 운영 모델 고정,
A-6 의 상한값 재조정, 서버 시크릿 주입(B-8)이다. **법무 검토는 코드가 아니라 리드타임이 가장
길기 때문에 1단계와 동시에 시작한다.**

---

## 5. 미결 항목은 backlog 에 있다

| 단계 | backlog 항목 |
|---|---|
| 1단계 선행 — 회사 키 발급 | C-7 (2026-09-29 닫음) |
| 1·2단계 — 실측·운영 모델·분석 시점 | A-3 |
| 3단계 — 소비처 결정·상한 재조정 | A-6 |
| 4단계 — 관심사 | A-9 |
| 5단계 — 활성화 | D-2·A-6 (법무·플래그), B-1 (시크릿 주입) |
