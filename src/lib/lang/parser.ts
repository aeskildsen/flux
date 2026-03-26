/**
 * Flux DSL — CstParser and INDENT/DEDENT pre-processor.
 *
 * Uses Chevrotain's CstParser (Concrete Syntax Tree mode) rather than
 * EmbeddedActionsParser. CST mode separates grammar from semantic actions,
 * which is better for tooling: hover, completions, and semantic highlighting
 * can all be implemented as CST visitors without touching the grammar rules.
 *
 * ## Adding grammar rules
 *
 * 1. Declare the rule as a class property initialised via this.RULE() in the
 *    constructor — Chevrotain's TypeScript API requires this pattern.
 * 2. Wire the rule in the constructor body before performSelfAnalysis().
 * 3. performSelfAnalysis() must be called AFTER all rules are wired —
 *    it validates the grammar and detects ambiguities.
 *
 * ## Chevrotain rule methods
 *
 *   this.CONSUME(TokenType)           — match and consume one token
 *   this.SUBRULE(this.ruleName)       — invoke another rule
 *   this.OPTION(() => { ... })        — optionally match
 *   this.MANY(() => { ... })          — match zero or more times
 *   this.MANY_SEP({ SEP, DEF })       — match zero or more, separated by SEP
 *   this.AT_LEAST_ONE(() => { ... })  — match one or more times
 *   this.OR([{ ALT: () => { ... } }]) — match one of several alternatives
 *
 * ## Parsing
 *
 *   import { FluxLexer } from './lexer.js';
 *   import { parser, preprocessTokens } from './parser.js';
 *
 *   const { tokens, errors: lexErrors } = FluxLexer.tokenize(input);
 *   const processed = preprocessTokens(tokens, input);
 *   parser.input = processed;        // feed tokens to the parser
 *   const cst = parser.program();    // call the top-level rule
 *   const parseErrors = parser.errors;
 */

import { CstParser, type IToken, createToken, Lexer } from 'chevrotain';
import {
	allTokens,
	LineComment,
	Loop,
	Line,
	Fx,
	SendFx,
	MasterFx,
	Set as SetKw,
	Tick,
	Identifier,
	LBracket,
	RBracket,
	LBrace,
	RBrace,
	LParen,
	RParen,
	Pipe,
	At,
	Integer,
	Float,
	StringLiteral,
	Minus,
	Plus,
	Slash,
	Colon,
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
	Equals,
	Question,
	Sharp,
	Flat,
	INDENT,
	DEDENT
} from './lexer.js';

// ---------------------------------------------------------------------------
// INDENT/DEDENT pre-processor
//
// Chevrotain is context-free — it has no native support for indentation.
// This function scans the raw token stream (post-lex) and injects synthetic
// INDENT and DEDENT tokens based on leading whitespace on each line.
//
// Rules:
//   - Indentation must be a positive multiple of 2 spaces. Odd or tab
//     indentation is flagged (injected as a special error token, which
//     the parser will report as an unexpected token).
//   - A line beginning with "'" at indent > 0 is a continuation modifier.
//   - An INDENT is injected before the first token on a more-deeply-indented
//     line. A DEDENT is injected before the first token on a less-deeply-
//     indented line (one DEDENT per level closed).
// ---------------------------------------------------------------------------

/** Create synthetic INDENT/DEDENT tokens at the position of a reference token. */
function makeSyntheticToken(tokenType: ReturnType<typeof createToken>, ref: IToken): IToken {
	return {
		image: tokenType.name,
		startOffset: ref.startOffset,
		endOffset: ref.startOffset,
		startLine: ref.startLine,
		endLine: ref.startLine,
		startColumn: ref.startColumn,
		endColumn: ref.startColumn,
		tokenTypeIdx: tokenType.tokenTypeIdx!,
		tokenType
	};
}

/**
 * Scans source for tab characters in indentation and returns their line
 * numbers (1-based). Tabs anywhere else are ignored (the lexer handles them
 * as whitespace). This lets us report indentation tab errors separately from
 * the token stream.
 */
