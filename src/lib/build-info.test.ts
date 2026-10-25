import { describe, it, expect } from 'vitest';
import { buildLabel, sourceURL, type BuildInfo } from './build-info.js';

const release: BuildInfo = {
	version: '0.2.0',
	dev: false,
	commit: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678',
	dirty: false,
	engine: '0.91.0-flux.1'
};

describe('buildLabel', () => {
	it('names the Flux version, the short commit and the engine version', () => {
		expect(buildLabel(release)).toBe('flux 0.2.0 · a1b2c3d · engine 0.91.0-flux.1');
	});

	it('marks a dev server build and a tree with changes', () => {
		expect(buildLabel({ ...release, dev: true, dirty: true })).toBe(
			'flux 0.2.0-dev · a1b2c3d-dirty · engine 0.91.0-flux.1'
		);
	});

	it('says so when the commit or the engine BUILDINFO is missing', () => {
		expect(buildLabel({ ...release, commit: null, engine: null })).toBe(
			'flux 0.2.0 · no commit · engine unknown'
		);
	});
});

describe('sourceURL', () => {
	it('opens the source tree of the commit that was built', () => {
		expect(sourceURL(release)).toBe(
			'https://github.com/aeskildsen/flux/tree/a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'
		);
	});

	it('opens the repository when the commit is not known', () => {
		expect(sourceURL({ ...release, commit: null })).toBe('https://github.com/aeskildsen/flux');
	});
});
