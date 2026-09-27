# Before / after examples

Thirteen worked cases, each in the same shape: Before → Problems (smell names) → Applied principles → After → Why → Trade-off. The Before is a realistic composite of a common failure shape, written so the reasoning is transferable; it may keep a concept the product has dropped, because it is the rejected design.

Each After is one of three kinds, and every case says which:

- **Shipped** — the app's own answer (cases 1, 2, 4, 6–11). The After is a link to the feature document that owns the screen plus a one-line summary, not a wireframe: the current screen is described there, and a copy here would drift from it.
- **Proposal** — a recommended After the app has not built (case 5).
- **Hypothetical** — no such screen exists; the case is kept for its reasoning (cases 3, 12, 13).

A Proposal or Hypothetical After must never stand on a concept the product has dropped — a reader cannot tell a proposal from a fossil, and an agent will build what it reads. Before citing any case against a real screen, verify the screen's state against [`../features/README.md`](../features/README.md) and the code.

In wireframes, `L1`–`L5` order the blocks by importance to the current step, as in the Step 8 template of [`screen-analysis.md`](screen-analysis.md#step-8--revised-structure). They are not the weight levels of [`visual-hierarchy.md`](visual-hierarchy.md), which assign each element's visual weight (exactly one `W1`); a `W`-level in a wireframe, such as `W6` for a recessive element, is that weight.

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

**After** — shipped: [Studio](../features/studio.md#user-goal). One whole-block `스냅 골라 새 무비` leads; the templates and then the movie board follow as lower-weight sections; the banner is gone.

**Why** — Cognitive Load at entry drops to one action; the banner and the three peer CTAs are gone. Templates stay discoverable as a section (Discoverability preserved), so nothing was truncated.

**Trade-off** — Template start loses its button-level prominence, costing template-first users one extra glance. Accepted because picking snaps is the majority path; revisit if template starts dominate.

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

**After** — shipped: [Snap library](../features/snaps.md#browsing-and-playback). No line of copy and no button: the header reads `0개 · 0:00`, and the `가져오기` cell — the control a full library leads with — stands alone in the grid; capture stays the shell's center button.

**Why** — Nothing on the empty screen has to be read: the read-out is the state, and the one control on the surface is the one that fills it. The cell is not drawn until the library has loaded, so "nothing yet" never stands in for "not read yet".

**Trade-off** — First-time users are not told what a snap is; the capture flow carries the concept, which is the correct place for it.

---

## 3 — Place detail

*Hypothetical — the app has no place screen and no saved places: location alerts are one switch in the 나 tab over places the server provides ([Location alerts](../features/location-and-push-notifications.md#user-goal)).*

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

**After** — shipped: the 위치 알림 받기 switch in the [Me tab](../features/me.md#current-behavior). Nothing is asked at launch; turning the switch on asks `주변 장소 알림을 받을까요?` (`알림 받기` / `안 받기`) first, only a yes runs the OS prompts, and a refusal leaves the switch off with `설정에서 권한 켜기` on its row.

**Why** — The ask is caused by the user's own act and phrased as a question they can answer. Our own question can be re-asked freely, so the one-shot OS "always allow" prompt only ever follows a yes, and declining keeps the feature reachable from the same row.

**Trade-off** — Fewer grants at launch, and the geofence feature activates later in the lifecycle. Accepted: a denied OS permission is far more expensive to recover than a deferred ask.

---

## 5 — Notification permission

*Proposal — not built: the app asks for the notification permission when the user turns on 무비 완성 알림 in the 나 tab ([Me tab](../features/me.md#current-behavior)).*

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

**After** — shipped: [Capture](../features/capture-flow.md#user-goal-and-screen-flow). `/capture` opens straight into the viewfinder with the 3초 / 5초 option inline and the `꾹 눌러 찍기` hold shutter; ✕ leaves to the Studio; quality is product policy, with no control.

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

**After** — shipped: the studio face of [the movie screen](../features/movie.md#user-goal). The stage previews the cuts and the timeline strip shows them in order; two chips, 스타일 · 세부, open sheets over values that are already set; the footer runs `무비 만들기`. Music follows the style preset, and the model is policy.

**Why** — Nothing blocks the commit: every setting already has a value one chip away, and the stage and strip show what will be generated, so nothing has to be recalled. The run's cost is not beside the button yet, so `Hidden Cost` still fires here ([How many runs a user gets](../features/movie.md#how-many-runs-a-user-gets)).

**Trade-off** — Precise settings sit one sheet away. Acceptable because generating does not end them: a movie is editable whenever no run owns it.

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

**After** — shipped: the `generating` state of [the movie screen](../features/movie.md#what-each-status-shows). The progress ring fills the stage with the stage named by the app (`컷 자르는 중`, `음악 고르는 중`, …), the strip stays as a read-out, and the footer's one act is `만들기 취소`, confirmed in place; the finished movie then plays on the same screen.

**Why** — The run belongs to the backend, so leaving loses nothing, and the screen shows it by keeping the run rather than by a sentence promising it. The worker's step strings never reach the screen, and the result lands where the user already is.

**Trade-off** — Less visible detail about what the pipeline is doing; that detail never helped a user decision. The wait is not stated either — the ring moves only at the pipeline's own milestones ([Running a movie](../features/movie.md#running-a-movie)) — so `Hidden Cost` still fires for duration.

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

**Applied principles** — 9, 7 Progressive Disclosure, 10 Obvious Navigation, 12.

**After** — shipped, by owner decision: the [Me tab](../features/me.md#user-goal). The record is the hero (the week ring, the name, the two counts); five summary rows — 크레딧, 알림, 화면 테마, 관심사, 소셜 연결 — read out the current settings while the controls sit one push away on `/settings/*`; 로그아웃 and 계정 삭제 close the screen, and deletion is a confirmation screen of its own.

**Why** — The root shows state, not controls: each row's read-out is the current setting, so nothing has to be opened to know it, and the row order is deliberate — the balance first, then the preferences most likely to be touched ([Ownership and state](../features/me.md#ownership-and-state)). The destructive actions sit last, away from routine rows.

**Trade-off** — Changing a setting costs one push. Accepted because the state it changes stays visible on the root: fully expanded, the controls ran three viewports deep at one visual weight.

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

**After** — shipped: the hero of the [Me tab](../features/me.md#current-behavior) — the week ring with `이번 주 N일 기록`, the name, and two read-only pills for the snap and movie counts. No operational metric and no storage figure appears.

**Why** — Every number on the screen is one the user recognizes as their own record; operational metrics belong to internal telemetry.

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

**After** — shipped: a `failed` movie keeps its cuts and settings and shows its reason with `다시 시도` — in the movie screen's footer, and through the same control on its board row and grid tile ([What each status shows](../features/movie.md#what-each-status-shows), [The board](../features/studio.md#the-board)).

**Why** — The draft survives, the fix is one tap wherever the failed movie appears, and the reason is the app's own words for the failure's code — the server's message is kept for debugging and never drawn ([How a job fails](../features/movie.md#how-a-job-fails)).

**Trade-off** — We sometimes cannot name the cause; saying so honestly (`무비를 만들지 못했어요.`) beats inventing one.

---

## 12 — Onboarding

*Hypothetical — the app has no onboarding: a first launch signs in, then opens on the Studio ([Application shell](../features/app-shell-and-navigation.md#user-visible-behavior)).*

**Before**
```text
4-slide carousel: "스냅이란?" → "트레이란?" → "무비란?" → "권한 허용"
  [다음] [다음] [다음] [모두 허용]
```
**Problems** — `Cost Before Value` (concepts and permissions before any use), `Mystery CTA`, `Narrating Screen`, `Dead End` (no skip).

**Applied principles** — 8, 10-pattern (onboarding), 4, 15.

**After**
```text
(first launch)
  L1  viewfinder, ready to shoot
  L3  꾹 눌러 찍기      ← one-time hint at the point of use, dismissible
  (after the first snap) the snap counter bumps and the viewfinder stays — snaps
              collect in the library; making a movie is a separate act, started
              from the Studio or the Snap tab
  permissions: the camera when shooting starts, everything else when its feature is turned on
  skip: always available
```
**Why** — The product teaches itself by being used; the vocabulary is learned from labels attached to real objects the user just made.

**Trade-off** — Users never see a feature overview. Coverage of less obvious features shifts to their own entry points, which is where discovery should happen anyway.

---

## 13 — Snap library search and filter

*Hypothetical — the snap library has no search, filter, or sort control ([Snap library](../features/snaps.md#browsing-and-playback)); the case applies patterns 19–21 to its day-grouped grid.*

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
  sort: a 최신순 / 오래된순 toggle only (one alternative, so no sheet)
```
**Why** — The screen now reports its own state: the user can see why results are missing and remove the cause in one tap. Icons gained labels, so Discoverability and accessibility both improve.

**Trade-off** — Chips consume vertical space when filters are active. Justified: an invisible filter is the more expensive failure.
