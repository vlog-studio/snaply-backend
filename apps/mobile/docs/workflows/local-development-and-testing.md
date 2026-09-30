# Local development and testing

## Verification surfaces (read first)

A change is verified on three surfaces, each answering a different question:

1. **Automated checks** (`npm run verify`, [below](#automated-checks)) — JavaScript logic and rendered interaction contracts. Always run first.
2. **iOS Simulator and Android emulator** — the agent's on-device verification path: screens render, navigation and interaction flows work, the app talks to the backend. Boot them, drive them, and capture screenshots yourself using the procedures below (Expo Go on the iOS Simulator, a dev build on the Android emulator — [Expo Go limitations](#expo-go-limitations) explains the split). The web build (`expo start --web`) is not a reference runtime; do not use it as evidence.
3. **Physical device, by the owner** — behavior a simulator cannot reproduce faithfully: real camera capture and the recording pipeline, the OS permission prompts as shipped, haptics, push-notification delivery, media-library writes, and network behavior from the device's own connection. When a change touches any of these, do not claim it verified. List the exact steps and expected results as a **separate manual-check section in your report** so the owner can run them on a real device, and say what you did verify on the simulator/emulator. If the owner has a device attached and asks you to drive it, [`android-device-verification.md`](android-device-verification.md) is the toolkit — confirm it with `adb devices` and target it with `-s <serial>` (or `ANDROID_SERIAL`); never assume it is the only device.

iOS hardware checks follow the fallback in [`AGENTS.md`](../../AGENTS.md#planned-documentation).

**Metro belongs to whoever started it.** `expo run:android` and the dev client attach to any server already on port 8081, so a Metro process that dies quietly (a backgrounded process tied to a shell or a timeout) takes the device session with it. Reuse a Metro the owner already runs when one is up (`curl -s http://localhost:8081/status`); when you start one yourself, run it as a persistent process that outlives the shell that launched it, and never free port 8081 without asking.

## Automated checks

Run the automated gate ([AGENTS.md § Verification](../../AGENTS.md#verification)) before device or simulator verification:

```bash
npm run verify
```

The individual scripts for running one gate at a time (`npm run lint`, `npm run typecheck`, `npm test`, …) are listed in `package.json`'s `scripts`. What to test and how to write it is in [`writing-unit-tests.md`](writing-unit-tests.md).

Jest and React Native Testing Library validate JavaScript logic and rendered interaction contracts; they do not replace iOS and Android verification for camera, permissions, file-system, animation, or other native behavior.

## Environment and legacy macOS limitation

The project does not prohibit `expo run:ios` on every development machine. The restriction applies only to older macOS machines that cannot install an Xcode version with the Swift 6.2 toolchain required by Expo SDK 57 / React Native 0.86.

- An older Intel Mac (`x86_64`) on macOS 15.7.7 is limited to **Xcode 16.4 (Swift 6.1.2)** and cannot install Xcode 26 (Swift 6.2).
- On that class of machine, a **local native iOS build is not possible**. Running `npx expo run:ios` fails with:
  `package 'apple' is using Swift tools version 6.2.0 but the installed version is 6.1.0`.
- A machine running a current macOS version with an Xcode release that provides Swift 6.2 is not subject to this limitation and may use `npm run ios` (`expo run:ios`).

On a legacy machine limited to Xcode 16.4, use **Expo Go** ([below](#ios-simulator--expo-go)) as the iOS runtime; Android runs a dev build on every machine ([below](#android-emulator--dev-build)). Use **EAS Build** when a feature depends on native modules that Expo Go does not include.

The command examples below were validated with this legacy-machine profile. Adjust simulator names, SDK paths, and AVD names for the machine in use:

- iOS: Xcode 16.4 + iOS 18.6 simulators, CocoaPods 1.17.0 (via Homebrew).
- Android: Android SDK at `~/Library/Android/sdk`, Android Studio, JDK 17, system image `system-images;android-35;default;x86_64`, and the AVD **`Pixel_API_35`**.
- Expo CLI 57.x.

## iOS Simulator — Expo Go

Expo Go is the iOS Simulator path (and the only iOS path on a legacy machine, [above](#environment-and-legacy-macos-limitation)). Android does not use it ([Expo Go limitations](#expo-go-limitations)); the Android emulator runs a dev build ([below](#android-emulator--dev-build)).

```bash
xcrun simctl boot "iPhone 16"; open -a Simulator
npx expo start --go                                      # Metro in Expo Go mode
xcrun simctl openurl "iPhone 16" "exp://127.0.0.1:8081"
```

Pressing `i` in the Metro terminal opens the app on the booted simulator; the `openurl` line is the non-interactive equivalent.

### First-time Expo Go install

Expo Go must be present on the simulator before the app can open, and it only needs installing once per simulator (from the CLI's cached client):

```bash
xcrun simctl install "iPhone 16" ~/.expo/ios-simulator-app-cache/Expo-Go-57.0.4.tar.app
```

After install, Expo Go stays on the simulator across sessions; just re-run `npx expo start --go` and reopen the app.

### iOS Simulator touch automation — idb

`xcrun simctl` cannot inject touches. Automated taps/swipes on the iOS Simulator use [idb](https://fbidb.io) (screen-coordinate tools like `cliclick` proved unreliable for in-app taps). On the legacy-profile machine it was set up like this:

- `idb-companion` is installed via Homebrew (`brew install facebook/fb/idb-companion`).
- The `fb-idb` Python client lives in a dedicated venv at `~/.venvs/fb-idb` because it is incompatible with the system Python 3.14 out of the box — `idb/cli/main.py` in that venv is patched to replace `asyncio.get_event_loop()` with `asyncio.new_event_loop()`. Recreating the venv requires re-applying that one-line patch.

```bash
IDB=~/.venvs/fb-idb/bin/idb
$IDB list-targets                                   # find the booted simulator UDID
$IDB ui tap 285 723 --udid <UDID>                   # coordinates in device points (iPhone 16: 393x852)
$IDB ui swipe 200 600 200 300 --udid <UDID>         # scroll
$IDB ui text "hello" --udid <UDID>                  # type into the focused field
```

Verify each interaction with `xcrun simctl io "iPhone 16" screenshot <path>`. To bypass permission dialogs during automation, grant them directly: `xcrun simctl privacy booted grant camera host.exp.Exponent` (same for `microphone`).

### Expo Go limitations

**Expo Go no longer boots this app on Android** (verified 2026-07-23 on the Pixel_API_35 emulator): the app imports `expo-notifications` at startup (`_app/providers` push-token registrar → `shared/lib/notifications/local.ts`), and on Android Expo Go that import throws a fatal `Uncaught Error: expo-notifications: Android Push notifications … removed from Expo Go with the release of SDK 53` before anything renders. Android verification therefore requires a dev build: `npm run android` for the emulator, `npm run android:device` for a connected physical device. iOS Expo Go is unaffected.

Only native modules bundled in Expo Go work, and `expo-dev-client` configuration is ignored. Custom native behavior (e.g. `expo-camera` config-plugin options, `expo-glass-effect`) may differ from a real build or be unavailable. When a feature depends on such modules, verify it with EAS Build instead.

Reanimated `entering` presets never start on iOS in Expo Go; the rule, `FadeInView`, and the splash exception are in [animations and gestures](../frameworks/animations-and-gestures.md#prefer-runtime-shared-value-animations-over-enteringexiting-presets).

## Android emulator — dev build

Boot the emulator, then build, install, and open the dev build with `npm run android` (`expo run:android`):

```bash
~/Library/Android/sdk/emulator/emulator -avd Pixel_API_35 -no-snapshot-save &
# wait until the emulator reports boot complete:
until ~/Library/Android/sdk/platform-tools/adb -s emulator-5554 shell getprop sys.boot_completed 2>/dev/null | grep -q 1; do sleep 3; done
npm run android
```

Once the dev build is installed, a later session needs only Metro in dev-build mode — `npx expo start --dev-client` here, or `npm run dev:mobile` from the monorepo root — and the app opened on the emulator.

If physical Android devices are also connected over adb, target the emulator explicitly with `-s emulator-5554`; a bare `adb shell` errors with "more than one device".

## Reload, dev menu, screenshots

- Code changes hot-reload via Fast Refresh.
- iOS reload: `Cmd+R`; dev menu: `Ctrl+D`. Android reload: `R` `R`; dev menu: `Cmd+M`.
- Capture screens to confirm a change rendered:
  ```bash
  xcrun simctl io "iPhone 16" screenshot /tmp/ios.png
  ~/Library/Android/sdk/platform-tools/adb -s emulator-5554 exec-out screencap -p > /tmp/android.png
  ```

## Installing an APK on a physical Android device — `scripts/install-android-device.sh`

`npm run android:device:install` installs the already-built debug APK (the dev client) on the attached physical device without re-running `expo run:android`; `npm run android:device:release` builds the release APK with Gradle (`gradlew app:assembleRelease`) and installs it the same way. Both are `scripts/install-android-device.sh` (`--help` lists the options: `--variant`, `--build`, `--apk`, `--pair`, `--connect`, `--no-launch`, `--reverse-only`). What the script does, so an agent does not redo it by hand:

- **Device selection.** Emulators are skipped; one phone listed under both its `adb connect` and mDNS serials counts once (grouped by `ro.serialno`). More than one physical device → it lists them and asks for `ANDROID_SERIAL`, which also targets an emulator explicitly.
- **adb server without Local Network access.** When no device appears but macOS Bonjour sees `_adb-tls-connect`, it restarts the adb server once ([`android-device-verification.md`](android-device-verification.md)). The restart drops every device's reverses.
- **Stale APK check.** A build through the script writes `app-<variant>.apk.native-inputs`, a hash of the installed dependency versions, `app.json`, `plugins/`, and `modules/`. A mismatch warns that the APK may lack a native module the bundle imports; an APK built by `expo run:android` has no stamp and gets a note instead. File mtimes are not used — a checkout or rebase touches them.
- **Reverses and launch.** It reverses 8081 (debug only) plus the ports of `EXPO_PUBLIC_API_BASE_URL` (`apps/mobile/.env`) and `S3_PUBLIC_ENDPOINT` (`apps/api/.env`) when those point at `localhost`/`127.0.0.1`. It then deep-links the dev client onto Metro when `:8081/status` answers, or starts `MainActivity`.
- **`--reverse-only`** (`npm run android:device:reverse`) skips the APK and only re-applies the reverses (8081 included, since it cannot tell which build is installed). The root `npm run dev:up` calls it after bringing up the local infrastructure and before starting the API.
- **Release builds block `http://`.** Expo sets `usesCleartextTraffic` only in the debug manifest, so on a release build Android refuses every plain-`http://` request before it leaves the phone — uploads fail at once and the backend logs nothing, while `adb shell curl` from the phone still succeeds (the shell is not subject to it). With `--variant release` the script warns before building when `EXPO_PUBLIC_API_BASE_URL` or `S3_PUBLIC_ENDPOINT` is `http://`. Verify against a local backend with the debug build.
- **Signature mismatch** (`INSTALL_FAILED_UPDATE_INCOMPATIBLE`) stops with the uninstall command; it never uninstalls on its own, since that deletes the app's local data.

The release APK embeds the JS bundle, so it runs without Metro — use it to hand a device a self-contained build or to verify near-production behavior. The Expo prebuild template signs release builds with the debug keystore, so no signing setup is needed, and it overwrites an installed debug build in place.

The release path deliberately does **not** use `expo run:android --variant release`: on the legacy-profile machine the expo-driven release build repeatedly failed in `:app:mergeReleaseResources` with corrupted incremental state (`merged.dir/values*.xml (No such file or directory)`), while a direct Gradle build succeeded. The script also clears that incremental state and retries once if the build fails, and recreates `android/local.properties` / runs `expo prebuild` when the generated `android/` folder is missing.

Release builds need more Gradle daemon memory than the template default (`-Xmx2048m -XX:MaxMetaspaceSize=512m`): `lintVitalAnalyzeRelease` fails with a Metaspace OOM. The local config plugin `plugins/with-gradle-jvmargs.js` (registered in `app.json`) raises this to `-Xmx4096m -XX:MaxMetaspaceSize=1024m` via `withGradleProperties`, so the fix survives `prebuild --clean`. Do not hand-edit `android/gradle.properties` for this; change the plugin.

## Full native verification — EAS Build (cloud dev build)

When Expo Go is insufficient, build a simulator/emulator dev client in the cloud (Expo's servers have Xcode 26), install the result on the local device, and connect Metro with `npx expo start --dev-client`. This exercises all native modules regardless of the local Xcode version. It requires a free Expo account; `eas login` must be performed by the user (account authentication).

## Notes

- `ios/` and `android/` are git-ignored (managed workflow). A `prebuild` may generate `ios/`; do not commit it.
- To stop: Android — `adb -s emulator-5554 emu kill`; iOS — `xcrun simctl shutdown "iPhone 16"`. Never free port 8081 without asking (see [Verification surfaces](#verification-surfaces-read-first)): the Metro on it may be the one the owner started for their own device session.
