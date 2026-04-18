/**
 * completions.ts unit tests.
 *
 * getCompletions(tokens, cursorOffset, triggerChar) is a pure function that
 * maps tokens + cursor context to CompletionItem[].  We use FluxLexer to
 * produce real token arrays so the tests stay close to real editor conditions.
 *
 * Cursor offsets are set to one-past-the-end of the relevant token so
 * lastTokenBefore() selects the right token.
 */

import { describe, it, expect } from 'vitest';
import { FluxLexer } from './lexer.js';
import { getCompletions, findActiveSynthDef } from './completions.js';
import type { CompletionItem, SynthDefMetadata } from './completions.js';

// Inline fixture matching static/compiled_synthdefs/metadata.json shape
const TEST_METADATA: SynthDefMetadata = {
	kick: {
		specs: {
			amp: { default: 0.1, min: 0, max: 1, unit: 'amp', curve: 4 },
			pan: { default: 0, min: -1, max: 1, unit: '', curve: 2 },
			rel: { default: 0.2, min: 0.001, max: 4, unit: 'seconds', curve: 4 }
		},
		type: 'instrument',
		contentTypes: ['note', 'mono']
	},
	fm: {
		specs: {
			amp: { default: 0.2, min: 0, max: 1, unit: 'amp', curve: 4 },
			freq: { default: 440, min: 20, max: 20000, unit: 'Hz', curve: 4 },
			pan: { default: 0, min: -1, max: 1, unit: '', curve: 2 }
		},
		type: 'instrument',
		contentTypes: ['note', 'mono']
	},
	sliceplayer: {
		specs: {
			amp: { default: 0.5, min: 0, max: 1, unit: 'amp', curve: 4 }
		},
		type: 'fx'
		// No contentTypes — fx defs are invoked via | fx(\…), not content keywords.
	},
	// A hypothetical sample-only instrument used to verify content-type filtering.
	chopper: {
		specs: {
			amp: { default: 0.5, min: 0, max: 1, unit: 'amp', curve: 4 }
		},
		type: 'instrument',
		contentTypes: ['sample']
	}
};

// ---------------------------------------------------------------------------
// Helper — tokenize a snippet and return tokens
// ---------------------------------------------------------------------------

function tokenize(src: string) {
	return FluxLexer.tokenize(src).tokens;
}

/** Cursor positioned at the very end of the source string. */
function endCursor(src: string) {
	return src.length;
}

/**
 * Cursor positioned just before the last character of src.
 * Used for trigger-character tests: the trigger char has been typed but the
 * cursor semantics in completions.ts expect the offset to be AT the trigger,
 * not after it (lastTokenBefore uses strict-less-than comparison).
 */
function triggerCursor(src: string) {
	return src.length - 1;
}

// ---------------------------------------------------------------------------
// 1. Trigger character: '
// ---------------------------------------------------------------------------

