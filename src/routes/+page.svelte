<script lang="ts">
	import { boot, serverState, getServer, getInstance } from 'svelte-supersonic';
	import { run, sc as scProxy, clock, type SchedulerHandle } from '$lib/scheduler';
	import { createInstance } from '$lib/lang/evaluator';
	import { buildOscParams, eventBeatPosition } from '$lib/dispatch';
	import FluxEditor from '$lib/FluxEditor.svelte';
	import SiteHeader from '$lib/SiteHeader.svelte';
	import SynthDefPanel from '$lib/SynthDefPanel.svelte';
	import FxPanel from '$lib/FxPanel.svelte';
	import type { PageData } from './$types';
	import type { ParamSpec } from './+page';

	const { data }: { data: PageData } = $props();

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

	// Master FX node IDs — keyed by synthdef name. Set after boot-time instantiation.
	let fxNodeIds = $state<Record<string, number>>({});

	// Master FX chain definition — driven by metadata loaded at page load.
	// Order defines the processing chain: EQ → Reverb → Dynamics.
	const MASTER_FX_CHAIN = [
		{ synthdef: 'master_eq', label: 'EQ' },
		{ synthdef: 'master_reverb', label: 'Reverb' },
		{ synthdef: 'master_dynamics', label: 'Dynamics' }
	] as const;

	const fxSlots = $derived(
		MASTER_FX_CHAIN.map((entry) => ({
			...entry,
			specs: (data.synthdefs[entry.synthdef]?.specs ?? {}) as Record<string, ParamSpec>
		}))
	);

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
		try {
			await boot({ debug: true });
			if (!sc) return;

			// Point the clock at SuperSonic's AudioContext so beatToAudioTime and
			// sonic.initTime are on the same timeline.
			const sonicCtx = getInstance()?.audioContext;
			if (sonicCtx) clock.setContext(sonicCtx);

			// Load compiled synthdefs — metadata already available via page load
			try {
				await Promise.all(
					Object.keys(data.synthdefs).map((name) =>
						sc!.loadSynthDef(`/compiled_synthdefs/${name}.scsyndef`)
					)
				);
			} catch (e) {
				console.warn('Could not load local compiled synthdefs:', e);
				appendLog('Some synths could not be loaded — see browser console for details', 'error');
			}

			// Load the CDN synthdef used for playback
			try {
				await sc.loadSynthDef('sonic-pi-prophet');
			} catch (e) {
				console.error('[handleBoot] sonic-pi-prophet load failed:', e);
				appendLog(
					'CDN synth "sonic-pi-prophet" failed to load — default synth unavailable. Check network.',
					'error'
				);
			}

			// Instantiate master bus FX in chain order on the master group.
			// ReplaceOut reads from + replaces the output bus, so order matters.
			// We read FxPanel's persisted state from localStorage to restore param values.
			let stored: Record<string, { enabled?: boolean; params?: Record<string, unknown> }> = {};
			try {
				const raw = localStorage.getItem('flux:master-fx');
				if (raw) {
					const parsed: unknown = JSON.parse(raw);
					if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
						stored = parsed as typeof stored;
					}
				}
			} catch (e) {
				if (e instanceof SyntaxError) {
					console.warn('[handleBoot] Corrupt master-fx state in localStorage — starting fresh');
				} else {
					throw e;
				}
			}

			for (const entry of MASTER_FX_CHAIN) {
				const slotState = stored[entry.synthdef];
				const enabled: boolean = slotState?.enabled ?? true;
				if (!enabled) continue;

				const specDefaults = Object.fromEntries(
					Object.entries(
						(data.synthdefs[entry.synthdef]?.specs ?? {}) as Record<string, ParamSpec>
					).map(([k, s]) => [k, s.default ?? 0])
				);
				// Only spread stored params that are numbers to avoid type mismatches in sc.synth
				const storedParams = Object.fromEntries(
					Object.entries(slotState?.params ?? {}).filter(([, v]) => typeof v === 'number')
				) as Record<string, number>;
				const params = { ...specDefaults, ...storedParams };
				try {
					const nodeId = sc.synth(entry.synthdef, 'master', params);
					fxNodeIds[entry.synthdef] = nodeId;
				} catch (e) {
					const msg = e instanceof Error ? e.message : String(e);
					appendLog(`Master FX "${entry.synthdef}" failed to load: ${msg}`, 'error');
					console.error(`[handleBoot] synth instantiation failed for ${entry.synthdef}:`, e);
				}
			}
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			appendLog(`Boot failed: ${msg}`, 'error');
			console.error('[handleBoot]', e);
		}
	}

	// Rebuild master FX chain in order, freeing any active nodes first.
	// Used on boot and when re-enabling a slot to preserve ReplaceOut chain order.
	function rebuildFxChain(
		enabledStates: Record<string, boolean>,
		paramSets: Record<string, Record<string, number>>
	) {
		if (!sc) return;
		// Free existing nodes
		for (const [synthdef, nodeId] of Object.entries(fxNodeIds)) {
			try {
				sc.free(nodeId);
			} catch (e) {
				console.error(`[rebuildFxChain] Failed to free node ${nodeId} for ${synthdef}:`, e);
			}
		}
		fxNodeIds = {};
		// Re-instantiate in chain order
		for (const entry of MASTER_FX_CHAIN) {
			if (!enabledStates[entry.synthdef]) continue;
			try {
				const nodeId = sc.synth(entry.synthdef, 'master', paramSets[entry.synthdef] ?? {});
				fxNodeIds[entry.synthdef] = nodeId;
			} catch (e) {
				const msg = e instanceof Error ? e.message : String(e);
				appendLog(`Master FX "${entry.synthdef}" failed to load: ${msg}`, 'error');
				console.error(`[rebuildFxChain] synth instantiation failed for ${entry.synthdef}:`, e);
			}
		}
	}

	// Called by FxPanel when a slot is enabled.
	// Receives the full chain snapshot so the rebuild preserves correct ReplaceOut order.
	// Returns true if the node was successfully created.
	function handleFxEnable(
		synthdef: string,
		allEnabledStates: Record<string, boolean>,
		allParams: Record<string, Record<string, number>>
	): boolean {
		if (!sc) {
			appendLog('Cannot enable FX — engine not booted yet', 'error');
			return false;
		}
		// Rebuild in full chain order so ReplaceOut stages stay correctly sequenced.
		rebuildFxChain(allEnabledStates, allParams);
		return synthdef in fxNodeIds;
	}

	// Called by FxPanel when a slot is disabled
	function handleFxDisable(synthdef: string) {
		const nodeId = fxNodeIds[synthdef];
		if (nodeId === undefined) return;
		if (!sc) {
			appendLog('Cannot disable FX — engine not booted', 'error');
			return;
		}
		try {
			sc.free(nodeId);
		} catch (e) {
			console.error(`[handleFxDisable] Failed to free node ${nodeId} for ${synthdef}:`, e);
		}
		const { [synthdef]: _, ...rest } = fxNodeIds;
		fxNodeIds = rest;
	}

	// Called by FxPanel when a param slider changes
	function handleFxParamChange(synthdef: string, param: string, value: number) {
		const nodeId = fxNodeIds[synthdef];
		if (nodeId === undefined) return;
		sc?.set(nodeId, { [param]: value });
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

		const firstPlay = clock.startTime === null;
		if (firstPlay) clock.start();

		const CYCLE_BEATS = 4; // 1 DSL cycle = 4 real beats
		// On first play currentBeat is 0, so ceil(0/4)*4 = 0 = "right now".
		// Add CYCLE_BEATS so the first event lands one cycle ahead, giving the
		// lookahead scheduler enough runway to deliver bundles before their NTP time.
		const nextCycleBeat =
			Math.ceil(clock.currentBeat / CYCLE_BEATS) * CYCLE_BEATS + (firstPlay ? CYCLE_BEATS : 0);

		// Let the current loop finish its cycle, then stop it.
		// setStopBeat prevents the old loop from scheduling the event at
		// nextCycleBeat, eliminating the double-trigger overlap.
		clearOutgoing();
		if (handle) {
			handle.setStopBeat(nextCycleBeat);
			outgoingHandle = handle;
		}

		// Per-loop mono node ID map: loopId → active SC node ID.
		// Scoped to a single run() invocation — a fresh map is created each time the
		// user triggers playback. Stale entries (from stopped patterns) are cleared
		// when the pattern stops producing events; full lifecycle cleanup deferred to #19.
		const monoNodes = new Map<string, number>();

		type GenEvent =
			| { skip: true; duration: number }
			| {
					skip: false;
					duration: number;
					ev: import('$lib/lang/evaluator').ScheduledEvent;
					gateDurationSeconds: number;
			  };

		// Yield one entry per scheduled event; `duration` is the gap to the next
		// event (drives scheduler advancement).
		//
		// Beat positions are computed as absolute offsets from nextCycleBeat using
		// eventBeatPosition(), which handles cycleOffset ('at / finite 'n repetitions).
		// schedulerBeat mirrors the scheduler's internal nextBeat cursor so we can
		// compute gaps correctly when cycleOffset anchors events away from the cursor.
		function* gen(): Generator<GenEvent> {
			let cycleIdx = 0;
			let schedulerBeat = nextCycleBeat;
			while (true) {
				const result = inst.evaluate({ cycleNumber: cycleIdx });
				if (!result.ok) return;
				if (result.done) return;
				// Sort by absolute beat position so events from multiple loops are
				// interleaved correctly, including cycleOffset-shifted events.
				const events = result.events
					.slice()
					.sort(
						(a, b) =>
							eventBeatPosition(a, cycleIdx, nextCycleBeat, CYCLE_BEATS) -
							eventBeatPosition(b, cycleIdx, nextCycleBeat, CYCLE_BEATS)
					);
				for (let i = 0; i < events.length; i++) {
					const ev = events[i];
					const targetBeat = eventBeatPosition(ev, cycleIdx, nextCycleBeat, CYCLE_BEATS);
					const gap = Math.max(0, targetBeat - schedulerBeat);
					schedulerBeat = targetBeat;

					if (ev.type === 'fx' || ev.type === 'rest') {
						// FX routing not yet wired. Rest slots advance the clock but produce no sound.
						yield { duration: gap, skip: true };
						continue;
					}

					const gateDurationSeconds = clock.beatsToSeconds(ev.duration * CYCLE_BEATS);
					yield { skip: false, ev, duration: gap, gateDurationSeconds };
				}
				// Advance scheduler to the start of the next cycle boundary before
				// evaluating the next cycle. This ensures the cursor is always aligned
				// to a cycle edge regardless of where the last event landed.
				const nextCycleBoundary = nextCycleBeat + (cycleIdx + 1) * CYCLE_BEATS;
				const cycleEndGap = nextCycleBoundary - schedulerBeat;
				if (cycleEndGap > 0) {
					yield { duration: cycleEndGap, skip: true };
					schedulerBeat = nextCycleBoundary;
				}
				cycleIdx++;
			}
		}

		handle = run(
			gen(),
			(event, ntpTime) => {
				if (event.skip) return;
				const { ev, gateDurationSeconds } = event;
				const synthdef = ev.synthdef ?? 'sonic-pi-prophet';
				const adjustedTime = ntpTime + (ev.offsetMs ?? 0) / 1000;
				const oscParams = buildOscParams(ev, data.synthdefs[synthdef]);

				if (ev.mono && ev.loopId) {
					const existing = monoNodes.get(ev.loopId);
					if (existing !== undefined) {
						// Mono voice already running — update pitch and params in place
						scProxy.setAt(adjustedTime, existing, oscParams);
					} else {
						// First event for this mono loop — spawn a new node
						const nodeId = scProxy.synthAt(adjustedTime, synthdef, 'source', oscParams);
						monoNodes.set(ev.loopId, nodeId);
					}
					// No gate-close for mono — voice persists until pattern stops (#19)
				} else {
					if (ev.mono) {
						console.warn('[flux] mono event has no loopId — falling back to polyphonic', ev);
					}
					// Polyphonic: spawn a new node and schedule a gate close.
					// Gate closes gateDurationSeconds after the adjusted note-on time,
					// so offsetMs shifts both the note-on and the gate-close together.
					const nodeId = scProxy.synthAt(adjustedTime, synthdef, 'source', oscParams);
					scProxy.setAt(adjustedTime + gateDurationSeconds, nodeId, { gate: 0 });
				}
			},
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

		<SynthDefPanel synthdefs={data.synthdefs} />
		<FxPanel
			slots={fxSlots}
			onEnable={handleFxEnable}
			onDisable={handleFxDisable}
			onParamChange={handleFxParamChange}
		/>

		<div class="feedback-log" bind:this={logEl}>
			{#each log as entry, i (i)}
				<div class="log-entry {entry.kind}">{entry.message}</div>
			{/each}
		</div>
	</aside>
</div>
