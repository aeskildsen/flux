#!/usr/bin/env bash
# Runs the CI test job locally, in the same container image as CI.
# The image tag comes from the CI workflow, so the two cannot differ.
# Dependencies go to a named volume, so the node_modules folder of the
# checkout stays as it is. A second volume keeps the pnpm store between runs.
#
# Needs podman or docker. Environment variables:
#   CONTAINER_ENGINE        The command that runs the engine, for example
#                           "docker" or "podman --remote".
#                           Default: podman if it is found, else docker.
#   FLUX_CONTAINER_NETWORK  The network for the run, for example "host".
#                           Default: the default network of the engine.
set -euo pipefail

repo=$(cd "$(dirname "$0")/.." && pwd)
image=$(grep -oE 'mcr\.microsoft\.com/playwright:v[0-9.]+-noble' "$repo/.github/workflows/deploy.yml" | head -n 1)

if [[ -n ${CONTAINER_ENGINE:-} ]]; then
	read -ra engine <<< "$CONTAINER_ENGINE"
elif command -v podman > /dev/null; then
	engine=(podman)
elif command -v docker > /dev/null; then
	engine=(docker)
else
	echo "test-container: podman or docker not found; set CONTAINER_ENGINE" >&2
	exit 1
fi

# Rootless engines map root in the container to the user on the host.
rootless() {
	"${engine[@]}" info --format '{{.Host.Security.Rootless}}' 2> /dev/null | grep -qx true ||
		"${engine[@]}" info --format '{{.SecurityOptions}}' 2> /dev/null | grep -q rootless
}

run_args=(--rm --init)
if [[ -n ${FLUX_CONTAINER_NETWORK:-} ]]; then
	run_args+=(--network "$FLUX_CONTAINER_NETWORK")
fi

# A rootful engine writes files into the checkout as root. To prevent this,
# run as the user on the host. That user must own the named volumes, and
# needs a writable home folder.
if ! rootless; then
	user="$(id -u):$(id -g)"
	"${engine[@]}" run "${run_args[@]}" \
		--volume flux-node-modules:/node-modules \
		--volume flux-pnpm-store:/pnpm-store \
		"$image" chown "$user" /node-modules /pnpm-store
	run_args+=(--user "$user" --env HOME=/tmp)
fi

exec "${engine[@]}" run "${run_args[@]}" \
	--volume "$repo:/work" --workdir /work \
	--volume flux-node-modules:/work/node_modules \
	--volume flux-pnpm-store:/pnpm-store --env PNPM_STORE_DIR=/pnpm-store \
	"$image" scripts/ci-test.sh
