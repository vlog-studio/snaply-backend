# Movie templates

## User goal

Users pick the shape of the movie first — 동네 산책, 하루 요약 — and the app goes looking through the library for material that fits it. What it cannot fill, it asks them to go and shoot.

```text
/  (스튜디오)  템플릿으로 시작 card   →  /template/[id]

/template/[id]  (템플릿)
├── column heading        같은 외출 확신 · 슬롯 적합도 — what the NN% on the rows measures
├── slot rows            per scene: the frame, 2026.07.28 13:35 · 3초, NN%
│   ├── filled           ⌃ ⌄ reorder · ✕ drop
│   ├── dropped          지금 찍기 · 되돌리기
│   └── empty            지금 찍기        → /capture, and back into this row
├── 고친 것 되돌리기        shown once anything is dropped, shot, or reordered
└── 이대로 만들기          → /movie/[id], an editable draft
```

This is the second way into a movie and it sits beside hand-picking rather than replacing it: picked snaps are "make a movie out of *these*", a template is "make me something like *this*". Both entries stay on the studio ([Studio and movies](studio.md)).

## Status summary

`Functional` — every step runs for real: the catalog is served by the backend with the shipped one as a fallback, the local match is pure and unit-tested, shooting for an empty slot round-trips through `/capture`, and `이대로 만들기` creates a real editable draft.

The **second stage — the server's snap recommendation — is built on both sides and dormant.** The app asks for one, merges what comes back, and falls back to the local match when nothing does; the backend refuses the request until `MOVIE_RECOMMENDATION_ENABLED` is switched on, which is gated on a terms revision because it sends snap frames to an external model provider. So what a user sees today is still the local match. See [The two stages](#the-two-stages).

## The two stages

The screen fills itself twice. The first stage is the app's own match and it is instant; the second is the server's and it arrives later, if at all.

| | Stage 1 — local match | Stage 2 — server recommendation |
| --- | --- | --- |
| Runs | Always, on open and whenever the library changes | Only when the endpoint is enabled and at least two of the outing's snaps have finished uploading |
| Knows | Capture times and coordinates. **It has never looked at a picture** | What an external vision model reported about each candidate: places, objects, actions, topics, and whether the clip is usable at all |
| Answers | Which snaps were shot on the same outing, laid into the slots in the order it happened | Which of those snaps suits *which slot* |
| When it fails | There is nothing to fail — it is a pure function of the library | The screen keeps stage 1. Offline, endpoint off, analysis still running, snaps not uploaded: all the same outcome, and none of them is shown to the user |

**Stage 1 is never a placeholder to be waited out.** It draws the screen immediately, and that is what lets someone who just came back from the camera see their outing without waiting on a network round trip.

### What stage 1 can and cannot do

The match answers one question — *which snaps were shot on the same outing* — and lays that outing into the template's slots in the order it happened. A slot's name (`골목`, `가게`) is shooting direction for a person, never a claim about what the snap in it contains.

| Step | Rule |
| --- | --- |
| Group into outings | A snap joins the outing before it when it was shot within three hours of the previous one **and** within 2 km of where that outing started. Coordinates only ever break an outing, never hold one together — snaps with no place are grouped on time alone, because refusing to group them would leave a location-less library with nothing at all. |
| Choose one | The outing that fills the most slots wins; the most recent breaks a tie. A single snap is not an outing. |
| Lay it out | Fewer snaps than slots fills from the top and leaves the tail empty. More snaps than slots takes an evenly spaced sample that always keeps the first and last, so a long walk still starts and ends where it did. |

### What stage 2 adds

The app sends the chosen outing's **uploaded** snaps — in capture order, at most twelve, evenly sampled if there are more — and the template id. The server ensures each candidate is analysed, scores every (slot, snap) pair, and answers with one snap per slot.

Scoring is rule-based and lives on the server, so its weights can be tuned without an app release ([backend decision](../../../snaply-backend/docs/decisions/template-snap-recommendation.md) §7). What the app is entitled to rely on:

- A slot the server could fill nothing for comes back empty, and stays empty. **A snap the analysis marked unusable never fills a slot** — a blurred or too-dark clip is worth less than the `지금 찍기` the empty row offers.
- The answer's own time signal keeps the outing's shape, so a recommendation never scrambles a walk into an order that makes less sense than the clock's.
- The payload carries slot ids, video ids, and scores. **No summary, no tags, no reason line** — the analysis is an internal signal for choosing snaps, not copy for a screen.

### Merging stage 2 without losing the user's work

The recommendation replaces the *proposal*, which is the only thing on the screen the user has not personally touched. Everything they have done to the screen outranks it:

