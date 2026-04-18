/**
 * Flux DSL — completion item provider (framework-agnostic).
 *
 * Keep all completion logic here, not inside Monaco API callbacks.
 * This makes the logic independently testable and portable to LSP.
 *
 * The Monaco adapter calls this and maps the results to Monaco's
 * CompletionItem format.
 *
 * Completion is largely static table lookups driven by trigger characters:
 *   '    → offer modifier names (alphabetic order)
 *   "    → offer SynthDef parameter names from metadata.json (prefix-filtered)
 *   [    → offer nothing by default; offer buffer names in sample/slice/cloud context
 *   (    → context-sensitive: instrument synthdefs after note/mono, set-params after set
 *   |    → offer fx("…") patterns
 *   @    → offer decorator names: key, scale, root, octave, cent, buf
 */

import type { IToken } from 'chevrotain';

export type CompletionItemKind = 'keyword' | 'function' | 'property' | 'value' | 'snippet';

export interface CompletionItem {
	label: string;
	/** Insert text. May contain ${1:placeholder} snippet syntax. */
	insertText: string;
	/** True when insertText contains snippet placeholders. */
	isSnippet?: boolean;
	detail?: string;
	documentation?: string;
	kind?: CompletionItemKind;
}

// ---------------------------------------------------------------------------
// Static completion tables
// ---------------------------------------------------------------------------

/** Modifier completions in alphabetic order by base name. */
const MODIFIER_COMPLETIONS: CompletionItem[] = [
	{
		label: 'arp',
		insertText: 'arp',
		detail: "'arp — arpeggiate list values (default \\up)",
		documentation:
			"Collects cycle output, removes duplicates, and traverses in a pattern. Algorithms: \\up, \\down, \\inward, \\outward, \\updown, \\converge, \\diverge. Use 'arp(\\algorithm n) for a length override.",
		kind: 'keyword'
	},
	{
		label: 'arp(algorithm)',
		insertText: 'arp(\\${1:up})',
		isSnippet: true,
		detail: "'arp(algorithm) — arpeggiate with explicit algorithm",
		documentation:
			'Algorithms: \\up (default), \\down, \\inward, \\outward, \\updown, \\converge (alias \\inward), \\diverge (alias \\outward).',
		kind: 'snippet'
	},
	{
		label: 'arp(algorithm n)',
		insertText: 'arp(\\${1:down} ${2:16})',
		isSnippet: true,
		detail: "'arp(algorithm n) — arpeggiate with length override",
		documentation:
			'Produces exactly n values by cycling the natural traversal. n must be a positive integer ≥ 1.',
		kind: 'snippet'
	},
	{
		label: 'at(n)',
		insertText: 'at(${1:1/4})',
		isSnippet: true,
		detail: "'at(n) — phase offset in cycles",
		documentation: 'Offset from next cycle start. Fractions allowed. Applies to all content types.',
		kind: 'snippet'
	},
	{
		label: 'bounce',
		insertText: 'bounce',
		detail: "'bounce — palindrome without repeated endpoints",
		documentation:
			"Appends the reverse with both endpoints removed (ping-pong). [1 2 3]'bounce → [1 2 3 2]. Natural length = 2(N−1). Single-element is a no-op.",
		kind: 'keyword'
	},
	{
		label: 'eager',
		insertText: 'eager',
		detail: "'eager — redraw once per cycle (default)",
		documentation: "Bare 'eager = 'eager(1).",
		kind: 'keyword'
	},
	{
		label: 'eager(n)',
		insertText: 'eager(${1:4})',
		isSnippet: true,
		detail: "'eager(n) — redraw every n cycles",
		documentation: 'n must be a positive integer ≥ 1.',
		kind: 'snippet'
	},
	{
		label: 'legato(x)',
		insertText: 'legato(${1:0.8})',
		isSnippet: true,
		detail: "'legato(x) — gate duration as fraction of event slot",
		documentation: '1.0 = no gap. >1.0 = overlap (pad effect). Can be a generator.',
		kind: 'snippet'
	},
	{
		label: 'lock',
		insertText: 'lock',
		detail: "'lock — freeze value forever",
		documentation:
			'Generator is evaluated once at the first cycle and never redrawn. Inner lock overrides outer eager.',
		kind: 'keyword'
	},
	{
		label: 'maybe',
		insertText: 'maybe',
		detail: "'maybe — pass each event with 50% probability",
		documentation: "Bare 'maybe = 'maybe(0.5).",
		kind: 'keyword'
	},
	{
		label: 'maybe(p)',
		insertText: 'maybe(${1:0.5})',
		isSnippet: true,
		detail: "'maybe(p) — pass each event with probability p",
		documentation: 'p in [0.0, 1.0].',
		kind: 'snippet'
	},
	{
		label: 'mirror',
		insertText: 'mirror',
		detail: "'mirror — palindrome with repeated endpoints",
		documentation:
			"Appends the reverse to the event array (both endpoints repeated). [1 2 3]'mirror → [1 2 3 2 1]. Natural length = 2N−1. Single-element is a no-op.",
		kind: 'keyword'
	},
	{
		label: 'n',
		insertText: 'n',
		detail: "'n — play once",
		documentation: "Bare 'n plays the pattern once.",
		kind: 'keyword'
	},
	{
		label: 'n(count)',
		insertText: 'n(${1:4})',
		isSnippet: true,
		detail: "'n(count) — play n times",
		documentation: 'count must be a positive integer ≥ 1.',
		kind: 'snippet'
	},
	{
		label: 'offset(ms)',
		insertText: 'offset(${1:20})',
		isSnippet: true,
		detail: "'offset(ms) — timing offset in milliseconds",
		documentation: 'Positive = late, negative = early.',
		kind: 'snippet'
	},
	{
		label: 'pick',
		insertText: 'pick',
		detail: "'pick — random element each time (optionally weighted)",
		documentation:
			'Uniform random by default. Use `?n` on elements to assign non-negative weights; unweighted elements default to 1. Like Prand / Pwrand.',
		kind: 'keyword'
	},
	{
		label: 'rev',
		insertText: 'rev',
		detail: "'rev — reverse event array each cycle",
		documentation:
			"Reverses the evaluated event array after traversal. [1 2 3 4]'rev → [4 3 2 1]. Single-element is a no-op.",
		kind: 'keyword'
	},
	{
		label: 'shuf',
		insertText: 'shuf',
		detail: "'shuf — shuffle list then traverse",
		documentation: 'Re-shuffles at cycle boundary. Like Pshuf.',
		kind: 'keyword'
	},
	{
		label: 'stut',
		insertText: 'stut',
		detail: "'stut — repeat each event twice",
		documentation: "Default count = 2. Use 'stut(n) for a custom count.",
		kind: 'keyword'
	},
	{
		label: 'stut(n)',
		insertText: 'stut(${1:2})',
		isSnippet: true,
		detail: "'stut(n) — repeat each event n times",
		documentation: 'n must be a positive integer ≥ 1. Can be a generator.',
		kind: 'snippet'
	},
	{
		label: 'tail(s)',
		insertText: 'tail(${1:4})',
		isSnippet: true,
		detail: "'tail(s) — release FX after s seconds of silence",
		documentation: 'Applies to anonymous insert FX (fx(...)).',
		kind: 'snippet'
	}
];

