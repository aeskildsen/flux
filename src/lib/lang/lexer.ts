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
 * - Keywords (Loop, Line, Fx, …) must appear BEFORE Identifier in allTokens,
 *   and must declare `longer_alt: Identifier` so the lexer knows to prefer
 *   the keyword when both could match.
 *
 * - More specific patterns (LineComment starts with //) must appear BEFORE
 *   more general ones (Slash operator) that share a prefix.
 *
 * ## Monaco semantic token type names
 *
 * Use the standard names — they map directly to Monaco's built-in themes
 * and to LSP semantic token types, with no extra registration needed:
 *   keyword | number | operator | string | comment | variable | type
 */

import { createToken, Lexer } from 'chevrotain';

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
// Keywords
// ---------------------------------------------------------------------------
//
// Each keyword should declare `longer_alt: Identifier` once Identifier is
// added. This tells Chevrotain: if the text could be an Identifier, prefer
// the keyword. Without it, `loop` in `loopCount` would tokenize as Loop.
//
// Example (add longer_alt once Identifier is defined):
//   export const Loop = createToken({ name: 'Loop', pattern: /loop/, longer_alt: Identifier });

/** `loop` — cyclic pattern mode. */
export const Loop = createToken({
	name: 'Loop',
	pattern: /loop/
	// Monaco scope: 'keyword'
	// TODO: add longer_alt: Identifier once Identifier token is defined
});

// ---------------------------------------------------------------------------
// TODO: Add remaining keywords here, before Identifier in allTokens.
//
// Candidates from the spec:
//   line, fx, set, send_fx, master_fx
//
// Each follows the same pattern as Loop above.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Operators
// ---------------------------------------------------------------------------

/**
 * `'` — the modifier sigil. Introduces a modifier name, e.g. `'lock`, `'stut(2)`.
 *
 * This is a single-character token. The modifier name that follows is a
 * separate Identifier token (once defined).
 */
export const Tick = createToken({
	name: 'Tick',
	pattern: /'/
	// Monaco scope: 'operator'
});

// ---------------------------------------------------------------------------
// TODO: Add more operators here. Candidates from the spec:
//   LBracket `[`, RBracket `]`, LBrace `{`, RBrace `}`
//   LParen `(`, RParen `)`, Pipe `|`, At `@`, Colon `:`, Question `?`, Tilde `~`
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Literals
// ---------------------------------------------------------------------------

/**
 * Integer literal, e.g. `0`, `4`, `127`.
 *
 * Note: the generator shorthand syntax (`0whi4`, `1exp7`) is not handled here.
 * Those compact forms will likely be their own tokens or parsed as a sequence
 * of Integer + generator-keyword tokens. Decide when adding those tokens.
 */
export const Integer = createToken({
	name: 'Integer',
	pattern: /\d+/
	// Monaco scope: 'number'
});

// ---------------------------------------------------------------------------
// TODO: Add more literal tokens. Candidates from the spec:
//   Float (e.g. `0.5`, `1.2`) — must appear BEFORE Integer (longer match wins)
//   StringLiteral (e.g. `"moog"`, `"reverb"`)
// ---------------------------------------------------------------------------

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
// TODO: Identifier — add after all keywords, before WhiteSpace.
//
// export const Identifier = createToken({
//   name: 'Identifier',
//   pattern: /[a-zA-Z_][a-zA-Z0-9_]*/,
//   // Monaco scope: 'variable'
// });
//
// Then update each keyword above to add: longer_alt: Identifier
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Token registry
//
// ORDER MATTERS. Chevrotain resolves ties by position — put more specific
// tokens first. Current order:
//   1. LineComment  — starts with //; must beat any future Slash operator
//   2. Loop         — keyword; will need to beat Identifier (add longer_alt)
//   3. Tick         — single char '
//   4. Integer      — digits; Float (once added) must go BEFORE this
//   5. WhiteSpace   — catch-all whitespace; always last
//
// When adding Identifier, insert it AFTER all keywords, BEFORE WhiteSpace.
// ---------------------------------------------------------------------------

export const allTokens = [LineComment, Loop, Tick, Integer, WhiteSpace];

export const FluxLexer = new Lexer(allTokens);
