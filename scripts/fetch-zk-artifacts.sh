#!/usr/bin/env bash
# Downloads the Anon Aadhaar v2.0.0 proving/verifying artifacts into public/,
# where the browser (wasm/zkey) and the server (vkey.json, mirrored also at
# src/server/zk/vkey.json) read them from. These files are gitignored --
# the zkey alone is ~584MB, well over GitHub's 100MB limit -- so every fresh
# checkout must run this script before `npm run dev`/`npm run build`.
#
# Sizes and sha256 sums are pinned below (computed once from a known-good
# download) so a corrupted download, a CDN swap, or a MITM'd artifact host
# is caught immediately rather than silently producing a server that can
# never verify a real proof.
#
# Written for bash 3.2 (macOS's default /bin/bash has no associative
# arrays) as well as bash 4+/Linux CI -- hence the case statements below
# instead of `declare -A`.
set -euo pipefail

BASE_URL="https://anon-aadhaar-artifacts.s3.eu-central-1.amazonaws.com/v2.0.0"
DEST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/public"

expected_size() {
  case "$1" in
    aadhaar-verifier.wasm) echo "10469686" ;;
    circuit_final.zkey) echo "612082146" ;;
    vkey.json) echo "4388" ;;
  esac
}

expected_sha256() {
  case "$1" in
    aadhaar-verifier.wasm) echo "4894923663fafda95beb70abca4112ea97a62058c9a46419a274f04236f10d4f" ;;
    circuit_final.zkey) echo "0d443ea85279b0370b53202f5e768ca9098cfcb5bb14f8ca8323d2266822c492" ;;
    vkey.json) echo "40f2ea24b56ffe2b6e6e3578053cbda15e773cb560697bac883a404077fcf177" ;;
  esac
}

sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | cut -d' ' -f1
  else
    shasum -a 256 "$1" | cut -d' ' -f1
  fi
}

mkdir -p "$DEST_DIR"

for file in aadhaar-verifier.wasm circuit_final.zkey vkey.json; do
  dest="$DEST_DIR/$file"
  want_size=$(expected_size "$file")
  want_sha256=$(expected_sha256 "$file")

  if [ -f "$dest" ]; then
    actual_size=$(wc -c < "$dest" | tr -d ' ')
    actual_sha256=$(sha256_of "$dest")
    if [ "$actual_size" = "$want_size" ] && [ "$actual_sha256" = "$want_sha256" ]; then
      echo "ok    $file (already present, checksum matches)"
      continue
    fi
    echo "stale $file (size/sha256 mismatch) -- re-downloading"
  fi

  echo "fetch $file"
  curl -fSL --progress-bar "$BASE_URL/$file" -o "$dest"

  actual_size=$(wc -c < "$dest" | tr -d ' ')
  actual_sha256=$(sha256_of "$dest")

  if [ "$actual_size" != "$want_size" ]; then
    echo "ERROR: $file size $actual_size != expected $want_size" >&2
    rm -f "$dest"
    exit 1
  fi
  if [ "$actual_sha256" != "$want_sha256" ]; then
    echo "ERROR: $file sha256 $actual_sha256 != expected $want_sha256" >&2
    rm -f "$dest"
    exit 1
  fi
  echo "ok    $file (size + sha256 verified)"
done

echo "All zk artifacts present and verified in $DEST_DIR"