/**
 * Completions offered after a content type keyword (note/mono/sample/slice/cloud)
 * when the user hasn't opened a `[` yet. Covers generator forms that can appear
 * directly as the pattern body.
 */
const GENERATOR_BODY_COMPLETIONS: CompletionItem[] = [
	{
		label: 'utf8{word}',
		insertText: 'utf8{${1:coffee}}',
		isSnippet: true,
		detail: 'utf8{word} — UTF-8 bytes of a word as a melodic sequence',
		documentation:
			'Converts a bare identifier to its UTF-8 byte values and yields them cyclically. Each character becomes one event. Inspired by "coffee".ascii in SuperCollider.',
		kind: 'snippet'
	}
];

const PIPE_COMPLETIONS: CompletionItem[] = [
	{
		label: 'fx("lpf")\'cutoff(...)',
		insertText: 'fx("lpf")\'cutoff(${1:1200})',
		isSnippet: true,
		detail: 'Insert low-pass filter',
		kind: 'snippet'
	},
	{
		label: 'fx("hpf")\'cutoff(...)',
		insertText: 'fx("hpf")\'cutoff(${1:800})',
		isSnippet: true,
		detail: 'Insert high-pass filter',
		kind: 'snippet'
	},
	{
		label: 'fx("reverb")\'room(...)',
		insertText: 'fx("reverb")\'room(${1:0.5})',
		isSnippet: true,
		detail: 'Insert reverb',
		kind: 'snippet'
	},
	{
		label: 'fx("delay")',
		insertText: 'fx("delay")',
		detail: 'Insert delay',
		kind: 'value'
	}
];

