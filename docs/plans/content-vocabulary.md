# 스냅 내용 어휘 — 자유 문자열 매칭을 개념 사전으로 바꾸는 계획

**작성일**: 2026-10-07
**상태**: 제안 — 현행 사실이 아니다. 사전 초안은 [content-vocabulary-draft.json](content-vocabulary-draft.json)
**원천**: 분석 결과의 장소·사물·행동·주제를 닫힌 개념 사전으로 바꾸는 방법과, 바꾸기 전후를 가르는 매칭 테스트(오탐·미탐)의
계획. 미결은 [backlog.md](../backlog.md) A-6 에만 둔다
**관련 문서**: [decisions/template-snap-recommendation.md](../decisions/template-snap-recommendation.md) §7 ·
[decisions/snap-content-analysis.md](../decisions/snap-content-analysis.md) §9.1(`visualIssues` 를 코드로 닫은 이유) ·
[decisions/edit-director.md](../decisions/edit-director.md) §6 · [`cut-role-vocabulary.json`](../../packages/shared-types/src/cut-role-vocabulary.json) ·
[snap-analysis-recommendation-rollout.md](snap-analysis-recommendation-rollout.md) §4.1 ·
[`score-slots.ts`](../../apps/api/src/services/recommendation/score-slots.ts) ·
[`prompt.py`](../../apps/ai-worker/src/pipeline/video_analysis/prompt.py)

---

## 0. 범위

**담는 것**: 지금 매칭의 진단, 사전 초안의 모양과 시드 힌트를 옮기는 표, 분석값을 개념으로 바꾸는 규칙, 테스트 계획, 착수 순서.

**담지 않는 것**: 가중치(`SCORE_WEIGHTS`) 조정 · 분석 모델 선택(A-3) · 관심사의 쓰임새(A-9, §6 에 연결만 적는다).

---

## 1. 진단 — 지금은 부분 문자열로 맞춘다

분석은 `places`·`objects`·`actions`·`topics` 를 "한국어 명사구로 짧게" 쓴 자유 문자열로 돌려주고(`prompt.py`), 템플릿 채점은
슬롯 힌트와 분석값을 **양방향 부분 문자열**로 맞춘다(`score-slots.ts` `matchesAny`). 시드 힌트에는 한 글자가 많다 — 장소
`집`·`역`·`강`·`산`·`차`·`길`, 사물 `문`·`담`·`창`·`잔`·`손`, 행동은 어간 `들`·`타`·`보`·`먹`·`걷`.

아래 표는 2026-10-07 에 지금 코드(`scorePair` 의 키워드 몫)와 초안 사전(§3·§4 규칙을 흉내 낸 임시 스크립트)으로 각각 돌린 결과다.
분석값은 모델이 낼 법한 값을 골랐고, **관측** 표시만 개발 DB 의 실제 분석에서 나온 값이다.

**오탐 — 맞으면 안 되는데 맞는다**

| 필드 | 힌트 (슬롯 예) | 분석값 | 현행 | 초안 |
|---|---|---|---|---|
| places | 집 (walk/start) | 맛집 | 맞음 | `restaurant` → 0 |
| places | 강 (walk/view) | 강의실 | 맞음 | `school` → 0 |
| places | 역 (trip/leave) | 역사 박물관 | 맞음 | `exhibition` → 0 |
| places | 산 (trip/main) | 공원 산책로 | 맞음 | `trail` → 0 |
| places | 차 (trip/leave) | 주차장 | 맞음 | 사전 밖 → 0 |
| objects | 잔 (cafe/sip) | 잔디 | 맞음 | 사전 밖 → 0 |
| objects | 손 (cafe/sip) | 손님 | 맞음 | 사전 밖 → 0 |
| objects | 담 (walk/alley) | 담요 **관측** | 맞음 | `bedding` → 0 |
| objects | 문 (cafe/front) | 신문 | 맞음 | 사전 밖 → 0 |
| objects | 창 (cafe/room) | 창고 | 맞음 | 사전 밖 → 0 |
| objects | 나무 (walk/view) | 나무 테이블 | 맞음 | `table` → 0 |
| actions | 들 (cafe/sip) | 친구들과 대화하기 | 맞음 | `talk` → 0 |
| actions | 타 (trip/leave) | 기타 연주하기 | 맞음 | 사전 밖 → 0 |
| actions | 보 (trip/main) | 보고서 작성하기 | 맞음 | 사전 밖 → 0 |
| actions | 보 (trip/main) | 스마트폰 보기 **관측** | 맞음 | 사전 밖 → 0 |
| actions | 돌아 (walk/back) | 주변 돌아보기 | 맞음 | `look_around` → `walk` 힌트에 0 |

