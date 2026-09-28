# Principle priority and conflict resolution

Principles conflict routinely. This document decides which one yields.

The objective is never "obey principle N". It is:

> The user achieves their own goal at the lowest total cognitive cost, without losing capability or control.

A change that satisfies a principle while raising total cost is a regression, however well-cited.

---

## The tie-breaker ladder

Apply in order. Stop at the first level that decides the case.

| # | Test | Wins |
| --- | --- | --- |
| 1 | **Blocking** — does one option leave a user unable to proceed, exit, or recover? | The non-blocking option. `Preserve User Control and Exit` outranks everything. |
| 2 | **Loss** — does one option risk losing data, work, money, or a permission that is expensive to re-ask? | The lossless option. `Errors Are Design Failures First`, `Value Before Cost`. |
| 3 | **Answerability** — does one option leave the user facing a question they cannot answer? | The answerable option. `Easy to Answer` outranks convenience and brevity. |
| 4 | **Total cost across the flow** — sum decisions, transitions, and recall points end to end. | The lower total. Never optimize one screen at another's expense (G21). |
| 5 | **Frequency weighting** — which user group and which path is affected more often? | The majority path, with the minority path kept reachable and named. |
| 6 | **Reversibility** — can a wrong outcome be undone cheaply? | The more reversible option, when the two are otherwise equal. |
| 7 | **Consistency** — does one option match an established app pattern? | The consistent option. Novelty needs a reason. |
| 8 | **Still tied** | Escalate to the user with both options, the trade-off, and a recommendation. Do not pick by taste. |

---

## Standing resolutions

Recurring conflicts, pre-decided so reviews do not re-argue them. Each resolution is written once, in the principle that yields or bends:

| Conflict | Resolved in |
| --- | --- |
| One Thing per Page vs. Reduce Decision Cost | [#1 Exceptions](principles.md#1--one-thing-per-page) — when to split, and when to group |
| Progressive Disclosure vs. Obvious Navigation | [#7 Exceptions](principles.md#7--progressive-disclosure) — one disclosure level; frequent controls stay visible |
| Smart Default vs. User Control | [#5 Exceptions](principles.md#5--smart-default) — only a visible, reversible, inferable default |
| Value Before Cost vs. transparency | [#8 Detection Rule](principles.md#8--value-before-cost) — value first in sequence, cost before the commit |
| Show State, Not Instructions vs. genuine novelty | [#13 Exceptions](principles.md#13--show-state-not-instructions) — the one-time hint |
| Density vs. Clear Visual Hierarchy | [#17](principles.md#17--density-where-density-pays) — grouping carries the hierarchy |
| Action First vs. Value Before Cost | [#3 Exceptions](principles.md#3--action-first) — the preview leads only before the payoff is seen |
| Consistent Interaction Pattern vs. platform convention | [#11 Exceptions](principles.md#11--consistent-interaction-pattern) — the platform wins |
| Consistent Interaction Pattern vs. a better new pattern | [#11 Exceptions](principles.md#11--consistent-interaction-pattern) — consistency until the migration is planned |
| Outcome-Oriented CTA vs. space | [#4 Exceptions](principles.md#4--outcome-oriented-cta) — shorten the outcome, never genericize it |
| Easy to Answer vs. expert precision | [#2 Exceptions](principles.md#2--easy-to-answer) — both, at different depths |

---

## Conflict report format

When a conflict shaped the design, say so — the reasoning is the deliverable, and an undocumented conflict gets re-litigated next month.

```text
Conflict   <principle A> vs. <principle B>
Case       <what specifically pulls them apart on this screen>
Resolved   <which won> — via ladder step <#> / standing resolution <name>
Cost moved <what got worse, for whom>
Revisit if <the observation that would flip the decision>
```

The `Revisit if` line matters most: it turns a judgment call into something falsifiable later, instead of a rule nobody remembers the reason for.
