<script lang="ts">
	import { onMount } from 'svelte';
	import type * as Monaco from 'monaco-editor';
	import { registerFluxLanguage } from '$lib/monaco-adapter.js';

	interface Props {
		value?: string;
		onEvaluate?: (content: string) => void;
	}

	let { value = $bindable(''), onEvaluate }: Props = $props();

	let container: HTMLDivElement;
	let editor: Monaco.editor.IStandaloneCodeEditor | undefined;

	onMount(() => {
		import('monaco-editor').then((monaco) => {
			registerFluxLanguage(monaco);

			editor = monaco.editor.create(container, {
				value,
				language: 'flux',
				theme: 'vs-dark',
				minimap: { enabled: false },
				fontSize: 14,
				fontFamily: "'Source Code Pro', monospace",
				lineNumbers: 'on',
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
		});

		return () => {
			editor?.dispose();
		};
	});
</script>

<div bind:this={container} class="editor"></div>

<style>
	.editor {
		width: 100%;
		height: 100%;
		border: 1px solid #222;
	}
</style>
