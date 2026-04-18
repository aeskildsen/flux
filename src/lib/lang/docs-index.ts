/**
 * Flux DSL — runtime documentation loader.
 *
 * Imports the reference markdown files at build time via Vite's `?raw` import
 * suffix and indexes them by heading so the hover provider can serve
 * documentation from a single source of truth (the docs themselves).
 *
 * Indexing rules:
 *  - We consider any heading (`#` … `####`) that begins with a backtick
 *    run, e.g. `` ### `'stut(n)` — stutter ``.
 *  - The key is the token inside the first backtick pair, stripped of any
 *    argument suffix — `'stut(n)` → `'stut`, `@key` → `@key`, `note` → `note`.
 *  - The section body is the text between that heading and the next heading
 *    at the same-or-shallower level.
 *  - The body is trimmed to "first paragraph + first fenced code block" so
 *    hovers stay compact.
 *
 * The hardcoded tables in `hover.ts` remain the source for token-type level
 * docs (e.g. `Integer`, `LBracket`) that have no matching heading. When a
 * doc-sourced entry is available we prefer it.
 */
// Vite `?raw` suffix delivers the file contents as a string at build time.
import modifiersMd from '../../../docs/modifiers.md?raw';
import decoratorsMd from '../../../docs/decorators.md?raw';
import generatorsMd from '../../../docs/generators.md?raw';
import paramsMd from '../../../docs/params.md?raw';
import contentTypesMd from '../../../docs/content-types.md?raw';
import synthdefsMd from '../../../docs/synthdefs.md?raw';
import buffersMd from '../../../docs/buffers.md?raw';

/**
 * All loaded raw docs. Exposed as a tuple of (name, text) pairs for testing.
 */
export const DOC_SOURCES: Array<[string, string]> = [
	['modifiers', modifiersMd],
	['decorators', decoratorsMd],
	['generators', generatorsMd],
	['params', paramsMd],
	['content-types', contentTypesMd],
	['synthdefs', synthdefsMd],
	['buffers', buffersMd]
];

export interface DocSection {
	/** The source doc file (without extension). */
	source: string;
	/** The full heading line (e.g. "### `'stut(n)` — stutter"). */
	heading: string;
	/** Markdown body (already trimmed to first paragraph + first code block). */
	body: string;
}

/**
 * Build the lookup key for a heading.
 *
 * We look for the first `` `...` `` run in the heading text and strip any
 * trailing call-argument parentheses. Examples:
 *
 *   "### `'stut(n)` — stutter"            → "'stut"
 *   "### `'lock` — freeze forever"        → "'lock"
 *   "### `@key` — compound pitch context" → "@key"
 *   "## `note` — polyphonic …"            → "note"
 *   "### Linear series `step`"            → "step"
 *   "### White noise `rand` / `~`"        → "rand" (and "~" as a second key)
 *
 * Returns null when the heading has no code span.
 */
function extractKeys(heading: string): string[] {
	// Match each `...` run in the heading.
	const runs = Array.from(heading.matchAll(/`([^`]+)`/g)).map((m) => m[1]);
	if (runs.length === 0) return [];

	const keys: string[] = [];
	for (const raw of runs) {
		// Drop call/brace/bracket argument suffix:
		//   "'stut(n)"    → "'stut"
		//   "utf8{word}"  → "utf8"
		//   "'arp(\\up)"  → "'arp"
		const key = raw.replace(/[({\[].*[)}\]]$/, '').trim();
		// Skip synthetic forms like `[...]`, `<...>` — not hover targets
		if (/^[\[<(]/.test(key)) continue;
		if (key.length === 0) continue;
		keys.push(key);
	}
	// Deduplicate while preserving order
	return [...new Set(keys)];
}

/**
 * Heading-line pattern. Captures the marker (#'s) and the remainder.
 */
const HEADING_RE = /^(#{1,6})\s+(.*)$/;

/**
 * Trim a section body to "first paragraph + first fenced code block".
 * Keeps the first paragraph of prose followed by the first ```…``` block
 * that appears close to it (up to 40 body lines scanned).
 *
 * The result is enough to answer "what does this token do?" without
 * overwhelming the hover popup.
 */
function trimBody(body: string): string {
	const lines = body.split('\n');
	// Skip leading blank lines
	let i = 0;
	while (i < lines.length && lines[i].trim() === '') i++;

	// Read first paragraph
	const paragraph: string[] = [];
	while (i < lines.length && lines[i].trim() !== '') {
		paragraph.push(lines[i]);
		i++;
	}
	// Skip blank lines
	while (i < lines.length && lines[i].trim() === '') i++;

	// Optionally read first fenced code block that appears within the next
	// 40 lines of body content.
	const code: string[] = [];
	const lookahead = Math.min(lines.length, i + 40);
	let j = i;
	while (j < lookahead) {
		if (lines[j].trim().startsWith('```')) {
			code.push(lines[j]);
			j++;
			while (j < lines.length && !lines[j].trim().startsWith('```')) {
				code.push(lines[j]);
				j++;
			}
			if (j < lines.length) {
				code.push(lines[j]); // closing fence
			}
			break;
		}
		j++;
	}

	const parts = [paragraph.join('\n').trim()];
	if (code.length > 0) parts.push(code.join('\n'));
	return parts.filter((s) => s.length > 0).join('\n\n');
}