describe("getCompletions — trigger: '", () => {
	it('returns modifier completions for trigger char "\'"', () => {
		const tokens = tokenize("note [0 2]'");
		const items = getCompletions(tokens, endCursor("note [0 2]'"), "'");
		expect(items.length).toBeGreaterThan(0);
	});

	it("modifier completions include 'lock'", () => {
		const tokens = tokenize("note [0]'");
		const items = getCompletions(tokens, endCursor("note [0]'"), "'");
		expect(items.some((i: CompletionItem) => i.label === 'lock')).toBe(true);
	});

	it("modifier completions include 'stut'", () => {
		const tokens = tokenize("note [0]'");
		const items = getCompletions(tokens, endCursor("note [0]'"), "'");
		expect(items.some((i: CompletionItem) => i.label === 'stut(n)')).toBe(true);
	});

	it("modifier completions include 'eager(n)' snippet", () => {
		const tokens = tokenize("note [0]'");
		const items = getCompletions(tokens, endCursor("note [0]'"), "'");
		expect(items.some((i: CompletionItem) => i.label === 'eager(n)')).toBe(true);
	});

	it("modifier completions include 'maybe'", () => {
		const tokens = tokenize("note [0]'");
		const items = getCompletions(tokens, endCursor("note [0]'"), "'");
		expect(items.some((i: CompletionItem) => i.label === 'maybe(p)')).toBe(true);
	});

	it("modifier completions include 'numSlices(n)'", () => {
		const tokens = tokenize("slice drums [0]'");
		const items = getCompletions(tokens, endCursor("slice drums [0]'"), "'");
		const numSlices = items.find((i: CompletionItem) => i.label === 'numSlices(n)');
		expect(numSlices).toBeDefined();
		expect(numSlices?.isSnippet).toBe(true);
		expect(numSlices?.insertText).toContain('${');
		expect(numSlices?.kind).toBe('snippet');
	});

	it('modifier completions are in alphabetic order', () => {
		const items = getCompletions([], 0, "'");
		// Extract unique base labels (e.g. 'arp' from 'arp', 'arp(algorithm)', etc.)
		const labels = items.map((i) => i.label);
		// Check that sorted equals original for the first word of each label
		const baseLabels = labels.map((l) => l.split('(')[0]);
		const sorted = [...baseLabels].sort();
		// Allow grouping by name (same base label adjacent)
		// Just verify the labels start with ascending letters
		const firstChars = baseLabels.filter((v, i, a) => a.indexOf(v) === i);
		const sortedFirstChars = [...firstChars].sort();
		expect(firstChars).toEqual(sortedFirstChars);
	});
});

// ---------------------------------------------------------------------------
// 1aa. findActiveSynthDef — token-walk helper
// ---------------------------------------------------------------------------

describe('findActiveSynthDef', () => {
	it('returns the synthdef name from note(\\fm)', () => {
		const src = 'note(\\fm) lead [0 1 2]"';
		const tokens = tokenize(src);
		expect(findActiveSynthDef(tokens, src.length)).toBe('fm');
	});

	it('returns the synthdef name from mono(\\kick)', () => {
		const src = 'mono(\\kick) bass [0]"';
		const tokens = tokenize(src);
		expect(findActiveSynthDef(tokens, src.length)).toBe('kick');
	});

	it('returns the synthdef name from sample(\\oneshot)', () => {
		const src = 'sample(\\oneshot) drums [\\kick]"';
		const tokens = tokenize(src);
		expect(findActiveSynthDef(tokens, src.length)).toBe('oneshot');
	});

	it('returns undefined when no content-type selection is present', () => {
		const src = 'note lead [0 1 2]"';
		const tokens = tokenize(src);
		expect(findActiveSynthDef(tokens, src.length)).toBeUndefined();
	});

	it('returns undefined for an empty line', () => {
		expect(findActiveSynthDef([], 0)).toBeUndefined();
	});

	it('picks the nearest selection when multiple could apply', () => {
		// Unlikely real-world input, but verifies we walk right-to-left.
		const src = 'note(\\fm) a | note(\\kick) b"';
		const tokens = tokenize(src);
		// The nearest walking backward from the end is kick.
		expect(findActiveSynthDef(tokens, src.length)).toBe('kick');
	});
});

// ---------------------------------------------------------------------------
// 1b. Trigger character: " (param sigil)
// ---------------------------------------------------------------------------