/** Completions inside set(...). */
const SET_PARAM_COMPLETIONS: CompletionItem[] = [
	{
		label: 'scale("...")',
		insertText: 'scale("${1:minor}")',
		isSnippet: true,
		detail: 'Global scale',
		kind: 'snippet'
	},
	{
		label: 'root(n)',
		insertText: 'root(${1:7})',
		isSnippet: true,
		detail: 'Global root (semitones from C)',
		kind: 'snippet'
	},
	{
		label: 'octave(n)',
		insertText: 'octave(${1:5})',
		isSnippet: true,
		detail: 'Global octave',
		kind: 'snippet'
	},
	{
		label: 'tempo(bpm)',
		insertText: 'tempo(${1:120})',
		isSnippet: true,
		detail: 'Global tempo in BPM',
		kind: 'snippet'
	},
	{
		label: 'cent(n)',
		insertText: 'cent(${1:0})',
		isSnippet: true,
		detail: 'Pitch deviation in cents',
		kind: 'snippet'
	},
	{
		label: 'key(root scale)',
		insertText: 'key(${1:g#} ${2:lydian})',
		isSnippet: true,
		detail: 'Compound root + scale',
		kind: 'snippet'
	}
];

/**
 * Decorator completions offered after '@'. Includes key, scale, root, octave, cent, buf.
 * Does NOT include 'set' (that is a top-level keyword, not a decorator).
 */
const DECORATOR_COMPLETIONS: CompletionItem[] = [
	{
		label: 'key',
		insertText: 'key(${1:g#} ${2:minor})',
		isSnippet: true,
		detail: '@key(root scale) — compound pitch context',
		documentation:
			'Sets root, scale, and optionally octave together. Most common way to establish key.\n\n```flux\n@key(g# minor)      // root = G#, scale = minor\n@key(c major)       // root = C, scale = major\n```',
		kind: 'snippet'
	},
	{
		label: 'scale',
		insertText: 'scale(${1:minor})',
		isSnippet: true,
		detail: '@scale(name) — scale only',
		documentation:
			'Scale preset. Common scales: major, minor, dorian, phrygian, lydian, mixolydian, locrian, pentatonic_major, pentatonic_minor, chromatic, whole_tone.',
		kind: 'snippet'
	},
	{
		label: 'root',
		insertText: 'root(${1:7})',
		isSnippet: true,
		detail: '@root(n) — root note (semitones from C)',
		documentation:
			'Root note as semitones from C (0–11). Accepts an integer or a stochastic generator.',
		kind: 'snippet'
	},
	{
		label: 'octave',
		insertText: 'octave(${1:5})',
		isSnippet: true,
		detail: '@octave(n) — octave number',
		documentation: 'Octave number (piano convention). Default: 5.',
		kind: 'snippet'
	},
	{
		label: 'cent',
		insertText: 'cent(${1:10})',
		isSnippet: true,
		detail: '@cent(n) — fine pitch deviation in cents',
		documentation: 'Deviates pitch by n cents (100 cents = 1 semitone). Accepts a generator.',
		kind: 'snippet'
	},
	{
		label: 'buf',
		insertText: 'buf(\\${1:myloop})',
		isSnippet: true,
		detail: '@buf(\\name) — buffer selection for slice/cloud',
		documentation:
			"Specifies which buffer a slice or cloud pattern operates on. Accepts a symbol or sequence generator for per-cycle selection.\n\n```flux\n@buf(\\myloop) slice drums [0 4 8 12]\n@buf([\\loopA \\loopB]'pick) slice drums [0 4]\n```",
		kind: 'snippet'
	}
];

/** Content type keywords offered at the beginning of a line. */
const CONTENT_TYPE_COMPLETIONS: CompletionItem[] = [
	{
		label: 'note',
		insertText: 'note ',
		detail: 'note name [...] — polyphonic pitched events',
		documentation: 'Spawns a new synth instance for each event. Loops indefinitely by default.',
		kind: 'keyword'
	},
	{
		label: 'mono',
		insertText: 'mono ',
		detail: 'mono name [...] — monophonic pitched events',
		documentation:
			'Single persistent synth node; events send set messages instead of spawning new instances.',
		kind: 'keyword'
	},
	{
		label: 'sample',
		insertText: 'sample ',
		detail: 'sample name [\\sym ...] — buffer playback by name',
		documentation: 'Each event is a \\symbol naming a loaded buffer.',
		kind: 'keyword'
	},
	{
		label: 'slice',
		insertText: 'slice ',
		detail: 'slice name [0 4 8 ...] — beat-sliced buffer playback',
		documentation:
			"Each event is an integer slice index. Use @buf(\\name) to select the buffer and 'numSlices(n) to set the grid.",
		kind: 'keyword'
	},
	{
		label: 'cloud',
		insertText: 'cloud ',
		detail: 'cloud name [] — granular synthesis',
		documentation:
			'Persistent granular synth node. The event list is typically empty; parameters controlled via "param notation.',
		kind: 'keyword'
	}
];

