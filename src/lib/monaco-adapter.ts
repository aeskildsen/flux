/**
 * Flux DSL — Monaco Editor adapter.
 *
 * Connects the framework-agnostic language core (src/lib/lang/) to Monaco's
 * APIs. One source of truth: the Chevrotain lexer drives both syntax
 * highlighting and language features — no separate Monarch grammar.
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
import { getCompletions, type CompletionItemKind } from '$lib/lang/completions.js';
import { getHover } from '$lib/lang/hover.js';

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
	// Accidentals
	Flat: 'operator',
	Sharp: 'operator',
	// Repetition
	Bang: 'operator',
	// Identifiers
	Identifier: 'variable',
	// Operators
	Tick: 'operator',
	LBracket: 'delimiter.bracket',
	RBracket: 'delimiter.bracket',
	LParen: 'delimiter.parenthesis',
	RParen: 'delimiter.parenthesis',
	Pipe: 'operator',
	At: 'operator',
	Tilde: 'operator',
	Question: 'operator',
	Equals: 'operator',
	Plus: 'operator',
	Minus: 'operator',
	Slash: 'operator',
	// Literals
	Float: 'number',
	Integer: 'number',
	StringLiteral: 'string'
};

function tokenTypeToScope(name: string): string {
	return SCOPE_MAP[name] ?? '';
}

// ---------------------------------------------------------------------------
// ITokensProvider state
//
// Most lines have no special state, but block comments can span multiple lines.
// `inBlockComment` tracks whether we're currently inside a `/* ... */`.
// ---------------------------------------------------------------------------

interface FluxTokenizerState extends Monaco.languages.IState {
	readonly inBlockComment: boolean;
}

function makeFluxState(inBlockComment: boolean): FluxTokenizerState {
	const s: FluxTokenizerState = {
		inBlockComment,
		clone() {
			return makeFluxState(this.inBlockComment);
		},
		equals(other: Monaco.languages.IState) {
			return (other as FluxTokenizerState).inBlockComment === this.inBlockComment;
		}
	};
	return s;
}

const INITIAL_FLUX_STATE = makeFluxState(false);

// ---------------------------------------------------------------------------
// Semantic token legend
//
// Token types used by the document semantic tokens provider.
// Indices in this array correspond to the tokenType integer in the encoded
// data array (groups of 5: deltaLine, deltaChar, length, type, modifiers).
// ---------------------------------------------------------------------------

const SEMANTIC_TOKEN_TYPES = ['function', 'property'] as const;

// Indices into SEMANTIC_TOKEN_TYPES:
const SEM_FUNCTION = 0; // modifier names (after ')
const SEM_PROPERTY = 1; // decorator / set parameter names (after @ or set)

// ---------------------------------------------------------------------------
// Completion kind mapping
// ---------------------------------------------------------------------------

const KIND_MAP: Record<CompletionItemKind, number> = {
	// Monaco CompletionItemKind numeric values (from monaco-editor types)
	function: 1,
	keyword: 12,
	snippet: 13,
	value: 10,
	property: 8
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

	// ------------------------------------------------------------------
	// 1. Syntax highlighting — lexer-driven ITokensProvider
	//
	// The state carries `inBlockComment` so multi-line `/* ... */` blocks
	// are highlighted correctly across line boundaries.
	// ------------------------------------------------------------------

	/** Lex `text` with the Chevrotain lexer and append Monaco token objects
	 *  to `out`, offsetting each startIndex by `offset`. */
	function addLexedTokens(out: Monaco.languages.IToken[], text: string, offset: number): void {
		const { tokens } = FluxLexer.tokenize(text);
		for (const t of tokens) {
			out.push({ startIndex: t.startOffset + offset, scopes: tokenTypeToScope(t.tokenType.name) });
		}
	}

	monaco.languages.setTokensProvider('flux', {
		getInitialState: () => INITIAL_FLUX_STATE,

		tokenize(line, state) {
			const fluxState = state as FluxTokenizerState;
			const out: Monaco.languages.IToken[] = [];

			if (fluxState.inBlockComment) {
				const endIdx = line.indexOf('*/');
				if (endIdx >= 0) {
					// Comment ends on this line; lex what follows
					out.push({ startIndex: 0, scopes: 'comment' });
					addLexedTokens(out, line.slice(endIdx + 2), endIdx + 2);
					return { tokens: out, endState: makeFluxState(false) };
				}
				// Still inside the block comment
				out.push({ startIndex: 0, scopes: 'comment' });
				return { tokens: out, endState: makeFluxState(true) };
			}

			// Not in a block comment — find the first `/*` on this line,
			// but only if it precedes any `//` line comment.
			const lineCommentIdx = line.indexOf('//');
			const blockStartIdx = line.indexOf('/*');

			if (blockStartIdx >= 0 && (lineCommentIdx < 0 || blockStartIdx < lineCommentIdx)) {
				// Lex tokens before the block comment start
				addLexedTokens(out, line.slice(0, blockStartIdx), 0);

				const blockEndIdx = line.indexOf('*/', blockStartIdx + 2);
				if (blockEndIdx >= 0) {
					// Block comment opens and closes on the same line
					out.push({ startIndex: blockStartIdx, scopes: 'comment' });
					addLexedTokens(out, line.slice(blockEndIdx + 2), blockEndIdx + 2);
					return { tokens: out, endState: makeFluxState(false) };
				}

				// Block comment extends to subsequent lines
				out.push({ startIndex: blockStartIdx, scopes: 'comment' });
				return { tokens: out, endState: makeFluxState(true) };
			}

			// Normal line — lex entirely with Chevrotain
			addLexedTokens(out, line, 0);
			return { tokens: out, endState: makeFluxState(false) };
		}
	});

	// ------------------------------------------------------------------
	// 2. Hover tooltips — static lookup keyed on token type / image
	// ------------------------------------------------------------------

	monaco.languages.registerHoverProvider('flux', {
		provideHover(model, position) {
			const line = model.getLineContent(position.lineNumber);
			const { tokens } = FluxLexer.tokenize(line);
			const col = position.column - 1; // Monaco is 1-based, offsets are 0-based

			// Find the token that spans the cursor column
			const idx = tokens.findIndex((t) => {
				const end = t.endOffset !== undefined ? t.endOffset : t.startOffset + t.image.length - 1;
				return t.startOffset <= col && col <= end;
			});

			if (idx < 0) return null;

			const token = tokens[idx];
			const prevTokenName = idx > 0 ? tokens[idx - 1].tokenType.name : undefined;
			const result = getHover(token, prevTokenName);
			if (!result) return null;

			return {
				contents: [{ value: result.contents }],
				range: {
					startLineNumber: position.lineNumber,
					startColumn: token.startOffset + 1,
					endLineNumber: position.lineNumber,
					endColumn:
						(token.endOffset !== undefined
							? token.endOffset
							: token.startOffset + token.image.length - 1) + 2
				}
			};
		}
	});

	// ------------------------------------------------------------------
	// 3. Autocomplete — trigger chars: ' [ ( |
	// ------------------------------------------------------------------

	monaco.languages.registerCompletionItemProvider('flux', {
		triggerCharacters: ["'", '[', '(', '|'],

		provideCompletionItems(model, position, context) {
			const lineContent = model.getLineContent(position.lineNumber);
			const col = position.column - 1; // 0-based

			// Compute word range at cursor for accurate replacement
			const wordMatch = lineContent.slice(0, col).match(/([a-zA-Z_][a-zA-Z0-9_]*)$/);
			const wordStartCol = wordMatch ? col - wordMatch[1].length + 1 : position.column;
			const range = {
				startLineNumber: position.lineNumber,
				endLineNumber: position.lineNumber,
				startColumn: wordStartCol,
				endColumn: position.column
			};

			const { tokens } = FluxLexer.tokenize(lineContent);
			const items = getCompletions(tokens, col, context.triggerCharacter);

			return {
				suggestions: items.map((item) => ({
					label: item.label,
					kind: KIND_MAP[item.kind ?? 'keyword'],
					insertText: item.insertText,
					insertTextRules: item.isSnippet
						? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
						: undefined,
					detail: item.detail,
					documentation: item.documentation,
					range
				}))
			};
		}
	});

	// ------------------------------------------------------------------
	// 4. Semantic highlighting — token-sequence scanner
	//
	// Walks the flat token stream looking for contextual patterns and
	// reclassifies generic Identifiers by their role:
	//   - After Tick  → modifier name  → 'function'
	//   - After At    → decorator key  → 'property'
	//   - After Set   → param name     → 'property'
	// ------------------------------------------------------------------

	monaco.languages.registerDocumentSemanticTokensProvider('flux', {
		getLegend() {
			return {
				tokenTypes: [...SEMANTIC_TOKEN_TYPES],
				tokenModifiers: []
			};
		},

		provideDocumentSemanticTokens(model) {
			const { tokens } = FluxLexer.tokenize(model.getValue());
			const data: number[] = [];
			let prevLine = 0;
			let prevChar = 0;

			for (let i = 0; i < tokens.length; i++) {
				const t = tokens[i];
				if (t.tokenType.name !== 'Identifier') continue;

				const prevTypeName = i > 0 ? tokens[i - 1].tokenType.name : undefined;

				let semType: number;
				if (prevTypeName === 'Tick') {
					semType = SEM_FUNCTION;
				} else if (prevTypeName === 'At' || prevTypeName === 'Set') {
					semType = SEM_PROPERTY;
				} else {
					continue;
				}

				// Chevrotain line/column are 1-based; Monaco semantic tokens are 0-based
				const line = (t.startLine ?? 1) - 1;
				const char = (t.startColumn ?? 1) - 1;
				const len = t.image.length;

				const deltaLine = line - prevLine;
				const deltaChar = deltaLine === 0 ? char - prevChar : char;

				data.push(deltaLine, deltaChar, len, semType, 0);

				prevLine = line;
				prevChar = char;
			}

			return { data: new Uint32Array(data), resultId: undefined };
		},

		releaseDocumentSemanticTokens() {
			// Nothing to release
		}
	});
}
