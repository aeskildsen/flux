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
	Gauss,
	Exp,
	Brown,
	BroStep,
	Step,
	Mul,
	Lin,
	Geom,
	LenSep,
	Question,
	Sharp,
	Flat,
	Bang,
	Rest,
	Colon,
	Percent,
	Star,
	Doublestar,
	ParamSigil,
	INDENT,
	DEDENT,
	Utf8Kw,
	LCurly,
	RCurly,
	DotDot,
	Comma,
	LAngle,
	RAngle
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
			// utf8{word} as a top-level pattern body (scalar generator form).
			{
				GATE: () => this.LA(1).tokenType === Utf8Kw,
				ALT: () => this.SUBRULE(this.utf8Generator)
			},
			// Derived generator with no body — body is optional for child:parent form.
			// Detected by the absence of '[' or 'utf8' as the next token.
			// The evaluator enforces that only derived (child:parent) names may omit the body.
			{
				GATE: () => this.LA(1).tokenType !== LBracket && this.LA(1).tokenType !== Utf8Kw,
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
		// One or more decorators on their own line(s), followed by an INDENT-indented body.
		// The inline form (@scale(minor) note lead [0 1 2]) is not allowed — parse error.
		this.AT_LEAST_ONE(() => {
			this.SUBRULE(this.decorator);
		});
		// Indented block body (mandatory — decorators must introduce a block)
		this.CONSUME(INDENT);
		this.OR([
			{ ALT: () => this.SUBRULE(this.patternStatement) },
			{ ALT: () => this.SUBRULE(this.decoratorBlock) }
		]);
		this.CONSUME(DEDENT);
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
		// numeric generator, or a sequence generator (for @buf([\loopA \loopB]'pick)).
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
			{ ALT: () => this.SUBRULE(this.numericGenerator) },
			// Sequence generator: @buf([\loopA \loopB]'pick) — list of \symbol values with modifiers.
			// `[` is unambiguous here since none of the other alternatives can start with `[`.
			{
				GATE: () => this.LA(1).tokenType === LBracket,
				ALT: () => this.SUBRULE(this.sequenceGenerator)
			}
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
	// Arithmetic operator (generalised from transposition)
	// -------------------------------------------------------------------------
	//
	// Supports: + - * / ** %
	// RHS: a scalar generator (positiveScalar) or a list generator ([...]).
	// Double-negative (- -4) is a parse error because positiveScalar does NOT
	// accept a leading Minus.
	//
	// The rule is still named "transposition" in the CST for backward
	// compatibility with the evaluator; the evaluator reads the operator token
	// to determine which operation to apply.

	transposition = this.RULE('transposition', () => {
		this.OR([
			{ ALT: () => this.CONSUME(Plus) },
			{ ALT: () => this.CONSUME(Minus) },
			{ ALT: () => this.CONSUME(Doublestar) }, // '**' before '*'
			{ ALT: () => this.CONSUME(Star) },
			{ ALT: () => this.CONSUME(Slash) },
			{ ALT: () => this.CONSUME(Percent) }
		]);
		// RHS: list generator ([...]) or scalar generator.
		this.OR2([
			{ ALT: () => this.SUBRULE(this.arithmeticListRhs) },
			{ ALT: () => this.SUBRULE(this.positiveScalar) }
		]);
	});

	/**
	 * List generator on the right-hand side of an arithmetic operator.
	 * Parses `[elem ...]` with optional modifiers.
	 * This is the same body as sequenceGenerator/sequenceExpr but named
	 * distinctly so the evaluator can identify the list-RHS case.
	 */
	arithmeticListRhs = this.RULE('arithmeticListRhs', () => {
		this.CONSUME(LBracket);
		this.MANY(() => {
			this.SUBRULE(this.sequenceElement);
		});
		this.CONSUME(RBracket);
		this.MANY2(() => {
			this.SUBRULE(this.modifierSuffix);
		});
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
				{ ALT: () => this.SUBRULE(this.gaussGen) },
				{ ALT: () => this.SUBRULE(this.expGen) },
				{ ALT: () => this.SUBRULE(this.brownGen) },
				{ ALT: () => this.SUBRULE(this.stepGen) },
				{ ALT: () => this.SUBRULE(this.mulGen) },
				{ ALT: () => this.SUBRULE(this.linGen) },
				{ ALT: () => this.SUBRULE(this.geomGen) }
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
	//
	// Both now support range notation as a first alternative, detected by
	// scanning ahead for a DotDot token inside the brackets.
	// -------------------------------------------------------------------------

	/**
	 * Lookahead predicate: returns true if the upcoming tokens look like a
	 * range expression `[start..end]` or `[start, step..end]`.
	 *
	 * Scans forward from LA(1) (which must be `[`) for a `DotDot` token before
	 * hitting `]` or end-of-input.
	 */
	private isRangeExpr(): boolean {
		if (this.LA(1).tokenType !== LBracket) return false;
		let i = 2;
		// Scan up to 20 tokens ahead to find DotDot before ]
		while (i <= 20) {
			const tok = this.LA(i).tokenType;
			if (tok === DotDot) return true;
			if (tok === RBracket) return false;
			// End-of-input sentinel has tokenTypeIdx === 0
			if (this.LA(i).tokenTypeIdx === 0) return false;
			i++;
		}
		return false;
	}

	sequenceExpr = this.RULE('sequenceExpr', () => {
		this.OR([
			{
				GATE: () => this.isRangeExpr(),
				ALT: () => this.SUBRULE(this.rangeExpr)
			},
			{
				ALT: () => {
					this.CONSUME(LBracket);
					this.MANY(() => {
						this.SUBRULE(this.sequenceElement);
					});
					this.CONSUME(RBracket);
					this.MANY2(() => {
						this.SUBRULE(this.modifierSuffix);
					});
				}
			}
		]);
	});

	sequenceGenerator = this.RULE('sequenceGenerator', () => {
		this.OR([
			{
				GATE: () => this.isRangeExpr(),
				ALT: () => this.SUBRULE(this.rangeExpr)
			},
			{
				ALT: () => {
					this.CONSUME(LBracket);
					this.MANY(() => {
						this.SUBRULE(this.sequenceElement);
					});
					this.CONSUME(RBracket);
					this.MANY2(() => {
						this.SUBRULE(this.modifierSuffix);
					});
				}
			}
		]);
	});

	/**
	 * Range expression: `[start..end]` or `[start, step..end]`.
	 *
	 * Two syntactic forms:
	 *
	 *   rangeNoStep  = "[" intBound    ".." rangeBound "]" modifierSuffix*
	 *   rangeWithStep = "[" rangeBound "," rangeBound ".." rangeBound "]" modifierSuffix*
	 *
	 * Float start WITHOUT an explicit step comma is a **parse error** — the grammar
	 * only allows `rangeBound` (Float or Integer) as the start of the stepped form.
	 * The no-step form uses `intBound` (Integer only, no Float).
	 *
	 * CST children (both forms share the same rangeExpr node):
	 *   rangeBound[0]  — start bound
	 *   Comma[0]       — present only in the stepped form
	 *   rangeBound[1]  — second value (the explicit step value; actual step = second − start)
	 *   DotDot[0]      — the ".." separator
	 *   rangeBound[N]  — end bound (index 1 in no-step form, 2 in stepped form)
	 *
	 * The evaluator enforces:
	 *   - Zero step is a semantic error.
	 *   - Step going the wrong direction is a semantic error.
	 */
	rangeExpr = this.RULE('rangeExpr', () => {
		this.CONSUME(LBracket);
		this.OR([
			// Stepped form: start, step..end (allows Float or Integer for all bounds)
			{
				GATE: () => this.isSteppedRange(),
				ALT: () => {
					this.SUBRULE(this.rangeBound); // start (Float or Integer)
					this.CONSUME(Comma);
					this.SUBRULE2(this.rangeBound); // step (Float or Integer)
					this.CONSUME(DotDot);
					this.SUBRULE3(this.rangeBound); // end (Float or Integer)
				}
			},
			// No-step form: intStart..end (Integer only for start — Float is rejected)
			{
				ALT: () => {
					this.SUBRULE(this.intBound); // Integer-only start
					this.CONSUME2(DotDot);
					this.SUBRULE4(this.rangeBound); // end (Integer)
				}
			}
		]);
		this.CONSUME(RBracket);
		this.MANY(() => {
			this.SUBRULE(this.modifierSuffix);
		});
	});

	/**
	 * Lookahead: returns true if inside a range bracket we see start, comma before DotDot.
	 * i.e. the token stream looks like: `bound , bound ..`
	 * Called after `[` is consumed, so LA(1) is the first token inside the brackets.
	 */
	private isSteppedRange(): boolean {
		// LA(1) is the first token after the consumed `[`.
		// Scan forward until we find a Comma (stepped form) or DotDot/] (no-step form).
		let i = 1;
		while (i <= 15) {
			const tok = this.LA(i).tokenType;
			if (tok === Comma) return true;
			if (tok === DotDot || tok === RBracket) return false;
			if (this.LA(i).tokenTypeIdx === 0) return false;
			i++;
		}
		return false;
	}

	/**
	 * A numeric bound in a range expression: optional leading minus, then Float or Integer.
	 *
	 * CST children:
	 *   Minus[0]   — present if negative
	 *   Integer[0] — integer literal (if integer bound)
	 *   Float[0]   — float literal (if float bound)
	 */
	rangeBound = this.RULE('rangeBound', () => {
		this.OPTION(() => {
			this.CONSUME(Minus);
		});
		this.OR([{ ALT: () => this.CONSUME(Float) }, { ALT: () => this.CONSUME(Integer) }]);
	});

	/**
	 * An integer-only bound for the no-step range form.
	 * Float is not permitted here — use the stepped form `[f, step..end]` instead.
	 *
	 * CST children:
	 *   Minus[0]   — present if negative
	 *   Integer[0] — integer literal
	 */
	intBound = this.RULE('intBound', () => {
		this.OPTION(() => {
			this.CONSUME(Minus);
		});
		this.CONSUME(Integer);
	});

	sequenceElement = this.RULE('sequenceElement', () => {
		// A degree literal (possibly with accidentals), a rest (_), a \symbol buffer ref,
		// a chord literal (<d1 d2 ... dn>), or a generator expression, with an optional
		// `?weight` for 'wran lists and an optional `!n` repeat count.
		this.OR([
			// rest: a silent slot — no pitch, no synth
			{ ALT: () => this.CONSUME(Rest) },
			// degreeLiteral: Integer followed by accidentals (Sharp/Flat)
			{
				GATE: () => this.hasDegreeAccidental(),
				ALT: () => this.SUBRULE(this.degreeLiteral)
			},
			// chord literal: <d1 d2 ... dn> — N simultaneous degrees
			{
				GATE: () => this.LA(1).tokenType === LAngle,
				ALT: () => this.SUBRULE(this.chordLiteral)
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
	 * Chord literal: `<d1 d2 ... dn>` — N simultaneous degree values in one slot.
	 *
	 * Elements are the same as sequenceElement but without nesting (no chord inside chord).
	 * Each element is an independent generator; modifiers are not valid on the chord itself
	 * (use list-level modifiers instead).
	 *
	 * At least one element is required. An empty `<>` is a parse error.
	 *
	 * CST children:
	 *   - LAngle[0]          — `<`
	 *   - chordElement[]     — one or more chord elements
	 *   - RAngle[0]          — `>`
	 */
	chordLiteral = this.RULE('chordLiteral', () => {
		this.CONSUME(LAngle);
		this.AT_LEAST_ONE(() => {
			this.SUBRULE(this.chordElement);
		});
		this.CONSUME(RAngle);
	});

	/**
	 * A single element inside a chord literal.
	 * Accepts: rest, degreeLiteral, or a generator expression (including utf8, numeric).
	 * Does NOT accept nested chord literals or \symbol buffer refs (those are not meaningful in chord position).
	 *
	 * CST children are the same shape as sequenceElement children.
	 */
	chordElement = this.RULE('chordElement', () => {
		this.OR([
			{ ALT: () => this.CONSUME(Rest) },
			{
				GATE: () => this.hasDegreeAccidental(),
				ALT: () => this.SUBRULE(this.degreeLiteral)
			},
			{ ALT: () => this.SUBRULE(this.generatorExpr) }
		]);
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
			{ ALT: () => this.SUBRULE(this.utf8Generator) },
			{ ALT: () => this.SUBRULE(this.numericGenerator) }
		]);
	});

	/**
	 * `utf8{word}` — UTF-8 byte sequence generator.
	 * Converts the characters of a bare identifier to their UTF-8 byte values
	 * and yields them cyclically.
	 *
	 * CST children:
	 *   - Utf8Kw[0]   — the `utf8` keyword token
	 *   - LCurly[0]   — `{`
	 *   - Identifier[0] — the bare word whose bytes are yielded
	 *   - RCurly[0]   — `}`
	 */
	utf8Generator = this.RULE('utf8Generator', () => {
		this.CONSUME(Utf8Kw);
		this.CONSUME(LCurly);
		this.CONSUME(Identifier);
		this.CONSUME(RCurly);
	});

	parenGenerator = this.RULE('parenGenerator', () => {
		// (generatorExpr) — disambiguates chained generators like (0rand2)rand4
		this.CONSUME(LParen);
		this.SUBRULE(this.generatorExpr);
		this.CONSUME(RParen);
	});

	modifierSuffix = this.RULE('modifierSuffix', () => {
		// `'modName` or `'modName(generatorExpr)` or `'at(timeExpr)` or `'arp(...)` (special args)
		// 'at is the one modifier whose argument is a timeExpr (integer or
		// integer/integer fraction) rather than a generatorExpr.  We gate on
		// LA(2) being the identifier "at" before the tick is consumed so the
		// parser can branch correctly.
		// 'arp has its own argument syntax: `(\symbol)` or `(\symbol integer)`.
		this.OR([
			{
				GATE: () => this.LA(2).image === 'at',
				ALT: () => this.SUBRULE(this.atModifier)
			},
			{
				GATE: () => this.LA(2).image === 'arp',
				ALT: () => this.SUBRULE(this.arpModifier)
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

	arpModifier = this.RULE('arpModifier', () => {
		// 'arp                        — bare (default \up algorithm)
		// 'arp(\symbol)               — explicit algorithm
		// 'arp(\symbol integer)        — algorithm with length override (positive integer)
		// 'arp(\symbol -integer)       — negative length: parsed here, semantic error in evaluator
		//
		// CST children:
		//   Tick[0]     — the `'` token
		//   Identifier[0] — always "arp"
		//   LParen[0]   — present if args follow
		//   Symbol[0]   — algorithm symbol (e.g. \up, \down)
		//   Minus[0]    — present if length is negative (semantic error — caught in evaluator)
		//   Integer[0]  — optional length override
		//   RParen[0]   — closing paren
		this.CONSUME(Tick);
		this.CONSUME(Identifier); // always "arp"
		this.OPTION(() => {
			this.CONSUME(LParen);
			this.CONSUME(Symbol); // algorithm symbol: \up, \down, etc.
			this.OPTION2(() => {
				this.OPTION3(() => {
					this.CONSUME(Minus); // optional leading minus (caught as semantic error in evaluator)
				});
				this.CONSUME(Integer); // optional length override
			});
			this.CONSUME(RParen);
		});
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
				{ ALT: () => this.SUBRULE(this.gaussGen) },
				{ ALT: () => this.SUBRULE(this.expGen) },
				{ ALT: () => this.SUBRULE(this.brownGen) },
				{ ALT: () => this.SUBRULE(this.stepGen) },
				{ ALT: () => this.SUBRULE(this.mulGen) },
				{ ALT: () => this.SUBRULE(this.linGen) },
				{ ALT: () => this.SUBRULE(this.geomGen) }
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

	gaussGen = this.RULE('gaussGen', () => {
		// 0gauss4 — Pgauss(mean, sdev)
		this.CONSUME(Gauss);
		this.SUBRULE(this.numericLiteral);
	});

	expGen = this.RULE('expGen', () => {
		// 1exp7 — Pexprand(min, max)
		this.CONSUME(Exp);
		this.SUBRULE(this.numericLiteral);
	});

	brownGen = this.RULE('brownGen', () => {
		// 0brown10m2 — Pbrown(min, max, max_step)
		this.CONSUME(Brown);
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

	geomGen = this.RULE('geomGen', () => {
		// 2geom7x8 — geometric interpolation
		this.CONSUME(Geom);
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