describe('getCompletions — trigger: "', () => {
	it("returns param completions for trigger char '\"'", () => {
		const tokens = tokenize('note [0 2]"');
		const items = getCompletions(tokens, endCursor('note [0 2]"'), '"', undefined, TEST_METADATA);
		expect(items.length).toBeGreaterThan(0);
	});

	it('param completions include "amp" from kick SynthDef when activeSynthDef = "kick"', () => {
		const tokens = tokenize('note [0 2]"');
		const items = getCompletions(tokens, endCursor('note [0 2]"'), '"', 'kick', TEST_METADATA);
		expect(items.some((i: CompletionItem) => i.label === 'amp')).toBe(true);
	});

	it('param completions include "pan" and "rel" for kick', () => {
		const tokens = tokenize('note [0]"');
		const items = getCompletions(tokens, endCursor('note [0]"'), '"', 'kick', TEST_METADATA);
		expect(items.some((i: CompletionItem) => i.label === 'pan')).toBe(true);
		expect(items.some((i: CompletionItem) => i.label === 'rel')).toBe(true);
	});

	it('param completions are snippet items with default value', () => {
		const items = getCompletions([], 0, '"', 'kick', TEST_METADATA);
		const amp = items.find((i: CompletionItem) => i.label === 'amp');
		expect(amp).toBeDefined();
		expect(amp?.isSnippet).toBe(true);
		expect(amp?.insertText).toContain('${1:');
	});

	it('param completions include detail with range info', () => {
		const items = getCompletions([], 0, '"', 'kick', TEST_METADATA);
		const amp = items.find((i: CompletionItem) => i.label === 'amp');
		expect(amp?.detail).toContain('amp');
	});

	it('with no activeSynthDef, returns params from all known synthdefs', () => {
		const items = getCompletions([], 0, '"', undefined, TEST_METADATA);
		expect(items.length).toBeGreaterThan(0);
	});

	it('returns empty array for unknown activeSynthDef', () => {
		const items = getCompletions([], 0, '"', 'nonexistent_synth', TEST_METADATA);
		expect(items).toHaveLength(0);
	});

	it('returns empty array when no metadata provided', () => {
		const items = getCompletions([], 0, '"');
		expect(items).toHaveLength(0);
	});

	it('infers activeSynthDef from note(\\fm) — only fm params are offered', () => {
		const src = 'note(\\fm) lead [0 1]"';
		const tokens = tokenize(src);
		// Caller passes activeSynthDef=undefined — inference must kick in.
		const items = getCompletions(tokens, src.length, '"', undefined, TEST_METADATA);
		// fm has freq; kick does not. If filtering works, freq appears.
		expect(items.some((i) => i.label === 'freq')).toBe(true);
		// kick has `rel`; fm does not. rel must NOT appear.
		expect(items.some((i) => i.label === 'rel')).toBe(false);
	});

	it('infers activeSynthDef from mono(\\kick) — only kick params are offered', () => {
		const src = 'mono(\\kick) bass [0]"';
		const tokens = tokenize(src);
		const items = getCompletions(tokens, src.length, '"', undefined, TEST_METADATA);
		expect(items.some((i) => i.label === 'rel')).toBe(true);
		expect(items.some((i) => i.label === 'freq')).toBe(false);
	});

	it('explicit activeSynthDef argument wins over inferred value', () => {
		// Line mentions note(\fm) but caller insists on kick.
		const src = 'note(\\fm) lead [0]"';
		const tokens = tokenize(src);
		const items = getCompletions(tokens, src.length, '"', 'kick', TEST_METADATA);
		// kick's specs: amp, pan, rel. fm-only params like freq must not appear.
		expect(items.some((i) => i.label === 'rel')).toBe(true);
		expect(items.some((i) => i.label === 'freq')).toBe(false);
	});

	it('falls back to all synthdefs when line has no content-type selection', () => {
		const src = 'note lead [0]"';
		const tokens = tokenize(src);
		const items = getCompletions(tokens, src.length, '"', undefined, TEST_METADATA);
		// Union mode — freq (from fm) and rel (from kick) both present.
		expect(items.some((i) => i.label === 'freq')).toBe(true);
		expect(items.some((i) => i.label === 'rel')).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// 2. Trigger character: |
// ---------------------------------------------------------------------------

describe('getCompletions — trigger: |', () => {
	it('returns pipe/fx completions for trigger char "|"', () => {
		const tokens = tokenize('note [0]|');
		const items = getCompletions(tokens, endCursor('note [0]|'), '|');
		expect(items.length).toBeGreaterThan(0);
	});

	it('pipe completions include an fx("lpf") entry', () => {
		const tokens = tokenize('note [0]|');
		const items = getCompletions(tokens, endCursor('note [0]|'), '|');
		expect(items.some((i: CompletionItem) => i.label.includes('lpf'))).toBe(true);
	});

	it('pipe completions include an fx("reverb") entry', () => {
		const tokens = tokenize('note [0]|');
		const items = getCompletions(tokens, endCursor('note [0]|'), '|');
		expect(items.some((i: CompletionItem) => i.label.includes('reverb'))).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// 3. Trigger character: [ — shows NOTHING (per design decision)
// ---------------------------------------------------------------------------

describe('getCompletions — trigger: [ (default: no suggestions)', () => {
	it('returns empty array for trigger char "[" with no context', () => {
		const items = getCompletions([], 0, '[');
		expect(items).toHaveLength(0);
	});

	it('returns empty array for trigger char "[" after note context (pitch patterns only)', () => {
		const src = 'note lead [';
		const tokens = tokenize(src);
		const items = getCompletions(tokens, triggerCursor(src), '[');
		expect(items).toHaveLength(0);
	});

	it('returns empty array when prev token is LBracket (explicit invocation)', () => {
		const src = 'note [';
		const tokens = tokenize(src);
		const items = getCompletions(tokens, endCursor(src), undefined);
		expect(items).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// 3b. Trigger: [ in sample/slice/cloud context → show buffer names
// ---------------------------------------------------------------------------

describe('getCompletions — trigger: [ in sample/slice/cloud context', () => {
	it('returns buffer names for trigger "[" after sample context', () => {
		const src = 'sample drums [';
		const tokens = tokenize(src);
		const bufferNames = ['kick', 'snare', 'hat'];
		const items = getCompletions(tokens, triggerCursor(src), '[', undefined, {}, bufferNames);
		expect(items.length).toBe(3);
		expect(items.every((i) => i.insertText.startsWith('\\'))).toBe(true);
	});

	it('returns buffer names for trigger "[" after slice context', () => {
		const src = 'slice drums [';
		const tokens = tokenize(src);
		const bufferNames = ['amen', 'break'];
		const items = getCompletions(tokens, triggerCursor(src), '[', undefined, {}, bufferNames);
		expect(items.length).toBe(2);
		expect(items.some((i) => i.label === '\\amen')).toBe(true);
	});

	it('returns buffer names for trigger "[" after cloud context', () => {
		const src = 'cloud grain [';
		const tokens = tokenize(src);
		const bufferNames = ['myloop'];
		const items = getCompletions(tokens, triggerCursor(src), '[', undefined, {}, bufferNames);
		expect(items.length).toBe(1);
		expect(items[0].label).toBe('\\myloop');
	});

	it('returns empty array for trigger "[" in sample context when no buffers registered', () => {
		const src = 'sample drums [';
		const tokens = tokenize(src);
		const items = getCompletions(tokens, triggerCursor(src), '[', undefined, {}, []);
		expect(items).toHaveLength(0);
	});

	it('buffer name completion items have \\ prefix in label and insertText', () => {
		const src = 'sample drums [';
		const tokens = tokenize(src);
		const items = getCompletions(tokens, triggerCursor(src), '[', undefined, {}, ['kick']);
		expect(items[0].label).toBe('\\kick');
		expect(items[0].insertText).toBe('\\kick');
	});
});

// ---------------------------------------------------------------------------
// 3c. Top-level generator body completions (after generator name)
// ---------------------------------------------------------------------------

describe('getCompletions — top-level body (after generator name)', () => {
	it('offers utf8{word} snippet after generator name (explicit invocation)', () => {
		// Simulates: "note lead " with cursor at end — prev token is Identifier "lead"
		const src = 'note lead ';
		const tokens = tokenize(src);
		const items = getCompletions(tokens, endCursor(src));
		expect(items.some((i: CompletionItem) => i.label.includes('utf8'))).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// 4. Trigger character: @ — decorator completions
// ---------------------------------------------------------------------------

describe('getCompletions — trigger: @', () => {
	it('returns decorator completions for trigger char "@"', () => {
		const items = getCompletions([], 0, '@');
		expect(items.length).toBeGreaterThan(0);
	});

	it('decorator completions include "key"', () => {
		const items = getCompletions([], 0, '@');
		expect(items.some((i) => i.label === 'key')).toBe(true);
	});

	it('decorator completions include "scale"', () => {
		const items = getCompletions([], 0, '@');
		expect(items.some((i) => i.label === 'scale')).toBe(true);
	});

	it('decorator completions include "root"', () => {
		const items = getCompletions([], 0, '@');
		expect(items.some((i) => i.label === 'root')).toBe(true);
	});

	it('decorator completions include "octave"', () => {
		const items = getCompletions([], 0, '@');
		expect(items.some((i) => i.label === 'octave')).toBe(true);
	});

	it('decorator completions include "cent"', () => {
		const items = getCompletions([], 0, '@');
		expect(items.some((i) => i.label === 'cent')).toBe(true);
	});

	it('decorator completions include "buf"', () => {
		const items = getCompletions([], 0, '@');
		expect(items.some((i) => i.label === 'buf')).toBe(true);
	});

	it('decorator completions do NOT include "set"', () => {
		const items = getCompletions([], 0, '@');
		expect(items.some((i) => i.label === 'set')).toBe(false);
	});

	it('decorator completions have snippet insertText with argument placeholder', () => {
		const items = getCompletions([], 0, '@');
		const keyItem = items.find((i) => i.label === 'key');
		expect(keyItem?.isSnippet).toBe(true);
		expect(keyItem?.insertText).toContain('${');
	});
});

// ---------------------------------------------------------------------------
// 5. Trigger character: ( — context-sensitive
// ---------------------------------------------------------------------------

describe('getCompletions — trigger: ( after Set', () => {
	it('returns set-param completions after "set"', () => {
		// Cursor is AT the '(' (triggerCursor), so lastTokenBefore sees 'Set'
		const src = 'set(';
		const tokens = tokenize(src);
		const items = getCompletions(tokens, triggerCursor(src), '(');
		expect(items.length).toBeGreaterThan(0);
	});

	it('set-param completions include scale snippet', () => {
		const src = 'set(';
		const tokens = tokenize(src);
		const items = getCompletions(tokens, triggerCursor(src), '(');
		expect(items.some((i: CompletionItem) => i.label.startsWith('scale'))).toBe(true);
	});

	it('set-param completions include tempo snippet', () => {
		const src = 'set(';
		const tokens = tokenize(src);
		const items = getCompletions(tokens, triggerCursor(src), '(');
		expect(items.some((i: CompletionItem) => i.label.startsWith('tempo'))).toBe(true);
	});

	it('set-param completions include key compound snippet', () => {
		const src = 'set(';
		const tokens = tokenize(src);
		const items = getCompletions(tokens, triggerCursor(src), '(');
		expect(items.some((i: CompletionItem) => i.label.startsWith('key'))).toBe(true);
	});
});

describe('getCompletions — trigger: ( after Note/Mono — instrument synthdefs', () => {
	it('returns instrument synthdef completions after "note("', () => {
		const src = 'note(';
		const tokens = tokenize(src);
		const items = getCompletions(tokens, triggerCursor(src), '(', undefined, TEST_METADATA);
		expect(items.length).toBeGreaterThan(0);
	});

	it('instrument synthdef completions include "kick" (type=instrument)', () => {
		const src = 'note(';
		const tokens = tokenize(src);
		const items = getCompletions(tokens, triggerCursor(src), '(', undefined, TEST_METADATA);
		expect(items.some((i) => i.label === 'kick')).toBe(true);
	});

	it('instrument synthdef completions include "fm" (type=instrument)', () => {
		const src = 'note(';
		const tokens = tokenize(src);
		const items = getCompletions(tokens, triggerCursor(src), '(', undefined, TEST_METADATA);
		expect(items.some((i) => i.label === 'fm')).toBe(true);
	});

	it('instrument synthdef completions do NOT include fx-type synthdefs', () => {
		const src = 'note(';
		const tokens = tokenize(src);
		const items = getCompletions(tokens, triggerCursor(src), '(', undefined, TEST_METADATA);
		// sliceplayer has type=fx in TEST_METADATA — should not appear
		expect(items.some((i) => i.label === 'sliceplayer')).toBe(false);
	});

	it('instrument synthdef completions use \\symbol insertText format', () => {
		const src = 'note(';
		const tokens = tokenize(src);
		const items = getCompletions(tokens, triggerCursor(src), '(', undefined, TEST_METADATA);
		const kick = items.find((i) => i.label === 'kick');
		expect(kick?.insertText).toBe('\\kick');
	});

	it('returns same instrument synthdefs for "mono("', () => {
		const src = 'mono(';
		const tokens = tokenize(src);
		const items = getCompletions(tokens, triggerCursor(src), '(', undefined, TEST_METADATA);
		expect(items.some((i) => i.label === 'kick')).toBe(true);
		expect(items.some((i) => i.label === 'fm')).toBe(true);
	});

	it('returns empty array for note( when metadata is empty', () => {
		const src = 'note(';
		const tokens = tokenize(src);
		const items = getCompletions(tokens, triggerCursor(src), '(');
		expect(items).toHaveLength(0);
	});
});

describe('getCompletions — trigger: ( after Sample/Slice/Cloud', () => {
	it('returns synthdefs whose contentTypes includes "sample" after "sample("', () => {
		const src = 'sample(';
		const tokens = tokenize(src);
		const items = getCompletions(tokens, triggerCursor(src), '(', undefined, TEST_METADATA);
		// TEST_METADATA fixture declares `chopper` with contentTypes:['sample'].
		expect(items.some((i) => i.label === 'chopper')).toBe(true);
		// note/mono-only defs must not appear.
		expect(items.some((i) => i.label === 'kick')).toBe(false);
		expect(items.some((i) => i.label === 'fm')).toBe(false);
	});

	it('returns empty array after "slice(" (no slice-eligible synthdefs in fixture)', () => {
		const src = 'slice(';
		const tokens = tokenize(src);
		const items = getCompletions(tokens, triggerCursor(src), '(', undefined, TEST_METADATA);
		expect(items).toHaveLength(0);
	});

	it('returns empty array after "cloud(" (no cloud-eligible synthdefs in fixture)', () => {
		const src = 'cloud(';
		const tokens = tokenize(src);
		const items = getCompletions(tokens, triggerCursor(src), '(', undefined, TEST_METADATA);
		expect(items).toHaveLength(0);
	});

	it('returns empty array for ( after an unrecognised preceding token', () => {
		const items = getCompletions([], 0, '(');
		expect(items).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// 5b. contentTypes filtering — note/mono only show eligible defs
// ---------------------------------------------------------------------------

describe('getCompletions — contentTypes filtering', () => {
	it('note( does NOT include sample-only defs', () => {
		const src = 'note(';
		const tokens = tokenize(src);
		const items = getCompletions(tokens, triggerCursor(src), '(', undefined, TEST_METADATA);
		// `chopper` in the fixture has contentTypes:['sample'] — must not appear.
		expect(items.some((i) => i.label === 'chopper')).toBe(false);
	});

	it('mono( does NOT include sample-only defs', () => {
		const src = 'mono(';
		const tokens = tokenize(src);
		const items = getCompletions(tokens, triggerCursor(src), '(', undefined, TEST_METADATA);
		expect(items.some((i) => i.label === 'chopper')).toBe(false);
	});

	it('note( excludes instrument defs without contentTypes', () => {
		// A def with type:'instrument' but no contentTypes must not leak through.
		const metaNoContentTypes: SynthDefMetadata = {
			legacy: {
				specs: { amp: { default: 0.1, min: 0, max: 1 } },
				type: 'instrument'
			}
		};
		const src = 'note(';
		const tokens = tokenize(src);
		const items = getCompletions(tokens, triggerCursor(src), '(', undefined, metaNoContentTypes);
		expect(items).toHaveLength(0);
	});

	it('sample( excludes fx defs', () => {
		const src = 'sample(';
		const tokens = tokenize(src);
		const items = getCompletions(tokens, triggerCursor(src), '(', undefined, TEST_METADATA);
		// sliceplayer in fixture is type:'fx' with no contentTypes.
		expect(items.some((i) => i.label === 'sliceplayer')).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// 6. Beginning-of-line: Ctrl+Space → content keywords
// ---------------------------------------------------------------------------

describe('getCompletions — beginning of line (Ctrl+Space)', () => {
	it('returns content keywords for empty line (no trigger, no tokens)', () => {
		const items = getCompletions([], 0, undefined);
		expect(items.some((i) => i.label === 'note')).toBe(true);
		expect(items.some((i) => i.label === 'mono')).toBe(true);
		expect(items.some((i) => i.label === 'sample')).toBe(true);
		expect(items.some((i) => i.label === 'slice')).toBe(true);
		expect(items.some((i) => i.label === 'cloud')).toBe(true);
	});

	it('content keyword completions have kind=keyword', () => {
		const items = getCompletions([], 0, undefined);
		const note = items.find((i) => i.label === 'note');
		expect(note?.kind).toBe('keyword');
	});
});

// ---------------------------------------------------------------------------
// 7. Explicit invocation (no trigger char) — inferred from preceding token
// ---------------------------------------------------------------------------

describe('getCompletions — explicit invocation (no triggerChar)', () => {
	it("returns modifier completions when cursor is after Tick (')", () => {
		const src = "note [0]'";
		const tokens = tokenize(src);
		// No trigger char — relies on prevType === 'Tick'
		const items = getCompletions(tokens, endCursor(src), undefined);
		expect(items.some((i: CompletionItem) => i.label === 'lock')).toBe(true);
	});

	it('returns pipe completions when cursor is after Pipe (|)', () => {
		const src = 'note [0] |';
		const tokens = tokenize(src);
		const items = getCompletions(tokens, endCursor(src), undefined);
		expect(items.some((i: CompletionItem) => i.label.includes('lpf'))).toBe(true);
	});

	it('returns empty array when cursor is after LBracket (no placeholder suggestions)', () => {
		const src = 'note [';
		const tokens = tokenize(src);
		const items = getCompletions(tokens, endCursor(src), undefined);
		expect(items).toHaveLength(0);
	});

	it('returns empty array when cursor is not after a recognised trigger token', () => {
		// After a closing bracket — no completion context
		const src = 'note [0 2]';
		const tokens = tokenize(src);
		const items = getCompletions(tokens, endCursor(src), undefined);
		expect(items).toHaveLength(0);
	});

	it('returns content keywords for empty token list (beginning of line)', () => {
		const items = getCompletions([], 0, undefined);
		expect(items.some((i) => i.label === 'note')).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// 8. CompletionItem shape
// ---------------------------------------------------------------------------

describe('CompletionItem shape', () => {
	it('every modifier completion has label, insertText, and kind', () => {
		const items = getCompletions([], 0, "'");
		for (const item of items) {
			expect(typeof item.label).toBe('string');
			expect(typeof item.insertText).toBe('string');
			expect(item.kind).toBeDefined();
		}
	});

	it('snippet items have isSnippet:true and insertText containing ${', () => {
		const items = getCompletions([], 0, "'");
		const snippets = items.filter((i: CompletionItem) => i.isSnippet);
		expect(snippets.length).toBeGreaterThan(0);
		for (const s of snippets) {
			expect(s.insertText).toContain('${');
		}
	});

	// Shape modifier completions
	it("returns 'rev completion for trigger '", () => {
		const items = getCompletions([], 0, "'");
		const rev = items.find((i) => i.label === 'rev');
		expect(rev).toBeDefined();
		expect(rev?.insertText).toBe('rev');
		expect(rev?.kind).toBe('keyword');
	});

	it("returns 'mirror completion for trigger '", () => {
		const items = getCompletions([], 0, "'");
		const mirror = items.find((i) => i.label === 'mirror');
		expect(mirror).toBeDefined();
		expect(mirror?.insertText).toBe('mirror');
		expect(mirror?.kind).toBe('keyword');
	});

	it("returns 'bounce completion for trigger '", () => {
		const items = getCompletions([], 0, "'");
		const bounce = items.find((i) => i.label === 'bounce');
		expect(bounce).toBeDefined();
		expect(bounce?.insertText).toBe('bounce');
		expect(bounce?.kind).toBe('keyword');
	});
});
