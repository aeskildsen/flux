/**
 * Flux DSL — CstParser skeleton.
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
 *   import { parser } from './parser.js';
 *
 *   const { tokens, errors: lexErrors } = FluxLexer.tokenize(input);
 *   parser.input = tokens;           // feed tokens to the parser
 *   const cst = parser.program();    // call the top-level rule
 *   const parseErrors = parser.errors;
 */

import { CstParser } from 'chevrotain';
import { allTokens, LineComment, Loop, Tick } from './lexer.js';

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
		// TODO: define the full set of statement alternatives.
		// Likely an OR over: loopStatement, lineStatement, fxStatement, setStatement, assignment.
		this.OR([
			{ ALT: () => this.SUBRULE(this.loopStatement) },
			{ ALT: () => this.CONSUME(LineComment) }
			// TODO: { ALT: () => this.SUBRULE(this.lineStatement) },
			// TODO: { ALT: () => this.SUBRULE(this.fxStatement) },
			// TODO: { ALT: () => this.SUBRULE(this.setStatement) },
		]);
	});

	loopStatement = this.RULE('loopStatement', () => {
		// `loop [...]`  or  `loop("synthdef") [...]`
		// TODO: expand with optional synthdef arg, list body, and modifiers.
		this.CONSUME(Loop);
		this.MANY(() => {
			this.SUBRULE(this.modifier);
		});
	});

	modifier = this.RULE('modifier', () => {
		// `'modName`  or  `'modName(args)`
		//
		// The tick is consumed here. The modifier name (an Identifier token)
		// and optional argument list come next. Both are TODO until Identifier
		// and the punctuation tokens (LParen, RParen) are defined.
		this.CONSUME(Tick);
		// TODO: this.CONSUME(Identifier);
		// TODO: this.OPTION(() => {
		//   this.CONSUME(LParen);
		//   this.SUBRULE(this.argList);
		//   this.CONSUME(RParen);
		// });
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
