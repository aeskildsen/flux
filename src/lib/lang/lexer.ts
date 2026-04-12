/**
 * Flux DSL — Token definitions and Lexer.
 *
 * This file is the single source of truth for all token patterns.
 * Monaco's ITokensProvider runs this lexer directly — there is no
 * separate Monarch grammar. See src/lib/monaco-adapter.ts.
 *
 * ## Adding tokens
 *
 * 1. Create the token with createToken().
 * 2. Add it to allTokens in the correct position (see ordering rules below).
 * 3. Export it so consumers can reference tokenType by name.
 *
 * ## Token ordering rules (Chevrotain)
 *
 * Chevrotain resolves ambiguity by "longest match wins", breaking ties by
 * order in allTokens. Two consequences:
 *
 * - Keywords (Note, Mono, Sample, Slice, Cloud, Fx, …) must appear BEFORE Identifier in allTokens,
 *   and must declare `longer_alt: Identifier` so the lexer knows to prefer
 *   the identifier when both could match (e.g. `loopCount` → Identifier, not
 *   Loop + Count).
 *
 * - More specific patterns (LineComment starts with //) must appear BEFORE
 *   more general ones (Slash operator) that share a prefix.
 *
 * - Float must appear BEFORE Integer so `0.5` matches Float, not Integer(`0`)
 *   + unexpected(`.5`).
 *
 * ## Monaco semantic token type names
 *
 * Use the standard names — they map directly to Monaco's built-in themes
 * and to LSP semantic token types, with no extra registration needed:
 *   keyword | number | operator | string | comment | variable | type
 */

import { createToken, Lexer } from 'chevrotain';

// ---------------------------------------------------------------------------
// Block comment — must appear before LineComment in allTokens so `/*` is not
// split into Slash + something.  Added to SKIPPED so neither the parser nor
// Monaco's token array see it; multi-line handling is done in the Monaco
// adapter's state machine.
// ---------------------------------------------------------------------------

/**
 * `/* … * /` — block comment. Matches across newlines.
 * group: SKIPPED means it is invisible to the parser and token-based tooling;
 * syntax highlighting is handled separately in the Monaco tokenize() state.
 */
export const BlockComment = createToken({
	name: 'BlockComment',
	pattern: /\/\*[\s\S]*?\*\//,
	line_breaks: true,
	group: Lexer.SKIPPED
	// Monaco scope: 'comment' (applied manually in state machine)
});

// ---------------------------------------------------------------------------
// Identifier — declared first so keywords can reference it in longer_alt.
// It must still appear AFTER all keywords in allTokens (that array controls
// lexer precedence, not JS declaration order).
// ---------------------------------------------------------------------------

/**
 * Identifier — modifier names, synthdef names, scale names, parameter keys.
 * e.g. `lock`, `stut`, `moog`, `major`.
 */
export const Identifier = createToken({
	name: 'Identifier',
	pattern: /[a-zA-Z_][a-zA-Z0-9_]*/
	// Monaco scope: 'variable'
});

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

/** `// line comment` — matches to end of line (not including the newline). */
export const LineComment = createToken({
	name: 'LineComment',
	pattern: /\/\/.*/
	// Monaco scope: 'comment'
});

// ---------------------------------------------------------------------------
// Statement keywords
// ---------------------------------------------------------------------------
//
// Each keyword declares `longer_alt: Identifier` so that e.g. `loopCount`
// tokenises as a single Identifier rather than Loop + Identifier("Count").

/** `note` — polyphonic pitched events. Default content type. */
export const Note = createToken({
	name: 'Note',
	pattern: /note/,
	longer_alt: Identifier
	// Monaco scope: 'keyword'
});

/** `mono` — monophonic pitched events; single persistent synth node. */
export const Mono = createToken({
	name: 'Mono',
	pattern: /mono/,
	longer_alt: Identifier
	// Monaco scope: 'keyword'
});

/** `sample` — buffer playback. */
export const Sample = createToken({
	name: 'Sample',
	pattern: /sample/,
	longer_alt: Identifier
	// Monaco scope: 'keyword'
});

