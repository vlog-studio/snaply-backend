# Agent guardrails

Failure modes that a principle-driven review is prone to. Each one states the wrong move, why it is tempting, and the rule that replaces it. When a guardrail and a principle appear to conflict, the guardrail wins — it exists because the principle is being misapplied.

## G1 — Do not simplify by deletion

**Wrong move.** Removing elements to lower "complexity".

**Why tempting.** Fewer elements looks like less cognitive load, and it is the easiest change to make.

**Rule.** Cost that leaves the screen usually enters the user's head or their thumb. Prefer, in order: **default it → reorder it → subordinate it → defer it behind one interaction → move it to the surface that owns it → remove it.** Removal requires a stated reason: no user decision depends on it, or evidence of negligible use. Every removal appears in the change report with its justification.

## G2 — Do not force One Thing per Page

**Wrong move.** Splitting every screen until each holds one control.

**Rule.** One *goal* per screen, not one widget. Split only when a question's answer changes what comes next, the input needs the full screen (keyboard, camera, map), or the steps belong to different mental contexts. Otherwise group questions answered from the same fact. Watch for `Over-Split Flow`: transition cost is real and cumulative.

## G3 — Do not enforce a single CTA mechanically

**Wrong move.** Deleting or burying secondary actions so exactly one button remains.

**Rule.** One *primary* action, as many secondary actions as the screen legitimately needs — visibly subordinate. If a secondary action is used often, keep it visible even at the cost of density. A decline option is never removed to satisfy this rule; that produces a `Dead End`.

## G4 — Do not simplify expert surfaces

**Wrong move.** Applying beginner-optimized structure to screens used many times a day by users who already know them.

**Rule.** Weigh by frequency. For high-frequency surfaces, optimize for the shortest path for someone who already knows what they want: fewer transitions, more visible controls, stable positions. Learnability matters most on first use; efficiency matters more on the hundredth.

## G5 — Do not treat density as a defect

**Wrong move.** Converting dense libraries and lists into large-card layouts.

**Rule.** Density is a problem only when it mixes goals, lacks grouping or ordering, hides interactivity, or competes with the primary action. For find/compare/monitor tasks, density lowers total cost. Test it: does the change add scroll length or transitions to the common task? Then it is worse. See `Density Where Density Pays`.

## G6 — "Make it like Toss" is never a visual instruction

**Wrong move.** Copying Toss's blue, card shapes, type, icon style, or component look.

**Rule.** Toss-inspired means the decision procedure: answerable questions, obvious next action, gradual reveal, low thinking cost. Visual identity comes from this project's own design system. A change whose reason is "Toss does it this way" must be restated as which principle it serves — or dropped.

## G7 — Taste is not a reason

**Wrong move.** Justifying a change with "깔끔하다", "예쁘다", "세련됐다", "요즘 스타일".

