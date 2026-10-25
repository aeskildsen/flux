/**
 * Tests for scripts/build-info.ts: the build identity that vite.config.ts
 * writes into the app.
 */
import { execFileSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { readBuildInfo, readEngineVersion } from './build-info.js';

let tmp: string;
beforeEach(() => {
	tmp = path.join(os.tmpdir(), `flux-build-info-test-${randomUUID()}`);
	mkdirSync(tmp, { recursive: true });
	writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ version: '0.2.0' }));
});

function makeEngine(dir: string, version: string) {
	mkdirSync(dir, { recursive: true });
	writeFileSync(path.join(dir, 'BUILDINFO'), `kind=release\nversion=${version}\ncommit=abc\n`);
}

function git(...args: string[]) {
	execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd: tmp });
}

describe('readEngineVersion', () => {
	it('reads the version line of BUILDINFO', () => {
		makeEngine(path.join(tmp, 'engine'), '0.91.0-flux.1-dev');
		expect(readEngineVersion(path.join(tmp, 'engine'))).toBe('0.91.0-flux.1-dev');
	});

	it('gives null when the package has no BUILDINFO', () => {
		expect(readEngineVersion(path.join(tmp, 'engine'))).toBeNull();
	});
});

describe('readBuildInfo', () => {
	it('takes the engine from FLUX_ENGINE_DIR, else from node_modules/flux-engine', () => {
		makeEngine(path.join(tmp, 'node_modules', 'flux-engine'), '0.91.0-flux.1');
		makeEngine(path.join(tmp, 'local'), '0.91.0-flux.2-dev');
		expect(readBuildInfo({ env: {}, root: tmp, dev: false }).engine).toBe('0.91.0-flux.1');
		const env = { FLUX_ENGINE_DIR: path.join(tmp, 'local') };
		expect(readBuildInfo({ env, root: tmp, dev: false }).engine).toBe('0.91.0-flux.2-dev');
	});

	it('takes the commit from GITHUB_SHA in CI', () => {
		const info = readBuildInfo({ env: { GITHUB_SHA: 'f'.repeat(40) }, root: tmp, dev: false });
		expect(info.version).toBe('0.2.0');
		expect(info.commit).toBe('f'.repeat(40));
	});

	it('gives no commit and no changes outside a git repository', () => {
		const info = readBuildInfo({ env: {}, root: tmp, dev: true });
		expect(info).toEqual({ version: '0.2.0', dev: true, commit: null, dirty: false, engine: null });
	});

	it('reads the commit from git and marks a tree with changes', () => {
		git('init', '-q');
		git('add', 'package.json');
		git('commit', '-q', '-m', 'init');
		const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: tmp, encoding: 'utf8' }).trim();
		const clean = readBuildInfo({ env: {}, root: tmp, dev: false });
		expect(clean.commit).toBe(head);
		expect(clean.dirty).toBe(false);
		writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ version: '0.3.0' }));
		expect(readBuildInfo({ env: {}, root: tmp, dev: false }).dirty).toBe(true);
	});
});
