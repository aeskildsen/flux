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
import { getCompletions } from './completions.js';
import type { CompletionItem, SynthDefMetadata } from './completions.js';

// Inline fixture matching static/compiled_synthdefs/metadata.json shape
const TEST_METADATA: SynthDefMetadata = {
	kick: {
		specs: {
			amp: { default: 0.1, min: 0, max: 1, unit: 'amp', curve: 4 },
			pan: { default: 0, min: -1, max: 1, unit: '', curve: 2 },
			rel: { default: 0.2, min: 0.001, max: 4, unit: 'seconds', curve: 4 }
		}
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
// 3. Trigger character: [
// ---------------------------------------------------------------------------

describe('getCompletions — trigger: [', () => {
	it('returns sequence body completions for trigger char "["', () => {
		const items = getCompletions([], 0, '[');
		expect(items.length).toBeGreaterThan(0);
	});

	it('sequence body completions include a rand generator snippet', () => {
		const items = getCompletions([], 0, '[');
		expect(items.some((i: CompletionItem) => i.insertText.includes('rand'))).toBe(true);
	});

	it('sequence body completions include utf8{word} snippet', () => {
		const items = getCompletions([], 0, '[');
		expect(items.some((i: CompletionItem) => i.label.includes('utf8'))).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// 3b. Top-level generator body completions (after generator name)
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
// 4. Trigger character: ( — context-sensitive
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

describe('getCompletions — trigger: ( after Note', () => {
	it('returns FX name completions after "note("', () => {
		// Cursor is AT the '(' — lastTokenBefore sees 'Note'
		const src = 'note(';
		const tokens = tokenize(src);
		const items = getCompletions(tokens, triggerCursor(src), '(');
		expect(items.length).toBeGreaterThan(0);
	});

	it('FX name completions include "lpf"', () => {
		const src = 'note(';
		const tokens = tokenize(src);
		const items = getCompletions(tokens, triggerCursor(src), '(');
		expect(items.some((i: CompletionItem) => i.label === 'lpf')).toBe(true);
	});

	it('returns empty array for ( after an unrecognised preceding token', () => {
		// Bare ( with no meaningful preceding token
		const items = getCompletions([], 0, '(');
		expect(items).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// 5. Explicit invocation (no trigger char) — inferred from preceding token
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

	it('returns sequence body completions when cursor is after LBracket', () => {
		const src = 'note [';
		const tokens = tokenize(src);
		const items = getCompletions(tokens, endCursor(src), undefined);
		expect(items.length).toBeGreaterThan(0);
	});

	it('returns empty array when cursor is not after a recognised trigger token', () => {
		// After a closing bracket — no completion context
		const src = 'note [0 2]';
		const tokens = tokenize(src);
		const items = getCompletions(tokens, endCursor(src), undefined);
		expect(items).toHaveLength(0);
	});

	it('returns empty array for an empty token list with no trigger', () => {
		const items = getCompletions([], 0, undefined);
		expect(items).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// 6. CompletionItem shape
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
});