/** `slice` — beat-sliced buffer playback. */
export const Slice = createToken({
	name: 'Slice',
	pattern: /slice/,
	longer_alt: Identifier
	// Monaco scope: 'keyword'
});

/** `cloud` — granular synthesis. */
export const Cloud = createToken({
	name: 'Cloud',
	pattern: /cloud/,
	longer_alt: Identifier
	// Monaco scope: 'keyword'
});

/** `fx` — anonymous insert effect. */
export const Fx = createToken({
	name: 'Fx',
	pattern: /fx/,
	longer_alt: Identifier
	// Monaco scope: 'keyword'
});

/**
 * `utf8` — byte-sequence generator keyword.
 * Only matches when immediately followed by `{` (no whitespace).
 * This prevents `utf8foo` from tokenising as Utf8Kw + Identifier.
 * Uses a custom pattern so the lexer can enforce the no-space rule.
 */
export const Utf8Kw = createToken({
	name: 'Utf8Kw',
	pattern: {
		exec: (text: string, offset: number) => {
			if (text.slice(offset, offset + 4) !== 'utf8') return null;
			if (text[offset + 4] !== '{') return null;
			const match = ['utf8'] as unknown as RegExpExecArray;
			match.index = offset;
			match.input = text;
			return match;
		}
	},
	longer_alt: Identifier,
	line_breaks: false
	// Monaco scope: 'keyword'
});

/**
 * `{` — opens a utf8 generator body.
 * Only matches when immediately preceded by `utf8` (i.e., the 4 characters
 * before the current offset are `utf8`). This keeps `{` a lex error in all
 * other contexts, preserving backwards-compatibility.
 */
export const LCurly = createToken({
	name: 'LCurly',
	pattern: {
		exec: (text: string, offset: number) => {
			if (text[offset] !== '{') return null;
			if (text.slice(offset - 4, offset) !== 'utf8') return null;
			const match = ['{'] as unknown as RegExpExecArray;
			match.index = offset;
			match.input = text;
			return match;
		}
	},
	line_breaks: false
	// Monaco scope: 'delimiter'
});

/**
 * `}` — closes a utf8 generator body.
 * Only matches when the preceding character is an identifier character
 * (letter, digit, or underscore) — i.e., when we are at the end of an
 * identifier inside `utf8{word}`. A lone `}` (preceded by nothing or
 * by non-identifier characters) remains a lex error.
 */
export const RCurly = createToken({
	name: 'RCurly',
	pattern: {
		exec: (text: string, offset: number) => {
			if (text[offset] !== '}') return null;
			if (offset === 0) return null;
			const prev = text[offset - 1];
			if (!/[a-zA-Z0-9_]/.test(prev)) return null;
			const match = ['}'] as unknown as RegExpExecArray;
			match.index = offset;
			match.input = text;
			return match;
		}
	},
	line_breaks: false
	// Monaco scope: 'delimiter'
});

// send_fx and master_fx are removed — send FX are not supported.
// master bus FX are UI-configured and have no DSL syntax.
// Keeping stub exports for any remaining references (will be cleaned up in parser/evaluator).
export const SendFx = createToken({
	name: 'SendFx',
	pattern: Lexer.NA
});

export const MasterFx = createToken({
	name: 'MasterFx',
	pattern: Lexer.NA
});

/** `set` — global session state setter. */
export const Set = createToken({
	name: 'Set',
	pattern: /set/,
	longer_alt: Identifier
	// Monaco scope: 'keyword'
});

// ---------------------------------------------------------------------------
// Generator keywords
//
// These appear between numbers without whitespace: `0rand4`, `1exp7`, etc.
// They cannot use simple regex patterns because Chevrotain's longest-match
// rule would cause `Identifier` (matching e.g. `rand4`) to win over `Rand`
// (matching `rand`). Instead, we use custom pattern functions that match
// only the keyword characters and enforce a positive lookahead for a digit
// (or the specific separators that follow them in context). Custom patterns
// must set the `line_breaks` property and return a regex match array or null.
//
// This also means `random` correctly tokenises as Identifier (the function
// fails to match when the keyword is followed by a letter).
// ---------------------------------------------------------------------------

