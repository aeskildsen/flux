/**
 * Checks whether compiled synthdefs are up to date with their sources.
 * If any .scsyndef is missing or older than its source .scd, re-runs the
 * compile script. Requires sclang to be installed; skips silently if not.
 */
import { execSync, spawnSync } from 'child_process';
import { existsSync, statSync, readFileSync, readdirSync } from 'fs';
import path from 'path';

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

if (!hasSclang()) {
	console.log('sclang not found — skipping synthdef freshness check');
	process.exit(0);
}

if (needsRecompile()) {
	console.log('Synthdefs are stale — recompiling...');
	execSync(`sclang "${compileScript}"`, { stdio: 'inherit' });
} else {
	console.log('Synthdefs are up to date');
}
