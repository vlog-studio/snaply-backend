# Studio and movies

## User goal

The Studio (`/`) is the workbench the app opens on: the ways into a new movie, and the movies themselves with the unfinished ones on top. The Movie tab (`/movies`) is the full list of everything made.

```text
/  (스튜디오)
├── 새 무비           one row, whole-row tappable: 새 무비 · 스냅 고르기
│                                                                    → /snaps?select=1
├── 템플릿으로 시작    a card per template, closest to filled first, each with how
│                    far the library gets through it (4/6컷 있음 · 2컷 더)
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

## Two ways to start a movie

The studio offers both, and they answer different questions.

| | Picked snaps (새 무비) | A template |
| --- | --- | --- |
| The question | "make a movie out of *these*" | "make me something like *this*" |
| Who picks the material | the user, one snap at a time | the match, from one outing it found |
| Who arranges it | the user (pick order) | the AI, until the user reorders it |
| What it is good at | a set nobody could have guessed at | telling the user what is missing, and what to go shoot |

They do not consume each other. The template half is documented in [Movie templates](movie-templates.md); the rest of this page is the 새 무비 entry and the board.

## Why there is no basket between a pick and a movie

**Confirming a selection on the Snap tab creates a `user`-arranged draft movie directly and opens it. Do not add an intermediate basket.** A 담기 트레이 — a persistent basket picks landed in before becoming a movie — was built and removed, because **the draft movie already does everything it did without the extra stop**: a draft persists across restarts, takes more snaps later through the movie screen's 스냅 더 넣기, obeys the same ten-snap cap, and loses deleted originals through the same cascade — and drafts are plural, so gathering for two movies at once (the tray's own limitation) simply works. The tray cost a 담기 → 스튜디오 → 이 스냅으로 새 무비 detour: two screen transitions and one decision for nothing. The words `트레이` and 담김 are not interchangeable here — `트레이` is out of the vocabulary, while `담김` stays, because it names the act of taking a snap and the confirmation that one was taken (the capture and extraction screens, and a picker cell whose target movie already holds that snap — `widgets/snap-grid`'s `snap-cell.tsx`). See [`../ux/ux-writing.md`](../ux/ux-writing.md).

What remains on the studio is the entry: a one-row `새 무비 · 스냅 고르기` block opening the Snap tab in selection mode. A leftover `snaply.tray` from an older build is promoted to a draft once at startup (`_app/providers/tray-draft-migration.tsx`) and the key is deleted.

## The board

| Capability | Status | Actual behavior |
| --- | --- | --- |
| 무비 board | `Functional` | One lane, reading `useBoardMovies()`: every movie, with the unfinished ones first — so drafts, in-flight generations, and failures stay together and above the finished work — and each half in most-recently-worked-on order. The studio draws the first three and defers to the movie tab through `전체 보기`. Each row shows the movie's first cut as a square frame, its cut count and length, its status badge, and when it was last worked on. **The block is absent while the user has no movies** rather than drawing an empty state. **Do not split it back into 작업 중 / 최근 완성 lanes**: the split restated what each row's own status badge already says, and on a device with no movies it drew two dashed "없어요" placeholders — two headings and two boxes carrying no fact. Ordering carries what the split carried. |
| Movie tab grid | `Functional` | `/movies` draws every movie as a square tile — with its status badge and length — under a header whose count reads 모두 N편, since the grid holds drafts and failures too and a bare count under a 무비 heading reads as a count of finished ones — cropped to a square, as in the snap grid, so a second row of movies stays on screen. **The cover is the render's own thumbnail once a run has produced one**: the grid is cover art, and a finished movie's cover should be the movie rather than the first thing that went into it. A draft, a failed run, a render made before covers were kept, or a cover the OS has reclaimed draws the first cut's frame instead — the fallback is triggered by the image failing to load, not by a check, because a cached file can vanish under the app and only the load says so. Drafts sit in the same grid as finished movies — they are the same object at a different point in its life. **With no movies at all the grid gives way to the way of making one**: `스냅 골라 새 무비` pushes the snap library in picking mode, the same act and the same destination as the studio's 새 무비 row, worded the same way in its accessibility label. The studio may leave its board out when there is nothing to draw, because two entrances stand above it; this tab has no other entrance of its own, so an empty state that only reported the emptiness left the user to go and find one. |
| Open a movie | `Functional` | Every movie, at every status, opens on [the movie screen](movie.md). Watching a finished one and fixing it are the same visit, so there is nothing for a row or a tile to branch on. |
| Generation progress | `Functional` | A row or tile for a `generating` movie carries a bar from `MovieSummary.progress` — the percentage the backend last published, held on the movie (`movieJobRatio`). Every surface reads the same stored number and none of them ticks: progress moves when a milestone arrives, which is six times over a run (see [The movie screen](movie.md)). |
| Recover a failed movie | `Functional` | A `failed` row or tile carries the stored reason and a `다시 시도` that runs the movie again in place — the board and the grid offer the identical control (`MovieFailureNotice`), because a failure the user can only undo from one of the two places they see it is one they get stuck on. **In the grid the reason is clamped to one line**: the backend words it and it can run to any length, so a wrapped sentence in one two-column cell made its whole row taller than the tiles beside it. The full reason is on the movie screen; the tile keeps the badge and the retry. A movie with no cuts left offers no retry; the copy sends them to the movie screen, which is where cuts come back. What can fail and why is in [The movie screen](movie.md). |
| Movie actions: select / share / delete | `Functional` | Acting on movies is selection mode, the same shape as the snap library: a long press on a movie-tab tile enters it with that movie selected, the header's 선택 button is the explicit entry, taps toggle, Android hardware back leaves the mode, and the tab bar gives way to a selection bar (`ui/movie-selection-bar.tsx`). **삭제**, the bar's primary button, works on any number of selected movies: it opens a confirmation sheet (`ui/movie-delete-confirm.tsx`) naming up to three titles and folding the rest into 외 N편; confirming calls `useDeleteMovie` per movie — synchronous store writes, because a movie is only a composition — the snap originals and their thumbnails are untouched, and the step says so instead of warning in the abstract. A `generating` movie can be deleted too; the step warns that the job in flight goes with it (the runner stops finding the movie and writes nothing — though the run itself keeps going on the backend and its result is simply never claimed). **공유** is a single-movie act, so it appears in the bar only while exactly one movie is selected — the count sits right above it, so its coming and going reads. It must not *disappear* on a movie with no rendered file: it stays, disabled, with the reason above the actions row, the same idiom watch mode and the ⋯ sheet use — a control that vanishes on a property the tile does not draw leaves the user comparing two identical-looking movies and guessing which one can be sent. A download in flight reads 준비 중… on the same button rather than removing it. Real runs do produce the file: it is fetched at a fresh address and downloaded to cache before the sheet opens (see [The movie screen](movie.md#sharing)). **Renaming is not a grid act**: it lives on the movie screen, beside the title it edits — an appearing-and-vanishing 이름 바꾸기 in the bar reads as inconsistent, and its planned expansion belongs to the movie screen. Selection mode is also why there is no long-press actions sheet here: the sheet's backdrop took the whole grid away exactly when the user was comparing movies to decide which ones to act on, and it could only ever delete one movie per visit. The grid is the bulk entry: board rows offer no long-press actions. A `ready` movie can also be deleted one at a time from its own screen — watch mode's ⋯ sheet carries 무비 삭제하기 with the same reassurance (see [The movie screen](movie.md)). |

## Data model

`entities/movie` replaces the old roll/reel pair: a roll owned membership and a reel was the developed result, but a movie owns both, because the user edits and generates the same object.

```text
Movie
├── id, title
├── status        draft | generating | ready | failed
├── createdAt, updatedAt
├── snapRefs[]    { snapId, order, trim? }   — per-movie order and trim; the snap original is never mutated
├── style         emotional | travel | daily — the backend's three editing presets
├── bgm, ratio    track id (stored but unused — the preset scores the run), '9:16'
├── arranger?     user | ai — who owns the cut order (see the movie screen)
├── captions      stored but unused — the backend subtitles every run and offers no switch
├── job?          { id, progress?, step?, startedAt } — the backend's jobId and its last report
├── render?       { uri?, renderedAt, durationSec, style?, snapRefs? } — what the run produced, and what it was made from
└── error?        why the last generation failed
```

`failed` is a first-class status rather than a flavor of draft: generation really does fail, and the user has to be able to tell "I have not run this yet" from "it broke". A failed movie keeps its cut list and settings so a retry starts from what the user already chose, and keeps its `error` so the board can say what went wrong; `MovieSummary` reports the error only while the movie is still failed, so a retried movie stops advertising a problem it is no longer in.

A job lives on the movie rather than in memory so it outlives the screen that started it and the session it started in — the user is expected to leave while a movie generates. The `id` is the **backend's** `jobId`: it is the only handle on the run, so the progress socket and the status endpoint are both addressed by it, and a movie that lost it could never find out what happened. `progress` and `step` are optional because a job stored by an older build has neither; read progress through `movieJobRatio` rather than directly.

The store exposes reads (`useMovies`, `useMovieById`, `getMovieById`, `useMoviesHydrated`), the writes the movie screen needs (`useCreateMovie`, `useUpdateMovieCuts`, `useUpdateMovieStyle`, `useSetMovieArranger`, `useRenameMovie`, `useDeleteMovie`), the five generation-lifecycle actions (`useBeginMovieJob`, `useAdvanceMovieJob`, `useFinishMovieJob`, `useFailMovieJob`, `useCancelMovieJob`), and `useRemoveSnapsEverywhere` for the delete cascade. `useDeleteMovie` is called from two places: the delete confirmation of the movie tab's selection mode, and the movie screen's ⋯ sheet (watch mode).

Two of these are deliberately identity-preserving: a write that changes nothing returns the state object unchanged. The generation runner writes what each poll and each socket frame reports, and a new `movies` array on every one of those would re-render every movie surface for a report that said nothing new. `advanceMovieJob` also refuses to move progress backwards — the socket sends a snapshot when it connects, so a reconnect mid-run would otherwise rewind the ring.

## Ownership

- `src/pages/studio` owns the screen, the 새 무비 entry row, the template cards (`ui/template-panel.tsx`), and the navigation into snap selection, a template, and a movie.
- `src/pages/movies` owns the movie tab's grid and its selection mode — the bottom bar (`ui/movie-selection-bar.tsx`) and the delete confirmation (`ui/movie-delete-confirm.tsx`) — page-local because the grid is the actions' only entry point. Share is not its own: the page goes through `features/share-movie`'s export decision.
- `src/features/compose-movie` owns starting a movie from picked snaps (`startMovieFromSnaps`) or a template, committing cut lists and style settings, the arrangement rules, starting generation, and the app-wide generation runner (see [The movie screen](movie.md)).
- `src/entities/movie` owns movies and their persisted store, written per signed-in user as `snaply.movies.<userId>` and bound to an account by `applyMovieScope` (see [Snap library](snaps.md#file-model-and-storage-boundary) for why the local library is scoped and what signing out does to it). It never imports `entities/snap`; `SnapRef` is matched structurally by `entities/snap`'s `SnapRefLike`.
- `src/widgets/movie-shelf` owns the movie↔snap read model (`MovieSummary`: cut count, total played seconds, cover frames, the render's own cover image when it has one, date label, job progress, failure reason), the board selector (`useBoardMovies`), and the two ways a movie is drawn — `MovieRow` for the board and `MovieTile` for the grid, sharing one status badge and one failure notice. Only the tile prefers the render's cover image (`shared/ui/image-frame`): a board row is a work list, where the movie's own first cut says more about the work than finished cover art. It is a widget because both the studio and the movie tab need the same summary and the same vocabulary, and neither entity may own a cross-entity join. The failure notice is the one card part that acts rather than draws: it calls `compose-movie`'s `startGeneration` itself, so the retry cannot drift between the two surfaces.
- `src/shared/ui/video-frame` draws a video's first frame from the shared thumbnail cache. Business-agnostic — it takes a URI, not a `Snap`.

## Known limitations

- In mock mode (`USE_MOCK_API`) generation is simulated and nothing is composited: a `ready` movie is real state, but its "render" is a length and a timestamp with no file. Against the real backend the render holds the composited file and its cover (see [The movie screen](movie.md)).
- Selection mode is reachable from the movie tab alone: a board row answers a long press with nothing, so a movie made by mistake still has to be found in the grid to be removed. (Renaming is not offered here at all — it lives on the movie screen.)
- `MovieSummary.dateLabel` reads the clock through `formatDayHeading`, so a movie edited just before midnight keeps reading "오늘" until the screen re-renders.
- Movies are local-only state: the cut list, settings, and render pointer live in the on-device store, so nothing syncs between devices and a reinstall loses every movie while its rendered files sit on the server unreferenced (see [The movie screen](movie.md#known-limitations)).
