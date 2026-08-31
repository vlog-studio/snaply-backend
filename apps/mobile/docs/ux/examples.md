# Before / after examples

Thirteen worked cases. They are **illustrative**, not an audit of the current build: the "before" side is a realistic composite of common failure shapes, written so the reasoning is transferable. Before citing a case against a real screen, verify the screen's actual state against [`../features/README.md`](../features/README.md) and the code.

Each case uses the same shape: Before wireframe → Problems (smell names) → Applied principles → After wireframe → Why → Trade-off. Weight levels (`L1`…) follow [`visual-hierarchy.md`](visual-hierarchy.md).

An "after" is a recommendation, so it must never stand on a concept the product has since dropped — a reader cannot tell a proposal from a fossil, and an agent will build what it reads. When a shipped screen or its vocabulary changes, correct the affected "after" and state what changed and why (case 1 is the worked example of that correction). A "before" may keep a dead concept: it is the rejected design.

---

## 1 — Studio (home tab)

**Before**
```text
[스튜디오]
  대형 배너: "AI로 나만의 브이로그를 만들어보세요"   ← W1 decoration
  [템플릿으로 시작]  [스냅 담기]  [무비 보기]         ← three filled buttons
  담긴 스냅: 6
  작업 중인 무비 (2)  ...
  최근 완성 (5)  ...
```
**Problems** — `Decorative Weight` (banner outranks everything), `Competing CTA` (three peers), `Narrating Screen`, `Flat Hierarchy` (the deciding fact, 6 snaps, sits at W5).

**Applied principles** — 1 One Thing per Page, 3 Action First, 9 Clear Visual Hierarchy, 13 Show State Not Instructions.

**After** (what shipped)
```text
[스튜디오]
  L2  [새 무비 · 스냅 고르기]      ← single primary, the whole row is the target
  L3  템플릿으로 시작 (카드 목록)   ← section, not a peer button
  L4  무비 — 미완성 먼저, 앞의 3편 + 전체 보기 →
        · 무비가 하나도 없으면 이 블록 자체가 없음
  [removed] banner → no user decision depended on it
```
**Why** — Cognitive Load at entry drops to one action; the banner and the three peer CTAs are gone. Templates stay discoverable as a section (Discoverability preserved), so nothing was truncated.

**Trade-off** — Template start loses its button-level prominence, costing template-first users one extra glance. Accepted because picking snaps is the majority path; revisit if template starts dominate.

> **This After was revised once.** Its first version led with `담긴 스냅 6` as L1 — "the deciding state" — because the 담기 트레이 made *how much material is waiting* a single readable number. The tray was removed on 2026-08-12: picks become a draft movie immediately, so that number no longer exists and the board's unfinished-first ordering carries "what is waiting" instead. The principles the case demonstrates are unchanged; only the fact available to lead with is. Do not reintroduce `트레이` from this example ([`ux-writing.md`](ux-writing.md)).

---

## 2 — Snap library, empty

**Before**
```text
[스냅]
  (빈 화면)
  "스냅은 3초 또는 5초 길이의 짧은 영상이에요.
   스냅을 모아 무비를 만들 수 있어요.
   아래 카메라 버튼을 눌러 첫 스냅을 찍어보세요."
```
**Problems** — `Narrating Screen` (three teaching lines), `Hidden Primary` (the action is described, not offered), `Orphan State` (one empty state serves both "nothing yet" and "load failed").

**Applied principles** — 13, 3, 16 Errors Are Design Failures First.

**After**
```text
[스냅]
  L1  아직 스냅이 없어요
  L2  [첫 스냅 찍기]   [영상에서 가져오기]
  (load failed 변형)  불러오지 못했어요   [다시 시도]
  (filter empty 변형) 조건에 맞는 스냅이 없어요   [필터 지우기]  ← filter chips stay visible
```
**Why** — Interaction Cost falls from "read, then find the tab bar button" to one tap. Three distinct empty causes now produce three distinct, actionable states.

**Trade-off** — First-time users no longer get told what a snap is; the concept must be carried by the capture flow itself. That is the correct place for it.

---

## 3 — Place detail

