/**
 * The build identity of Flux (src/lib/build-info.ts): the package.json
 * version, the commit and the engine version. vite.config.ts writes it into
 * the app as __FLUX_BUILD__.
 *
 * - The commit is GITHUB_SHA in CI, else `git rev-parse HEAD`.
 * - The engine version is the version line of BUILDINFO in the engine package
 *   (FLUX_ENGINE_DIR, else node_modules/flux-engine; see scripts/engine.ts).
 */
import { execFileSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import type { BuildInfo } from '../src/lib/build-info.js';

/** The version line of BUILDINFO in the engine package dir, or null. */
export function readEngineVersion(dir: string): string | null {
	const file = path.join(dir, 'BUILDINFO');
	if (!existsSync(file)) return null;
	const line = readFileSync(file, 'utf8')
		.split('\n')
		.find((l) => l.startsWith('version='));
	return line ? line.slice('version='.length).trim() : null;
}

/** The output of git in root, or null when git fails (no git, no repository). */
function git(root: string, args: string[]): string | null {
	try {
		return execFileSync('git', args, {
			cwd: root,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore']
		}).trim();
	} catch {
		return null;
	}
}

/** The build identity of the Flux checkout in root. dev is true for the Vite dev server. */
export function readBuildInfo(opts: {
	env: NodeJS.ProcessEnv;
	root: string;
	dev: boolean;
}): BuildInfo {
	const { env, root, dev } = opts;
	const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
	const engine = env.FLUX_ENGINE_DIR || path.join(root, 'node_modules', 'flux-engine');
	const commit = env.GITHUB_SHA || git(root, ['rev-parse', 'HEAD']);
	const status = git(root, ['status', '--porcelain']);
	return {
		version: pkg.version,
		dev,
		commit: commit || null,
		dirty: Boolean(status),
		engine: readEngineVersion(engine)
	};
}
