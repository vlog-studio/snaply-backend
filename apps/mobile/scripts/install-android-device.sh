#!/usr/bin/env bash
set -euo pipefail

# Install (and launch) an APK on a physical Android device attached over
# wireless adb — or USB, which behaves the same once connected.
#
#   bash scripts/install-android-device.sh [options]
#
#   --variant debug|release  APK to install (default: debug, the dev client)
#   --build                  Rebuild the APK with Gradle before installing
#                            (a missing APK is always built)
#   --apk <path>             Install this APK instead of the Gradle output
#   --pair <ip:port>         `adb pair` first (asks for the 6-digit code)
#   --connect <ip:port>      `adb connect` first
#   --no-launch              Install only
#   --reverse-only           Skip the APK: only re-apply `adb reverse` (after
#                            a reconnect dropped it, or once the dev server is up)
#
# ANDROID_SERIAL picks the device when more than one is attached; emulators
# are skipped unless named that way. See docs/guides/android-wireless-debugging.md.

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO_ROOT="$(cd "$ROOT/../.." && pwd)"
SDK_DIR="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
ADB="$SDK_DIR/platform-tools/adb"
APP_ID="com.anonymous.snaplyapp"
SCHEME="snaplyapp"
METRO_PORT=8081

VARIANT="debug"
FORCE_BUILD=0
APK=""
PAIR_ADDR=""
CONNECT_ADDR=""
LAUNCH=1
REVERSE_ONLY=0

usage() { sed -n '4,20p' "$0" | sed 's/^# \{0,1\}//'; }
die() { echo "error: $*" >&2; exit 1; }

while [ $# -gt 0 ]; do
  case "$1" in
    --variant) VARIANT="${2:-}"; shift 2 ;;
    --build) FORCE_BUILD=1; shift ;;
    --apk) APK="${2:-}"; shift 2 ;;
    --pair) PAIR_ADDR="${2:-}"; shift 2 ;;
    --connect) CONNECT_ADDR="${2:-}"; shift 2 ;;
    --no-launch) LAUNCH=0; shift ;;
    --reverse-only) REVERSE_ONLY=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) usage >&2; die "unknown option: $1" ;;
  esac
done

case "$VARIANT" in
  debug) TASK_VARIANT="Debug" ;;
  release) TASK_VARIANT="Release" ;;
  *) die "--variant must be debug or release (got '$VARIANT')" ;;
esac

[ -x "$ADB" ] || die "adb not found at $ADB (set ANDROID_HOME)"

port_if_local() {
  # $1 = URL; print its port when the host is loopback
  echo "$1" | sed -nE 's#^[a-z]+://(localhost|127\.0\.0\.1):([0-9]+).*#\2#p'
}
env_value() {
  # $1 = file, $2 = key
  [ -f "$1" ] || return 0
  sed -nE "s/^$2=[\"']?([^\"']*)[\"']?[[:space:]]*$/\1/p" "$1" | tail -1
}

API_URL="$(env_value "$ROOT/.env" EXPO_PUBLIC_API_BASE_URL)"
S3_URL="$(env_value "$REPO_ROOT/apps/api/.env" S3_PUBLIC_ENDPOINT)"

# Only the debug manifest sets usesCleartextTraffic, so a release build has
# Android refuse every http:// request before it leaves the phone: uploads
# fail at once and the server logs nothing. Warn before a minutes-long build.
if [ "$VARIANT" = "release" ] && [ "$REVERSE_ONLY" -eq 0 ]; then
  case "$API_URL $S3_URL" in
    *http://*)
      echo "warning: the release build blocks plain http://, and the app is configured for"
      [ "${API_URL#http://}" != "$API_URL" ] && echo "  API    $API_URL  (apps/mobile/.env EXPO_PUBLIC_API_BASE_URL)"
      [ "${S3_URL#http://}" != "$S3_URL" ] && echo "  upload $S3_URL  (apps/api/.env S3_PUBLIC_ENDPOINT)"
      echo "  so it cannot reach this local server. Test against it with the debug build"
      echo "  (npm run android:device:install); use release only against an https:// server."
      echo ""
      ;;
  esac
fi

# ---------------------------------------------------------------- build ----

build_apk() {
  # android/ is a generated CNG folder; create it if missing (fresh checkout).
  if [ ! -d "$ROOT/android" ]; then
    (cd "$ROOT" && npx expo prebuild --platform android)
  fi
  # Running gradlew outside the expo CLI needs the SDK location.
  if [ ! -f "$ROOT/android/local.properties" ]; then
    printf 'sdk.dir=%s\n' "$SDK_DIR" > "$ROOT/android/local.properties"
  fi

  gradle() {
    (cd "$ROOT/android" && ./gradlew "app:assemble$TASK_VARIANT" -x lint -x test --build-cache)
  }
  # merge<Variant>Resources fails transiently with corrupted incremental state
  # ("merged.dir/values*.xml (No such file or directory)"). On failure, drop
  # that state and retry once.
  if ! gradle; then
    echo ""
    echo "Build failed — clearing incremental resource-merge state and retrying once..."
    rm -rf "$ROOT/android/app/build/intermediates/incremental/$VARIANT/merge${TASK_VARIANT}Resources"
    gradle
  fi
}

