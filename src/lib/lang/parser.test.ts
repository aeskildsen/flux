import { describe, it, expect } from 'vitest';
import { FluxLexer } from './lexer.js';
import { parser, preprocessTokens } from './parser.js';

function parse(src: string) {
	const { tokens, errors: lexErrors } = FluxLexer.tokenize(src);
	const processed = preprocessTokens(tokens, src);
	parser.input = processed;
	const cst = parser.program();
	return { cst, lexErrors, parseErrors: parser.errors };
}

describe('patternStatement — note', () => {
	it('parses note with a name and sequence body', () => {
		const { parseErrors } = parse('note lead [0 2 4]');
		expect(parseErrors).toHaveLength(0);
	});

	it('accepts note with name and no body (body-required check is in the evaluator)', () => {
		// Parser allows it; evaluator rejects non-derived patterns with no body.
		const { parseErrors } = parse("note lead 'stut");
		expect(parseErrors).toHaveLength(0);
	});

	it('errors on bare note keyword', () => {
		const { parseErrors } = parse('note');
		expect(parseErrors.length).toBeGreaterThan(0);
	});

	it('parses negative degrees: note lead [-1 0 2]', () => {
		const { parseErrors } = parse('note lead [-1 0 2]');
		expect(parseErrors).toHaveLength(0);
	});

	it('parses mixed positive and negative degrees: note lead [-3 -1 0 2 4]', () => {
		const { parseErrors } = parse('note lead [-3 -1 0 2 4]');
		expect(parseErrors).toHaveLength(0);
	});
});

describe('patternStatement — mono', () => {
	it('parses mono with a name and sequence body', () => {
		const { parseErrors } = parse('mono bass [0 1 2 3]');
		expect(parseErrors).toHaveLength(0);
	});

	it('parses mono with synthdef symbol arg and name', () => {
		const { parseErrors } = parse('mono(\\moog) bass [0 1 2]');
		expect(parseErrors).toHaveLength(0);
	});

	it('errors on bare mono keyword', () => {
		const { parseErrors } = parse('mono');
		expect(parseErrors.length).toBeGreaterThan(0);
	});
});

describe('patternStatement — sample, slice, cloud', () => {
	it('parses sample with a name and sequence body', () => {
		const { parseErrors } = parse('sample drums [0 1 2]');
		expect(parseErrors).toHaveLength(0);
	});

	it('parses slice with a name and sequence body', () => {
		const { parseErrors } = parse('slice loop [0 1 2]');
		expect(parseErrors).toHaveLength(0);
	});

	it('parses cloud with a name and sequence body', () => {
		const { parseErrors } = parse('cloud pad [0 1 2]');
		expect(parseErrors).toHaveLength(0);
	});
});

describe('patternStatement — synthdef and full form', () => {
	it('parses note with synthdef symbol arg and name', () => {
		const { parseErrors } = parse('note(\\moog) lead [0 2 4]');
		expect(parseErrors).toHaveLength(0);
	});

	it('rejects note with string synthdef arg (strings are errors)', () => {
		const { lexErrors } = parse('note("moog") lead [0 2 4]');
		expect(lexErrors.length).toBeGreaterThan(0);
	});
});

describe('setStatement', () => {
	it('parses set scale(minor) with bare identifier', () => {
		const { parseErrors } = parse('set scale(minor)');
		expect(parseErrors).toHaveLength(0);
	});

	it('parses set with compound key arg: set key(g# lydian)', () => {
		const { parseErrors } = parse('set key(g# lydian)');
		expect(parseErrors).toHaveLength(0);
	});

	it('parses set tempo(120)', () => {
		const { parseErrors } = parse('set tempo(120)');
		expect(parseErrors).toHaveLength(0);
	});
});

