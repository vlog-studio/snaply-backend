# Visual hierarchy rules

Semantic rules only. No pixel values, font sizes, or colors — those belong to the design system. This document defines what each element *means*, how much weight it may claim, and how it is misused.

## The weight ladder

Every screen assigns weight along one ladder. Levels may be skipped; order may not be inverted.

| Level | Role | Rule |
| --- | --- | --- |
| W1 | The deciding element — the state the user came for, or the primary action | Exactly one per viewport claims W1 |
| W2 | Direct support for W1 — the object it acts on, its consequence, its blocker | Adjacent to W1, visibly lighter |
| W3 | Structure — section titles, group headers, navigation | Legible but never competing with W1 |
| W4 | Content — body text, list rows, cards | The bulk; uniform within a kind |
| W5 | Support — metadata, timestamps, counts, captions | Lowest legible weight |
| W6 | Recessive — destructive actions, decoration, rarely used affordances | Present, deliberately quiet |

Two invariants:

1. **One W1 rule.** If two elements read as W1, the screen has no entry point (`Flat Hierarchy` / `Competing CTA`).
2. **Importance–weight agreement.** Weight is assigned by importance *to the current step*, not by the element's type. A count can be W1; a title can be W3.

Preference order for creating weight difference: **position → size → contrast → isolation (whitespace) → color emphasis → motion.** Never weight by color alone (accessibility), and never by motion alone.

---

## Page Title

