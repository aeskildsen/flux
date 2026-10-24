/**
 * The engine of Flux: SuperSonic with the flux-engine UGens, from a
 * flux-engine package (a folder with dist/ and classes/).
 *
 * The package is the flux-engine dependency in package.json (a GitHub release
 * tarball; the lockfile has its hash). For local development, FLUX_ENGINE_DIR
 * can name an unpacked package instead, for example a local flux-engine
 * build.
 *
 * - `tsx scripts/engine.ts` copies the engine into static/flux-engine/, so
 *   that the dev server and the built site serve it from the same origin as
 *   Flux (src/lib/engine-location.ts). `pnpm dev` and `pnpm build` run it.
 * - sclangArgs() gives sclang a class path with the class files of the
 *   package, for the SynthDef compile (scripts/check_synthdefs.ts).
 */
import {
	cpSync,
	existsSync,
	mkdtempSync,
	readdirSync,
	realpathSync,
	rmSync,
	writeFileSync
} from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { pathToFileURL } from 'url';

export const STATIC_ENGINE_DIR = path.join('static', 'flux-engine');

// Folders of dist/ that Flux does not load: the sample pack and the stock
// SynthDefs that SuperSonic's own tests use (most of the package size).
const UNUSED_DIST_DIRS = ['samples', 'synthdefs'];

/** The engine package folder: FLUX_ENGINE_DIR, else the installed package. */
export function engineDir(env: NodeJS.ProcessEnv = process.env, root = process.cwd()): string {
	return checkEngineDir(env.FLUX_ENGINE_DIR || path.join(root, 'node_modules', 'flux-engine'));
}

/** Checks that dir is an engine package folder, and gives its absolute path. */
export function checkEngineDir(dir: string): string {
	const root = path.resolve(dir);
	if (!existsSync(path.join(root, 'dist', 'supersonic.js'))) {
		throw new Error(`engine: ${root} has no dist/supersonic.js`);
	}
	const classes = path.join(root, 'classes');
	if (!existsSync(classes) || !readdirSync(classes).some((f) => f.endsWith('.sc'))) {
		throw new Error(`engine: ${root} has no class files in classes/`);
	}
	return root;
}

/**
 * Copies the engine of the package into target: dist/ without the folders
 * that Flux does not load, and the licence files (the engine is
 * AGPL-3.0-or-later; NOTICE.md says where its source is).
 */
export function copyEngine(engine: string, target: string): void {
	rmSync(target, { recursive: true, force: true });
	const dist = path.join(engine, 'dist');
	const unused = UNUSED_DIST_DIRS.map((d) => path.join(dist, d));
	cpSync(dist, path.join(target, 'dist'), {
		recursive: true,
		filter: (src) => !unused.includes(src)
	});
	for (const file of ['BUILDINFO', 'LICENSE', 'NOTICE.md']) {
		cpSync(path.join(engine, file), path.join(target, file));
	}
}

/**
 * An sclang configuration (sclang_conf.yaml) that compiles the class library
 * and the given folders only. excludeDefaultPaths keeps the installed
 * extensions out, so that a UGen class installed on the machine cannot
 * duplicate a class of the engine package. With excludeDefaultPaths sclang
 * also leaves out its class library, so it is in includePaths.
 */
export function sclangConfig(opts: { classLibrary: string; includePaths: string[] }): string {
	const paths = [opts.classLibrary, ...opts.includePaths];
	return [
		'includePaths:',
		...paths.map((p) => `    - ${JSON.stringify(p)}`),
		'excludePaths: []',
		'postInlineWarnings: false',
		'excludeDefaultPaths: true',
		''
	].join('\n');
}

/** The SCClassLibrary folder of the sclang on PATH (<prefix>/share/SuperCollider). */
function classLibrary(): string {
	if (process.env.SCLANG_CLASS_LIBRARY) return process.env.SCLANG_CLASS_LIBRARY;
	const sclang = realpathSync(execFileSync('which', ['sclang'], { encoding: 'utf8' }).trim());
	const dir = path.join(
		path.dirname(path.dirname(sclang)),
		'share',
		'SuperCollider',
		'SCClassLibrary'
	);
	if (!existsSync(dir)) {
		throw new Error(`no SCClassLibrary at ${dir}; set SCLANG_CLASS_LIBRARY to its folder`);
	}
	return dir;
}

/** The JSONlib quark that scripts/install_sclang_dependencies.scd installs. */
function jsonlibQuark(): string {
	const data = process.env.XDG_DATA_HOME ?? path.join(os.homedir(), '.local', 'share');
	const dir = path.join(data, 'SuperCollider', 'downloaded-quarks', 'JSONlib');
	if (!existsSync(dir)) {
		throw new Error(
			`no JSONlib quark at ${dir}; run sclang scripts/install_sclang_dependencies.scd`
		);
	}
	return dir;
}

/**
 * The sclang arguments to run script: -l with a configuration that has the
 * class files of the engine package, then the script.
 */
export function sclangArgs(script: string): string[] {
	const yaml = sclangConfig({
		classLibrary: classLibrary(),
		includePaths: [jsonlibQuark(), path.join(engineDir(), 'classes')]
	});
	const conf = path.join(mkdtempSync(path.join(os.tmpdir(), 'flux-sclang-')), 'sclang_conf.yaml');
	writeFileSync(conf, yaml);
	return ['-l', conf, script];
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	const engine = engineDir();
	copyEngine(engine, STATIC_ENGINE_DIR);
	console.log(`Engine from ${engine} in ${STATIC_ENGINE_DIR}/`);
}
