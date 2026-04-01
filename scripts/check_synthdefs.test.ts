/**
 * Tests for the needsRecompile() logic in check_synthdefs.ts.
 *
 * We isolate the pure FS-based logic by passing explicit paths pointing at
 * a temporary directory instead of the real project directories.  This means
 * the tests are self-contained and work in CI where sclang is absent and
 * the compiled_synthdefs/ output is not committed.
 *
 * The top-level runner code (hasSclang / process.exit) is suppressed by
 * stubbing child_process.spawnSync before the module is imported, so it
 * returns {error: new Error()} making hasSclang() → false → process.exit(0).
 * We stub process.exit as well so it doesn't actually kill the test process.
 */
import { mkdirSync, writeFileSync, utimesSync } from 'fs';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Stub spawnSync before importing the module so the top-level hasSclang()
// call returns false → process.exit(0) branch, which we also stub.
vi.mock('child_process', async (importOriginal) => {
	const actual = await importOriginal<typeof import('child_process')>();
	return {
		...actual,
		spawnSync: vi.fn(() => ({ error: new Error('mocked: no sclang') })),
		execSync: vi.fn()
	};
});

const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as () => never);

const { needsRecompile } = await import('./check_synthdefs.js');

// ─── helpers ────────────────────────────────────────────────────────────────

function writeMetadata(dir: string, data: object) {
	writeFileSync(path.join(dir, 'metadata.json'), JSON.stringify(data));
}

function touch(filePath: string, mtime?: Date) {
	writeFileSync(filePath, '');
	if (mtime) utimesSync(filePath, mtime, mtime);
}

// ─── tests ──────────────────────────────────────────────────────────────────

describe('needsRecompile', () => {
	let tmpDir: string;
	let sourceDir: string;
	let targetDir: string;
	let metadataPath: string;

	beforeEach(() => {
		tmpDir = path.join(os.tmpdir(), `flux-synthdef-test-${randomUUID()}`);
		sourceDir = path.join(tmpDir, 'synthdefs');
		targetDir = path.join(tmpDir, 'compiled');
		metadataPath = path.join(targetDir, 'metadata.json');
		mkdirSync(sourceDir, { recursive: true });
		mkdirSync(targetDir, { recursive: true });
	});

	afterEach(() => {
		exitSpy.mockClear();
	});

	it('returns true when metadata.json is missing', () => {
		// targetDir exists but no metadata.json
		expect(needsRecompile({ sourceDir, targetDir, metadataPath })).toBe(true);
	});

	it('returns true when metadata.json is invalid JSON', () => {
		writeFileSync(metadataPath, 'not json {{{');
		expect(needsRecompile({ sourceDir, targetDir, metadataPath })).toBe(true);
	});

	it('returns true when a .scsyndef is missing for a known entry', () => {
		touch(path.join(sourceDir, 'kick.scd'));
		writeMetadata(targetDir, { kick: { source: 'kick.scd' } });
		// kick.scsyndef deliberately not created
		expect(needsRecompile({ sourceDir, targetDir, metadataPath })).toBe(true);
	});

	it('returns true when source .scd is newer than compiled .scsyndef', () => {
		const old = new Date('2020-01-01');
		const recent = new Date('2024-01-01');

		const compiledPath = path.join(targetDir, 'kick.scsyndef');
		touch(compiledPath, old);
		touch(path.join(sourceDir, 'kick.scd'), recent); // newer than compiled

		writeMetadata(targetDir, { kick: { source: 'kick.scd' } });
		expect(needsRecompile({ sourceDir, targetDir, metadataPath })).toBe(true);
	});

	it('returns false when all compiled files are up to date', () => {
		const old = new Date('2020-01-01');
		const recent = new Date('2024-01-01');

		touch(path.join(sourceDir, 'kick.scd'), old); // source is older
		touch(path.join(targetDir, 'kick.scsyndef'), recent); // compiled is newer

		writeMetadata(targetDir, { kick: { source: 'kick.scd' } });
		expect(needsRecompile({ sourceDir, targetDir, metadataPath })).toBe(false);
	});

	it('returns true when a new .scd file has no entry in metadata', () => {
		const old = new Date('2020-01-01');
		const recent = new Date('2024-01-01');

		// kick is up to date
		touch(path.join(sourceDir, 'kick.scd'), old);
		touch(path.join(targetDir, 'kick.scsyndef'), recent);
		writeMetadata(targetDir, { kick: { source: 'kick.scd' } });

		// snare.scd is new — not in metadata
		touch(path.join(sourceDir, 'snare.scd'));

		expect(needsRecompile({ sourceDir, targetDir, metadataPath })).toBe(true);
	});

	it('returns false when metadata entry has no source field', () => {
		// Entries without a source field are skipped (no recompile triggered)
		writeMetadata(targetDir, { kick: { category: 'percussion' } }); // no source key
		expect(needsRecompile({ sourceDir, targetDir, metadataPath })).toBe(false);
	});
});