- **When.** Names the screen's object or goal when the context is not already obvious from the transition.
- **Weight.** W3 normally. It may be W1 only when the title itself is the information the user came for (a movie's name on its detail screen).
- **Do not combine with.** A subtitle that repeats it; a decorative header that outranks it; a title that duplicates the tab label on a tab root.
- **Common misuse.** Making the title the visual peak of a screen whose purpose is an action; titling a screen with internal vocabulary; adding a title where the previous screen's CTA already named the destination.

## Section Title

- **When.** Two or more sibling groups exist and the grouping is not self-evident.
- **Weight.** W3, uniform across all sections on the screen.
- **Do not combine with.** A single section (a lone section title means "delete the title"); a section title used as an explanatory sentence.
- **Common misuse.** Titling every block, which flattens the hierarchy back out; varying section-title weight to imply importance instead of using order.

## Body Text

- **When.** Content the user reads to decide or to consume.
- **Weight.** W4.
- **Do not combine with.** Instructional narration (see `Show State, Not Instructions`); more than about two lines in a decision context.
- **Common misuse.** Using body text to carry state that should be a labeled read-out; long copy above a form; body text styled heavier than the section it sits in.

## Supporting Text

- **When.** Metadata, timestamps, counts, secondary detail, and captions.
- **Weight.** W5, and it must stay legible — this is a contrast floor, not permission to make it unreadable.
- **Do not combine with.** Information required to take the primary action (that is W2, not W5); interactive text.
- **Common misuse.** Hiding a cost, a warning, or a required fact at W5; using it for links.

## Primary CTA

- **When.** The one action that advances the screen's goal.
- **Weight.** W1. One per viewport.
- **Do not combine with.** A second filled/emphasized button; a destructive action of equal weight; a disabled state without a visible reason; generic labels (`Outcome-Oriented CTA`).
- **Common misuse.** Two primary CTAs "because both matter"; a primary CTA for a navigation link; a bottom CTA duplicated by an inline one on the same screen; a primary CTA on a screen with no decision (a read-only detail view).

## Secondary CTA

- **When.** A legitimate alternative path, or the decline half of a question.
- **Weight.** W2–W3, visually subordinate but obviously interactive.
- **Do not combine with.** More than two secondary CTAs beside a primary one; a secondary CTA styled identically to the primary; a decline option rendered so lightly it reads as unavailable (that is a dark-pattern shape — Toss publishes never leaving the user without an exit option, [source](https://developers-apps-in-toss.toss.im/design/consumer-ux-guide)).
- **Common misuse.** Using a secondary CTA for a destructive action; making `취소` heavier than the constructive action.

## Destructive Action

- **When.** Deleting, discarding, or anything not recoverable by the user.
- **Weight.** W6 — findable, never prominent, spatially separated from constructive actions.
- **Do not combine with.** Adjacency to the primary CTA; the primary emphasis treatment; a confirmation that repeats a vague label (`정말 삭제하시겠어요?` → `삭제` when several things are deletable).
- **Common misuse.** Placing delete where a frequent action's muscle memory lands; confirming destruction with `확인`; hiding it so thoroughly that users use worse workarounds. Name the object in the label (`스냅 3개 삭제`).

## Card

- **When.** An item that is a single unit with mixed content types, and is itself actionable or navigable.
- **Weight.** W4, uniform per kind.
- **Do not combine with.** Nested cards; multiple independent actions inside one card whose primary tap target is the card itself; cards used purely to draw a border around unrelated content.
- **Common misuse.** Card-per-row lists where a plain row would be denser and faster to scan; cards that look pressable but are not (`Phantom Affordance`); mixing two object types in one card list.

## List Row

- **When.** Homogeneous items scanned for one of them, or a settings/entry list.
- **Weight.** W4, with W5 metadata inside.
- **Do not combine with.** Rows of varying interaction semantics in one list (some navigate, some toggle, some do nothing) without a visible distinction; more than one action per row without a clear affordance.
- **Common misuse.** Making one row visually special to promote it — use a separate section instead; hiding the row's chevron/toggle so its behavior is unpredictable.

## Bottom CTA

- **When.** The screen scrolls and the primary action must remain reachable, or the action commits the screen's whole state.
- **Weight.** W1, pinned.
- **Do not combine with.** More than one action in the pinned bar (one primary plus at most one text-level secondary); content hidden behind it (reserve space, respect safe areas); a bottom CTA on a screen with no commit.
- **Common misuse.** Pinning a bar that stays disabled with no stated reason; pinning three buttons; pinning while the keyboard is up so the bar covers the field being edited.

## Bottom Sheet

- **When.** A short decision or a small set of options that belongs to the screen behind it and returns the user there.
- **Weight.** Takes W1 while open; the screen behind must remain recognizable.
- **Do not combine with.** Another sheet or a dialog (`Modal Stack`); a multi-step flow; screen entry (never open a sheet just because the screen loaded — a published Toss prohibition, [source](https://developers-apps-in-toss.toss.im/design/consumer-ux-guide)); a full-height sheet that is really a screen.
- **Common misuse.** Using a sheet as a wizard; putting a scrolling form inside a sheet with a keyboard; no drag-to-dismiss or ✕ while also having no cancel button.

## Dialog

- **When.** The user must decide before anything else can proceed, or must acknowledge something consequential and irreversible.
- **Weight.** Takes W1; use rarely.
- **Do not combine with.** Transient or self-resolving failures (use a toast or inline); optional information; more than two actions; a stack of dialogs.
- **Common misuse.** Dialogs for every error (`Blaming Error`); dialogs with `확인` only, where a toast would not have interrupted; a dialog asking a question the system could have defaulted.

## Tabs

- **When.** Two to five persistent, peer destinations that the user switches between and returns to. Toss publishes 2–5 for embedded apps ([source](https://developers-apps-in-toss.toss.im/design/consumer-ux-guide)); this app uses four plus a center capture button that is an action, not a tab.
- **Weight.** W3, constant, always showing which tab is current.
- **Do not combine with.** In-screen segmented controls that look like the tab bar; tabs that carry an action rather than a destination; a tab that appears or disappears conditionally; state that resets on tab switch when the user expects it preserved.
- **Common misuse.** Using tabs for a flow's steps; hiding the tab bar on a pushed screen inconsistently; more than five destinations, which is an information-architecture problem, not a labeling one.

## Navigation

- **When.** Every screen. The user must always be able to answer "where am I" and "how do I get back".
- **Weight.** W3 for the bar, W6 for the back affordance itself — quiet but always present.
- **Do not combine with.** Blocked or redefined back gestures; a modal without ✕; back that silently destroys work; two names for one destination.
- **Common misuse.** A header full of icon-only actions with no labels; a modal presented as a push (or the reverse), so the dismissal gesture mismatches the platform; deep links that land with no up-path.

## Empty State

- **When.** A data-backed surface has no items — distinguish "nothing yet" from "nothing matched a filter" from "failed to load".
- **Weight.** The resolving action is the clearest element (W1). Illustration may be W2 only here.
- **Do not combine with.** A paragraph of explanation (project rule: one short line at most); a spinner; an empty state that hides the surface's controls, so the user cannot change the filter that caused it.
- **Common misuse.** Using the same empty state for "no snaps yet" and "no results for this filter"; making the empty state prettier than the populated state; omitting the action that fills it.

## Loading State

- **When.** Data or work is in flight.
- **Weight.** Occupies the position of the content it replaces; never W1 unless the loading *is* the screen (generation progress).
- **Do not combine with.** A blank screen; a layout that shifts when content arrives; a full-screen blocker for a partial update; a spinner where the final layout's shape is known (use a skeleton).
- **Common misuse.** Blocking the whole app for a background operation; no distinction between "loading" and "empty"; long operations with no progress or no way to leave (see `interaction-patterns.md` → long-running process).

## Error State

- **When.** An action or load failed.
- **Weight.** Scoped to what failed — inline at the failure site for field/block scope, toast for transient, dialog only when a decision is required.
- **Do not combine with.** Destroying content the user could still use; codes as the headline; `확인` as the only action; blame.
- **Common misuse.** One global error banner for every failure regardless of cause; retry that repeats the same failure with no changed condition and no explanation; error copy that is longer than the fix.

---

## Screen-level checks

Run these on any screen you touch:

- **One W1.** Exactly one element claims the top of the ladder.
- **Grayscale test.** In grayscale at reduced scale, W1 is still obvious and W3–W5 are still distinguishable.
- **Reading order.** Top-to-bottom order matches importance to the current step; W2 sits adjacent to W1, not at the bottom.
- **Interactive invariance.** One consistent treatment for pressable, one for disabled, across the whole screen — and disabled always has a discoverable reason.
- **Graphic budget.** At most one major graphic, and it never outranks the deciding state.
- **Density coherence.** Items of one kind share one weight; a promoted item gets a section, not a bigger card.
- **Safe areas and scale.** Pinned elements respect safe areas and the keyboard; the hierarchy survives the largest supported font scale.
