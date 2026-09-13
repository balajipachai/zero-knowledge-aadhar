#!/usr/bin/env bash
# Greps every git-tracked file for the shapes of thing that must never be
# committed: private keys, mnemonics, well-known Hardhat/Anvil default
# accounts, credentialed URLs, and generic high-entropy secret assignments.
# Run as part of `npm test`; also runnable standalone.
set -euo pipefail

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Prefer `git ls-files` (the actual "what will be committed" answer) when
# this checkout is a git repo. Before `git init` (e.g. while a repo is still
# being assembled), fall back to walking the tree ourselves with the same
# exclusions this project's .gitignore already declares, so the check is
# still meaningful pre-git-init rather than erroring out.
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  FILES=$(git ls-files)
else
  echo "(not a git repo yet -- scanning the working tree directly, honoring known ignore patterns)"
  FILES=$(find . \
    -path ./node_modules -prune -o \
    -path ./contracts/node_modules -prune -o \
    -path ./contracts/cache -prune -o \
    -path ./contracts/artifacts -prune -o \
    -path ./contracts/typechain-types -prune -o \
    -path ./contracts/ignition/deployments -prune -o \
    -path ./.next -prune -o \
    -path ./.cache -prune -o \
    -path ./.git -prune -o \
    -path ./coverage -prune -o \
    -type f -print | sed 's#^\./##' \
    | grep -vE '^public/(.*\.zkey|.*\.wasm|vkey\.json)$' \
    | grep -vE '^\.env($|\.local$|\.test\.local$|\.[^.]+\.local$)' \
    | grep -vE '^contracts/\.env($|\.local$)' \
    | grep -vE '^contracts/ignition/parameters\.(local|sepolia)\.json$')
fi

FAIL=0

fail() {
  echo "SECRET CHECK FAILED: $1" >&2
  FAIL=1
}

# This script itself is excluded from the pattern checks below -- it
# necessarily contains the literal strings it's searching for.
SCANNABLE=$(echo "$FILES" | grep -v 'scripts/check-secrets\.sh$')

# 1. Raw 32-byte hex private keys (0x + 64 hex chars), the shape a Hardhat/
# Anvil/EOA private key always takes. A bytes32 value (a cycleId, a hash, a
# nullifier-as-bytes32) has the exact same *shape* with no way to tell them
# apart by regex alone, so two narrow, structurally-justified categories of
# path are exempt from this specific check:
#   - test/** and contracts/test/** -- by this project's own convention
#     (see scripts/dev-setup.ts and test/integration/globalSetup.ts), every
#     real private key used anywhere in a test is generated at runtime via
#     generatePrivateKey(); nothing here ever hardcodes one, so a 64-hex
#     literal here is always a synthetic bytes32 test constant, never a key.
#   - contracts/ignition/parameters.*.json -- this module's own parameter
#     schema (see ignition/modules/GrantCycle.ts) has no private-key-shaped
#     field at all: owner/relayer are addresses, nullifierSeed/opensAt/
#     closesAt are decimal strings, and cycleId is the one bytes32 value.
if echo "$SCANNABLE" \
  | grep -vE '^(contracts/)?test/' \
  | grep -vE '^contracts/ignition/parameters\.[^/]+\.json$' \
  | xargs grep -nE '0x[0-9a-fA-F]{64}([^0-9a-fA-F]|$)' -- 2>/dev/null; then
  fail "a 0x-prefixed 64-hex-char value (private key shape) is present in a tracked file"
fi

# 2. The well-known Hardhat/Anvil default first account's private key and
# its common mnemonic, verbatim, regardless of what surrounds them.
DEFAULT_HH_KEY="ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
DEFAULT_HH_MNEMONIC="test test test test test test test test test test test junk"
if echo "$SCANNABLE" | xargs grep -nF "$DEFAULT_HH_KEY" -- 2>/dev/null; then
  fail "the well-known Hardhat/Anvil default private key is present in a tracked file"
fi
if echo "$SCANNABLE" | xargs grep -nF "$DEFAULT_HH_MNEMONIC" -- 2>/dev/null; then
  fail "the well-known Hardhat/Anvil default mnemonic is present in a tracked file"
fi

# 3. Credentialed URLs: scheme://user:pass@host. .env.example is exempt --
# it is explicitly required to show the shape `postgresql://USER:PASSWORD@
# HOST:5432/DB` as a placeholder (rule 5 below separately confirms
# .env.example never contains a real-looking hex secret).
if echo "$SCANNABLE" | grep -v '\.env\.example$' \
  | xargs grep -nE '[a-zA-Z][a-zA-Z0-9+.-]*://[^/@[:space:]"'"'"']+:[^/@[:space:]"'"'"']+@' -- 2>/dev/null; then
  fail "a URL with an embedded credential (scheme://user:pass@host) is present in a tracked file"
fi

# 4. Generic secret-looking assignments (API_KEY=..., SECRET=..., PASSWORD=...)
# outside of .env.example (which must carry placeholders only) and this
# script itself.
if echo "$SCANNABLE" | grep -v '\.env\.example$' \
  | xargs grep -nEi '(api[_-]?key|secret|password|private[_-]?key)\s*[:=]\s*["'"'"']?[A-Za-z0-9/+_-]{20,}' -- 2>/dev/null; then
  fail "a plausible secret assignment is present outside .env.example"
fi

# 5. .env.example must contain no real-looking values -- only placeholders.
if [ -f .env.example ]; then
  if grep -nE '0x[0-9a-fA-F]{40,}' .env.example 2>/dev/null; then
    fail ".env.example contains a real-looking hex address/key instead of a placeholder"
  fi
fi

# 6. No tracked .env* file besides .env.example.
if echo "$FILES" | grep -E '(^|/)\.env(\.|$)' | grep -v '\.env\.example$'; then
  fail "a real .env file (not .env.example) is tracked by git"
fi

if [ "$FAIL" -ne 0 ]; then
  echo "check-secrets: FOUND ISSUES ABOVE" >&2
  exit 1
fi

FILE_COUNT=$(echo "$FILES" | grep -c '.' || true)
echo "check-secrets: clean ($FILE_COUNT files scanned)"
