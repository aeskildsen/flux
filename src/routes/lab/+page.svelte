<script lang="ts">
	import { boot, serverState } from 'svelte-supersonic';
	import { page } from '$app/stores';
	import type { SchedulerHandle } from '$lib/scheduler';

	// Enumerate all sketches at build time
	const allSketches = import.meta.glob('../../sketches/*.js', { query: '?raw', eager: true });
	const allModules = import.meta.glob('../../sketches/*.js');

	// Derive sorted sketch names from file paths
	const sketchNames = Object.keys(allSketches)
		.map((p) => p.replace('../../sketches/', '').replace('.js', ''))
		.sort((a, b) => {
			// current always last
			if (a === 'current') return 1;
			if (b === 'current') return -1;
			return a.localeCompare(b);
		});

	// Active sketch from query param, defaulting to 'current'
	let activeSketch = $derived($page.url.searchParams.get('sketch') ?? 'current');
	let sketchSource = $derived(
		(allSketches[`../../sketches/${activeSketch}.js`] as { default: string })?.default ?? ''
	);

	let handle = $state<SchedulerHandle | null>(null);

	async function handleBoot() {
		await boot({ debug: true });
	}

	async function handleRun() {
		const mod = await allModules[`../../sketches/${activeSketch}.js`]?.();
		handle = await (mod as { default: () => Promise<SchedulerHandle> }).default();
	}

	function handleStop() {
		handle?.stop();
		handle = null;
	}
</script>

<!-- eslint-disable svelte/no-navigation-without-resolve -->
<nav>
	{#each sketchNames as name (name)}
		<a href="/lab?sketch={name}" class:active={name === activeSketch}>{name}</a>
	{/each}
</nav>

<div class="buttons">
	<button onclick={handleBoot} disabled={serverState.booting || serverState.booted}>boot</button>
	{#if handle}
		<button onclick={handleStop}>stop</button>
	{:else}
		<button onclick={handleRun} disabled={!serverState.booted}>run</button>
	{/if}
	<a href="/" class="home">← flux</a>
</div>
<!-- eslint-enable svelte/no-navigation-without-resolve -->

<pre class="source">{sketchSource}</pre>

<style>
	nav {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-bottom: 16px;
	}

	nav a {
		font-family: monospace;
		font-size: 0.75rem;
		color: #666;
		text-decoration: none;
		padding: 3px 8px;
		border: 1px solid #2a2a2a;
	}

	nav a:hover {
		color: #aaa;
		border-color: #444;
	}

	nav a.active {
		color: #ccc;
		border-color: #555;
	}

	.buttons {
		display: flex;
		gap: 8px;
		margin-bottom: 16px;
		align-items: center;
	}

	button {
		font-family: monospace;
		font-size: 0.9rem;
		padding: 6px 14px;
		background: #1a1a1a;
		color: #ccc;
		border: 1px solid #333;
		cursor: pointer;
	}

	button:disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}

	.home {
		font-family: monospace;
		font-size: 0.8rem;
		color: #555;
		text-decoration: none;
		margin-left: auto;
	}

	.home:hover {
		color: #888;
	}

	.source {
		font-family: monospace;
		font-size: 0.8rem;
		color: #888;
		white-space: pre-wrap;
		margin: 0;
	}
</style>
