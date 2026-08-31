# Capture flow

## User goal and screen flow

Users open capture from the center button of the tab bar, land directly in the viewfinder, choose a 3- or 5-second length inline, and shoot. Capture is **continuous**: each snap is saved and the recorder stays on the viewfinder, ready for the next hold, so the user is never bounced away mid-session. Feedback stays in-camera — the just-captured frame flies up into the snap counter, which then bumps and pops. Leaving is explicit: the ✕ dismisses to the Studio.

```text
(tab bar center button, from any tab)
  -- open capture --> /capture   (root-stack full-screen modal, viewfinder with an inline 3초/5초 toggle)
  -- press-and-hold --> the frame flies into the "스냅 N개" counter, which bumps + pops; stay in the viewfinder --> hold again ...
  -- ✕ (explicit leave) --> / (Studio)
```

**A snap is filed into nothing.** Capturing used to add the clip to today's roll under an "all-day" collection rule; the daily roll and automatic collection are both gone. A snap sits in the library until the user picks it into a movie ([Snap library](snaps.md)), which is now the one place material is chosen.

The supported capture options are owned by `entities/capture-session`:

- Durations: 3 or 5 seconds; an invalid or missing value normalizes to 3, which seeds the recorder's initial state
- Mood (`hip` / `lovely` / `energy`) was **removed**: the look belongs to the finished movie, chosen on the movie screen with the whole thing in view, rather than to each fragment as it is shot (concept §8)

## Capture options

The duration is tuned inline in the viewfinder, not on a separate setup screen. `/capture` opens straight into the recorder (`pages/capture-record`), which owns the selected duration as local React state.

While the recorder is `idle`, a `3초 / 5초` segment toggle sits above the shutter. Selecting one triggers selection haptics on iOS and resets the on-screen countdown. The toggle is hidden once a hold starts (`recording`/`saving`) and in the `review` stage. Because the option can only change while idle, each snap is recorded under the duration shown at the moment the hold began.

**The option is a maximum, not the snap's length.** Recording runs only while the shutter is held, so a released finger ends it early and the file is shorter than 3 or 5 seconds. `Snap.durationSec` is therefore read back from the saved file rather than set to the option (see [Snap library](snaps.md#data-model)); the option is only the fallback for a file the platform cannot measure.

## Camera recording and review

