# Agent UX review protocol

How an agent runs the UX analysis when asked to review or improve a screen. It exists to convert vague requests ("this screen feels off") into reasoned, reviewable changes.

## Trigger phrases and what they mean

| Request | Mode | Deliverable |
| --- | --- | --- |
| "이 화면을 UX 가이드라인 기준으로 리뷰해줘" | **Review** | Findings report. No code changes. |
| "이 화면에서 UX Smell 찾아줘" | **Smell scan** | Named smells with confidence and cost. No design proposal. |
| "Primary Action이 제대로 드러나는지 확인해줘" | **Focused check** | [`screen-analysis.md`](screen-analysis.md) Steps 1–3 + the relevant principles only. |
| "개선안을 제안해줘" | **Proposal** | Findings + revised structure + exact copy. No code changes. |
| "개선안을 코드에 적용하고 근거를 설명해줘" | **Implement** | Code changes + change report. |
| "이 화면 뭔가 어색한데 개선해줘" | **Ambiguous → Proposal first** | Analyze, propose, then implement `copy`/`hierarchy` scope; ask before `structure`/`flow`/`system`. |

Default when the mode is unclear: analyze and propose. Do not start editing files on an ambiguous request — the analysis is cheap and it is what makes the change defensible.

## Required reading before starting

1. [`principles.md`](principles.md) — the Detection Rules
2. [`ux-smells.md`](ux-smells.md) — the naming vocabulary
3. [`guardrails.md`](guardrails.md) — what not to do
4. The relevant document under [`../features/`](../features/README.md) — what the screen currently *is*, including its implementation status
5. For implementation: [`../architecture/feature-sliced-design.md`](../architecture/feature-sliced-design.md), [`../conventions/module-boundaries.md`](../conventions/module-boundaries.md), [`../conventions/cookbook.md`](../conventions/cookbook.md)

## The procedure

[`screen-analysis.md`](screen-analysis.md) is the procedure; its step numbers are the ones every document cites. This document adds where implementing and reporting fit:

1. **Analyze** — screen-analysis Steps 0–8. Step 0 includes what the screen exists to accomplish from the product's side, read from its feature document.
2. **Check the proposal** — screen-analysis Step 10.
3. **Implement** — only within the approved scope ([Escalation and confirmation](#escalation-and-confirmation)).
4. **Report** — one block per change in the format below, which is also Step 9's output.

Nothing is edited before item 3. If the analysis shows the screen is fine, say so and stop; "no change needed, here is why" is a valid and valuable outcome.

## Change report format

One block per change. This is the user-facing output.

```text
### <change name>

Problem    <what the screen did, and what it cost the user>
UX Smell   <smell name(s)>
Principle  <#, name, evidence label>
Change     <what was modified — files, blocks, strings; in a proposal, what would be>
Why        <which cost went down, named with the terms in README.md → Vocabulary>
Trade-off  <what got worse, for whom, and why the exchange is worth it>
```

Rules for the report:

- **No aesthetic justification.** "더 깔끔해요", "세련돼요", "요즘 스타일이에요" are not reasons. If the only reason is taste, do not make the change. Aesthetic preference is legitimate as the user's request, never as the agent's justification.
- **No unattributed Toss claims.** Cite only what [`README.md`](README.md#verified-toss-principle-sources) verifies, with the right label.
- **"Trade-off: none" must be justified**, and usually is wrong: nearly every improvement moves cost somewhere — to another screen, to an extra tap for a minority path, to more density, to a longer label.
- **List removals explicitly.** Anything deleted, deferred, or moved is named with its new location or the reason it has none.
- **State what was not changed** and why, so the reviewer knows the scope was deliberate.
- Report in the language the root [`AGENTS.md`](../../../../AGENTS.md#응답-언어) sets for replies to the user; keep code identifiers, file paths, and Korean product strings in their original form.

## Implementation rules

- Stay inside the approved scope ([Escalation and confirmation](#escalation-and-confirmation)); findings beyond it are reported, not implemented.
- Respect the architecture: FSD layers, slice public APIs, no cross-feature imports. A UX improvement that breaks the boundary rules is not shippable — restructure the proposal instead.
- Reuse the shared components before adding new ones — `src/shared/ui` (`BottomSheet`, `Toast`, `SnaplyButton`, `BackBar`, …) and `src/widgets` (the snap grid's picking rules and selection bar) — built the way [`../conventions/cookbook.md`](../conventions/cookbook.md) describes. A new local component that duplicates a shared one creates an `Inconsistent Twin`.
- Copy changes touch the string's single source; do not fork a string per screen.
- Every state in the proposal must exist in code: empty, loading, error, offline, partial.
- Accessibility is part of the change, not a follow-up: labels, roles, hit targets, largest font scale, no color-only signals.
- Run the verification gate before finishing, per [`../../AGENTS.md` → Verification](../../AGENTS.md#verification).
- Update the documentation in the same change — the affected feature document, and the root `docs/specs/` requirement when the behavior contract changes — per [`../../AGENTS.md` → Feature documentation maintenance](../../AGENTS.md#feature-documentation-maintenance).
- Verify visual and interactive changes on the surfaces in [`../workflows/local-development-and-testing.md`](../workflows/local-development-and-testing.md#verification-surfaces-read-first), and say plainly what was not verified on hardware.

## Escalation and confirmation

Ask the user before implementing when:

- The scope is `flow` or `system` (screen sequence, navigation structure, shared components) — or `structure`, when the request was ambiguous (see the mode table above).
- A capability would be removed, or moved somewhere harder to reach. UX work relocates, defers, and reframes; it does not decide product scope, so a removal is the user's call and is reported as a trade-off.
- A principle argues against a settled decision — one recorded in the root `docs/specs/` or `docs/decisions/`, in a feature document, or in this directory. A settled decision is an input, not a finding: raise it once with the reasoning, let the user decide, then implement their call in full.
- Two principles conflict and the resolution is a genuine product judgment (which user group to favor, which path is the majority).
- The change depends on data the agent does not have (actual usage frequency, which of two intents dominates). State the assumption, offer the alternative, and let the user pick.
- The screen is documented as `Prototype` and the "problem" may simply be unfinished work.

Ask one question with a recommendation attached. Do not stop with nothing delivered: finish everything that does not depend on the answer first.

## Output length discipline

- **Smell scan**: a list. No prose preamble.
- **Review**: findings ranked by user cost, most severe first.
- **Proposal**: wireframe + change report blocks. Do not restate the principles' text — cite them by number and name.
- **Implement**: the diff summary plus one change report block per change.

The system's value depends on being cited, not recited. Link to a principle; never paste it.
