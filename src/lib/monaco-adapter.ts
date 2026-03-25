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
	LineComment: 'comment',
	Loop: 'keyword',
	Tick: 'operator',
	Integer: 'number'
	// Add more here as tokens are defined in lexer.ts, e.g.:
	// Line:          'keyword',
	// Fx:            'keyword',
	// Identifier:    'variable',
	// Float:         'number',
	// StringLiteral: 'string',
	// LBracket:      'delimiter.bracket',
	// RBracket:      'delimiter.bracket',
	// Pipe:          'operator',
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