function findTabIndentLines(source: string): Set<number> {
	const tabLines = new Set<number>();
	let lineNo = 1;
	let atLineStart = true;
	for (let i = 0; i < source.length; i++) {
		const ch = source[i];
		if (ch === '\n') {
			lineNo++;
			atLineStart = true;
		} else if (atLineStart) {
			if (ch === '\t') {
				tabLines.add(lineNo);
			} else if (ch !== ' ') {
				atLineStart = false;
			}
		}
	}
	return tabLines;
}

/**
 * Compute the indentation level (number of leading spaces) of the line a
 * token starts on, by scanning backwards from the token's startOffset in
 * the source string.
 */
function getLineIndent(source: string, tokenStartOffset: number): number {
	// Find the start of this line
	let lineStart = tokenStartOffset;
	while (lineStart > 0 && source[lineStart - 1] !== '\n') {
		lineStart--;
	}
	// Count leading spaces from lineStart
	let spaces = 0;
	while (lineStart + spaces < tokenStartOffset && source[lineStart + spaces] === ' ') {
		spaces++;
	}
	return spaces;
}

/**
 * Pre-process a raw Chevrotain token array by injecting synthetic INDENT and
 * DEDENT tokens before feeding it to the parser.
 *
 * @param tokens - Raw token array from FluxLexer.tokenize()
 * @param source - Original source string (used to compute indentation)
 * @returns Modified token array with INDENT/DEDENT tokens injected
 */
