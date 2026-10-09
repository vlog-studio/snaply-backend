# AI 가 경계마다 전환을 고르는 규칙

**작성일**: 2026-10-01
**상태**: 결정 — §2 의 폴백은 오너가 정했고(2026-10-01), §0 의 전환 범위와 §1 의 규칙 값은 v1 이다
**원천**: 경계마다 고를 수 있는 전환의 범위와 겹침형의 여분 프레임 규칙(§0), 사용자가 고르지 않은 경계(`owner: ai`)에
서버가 어떤 전환을 넣는지와, 넣은 전환이 컷에 들어가지 않을 때 무엇으로 바꾸는지. 코드는
[`transition-director.ts`](../../apps/api/src/services/transition-director.ts)의 `STYLE_RULES`·`SCENE_GAP_MS`와
[`transition-vocabulary.json`](../../packages/shared-types/src/transition-vocabulary.json)(종류·길이 범위·`fallback`)
**관련 문서**: [specs/movie.md](../specs/movie.md) MOV-6 · MOV-22 · [auto-edit-draft.md](auto-edit-draft.md) §2.3 · §6 ·
[edit-spec-v3.md](edit-spec-v3.md) §5 · 툴 계획(보관) [archive/edit-recipe-tools.md](../archive/edit-recipe-tools.md)

---

## 0. 전제 — 고를 수 있는 전환과 겹침형의 여분 프레임

(2026-10-09 plans/edit-recipe-tools.md §1.1·§2.1·§2.4 에서 옮김 — [보관 원문](../archive/edit-recipe-tools.md))

전환의 이름·성격(`timing`)·길이 범위와 기본값·폴백·걸침 비율(`split`)·easing·색·배율과 사용자에게 보이는 이름(`label`)은
[`transition-vocabulary.json`](../../packages/shared-types/src/transition-vocabulary.json)이 원천이다. 여기에는 그 범위를
정한 기준만 둔다.

### 0.1 고를 수 있는 전환은 v1 다섯이다

