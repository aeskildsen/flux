import { describe, expect, it } from 'vitest';
import {
	FluxLexer,
	Integer,
	Float,
	LineComment,
	Note,
	Mono,
	Sample,
	Slice,
	Cloud,
	Fx,
	Set,
	Tick,
	Identifier,
	LBracket,
	RBracket,
	LParen,
	RParen,
	Tilde,
	Rand,
	Gau,
	Exp,
	Bro,
	BroStep,
	Step,
	Mul,
	Lin,
	Geo,
	LenSep,
	Question,
	Symbol,
	Sharp,
	Flat,
	Bang,
	Percent,
	ParamSigil,
	Utf8Kw,
	LCurly,
	RCurly
} from './lexer.js';

describe('FluxLexer', () => {
	describe('LineComment', () => {
		it('tokenizes a full-line comment', () => {
			const { tokens, errors } = FluxLexer.tokenize('// this is a comment');
			expect(errors).toHaveLength(0);
			expect(tokens).toHaveLength(1);
			expect(tokens[0].tokenType).toBe(LineComment);
			expect(tokens[0].image).toBe('// this is a comment');
		});

		it('does not consume the trailing newline', () => {
			const { tokens } = FluxLexer.tokenize('// comment\nnote');
			// LineComment stops at end of line; Note follows on the next line
			expect(tokens[0].tokenType).toBe(LineComment);
			expect(tokens[0].image).toBe('// comment');
			expect(tokens[1].tokenType).toBe(Note);
		});

		it('an empty comment is still a comment', () => {
			const { tokens, errors } = FluxLexer.tokenize('//');
			expect(errors).toHaveLength(0);
			expect(tokens[0].tokenType).toBe(LineComment);
		});
	});

	describe('Statement keywords', () => {
		it('tokenizes "note"', () => {
			const { tokens, errors } = FluxLexer.tokenize('note');
			expect(errors).toHaveLength(0);
			expect(tokens).toHaveLength(1);
			expect(tokens[0].tokenType).toBe(Note);
		});

		it('tokenizes "mono"', () => {
			const { tokens, errors } = FluxLexer.tokenize('mono');
			expect(errors).toHaveLength(0);
			expect(tokens[0].tokenType).toBe(Mono);
		});

		it('tokenizes "sample"', () => {
			const { tokens, errors } = FluxLexer.tokenize('sample');
			expect(errors).toHaveLength(0);
			expect(tokens[0].tokenType).toBe(Sample);
		});

		it('tokenizes "slice"', () => {
			const { tokens, errors } = FluxLexer.tokenize('slice');
			expect(errors).toHaveLength(0);
			expect(tokens[0].tokenType).toBe(Slice);
		});

		it('tokenizes "cloud"', () => {
			const { tokens, errors } = FluxLexer.tokenize('cloud');
			expect(errors).toHaveLength(0);
			expect(tokens[0].tokenType).toBe(Cloud);
		});

		it('tokenizes "fx"', () => {
			const { tokens, errors } = FluxLexer.tokenize('fx');
			expect(errors).toHaveLength(0);
			expect(tokens[0].tokenType).toBe(Fx);
		});

		it('"send_fx" tokenizes as Identifier (send FX removed)', () => {
			const { tokens, errors } = FluxLexer.tokenize('send_fx');
			expect(errors).toHaveLength(0);
			expect(tokens[0].tokenType).toBe(Identifier);
			expect(tokens[0].image).toBe('send_fx');
		});

		it('"master_fx" tokenizes as Identifier (master bus FX are UI-only)', () => {
			const { tokens, errors } = FluxLexer.tokenize('master_fx');
			expect(errors).toHaveLength(0);
			expect(tokens[0].tokenType).toBe(Identifier);
			expect(tokens[0].image).toBe('master_fx');
		});

		it('tokenizes "set"', () => {
			const { tokens, errors } = FluxLexer.tokenize('set');
			expect(errors).toHaveLength(0);
			expect(tokens[0].tokenType).toBe(Set);
		});

		it('keywords are case-sensitive — "Note" is not a Note token', () => {
			const { tokens } = FluxLexer.tokenize('Note');
			const hasNote = tokens.some((t) => t.tokenType === Note);
			expect(hasNote).toBe(false);
		});

		it('longer_alt: "noteCount" is a single Identifier, not Note + Identifier', () => {
			const { tokens, errors } = FluxLexer.tokenize('noteCount');
			expect(errors).toHaveLength(0);
			expect(tokens).toHaveLength(1);
			expect(tokens[0].tokenType).toBe(Identifier);
			expect(tokens[0].image).toBe('noteCount');
		});

		it('longer_alt: "notable" is a single Identifier, not Note + Identifier', () => {
			const { tokens, errors } = FluxLexer.tokenize('notable');
			expect(errors).toHaveLength(0);
			expect(tokens).toHaveLength(1);
			expect(tokens[0].tokenType).toBe(Identifier);
		});

		it('longer_alt: "monophonic" is a single Identifier, not Mono + Identifier', () => {
			const { tokens, errors } = FluxLexer.tokenize('monophonic');
			expect(errors).toHaveLength(0);
			expect(tokens).toHaveLength(1);
			expect(tokens[0].tokenType).toBe(Identifier);
		});
	});

	describe('Generator keywords', () => {
		it('tokenizes "rand" between integers: 0rand4', () => {
			const { tokens, errors } = FluxLexer.tokenize('0rand4');
			expect(errors).toHaveLength(0);
			expect(tokens).toHaveLength(3);
			expect(tokens[0].tokenType).toBe(Integer);
			expect(tokens[1].tokenType).toBe(Rand);
			expect(tokens[2].tokenType).toBe(Integer);
		});

		it('tokenizes float-rand: 0.rand4', () => {
			const { tokens, errors } = FluxLexer.tokenize('0.rand4');
			expect(errors).toHaveLength(0);
			// Float(`0.`) + Rand + Integer(`4`)
			expect(tokens[0].tokenType).toBe(Float);
			expect(tokens[1].tokenType).toBe(Rand);
			expect(tokens[2].tokenType).toBe(Integer);
		});

		it('tokenizes tilde shorthand: 0~4', () => {
			const { tokens, errors } = FluxLexer.tokenize('0~4');
			expect(errors).toHaveLength(0);
			expect(tokens[0].tokenType).toBe(Integer);
			expect(tokens[1].tokenType).toBe(Tilde);
			expect(tokens[2].tokenType).toBe(Integer);
		});

		it('tokenizes "gau": 0gau4', () => {
			const { tokens, errors } = FluxLexer.tokenize('0gau4');
			expect(errors).toHaveLength(0);
			expect(tokens[1].tokenType).toBe(Gau);
		});

		it('tokenizes "exp": 1exp7', () => {
			const { tokens, errors } = FluxLexer.tokenize('1exp7');
			expect(errors).toHaveLength(0);
			expect(tokens[0].tokenType).toBe(Integer);
			expect(tokens[1].tokenType).toBe(Exp);
			expect(tokens[2].tokenType).toBe(Integer);
		});

		it('tokenizes "bro" with "m" separator: 0bro10m2', () => {
			const { tokens, errors } = FluxLexer.tokenize('0bro10m2');
			expect(errors).toHaveLength(0);
			// Integer(0) Bro Integer(10) BroStep Integer(2)
			expect(tokens).toHaveLength(5);
			expect(tokens[0].tokenType).toBe(Integer);
			expect(tokens[1].tokenType).toBe(Bro);
			expect(tokens[2].tokenType).toBe(Integer);
			expect(tokens[3].tokenType).toBe(BroStep);
			expect(tokens[4].tokenType).toBe(Integer);
		});

		it('tokenizes "step" with "x" separator: 0step2x4', () => {
			const { tokens, errors } = FluxLexer.tokenize('0step2x4');
			expect(errors).toHaveLength(0);
			// Integer(0) Step Integer(2) LenSep Integer(4)
			expect(tokens).toHaveLength(5);
			expect(tokens[1].tokenType).toBe(Step);
			expect(tokens[3].tokenType).toBe(LenSep);
		});

		it('tokenizes "mul": 5mul2x4', () => {
			const { tokens, errors } = FluxLexer.tokenize('5mul2x4');
			expect(errors).toHaveLength(0);
			expect(tokens[1].tokenType).toBe(Mul);
			expect(tokens[3].tokenType).toBe(LenSep);
		});

		it('tokenizes "lin": 2lin7x8', () => {
			const { tokens, errors } = FluxLexer.tokenize('2lin7x8');
			expect(errors).toHaveLength(0);
			expect(tokens[1].tokenType).toBe(Lin);
		});

		it('tokenizes "geo": 2geo7x8', () => {
			const { tokens, errors } = FluxLexer.tokenize('2geo7x8');
			expect(errors).toHaveLength(0);
			expect(tokens[1].tokenType).toBe(Geo);
		});

		it('longer_alt: "random" is Identifier, not Rand + om', () => {
			const { tokens, errors } = FluxLexer.tokenize('random');
			expect(errors).toHaveLength(0);
			expect(tokens).toHaveLength(1);
			expect(tokens[0].tokenType).toBe(Identifier);
		});

		it('longer_alt: "expression" is Identifier, not Exp + ression', () => {
			const { tokens, errors } = FluxLexer.tokenize('expression');
			expect(errors).toHaveLength(0);
			expect(tokens).toHaveLength(1);
			expect(tokens[0].tokenType).toBe(Identifier);
		});
	});

	describe('Identifier', () => {
		it('tokenizes a plain identifier', () => {
			const { tokens, errors } = FluxLexer.tokenize('lock');
			expect(errors).toHaveLength(0);
			expect(tokens[0].tokenType).toBe(Identifier);
			expect(tokens[0].image).toBe('lock');
		});

		it('identifiers can contain underscores and digits', () => {
			const { tokens, errors } = FluxLexer.tokenize('my_var2');
			expect(errors).toHaveLength(0);
			expect(tokens[0].tokenType).toBe(Identifier);
		});
	});

	describe('Tick operator', () => {
		it('tokenizes a bare tick', () => {
			const { tokens, errors } = FluxLexer.tokenize("'");
			expect(errors).toHaveLength(0);
			expect(tokens).toHaveLength(1);
			expect(tokens[0].tokenType).toBe(Tick);
		});

		it("tick followed by identifier: 'lock → Tick + Identifier", () => {
			const { tokens, errors } = FluxLexer.tokenize("'lock");
			expect(errors).toHaveLength(0);
			expect(tokens).toHaveLength(2);
			expect(tokens[0].tokenType).toBe(Tick);
			expect(tokens[1].tokenType).toBe(Identifier);
		});
	});

	describe('Brackets and parens', () => {
		it('tokenizes [ and ]', () => {
			const { tokens, errors } = FluxLexer.tokenize('[1 2 3]');
			expect(errors).toHaveLength(0);
			expect(tokens[0].tokenType).toBe(LBracket);
			expect(tokens[tokens.length - 1].tokenType).toBe(RBracket);
		});

		it('tokenizes ( and )', () => {
			const { tokens, errors } = FluxLexer.tokenize('(42)');
			expect(errors).toHaveLength(0);
			expect(tokens[0].tokenType).toBe(LParen);
			expect(tokens[tokens.length - 1].tokenType).toBe(RParen);
		});
	});

	describe('Question operator', () => {
		it('tokenizes ? for wran weights: 3?2', () => {
			const { tokens, errors } = FluxLexer.tokenize('3?2');
			expect(errors).toHaveLength(0);
			expect(tokens[1].tokenType).toBe(Question);
		});
	});

	describe('Float literal', () => {
		it('tokenizes a float', () => {
			const { tokens, errors } = FluxLexer.tokenize('0.5');
			expect(errors).toHaveLength(0);
			expect(tokens).toHaveLength(1);
			expect(tokens[0].tokenType).toBe(Float);
			expect(tokens[0].image).toBe('0.5');
		});

		it('float wins over integer on "0.5"', () => {
			const { tokens } = FluxLexer.tokenize('0.5');
			expect(tokens[0].tokenType).toBe(Float);
			expect(tokens).toHaveLength(1);
		});

		it('tokenizes trailing-dot float "0." (used in 0.rand4)', () => {
			const { tokens, errors } = FluxLexer.tokenize('0.');
			expect(errors).toHaveLength(0);
			expect(tokens[0].tokenType).toBe(Float);
		});
	});

	describe('Integer literal', () => {
		it('tokenizes a plain integer', () => {
			const { tokens, errors } = FluxLexer.tokenize('42');
			expect(errors).toHaveLength(0);
			expect(tokens).toHaveLength(1);
			expect(tokens[0].tokenType).toBe(Integer);
			expect(tokens[0].image).toBe('42');
		});

		it('tokenizes multiple integers separated by whitespace', () => {
			const { tokens, errors } = FluxLexer.tokenize('0 1 2 3');
			expect(errors).toHaveLength(0);
			expect(tokens).toHaveLength(4);
			expect(tokens.every((t) => t.tokenType === Integer)).toBe(true);
		});
	});

	describe('Symbol', () => {
		it('tokenizes \\moog as a single Symbol token', () => {
			const { tokens, errors } = FluxLexer.tokenize('\\moog');
			expect(errors).toHaveLength(0);
			expect(tokens).toHaveLength(1);
			expect(tokens[0].tokenType).toBe(Symbol);
			expect(tokens[0].image).toBe('\\moog');
		});

		it('tokenizes \\minor as a single Symbol token', () => {
			const { tokens, errors } = FluxLexer.tokenize('\\minor');
			expect(errors).toHaveLength(0);
			expect(tokens[0].tokenType).toBe(Symbol);
			expect(tokens[0].image).toBe('\\minor');
		});

		it('symbol name can contain underscores and digits', () => {
			const { tokens, errors } = FluxLexer.tokenize('\\my_synth2');
			expect(errors).toHaveLength(0);
			expect(tokens[0].tokenType).toBe(Symbol);
			expect(tokens[0].image).toBe('\\my_synth2');
		});

		it('double-quoted string "moog" is NOT a valid token (lex error)', () => {
			const { errors } = FluxLexer.tokenize('"moog"');
			expect(errors.length).toBeGreaterThan(0);
		});

		it('bare backslash with no following identifier is a lex error', () => {
			const { errors } = FluxLexer.tokenize('\\ ');
			expect(errors.length).toBeGreaterThan(0);
		});
	});

	describe('WhiteSpace', () => {
		it('whitespace is skipped — not present in tokens array', () => {
			const { tokens } = FluxLexer.tokenize('note   42');
			expect(tokens).toHaveLength(2);
			expect(tokens[0].tokenType).toBe(Note);
			expect(tokens[1].tokenType).toBe(Integer);
		});

		it('newlines are also skipped', () => {
			const { tokens } = FluxLexer.tokenize('note\n42');
			expect(tokens).toHaveLength(2);
		});
	});

	describe('lex errors', () => {
		it('errors array is empty for fully recognized input', () => {
			const { errors } = FluxLexer.tokenize("note 0 1 2 ' // comment");
			expect(errors).toHaveLength(0);
		});

		it('errors array is non-empty for unrecognized characters', () => {
			// `§` is not in any token pattern
			const { errors } = FluxLexer.tokenize('§');
			expect(errors.length).toBeGreaterThan(0);
		});
	});

	describe('Accidentals', () => {
		it('2b tokenises as Integer("2") + Flat("b")', () => {
			const { tokens, errors } = FluxLexer.tokenize('2b');
			expect(errors).toHaveLength(0);
			expect(tokens).toHaveLength(2);
			expect(tokens[0].tokenType).toBe(Integer);
			expect(tokens[0].image).toBe('2');
			expect(tokens[1].tokenType).toBe(Flat);
			expect(tokens[1].image).toBe('b');
		});

		it('4# tokenises as Integer("4") + Sharp("#")', () => {
			const { tokens, errors } = FluxLexer.tokenize('4#');
			expect(errors).toHaveLength(0);
			expect(tokens).toHaveLength(2);
			expect(tokens[0].tokenType).toBe(Integer);
			expect(tokens[1].tokenType).toBe(Sharp);
		});

		it('3bb tokenises as Integer + Flat("bb") — greedy multi-flat token', () => {
			// Flat greedily consumes consecutive `b` chars to beat Identifier length
			const { tokens, errors } = FluxLexer.tokenize('3bb');
			expect(errors).toHaveLength(0);
			expect(tokens).toHaveLength(2);
			expect(tokens[0].tokenType).toBe(Integer);
			expect(tokens[1].tokenType).toBe(Flat);
			expect(tokens[1].image).toBe('bb');
		});

		it('4## tokenises as Integer + Sharp + Sharp', () => {
			const { tokens, errors } = FluxLexer.tokenize('4##');
			expect(errors).toHaveLength(0);
			expect(tokens).toHaveLength(3);
			expect(tokens[0].tokenType).toBe(Integer);
			expect(tokens[1].tokenType).toBe(Sharp);
			expect(tokens[2].tokenType).toBe(Sharp);
		});

		it('bro followed by digit tokenises as Bro, not Flat+identifier', () => {
			const { tokens, errors } = FluxLexer.tokenize('0bro10m2');
			expect(errors).toHaveLength(0);
			expect(tokens[1].tokenType).toBe(Bro);
			// No Flat token should appear
			expect(tokens.some((t) => t.tokenType === Flat)).toBe(false);
		});

		it('standalone "b" (e.g. identifier "b") tokenises as Identifier, not Flat', () => {
			const { tokens, errors } = FluxLexer.tokenize('b');
			expect(errors).toHaveLength(0);
			expect(tokens[0].tokenType).toBe(Identifier);
		});

		it('"b" followed by letter tokenises as Identifier start', () => {
			const { tokens, errors } = FluxLexer.tokenize('bar');
			expect(errors).toHaveLength(0);
			expect(tokens[0].tokenType).toBe(Identifier);
			expect(tokens[0].image).toBe('bar');
		});

		it('"b" at end of list (before ]) tokenises as Flat', () => {
			const { tokens, errors } = FluxLexer.tokenize('[2b]');
			expect(errors).toHaveLength(0);
			// LBracket Integer Flat RBracket
			expect(tokens[2].tokenType).toBe(Flat);
		});
	});

	describe('representative Flux expressions', () => {
		it("sequence generator with modifiers: [1 2 3]'shuf", () => {
			const { tokens, errors } = FluxLexer.tokenize("[1 2 3]'shuf");
			expect(errors).toHaveLength(0);
			// LBracket Integer Integer Integer RBracket Tick Identifier
			expect(tokens[0].tokenType).toBe(LBracket);
			expect(tokens[4].tokenType).toBe(RBracket);
			expect(tokens[5].tokenType).toBe(Tick);
			expect(tokens[6].tokenType).toBe(Identifier);
		});

		it('nested generators in a list: [0 1exp7 4gau2]', () => {
			const { tokens, errors } = FluxLexer.tokenize('[0 1exp7 4gau2]');
			expect(errors).toHaveLength(0);
			// LBracket Integer  Integer Exp Integer  Integer Gau Integer  RBracket
			expect(tokens[0].tokenType).toBe(LBracket);
			expect(tokens[tokens.length - 1].tokenType).toBe(RBracket);
			const expIdx = tokens.findIndex((t) => t.tokenType === Exp);
			const gauIdx = tokens.findIndex((t) => t.tokenType === Gau);
			expect(expIdx).toBeGreaterThan(0);
			expect(gauIdx).toBeGreaterThan(expIdx);
		});

		it("note with stut modifier: note [0rand7 4rand6]'stut(4)", () => {
			const { tokens, errors } = FluxLexer.tokenize("note [0rand7 4rand6]'stut(4)");
			expect(errors).toHaveLength(0);
			expect(tokens[0].tokenType).toBe(Note);
		});
	});
});

