# UX review checklist

The gate for a PR or a screen review, and the one checklist in this directory: the analysis ([`screen-analysis.md`](screen-analysis.md) Step 10), the element rules ([`visual-hierarchy.md`](visual-hierarchy.md)), and the copy rules ([`ux-writing.md`](ux-writing.md)) all run their checks from here. Every item has a pass criterion, so the answer is a judgment about the screen and not about the reviewer's mood.

Use it as: copy the relevant section into the PR, mark each item, and for every ✗ name the smell and the principle. An item that does not apply is marked `n/a` with a one-line reason — never silently skipped. Items marked `copy` are the copy checks; the [Fast path](#fast-path) says which items a change of a given size runs.

---

## A. Purpose and action

- [ ] **The screen's purpose fits one sentence.** Pass: "the user wants to ___", no "and"/"or", no app vocabulary. Fail → `One Thing per Page`.
- [ ] **The primary action is identifiable within a glance.** Pass: a reader unfamiliar with the app points at the same control you would. Fail → `Competing CTA` / `Hidden Primary`.
- [ ] **The primary action is in the first viewport or pinned.** Pass: reachable with no scrolling. Fail → `Hidden Primary`.
- [ ] **Exactly one element claims primary visual weight.** Pass: in grayscale at reduced size, the screen shows one entry point, and titles, body, and supporting text stay distinguishable. Fail → `Flat Hierarchy` / `Competing CTA`.
- [ ] **If the primary action is disabled on entry, the reason is visible.** Pass: a state read-out explains it without copy (e.g. the selection bar's `0개 선택` beside a disabled `이 스냅으로 새 무비`). Fail → `Orphan State`.

## B. Predictability

- [ ] `copy` **Every CTA label predicts its result.** Pass: covering the screen, you can state what each button does. Generic labels only in a justified exception. Fail → `Mystery CTA`.
- [ ] **Every transition is predictable.** Pass: the trigger names the destination or the change; nothing appears without a user action. Fail → `Unpredictable Jump`.
- [ ] **Back and dismiss behave as the platform implies.** Pass: no interception except one outcome-labeled unsaved-work question. Fail → `Unpredictable Jump` / `Dead End`.
- [ ] **Costs are stated before the commit.** Pass: duration, quota, price, and irreversibility sit next to the CTA that incurs them. Fail → `Hidden Cost`.
- [ ] **Anything moved or deferred is still findable.** Pass: asked "where would a first-time user tap to ___?", the answer is the new location (the TNS-style question, [source](https://toss.tech/article/Toss_Navigation_Score)). Fail → `Navigation Maze`.

## C. Questions and decisions

- [ ] `copy` **Every question is answerable in about three seconds.** Pass: read aloud, an answer forms from facts the user holds. Fail → `System-Centric Question`.
- [ ] `copy` **No question requires knowing how the app works.** Pass: no option label names a mode, engine, tier, or internal object. Fail → `System-Centric Question` / `Leaky Vocabulary`.
- [ ] **Nothing the system could decide is asked of the user.** Pass: every remaining decision passed the Step 5 table in [`screen-analysis.md`](screen-analysis.md). Fail → `Decision Dump`.
- [ ] **The primary path asks only the decisions that are the user's.** Pass: [`Reduce Decision Cost`](principles.md#6--reduce-decision-cost)'s Detection Rule does not fire once its Exceptions are applied. Fail → `Decision Dump`.
- [ ] **Defaults are visible and reversible; none is permission-like, destructive, or paid.** Fail → `Silent Automation`.
- [ ] **Nothing must be remembered from a previous screen.** Pass: the deciding facts are restated where the decision happens. Fail → `Recall Tax`.

## D. Information and hierarchy

- [ ] **The first viewport is mostly relevant to the current decision.** Pass: `later + elsewhere + noise` under roughly half. Fail → `Premature Information`.
- [ ] **Visual weight matches importance to the current step.** Pass: reading order matches the Step 4 buckets, with W2 adjacent to W1 ([the weight ladder](visual-hierarchy.md#the-weight-ladder)); items of one kind share one weight, and a promoted item gets a section of its own rather than a bigger card. Fail → `Flat Hierarchy`.
- [ ] **Decoration does not outrank the deciding state.** Pass: at most one major graphic, subordinate to state and action. Fail → `Decorative Weight`.
- [ ] `copy` **No screen narrates itself.** Pass: no sentence teaches the UI; state read-outs carry the meaning; empty states are one line. Fail → `Narrating Screen`.
- [ ] **Density is justified or absent.** Pass: dense only for homogeneous find/compare content, with grouping and ordering; on a list, grid, or library, the change added no scroll length or transitions to the common task. Fail → `Truncated Feature` (too sparse) or unjustified density.
- [ ] **No capability was lost.** Pass: every capability present before is still reachable, and its new path is named in the change report. Fail → `Truncated Feature`.

## E. Consistency and control

- [ ] **Patterns match the app's established ones.** Pass: same decision → same component, position, gesture, and wording as elsewhere. Fail → `Inconsistent Twin`.
- [ ] `copy` **Terminology matches the fixed vocabulary.** Pass: every term appears in the table in [`ux-writing.md`](ux-writing.md#terminology), and no code, ID, or enum value is visible. Fail → `Leaky Vocabulary`.
- [ ] `copy` **Every string is 해요체, active, and positive, and sounds like a person.** Pass: read aloud, it follows [`ux-writing.md` → Tone](ux-writing.md#tone). Fail → `Speak the User's Domain`.
- [ ] **Every screen and sheet has an exit that is not compliance.** Pass: a real decline or dismissal exists. Fail → `Dead End`.
- [ ] **No modal opens over another modal.** Fail → `Modal Stack`.
- [ ] **Automated decisions are inspectable and changeable.** Pass: shown at the point of use, and in `나` if persistent. Fail → `Silent Automation`.
- [ ] **Interactivity is visually unambiguous.** Pass: one treatment for pressable, one for disabled — with its reason discoverable — everywhere. Fail → `Phantom Affordance`.

## F. States

- [ ] **Empty, loading, error, offline, and partial states all exist.** Pass: each one is reachable and designed, names its state, and offers the one action that resolves it. Fail → `Orphan State`.
- [ ] `copy` **Empty distinguishes nothing-yet / nothing-matched / failed-to-load.** Fail → `Orphan State`.
- [ ] **Loading preserves layout.** Pass: skeleton in the content's shape; no shift on arrival; nothing unrelated blocked.
- [ ] `copy` **Every error names a state and a fix, in the user's language, with no blame.** Fail → `Blaming Error`.
- [ ] **The component matches the severity.** Pass: toast (transient), inline (field/block), dialog (a decision is required). Fail → `Blaming Error`.
- [ ] **Long-running work can be left and returns to a findable result.** Fail → `Dead End`.
- [ ] **Success lands the user on the result** with a likely next action. Fail → `Dead End`.

## G. Accessibility floor

- [ ] `copy` Every control has an accessible label and role; a label shortened to fit one line at the largest font scale, and an icon-only control, carry the full outcome phrase in the accessibility label.
- [ ] No state is signaled by color alone.
- [ ] Hit targets are adequate; adjacent destructive and constructive actions are separated.
- [ ] The layout and its hierarchy survive the largest supported font scale; pinned elements respect safe areas and the keyboard.
- [ ] Reduced-motion is respected for any animation added (see [`../frameworks/animations-and-gestures.md`](../frameworks/animations-and-gestures.md)).

## H. Process (for a PR)

- [ ] **The change report follows [`agent-protocol.md`](agent-protocol.md#change-report-format)** — one block per change, meeting its rules for the report.
- [ ] **Conflicts between principles are documented** per [`principle-priority.md`](principle-priority.md#conflict-report-format).
- [ ] **Scope stayed inside what was approved** ([Escalation and confirmation](agent-protocol.md#escalation-and-confirmation)); extra findings were reported, not implemented.
- [ ] **The proposal fits the code.** Pass: it is implementable within the current architecture, or the extra work is stated — checked against the slice that owns the screen and [`../conventions/cookbook.md`](../conventions/cookbook.md), not assumed.
- [ ] **The [implementation rules](agent-protocol.md#implementation-rules) hold** — the verification gate, the documentation updated in the same change, and hardware verification done or its absence stated.

---

## Fast path

- **Copy only** (labels, questions, messages, an empty state's line): the items marked `copy`, and H.
- **A small change** (one control's weight, a label with it): A, B, and H.
- **Anything touching structure, flow, states, or shared components**: the whole list.
