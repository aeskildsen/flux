<script lang="ts">
	import { boot, serverState, getServer, getInstance, defaultConfig } from 'svelte-supersonic';
	import { run, type SchedulerHandle } from '$lib/scheduler';
	import { sc as scProxy, clock } from '$lib/lab-context';
	import { evaluate } from '$lib/lang/evaluator';
	import FluxEditor from '$lib/FluxEditor.svelte';
	const sc = $derived(getServer());

	let handle = $state<SchedulerHandle | null>(null);

	interface LogEntry {
		message: string;
		kind: 'error' | 'info';
	}
	let log = $state<LogEntry[]>([]);
	let logEl: HTMLDivElement | undefined = $state();

	// Outgoing handle: the previous loop, kept alive until the next cycle boundary.
	let outgoingHandle: SchedulerHandle | null = null;
	let outgoingTimer: ReturnType<typeof setTimeout> | null = null;

	function clearOutgoing() {
		if (outgoingTimer !== null) clearTimeout(outgoingTimer);
		outgoingHandle?.stop();
		outgoingHandle = null;
		outgoingTimer = null;
	}

	function appendLog(message: string, kind: 'error' | 'info') {
		log.push({ message, kind });
		// Scroll to bottom after DOM updates
		setTimeout(() => {
			if (logEl) logEl.scrollTop = logEl.scrollHeight;
		}, 0);
	}

	async function handleBoot() {
		// Must be called from a user interaction — satisfies browser autoplay policy
		await boot({ debug: true });
		if (sc) await sc.loadSynthDef('sonic-pi-prophet');
	}

	function handleStop() {
		clearOutgoing();
		handle?.stop();
		handle = null;
	}

	function handleKeyDown(e: KeyboardEvent) {
		if (e.ctrlKey && e.key === '.') {
			e.preventDefault();
			handleStop();
		}
	}

	function handleEvaluate(content: string) {
		if (!serverState.booted) {
			appendLog('Engine not booted — click "boot engine" first', 'error');
			return;
		}

		const result = evaluate(content);
		if (!result.ok) {
			appendLog(result.error, 'error');
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

		appendLog('playing loop', 'info');
	}
</script>

<svelte:window onkeydown={handleKeyDown} />

<div class="page">
	<header class="page-header">
		<h1>flux</h1>
		<p>browser audio live coding &mdash; alpha</p>
	</header>

	<div class="editor-area">
		<FluxEditor onEvaluate={handleEvaluate} />
		<p class="hint">Ctrl+Enter to evaluate &nbsp;&middot;&nbsp; Ctrl+. to stop</p>
	</div>

	<aside class="sidebar">
		<button onclick={handleBoot} disabled={serverState.booting || serverState.booted}>
			boot engine
		</button>
		<button onclick={handleStop} disabled={!serverState.booted}>stop</button>

		<div
			class="status"
			class:ok={serverState.statusKind === 'ok'}
			class:error={serverState.statusKind === 'error'}
		>
			{serverState.status}
		</div>

		<div class="feedback-log" bind:this={logEl}>
			{#each log as entry, i (i)}
				<div class="log-entry {entry.kind}">{entry.message}</div>
			{/each}
		</div>
	</aside>
</div>
