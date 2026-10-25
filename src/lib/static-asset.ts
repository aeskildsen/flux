import { asset } from '$app/paths';
import type { AssetPath } from '$app/types';

// The URL of a file in static/, for a path that asset() cannot type-check.
// asset() accepts only the files that are in static/ when svelte-kit sync runs.
// Use this function for build output (compiled_synthdefs/, flux-engine/), which
// is not in a clean checkout, and for paths that contain a run-time value.
// For other files, use asset().
export function staticAsset(file: string): string {
	return asset(file as AssetPath);
}