// ---------------------------------------------------------------------------
// SynthDef metadata types (exported for use by callers / Monaco adapter)
// ---------------------------------------------------------------------------

export type SynthDefSpecEntry = {
	default?: number;
	min?: number;
	max?: number;
	unit?: string;
	curve?: number | string;
};
export type SynthDefEntry = {
	specs: Record<string, SynthDefSpecEntry>;
	type?: string;
	description?: string;
};
export type SynthDefMetadata = Record<string, SynthDefEntry>;

// ---------------------------------------------------------------------------
// SynthDef parameter completions
// ---------------------------------------------------------------------------

/**
 * Build completion items for `"param` notation.
 *
 * @param synthdefMetadata - The loaded SynthDef metadata (from metadata.json via fetch).
 * @param activeSynthDef - The SynthDef name currently in scope (e.g. "kick"),
 *   or undefined to offer params from all known SynthDefs (deduped).
 * @param prefix - Characters typed after `"`, used for prefix filtering.
 */
function getParamCompletions(
	synthdefMetadata: SynthDefMetadata,
	activeSynthDef?: string,
	prefix = ''
): CompletionItem[] {
	const entries: [string, SynthDefSpecEntry][] = [];

	if (activeSynthDef) {
		// Specific SynthDef requested — return only its params (empty if not found).
		if (activeSynthDef in synthdefMetadata) {
			entries.push(...Object.entries(synthdefMetadata[activeSynthDef].specs));
		}
	} else {
		// No active SynthDef — collect all params across all defs, deduplicated by name.
		const seen = new Set<string>();
		for (const def of Object.values(synthdefMetadata)) {
			for (const [name, spec] of Object.entries(def.specs)) {
				if (!seen.has(name)) {
					seen.add(name);
					entries.push([name, spec]);
				}
			}
		}
	}

	return entries
		.filter(([name]) => name.startsWith(prefix))
		.map(([name, spec]) => {
			const def = spec.default ?? 0;
			const minVal = spec.min ?? 0;
			const maxVal = spec.max ?? 1;
			return {
				label: name,
				insertText: `${name}(\${1:${def}})`,
				isSnippet: true,
				detail: `"${name} — ${spec.unit ? `${spec.unit}, ` : ''}${minVal}–${maxVal}, default ${def}`,
				documentation: `SynthDef parameter. Range: ${minVal}–${maxVal}. Default: ${def}.${spec.unit ? ` Unit: ${spec.unit}.` : ''}`,
				kind: 'property' as CompletionItemKind
			};
		});
}

/**
 * Build completion items for instrument SynthDefs — offered after note( and mono(.
 * Only includes entries with type === 'instrument'.
 */
function getInstrumentSynthDefCompletions(synthdefMetadata: SynthDefMetadata): CompletionItem[] {
	return Object.entries(synthdefMetadata)
		.filter(([, entry]) => entry.type === 'instrument')
		.map(([name, entry]) => ({
			label: name,
			insertText: `\\${name}`,
			detail: entry.description ? entry.description.slice(0, 80) : `SynthDef: ${name}`,
			documentation: entry.description,
			kind: 'value' as CompletionItemKind
		}));
}

/**
 * Build completion items for buffer names — offered after [ in sample/slice/cloud context.
 * Each buffer name gets a \\ prefix in both label and insertText.
 */
