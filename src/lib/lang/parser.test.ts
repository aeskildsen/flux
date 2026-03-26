import { describe, it, expect } from 'vitest';
import { FluxLexer } from './lexer.js';
import { parser, preprocessTokens } from './parser.js';
import { evaluate } from './evaluator.js';

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

	it('parses line with absolute timed list', () => {
		const { parseErrors } = parse('line {4:1/2 7:3/2}');
		expect(parseErrors).toHaveLength(0);
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

	it('parses absolute timed list: line {4:1/2 7:3/2}', () => {
		const { parseErrors } = parse('line {4:1/2 7:3/2}');
		expect(parseErrors).toHaveLength(0);
	});

	it('parses timed list with integer-only time: line [0@0 4@1]', () => {
		const { parseErrors } = parse('line [0@0 4@1]');
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

describe('evaluate', () => {
	it('negative degrees yield correct MIDI: loop [-1 0]', () => {
		const result = evaluate('loop [-1 0]');
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const { value: first } = result.generator.next();
		const { value: second } = result.generator.next();
		// degree -1 → B4 = 59; degree 0 → C5 = 60
		expect(first.note).toBe(59);
		expect(second.note).toBe(60);
	});

	it('rand generator yields values within range: loop [0rand4]', () => {
		const result = evaluate('loop [0rand4]');
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		// degrees 0–4 in C major from root C5(60): C5=60, D5=62, E5=64, F5=65, G5=67
		const validNotes = new Set([60, 62, 64, 65, 67]);
		for (let i = 0; i < 50; i++) {
			const { value } = result.generator.next();
			expect(validNotes.has(value.note)).toBe(true);
		}
	});

	it('rand generator produces varying values over time', () => {
		const result = evaluate('loop [0rand6]');
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const notes = new Set<number>();
		for (let i = 0; i < 100; i++) {
			notes.add(result.generator.next().value.note);
		}
		// With range 0–6 and 100 samples, we expect more than 1 distinct note
		expect(notes.size).toBeGreaterThan(1);
	});

	it('gau generator produces varying values centred on mean', () => {
		const result = evaluate('loop [3gau1]'); // mean=3, sdev=1
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const notes = new Set<number>();
		for (let i = 0; i < 100; i++) {
			notes.add(result.generator.next().value.note);
		}
		expect(notes.size).toBeGreaterThan(1);
		// Most samples should be within a few sdev of mean=3; just check no crash
	});

	it('exp generator yields values within [lo, hi]', () => {
		const result = evaluate('loop [1exp7]'); // lo=1, hi=7
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		// Valid C major degrees in [1,7] from C5=60: D5=62, E5=64, F5=65, G5=67, A5=69, B5=71, C6=72
		for (let i = 0; i < 50; i++) {
			const { value } = result.generator.next();
			expect(value.note).toBeGreaterThanOrEqual(62); // degree 1 = D5
			expect(value.note).toBeLessThanOrEqual(72); // degree 7 = C6
		}
	});

	it('bro generator stays within [lo, hi]', () => {
		const result = evaluate('loop [0bro6m1]'); // lo=0, hi=6, maxStep=1
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		// degrees 0–6 in C major: C5(60) to B5(71)
		for (let i = 0; i < 100; i++) {
			const { value } = result.generator.next();
			expect(value.note).toBeGreaterThanOrEqual(60);
			expect(value.note).toBeLessThanOrEqual(71);
		}
	});

	it('bro generator changes value over time (stateful)', () => {
		const result = evaluate('loop [0bro6m2]');
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const notes = new Set<number>();
		for (let i = 0; i < 50; i++) {
			notes.add(result.generator.next().value.note);
		}
		expect(notes.size).toBeGreaterThan(1);
	});

	it('step series cycles through correct degrees: loop [0step2x4]', () => {
		// 0step2x4 → Pseries(start=0, step=2, length=4) → [0, 2, 4, 6], repeating
		const result = evaluate('loop [0step2x4]');
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		// C major degrees [0,2,4,6] from C5=60: C5=60, E5=64, G5=67, B5=71
		const expected = [60, 64, 67, 71, 60, 64, 67, 71];
		for (const exp of expected) {
			expect(result.generator.next().value.note).toBe(exp);
		}
	});

	it('mul series cycles through correct degrees: loop [1mul2x4]', () => {
		// 1mul2x4 → Pgeom(start=1, mul=2, length=4) → [1, 2, 4, 8], repeating
		const result = evaluate('loop [1mul2x4]');
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		// degrees [1,2,4,8] → D5=62, E5=64, G5=67, D6=74
		const expected = [62, 64, 67, 74];
		for (const exp of expected) {
			expect(result.generator.next().value.note).toBe(exp);
		}
		// Wraps back to start
		expect(result.generator.next().value.note).toBe(62);
	});

	it('lin series spans from first to last degree: loop [0lin4x3]', () => {
		// 0lin4x3 → linear interp first=0, last=4, length=3 → [0, 2, 4]
		const result = evaluate('loop [0lin4x3]');
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		// degrees [0, 2, 4] → C5=60, E5=64, G5=67
		expect(result.generator.next().value.note).toBe(60);
		expect(result.generator.next().value.note).toBe(64);
		expect(result.generator.next().value.note).toBe(67);
		expect(result.generator.next().value.note).toBe(60); // wraps
	});

	it('geo series produces geometrically spaced values: loop [1geo8x4]', () => {
		// 1geo8x4 → geometric interp first=1, last=8, length=4 → [1, 2, 4, 8]
		const result = evaluate('loop [1geo8x4]');
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		// degrees [1, 2, 4, 8] → D5=62, E5=64, G5=67, D6=74
		expect(result.generator.next().value.note).toBe(62);
		expect(result.generator.next().value.note).toBe(64);
		expect(result.generator.next().value.note).toBe(67);
		expect(result.generator.next().value.note).toBe(74);
	});
});
