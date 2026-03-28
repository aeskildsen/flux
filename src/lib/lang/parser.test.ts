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

describe('loopStatement', () => {
	it('parses loop with a sequence body', () => {
		const { parseErrors } = parse('loop [0 2 4]');
		expect(parseErrors).toHaveLength(0);
	});

	it('errors on loop without a sequence body', () => {
		const { parseErrors } = parse("loop 'stut");
		expect(parseErrors.length).toBeGreaterThan(0);
	});

	it('errors on bare loop keyword', () => {
		const { parseErrors } = parse('loop');
		expect(parseErrors.length).toBeGreaterThan(0);
	});

	it('parses negative degrees: loop [-1 0 2]', () => {
		const { parseErrors } = parse('loop [-1 0 2]');
		expect(parseErrors).toHaveLength(0);
	});

	it('parses mixed positive and negative degrees: loop [-3 -1 0 2 4]', () => {
		const { parseErrors } = parse('loop [-3 -1 0 2 4]');
		expect(parseErrors).toHaveLength(0);
	});
});

describe('lineStatement', () => {
	it('parses line with a sequence body', () => {
		const { parseErrors } = parse('line [0 1 2 3]');
		expect(parseErrors).toHaveLength(0);
	});

	it('parses line with synthdef arg', () => {
		const { parseErrors } = parse('line("moog") [0 1 2]');
		expect(parseErrors).toHaveLength(0);
	});

	it('errors on bare line keyword', () => {
		const { parseErrors } = parse('line');
		expect(parseErrors.length).toBeGreaterThan(0);
	});
});

describe('loopStatement — synthdef and full form', () => {
	it('parses loop with synthdef arg', () => {
		const { parseErrors } = parse('loop("moog") [0 2 4]');
		expect(parseErrors).toHaveLength(0);
	});
});

