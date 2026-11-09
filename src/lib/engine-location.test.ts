import { describe, it, expect } from 'vitest';
import { engineLocation, engineLocationFor } from './engine-location.js';

describe('engineLocation', () => {
	it('loads the engine from the site itself, not from a CDN', () => {
		for (const url of [
			engineLocation.baseURL,
			engineLocation.coreBaseURL,
			engineLocation.synthdefBaseURL
		]) {
			expect(url).toMatch(/^\/.*\/$/);
		}
	});
});

describe('engineLocationFor', () => {
	it('loads the client and the core from the engine folder under the base path', () => {
		const location = engineLocationFor('/flux');
		expect(location.baseURL).toBe('/flux/flux-engine/dist/');
		expect(location.coreBaseURL).toBe('/flux/flux-engine/dist/');
	});

	it('resolves bare SynthDef names to the compiled SynthDefs of Flux', () => {
		expect(engineLocationFor('').synthdefBaseURL).toBe('/compiled_synthdefs/');
		expect(engineLocationFor('/flux').synthdefBaseURL).toBe('/flux/compiled_synthdefs/');
	});
});
