# UX smell catalog

A UX smell is a recognizable surface symptom that usually indicates a deeper design problem — the UI equivalent of a code smell. A smell is *not* proof of a defect: it is a named suspicion that must be confirmed against the screen's goal and the principle's Exceptions.

How to use it: run the Detection Rules in [`principles.md`](principles.md) while reading a screen, name what fires using the smell names below, then confirm or dismiss each one in Step 6 of [`screen-analysis.md`](screen-analysis.md). Always report smells by name — the names are the shared vocabulary between the human and the agent.

## Quick reference

| Smell | One-line symptom | Principles |
| --- | --- | --- |
| [Competing CTA](#competing-cta) | Several actions claim primary weight | 9, 3, 1 |
| [Mystery CTA](#mystery-cta) | Label does not predict the result | 4, 14 |
| [System-Centric Question](#system-centric-question) | Answerable only by someone who knows the internals | 2, 12 |
| [Premature Information](#premature-information) | Content shown before it is relevant | 7, 1 |
| [Decision Dump](#decision-dump) | Everything the system could decide is asked at once | 6, 5 |
| [Navigation Maze](#navigation-maze) | Too many or unclear steps to a known goal | 10 |
| [Cost Before Value](#cost-before-value) | Permission, form, or paywall precedes any visible benefit | 8 |
| [Hidden Cost](#hidden-cost) | Price, time, or irreversibility revealed after commitment | 8, 15 |
| [Narrating Screen](#narrating-screen) | Copy teaches the UI instead of reporting state | 13 |
| [Dead End](#dead-end) | No exit, no next step, or no way to recover | 15, 14 |
| [Unpredictable Jump](#unpredictable-jump) | The transition surprises the user | 14 |
| [Orphan State](#orphan-state) | Loading, empty, or error state missing or unstyled | 16, 13 |
| [Blaming Error](#blaming-error) | Failure reported as the user's fault, or with no fix | 16 |
| [Silent Automation](#silent-automation) | The system decided; the user cannot see or change it | 15, 5 |
| [Inconsistent Twin](#inconsistent-twin) | Same decision, two mechanisms or two names | 11, 12 |
| [Flat Hierarchy](#flat-hierarchy) | Everything looks equally important | 9 |
| [Decorative Weight](#decorative-weight) | Ornament outranks the deciding information | 9, 3 |
| [Hidden Primary](#hidden-primary) | The main action is below the fold or behind a menu | 3, 10 |
| [Over-Split Flow](#over-split-flow) | A single decision spread across several screens | 1, 6 |
| [Truncated Feature](#truncated-feature) | Simplification removed a capability users needed | 17, 15 |
| [Leaky Vocabulary](#leaky-vocabulary) | Internal terms, codes, or IDs on screen | 12 |
| [Recall Tax](#recall-tax) | The user must remember something from a prior screen | 6 |
| [Modal Stack](#modal-stack) | A sheet or dialog opens over another | 14, 15 |
| [Phantom Affordance](#phantom-affordance) | Looks tappable and is not, or vice versa | 9, 11 |

---

## Competing CTA

- **Symptom.** Two or more controls in one viewport carry primary emphasis, or several equally weighted actions start different flows.
- **Cause.** Feature owners each want their entry point on the same screen; no one ranked them against a single screen goal.
- **User cost.** Decision Cost at the worst moment — before the user has even begun. Hesitation, wrong taps, and a screen whose purpose becomes unreadable.
- **Principles.** `Clear Visual Hierarchy`, `Action First`, `One Thing per Page`.
- **Remediation.** State the screen's one goal; promote the action serving it; demote the rest to secondary styling, a section below the primary block, or the surface that owns them. If two actions are genuinely equal, the screen has two goals — split it or make the screen a hub that ranks its options.

## Mystery CTA

- **Symptom.** `확인`, `완료`, `계속`, `다음`, `적용` on a screen where the result is not implied by context; icon-only buttons for consequential actions.
- **Cause.** Copy written from the implementation's viewpoint ("submit the form") rather than the outcome's.
- **User cost.** Predictability loss; tap-to-discover behavior; undo work; anxiety before irreversible steps.
- **Principles.** `Outcome-Oriented CTA`, `Predictable Transitions`.
- **Remediation.** Rewrite the label as the outcome in the user's words. If the outcome is too long to fit, shorten the outcome, not its meaning; put the full phrase in the accessibility label. Reserve generic labels for honest linear steps and dismissals.

## System-Centric Question

- **Symptom.** Options named after modes, engines, tiers, sync states, or object types; questions the user cannot answer without knowing how the app works.
- **Cause.** The data model was exposed directly as UI; the product decision "who decides this?" was never made.
- **User cost.** Answerability collapses. The user guesses, gets a wrong result, and pays repair cost — or abandons.
- **Principles.** `Easy to Answer`, `Speak the User's Domain`.
- **Remediation.** Restate the question in terms of a user-side fact or a desired outcome. If no such phrasing exists, the question is not the user's: decide it by policy or with a `Smart Default`, and expose it later as an adjustable setting.

## Premature Information

- **Symptom.** Content in the first viewport that the current decision does not need: history, statistics, tips, unrelated promotions, secondary object detail.
- **Cause.** "While we're here" additions; reusing a screen for reporting and acting at once.
- **User cost.** Scan cost; the relevant part hides inside the irrelevant part; the primary action loses relative weight.
- **Principles.** `Progressive Disclosure`, `One Thing per Page`.
- **Remediation.** Ask per block: is this required to act, to trust the action, or to report the state of this goal? If none, move it below the primary block, behind one disclosure, or to the screen that owns it. Do not delete it silently — see [`guardrails.md`](guardrails.md).

## Decision Dump

- **Symptom.** A screen or sheet presenting many simultaneous choices, most with a defensible default, before the primary action can run.
- **Cause.** Every configurable value became a control; no one distinguished user decisions from product policy.
- **User cost.** Cumulative Decision Cost, analysis paralysis, and abandonment right before the payoff.
- **Principles.** `Reduce Decision Cost`, `Smart Default`.
- **Remediation.** Classify each option: policy (remove it), inferable (default it, visibly), rare (disclose it), genuinely user's (keep, phrase answerably). Order what remains by likelihood. Aim for at most two visible decisions on a primary creation path.

## Navigation Maze

- **Symptom.** A known goal takes three or more taps from the relevant tab root; the entry point lives in an unrelated container; two names for one destination.
- **Cause.** Information architecture that mirrors code structure or org structure; features added where there was room rather than where they belong.
- **User cost.** Discoverability failure — the capability effectively does not exist for most users. Repeat Interaction Cost for those who find it.
- **Principles.** `Obvious Navigation`.
- **Remediation.** Place the entry point inside the surface it acts on. Use one name everywhere. Run the TNS-style question ("where would you tap to ___?") on the redesign before shipping it.

## Cost Before Value

- **Symptom.** A permission sheet, sign-in wall, or long form appears before the user has seen any output.
- **Cause.** Requesting capability at app start "so it's ready", or gating a flow at its technical boundary rather than its experiential one.
- **User cost.** Users decline a cost whose benefit they cannot evaluate — and a declined permission is expensive to re-ask.
- **Principles.** `Value Before Cost`.
- **Remediation.** Move the request to the first moment where the value is visible, and phrase it as an outcome question. Keep a functioning path for users who decline.

## Hidden Cost

- **Symptom.** Duration, price, quota consumption, irreversibility, or a required permission revealed only after the user has invested effort.
- **Cause.** Optimizing the funnel step-by-step instead of the user's trust.
- **User cost.** Betrayal at the commit point; abandonment with sunk effort; distrust that generalizes to the whole app.
- **Principles.** `Value Before Cost` (its reverse violation), `Preserve User Control and Exit`.
- **Remediation.** State the cost at or before the action that incurs it, next to the CTA that triggers it. `Value first, cost later` means *sequence*, never *concealment*.

## Narrating Screen

- **Symptom.** Sentences whose job is to explain the interface; multi-line empty states; a paragraph above a form.
- **Cause.** Patching a structural problem with copy; documentation instinct applied to UI.
- **User cost.** Reading cost that most users skip anyway; state pushed out of the prime position; localization and staleness debt.
- **Principles.** `Show State, Not Instructions`.
- **Remediation.** Convert each sentence into state, a label, or a control — or delete it. Keep one short cause line for error/empty-with-a-cause. Move genuine explanation into accessibility labels and hints.

## Dead End

- **Symptom.** A screen with no dismissal other than compliance; a completed flow with no next step; an error with no action; a single-CTA sheet where declining is legitimate.
- **Cause.** Designing the happy path only; treating a decline as a failure to be prevented.
- **User cost.** Loss of User Control — the strongest negative signal in this catalog. Users force-quit and remember it.
- **Principles.** `Preserve User Control and Exit`, `Predictable Transitions`.
- **Remediation.** Add the honest decline option with an outcome label. Give every terminal screen one forward action. Ensure success states say what the user can do next.

## Unpredictable Jump

- **Symptom.** A tap lands somewhere the user did not expect; a sheet appears on entry; back discards work silently; the same destination looks different depending on the path.
- **Cause.** Navigation implemented per feature, without a model of where the user came from.
- **User cost.** Orientation loss and a recovery step per occurrence; unsaved work loss.
- **Principles.** `Predictable Transitions`.
- **Remediation.** Name the destination in the trigger's label. Never open sheets on entry. Intercept destructive back with one outcome-labeled question. Make a screen's appearance a function of its state, not its referrer.

## Orphan State

- **Symptom.** Empty, loading, error, offline, or partial states missing, unstyled, or inconsistent with the app; a spinner where content shape is known; content that pops in and shifts layout.
- **Cause.** Only the populated success state was designed.
- **User cost.** Users cannot tell whether the app is broken, slow, or simply empty — the worst kind of ambiguity, because no action follows from it.
- **Principles.** `Errors Are Design Failures First`, `Show State, Not Instructions`.
- **Remediation.** Design all five states for every data-backed surface. Prefer skeletons matching the final layout. Every non-success state names the state and offers the one action that resolves it. See [`interaction-patterns.md`](interaction-patterns.md).

## Blaming Error

- **Symptom.** `잘못 입력했습니다`, `오류가 발생했습니다 (500)`, `확인`-only dialogs, technical causes as the headline.
- **Cause.** Error copy generated from exceptions; severity mapped to component by habit (dialog for everything).
- **User cost.** The user is blocked and now also feels at fault; no path forward.
- **Principles.** `Errors Are Design Failures First`.
- **Remediation.** Prevent it (validate, default, disable). If it remains: describe the state neutrally, give the one fix, choose the lightest component that fits, keep diagnostics under a disclosure.

## Silent Automation

- **Symptom.** The app chose a value, permission-adjacent preference, or ordering, and the user can neither see it nor change it.
- **Cause.** `Smart Default` applied without the visibility half of the rule.
- **User cost.** Loss of User Control and eventually trust; when the guess is wrong the user cannot correct it.
- **Principles.** `Preserve User Control and Exit`, `Smart Default`.
- **Remediation.** Show the current value as state at the point of use, make it one tap to change, and mirror it in `나` if it persists. Never auto-enable anything permission-like.

## Inconsistent Twin

- **Symptom.** Two components for the same class of decision; two labels for one action; the same gesture meaning different things; a new local component duplicating a shared one.
- **Cause.** Parallel feature work without a shared pattern reference.
- **User cost.** Re-learning per screen; broken generalization; maintenance cost that grows the divergence.
- **Principles.** `Consistent Interaction Pattern`, `Speak the User's Domain`.
- **Remediation.** Pick the canonical pattern from [`../conventions/cookbook.md`](../conventions/cookbook.md), migrate the outlier, and unify the wording. If both are needed, articulate the semantic difference — otherwise it is duplication.

## Flat Hierarchy

- **Symptom.** In a grayscale or squint test, titles, body, supporting text, and controls are indistinguishable; no clear entry point for the eye.
- **Cause.** Uniform styling applied for visual calm; hierarchy treated as decoration rather than meaning.
- **User cost.** The screen must be read linearly instead of scanned; the important part is found by luck.
- **Principles.** `Clear Visual Hierarchy`.
- **Remediation.** Assign each element a semantic role from [`visual-hierarchy.md`](visual-hierarchy.md) and restore weight differences by position, size, contrast, and isolation — in that order of preference over color alone.

## Decorative Weight

- **Symptom.** Illustration, gradient, or hero imagery outweighing the state or action that matters; multiple large graphics on one screen.
- **Cause.** Visual interest pursued independently of the screen's job.
- **User cost.** Attention spent on non-information; deciding content demoted.
- **Principles.** `Clear Visual Hierarchy`, `Action First`.
- **Remediation.** One major graphic per screen at most ([Toss's published rule](https://developers-apps-in-toss.toss.im/design/consumer-ux-guide)); ensure the deciding state and the primary action outrank it. Decoration is legitimate in genuinely empty or celebratory states.

## Hidden Primary

- **Symptom.** The screen's main action requires scrolling, sits in an overflow menu, or is styled as a tertiary control.
- **Cause.** Layout grown by accretion; the primary action never re-established after content was added.
- **User cost.** Interaction Cost on every visit and, for new users, a Discoverability failure.
- **Principles.** `Action First`, `Obvious Navigation`.
- **Remediation.** Pin the primary action (bottom CTA) or place it in the first viewport, and re-check after any content addition. If two candidates compete, resolve the screen's goal first.

## Over-Split Flow

- **Symptom.** Four screens each asking one trivial question the user could answer together; a wizard where a single screen would do.
- **Cause.** Mechanical application of `One Thing per Page`.
- **User cost.** Transition and orientation cost per step; loss of the whole-decision view; higher perceived length even though each step is easy.
- **Principles.** `One Thing per Page` (over-applied), `Reduce Decision Cost`.
- **Remediation.** Group questions that share one mental context and are answered from the same fact. Split only when a question's answer changes what comes next, or when the input needs the full screen (keyboard, camera, map).

## Truncated Feature

- **Symptom.** A capability disappeared, or now takes more steps, after a "simplification"; power users complain the screen is prettier and slower.
- **Cause.** Element removal used as a proxy for cognitive relief.
- **User cost.** Task failure for the affected users — the most expensive outcome in this catalog, since it removes value rather than noise.
- **Principles.** `Density Where Density Pays`, `Preserve User Control and Exit`.
- **Remediation.** Restore the capability; relocate or defer instead of removing. Any removal requires a stated reason plus evidence of low use, and must be listed as a trade-off in the change report.

## Leaky Vocabulary

- **Symptom.** IDs, enum names, status codes, English internal nouns, queue or job wording on screen.
- **Cause.** Strings derived from state machines and API responses.
- **User cost.** Incomprehension, distrust, and unanswerable questions.
- **Principles.** `Speak the User's Domain`.
- **Remediation.** Map every internal state to a human sentence at the boundary between the data layer and the UI, so the leak cannot recur; keep the mapping in one place per feature.

## Recall Tax

- **Symptom.** The user must remember a value, count, or name from an earlier screen to decide here; a confirmation that does not restate what is being confirmed.
- **Cause.** Each screen designed independently; state considered "already shown".
- **User cost.** Working-memory load and errors; users back-navigate to check, sometimes losing progress.
- **Principles.** `Reduce Decision Cost` (recognition over recall).
- **Remediation.** Restate the deciding facts where the decision happens — the count, the target, the cost, the selection summary.

## Modal Stack

- **Symptom.** A sheet over a sheet; a dialog over a modal; a picker launched from inside a bottom sheet that then needs its own confirmation.
- **Cause.** Reusing modal components for flow steps.
- **User cost.** Orientation loss, ambiguous dismissal semantics, platform back-gesture inconsistency, and real crash-class bugs on Android.
- **Principles.** `Predictable Transitions`, `Preserve User Control and Exit`.
- **Remediation.** One modal layer. Promote the second step to a pushed screen, or replace the first sheet with a screen. If a confirmation is needed inside a sheet, resolve it inline within that sheet.

## Phantom Affordance

- **Symptom.** Cards that look pressable but are not; plain text that is actually a link; disabled controls indistinguishable from enabled ones; icon-only controls with no accessible label.
- **Cause.** Styling decided per element rather than by interactive role.
- **User cost.** Failed taps, missed capability, and accessibility failure.
- **Principles.** `Clear Visual Hierarchy`, `Consistent Interaction Pattern`.
- **Remediation.** Make interactivity a visual invariant: one treatment for pressable, one for disabled (with a reason available), and accessible labels and roles on every control.

---

## Reporting format

When reporting smells, keep this shape so findings stay comparable across reviews:

```text
[smell name] — <where on the screen> — <which Detection Rule fired>
  Principle: <principle #, name>
  Cost: <Cognitive Load | Decision Cost | Interaction Cost | Discoverability | Predictability | User Control | Error Prevention>
  Confidence: high | medium — <why, or which exception might apply>
```

A smell that survives its principle's Exceptions becomes a finding. A smell that does not is still worth reporting once, as "considered and dismissed, because ___" — that record prevents the next review from re-raising it.
