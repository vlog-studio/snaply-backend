# A worked sweep

One real run, start to finish, on a React Native + Expo app (~18k lines, FSD layering, feature
docs under a documented contract). Read it for the *shape* of the decisions — the specific
findings belong to that repo, the reasoning transfers.

## Phase 0 — Orient

Root `AGENTS.md` turned out to be an index, not the rules: a table routing task categories to
documents under `docs/architecture/`, `docs/conventions/`, `docs/workflows/`, `docs/features/`.
Following those links produced the four things the sweep needed:

- **Layering** — strict FSD import direction; shared code goes in `shared/`, and extraction is
  justified "when a second real consumer appears."
- **Doc contract** — any user-visible change must update the affected `docs/features/*` document
  *in the same change*; agent docs in English, human guides in Korean.
- **Gates** — `typecheck`, `lint`, `test:ci` (not `test`, which is watch mode).
- **Conventions** — `git log` showed `<Type>: <Korean subject>` with long *why*-focused bodies
  and a device-verification paragraph; `gh pr view` showed a fixed four-section body.

Skipping this phase would have produced an extraction in the wrong layer, an English commit in a
Korean history, and a `npm test` invocation that hangs in watch mode.

## Phase 1–2 — Scan, then judge

`scan.mjs all` plus a second `dupes` pass at `--min 6`. Roughly 70 candidates in, 12 findings
out. The interesting classifications:

**Real, and the strongest finding of the sweep.** Two screens rendered the same full-screen
media player — identical modal props, identical close-button geometry down to the border radius,
identical overlay colors. What made it worth leading with was not the similarity but a docstring
on one copy reading *"Same shape as the archive's clip preview modal."* A past author had
noticed and deferred. That comment was the finding's own justification.

**Real, and bigger than it looked.** A picker cell reimplemented a shared thumbnail hook with a
local effect. The duplication was the smaller half: the shared hook keyed its resolved result to
the source URI and the local copy did not, so a recycled list cell could briefly show the
previous item's frame. The write-up led with the behavior, not the duplication.

**Intentional — reported as confirmation, not cruft.** An unused auth provider constant had a
comment explaining it stays until that provider is enabled, and a feature doc listing it as
`Deferred`. Reporting it as dead code would have asked the user to re-litigate a decision they
had already made and documented.

**Noise.** Type exports sitting beside their components; four near-identical auth form bodies
that the repo's own convention says are fine to keep separate.

**Two near-identical bottom sheets — reported at low severity with the reasoning inverted.**
Their markup and styles matched, but each carried a docstring explaining they answer different
questions ("where do these go?" vs. "what am I looking at?"). Reported as *"extract the shared
row primitive, keep the two sheets"* — the seam test said the duplication was presentational,
not semantic.

## Phase 3 — Documentation drift

The highest-yield finding came from reading two docs against each other, with no code involved:
the feature index described a route (`/capture/record`) that a sibling document explicitly said
had been removed. One of them had to be wrong, and the filesystem settled it in seconds.

`git log -1 -- <doc>` explained why: the index had stopped moving four feature commits earlier.
That same date check then predicted the rest of its drift — a missing route group, five missing
routes, thirteen missing entries in its ownership map, and a stale one-line summary of the auth
feature. All confirmed by diffing its inventory lists against the filesystem.

A second document contradicted a third about whether an integration was still mocked. The
document that *owned* the integration was current; the one referring to it was stale. When two
docs disagree, the owner is usually right.

## Phase 4 — Report

Three sections (duplication / unused / doc drift), severity-marked, each finding carrying a
`file:line` and a consequence. It closed with three ranked recommendations — which is what the
user actually replied to. They picked all three; everything else stayed on the list.

## Phase 5–6 — Remediate and verify

The extraction went to `shared/ui/`, taking a bare URI and two strings rather than a domain
object, so each screen kept its own wording. That was the seam test applied: the two callers
genuinely needed to say different things, and a `children` slot would have pushed the shared
styling back out to both.

Three behavior-preservation claims, each checked rather than assumed:

- A React `key` changed from an id to a URI — equivalent only because the two are 1:1 in this
  data model. Verified before relying on it.
- A hardcoded hex removed in favor of a default — verified that the theme token resolved to
  exactly that hex, making the change a visual no-op.
- JSX children replaced by a template literal — verified the two produce byte-identical strings.

Two verification traps, both caught by asking what a number measured:

- The test count was inflated roughly sixfold by stale copies of the suite inside leftover
  worktree directories that the test runner collected but the linter and formatter ignored. The
  honest figure was 47 suites, not 277. The config fix was out of scope, so it was flagged and
  the reported figures were taken with the stale paths excluded.
- The formatter failed on thirteen files, two of which the sweep had touched. Checking their
  `HEAD` versions showed both already failed before the change, at lines outside the edits. They
  were reported as pre-existing and left alone, rather than reformatted into the diff.

Device verification then exercised both call sites on real hardware. The most convincing single
piece of evidence was incidental: the close control reported *identical* screen bounds on both
screens, which is direct proof the chrome had become one implementation.

## Phase 7 — Ship

Branch off the default branch. Two commits, split by concern:

1. The code extraction plus the two feature docs the contract required alongside it.
2. The stale index correction plus an unrelated doc fix found during verification.

The PR body carried the caveats in their own section: the inflated test count and why the quoted
figures excluded it, the pre-existing formatter failures, and the six findings deliberately left
out. Reviewers who find those later trust the rest less; reviewers who are told up front do not.

## What transferred

- Orienting first changed where the extraction landed, what language the commits used, and which
  gate commands ran.
- The two highest-value findings came from *reading* — a docstring admitting duplication, and two
  docs contradicting each other — not from a scanner.
- The scanner's job was coverage: it found the unused dependencies and the dead exports that
  reading would have missed, and it confirmed there were no orphaned modules.
- Every number in the report survived the question "what is this actually measuring?" Two did not
  survive it on the first pass.