describe('name conventions — \\symbol vs bare identifier', () => {
	// Scale/key positions take bare identifiers only (closed, built-in vocabulary).
	// \\symbol is reserved for SynthDef/FX names (open, runtime registry).

	it('set scale(minor) — bare identifier is accepted', () => {
		expect(parse('set scale(minor)').parseErrors).toHaveLength(0);
	});

	it('set scale(\\minor) — symbol is a parse error in scale position', () => {
		expect(parse('set scale(\\minor)').parseErrors.length).toBeGreaterThan(0);
	});

	it('@scale(minor) — bare identifier is accepted inline', () => {
		expect(parse('@scale(minor) note lead [0 1 2]').parseErrors).toHaveLength(0);
	});

	it('@scale(\\minor) — symbol is a parse error in @scale position', () => {
		expect(parse('@scale(\\minor) note lead [0 1 2]').parseErrors.length).toBeGreaterThan(0);
	});

	it('@scale(dorian) — other scale names work as bare identifiers', () => {
		expect(parse('@scale(dorian) note lead [0 2 4]').parseErrors).toHaveLength(0);
	});

	it('set key(g# lydian) — bare identifiers accepted in key position', () => {
		expect(parse('set key(g# lydian)').parseErrors).toHaveLength(0);
	});

	// SynthDef positions still require \\symbol (not bare identifier).
	it('note(\\moog) lead [...] — symbol is required for SynthDef', () => {
		expect(parse('note(\\moog) lead [0 1 2]').parseErrors).toHaveLength(0);
	});

	it('note(moog) lead [...] — bare identifier is rejected in SynthDef position', () => {
		expect(parse('note(moog) lead [0 1 2]').parseErrors.length).toBeGreaterThan(0);
	});

	it('fx(\\lpf) — symbol is required for FX name', () => {
		expect(parse('note lead [0 2 4] | fx(\\lpf)').parseErrors).toHaveLength(0);
	});

	it('fx(lpf) — bare identifier is rejected in FX position', () => {
		expect(parse('note lead [0 2 4] | fx(lpf)').parseErrors.length).toBeGreaterThan(0);
	});
});

describe('send_fx and master_fx — removed, must produce parse errors', () => {
	// send FX are not supported. master bus FX are UI-configured.
	// send_fx and master_fx lex as Identifier and fail to parse as statements.

	it('send_fx(\\reverb) is a parse error', () => {
		expect(parse('send_fx(\\reverb)').parseErrors.length).toBeGreaterThan(0);
	});

	it("send_fx(\\reverb)'room(0.5) is a parse error", () => {
		expect(parse("send_fx(\\reverb)'room(0.5)").parseErrors.length).toBeGreaterThan(0);
	});

	it('master_fx(\\limiter) is a parse error', () => {
		expect(parse('master_fx(\\limiter)').parseErrors.length).toBeGreaterThan(0);
	});

	it("master_fx(\\limiter)'gain(0.8) is a parse error", () => {
		expect(parse("master_fx(\\limiter)'gain(0.8)").parseErrors.length).toBeGreaterThan(0);
	});
});

describe('pipe / FX — wet/dry level', () => {
	it('parses fx with wet/dry: note lead [0] | fx(\\lpf) 70%', () => {
		expect(parse('note lead [0] | fx(\\lpf) 70%').parseErrors).toHaveLength(0);
	});

	it("parses fx with params and wet/dry: note lead [0] | fx(\\lpf)'cutoff(800) 50%", () => {
		expect(parse("note lead [0] | fx(\\lpf)'cutoff(800) 50%").parseErrors).toHaveLength(0);
	});

	it('parses fx with 100% wet (explicit full wet)', () => {
		expect(parse('note lead [0] | fx(\\lpf) 100%').parseErrors).toHaveLength(0);
	});

	it('parses fx with 0% wet (dry only)', () => {
		expect(parse('note lead [0] | fx(\\lpf) 0%').parseErrors).toHaveLength(0);
	});
});

describe('accidentals', () => {
	it('parses a flat degree: note lead [2b]', () => {
		const { parseErrors } = parse('note lead [2b]');
		expect(parseErrors).toHaveLength(0);
	});

	it('parses a sharp degree: note lead [4#]', () => {
		const { parseErrors } = parse('note lead [4#]');
		expect(parseErrors).toHaveLength(0);
	});

	it('parses double flat: note lead [3bb]', () => {
		const { parseErrors } = parse('note lead [3bb]');
		expect(parseErrors).toHaveLength(0);
	});

	it('parses double sharp: note lead [4##]', () => {
		const { parseErrors } = parse('note lead [4##]');
		expect(parseErrors).toHaveLength(0);
	});

	it('parses a mixed list with accidentals: note lead [0 2b 4#]', () => {
		const { parseErrors } = parse('note lead [0 2b 4#]');
		expect(parseErrors).toHaveLength(0);
	});

	it('errors on accidental after generator expression: note lead [0rand4b]', () => {
		// 0rand4b — `b` after `4` in a generator context should be a lex/parse error
		// because degreeLiterals are only plain integers, not generators
		const { parseErrors, lexErrors } = parse('note lead [0rand4b]');
		expect(parseErrors.length + lexErrors.length).toBeGreaterThan(0);
	});
});

