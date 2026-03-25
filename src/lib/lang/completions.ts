/**
 * Flux DSL — completion item provider (framework-agnostic).
 *
 * Keep all completion logic here, not inside Monaco API callbacks.
 * This makes the logic independently testable and portable to LSP.
 *
 * The Monaco adapter calls this and maps the results to Monaco's
 * CompletionItem format.
 *
 * Completion is largely static table lookups driven by trigger characters:
 *   '    → offer modifier names: lock, eager, stut, legato, at, repeat, mono, tail, offset, …
 *   [    → offer generators, scale degrees, literals
 *   (    → context-sensitive: synthdef names after loop/line/fx("…"), arg values after modifiers
 *   |    → offer fx("…") patterns
 */

import type { IToken } from 'chevrotain';

export interface CompletionItem {
	label: string;
	insertText: string;
	detail?: string;
}

/**
 * Return completion items relevant at the given cursor position.
 *
 * @param tokens - All tokens on the current line, from FluxLexer.tokenize().
 * @param cursorOffset - Character offset of the cursor within the line.
 */
export function getCompletions(tokens: IToken[], cursorOffset: number): CompletionItem[] {
	// TODO: implement
	// Outline:
	//   1. Find the token at/before cursorOffset.
	//   2. Switch on tokenType.name (or the character just before the cursor):
	//      - Tick → return modifier name suggestions
	//      - LBracket context → return generator/literal suggestions
	//      - after loop/line keyword → return synthdef name suggestions
	//   3. Return [] for unknown context.
	void tokens;
	void cursorOffset;
	return [];
}
