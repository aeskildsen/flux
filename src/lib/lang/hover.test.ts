/**
 * hover.ts unit tests.
 *
 * getHover(token, prevTokenName?) is a pure function — it takes a single IToken
 * and an optional preceding-token type name and returns { contents: string } | null.
 *
 * We produce real IToken objects by running FluxLexer.tokenize() and then
 * calling getHover with specific tokens from the result.
 *
 * Helper `firstToken(src)` returns the first token from a snippet.
 * Helper `tokenAt(src, index)` returns the nth token.
 */

import { describe, it, expect } from 'vitest';
import { FluxLexer } from './lexer.js';
import { getHover } from './hover.js';
import type { HoverResult } from './hover.js';
import type { IToken } from 'chevrotain';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tokens(src: string): IToken[] {
	return FluxLexer.tokenize(src).tokens;
}

function firstToken(src: string): IToken {
	const toks = tokens(src);
	if (toks.length === 0) throw new Error(`No tokens in: ${src}`);
	return toks[0];
}

function tokenAt(src: string, index: number): IToken {
	const toks = tokens(src);
	if (index >= toks.length) throw new Error(`Token index ${index} out of range in: ${src}`);
	return toks[index];
}

// ---------------------------------------------------------------------------
// 1. Keyword tokens (non-identifier)
// ---------------------------------------------------------------------------

describe('getHover — keyword tokens', () => {
	it('returns documentation for "note"', () => {
		const result = getHover(firstToken('note'));
		expect(result).not.toBeNull();
		expect(result!.contents).toContain('note');
	});

	it('returns documentation for "mono"', () => {
		const result = getHover(firstToken('mono'));
		expect(result).not.toBeNull();
		expect(result!.contents).toContain('mono');
	});

	it('note docs mention "cyclic" or "cycle" or "loop"', () => {
		const result = getHover(firstToken('note'));
		expect(result!.contents.toLowerCase()).toMatch(/cycl|loop/);
	});

	it('returns documentation for "set"', () => {
		const result = getHover(firstToken('set'));
		expect(result).not.toBeNull();
		expect(result!.contents).toContain('set');
	});

	it('returns documentation for Rand generator token', () => {
		// "0rand4" — Rand is the second token (after Integer 0)
		const toks = tokens('0rand4');
		const randTok = toks.find((t) => t.tokenType.name === 'Rand');
		expect(randTok).toBeDefined();
		const result = getHover(randTok!);
		expect(result).not.toBeNull();
		expect(result!.contents).toContain('rand');
	});

	it('returns documentation for Step token', () => {
		const toks = tokens('0step2x4');
		const stepTok = toks.find((t) => t.tokenType.name === 'Step');
		expect(stepTok).toBeDefined();
		const result = getHover(stepTok!);
		expect(result).not.toBeNull();
	});

	it('returns documentation for Gau token', () => {
		const toks = tokens('0gau4');
		const gauTok = toks.find((t) => t.tokenType.name === 'Gau');
		expect(gauTok).toBeDefined();
		const result = getHover(gauTok!);
		expect(result).not.toBeNull();
	});

	it('returns documentation for Exp token', () => {
		const toks = tokens('1exp7');
		const expTok = toks.find((t) => t.tokenType.name === 'Exp');
		expect(expTok).toBeDefined();
		const result = getHover(expTok!);
		expect(result).not.toBeNull();
	});

	it('returns documentation for Tilde (~) token', () => {
		const toks = tokens('0~4');
		const tildeTok = toks.find((t) => t.tokenType.name === 'Tilde');
		expect(tildeTok).toBeDefined();
		const result = getHover(tildeTok!);
		expect(result).not.toBeNull();
		expect(result!.contents).toContain('rand');
	});
});

// ---------------------------------------------------------------------------
// 2. Identifier tokens — modifier context (prevToken = 'Tick')
// ---------------------------------------------------------------------------