describe('transposition', () => {
	it('parses note with + transposition: note lead [0 2] + 3', () => {
		const { parseErrors } = parse('note lead [0 2] + 3');
		expect(parseErrors).toHaveLength(0);
	});

	it('parses note with - transposition: note lead [0 2] - 1', () => {
		const { parseErrors } = parse('note lead [0 2] - 1');
		expect(parseErrors).toHaveLength(0);
	});

	it('parses transposition with generator RHS: note lead [0 2] + 0rand3', () => {
		const { parseErrors } = parse('note lead [0 2] + 0rand3');
		expect(parseErrors).toHaveLength(0);
	});

	it('errors on double-negative transposition: note lead [0] - -4', () => {
		const { parseErrors } = parse('note lead [0] - -4');
		expect(parseErrors.length).toBeGreaterThan(0);
	});
});

describe('continuation modifiers', () => {
	it('parses a continuation modifier on an indented line', () => {
		const { parseErrors } = parse("note lead [0 1]\n  'stut(2)");
		expect(parseErrors).toHaveLength(0);
	});

	it('parses multiple continuation modifiers', () => {
		const { parseErrors } = parse("note lead [0 1]\n  'stut(2)\n  'legato(0.8)");
		expect(parseErrors).toHaveLength(0);
	});
});

describe('decorators', () => {
	it('parses an inline decorator: @scale(minor) note lead [0 1 2]', () => {
		const { parseErrors } = parse('@scale(minor) note lead [0 1 2]');
		expect(parseErrors).toHaveLength(0);
	});

	it('parses a block decorator with bare identifier', () => {
		const { parseErrors } = parse('@scale(minor)\n  note lead [0 1 2]');
		expect(parseErrors).toHaveLength(0);
	});

	it('parses @key compound decorator: @key(g# lydian) note lead [0]', () => {
		const { parseErrors } = parse('@key(g# lydian) note lead [0]');
		expect(parseErrors).toHaveLength(0);
	});

	it('parses nested decorator blocks', () => {
		const src = '@root(7)\n  @scale(minor)\n    note lead [0 1 2]';
		const { parseErrors } = parse(src);
		expect(parseErrors).toHaveLength(0);
	});
});

describe('timed lists', () => {
	it('parses relative timed list: note lead [4@1/2 7@1/4]', () => {
		const { parseErrors } = parse('note lead [4@1/2 7@1/4]');
		expect(parseErrors).toHaveLength(0);
	});

	it('parses timed list with integer-only time: note lead [0@0 4@1]', () => {
		const { parseErrors } = parse('note lead [0@0 4@1]');
		expect(parseErrors).toHaveLength(0);
	});

	it('parses relative timed list where first element has no @: note lead [0 2@1]', () => {
		const { parseErrors } = parse('note lead [0 2@1]');
		expect(parseErrors).toHaveLength(0);
	});

	it('parses relative timed list with @ on a later element: note lead [0 4 7@1/2]', () => {
		const { parseErrors } = parse('note lead [0 4 7@1/2]');
		expect(parseErrors).toHaveLength(0);
	});

	it('parses relative timed list with accidental before @: note lead [0 2b@1/4]', () => {
		const { parseErrors } = parse('note lead [0 2b@1/4]');
		expect(parseErrors).toHaveLength(0);
	});

	it('parses float time: note lead [0 2@1.5]', () => {
		const { parseErrors } = parse('note lead [0 2@1.5]');
		expect(parseErrors).toHaveLength(0);
	});

	it('parses float time at cycle start: note lead [0@0.0 4@0.5]', () => {
		const { parseErrors } = parse('note lead [0@0.0 4@0.5]');
		expect(parseErrors).toHaveLength(0);
	});

	it('parses timed list with mono content type', () => {
		const { parseErrors } = parse('mono bass [4@1/2 7@1/4]');
		expect(parseErrors).toHaveLength(0);
	});
});

describe('pipe / FX', () => {
	it('parses note with fx pipe using symbol: note lead [0] | fx(\\lpf)', () => {
		const { parseErrors } = parse('note lead [0] | fx(\\lpf)');
		expect(parseErrors).toHaveLength(0);
	});

	it("parses fx with modifier: note lead [0] | fx(\\lpf)'cutoff(1200)", () => {
		const { parseErrors } = parse("note lead [0] | fx(\\lpf)'cutoff(1200)");
		expect(parseErrors).toHaveLength(0);
	});
});

