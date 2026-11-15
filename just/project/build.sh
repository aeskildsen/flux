#!/usr/bin/env bash
# Production build of the app into build/.
set -euo pipefail
cd "$(dirname "$0")/../.."
exec pnpm build
