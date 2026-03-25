import { describe, expect, it } from 'vitest';
import { FluxLexer, Integer, LineComment, Loop, Tick } from './lexer.js';

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
			const { tokens } = FluxLexer.tokenize('// comment\nloop');
			// LineComment stops at end of line; Loop follows on the next line
			expect(tokens[0].tokenType).toBe(LineComment);
			expect(tokens[0].image).toBe('// comment');
			expect(tokens[1].tokenType).toBe(Loop);
		});

		it('an empty comment is still a comment', () => {
			const { tokens, errors } = FluxLexer.tokenize('//');
			expect(errors).toHaveLength(0);
			expect(tokens[0].tokenType).toBe(LineComment);
		});
	});

	describe('Loop keyword', () => {
		it('tokenizes the word "loop"', () => {
			const { tokens, errors } = FluxLexer.tokenize('loop');
			expect(errors).toHaveLength(0);
			expect(tokens).toHaveLength(1);
			expect(tokens[0].tokenType).toBe(Loop);
			expect(tokens[0].image).toBe('loop');
		});

		it('is case-sensitive — "Loop" does not produce a Loop token', () => {
			// Until Identifier is defined this will produce a lex error;
			// the important thing is it does NOT produce a Loop token.
			const { tokens } = FluxLexer.tokenize('Loop');
			const hasLoop = tokens.some((t) => t.tokenType === Loop);
			expect(hasLoop).toBe(false);
		});
	});

	describe('Tick operator', () => {
		it('tokenizes a bare tick', () => {
			const { tokens, errors } = FluxLexer.tokenize("'");
			expect(errors).toHaveLength(0);
			expect(tokens).toHaveLength(1);
			expect(tokens[0].tokenType).toBe(Tick);
		});

		it('tick followed by text: tick is first token', () => {
			// `'lock` — tick is one token; `lock` will be an Identifier once defined.
			// For now just assert the tick comes out as the first token.
			const { tokens } = FluxLexer.tokenize("'lock");
			expect(tokens[0].tokenType).toBe(Tick);
			expect(tokens[0].image).toBe("'");
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

		it('tokenizes zero', () => {
			const { tokens, errors } = FluxLexer.tokenize('0');
			expect(errors).toHaveLength(0);
			expect(tokens[0].tokenType).toBe(Integer);
		});

		it('tokenizes multiple integers separated by whitespace', () => {
			const { tokens, errors } = FluxLexer.tokenize('0 1 2 3');
			expect(errors).toHaveLength(0);
			// Whitespace is skipped, so only 4 Integer tokens
			expect(tokens).toHaveLength(4);
			expect(tokens.every((t) => t.tokenType === Integer)).toBe(true);
		});
	});

	describe('WhiteSpace', () => {
		it('whitespace is skipped — not present in tokens array', () => {
			const { tokens } = FluxLexer.tokenize('loop   42');
			// Only Loop and Integer; spaces are gone
			expect(tokens).toHaveLength(2);
			expect(tokens[0].tokenType).toBe(Loop);
			expect(tokens[1].tokenType).toBe(Integer);
		});

		it('newlines are also skipped', () => {
			const { tokens } = FluxLexer.tokenize('loop\n42');
			expect(tokens).toHaveLength(2);
		});
	});

	describe('lex errors', () => {
		it('errors array is empty for fully recognized input', () => {
			const { errors } = FluxLexer.tokenize("loop 0 1 2 ' // comment");
			expect(errors).toHaveLength(0);
		});

		it('errors array is non-empty for unrecognized characters', () => {
			// `§` is not in any token pattern
			const { errors } = FluxLexer.tokenize('§');
			expect(errors.length).toBeGreaterThan(0);
		});
	});
});
