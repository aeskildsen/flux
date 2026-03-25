/**
 * Flux DSL — hover tooltip provider (framework-agnostic).
 *
 * Keep all hover logic here, not inside Monaco API callbacks.
 * This makes the logic independently testable and portable to LSP.
 *
 * High value, low effort: identify the token at the cursor, look it up in
 * a static docs table, return markdown. Especially useful for the terse
 * generator syntax (0whi4, 1exp7, 0bro10m2, etc.).
 */

import type { IToken } from 'chevrotain';

export interface HoverResult {
	/** Markdown string to display in the hover popup. */
	contents: string;
}

/**
 * Return hover documentation for the token at the cursor, or null if
 * no documentation is available.
 *
 * @param token - The token under the cursor, from FluxLexer.tokenize().
 */
export function getHover(token: IToken): HoverResult | null {
	// TODO: implement
	// Outline:
	//   1. Switch on token.tokenType.name.
	//   2. Look up the token image or name in a static docs table (Record<string, string>).
	//   3. Return { contents: markdownString } or null if not found.
	void token;
	return null;
}
