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
 *   '    → offer modifier names: lock, eager, stut, legato, at, n, tail, offset, …
 *   "    → offer SynthDef parameter names from metadata.json (prefix-filtered)
 *   [    → offer generators, scale degrees, literals
 *   (    → context-sensitive: synthdef names after note/mono/sample/slice/cloud/fx("…"), arg values after modifiers
 *   |    → offer fx("…") patterns
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

const MODIFIER_COMPLETIONS: CompletionItem[] = [
	{
		label: 'lock',
		insertText: 'lock',
		detail: "'lock — freeze value forever",
		documentation:
			'Generator is evaluated once at the first cycle and never redrawn. Inner lock overrides outer eager.',
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
		label: 'legato(x)',
		insertText: 'legato(${1:0.8})',
		isSnippet: true,
		detail: "'legato(x) — gate duration as fraction of event slot",
		documentation: '1.0 = no gap. >1.0 = overlap (pad effect). Can be a generator.',
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
		label: 'at(n)',
		insertText: 'at(${1:1/4})',
		isSnippet: true,
		detail: "'at(n) — phase offset in cycles",
		documentation: 'Offset from next cycle start. Fractions allowed. Applies to all content types.',
		kind: 'snippet'
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
		label: 'shuf',
		insertText: 'shuf',
		detail: "'shuf — shuffle list then traverse",
		documentation: 'Re-shuffles at cycle boundary. Like Pshuf.',
		kind: 'keyword'
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
		label: 'tail(s)',
		insertText: 'tail(${1:4})',
		isSnippet: true,
		detail: "'tail(s) — release FX after s seconds of silence",
		documentation: 'Applies to anonymous insert FX (fx(...)).',
		kind: 'snippet'
	}
];

const SEQUENCE_BODY_COMPLETIONS: CompletionItem[] = [
	{
		label: '0 2 4 7',
		insertText: '0 2 4 7]',
		detail: 'Major chord degrees',
		kind: 'value'
	},
	{
		label: '0 2 4',
		insertText: '0 2 4]',
		detail: 'Triad',
		kind: 'value'
	},
	{
		label: '0 1 2 3',
		insertText: '0 1 2 3]',
		detail: 'Four steps',
		kind: 'value'
	},
	{
		label: '0 2 4 5 7 9 11',
		insertText: '0 2 4 5 7 9 11]',
		detail: 'Full major scale',
		kind: 'value'
	},
	{
		label: '0rand7',
		insertText: '0rand7]',
		detail: 'Random degree (integer)',
		kind: 'snippet'
	},
	{
		label: '0rand7 4rand6',
		insertText: '0rand7 4rand6]',
		detail: 'Two random degrees',
		kind: 'snippet'
	},
	{
		label: '[2 3] sublists',
		insertText: '0 1 [2 3] 4]',
		detail: 'Sublist for rhythmic subdivision',
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

/** Synthdef / FX names offered inside note("..."), mono("..."), fx("..."), etc. */
const FX_NAME_COMPLETIONS: CompletionItem[] = [
	{ label: 'lpf', insertText: 'lpf', detail: 'Low-pass filter', kind: 'value' },
	{ label: 'hpf', insertText: 'hpf', detail: 'High-pass filter', kind: 'value' },
	{ label: 'reverb', insertText: 'reverb', detail: 'Reverb', kind: 'value' },
	{ label: 'delay', insertText: 'delay', detail: 'Delay', kind: 'value' },
	{ label: 'distortion', insertText: 'distortion', detail: 'Distortion', kind: 'value' },
	{ label: 'compressor', insertText: 'compressor', detail: 'Compressor', kind: 'value' },
	{ label: 'limiter', insertText: 'limiter', detail: 'Limiter', kind: 'value' },
	{ label: 'chorus', insertText: 'chorus', detail: 'Chorus', kind: 'value' },
	{ label: 'flanger', insertText: 'flanger', detail: 'Flanger', kind: 'value' },
	{ label: 'bitcrusher', insertText: 'bitcrusher', detail: 'Bitcrusher', kind: 'value' }
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

// ---------------------------------------------------------------------------
// SynthDef metadata types (exported for use by callers / Monaco adapter)
// ---------------------------------------------------------------------------

export type SynthDefSpecEntry = {
	default: number;
	min: number;
	max: number;
	unit: string;
	curve: number;
};
export type SynthDefEntry = { specs: Record<string, SynthDefSpecEntry> };
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
		.map(([name, spec]) => ({
			label: name,
			insertText: `${name}(\${1:${spec.default}})`,
			isSnippet: true,
			detail: `"${name} — ${spec.unit ? `${spec.unit}, ` : ''}${spec.min}–${spec.max}, default ${spec.default}`,
			documentation: `SynthDef parameter. Range: ${spec.min}–${spec.max}. Default: ${spec.default}.${spec.unit ? ` Unit: ${spec.unit}.` : ''}`,
			kind: 'property' as CompletionItemKind
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
 */
export function getCompletions(
	tokens: IToken[],
	cursorOffset: number,
	triggerChar?: string,
	activeSynthDef?: string,
	synthdefMetadata: SynthDefMetadata = {}
): CompletionItem[] {
	const prev = lastTokenBefore(tokens, cursorOffset);
	const prevType = prev?.tokenType.name;

	// ' trigger → modifier names
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

	// [ trigger → sequence body suggestions
	if (triggerChar === '[') {
		return SEQUENCE_BODY_COMPLETIONS;
	}

	// ( trigger → context-sensitive argument suggestions
	if (triggerChar === '(') {
		if (prevType === 'Set') return SET_PARAM_COMPLETIONS;
		if (
			prevType &&
			['Note', 'Mono', 'Sample', 'Slice', 'Cloud', 'Fx', 'SendFx', 'MasterFx'].includes(prevType)
		) {
			return FX_NAME_COMPLETIONS;
		}
		return [];
	}

	// Explicit invocation — infer from context
	if (prevType === 'Tick') return MODIFIER_COMPLETIONS;
	if (prevType === 'ParamSigil') return getParamCompletions(synthdefMetadata, activeSynthDef);
	if (prevType === 'Pipe') return PIPE_COMPLETIONS;
	if (prevType === 'LBracket') return SEQUENCE_BODY_COMPLETIONS;

	return [];
}