| The user has… | What an arriving recommendation does |
| --- | --- |
| shot for a slot | Nothing. That row is pinned to its slot and holds the snap they took. |
| dropped a slot | Nothing. The row stays empty and keeps its 되돌리기. |
| reordered | Nothing, **and it stops applying**. The arrangement they were working on is pinned at their first swap, so the two rows they just traded do not silently become two other snaps. |
| pressed 고친 것 되돌리기 | The pin clears, so undoing edits also means "and take the better proposal if one arrived". |
| done nothing yet | The rows re-fill from the recommendation. |

### What the NN% means, and how the screen says so

The number is printed bare on each row, and **one heading over the column** says what it measures. Which of two things it is depends on which stage filled the rows:

- `같은 외출 확신` — stage 1. How sure the app is that this snap belongs to the outing the others came from, from two measurements: how close in time the snap sits to its nearest neighbour, and how far it is from where the outing started. A snap with no coordinates is scored on time alone and scaled down, because that is a genuinely weaker claim.
- `슬롯 적합도` — stage 2. How well the server thinks this snap suits *this position*.

**Neither is a claim about the picture.** Stage 1 has not looked at it; stage 2's server has, but what it scores is a position, not a subject — `골목` is still shooting direction. The number keeps its distance from the label for that reason: `골목 70%` set flush together reads as "70% sure this is an alley", which neither stage can say.

Two earlier attempts at explaining this were removed and are **not** the form to return to — an `AI가 고른 이유` panel ran four lines deep and pushed the slots under the fold; a per-row `같은 외출 확신 NN%` caption repeated a constant on every row and cost a third of each row's width. The column heading says it once, in the place the eye already goes, and the number carries the same words in its accessibility label where repeating them costs no width at all.

A row the user moves out of the position its score was computed for **loses its number** rather than showing a score about somewhere else.

## Filling the gaps

| Capability | Status | Actual behavior |
| --- | --- | --- |
| Template catalog | `Functional` | Served by `GET /movie-templates` and cached for the session; the four templates that ship with the build answer the first render and stand in whenever the request fails. Ids and copy are the same on both sides, so the two can never disagree about *which* template a screen is showing. A template whose style is a preset this build does not know is skipped by the app — the server does not filter, because it cannot know what a given build understands. |
| Template cards | `Functional` | The studio lists every template with how far the library gets through it (`4/6컷 있음 · 2컷 더`). A template the library cannot fill still appears — the shortfall is the invitation. **Ordered by shortfall, closest to filled first**, with the shorter template and then the catalog breaking a tie: the row is a horizontal scroll that fits two cards and a sliver, so catalog order decided by luck which templates a user ever saw. Card width is set so the third card is cut by the screen edge — the row bleeds through the studio's own padding — because a card the edge cuts is the only signal that more exist. |
| Stage 1 match | `Functional` | Runs on open and again whenever the library changes, so a snap shot mid-session shows up without a refresh. Pure and unit-tested (`lib/match-template.ts`). |
| Stage 2 recommendation | `Functional`, dormant | Request, poll, and merge are implemented and unit-tested (`model/use-template-recommendation.ts`). The backend refuses it until the feature flag is on, and every refusal resolves to "keep stage 1" without a message. Skipped entirely in mock mode and when fewer than two of the outing's snaps have uploaded. |
| 지금 찍기 | `Functional` | Opens `/capture` and remembers which row asked. On return, if the library has a newer snap than it did on the way out, that snap goes into that row. Coming back without shooting leaves the row empty. The snap is filed in the library like any other — nothing about capture changes. |
| ✕ (drop) / 되돌리기 | `Functional` | Drops a proposed snap out of a slot, and puts it back. There is no "pick a different snap" — a wrong cut is cheaper to fix on the movie screen, after the movie exists. The control is an icon, not the word `빼기`: at two per row beside the reorder arrows, three Korean micro-labels outweighed the row's own content. |
| ⌃ ⌄ (reorder) | `Functional` | Swaps a snap with the one above or below it, so the cuts play in an order other than the one the clock proposed. The **slots** never move — `출발` stays the template's first scene — so a move trades the two snaps' positions. Held as a permutation of the proposal (`model/use-template-fill.ts`), which is what keeps each snap's number with it across a swap. |
| Rows that cannot be reordered | `Functional` | A row the user shot for, or dropped, is bound to its slot rather than to a position in the running order, so no swap could move it. Both arrows either side of such a row are drawn dimmed and inert rather than silently doing nothing. The arrows are also absent from an empty row, which has nothing to move. |
| 고친 것 되돌리기 | `Functional` | Puts every slot back the way the proposal had it, order included, and un-pins the proposal so a recommendation that arrived meanwhile takes effect. Shown only once something has been dropped, shot, or reordered. |
| Nothing to propose | `Functional` | A library with no outing in it says so and leaves every slot empty with its `지금 찍기`. The screen is still useful — that is the case it was designed for. |
| 이대로 만들기 | `Functional` | Creates a movie from the filled slots in slot order, with the template's style and BGM — the style is what a run is actually made with, while the track is only stored, since the app offers no track picker and sends none ([The movie screen](movie.md)) — marked `arranger: 'ai'`, and replaces the screen with the movie — **an editable draft, not a running job**. Generation is slow remote work, so cut lengths, order, and style are settled on the movie screen first and the run starts there ([The movie screen](movie.md)). |
| Manual changes are not stored | `Functional` | Dropping and shooting are held on the screen. Nothing exists to write to until the movie is created, and leaving costs nothing. |
| One snap, one slot | `Functional` | A snap shot for an empty slot joins the library, so the next match would happily propose it for another slot as well. The slot it was shot for claims it, and the other one stays empty — a duplicate would have become two cuts of the same three seconds. The server applies the same rule to its own answer: one snap fills one slot. |

