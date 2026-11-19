/**
 * Where the Flux stack stands: md2misc → isospin → flux-engine → Flux, with
 * SuperSonic as the upstream of flux-engine. Run it with `just status`.
 *
 * Part 1 reads GitHub (the main branch of each repository):
 * - the newest version tag, and the number of commits on main since that tag;
 * - the pins: isospin's md2misc submodule, flux-engine's SuperSonic submodule
 *   and the isospin release in its ugens.toml, and the flux-engine release in
 *   Flux's package.json. A pin that is older than the newest release of its
 *   dependency is marked.
 *
 * Part 2 reads the local checkouts: branch, upstream, changed files and
 * submodules. It looks for a checkout in ../<name> and ../../<name> (from
 * the Flux folder), and uses it only when its origin is the repository on
 * GitHub. FLUX_STACK_<NAME>_DIR (for example FLUX_STACK_MD2MISC_DIR) gives
 * another folder. Before it reads a checkout, it fetches origin; use
 * --no-fetch to read the checkouts as they are.
 *
 * The GitHub API allows 60 requests an hour without a token; one run uses
 * six. GH_TOKEN, GITHUB_TOKEN or a `gh` login raise that limit.
 *
 * The exit code is 1 when a lookup failed, else 0.
 */
import { execFile } from 'child_process';
import { existsSync } from 'fs';
import os from 'os';
import path from 'path';
import { pathToFileURL } from 'url';
import { promisify } from 'util';

const run = promisify(execFile);

// ---------------------------------------------------------------------------
// Versions and tags

const VERSION_TAG = /^v?\d+(\.\d+)*(-[a-z]+\.\d+)?$/i;

/** The numbers in a version tag: v0.97.0-flux.2 gives [0, 97, 0, 2]. */
function versionNumbers(tag: string): number[] {
	return (tag.match(/\d+/g) ?? []).map(Number);
}

/** Compares two version tags by their numbers: < 0, 0 or > 0. */
export function compareVersions(a: string, b: string): number {
	const x = versionNumbers(a);
	const y = versionNumbers(b);
	for (let i = 0; i < Math.max(x.length, y.length); i++) {
		const d = (x[i] ?? -1) - (y[i] ?? -1);
		if (d !== 0) return d;
	}
	return 0;
}

/** The highest version tag in tags, or null when no tag is a version. */
export function latestVersionTag(tags: Iterable<string>): string | null {
	const versions = [...tags].filter((t) => VERSION_TAG.test(t)).sort(compareVersions);
	return versions.at(-1) ?? null;
}

/**
 * The commit of each tag in the output of `git ls-remote --tags`. For an
 * annotated tag, the peeled line (`^{}`) gives the commit.
 */
export function parseLsRemoteTags(output: string): Map<string, string> {
	const tags = new Map<string, string>();
	for (const line of output.split('\n')) {
		const m = line.match(/^([0-9a-f]{40})\trefs\/tags\/(.+?)(\^\{\})?$/);
		if (!m) continue;
		const [, sha, name, peeled] = m;
		if (peeled || !tags.has(name)) tags.set(name, sha);
	}
	return tags;
}

/** The highest version tag on commit sha, or null. */
export function tagForCommit(tags: Map<string, string>, sha: string): string | null {
	return latestVersionTag([...tags].filter(([, c]) => c === sha).map(([t]) => t));
}

// ---------------------------------------------------------------------------
// Pins in files

/** The isospin release in flux-engine's ugens.toml, as a tag (v0.5.0). */
export function parseIsospinPin(toml: string): string | null {
	let inIsospin = false;
	for (const raw of toml.split('\n')) {
		const line = raw.trim();
		if (line.startsWith('[')) {
			inIsospin = line === '[isospin]';
			continue;
		}
		const m = inIsospin && line.match(/^version\s*=\s*"([^"]+)"/);
		if (m) return `v${m[1]}`;
	}
	return null;
}