**Before**
```text
[장소]
  카페 이름
  주소 · 좌표 37.5665, 126.9780      ← internal precision
  이 장소의 스냅 12개  ...
  [알림 설정]                         ← mystery CTA
  방문 기록 (지난 6개월) ...            ← premature
  [삭제]  ← same weight as 알림 설정
```
**Problems** — `Leaky Vocabulary` (raw coordinates), `Mystery CTA` (`알림 설정`), `Premature Information` (visit history above the fold), `Competing CTA` with a destructive action at equal weight.

**Applied principles** — 12 Speak the User's Domain, 4 Outcome-Oriented CTA, 7 Progressive Disclosure, 9.

**After**
```text
[장소]
  L1  카페 이름
  L2  이 장소 근처에 오면 알려드릴까요?   [알림 받기]
  L3  주소 · 이 장소의 스냅 12
  --- fold ---
  L4  이 장소의 스냅 (grid)
  L5  방문 기록 →                       ← deferred behind one tap
  W6  장소 삭제                          ← separated, quiet, named object
```
**Why** — Predictability: the CTA states the outcome, and the question is answerable from the user's own life. Error Prevention: delete no longer sits beside a frequent action.

**Trade-off** — Visit history costs one tap for the small group who came for it.

---

## 4 — Location permission

