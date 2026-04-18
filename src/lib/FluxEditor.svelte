<script lang="ts">
	import { onMount } from 'svelte';
	import type * as Monaco from 'monaco-editor';
	import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
	import { registerFluxLanguage, chooseCommentAction } from '$lib/monaco-adapter.js';

	interface Props {
		value?: string;
		onEvaluate?: (content: string) => void;
	}

	let { value = $bindable(''), onEvaluate }: Props = $props();

	let container: HTMLDivElement;
	let editor = $state<Monaco.editor.IStandaloneCodeEditor | undefined>(undefined);

	// Sync external value changes into the Monaco model (e.g. loading an example).
	// The model content change listener below updates `value` when the user types,
	// so we guard against infinite loops by comparing first.
	$effect(() => {
		if (editor && editor.getValue() !== value) {
			editor.setValue(value);
		}
	});

	onMount(() => {
		let mounted = true;

		import('monaco-editor').then((monaco) => {
			if (!mounted) return;
			registerFluxLanguage(monaco);

			// Flux only registers a custom language, so Monaco never asks for
			// json/ts/css/html workers — the core editor worker is all we need.
			self.MonacoEnvironment = {
				getWorker() {
					return new EditorWorker();
				}
			};

			editor = monaco.editor.create(container, {
				value,
				language: 'flux',
				theme: 'flux-dark',
				// Typography
				fontFamily: '"JetBrains Mono", "Fira Code", monospace',
				fontSize: 16,
				fontLigatures: true,
				lineHeight: 24,
				letterSpacing: 0.3,
				// Canvas padding
				padding: { top: 12, bottom: 32 },
				// Line numbers
				lineNumbers: 'on',
				lineNumbersMinChars: 3,
				lineDecorationsWidth: 8,
				// Scrollbar
				scrollbar: {
					vertical: 'auto',
					horizontal: 'auto',
					verticalScrollbarSize: 6,
					horizontalScrollbarSize: 6,
					useShadows: false
				},
				// Suggest widget
				suggestFontSize: 12,
				suggestLineHeight: 20,
				// Minimap
				minimap: { enabled: false },
				// Misc
				renderLineHighlight: 'line',
				cursorBlinking: 'smooth',
				cursorSmoothCaretAnimation: 'on',
				smoothScrolling: true,
				fixedOverflowWidgets: true,
				overviewRulerLanes: 0,
				scrollBeyondLastLine: false,
				automaticLayout: true,
				// Flux completions are trigger-character-driven (' [ ( |); suppress
				// automatic and word-based suggestions which would produce noise.
				quickSuggestions: false,
				wordBasedSuggestions: 'off'
			});

			// Keep value in sync on every edit
			editor.onDidChangeModelContent(() => {
				value = editor!.getValue();
			});

			// Workaround for a Monaco bug: when the selection is reversed (cursor at
			// the left/start end, anchor at the right) and a printable character key is
			// pressed, Monaco's hidden-textarea deduceInput logic computes
			// replacePrevCharCnt=0 and replaceNextCharCnt=0 — so it inserts the
			// character without deleting the selected text.  Normalising the selection
			// (flip cursor to the end) before the key reaches the textarea fixes it.
			editor.onKeyDown((e) => {
				const sel = editor!.getSelection();
				if (!sel || sel.isEmpty()) return;
				// Only act on reversed selections (cursor at the left/start end)
				if (sel.getDirection() !== monaco.SelectionDirection.RTL) return;
				// `key` is a single character for printable keys, a word otherwise
				// ("ArrowLeft", "Shift", "Enter", …) — no modifier check needed.
				if (e.browserEvent.key.length !== 1) return;
				// Flip to LTR: anchor at range start, cursor at range end.
				// Monaco.Selection(anchorLine, anchorCol, cursorLine, cursorCol)
				editor!.setSelection(
					new monaco.Selection(
						sel.startLineNumber,
						sel.startColumn,
						sel.endLineNumber,
						sel.endColumn
					)
				);
			});

			// Ctrl+Enter / Cmd+Enter — evaluate
			editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
				onEvaluate?.(editor!.getValue());
			});

			// Swallow Ctrl+R, Cmd+R, F5 — prevent page reload mid-performance
			editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyR, () => {});
			editor.addCommand(monaco.KeyCode.F5, () => {});

			// Ctrl+K / Cmd+K — toggle comment. Up to 3 lines toggles `//`,
			// more uses the built-in block-comment action (`/* */`).
			editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK, () => {
				const sel = editor!.getSelection();
				const action =
					sel === null ? 'line' : chooseCommentAction(sel.startLineNumber, sel.endLineNumber);
				const actionId =
					action === 'line' ? 'editor.action.commentLine' : 'editor.action.blockComment';
				editor!.getAction(actionId)?.run();
			});
		});

		return () => {
			mounted = false;
			editor?.dispose();
		};
	});
</script>

<div bind:this={container} class="editor flux-editor"></div>

<style>
	.editor {
		width: 100%;
		height: 100%;
	}
</style>