function getBufferNameCompletions(bufferNames: string[]): CompletionItem[] {
	return bufferNames.map((name) => ({
		label: `\\${name}`,
		insertText: `\\${name}`,
		detail: 'buffer',
		kind: 'value' as CompletionItemKind
	}));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Return the last token whose end offset is strictly before cursorOffset,
 * i.e. the token immediately to the left of the cursor.
 */
function lastTokenBefore(tokens: IToken[], cursorOffset: number): IToken | undefined {
	for (let i = tokens.length - 1; i >= 0; i--) {
		const t = tokens[i];
		const end = t.endOffset !== undefined ? t.endOffset : t.startOffset + t.image.length - 1;
		if (end < cursorOffset) return t;
	}
	return undefined;
}

/**
 * Determine if the current line context is a sample/slice/cloud pattern.
 * Returns the token type name of the content type keyword found, or undefined.
 */
function findContentTypeKeyword(tokens: IToken[]): string | undefined {
	for (const t of tokens) {
		const name = t.tokenType.name;
		if (['Note', 'Mono', 'Sample', 'Slice', 'Cloud'].includes(name)) {
			return name;
		}
	}
	return undefined;
}

/** Content types that use buffer symbols in their sequence lists. */
const BUFFER_CONTENT_TYPES = new Set(['Sample', 'Slice', 'Cloud']);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Return completion items relevant at the given cursor position.
 *
 * @param tokens - All tokens on the current line, from FluxLexer.tokenize().
 * @param cursorOffset - Character offset of the cursor within the line.
 * @param triggerChar - The character that triggered the completion, or undefined
 *   for an explicit (Ctrl+Space) invocation.
 * @param activeSynthDef - The SynthDef name in scope (e.g. "kick"), used for
 *   `"param` completions. If undefined, all known param names are offered.
 * @param synthdefMetadata - Runtime SynthDef metadata (loaded via fetch from
 *   /compiled_synthdefs/metadata.json). If not provided, param completions are empty.
 * @param bufferNames - Current list of registered buffer names for \symbol completions.
 */
export function getCompletions(
	tokens: IToken[],
	cursorOffset: number,
	triggerChar?: string,
	activeSynthDef?: string,
	synthdefMetadata: SynthDefMetadata = {},
	bufferNames: string[] = []
): CompletionItem[] {
	const prev = lastTokenBefore(tokens, cursorOffset);
	const prevType = prev?.tokenType.name;

	// ' trigger → modifier names (alphabetic)
	if (triggerChar === "'") {
		return MODIFIER_COMPLETIONS;
	}

	// " trigger → SynthDef param names (prefix-filtered as user types)
	if (triggerChar === '"') {
		return getParamCompletions(synthdefMetadata, activeSynthDef);
	}

	// | trigger → fx patterns
	if (triggerChar === '|') {
		return PIPE_COMPLETIONS;
	}

	// @ trigger → decorator names (key, scale, root, octave, cent, buf)
	if (triggerChar === '@') {
		return DECORATOR_COMPLETIONS;
	}

	// [ trigger → context-sensitive
	if (triggerChar === '[') {
		// In sample/slice/cloud context: show buffer names
		const contentType = findContentTypeKeyword(tokens);
		if (contentType && BUFFER_CONTENT_TYPES.has(contentType)) {
			return getBufferNameCompletions(bufferNames);
		}
		// Otherwise: show nothing (per design: no placeholder suggestions)
		return [];
	}

	// ( trigger → context-sensitive argument suggestions
	if (triggerChar === '(') {
		if (prevType === 'Set') return SET_PARAM_COMPLETIONS;
		if (prevType === 'Note' || prevType === 'Mono') {
			return getInstrumentSynthDefCompletions(synthdefMetadata);
		}
		// sample/slice/cloud: no instrument synthdefs apply; return empty
		if (prevType === 'Sample' || prevType === 'Slice' || prevType === 'Cloud') {
			return [];
		}
		return [];
	}

	// Explicit invocation — infer from context
	if (prevType === 'Tick') return MODIFIER_COMPLETIONS;
	if (prevType === 'ParamSigil') return getParamCompletions(synthdefMetadata, activeSynthDef);
	if (prevType === 'Pipe') return PIPE_COMPLETIONS;
	if (prevType === 'At') return DECORATOR_COMPLETIONS;

	// LBracket: show buffer names in sample/slice/cloud context, nothing otherwise
	if (prevType === 'LBracket') {
		const contentType = findContentTypeKeyword(tokens);
		if (contentType && BUFFER_CONTENT_TYPES.has(contentType)) {
			return getBufferNameCompletions(bufferNames);
		}
		return [];
	}

	// After a generator name (Identifier token) — offer top-level body generators
	// e.g. "note lead |cursor|" → suggest utf8{word} and other body forms
	if (prevType === 'Identifier') return GENERATOR_BODY_COMPLETIONS;

	// No tokens / empty line — beginning of line: suggest content type keywords
	if (tokens.length === 0 || prev === undefined) {
		return CONTENT_TYPE_COMPLETIONS;
	}

	return [];
}
