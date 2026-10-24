import { describe, it, expect } from 'vitest';
import pkg from '../../package.json' with { type: 'json' };
import { ENGINE_VERSION, engineLocation, engineLocationFor } from './engine-location.js';

const devDependencies = pkg.devDependencies as Record<string, string>;

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

	it('uses the engine version that package.json installs', () => {
		const range = (name: string) => devDependencies[name]?.replace(/^\^/, '');
		expect(range('supersonic-scsynth')).toBe(ENGINE_VERSION);
		expect(range('supersonic-scsynth-core')).toBe(ENGINE_VERSION);
		expect(devDependencies['flux-engine']).toContain(`/v${ENGINE_VERSION}-flux.`);
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
