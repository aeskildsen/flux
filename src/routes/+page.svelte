<script lang="ts">
	import { boot, serverState, getServer } from 'svelte-supersonic';
	import { run, sc as scProxy, clock, type SchedulerHandle } from '$lib/scheduler';
	import { createInstance } from '$lib/lang/evaluator';
	import FluxEditor from '$lib/FluxEditor.svelte';
	import SiteHeader from '$lib/SiteHeader.svelte';
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

	function clearOutgoing() {
		outgoingHandle?.stop();
		outgoingHandle = null;
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
		if (e.ctrlKey && e.key === 'b') {
			e.preventDefault();
			if (!serverState.booting && !serverState.booted) handleBoot();
		}
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

		const instResult = createInstance(content);
		if (!instResult.ok) {
			appendLog(instResult.error, 'error');
			return;
		}
		const inst = instResult;

		if (clock.startTime === null) clock.start();

		const CYCLE_BEATS = 4; // 1 DSL cycle = 4 real beats
		const nextCycleBeat = Math.ceil(clock.currentBeat / CYCLE_BEATS) * CYCLE_BEATS;

		// Let the current loop finish its cycle, then stop it.
		// setStopBeat prevents the old loop from scheduling the event at
		// nextCycleBeat, eliminating the double-trigger overlap.
		clearOutgoing();
		if (handle) {
			handle.setStopBeat(nextCycleBeat);
			outgoingHandle = handle;
		}

		// Yield one entry per scheduled event; `duration` is the gap to the next
		// event (drives scheduler advancement) and `release` is the synth gate time.
		function* gen() {
			let cycleNumber = 0;
			while (true) {
				const result = inst.evaluate({ cycleNumber: cycleNumber++ });
				if (!result.ok) return;
				if (result.done) return;
				const events = result.events;
				for (let i = 0; i < events.length; i++) {
					const ev = events[i];
					const nextBeatOffset = i + 1 < events.length ? events[i + 1].beatOffset : 1; // 1 = end of cycle
					const gap = (nextBeatOffset - ev.beatOffset) * CYCLE_BEATS;
					const release = clock.beatsToSeconds(ev.duration * CYCLE_BEATS) * 0.9;
					yield { note: ev.note, duration: gap, release };
				}
			}
		}

		handle = run(
			gen(),
			(event, ntpTime) =>
				scProxy.synthAt(ntpTime, 'sonic-pi-prophet', 'source', {
					note: event.note,
					release: event.release,
					cutoff: 90
				}),
			CYCLE_BEATS,
			nextCycleBeat
		);

		appendLog('playing loop', 'info');
	}
</script>

<svelte:window onkeydown={handleKeyDown} />

<div class="page">
	<SiteHeader />

	<div class="editor-area">
		<FluxEditor onEvaluate={handleEvaluate} />
		<p class="hint">
			Ctrl+B to boot &nbsp;&middot;&nbsp; Ctrl+Enter to evaluate &nbsp;&middot;&nbsp; Ctrl+. to stop
		</p>
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