**미탐 — 맞아야 하는데 안 맞는다**

| 필드 | 힌트 | 분석값 | 현행 | 초안 |
|---|---|---|---|---|
| objects | 커피 | 아메리카노 · 라떼 | 안 맞음 | `coffee` → 1 |
| objects | 디저트 | 마카롱 | 안 맞음 | `dessert` → 1 |
| places | 카페 | 커피숍 | 안 맞음 | `cafe` → 1 |
| places | 바다 | 바닷가 · 해변 | 안 맞음 | `sea` → 1 |
| places | 식당 | 음식점 | 안 맞음 | `restaurant` → 1 |
| places | 가게 | 편의점 · 빵집 | 안 맞음 | 하위 개념 → 1 |
| places | 풍경 | 야경 | 안 맞음 | `scenery` → 1 |
| actions | 걷 | 산책하기 | 안 맞음 | `walk` → 1 |
| actions | 먹 | 식사하기 | 안 맞음 | `eat` → 1 |

**지금 맞고 계속 맞아야 하는 것**: 골목 ↔ 좁은 골목길, 커피 ↔ 아이스 커피, 마시 ↔ 커피 마시기 — 초안에서도 1.

**관측**: 개발 DB 의 분석 7건(`gpt-5.6-luna`, 프롬프트 v1, 모두 실내 스냅 — 거실·소파·책상)의 값을 시드 힌트 전체와 맞추면 3쌍이 맞고, 그중
2쌍이 위 표의 오탐이다(`담요`, `스마트폰 보기`). 나머지 하나는 `실내` ↔ cafe/room `실내` 다. 표본이 작고 한쪽으로 치우쳐 있어
비율로 일반화하지 않는다 — 일반화할 수 있는 수는 §5.4 에서 잰다.

**컷 역할도 같은 뿌리다.** AI 편집 초안은 `places` 가 비어 있지 않으면 가운데 컷을 `establish` 로 정한다(edit-director §6). 장소는
거의 언제나 적히므로(관측 7건 중 6건이 `places` 를 적었고 그중 4건이 `실내` 다) 가운데 컷이 대부분 `establish` 가 된다. v1 에서 가운데 컷의 역할은
길이를 바꾸지 않아 지금은 드러나지 않는다.

---

## 2. 사전 초안

[content-vocabulary-draft.json](content-vocabulary-draft.json). 채택 전에는 `packages/shared-types/src` 에 두지 않는다 — 워커의
`tests/test_vocabulary.py` 가 그 디렉터리의 `*-vocabulary.json` 을 기동 필수 목록과 맞추므로, 두는 순간 워커가 검증하며 뜬다.

- **개념**은 필드(`places`·`objects`·`actions`·`topics`) 안에서 id 로 구분한다. `label` 하나와 `aliases`(같은 개념의 다른 표기)를
  가진다. places 의 `car`(차)와 objects 의 `tea`(차)는 필드가 달라 따로 있을 수 있다. 같은 필드 안에서 한 별칭은 한 개념에만 있다.
