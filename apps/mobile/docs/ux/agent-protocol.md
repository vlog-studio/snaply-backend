# Agent UX review protocol

The procedure an agent follows when asked to review or improve a screen. It exists to convert vague requests ("this screen feels off") into reasoned, reviewable changes.

## Trigger phrases and what they mean

| Request | Mode | Deliverable |
| --- | --- | --- |
| "이 화면을 UX 가이드라인 기준으로 리뷰해줘" | **Review** | Findings report. No code changes. |
| "이 화면에서 UX Smell 찾아줘" | **Smell scan** | Named smells with confidence and cost. No design proposal. |
| "Primary Action이 제대로 드러나는지 확인해줘" | **Focused check** | Steps 1–3 + the relevant principles only. |
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

## The ten steps

Run [`screen-analysis.md`](screen-analysis.md) in full. Condensed:

1. **Screen goal** — what this screen exists to accomplish, from the product's side.
2. **User intent** — one sentence in the user's voice, no app vocabulary, no "and".
3. **Primary action** — the one control, its current label, its position, its enabled state.
4. **Current information hierarchy** — every block, its weight, its bucket (`supports` / `later` / `elsewhere` / `noise`).
5. **UX smell detection** — Detection Rules run, exceptions applied, costs named, confidence assigned.
6. **Principle selection** — one driving principle per confirmed finding.
7. **Scope decision** — `copy` < `hierarchy` < `structure` < `flow` < `system`; smallest that resolves the finding; conflicts resolved via [`principle-priority.md`](principle-priority.md).
8. **Design** — text wireframe with weight levels and exact Korean strings; every existing block accounted for; all states specified.
9. **Implement** — only within the approved scope.
10. **Explain** — the change report below.

Steps 1–8 happen before any file is edited. If the analysis shows the screen is fine, say so and stop; "no change needed, here is why" is a valid and valuable outcome.

## Change report format

One block per change. This is the user-facing output.

```text
### <change name>

Problem    <what the screen did, and what it cost the user>
UX Smell   <smell name(s)>
Principle  <#, name, evidence label>
Change     <what was actually modified — files, blocks, strings>
Why        <which cost went down: Cognitive Load / Decision Cost / Interaction Cost /
            Discoverability / Predictability / User Control / Error Prevention>
Trade-off  <what got worse, for whom, and why the exchange is worth it>
```

Rules for the report:

- **No aesthetic justification.** "더 깔끔해요", "세련돼요", "요즘 스타일이에요" are not reasons. If the only reason is taste, do not make the change.
- **No unattributed Toss claims.** Cite only what [`README.md`](README.md#verified-toss-principle-sources) verifies, with the right label.
- **"Trade-off: none" must be justified**, and usually is wrong.
- **List removals explicitly.** Anything deleted, deferred, or moved is named with its new location or the reason it has none.
- **State what was not changed** and why, so the reviewer knows the scope was deliberate.
- Report in the language the user wrote in; keep code identifiers, file paths, and Korean product strings in their original form.

## Implementation rules

- Respect the architecture: FSD layers, slice public APIs, no cross-feature imports. A UX improvement that breaks the boundary rules is not shippable — restructure the proposal instead.
- Reuse existing components and patterns from [`../conventions/cookbook.md`](../conventions/cookbook.md) before adding new ones. A new local component that duplicates a shared one creates an `Inconsistent Twin`.
- Copy changes touch the string's single source; do not fork a string per screen.
- Every state in the proposal must exist in code: empty, loading, error, offline, partial.
- Accessibility is part of the change, not a follow-up: labels, roles, hit targets, largest font scale, no color-only signals.
- Run `npm run verify` before finishing. Report a pre-existing, unrelated failure with evidence instead of expanding scope.
- Update the affected document under [`../features/`](../features/README.md) in the same change when user-visible behavior changed. This is mandatory, not optional follow-up.
- Verify on a device per [`../workflows/android-device-verification.md`](../workflows/android-device-verification.md) when the change is visual or interactive, and say plainly if it was not verified on hardware.

## Escalation and confirmation

Ask the user before implementing when:

- The scope is `flow` or `system` (screen sequence, navigation structure, shared components).
- A capability would be removed, or moved somewhere harder to reach.
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
