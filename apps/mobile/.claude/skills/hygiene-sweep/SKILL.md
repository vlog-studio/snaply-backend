---
name: hygiene-sweep
description: >-
  Audit a codebase for duplicate implementations, dead code, unused dependencies, and
  documentation that has drifted from the code — then remediate the findings the user picks,
  verify them, and ship them as commits and a PR. Use this whenever the user asks to review or
  clean up a project as a whole ("프로젝트 전체 점검", "중복 구현 찾아줘", "안 쓰는 코드",
  "문서가 코드랑 맞는지 봐줘", "tech debt", "cleanup pass", "what should we refactor",
  "is anything unused"), or after a milestone lands and the tree needs a hygiene check. Reach
  for it even when the user names only one symptom — "find duplicate code" is usually the start
  of a full sweep. Not for debugging a specific known failure, reviewing a single diff or PR, or
  building a requested feature.
---

# Hygiene sweep

Find what a codebase has accumulated — the same thing implemented twice, code nothing calls,
documentation describing a version of the app that no longer exists — then fix the part the
user chooses and ship it.

The value is not in producing a long list. Scanners produce long lists. The value is in the
judgment layer: separating "this is duplicated and the copies must stay in sync" from "these
two look alike and have different reasons to change", and separating "this export is dead" from
"this export is deliberately retained and there is a comment saying so." A sweep that reports
noise costs the user more time than it saves.

## When not to use this

- **A specific known failure.** "The player crashes on Android 14" is debugging. Sweeps are for
  when nobody has named the problem yet.
- **Reviewing one diff or PR.** That work is scoped to what changed; a sweep is scoped to what
  accumulated. Use the project's code-review path instead.
- **Implementing a feature.** Even a cleanup-flavored one ("extract this into a hook") — if the
  user already knows what they want built, just build it.
- **Performance work.** Profiling answers different questions than these scanners do.

## Inputs

Establish these before Phase 1. Ask only about what you cannot determine yourself.

| Input | How to get it | Ask the user when |
| --- | --- | --- |
| Repo root and scope | Default to the working directory, whole tree | The repo is a monorepo — which package? |
| Depth: report-only or report-then-fix | Default to report first, then let them pick | Never — always report before touching anything |
| Verification surface | Read `package.json` scripts, CI config, and any testing/verification doc | The project verifies on hardware or a device you cannot reach |
| Convention documents | Phase 0 finds these | They do not exist — then say so and fall back to imitating the surrounding code |

## Procedure

### Phase 0 — Orient before scanning

Read the project's own rules first. A sweep that recommends changes contradicting the
project's architecture guide is worse than no sweep.

Look for, in order: `AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md`, `.cursorrules`, then whatever
they route to (`docs/architecture/`, `docs/conventions/`, `docs/workflows/`). Many repos put an
index in the root file and the actual rules behind links — follow them.

Capture four things, because every later phase depends on them:

1. **Layering/boundary rules** — what may import what. This decides where an extraction can go.
2. **The documentation contract** — which docs must change when behavior changes, and in what
   language. Some repos require agent docs in English and human docs in another language.
3. **Verification commands** — the real ones, from `package.json` scripts or CI. Never invent a
   command; running `npm test` in a repo whose script is `test:ci` wastes a cycle and reports a
   false failure.
4. **Commit and PR conventions** — read `git log` for prefix style, body depth, and language,
   and `gh pr view <recent>` for body structure. Match what is there.

### Phase 1 — Mechanical scan

Run the bundled scanner. It emits *candidates*, never verdicts.

From the Snaply monorepo root, enter the mobile workspace first so source paths quoted inside
the docs resolve against the same base as the scanner:

```bash
cd apps/mobile
node .claude/skills/hygiene-sweep/scripts/scan.mjs all --src src --docs docs
```

Do not run the scanner from the monorepo root with prefixed `--src apps/mobile/src` paths: its
doc-reference checks resolve unprefixed paths against the current directory and will report false misses.

Adjust `--src`, `--docs`, `--alias`, and `--entry` to the repo (`scan.mjs` with no arguments
prints the options). `--entry` matters for framework routers: files a router discovers by
filesystem convention are imported by nothing and would otherwise all report as orphans.

Run `dupes` a second time at `--min 6`. A duplicated block usually has *different* first and
last lines — a renamed style key, a different prop name — which shears the ends off the match
and can push a real 40-line duplicate below the default threshold.

### Phase 2 — Judgment pass