- **상위 개념은 하나다**(트리). 카페는 가게이고, 노을은 하늘이고, 바다·산·공원은 풍경이다.
- **화면에 보이는 것만 넣는다.** 프롬프트가 이미 "프레임에서 실제로 보이는 것만 적는다"이다. 출발·도착·돌아오기 같은 여정의
  사건은 3초 프레임으로 걷기와 구분되지 않아 넣지 않는다 — 슬롯의 `temporalPrior` 가 이미 그 자리를 맡는다.
- **상태·구도는 장소가 아니다.** `실내`·`외관` 은 넣지 않는다. 실내·실외 구분이 필요해지면 장소 개념이 아니라 별도 속성으로 둔다.
- `roleAffinity` 는 그 개념이 보이는 컷이 맡기 좋은 컷 역할이다. 하위 개념이 물려받는다. 매칭에는 쓰지 않는다(§6 의 5).
- **규모**: places 37 · objects 37 · actions 13 · topics 8. 출처는 시드 힌트 전부와, 개발 DB 관측값 중 자주 나올 것(거실·소파·
  책상·스마트폰·아이 등)이다.

### 2.1 시드 힌트를 개념으로 옮기는 표

`walk/hero` 는 힌트가 없어 그대로다. `temporalPrior` 는 바뀌지 않는다.

| 슬롯 | places | objects | actions | topics |
|---|---|---|---|---|
| walk/start | home · station · entrance | door · stairs · exit | — | walk |
| walk/alley | alley · street · residential_area | wall · stairs | walk | walk |
| walk/shop | shop · market | signboard · display_window | — | — |
| walk/view | scenery · park · river | tree · building · sunset · sky | — | — |
| walk/back | street · alley | — | walk | — |
| day/morning | home · bedroom · kitchen · cafe | coffee · window · bedding | — | — |
| day/noon | office · school · cafe · street | — | — | — |
| day/evening | restaurant · street · home | sunset · lighting | — | — |
| day/closing | home · bedroom | lighting | — | — |
| cafe/front | cafe · shop · entrance | signboard · door | — | cafe |
| cafe/menu | cafe | menu | — | cafe |
| cafe/drink | cafe | coffee · drink · cup · cake · dessert | show | cafe · dessert |
| cafe/room | cafe | seat · chair · table · lighting · window | — | cafe |
| cafe/sip | cafe | cup · hand | drink · hold | cafe |
| trip/leave | station · train · bus · car · road | window · seat | ride · move | travel |
| trip/arrive | station · entrance · square · street | signboard | — | travel |
| trip/main | tourist_spot · sea · mountain · park · exhibition | — | look_around | travel · sightseeing |
| trip/food | restaurant · cafe | food · bowl · coffee · cup | eat | food_spot |
| trip/wide | scenery · sea · mountain | building · sky | — | travel |
| trip/home | station · car · road | window | — | travel |

옮기면서 바뀌는 것:

- **빠진다**: `실내`(cafe/room) · `외관`(cafe/front) — 상태·구도. `나서`·`출발`(walk/start) · `도착`(trip/arrive) ·
  `돌아`(walk/back · trip/home) — 여정의 사건.
- **필드가 바뀐다**: `하늘` places → objects(walk/view) · `입구` objects → places(cafe/front).
- **합쳐진다**: 담·벽 → `wall` · 메뉴판·메뉴·가격표·칠판 → `menu` · 잔·컵 → `cup` · 진열장·쇼윈도 → `display_window` ·
  가게·상점·매장 → `shop` · 풍경·전망 → `scenery` · 구경·보 → `look_around` · 길·거리 → `street`.
- **뜻이 좁혀진다**: walk/start 의 `지하철` → `subway_station`(출구 쪽 뜻) · `보여` → `show` · `들` → `hold`.

힌트 수가 줄면 keyword 점수(맞은 힌트의 평균)의 분모가 바뀐다. 가중치는 이 계획에서 건드리지 않고 §5.4 실측에서 본다.

---