describe('Bang — inline repetition operator', () => {
	it('tokenizes 1!4 as Integer Bang Integer', () => {
		const { tokens, errors } = FluxLexer.tokenize('1!4');
		expect(errors).toHaveLength(0);
		expect(tokens).toHaveLength(3);
		expect(tokens[0].tokenType).toBe(Integer);
		expect(tokens[1].tokenType).toBe(Bang);
		expect(tokens[2].tokenType).toBe(Integer);
	});

	it('tokenizes note [1!4] correctly', () => {
		const { tokens, errors } = FluxLexer.tokenize('note [1!4]');
		expect(errors).toHaveLength(0);
		const bangIdx = tokens.findIndex((t) => t.tokenType === Bang);
		expect(bangIdx).toBeGreaterThan(0);
		expect(tokens[bangIdx - 1].tokenType).toBe(Integer);
		expect(tokens[bangIdx + 1].tokenType).toBe(Integer);
	});
});

describe('Percent — wet/dry operator', () => {
	it('tokenizes 70% as Integer Percent', () => {
		const { tokens, errors } = FluxLexer.tokenize('70%');
		expect(errors).toHaveLength(0);
		expect(tokens).toHaveLength(2);
		expect(tokens[0].tokenType).toBe(Integer);
		expect(tokens[0].image).toBe('70');
		expect(tokens[1].tokenType).toBe(Percent);
	});

	it('tokenizes 0% as Integer Percent', () => {
		const { tokens, errors } = FluxLexer.tokenize('0%');
		expect(errors).toHaveLength(0);
		expect(tokens[0].tokenType).toBe(Integer);
		expect(tokens[1].tokenType).toBe(Percent);
	});

	it('tokenizes fx pipe with wet/dry: note lead [0] | fx(\\lpf) 70%', () => {
		const { tokens, errors } = FluxLexer.tokenize('note lead [0] | fx(\\lpf) 70%');
		expect(errors).toHaveLength(0);
		const pctIdx = tokens.findIndex((t) => t.tokenType === Percent);
		expect(pctIdx).toBeGreaterThan(0);
		expect(tokens[pctIdx - 1].tokenType).toBe(Integer);
		expect(tokens[pctIdx - 1].image).toBe('70');
	});
});

