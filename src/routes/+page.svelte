<script lang="ts">
	import { boot, serverState, getServer, getInstance, defaultConfig } from 'svelte-supersonic';
	import { run, type SchedulerHandle } from '$lib/scheduler';
	import { sc as scProxy, clock } from '$lib/lab-context';
	import { evaluate } from '$lib/lang/evaluator';
	import FluxEditor from '$lib/FluxEditor.svelte';
	const sc = $derived(getServer());

	let metricsEl: HTMLElement | undefined = $state();
	let handle = $state<SchedulerHandle | null>(null);
	let feedback = $state<{ message: string; kind: 'error' | 'info' } | null>(null);

	// Outgoing handle: the previous loop, kept alive until the next cycle boundary.
	let outgoingHandle: SchedulerHandle | null = null;
	let outgoingTimer: ReturnType<typeof setTimeout> | null = null;

	function clearOutgoing() {
		if (outgoingTimer !== null) clearTimeout(outgoingTimer);
		outgoingHandle?.stop();
		outgoingHandle = null;
		outgoingTimer = null;
	}

	async function handleBoot() {
		// Must be called from a user interaction — satisfies browser autoplay policy
		await boot({ debug: true });
		if (sc) await sc.loadSynthDef('sonic-pi-prophet');

		// Load and connect the metrics web component after boot
		if (metricsEl) {
			await import(/* @vite-ignore */ `${defaultConfig.baseURL}metrics_component.js`);
			(
				metricsEl as HTMLElement & {
					connect(instance: unknown, opts?: { refreshRate?: number }): void;
				}
			).connect(getInstance(), { refreshRate: 25 });
		}
	}

	function handlePlay() {
		sc?.synth('sonic-pi-prophet', 'source', { note: 52, release: 4, cutoff: 90 });
	}

	function* cyclePitches() {
		const pitches = [52, 55, 59, 62];
		let i = 0;
		while (true) {
			yield { note: pitches[i % pitches.length], release: 0.8, cutoff: 85 };
			i++;
		}
	}

	function startLoop() {
		handle = run(cyclePitches(), (value) => sc?.synth('sonic-pi-prophet', 'source', value), 0.5);
	}

	function stopLoop() {
		clearOutgoing();
		handle?.stop();
		handle = null;
	}

	function handleKeyDown(e: KeyboardEvent) {
		if (e.ctrlKey && e.key === '.') {
			e.preventDefault();
			stopLoop();
		}
	}

	function handleEvaluate(content: string) {
		feedback = null;

		if (!serverState.booted) {
			feedback = { message: 'Engine not booted — click "boot engine" first', kind: 'error' };
			return;
		}

		const result = evaluate(content);
		if (!result.ok) {
			feedback = { message: result.error, kind: 'error' };
			return;
		}

		if (clock.startTime === null) clock.start();

		const CYCLE_BEATS = 4;
		const nextCycleBeat = Math.ceil(clock.currentBeat / CYCLE_BEATS) * CYCLE_BEATS;

		// Let the current loop finish its cycle, then stop it.
		clearOutgoing();
		if (handle) {
			const dying = handle;
			const msUntilSwitch =
				(clock.beatToAudioTime(nextCycleBeat) - clock.audioContext!.currentTime) * 1000;
			outgoingHandle = dying;
			outgoingTimer = setTimeout(
				() => {
					dying.stop();
					outgoingHandle = null;
					outgoingTimer = null;
				},
				Math.max(0, msUntilSwitch)
			);
		}

		handle = run(
			result.generator,
			(event, ntpTime) =>
				scProxy.synthAt(ntpTime, 'sonic-pi-prophet', 'source', {
					note: event.note,
					release: 0.8,
					cutoff: 90
				}),
			4 / 3,
			nextCycleBeat
		);

		feedback = { message: 'playing loop', kind: 'info' };
	}
</script>

<svelte:window onkeydown={handleKeyDown} />

<svelte:head>
	<link rel="stylesheet" href="{defaultConfig.baseURL}metrics-dark.css" />
</svelte:head>

<h1>flux</h1>
<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
<p>Open DevTools console to see debug output. <a href="/lab">lab →</a></p>

<div class="buttons">
	<button onclick={handleBoot} disabled={serverState.booting || serverState.booted}>
		boot engine
	</button>
	<button onclick={handlePlay} disabled={!serverState.booted}>play sound</button>
	{#if handle}
		<button onclick={stopLoop}>stop loop</button>
	{:else}
		<button onclick={startLoop} disabled={!serverState.booted}>start loop</button>
	{/if}
</div>

<div
	class="status"
	class:ok={serverState.statusKind === 'ok'}
	class:error={serverState.statusKind === 'error'}
>
	{serverState.status}
</div>

<div class="editor-section">
	<FluxEditor onEvaluate={handleEvaluate} />
	<p class="hint">Ctrl+Enter to evaluate &nbsp;·&nbsp; Ctrl+. to stop</p>
</div>

{#if feedback}
	<div class="feedback" class:error={feedback.kind === 'error'}>{feedback.message}</div>
{/if}

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

	.editor-section {
		margin-top: 32px;
	}

	.editor-section .hint {
		margin-top: 6px;
		font-size: 0.75rem;
		color: #555;
	}

	.feedback {
		margin-top: 12px;
		padding: 8px 12px;
		font-family: monospace;
		font-size: 0.85rem;
		color: #aaa;
		background: #111;
		border-left: 3px solid #444;
		white-space: pre-wrap;
	}

	.feedback.error {
		color: #f66;
		border-left-color: #f66;
	}
</style>
