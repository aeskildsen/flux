import type { SuperSonicConfig } from 'svelte-supersonic';

// SuperSonic version of the engine. Must equal the supersonic-scsynth and
// supersonic-scsynth-core versions in package.json devDependencies (the
// wrapper's integration tests use those npm packages) and the SuperSonic
// version of the flux-engine dependency. A unit test checks this.
export const ENGINE_VERSION = '0.91.0';

// Where the browser loads the SuperSonic engine from. Only this module decides
// the location. The engine is SuperSonic with the flux-engine UGens; Flux
// serves it itself, from the static/flux-engine/ folder that
// scripts/engine.ts makes. basePath is the base path of the site ('' or, on
// GitHub Pages, '/flux').
export function engineLocationFor(basePath: string): SuperSonicConfig {
	// The package has one dist/ folder for the client and the core.
	const dist = `${basePath}/flux-engine/dist/`;
	return {
		baseURL: dist,
		coreBaseURL: dist,
		// Flux loads its SynthDefs by URL; a bare name resolves to its own folder.
		synthdefBaseURL: `${basePath}/compiled_synthdefs/`
	};
}

// vite.config.ts sets __FLUX_BASE_PATH__ from the SvelteKit base path.
export const engineLocation: SuperSonicConfig = engineLocationFor(__FLUX_BASE_PATH__);