This is where the skill earns its keep. Read `references/judgment.md` before triaging: it
covers how to tell deliberate retention from accident, when duplication is correct, and which
scanner outputs are structurally noisy.

Open every candidate. For each, decide:

- **Real** — and write down the concrete consequence. Not "this is duplicated" but "these two
  must stay in sync and nothing enforces it; the next change to one will not reach the other."
- **Intentional** — a comment or doc explains why it stays. Do not report it as cruft. You may
  note it once, as confirmation the intent is still documented.
- **Noise** — a scanner artifact. Drop it silently.

Two signals worth hunting for directly, because they are high-yield and scanners miss them:

- **A comment that admits duplication.** Phrases like "same shape as", "mirrors", "kept in sync
  with", "copied from" mean a past author noticed and did not extract. That is a finding with a
  built-in justification.
- **A shared helper that one call site bypasses.** If a repo has `useThing` and one component
  reimplements it inline, the inline copy usually also *lacks a fix* the shared version has.
  Diff their behavior — the duplication is often the smaller half of the finding.

### Phase 3 — Documentation drift

Code-vs-doc drift is the half most sweeps skip. Three cheap, high-yield checks:

1. **Docs contradicting each other.** Two documents describing the same route or flow
   differently means at least one is stale, and you find it without reading any code. This is
   the single highest-yield drift check.
2. **Last-touched dates.** `git log -1 --format='%ad %s' --date=short -- <doc>` against the
   commits that changed the code it describes. A doc that stopped moving three feature commits
   ago is stale by default.
3. **Inventory completeness.** If a doc enumerates modules, routes, or ownership, diff the list
   against the filesystem. Missing entries are the most common drift and the easiest to fix.

### Phase 4 — Report, then stop

Deliver the report (format below) and stop. Do not start fixing. The user decides what is worth
doing; a finding you consider critical may be a deliberate trade-off they already made.

### Phase 5 — Remediate what was chosen

Fix only what the user picked. When a new finding surfaces mid-fix, note it for the report —
do not widen the change.

For each fix:

- **Follow the project's placement rules**, not your instinct. An extraction goes where the
  layering doc says shared code goes.
- **Extract on the second real consumer, not the first.** Most repos say this explicitly; it is
  also just true. Two call sites is evidence, one is speculation.
- **Keep business vocabulary out of shared code.** When two screens share chrome but differ in
  wording, the shared piece takes primitives and each caller keeps its own strings. If the
  extraction forces both callers to say the same thing, it was the wrong seam.
- **Prove behavior is preserved, not just that text moved.** Every simplification is a claim.
  Check each one: is a swapped key equivalent? Is that hardcoded hex the same value as the token
  you replaced it with? Does the template literal build the same string the JSX children did?
  Write the check down; it belongs in the commit message.
- **Update the docs the contract requires, in the same change.**

### Phase 6 — Verify

Run the project's real gates. Then verify at the level the change actually needs — a
type-checked refactor of rendering code is not proven by types alone.

**Check what your verification is measuring before you quote it.** A test count can be inflated
by stale copies of the suite in build or worktree directories; a green lint run can be green
because the config ignores the files you changed. If a number looks surprisingly large or small,
find out why before putting it in a report.

**Separate your failures from pre-existing ones.** Before claiming you broke or fixed anything,
check the baseline:

```bash
git stash && <gate command>; git stash pop     # or compare against the HEAD version of the file
```

Report pre-existing failures as pre-existing, and do not fix them inside a scoped change.

### Phase 7 — Ship

Only when the user asks for commits or a PR.

- **Branch first if on the default branch.** Never commit directly to `main`.
- **Split commits by concern.** Code changes and their contract-required doc updates go
  together; unrelated doc corrections go in their own commit. Reviewers read them separately.
- **Write the *why* in the body.** Match the repo's observed depth and language. State what was
  wrong, why the fix is shaped this way, what you verified, and what you could not verify.
- **Put the caveats in the PR body.** Pre-existing failures, verification you could not perform,
  and findings you deliberately left out all belong there. A reviewer who discovers them later
  trusts the rest of the PR less.

## Rules

- **Report before remediating.** Always. Scope is the user's call.
- **Every finding carries a `file:line` and a consequence.** A finding without a concrete
  pointer is an opinion; a finding without a stated consequence cannot be prioritized.