/** The flux-engine release in Flux's package.json, from its release URL. */
export function parseEnginePin(packageJson: string): string | null {
	const pkg = JSON.parse(packageJson);
	const source: unknown = pkg.dependencies?.['flux-engine'] ?? pkg.devDependencies?.['flux-engine'];
	if (typeof source !== 'string') return null;
	return source.match(/\/releases\/download\/([^/]+)\//)?.[1] ?? null;
}

// ---------------------------------------------------------------------------
// Local git state

export interface BranchState {
	branch: string | null;
	upstream: string | null;
	ahead: number;
	behind: number;
	gone: boolean;
}

/** Reads the first line of `git status --porcelain=v1 --branch`. */
export function parseBranchLine(line: string): BranchState {
	const state: BranchState = { branch: null, upstream: null, ahead: 0, behind: 0, gone: false };
	const text = line.replace(/^## /, '');
	if (text.startsWith('HEAD (no branch)')) return state;
	const noCommits = text.match(/^No commits yet on (.+)$/);
	if (noCommits) return { ...state, branch: noCommits[1] };
	const m = text.match(/^(.+?)(?:\.\.\.(\S+))?(?: \[(.+)\])?$/);
	if (!m) return state;
	state.branch = m[1];
	state.upstream = m[2] ?? null;
	for (const part of (m[3] ?? '').split(', ')) {
		const [word, n] = part.split(' ');
		if (word === 'ahead') state.ahead = Number(n);
		if (word === 'behind') state.behind = Number(n);
		if (word === 'gone') state.gone = true;
	}
	return state;
}

export interface SubmoduleState {
	paths: string[];
	/** Checked out at another commit than the pin of the superproject. */
	offPin: string[];
	/** Not initialised. */
	missing: string[];
}

/** Reads the output of `git submodule status`. */
export function parseSubmoduleStatus(output: string): SubmoduleState {
	const state: SubmoduleState = { paths: [], offPin: [], missing: [] };
	for (const line of output.split('\n')) {
		const m = line.match(/^([ +\-U])[0-9a-f]+ (\S+)/);
		if (!m) continue;
		state.paths.push(m[2]);
		if (m[1] === '+') state.offPin.push(m[2]);
		if (m[1] === '-') state.missing.push(m[2]);
	}
	return state;
}

/**
 * Counts the changed files in the output of `git status --porcelain=v1`
 * (without the branch line), and gives the submodules apart.
 */
export function summariseWorkingTree(
	porcelain: string,
	submodules: string[]
): { changedFiles: number; changedSubmodules: string[] } {
	let changedFiles = 0;
	const changedSubmodules: string[] = [];
	for (const line of porcelain.split('\n')) {
		if (line.length < 4) continue;
		const file = line.slice(3);
		if (submodules.includes(file)) changedSubmodules.push(file);
		else changedFiles++;
	}
	return { changedFiles, changedSubmodules };
}

// ---------------------------------------------------------------------------
// Output

const ESC = String.fromCharCode(27);
const ANSI = new RegExp(`${ESC}\\[[0-9;]*m`, 'g');
const useColour = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code: string) => (s: string) => (useColour ? `${ESC}[${code}m${s}${ESC}[0m` : s);
const bold = paint('1');
const dim = paint('2');
const warn = paint('33');
const bad = paint('31');
const good = paint('32');

/** Aligns rows of cells into columns, two spaces apart. */
export function formatTable(rows: string[][]): string {
	const width = (s: string) => s.replace(ANSI, '').length;
	const widths: number[] = [];
	for (const row of rows) row.forEach((c, i) => (widths[i] = Math.max(widths[i] ?? 0, width(c))));
	return rows
		.map((row) =>
			row
				.map((c, i) => c + ' '.repeat(widths[i] - width(c)))
				.join('  ')
				.trimEnd()
		)
		.join('\n');
}

// ---------------------------------------------------------------------------
// The stack

interface Repo {
	name: string;
	slug: string;
	/** In the stack (part 1 and part 2), or only an upstream whose tags are read. */
	own: boolean;
}

const REPOS: Repo[] = [
	{ name: 'md2misc', slug: 'aeskildsen/md2misc', own: true },
	{ name: 'isospin', slug: 'aeskildsen/isospin', own: true },
	{ name: 'flux-engine', slug: 'aeskildsen/flux-engine', own: true },
	{ name: 'flux', slug: 'aeskildsen/flux', own: true },
	{ name: 'SuperSonic', slug: 'samaaron/supersonic', own: false }
];

type PinSource =
	| { kind: 'submodule'; path: string }
	| { kind: 'file'; path: string; parse: (text: string) => string | null };

interface Pin {
	repo: string;
	dependency: string;
	source: PinSource;
}

const PINS: Pin[] = [
	{
		repo: 'isospin',
		dependency: 'md2misc',
		source: { kind: 'submodule', path: 'external/md2misc' }
	},
	{
		repo: 'flux-engine',
		dependency: 'SuperSonic',
		source: { kind: 'submodule', path: 'supersonic' }
	},
	{
		repo: 'flux-engine',
		dependency: 'isospin',
		source: { kind: 'file', path: 'ugens.toml', parse: parseIsospinPin }
	},
	{
		repo: 'flux',
		dependency: 'flux-engine',
		source: { kind: 'file', path: 'package.json', parse: parseEnginePin }
	}
];

const BRANCH = 'main';

async function githubToken(): Promise<string | null> {
	const env = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
	if (env) return env;
	try {
		return (await run('gh', ['auth', 'token'])).stdout.trim() || null;
	} catch {
		return null;
	}
}

async function fetchOk(url: string, headers: Record<string, string> = {}): Promise<Response> {
	const res = await fetch(url, { headers: { 'User-Agent': 'flux-stack-status', ...headers } });
	if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
	return res;
}

function githubApi(token: string | null) {
	return async <T>(slug: string, route: string): Promise<T> => {
		const headers: Record<string, string> = { Accept: 'application/vnd.github+json' };
		if (token) headers.Authorization = `Bearer ${token}`;
		return (await fetchOk(`https://api.github.com/repos/${slug}/${route}`, headers)).json();
	};
}

async function rawFile(slug: string, file: string): Promise<string> {
	return (await fetchOk(`https://raw.githubusercontent.com/${slug}/${BRANCH}/${file}`)).text();
}

async function remoteTags(slug: string): Promise<Map<string, string>> {
	const { stdout } = await run('git', ['ls-remote', '--tags', `https://github.com/${slug}`], {
		env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
		timeout: 30_000
	});
	return parseLsRemoteTags(stdout);
}

/** Gives the value, or the error text when the promise fails. */
async function settle<T>(
	p: Promise<T>
): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
	try {
		return { ok: true, value: await p };
	} catch (e) {
		return { ok: false, error: e instanceof Error ? e.message.split('\n')[0] : String(e) };
	}
}