**Before**
```text
(앱 첫 실행 직후)
[위치 권한이 필요합니다]
  "정확한 서비스 제공을 위해 위치 정보 접근 권한이 필요합니다.
   백그라운드 위치 접근을 항상 허용해 주세요."
  [허용하기]                     ← only button
```
**Problems** — `Cost Before Value` (asked at launch, nothing seen yet), `Dead End` (no decline), `System-Centric Question` (background access as the user's problem), `Narrating Screen`.

**Applied principles** — 8 Value Before Cost, 15 Preserve User Control and Exit, 2 Easy to Answer.

**After**
```text
(user just saved a place, and can see it)
  L1  이 장소 근처에 오면 알려드릴까요?
  L3  근처에 왔을 때 한 번만 알려드려요
  L2  [알림 받기]        [안 받기]
       → yes → OS 위치 권한 프롬프트 (foreground first)
       → 항상 허용은 이 기능을 켤 때만 별도로 요청
  (declined) 장소는 저장돼요. 알림은 [나]에서 켤 수 있어요.   ← state, one line
```
**Why** — The request now follows visible value and is phrased as a fact the user holds. Declining keeps the feature reachable, so User Control is intact and the permission can be re-asked honestly later.

**Trade-off** — Fewer grants at launch, and the geofence feature activates later in the lifecycle. Accepted: a denied OS permission is far more expensive to recover than a deferred ask.

---

## 5 — Notification permission

**Before**
```text
[무비] 탭 진입 즉시 바텀시트
  "알림을 허용하시겠습니까?"   [설정으로 이동]
```
**Problems** — `Unpredictable Jump` (sheet on entry — a published Toss prohibition), `Mystery CTA`, `Cost Before Value`.

**Applied principles** — 14 Predictable Transitions, 8, 4.

**After**
```text
(generation just started; progress visible)
  L1  만드는 중 · 1분 정도 걸려요
  L2  [다 만들어지면 알려주기]     [괜찮아요]
```
**Why** — The value is on screen, the cost is one answerable question, and the ask is caused by the user's own action rather than by arriving somewhere.

**Trade-off** — Users who never generate a movie are never asked. Correct: they have nothing to be notified about.

---

## 6 — Capture

**Before**
```text
[촬영 설정]
  길이: ( ) 3초  ( ) 5초
  화질: ( ) 표준  ( ) 고화질
  "손가락을 떼면 녹화가 멈춰요"
  [촬영 시작] → 다음 화면에서 뷰파인더
```
**Problems** — `Decision Dump` + `System-Centric Question` (화질 tiers), `Over-Split Flow` (a setup screen before the camera), `Hidden Primary`, `Narrating Screen`.

**Applied principles** — 3 Action First, 6 Reduce Decision Cost, 5 Smart Default, 13.

**After**
```text
[/capture]  full-screen viewfinder
  L1  live viewfinder
  L2  press-and-hold shutter (accessibility label: 길게 눌러 스냅 찍기)
  L3  3초 | 5초   ← inline while idle, current one marked
  W6  ✕ (→ 스튜디오)
  quality: product policy, no control
```
**Why** — Time-to-record drops by a screen; the only remaining decision is answerable and reversible; quality became policy because the user could not evaluate it in outcome terms.

**Trade-off** — Users who wanted quality control lose it. Reinstate only as an expert setting in `나`, never on the capture path.

---

## 7 — Movie generation options

**Before**
```text
[무비 만들기]
  스타일: (미선택)    길이: (미선택)    순서: (미선택)
  음악: (미선택)      전환: (미선택)    자동 자르기: [ ]
  모델: standard / advanced
  [확인]
```
**Problems** — `Decision Dump` (six unset required inputs), `System-Centric Question` (model tiers), `Mystery CTA`, `Recall Tax` (no summary of what is being generated).

**Applied principles** — 5 Smart Default, 6, 2, 4, 22-pattern (costly action).

**After**
```text
[무비]  draft state
  L1  컷 6개 · 15초
  L3  스타일  기본 ▾        ← default applied, visible, one tap to change
  L3  순서    찍은 순서 ▾
  L2  [AI로 생성 시작]  · 1분 정도 걸려요     ← cost adjacent to the commit
  L5  세부 조정 →           ← music, transitions, per-cut trim
  policy: model, auto-cut
```
**Why** — Two visible decisions instead of six, both defaulted and both answerable; the summary line removes recall; the cost is stated before the commit rather than discovered after it.

**Trade-off** — Power users reach music and transitions through one disclosure. Acceptable because this project's model puts refinement *after* generation.

---

## 8 — Generation in progress

**Before**
```text
[생성 중]
  전체 화면 스피너
  "job queued (position 3) · stage: frame-interp"
  (back gesture blocked)
```
**Problems** — `Leaky Vocabulary`, `Dead End` (back blocked, no exit), `Orphan State` (no meaningful progress), `Hidden Cost` (duration never stated).

**Applied principles** — 12, 15, 11-pattern (loading), 12-pattern (long-running).

**After**
```text
[무비]  generating state
  L1  progress ring · 만드는 중
  L3  1분 정도 걸려요 · 나가도 계속 만들어요
  L2  [다 만들어지면 알려주기]   ← notification ask, in context
  W6  그만두기
  (완료) 결과가 바로 재생 · [공유하기]
```
**Why** — The user can leave without losing work (User Control), knows the wait, and lands directly on the result. Three internal stages collapsed into one honest state.

**Trade-off** — Less visible detail about what the pipeline is doing; that detail never helped a user decision.

---

## 9 — Settings (`나`)

**Before**
```text
[나]
  프로필
  알림  |  위치  |  업로드  |  계정  |  저장공간  |  실험실  |  정보
   (모두 동일 무게, 알파벳 순)
  [로그아웃]  [계정 삭제]        ← adjacent, equal weight
```
**Problems** — `Flat Hierarchy` (no ranking), `Navigation Maze` (frequent settings equal to rare ones), destructive adjacency, `Leaky Vocabulary` (`실험실`, `업로드`).

**Applied principles** — 9, 10 Obvious Navigation, 6, 12.

**After**
```text
[나]
  L1  프로필 (이름 · 스냅 수 · 무비 수)
  L3  알림
        이 장소 근처 알림      [on]
        무비 완성 알림         [on]
  L3  스냅
        와이파이에서만 올리기  [on]
  L4  계정
  L5  정보
  W6  로그아웃
  W6  계정 삭제               ← separated from 로그아웃 by a section break
  [renamed] 업로드 → 스냅 / 실험실 → removed from view until it ships
```
**Why** — Frequency-ordered, grouped by the user's mental model, each toggle named by what it does. Destructive actions are findable but no longer neighbours of a routine one.

**Trade-off** — Deliberate density in a settings screen; this is `Density Where Density Pays`, not a violation.

---

## 10 — Profile stats

**Before**
```text
[나]
  스냅 128  무비 12  총 재생시간 00:42:13  스토리지 1.2GB
  평균 생성 시간 74.3s   실패율 4.1%      ← system metrics
```
**Problems** — `Leaky Vocabulary` / `Premature Information` (operational metrics as user-facing stats), no decision depends on most of it.

**Applied principles** — 12, 7, 13.

**After**
```text
[나]
  L1  프로필 이름
  L2  스냅 128 · 무비 12
  L5  이번 달에 무비 3개 만들었어요
  [removed] 평균 생성 시간, 실패율 → belong to internal telemetry
  [moved] 스토리지 → 계정 섹션, where the delete action lives
```
**Why** — Stats now say something the user recognizes; the one number tied to an action (storage) sits next to that action.

**Trade-off** — Curious users lose numeric detail. Reintroduce only if a user decision depends on it.

---

## 11 — Generation failure

**Before**
```text
[다이얼로그]
  "오류가 발생했습니다. (generation_failed: 422)"
  [확인]     → 확인 후 draft가 사라짐
```
**Problems** — `Blaming Error` shape (code as headline, no fix), `Dead End`, work loss, wrong component (dialog for a retryable failure).

**Applied principles** — 16, 15, 15-pattern (failure), 16-pattern (retry).

**After**
```text
[무비]  failed state, draft intact
  L1  무비를 만들지 못했어요
  L2  [다시 시도]
  L5  계속 안 되면 문의하기 →      ← after repeated failure only
  (transient network cause known) 인터넷 연결이 불안정해요  [다시 시도]
  diagnostics: under 문의하기, copyable
```
**Why** — The draft survives, the fix is one tap at the failure site, and the message is in the user's language with no blame. Diagnostics remain available for support without being the message.

**Trade-off** — We sometimes cannot name the cause; saying so honestly beats inventing one.

---

## 12 — Onboarding

**Before**
```text
4-slide carousel: "스냅이란?" → "트레이란?" → "무비란?" → "권한 허용"
  [다음] [다음] [다음] [모두 허용]
```
**Problems** — `Cost Before Value` (concepts and permissions before any use), `Mystery CTA`, `Narrating Screen`, `Dead End` (no skip).

**Applied principles** — 8, 10-pattern (onboarding), 4, 15.

**After**
```text
(첫 실행)
  L1  viewfinder, 바로 촬영 가능
  L3  길게 눌러 스냅 찍기      ← one-time hint at the point of use, dismissible
  (첫 스냅 후) 스냅 1개 카운터가 튀고 뷰파인더 유지 — 스냅은 라이브러리에 쌓이고,
              무비로 엮는 것은 스냅 탭에서 하는 별개의 행위
  권한: 촬영 시점에 카메라, 그 외는 각 기능을 켤 때
  건너뛰기: always available
```
**Why** — The product teaches itself by being used; the vocabulary is learned from labels attached to real objects the user just made.

**Trade-off** — Users never see a feature overview. Coverage of less obvious features shifts to their own entry points, which is where discovery should happen anyway.

---

## 13 — Snap library search and filter

**Before**
```text
[스냅]
  [🔍] [⚙] [↕]              ← three unlabeled icons
  (필터 적용 중이지만 표시 없음)
  결과 없음
```
**Problems** — `Phantom Affordance` (unlabeled icons), `Silent Automation` (active filter invisible), `Orphan State` (bare zero-results), `Inconsistent Twin` (filter and sort behind similar icons).

**Applied principles** — 9, 15, 11 Consistent Interaction Pattern, 20/21-patterns.

**After**
```text
[스냅]
  L3  [🔍 검색]                       ← labeled, opens focused field
  L3  chips: [이번 주 ✕] [장소: 카페 ✕]   ← active filters visible and removable
  L4  day-grouped grid (기본: 최신순)
  (zero results) 조건에 맞는 스냅이 없어요   [필터 지우기]
  sort: 최신순 / 오래된순 toggle only (하나뿐인 대안이므로 시트 불필요)
```
**Why** — The screen now reports its own state: the user can see why results are missing and remove the cause in one tap. Icons gained labels, so Discoverability and accessibility both improve.

**Trade-off** — Chips consume vertical space when filters are active. Justified: an invisible filter is the more expensive failure.
