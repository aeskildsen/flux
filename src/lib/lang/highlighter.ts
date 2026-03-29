/**
 * Flux DSL — syntax highlighter for static HTML output.
 *
 * Runs FluxLexer over a code snippet and wraps each token in a <span>
 * with a CSS class corresponding to its semantic type. Used as the mdsvex
 * custom highlighter so docs pages get the same colouring as the editor.
 *
 * Token → class mapping mirrors the Monaco scope comments in lexer.ts.
 */

import { FluxLexer } from './lexer.js';
import type { IToken } from 'chevrotain';

// ---------------------------------------------------------------------------
// Token name → CSS class
// ---------------------------------------------------------------------------

const TOKEN_CLASS: Record<string, string> = {
	// Keywords
	Loop: 'tok-keyword',
	Line: 'tok-keyword',
	Fx: 'tok-keyword',
	SendFx: 'tok-keyword',
	MasterFx: 'tok-keyword',
	Set: 'tok-keyword',
	Rand: 'tok-keyword',
	Gau: 'tok-keyword',
	Exp: 'tok-keyword',
	Bro: 'tok-keyword',
	BroStep: 'tok-keyword',
	Step: 'tok-keyword',
	Mul: 'tok-keyword',
	Lin: 'tok-keyword',
	Geo: 'tok-keyword',
	LenSep: 'tok-keyword',
	Rest: 'tok-keyword',
	// Literals
	Integer: 'tok-number',
	Float: 'tok-number',
	Symbol: 'tok-string',
	// Comments
	LineComment: 'tok-comment',
	BlockComment: 'tok-comment',
	// Identifiers
	Identifier: 'tok-variable',
	// Operators & punctuation
	Tick: 'tok-operator',
	Flat: 'tok-operator',
	Sharp: 'tok-operator',
	Pipe: 'tok-operator',
	At: 'tok-operator',
	Tilde: 'tok-operator',
	Question: 'tok-operator',
	Equals: 'tok-operator',
	Plus: 'tok-operator',
	Minus: 'tok-operator',
	Slash: 'tok-operator',
	Bang: 'tok-operator',
	Colon: 'tok-operator',
	// Delimiters
	LBracket: 'tok-delimiter',
	RBracket: 'tok-delimiter',
	LParen: 'tok-delimiter',
	RParen: 'tok-delimiter'
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

// ---------------------------------------------------------------------------
// Highlighter
// ---------------------------------------------------------------------------

/**
 * Tokenise `code` with the Flux lexer and return an HTML string with each
 * token wrapped in a <span class="tok-*">. Unrecognised characters (lexer
 * errors) are emitted as plain escaped text.
 *
 * BlockComment is in SKIPPED group so it won't appear in the token array —
 * we recover it from lexer.errors / the raw text gaps instead (see below).
 */
export function highlightFlux(code: string): string {
	const result = FluxLexer.tokenize(code);
	const tokens: IToken[] = result.tokens;

	let out = '';
	let pos = 0; // current char offset in `code`

	for (const tok of tokens) {
		const start = tok.startOffset;
		const end = tok.endOffset! + 1;

		// Emit any gap before this token verbatim (whitespace, or block comments
		// which are in SKIPPED group and absent from the token array).
		if (start > pos) {
			const gap = code.slice(pos, start);
			// Check if the gap contains a block comment and highlight it.
			out += highlightGap(gap);
		}

		const cls = TOKEN_CLASS[tok.tokenType.name];
		const image = escapeHtml(tok.image);
		if (cls) {
			out += `<span class="${cls}">${image}</span>`;
		} else {
			out += image;
		}

		pos = end;
	}

	// Emit any trailing content (e.g. trailing newline or block comment).
	if (pos < code.length) {
		out += highlightGap(code.slice(pos));
	}

	return `<pre class="flux-code"><code>${out}</code></pre>`;
}

/**
 * Handle gaps between tokens — these are whitespace and SKIPPED tokens
 * (block comments). We do a simple regex scan rather than re-lexing.
 */
function highlightGap(gap: string): string {
	const blockComment = /\/\*[\s\S]*?\*\//g;
	let out = '';
	let last = 0;
	let m: RegExpExecArray | null;
	while ((m = blockComment.exec(gap)) !== null) {
		if (m.index > last) out += escapeHtml(gap.slice(last, m.index));
		out += `<span class="tok-comment">${escapeHtml(m[0])}</span>`;
		last = m.index + m[0].length;
	}
	if (last < gap.length) out += escapeHtml(gap.slice(last));
	return out;
}
