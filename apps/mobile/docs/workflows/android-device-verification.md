# Android device verification (wireless adb)

The physical Android device connected over wireless adb is the **default verification surface for this project**. Use it instead of the Android emulator or the web build unless the owner explicitly asks for another target.

This document is the agent's toolkit: what can actually be observed and driven on that device, with the exact commands. The policy that mandates it — ask before assuming the device is attached, never background Metro — lives in [`local-development-and-testing.md`](local-development-and-testing.md#agent-verification-policy-read-first) and still applies here.

Every command below was executed successfully against the owner's device (`SM-S908N`, Android 16) on 2026-07-27 with the app running as a debug dev build and owner-run Metro on port 8081.

## Preconditions

Confirm all three before verifying anything. If any is missing, ask the owner — do not work around it.

```bash
adb devices -l          # device must be listed and report "device", not "offline"/"unauthorized"
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8081/status   # 200 = Metro is up
adb -s "$DEVICE" shell dumpsys window | grep mCurrentFocus              # app in foreground?
```

Resolve the serial at run time and target it explicitly; never hardcode it. A wireless device appears either as `<ip>:<port>` (after `adb connect`) or as `adb-…-_adb-tls-connect._tcp` (mDNS pairing), and the address changes between sessions.

```bash
DEVICE=$(adb devices -l | awk '/model:SM_S908N/ {print $1; exit}')
PKG=com.anonymous.snaplyapp
```

The **one** device can hold **both** transports at once — `adb connect` and mDNS pairing each register a serial, so `adb devices` lists two entries for the same phone. Hence the `exit`: without it the variable holds two serials and every `adb -s` call fails. Either transport works; take the first.

With multiple devices attached, a bare `adb shell` fails with "more than one device" — always pass `-s "$DEVICE"` (or export `ANDROID_SERIAL`).

### Verifying against a real backend

Anything that touches the API needs three more things, and getting one wrong makes the verification silently prove nothing rather than fail loudly (learned over the movie-generation integration, 2026-08-10):

- **`EXPO_PUBLIC_API_BASE_URL` in the app's `.env` must be the LAN IP of the machine running the backend**, not `localhost` — the phone resolves `localhost` to itself. An **empty** value is the trap: it switches `USE_MOCK_API` on, so every request is answered by a mock and the run looks like it succeeded while nothing reached a server.
- **The backend's public storage endpoint must be the same LAN IP.** It is what goes into presigned URLs, so with `localhost` the phone can neither upload a snap nor download a rendered file, while the backend's own logs look healthy.
- **Object storage and the database can drift apart.** The dev database may be remote (Supabase) while object storage is a local container: wiping the storage volume leaves rows pointing at objects that no longer exist, and the app's own sync store keeps calling those snaps uploaded. The symptom is a server-side `HeadObject … 404`, not an app error. Re-shooting the snaps is the recovery; the app has no way to re-upload a snap it believes is already up.

The app's own error copy is deliberately coarse — one refusal covers every transport failure — so read the failure's real cause from the Metro log or the backend's log rather than from the screen.

## The verification loop

Edit source → Fast Refresh pushes it to the device automatically (owner-run Metro, Fast Refresh on) → observe → drive → observe again. A native or config change requires a rebuild instead.

**Fast Refresh does not deliver edits made while the app is backgrounded.** Send the app to the background — the owner opens another app, a call arrives — and edits saved in the meantime are simply missed; foregrounding it again does not fetch them, so the screen keeps rendering the stale bundle and reads as "the change did nothing". Confirm the change is actually on screen before diagnosing it, and force a reload when it is not:

```bash
adb -s "$DEVICE" shell input keyevent 82   # opens the RN dev menu
adb -s "$DEVICE" exec-out uiautomator dump /dev/tty | tr '<' '\n' | grep 'text="Reload"'
adb -s "$DEVICE" shell input tap <x> <y>   # centre of the Reload bounds
```

A reload restarts the app at its initial route, so re-enter the screen afterwards — a deep link (below) is the quickest way back.

**Do not reach for `am force-stop` to get a clean bundle.** On this dev build the next launch lands in `DevLauncherActivity` (the "DEVELOPMENT SERVERS" list) rather than in the app, and the deep link that started it is dropped — leaving the owner's device parked in the launcher. Tap the Metro entry to get back in, and prefer the dev-menu reload above.

Observation is layered. Prefer the cheapest layer that answers the question, and cross-check when a result is surprising:

| Question | Tool |
| --- | --- |
| Does it look right? | screenshot |
| Is this exact text/element rendered, and where? | UI hierarchy dump |
| Is the data even there? | persisted store read |
| Why did it do that? | logcat |

A blank screen with correct store contents is a render bug; a blank screen with an empty store is a data bug. Determining which before reading code saves the most time.

## 1. Screenshot

```bash
adb -s "$DEVICE" exec-out screencap -p > "$SCRATCH/screen.png"
```

Read the PNG back with the Read tool to inspect it visually. This is the proof to share with the owner after a visual change — never ask them to look for themselves.

Screen recording is available for animations and multi-step flows:

