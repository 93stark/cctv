#!/usr/bin/env bash
# Re-signs the split release APKs with the permanent release key so every build has the SAME signature
# (app stores reject an update signed with a different key). Credentials come from Codemagic secure
# variables; nothing is stored in the repository. Without KEYSTORE_B64 the debug-signed APKs are kept.
set -euo pipefail
if [ -z "${KEYSTORE_B64:-}" ]; then
  echo "KEYSTORE_B64 not set: keeping the debug-signed APKs (not suitable for app-store upload)."
  exit 0
fi
: "${KEYSTORE_PASSWORD:?}" "${KEY_ALIAS:?}"
KEY_PASSWORD="${KEY_PASSWORD:-$KEYSTORE_PASSWORD}"
KS="$(mktemp -d)/release.jks"
echo "$KEYSTORE_B64" | base64 --decode > "$KS"
SDK="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-/usr/local/share/android-sdk}}"
APKSIGNER="$(ls "$SDK"/build-tools/*/apksigner 2>/dev/null | sort -V | tail -1)"
[ -n "$APKSIGNER" ] || { echo "apksigner not found in $SDK/build-tools"; exit 1; }
for apk in build/app/outputs/flutter-apk/*-release.apk; do
  "$APKSIGNER" sign --ks "$KS" --ks-key-alias "$KEY_ALIAS" --ks-pass "pass:$KEYSTORE_PASSWORD" --key-pass "pass:$KEY_PASSWORD" "$apk"
  "$APKSIGNER" verify --print-certs "$apk" | grep -i "SHA-256" | head -1
done
rm -f "$KS"
