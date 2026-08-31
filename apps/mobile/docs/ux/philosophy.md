# Core philosophy

Four root ideas. Every principle in [`principles.md`](principles.md) must derive from at least one of them; if a proposed rule cannot be traced back here, either the rule is wrong or the philosophy is incomplete — say which.

The single sentence all four serve:

> The user reaches their own goal with the least thinking, in the fewest decisions, without needing to understand how the app is built.

Not "the screen is simple". Not "the screen looks calm". Simplicity is a means; goal completion at low cognitive cost is the end.

---

## P1 — Minimize Thinking Cost

`General UX Principle` · reinforced by Toss's `Simplicity` ([source](https://toss.tech/article/mydoc))

**Definition.** Every screen has a thinking budget. Reading, comparing, recalling, guessing, and deciding all spend it. Design spends that budget only on the judgment that genuinely belongs to the user, and pays for everything else itself — with defaults, with computation, with sensible ordering.

**Why it matters.** Users on mobile are interrupted, one-handed, and in a hurry. Thinking cost is what converts an intent into an abandonment. It is also cumulative: five small hesitations across a flow feel worse than one hard step.

**What it solves.** Abandonment mid-flow, misreading, wrong choices, "I'll do this later" that never happens, support load from users who could not tell which option applied to them.

**Failure when misapplied.** Thinking cost gets confused with *element count*, so elements get deleted and the user now has to remember, hunt, or guess — the cost moved out of the screen and into the user's head. Also: over-automation that hides a consequential decision the user actually wanted to make, which trades thinking cost for lost User Control and later distrust.

**Derives:** `Easy to Answer`, `Smart Default`, `Reduce Decision Cost`, `Recognition Over Recall`, `Show State, Not Instructions`.

---

## P2 — Make the Next Action Obvious

`General UX Principle` · reinforced by Toss's published prohibition on ambiguous CTA labels ([source](https://developers-apps-in-toss.toss.im/design/consumer-ux-guide)) and by TNS, which measures findability as a tracked number ([source](https://toss.tech/article/Toss_Navigation_Score))

**Definition.** On entering a screen, the user should identify within a glance (a) what this screen is for, (b) the one action that advances them, and (c) what that action will produce. Obviousness is a property of hierarchy plus wording plus placement — never of an explanation.

**Why it matters.** A screen that must be *decoded* before it can be *used* charges the user twice. Predictability is also the basis of trust: a user who cannot foresee a button's result either stops pressing buttons or presses them anxiously.

**What it solves.** Dead-end screens, competing CTAs, users tapping the wrong control, reversible actions treated as scary, features that exist but are never found.

**Failure when misapplied.** Enforcing exactly one visible CTA everywhere, which pushes frequent secondary actions behind menus and raises Interaction Cost for the majority path. Or shouting: three "primary" buttons is the same as none. Or over-labeling every control with a result sentence until the screen becomes copy-heavy and slow to scan.

**Derives:** `Action First`, `Outcome-Oriented CTA`, `Clear Visual Hierarchy`, `Obvious Navigation`, `One Primary Path`, `Predictable Transitions`.

---

## P3 — Ask What Users Can Answer

`Toss Principle` — `Easy to answer`: if the answer does not come within three seconds, the question is hard ([source](https://toss.tech/article/insurance-claim-process))

**Definition.** Convert every request for input into a question phrased in the user's own facts and vocabulary — what they have, what they want, where they are — never in the system's structure, entities, modes, or configuration. If a question can only be answered by someone who knows how the app works internally, it is the wrong question.

**Why it matters.** Users know their situation; they do not know your data model. The Toss insurance-claim case replaced a choice between two service paths with "서류 있나요?" — a question about the user's own desk — and abandonment fell by up to 60%. The question was reframed, not removed.

**What it solves.** System-centric prompts, settings the user cannot evaluate, choices that require reading documentation, silent wrong answers, users choosing the default not because it fits but because they cannot judge.

**Failure when misapplied.** Dumbing a question down until it becomes ambiguous ("좋은 화질로 만들까요?" hides what is actually traded). Or splitting one answerable question into three trivial ones, each cheap but the sequence expensive. Or hiding a consequence to make a question feel easy — that is a dark pattern, not an easy question.

**Derives:** `Easy to Answer`, `Speak the User's Domain`, `Question, Not Configuration`, `Consequence Visibility`.

---

## P4 — Reveal Complexity Gradually

`General UX Principle` · reinforced by Toss's `One thing per one page` ([source](https://toss.tech/article/mydoc)) and by the sign-up screen that discloses one field per interaction ([source](https://toss.tech/article/toss-signup-process)) · and by `Value first, cost later`, which orders the *reveal*: value before cost ([source](https://toss.tech/article/value-first-cost-later))

**Definition.** Show what the current decision requires, at the moment it is required, in the order that lets the user commit. Power is not removed — it is deferred to the point where it becomes relevant, and it stays reachable from where the user is.

**Why it matters.** Capability is worthless if the entry cost hides it. A preview of the outcome before the tedious work raised completion by 67% in the Toss `Value first, cost later` case: the same steps, reordered around when the user could see the point of them.

**What it solves.** Overloaded first screens, premature configuration, forms that demand data before showing the payoff, dense screens where the user cannot locate the part that matters now.

**Failure when misapplied.** Burying real functionality one tap too deep, so Discoverability collapses and expert users pay a permanent tax. Or turning one screen into a five-step wizard for a decision the user could have made at a glance. Or hiding *state* (what the system currently believes) rather than hiding *options* — state must stay visible.

**Derives:** `Progressive Disclosure`, `Value Before Cost`, `One Thing per Page`, `Defer, Don't Delete`, `Density Where Density Pays`.

---

## How the four interact

- P1 and P4 can pull apart: reducing what is on screen (P4) can raise recall cost (P1). Resolve toward whichever leaves the user's *total* effort lower, counting what they must remember.
- P2 and P4 collide constantly: making the next action obvious wants things visible; gradual reveal wants them hidden. The tie-breaker is the current step's goal — the action that serves *this* step is visible, the rest defers.
- P3 outranks P1 when they conflict: a question the user cannot answer is worse than a question they must answer. Do not delete a hard question — restate it in the user's terms, or answer it for them with a reversible default.
- P2 outranks P4 when a user could otherwise get stuck: an exit and a way forward are never progressive-disclosed. Toss publishes this as a hard rule for third-party apps — never leave the user without an exit option ([source](https://developers-apps-in-toss.toss.im/design/consumer-ux-guide)).

Full conflict resolution: [`principle-priority.md`](principle-priority.md).
