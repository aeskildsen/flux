/**
 * Tests for scripts/engine.ts: which engine package Flux uses, the copy of
 * the engine into the static folder, and the sclang configuration for the
 * SynthDef compile.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { checkEngineDir, copyEngine, engineDir, sclangConfig } from './engine.js';

function makeEngine(root: string, { classes = true, client = true } = {}) {
	mkdirSync(path.join(root, 'dist', 'wasm'), { recursive: true });
	mkdirSync(path.join(root, 'dist', 'samples'), { recursive: true });
	mkdirSync(path.join(root, 'dist', 'synthdefs'), { recursive: true });
	if (client) writeFileSync(path.join(root, 'dist', 'supersonic.js'), 'client');
	writeFileSync(path.join(root, 'dist', 'wasm', 'scsynth-nrt.wasm'), 'wasm');
	writeFileSync(path.join(root, 'dist', 'samples', 'bd_haus.flac'), 'sample');
	writeFileSync(path.join(root, 'dist', 'synthdefs', 'sonic-pi-beep.scsyndef'), 'def');
	for (const f of ['BUILDINFO', 'LICENSE', 'NOTICE.md']) writeFileSync(path.join(root, f), f);
	if (classes) {
		mkdirSync(path.join(root, 'classes'));
		writeFileSync(path.join(root, 'classes', 'PhysWoodbar.sc'), '');
	}
}

let tmp: string;
beforeEach(() => {
	tmp = path.join(os.tmpdir(), `flux-engine-test-${randomUUID()}`);
});

describe('engineDir', () => {
	it('uses FLUX_ENGINE_DIR when it is set', () => {
		makeEngine(tmp);
		expect(engineDir({ FLUX_ENGINE_DIR: tmp }, '/unused')).toBe(path.resolve(tmp));
	});

	it('uses the installed flux-engine package otherwise', () => {
		const installed = path.join(tmp, 'node_modules', 'flux-engine');
		makeEngine(installed);
		expect(engineDir({}, tmp)).toBe(installed);
	});
});

describe('checkEngineDir', () => {
	it('accepts an engine package folder', () => {
		makeEngine(tmp);
		expect(checkEngineDir(tmp)).toBe(path.resolve(tmp));
	});

	it('refuses a folder without the client', () => {
		makeEngine(tmp, { client: false });
		expect(() => checkEngineDir(tmp)).toThrow(/dist\/supersonic\.js/);
	});

	it('refuses a folder without class files', () => {
		makeEngine(tmp, { classes: false });
		expect(() => checkEngineDir(tmp)).toThrow(/classes/);
	});
});

describe('copyEngine', () => {
	it('copies the engine and its licence files, without the sample pack and the stock SynthDefs', () => {
		const engine = path.join(tmp, 'engine');
		const target = path.join(tmp, 'static', 'flux-engine');
		makeEngine(engine);
		copyEngine(engine, target);
		expect(readFileSync(path.join(target, 'dist', 'supersonic.js'), 'utf8')).toBe('client');
		expect(existsSync(path.join(target, 'dist', 'wasm', 'scsynth-nrt.wasm'))).toBe(true);
		expect(existsSync(path.join(target, 'LICENSE'))).toBe(true);
		expect(existsSync(path.join(target, 'NOTICE.md'))).toBe(true);
		expect(existsSync(path.join(target, 'dist', 'samples'))).toBe(false);
		expect(existsSync(path.join(target, 'dist', 'synthdefs'))).toBe(false);
	});

	it('removes files of an older copy', () => {
		const engine = path.join(tmp, 'engine');
		const target = path.join(tmp, 'static', 'flux-engine');
		makeEngine(engine);
		mkdirSync(path.join(target, 'dist'), { recursive: true });
		writeFileSync(path.join(target, 'dist', 'old.js'), '');
		copyEngine(engine, target);
		expect(existsSync(path.join(target, 'dist', 'old.js'))).toBe(false);
	});
});

describe('sclangConfig', () => {
	const yaml = sclangConfig({
		classLibrary: '/sc/share/SuperCollider/SCClassLibrary',
		includePaths: ['/home/u/quarks/JSONlib', '/engine/classes']
	});

	it('puts the class library first, then the other folders', () => {
		const paths = [...yaml.matchAll(/^ {4}- (.*)$/gm)].map((m) => JSON.parse(m[1]));
		expect(paths).toEqual([
			'/sc/share/SuperCollider/SCClassLibrary',
			'/home/u/quarks/JSONlib',
			'/engine/classes'
		]);
	});

	it('excludes the default class paths, so no installed extension is compiled', () => {
		expect(yaml).toMatch(/^excludeDefaultPaths: true$/m);
	});
});
