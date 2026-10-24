#!/usr/bin/env bash
# Runs the CI test job locally, in the same container image as CI.
# The image tag comes from the CI workflow, so the two cannot differ.
# Dependencies go to a named volume, so the node_modules folder of the
# checkout stays as it is. A second volume keeps the pnpm store between runs.
# Runs on the host, or in a distrobox through distrobox-host-exec.
set -euo pipefail

repo=$(cd "$(dirname "$0")/.." && pwd)
image=$(grep -oE 'mcr\.microsoft\.com/playwright:v[0-9.]+-noble' "$repo/.github/workflows/deploy.yml" | head -n 1)

if command -v podman > /dev/null; then
	podman=(podman)
elif command -v distrobox-host-exec > /dev/null; then
	podman=(distrobox-host-exec podman)
else
	echo "test-container: podman not found" >&2
	exit 1
fi

# Rootless podman maps root in the container to the user on the host,
# so files that the run writes into the checkout belong to that user.
# The run needs only outbound network access. It uses the host network,
# because the default rootless network (pasta) gives no routes on some hosts.
exec "${podman[@]}" run --rm --init --network host \
	--volume "$repo:/work" --workdir /work \
	--volume flux-node-modules:/work/node_modules \
	--volume flux-pnpm-store:/pnpm-store --env PNPM_STORE_DIR=/pnpm-store \
	"$image" scripts/ci-test.sh
