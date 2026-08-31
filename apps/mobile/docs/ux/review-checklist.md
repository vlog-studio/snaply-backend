# UX review checklist

The gate for a PR or a screen review. Every item has a pass criterion, so the answer is a judgment about the screen and not about the reviewer's mood.

Use it as: copy the relevant section into the PR, mark each item, and for every ✗ name the smell and the principle. An item that does not apply is marked `n/a` with a one-line reason — never silently skipped.

---

## A. Purpose and action

- [ ] **The screen's purpose fits one sentence.** Pass: "the user wants to ___", no "and"/"or", no app vocabulary. Fail → `One Thing per Page`.
- [ ] **The primary action is identifiable within a glance.** Pass: a reader unfamiliar with the app points at the same control you would. Fail → `Competing CTA` / `Hidden Primary`.
- [ ] **The primary action is in the first viewport or pinned.** Pass: reachable with no scrolling. Fail → `Hidden Primary`.
- [ ] **Exactly one element claims primary visual weight.** Pass: the grayscale test shows one entry point. Fail → `Flat Hierarchy` / `Competing CTA`.
- [ ] **If the primary action is disabled on entry, the reason is visible.** Pass: a state read-out (e.g. `담긴 스냅 0`) explains it without copy. Fail → `Orphan State`.

## B. Predictability

- [ ] **Every CTA label predicts its result.** Pass: covering the screen, you can state what each button does. Generic labels only in a justified exception. Fail → `Mystery CTA`.
- [ ] **Every transition is predictable.** Pass: the trigger names the destination or the change; nothing appears without a user action. Fail → `Unpredictable Jump`.
- [ ] **Back and dismiss behave as the platform implies.** Pass: no interception except one outcome-labeled unsaved-work question. Fail → `Unpredictable Jump` / `Dead End`.
- [ ] **Costs are stated before the commit.** Pass: duration, quota, price, and irreversibility sit next to the CTA that incurs them. Fail → `Hidden Cost`.

## C. Questions and decisions

- [ ] **Every question is answerable in about three seconds.** Pass: read aloud, an answer forms from facts the user holds. Fail → `System-Centric Question`.
- [ ] **No question requires knowing how the app works.** Pass: no option label names a mode, engine, tier, or internal object. Fail → `System-Centric Question` / `Leaky Vocabulary`.
- [ ] **Nothing the system could decide is asked of the user.** Pass: every remaining decision passed the Step 5 table in [`screen-analysis.md`](screen-analysis.md). Fail → `Decision Dump`.
- [ ] **At most two user decisions on the primary path** (creation/commit screens). Pass: counted, with defaults applied to the rest. Fail → `Decision Dump`.
- [ ] **Defaults are visible and reversible; none is permission-like, destructive, or paid.** Fail → `Silent Automation`.
- [ ] **Nothing must be remembered from a previous screen.** Pass: the deciding facts are restated where the decision happens. Fail → `Recall Tax`.

## D. Information and hierarchy

- [ ] **The first viewport is mostly relevant to the current decision.** Pass: `later + elsewhere + noise` under roughly half. Fail → `Premature Information`.
- [ ] **Visual weight matches importance to the current step.** Pass: reading order matches the Step 4 buckets. Fail → `Flat Hierarchy`.
- [ ] **Decoration does not outrank the deciding state.** Pass: at most one major graphic, subordinate to state and action. Fail → `Decorative Weight`.
- [ ] **No screen narrates itself.** Pass: no sentence teaches the UI; state read-outs carry the meaning; empty states are one line. Fail → `Narrating Screen`.
- [ ] **Density is justified or absent.** Pass: dense only for homogeneous find/compare content, with grouping and ordering. Fail → `Truncated Feature` (too sparse) or unjustified density.

## E. Consistency and control

- [ ] **Patterns match the app's established ones.** Pass: same decision → same component, position, gesture, and wording as elsewhere. Fail → `Inconsistent Twin`.
- [ ] **Terminology matches the fixed vocabulary.** Pass: every term appears in the table in [`ux-writing.md`](ux-writing.md#terminology). Fail → `Leaky Vocabulary`.
- [ ] **Every screen and sheet has an exit that is not compliance.** Pass: a real decline or dismissal exists. Fail → `Dead End`.
- [ ] **No modal opens over another modal.** Fail → `Modal Stack`.
- [ ] **Automated decisions are inspectable and changeable.** Pass: shown at the point of use, and in `나` if persistent. Fail → `Silent Automation`.
- [ ] **Interactivity is visually unambiguous.** Pass: one treatment for pressable, one for disabled, everywhere. Fail → `Phantom Affordance`.

## F. States

- [ ] **Empty, loading, error, offline, and partial states all exist.** Pass: each one is reachable and designed. Fail → `Orphan State`.
- [ ] **Empty distinguishes nothing-yet / nothing-matched / failed-to-load.** Fail → `Orphan State`.
- [ ] **Loading preserves layout.** Pass: skeleton in the content's shape; no shift on arrival; nothing unrelated blocked.
- [ ] **Every error names a state and a fix, in the user's language, with no blame.** Fail → `Blaming Error`.
- [ ] **The component matches the severity.** Pass: toast (transient), inline (field/block), dialog (a decision is required). Fail → `Blaming Error`.
- [ ] **Long-running work can be left and returns to a findable result.** Fail → `Dead End`.
- [ ] **Success lands the user on the result** with a likely next action. Fail → `Dead End`.

## G. Accessibility floor

- [ ] Every control has an accessible label and role; icon-only controls carry the full outcome phrase.
- [ ] No state is signaled by color alone.
- [ ] Hit targets are adequate; adjacent destructive and constructive actions are separated.
- [ ] The layout survives the largest supported font scale.
- [ ] Reduced-motion is respected for any animation added (see [`../frameworks/animations-and-gestures.md`](../frameworks/animations-and-gestures.md)).

## H. Process (for a PR)

- [ ] The change report exists, one block per change: Problem / UX Smell / Principle / Change / Why / Trade-off.
- [ ] No justification is aesthetic; every one names a user cost.
- [ ] Every removal, deferral, and move is listed with its destination or its reason.
- [ ] Trade-offs are stated; "none" is justified.
- [ ] `Toss Principle` claims trace to a URL in [`README.md`](README.md#verified-toss-principle-sources); everything else is labeled correctly.
- [ ] Conflicts between principles are documented per [`principle-priority.md`](principle-priority.md).
- [ ] Scope stayed inside what was approved; extra findings were reported, not implemented.
- [ ] `npm run verify` passes, or a pre-existing unrelated failure is reported with evidence.
- [ ] The affected document under [`../features/`](../features/README.md) is updated in the same change.
- [ ] Device verification was done, or its absence is stated explicitly (iOS hardware cannot be verified in this project).

---

## Fast path

For a small change (a label, one control's weight), run **A, B, and H** only. For anything touching structure, flow, states, or shared components, run the whole list.
