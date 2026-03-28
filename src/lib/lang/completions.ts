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
 *   '    → offer modifier names: lock, eager, stut, legato, at, repeat, mono, tail, offset, …
 *   [    → offer generators, scale degrees, literals
 *   (    → context-sensitive: synthdef names after loop/line/fx("…"), arg values after modifiers
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
		detail: "'at(n) — start time offset in cycles (for line)",
		documentation: 'Offset from next cycle start. Fractions allowed.',
		kind: 'snippet'
	},
	{
		label: 'repeat',
		insertText: 'repeat',
		detail: "'repeat — repeat indefinitely",
		kind: 'keyword'
	},
	{
		label: 'repeat(n)',
		insertText: 'repeat(${1:4})',
		isSnippet: true,
		detail: "'repeat(n) — repeat n times",
		documentation: 'n must be a positive integer ≥ 1.',
		kind: 'snippet'
	},
	{
		label: 'mono',
		insertText: 'mono',
		detail: "'mono — monophonic mode",
		documentation: 'Single synth node; events send set messages instead of new instances.',
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
		label: 'pick',
		insertText: 'pick',
		detail: "'pick — random element each time",
		documentation: 'Like Prand.',
		kind: 'keyword'
	},
	{
		label: 'wran',
		insertText: 'wran',
		detail: "'wran — weighted random selection",
		documentation: 'Use ?weight on elements to assign relative weights.',
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

/** Synthdef / FX names offered inside loop("..."), line("..."), fx("..."). */
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
		label: 'mtranspose(n)',
		insertText: 'mtranspose(${1:0})',
		isSnippet: true,
		detail: 'Modal transposition in scale steps',
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
 */
export function getCompletions(
	tokens: IToken[],
	cursorOffset: number,
	triggerChar?: string
): CompletionItem[] {
	const prev = lastTokenBefore(tokens, cursorOffset);
	const prevType = prev?.tokenType.name;

	// ' trigger → modifier names
	if (triggerChar === "'") {
		return MODIFIER_COMPLETIONS;
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
		if (prevType && ['Loop', 'Line', 'Fx', 'SendFx', 'MasterFx'].includes(prevType)) {
			return FX_NAME_COMPLETIONS;
		}
		return [];
	}

	// Explicit invocation — infer from context
	if (prevType === 'Tick') return MODIFIER_COMPLETIONS;
	if (prevType === 'Pipe') return PIPE_COMPLETIONS;
	if (prevType === 'LBracket') return SEQUENCE_BODY_COMPLETIONS;

	return [];
}
