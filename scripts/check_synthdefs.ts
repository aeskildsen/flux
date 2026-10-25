/**
 * Checks whether compiled synthdefs are up to date with their sources.
 * If any .scsyndef is missing or older than its source .scd, re-runs the
 * compile script. Requires sclang to be installed. If sclang is missing, it
 * does not compile, and it shows a warning when the compiled SynthDefs are
 * missing or out of date. With --force, it compiles in all cases, and fails
 * when sclang is missing.
 *
 * sclang compiles with the class files of the engine package (see
 * engine.ts), so that SynthDefs can use the flux-engine UGens.
 */
import { execFileSync, spawnSync } from 'child_process';
import { existsSync, statSync, readFileSync, readdirSync } from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { sclangArgs } from './engine';

const root = process.cwd();
const sourceDir = path.join(root, 'synthdefs');
const targetDir = path.join(root, 'static', 'compiled_synthdefs');
const metadataPath = path.join(targetDir, 'metadata.json');
const compileScript = path.join(root, 'scripts', 'compile_synthdefs.scd');

export function hasSclang(): boolean {
	const result = spawnSync('sclang', ['-v'], { encoding: 'utf8' });
	return result.error == null;
}

export function needsRecompile(opts?: {
	sourceDir?: string;
	targetDir?: string;
	metadataPath?: string;
}): boolean {
	const sd = opts?.sourceDir ?? sourceDir;
	const td = opts?.targetDir ?? targetDir;
	const mp = opts?.metadataPath ?? metadataPath;

	if (!existsSync(mp)) return true;

	let metadata: Record<string, { source?: string }>;
	try {
		metadata = JSON.parse(readFileSync(mp, 'utf8'));
	} catch {
		return true;
	}

	// Check each compiled synthdef against its source file
	for (const [name, info] of Object.entries(metadata)) {
		const sourceFile = info.source;
		if (!sourceFile) continue;

		const sourcePath = path.join(sd, sourceFile);
		const compiledPath = path.join(td, `${name}.scsyndef`);

		if (!existsSync(compiledPath)) return true;
		if (!existsSync(sourcePath)) continue;

		if (statSync(sourcePath).mtimeMs > statSync(compiledPath).mtimeMs) return true;
	}

	// Check for new .scd source files not yet in metadata
	const knownSources = new Set(Object.values(metadata).map((m) => m.source));
	const scdFiles = readdirSync(sd).filter((f) => f.endsWith('.scd'));
	if (scdFiles.some((f) => !knownSources.has(f))) return true;

	return false;
}

/**
 * Returns the message to show when sclang is missing. The message is a
 * warning when the compiled SynthDefs are missing or out of date.
 */
export function sclangMissingReport(opts?: {
	sourceDir?: string;
	targetDir?: string;
	metadataPath?: string;
}): { warn: boolean; message: string } {
	const mp = opts?.metadataPath ?? metadataPath;
	if (!existsSync(mp)) {
		return {
			warn: true,
			message:
				'⚠ sclang not found and no compiled SynthDefs — Flux will make no sound.\n' +
				'  Install sclang, then run `pnpm build:synthdefs`. See DEVELOPING.md.'
		};
	}
	if (needsRecompile(opts)) {
		return {
			warn: true,
			message:
				'⚠ sclang not found and the compiled SynthDefs are out of date with synthdefs/.\n' +
				'  Flux plays the old versions. Install sclang to compile the changes.'
		};
	}
	return {
		warn: false,
		message: 'sclang not found — compiled SynthDefs are up to date, so no compile is necessary'
	};
}

// Runs only when the script is executed directly, not when a test imports it.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	const force = process.argv.includes('--force');
	if (!hasSclang()) {
		if (force) {
			// A forced build must not pass with missing or stale SynthDefs.
			console.error('sclang not found — cannot compile synthdefs');
			process.exitCode = 1;
		} else {
			const report = sclangMissingReport();
			if (report.warn) console.warn(report.message);
			else console.log(report.message);
		}
	} else if (force || needsRecompile()) {
		console.log('Compiling synthdefs...');
		execFileSync('sclang', sclangArgs(compileScript), { stdio: 'inherit' });
	} else {
		console.log('Synthdefs are up to date');
	}
}
