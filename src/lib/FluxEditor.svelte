<script lang="ts">
	import { onMount } from 'svelte';
	import type * as Monaco from 'monaco-editor';
	import { registerFluxLanguage } from '$lib/monaco-adapter.js';
	import { FluxLexer } from '$lib/lang/lexer.js';
	import { parser } from '$lib/lang/parser.js';
	import type { CstNode, IRecognitionException } from 'chevrotain';

	interface Props {
		value?: string;
		onEvaluate?: (content: string) => void;
	}

	let { value = $bindable(''), onEvaluate }: Props = $props();

	let container: HTMLDivElement;
	let editor: Monaco.editor.IStandaloneCodeEditor | undefined;

	let cst = $state<CstNode | null>(null);
	let parseErrors = $state<IRecognitionException[]>([]);

	function reparse(source: string) {
		const { tokens } = FluxLexer.tokenize(source);
		parser.input = tokens;
		cst = parser.program() ?? null;
		parseErrors = [...parser.errors];
	}

	onMount(() => {
		import('monaco-editor').then((monaco) => {
			registerFluxLanguage(monaco);

			editor = monaco.editor.create(container, {
				value,
				language: 'flux',
				theme: 'vs-dark',
				minimap: { enabled: false },
				fontSize: 14,
				fontFamily: 'monospace',
				lineNumbers: 'on',
				scrollBeyondLastLine: false,
				automaticLayout: true
			});

			// Initial parse
			reparse(value);

			// Keep value in sync and re-parse on every edit
			editor.onDidChangeModelContent(() => {
				value = editor!.getValue();
				reparse(value);
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

<div class="cst-panel">
	{#if parseErrors.length > 0}
		<div class="errors">
			{#each parseErrors as err}
				<div class="error-line">⚠ {err.message}</div>
			{/each}
		</div>
	{/if}

	<pre class="cst-tree">{JSON.stringify(cst, null, 2)}</pre>
</div>

<style>
	.editor {
		width: 100%;
		height: 200px;
		border: 1px solid #333;
	}

	.cst-panel {
		margin-top: 8px;
		background: #0d0d0d;
		border: 1px solid #2a2a2a;
		border-radius: 4px;
		font-family: monospace;
		font-size: 0.78rem;
		max-height: 300px;
		overflow-y: auto;
	}

	.errors {
		padding: 6px 10px;
		border-bottom: 1px solid #2a2a2a;
	}

	.error-line {
		color: #f66;
		line-height: 1.5;
	}

	.cst-tree {
		margin: 0;
		padding: 10px;
		color: #7a9;
		white-space: pre;
		overflow-x: auto;
	}
</style>
