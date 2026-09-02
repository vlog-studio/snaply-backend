# Snaply feature documentation

## Purpose

This directory is the product-level source of truth for behavior that is currently represented in the Snaply application. It complements the architecture guides: architecture documents define how code should be organized, while these documents record what users can currently do, which code owns that behavior, and which experiences are still prototypes.

The inventory was reconciled with the integrated monorepo on 2026-09-02. Why the product is shaped this way — the snap → movie model, the four tabs, slot templates — is recorded in [`docs/guides/ai-vlog-studio/concept.md`](../guides/ai-vlog-studio/concept.md), which is a decision record and not a description of the build.

## Implementation status vocabulary

Use these labels consistently in every feature document.

| Status | Meaning |
| --- | --- |
| `Functional` | The user flow performs its described local or remote effect and handles its primary success and failure paths. |
| `Partial` | A meaningful part of the flow works, but a documented integration or platform path is missing. |
| `Prototype` | The UI demonstrates the intended experience with static, temporary, or simulated data and does not perform the implied product effect. |
| `Not implemented` | The described product effect cannot currently be completed; supporting types, disabled UI, or preparatory code may exist. |

Never describe a prototype as functional merely because its controls can be pressed or its animation completes.

## Current application map

```text
Root stack
├── /auth/callback     Sign-up confirmation + OAuth deep-link landing (unguarded)
├── /auth/reset        Password-recovery deep-link landing (unguarded)
│
├── (pending-deletion guard: isAuthenticated && isPendingDeletion && !isRecovering — declared first: declaration order is fallback priority)
│   └── /account-restore   Grace-period block: restore the account or sign out
│
├── (recovery guard: isRecovering)
│   └── /update-password   Set a new password; blocks the app until saved
│
├── (signed-out guard)
│   ├── /sign-in       Email/password + Google sign-in
│   ├── /sign-up       Create an account (email confirmation)
│   └── /reset-password    Request a recovery link
│
└── (authenticated guard)
    ├── (tabs)         Four tabs + a center capture button
    │   ├── /          Studio (스튜디오): the 새 무비 entry, the templates, the movie board
    │   ├── /snaps     Snap library (스냅): day-grouped grid, playback, selection → new draft movie, deletion
    │   ├── /movies    Movie list (무비)
    │   └── /me        Profile, stats, and the doorway to every preference (나)
    ├── /settings/credits          Credit balance, ledger, and the rewarded-ad row
    ├── /settings/notifications   Every notification preference (titled header)
    ├── /settings/theme           The theme-mode radio
    ├── /settings/interests       The interest tags
    ├── /settings/social          The placeholder connection rows
    ├── /settings/delete-account  Deletion consequences + the confirm button
    ├── /capture           Camera recording with an inline 3초/5초 toggle
    │                      (full-screen modal, opened by the center capture button)
    ├── /extract           Cutting 0.5–5s snaps out of a gallery video: filmstrip +
    │                      draggable window (full-screen modal, opened from the Snap
    │                      tab's 가져오기 after the system video picker)
    ├── /template/[id]     A template matched against the library: filled slots, empty ones to shoot
    ├── /movie/[id]        One movie at any point of its life: run it, watch it, fix it, run it again
    └── /movie/[id]/add-snaps
                           That movie's 스냅 더 넣기 picker — the snap library, always picking,
                           appending to its cut list and returning to it
```

The tab bar hosts four tabs with a floating ember capture button centered over the bar. The button is not a tab; it opens the `/capture` modal from any tab.

There is no separate capture-setup screen: `/capture` opens straight into the viewfinder and the clip length is tuned inline while it is idle.