describe('getHover — identifier after Tick (modifier context)', () => {
	it("returns modifier docs for 'lock' after Tick", () => {
		// "note [0]'lock" — last two tokens are Tick + Identifier("lock")
		const toks = tokens("note [0]'lock");
		const lockTok = toks.find((t) => t.image === 'lock');
		expect(lockTok).toBeDefined();
		const result = getHover(lockTok!, 'Tick');
		expect(result).not.toBeNull();
		expect(result!.contents).toContain('lock');
	});

	it("returns modifier docs for 'stut' after Tick", () => {
		const toks = tokens("note [0]'stut");
		const stutTok = toks.find((t) => t.image === 'stut');
		expect(stutTok).toBeDefined();
		const result = getHover(stutTok!, 'Tick');
		expect(result).not.toBeNull();
	});

	it("returns modifier docs for 'shuf' after Tick", () => {
		const toks = tokens("note [0]'shuf");
		const shufTok = toks.find((t) => t.image === 'shuf');
		expect(shufTok).toBeDefined();
		const result = getHover(shufTok!, 'Tick');
		expect(result).not.toBeNull();
	});
});

// ---------------------------------------------------------------------------
// 3. Identifier tokens — decorator context (prevToken = 'At' or 'Set')
// ---------------------------------------------------------------------------

describe('getHover — identifier after @ or set (decorator context)', () => {
	it('returns decorator docs for "scale" after @', () => {
		const toks = tokens('@scale');
		const scaleTok = toks.find((t) => t.image === 'scale');
		expect(scaleTok).toBeDefined();
		const result = getHover(scaleTok!, 'At');
		expect(result).not.toBeNull();
		expect(result!.contents).toContain('scale');
	});

	it('returns decorator docs for "root" after set', () => {
		const toks = tokens('set root');
		const rootTok = toks.find((t) => t.image === 'root');
		expect(rootTok).toBeDefined();
		const result = getHover(rootTok!, 'Set');
		expect(result).not.toBeNull();
		expect(result!.contents).toContain('root');
	});

	it('returns decorator docs for "octave" after @', () => {
		const toks = tokens('@octave');
		const octTok = toks.find((t) => t.image === 'octave');
		expect(octTok).toBeDefined();
		const result = getHover(octTok!, 'At');
		expect(result).not.toBeNull();
	});

	it('returns decorator docs for "key" after set', () => {
		const toks = tokens('set key');
		const keyTok = toks.find((t) => t.image === 'key');
		expect(keyTok).toBeDefined();
		const result = getHover(keyTok!, 'Set');
		expect(result).not.toBeNull();
		expect(result!.contents).toContain('key');
	});
});

// ---------------------------------------------------------------------------
// 4. Identifier tokens — scale name fallback
// ---------------------------------------------------------------------------

describe('getHover — scale name identifiers', () => {
	it('returns scale docs for "major" identifier', () => {
		const toks = tokens('major');
		const majTok = toks[0];
		const result = getHover(majTok);
		expect(result).not.toBeNull();
		expect(result!.contents).toContain('major');
	});

	it('returns scale docs for "minor" identifier', () => {
		const toks = tokens('minor');
		const result = getHover(toks[0]);
		expect(result).not.toBeNull();
		expect(result!.contents).toContain('minor');
	});

	it('returns scale docs for "lydian" identifier', () => {
		const toks = tokens('lydian');
		const result = getHover(toks[0]);
		expect(result).not.toBeNull();
	});
});

// ---------------------------------------------------------------------------
// 5. Unknown / unrecognised identifiers
// ---------------------------------------------------------------------------

describe('getHover — unknown identifier', () => {
	it('returns a non-null result (generic Identifier docs) for unknown word', () => {
		const toks = tokens('foobar');
		const result = getHover(toks[0]);
		// The fallback returns TOKEN_TYPE_DOCS['Identifier'] which must not be null
		expect(result).not.toBeNull();
	});

	it('returns a string contents for unknown identifier', () => {
		const toks = tokens('unknownword');
		const result = getHover(toks[0]) as HoverResult;
		expect(typeof result.contents).toBe('string');
	});
});

// ---------------------------------------------------------------------------
// 6. HoverResult shape
// ---------------------------------------------------------------------------

describe('HoverResult shape', () => {
	it('result.contents is always a string when non-null', () => {
		const testCases = ['note', 'mono', 'set', '0rand4'];
		for (const src of testCases) {
			const tok = firstToken(src);
			const result = getHover(tok);
			if (result !== null) {
				expect(typeof result.contents).toBe('string');
				expect(result.contents.length).toBeGreaterThan(0);
			}
		}
	});
});
