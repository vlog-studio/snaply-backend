# Screen analysis framework

The mandatory analysis before any UX change proposal. Ten steps, run in order. Steps 0–5 are *observation* — no improvement ideas allowed yet. Only from Step 6 onward may the reviewer name problems, and only from Step 8 may they propose structure.

The order exists because the most common review failure is redesigning before understanding: an agent that proposes layout in Step 2 will spend the rest of the analysis rationalizing it.

---

## Step 0 — Establish the facts

Before judging, know what the screen actually is.

Collect:
- The route and the file that owns it (`src/app/...` → the feature slice it renders).
- Its documented behavior and implementation status from [`../features/`](../features/README.md). A `Prototype` screen is judged against what it claims, not against what a finished screen would do.
- Its states: empty, loading, partial, error, offline, populated. List which ones exist in code.
- Its entry points: how the user got here, and what they were doing immediately before.
- Platform differences (iOS/Android) and whether the screen is a tab root, a pushed screen, or a full-screen modal.

Output: three to six factual lines. If a claim cannot be verified from code or docs, mark it `assumed` and continue; never present an assumption as an observation.

---

## Step 1 — User intent

One sentence, in the user's voice, present tense, no app vocabulary:

> The user wants to ___.

Rules:
- No "and" / "or". If the sentence needs one, the screen has more than one goal — write both sentences and note the conflict as a `One Thing per Page` candidate.
- Describe the goal, not the mechanism. "The user wants to pick snaps for a movie" — not "the user wants to use the selection mode".
- If several intents genuinely arrive at this screen (a tab root), rank them by frequency and state which one the screen is currently optimized for.

Example: *The user wants to turn the clips they shot today into one short video.*

---

## Step 2 — Primary action

The single action that most directly satisfies Step 1. Name the concrete control, and separately name the outcome it produces.

Also record:
- Where the control is (viewport position, container).
- Its current label, and whether that label names the outcome.
- Whether it is enabled on entry, and what unblocks it if not.
- The secondary actions the screen offers, ranked by expected frequency.

If the primary action cannot be identified unambiguously, stop and record that as the finding — an unidentifiable primary action is the problem, and everything after it is downstream of that.

---

## Step 3 — Required information

What the user must know *at this moment* to take the primary action correctly and confidently. Typically:
- The state the action operates on (how many snaps, which movie, which place).
- The consequence (what will be created, changed, spent, or lost).
- Any blocker (missing permission, nothing selected, offline).

For each item, record whether it is currently visible without interaction. Anything required-but-hidden is a finding (`Recall Tax`, `Hidden Cost`, or `Progressive Disclosure` violated in the wrong direction).

---

## Step 4 — Optional information

Everything else currently on the screen. Classify each block into exactly one bucket:

| Bucket | Meaning | Treatment |
| --- | --- | --- |
| `supports` | Raises confidence in the primary action | Keep, subordinate weight |
| `later` | Needed after the action, or on a rarer path | Defer behind one interaction, or place below the primary block |
| `elsewhere` | Belongs to another goal or surface | Move to that surface, with the entry point kept discoverable |
| `noise` | Serves no user decision | Remove — and say so explicitly in the report |

Record an estimated share of the first viewport per bucket. If `later + elsewhere + noise` exceeds roughly half the first viewport, `Premature Information` fires.

Never place a block in `noise` on aesthetic grounds. Noise means "no user decision depends on it".

---

## Step 5 — Decision points

Enumerate every judgment the screen demands, including implicit ones ("which of these six cards is mine?" is a decision).

For each, fill one row:

| Decision | Who should own it | Answerable in ~3s? | Default exists? | Reversible? | Verdict |
| --- | --- | --- | --- | --- | --- |
| … | user / system / product policy | yes / no | yes / no | yes / no | keep · default it · restate · move to policy · defer |

Verdict rules:
- `system` + default exists → **default it** (visibly — see `Smart Default`).
- `product policy` → **move to policy**, remove the control.
- `user` + not answerable in 3s → **restate** in user-side terms (`Easy to Answer`).
- `user` + answerable + rare → **defer** behind one disclosure.
- `user` + answerable + common → **keep**.

Then count the `keep` rows on the primary path. More than two on a creation or commit path is a `Decision Dump` candidate.

---

## Step 6 — UX smell detection

Run the Detection Rules of all 17 principles against the screen and name what fires, using the vocabulary in [`ux-smells.md`](ux-smells.md).

