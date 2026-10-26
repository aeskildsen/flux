#!/usr/bin/env bash
# Runs the checks of the CI test job. CI runs this script in the Playwright
# container image. To run it locally in the same image, use test-container.sh.
# Do not run it on the host or in a distrobox: it installs pnpm globally.
set -euo pipefail

cd "$(dirname "$0")/.."

# Node 25 and later do not include corepack. Install the pnpm version that
# package.json specifies. A user that is not root cannot write to the
# global npm prefix of the image, so it uses a prefix in its home folder.
if [[ $(id -u) -ne 0 ]]; then
	export NPM_CONFIG_PREFIX="$HOME/.npm-global"
	export PATH="$NPM_CONFIG_PREFIX/bin:$PATH"
fi
pnpm_version=$(node -p "require('./package.json').packageManager.split('@')[1]")
npm install --global --no-fund --no-audit "pnpm@${pnpm_version}"

pnpm install --frozen-lockfile ${PNPM_STORE_DIR:+--store-dir "$PNPM_STORE_DIR"}

# The engine SynthDef test (src/lib/supersonic/engine-synthdefs.integration.svelte.spec.ts)
# loads the compiled SynthDefs into the flux-engine package, so this job compiles
# them. sclang comes from the Ubuntu archive, the same as in the build job; only
# root can install it. sclang runs QtWebEngine, which stops as root with its
# sandbox. The compile replaces the files in static/compiled_synthdefs.
if ! command -v sclang > /dev/null && [[ $(id -u) -eq 0 ]]; then
	apt-get update
	apt-get install -y --no-install-recommends supercollider-language
fi
if command -v sclang > /dev/null; then
	export QT_QPA_PLATFORM=offscreen QTWEBENGINE_DISABLE_SANDBOX=1
	sclang scripts/install_sclang_dependencies.scd
	pnpm build:synthdefs
	# The engine SynthDef test fails, not skips, when it finds no compiled SynthDefs.
	export VITE_FLUX_REQUIRE_SYNTHDEFS=1
elif [[ -n ${CI:-} ]]; then
	echo "ci-test: sclang not found; CI must compile the SynthDefs" >&2
	exit 1
else
	echo "ci-test: WARNING: sclang not found; the engine SynthDef test is skipped" >&2
fi

pnpm lint
pnpm check
pnpm test:coverage
pnpm exec vitest run --project client
