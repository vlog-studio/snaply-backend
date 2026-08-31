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

Recurring conflicts, pre-decided so reviews do not re-argue them.

### One Thing per Page vs. Reduce Decision Cost

Splitting reduces per-screen load but adds transitions. **Group questions that share one mental context and are answered from the same fact; split when an answer branches the flow or the input needs the whole screen.** Two to four related, cheap questions on one screen beats four screens. Over-splitting is `Over-Split Flow`.

### Progressive Disclosure vs. Obvious Navigation

Hiding lowers load but costs Discoverability. **Never exceed one disclosure level on a primary path.** Defer by expected frequency: below ~10% of sessions may be deferred; a frequent control stays visible even at the cost of density. Verify with the TNS-style findability question ([source](https://toss.tech/article/Toss_Navigation_Score)) — if a first-time user would not find the new location, the deferral failed.

### Smart Default vs. User Control

Defaults remove decisions but can remove agency. **A default is legitimate only when it is visible, reversible, and inferable.** Fails any of the three → ask an answerable question instead. Never default a permission, a spend, a deletion, or a share.

### Value Before Cost vs. transparency

Showing value first must never mean hiding the bill. **Value first in *sequence*; cost fully disclosed before the commit**, adjacent to the CTA that incurs it. Back-loading a cost is `Hidden Cost` and is treated as a dark pattern, not a funnel optimization.

### Show State, Not Instructions vs. genuine novelty

Cutting copy can strand a truly new mechanic. **Structure and labels first; if a mechanic still cannot be inferred, one short hint at the point of first use, dismissible, shown once.** Never a paragraph, never a carousel, never at the expense of accessibility labels.

### Density vs. Clear Visual Hierarchy

Dense screens can flatten. **Density is allowed for homogeneous find/compare content; hierarchy is then carried by grouping, ordering, and headers rather than by size contrast.** If item kinds differ, split the sections before reducing density.

### Action First vs. Value Before Cost

A screen cannot both lead with the action and lead with the preview. **Lead with the preview when a costly step follows and the user has not yet seen the payoff; lead with the action in every repeat and routine case.** First run differs from the hundredth.

### Consistent Interaction Pattern vs. platform convention

**Platform convention wins.** Users' expectations come from the OS before they come from our app. Internal consistency applies to what we invent, not to what the platform already defines.

### Consistent Interaction Pattern vs. a better new pattern

**Consistency wins until the migration is planned.** A better pattern applied to one screen is a net loss; adopt it app-wide in a bounded plan, or not yet.

### Outcome-Oriented CTA vs. space

**Shorten the outcome, never genericize it.** `무비 만들기` beats `확인`. If nothing fits, use the short label and carry the full outcome in the accessibility label and the adjacent heading.

### Easy to Answer vs. expert precision

**Both, at different depths.** The primary path asks the answerable question; precision controls live one disclosure away for the users who want them. Never remove the precise control to make the simple one look cleaner (G1, G4).

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