For each firing rule, do the confirmation pass immediately:
1. Which Detection Rule fired, quoted.
2. What on the screen triggers it, specifically.
3. Does one of that principle's Exceptions apply? If yes → dismiss, and record the dismissal with its reason.
4. Which user cost it produces (use the vocabulary in [`README.md`](README.md#vocabulary)).
5. Confidence: high / medium. Below medium, do not report it as a finding.

A finding without a named user cost is a preference, not a finding. Drop it.

---

## Step 7 — Principle mapping and scope

For each confirmed finding, choose the principle that will drive the fix (the one whose Better Pattern most directly resolves it), then decide the scope of the change:

| Scope | Meaning | When |
| --- | --- | --- |
| `copy` | Labels, questions, error text only | The structure is right, the words are not |
| `hierarchy` | Weight, order, grouping, emphasis | The right things are present, ranked wrongly |
| `structure` | Split, merge, move, defer blocks; change entry points | The screen carries the wrong content for the step |
| `flow` | Change screen sequence, navigation, or where a decision happens | The problem is between screens, not on one |
| `system` | Shared component or pattern change | The same defect exists on three or more screens |

Prefer the smallest scope that resolves the finding. Escalate scope only with a stated reason: `copy` before `hierarchy` before `structure` before `flow` before `system`. A `flow` or `system` scope change requires the user's confirmation before implementation (see [`agent-protocol.md`](agent-protocol.md)).

Also check the conflicts: if two findings' fixes pull against each other, resolve with [`principle-priority.md`](principle-priority.md) *before* designing.

---

## Step 8 — Revised structure

Propose the improved screen as a text wireframe with explicit hierarchy levels, not prose. Required form:

```text
[screen title / context]
  L1  <the deciding state or the object of the action>
  L2  <primary action — exact Korean label>
  L3  <supporting info that raises confidence>
  --- fold ---
  L4  <secondary section, ordered by frequency>
  L5  <deferred: behind one interaction, named>
  [moved out] <block> → <destination screen/surface, entry point kept as ___>
  [removed]   <block> → <why no user decision depends on it>
```

Rules for this step:
- Every block from Step 4 must appear exactly once — kept, deferred, moved, or removed. Nothing may silently vanish; that is the `Truncated Feature` guardrail.
- Exact user-facing Korean strings for every label and CTA, written to [`ux-writing.md`](ux-writing.md).
- All states from Step 0 must be specified: empty, loading, error, offline, partial.
- State what does *not* change. A review that rewrites the whole screen when two labels were wrong is a failure of scope, not a thorough review.

---

## Step 9 — Explanation

For each change, exactly this shape:

```text
Before  → <what the screen did>
Problem → <smell name> + the user cost, in the vocabulary
Principle → <#, name, evidence label>
After   → <what it does now>
Why     → <which cost went down, and how the user's path is shorter or clearer>
Trade-off → <what got worse, who it affects, and why the exchange is worth it>
```

"Trade-off: none" is almost always wrong and must be justified. Nearly every improvement moves cost somewhere: to another screen, to an extra tap for a minority path, to more density, to a longer label.

---

## Step 10 — Verification

Before calling the analysis done, run these checks. They are cheap and catch most bad proposals.

1. **Findability question (TNS-style, [source](https://toss.tech/article/Toss_Navigation_Score)).** For each capability that moved or was deferred: "Where would a first-time user tap to ___?" If the answer is not the new location, the move failed.
2. **Three-second question test.** Read each question and its options aloud. If an answer does not form in about three seconds, `Easy to Answer` still fires.
3. **Squint / grayscale test.** In grayscale at reduced size, is there exactly one obvious entry point, and does reading order match importance?
4. **Label prediction test.** Cover the screen; from each CTA label alone, state what will happen. Wrong or vague → `Mystery CTA` remains.
5. **State sweep.** Walk empty / loading / error / offline / partial. Each one names its state and offers one resolving action.
6. **Exit test.** From every screen and sheet in the change, can the user leave without complying? Is unsaved work protected by exactly one question?
7. **Density check.** For list, grid, and library surfaces: did the change add scroll length or transitions to the common task? If yes, `Density Where Density Pays` was violated.
8. **Accessibility floor.** Every control has an accessible label and role; hit targets are adequate; the layout survives the largest supported font scale; nothing relies on color alone.
9. **Regression check.** Every capability present before is still reachable, and its new path is named in the report.
10. **Code reality check.** The proposal is implementable within the current architecture, or the extra work is stated. Verify against the slice that owns the screen and [`../conventions/cookbook.md`](../conventions/cookbook.md) rather than assuming.

---

## Worked example (abbreviated)

**Step 0.** `/movie/[id]` (`src/app/movie/[id]/index.tsx`), documented in [`../features/movie.md`](../features/movie.md); states: draft, generating, watch, failed; entered from the studio, the movie list, and after generation. *(Illustrative walkthrough — verify current behavior before reusing these claims.)*

**Step 1.** The user wants to see whether their video came out right, and fix it if not.

**Step 2.** Primary action depends on state: draft → `AI로 생성 시작`; watch → play. Two states, two primary actions on one route — record that the screen is state-switched, and analyze each state separately.

**Step 3 (draft).** Required: how many cuts, in what order, the chosen style, and that generation is the costly step. **Step 4.** `supports`: cut list, style. `later`: per-cut trim precision. `elsewhere`: nothing. **Step 5.** Decisions on the primary path: order (user, answerable, common → keep), style (user, answerable, common → keep with default), model/length (system → default it).

**Step 6.** Fires: `Mystery CTA` if the generate button reads `확인`; `Hidden Cost` if generation duration is never stated; `Orphan State` if the failed state has no retry.

**Step 7.** Scopes: `copy` for the CTA, `hierarchy` for surfacing the cut count and cost next to it, `structure` only if trim precision needs deferring.

**Step 8–9.** Proposed wireframe, exact labels, and the Before → Problem → Principle → After → Why → Trade-off block per change.

**Step 10.** All ten checks, with the state sweep run against the four real states.
