#!/usr/bin/env bash
# Runs the checks of the CI test job. CI runs this script in the Playwright
# container image. To run it locally in the same image, use test-container.sh.
# Do not run it on the host or in a distrobox: it installs pnpm globally.
set -euo pipefail

cd "$(dirname "$0")/.."

# Node 25 and later do not include corepack. Install the pnpm version that
# package.json specifies.
pnpm_version=$(node -p "require('./package.json').packageManager.split('@')[1]")
npm install --global --no-fund --no-audit "pnpm@${pnpm_version}"

pnpm install --frozen-lockfile ${PNPM_STORE_DIR:+--store-dir "$PNPM_STORE_DIR"}

pnpm lint
pnpm check
pnpm test:coverage
pnpm exec vitest run --project client