/** Helper: creates a custom Chevrotain pattern function for a generator keyword. */
function genKeywordPattern(
	keyword: string,
	followedBy: RegExp
): (text: string, offset: number) => RegExpExecArray | null {
	const klen = keyword.length;
	return (text: string, offset: number) => {
		// Check keyword characters match
		if (text.slice(offset, offset + klen) !== keyword) return null;
		// Check what follows
		const next = text[offset + klen];
		if (next === undefined) {
			// end of input — only match if followedBy allows end-of-string
			if (followedBy.test('')) {
				const match = [keyword] as unknown as RegExpExecArray;
				match.index = offset;
				match.input = text;
				return match;
			}
			return null;
		}
		if (!followedBy.test(next)) return null;
		const match = [keyword] as unknown as RegExpExecArray;
		match.index = offset;
		match.input = text;
		return match;
	};
}

/** `rand` — uniform random (Pwhite). e.g. `0rand4`. Matches only when followed by a digit or `~`. */
export const Rand = createToken({
	name: 'Rand',
	pattern: { exec: genKeywordPattern('rand', /[\d(]/) },
	line_breaks: false
	// Monaco scope: 'keyword'
});

/** `gau` — gaussian random (Pgauss). e.g. `0gau4`. */
export const Gau = createToken({
	name: 'Gau',
	pattern: { exec: genKeywordPattern('gau', /[\d(]/) },
	line_breaks: false
	// Monaco scope: 'keyword'
});

/** `exp` — exponential random (Pexprand). e.g. `1exp7`. */
export const Exp = createToken({
	name: 'Exp',
	pattern: { exec: genKeywordPattern('exp', /[\d(]/) },
	line_breaks: false
	// Monaco scope: 'keyword'
});

/**
 * `bro` — brownian motion (Pbrown). e.g. `0bro10m2`.
 * The `m` separator for max_step is a separate token (BroStep).
 */
export const Bro = createToken({
	name: 'Bro',
	pattern: { exec: genKeywordPattern('bro', /[\d(]/) },
	line_breaks: false
	// Monaco scope: 'keyword'
});

/**
 * `m` — max_step separator in brownian generators: `0bro10m2`.
 * Matches only when followed by a digit (the max_step value).
 */
export const BroStep = createToken({
	name: 'BroStep',
	pattern: { exec: genKeywordPattern('m', /\d/) },
	line_breaks: false
	// Monaco scope: 'keyword'
});

/** `step` — linear series (Pseries). e.g. `0step2x4`. Matches when followed by a digit. */
export const Step = createToken({
	name: 'Step',
	pattern: { exec: genKeywordPattern('step', /\d/) },
	line_breaks: false
	// Monaco scope: 'keyword'
});

/** `mul` — geometric series (Pgeom). e.g. `5mul2x4`. */
export const Mul = createToken({
	name: 'Mul',
	pattern: { exec: genKeywordPattern('mul', /\d/) },
	line_breaks: false
	// Monaco scope: 'keyword'
});

/** `lin` — linear interpolation. e.g. `2lin7x8`. */
export const Lin = createToken({
	name: 'Lin',
	pattern: { exec: genKeywordPattern('lin', /\d/) },
	line_breaks: false
	// Monaco scope: 'keyword'
});

/** `geo` — geometric interpolation. e.g. `2geo7x8`. */
export const Geo = createToken({
	name: 'Geo',
	pattern: { exec: genKeywordPattern('geo', /\d/) },
	line_breaks: false
	// Monaco scope: 'keyword'
});

/**
 * `x` — length separator in deterministic generators: `0step2x4`.
 * Matches only when followed by a digit (the length value).
 */
export const LenSep = createToken({
	name: 'LenSep',
	pattern: { exec: genKeywordPattern('x', /\d/) },
	line_breaks: false
	// Monaco scope: 'keyword'
});

// ---------------------------------------------------------------------------
// Accidental tokens
//
// Accidentals appear directly after an integer degree: `2b`, `4#`, `3bb`.
// They must be placed BEFORE Identifier in allTokens so a standalone `b`
// or `#` doesn't get swallowed by Identifier.
//
// `Flat` matches `b` only when NOT followed by an identifier character or
// digit, preventing `bro` from matching as Flat + "ro". (The Bro token uses
// its own custom pattern and is ordered before Flat anyway, but this guard
// makes the rule robust.)
//
// `Sharp` matches `#` unconditionally — `#` never appears as part of
// Identifier or any other existing token.
// ---------------------------------------------------------------------------

/**
 * `b` / `bb` / `bbb` — flat accidental(s). Matches one or more consecutive `b`
 * characters ONLY when:
 *   - the sequence is NOT followed by an alphanumeric character or underscore
 *     (prevents `bar` → Flat + `ar`)
 *   - offset > 0 AND the preceding character is a digit or `#` (prevents bare
 *     `b` or `bb` at the start of input or after a non-degree character)
 *
 * Matching `b+` as a single token means `3bb` → Integer("3") + Flat("bb"),
 * beating a one-char Identifier match on the first `b`. The parser uses
 * `.image.length` to count the number of flats (each `b` = one flat).
 *
 * Double-flat example: `3bb` → Integer + Flat("bb") → degree 3, accidental -2.
 */
export const Flat = createToken({
	name: 'Flat',
	pattern: {
		exec: (text: string, offset: number) => {
			if (text[offset] !== 'b') return null;
			// Check preceding character — must be a digit or '#'
			if (offset === 0) return null;
			const prev = text[offset - 1];
			if (!/[0-9#]/.test(prev)) return null;
			// Greedily consume all consecutive 'b' characters
			let len = 0;
			while (offset + len < text.length && text[offset + len] === 'b') len++;
			// Ensure the sequence is not followed by alphanumeric or underscore
			const after = text[offset + len];
			if (after !== undefined && /[a-zA-Z0-9_]/.test(after)) return null;
			const image = text.slice(offset, offset + len);
			const match = [image] as unknown as RegExpExecArray;
			match.index = offset;
			match.input = text;
			return match;
		}
	},
	line_breaks: false
	// Monaco scope: 'operator'
});

/** `#` — sharp accidental. */
export const Sharp = createToken({
	name: 'Sharp',
	pattern: /#/
	// Monaco scope: 'operator'
});

// ---------------------------------------------------------------------------
// Synthetic INDENT / DEDENT tokens
//
// Chevrotain is context-free — it has no native support for indentation.
// These tokens are never produced by the lexer directly (pattern: Lexer.NA).
// Instead, a pre-processing step (preprocessTokens in parser.ts) scans the
// raw token stream and injects synthetic INDENT/DEDENT tokens before the
// token stream is handed to the parser.
// ---------------------------------------------------------------------------

/** Synthetic INDENT — injected by preprocessTokens when indentation increases. */
export const INDENT = createToken({
	name: 'INDENT',
	pattern: Lexer.NA
});

/** Synthetic DEDENT — injected by preprocessTokens when indentation decreases. */
export const DEDENT = createToken({
	name: 'DEDENT',
	pattern: Lexer.NA
});

// ---------------------------------------------------------------------------
// Operators and punctuation
// ---------------------------------------------------------------------------

/**
 * `'` — the modifier sigil. Introduces a modifier name, e.g. `'lock`, `'stut(2)`.
 */
export const Tick = createToken({
	name: 'Tick',
	pattern: /'/
	// Monaco scope: 'operator'
});

/** `[` — open sequence generator. */
export const LBracket = createToken({
	name: 'LBracket',
	pattern: /\[/
	// Monaco scope: 'delimiter.bracket'
});

/** `]` — close sequence generator. */
export const RBracket = createToken({
	name: 'RBracket',
	pattern: /\]/
	// Monaco scope: 'delimiter.bracket'
});

/** `(` — open argument list or nested generator. */
export const LParen = createToken({
	name: 'LParen',
	pattern: /\(/
	// Monaco scope: 'delimiter.parenthesis'
});

/** `)` — close argument list or nested generator. */
export const RParen = createToken({
	name: 'RParen',
	pattern: /\)/
	// Monaco scope: 'delimiter.parenthesis'
});

/** `|` — pipe operator (insert FX). */
export const Pipe = createToken({
	name: 'Pipe',
	pattern: /\|/
	// Monaco scope: 'operator'
});

/** `@` — decorator sigil. */
export const At = createToken({
	name: 'At',
	pattern: /@/
	// Monaco scope: 'operator'
});

/** `~` — shorthand for `rand`: `0~4` means `0rand4`. */
export const Tilde = createToken({
	name: 'Tilde',
	pattern: /~/
	// Monaco scope: 'operator'
});

/** `?` — weight operator in `'wran` lists: `[1 2 3?2]`. */
export const Question = createToken({
	name: 'Question',
	pattern: /\?/
	// Monaco scope: 'operator'
});

/** `=` — assignment operator: `reverb = send_fx(...)`. */
export const Equals = createToken({
	name: 'Equals',
	pattern: /=/
	// Monaco scope: 'operator'
});

/** `+` — modal transposition up. */
export const Plus = createToken({
	name: 'Plus',
	pattern: /\+/
	// Monaco scope: 'operator'
});

/** `-` — modal transposition down or negative number. */
export const Minus = createToken({
	name: 'Minus',
	pattern: /-/
	// Monaco scope: 'operator'
});

/** `/` — division, used in time expressions like `1/4`. */
export const Slash = createToken({
	name: 'Slash',
	pattern: /\//
	// Monaco scope: 'operator'
});

export const Colon = createToken({
	name: 'Colon',
	pattern: /:/
	// Monaco scope: 'operator'
});

/** `!` — duplication / inline-repetition operator. `1!4` inside `[...]` expands to four copies of 1. */
export const Bang = createToken({
	name: 'Bang',
	pattern: /!/
	// Monaco scope: 'operator'
});

/** `%` — wet/dry percentage in FX pipe: `| fx(\lpf) 70%`. Always follows an integer. */
export const Percent = createToken({
	name: 'Percent',
	pattern: /%/
	// Monaco scope: 'operator'
});

/**
 * `_` — rest: a silent slot in a sequence. No synth is spawned; the slot occupies time.
 * Uses a custom pattern that matches a standalone `_` — not followed by alphanumeric or
 * additional underscore characters — so that identifiers like `_foo` or `__bar` still
 * tokenise as Identifier rather than Rest + Identifier.
 */
export const Rest = createToken({
	name: 'Rest',
	pattern: {
		exec: (text: string, offset: number) => {
			if (text[offset] !== '_') return null;
			const next = text[offset + 1];
			if (next !== undefined && /[a-zA-Z0-9_]/.test(next)) return null;
			const match = ['_'] as unknown as RegExpExecArray;
			match.index = offset;
			match.input = text;
			return match;
		}
	},
	line_breaks: false
	// Monaco scope: 'keyword'
});

// ---------------------------------------------------------------------------
// Literals
// ---------------------------------------------------------------------------

/**
 * Float literal, e.g. `0.5`, `1.2`.
 * Must appear BEFORE Integer in allTokens — `0.5` would otherwise lex as
 * Integer(`0`) then an error on `.5`.
 *
 * The pattern requires digits on both sides of the dot.
 * `0.rand4` (float-rand form) is handled by Float + Rand + Integer.
 */
export const Float = createToken({
	name: 'Float',
	pattern: /\d+\.\d*/
	// Monaco scope: 'number'
});

/**
 * Integer literal, e.g. `0`, `4`, `127`.
 * Must come AFTER Float in allTokens.
 */
export const Integer = createToken({
	name: 'Integer',
	pattern: /\d+/
	// Monaco scope: 'number'
});

/**
 * Symbol literal, e.g. `\moog`, `\reverb`, `\minor`.
 * Used for synthdef names, FX names, and scale names passed as arguments.
 * The backslash and identifier form a single token — no whitespace allowed between them.
 * Borrowed from SuperCollider's symbol notation.
 */
export const Symbol = createToken({
	name: 'Symbol',
	pattern: /\\[a-zA-Z_][a-zA-Z0-9_]*/
	// Monaco scope: 'string'
});

/**
 * ParamSigil — direct SynthDef argument access.
 * `"identifier` — double-quote immediately followed by an identifier, no whitespace.
 * Analogous to `\symbol`: the `"` and identifier form a single token.
 *
 * e.g. `"amp`, `"pan`, `"cutoff`
 *
 * Used as: `note [0 2 4]"amp(0.5)"pan(-0.3)`
 * The value argument is parsed separately (LParen + generatorExpr + RParen).
 */
export const ParamSigil = createToken({
	name: 'ParamSigil',
	pattern: /"[a-zA-Z_][a-zA-Z0-9_]*/
	// Monaco scope: 'property'
});

// ---------------------------------------------------------------------------
// Whitespace (skipped)
// ---------------------------------------------------------------------------

/**
 * Whitespace — skipped by the lexer (not returned in token array).
 *
 * `line_breaks: true` is required so Chevrotain tracks line/column positions
 * accurately. This is important for Monaco's line-by-line tokenize() calls.
 */
export const WhiteSpace = createToken({
	name: 'WhiteSpace',
	pattern: /\s+/,
	group: Lexer.SKIPPED,
	line_breaks: true
});

// ---------------------------------------------------------------------------
// Token registry
//
// ORDER MATTERS. Rules:
//   1. LineComment first — must beat any future Slash token
//   2. Multi-char keywords before shorter ones that share a prefix:
//      Step before Set, Sample before shorter keywords
//   3. All keywords before Identifier (with longer_alt set on each)
//   4. Float before Integer
//   5. Identifier before WhiteSpace
//   6. WhiteSpace last
//
// Note: SendFx and MasterFx are removed — send FX are not supported and
// master bus FX are UI-only. Their token definitions are kept as Lexer.NA
// stubs so existing imports don't break, but they are not in this array.
// ---------------------------------------------------------------------------

export const allTokens = [
	// Comments (block before line — both start with '/', longest match wins)
	BlockComment,
	LineComment,
	// Statement keywords (longer ones first where prefixes overlap)
	Sample, // 'sample' before shorter keywords
	Slice,
	Cloud,
	Note,
	Mono,
	Fx,
	Utf8Kw, // 'utf8' keyword — must appear before Identifier; longer_alt: Identifier
	Set,
	// Generator keywords (longer ones first where prefixes overlap)
	Step, // 'step' before 'set' — no overlap, but keep deterministic order
	Rand,
	Gau,
	Exp,
	Bro,
	Mul,
	Lin,
	Geo,
	BroStep, // 'm' — single char, after multi-char keywords; before Flat ('b')
	LenSep, // 'x' — single char, after all multi-char keywords
	// Accidentals — before Identifier so standalone 'b' and '#' tokenise correctly
	Flat, // 'b' — must come after Bro/BroStep so 'bro...' is not split
	Sharp, // '#'
	// Rest — before Identifier so standalone '_' doesn't tokenise as Identifier
	Rest,
	// Identifier — after all keywords, accidentals and Rest
	Identifier,
	// Synthetic indent/dedent tokens (pattern: NA — injected by preprocessTokens)
	INDENT,
	DEDENT,
	// Operators and punctuation
	Tick,
	LBracket,
	RBracket,
	LParen,
	RParen,
	LCurly, // '{' — only valid immediately after 'utf8'
	RCurly, // '}' — only valid to close a utf8{...} body
	Pipe,
	At,
	Tilde,
	Question,
	Equals,
	Plus,
	Minus,
	Slash,
	Colon,
	Bang,
	Percent,
	// Literals — Float before Integer
	Float,
	Integer,
	Symbol,
	ParamSigil,
	// Whitespace — always last
	WhiteSpace
];

export const FluxLexer = new Lexer(allTokens);