/**
 * Parse a single doc file into a list of { heading, body } sections.
 * Each section's body is everything from immediately after the heading until
 * the next heading at the same-or-shallower level.
 */
function parseSections(source: string, text: string): DocSection[] {
	const lines = text.split('\n');
	const sections: DocSection[] = [];

	type Open = { level: number; heading: string; start: number };
	const stack: Open[] = [];

	const close = (upToLevel: number, endLine: number) => {
		while (stack.length > 0 && stack[stack.length - 1].level >= upToLevel) {
			const top = stack.pop()!;
			const body = lines.slice(top.start, endLine).join('\n');
			sections.push({ source, heading: top.heading, body: trimBody(body) });
		}
	};

	for (let k = 0; k < lines.length; k++) {
		const m = lines[k].match(HEADING_RE);
		if (!m) continue;
		const level = m[1].length;
		close(level, k);
		stack.push({ level, heading: lines[k], start: k + 1 });
	}
	close(0, lines.length);

	return sections;
}

/**
 * Build the master key → DocSection index.
 *
 * A key may map to multiple candidate sections if the same token is
 * documented in more than one doc file (e.g. `'at` appears in both
 * modifiers.md and content-types.md). The first registered wins — order is
 * determined by DOC_SOURCES, so modifiers/generators/params take precedence
 * over the more overview-flavoured content-types/synthdefs/buffers.
 */
function buildIndex(): Map<string, DocSection> {
	const idx = new Map<string, DocSection>();
	for (const [name, text] of DOC_SOURCES) {
		const sections = parseSections(name, text);
		for (const section of sections) {
			const keys = extractKeys(section.heading);
			for (const key of keys) {
				if (!idx.has(key)) idx.set(key, section);
			}
		}
	}
	return idx;
}

let _index: Map<string, DocSection> | null = null;

function getIndex(): Map<string, DocSection> {
	if (_index === null) _index = buildIndex();
	return _index;
}

/**
 * Look up a doc section by key.
 *
 * @param key - Hover key. See extractKeys() for the canonical form. Callers
 *   should include the sigil when applicable (`'stut`, `@buf`). Plain words
 *   (`note`, `rand`, `utf8`) are also valid.
 * @returns The matching DocSection or null if none is registered.
 */
export function lookupDocSection(key: string): DocSection | null {
	return getIndex().get(key) ?? null;
}

/**
 * Render a DocSection to a hover-ready markdown string. Combines a small
 * leading header derived from the heading with the trimmed body.
 */
export function renderDocSection(section: DocSection): string {
	// Strip leading '#'s and spaces from the heading to produce a bold summary.
	const cleanHeading = section.heading.replace(/^#{1,6}\s+/, '').trim();
	return `**${cleanHeading}**\n\n${section.body}`.trim();
}

/**
 * Convenience: look up and render in one call.
 */
export function getDocMarkdown(key: string): string | null {
	const section = lookupDocSection(key);
	return section ? renderDocSection(section) : null;
}

// ---------------------------------------------------------------------------
// Testing hooks
// ---------------------------------------------------------------------------

/** Reset the memoised index. Only used by tests. */
export function _resetDocIndex(): void {
	_index = null;
}

/** Exported for tests — re-parse a specific doc string. */
export function _parseSectionsForTest(source: string, text: string): DocSection[] {
	return parseSections(source, text);
}

/** Exported for tests — extract keys from a heading line. */
export function _extractKeysForTest(heading: string): string[] {
	return extractKeys(heading);
}
