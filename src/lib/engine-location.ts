import type { SuperSonicConfig } from 'svelte-supersonic';

// Engine version. Must equal the supersonic-scsynth and supersonic-scsynth-core
// versions in package.json devDependencies. A unit test checks this.
export const ENGINE_VERSION = '0.61.0';

// Where the browser loads the SuperSonic engine from. Only this module decides
// the location: change the URLs here to load the engine from another place.
export const engineLocation: SuperSonicConfig = {
	baseURL: `https://cdn.jsdelivr.net/npm/supersonic-scsynth@${ENGINE_VERSION}/dist/`,
	coreBaseURL: `https://cdn.jsdelivr.net/npm/supersonic-scsynth-core@${ENGINE_VERSION}/`,
	synthdefBaseURL: 'https://cdn.jsdelivr.net/npm/supersonic-scsynth-synthdefs@latest/synthdefs/'
};