## 3. 분석값을 개념으로 바꾸는 규칙

**권장: 분석 출력은 그대로 두고, API 가 채점할 때 사전으로 개념을 찾는다(정규화기).**

1. 앞뒤 공백을 지우고 연속 공백을 하나로 만든 값 **전체가 별칭**이면 그 개념이다(`카페 투어` → topics `cafe`).
2. 아니면 낱말을 **오른쪽부터** 본다. 한국어 명사구·동사구는 머리가 끝에 오므로 처음 맞는 낱말이 그 값의 개념이다
   (`나무 테이블` → `table`, `역사 박물관` → `exhibition`).
3. 머리가 아닌 낱말은 끝의 조사를 하나 떼어 남은 것이 별칭이면 받는다(places `바다에서 수영` → 머리 `수영` 은 사전 밖,
   `바다에서` → `바다` → `sea`). **머리 낱말은 조사를 떼지 않는다** — 떼면 `대학 강의` 의 `강의` 가 `강` 이 된다.
4. 맞는 것이 없으면 **사전 밖**이다. 매칭에 쓰지 않고 집계에만 남긴다(§5.4).

부분 문자열은 보지 않는다. 그래서 위 오탐이 사라지고, 별칭이 미탐을 푼다.

**그대로 받는 대가**

- 값 하나는 개념 하나다. `한강 공원` 은 `park` 이고 `river` 는 잃는다(지금은 `강` 에도 맞는다). walk/view 는 `park`·`scenery`
  로 여전히 맞아 슬롯 단위로는 잃지 않는다.
- 사전 밖 값은 맞지 않는다. 지금 맞는 관측값 `실내` 도 맞지 않게 된다(§2.1 에서 힌트도 빠진다).
- **필드 혼동은 못 고친다.** 관측에서 모델은 places 에 `책상`, topics 에 `컴퓨터`·`소파` 를 적었다. 정규화기는 필드 안에서만 찾는다.

**다른 길 — 모델이 개념을 고른다.** 구조화 출력(`strict` JSON Schema, 지금 쓰고 있다)의 `enum` 으로 필드마다 개념 label 을 고르게
하면 정규화기가 필요 없고 필드 혼동도 스키마가 막는다. 그러나 프롬프트 버전이 올라 쌓인 분석을 다시 돌려야 하고(`analysis_version`
캐시), 사전 밖이 보이지 않는다 — 모델이 가까운 개념에 억지로 맞추거나 비운다. 사전을 넓힐 근거가 사라지므로, 정규화기로
사전 밖 비율을 낮춘 **뒤에** 검토한다.

---

## 4. 매칭 규칙

슬롯 힌트의 개념 H 와 스냅의 개념 A 를 잰다.

| 관계 | 예 (힌트 ← 스냅) | 점수 |
|---|---|---|
| 같다 | `cafe` ← 커피숍 | 1 |
| A 가 H 의 하위 | `shop` ← 편의점 · `sky` ← 붉은 노을 | 1 |
| A 가 H 의 상위 | `cafe` ← 가게 | 0.5 (잠정) |
| 그 밖(형제 포함) | `cafe` ← 음식점 | 0 |

힌트 하나의 점수는 스냅 개념 중 가장 높은 값이고, keyword 점수는 지금처럼 힌트 점수의 평균이다. 나머지 항(화질·시간·확신도)과
게이트·배정은 바꾸지 않는다.

**재사용 키에 사전 버전을 넣는다.** 추천 결과는 `(userId, templateId, 후보 집합 해시)` 로 24시간 재사용되는데
(`candidateHashOf`), 해시에 규칙 버전이 없다. 사전을 바꾼 뒤 하루 동안 예전 결과가 돌아오지 않게 `contentVocabularyVersion` 을
넣는다 — AI 편집 초안이 재사용 키에 `EDIT_DIRECTOR_VERSION` 을 넣는 것과 같다(edit-director §8).

---

## 5. 테스트 계획