describe('ParamSigil — direct SynthDef argument access', () => {
	it('tokenizes "amp as a single ParamSigil token', () => {
		const { tokens, errors } = FluxLexer.tokenize('"amp');
		expect(errors).toHaveLength(0);
		expect(tokens).toHaveLength(1);
		expect(tokens[0].tokenType).toBe(ParamSigil);
		expect(tokens[0].image).toBe('"amp');
	});

	it('tokenizes "pan as ParamSigil', () => {
		const { tokens, errors } = FluxLexer.tokenize('"pan');
		expect(errors).toHaveLength(0);
		expect(tokens[0].tokenType).toBe(ParamSigil);
		expect(tokens[0].image).toBe('"pan');
	});

	it('tokenizes "my_param as ParamSigil (underscores allowed)', () => {
		const { tokens, errors } = FluxLexer.tokenize('"my_param');
		expect(errors).toHaveLength(0);
		expect(tokens[0].tokenType).toBe(ParamSigil);
		expect(tokens[0].image).toBe('"my_param');
	});

	it('"amp(0.5) tokenizes as ParamSigil + LParen + Float + RParen', () => {
		const { tokens, errors } = FluxLexer.tokenize('"amp(0.5)');
		expect(errors).toHaveLength(0);
		expect(tokens[0].tokenType).toBe(ParamSigil);
		expect(tokens[0].image).toBe('"amp');
		expect(tokens[1].tokenType).toBe(LParen);
		expect(tokens[2].tokenType).toBe(Float);
		expect(tokens[3].tokenType).toBe(RParen);
	});

	it('chained params: "amp(0.5)"pan(-0.3) tokenizes as two ParamSigil tokens', () => {
		const { tokens, errors } = FluxLexer.tokenize('"amp(0.5)"pan(-0.3)');
		expect(errors).toHaveLength(0);
		const paramTokens = tokens.filter((t) => t.tokenType === ParamSigil);
		expect(paramTokens).toHaveLength(2);
		expect(paramTokens[0].image).toBe('"amp');
		expect(paramTokens[1].image).toBe('"pan');
	});

	it('double-quoted string with space is a lex error (not ParamSigil)', () => {
		const { errors } = FluxLexer.tokenize('"moog"');
		expect(errors.length).toBeGreaterThan(0);
	});

	it('" followed by space is a lex error', () => {
		const { errors } = FluxLexer.tokenize('" amp');
		expect(errors.length).toBeGreaterThan(0);
	});
});

