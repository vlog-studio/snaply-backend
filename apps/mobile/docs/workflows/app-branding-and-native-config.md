# App branding and native config (icon, name, splash, font)

How to change app-level branding — the launcher **icon**, the display **name**, the **splash screen**, and the app **font** — and how to make those changes actually appear on a device.

Read this whenever a task touches the app icon, app display name, splash screen, adaptive-icon colors, the embedded font family, or any other value that is baked into the native project rather than rendered by React at runtime.

## Mental model: this is a CNG (managed) project

`/ios` and `/android` are **git-ignored generated folders** (see `.gitignore` → "generated native folders"). This project uses Expo **Continuous Native Generation (CNG)**: the native projects are produced from configuration, not hand-edited and not committed.

The **source of truth** is:

- `app.json` — `expo.name`, `expo.icon`, `expo.ios`, `expo.android`, and the `expo-splash-screen` plugin config.
- `assets/` — the image/`.icon` files those fields point to.

Consequences you must internalize:

- **Never edit files under `android/` or `ios/` to change branding.** Those edits are discarded the next time the native project is regenerated. Change `app.json` / `assets/` instead.
- The local `android/` and `ios/` folders can be **stale** — generated before a branding change and never regenerated. When they are stale, the emulator/simulator shows the *old* icon/name even though `app.json` is already correct. This is the single most common symptom (a "the icon didn't change" report).
- Icon, name, and splash are **build-time** resources. They are compiled into the app binary and **cannot be updated over-the-air (OTA)**. Seeing a change requires regenerating native code **and** rebuilding + reinstalling the app.
- **EAS Build re-runs prebuild in the cloud** from `app.json` + `assets/`. So a stale *local* native folder does not affect EAS builds — if the source config is correct, EAS produces the correct app. Regenerating locally only matters for local builds and local verification.

## Where each value lives

| Branding element | Source (edit here) | Generated native output (do not edit) |
| --- | --- | --- |
| Display name | `expo.name` in `app.json` | Android `strings.xml` → `app_name`; iOS `Info.plist` → `CFBundleDisplayName` |
| iOS icon | `expo.ios.icon` → `./assets/expo.icon` (Apple Icon Composer `.icon`) | `ios/<Name>/expo.icon`, `Images.xcassets/AppIcon.appiconset` |
| Android adaptive icon | `expo.android.adaptiveIcon` (`foregroundImage`, `backgroundImage`/`backgroundColor`, `monochromeImage`) | `res/mipmap-*/ic_launcher*.webp`, `res/mipmap-anydpi-v26/ic_launcher.xml` |
| Legacy/base icon | `expo.icon` → `./assets/images/icon.png` | included in generated icon sets |
| Splash screen | `expo-splash-screen` plugin config (`backgroundColor`, `image`, `imageWidth`) | Android `res/drawable-*/splashscreen_logo.png`, `colors.xml`; iOS `SplashScreen.storyboard`, `Images.xcassets` |
| App font | `expo-font` plugin config + the `.ttf` files in `assets/fonts/` | Android `res/font/xml_pretendard_gov.xml` + `res/font/*.ttf` + an `addCustomFont` call in `MainApplication.kt`; iOS `Info.plist` → `UIAppFonts` + a Resources build-phase entry per file |

## App font

