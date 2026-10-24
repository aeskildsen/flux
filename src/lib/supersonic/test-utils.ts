import type { SuperSonicConfig } from './types.js';

/** Local asset config for integration tests. */
export const localConfig: SuperSonicConfig = {
	baseURL: '/node_modules/supersonic-scsynth/dist/',
	coreBaseURL: '/node_modules/supersonic-scsynth-core/',
	// The Vite dev server serves the fixtures folder. The production build does not include it.
	synthdefBaseURL: '/src/lib/supersonic/fixtures/'
};