- **A scanner hit is a candidate, not a finding.** Anything you report, you have read.
- **Documented intent wins.** Dead code with a comment explaining why it stays is not a finding.
- **Never silently widen scope.** Out-of-scope discoveries get flagged, not fixed.
- **Never claim unperformed verification.** "Not verified on iOS hardware" is a complete,
  acceptable sentence. Implying otherwise is the one failure that damages every other claim.
- **Do not reformat files you did not otherwise change**, and do not fix pre-existing lint or
  formatting failures inside a scoped change — it buries the real diff.
- **Preserve the repo's language and conventions** in code, comments, commits, and docs.

## Failure handling

| Situation | Response |
| --- | --- |
| A gate fails after your change | Check the baseline first (Phase 6). Pre-existing → report as pre-existing and move on. Yours → fix before proceeding. |
| A gate fails for an unrelated reason (missing env, no network) | Report which gates ran and which could not, with the reason. Do not present a partial run as a full one. |
| The scanner floods with false positives | The repo's layout does not match the defaults. Re-run with corrected `--src`/`--alias`/`--entry` rather than triaging noise by hand. |
| Verification needs a device, credential, or service you lack | Complete everything else, then state plainly what is unverified and what would verify it. Ask the user if they can provide it. |
| A "simple" fix turns out to need a design decision | Stop and ask. Present the options and your recommendation; do not pick silently inside a cleanup. |
| A finding is real but the fix exceeds the agreed scope | Leave it. Put it in the report's "not included" list with enough detail to act on later. |
| Convention documents disagree with the code | Report the discrepancy as a finding. Do not spread the undocumented exception, and do not "fix" the code to match a doc without asking. |
| The user rejects a finding | Accept it and move on. They may know a constraint you do not. Do not re-argue it in the PR body. |

## Completion criteria

A sweep is done when all of these hold:

- [ ] Every reported finding has a `file:line` and a stated consequence.
- [ ] Every scanner candidate was read, then classified real / intentional / noise.
- [ ] Documentation drift was checked in all three directions: docs↔code, docs↔docs, inventory completeness.
- [ ] Fixes cover exactly what the user chose — no more, no less.
- [ ] The project's own gates pass, and you know what each one measured.
- [ ] Behavior-preservation claims are individually checked, not assumed.
- [ ] Contract-required docs were updated in the same change as the code.
- [ ] Unverified surfaces are named explicitly.
- [ ] Out-of-scope findings are listed rather than silently dropped.

### Verification commands

Discover the real ones — do not assume these names exist:

```bash
node -p "Object.entries(require('./package.json').scripts||{}).map(([k,v])=>k+': '+v).join('\n')"
ls .github/workflows/ 2>/dev/null && cat .github/workflows/*.y*ml
```

Then run whatever that reveals — typically a type check, a linter, a test run, and a formatter
check. Run the scanner once more at the end: the counts should have moved in the direction your
fixes claim, and that is a cheap check on your own work.

## Report format

```markdown
[One or two sentences: health baseline first — what passes, what is already clean — so the
findings below read as exceptions rather than as a verdict on the whole codebase.]

## 1. Duplicate implementations

### 🔴 [Finding title]
[file:line] and [file:line] are [what is identical]. [Why they must stay in sync, and what
breaks when they drift.] [Any evidence a past author already noticed.]

### 🟠 [Finding title]
...

## 2. Unused code
[Group by kind: exports with no consumer, dead modules, unused dependencies. Table where the
list is long. Note which are deliberate — with the comment or doc that says so.]

## 3. Documentation not connected to the code
[Per document: what it claims, what the code does, and the line. Call out docs that contradict
each other — that is the strongest evidence of drift.]

---

## Summary
[Two or three items ranked by value, each with one sentence of justification. This is what the
user acts on — everything above is supporting evidence.]
```

Severity: 🔴 causes wrong behavior or will break on the next change · 🟠 real cost, no immediate
breakage · 🟡 worth knowing, low urgency.

Order sections by value to the reader, not by how you found them. Keep intentional-by-design
items visibly separate from accidental ones, so the user is not asked to re-litigate decisions
they already made.

## Bundled resources

- `scripts/scan.mjs` — the five mechanical checks (`dupes`, `exports`, `orphans`, `docrefs`,
  `deps`). Run with no arguments for usage.
- `references/judgment.md` — triaging candidates into real / intentional / noise. Read this
  during Phase 2.
- `references/worked-example.md` — a complete sweep on a real repo: scanner output, the
  judgment calls, the report, the fixes, and the shipped PR. Read when you want to see the
  expected shape end to end.
