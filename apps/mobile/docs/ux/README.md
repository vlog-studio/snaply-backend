# Snaply UX Operating System

This directory is the shared decision system that humans and AI agents use to judge, review, and change the user interface of this app. It is not a style guide and not a one-off audit. It exists so that a request like "this screen feels off, fix it" produces a reasoned change with a stated cause, not a change of taste.

Design tokens (color, type scale, spacing, radius, motion curves) are **out of scope** here. They belong to the design system. This directory owns *semantics*: what a screen is for, what the user must decide, what must be visible now, and what the words must say.

## Reading order

| # | Document | What it decides |
| --- | --- | --- |
| 1 | [`philosophy.md`](philosophy.md) | The four root ideas every other rule derives from |
| 2 | [`principles.md`](principles.md) | 17 applicable principles, each with a machine-checkable Detection Rule |
| 3 | [`ux-smells.md`](ux-smells.md) | Named defects to classify a screen's problems quickly |
| 4 | [`screen-analysis.md`](screen-analysis.md) | The 10-step analysis a review must run before proposing anything |
| 5 | [`visual-hierarchy.md`](visual-hierarchy.md) | Semantic role, weight, and misuse of every screen element |
| 6 | [`interaction-patterns.md`](interaction-patterns.md) | Canonical answers for 22 recurring situations |
| 7 | [`ux-writing.md`](ux-writing.md) | Copy rules for CTAs, questions, explanations, errors |
| 8 | [`examples.md`](examples.md) | 13 before/after screens with the reasoning shown |
| 9 | [`agent-protocol.md`](agent-protocol.md) | The exact procedure and output format for an agent doing UX work |
| 10 | [`guardrails.md`](guardrails.md) | Failure modes an agent must not commit |
| 11 | [`principle-priority.md`](principle-priority.md) | How to resolve principles that conflict |
| 12 | [`review-checklist.md`](review-checklist.md) | The gate for a PR or screen review |

Minimum context for any UX task: `principles.md`, `ux-smells.md`, `agent-protocol.md`, `guardrails.md`. Add the rest as the task requires.

## Evidence labels

Every principle, pattern, and rule in this directory carries one label. The label states *where the authority comes from*, so that a reader can weigh it. Never relabel a rule upward, and never attribute a rule to Toss that Toss has not published.

| Label | Meaning |
| --- | --- |
| `Toss Principle` | Named and published by Toss in an official channel (toss.tech, toss.im, Toss developer docs, Toss conference sessions). A source URL is required. |
| `Toss Pattern` | Repeatedly observable in Toss products, but not published by Toss as a named principle. Describes an observation, not an official rule. |
| `General UX Principle` | Established UX/HCI knowledge, independent of Toss. |
| `Derived Principle` | Formulated for this project by combining the above with this codebase's constraints. Ours to change. |

### Verified `Toss Principle` sources

These are the Toss-published items this directory relies on. Everything else labeled `Toss Principle` must add its own source.