# Hash of what gets baked into the native binary: the installed version of
# every dependency, app.json, and the local config plugins and native modules.
# File mtimes are useless for this (a checkout or rebase touches them), and
# @expo/fingerprint also hashes the generated android/ folder and npm scripts.
native_inputs_hash() {
  (cd "$ROOT" && node -e '
    const fs = require("fs"), path = require("path"), crypto = require("crypto");
    const h = crypto.createHash("sha1");
    const deps = Object.keys(require("./package.json").dependencies || {}).sort();
    for (const d of deps) {
      const dir = ["node_modules", "../../node_modules"].map((m) => path.join(m, d)).find((p) => fs.existsSync(p));
      h.update(d + "@" + (dir ? JSON.parse(fs.readFileSync(path.join(dir, "package.json"))).version : "missing") + "\n");
    }
    const walk = (p) => {
      if (!fs.existsSync(p)) return;
      if (fs.statSync(p).isFile()) { h.update(p + "\n"); h.update(fs.readFileSync(p)); return; }
      for (const e of fs.readdirSync(p).sort()) if (!["build", ".gradle", "node_modules"].includes(e)) walk(path.join(p, e));
    };
    ["app.json", "plugins", "modules"].forEach(walk);
    console.log(h.digest("hex"));
  ')
}

if [ "$REVERSE_ONLY" -eq 1 ]; then
  :
elif [ -z "$APK" ]; then
  APK="$ROOT/android/app/build/outputs/apk/$VARIANT/app-$VARIANT.apk"
  STAMP="$APK.native-inputs"
  if [ "$FORCE_BUILD" -eq 1 ] || [ ! -f "$APK" ]; then
    build_apk
    [ -f "$APK" ] || die "build finished but $APK is missing"
    native_inputs_hash > "$STAMP"
  fi

  # An APK built before a native dependency changed cannot load a bundle that
  # imports it and fails at startup. Warn rather than rebuild silently — a
  # rebuild takes minutes.
  if [ ! -f "$STAMP" ]; then
    echo "note: this APK was built outside this script, so it cannot tell whether it is"
    echo "  current. If a native dependency changed since, rerun with --build."
  elif [ "$(cat "$STAMP")" != "$(native_inputs_hash)" ]; then
    echo "warning: native dependencies, app.json, plugins/ or modules/ changed since this"
    echo "  APK was built. Rerun with --build, or the app may fail at startup."
  fi
else
  [ -f "$APK" ] || die "APK not found: $APK"
fi

# --------------------------------------------------------------- device ----

if [ -n "$PAIR_ADDR" ]; then
  "$ADB" pair "$PAIR_ADDR"
fi
if [ -n "$CONNECT_ADDR" ]; then
  "$ADB" connect "$CONNECT_ADDR"
fi

# Print "<serial> <hardware serial> <model>" for each attached physical device.
# One phone can be listed twice (an `adb connect` serial and an mDNS serial);
# keep the first serial per hardware serial so it counts as one device.
list_devices() {
  local serial hw model seen=" "
  for serial in $("$ADB" devices | awk 'NR>1 && $2=="device" {print $1}'); do
    case "$serial" in emulator-*) continue ;; esac
    [ "$("$ADB" -s "$serial" shell getprop ro.kernel.qemu 2>/dev/null | tr -d '\r')" = "1" ] && continue
    hw="$("$ADB" -s "$serial" shell getprop ro.serialno 2>/dev/null | tr -d '\r')"
    case "$seen" in *" ${hw:-$serial} "*) continue ;; esac
    seen="$seen${hw:-$serial} "
    model="$("$ADB" -s "$serial" shell getprop ro.product.model 2>/dev/null | tr -d '\r')"
    echo "$serial ${hw:-?} ${model:-?}"
  done
}

# Does macOS Bonjour see a phone with wireless debugging on?
bonjour_sees_phone() {
  command -v dns-sd >/dev/null 2>&1 || return 1
  local out pid
  out="$(mktemp)"
  dns-sd -B _adb-tls-connect._tcp local. > "$out" 2>/dev/null &
  pid=$!
  sleep 2
  kill "$pid" 2>/dev/null || true
  wait "$pid" 2>/dev/null || true
  grep -q "_adb-tls-connect" "$out" && { rm -f "$out"; return 0; }
  rm -f "$out"
  return 1
}

wait_for_devices() {
  local i
  for i in 1 2 3 4 5 6 7 8 9 10; do
    [ -n "$(list_devices)" ] && return 0
    sleep 1
  done
  return 1
}

