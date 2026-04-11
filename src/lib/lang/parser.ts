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

import { CstParser, type IToken, createToken } from 'chevrotain';
import {
	allTokens,
	LineComment,
	Note,
	Mono,
	Sample,
	Slice,
	Cloud,
	Fx,
	Set as SetKw,
	Tick,
	Identifier,
	LBracket,
	RBracket,
	LParen,
	RParen,
	Pipe,
	At,
	Integer,
	Float,
	Symbol,
	Minus,
	Plus,
	Slash,
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
	Sharp,
	Flat,
	Bang,
	Rest,
	Colon,
	Percent,
	ParamSigil,
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
			{ ALT: () => this.SUBRULE(this.patternStatement) },
			{ ALT: () => this.SUBRULE(this.setStatement) },
			{ ALT: () => this.CONSUME(LineComment) }
		]);
	});

	// -------------------------------------------------------------------------
	// Pattern statement (unified: note, mono, sample, slice, cloud)
	// -------------------------------------------------------------------------

	patternStatement = this.RULE('patternStatement', () => {
		// `note name [...]`  or  `note(\synthdef) name [...]`  or
		// `note child:parent [...]` (derived generator)
		// All content type keywords share the same grammar shape.
		this.OR([
			{ ALT: () => this.CONSUME(Note) },
			{ ALT: () => this.CONSUME(Mono) },
			{ ALT: () => this.CONSUME(Sample) },
			{ ALT: () => this.CONSUME(Slice) },
			{ ALT: () => this.CONSUME(Cloud) }
		]);
		this.OPTION(() => {
			this.SUBRULE(this.synthdefArg);
		});
		// Mandatory generator name: either `name` (plain) or `child:parent` (derived).
		this.SUBRULE(this.generatorName);
		// For derived generators (child:parent), the sequence body is optional —
		// the parent's pattern is inherited. For plain names, body is required.
		// We use OPTION3 here but only conditionally: Chevrotain's alternative-based
		// approach means we use OR2 with a derived-optional fallback.
		this.OR2([
			// timedList: '[' containing at least one 'degree@time' element.
			// GATE peeks ahead to detect '@' inside the brackets.
			{
				GATE: () => this.isRelTimedList(),
				ALT: () => this.SUBRULE(this.relTimedList)
			},
			{ ALT: () => this.SUBRULE(this.sequenceExpr) },
			// Derived generator with no body — body is optional for child:parent form.
			// Detected by the absence of '[' as the next token.
			// The evaluator enforces that only derived (child:parent) names may omit the body.
			{
				GATE: () => this.LA(1).tokenType !== LBracket,
				ALT: () => {
					/* no body — inherited from parent */
				}
			}
		]);
		this.MANY(() => {
			this.OR3([
				{ ALT: () => this.SUBRULE(this.modifierSuffix) },
				{ ALT: () => this.SUBRULE(this.paramSuffix) }
			]);
		});
		this.OPTION2(() => {
			this.SUBRULE(this.transposition);
		});
		// Continuation modifiers: an indented block of `'modName(args)` lines.
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
	 * Lookahead predicate: returns true if the token stream looks like a
	 * relative-timed list `[degreeLiteral@ ...]`.
	 *
	 * A relTimedList contains elements of the form `Integer (Sharp|Flat)* @`.
	 * The `@` may appear on any element, not necessarily the first, so we scan
	 * forward skipping `Integer (Sharp|Flat)*` groups until we find `@` (return
	 * true) or hit `]` / something that can't be part of a timed element (return
	 * false).
	 */
	private isRelTimedList(): boolean {
		let la = 1;
		if (this.LA(la).tokenType !== LBracket) return false;
		la++;
		while (true) {
			// Each timed element starts with an Integer
			if (this.LA(la).tokenType !== Integer) return false;
			la++;
			// Skip accidentals
			while (this.LA(la).tokenType === Sharp || this.LA(la).tokenType === Flat) la++;
			// If we see '@', this is a relTimedList
			if (this.LA(la).tokenType === At) return true;
			// If we see ']' or something other than an Integer, no '@' found
			if (this.LA(la).tokenType !== Integer) return false;
			// Another Integer: next element — continue scanning
		}
	}

	synthdefArg = this.RULE('synthdefArg', () => {
		this.CONSUME(LParen);
		this.CONSUME(Symbol);
		this.CONSUME(RParen);
	});

	/**
	 * Generator name: either a plain identifier (`lead`) or a derived
	 * child:parent reference (`perc:drums`).
	 *
	 * CST children:
	 *   - Identifier[0] — the child/plain name
	 *   - Colon[0]      — present only for derived generators
	 *   - Identifier[1] — the parent name (only for derived generators)
	 */
	generatorName = this.RULE('generatorName', () => {
		this.CONSUME(Identifier); // child name (or plain name)
		this.OPTION(() => {
			this.CONSUME(Colon);
			this.CONSUME2(Identifier); // parent name
		});
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

	// fxAssignment (send_fx) and masterFxStatement removed — send FX are not
	// supported and master bus FX are UI-configured. Both previously used
	// SendFx / MasterFx tokens which are no longer active in the lexer.

	// -------------------------------------------------------------------------
	// Decorator blocks
	// -------------------------------------------------------------------------

	decoratorBlock = this.RULE('decoratorBlock', () => {
		// One or more decorators, followed by either:
		//   - an inline body on the same line (patternStatement), OR
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
						{ ALT: () => this.SUBRULE(this.patternStatement) },
						{ ALT: () => this.SUBRULE(this.decoratorBlock) }
					]);
					this.CONSUME(DEDENT);
				}
			},
			// Inline body on the same line
			{
				ALT: () => {
					this.SUBRULE2(this.patternStatement);
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
		// pitchClass (e.g. g#, Ab), bare identifier (e.g. minor, lydian), \symbol (e.g. \myloop),
		// or numeric generator.
		this.OR([
			// pitchClass: a single-char identifier [a-gA-G] optionally followed by Sharp/Flat
			{
				GATE: () => this.isPitchClass(),
				ALT: () => this.SUBRULE(this.pitchClass)
			},
			// \symbol — for @buf(\myloop) and similar buffer-selection decorators
			{ ALT: () => this.CONSUME(Symbol) },
			// Scale names and other bare identifiers (e.g. lydian, minor, dorian)
			{ ALT: () => this.CONSUME(Identifier) },
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
		// INDENT/DEDENT are consumed by the enclosing patternStatement block.
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
		// fx(\lpf)'cutoff(1200)"rq(0.3) 70%
		// \symbol names the FX SynthDef; optional modifiers and/or params set args;
		// optional Integer Percent at the end sets wet/dry level (default 100% wet).
		this.CONSUME(Fx);
		this.CONSUME(LParen);
		this.CONSUME(Symbol);
		this.CONSUME(RParen);
		this.MANY(() => {
			this.OR([
				{ ALT: () => this.SUBRULE(this.modifierSuffix) },
				{ ALT: () => this.SUBRULE(this.paramSuffix) }
			]);
		});
		this.OPTION(() => {
			this.CONSUME(Integer);
			this.CONSUME(Percent);
		});
	});

	// -------------------------------------------------------------------------
	// Sequence expressions
	//
	// sequenceExpr  — the top-level list directly after a content type keyword
	// sequenceGenerator — same body, but used inside a generatorExpr (nested)
	// They are separate rules so the CST clearly labels which context a list
	// appeared in.
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
		// A degree literal (possibly with accidentals), a rest (_), a \symbol buffer ref,
		// or a generator expression, with an optional `?weight` for 'pick lists and an
		// optional `!n` repeat count.
		this.OR([
			// rest: a silent slot — no pitch, no synth
			{ ALT: () => this.CONSUME(Rest) },
			// degreeLiteral: Integer followed by accidentals (Sharp/Flat)
			{
				GATE: () => this.hasDegreeAccidental(),
				ALT: () => this.SUBRULE(this.degreeLiteral)
			},
			// \symbol buffer ref — for sample lists [\kick \hat \snare]
			{ ALT: () => this.CONSUME(Symbol) },
			// plain generator expression
			{ ALT: () => this.SUBRULE(this.generatorExpr) }
		]);
		this.OPTION(() => {
			this.CONSUME(Question);
			this.SUBRULE(this.weightLiteral);
		});
		// `!n` inline repetition: 1!4 expands to four copies of element 1 in the list
		this.OPTION2(() => {
			this.CONSUME(Bang);
			this.CONSUME(Integer);
		});
	});

	/**
	 * Weight literal for `?n` suffixes in `'pick` lists.
	 *
	 * Only non-negative numeric literals are valid weights — no leading `-`,
	 * no parenthesised generator expressions. `?0` is allowed (the element
	 * has zero probability and is never picked).
	 */
	weightLiteral = this.RULE('weightLiteral', () => {
		this.OR([{ ALT: () => this.CONSUME(Float) }, { ALT: () => this.CONSUME(Integer) }]);
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
	// Timed lists (relTimedList — used by all content types)
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
		// degreeLiteral  or  degreeLiteral @ timeExpr
		// The @ and timeExpr are optional: a bare degree keeps its natural uniform slot.
		this.CONSUME(Integer);
		this.MANY(() => {
			this.OR([{ ALT: () => this.CONSUME(Sharp) }, { ALT: () => this.CONSUME(Flat) }]);
		});
		this.OPTION(() => {
			this.CONSUME(At);
			this.SUBRULE(this.timeExpr);
		});
	});

	timeExpr = this.RULE('timeExpr', () => {
		// float (e.g. 1.5)  or  integer  or  integer/integer (e.g. 1/4, 3/2, 0)
		this.OR([
			{ ALT: () => this.CONSUME(Float) },
			{
				ALT: () => {
					this.CONSUME(Integer);
					this.OPTION(() => {
						this.CONSUME(Slash);
						this.CONSUME2(Integer);
					});
				}
			}
		]);
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
		// `'modName` or `'modName(generatorExpr)` or `'at(timeExpr)`
		// 'at is the one modifier whose argument is a timeExpr (integer or
		// integer/integer fraction) rather than a generatorExpr.  We gate on
		// LA(2) being the identifier "at" before the tick is consumed so the
		// parser can branch correctly.
		this.OR([
			{
				GATE: () => this.LA(2).image === 'at',
				ALT: () => this.SUBRULE(this.atModifier)
			},
			{
				ALT: () => {
					this.CONSUME(Tick);
					this.CONSUME(Identifier);
					this.OPTION(() => {
						this.CONSUME(LParen);
						this.SUBRULE(this.generatorExpr);
						this.CONSUME(RParen);
					});
				}
			}
		]);
	});

	atModifier = this.RULE('atModifier', () => {
		// 'at(timeExpr) — start offset for all content types.
		// timeExpr is integer or integer/integer (e.g. 0, 1, 3/4, -1/8).
		// The leading minus on a negative offset is consumed as part of timeExpr.
		this.CONSUME(Tick);
		this.CONSUME(Identifier); // always "at"
		this.OPTION(() => {
			this.CONSUME(LParen);
			this.SUBRULE(this.atTimeExpr);
			this.CONSUME(RParen);
		});
	});

	atTimeExpr = this.RULE('atTimeExpr', () => {
		// [ "-" ] integer [ "/" integer ]
		// Mirrors timeExpr but allows a leading minus for negative offsets.
		this.OPTION(() => {
			this.CONSUME(Minus);
		});
		this.CONSUME(Integer);
		this.OPTION2(() => {
			this.CONSUME(Slash);
			this.CONSUME2(Integer);
		});
	});

	numericGenerator = this.RULE('numericGenerator', () => {
		// Base: a plain numeric literal or a parenthesised sub-generator
		// (e.g. (-2rand2)step1x4 — nested generator as the start value).
		this.OR([
			{ ALT: () => this.SUBRULE(this.parenGenerator) },
			{ ALT: () => this.SUBRULE(this.numericLiteral) }
		]);
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

	paramSuffix = this.RULE('paramSuffix', () => {
		// `"paramName(generatorExpr)` — direct SynthDef argument access.
		// ParamSigil is a single token: `"` immediately followed by the identifier.
		// The value argument is mandatory (unlike modifiers where bare form is valid).
		this.CONSUME(ParamSigil);
		this.CONSUME(LParen);
		this.SUBRULE(this.generatorExpr);
		this.CONSUME(RParen);
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
