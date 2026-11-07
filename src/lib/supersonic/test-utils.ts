import { engineLocationFor } from '#lib/engine-location.js';
import type { SuperSonicConfig } from './types.js';

/**
 * Local asset config for integration tests. The engine is the one that Flux
 * deploys: the flux-engine package, which the Vite dev server serves from
 * node_modules. engineLocationFor() gives the layout of the package.
 */
export const localConfig: SuperSonicConfig = {
	...engineLocationFor('/node_modules'),
	// The Vite dev server serves the fixtures folder. The production build does not include it.
	synthdefBaseURL: '/src/lib/supersonic/fixtures/'
};
