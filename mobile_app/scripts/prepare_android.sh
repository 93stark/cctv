#!/usr/bin/env bash
# Generates the Android platform folder (if missing) and applies the project's settings.
# Safe to run repeatedly. Requires Flutter on PATH.
set -euo pipefail
cd "$(dirname "$0")/.."

APP_ID="${APP_ID:-in.siliconcorporation.cctvsecret}"
APP_LABEL="${APP_LABEL:-CCTV Secret}"

if [ ! -d android ]; then
  # Generate the platform folder in a scratch directory and copy only android/ over, because
  # `flutter create` into this folder would overwrite pubspec.yaml and lib/.
  TMP="$(mktemp -d)"
  flutter create --org "${APP_ID%.*}" --project-name "${APP_ID##*.}" --platforms=android "$TMP/scaffold"
  cp -R "$TMP/scaffold/android" ./android
  rm -rf "$TMP"
fi

MANIFEST=android/app/src/main/AndroidManifest.xml
python3 - "$MANIFEST" "$APP_LABEL" <<'PY'
import re, sys
path, label = sys.argv[1], sys.argv[2]
s = open(path, encoding="utf-8").read()

if "android.permission.INTERNET" not in s:
    s = s.replace("<application", '<uses-permission android:name="android.permission.INTERNET"/>\n    <application', 1)

queries = """<queries>
        <intent><action android:name="android.intent.action.VIEW"/><data android:scheme="https"/></intent>
        <intent><action android:name="android.intent.action.VIEW"/><data android:scheme="http"/></intent>
        <intent><action android:name="android.intent.action.VIEW"/><data android:scheme="tel"/></intent>
        <intent><action android:name="android.intent.action.VIEW"/><data android:scheme="mailto"/></intent>
    </queries>"""
if "<queries>" not in s:
    s = s.replace("<application", queries + "\n    <application", 1)

s = re.sub(r'android:label="[^"]*"', f'android:label="{label}"', s, count=1)
# Disable cloud backup of tokens/preferences.
if "android:allowBackup" not in s:
    s = s.replace("<application", '<application android:allowBackup="false"', 1)
open(path, "w", encoding="utf-8").write(s)
PY

# Set the application id in whichever Gradle DSL the template uses.
for f in android/app/build.gradle android/app/build.gradle.kts; do
  [ -f "$f" ] || continue
  # -i.bak works on both GNU sed (Linux) and BSD sed (macOS builders); [[:space:]] is portable.
  sed -i.bak -E "s/(applicationId[[:space:]]*=?[[:space:]]*)\"[^\"]*\"/\1\"${APP_ID}\"/; s/(namespace[[:space:]]*=?[[:space:]]*)\"[^\"]*\"/\1\"${APP_ID}\"/" "$f"
  rm -f "$f.bak"
done
# App launcher icon (from the project logo). Remove any template adaptive icon so ours is used.
if [ -d assets/icon/android ]; then
  rm -f android/app/src/main/res/mipmap-anydpi-v26/ic_launcher*.xml
  for d in assets/icon/android/mipmap-*; do
    [ -d "$d" ] || continue
    mkdir -p "android/app/src/main/res/$(basename "$d")"
    cp "$d/ic_launcher.png" "android/app/src/main/res/$(basename "$d")/ic_launcher.png"
  done
fi
echo "Android project prepared for ${APP_ID}"