Access control: `src/_app/routes/root-layout.tsx` composes the five groups above with `Stack.Protected`. **Declaration order in that file is also fallback priority** (guarded groups first, most-specific state first — pending-deletion, then recovery, then authenticated, then signed-out) and the two unguarded `auth/*` deep-link landings are declared **last** so they never become the fallback, while still always resolving for an email link. The pending-deletion guard is `isAuthenticated && isPendingDeletion && !isRecovering` and the authenticated guard excludes both states, so a recovery link cannot reach the app until the new password is set and an account inside its deletion grace period only ever sees the restore screen. The map above groups routes conceptually and is not the declaration order. See [Authentication](authentication.md) for the deep-link and restore flows.

Headless behavior: while authenticated, `src/_app/providers` mounts `PushTokenGate`, `GeofenceGate`, `MovieGenerationBridge`, `SnapDurationBackfill`, `TrayDraftMigration`, and `SnapUploadGate` (the snap upload worker — see [Snap library](snaps.md#backend-upload-sync)), and `src/_app/routes/register-background-tasks.ts` defines the background geofence task at startup. `LibraryScopeGate` is mounted before all of them and runs signed out as well as signed in, because it is what decides whose data the rest of them see: it binds the snap, sync, and movie stores to the signed-in account's own files and drops the query cache when the account changes ([Authentication](authentication.md), [Snap library](snaps.md#file-model-and-storage-boundary)). `DeletedLibraryPurgeGate` follows it and collects what a deleted account left on the device, once its 30-day restore window has passed. These have no route (see [Location alerts and push notifications](location-and-push-notifications.md), [The movie screen](movie.md), and [Snap library](snaps.md#data-model)). The three gates are the same shape: an app-layer component that reads a preference from `features/notification-settings` and hands it to the feature that acts on it, because features must not import each other — `PushTokenGate` wraps `register-push-token`'s `PushTokenRegistrar` this way. The remaining two are one-per-start repairs rather than gates: `SnapDurationBackfill` corrects snaps that recorded the capture option they were shot with instead of how long their file actually runs, and `TrayDraftMigration` promotes a leftover `snaply.tray` from an older build into a draft movie and deletes the key ([Studio and movies](studio.md)).

There are two ways to start a movie, and they meet at the same screen.

```text
Tap the center capture button in the tab bar
  → land in the viewfinder; choose a 3- or 5-second length inline
  → press and hold to record a short snap on iOS or Android
  → the snap is saved to the library (with where it was shot, when that is known)
    and the recorder stays on the viewfinder — ✕ leaves to the Studio

by hand:    Snap tab → 선택 → pick snaps → 이 스냅으로 새 무비
            → a draft movie, opened right away; refillable later via 스냅 더 넣기

by template: Studio → 템플릿으로 시작 → the app matches one outing into the slots
            → 지금 찍기 fills what is missing → 이대로 만들기

  → the movie screen, an editable draft: reorder cuts, drop them, trim them,
    add more, change the style — settled before the run is paid for
  → AI로 생성 시작 → a progress ring the user may walk away from
  → the finished movie plays on the same screen, with the same controls
  → 이 구성으로 다시 만들기 runs it again with what was changed
```

**Every edit happens outside a run.** A draft is editable — generation becomes slow remote work once the backend runs it, so the composition (cut order, lengths, style) is settled before the run is paid for — and a result is edited with the same controls on the same screen. Only a `generating` movie is frozen.

**Generation is a real backend run**: `AI로 생성 시작` queues `POST /edit-jobs`, the pipeline cuts each clip to its trim window, grades it by the style preset, matches music, inserts subtitles, and uploads the result — and the finished movie plays that rendered file. In mock mode (`USE_MOCK_API`) nothing is composited and a finished movie plays its cuts in order. **Template matching fills the screen twice**: the app's own match reads capture times and coordinates and nothing else, instantly; the backend's snap recommendation reads what a vision model found in each candidate and lands on top of it — and it is **switched off at the backend** pending a terms revision, so today every user sees the local match. See [The movie screen](movie.md) and [Movie templates](movie-templates.md) for exactly what is and is not real.

The run belongs to the backend, so it survives leaving the screen, backgrounding, and a force-quit. What stays local is the movie announcement: a run that ends announces itself with a *local* notification raised when the app learns the run ended (gated by 무비 완성 알림 in the [Me tab](me.md)). The backend has an FCM pipeline for geofence-arrival messages, but movie completion is not connected to that pipeline, so a force-quit can still hide this local announcement. A job can fail more than one way — the backend reports a pipeline error, the server has never heard of the job (`404`), or the user deletes every original it was built from — and the studio board, the movie grid, and the movie screen all offer a retry. Exporting a finished movie works when its run produced a file: 공유 downloads the rendered mp4 to the cache and hands it to the share sheet; a movie without a rendered file (mock mode) keeps the control disabled with the reason written under it ([The movie screen](movie.md)).

## Feature index

| Feature document | Current scope | Status |
| --- | --- | --- |
| [Application shell and navigation](app-shell-and-navigation.md) | Providers, splash, root stack, four-tab navigation, capture button, route adapters, theme | `Functional` |
| [Authentication](authentication.md) | Supabase email/password sign-in, sign-up with email confirmation, password reset (both via deep link), Google OAuth (Apple deferred), Supabase-owned session persistence, route guard, sign-out, account deletion with a 30-day grace period and the forced restore screen | `Functional` |
| [Studio and movies](studio.md) | The 새 무비 entry, the movie board with job progress and failure recovery, the movie tab grid, and the movie data model | `Functional` |
| [The movie screen](movie.md) | One screen per movie: settling the draft (reordering, trimming, adding cuts, changing the style, the 순서 고정 rule), running it on the backend, the progress, watching the rendered file, fixing the result with the same controls, and regenerating. Plus renaming, failure, retry, the end-of-job notification, and sharing the rendered file | `Functional` |
| [Movie templates](movie-templates.md) | The server-served template catalog on the studio, the two-stage match into its slots (local outing match, then the backend's snap recommendation on top), shooting for an empty slot, and turning the result into an editable movie draft. The recommendation stage is built and dormant — the backend refuses it until a terms revision lands | `Functional` |
| [Snap library](snaps.md) | Day-grouped snap grid, playback, selection → a new or existing movie, cascading deletion, the file and thumbnail model | `Functional` |
| [Capture flow](capture-flow.md) | Inline duration option, permissions, press-and-hold recording, saving a snap, in-camera feedback, recording library | `Functional` |
| [Snap extraction](snap-extract.md) | Cutting snaps out of a gallery video: system picker, filmstrip with a draggable 0.5–5s window, looped window playback, native trim (media3 / AVAssetExportSession), snaps landing in the library like captures | `Partial` |
| [Me tab](me.md) | Profile, snap/movie stats, reminder, notification, social-connection, and account controls | `Partial` |
| [Credits and rewarded ads](credits-and-rewarded-ads.md) | The credit balance and ledger (`/settings/credits`), earning credits by watching a rewarded ad, and the movie screen's insufficient-credit refusal. **Blocked on AdMob app review** — the SDK and provider are wired, but the AdMob app cannot be verified until Snaply is on Play, so its ad units serve nothing and no credit can be earned. Purchasing credits is not implemented | `Partial` |
| [Location alerts and push notifications](location-and-push-notifications.md) | FCM token registration, geofence monitoring, arrival reporting, foreground notification presentation | `Partial` |

## Current FSD ownership map

| Layer | Current modules | Responsibility |
| --- | --- | --- |
| `src/app` | Route files and layouts | Parse route parameters and expose `_app` layouts or page Public APIs to Expo Router. |
| `src/_app` | `providers`, `routes`, `styles` | Compose the navigation theme, splash overlay, root stack with the session route guard, and the four-tab navigation. Also mount the headless `PushTokenGate`, `GeofenceGate`, `MovieGenerationBridge`, `SnapDurationBackfill`, `TrayDraftMigration`, and `SnapUploadGate` — the three gates handing a notification preference to the feature that acts on it, the two backfills repairing stored state once per start — and define the background geofence task at startup (`register-background-tasks`). |
| `src/pages` | `sign-in`, `sign-up`, `reset-password`, `update-password`, `auth-callback`, `account-restore`, `studio`, `snaps`, `add-snaps`, `movies`, `movie`, `movie-template`, `me`, `capture-record`, `snap-extract` | Own screen composition and screen-specific state. A screen that draws a movie's cuts composes the movie↔snap join through `entities/snap` rather than resolving references itself — in practice `useSnapIndex()` for the index plus `snapsByRefs` per movie, which is what a screen holding several cut lists needs (`pages/movie/model/use-movie-cuts.ts`, `watch-cuts.ts`). `movie` is one slice for one screen: it replaced `movie-editor` and `movie-detail`, which were the same movie split across two routes. `add-snaps` is a movie's picker as a root-stack screen, split out of `snaps` — a flow that must return to a pushed screen cannot live on a tab route (see [Application shell and navigation](app-shell-and-navigation.md#route-map)). |
| `src/widgets` | `movie-shelf`, `snap-grid` | Own the blocks more than one screen is built from: the cross-entity movie read model — a movie summarized for a card (cut count, total played seconds, cover frames, date label, job progress), the in-progress and finished lane selectors, and the two ways a movie is drawn (`MovieRow`, `MovieTile`) — and the snap library's day-grouped grid with its pick-order and cap rules and its selection bar, shared by the Snap tab and a movie's picker. |
| `src/features` | `capture-moment`, `extract-snap`, `compose-movie`, `fill-template`, `rename-movie`, `share-movie`, `upload-snap`, `delete-snap`, `manage-recordings`, `sign-in`, `sign-up`, `reset-password`, `delete-account`, `notification-settings`, `geofence-monitor`, `register-push-token`, `watch-reward-ad` | Own saving a captured snap and tagging it with where it was shot; cutting a snap out of a gallery video (the extraction window's limits, the trim → persist → snap pipeline); turning picked snaps or a filled template into a movie, committing its cut list and style settings, deciding who owns the cut order, and carrying a generation job to its render or its failure (with the at-least-one-cut, ten-cut, edit-only-after-generation, and one-job-at-a-time rules) and announcing the end; matching the library against a template, asking the backend to recommend a snap per slot and merging that answer without disturbing what the user has already changed; renaming a movie; deciding what a movie share may export; carrying every snap to the backend in the background (presign → PUT → register, with retries and delete tombstones); cascading original deletion (file, thumbnail, movie references, metadata, sync state); reused local-recording handling; the email/social sign-in, sign-up, and password-reset actions; the account soft delete and its grace-period restore (`DELETE /auth/me`, `POST /auth/me/restore`); the notification preferences (including the permission grant the movie-completion switch needs); OS geofence monitoring; FCM token registration; and the rewarded-ad flow (session issue → show with the nonce aboard → poll for the server-verified grant) behind its `RewardAdProvider` seam. |
| `src/entities` | `capture-session`, `snap`, `movie`, `movie-template`, `session`, `location`, `credit` | Define the capture duration, own the snap library — including where a snap was captured — and the rule for resolving a movie's snap references against it (`snapsByRefs` / `useSnapIndex`, structurally typed so neither snap nor movie imports the other), own movies (cut lists, trim rules, the style and BGM catalogs, the generation step table, the arrangement predicates, lifecycle), own the template catalog — read from `GET /movie-templates` with the shipped four as the offline fallback, and reaching `movie` for `MovieStyle` through the one `@x` cross-reference in the codebase, the authenticated session and current user, geofence points, and the credit balance with its ledger (server-owned; read through `creditQueries`). The ten-snap cap is `entities/movie`'s `MovieSnapLimit`; the pick order it bounds belongs to `widgets/snap-grid` — neither belongs to the removed 담기 tray any more ([Studio and movies](studio.md)). |
| `src/shared` | `api`, `config`, `lib/recording-files`, `lib/local-store`, `lib/scoped-store`, `lib/secure-storage`, `lib/supabase`, `lib/location`, `lib/geo`, `lib/haptics`, `lib/notifications`, `lib/sharing`, `lib/video-thumbnails`, `lib/video-trim`, `lib/video-picker`, `lib/video-duration`, `lib/trim-geometry`, `lib/validation`, `lib/format-file-size`, `lib/datetime`, `routes`, UI modules | Provide the HTTP client and mock-mode switch, the platform-specific file, JSON local-store, per-account store binding (`lib/scoped-store`), secure-storage, Supabase, location, haptic feedback, notification, file-sharing, and video-thumbnail adapters, the native video-trim adapter (over the local Expo module in `modules/video-trim`), the system video-picker adapter, the local-file duration reader every snap's real length comes from (`lib/video-duration`), the px↔sec trim-drag arithmetic both timeline surfaces share (`lib/trim-geometry`), great-circle distance (`lib/geo`, pure geometry with no product terms in it), validation primitives, the date/time, seconds, and duration formatters every screen prints (`lib/datetime`), the href builders for the two targets more than one screen navigates to (`routes` — `movieHref`, `snapPickerHref`), design tokens, theme helpers, typography, buttons, the video frame and player chrome, and other business-agnostic UI. |

The `widgets` layer holds what no single entity may own and more than one screen needs: a cross-entity read model (`movie-shelf`), or a block of screen that two screens are both built from (`snap-grid`). A read or a block with a single consumer stays in its page — the Snap tab's movie-delete impact is an example — and is promoted only when a second surface needs it, which is exactly what happened to the snap grid when the movie's picker became a screen of its own. Neither layer holds formatters: a business-agnostic date, time, or duration format belongs in `shared/lib/datetime`, so a page never depends on a feature or a widget in order to print one.

## Documentation maintenance contract

Feature documentation must change in the same work item as the behavior it describes.

For every user-visible addition, change, removal, or prototype-to-functional transition:

1. Read this index and every affected feature document before editing code.
2. Update the relevant document's behavior, route flow, ownership, platform support, persistence, status, and limitations.
3. Add a new document when the behavior does not belong to an existing feature, then add it to the feature index and application map.
4. Update cross-feature flows in every affected document. For example, changing how a captured snap enters the library affects both `capture-flow.md` and `snaps.md`.
5. Describe only behavior evidenced by the implementation. Clearly label static fixtures, simulated progress, placeholder controls, and unsupported platforms.
6. Include documentation review in the completion checklist even when no text change is ultimately necessary; record why the existing document remains accurate in the task or review notes.

Architectural rules remain owned by `docs/architecture`, `docs/conventions`, and `docs/frameworks`. If a feature change also changes an architectural standard, update both the feature document and the relevant architecture guide.

### These documents describe the present, not the history

A feature document states what the app does now. Change history belongs to git, and duplicating it here is what made the same event — the tray's removal — get told four different ways in four documents until they disagreed.

**Keep** a past design only where it constrains a future decision, and write it as the constraint rather than as an event:

- A rejected alternative *with the reason it was rejected*, so it is not proposed again ("selection mode replaced a long-press sheet because the sheet's backdrop hid the grid the user was comparing").
- A standing rule that reads as arbitrary without its cause ("there are no versions").
- Verification provenance: **when a claim was last checked against a device or a real server**, which is evidence age, not history. Keep these dates.

**Cut** everything else:

- A date on a behavior statement. "The grid draws the render's cover (2026-08-10)" is just "the grid draws the render's cover".
- A `Replaced:` row or section whose content restates what the current description already says.
- Tables mapping "what the screen used to say" to "where the user reads it now".
- A document correcting its own earlier text ("this document said otherwise until …").

When a cut would drop a real constraint, restate it in the present tense as a rule before removing the story around it.
