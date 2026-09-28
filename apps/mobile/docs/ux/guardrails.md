# Agent guardrails

Failure modes that a principle-driven review is prone to. Each entry names the wrong move and links the rule it breaks. A guardrail adds no rule of its own: the rule lives in one place — a principle, the analysis, or the agent protocol — and its Exceptions apply unchanged. When a guardrail seems to overrule a principle, the principle is being misapplied, and its own text decides.

## G1 — Do not simplify by deletion

**Wrong move.** Removing elements to lower "complexity" — fewer elements looks like less cognitive load, but the cost that leaves the screen usually enters the user's head or their thumb. **Rule:** the remediation order and removal conditions of [`Truncated Feature`](ux-smells.md#truncated-feature).

## G2 — Do not force One Thing per Page

**Wrong move.** Splitting every screen until each holds one control — the principle asks for one *goal* per screen, not one widget. **Rule:** the splitting rule in [`One Thing per Page`](principles.md#1--one-thing-per-page)'s Exceptions.

## G3 — Do not enforce a single CTA mechanically

**Wrong move.** Deleting or burying secondary actions so exactly one button remains. **Rule:** [`Clear Visual Hierarchy`](principles.md#9--clear-visual-hierarchy)'s Exceptions — one primary is not one button.

## G4 — Do not simplify expert surfaces

**Wrong move.** Applying beginner-optimized structure to screens used many times a day by users who already know them. **Rule:** [`Density Where Density Pays`](principles.md#17--density-where-density-pays) — weigh by frequency.

## G5 — Do not treat density as a defect

**Wrong move.** Converting dense libraries and lists into large-card layouts. **Rule:** [`Density Where Density Pays`](principles.md#17--density-where-density-pays)'s Detection Rule decides when density is a problem.

## G6 — "Make it like Toss" is never a visual instruction

**Wrong move.** Copying Toss's blue, card shapes, type, icon style, or component look. **Rule:** [What "Toss-inspired" means here](README.md#what-toss-inspired-means-here).

## G7 — Taste is not a reason

**Wrong move.** Justifying a change with "깔끔하다", "예쁘다", "세련됐다", "요즘 스타일". **Rule:** every change names a user cost from [the vocabulary](README.md#vocabulary), per the report rules in [`agent-protocol.md`](agent-protocol.md#change-report-format).

## G8 — Do not remove functionality in the name of UX

**Wrong move.** Deleting a capability because it complicates the screen. **Rule:** removing a capability is the user's call — [`agent-protocol.md` → Escalation and confirmation](agent-protocol.md#escalation-and-confirmation).

## G9 — Do not redesign before understanding the intent

**Wrong move.** Proposing layout in the first paragraph of the analysis. **Rule:** the step order of [`screen-analysis.md`](screen-analysis.md) — observation first, structure only from Step 8.

## G10 — Do not review a screen you have not read

**Wrong move.** Reasoning from the route name, a memory, or an assumption about what the screen probably contains. **Rule:** [`screen-analysis.md` → Step 0](screen-analysis.md#step-0--establish-the-facts) — facts from code, docs, or a device, with assumptions marked.

## G11 — Do not judge a prototype as a finished screen

**Wrong move.** Filing findings against a screen that [`../features/`](../features/README.md) documents as `Prototype` or `Not implemented`. **Rule:** [Step 0](screen-analysis.md#step-0--establish-the-facts) judges a prototype against what it claims, and [Escalation and confirmation](agent-protocol.md#escalation-and-confirmation) asks before unfinished work is treated as a defect.

## G12 — Do not expand scope silently

**Wrong move.** Fixing three neighbouring things while changing two labels. **Rule:** [`agent-protocol.md` → Implementation rules](agent-protocol.md#implementation-rules) — stay inside the approved scope.

## G13 — Do not defer state, exits, costs, or errors

**Wrong move.** Applying `Progressive Disclosure` to system state, dismissal paths, prices, durations, irreversibility, or error messages. **Rule:** [`Progressive Disclosure`](principles.md#7--progressive-disclosure)'s Definition and its reverse Detection Rule — disclosure is for options and detail only.

## G14 — Do not use a default to bypass a decision the user owns

**Wrong move.** Defaulting a consequential, irreversible, or permission-like choice to keep the flow smooth. **Rule:** [`Smart Default`](principles.md#5--smart-default)'s Exceptions; a hidden default is `Silent Automation`.

## G15 — Do not create a new pattern when one exists

**Wrong move.** Building a bespoke sheet, selection mode, or confirmation for one screen. **Rule:** [`Consistent Interaction Pattern`](principles.md#11--consistent-interaction-pattern), and the cookbook reuse rule in [`agent-protocol.md` → Implementation rules](agent-protocol.md#implementation-rules).

## G16 — Do not fix structure with copy

**Wrong move.** Adding an explanatory sentence so a confusing screen becomes understandable. **Rule:** [`Show State, Not Instructions`](principles.md#13--show-state-not-instructions), exceptions included.

## G17 — Do not invent evidence

**Wrong move.** Citing usage numbers, user research, conversion effects, or Toss principles that were not verified. **Rule:** [the evidence labels](README.md#evidence-labels), and [Escalation and confirmation](agent-protocol.md#escalation-and-confirmation) when a decision depends on data you do not have.

## G18 — Do not break accessibility while improving hierarchy

**Wrong move.** Removing labels for visual quiet, signaling state with color alone, shrinking touch targets, or replacing text with icons — accessibility is a floor, not a trade-off dimension. **Rule:** [`review-checklist.md` → G. Accessibility floor](review-checklist.md#g-accessibility-floor).

## G19 — Do not skip verification

**Wrong move.** Reporting a UX change as done based on the diff alone. **Rule:** [`agent-protocol.md` → Implementation rules](agent-protocol.md#implementation-rules) — the verification gate and the verification surfaces.

## G20 — Do not leave the documentation behind

**Wrong move.** Shipping a behavior change and updating the feature document "later". **Rule:** [`agent-protocol.md` → Implementation rules](agent-protocol.md#implementation-rules); a new reusable rule is added as [Maintaining this directory](README.md#maintaining-this-directory) says.

## G21 — Do not optimize a screen in isolation

**Wrong move.** Making one screen locally optimal by pushing work onto the screen before or after it. **Rule:** step 4 of [the tie-breaker ladder](principle-priority.md#the-tie-breaker-ladder) — the lower total across the flow.

## G22 — Do not treat the user's stated preference as a smell

**Wrong move.** Overriding an explicit product decision because a principle says otherwise. **Rule:** [`agent-protocol.md` → Escalation and confirmation](agent-protocol.md#escalation-and-confirmation) — a settled decision is an input, not a finding.