const tilde = (p: string) => (p.startsWith(os.homedir()) ? '~' + p.slice(os.homedir().length) : p);

/** The local checkout of repo, or null. */
async function findCheckout(repo: Repo, fluxRoot: string): Promise<string | null> {
	const envName = `FLUX_STACK_${repo.name.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_DIR`;
	const candidates = process.env[envName]
		? [path.resolve(process.env[envName]!)]
		: repo.name === 'flux'
			? [fluxRoot]
			: [path.resolve(fluxRoot, '..', repo.name), path.resolve(fluxRoot, '..', '..', repo.name)];
	for (const dir of candidates) {
		if (!existsSync(path.join(dir, '.git'))) continue;
		try {
			const url = (await run('git', ['-C', dir, 'remote', 'get-url', 'origin'])).stdout.trim();
			if (
				url
					.toLowerCase()
					.replace(/\.git$/, '')
					.endsWith(repo.slug.toLowerCase())
			)
				return dir;
		} catch {
			// No origin: not the checkout of this repository.
		}
	}
	return null;
}

interface Problem {
	text: string;
	/** A lookup failed, so the report is not complete. */
	failure?: boolean;
}

async function remotePart(problems: Problem[]): Promise<string> {
	const api = githubApi(await githubToken());
	const tagsOf = new Map(
		await Promise.all(REPOS.map(async (r) => [r.name, await settle(remoteTags(r.slug))] as const))
	);
	const latest = (name: string) => {
		const t = tagsOf.get(name);
		return t?.ok ? latestVersionTag(t.value.keys()) : null;
	};

	const rows: string[][] = [[bold('repository'), bold('release'), bold('main'), bold('pins')]];
	for (const repo of REPOS.filter((r) => r.own)) {
		const tags = tagsOf.get(repo.name)!;
		const release = latest(repo.name);
		let releaseCell: string;
		let mainCell = '';
		if (!tags.ok) {
			releaseCell = bad('?');
			problems.push({ text: `${repo.name}: tags not read (${tags.error})`, failure: true });
		} else if (!release) {
			releaseCell = dim('no release');
		} else {
			releaseCell = release;
			const cmp = await settle(
				api<{ ahead_by: number }>(repo.slug, `compare/${release}...${BRANCH}`)
			);
			if (!cmp.ok) {
				mainCell = bad('?');
				problems.push({ text: `${repo.name}: main not compared (${cmp.error})`, failure: true });
			} else if (cmp.value.ahead_by > 0) {
				const n = cmp.value.ahead_by;
				mainCell = warn(`+${n} unreleased`);
				problems.push({
					text: `${repo.name}: ${n} commit${n === 1 ? '' : 's'} on main since ${release}`
				});
			} else {
				mainCell = good('released');
			}
		}

		const pinCells: string[] = [];
		for (const pin of PINS.filter((p) => p.repo === repo.name)) {
			const depTags = tagsOf.get(pin.dependency)!;
			const value = await settle(
				(async () => {
					if (pin.source.kind === 'file') {
						return pin.source.parse(await rawFile(repo.slug, pin.source.path));
					}
					const entry = await api<{ type: string; sha: string }>(
						repo.slug,
						`contents/${pin.source.path}?ref=${BRANCH}`
					);
					if (entry.type !== 'submodule') throw new Error(`${pin.source.path} is not a submodule`);
					return (depTags.ok && tagForCommit(depTags.value, entry.sha)) || entry.sha.slice(0, 9);
				})()
			);
			if (!value.ok || !value.value) {
				pinCells.push(`${pin.dependency} ${bad('?')}`);
				problems.push({
					text: `${repo.name}: pin of ${pin.dependency} not read${value.ok ? '' : ` (${value.error})`}`,
					failure: true
				});
				continue;
			}
			const newest = latest(pin.dependency);
			if (newest && VERSION_TAG.test(value.value) && compareVersions(value.value, newest) < 0) {
				pinCells.push(`${pin.dependency} ${warn(value.value)} ${dim(`(${newest} out)`)}`);
				problems.push({
					text: `${repo.name} pins ${pin.dependency} ${value.value}; ${newest} is out`
				});
			} else {
				pinCells.push(`${pin.dependency} ${value.value}`);
			}
		}
		rows.push([repo.name, releaseCell, mainCell, pinCells.join(', ')]);
	}
	return formatTable(rows);
}

