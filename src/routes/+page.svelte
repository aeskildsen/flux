<script lang="ts">
	import { boot, serverState, getInstance, spawnSynth, loadSynthDef } from '$lib/shared';

	async function handleBoot() {
		// Must be called from a user interaction — satisfies browser autoplay policy
		await boot({ debug: true });
		const instance = getInstance();
		if (instance) {
			serverState.status = "loading synthdef 'sonic-pi-prophet'…";
			await loadSynthDef(instance, 'sonic-pi-prophet');
			serverState.status = "engine ready – click 'play sound'";
		}
	}

	function handlePlay() {
		const instance = getInstance();
		if (!instance) return;
		spawnSynth(instance, 'sonic-pi-prophet', 'source', { note: 52, release: 4, cutoff: 90 });
		serverState.status = '♪ playing…';
		serverState.statusKind = 'ok';
		setTimeout(() => {
			serverState.status = "engine ready – click 'play sound'";
			serverState.statusKind = 'ok';
		}, 1200);
	}
</script>

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