describe('BlockComment — multi-line comment (SKIPPED)', () => {
	it('single-line block comment is invisible to the token array', () => {
		const { tokens, errors } = FluxLexer.tokenize('/* a comment */ note [0]');
		expect(errors).toHaveLength(0);
		// BlockComment is SKIPPED — only Note, LBracket, Integer, RBracket remain
		expect(tokens.find((t) => t.tokenType.name === 'BlockComment')).toBeUndefined();
		expect(tokens[0].tokenType).toBe(Note);
	});

	it('block comment spanning the whole line is invisible', () => {
		const { tokens, errors } = FluxLexer.tokenize('/* full line comment */');
		expect(errors).toHaveLength(0);
		expect(tokens).toHaveLength(0);
	});

	it('does not affect tokens after the closing */', () => {
		const { tokens, errors } = FluxLexer.tokenize('/* ignored */ note [0]');
		expect(errors).toHaveLength(0);
		expect(tokens[0].tokenType).toBe(Note);
	});
});

describe('utf8 generator tokens', () => {
	it('tokenizes "utf8" as Utf8Kw when immediately followed by "{"', () => {
		const { tokens, errors } = FluxLexer.tokenize('utf8{coffee}');
		expect(errors).toHaveLength(0);
		expect(tokens[0].tokenType).toBe(Utf8Kw);
		expect(tokens[0].image).toBe('utf8');
	});

	it('tokenizes "utf8{coffee}" as Utf8Kw + LCurly + Identifier + RCurly', () => {
		const { tokens, errors } = FluxLexer.tokenize('utf8{coffee}');
		expect(errors).toHaveLength(0);
		expect(tokens).toHaveLength(4);
		expect(tokens[0].tokenType).toBe(Utf8Kw);
		expect(tokens[1].tokenType).toBe(LCurly);
		expect(tokens[2].tokenType).toBe(Identifier);
		expect(tokens[2].image).toBe('coffee');
		expect(tokens[3].tokenType).toBe(RCurly);
	});

	it('tokenizes "utf8{a}" (single char) correctly', () => {
		const { tokens, errors } = FluxLexer.tokenize('utf8{a}');
		expect(errors).toHaveLength(0);
		expect(tokens[0].tokenType).toBe(Utf8Kw);
		expect(tokens[2].image).toBe('a');
	});

	it('"utf8foo" tokenizes as Identifier (not Utf8Kw + Identifier)', () => {
		// When followed by a letter instead of {, it must be an Identifier
		const { tokens, errors } = FluxLexer.tokenize('utf8foo');
		expect(errors).toHaveLength(0);
		expect(tokens).toHaveLength(1);
		expect(tokens[0].tokenType).toBe(Identifier);
		expect(tokens[0].image).toBe('utf8foo');
	});

	it('"utf8 {coffee}" (space before brace) — utf8 becomes Identifier, { is a lex error', () => {
		// Space means utf8 is an ordinary identifier; { is unrecognised
		const { tokens, errors } = FluxLexer.tokenize('utf8 {coffee}');
		// utf8 tokenizes as Identifier (not followed by {)
		expect(tokens[0].tokenType).toBe(Identifier);
		// { is not a valid token without utf8 context — lex error
		expect(errors.length).toBeGreaterThan(0);
	});

	it('bare "{" without utf8 context is a lex error', () => {
		const { errors } = FluxLexer.tokenize('{');
		expect(errors.length).toBeGreaterThan(0);
	});

	it('bare "}" without utf8 context is a lex error', () => {
		const { errors } = FluxLexer.tokenize('}');
		expect(errors.length).toBeGreaterThan(0);
	});
});