| Capability | Status | Platform and behavior |
| --- | --- | --- |
| Dark-pinned viewfinder chrome | `Functional` | The whole screen is wrapped in `<ThemeScope scheme="dark">` and mounts its own light status bar: its ground is the camera feed and near-black scrims, so its chrome ignores the app theme mode and always uses the dark palette. |
| Camera and microphone permission flow | `Functional` | iOS and Android request missing permissions and can open system settings after denial. |
| Press-and-hold 3- or 5-second video recording | `Functional` | iOS and Android record at 720p while the shutter is held. Releasing the finger stops the recording early; the native `maxDuration` ends it automatically when the ring completes. Holds of 250ms or less are treated as accidental taps: the temp recording is discarded (never saved) and the screen silently returns to idle. |
| Sound toggle | `Functional` | Recording can be muted; enabling sound requires microphone permission. During review the toggle mutes/unmutes the looping playback without restarting it. |
| Front/back camera toggle | `Functional` | Available while the recorder is idle. |
| Saving a snap | `Functional` | On capture completion the temporary recording is moved into the app document directory, its real length is read back from it (`shared/lib/video-duration`, after the move rather than beside it — reading a file being relocated is not a race worth taking), and a snap is created from both. Owned by `features/capture-moment`. Nothing else happens — the snap joins no movie. |
| Recording where a snap was shot | `Functional` | iOS and Android. While the file is being moved, `features/capture-moment` asks for foreground location permission and reads the current coordinates onto the snap (`Snap.place`). The two run concurrently so a coordinate adds no latency to the save, and **every failure is silent**: a refusal, no fix, a read slower than two seconds, or a throwing adapter all file the snap with no place. The prompt is the OS's own and appears at most once. Nothing in capture reads the value back — it exists for template matching (see [Movie templates](movie-templates.md)). |
| Continuous capture | `Functional` | On success the recorder returns to `idle` and stays on the viewfinder — it never auto-navigates. Feedback is in-camera: a paused frame of the just-captured snap (`ui/capture-flight.tsx`) flies up from the viewfinder into the top "스냅 N개" counter (~480ms, rendered beneath the top bar so it tucks in behind the pill); on arrival the displayed count bumps, the counter pops, and a "담김 · 스냅 N개" badge shows for ~1.1s (plus a success haptic). The count in the pill trails the store until the frame lands, so the number rises as it arrives. Reduced motion skips the flight and pop (the count updates and the badge/haptic remain). |
| Leave → Studio | `Functional` | Leaving is explicit: the ✕ dismisses to the **Studio** (not the tab that opened capture), which is where the next step lives. |
| Shooting for an empty template slot | `Functional` | `지금 찍기` on a slot opens this same screen with nothing changed about it — the snap is filed in the library like any other. The template screen is what remembers which slot asked and picks the new snap up on the way back (see [Movie templates](movie-templates.md)). Capture stays ignorant of it on purpose: a capture that behaved differently depending on where it was opened from is a capture that can lose a snap. |
| Select a previous recording | `Functional` | The in-screen recording library can select (enters a preview/review stage) or delete a locally stored original. Deleting goes through `features/delete-snap`, so an original already used by a movie is removed from it too (see [Snap library](snaps.md#deleting-an-original)). |
| Web recording | `Prototype` | The shutter is disabled and the UI explains that recording requires iOS or Android. |

The page uses four explicit stages: `idle`, `recording`, `saving`, and `review`, presented over a near-black surface with mono overlays (a live "스냅 N개" counter, the "꾹 눌러 촬영" hint, an ember REC dot, a "스냅을 저장하는 중…" badge while saving, and a brief "담김 · 스냅 N개" badge after each capture) and an ember shutter. Recording runs only while the shutter is held, and a progress ring around it (`ui/hold-ring.tsx`, react-native-svg stroke-dashoffset driven by Reanimated) fills linearly over the selected duration, rewinding over 250ms on release. When the OS "reduce motion" setting is on, the ring shows a static partial arc instead of a continuous fill. The accidental-tap threshold is owned by `model/hold-gesture.ts`. The `review` stage is reached only by selecting a recording from the library, not by capturing. Capture, save, and recording-library failures are displayed inside the camera screen and can be dismissed.

Closing the recorder mid-recording stops the camera and discards the in-flight snap; nothing is persisted. The on-screen countdown is display-only — the actual stop is driven by the native `maxDuration`, so after the counter reaches zero the badge shows a finishing state until the recording completes.

The camera-permission-denied screen still exposes the recording library, so users can browse, select (which enters the review stage), and delete saved originals without camera permission.

## Ownership and dependencies

- `src/features/capture-moment/lib/read-capture-place.ts` owns the location read and the rule that it can never fail a capture. It is the feature's decision to ask, per the boundary in `shared/lib/location`, which stays transport-only.
- `src/pages/capture-record` owns camera lifecycle, camera/microphone permissions, capture-stage orchestration, the inline duration state (idle-only), the in-camera feedback (counter pulse + "담김" badge), and its internal recording-library modal. Those are four separate concerns in `model`, each with its own reason to change:
  - `use-recording-permissions.ts` — camera + microphone permission state, the one automatic request for what is missing, the manual retry, and the settings deep link. It exposes booleans and Korean copy, never `expo-camera`'s permission objects.
  - `use-camera-device.ts` — the camera handle, readiness, facing, and sound. The **only** module in the slice that calls `expo-camera`'s imperative API; the handle never leaves the file (the page attaches the view through `attachCamera`). It publishes the narrow `RecordingDevice` contract the capture run is written against.
  - `use-capture-session.ts` — one capture run: the hold gesture, the `idle`/`recording`/`saving` machine, the display countdown, the selected duration, and handing the file to `features/capture-moment`. It holds the capture rules and no SDK details.
  - `use-recording-library.ts` — the saved-originals list, the modal, which recording is previewed, and deletion through `features/delete-snap`.
  - `use-capture-recorder.ts` composes those four and owns only what spans them: the screen stage (`review` is "a recording is selected"), the single error banner, and leaving/retaking/opening the library/previewing/deleting. The page consumes it and renders.
- `src/shared/lib/haptics` wraps `expo-haptics` with the project's iOS-only guard (`impactFeedback`, `selectionFeedback`, `successFeedback`). Capture and the tab bar's capture button both go through it; neither calls the SDK directly.
- `src/features/capture-moment` owns saving a snap: persisting the file and building snap metadata. It owns its own pending/error state and does not navigate.
- `src/pages/capture-record/ui/capture-flight.tsx` owns the "frame flies into the counter" animation; the recorder page owns the trailing count, counter pop, and badge.
- `src/entities/snap` owns snap metadata and its persisted store.
- `src/entities/capture-session` owns the capture duration type and its route-value normalization.
- `src/features/manage-recordings` owns reusable local-recording state and actions. The library's date lines are formatted by `shared/lib/datetime`, not by this slice.
- `src/shared/ui/video-preview` owns the business-agnostic looping video player used in the review step.
- `src/shared/lib/recording-files` adapts Expo FileSystem and supplies the web fallback; `src/shared/lib/local-store` persists snap metadata as document-directory JSON.

## Persistence and privacy

Original recordings are stored in the Snaply app's document directory and are never exported to the system media library. Every saved snap is also uploaded to the backend in the background, because a generation run is made from the server's copies — the upload pipeline, its retries, and its delete tombstones are documented in [Snap library](snaps.md#backend-upload-sync). Removing the app removes the local recordings. See [Snap library](snaps.md) for file behavior and management surfaces.

A snap's coordinates stay on the device: they are stored in the local snap metadata, never uploaded — the upload carries the file and its rounded length only — and never turned into a place name. The iOS purpose string in `app.json` states both uses of the permission (tagging snaps and the existing arrival alerts); a `prebuild` is required for a change to it to reach the native projects.

## Known limitations

- The counter shows the whole library's snap count, not a per-session count, so it never resets between capture sessions.
- Capturing never files a snap anywhere. Turning snaps into a movie is a separate, deliberate act that starts in the [Snap library](snaps.md) or on a [template](movie-templates.md) and finishes on [the movie screen](movie.md).
