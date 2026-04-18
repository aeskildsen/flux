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
import type { SynthDefMetadata } from './completions.js';

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

	it('returns documentation for "utf8" keyword in utf8{coffee}', () => {
		// First token of 'utf8{coffee}' is Utf8Kw
		const result = getHover(firstToken('utf8{coffee}'));
		expect(result).not.toBeNull();
		expect(result!.contents).toContain('utf8');
		expect(result!.contents).toContain('UTF-8');
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

	it("Tick token hover mentions 'rev' modifier in common modifiers list", () => {
		// The Tick token itself should mention rev, mirror, bounce in its documentation
		const toks = tokens("note [0]'");
		const tickTok = toks.find((t) => t.tokenType.name === 'Tick');
		expect(tickTok).toBeDefined();
		const result = getHover(tickTok!);
		expect(result).not.toBeNull();
		expect(result!.contents).toContain('rev');
	});

	it("Tick token hover mentions 'mirror' modifier", () => {
		const toks = tokens("note [0]'");
		const tickTok = toks.find((t) => t.tokenType.name === 'Tick');
		const result = getHover(tickTok!);
		expect(result!.contents).toContain('mirror');
	});

	it("Tick token hover mentions 'bounce' modifier", () => {
		const toks = tokens("note [0]'");
		const tickTok = toks.find((t) => t.tokenType.name === 'Tick');
		const result = getHover(tickTok!);
		expect(result!.contents).toContain('bounce');
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

	it('returns decorator docs for "buf" after @', () => {
		const toks = tokens('@buf');
		const bufTok = toks.find((t) => t.image === 'buf');
		expect(bufTok).toBeDefined();
		const result = getHover(bufTok!, 'At');
		expect(result).not.toBeNull();
		expect(result!.contents).toContain('buf');
	});

	it('buf hover content describes buffer selection for slice/cloud', () => {
		const toks = tokens('@buf');
		const bufTok = toks.find((t) => t.image === 'buf');
		const result = getHover(bufTok!, 'At') as HoverResult;
		expect(result.contents).toContain('slice');
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
// 6. ParamSigil hover
// ---------------------------------------------------------------------------

describe('getHover — ParamSigil tokens', () => {
	it('returns hover for "amp token when metadata provided', () => {
		const toks = tokens('"amp');
		const result = getHover(toks[0], undefined, 'kick', TEST_METADATA);
		expect(result).not.toBeNull();
	});

	it('"amp hover content mentions "amp"', () => {
		const toks = tokens('"amp');
		const result = getHover(toks[0], undefined, 'kick', TEST_METADATA) as HoverResult;
		expect(result.contents).toContain('amp');
	});

	it('"amp hover content includes min, max, and default', () => {
		const toks = tokens('"amp');
		const result = getHover(toks[0], undefined, 'kick', TEST_METADATA) as HoverResult;
		expect(result.contents).toContain('Default');
		expect(result.contents).toContain('Min');
		expect(result.contents).toContain('Max');
	});

	it('returns null for unknown param name', () => {
		const toks = tokens('"unknownparam');
		const result = getHover(toks[0], undefined, 'kick', TEST_METADATA);
		expect(result).toBeNull();
	});

	it('returns null when no metadata provided', () => {
		const toks = tokens('"amp');
		const result = getHover(toks[0]);
		expect(result).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// 8. HoverResult shape
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

// ---------------------------------------------------------------------------
// 9. Runtime-docs-sourced hover content
//
// These tests lock in the contract that hover tooltips prefer the
// build-time-imported docs/*.md content over the hardcoded tables in
// hover.ts. Each token below exercises a different doc file.
// ---------------------------------------------------------------------------

describe('getHover — runtime docs integration', () => {
	it("hovers 'stut (modifiers.md) via runtime docs", () => {
		const toks = tokens("note [0]'stut");
		const stutTok = toks.find((t) => t.image === 'stut')!;
		const result = getHover(stutTok, 'Tick') as HoverResult;
		expect(result).not.toBeNull();
		// The doc section heading "### `'stut(n)` — stutter" is rendered as
		// **`'stut(n)` — stutter** at the top of the hover markdown.
		expect(result.contents).toContain("'stut");
		expect(result.contents.toLowerCase()).toMatch(/repeat|stutter/);
	});

	it("hovers 'numSlices (modifiers.md) via runtime docs", () => {
		const toks = tokens("slice drums [0]'numSlices(16)");
		const nsTok = toks.find((t) => t.image === 'numSlices')!;
		const result = getHover(nsTok, 'Tick') as HoverResult;
		expect(result).not.toBeNull();
		expect(result.contents).toContain('numSlices');
	});

	it('hovers @key (decorators.md) via runtime docs', () => {
		const toks = tokens('@key');
		const keyTok = toks.find((t) => t.image === 'key')!;
		const result = getHover(keyTok, 'At') as HoverResult;
		expect(result).not.toBeNull();
		// Doc body mentions root/scale composition.
		expect(result.contents.toLowerCase()).toMatch(/root|scale/);
	});

	it('hovers @buf (decorators.md) via runtime docs', () => {
		const toks = tokens('@buf');
		const bufTok = toks.find((t) => t.image === 'buf')!;
		const result = getHover(bufTok, 'At') as HoverResult;
		expect(result).not.toBeNull();
		expect(result.contents.toLowerCase()).toContain('slice');
	});

	it('hovers Rand token via generators.md runtime docs', () => {
		const toks = tokens('0rand4');
		const randTok = toks.find((t) => t.tokenType.name === 'Rand')!;
		const result = getHover(randTok) as HoverResult;
		expect(result).not.toBeNull();
		// generators.md describes rand as Pwhite-like uniform integer.
		expect(result.contents.toLowerCase()).toMatch(/uniform|random|pwhite/);
	});

	it('hovers Utf8Kw via generators.md runtime docs', () => {
		const toks = tokens('utf8{coffee}');
		const u = toks.find((t) => t.tokenType.name === 'Utf8Kw')!;
		const result = getHover(u) as HoverResult;
		expect(result).not.toBeNull();
		expect(result.contents).toContain('utf8');
	});

	it('hovers note keyword via content-types.md runtime docs', () => {
		const toks = tokens('note lead [0]');
		const noteTok = toks.find((t) => t.tokenType.name === 'Note')!;
		const result = getHover(noteTok) as HoverResult;
		expect(result).not.toBeNull();
		// content-types.md: "## `note` — polyphonic pitched events"
		expect(result.contents.toLowerCase()).toMatch(/polyphonic|pitched/);
	});

	it('hovers mono keyword via content-types.md runtime docs', () => {
		const toks = tokens('mono bass [0]');
		const monoTok = toks.find((t) => t.tokenType.name === 'Mono')!;
		const result = getHover(monoTok) as HoverResult;
		expect(result).not.toBeNull();
		expect(result.contents.toLowerCase()).toMatch(/monophonic|persistent/);
	});

	it('hovers sample keyword via runtime docs (content-types or buffers)', () => {
		const toks = tokens('sample drums [0]');
		const sampleTok = toks.find((t) => t.tokenType.name === 'Sample')!;
		const result = getHover(sampleTok) as HoverResult;
		expect(result).not.toBeNull();
		expect(result.contents.toLowerCase()).toContain('buffer');
	});

	it('hovers slice keyword via runtime docs', () => {
		const toks = tokens('slice drums [0]');
		const sliceTok = toks.find((t) => t.tokenType.name === 'Slice')!;
		const result = getHover(sliceTok) as HoverResult;
		expect(result).not.toBeNull();
		expect(result.contents.toLowerCase()).toMatch(/slice|buffer/);
	});

	it('hovers cloud keyword via content-types.md runtime docs', () => {
		const toks = tokens('cloud grain []');
		const cloudTok = toks.find((t) => t.tokenType.name === 'Cloud')!;
		const result = getHover(cloudTok) as HoverResult;
		expect(result).not.toBeNull();
		expect(result.contents.toLowerCase()).toMatch(/granular|cloud/);
	});

	it('hovers set keyword via decorators.md runtime docs', () => {
		const toks = tokens('set scale(minor)');
		const setTok = toks.find((t) => t.tokenType.name === 'Set')!;
		const result = getHover(setTok) as HoverResult;
		expect(result).not.toBeNull();
		// decorators.md: "## `set` — global session state"
		expect(result.contents.toLowerCase()).toMatch(/global|session|set/);
	});
});

// ---------------------------------------------------------------------------
// 10. Shape modifier hover docs ('rev, 'mirror, 'bounce)
// ---------------------------------------------------------------------------

describe("getHover — 'rev, 'mirror, 'bounce modifier docs", () => {
	function modifierToken(name: string): IToken {
		// Tokenize `[0]'rev` — the modifier identifier is the last token
		const toks = tokens(`[0]'${name}`);
		// Last token is the identifier for the modifier name
		return toks[toks.length - 1];
	}

	it("'rev — hover shows reverse documentation", () => {
		const tok = modifierToken('rev');
		const result = getHover(tok, 'Tick');
		expect(result).not.toBeNull();
		expect(result!.contents).toContain('rev');
		expect(result!.contents).toContain('reverse');
	});

	it("'mirror — hover shows palindrome documentation", () => {
		const tok = modifierToken('mirror');
		const result = getHover(tok, 'Tick');
		expect(result).not.toBeNull();
		expect(result!.contents).toContain('mirror');
		expect(result!.contents).toContain('palindrome');
	});

	it("'bounce — hover shows ping-pong documentation", () => {
		const tok = modifierToken('bounce');
		const result = getHover(tok, 'Tick');
		expect(result).not.toBeNull();
		expect(result!.contents).toContain('bounce');
	});

	it("'rev image-based fallback lookup (no Tick context)", () => {
		// Without prevTokenName='Tick', should still find rev via image-based fallback
		const tok = modifierToken('rev');
		const result = getHover(tok);
		expect(result).not.toBeNull();
		expect(result!.contents).toContain('rev');
	});
});