async function localPart(problems: Problem[], fluxRoot: string, doFetch: boolean): Promise<string> {
	const rows: string[][] = [
		[bold('repository'), bold('checkout'), bold('branch'), bold('working tree')]
	];
	const results = await Promise.all(
		REPOS.filter((r) => r.own).map(async (repo) => {
			const dir = await findCheckout(repo, fluxRoot);
			if (!dir) return [repo.name, dim('not found'), '', ''];
			const git = async (...args: string[]) =>
				(await run('git', ['-C', dir, ...args], { timeout: 60_000 })).stdout;
			if (doFetch) {
				const f = await settle(
					run('git', ['-C', dir, 'fetch', '--quiet', '--prune', 'origin'], {
						timeout: 60_000,
						env: {
							...process.env,
							GIT_TERMINAL_PROMPT: '0',
							GIT_SSH_COMMAND: process.env.GIT_SSH_COMMAND ?? 'ssh -o BatchMode=yes'
						}
					})
				);
				if (!f.ok)
					problems.push({
						text: `${repo.name}: fetch failed, the counts can be old (${f.error})`,
						failure: true
					});
			}
			const [status, subs] = await Promise.all([
				git('status', '--porcelain=v1', '--branch'),
				git('submodule', 'status')
			]);
			const [branchLine, ...rest] = status.split('\n');
			const b = parseBranchLine(branchLine);
			const s = parseSubmoduleStatus(subs);
			const w = summariseWorkingTree(rest.join('\n'), s.paths);

			let branch = b.branch ?? warn('detached');
			if (b.branch && b.branch !== BRANCH) branch = warn(b.branch);
			if (b.gone) {
				branch += ' ' + warn('(upstream gone)');
				problems.push({
					text: `${repo.name}: branch ${b.branch} is gone on origin; its work is merged or dropped`
				});
			} else if (!b.upstream && b.branch) {
				branch += ' ' + dim('(no upstream)');
			} else {
				if (b.ahead) branch += ' ' + warn(`↑${b.ahead}`);
				if (b.behind) {
					branch += ' ' + warn(`↓${b.behind}`);
					problems.push({ text: `${repo.name}: ${b.branch} is ${b.behind} behind ${b.upstream}` });
				}
			}

			const tree: string[] = [];
			if (w.changedFiles) tree.push(warn(`${w.changedFiles} changed`));
			for (const p of s.offPin) {
				tree.push(bad(`${p} off its pin`));
				problems.push({ text: `${repo.name}: submodule ${p} is not at its pin` });
			}
			for (const p of s.missing) tree.push(warn(`${p} not checked out`));
			const changedOnly = w.changedSubmodules.filter((p) => !s.offPin.includes(p));
			if (changedOnly.length) tree.push(dim(`changes in ${changedOnly.join(', ')}`));
			return [repo.name, tilde(dir), branch, tree.length ? tree.join(', ') : good('clean')];
		})
	);
	rows.push(...results);
	return formatTable(rows);
}

async function main() {
	const fluxRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
	const doFetch = !process.argv.includes('--no-fetch');
	const remoteProblems: Problem[] = [];
	const localProblems: Problem[] = [];
	const [remote, local] = await Promise.all([
		remotePart(remoteProblems),
		localPart(localProblems, fluxRoot, doFetch)
	]);
	const problems = [...remoteProblems, ...localProblems];

	console.log(bold(`GitHub (${BRANCH})`));
	console.log(remote);
	console.log();
	console.log(bold(`Local checkouts${doFetch ? '' : ' (not fetched)'}`));
	console.log(local);
	console.log();
	if (problems.length) {
		console.log(bold('Attention'));
		for (const p of problems) console.log(`- ${p.text}`);
	} else {
		console.log(good('All released, all pins current, all checkouts clean.'));
	}
	process.exitCode = problems.some((p) => p.failure) ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	await main();
}
