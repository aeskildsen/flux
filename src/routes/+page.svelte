<script lang="ts">
	import { boot, serverState, getServer, getInstance, defaultConfig } from 'svelte-supersonic';

	const sc = $derived(getServer());

	let metricsEl: HTMLElement | undefined = $state();

	async function handleBoot() {
		// Must be called from a user interaction — satisfies browser autoplay policy
		await boot({ debug: true });
		if (sc) await sc.loadSynthDef('sonic-pi-prophet');

		// Load and connect the metrics web component after boot
		if (metricsEl) {
			await import(/* @vite-ignore */ `${defaultConfig.baseURL}metrics_component.js`);
			(metricsEl as HTMLElement & { connect(instance: unknown, opts?: { refreshRate?: number }): void }).connect(getInstance(), { refreshRate: 25 });
		}
	}

	function handlePlay() {
		sc?.synth('sonic-pi-prophet', 'source', { note: 52, release: 4, cutoff: 90 });
	}
</script>

<svelte:head>
	<link rel="stylesheet" href="{defaultConfig.baseURL}metrics-dark.css" />
</svelte:head>

<h1>flux</h1>
<p>Open DevTools console to see debug output.</p>

<div class="buttons">
	<button onclick={handleBoot} disabled={serverState.booting || serverState.booted}>
		boot engine
	</button>
	<button onclick={handlePlay} disabled={!serverState.booted}>play sound</button>
</div>

<div
	class="status"
	class:ok={serverState.statusKind === 'ok'}
	class:error={serverState.statusKind === 'error'}
>
	{serverState.status}
</div>

<supersonic-metrics bind:this={metricsEl}></supersonic-metrics>

<style>
	h1 {
		font-size: var(--flux-h1-size, 1.2rem);
		margin-bottom: 4px;
	}

	p {
		font-size: var(--flux-hint-size, 0.85rem);
		color: var(--flux-hint-color, #888);
		margin-top: 0;
	}

	.buttons {
		display: flex;
		gap: var(--flux-button-gap, 12px);
		margin-top: 32px;
	}

	button {
		padding: var(--flux-button-padding, 10px 22px);
		font-family: monospace;
		font-size: var(--flux-button-font-size, 1rem);
		background: var(--flux-button-bg, #222);
		color: var(--flux-button-color, #eee);
		border: 1px solid var(--flux-button-border, #444);
		border-radius: var(--flux-button-radius, 4px);
		cursor: pointer;
	}

	button:hover:not(:disabled) {
		background: var(--flux-button-bg-hover, #333);
	}

	button:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.status {
		margin-top: 24px;
		font-size: var(--flux-status-size, 0.85rem);
		font-family: monospace;
		color: var(--flux-status-color, #aaa);
		min-height: 1.4em;
	}

	.status.ok {
		color: var(--flux-status-ok-color, #6f6);
	}

	.status.error {
		color: var(--flux-status-error-color, #f66);
	}
</style>