describe('setStatement', () => {
	it('parses set scale("minor")', () => {
		const { parseErrors } = parse('set scale("minor")');
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

describe('fxAssignment', () => {
	it('parses a named send_fx assignment', () => {
		const { parseErrors } = parse('reverb = send_fx("reverb")');
		expect(parseErrors).toHaveLength(0);
	});

	it('parses send_fx assignment with modifier', () => {
		const { parseErrors } = parse('reverb = send_fx("reverb")\'room(0.5)');
		expect(parseErrors).toHaveLength(0);
	});
});

describe('masterFxStatement', () => {
	it('parses master_fx("limiter")', () => {
		const { parseErrors } = parse('master_fx("limiter")');
		expect(parseErrors).toHaveLength(0);
	});

	it('parses master_fx with modifier', () => {
		const { parseErrors } = parse('master_fx("limiter")\'gain(0.8)');
		expect(parseErrors).toHaveLength(0);
	});
});

describe('accidentals', () => {
	it('parses a flat degree: loop [2b]', () => {
		const { parseErrors } = parse('loop [2b]');
		expect(parseErrors).toHaveLength(0);
	});

	it('parses a sharp degree: loop [4#]', () => {
		const { parseErrors } = parse('loop [4#]');
		expect(parseErrors).toHaveLength(0);
	});

	it('parses double flat: loop [3bb]', () => {
		const { parseErrors } = parse('loop [3bb]');
		expect(parseErrors).toHaveLength(0);
	});

	it('parses double sharp: loop [4##]', () => {
		const { parseErrors } = parse('loop [4##]');
		expect(parseErrors).toHaveLength(0);
	});

	it('parses a mixed list with accidentals: loop [0 2b 4#]', () => {
		const { parseErrors } = parse('loop [0 2b 4#]');
		expect(parseErrors).toHaveLength(0);
	});

	it('errors on accidental after generator expression: loop [0rand4b]', () => {
		// 0rand4b — `b` after `4` in a generator context should be a lex/parse error
		// because degreeLiterals are only plain integers, not generators
		const { parseErrors, lexErrors } = parse('loop [0rand4b]');
		expect(parseErrors.length + lexErrors.length).toBeGreaterThan(0);
	});
});

describe('transposition', () => {
	it('parses loop with + transposition: loop [0 2] + 3', () => {
		const { parseErrors } = parse('loop [0 2] + 3');
		expect(parseErrors).toHaveLength(0);
	});

	it('parses loop with - transposition: loop [0 2] - 1', () => {
		const { parseErrors } = parse('loop [0 2] - 1');
		expect(parseErrors).toHaveLength(0);
	});

	it('parses transposition with generator RHS: loop [0 2] + 0rand3', () => {
		const { parseErrors } = parse('loop [0 2] + 0rand3');
		expect(parseErrors).toHaveLength(0);
	});

	it('errors on double-negative transposition: loop [0] - -4', () => {
		const { parseErrors } = parse('loop [0] - -4');
		expect(parseErrors.length).toBeGreaterThan(0);
	});
});

describe('continuation modifiers', () => {
	it('parses a continuation modifier on an indented line', () => {
		const { parseErrors } = parse("loop [0 1]\n  'stut(2)");
		expect(parseErrors).toHaveLength(0);
	});

	it('parses multiple continuation modifiers', () => {
		const { parseErrors } = parse("loop [0 1]\n  'stut(2)\n  'legato(0.8)");
		expect(parseErrors).toHaveLength(0);
	});
});

describe('decorators', () => {
	it('parses an inline decorator: @scale("minor") loop [0 1 2]', () => {
		const { parseErrors } = parse('@scale("minor") loop [0 1 2]');
		expect(parseErrors).toHaveLength(0);
	});

	it('parses a block decorator with indented loop', () => {
		const { parseErrors } = parse('@scale("minor")\n  loop [0 1 2]');
		expect(parseErrors).toHaveLength(0);
	});

	it('parses @key compound decorator: @key(g# lydian) loop [0]', () => {
		const { parseErrors } = parse('@key(g# lydian) loop [0]');
		expect(parseErrors).toHaveLength(0);
	});

	it('parses nested decorator blocks', () => {
		const src = '@root(7)\n  @scale("minor")\n    loop [0 1 2]';
		const { parseErrors } = parse(src);
		expect(parseErrors).toHaveLength(0);
	});
});

describe('timed lists', () => {
	it('parses relative timed list: line [4@1/2 7@1/4]', () => {
		const { parseErrors } = parse('line [4@1/2 7@1/4]');
		expect(parseErrors).toHaveLength(0);
	});

	it('parses timed list with integer-only time: line [0@0 4@1]', () => {
		const { parseErrors } = parse('line [0@0 4@1]');
		expect(parseErrors).toHaveLength(0);
	});

	it('parses relative timed list where first element has no @: line [0 2@1]', () => {
		const { parseErrors } = parse('line [0 2@1]');
		expect(parseErrors).toHaveLength(0);
	});

	it('parses relative timed list with @ on a later element: line [0 4 7@1/2]', () => {
		const { parseErrors } = parse('line [0 4 7@1/2]');
		expect(parseErrors).toHaveLength(0);
	});

	it('parses relative timed list with accidental before @: line [0 2b@1/4]', () => {
		const { parseErrors } = parse('line [0 2b@1/4]');
		expect(parseErrors).toHaveLength(0);
	});

	it('parses float time: line [0 2@1.5]', () => {
		const { parseErrors } = parse('line [0 2@1.5]');
		expect(parseErrors).toHaveLength(0);
	});

	it('parses float time at cycle start: line [0@0.0 4@0.5]', () => {
		const { parseErrors } = parse('line [0@0.0 4@0.5]');
		expect(parseErrors).toHaveLength(0);
	});
});

describe('pipe / FX', () => {
	it('parses loop with fx pipe: loop [0] | fx("lpf")', () => {
		const { parseErrors } = parse('loop [0] | fx("lpf")');
		expect(parseErrors).toHaveLength(0);
	});

	it('parses fx with modifier: loop [0] | fx("lpf")\'cutoff(1200)', () => {
		const { parseErrors } = parse('loop [0] | fx("lpf")\'cutoff(1200)');
		expect(parseErrors).toHaveLength(0);
	});
});

describe('multiple statements', () => {
	it('parses multiple statements on separate lines', () => {
		const src = 'loop [0 2 4]\nline [0 1 2]\nset scale("minor")';
		const { parseErrors } = parse(src);
		expect(parseErrors).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// modifierSuffix — all modifier forms (truth table 1, spec §Modifier syntax)
// ---------------------------------------------------------------------------

describe("modifierSuffix — timing: 'lock and 'eager", () => {
	it("parses bare 'lock on a list", () => {
		expect(parse("loop [0 2 4]'lock").parseErrors).toHaveLength(0);
	});

	it("parses bare 'eager (shorthand for eager(1))", () => {
		expect(parse("loop [0 2 4]'eager").parseErrors).toHaveLength(0);
	});

	it("parses 'eager(1) on a list", () => {
		expect(parse("loop [0 2 4]'eager(1)").parseErrors).toHaveLength(0);
	});

	it("parses 'eager(4) on a list", () => {
		expect(parse("loop [0 2 4]'eager(4)").parseErrors).toHaveLength(0);
	});

	it("parses 'lock on an element inside a list", () => {
		expect(parse("loop [0rand7'lock 2 4]").parseErrors).toHaveLength(0);
	});

	it("parses 'eager(2) on an element inside a list", () => {
		expect(parse("loop [0rand7'eager(2) 2 4]").parseErrors).toHaveLength(0);
	});

	it("parses inner 'lock beating outer 'eager(3)", () => {
		expect(parse("loop [0rand7'lock]'eager(3)").parseErrors).toHaveLength(0);
	});

	it("parses inner 'eager(2) beating outer 'lock", () => {
		expect(parse("loop [0rand7'eager(2)]'lock").parseErrors).toHaveLength(0);
	});
});

describe("modifierSuffix — sequence traversal: 'shuf, 'pick, 'wran", () => {
	it("parses 'shuf on a list", () => {
		expect(parse("loop [0 1 2 3]'shuf").parseErrors).toHaveLength(0);
	});

	it("parses 'pick on a list", () => {
		expect(parse("loop [0 1 2 3]'pick").parseErrors).toHaveLength(0);
	});

	it("parses 'wran on a list with weights", () => {
		expect(parse("loop [0?2 1?1 2?3]'wran").parseErrors).toHaveLength(0);
	});

	it("parses 'wran on a list without explicit weights", () => {
		expect(parse("loop [0 1 2]'wran").parseErrors).toHaveLength(0);
	});
});

describe("modifierSuffix — filter: 'stut and 'maybe", () => {
	it("parses bare 'stut (default count 2)", () => {
		expect(parse("loop [0 2 4]'stut").parseErrors).toHaveLength(0);
	});

	it("parses 'stut(4) with fixed count", () => {
		expect(parse("loop [0 2 4]'stut(4)").parseErrors).toHaveLength(0);
	});

	it("parses 'stut with random count: 'stut(2rand4)", () => {
		expect(parse("loop [0 2 4]'stut(2rand4)").parseErrors).toHaveLength(0);
	});

	it("parses 'stut with locked count: 'stut(2rand4'lock)", () => {
		expect(parse("loop [0 2 4]'stut(2rand4'lock)").parseErrors).toHaveLength(0);
	});

	it("parses 'stut with eager count: 'stut(2rand4'eager(4))", () => {
		expect(parse("loop [0 2 4]'stut(2rand4'eager(4))").parseErrors).toHaveLength(0);
	});

	it("parses bare 'maybe (default p 0.5)", () => {
		expect(parse("loop [0 2 4]'maybe").parseErrors).toHaveLength(0);
	});

	it("parses 'maybe(0.8) with explicit probability", () => {
		expect(parse("loop [0 2 4]'maybe(0.8)").parseErrors).toHaveLength(0);
	});
});

describe("modifierSuffix — loop/line control: 'repeat, 'at, 'legato, 'offset, 'mono", () => {
	it("parses bare 'repeat (indefinite)", () => {
		expect(parse("line [0 1 2]'repeat").parseErrors).toHaveLength(0);
	});

	it("parses 'repeat(4)", () => {
		expect(parse("line [0 1 2]'repeat(4)").parseErrors).toHaveLength(0);
	});

	it("parses 'at(0) integer offset", () => {
		expect(parse("line [0 1 2]'at(0)").parseErrors).toHaveLength(0);
	});

	it("parses 'at(3/4) fractional offset", () => {
		expect(parse("line [0 1 2]'at(3/4)").parseErrors).toHaveLength(0);
	});

	it("parses 'at(1) whole-cycle offset", () => {
		expect(parse("line [0 1 2]'at(1)").parseErrors).toHaveLength(0);
	});

	it("parses 'at(-1/8) negative fractional offset", () => {
		expect(parse("line [0 1 2]'at(-1/8)").parseErrors).toHaveLength(0);
	});

	it("parses 'legato(0.8)", () => {
		expect(parse("loop [0 2 4]'legato(0.8)").parseErrors).toHaveLength(0);
	});

	it("parses 'legato with stochastic arg: 'legato(0.5rand1.2)", () => {
		expect(parse("loop [0 2 4]'legato(0.5rand1.2)").parseErrors).toHaveLength(0);
	});

	it("parses 'offset(20)", () => {
		expect(parse("loop [0 2 4]'offset(20)").parseErrors).toHaveLength(0);
	});

	it("parses 'offset with negative value: 'offset(-10)", () => {
		expect(parse("loop [0 2 4]'offset(-10)").parseErrors).toHaveLength(0);
	});

	it("parses bare 'mono", () => {
		expect(parse("loop [0 2 4]'mono").parseErrors).toHaveLength(0);
	});
});

describe('modifierSuffix — chaining', () => {
	it("parses chained modifiers: 'eager(1)'stut(2)", () => {
		expect(parse("loop [0 2 4]'eager(1)'stut(2)").parseErrors).toHaveLength(0);
	});

	it("parses element modifier plus list modifier: [0rand7'lock 2]'shuf", () => {
		expect(parse("loop [0rand7'lock 2]'shuf").parseErrors).toHaveLength(0);
	});
});

describe('sequenceElement — !n inline repetition', () => {
	it('parses loop [1!4]', () => {
		expect(parse('loop [1!4]').parseErrors).toHaveLength(0);
	});

	it('parses loop [1!2 3!3]', () => {
		expect(parse('loop [1!2 3!3]').parseErrors).toHaveLength(0);
	});

	it('parses loop [0rand7!4]', () => {
		expect(parse('loop [0rand7!4]').parseErrors).toHaveLength(0);
	});

	it('parses loop [2b!2] — accidental + repetition', () => {
		expect(parse('loop [2b!2]').parseErrors).toHaveLength(0);
	});
});

describe('BlockComment', () => {
	it('ignores a block comment before a loop statement', () => {
		expect(parse('/* comment */ loop [0 2 4]').parseErrors).toHaveLength(0);
	});

	it('ignores a multi-line block comment', () => {
		expect(parse('/* line one\nline two */ loop [0]').parseErrors).toHaveLength(0);
	});

	it('ignores a block comment on its own line', () => {
		expect(parse('loop [0]\n/* comment */\nloop [2]').parseErrors).toHaveLength(0);
	});
});

describe('modifierSuffix — error cases', () => {
	it("errors on bare 'stut with no preceding token", () => {
		expect(parse("'stut").parseErrors.length).toBeGreaterThan(0);
	});

	it('errors on modifier on a bare loop keyword (no list)', () => {
		expect(parse("loop 'stut").parseErrors.length).toBeGreaterThan(0);
	});

	it('space between tick and modifier name is currently accepted (spec §12 violation — known gap)', () => {
		// Spec §12 says ' lock (with a space) should be a parse error.
		// Chevrotain's error-recovery silently accepts it. This test documents the
		// current behaviour so any future fix is detectable as a test change.
		const { parseErrors } = parse("loop [0]' lock");
		expect(parseErrors).toHaveLength(0);
	});
});

describe('rests (_)', () => {
	it('parses a rest in a loop: loop [0 2 _ 4]', () => {
		expect(parse('loop [0 2 _ 4]').parseErrors).toHaveLength(0);
	});

	it('parses a rest at the start: loop [_ 2 4]', () => {
		expect(parse('loop [_ 2 4]').parseErrors).toHaveLength(0);
	});

	it('parses a rest at the end: loop [0 2 _]', () => {
		expect(parse('loop [0 2 _]').parseErrors).toHaveLength(0);
	});

	it('parses a list of all rests: loop [_ _ _]', () => {
		expect(parse('loop [_ _ _]').parseErrors).toHaveLength(0);
	});

	it('parses a rest in a line: line [0 _ 2]', () => {
		expect(parse('line [0 _ 2]').parseErrors).toHaveLength(0);
	});

	it('parses a nested sublist with a rest: loop [0 [_ 2] 4]', () => {
		expect(parse('loop [0 [_ 2] 4]').parseErrors).toHaveLength(0);
	});
});
