// The identity of the running build: which Flux code and which engine are
// live. The page shows it with a link to the source of that commit (Flux and
// its engine are AGPL-3.0-or-later; network users get the source).

export interface BuildInfo {
	/** The version in package.json. */
	version: string;
	/** True for a build of the Vite dev server. */
	dev: boolean;
	/** The full commit SHA, or null when git and CI do not give one. */
	commit: string | null;
	/** True when the working tree had changes that are not committed. */
	dirty: boolean;
	/** The version line of the engine package BUILDINFO, or null. */
	engine: string | null;
}

export const REPOSITORY_URL = 'https://github.com/aeskildsen/flux';

/** One line, for example "flux 0.2.0 · a1b2c3d · engine 0.91.0-flux.1". */
export function buildLabel(info: BuildInfo): string {
	const version = info.dev ? `${info.version}-dev` : info.version;
	const commit = info.commit
		? `${info.commit.slice(0, 7)}${info.dirty ? '-dirty' : ''}`
		: 'no commit';
	return `flux ${version} · ${commit} · engine ${info.engine ?? 'unknown'}`;
}

/** The source tree of the built commit on GitHub, else the repository. */
export function sourceURL(info: BuildInfo): string {
	return info.commit ? `${REPOSITORY_URL}/tree/${info.commit}` : REPOSITORY_URL;
}

// vite.config.ts sets __FLUX_BUILD__ from scripts/build-info.ts.
export const buildInfo: BuildInfo = __FLUX_BUILD__;