| Item as published | Source |
| --- | --- |
| `Easy to answer` — a question a user cannot answer within 3 seconds is a hard question | [토스 디자인 원칙, Easy to answer](https://toss.tech/article/insurance-claim-process) |
| `One thing per one page`, `Simplicity`, `Less Policy` — named as Toss product principles in a redesign retrospective | [크고 복잡한 제품, 과감하게 갈아엎기](https://toss.tech/article/mydoc) |
| `Value first, cost later` — communicate the value clearly before asking for the cost; adding a value preview raised completion of an inquiry flow by 67% | [토스 디자인 원칙 Value first, cost later](https://toss.tech/article/value-first-cost-later) |
| `1 thing for 1 page` and `Sleek experience` applied to the sign-up screen; progressive per-interaction field disclosure | [거꾸로 입력하는 가입 화면](https://toss.tech/article/toss-signup-process) |
| The 8 writing principles (predictable hint, weed cutting, remove empty sentences, focus on the key message, easy to speak, suggest over force, universal words, find hidden emotion) | [토스의 8가지 라이팅 원칙들](https://toss.tech/article/8-writing-principles-of-toss) |
| The 6 error-message principles (the best error is one that never happens; use the right component; tell users how to solve it themselves; write in the user's language; make the fix easy; minimize negative emotion) | [좋은 에러 메시지를 만드는 6가지 원칙](https://toss.tech/article/21021) |
| `TNS (Toss Navigation Score)` — findability measured in the live app as a tracked score, reviewed with product teams | [TNS 제작기](https://toss.tech/article/Toss_Navigation_Score) |
| Published dark-pattern prohibitions and writing rules for third-party apps inside Toss: no bottom sheet on entry, no back-button interception, never leave the user without an exit option, no unexpected full-screen ads, no ambiguous CTA labels; 해요체, active voice, positive phrasing, one major graphic per screen, 2–5 tabs | [Apps in Toss — UI/UX 가이드](https://developers-apps-in-toss.toss.im/design/consumer-ux-guide) |

What is **not** verified: Toss's full internal product-principle list. Only the individual principles named in the sources above may be cited as `Toss Principle`. Third-party analyses of Toss are supporting material only and never a source for that label.

## What "Toss-inspired" means here

It means the *decision procedure*: reduce what the user has to think about, ask only questions the user can answer, make the next action obvious, and reveal complexity when it becomes relevant. It does **not** mean Toss's blue, Toss's card shapes, Toss's type, or Toss's iconography. A change justified by "Toss looks like this" is rejected; a change justified by "this screen asks the user a question they cannot answer, per `Easy to Answer`" is accepted.

## Vocabulary

Use these terms in reviews instead of aesthetic adjectives ("clean", "pretty", "modern", "sleek" are not arguments).

| Term | Meaning in a review |
| --- | --- |
| Cognitive Load | How much the user must hold in mind to proceed |
| Decision Cost | Number and difficulty of judgments the screen demands |
| Interaction Cost | Taps, scrolls, keystrokes, and screen transitions to reach the goal |
| Discoverability | Whether a user can find a capability without being told |
| Predictability | Whether the user can foresee the result of an action before taking it |
| Information Hierarchy | Whether visual weight matches actual importance |
| Error Prevention | Whether the design makes the wrong action hard to take |
| User Control | Whether the user can inspect, change, or undo what the system decided |
| Reversibility | Cost of undoing an action |

## Product context this system assumes

Snaply is an AI short-form vlog studio: a user captures short snaps, gathers picks into a draft movie, and generates the finished movie from it (the intermediate 담기 트레이 was removed 2026-08-12). Four tabs (`스튜디오`, `스냅`, `무비`, `나`) plus a center capture button; full-screen modals for `/capture` and `/extract`. See [`../features/README.md`](../features/README.md) for the current route map and implementation status, which is the factual baseline any UX review must read before claiming a screen is broken.

Two project decisions already settled, which this system encodes rather than re-litigates:

- **No explanatory UI copy.** Screens do not narrate themselves. State, short read-outs, and accessibility hints stay; instruction lines and empty-state paragraphs are cut. See `principles.md` → `Show State, Not Instructions`.
- **Korean product copy in 해요체.** Product strings are Korean. Code identifiers, file paths, and this documentation stay English.

## Maintaining this directory

- Treat these documents as code. A UX rule that the app knowingly violates is either a documented exception or a bug — never a silent divergence.
- When a review produces a genuinely new rule, add it with a `Derived Principle` label, a Detection Rule, and at least one Exception. A rule with no exception is a bug in the rule.
- When a `Toss Principle` claim cannot be traced to a URL, downgrade its label instead of deleting the rule.
- Add new before/after cases to `examples.md` as they occur in real PRs; the catalog's value comes from being drawn from this app.
