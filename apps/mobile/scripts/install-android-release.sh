#!/usr/bin/env bash
set -euo pipefail

# Build the release APK with Gradle, then install & launch it on a connected
# Android device. Kept separate from `expo run:android --variant release`
# because the expo-driven build repeatedly hits transient
# :app:mergeReleaseResources incremental-state failures on this machine,
# while a direct Gradle build succeeds (and can be retried without
# re-bundling or re-selecting a device).

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SDK_DIR="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
ADB="$SDK_DIR/platform-tools/adb"
APK="$ROOT/android/app/build/outputs/apk/release/app-release.apk"
APP_ID="com.anonymous.snaplyapp"

# android/ is a generated CNG folder; create it if missing (fresh checkout).
if [ ! -d "$ROOT/android" ]; then
  (cd "$ROOT" && npx expo prebuild --platform android)
fi

# Running gradlew outside the expo CLI needs the SDK location.
if [ ! -f "$ROOT/android/local.properties" ]; then
  printf 'sdk.dir=%s\n' "$SDK_DIR" > "$ROOT/android/local.properties"
fi

build() {
  (cd "$ROOT/android" && ./gradlew app:assembleRelease -x lint -x test --build-cache)
}

# mergeReleaseResources fails transiently with corrupted incremental state
# ("merged.dir/values*.xml (No such file or directory)"). On failure, drop
# that state and retry once.
if ! build; then
  echo ""
  echo "Build failed — clearing incremental resource-merge state and retrying once..."
  rm -rf "$ROOT/android/app/build/intermediates/incremental/release/mergeReleaseResources"
  build
fi

# Pick the target device: ANDROID_SERIAL wins; otherwise require exactly one
# connected device so we never install to the wrong one.
if [ -z "${ANDROID_SERIAL:-}" ]; then
  DEVICES="$("$ADB" devices | awk 'NR>1 && $2=="device" {print $1}')"
  COUNT="$(printf '%s' "$DEVICES" | grep -c . || true)"
  if [ "$COUNT" -eq 0 ]; then
    echo "No Android device connected (adb devices is empty)." >&2
    exit 1
  elif [ "$COUNT" -gt 1 ]; then
    echo "Multiple devices connected — set ANDROID_SERIAL to one of:" >&2
    echo "$DEVICES" >&2
    exit 1
  fi
  ANDROID_SERIAL="$DEVICES"
fi

echo "Installing $(du -h "$APK" | cut -f1 | tr -d ' ') APK on $ANDROID_SERIAL..."
"$ADB" -s "$ANDROID_SERIAL" install -r "$APK"
"$ADB" -s "$ANDROID_SERIAL" shell am start -n "$APP_ID/.MainActivity"
echo "Done — release build installed and launched on $ANDROID_SERIAL."