```bash
adb -s "$DEVICE" shell screenrecord --time-limit 10 /sdcard/rec.mp4
adb -s "$DEVICE" pull /sdcard/rec.mp4 "$SCRATCH/rec.mp4" && adb -s "$DEVICE" shell rm /sdcard/rec.mp4
```

## 2. UI hierarchy

```bash
adb -s "$DEVICE" exec-out uiautomator dump /dev/tty
```

Returns the on-screen tree as XML with `text`, `content-desc`, `resource-id`, and `bounds` per node. Use this — not a screenshot — to assert that a specific string rendered, and to obtain precise tap coordinates. Screenshots confirm appearance; the dump confirms facts.

**The dump is useless while something animates continuously.** A screen with a running animation — the movie screen's timeline scrolling under its playhead is the standing example — either returns nothing at all or returns the same stale `bounds` from every call in a row, which reads as "the thing never moved". Verify continuous motion with a burst of screenshots instead, cropped to the band that matters and stacked into one image; use the dump for the settled state before and after.

## 3. Input

```bash
adb -s "$DEVICE" shell input tap <x> <y>
adb -s "$DEVICE" shell input swipe <x1> <y1> <x2> <y2> <ms>
adb -s "$DEVICE" shell input text "hello"
adb -s "$DEVICE" shell input keyevent KEYCODE_BACK
```

Derive `<x> <y>` from the `bounds` attribute of the target node in the hierarchy dump rather than estimating from a screenshot. The device is 1080x2316 at density 450; `input` takes physical pixels, so a screenshot scaled for display must be mapped back before its coordinates are usable.

Deep links jump straight to a route instead of tapping through the app:

```bash
adb -s "$DEVICE" shell am start -a android.intent.action.VIEW -d "snaplyapp://<path>" "$PKG"
```

## 4. App-private state

The debug build is debuggable, so `run-as` grants read access to the app sandbox without root. This is the highest-signal observation available.

```bash
adb -s "$DEVICE" shell run-as "$PKG" ls -la files/store/
adb -s "$DEVICE" shell run-as "$PKG" cat files/store/snaply.rolls.json
adb -s "$DEVICE" shell run-as "$PKG" ls cache/
```

`files/store/*.json` holds the persisted Zustand slices — the source of truth for what the UI should be showing. `cache/` reveals whether side-effect pipelines ran (`ExpoVideoCache`, `image_manager_disk_cache`, `http-cache`, video-thumbnail output).

Shell globs may not expand inside `run-as` depending on quoting; list the directory first and `cat` explicit paths.

## 5. Logs

```bash
adb -s "$DEVICE" logcat -d | grep ReactNativeJS | tail -40   # JS console output
adb -s "$DEVICE" logcat -d -t 200                            # recent everything, incl. native crashes
adb -s "$DEVICE" logcat -c                                   # clear before reproducing
```

For a value that no other layer exposes, add a temporary `console.log`, let Fast Refresh deliver it, read it back through `ReactNativeJS`, then remove it before finishing. Do not leave debug logging in the committed change.

## 6. Permissions

```bash
adb -s "$DEVICE" shell dumpsys package "$PKG" | grep -E "granted=(true|false)"
```

Runtime permission state materially changes app behavior, so check it before concluding that a permission-dependent feature is broken. As of 2026-07-27 on the owner's device: `ACCESS_FINE_LOCATION` granted; `CAMERA`, `RECORD_AUDIO`, and `POST_NOTIFICATIONS` **not** granted.

Granting via `adb shell pm grant "$PKG" android.permission.CAMERA` works, but it modifies the owner's device state — ask first, and prefer exercising the app's own permission prompt when the prompt itself is part of what is being verified.

## Limits

Know these before promising a verification result:

- **No root.** `run-as` covers this app's debug build only. Other apps' data is unreachable, and Samsung Secure Folder profiles reject shell access outright (`SecurityException: Shell does not have permission to access user 150`).
- **Camera input cannot be injected.** Recording a real clip requires the owner to hold the device. The agent can verify everything downstream of capture — stored clip, thumbnail, roll state, UI — but not the capture gesture itself.
- **Metro is owner-run.** Do not start it in the background and do not kill port 8081. See the verification policy.
- **FCM push display is unverified.** Geofence gating and local-notification setup are confirmed on device; end-to-end push display stays deferred until a backend notification API exists.
- **Release-variant behavior differs.** These tools assume the debug dev build. `run-as` and `ReactNativeJS` logging are unavailable on the release APK from `npm run android:device:release`.
- **A JS-only loop.** Native module changes, config-plugin changes, and `app.json` branding changes need a rebuild (`npx expo run:android`), not Fast Refresh — see [`app-branding-and-native-config.md`](app-branding-and-native-config.md).

## Pending: iOS physical-device verification

**Not written — the owner has no iOS device as of 2026-07-27.** Write the counterpart document when one becomes available; do not infer an iOS device procedure from this document in the meantime.

Until then, iOS verification falls back to the simulator paths in [`local-development-and-testing.md`](local-development-and-testing.md) (Expo Go, or EAS Build when native modules are involved, with idb for touch automation), subject to the local-Xcode limitation described there. When reporting results, state explicitly that a change was verified on Android only.