if [ -n "${ANDROID_SERIAL:-}" ]; then
  STATE="$("$ADB" -s "$ANDROID_SERIAL" get-state 2>/dev/null || true)"
  [ "$STATE" = "device" ] || die "ANDROID_SERIAL=$ANDROID_SERIAL is not connected (state: ${STATE:-missing})"
  SERIAL="$ANDROID_SERIAL"
else
  # A paired phone reconnects over mDNS on its own within a second or two.
  if ! wait_for_devices; then
    if bonjour_sees_phone; then
      # The phone is advertising, but this adb server cannot reach it. On macOS
      # that is an adb server started without Local Network permission (e.g. by
      # a process that has since exited). Restarting it fixes it; the pairing
      # survives, but every device's `adb reverse` is dropped.
      echo "A phone is advertising wireless debugging but adb does not see it — restarting the adb server..."
      "$ADB" kill-server
      "$ADB" start-server
      wait_for_devices || true
    fi
  fi

  DEVICES="$(list_devices)"
  COUNT="$(printf '%s' "$DEVICES" | grep -c . || true)"
  if [ "$COUNT" -eq 0 ]; then
    cat >&2 <<EOF
No physical Android device is connected.
  - Phone: 개발자 옵션 > 무선 디버깅 must be on, on the same Wi-Fi as this Mac.
  - First time on this Mac: pair with --pair <ip:pairing-port> (the code dialog's address).
  - Paired but not listed: --connect <ip:port> (the 무선 디버깅 main screen's address).
EOF
    exit 1
  elif [ "$COUNT" -gt 1 ]; then
    echo "Multiple devices connected — set ANDROID_SERIAL to one of:" >&2
    echo "$DEVICES" | awk '{printf "  %s  (%s)\n", $1, $3}' >&2
    exit 1
  fi
  SERIAL="$(echo "$DEVICES" | awk '{print $1}')"
fi

MODEL="$("$ADB" -s "$SERIAL" shell getprop ro.product.model 2>/dev/null | tr -d '\r')"

# -------------------------------------------------------------- install ----

if [ "$REVERSE_ONLY" -eq 0 ]; then
  echo "Installing $(du -h "$APK" | cut -f1 | tr -d ' ') $VARIANT APK on ${MODEL:-device} ($SERIAL)..."
  case "$SERIAL" in
    *:*|*_adb-tls-connect*) echo "  (over Wi-Fi this takes about a minute — keep the phone's screen on)" ;;
  esac
  if ! OUT="$("$ADB" -s "$SERIAL" install -r "$APK" 2>&1)"; then
    echo "$OUT" >&2
    case "$OUT" in
      *INSTALL_FAILED_UPDATE_INCOMPATIBLE*)
        echo "" >&2
        echo "The installed app is signed with a different key. Uninstalling it deletes its data" >&2
        echo "(local snaps, login); if that is fine: $ADB -s $SERIAL uninstall $APP_ID" >&2
        ;;
    esac
    exit 1
  fi
  echo "$OUT" | tail -1
fi

# ------------------------------------------------------ reverse + launch ----

# Tunnel host ports the app reaches as localhost/127.0.0.1 — on the phone
# that address is the phone itself. Reverses reset whenever adb reconnects.

PORTS=""
# --reverse-only does not know which build is installed; Metro's port is
# harmless on a release build.
if [ "$VARIANT" = "debug" ] || [ "$REVERSE_ONLY" -eq 1 ]; then PORTS="$METRO_PORT"; fi
for url in "$API_URL" "$S3_URL"; do
  p="$(port_if_local "$url")"
  [ -n "$p" ] && PORTS="$PORTS $p"
done
for p in $PORTS; do
  "$ADB" -s "$SERIAL" reverse "tcp:$p" "tcp:$p" >/dev/null
done
[ -n "$PORTS" ] && echo "adb reverse on ${MODEL:-device}: $(echo $PORTS | sed 's/ /, /g')"

if [ "$LAUNCH" -eq 1 ] && [ "$REVERSE_ONLY" -eq 0 ]; then
  if [ "$VARIANT" = "debug" ] && curl -s -o /dev/null --max-time 2 "http://localhost:$METRO_PORT/status"; then
    # Open the dev client straight onto the running Metro.
    "$ADB" -s "$SERIAL" shell am start -a android.intent.action.VIEW \
      -d "$SCHEME://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A$METRO_PORT" "$APP_ID" >/dev/null
    echo "Launched and pointed at Metro on :$METRO_PORT."
  else
    "$ADB" -s "$SERIAL" shell am start -n "$APP_ID/.MainActivity" >/dev/null
    if [ "$VARIANT" = "debug" ]; then
      echo "Launched. Metro is not running — start it with: npx expo start --dev-client"
    else
      echo "Launched the release build (bundle embedded, no Metro needed)."
    fi
  fi
fi
