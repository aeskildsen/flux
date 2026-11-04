import type { SuperSonicConfig } from './types.js';

/**
 * Local asset config for integration tests. The engine is the one that Flux
 * deploys: the flux-engine package in node_modules. Its dist/ folder holds the
 * client and the core.
 */
export const localConfig: SuperSonicConfig = {
	baseURL: '/node_modules/flux-engine/dist/',
	coreBaseURL: '/node_modules/flux-engine/dist/',
	// The Vite dev server serves the fixtures folder. The production build does not include it.
	synthdefBaseURL: '/src/lib/supersonic/fixtures/'
};
