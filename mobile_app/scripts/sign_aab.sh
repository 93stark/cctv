#!/usr/bin/env bash
# Signs the release AAB with the Play *upload* key. Credentials come from environment variables
# (Codemagic secure variables); nothing is written to the repository.
set -euo pipefail
AAB="${1:-build/app/outputs/bundle/release/app-release.aab}"
: "${KEYSTORE_PATH:?}" "${KEYSTORE_PASSWORD:?}" "${KEY_ALIAS:?}"
KEY_PASSWORD="${KEY_PASSWORD:-$KEYSTORE_PASSWORD}"
# Remove any existing (debug) signature, then sign with the upload key.
zip -q -d "$AAB" 'META-INF/*' || true
jarsigner -sigalg SHA256withRSA -digestalg SHA-256 \
  -keystore "$KEYSTORE_PATH" -storepass "$KEYSTORE_PASSWORD" -keypass "$KEY_PASSWORD" \
  "$AAB" "$KEY_ALIAS"
jarsigner -verify "$AAB" | head -3