경계마다 고를 수 있는 전환은 편집 화면이 미리 보여줄 수 있는 것뿐이다([auto-edit-draft.md](auto-edit-draft.md) §2.3).
툴을 넣는 기준은 [auto-edit-draft.md](auto-edit-draft.md#62-v1-에-넣는-기준) §6.2 다.

| kind | 모습 | 성격 | 편집 화면 미리보기 |
|---|---|---|---|
| `hardcut` | 바로 넘어간다 | 경계형 | 그대로. 모든 폴백의 끝이다 |
| `crossfade` | 겹쳐 녹아든다 | 겹침형(§0.2) | 두 플레이어의 불투명도 |
| `dip` | 검정으로 잠깐 어두워졌다 밝아진다 | 경계형 | 검정 오버레이 |
| `flash` | 흰색으로 번쩍한다 | 경계형 | 흰 오버레이 |
| `zoompunch` | 다음 컷이 살짝 확대된 채 들어와 제자리로 간다 | 경계형 | 스케일 애니메이션. 배율 상한은 §0.3 |

- **경계형**은 각 컷 안에서 끝나 여분 프레임이 필요 없고, **겹침형**은 두 컷의 프레임을 섞는다(§0.2).
- **겹침형은 하나로 먼저 검증한다.** 두 영상을 동시에 그려야 해서 플랫폼마다 결과가 다르다 — Android 는 페이드하는
  플레이어를 감싼 뷰에 그 동안만 `renderToHardwareTextureAndroid` 를 켜야 아래 영상이 검게 나오지 않았다
  ([progress.md](../progress.md) 2026-09-28 · 2026-10-01). 미리보기 무대는 `apps/mobile/src/pages/movie/ui/cut-player.tsx` 다.

v1 에 넣지 않은 전환:

| kind | 모습 | 성격 | 넣지 않은 이유 |
|---|---|---|---|
| `slide` | 다음 컷이 밀고 들어온다 | 겹침형 | 미리보기는 된다(2026-09-28 iOS 시뮬레이터 · Android 에뮬레이터). 겹침형을 `crossfade` 하나로 먼저 검증하기로 했다 |
| `whip` | 휙 패닝하며 흐려진다 | 겹침형 | 흐림을 앱 미리보기로 그리기 어렵고, 움직임 방향 신호가 필요하다 |

### 0.2 겹침형 전환은 컷 구간 밖의 여분 프레임을 쓴다

겹침형(`timing: overlap` — v1 에서는 `crossfade`)은 컷 구간 밖의 **여분 프레임**(트림으로 잘려 나간 앞뒤)을 쓴다.
경계를 가운데에 두고 나가는 컷은 구간 끝 뒤로, 들어오는 컷은 구간 시작 앞으로 전환 길이의 절반씩 늘려 겹친다.
그래서 사용자가 자른 구간은 전부 보이고 **무비 길이는 컷 길이의 합**이다(MOV-22).

- **길이의 상한**은 양쪽 여분 프레임의 두 배와 양쪽 컷 길이 중 가장 짧은 것이다. 컷 길이를 넣는 것은 한 컷에 섞이는
  몫이 그 컷의 절반을 넘지 않게 해 컷의 가운데를 온전히 보이게 하려는 것이다. 상한이 사전의 최소 길이보다 짧으면
  폴백(§2)이다. 해석은 `resolveTransition`(`packages/shared-types/src/transition.ts`)과 `resolve_transition`
  (`apps/ai-worker/src/pipeline/transition.py`)이 하고, 앱 미리보기와 렌더가 같은 답을 내도록 공용 픽스처
  `packages/shared-types/fixtures/transition-resolution.json` 으로 고정한다. 렌더는 `edit-v3` 큐의 `editor.edit_timeline` 이다.
- **AI 는 여분을 만들어 둔다** — 겹침형을 쓸 경계에서 구간을 조금 안쪽으로 잡는다([edit-director.md](edit-director.md) §3 의 앞뒤 여분).
- **전환을 바꿔도 컷은 움직이지 않는다.** 무비 길이가 컷 길이의 합이라 컷 시각이 그대로다. 그래서 무효화 사전의
  `transition-edit` 은 `timeline.cuts` 를 `preserved` 로 두고, 스티커·자막도 따라 움직이지 않는다
  ([`invalidation-vocabulary.json`](../../packages/shared-types/src/invalidation-vocabulary.json)).
- **이렇게 정한 이유** — 경계별 전환 전의 편집기는 crossfade 를 두 컷 **안에서** 겹쳤다. `POST /edit-jobs`(v2) 경로는
  지금도 그렇다(`apps/ai-worker/src/pipeline/editor.py` 의 `_crossfade`). 그러면 무비가 짧아지고 컷의 앞뒤가 섞인다 —
  `감성` 의 0.8초 crossfade 면 3초 스냅 가운데 컷은 1.4초만 온전히 보이고, 10컷이면 7.2초가 줄어든다. 사용자가 구간을
  자를 수 있게 되면(MOV-22) 이 방식은 **사용자가 자른 구간을 전환이 먹는다.** 여분이 없을 때 v2 처럼 컷 안에서 겹치는
  안을 기각한 이유는 §3 이다.

### 0.3 원본 해상도가 줌 계열의 상한이다

앱 촬영은 720p 다([capture-flow.md](../../apps/mobile/docs/features/capture-flow.md)). 세로 출력(`short_vertical` 1080×1920,
`apps/ai-worker/src/pipeline/render_spec.py`)에서 이미 1.5배 확대된 상태라, 1.2배 줌을 더하면 1.8배가 되어 뭉개진다.
그래서 `zoompunch`(와 나중의 컷 안 `zoom` — [auto-edit-draft.md](auto-edit-draft.md#63-v1-툴과-나중으로-둔-툴) §6.3)의
배율은 원본 해상도로 제한하고, 720p 원본에는 **1.1 이하**다. 값은 사전의 `zoompunch.scaleFrom` 이고, 상한은
`apps/api/test/transition-vocabulary.test.ts` 가 고정한다.

## 1. 고르는 규칙

모든 무비의 `ai` 경계에 적용된다(MOV-22). 위에서부터 처음 맞는 규칙을 쓴다.

| 순서 | 조건 | 일상 | 감성 | 여행 |
|---|---|---|---|---|
| 1 | **장면 전환** — 두 스냅의 촬영 시각이 30분 이상 떨어짐 | `dip` 400 | `dip` 600 | `flash` 200 |
| 2 | **첫 경계** — 첫 컷에서 본론으로 | (가중치) | (가중치) | `zoompunch` 300 |
| 3 | 그 밖 — 같은 장면 안, 시드로 뽑는다 | `hardcut` | `crossfade` 800 (80%) · `dip` 500 (20%) | `hardcut` (70%) · `zoompunch` 300 (20%) · `flash` 200 (10%) |

- **스타일은 경향을 정한다.** 스타일 카드의 설명과 맞춘다 — 일상 "컷 편집", 감성 "부드러운 전환", 여행
  "빠른 컷 전환". 감성의 0.8초 `crossfade` 와 일상·여행의 `hardcut` 은 경계별 전환 전 프리셋이 모든 경계에
  넣던 값이라, 같은 장면에서는 이전과 대체로 같은 결과가 나온다.
- **장면 전환은 섞지 않는다.** 시간이 흘렀다는 표시라 검게(여행은 번쩍) 끊어 준다. 간격은 절댓값으로 본다 —
  사용자가 순서를 거꾸로 놓아도 장면이 바뀐 것은 같다. 촬영 시각이 없는 스냅은 업로드 시각으로 대신한다
  (SNAP-10, 촬영순 정렬과 같은 기준).
- **시드는 경계의 위치가 아니라 두 컷**이다 — `sha256("{movieId}:edit-director:0:{from}>{to}#{n}")` 의 상위
  8바이트(빅엔디언, 스테이지 사전과 같은 규약). 다른 곳의 순서를 바꿔도 이어진 채 남은 두 컷은 같은 전환을
  받는다. `n` 은 같은 두 스냅이 한 무비에서 몇 번째로 이어졌는지다. `attempt` 는 0 이다 — "다시 생성"이 생기면
  올린다(무효화 사전 `user-regenerate`).
- **컷 길이는 입력이 아니다.** 트림은 전환을 다시 고르지 않는다(무효화 사전 `cut-trim`). 들어가지 않는 전환은
  해석 단계의 폴백(§2)이 맡는다 — 구간을 조금 고쳤다고 AI 가 고른 전환이 바뀌면 사용자는 이유를 모른다.
- **다시 고르는 때**: `ai` 경계는 컷 목록이나 스타일이 저장될 때마다 다시 고른다. 같은 입력이면 같은 값이라
  이어진 두 컷과 스타일이 그대로면 결과도 그대로다.

## 2. 들어가지 않는 `crossfade` 는 `dip` 이 된다

`crossfade` 는 컷 구간 밖의 여분 프레임을 쓴다(§0.2).
그런데 앱은 컷을 기본으로 잘라 두지 않아, **트림하지 않은 컷에는 여분이 없다** — 2026-10-01 개발 DB 의 컷은
전부 트림이 없었다. 폴백이 `hardcut` 이면 감성 무비의 전환 대부분이 사라져, 경계별 전환 전(프리셋이 컷 안에서
겹치던 v2)보다 결과가 거칠어진다.

그래서 `crossfade` 가 사전의 최소 길이(200ms)보다 짧아지면 **`dip`(기본 400ms)으로 다시 해석**한다. `dip` 은
각 컷 안에서 끝나 여분이 필요 없고, 섞이지는 않지만 부드럽게 넘어간다. `dip` 마저 들어가지 않는 짧은 컷이면
`hardcut` 이다. 고른 값(`crossfade`)은 그대로 남아 트림으로 여분이 생기면 돌아온다.

## 3. 기각한 대안

| 대안 | 기각 이유 |
|---|---|
| 폴백을 `hardcut` 으로 둔다 | 트림하지 않은 컷이 대부분이라 감성의 부드러운 전환이 거의 사라진다. "전환이 아예 없다"는 처음 문제로 돌아간다 |
| 여분이 없으면 v2 처럼 컷 안에서 겹친다 | 사용자가 자른 구간의 끝이 전환에 가려지고 무비가 짧아진다. MOV-22 와 무효화 사전(`transition-edit` 은 컷을 움직이지 않는다)을 다시 고쳐야 한다 |
| AI 가 여분이 있는 경계에서만 `crossfade` 를 고른다 | 컷 길이·구간을 입력으로 삼게 되어 트림이 전환을 바꾼다(`cut-trim` 은 `retimed`). 폴백은 고른 값을 남기므로 이 문제가 없다 |
| 모델(vision 분석)로 장면을 읽어 고른다 | 분석에 동의하지 않은 사용자에게는 없는 기능이 된다(REC-4·ANA-5). 선택은 규칙과 시드로 하고 모델은 내용 인식에만 쓴다(auto-edit-draft.md §3). 분석 신호는 초안(MOV-21)에서 얹는다 |
| 경계마다 무작위로 고른다(시드 없이) | 같은 무비를 열 때마다, 다른 컷을 고칠 때마다 전환이 바뀐다 |
