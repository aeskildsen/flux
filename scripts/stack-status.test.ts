/**
 * Tests for scripts/stack-status.ts: the parts that read versions, tags, pins
 * and git status. The network and git calls are not tested here.
 */
import { describe, expect, it } from 'vitest';
import {
	compareVersions,
	formatTable,
	latestVersionTag,
	parseBranchLine,
	parseEnginePin,
	parseIsospinPin,
	parseLsRemoteTags,
	parseSubmoduleStatus,
	summariseWorkingTree,
	tagForCommit
} from './stack-status.js';

describe('compareVersions', () => {
	it('compares the numbers, not the text', () => {
		expect(compareVersions('v0.10.0', 'v0.9.0')).toBeGreaterThan(0);
		expect(compareVersions('v0.9.0', 'v0.10.0')).toBeLessThan(0);
		expect(compareVersions('v1.2.3', '1.2.3')).toBe(0);
	});

	it('orders the flux-engine releases on one SuperSonic version by their count', () => {
		expect(compareVersions('v0.97.0-flux.2', 'v0.97.0-flux.1')).toBeGreaterThan(0);
		expect(compareVersions('v0.99.0-flux.1', 'v0.97.0-flux.2')).toBeGreaterThan(0);
	});
});

describe('latestVersionTag', () => {
	it('gives the highest version tag and ignores other tags', () => {
		expect(latestVersionTag(['v0.2.0', 'v0.10.0', 'v0.9.1', 'nightly', 'PoC'])).toBe('v0.10.0');
	});

	it('gives null when no tag is a version', () => {
		expect(latestVersionTag(['nightly'])).toBeNull();
		expect(latestVersionTag([])).toBeNull();
	});
});

describe('parseLsRemoteTags and tagForCommit', () => {
	const output = [
		'a21c0006440611441a88791b6167be41c55b2b28\trefs/tags/v0.99.0',
		'ddf37085585a0aa6df6cbc4bb36689ae02b75330\trefs/tags/v0.99.0^{}',
		'3865986edf8116bd90db2f72f61bfc4a989d5b17\trefs/tags/v0.3.0'
	].join('\n');

	it('gives the commit of each tag, the peeled commit for an annotated tag', () => {
		const tags = parseLsRemoteTags(output);
		expect(tags.get('v0.99.0')).toBe('ddf37085585a0aa6df6cbc4bb36689ae02b75330');
		expect(tags.get('v0.3.0')).toBe('3865986edf8116bd90db2f72f61bfc4a989d5b17');
		expect(tags.size).toBe(2);
	});

	it('finds the tag of a commit, and the highest tag when two tags share it', () => {
		const tags = parseLsRemoteTags(
			output + '\n3865986edf8116bd90db2f72f61bfc4a989d5b17\trefs/tags/v0.3.1'
		);
		expect(tagForCommit(tags, 'ddf37085585a0aa6df6cbc4bb36689ae02b75330')).toBe('v0.99.0');
		expect(tagForCommit(tags, '3865986edf8116bd90db2f72f61bfc4a989d5b17')).toBe('v0.3.1');
		expect(tagForCommit(tags, '0000000000000000000000000000000000000000')).toBeNull();
	});
});

describe('parseIsospinPin', () => {
	it('gives the isospin release of ugens.toml as a tag', () => {
		const toml = [
			'# comment',
			'[isospin]',
			'version = "0.5.0"',
			'sha256 = "bbbe"',
			'',
			'[[sources]]',
			'name = "MiPlaits"',
			'version = "9.9.9"'
		].join('\n');
		expect(parseIsospinPin(toml)).toBe('v0.5.0');
	});

	it('gives null when there is no isospin table', () => {
		expect(parseIsospinPin('[[sources]]\nversion = "1.0.0"\n')).toBeNull();
	});
});

