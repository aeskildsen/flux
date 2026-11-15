#!/usr/bin/env bash
# Static checks: prettier, eslint and svelte-check. With "correct", prettier
# first writes its changes.
set -euo pipefail
cd "$(dirname "$0")/../.."
if [ "${1:-check}" = correct ]; then
	pnpm format
fi
pnpm lint
pnpm check