The app font is **Pretendard GOV** ([upstream package](https://github.com/orioncactus/pretendard/tree/main/packages/pretendard-gov), SIL OFL 1.1 — `assets/fonts/OFL.txt` ships beside the files as the license requires). It is embedded at build time by the `expo-font` config plugin rather than loaded at runtime with `useFonts`, which is why there is no font gate in the root layout and no first-frame flash of a system face.

### Which weights are embedded, and why only four

`assets/fonts/` holds exactly the four weights the type roles in `ThemedText` use — **400, 500, 700, 800** — and `app.json` links all four. Each `.ttf` is ~5.3MB (23,410 glyphs; Pretendard GOV's coverage is the point of choosing it), so the family costs ~21MB of app binary on each platform and a fifth weight would cost another ~5.3MB. Upstream ships nine; the other five were deleted rather than left unlinked, so adding one means fetching it again from the [upstream package](https://github.com/orioncactus/pretendard/tree/main/packages/pretendard-gov).

`600` is deliberately **not** embedded, and it is the one weight to avoid adding to a style: it sits exactly between 500 and 700, and both platforms resolve a missing weight to the nearest embedded face — iOS breaks that tie toward the *lighter* one, so `fontWeight: 600` silently renders as Medium. React Navigation's default header title weight is 600, which is why `root-layout.tsx` sets an explicit 700 in `headerTitleStyle`.

To add or drop a weight: link/unlink it in **both** the `android.fonts[].fontDefinitions` array and the `ios.fonts` array, then prebuild and rebuild.

### One family name, both platforms

Styles say `fontFamily: Fonts.sans` (`'Pretendard GOV'`) and let `fontWeight` choose the face. Nothing names a single face like `'PretendardGOV-Bold'`. This works because of two separate mechanisms that happen to agree:

- **Android** — `fontDefinitions` generates `res/font/xml_pretendard_gov.xml`, a `<font-family>` mapping each `app:fontWeight` to a file, and the plugin registers it under the family name from the config with `ReactFontManager.getInstance().addCustomFont(this, "Pretendard GOV", …)`. The JS `fontFamily` string must match that config value **exactly**, spaces included.
- **iOS** — the plugin only lists the files in `UIAppFonts`; the family name comes from inside the font. CoreText groups faces by the **typographic family** (name ID 16), which is `Pretendard GOV` in all nine files, so all of them land in one family even though six of them carry a per-weight *legacy* family name (name ID 1, e.g. `Pretendard GOV SemiBold`). React Native then picks the face in that family whose weight trait is closest to the requested one (`RCTFontWithFontProperties` in `RCTFontUtils.mm`). A font whose ID 16 is unset would **not** group this way, and its heavier weights would silently collapse onto Regular on iOS. Verify before assuming a new family behaves like this one: this Mac has no `fc-scan`, `fontTools`, or `otfinfo`, so ask CoreText itself — register the files with `CTFontManagerRegisterFontsForURLs(urls, .process, …)` in a throwaway `swift` script, then print `CTFontManagerCopyAvailableFontFamilyNames()` and the descriptors matching `kCTFontFamilyNameAttribute`. Checked that way against all nine upstream Pretendard GOV faces, every one answered to the single family name — which is what iOS's `-[UIFont fontNamesForFamilyName:]` sees.

### Where the font reaches text, and where it does not

`ThemedText` applies `Fonts.sans` once in its base style, so every variant inherits it and only the two mono roles (`edge`, `code`) override it. Text outside `ThemedText` must name the family itself — currently `shared/ui/text-field` (a `TextInput`) and the `headerTitleStyle` in `root-layout.tsx`. Add a new one to that list, not a new font token.

The two mono roles reach less text than their names suggest, because **the system monospace carries no Hangul**. A Korean string styled with `Fonts.mono` is drawn by the OS CJK fallback instead — Noto Sans CJK KR on Android, Apple SD Gothic Neo on iOS — so it is neither Pretendard nor monospaced, and no amount of native font config changes that. `edge` is therefore reserved for Latin-and-digit stamps, and the sans `note` role carries every Korean micro-label; see [cookbook §14 Consuming the design system](../conventions/cookbook.md#14-consuming-the-design-system).

The font cannot reach text the OS draws: permission dialogs, `Alert`, notifications, and the share sheet stay on the system font. Nor does it reach web, and that is settled rather than pending — the app ships to iOS and Android only, so no webfont is served and `npm run web` renders down the `--font-body` fallback stack (see `_app/styles/global.css`).

## Standard procedure

### 1. Change the source config

Edit `app.json` and/or replace the asset files under `assets/`. Keep asset dimensions consistent with what they replace (e.g. Android adaptive foreground/background are 512×512, `icon.png` is 1024×1024).

Example — the 2026-07-20 rename + logo change:

```jsonc
// app.json → expo
"name": "Snaply",            // was "snaply-app"  → display name only
"slug": "snaply-app",        // leave slug alone (EAS project linkage)
```

Changing `expo.name` also renames the iOS Xcode project folder/target (e.g. `ios/snaplyapp/` → `ios/Snaply/`). The `bundleIdentifier` / `package` are **not** derived from `name` and stay unchanged.

### 2. Regenerate the native project

```bash
# Android
npx expo prebuild --clean --platform android

# iOS (file generation only; safe even where a local iOS *build* is impossible)
npx expo prebuild --clean --platform ios
```

Use `--platform` to regenerate one platform at a time so you don't disturb the other. `--clean` deletes and recreates the native folder — this is the reliable way to pick up branding changes (a non-`--clean` prebuild may not overwrite existing generated resources).

### 3. Rebuild and reinstall (to actually see the change)

Icon/name/splash are build-time, so reinstall is required:

```bash
# Android — see the local development guide; run:android needs the AVD *name*, not the adb serial
npx expo run:android --device Pixel_API_35
```

iOS cannot be built locally on the current machine (Xcode too old — see
[`local-development-and-testing.md`](local-development-and-testing.md)). Verify iOS at the config level, or through an **EAS Build**.

### 4. Verify

- **Android** — open the launcher app drawer and confirm the icon art and the label. Non-interactively:
  ```bash
  adb -s emulator-5554 exec-out screencap -p > drawer.png   # inspect the icon
  adb -s emulator-5554 shell dumpsys package com.anonymous.snaplyapp | grep versionName
  cat android/app/src/main/res/values/strings.xml            # app_name should match expo.name
  ```
- **iOS** — the app icon **cannot be seen locally**: no local native build is possible, and Expo Go renders *its own* icon regardless of this config. Verify by inspection instead:
  ```bash
  /usr/libexec/PlistBuddy -c "Print :CFBundleDisplayName" ios/<Name>/Info.plist   # expect the new name
  diff -rq assets/expo.icon ios/<Name>/expo.icon                                  # expect identical
  ```
  For a real visual check, produce an **EAS Build** and install it on a device/simulator.
- **Font** — the generated wiring is checkable without a build, and worth checking, because a font that fails to register does not error: text just renders in the system face.
  ```bash
  cat android/app/src/main/res/font/xml_pretendard_gov.xml            # one <font> per linked weight
  grep -n ReactFontManager android/app/src/main/java/com/anonymous/snaplyapp/MainApplication.kt
  /usr/libexec/PlistBuddy -c "Print :UIAppFonts" ios/Snaply/Info.plist   # one entry per linked weight
  ```
  On iOS the plugin references the files in place (`path = "../assets/fonts/…"`) rather than copying them under `ios/`, so an empty `find ios -name "*.ttf"` is expected, not a failure. On a device, compare a heading against Roboto/SF: Pretendard's Hangul is noticeably wider-set with flatter terminals.

## Known pitfalls (all observed on this project)

- **`prebuild --clean` deletes `android/local.properties`.** The next Gradle build then fails with `SDK location not found`. Recreate it (or export `ANDROID_HOME`) before building:
  ```bash
  printf 'sdk.dir=%s/Library/Android/sdk\n' "$HOME" > android/local.properties
  ```
- **Splash config must include an `image`.** The generated `styles.xml` always references `@drawable/splashscreen_logo`. If the `expo-splash-screen` plugin has only a `backgroundColor` and no `image`, a clean prebuild produces no such drawable and the Android build fails resource linking:
  `error: resource drawable/splashscreen_logo ... not found`. This project uses `./assets/images/brand-glyph-ember.png` at `imageWidth` 150. (A stale native folder can hide this — an old splash drawable lingers until the first clean prebuild.)
- **Android 12+ masks the splash icon to a circle, so a splash image whose art extends past its inscribed circle gets clipped.** The `expo-splash-screen` plugin maps to the system `windowSplashScreenAnimatedIcon`, which Android renders inside a circular mask (Google's safe zone is a 192dp-diameter circle within the 288dp icon canvas; some OEMs — e.g. Samsung One UI — mask even tighter). Compute the mark's bounding-circle factor (farthest content point from the canvas center ÷ half the canvas width) and keep `imageWidth × factor ≤ 192`. The 2026-07 moment-ring mark in `brand-glyph-ember.png` has factor ≈ 0.92 (the dot's outer edge is the extreme, 234px from center in the 512px canvas) → `imageWidth ≤ ~208`; this project uses **150**, well within the mask. (The previous play-triangle mark had factor ≈ 1.22, which is what originally clipped at `imageWidth` 200.) Adjusting `imageWidth` — not editing the shared glyph asset, which is also the in-app brand mark — is the correct lever: the area outside the circle is the same `backgroundColor`, so the mask itself is invisible. This is a system splash, not the legacy full-screen splash — you cannot avoid the circular mask; the logo must fit inside it.
- **`expo run:android --device` wants the AVD name, not the adb serial.** Pass `Pixel_API_35`, not `emulator-5554`; the serial errors with "Could not find device with name". Find the AVD name via `adb -s emulator-5554 emu avd name`.
- **`pod install` is broken locally.** During iOS prebuild the final `pod install` throws `Unicode Normalization not appropriate for ASCII-8BIT` (Homebrew Ruby 4.0.6 + CocoaPods 1.17.0). Native *file* generation completes before that step, so name/icon still update correctly. It is irrelevant here because local iOS builds are already blocked by Xcode and EAS runs its own `pod install`.

## Related

- [`local-development-and-testing.md`](local-development-and-testing.md) — machine constraints, emulator/simulator boot, and why local iOS native builds are not possible here.
- [`feature-development.md`](feature-development.md) — general implementation workflow and completion checklist.
