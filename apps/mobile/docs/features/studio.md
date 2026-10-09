# Studio and movies

## User goal

The Studio (`/`) is the workbench the app opens on: the ways into a new movie, and the movies themselves with the unfinished ones on top. The Movie tab (`/movies`) is the full list of everything made.

```text
/  (스튜디오)
├── 새 무비           one block, whole-block tappable: 스냅 골라 새 무비 ›, and — once
│                    the library holds a snap — its size (2개 · 0:06) and its five
│                    newest snaps as frames                          → /snaps?select=1
├── 스냅 골라 자동 편집 one row under it: the same picking, handed to the edit
│                    draft (MOV-21)                               → /snaps?select=draft
├── 템플릿으로 시작    a card per template, closest to filled first, each leading with
│                    its slots as a strip (the user's snap in a filled slot, a dashed
│                    cell in an empty one) over how far the library gets through it
│                    (6컷 중 4컷 있어요, or 바로 만들 수 있어요 once every cut is there)
│                                                                    → /template/[id]
└── 무비             unfinished first then finished, the first 3 of that order,
                     with 전체 보기 → /movies                         → /movie/[id]
                     · a generating movie carries a progress bar
                     · the whole block is absent while the user has no movies

/movies  (무비)
└── 2-column tile grid, every movie, most recent edit first          → /movie/[id]
    · with no movies: 스냅 골라 새 무비                                → /snaps?select=1
```

Every movie opens on the same screen whatever its status, so no row or tile has to decide where to send it ([The movie screen](movie.md)).

## Three ways to start a movie

The studio offers all three, and they answer different questions.

| | Picked snaps (새 무비) | The edit draft (자동 편집) | A template |
| --- | --- | --- | --- |
| The question | "make a movie out of *these*" | "make a movie out of *these*, for me" | "make me something like *this*" |
| Who picks the material | the user, one snap at a time | the user hands up to 30; the draft chooses among them | the match, from one outing it found |
| Who arranges it | the user (pick order) | the draft — capture order — until the user reorders it | the AI, until the user reorders it |
| Who cuts each window | the user | the draft, until the user trims it | the user |
| What it is good at | a set nobody could have guessed at | a day's worth of snaps with doubles and duds in it | telling the user what is missing, and what to go shoot |

They do not consume each other. The template half is documented in [Movie templates](movie-templates.md); the rest of this page is the two picking entries and the board.

## The edit draft (자동 편집)

`Partial` — walked on the Android emulator against the real local API and workers (2026-10-01): picking, a draft cut from real signals, the movie it opens, a window dragged and handed to the user, a left-out snap offered back and re-added, the offline failure with 다시 시도, and the daily cap offering the hand-made movie (root `docs/progress.md`). On the owner's Galaxy S22 Ultra (2026-10-01) a draft of six snaps had one boundary changed to 겹쳐 녹이기 and one window trimmed, and was made into a run: the render is the edited composition (11.77s for 11.7s of cuts, every cut showing its own window, the crossfade a real blend on the spare frames the draft left, the dip black), and a screen recording of the stage lines up with it frame for frame (root `docs/progress.md`). The filtering thresholds are still provisional.