describe('multiple statements', () => {
	it('parses multiple named statements on separate lines', () => {
		const src = 'note lead [0 2 4]\nmono bass [0 1 2]\nset scale(minor)';
		const { parseErrors } = parse(src);
		expect(parseErrors).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// modifierSuffix — all modifier forms (truth table 1, spec §Modifier syntax)
// ---------------------------------------------------------------------------

describe("modifierSuffix — timing: 'lock and 'eager", () => {
	it("parses bare 'lock on a list", () => {
		expect(parse("note lead [0 2 4]'lock").parseErrors).toHaveLength(0);
	});

	it("parses bare 'eager (shorthand for eager(1))", () => {
		expect(parse("note lead [0 2 4]'eager").parseErrors).toHaveLength(0);
	});

	it("parses 'eager(1) on a list", () => {
		expect(parse("note lead [0 2 4]'eager(1)").parseErrors).toHaveLength(0);
	});

	it("parses 'eager(4) on a list", () => {
		expect(parse("note lead [0 2 4]'eager(4)").parseErrors).toHaveLength(0);
	});

	it("parses 'lock on an element inside a list", () => {
		expect(parse("note lead [0rand7'lock 2 4]").parseErrors).toHaveLength(0);
	});

	it("parses 'eager(2) on an element inside a list", () => {
		expect(parse("note lead [0rand7'eager(2) 2 4]").parseErrors).toHaveLength(0);
	});

	it("parses inner 'lock beating outer 'eager(3)", () => {
		expect(parse("note lead [0rand7'lock]'eager(3)").parseErrors).toHaveLength(0);
	});

	it("parses inner 'eager(2) beating outer 'lock", () => {
		expect(parse("note lead [0rand7'eager(2)]'lock").parseErrors).toHaveLength(0);
	});
});

describe("modifierSuffix — sequence traversal: 'shuf, 'pick, 'wran", () => {
	it("parses 'shuf on a list", () => {
		expect(parse("note lead [0 1 2 3]'shuf").parseErrors).toHaveLength(0);
	});

	it("parses 'pick on a list", () => {
		expect(parse("note lead [0 1 2 3]'pick").parseErrors).toHaveLength(0);
	});

	it("parses 'wran on a list with weights", () => {
		expect(parse("note lead [0?2 1?1 2?3]'wran").parseErrors).toHaveLength(0);
	});

	it("parses 'wran on a list without explicit weights", () => {
		expect(parse("note lead [0 1 2]'wran").parseErrors).toHaveLength(0);
	});
});

describe("modifierSuffix — filter: 'stut and 'maybe", () => {
	it("parses bare 'stut (default count 2)", () => {
		expect(parse("note lead [0 2 4]'stut").parseErrors).toHaveLength(0);
	});

	it("parses 'stut(4) with fixed count", () => {
		expect(parse("note lead [0 2 4]'stut(4)").parseErrors).toHaveLength(0);
	});

	it("parses 'stut with random count: 'stut(2rand4)", () => {
		expect(parse("note lead [0 2 4]'stut(2rand4)").parseErrors).toHaveLength(0);
	});

	it("parses 'stut with locked count: 'stut(2rand4'lock)", () => {
		expect(parse("note lead [0 2 4]'stut(2rand4'lock)").parseErrors).toHaveLength(0);
	});

	it("parses 'stut with eager count: 'stut(2rand4'eager(4))", () => {
		expect(parse("note lead [0 2 4]'stut(2rand4'eager(4))").parseErrors).toHaveLength(0);
	});

	it("parses bare 'maybe (default p 0.5)", () => {
		expect(parse("note lead [0 2 4]'maybe").parseErrors).toHaveLength(0);
	});

	it("parses 'maybe(0.8) with explicit probability", () => {
		expect(parse("note lead [0 2 4]'maybe(0.8)").parseErrors).toHaveLength(0);
	});
});

describe("modifierSuffix — scheduling: 'n, 'at, 'legato, 'offset", () => {
	it("parses bare 'n (play once)", () => {
		expect(parse("note lead [0 1 2]'n").parseErrors).toHaveLength(0);
	});

	it("parses 'n(4)", () => {
		expect(parse("note lead [0 1 2]'n(4)").parseErrors).toHaveLength(0);
	});

	it("parses 'at(0) integer offset", () => {
		expect(parse("note lead [0 1 2]'at(0)").parseErrors).toHaveLength(0);
	});

	it("parses 'at(3/4) fractional offset", () => {
		expect(parse("note lead [0 1 2]'at(3/4)").parseErrors).toHaveLength(0);
	});

	it("parses 'at(1) whole-cycle offset", () => {
		expect(parse("note lead [0 1 2]'at(1)").parseErrors).toHaveLength(0);
	});

	it("parses 'at(-1/8) negative fractional offset", () => {
		expect(parse("note lead [0 1 2]'at(-1/8)").parseErrors).toHaveLength(0);
	});

	it("parses 'n combined with 'at: 'n'at(1/4)", () => {
		expect(parse("note lead [0 1 2]'n'at(1/4)").parseErrors).toHaveLength(0);
	});

	it("parses 'legato(0.8)", () => {
		expect(parse("note lead [0 2 4]'legato(0.8)").parseErrors).toHaveLength(0);
	});

	it("parses 'legato with stochastic arg: 'legato(0.5rand1.2)", () => {
		expect(parse("note lead [0 2 4]'legato(0.5rand1.2)").parseErrors).toHaveLength(0);
	});

	it("parses 'offset(20)", () => {
		expect(parse("note lead [0 2 4]'offset(20)").parseErrors).toHaveLength(0);
	});

	it("parses 'offset with negative value: 'offset(-10)", () => {
		expect(parse("note lead [0 2 4]'offset(-10)").parseErrors).toHaveLength(0);
	});
});

describe('modifierSuffix — chaining', () => {
	it("parses chained modifiers: 'eager(1)'stut(2)", () => {
		expect(parse("note lead [0 2 4]'eager(1)'stut(2)").parseErrors).toHaveLength(0);
	});

	it("parses element modifier plus list modifier: [0rand7'lock 2]'shuf", () => {
		expect(parse("note lead [0rand7'lock 2]'shuf").parseErrors).toHaveLength(0);
	});
});

describe('sequenceElement — !n inline repetition', () => {
	it('parses note lead [1!4]', () => {
		expect(parse('note lead [1!4]').parseErrors).toHaveLength(0);
	});

	it('parses note lead [1!2 3!3]', () => {
		expect(parse('note lead [1!2 3!3]').parseErrors).toHaveLength(0);
	});

	it('parses note lead [0rand7!4]', () => {
		expect(parse('note lead [0rand7!4]').parseErrors).toHaveLength(0);
	});

	it('parses note lead [2b!2] — accidental + repetition', () => {
		expect(parse('note lead [2b!2]').parseErrors).toHaveLength(0);
	});
});

describe('BlockComment', () => {
	it('ignores a block comment before a note statement', () => {
		expect(parse('/* comment */ note lead [0 2 4]').parseErrors).toHaveLength(0);
	});

	it('ignores a multi-line block comment', () => {
		expect(parse('/* line one\nline two */ note lead [0]').parseErrors).toHaveLength(0);
	});

	it('ignores a block comment on its own line', () => {
		expect(parse('note lead [0]\n/* comment */\nnote lead [2]').parseErrors).toHaveLength(0);
	});
});

describe('modifierSuffix — error cases', () => {
	it("errors on bare 'stut with no preceding token", () => {
		expect(parse("'stut").parseErrors.length).toBeGreaterThan(0);
	});

	it('errors on modifier on a bare note keyword (no list)', () => {
		expect(parse("note 'stut").parseErrors.length).toBeGreaterThan(0);
	});

	it('space between tick and modifier name is currently accepted (spec §12 violation — known gap)', () => {
		// Spec §12 says ' lock (with a space) should be a parse error.
		// Chevrotain's error-recovery silently accepts it. This test documents the
		// current behaviour so any future fix is detectable as a test change.
		const { parseErrors } = parse("note lead [0]' lock");
		expect(parseErrors).toHaveLength(0);
	});
});

describe('rests (_)', () => {
	it('parses a rest in a note pattern: note lead [0 2 _ 4]', () => {
		expect(parse('note lead [0 2 _ 4]').parseErrors).toHaveLength(0);
	});

	it('parses a rest at the start: note lead [_ 2 4]', () => {
		expect(parse('note lead [_ 2 4]').parseErrors).toHaveLength(0);
	});

	it('parses a rest at the end: note lead [0 2 _]', () => {
		expect(parse('note lead [0 2 _]').parseErrors).toHaveLength(0);
	});

	it('parses a list of all rests: note lead [_ _ _]', () => {
		expect(parse('note lead [_ _ _]').parseErrors).toHaveLength(0);
	});

	it('parses a rest in a mono pattern: mono bass [0 _ 2]', () => {
		expect(parse('mono bass [0 _ 2]').parseErrors).toHaveLength(0);
	});

	it('parses a nested sublist with a rest: note lead [0 [_ 2] 4]', () => {
		expect(parse('note lead [0 [_ 2] 4]').parseErrors).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// Generator naming (issue #2)
// ---------------------------------------------------------------------------

describe('generator naming — valid forms', () => {
	it('parses note with a name: note lead [0 2 4]', () => {
		expect(parse('note lead [0 2 4]').parseErrors).toHaveLength(0);
	});

	it('parses mono with a name: mono bass [0 1 2 3]', () => {
		expect(parse('mono bass [0 1 2 3]').parseErrors).toHaveLength(0);
	});

	it('parses sample with a name: sample drums [0 1 2]', () => {
		expect(parse('sample drums [0 1 2]').parseErrors).toHaveLength(0);
	});

	it('parses slice with a name: slice loop [0 1 2]', () => {
		expect(parse('slice loop [0 1 2]').parseErrors).toHaveLength(0);
	});

	it('parses cloud with a name: cloud pad [0 1 2]', () => {
		expect(parse('cloud pad [0 1 2]').parseErrors).toHaveLength(0);
	});

	it('parses note with synthdef and name: note(\\moog) lead [0 2 4]', () => {
		expect(parse('note(\\moog) lead [0 2 4]').parseErrors).toHaveLength(0);
	});

	it("parses note with name and modifier: note lead [0 2 4]'stut(2)", () => {
		expect(parse("note lead [0 2 4]'stut(2)").parseErrors).toHaveLength(0);
	});

	it('parses note with name and transposition: note lead [0 2 4] + 2', () => {
		expect(parse('note lead [0 2 4] + 2').parseErrors).toHaveLength(0);
	});

	it('parses note with name and fx pipe: note lead [0 2 4] | fx(\\lpf)', () => {
		expect(parse('note lead [0 2 4] | fx(\\lpf)').parseErrors).toHaveLength(0);
	});

	it('parses inline decorator with named generator: @scale(minor) note lead [0 1 2]', () => {
		expect(parse('@scale(minor) note lead [0 1 2]').parseErrors).toHaveLength(0);
	});

	it('parses block decorator with named generator', () => {
		expect(parse('@scale(minor)\n  note lead [0 1 2]').parseErrors).toHaveLength(0);
	});

	it('parses multiple named generators on separate lines', () => {
		const src = 'note lead [0 2 4]\nmono bass [0 1 2]';
		expect(parse(src).parseErrors).toHaveLength(0);
	});
});

describe('generator naming — unnamed patterns are errors', () => {
	it('errors on note without a name: note [0 2 4]', () => {
		expect(parse('note [0 2 4]').parseErrors.length).toBeGreaterThan(0);
	});

	it('errors on mono without a name: mono [0 1 2 3]', () => {
		expect(parse('mono [0 1 2 3]').parseErrors.length).toBeGreaterThan(0);
	});

	it('errors on sample without a name: sample [0 1 2]', () => {
		expect(parse('sample [0 1 2]').parseErrors.length).toBeGreaterThan(0);
	});

	it('errors on note(\\synthdef) without a name: note(\\moog) [0 2 4]', () => {
		expect(parse('note(\\moog) [0 2 4]').parseErrors.length).toBeGreaterThan(0);
	});
});

describe('derived generators — child:parent syntax', () => {
	it("parses derived generator: sample perc:drums 'at(1/8)", () => {
		expect(parse("sample perc:drums 'at(1/8)").parseErrors).toHaveLength(0);
	});

	it('parses derived generator without modifiers: note harm:lead [0 4 7]', () => {
		expect(parse('note harm:lead [0 4 7]').parseErrors).toHaveLength(0);
	});

	it('parses derived generator with synthdef: note(\\moog) harm:lead [0 4 7]', () => {
		expect(parse('note(\\moog) harm:lead [0 4 7]').parseErrors).toHaveLength(0);
	});

	it('parses derived generator with fx pipe', () => {
		expect(parse('note harm:lead [0 4 7] | fx(\\lpf)').parseErrors).toHaveLength(0);
	});
});
