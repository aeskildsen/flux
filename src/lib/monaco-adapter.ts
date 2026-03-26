/**
 * Flux DSL — Monaco Editor adapter.
 *
 * Connects the framework-agnostic language core (src/lib/lang/) to Monaco's
 * APIs. One source of truth: the Chevrotain lexer drives both syntax
 * highlighting and (eventually) completions/hover — no separate Monarch grammar.
 *
 * ## Wiring
 *
 * In FluxEditor.svelte, inside the import('monaco-editor').then(...) block:
 *
 *   import { registerFluxLanguage } from '$lib/monaco-adapter.js';
 *   // ...
 *   import('monaco-editor').then((monaco) => {
 *     registerFluxLanguage(monaco);
 *     editor = monaco.editor.create(container, {
 *       value,
 *       language: 'flux',   // ← change from 'plaintext'
 *       ...
 *     });
 *   });
 */

import type * as Monaco from 'monaco-editor';
import { FluxLexer } from '$lib/lang/lexer.js';
import { getCompletions } from '$lib/lang/completions.js';
import { getHover } from '$lib/lang/hover.js';

void getCompletions;
void getHover;

// ---------------------------------------------------------------------------
// Token name → Monaco scope string
//
// Standard scope names map to Monaco's built-in themes (vs-dark etc.) with no
// extra theme registration. Add an entry here for each token you define.
// ---------------------------------------------------------------------------

const SCOPE_MAP: Record<string, string> = {
	// Comments
	LineComment: 'comment',
	// Statement keywords
	Loop: 'keyword',
	Line: 'keyword',
	Fx: 'keyword',
	SendFx: 'keyword',
	MasterFx: 'keyword',
	Set: 'keyword',
	// Generator keywords
	Rand: 'keyword.operator',
	Gau: 'keyword.operator',
	Exp: 'keyword.operator',
	Bro: 'keyword.operator',
	BroStep: 'keyword.operator',
	Step: 'keyword.operator',
	Mul: 'keyword.operator',
	Lin: 'keyword.operator',
	Geo: 'keyword.operator',
	LenSep: 'keyword.operator',
	// Identifiers
	Identifier: 'variable',
	// Operators
	Tick: 'operator',
	LBracket: 'delimiter.bracket',
	RBracket: 'delimiter.bracket',
	LParen: 'delimiter.parenthesis',
	RParen: 'delimiter.parenthesis',
	LBrace: 'delimiter.bracket',
	RBrace: 'delimiter.bracket',
	Pipe: 'operator',
	At: 'operator',
	Tilde: 'operator',
	Question: 'operator',
	Equals: 'operator',
	Plus: 'operator',
	Minus: 'operator',
	Slash: 'operator',
	Colon: 'operator',
	// Literals
	Float: 'number',
	Integer: 'number',
	StringLiteral: 'string'
};

function tokenTypeToScope(name: string): string {
	return SCOPE_MAP[name] ?? '';
}

// ---------------------------------------------------------------------------
// ITokensProvider state — Flux is single-line for now, so state is trivial.
// ---------------------------------------------------------------------------

const EMPTY_STATE: Monaco.languages.IState = {
	clone: () => EMPTY_STATE,
	equals: (other) => other === EMPTY_STATE
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Register the 'flux' language with Monaco.
 * Call this once, before creating the editor instance.
 */
export function registerFluxLanguage(monaco: typeof Monaco): void {
	monaco.languages.register({ id: 'flux' });

	monaco.languages.setTokensProvider('flux', {
		getInitialState: () => EMPTY_STATE,
		tokenize: (line) => {
			const { tokens } = FluxLexer.tokenize(line);
			return {
				tokens: tokens.map((t) => ({
					startIndex: t.startOffset,
					scopes: tokenTypeToScope(t.tokenType.name)
				})),
				endState: EMPTY_STATE
			};
		}
	});
}