**Rule.** Every change names a user cost it reduces, from the vocabulary in [`README.md`](README.md#vocabulary). If no cost can be named, do not make the change. Aesthetic preference is legitimate as a *user* request; it is not legitimate as an *agent's* justification.

## G8 — Do not remove functionality in the name of UX

**Wrong move.** Deleting a capability because it complicates the screen.

**Rule.** UX work relocates, defers, and reframes; it does not decide product scope. Removing a capability is a product decision that requires the user's explicit approval, and it must be reported as a trade-off, never buried in a refactor.

## G9 — Do not redesign before understanding the intent

**Wrong move.** Proposing layout in the first paragraph of the analysis.

**Rule.** Steps 1–3 of [`screen-analysis.md`](screen-analysis.md) (intent, primary action, required information) come before any structural idea. An agent that proposes early will spend the rest of the analysis defending that proposal instead of testing it.

## G10 — Do not review a screen you have not read

**Wrong move.** Reasoning from the route name, a memory, or an assumption about what the screen probably contains.

**Rule.** Read the implementing code and the feature document first. Distinguish observation from assumption in the report, and mark assumptions as such. Never claim a defect you have not seen in the source or on a device.

## G11 — Do not judge a prototype as a finished screen

**Wrong move.** Filing findings against a screen that [`../features/`](../features/README.md) documents as `Prototype` or `Not implemented`.

**Rule.** Check the implementation status first. For unfinished screens, review the *intent* and note that the finding may be unfinished work, not a design defect.

## G12 — Do not expand scope silently

**Wrong move.** Fixing three neighbouring things while changing two labels.

**Rule.** Stay inside the approved scope. Additional findings get reported, not implemented. Escalate scope only with a stated reason and — for `flow` and `system` — the user's confirmation.

## G13 — Do not defer state, exits, costs, or errors

**Wrong move.** Applying `Progressive Disclosure` to system state, dismissal paths, prices, durations, irreversibility, or error messages.

**Rule.** Disclosure applies to *options and detail* only. State, exits, costs, and failures are always visible at the point where they matter.

## G14 — Do not use a default to bypass a decision the user owns

**Wrong move.** Defaulting a consequential, irreversible, or permission-like choice to keep the flow smooth.

**Rule.** Defaults are for reversible, inferable, majority answers, and they must be visible and changeable. Never pre-opt-in to permissions, sharing, deletion, or spending. A hidden default is `Silent Automation`.

## G15 — Do not create a new pattern when one exists

**Wrong move.** Building a bespoke sheet, selection mode, or confirmation for one screen.

**Rule.** Search [`../conventions/cookbook.md`](../conventions/cookbook.md) and the existing components first. Divergence is allowed only with a stated semantic difference; otherwise it is an `Inconsistent Twin` that the next reviewer will have to unwind.

## G16 — Do not fix structure with copy

**Wrong move.** Adding an explanatory sentence so a confusing screen becomes understandable.

**Rule.** If a screen needs a sentence to be usable, change the screen. Project rule: no explanatory UI copy. Convert explanation into state, labels, ordering, or defaults.

## G17 — Do not invent evidence

**Wrong move.** Citing usage numbers, user research, conversion effects, or Toss principles that were not verified.

**Rule.** Only [`README.md`](README.md#verified-toss-principle-sources) items may be labeled `Toss Principle`. Observations about Toss products are `Toss Pattern`. Reasoning of your own is `Derived Principle`. If a decision depends on usage data you do not have, say so and offer the alternatives.

## G18 — Do not break accessibility while improving hierarchy

**Wrong move.** Removing labels for visual quiet, signaling state with color alone, shrinking touch targets, or replacing text with icons.

**Rule.** Accessibility is a floor, not a trade-off dimension. Every control keeps a label and role; state is never color-only; the layout survives the largest supported font scale.

## G19 — Do not skip verification

**Wrong move.** Reporting a UX change as done based on the diff alone.

**Rule.** Run `npm run verify`. Verify visual and interactive changes on a device per [`../workflows/android-device-verification.md`](../workflows/android-device-verification.md), and state plainly what was not verified — especially iOS hardware, which this project cannot test (see [`../../AGENTS.md`](../../AGENTS.md)).

## G20 — Do not leave the documentation behind

**Wrong move.** Shipping a behavior change and updating the feature document "later".

**Rule.** Update the affected document under [`../features/`](../features/README.md) in the same change. If the change establishes a new reusable rule, add it here with a label, a Detection Rule, and an Exception.

## G21 — Do not optimize a screen in isolation

**Wrong move.** Making one screen locally optimal by pushing work onto the screen before or after it.

**Rule.** Evaluate the flow, not the screen: count total transitions, decisions, and recall points across it. Moving a decision is only an improvement if the total falls.

## G22 — Do not treat the user's stated preference as a smell

**Wrong move.** Overriding an explicit product decision because a principle says otherwise.

**Rule.** Settled decisions recorded in [`../features/`](../features/README.md) or this directory are inputs, not findings. If a principle argues against one, raise it once with the reasoning and let the user decide — then implement their call in full.