### 5.1 1단계 — 지금 동작을 고정한다(사전 도입 전, 지금 넣을 수 있다)

- `apps/api/test/recommendation-score.test.ts` 에 describe 를 하나 더한다. `matchesAny` 는 내보내지 않으므로 기존 "부분 문자열로
  맞춘다" 테스트처럼 `scorePair` 의 키워드 몫(맞으면 `SCORE_WEIGHTS.keyword`, 아니면 0)으로 잰다. DB 없는 순수 테스트다.
- §1 의 표(오탐 16 · 미탐 12 · 유지 3)를 **현행 결과로** 고정하고, 사례마다 사전 도입 뒤의 기대값을 주석으로 남긴다
  (AGENTS.md "테스트" — 현행 동작을 고정한 테스트에는 되돌릴 기대값을 적는다).
- 이렇게 두는 이유: 사전을 들이는 변경에서 이 테스트들이 뒤집히는 것이 곧 변경의 증거이고, 어느 사례가 뒤집혔는지가 diff 로 보인다.
  고칠 수 없는 것을 미리 실패 테스트(`it.fails`)로 두면 CI 가 그 실패에 익숙해진다.

### 5.2 2단계 — 사전의 정합성(사전을 `shared-types` 로 옮길 때)

다른 사전과 같은 방식이다 — TS(`apps/api/test/content-vocabulary.test.ts`)와 워커(`tests/test_content_vocabulary.py`,
`pipeline/vocabulary.py` 의 `REQUIRED` 에 등록)가 같은 파일을 같은 규칙으로 본다.

- 같은 필드 안에서 별칭(label 포함)이 한 개념에만 있다
- `parent` 가 같은 필드에 있고 순환이 없다
- `roleAffinity` 가 [`cut-role-vocabulary.json`](../../packages/shared-types/src/cut-role-vocabulary.json) 의 역할이다
- `fields` 가 분석 스키마(`schema.py` `LIST_FIELDS`)의 매칭 필드와 같다
- 시드 카탈로그의 `match_hints` 개념 id 가 모두 사전에 있다 — 카탈로그를 읽는 DB 통합 테스트(`movie-templates.test.ts`)에 둔다.
  마이그레이션과 사전이 어긋나면 그 힌트는 조용히 0점이 된다

### 5.3 3단계 — 정규화기와 매칭 규칙(사전 도입 변경과 같은 변경)

순수 함수 테스트다.

- **정규화**: 전체 일치(`카페 투어`) · 머리부터(`나무 테이블` → `table`) · 머리 아닌 낱말의 조사(`소파에`) · 머리 낱말은 조사를
  떼지 않음(`대학 강의` → 사전 밖) · 부분 문자열을 보지 않음(`맛집` 은 `home` 이 아님) · 필드 범위(`차`: places `car`, objects `tea`) ·
  사전 밖 → 없음
- **관계**: §4 표의 네 줄
- **§5.1 의 사례를 뒤집는다**: 같은 표의 기대값을 사전 도입 후 값으로 바꾼다
- **기존 불변식**: 키워드가 하나도 맞지 않아도 시간순보다 나빠지지 않는다 · 같은 입력이면 같은 배정 · 못 쓸 스냅은 슬롯을 채우지
  않는다 — 지금 테스트가 그대로 통과해야 한다
- **재사용 키**: 사전 버전이 바뀌면 같은 후보라도 재사용하지 않는다(`movie-recommendations.test.ts`, DB 테스트)

### 5.4 4단계 — 실측(A-3 의 팀 스냅 실측에 얹는다)

§1 의 사례는 대부분 고른 값이다. 모델이 그런 값을 실제로 얼마나 내는지는 실측으로만 안다.

