# Interaction pattern rules

Canonical answers for 22 recurring situations. Each entry answers the same five questions:

1. **Knows** — what the user must know to act
2. **First** — what appears first / most prominently
3. **Default** — what the system may decide for them
4. **CTA** — how the buttons are written (Korean product copy, 해요체)
5. **Disclosure** — what is deferred, and where

Korean strings are illustrative shapes, not fixed copy — adapt the wording, keep the structure. Writing rules: [`ux-writing.md`](ux-writing.md).

Index: [Yes/No](#1--yesno-question) · [Single select](#2--one-of-several-options) · [Multi select](#3--several-of-several-options) · [Destructive](#4--confirming-a-destructive-action) · [Permission](#5--permission-request-general-shape) · [Location](#6--location-permission) · [Notifications](#7--notification-permission) · [Camera/mic/library](#8--camera-microphone-and-photo-library) · [Empty](#9--empty-state) · [Onboarding](#10--first-use-onboarding) · [Loading](#11--loading) · [Long-running](#12--long-running-process) · [Background](#13--background-processing) · [Success](#14--success) · [Failure](#15--failure) · [Retry](#16--retry) · [Offline](#17--offline) · [Form](#18--user-input-form) · [Search](#19--search) · [Filter](#20--filter) · [Sort](#21--sort) · [Costly action](#22--costly-or-quota-consuming-action)

---

## 1 — Yes/No question

- **Knows.** What will happen on yes, and that no is a real option that does not end the flow.
- **First.** The question, phrased as the user's own situation, in one line.
- **Default.** No pre-selection. If one answer is overwhelmingly common and reversible, make it the visually primary button — never a pre-checked state.
- **CTA.** Both buttons name outcomes: `알림 받기` / `안 받기`. Not `예` / `아니오`, and never `확인` / `취소` for a question.
- **Disclosure.** Consequence detail (frequency, scope, how to turn it off later) goes in one W5 line or behind a single `자세히` affordance, not in a paragraph.

Anti-pattern: a single-CTA sheet. Declining must always be possible ([`Preserve User Control and Exit`](principles.md#15--preserve-user-control-and-exit)).

## 2 — One of several options

- **Knows.** The difference between options in terms of results, not mechanisms.
- **First.** The options themselves, ordered by likelihood (or by natural magnitude when they are scalar: `3초` `5초`).
- **Default.** Pre-select the most common or the previous choice, visibly. Exception: consequential or irreversible options get no pre-selection.
- **CTA.** If selecting *is* committing (2–4 options, immediate effect), the option is the CTA — no separate confirm. Otherwise one confirm CTA naming the outcome.
- **Disclosure.** Two to five options inline; six or more need grouping, ordering rationale, or search. Options that produce indistinguishable results get merged.

Options must be mutually exclusive and collectively cover the user's cases — otherwise add the missing case rather than expecting the user to approximate.

## 3 — Several of several options

- **Knows.** How many are selected right now, and what the next step will do with them.
- **First.** The items, with selection state unmistakable (not color alone).
- **Default.** Nothing pre-selected, unless resuming a prior selection the user made. Provide select-all / clear only when lists are long.
- **CTA.** One commit CTA naming what the selection becomes: `이 스냅으로 새 무비`, `이 무비에 넣기`. Disabled at zero, with the reason evident from the count read-out pinned beside it.
- **Disclosure.** Keep the selection count pinned to the commit control so the user never scrolls to check (`Recall Tax`).

Entry into selection mode is one app-wide pattern (`Consistent Interaction Pattern`), and exiting it must not lose the selection unintentionally.

## 4 — Confirming a destructive action

- **Knows.** Exactly what is destroyed, how many, and whether it can be recovered.
- **First.** The object and count: `스냅 3개를 삭제할까요?`
- **Default.** Never pre-select destruction; never pre-check "also delete the original". Cancel is the safe, visually primary-adjacent choice.
- **CTA.** Name the object destroyed: `3개 삭제` / `취소`. Never bare `확인`.
- **Disclosure.** Recoverability stated in the same sheet when it matters (`되돌릴 수 없어요` — one line, W5).

Prefer undo over confirmation for cheap, reversible operations: act immediately, show a toast with `되돌리기`. Reserve dialogs for genuinely irreversible loss. Two confirmations for one action is never correct.

## 5 — Permission request (general shape)

- **Knows.** What the app will do with the capability, in outcome terms, and that the flow continues if they decline.
- **First.** The value — ideally already visible on screen (`Value Before Cost`).
- **Default.** Never pre-granted, never auto-requested at app start, never triggered by a back gesture (a published Toss prohibition, [source](https://developers-apps-in-toss.toss.im/design/consumer-ux-guide)).
- **CTA.** Outcome-named, both sides: `알림 받기` / `안 받기`.
- **Disclosure.** Two-stage: our own in-app question first (which we can re-ask), then the OS prompt only after a yes. If the user declines the OS prompt, do not loop — record it, keep the feature reachable, and offer a settings deep link at the next natural moment.

Always design the declined path as a real path, not a degraded dead end.

## 6 — Location permission

- **Knows.** That location is used to attach *where* a snap was taken and to notify near saved places; whether background access is involved.
- **First.** The feature that needs it, in the moment it is used — not on first launch.
- **Default.** Foreground first. Ask for background/always only when the user enables a feature that genuinely needs it (geofenced alerts), never bundled with the foreground ask.
- **CTA.** `위치 사용하기` / `안 쓰기`; for the background upgrade, `이 장소 알림 받기`.
- **Disclosure.** Explain the always-on implication only at the background step, in one line. Snaps captured without location save fine, silently.

See [`../features/location-and-push-notifications.md`](../features/location-and-push-notifications.md) for the current gating; keep the copy aligned with what the code actually registers.

## 7 — Notification permission

- **Knows.** What we will send and roughly when — tied to something they just did.
- **First.** The pending outcome: a generation running, a place saved.
- **Default.** Ask after the first action whose completion the user would want to hear about; never on launch.
- **CTA.** `다 만들어지면 알려주기` / `괜찮아요`.
- **Disclosure.** Category-level preferences live in `나`, not in the prompt. One ask; if declined, offer it again only at a materially different moment (and at most rarely).

## 8 — Camera, microphone, and photo library

- **Knows.** That recording needs the camera and mic; that importing reads a video they pick.
- **First.** The intent that triggered it (opening the viewfinder, tapping `가져오기`) — the request is expected because the user just asked for it.
- **Default.** Request at the point of use. Prefer the OS limited/one-time picker path where it exists over full-library access.
- **CTA.** OS-owned; our preceding screen supplies the prediction. If we must pre-ask, `카메라 켜기`.
- **Disclosure.** On denial, show an inline state at the failure site with one action: `설정에서 권한 켜기` — not a dialog, and not a blank viewfinder.

## 9 — Empty state

- **Knows.** Which kind of empty this is: nothing yet / nothing matched / failed to load.
- **First.** The action that resolves it.
- **Default.** For "nothing matched", keep the filter controls visible and offer `필터 지우기`.
- **CTA.** The filling action, named: `첫 스냅 찍기`, `영상에서 가져오기`.
- **Disclosure.** At most one short line of state. No explanatory paragraph (project rule — [`Show State, Not Instructions`](principles.md#13--show-state-not-instructions)).

Never render "nothing yet" while a request is still in flight; that is `Orphan State`.

## 10 — First-use onboarding

- **Knows.** Only what is needed to complete the first real action.
- **First.** The product doing something — ideally the user's own first snap — not a tour.
- **Default.** Skippable, and skipping leaves a usable app. No account, permission, or preference gate before the first taste of value where technically avoidable.
- **CTA.** `바로 찍어보기`; the skip option is visible, not hidden.
- **Disclosure.** Teach one mechanic at the point of first use, once, dismissibly. Never a multi-screen carousel of features.

Onboarding that must be read is a symptom that the main screens are not self-evident; fix those first.

## 11 — Loading

- **Knows.** That the app is working, and roughly on what.
- **First.** A skeleton in the shape of the incoming content, in place of that content only.
- **Default.** Show cached or previous data with a subtle refreshing indicator rather than blanking the screen. Never block unrelated parts of the app.
- **CTA.** None. Do not disable navigation.
- **Disclosure.** If it exceeds a few seconds, escalate to the long-running pattern with progress and an exit.

Reserve layout so nothing shifts when content arrives.

## 12 — Long-running process

- **Knows.** That it started, roughly how long it takes, that they can leave, and how they will find the result.
- **First.** Progress with meaning (a ring, a stage name in user words), plus the object being produced.
- **Default.** Continue in the background when the user leaves; offer completion notification (asked as in §7). Do not cancel on navigation.
- **CTA.** `나가도 계속 만들어요` as state, `그만두기` as a quiet secondary. On completion, the next action: `무비 보기`.
- **Disclosure.** Technical stages are collapsed into at most three user-meaningful ones; never expose queue positions or job ids (`Leaky Vocabulary`).

State the cost before starting, not during (`Hidden Cost`).

## 13 — Background processing

- **Knows.** That something is happening on their behalf, and where to check it.
- **First.** A quiet, persistent state indicator on the surface that owns the work (an uploading badge on the snap grid), never a modal.
- **Default.** Fully automatic, retried on failure, resumed after app restart, silent while succeeding.
- **CTA.** None while healthy. On repeated failure, one action at the owning surface: `다시 올리기`.
- **Disclosure.** Aggregate rather than enumerate: `2개 올리는 중`, not per-item logs.

Background work must never steal focus, block a CTA, or interrupt the current screen.

## 14 — Success

- **Knows.** That it worked, what now exists, and what they can do next.
- **First.** The result itself. Show the movie, the snap, the saved place — the artifact is the confirmation.
- **Default.** Land the user on the result; do not require a dismissal step to see it.
- **CTA.** The most likely next action (`공유하기`, `무비 보기`), plus a quiet way back to where they were.
- **Disclosure.** No celebration screen that must be dismissed before the result is reachable. A toast is enough for small successes; silence is enough when the state change is visible.

## 15 — Failure

- **Knows.** What failed, in their words, and the one thing that fixes it.
- **First.** The state at the failure site, scoped to what broke.
- **Default.** Preserve the user's input and progress. Choose the lightest component: toast (transient), inline (field/block), dialog (a decision is required).
- **CTA.** `다시 시도`, or the specific fix (`인터넷 연결 확인하기`). Never `확인` alone.
- **Disclosure.** Diagnostics under a disclosure or a copy action; never as the headline. No blame, no codes as the message ([Toss's error principles](https://toss.tech/article/21021)).

## 16 — Retry

- **Knows.** Whether anything changed since the last attempt.
- **First.** The retry action, at the failure site.
- **Default.** Retry transient failures automatically (bounded, backed off) before showing anything. Manual retry only after automatic attempts are exhausted.
- **CTA.** `다시 시도`; when a precondition is the cause, name it instead: `설정에서 권한 켜기`.
- **Disclosure.** After repeated failure, escalate the message and offer an alternative path or support contact rather than an identical button.

An identical retry that will fail identically is a `Dead End`.

## 17 — Offline

- **Knows.** Which parts still work, and that their work is safe.
- **First.** What they can still do — local capture, browsing local snaps — with the unavailable actions clearly disabled and labeled.
- **Default.** Queue outbound work and sync on reconnect, silently. Never lose input.
- **CTA.** None required while queued; the state read-out suffices (`연결되면 올라가요`).
- **Disclosure.** A scoped inline state on affected surfaces; not a global blocking banner and never a dialog.

## 18 — User input form

- **Knows.** Why each field is needed, and what happens after submitting.
- **First.** The first field, focused, keyboard up, with the submit control visible above the keyboard.
- **Default.** Pre-fill everything derivable; correct format rather than rejecting it; validate on blur, not per keystroke; keep entered values on failure.
- **CTA.** The outcome, not the mechanism: `가입하고 시작하기`, not `제출`.
- **Disclosure.** Ask only what is needed now; optional fields last or deferred entirely. One screen per mental context — and one field per interaction is legitimate when the keyboard would otherwise hide the rest ([Toss's sign-up case](https://toss.tech/article/toss-signup-process)).

Errors sit at the field, in one line, saying how to fix it.

## 19 — Search

- **Knows.** What is searchable and what will be matched.
- **First.** The field, focused on entry to a search surface, with recent or suggested entries below it.
- **Default.** Debounced live results; forgiving matching; scope defaulted to the surface the user came from.
- **CTA.** No submit button needed when results are live. `취소` returns to the prior state with it intact.
- **Disclosure.** Filters and scope switches appear only once results exist. Zero results state the query and offer `검색어 지우기` — never a bare empty screen.

## 20 — Filter

- **Knows.** Which filters are active right now, and how to remove them.
- **First.** Active filters as visible chips in the content area, not hidden behind an icon.
- **Default.** No filters on entry. Filters do not persist across sessions unless the user pinned them; if they persist, say so visibly.
- **CTA.** Apply immediately where cheap. For a filter sheet, `결과 보기 (24)` — outcome plus count.
- **Disclosure.** Common filters inline; rare ones in a sheet. An empty filtered result must show the filter and the way to clear it.

## 21 — Sort

- **Knows.** The current order.
- **First.** The current sort's name where the order is not self-evident (a chronological grid is self-evident; a "recommended" order is not).
- **Default.** The order that matches the content's natural reading (newest first for a library). One default, applied consistently everywhere the same content appears.
- **CTA.** Options are the CTA; selecting applies immediately and returns.
- **Disclosure.** Offer sort only when more than one order is genuinely useful; two useful orders are better as a visible toggle than a sheet.

Never mix sort and filter into one unlabeled control.

## 22 — Costly or quota-consuming action

- **Knows.** What it costs (time, quota, money), what they get, and that they can inspect before committing.
- **First.** The result-to-be — the cut list, the style, the length — as a reviewable summary.
- **Default.** All inputs defaulted so the action is one tap for the common case; never pre-commit; never auto-start on screen entry.
- **CTA.** Outcome plus cost adjacency: `AI로 생성 시작` with the cost stated next to it, not after the tap.
- **Disclosure.** Fine-grained control is available before the commit and stays available after the result (per this project's decision that edits follow generation — see [`../features/movie.md`](../features/movie.md)).

Cost is always disclosed *before* the commit. `Value first, cost later` orders the reveal; it never hides the bill.
