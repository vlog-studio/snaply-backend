# Snap library

## User goal

Users can see every original in their library — shot in the app (up to the 3s/5s capture ceiling) or extracted out of a gallery video (0.5–5s, see [Snap extraction](snap-extract.md)), on this device or on another one signed in to the same account — play any of them, turn the ones worth using into a new movie, and delete originals they no longer want, on every device at once.

```text
/snaps  (스냅)
├── header                스냅 · 선택          (the mode switch, alone on the right)
│   └── N개 · m:ss                            what the library holds
├── 오늘 / 어제 / 2026년 7월 20일     day sections, newest first
│   ├── leading 가져오기 cell          heads the newest day (→ system picker → /extract)
│   └── 3-column grid, square cells with a length badge,
│       an upload badge while a snap is transferring or failed,
│       and the server copy's state near its end (N일 남음 / 만료됨)
├── tap a cell            → full-screen playback
├── long-press / 선택      → selection mode
└── selection bar         n개 선택 · 새 무비 · 최대 10개 · 해제 · 삭제 · 이 스냅으로 새 무비
                          (a refused pick's notice shows here too, pinned above the counts)
```

Every snap plays as soon as it is saved. Day sections are presentation only — no rule ties a snap to a day; the grid simply reads better in date sections.

**Confirming a selection starts a draft movie and lands on it** — there is no basket between a pick and a movie ([Studio and movies](studio.md#why-there-is-no-basket-between-a-pick-and-a-movie)). The 담김 badge belongs to the movie picker (`/movie/[id]/add-snaps`), where the movie's own cuts are the held set and picking one does nothing; nothing on this tab is held.

`/snaps?select=1` opens straight in selection mode; the studio's 새 무비 row links here that way. It is the only parameter this tab takes: picks made here always become a new movie.

Picking *into a movie* is a screen of its own — `/movie/[id]/add-snaps`, on the root stack — described in [The movie screen](movie.md#composing-and-fixing-it). It draws this tab's grid from the shared `widgets/snap-grid` block, but it is not this tab: a flow that must return to a pushed screen cannot live on a tab route ([Application shell and navigation](app-shell-and-navigation.md#route-map)).

## Browsing and playback

| Capability | Status | Notes |
| --- | --- | --- |
| Day-grouped grid | `Functional` | Reads `entities/snap`, not the files on disk — the snap store is what carries duration and what movies reference. Grouped by a local `YYYY-MM-DD` key so a day break matches the user's own midnight; sections and snaps are newest-first. Each section prints its count and total length. |
| Cell rendering | `Functional` | Each cell draws the video's first frame through the shared, disk-cached thumbnail util (`shared/ui/video-frame`), not a live player: mounting one `expo-video` player per cell would exhaust the platform's small pool of hardware decoders and leave every cell but the last black. Cells are square: a thumbnail only has to be recognizable, and cropping the 9:16 frame to 9/16 of its height fits nearly twice as many rows on one screen. They are sized in points from the content width rather than shaped with a percentage width plus `aspectRatio`, which collapses a wrapped flex cell whose only children are absolutely positioned. |
| Playback | `Functional` | Tapping a cell opens `shared/ui/video-player-modal` full screen over black, with the snap's length as the edge label. A snap from another device is fetched on that tap: the modal opens at once reading 불러오는 중… (its `placeholder`), plays when the copy arrives, and reads 스냅을 불러오지 못했어요 with 다시 시도 when it cannot be fetched. An expired snap that still plays here carries the caption 보관 기간이 끝났어요. |
| Header | `Functional` | The right side carries one control — `선택` / `취소` — and nothing else, so entering selection never slides a control sideways under the finger. Below the title sits state, not spec: `N개 · m:ss` (the library's count and total length, `useSnapDays`); the length ceiling is enforced by the extraction trimmer, not by a line of copy. |
| Empty state | `Functional` | No card and no separate button: after the store hydrates, an empty library is the `가져오기` cell standing alone in the grid, with the header reading `0개 · 0:00`. The other way in is the shell's capture button. |
| 가져오기 | `Functional` | A dashed cell at the head of the newest day's row (`widgets/snap-grid/ui/snap-import-cell.tsx`) rather than a header action — it sits where the snaps it produces will land, and it is the same control whether the library is empty or full. It opens the system video picker and hands the choice to `/extract`; the flow itself is [Snap extraction](snap-extract.md). While selecting it stays in place but dimmed and inert — unmounting it slid the whole leading row one cell over under the user's finger, the same sideways slide that moved this control out of the header. Absent until the store hydrates. A picker failure shows a dismissible notice. |

## Selection and starting a movie

| Capability | Status | Notes |
| --- | --- | --- |
| Enter selection | `Functional` | The header's `선택` control, a long-press on any cell, or arriving with `?select=1`. Android hardware back leaves selection mode instead of leaving the tab. |
| Bottom chrome takeover | `Functional` | While selecting, the screen takes the bottom of the shell over: the tab bar and the capture button step aside through `shared/ui/tab-bar-chrome` and the selection bar has it to itself. Without this the navigator's bar, which paints above every scene, covers the bar's action row and takes the taps meant for `삭제`, `해제`, and `이 스냅으로 새 무비`. The takeover is derived from selection state and screen focus in one effect, so every way in and out restores the bar — including something navigating to another tab mid-selection, which gives the bar back without discarding the picks. |
| Pick order | `Functional` | Selection is an ordered list, not a set: the number drawn on each cell is its position, and that order becomes the movie's cut order (`user`-arranged — nothing may re-sort it). |
| Cap enforcement | `Functional` | The bar names the target and its cap (`새 무비 · 최대 10개` — a movie about to be created has no fill to report, so its one fact is the cap; the movie picker's bar still reads the movie's fill, `<제목> 3/10 · 7개 더`). A pick past the cap is refused with a notice **in the selection bar** — pinned where the thumb is, because a block inserted at the top of the scroll is off-screen for a user deep in the grid and shifts the cells under their finger (both picking surfaces, this tab and `/movie/[id]/add-snaps`, report it there). The rule itself is `widgets/snap-grid`'s (`useSnapPicking`), so this tab and a movie's picker cannot disagree about it; only the wording of the refusal is the screen's. |
| 이 스냅으로 새 무비 | `Functional` | Hands the picked ids to `features/compose-movie`'s `startMovieFromSnaps` — a `user`-arranged draft in pick order — and opens the movie screen on it, where order, trims, and style are settled before a run. |
| Expired snaps | `Functional` | A snap whose server copy expired (`만료됨`) can be picked — selection also deletes — but 이 스냅으로 새 무비 takes it back out of the picks and says 보관 기간이 끝난 스냅은 무비에 넣을 수 없어요. A movie is rendered from the server's copies, so an expired snap put into one would wait for an upload that can never happen (SNAP-12). The movie picker refuses the pick itself, through `useSnapPicking`'s `refuseSnap`; template matching never offers one (`useSnapsForMovies`). |
| Delete | `Functional` | See below. |

## Deleting an original

An original exists in five places, and `features/delete-snap` removes it from all five in one action:

```text
1. the video file            entities/snap deleteSnapFile — the recording (shared/lib/recording-files)
                             or a fetched copy of a snap from elsewhere (shared/lib/server-snap-files)
2. its cached thumbnail      shared/lib/video-thumbnails   (derived; a failure here never fails the delete)
3. every movie that refers    entities/movie               (removeSnapsEverywhere)
4. its snap metadata          entities/snap                (removeSnaps)
5. its sync state             entities/snap                (forgetSnaps — an uploaded snap leaves a delete tombstone)
```

The remote copy is the fifth place's indirection rather than a sixth step: retiring an uploaded snap's sync entry leaves its `videoId` as a tombstone, and the upload worker (see below) owes the server that `DELETE /videos/{id}` — so a local delete never waits on the network and an offline delete still propagates later. Once the server row is gone, every other device signed in to the account removes the snap too, its original included, on its next reconcile (SNAP-16, see below). An expired snap owes nothing: its server row is already gone.

It takes `DeletableSnap` — `{ id, uri }` — rather than a file record, so the snap grid hands it a `Snap` and the capture library a `LocalRecording` without either converting.

Order is deliberate. The file is deleted first because it is the irreversible, failure-prone step: if it fails, nothing else has changed and the snap stays whole. Metadata for everything that did succeed is then committed in one synchronous block, so an interruption cannot leave a snap whose file is gone but whose movie references remain. In a batch, each file is deleted in turn and the metadata of the successful ones is committed together, so a mid-batch failure still commits the rest.

A movie that loses its last cut is kept rather than retired: an empty draft is still the user's, and deleting a movie is a separate deliberate action (a long press on its movie-tab tile — see [Studio and movies](studio.md)).

The confirmation sheet (스냅 삭제 · 스냅 N개를 삭제할까요? · 모든 기기에서 파일까지 삭제되고, 되돌릴 수 없어요. — SNAP-16: a delete reaches every device; the confirm button reads 삭제하는 중… while it runs) names the damage instead of counting it: every movie that would lose cuts is listed with the count it drops to (`컷 5 → 3`). That read model is `pages/snaps/model/use-movie-delete-impact.ts` — cross-entity, but with one consumer, so it stays page-local until a second surface needs it.

On a partial failure the sheet stays open with its error (일부 스냅을 삭제하지 못했어요. 다시 시도해 주세요.; 스냅을 삭제하지 못했어요. 다시 시도해 주세요. when nothing went) and the snaps that did go are dropped from the selection, so a retry targets only what is left.

`features/manage-recordings` owns no deletion path at all — it lists and saves files only — so no caller can delete a file without the cascade.

## File model and storage boundary

`shared/lib/recording-files` owns the business-agnostic file adapter.

```text
LocalRecording
├── id          file name
├── uri         local file URI
├── fileName    file name
├── size        bytes
└── createdAt   creation time, last-modified fallback, or current time
```

Accepted video extensions are `.m4v`, `.mov`, `.mp4`, and `.webm`. New files are named `snaply-<timestamp>.<extension>` and live in the app document directory's `recordings` folder.

Recordings are app-private local files. They are not entries in the device media library. App deletion removes them. The local file stays the source of truth for every screen; the backend upload described below is a copy that trails behind it, never a precondition.

A snap from another device has no recording here. Its video is fetched on first play into `<cache>/server-snaps/<videoId>.mp4` (`shared/lib/server-snap-files`) — the server's playable copy, not the original — and its `uri` names that path from the moment the snap arrives, whether or not the file is there yet. It is under the cache root on purpose: the OS may reclaim it, and the next play fetches it again. It is kept apart from `recordings/` because the capture screen's library lists that folder as this device's own originals.

**A library belongs to an account, not to the device.** The metadata files are written per signed-in user — `snaply.snaps.<userId>`, `snaply.snap-sync.<userId>`, and the movie store's `snaply.movies.<userId>` — and `_app/providers/library-scope-gate.tsx` swaps all three (and clears the query cache, which is keyed by request rather than by account) whenever the session user changes. Without it, every account signing in on one device would see one shared pile — the second user browsing the first user's snaps, and the upload worker carrying them to the backend under the second user's token. Signing out binds the empty scope instead of erasing anything — a local library has no copy anywhere else, so the snaps are still there when their owner signs back in. The video files themselves stay in one `recordings` folder: a file is reachable only through the snap metadata that names it, so scoping the metadata is what separates the libraries.

A snap's id **is** its file name (`create-snap` reuses the recording's id), which is what lets a movie's `snapRefs` and a file on disk address the same thing without a join table. A snap from another device takes its server `videoId` as its id instead — file names are `snaply-<ms>.<ext>` and video ids are UUIDs, so the two never collide, and a movie read back from the server names such a cut by that same id. A server snap's file is checked before playback (`isSnapFileLocal` in `entities/snap`) and fetched when missing (`fetchSnapFile`, `useSnapFiles`); a recording of this device's own is still played without a check.

Thumbnails are derived cover art, held by no model. Extraction and caching live in `shared/lib/video-thumbnails`, which pulls the first frame on first request and caches it under the cache directory keyed by the source file's base name (`<base>.jpg`; a frame requested at an explicit offset — the extraction screen's filmstrip — is keyed `<base>@<ms>.jpg`), exposing `useVideoThumbnail(uri)` for one frame. Because the cache key is the base name, the same file resolves to one thumbnail shared across every surface that previews it (the snap grid, movie covers) whether the caller holds a `Snap` or a `LocalRecording`. Losing the cache only forces re-extraction; it never loses a snap. The web variant returns no thumbnail.

## Backend upload sync

Every snap is uploaded to the backend automatically, so that the material is already there when a movie is sent to the server and run there (`POST /movies` names its cuts by `videoId`; `POST /movies/{id}/export` renders the server's copies) and the user never waits on a bulk upload at the moment they ask for a movie. The upload finishing is also what lets a movie holding that snap be sent at all — the movie sync (`features/compose-movie`'s `MovieSyncGate`) drains its outbox on every sync-entry change for exactly that reason ([The movie screen](movie.md#movies-live-on-the-server)).

**The local file stays the source of truth.** A finished upload does not delete it. Making the device copy a cache is the agreed destination; when it may be switched on is set by [SNAP-14](../../../../docs/specs/snap-library.md) and its [decision](../../../../docs/decisions/local-copy-after-upload.md), not here.

| Capability | Status | Notes |
| --- | --- | --- |
| Upload worker | `Functional` | `features/upload-snap`, mounted app-wide as `SnapUploadGate` in `_app/providers` — an upload continues wherever the user navigates, like movie generation. Runs only while authenticated (the endpoints tie videos to the caller) and after both snap stores hydrate. Strictly serial: one transfer at a time, oldest capture first. Routes to in-code mocks under `USE_MOCK_API`, like every other API caller. |
| Pipeline per snap | `Functional` | The backend's three steps: `GET /videos/upload-url` (presign) → PUT the bytes to the presigned URL (`expo/fetch` with the `expo-file-system` `File` as body — no auth header, no envelope, so it bypasses `apiRequest`) → `POST /videos` (register ready, integer `durationSeconds`, the snap's own `capturedAt` as ISO 8601 — the server cannot recover a capture time afterwards, so a snap registered without it keeps `null` forever and falls back to its upload time for ordering — and the snap's id as `clientId`, which comes back in the server's list so this device can recognise its own snap there even after losing the record of the upload). A snap from another device (`origin: 'server'`) is never picked, and neither is an expired one. The `Content-Type` is derived once from the file extension and used for both the presign query and the PUT header, which S3-style storage requires to match. |
| Derived queue | `Functional` | The queue is never stored: a snap with no sync entry **is** pending. New captures, a signed-out backlog that waits for sign-in, and transfers the app died inside (uploading entries are not persisted, so they rehydrate as pending) all become the same thing — pending snaps the worker finds on its next trigger. Triggers: a snap or tombstone appearing, a manual retry, sign-in, and the app returning to the foreground. |
| Retry and backoff | `Functional` | A failed step marks the snap `failed` and backs off in-memory (5s → 30s → 2m). After 5 recorded attempts the snap waits for a manual retry. The attempt count persists; the backoff does not — a restart retries immediately. |
| Sync badges | `Functional` | The grid cell shows `올리는 중` during an actual transfer and `올리지 못함` (danger fill) on failure. `uploaded` and `pending` are silent on purpose: success everywhere is noise, and pending is every snap's resting state whenever the worker cannot run (signed out, offline) — a permanent "올리는 중" would be a lie. Two badges speak about the server copy's end instead (SNAP-12, SNAP-13): `만료됨` (danger fill) once it has expired, and `N일 남음` (amber) in its last three days — the window the first expiry push opens, so a user who turned notifications off still sees it. |
| Failed banner | `Functional` | The snaps tab shows `스냅 N개를 올리지 못했어요 · 다시 올리기` (the action's accessibility label is 다시 올리기 too) when any snap is failed; retry clears the failed entries, which requeues them. |
| Delete propagation | `Functional` | Tombstoned `videoId`s are drained with `DELETE /videos/{id}` at the start of every worker pass. A 404 counts as success — the video is gone, whether or not this call is what removed it, and the backend answers "already deleted" and "never yours" the same way. Any other refusal keeps the tombstone owed, records the attempt, and holds that id back for the shared backoff (5s → 30s → 2m) so a pass queued mid-drain cannot walk straight back into it; after 5 recorded refusals the tombstone is dropped, which may leave a remote copy behind but ends a request replayed at every launch. The attempt count persists with the tombstone. A snap deleted mid-upload after its row was registered ready leaves a tombstone too; one deleted before registration leaves the never-ready row to the backend's GC. |

Sync state lives in `entities/snap/model/snap-sync-store.ts` (persisted per account as `snaply.snap-sync.<userId>` — the base key `snaply.snap-sync` plus the scope suffix `applySnapSyncScope` binds), separate from the snap store because a snap is an immutable original and its sync progress is not part of what it is — and because `upload-snap`, `delete-snap`, and the movie sync must meet at an entity, features being unable to import each other.

```text
SnapSyncEntry (per snap id; absence = pending)
├── uploading                    not persisted — rehydrates as pending
├── uploaded { videoId, expiresAt? }  the snap's remote identity; when its copy runs out
├── failed { attempts }
└── expired { videoId }          the server copy is gone for good (SNAP-9) — final
deleteTombstones: videoId[]      remote deletes still owed
deleteAttempts: { videoId: n }   refusals recorded per owed delete
```

The presign response shape is spec-confirmed (`{ videoId, uploadUrl, s3Key }`); the Zod contract validates the two fields the app consumes. Live-verified on the physical Android device against the real backend (2026-08-07): a 16-snap backlog uploaded end-to-end (`video/mp4` accepted, every entry earning a UUID `videoId`), an infrastructure outage marked snaps failed and a later trigger recovered all of them, an airplane-mode capture surfaced the failed badge/banner and recovered, and three deletions drained their tombstones (the worker clears one when the server confirms the DELETE, or reports the video already gone). One caveat: the presigned URL's host must be reachable *from the device* — the storage endpoint the backend signs into the URL cannot be its own `localhost`.

## Snaps from other devices

The account's snaps on the server and this device's library are kept in step (SNAP-15, SNAP-16): a snap shot on another device — or on this one before a reinstall — arrives, a snap deleted elsewhere goes, and a snap whose server copy expired is marked so. The rules are [decisions/snap-sync-across-devices.md](../../../../docs/decisions/snap-sync-across-devices.md), and the design is its [동기화 설계](../../../../docs/decisions/snap-sync-across-devices.md#동기화-설계) section.

| Capability | Status | Notes |
| --- | --- | --- |
| When it runs | `Functional` | `features/reconcile-snaps`, mounted app-wide as `SnapReconcileGate` before the movie sync. Once when an account's library is bound, and on every return to the foreground — the moments the movie sync reads the server too. Off under `USE_MOCK_API` and while signed out. Serial: a trigger landing mid-pass queues one more. |
| Reading the server | `Functional` | `GET /videos?kind=source`, every page (`getServerSnaps`). Only finished uploads count; a row that got its upload address and nothing more is not a snap. Snaps this device uploaded but the list no longer has are then asked about in batches of 100 (`POST /videos/lookup`, `lookupServerSnaps`), which answers whether each is still there, deleted by the user, or expired. |
| Arriving | `Functional` | A finished upload this device has never heard of joins the library under its `videoId`, `origin: 'server'`, already `uploaded` — so the upload worker never takes it for a capture — with the server's measured length and size (the stand-in, unmarked, when the server has none) and its capture time (the upload time when none was sent). Its cover is fetched from the server before the cell is drawn (`primeVideoThumbnail`), so the cell never tries to extract a frame from a video that is not here. Not brought in: a snap whose `DELETE` is still owed here, and this device's own snap recognised by its `clientId` and capture time. |
| Leaving | `Functional` | Deleted by the user elsewhere → removed here, file and all, with no `DELETE` owed. Movies are left to the movie sync: the device that deleted the snap has already sent its movies without the cut. Expired → this device's own snap keeps its file and is marked `expired`; a fetched copy of someone else's is evicted and the snap stays as a record of what expired. No row at all → this device's own snap is uploaded again (its file is the source); a snap from elsewhere has nothing left anywhere and goes. |
| Safety | `Functional` | Nothing is removed for being absent from the list — only for what the lookup answers. A pass is applied whole or not at all: a failed page, a failed lookup, or a 403 for an account pending deletion writes nothing, and a sign-out or account switch mid-pass cancels it before its first write. Covered by `plan-snap-reconcile.test.ts` and `run-snap-reconcile.test.ts`. |
| Not brought back | `Functional` | A new device or a reinstall does not bring back snaps that had already expired: the library's `만료됨` stays on the devices that held the snap before it expired (SNAP-12). A movie cut of such a snap still reads 만료 — the movie's `unavailable` flag says so, with or without the original (see [The movie screen](movie.md)). |
| Playback | `Functional` | Fetched on first play, from the playable copy (`playbackUrl`), falling back to the original when none was made; the address is asked for at that moment because it is signed for an hour. The snap tab's player and the movie screen's preview both wait for it (see [The movie screen](movie.md)). |

## Data model

```text
Snap
├── id            = the recording's file name; the server videoId for a snap from elsewhere
├── uri           local file URI (for a snap from elsewhere, where its copy is fetched to)
├── origin?       'server' for a snap brought in from the server's list; absent for this device's own
├── durationSec        the recorded file's real length, in seconds
├── durationMeasured?  true once that length came from the file itself
├── capturedAt    epoch ms
├── place?        { latitude, longitude } — only when a fix was available
├── width, height      display size in px, rotation applied; 1080×1920 stand-in when unread
├── orientation        derived from width/height
└── dimensionsMeasured?  true once that size came from the file itself
```

`place` is optional permanently, not provisionally: location permission may be
refused, a fix may not arrive inside the capture's short wait, and every snap
captured before the field existed has none. Nothing may treat a missing place as
an error — the template matcher and its 근거 문구 fall back to time alone (see
[Movie templates](movie-templates.md)). Coordinates are all that is stored: there
is no reverse geocoding and no place name, because the only question asked of the
field is whether two snaps are near each other. The value never leaves the device.

`durationSec` is **measured, not assumed** — and must stay that way. Storing the capture option the snap was shot with (3초 or 5초) does not work, because capture is press-and-hold: releasing the finger stops the recording early, so most snaps are shorter than the option they were shot under. Every surface that draws or totals a snap by time was wrong by that difference, and on the movie screen's timeline strip — which draws each cut at its length on a seconds ruler — a 1.2-second snap took three seconds of the ruler. `features/capture-moment` reads the length back from the persisted file (`shared/lib/video-metadata`) and stores that, falling back to the requested length only when the file cannot be read; `durationMeasured` records which of the two it is.

`width`/`height`/`orientation` are **measured, not assumed**, on both kinds of snap. An extracted snap takes them off the trimmed file; a captured snap reads them back from the persisted recording in the same pass as its length (`shared/lib/video-metadata`). Both go through the one reader in the app that applies the file's rotation flag — the native probe in `shared/lib/video-trim`, the same measurement the trimmer makes of its output — because a phone held upright records landscape frames with a 90° flag, and `expo-video` reports the encoded frame instead. An upright 1080×1920 stand-in is never assumed for a file that can be read: the camera records 720p, and a phone held sideways records landscape. A stand-in that reached the server as a measurement could never be told apart from a real one and fixed — which is why the stand-in is written **unmarked** (no `dimensionsMeasured`) only when the file cannot be read, and never sent as a measurement. Where the native probe is not linked (Expo Go), the length is still measured through `expo-video` and the size stays a stand-in until a build that can measure it runs. Extracted snaps carry no `place` — where a gallery video was shot is unknown, and where the user stands now is not it.

Snaps written before either was measured are corrected in place: `_app/providers/snap-metadata-backfill.tsx` walks the library once per app start, **one file at a time** (measuring may open a real video player, and the platform's decoder pool is small), skips snaps whose length and size are both already measured, and writes what the file answers back through `recordMeasurement` — the one store action that changes a stored snap, because it records what the snap always was rather than editing it. Each field is marked on its own, so a snap can have a measured length and a stand-in size; a file that cannot be read keeps its assumed values and is tried again on a later start.

Snaps are otherwise immutable originals. Per-movie edits (order, trim) live on the movie's `snapRefs`, never here, so the same snap can be cut differently into two movies.

## Ownership

- `src/pages/snaps` owns the tab screen: playback, selection mode and its bottom-chrome takeover, the draft-movie start (through `features/compose-movie`'s `startMovieFromSnaps`), the delete-impact read model (`model/use-movie-delete-impact.ts`), the delete dialog, and the 가져오기 entry into [Snap extraction](snap-extract.md).
- `src/widgets/snap-grid` owns what both picking screens are built from: the day grouping and the library totals (`model/use-snap-days.ts`), the pick-order and cap rules (`model/use-snap-picking.ts`), the day-sectioned grid and its derived cell width (`ui/snap-day-grid.tsx`), the cell (`ui/snap-cell.tsx`), the leading import cell (`ui/snap-import-cell.tsx`, drawn only for a screen that passes `onImport` — a movie's picker does not), and the selection bar (`ui/snap-selection-bar.tsx`, whose 삭제 action is optional because a movie's picker does not own deletion). A widget because both picking screens are built from it.
- `src/entities/snap` owns snap metadata, its persisted store (`snaply.snaps.<userId>`), the sync-state store (`snaply.snap-sync.<userId>` — upload status, `videoId` mapping, delete tombstones), the per-account binding of both (`applySnapScope`, `applySnapSyncScope`), and the rule for resolving a movie's snap references against it (`snapsByRefs` / `useSnapIndex`, structurally typed so neither snap nor movie imports the other).
- `src/features/reconcile-snaps` owns the reconcile (`SnapReconcileGate`, mounted in `_app/providers`): the pure plan (`lib/plan-snap-reconcile.ts`) and the pass that reads the server, applies the plan, and deletes what it takes off (`model/run-snap-reconcile.ts`).
- `src/entities/snap` also owns the server snap reads (`api/get-server-snaps.ts`, `api/lookup-server-snaps.ts`, `api/get-server-snap-source.ts`), the fetch-on-play of a server snap's file and its per-session state (`model/snap-file.ts` — `fetchSnapFile`, `useSnapFiles`), and `deleteSnapFile`, which deletes a snap's video wherever it lives.
- `src/shared/lib/server-snap-files` is the file adapter for fetched copies: their path, the download (to a `.part` name, renamed when whole), and a delete that refuses anything outside its own cache.
- `src/features/upload-snap` owns the upload worker (`SnapUploadGate`, mounted in `_app/providers`), the three transfer steps against `/videos`, the tombstone drain against `DELETE /videos/{id}`, and the retry/backoff policy.
- `src/features/delete-snap` owns the cascading deletion across files, thumbnails, movies, snap metadata, and sync state.
- `src/pages/add-snaps` owns the movie's picker screen (`/movie/[id]/add-snaps`), which appends its picks through `features/compose-movie`.
- `src/features/manage-recordings` owns reusable local-recording listing for the capture library.
- `src/shared/ui/video-frame`, `src/shared/ui/video-player-modal`, and `src/shared/lib/datetime` supply the frame, the player chrome, and the day/duration formatting.
- `src/shared/lib/video-metadata` reads a local video file's real length and display size in one pass (`readVideoMetadata`): the rotation-aware native probe first (`probeVideo` in `shared/lib/video-trim`), the `expo-video` length reader when the probe is not linked or read no length. Only decides which answer to trust; each reader is a shared adapter of its own.
- `src/shared/lib/video-duration` reads a local video file's real length (`readVideoDuration`), with a web stub. Transport only: it creates one `expo-video` player, reads the duration, and releases it on every exit path including the timeout. Still the direct reader for the extraction screen's source video, which needs only a length.
- `src/features/delete-account` owns the deleted-account ledger and the purge of a deleted account's local library (`model/deleted-account-ledger.ts`, `model/purge-local-library.ts`, mounted app-wide as `DeletedLibraryPurgeGate`). It is the only code that deletes files it cannot see through the live stores, which is why it reads that account's snap file directly.
- `src/_app/providers/library-scope-gate.tsx` owns *when* the library changes hands: it watches the session user and binds the snap, sync, and movie stores to that account's files, then drops the query cache. The mechanism it uses is `shared/lib/scoped-store`, which knows about store files and nothing about sessions.
- `src/_app/providers/snap-metadata-backfill.tsx` owns the one-per-start correction of snaps stored before their length or size was measured. Startup work rather than a feature — nothing about it is an action the user takes.

## Known limitations

- The whole grid renders at once; there is no virtualization, so a very large library scrolls a long list of mounted cells.
- Selection has no "select all" or range selection.
- Live verification (2026-08-07) covered upload, failure/retry, and delete propagation on the physical Android device; crash recovery mid-transfer (an `uploading` entry rehydrating as pending) is guarded by the store's unit-tested partialize contract but was not reproducible on device — real transfers finish too fast to kill the app inside one. Any backend file-size limit remains unverified, and nothing has run on iOS hardware.
- `place` stays on the device (SNAP-11), so a snap from another device has none, and its size is what the server measured on the playable copy. Snaps are not exported to the media library.
- The reconcile is unit- and integration-tested, and was walked on the Android emulator against the real local backend (2026-09-27): two snaps seeded as if from another device arrived with their server covers, one 13 days old read `2일 남음`, a tap fetched the copy while the player read 불러오는 중…, a delete marked on the server removed the snap and its fetched copy, an expiry marked it `만료됨`, and 이 스냅으로 새 무비 refused it. The same day it was walked across three devices on one account — the owner's Galaxy S22 Ultra, the emulator, and the iPhone 17 Simulator: a snap shot on the emulator arrived on both others, and the fetched copy **plays correctly on the phone and on iOS**; a delete on the phone removed the snap on the emulator that shot it, original file included; the real purge batch (`media:purge-expired --yes`) expired a snap and both devices marked it `만료됨`, the one that shot it keeping and playing its file under 보관 기간이 끝났어요. The iOS Simulator, which held no snaps of its own, brought the account's whole library in from the server. A real reinstall on the phone (delete → install → sign in) brought all five of the account's snaps back from the server, the three it had shot — whose files went with the app — among them, and signing in as another account showed none of them (checked by the owner). Returning from offline deleted nothing (also checked by the owner). **Not verified:** an iPhone's HEVC snap on Android — the first production release is Android-only, so that waits for the iOS release (root backlog A-4). The Android emulator cannot show a fetched copy's picture — its decoder draws H.264 Main/High profile black (renditions and movie renders alike; only its own Baseline recordings play) — so use a phone or the iOS Simulator for that.
- A snap from elsewhere whose server copy has no size yet carries the stand-in until its copy has been fetched and the next start's backfill measures it.
- Rows uploaded twice for one snap before `clientId` existed (an app killed between the server's answer and the store write) come in once as a snap "from another device".
- Transfers are foreground-only: backgrounding mid-upload fails the attempt, which is retried on the next foreground return. There is no Wi-Fi-only setting; uploads use whatever network is available.
- A snap deleted mid-upload before its row is registered leaves a never-ready row on the server; the client does not clean those, by design — they are the backend GC's.
- A signed-out account's metadata and recordings stay on the device on purpose — they are its only copy, and nothing else would bring them back. Only a *deleted* account's library is collected, and only once its 30-day grace period has passed (see [Authentication](authentication.md)); the sweep needs an app start to run, so a device that is never opened again keeps the files until it is uninstalled.
- Day labels come from `formatDayHeading`, which reads the clock, so "오늘" can go stale if the app is left open past midnight.
