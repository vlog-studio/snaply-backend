# Snap extraction from gallery video

## User goal

Users can bring a video they already have — the phone's gallery — into Snaply by cutting snaps out of it: pick a video, slide a window (0.5–5 seconds) along a filmstrip of it, watch exactly that window loop, and cut as many snaps out of one video as they want. An extracted snap lands in the library exactly like a captured one: it uploads in the background and can be picked into movies.

```text
/snaps 헤더 가져오기  (or the empty state's 동영상에서 가져오기)
  → system photo picker (videos only; no media permission needed)
  → /extract?source=<uri>   full-screen modal over a dark video ground
      ├── stage             loops the chosen window; tap to pause; ♪/∅ sound toggle
      ├── window readout    0:42.5 – 0:45.7 · 3.2초
      ├── filmstrip         the whole source on a seconds scale, ruler above
      │   └── window        ember frame, amber edge handles, draggable body
      ├── 영상 변경 · ✂ (추출) · 완료
      └── each ✂ cuts the window into a snap and stays for the next one
```

## Status summary

`Partial` — the flow is implemented end-to-end (picker → window → native trim → snap → background upload). Automated tests cover window math, duration fallback, sequential thumbnail extraction, playback boundaries, extraction re-entry and failure handling, native-adapter contracts, and the hand-off into the real snap store. The page-level gesture composition and the **new native module** still require device verification: Android on-device verification is pending, and iOS has not been built at all (the development Mac's Xcode cannot build SDK 57 natively). Web is excluded by design — videos never persist there.

## Behavior

| Capability | Status | Notes |
| --- | --- | --- |
| Entry points | `Functional` | The snaps tab header's `가져오기` action (hidden during selection mode) and the empty state's `동영상에서 가져오기` button. Both open the system photo picker first and navigate only when a video was chosen, so backing out of the picker goes nowhere. |
| Source picking | `Functional` | `shared/lib/video-picker` wraps `expo-image-picker` (`mediaTypes: ['videos']`). The system picker (Android 13+ Photo Picker, iOS PHPicker) needs no media-library permission and hands over a `file://` copy in the app cache, which both the player and the trimmer read directly. The picker's own duration reading rides along as a route param; a source it could not measure is read back with `shared/lib/video-duration`, and an unreadable file shows an error banner with `영상 변경` as the way out. |
| Extraction window | `Functional` | An ember frame over the strip with amber handles at both edges — the movie timeline's trim language (`timeline-cut.tsx` is the canonical shape it imitates): the body stays square and the outer radii live on the handles, so the three pieces read as one frame, and the footage outside the window is dimmed. Handles resize between `MinExtractSec` (0.5s) and `MaxExtractSec` (5s); the body drags the whole window at a fixed span; edges settle on 0.1s steps (`ExtractStepSec`). Drags run on the UI thread; React hears step boundary crossings (for the readout) and the settled window. A touch on any window part locks the strip's scroll until the gesture finalizes, exactly like a trim handle in the movie editor. |
| Tap to move | `Functional` | Tapping the footage outside the window glides the window there (260ms, the movie strip's jump cadence; instant under reduced motion), centred on the tapped moment at its current length, clamped and step-snapped — the coarse positioning a minutes-long source needs, with a selection-tick haptic. A scroll cancels the press, and touches on the window or its handles are claimed by their own gestures, so only a deliberate tap moves it. |
| Filmstrip | `Functional` | The whole source at 60pt/sec (`ExtractPxPerSec`) with a ruler above (dots every second, labels every fifth — every second under 20s). Thumbnails come from `shared/lib/video-thumbnails` at explicit offsets, resolved strictly one at a time, budgeted at 60 frames per strip (longer sources widen tiles instead). |
| Window playback | `Functional` | The stage loops the window: `timeUpdate` past the window's end seeks back to its start. Sound starts muted with a toggle. Position-driven logic is gated on "meant to be playing" (Android fires `timeUpdate` while paused). A settled window drag seeks playback to the new start. A thin line glides across the window while playing. |
| Extraction | `Functional`* | `features/extract-snap`: native trim (`shared/lib/video-trim`) → `persistLocalRecording` → snap metadata → `addSnap`. While one extraction is in flight, duplicate requests are rejected synchronously, including calls made before React commits the pending state. From there the snap is indistinguishable from a captured one — the upload worker finds it pending, the library lists it. Success gives haptics, a `담김 · 스냅 N개` badge, and a counter in the top pill; the screen stays for the next cut. *Functional in JS terms; the native layer is unverified on hardware (see status summary). |
| Real dimensions | `Functional` | Extracted snaps store the output file's real `width`/`height`/`orientation` (read back natively, rotation applied) — a gallery video is as often landscape or square as portrait. Capture-path snaps keep their portrait stand-in (see [Snap library](snaps.md#data-model)). No `place` is stored: where a gallery video was shot is not known, and where the user stands now is not it. |

## The native trim module

`modules/video-trim` is the project's first local Expo Module (autolinked from `modules/`; JS reaches it through the `shared/lib/video-trim` adapter, never directly).

- **Android**: androidx media3 `Transformer` with a `ClippingConfiguration`. No effects are applied, so streams are kept where the container allows and re-encoded only when they must be. Runs on the main looper (Transformer requires one); output metadata is read back with `MediaMetadataRetriever`, rotation applied.
- **iOS**: `AVAssetExportSession` with the passthrough preset, falling back to a re-encoding preset for sources that cannot be passed through into MP4. Passthrough cuts land on keyframes, so a cut's start can be off by a fraction of a second.
- Output is a temporary MP4 in the cache directory; the feature moves it into `recordings/` with `persistLocalRecording`, the same hand-off the camera makes.
- **A development-build rebuild is required** — the module does not exist in previously built dev clients.

## Ownership

- `src/pages/snap-extract` owns the screen: the strip layout math (`model/extract-strip-layout.ts`), source-duration reading, window-loop playback, sequential strip thumbnails, and the window/strip/page UI.
- `src/features/extract-snap` owns the extraction action (`useExtractSnap`), the window limits (`MinExtractSec`, `MaxExtractSec`, `ExtractStepSec`), and extracted-snap metadata construction.
- `src/shared/lib/video-trim` adapts the native module (web stub throws); `src/shared/lib/video-picker` adapts the system picker (web stub returns nothing).
- `src/shared/lib/trim-geometry` is the px↔sec drag arithmetic, **promoted out of `pages/movie/model`** when this screen became its second consumer; the movie timeline imports it from shared now.
- `src/shared/lib/video-thumbnails` gained the explicit-offset frame (`getVideoThumbnail(uri, { timeMs })`, offset-keyed cache) this strip needs.
- `src/app/extract.tsx` is the route adapter (`/extract?source&duration`), keying the page by `source` so a changed source is a fresh mount; the route presents as a `fullScreenModal` beside `/capture` in the root stack.

## Known limitations

- Not yet verified on hardware; iOS additionally has never been compiled (Xcode constraint). The trim's real duration, passthrough behavior per codec, and long-video strip performance are all device questions.
- Extraction length is capped at 5 seconds by product rule; a source shorter than 0.5 seconds is extracted whole (the floor governs cutting a moment down, not refusing one).
- The picker's cache copy of the source is left to the OS to clean; extracting from a very large video temporarily doubles its cache footprint (copy + cuts).
- The strip does not auto-scroll while the window's body is dragged against the viewport edge; scroll first, then drag.
- The filmstrip budget (60 frames) means one frame can stand for many seconds of a long video; the window itself is still precise to 0.1s.
- Very long sources make a long strip (60pt/sec); the fling plus tap-to-move covers the distance, but there is no minimap or duration-aware zoom.