- **표본**: A-3 의 팀 스냅 30~100편 분석 결과(`video_analyses`). 원문 응답·프레임은 커밋하지 않는다(snap-content-analysis §5).
- **잴 것**
  - 필드별 사전 안 비율 — 2026-10-07 개발 DB 7건에서는 서로 다른 값 기준으로 places 1/3 · objects 9/23 · actions 5/9 · topics 2/14
    였다. 실내 스냅만이라
    템플릿 힌트 위주의 사전에서 낮게 나왔고, topics 에는 모델이 사물(컴퓨터·소파)을 적는 일이 많았다
  - 슬롯 × 스냅 매칭 쌍을 현행 규칙과 초안 규칙으로 각각 뽑아 사람이 옳고 그름을 표시 → 규칙별 **오탐 쌍 수**와 **놓친 쌍 수**
  - 사전 밖 값의 빈도 상위 — 사전에 넣을 후보
- **도입 기준(제안)**: 초안 규칙의 오탐이 현행보다 적고, 놓친 쌍이 현행보다 많지 않을 때 들인다.

---

## 6. 착수 순서

1. **§5.1 현행 고정 테스트** — 제품 코드를 바꾸지 않는다. 지금 할 수 있다
2. **§5.4 실측** — A-3 의 팀 스냅 실측과 같이 돌린다. 사전 밖 값으로 초안을 고친다
3. **사전 확정** — `packages/shared-types/src/content-vocabulary.json` 으로 옮기고 TS 로더와 §5.2 를 더한다. 이 초안 파일은 지운다
4. **정규화기 · 매칭 규칙 · 힌트 마이그레이션 · 재사용 키 버전 · §5.3** — 한 변경이다. 시드 힌트는 마이그레이션의 `UPDATE` 로
   바꾼다(template-snap-recommendation §3). 같은 변경에서 그 결정 문서 §7 의 `keyword` 정의를 고친다. 사용자 가시 계약(REC-1~4)은
   바뀌지 않아 spec 은 그대로다
5. **(선택) 컷 역할** — `roleAffinity` 로 edit-director §6 의 판정을 바꾼다. `EDIT_DIRECTOR_VERSION` 을 올리고 그 결정 문서를 고친다
6. **(선택) 모델이 개념을 고른다** — §3 의 다른 길. 사전 밖 비율이 충분히 낮아진 뒤
7. **관심사(A-9)** — 관심사를 이 사전의 `topics` 에서 고르게 하면 템플릿 정렬·슬롯 가중에 쓸 곳이 생긴다. 쓸지는 A-9 에서 정한다

---

## 7. 기각한 대안

| 대안 | 기각 이유 |
|---|---|
| 힌트 목록만 늘린다 | 미탐은 줄지만 오탐은 그대로이고, 짧은 힌트가 늘수록 오탐도 는다. 같은 동의어를 슬롯마다 반복해야 한다 |
| 부분 문자열을 두고 한 글자 힌트만 막는다 | `잔`·`손`·`담` 같은 오탐은 줄지만 `나무 테이블`·`주변 돌아보기` 처럼 두 글자 이상의 오탐과 미탐 전부가 남는다 |
| 형태소 분석기 | `친구들과` 의 `들` 같은 오탐 일부는 줄지만 동의어·상위어(커피숍 ↔ 카페, 편의점 ↔ 가게)는 풀지 못한다. API 에 의존성이 는다 |
| 임베딩 유사도 | 동의어는 잘 잡지만 매칭마다 모델이 필요하고(추천 경로에 모델 호출을 더하지 않는다 — template-snap-recommendation §7), 점수가 불투명해 회귀를 잡을 수 없다 |
| RDF/OWL · 그래프 DB | 개념 100개 안팎의 트리에는 과하다. 지금의 `*-vocabulary.json` 방식(TS·워커 공유, 정합성 테스트)으로 충분하다 |
| 상위 개념을 여럿 둔다(DAG) | 카페는 가게이면서 실내일 수 있다. 그러나 실내·실외는 장소가 아니라 속성이라 따로 풀 문제이고, 트리면 관계 판정이 단순하다 |