describe('parseEnginePin', () => {
	it('gives the flux-engine release of the package.json URL', () => {
		const pkg = JSON.stringify({
			devDependencies: {
				'flux-engine':
					'https://github.com/aeskildsen/flux-engine/releases/download/v0.97.0-flux.2/flux-engine-0.97.0-flux.2.tgz'
			}
		});
		expect(parseEnginePin(pkg)).toBe('v0.97.0-flux.2');
	});

	it('also reads dependencies, and gives null for another kind of source', () => {
		const url = 'https://github.com/aeskildsen/flux-engine/releases/download/v1.0.0-flux.1/x.tgz';
		expect(parseEnginePin(JSON.stringify({ dependencies: { 'flux-engine': url } }))).toBe(
			'v1.0.0-flux.1'
		);
		expect(
			parseEnginePin(JSON.stringify({ devDependencies: { 'flux-engine': 'file:../x' } }))
		).toBeNull();
		expect(parseEnginePin('{}')).toBeNull();
	});
});

describe('parseBranchLine', () => {
	it('reads the branch, its upstream and the counts', () => {
		expect(parseBranchLine('## main...origin/main [ahead 2, behind 1]')).toEqual({
			branch: 'main',
			upstream: 'origin/main',
			ahead: 2,
			behind: 1,
			gone: false
		});
		expect(parseBranchLine('## main...origin/main')).toEqual({
			branch: 'main',
			upstream: 'origin/main',
			ahead: 0,
			behind: 0,
			gone: false
		});
	});

	it('marks an upstream branch that no longer exists', () => {
		expect(parseBranchLine('## ci/x...origin/ci/x [gone]')).toMatchObject({
			branch: 'ci/x',
			gone: true
		});
	});

	it('handles a branch with no upstream and a detached HEAD', () => {
		expect(parseBranchLine('## feat/x')).toEqual({
			branch: 'feat/x',
			upstream: null,
			ahead: 0,
			behind: 0,
			gone: false
		});
		expect(parseBranchLine('## HEAD (no branch)')).toMatchObject({ branch: null, upstream: null });
		expect(parseBranchLine('## No commits yet on main')).toMatchObject({ branch: 'main' });
	});
});

describe('parseSubmoduleStatus', () => {
	it('gives the submodules that are off their pin or not checked out', () => {
		const out = [
			' 10f6824f68ad63475f67dfe3fe5016e2d2634f84 mi-UGens (v0.0.9)',
			'+590f8a276229679e7007caea4d935228da7468b4 supersonic (v0.97.0)',
			'-3865986edf8116bd90db2f72f61bfc4a989d5b17 external/md2misc'
		].join('\n');
		expect(parseSubmoduleStatus(out)).toEqual({
			paths: ['mi-UGens', 'supersonic', 'external/md2misc'],
			offPin: ['supersonic'],
			missing: ['external/md2misc']
		});
	});

	it('gives empty lists for no output', () => {
		expect(parseSubmoduleStatus('')).toEqual({ paths: [], offPin: [], missing: [] });
	});
});

describe('summariseWorkingTree', () => {
	it('counts changed files apart from changes inside submodules', () => {
		const porcelain = [' M src/a.ts', '?? new.txt', ' m mi-UGens', ' M supersonic'].join('\n');
		expect(summariseWorkingTree(porcelain, ['mi-UGens', 'supersonic'])).toEqual({
			changedFiles: 2,
			changedSubmodules: ['mi-UGens', 'supersonic']
		});
	});

	it('gives a clean tree for no output', () => {
		expect(summariseWorkingTree('', [])).toEqual({ changedFiles: 0, changedSubmodules: [] });
	});
});

describe('formatTable', () => {
	it('pads each column to its widest cell and trims the end of each line', () => {
		expect(
			formatTable([
				['a', 'bbb', 'c'],
				['dddd', 'e', '']
			])
		).toBe('a     bbb  c\ndddd  e');
	});

	it('measures the width without the colour codes', () => {
		const red = '\u001b[31mx\u001b[0m';
		expect(
			formatTable([
				[red, 'y'],
				['zz', 'w']
			])
		).toBe(`${red}   y\nzz  w`);
	});
});
