#!/usr/bin/env bash
# The CI test job in the CI container image: lint, type-check, server tests
# and browser tests. A pass here is what counts as green.
set -euo pipefail
cd "$(dirname "$0")/../.."
exec pnpm test:container
