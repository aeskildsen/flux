<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import '@fontsource/inter/400.css';
	import '@fontsource/inter/500.css';
	import '@fontsource/inter/600.css';
	import '@fontsource/jetbrains-mono/400.css';
	import '@fontsource/jetbrains-mono/500.css';
	import '$lib/styles/tokens.css';
	import '$lib/styles/app.css';
	import '$lib/styles/monaco-style.css';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}
