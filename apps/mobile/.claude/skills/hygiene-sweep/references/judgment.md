# Triaging candidates

Read during Phase 2, before writing any finding down. Every candidate resolves to one of three
things: **real** (report it), **intentional** (do not report it as cruft), or **noise** (drop it
silently). Getting this wrong in the noisy direction is what makes a sweep worthless — a report
padded with scanner artifacts trains the reader to skim.

## Contents

- [Duplication: when it is a finding](#duplication-when-it-is-a-finding)
- [Dead code: accident vs. deliberate retention](#dead-code-accident-vs-deliberate-retention)
- [Unused dependencies](#unused-dependencies)
- [Documentation drift](#documentation-drift)
- [Known scanner artifacts](#known-scanner-artifacts)

## Duplication: when it is a finding

The test is not "how similar is this?" — it is **"if one copy changes, must the other?"**

Most style guides (and most repos' own architecture docs) say some version of: *if two pieces of
code look similar but have different reasons to change, duplication is acceptable.* Respect
that. Premature extraction couples things that should move independently, and it is harder to
undo than the duplication was.

### Report it when

- **The copies encode one decision.** Same modal chrome, same date format, same validation rule.
  A change to one is a bug in the other.
- **They already drifted.** Two spellings of the same status, two paddings for the same
  component. The drift is the proof, and it is the most persuasive kind of finding.
- **One copy has a fix the other lacks.** A guard, a cleanup, a race fix. Here duplication is
  the smaller half of the finding — lead with the behavioral difference. Diff them properly
  before writing it up; "these differ subtly" without saying how is not actionable.
- **A comment admits it.** "Same shape as X", "mirrors Y", "kept in sync with Z". Someone
  noticed and deferred. Quote the comment — it is the justification, pre-written.

### Leave it alone when

- **The similarity is structural, not semantic.** Every form has inputs and a submit button.
  Every list screen has an empty state. Extracting these produces a component with a prop for
  every difference, which is worse than two clear copies.
- **The copies serve different layers or bounded contexts.** Two similar DTOs on either side of
  a boundary are usually load-bearing — the duplication is what lets them evolve apart.
- **They are converging by coincidence and diverging by design.** Two screens that happen to
  look alike this month but are owned by different features with different roadmaps.

### The seam test

Before proposing an extraction, describe what the shared piece takes as input. If both callers
would have to pass the same business string, the seam is wrong — you are extracting a decision,
not a mechanism. A good shared component takes primitives and lets each caller keep its own
vocabulary. If you cannot describe the seam in one sentence, do not propose it yet.

## Dead code: accident vs. deliberate retention

`exports` reports two shapes:

- **no consumer** — nothing outside the defining file mentions it
- **published but never imported** — a barrel re-exports it and no one imports it

The second is usually a public API that grew wider than its consumers, which is worth reporting
as a group rather than one line per symbol.

Before calling anything dead, check for these — all of them are legitimate reasons to keep code
nothing currently calls:

| Signal | Where to look |
| --- | --- |
| A comment explaining the retention | The declaration itself. "Retained for when X is enabled" is a complete answer. |
| A feature doc that mentions it | Search the docs for the symbol name. Documented deferral is intent. |
| Framework/tooling reachability | Route files, config-referenced plugins, platform variants (`.web.ts`, `.ios.tsx`), generated code. |
| Test-only use | The scanner flags this. A store exported solely for its own tests is a normal pattern — check whether the file says so. |
| A type in a published API surface | Types re-exported alongside their component are conventional even when unused externally. Judge by whether the repo does this consistently. |

**When retention is documented, do not report it as cruft.** Say once that you checked and the
intent is still recorded. This is not padding — it tells the reader you distinguished the two,
which is exactly what makes the rest of the list credible.

**When it is undocumented and unreachable, report it** — and include the cost when there is one.
"This store persists to encrypted storage on every launch and nothing reads it" is a much
stronger finding than "this store is unused."

## Unused dependencies

Three states, and only one is actionable:

1. **Referenced in source** — not a finding.
2. **Not in source, but another installed package requires it** — a peer or transitive
   dependency. Removing it breaks the build. Not a finding.
3. **Not in source and nothing requires it** — actionable.

The scanner separates these. Skipping the second check produces a list full of framework peers,
and one bad recommendation there costs more trust than the whole sweep earns.

Watch for **transitive pairs**: package A is "required by" package B, but B itself is unused.
Both are removable, and reporting only A hides half the cleanup.

Also cross-check the docs. A dependency list in a README that presents an unused package as
in-use is a documentation finding even when keeping the package is fine.

## Documentation drift

Ranked by yield per minute spent:

1. **Two docs contradicting each other.** Found without reading any code. One of them is stale
   by definition, and their disagreement is self-evident evidence.
2. **A named route, file, or symbol that does not exist.** The scanner's `docrefs` check. Note
   that some absences are intentional — a doc describing a not-yet-adopted procedure, or a table
   that deliberately lists planned files. Read the surrounding prose before calling it stale.
3. **Inventory lists that lost entries.** Ownership maps, module tables, route trees. Diff
   against the filesystem; missing entries are common and trivially fixable.
4. **Status labels that outlived their status.** "Prototype" on a shipped feature, "mock" on a
   real integration. Cross-check against the doc that owns the integration — the owning doc is
   usually right and the referring doc is usually stale.
5. **Prose describing a removed flow.** The most expensive to find and usually caught via the
   date check: a doc that stopped changing several feature commits ago.

When a doc is stale, prefer correcting it over deleting it. Deletion loses the record of intent;
a corrected doc keeps it. Exception: a document describing a completed migration can be retired
along with the task-index entry that routes to it — but say so as a recommendation rather than
doing it inside an unrelated fix.

## Known scanner artifacts

Recognize these on sight rather than investigating each one:

**`dupes`**
- Import blocks and closing-brace runs. Partially filtered; some survive.
- Generated files, snapshots, lockfiles, migrations. Add to `--src` exclusions or ignore.
- Test setup boilerplate. Real, but rarely worth extracting — the repetition is often what makes
  a test readable in isolation.
- Blocks the tool reports twice at slightly different spans. Same finding.

**`exports`**
- Types re-exported next to their component (`FooProps` beside `Foo`). Conventional.
- Barrel files re-exporting for external consumers outside the scanned roots.
- Symbols reached by string name (DI tokens, registries, dynamic imports). The scanner does
  substring matching, so these are usually caught, but not always.

**`orphans`**
- Framework entry points discovered by filesystem convention. Pass `--entry` for these.
- Platform variants whose base file exists. Already filtered.
- Anything loaded by a bundler plugin or codegen step rather than an import.

**`docrefs`**
- Path-shaped fragments in prose that are not paths (`lib/thing` inside a table cell).
- Deliberate placeholders (`src/<page>`, `src/…`). Filtered, but new spellings appear.
- Planned-work tables that name files on purpose because they do not exist yet.

**`deps`**
- Anything named in a config file rather than imported — build plugins, framework config.
- Type-only packages (`@types/*`) if the repo lists them as runtime dependencies.