| Step | Actual behavior |
| --- | --- |
| Entry | `스냅 골라 자동 편집`, one row under the 새 무비 block, opens the Snap tab picking with `?select=draft`. It draws no frames: the block above already shows the material, and drawing it twice would make two blocks compete over one library. |
| Picking | The same grid and rules as 새 무비, with the draft's cap: the bar reads `자동 편집 · 최대 30개` and a pick past it is refused with `자동 편집에는 스냅 30개까지 넣을 수 있어요.` 30 is the app's own guess at the server's cap; once the server refuses with a lower one (`TOO_MANY_SNAPS` with `max`), the bar, the refusal, and the confirm follow that number for as long as the Snap tab lives. Picks made for one purpose do not carry into the other. |
| Confirm | `자동으로 편집하기` sends the picks in capture order — uploaded snaps by their server id, snaps still uploading by their local id and capture time — with the style of the movie last worked on (`일상` with none: the cut lengths follow the style, and the user has not chosen one yet). While it is out the button reads `편집하는 중…` with a spinner and takes no second tap; the grid, 해제, 삭제, the header's 취소 and Android back all hold still, because changing the picks or leaving would open a movie the screen no longer describes. |
| Result | The movie the answer describes, opened at once: `arranger: ai`, every cut's window the draft's (`trimOwner: ai`), a snap still uploading placed at its capture time and played whole. The movie is sent to the server the ordinary way once every cut has uploaded; the server picks the transitions then. Snaps the draft did not put in are kept on the movie for [the movie screen's notice](movie.md#composing-and-fixing-it). A snap the server can no longer use — deleted on another device or expired before this device heard, or not ready (`unavailable`) — is neither a cut nor offered back: there is nothing on the server to make a movie from. |
| Failure | Nothing is made and the picks stay. A failure that may pass (offline, a server error) shows `자동 편집을 하지 못했어요.` in the bar and turns the button into `다시 시도`. Today's drafts used up (`DRAFT_LIMIT`) shows `오늘은 자동 편집을 다 썼어요.` and offers `이 스냅으로 새 무비` instead — the hand-made movie needs no draft — disabled, with the ten-snap cap named, when the picks would not fit one. Changing a pick clears either. When the server can use none of the picks (all `unavailable`), the bar reads `고른 스냅을 자동 편집에 쓸 수 없어요. 다른 스냅을 골라 주세요.` and the button stays disabled until a pick changes — asking again would answer the same. More picks than the server takes (`TOO_MANY_SNAPS`) is never offered `다시 시도`, since the same picks would be refused again: the button stays `자동으로 편집하기`, disabled, under `자동 편집에는 스냅 N개까지 넣을 수 있어요. M개를 빼 주세요.` until enough are dropped (`자동 편집에 넣기엔 스냅이 너무 많아요. 몇 개를 빼 주세요.` when the server named no cap, until a pick changes). |
| Mock mode | `USE_MOCK_API` answers with the first ten snaps in capture order, whole, and the rest left out: it has no signals to choose by, but it answers in the real shape so the screens walk the same path. |

## Why there is no basket between a pick and a movie

**Confirming a selection on the Snap tab creates a `user`-arranged draft movie directly and opens it. Do not add an intermediate basket.** A 담기 트레이 — a persistent basket picks landed in before becoming a movie — was built and removed, because **the draft movie already does everything it did without the extra stop**: a draft persists across restarts, takes more snaps later through the movie screen's 스냅 더 넣기, obeys the same ten-snap cap, and loses deleted originals through the same cascade — and drafts are plural, so gathering for two movies at once (the tray's own limitation) simply works. The tray cost a 담기 → 스튜디오 → 이 스냅으로 새 무비 detour: two screen transitions and one decision for nothing. The words `트레이` and 담김 are not interchangeable here — `트레이` is out of the vocabulary, while `담김` stays as the confirmation that a snap was taken (the `담김 · 스냅 N개` badge after a capture or an extraction, and a picker cell whose target movie already holds that snap — `widgets/snap-grid`'s `snap-cell.tsx`), never as a place snaps collect in ([Terminology](../ux/ux-writing.md#terminology) in `ux-writing.md`).

What remains on the studio is the entry: a `스냅 골라 새 무비` block (the label and a trailing chevron — the same words as the movie tab's empty state) opening the Snap tab in selection mode. **It shows the material rather than describing it**: once the library holds a snap, the label gains the Snap tab's own header read-out under it (`2개 · 0:06`, from the same `widgets/snap-grid` `useSnapDays`, so the two cannot disagree) and a strip of the five newest snaps' frames. The strip always lays out five square cells, so two snaps draw at the size two hundred do; the frames are not tap targets of their own — the whole block is one button, labeled with the count for screen readers. An empty library, or one still reading itself back from disk, keeps the one-row shape: there is nothing to show yet, and the block must not flash as empty over a full library. The workbench is meant to have the material on it ([product concept](../../../../docs/decisions/product-concept.md) §3), and the row was the one place on the studio a user's own footage never appeared. A leftover `snaply.tray` from an older build is promoted to a draft once at startup (`_app/providers/tray-draft-migration.tsx`) and the key is deleted.

## The board

| Capability | Status | Actual behavior |
| --- | --- | --- |
| 무비 board | `Functional` | One lane, reading `useBoardMovies()`: every movie, with the unfinished ones first — so drafts, in-flight generations, and failures stay together and above the finished work — and each half in most-recently-worked-on order. The studio draws the first three and defers to the movie tab through `전체 보기`. Each row shows the movie's first cut as a square frame, its cut count and length (`컷 N · 14초`, `formatSeconds`), its status badge (초안 · 만드는 중 · 완성 · 실패), and when it was last worked on. **The block is absent while the user has no movies** rather than drawing an empty state. **Do not split it back into 작업 중 / 최근 완성 lanes**: the split restated what each row's own status badge already says, and on a device with no movies it drew two dashed "없어요" placeholders — two headings and two boxes carrying no fact. Ordering carries what the split carried. |
| Movie tab grid | `Functional` | `/movies` draws every movie as a square tile — with its status badge and length — under a header whose count reads 모두 N편, since the grid holds drafts and failures too and a bare count under a 무비 heading reads as a count of finished ones — cropped to a square, as in the snap grid, so a second row of movies stays on screen. **The cover is the render's own thumbnail once a run has produced one**: the grid is cover art, and a finished movie's cover should be the movie rather than the first thing that went into it. A draft, a failed run, a render made before covers were kept, or a cover the OS has reclaimed draws the first cut's frame instead — the fallback is triggered by the image failing to load, not by a check, because a cached file can vanish under the app and only the load says so. Drafts sit in the same grid as finished movies — they are the same object at a different point in its life. **With no movies at all the grid gives way to the way of making one**: `스냅 골라 새 무비` pushes the snap library in picking mode, the same act and the same destination as the studio's 새 무비 row, worded the same way in its accessibility label. The studio may leave its board out when there is nothing to draw, because two entrances stand above it; this tab has no other entrance of its own, so an empty state that only reported the emptiness left the user to go and find one. |
| Open a movie | `Functional` | Every movie, at every status, opens on [the movie screen](movie.md). Watching a finished one and fixing it are the same visit, so there is nothing for a row or a tile to branch on. |
| Generation progress | `Functional` | A row or tile for a `generating` movie carries a bar from `MovieSummary.progress` — the percentage the backend last published, held on the movie (`movieJobRatio`). Every surface reads the same stored number and none of them ticks: progress moves when a milestone arrives, which is six times over a run (see [The movie screen](movie.md)). |
| Recover a failed movie | `Functional` | A `failed` row or tile carries the stored reason (무비를 만들지 못했어요. when none was stored) and a `다시 시도` — accessibility label 다시 만들기 — that runs the movie again in place — the board and the grid offer the identical control (`MovieFailureNotice`), because a failure the user can only undo from one of the two places they see it is one they get stuck on. **In the grid the reason is clamped to one line**: the backend words it and it can run to any length, so a wrapped sentence in one two-column cell made its whole row taller than the tiles beside it. The full reason is on the movie screen; the tile keeps the badge and the retry. A movie with no cuts left offers no retry; the copy (무비를 열어 스냅을 다시 넣어 주세요.) sends them to the movie screen, which is where cuts come back. What can fail and why is in [The movie screen](movie.md). |
| Movie actions: select / share / delete | `Functional` | Acting on movies is selection mode, the same shape as the snap library: a long press on a movie-tab tile enters it with that movie selected, the header's 선택 button is the explicit entry, taps toggle, Android hardware back leaves the mode, and the tab bar gives way to a selection bar (`ui/movie-selection-bar.tsx`). **삭제**, the bar's primary button, works on any number of selected movies: it opens a confirmation sheet (`ui/movie-delete-confirm.tsx`) naming up to three titles and folding the rest into 외 N편; confirming calls `useDeleteMovie` per movie — synchronous store writes, because a movie is only a composition — the snap originals and their thumbnails are untouched, and the step says so instead of warning in the abstract (무비 N편을 삭제할까요? · 컷 구성과 완성된 무비가 함께 사라져요. 스냅은 그대로 남아요.). A `generating` movie can be deleted too; the step warns that the job in flight goes with it (만드는 중인 무비도 함께 사라져요.) (the runner stops finding the movie and writes nothing — though the run itself keeps going on the backend and its result is simply never claimed). **공유** is a single-movie act, so it appears in the bar only while exactly one movie is selected — the count sits right above it, so its coming and going reads. It must not *disappear* on a movie with no rendered file: it stays, disabled, with the reason above the actions row, the same idiom watch mode and the ⋯ sheet use — a control that vanishes on a property the tile does not draw leaves the user comparing two identical-looking movies and guessing which one can be sent. A download in flight reads 준비 중… on the same button rather than removing it. Real runs do produce the file: it is fetched at a fresh address and downloaded to cache before the sheet opens (see [The movie screen](movie.md#sharing)). **Renaming is not a grid act**: it lives on the movie screen, beside the title it edits — an appearing-and-vanishing 이름 바꾸기 in the bar reads as inconsistent, and its planned expansion belongs to the movie screen. Selection mode is also why there is no long-press actions sheet here: the sheet's backdrop took the whole grid away exactly when the user was comparing movies to decide which ones to act on, and it could only ever delete one movie per visit. The grid is the bulk entry: board rows offer no long-press actions. A `ready` movie can also be deleted one at a time from its own screen — watch mode's ⋯ sheet carries 무비 삭제하기 with the same reassurance (see [The movie screen](movie.md)). |

## Data model

A movie owns both its membership (the cut list) and its result (the render), because the user edits and generates the same object.

```text
Movie
├── id, title
├── status        draft | generating | ready | failed
├── createdAt, updatedAt
├── snapRefs[]    { snapId, order, trim?, trimOwner?, videoId?, unavailable?, unavailableReason?, transition? }
│                 — per-movie order and trim (with 'ai' when the edit draft chose the window), the cut's
│                 server id, the server's word that its snap is gone and why (user | expired), and how it
│                 hands over to the next cut (kind, owner, the snap it leads into); the snap original is
│                 never mutated
├── style         emotional | travel | daily — the backend's three editing presets
├── bgm, ratio    track id (on the device only, and unused — the preset scores the run), '9:16'
├── arranger?     user | ai — who owns the cut order (see the movie screen)
├── leftOut?      snap ids the edit draft did not put in, offered back on the movie screen (this device only)
├── captions      sent with the movie; always false — subtitles are opt-in and no control offers them
├── job?          { id, progress?, step?, startedAt, adopted? } — the backend's jobId, its last report, and
│                 whether this device only learned of the run from a read-back
├── render?       { uri?, videoId?, thumbnailUri?, renderedAt, durationSec, style?, snapRefs? } — the file,
│                 the result id it is re-asked by, its local cover, and what it was made from
├── finishedAt?   when the user finished it (정리하기) — the server deleted the file, so there is no render
├── settledJobId? the run whose outcome this device last applied, so a read-back does not adopt it again
├── error?        why the last generation failed, worded by the app
└── errorDetail?  the server's own diagnostic for that failure — kept for debugging, never drawn
```

`failed` is a first-class status rather than a flavor of draft: generation really does fail, and the user has to be able to tell "I have not run this yet" from "it broke". A failed movie keeps its cut list and settings so a retry starts from what the user already chose, and keeps its `error` so the board can say what went wrong; `MovieSummary` reports the error only while the movie is still failed, so a retried movie stops advertising a problem it is no longer in.

A job lives on the movie rather than in memory so it outlives the screen that started it and the session it started in — the user is expected to leave while a movie generates. The `id` is the **backend's** `jobId`: it is the only handle on the run, so the progress socket and the status endpoint are both addressed by it, and a movie that lost it could never find out what happened. `progress` and `step` are optional because a job stored by an older build has neither; read progress through `movieJobRatio` rather than directly.

The store's Public API (`entities/movie/index.ts`) exposes the reads, the writes the movie screen needs, the five generation-lifecycle actions, the user's own 정리하기 (`useFinishMovie`, recorded after the server has deleted the file — see [The movie screen](movie.md#finishing-it-정리하기)), the delete cascade (`useRemoveSnapsEverywhere`), the render-cover write, and — for the sync worker only — the outbox reads and the read-back merge. Every write except the job, cover, finish, and sync actions marks the movie pending for the server ([The movie screen](movie.md#movies-live-on-the-server)). `useDeleteMovie` is called from two places: the delete confirmation of the movie tab's selection mode, and the movie screen's ⋯ sheet (watch mode).

Two of these are deliberately identity-preserving: a write that changes nothing returns the state object unchanged. The generation runner writes what each poll and each socket frame reports, and a new `movies` array on every one of those would re-render every movie surface for a report that said nothing new. `advanceMovieJob` also refuses to move progress backwards — the socket sends a snapshot when it connects, so a reconnect mid-run would otherwise rewind the ring.

## Ownership

- `src/pages/studio` owns the screen, the 자동 편집 row (`draftPickerHref`), the 새 무비 entry block (it reads the library through `widgets/snap-grid`'s `useSnapDays` and draws frames with `shared/ui/video-frame`), the template cards (`ui/template-panel.tsx`, drawing each offer's `slots`), and the navigation into snap selection, a template, and a movie.
- `src/pages/movies` owns the movie tab's grid and its selection mode — the bottom bar (`ui/movie-selection-bar.tsx`) and the delete confirmation (`ui/movie-delete-confirm.tsx`) — page-local because the grid is the actions' only entry point. Share is not its own: the page goes through `features/share-movie`'s export decision.
- `src/features/compose-movie` starts a movie from picked snaps (`startMovieFromSnaps`), from the edit draft's proposal (`startMovieFromDraft`, through `entities/movie`'s `requestMovieDraft`), or from a template, and runs it; its ownership — the rules, the generation runner, the sync — is in [The movie screen](movie.md#ownership).
- `src/entities/movie` owns the model above and its persisted store; the store's ownership — the server cache and outbox, the per-account file, the wire shape, the write actions — is in [The movie screen](movie.md#ownership).
- `src/widgets/movie-shelf` owns the movie↔snap read model (`MovieSummary`: cut count, total played seconds, cover frames, the render's own cover image when it has one, date label, job progress, failure reason), the board selector (`useBoardMovies`), and the two ways a movie is drawn — `MovieRow` for the board and `MovieTile` for the grid, sharing one status badge and one failure notice. Only the tile prefers the render's cover image (`shared/ui/image-frame`): a board row is a work list, where the movie's own first cut says more about the work than finished cover art. It is a widget because both the studio and the movie tab need the same summary and the same vocabulary, and neither entity may own a cross-entity join. The failure notice is the one card part that acts rather than draws: it calls `compose-movie`'s `startGeneration` itself, so the retry cannot drift between the two surfaces.
- `src/shared/ui/video-frame` draws a video's first frame from the shared thumbnail cache. Business-agnostic — it takes a URI, not a `Snap`.

## Known limitations

- In mock mode (`USE_MOCK_API`) generation is simulated and nothing is composited: a `ready` movie is real state, but its "render" is a length and a timestamp with no file. Against the real backend the render holds the composited file and its cover (see [The movie screen](movie.md)).
- Selection mode is reachable from the movie tab alone: a board row answers a long press with nothing, so a movie made by mistake still has to be found in the grid to be removed. (Renaming is not offered here at all — it lives on the movie screen.)
- `MovieSummary.dateLabel` reads the clock through `formatDayHeading`, so a movie edited just before midnight keeps reading "오늘" until the screen re-renders.
- Movies sync with the server, but of the sync's transitions only the read-back after a reinstall has been walked on a device, and a movie read back before the snap library reconciles draws every cut as a missing original (see [The movie screen](movie.md#known-limitations)). A board row's cover and cut frames come from the local snaps, so such a movie shows its cover art only when it kept a render cover.