## Ownership

- `src/entities/movie-template` owns the template model, the read of the server catalog (`api/`), and the shipped fallback (`lib/movie-template-catalog.ts`). It reaches `entities/movie` for `MovieStyle` through `entities/movie/@x/movie-template.ts` — a type-only cross-reference, which is the one case the [boundary rules](../conventions/module-boundaries.md#entity-cross-reference-exception-x) allow it. The wire preset → `MovieStyle` decode lives in its `api` segment; the reverse lives in `features/compose-movie/api`, each in the segment that crosses that boundary.
- `src/features/fill-template` owns stage 1 (`lib/match-template.ts`), the recommendation request and poll (`api/`, `model/use-template-recommendation.ts`), the merged slot state (`model/use-template-fill.ts`), and the studio's readiness read-out (`model/use-template-offers.ts`). `describeSession` and the `TemplateFill.summary` it feeds have **no renderer** since the `AI가 고른 이유` panel was removed; both are still unit-tested and are kept for whatever surface takes the reason line next. Do not treat them as live behavior.
- `src/pages/movie-template` owns the screen, the slot row, the column heading, and the camera round trip.
- `src/pages/studio/ui/template-panel.tsx` owns the cards on the studio.
- `src/features/compose-movie` owns `startMovieFromTemplate` and every rule about the movie it creates.
- `src/shared/lib/geo` is the distance helper — business-agnostic geometry, no snaps and no outings in it.

## Catalog policy

The catalog moved to the backend on 2026-08-19 and the shipped constant became the fallback. It was a local constant on purpose before that — a catalog somebody has to keep running is a standing cost — and what changed the balance is that a slot now has **matching rules**. Those rules and the slot they belong to have to move together; a slot defined in the app with its rules on the server is a pair that drifts, and only one half of it gets fixed.

Rows are seeded by a migration rather than by a seed script, so a fresh environment cannot come up with an empty catalog and quietly fall back. Copy changes ship as migrations, which also means user-visible words do not change without a review.

## Known limitations

- **The semantic stage is dormant.** Stage 2 is implemented end to end and switched off at the backend until a terms revision and a third-party-disclosure notice are in place, because it sends snap frames to an external model provider. Until then every user sees stage 1, and a build with no API origin (mock mode) never asks at all.
- **Only uploaded snaps can be recommended.** A snap still on its way to the backend keeps whatever place stage 1 gave it. This is deliberate — waiting for uploads would make the person who just finished shooting wait the longest — but it means a fresh outing gets the local match until its uploads land.
- **The server has no idea when or where a snap was taken.** Upload registers a duration and nothing else, so choosing which outing to recommend for is the app's job and always will be until snap capture metadata is server-owned. One consequence: the server can only rank *within* the outing the app sent it.
- Snaps captured before location was recorded have no coordinates, so an older library is matched on time alone and scores lower in stage 1. Nothing is wrong with those snaps; the app is just less sure.
- Only one outing is ever proposed. There is no "다른 조합" and no way to match against a specific day.
- A slot cannot be filled from the library by hand — only by shooting, or by taking what was proposed. Replacing a cut happens on the movie screen afterwards.
- Reordering is adjacent swaps only, and a shot or dropped row cannot take part in one at all. Moving a snap across a pinned row, or to a distant slot in one gesture, needs a different interaction than two arrows.
- A recommendation that arrives after the user has started reordering is ignored until they undo their edits. The alternative — applying it under a permutation they built against a different proposal — moves snaps they did not move.
- Templates cannot be created, edited, or reordered by a user, and there is no admin surface: changing one means shipping a backend migration.
- Nothing about a template is stored on the movie it makes, so a finished movie does not know which template it came from and cannot be re-matched.
