import { describe, it, expect } from 'vitest';
import pkg from '../../package.json' with { type: 'json' };
import { ENGINE_VERSION, engineLocation } from './engine-location.js';

describe('engineLocation', () => {
	it('provides the three URLs that boot() requires', () => {
		expect(engineLocation.baseURL).toMatch(/^https:\/\/.+\/$/);
		expect(engineLocation.coreBaseURL).toMatch(/^https:\/\/.+\/$/);
		expect(engineLocation.synthdefBaseURL).toMatch(/^https:\/\/.+\/$/);
	});

	it('loads both engine packages at ENGINE_VERSION', () => {
		expect(engineLocation.baseURL).toContain(`supersonic-scsynth@${ENGINE_VERSION}/`);
		expect(engineLocation.coreBaseURL).toContain(`supersonic-scsynth-core@${ENGINE_VERSION}/`);
	});

	it('uses the engine version that package.json installs', () => {
		const range = (name: string) =>
			(pkg.devDependencies as Record<string, string>)[name]?.replace(/^\^/, '');
		expect(range('supersonic-scsynth')).toBe(ENGINE_VERSION);
		expect(range('supersonic-scsynth-core')).toBe(ENGINE_VERSION);
	});
});