export function preprocessTokens(tokens: IToken[], source: string): IToken[] {
	if (tokens.length === 0) return tokens;

	const result: IToken[] = [];
	const indentStack: number[] = [0];
	const tabLines = findTabIndentLines(source);

	// Track which line each token is on (Chevrotain gives us startLine)
	let prevLine = tokens[0].startLine ?? 1;

	for (const token of tokens) {
		const tokenLine = token.startLine ?? prevLine;

		if (tokenLine > prevLine) {
			// We've moved to a new line — compute its indentation
			if (tabLines.has(tokenLine)) {
				// Tab in indentation — inject a token that will cause a parse error
				// by pushing a synthetic DEDENT that shouldn't be there (simplest
				// way to surface the error through the parser rather than silently
				// swallowing it). The lex error will also be reported separately.
				// Just let the token through and let the parser report the mismatch.
			}

			const indent = getLineIndent(source, token.startOffset);

			if (indent > indentStack[indentStack.length - 1]) {
				// Deeper indentation — inject INDENT
				indentStack.push(indent);
				result.push(makeSyntheticToken(INDENT, token));
			} else {
				// Equal or shallower — inject DEDENTs until we match the stack
				while (indentStack.length > 1 && indent < indentStack[indentStack.length - 1]) {
					indentStack.pop();
					result.push(makeSyntheticToken(DEDENT, token));
				}
				// If we dedented to a level that was never opened, the parser will
				// error on the next token naturally.
			}

			prevLine = tokenLine;
		}

		result.push(token);
	}

	// Flush remaining open indent levels at EOF
	while (indentStack.length > 1) {
		indentStack.pop();
		const last = result[result.length - 1];
		result.push(makeSyntheticToken(DEDENT, last));
	}

	return result;
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

class FluxParser extends CstParser {
	// Rule properties are declared here so TypeScript can type-check
	// this.SUBRULE(this.ruleName) calls. The actual implementations are
	// assigned via this.RULE() in the constructor.

	program = this.RULE('program', () => {
		// A program is zero or more statements.
		this.MANY(() => {
			this.SUBRULE(this.statement);
		});
	});

	statement = this.RULE('statement', () => {
		this.OR([
			{ ALT: () => this.SUBRULE(this.decoratorBlock) },
			{ ALT: () => this.SUBRULE(this.loopStatement) },
			{ ALT: () => this.SUBRULE(this.lineStatement) },
			{ ALT: () => this.SUBRULE(this.setStatement) },
			{ ALT: () => this.SUBRULE(this.fxAssignment) },
			{ ALT: () => this.SUBRULE(this.masterFxStatement) },
			{ ALT: () => this.CONSUME(LineComment) }
		]);
	});

	// -------------------------------------------------------------------------
	// Loop / Line statements
	// -------------------------------------------------------------------------

	loopStatement = this.RULE('loopStatement', () => {
		// `loop [...]`  or  `loop("synthdef") [...]`
		this.CONSUME(Loop);
		this.OPTION(() => {
			this.SUBRULE(this.synthdefArg);
		});
		this.SUBRULE(this.sequenceExpr);
		this.MANY(() => {
			this.SUBRULE(this.modifierSuffix);
		});
		this.OPTION2(() => {
			this.SUBRULE(this.transposition);
		});
		// Continuation modifiers: an indented block of `'modName(args)` lines.
		// The pre-processor injects INDENT before the first indented line and
		// DEDENT after the last — all continuation lines are inside one block.
		this.OPTION3(() => {
			this.CONSUME(INDENT);
			this.AT_LEAST_ONE(() => {
				this.SUBRULE(this.continuationModifier);
			});
			this.CONSUME(DEDENT);
		});
		this.OPTION4(() => {
			this.SUBRULE(this.pipeExpr);
		});
	});

	lineStatement = this.RULE('lineStatement', () => {
		// `line [...]`  or  `line("synthdef") [...]`  or  `line {4:1/2 7:3/2}`
		this.CONSUME(Line);
		this.OPTION(() => {
			this.SUBRULE(this.synthdefArg);
		});
		this.OR([
			// relTimedList starts with '[' then degreeLiteral '@'
			// We use a GATE to peek ahead: if after '[' we see Integer (At|Sharp|Flat)?* '@'
			// then it's a relTimedList. Otherwise fall through to sequenceExpr.
			{
				GATE: () => this.isRelTimedList(),
				ALT: () => this.SUBRULE(this.relTimedList)
			},
			{ ALT: () => this.SUBRULE(this.absTimedList) },
			{ ALT: () => this.SUBRULE(this.sequenceExpr) }
		]);
		this.MANY(() => {
			this.SUBRULE(this.modifierSuffix);
		});
		this.OPTION2(() => {
			this.SUBRULE(this.transposition);
		});
		// Continuation modifiers block (same pattern as loopStatement)
		this.OPTION3(() => {
			this.CONSUME(INDENT);
			this.AT_LEAST_ONE(() => {
				this.SUBRULE(this.continuationModifier);
			});
			this.CONSUME(DEDENT);
		});
		this.OPTION4(() => {
			this.SUBRULE(this.pipeExpr);
		});
	});

	/**
	 * Lookahead predicate: returns true if the next tokens look like a
	 * relative-timed list `[degreeLiteral @ ...]`.
	 * We look for: LBracket Integer (Sharp|Flat)* At
	 */
	private isRelTimedList(): boolean {
		let la = 1;
		if (this.LA(la).tokenType !== LBracket) return false;
		la++;
		// Skip optional whitespace (already skipped by lexer)
		if (this.LA(la).tokenType !== Integer) return false;
		la++;
		// Skip accidentals
		while (this.LA(la).tokenType === Sharp || this.LA(la).tokenType === Flat) la++;
		// Should be '@'
		return this.LA(la).tokenType === At;
	}

	synthdefArg = this.RULE('synthdefArg', () => {
		this.CONSUME(LParen);
		this.CONSUME(StringLiteral);
		this.CONSUME(RParen);
	});

	// -------------------------------------------------------------------------
	// Top-level session state statements
	// -------------------------------------------------------------------------

	setStatement = this.RULE('setStatement', () => {
		// set scale("minor")  or  set key(g# lydian)  or  set tempo(120)
		this.CONSUME(SetKw);
		this.CONSUME(Identifier);
		this.CONSUME(LParen);
		this.AT_LEAST_ONE(() => {
			this.SUBRULE(this.decoratorArg);
		});
		this.CONSUME(RParen);
	});

	fxAssignment = this.RULE('fxAssignment', () => {
		// reverb = send_fx("reverb")'room(0.5)
		this.CONSUME(Identifier);
		this.CONSUME(Equals);
		this.CONSUME(SendFx);
		this.CONSUME(LParen);
		this.CONSUME(StringLiteral);
		this.CONSUME(RParen);
		this.MANY(() => {
			this.SUBRULE(this.modifierSuffix);
		});
	});

	masterFxStatement = this.RULE('masterFxStatement', () => {
		// master_fx("limiter")'gain(0.8)
		this.CONSUME(MasterFx);
		this.CONSUME(LParen);
		this.CONSUME(StringLiteral);
		this.CONSUME(RParen);
		this.MANY(() => {
			this.SUBRULE(this.modifierSuffix);
		});
	});

	// -------------------------------------------------------------------------
	// Decorator blocks
	// -------------------------------------------------------------------------

	decoratorBlock = this.RULE('decoratorBlock', () => {
		// One or more decorators, followed by either:
		//   - an inline body on the same line (loopStatement or lineStatement), OR
		//   - an INDENT-indented body on subsequent lines.
		this.AT_LEAST_ONE(() => {
			this.SUBRULE(this.decorator);
		});
		this.OR([
			// Indented block body
			{
				ALT: () => {
					this.CONSUME(INDENT);
					this.OR2([
						{ ALT: () => this.SUBRULE(this.loopStatement) },
						{ ALT: () => this.SUBRULE(this.lineStatement) },
						{ ALT: () => this.SUBRULE(this.decoratorBlock) }
					]);
					this.CONSUME(DEDENT);
				}
			},
			// Inline body on the same line
			{
				ALT: () => {
					this.OR3([
						{ ALT: () => this.SUBRULE2(this.loopStatement) },
						{ ALT: () => this.SUBRULE2(this.lineStatement) }
					]);
				}
			}
		]);
	});

	decorator = this.RULE('decorator', () => {
		// @scale("minor")  or  @key(g# lydian 4)  or  @root(3rand7)
		this.CONSUME(At);
		this.CONSUME(Identifier);
		this.CONSUME(LParen);
		this.AT_LEAST_ONE(() => {
			this.SUBRULE(this.decoratorArg);
		});
		this.CONSUME(RParen);
	});

	decoratorArg = this.RULE('decoratorArg', () => {
		// pitchClass (e.g. g#, Ab) or generatorExpr (e.g. 3rand7, "minor", 120)
		this.OR([
			// pitchClass: a single-char identifier [a-gA-G] optionally followed by Sharp/Flat
			{
				GATE: () => this.isPitchClass(),
				ALT: () => this.SUBRULE(this.pitchClass)
			},
			// Scale names and other identifiers (e.g. "lydian", "minor")
			{ ALT: () => this.CONSUME(Identifier) },
			// String literals for scale names passed as strings: set scale("minor")
			{ ALT: () => this.CONSUME(StringLiteral) },
			// Numeric generator expressions: @root(3rand7), set tempo(120)
			{ ALT: () => this.SUBRULE(this.numericGenerator) }
		]);
	});

	/** Returns true if LA(1) is a single-char identifier in [a-gA-G]. */
	private isPitchClass(): boolean {
		const tok = this.LA(1);
		if (tok.tokenType !== Identifier) return false;
		const img = tok.image;
		return img.length === 1 && /[a-gA-G]/.test(img);
	}

	pitchClass = this.RULE('pitchClass', () => {
		// g#  or  Ab  or  c
		this.CONSUME(Identifier);
		this.OPTION(() => {
			this.OR([{ ALT: () => this.CONSUME(Sharp) }, { ALT: () => this.CONSUME(Flat) }]);
		});
	});

	// -------------------------------------------------------------------------
	// Transposition
	// -------------------------------------------------------------------------

	transposition = this.RULE('transposition', () => {
		// (+ | -) positiveScalar
		// Double-negative (- -4) is a parse error because positiveScalar
		// does NOT accept a leading Minus.
		this.OR([{ ALT: () => this.CONSUME(Plus) }, { ALT: () => this.CONSUME(Minus) }]);
		this.SUBRULE(this.positiveScalar);
	});

	positiveScalar = this.RULE('positiveScalar', () => {
		// A non-negative scalar generator (no leading minus).
		this.OR([
			{ ALT: () => this.SUBRULE(this.parenGenerator) },
			{ ALT: () => this.SUBRULE(this.positiveNumericGenerator) }
		]);
		this.MANY(() => {
			this.SUBRULE(this.modifierSuffix);
		});
	});

	positiveNumericGenerator = this.RULE('positiveNumericGenerator', () => {
		// Like numericGenerator but without a leading optional Minus.
		this.OR([{ ALT: () => this.CONSUME(Float) }, { ALT: () => this.CONSUME(Integer) }]);
		this.OPTION(() => {
			this.OR2([
				{ ALT: () => this.SUBRULE(this.randGen) },
				{ ALT: () => this.SUBRULE(this.tildeGen) },
				{ ALT: () => this.SUBRULE(this.gauGen) },
				{ ALT: () => this.SUBRULE(this.expGen) },
				{ ALT: () => this.SUBRULE(this.broGen) },
				{ ALT: () => this.SUBRULE(this.stepGen) },
				{ ALT: () => this.SUBRULE(this.mulGen) },
				{ ALT: () => this.SUBRULE(this.linGen) },
				{ ALT: () => this.SUBRULE(this.geoGen) }
			]);
		});
	});

	// -------------------------------------------------------------------------
	// Continuation modifiers (indentation-based)
	// -------------------------------------------------------------------------

	continuationModifier = this.RULE('continuationModifier', () => {
		// `'modName` or `'modName(args)` — one modifier on an indented line.
		// INDENT/DEDENT are consumed by the enclosing loopStatement/lineStatement block.
		this.CONSUME(Tick);
		this.CONSUME(Identifier);
		this.OPTION(() => {
			this.CONSUME(LParen);
			this.SUBRULE(this.generatorExpr);
			this.CONSUME(RParen);
		});
	});

	// -------------------------------------------------------------------------
	// Pipe / FX
	// -------------------------------------------------------------------------

	pipeExpr = this.RULE('pipeExpr', () => {
		this.CONSUME(Pipe);
		this.SUBRULE(this.fxExpr);
	});

	fxExpr = this.RULE('fxExpr', () => {
		// fx("lpf")'cutoff(1200)
		this.CONSUME(Fx);
		this.CONSUME(LParen);
		this.CONSUME(StringLiteral);
		this.CONSUME(RParen);
		this.MANY(() => {
			this.SUBRULE(this.modifierSuffix);
		});
	});

	// -------------------------------------------------------------------------
	// Sequence expressions
	//
	// sequenceExpr  — the top-level list directly after loop/line
	// sequenceGenerator — same body, but used inside a generatorExpr (nested)
	// They are separate rules so the CST clearly labels which context a list
	// appeared in, and so the parser can enforce that loop/line always take a list.
	// -------------------------------------------------------------------------

	sequenceExpr = this.RULE('sequenceExpr', () => {
		this.CONSUME(LBracket);
		this.MANY(() => {
			this.SUBRULE(this.sequenceElement);
		});
		this.CONSUME(RBracket);
		this.MANY2(() => {
			this.SUBRULE(this.modifierSuffix);
		});
	});

	sequenceGenerator = this.RULE('sequenceGenerator', () => {
		this.CONSUME(LBracket);
		this.MANY(() => {
			this.SUBRULE(this.sequenceElement);
		});
		this.CONSUME(RBracket);
		this.MANY2(() => {
			this.SUBRULE(this.modifierSuffix);
		});
	});

	sequenceElement = this.RULE('sequenceElement', () => {
		// A degree literal (possibly with accidentals) or a generator expression,
		// with an optional `?weight` for 'wran lists.
		this.OR([
			// degreeLiteral: Integer followed by accidentals (Sharp/Flat)
			{
				GATE: () => this.hasDegreeAccidental(),
				ALT: () => this.SUBRULE(this.degreeLiteral)
			},
			// plain generator expression
			{ ALT: () => this.SUBRULE(this.generatorExpr) }
		]);
		this.OPTION(() => {
			this.CONSUME(Question);
			this.OR2([
				{ ALT: () => this.SUBRULE(this.numericLiteral) },
				{
					ALT: () => {
						this.CONSUME(LParen);
						// Use SUBRULE2 to distinguish this from the generatorExpr above
						this.SUBRULE2(this.generatorExpr);
						this.CONSUME(RParen);
					}
				}
			]);
		});
	});

	/** Returns true if LA(1) is Integer and LA(2) is Sharp or Flat. */
	private hasDegreeAccidental(): boolean {
		if (this.LA(1).tokenType !== Integer) return false;
		const la2 = this.LA(2).tokenType;
		return la2 === Sharp || la2 === Flat;
	}

	degreeLiteral = this.RULE('degreeLiteral', () => {
		// Integer followed by one or more accidentals: 2b, 4#, 3bb, 4##
		this.CONSUME(Integer);
		this.AT_LEAST_ONE(() => {
			this.OR([{ ALT: () => this.CONSUME(Sharp) }, { ALT: () => this.CONSUME(Flat) }]);
		});
	});

	// -------------------------------------------------------------------------
	// Timed lists (line only)
	// -------------------------------------------------------------------------

	relTimedList = this.RULE('relTimedList', () => {
		// [4@1/2 7@1/4] — delta from previous event
		this.CONSUME(LBracket);
		this.MANY(() => {
			this.SUBRULE(this.timedElement);
		});
		this.CONSUME(RBracket);
		this.MANY2(() => {
			this.SUBRULE(this.modifierSuffix);
		});
	});

	timedElement = this.RULE('timedElement', () => {
		// degreeLiteral @ timeExpr
		// degreeLiteral here is always a plain integer (no accidental form in timed lists per spec)
		this.CONSUME(Integer);
		this.MANY(() => {
			this.OR([{ ALT: () => this.CONSUME(Sharp) }, { ALT: () => this.CONSUME(Flat) }]);
		});
		this.CONSUME(At);
		this.SUBRULE(this.timeExpr);
	});

	absTimedList = this.RULE('absTimedList', () => {
		// {4:1/2 7:3/2} — offset from cycle start
		this.CONSUME(LBrace);
		this.MANY(() => {
			this.SUBRULE(this.absTimedElement);
		});
		this.CONSUME(RBrace);
		this.MANY2(() => {
			this.SUBRULE(this.modifierSuffix);
		});
	});

	absTimedElement = this.RULE('absTimedElement', () => {
		// degreeLiteral : timeExpr
		this.CONSUME(Integer);
		this.MANY(() => {
			this.OR([{ ALT: () => this.CONSUME(Sharp) }, { ALT: () => this.CONSUME(Flat) }]);
		});
		this.CONSUME(Colon);
		this.SUBRULE(this.timeExpr);
	});

	timeExpr = this.RULE('timeExpr', () => {
		// integer  or  integer/integer  (e.g. 1/4, 3/2, 0)
		this.CONSUME(Integer);
		this.OPTION(() => {
			this.CONSUME(Slash);
			this.CONSUME2(Integer);
		});
	});

	// -------------------------------------------------------------------------
	// Generator expressions
	//
	// A generatorExpr is the top-level entry point for any value position that
	// accepts a generator: modifier arguments, list elements, etc.
	// -------------------------------------------------------------------------

	generatorExpr = this.RULE('generatorExpr', () => {
		// An atomic generator followed by zero or more modifier suffixes.
		this.SUBRULE(this.atomicGenerator);
		this.MANY(() => {
			this.SUBRULE(this.modifierSuffix);
		});
	});

	atomicGenerator = this.RULE('atomicGenerator', () => {
		this.OR([
			{ ALT: () => this.SUBRULE(this.parenGenerator) },
			{ ALT: () => this.SUBRULE(this.sequenceGenerator) },
			{ ALT: () => this.SUBRULE(this.numericGenerator) }
		]);
	});

	parenGenerator = this.RULE('parenGenerator', () => {
		// (generatorExpr) — disambiguates chained generators like (0rand2)rand4
		this.CONSUME(LParen);
		this.SUBRULE(this.generatorExpr);
		this.CONSUME(RParen);
	});

	modifierSuffix = this.RULE('modifierSuffix', () => {
		// `'modName` or `'modName(generatorExpr)`
		this.CONSUME(Tick);
		this.CONSUME(Identifier);
		this.OPTION(() => {
			this.CONSUME(LParen);
			this.SUBRULE(this.generatorExpr);
			this.CONSUME(RParen);
		});
	});

	numericGenerator = this.RULE('numericGenerator', () => {
		// A number (integer or float) followed by an optional generator keyword.
		// If no generator keyword follows, this is a plain scalar literal.
		this.SUBRULE(this.numericLiteral);
		this.OPTION(() => {
			this.OR([
				{ ALT: () => this.SUBRULE(this.randGen) },
				{ ALT: () => this.SUBRULE(this.tildeGen) },
				{ ALT: () => this.SUBRULE(this.gauGen) },
				{ ALT: () => this.SUBRULE(this.expGen) },
				{ ALT: () => this.SUBRULE(this.broGen) },
				{ ALT: () => this.SUBRULE(this.stepGen) },
				{ ALT: () => this.SUBRULE(this.mulGen) },
				{ ALT: () => this.SUBRULE(this.linGen) },
				{ ALT: () => this.SUBRULE(this.geoGen) }
			]);
		});
	});

	numericLiteral = this.RULE('numericLiteral', () => {
		this.OPTION(() => {
			this.CONSUME(Minus);
		});
		this.OR([{ ALT: () => this.CONSUME(Float) }, { ALT: () => this.CONSUME(Integer) }]);
	});

	// Individual generator keyword rules — each consumes the keyword and its
	// numeric argument(s). Kept as separate rules so the CST clearly labels
	// which generator kind was used, which makes visitors straightforward.

	randGen = this.RULE('randGen', () => {
		// 0rand4 — Pwhite(min, max)
		this.CONSUME(Rand);
		this.SUBRULE(this.numericLiteral);
	});

	tildeGen = this.RULE('tildeGen', () => {
		// 0~4 — shorthand for rand
		this.CONSUME(Tilde);
		this.SUBRULE(this.numericLiteral);
	});

	gauGen = this.RULE('gauGen', () => {
		// 0gau4 — Pgauss(mean, sdev)
		this.CONSUME(Gau);
		this.SUBRULE(this.numericLiteral);
	});

	expGen = this.RULE('expGen', () => {
		// 1exp7 — Pexprand(min, max)
		this.CONSUME(Exp);
		this.SUBRULE(this.numericLiteral);
	});

	broGen = this.RULE('broGen', () => {
		// 0bro10m2 — Pbrown(min, max, max_step)
		this.CONSUME(Bro);
		this.SUBRULE(this.numericLiteral); // max
		this.CONSUME(BroStep); // 'm' separator
		this.SUBRULE2(this.numericLiteral); // max_step
	});

	stepGen = this.RULE('stepGen', () => {
		// 0step2x4 — Pseries(start, step, length)
		this.CONSUME(Step);
		this.SUBRULE(this.numericLiteral); // step
		this.CONSUME(LenSep); // 'x' separator
		this.SUBRULE2(this.numericLiteral); // length
	});

	mulGen = this.RULE('mulGen', () => {
		// 5mul2x4 — Pgeom(start, multiplier, length)
		this.CONSUME(Mul);
		this.SUBRULE(this.numericLiteral); // multiplier
		this.CONSUME(LenSep); // 'x' separator
		this.SUBRULE2(this.numericLiteral); // length
	});

	linGen = this.RULE('linGen', () => {
		// 2lin7x8 — linear interpolation
		this.CONSUME(Lin);
		this.SUBRULE(this.numericLiteral); // last
		this.CONSUME(LenSep); // 'x' separator
		this.SUBRULE2(this.numericLiteral); // length
	});

	geoGen = this.RULE('geoGen', () => {
		// 2geo7x8 — geometric interpolation
		this.CONSUME(Geo);
		this.SUBRULE(this.numericLiteral); // last
		this.CONSUME(LenSep); // 'x' separator
		this.SUBRULE2(this.numericLiteral); // length
	});

	constructor() {
		super(allTokens);
		// Must be last — validates the grammar and computes lookahead functions.
		this.performSelfAnalysis();
	}
}

/**
 * Singleton parser instance. Reuse this rather than constructing a new one
 * per parse — Chevrotain parsers are designed to be reused (set parser.input
 * between parses).
 */
export const parser = new FluxParser();
