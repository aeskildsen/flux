import type { SuperSonicConfig } from './types.js';

export const SUPERSONIC_VERSION = '0.57.0';

export const defaultConfig: SuperSonicConfig = {
	baseURL: `https://cdn.jsdelivr.net/npm/supersonic-scsynth@${SUPERSONIC_VERSION}/dist/`,
	coreBaseURL: `https://cdn.jsdelivr.net/npm/supersonic-scsynth-core@${SUPERSONIC_VERSION}/`,
	synthdefBaseURL: 'https://cdn.jsdelivr.net/npm/supersonic-scsynth-synthdefs@latest/synthdefs/',
	debug: false
};
