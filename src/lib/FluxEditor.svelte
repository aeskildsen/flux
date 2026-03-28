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
				automaticLayout: true
			});

			// Keep value in sync on every edit
			editor.onDidChangeModelContent(() => {
				value = editor!.getValue();
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
