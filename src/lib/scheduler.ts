/**
 * Lookahead scheduler — Phase 4.
 *
 * Replaces the naive setTimeout loop with the Chris Wilson lookahead pattern
 * plus SuperSonic's NTP prescheduler for sample-accurate OSC dispatch:
 *
 * 1. A JS timer wakes every TICK_INTERVAL_MS (~25ms).
 * 2. On each tick, events within LOOKAHEAD_SECONDS of AudioContext.currentTime
 *    are pulled from the generator and passed to the callback with a precise
 *    NTP timestamp.
 * 3. The callback (typically sc.synthAt) encodes a timed OSC bundle and hands
 *    it to SuperSonic's prescheduler — which dispatches at sample accuracy
 *    regardless of JS thread jitter or background-tab throttling.
 *
 * The `interval` parameter (in beats) is a per-call fixed duration fallback,
 * used when the yielded value has no `.duration` field. This preserves full
 * backward compatibility with existing sketches.
 */

import { clock } from '$lib/clock';
import { getInstance, getServer, getOsc, GROUPS } from 'svelte-supersonic';
import type { SynthParams, GroupName } from 'svelte-supersonic';

/** How often the scheduler wakes to top up the OSC queue (milliseconds). */
export const TICK_INTERVAL_MS = 25;

/** How far ahead of AudioContext.currentTime to schedule OSC bundles (seconds). */
export const LOOKAHEAD_SECONDS = 0.1;

/**
 * Safety cap on consecutive zero-duration events emitted by a single generator.
 * Zero-duration events are legitimate (coincident events from multiple patterns
 * share a beat position — see gen.ts / genEventStrides), but an unbounded run
 * indicates a broken generator and would freeze the tick loop.
 */
export const MAX_COINCIDENT_EVENTS = 10000;

export interface SchedulerHandle {
	stop(): void;
	/** Stop after all events strictly before `beat` have been scheduled. */
	setStopBeat(beat: number): void;
}

function durationOf<T>(value: T, fallback: number): number {
	return ((value as Record<string, unknown>)?.duration as number) ?? fallback;
}

export function run<T>(
	gen: Generator<T>,
	callback: (value: T, ntpTime: number) => void,
	interval = 0.5,
	startBeat?: number,
	onError?: (message: string) => void
): SchedulerHandle {
	let active = true;
	let nextBeat = startBeat ?? clock.currentBeat;
	let stopBeat = Infinity;
	let timerId: ReturnType<typeof setTimeout>;
	let waitedForEngine = false;

	function tick() {
		if (!active) return;

		const sonic = getInstance();
		const ctx = clock.audioContext;

		if (!sonic || !ctx || !sonic.initTime) {
			// Engine not ready yet (or NTP sync pending) — retry next tick
			waitedForEngine = true;
			timerId = setTimeout(tick, TICK_INTERVAL_MS);
			return;
		}

		if (waitedForEngine) {
			// Time passed while waiting for NTP sync: snap nextBeat forward so we
			// don't try to schedule beats whose AudioContext time is already in the past.
			waitedForEngine = false;
			nextBeat = Math.max(nextBeat, clock.currentBeat);
		}

		const horizon = ctx.currentTime + LOOKAHEAD_SECONDS;

		let beatTime: number;
		try {
			beatTime = clock.beatToAudioTime(nextBeat);
		} catch {
			// Clock was stopped while the scheduler was running — stop cleanly.
			active = false;
			const msg = `Scheduler: clock not started at beat ${nextBeat} — stopping`;
			console.error(msg);
			onError?.(msg);
			return;
		}

		let coincidentCount = 0;

		while (beatTime <= horizon) {
			if (nextBeat >= stopBeat) {
				active = false;
				return;
			}
			const { value, done } = gen.next();
			if (done) {
				active = false;
				return;
			}
			const dur = durationOf(value, interval);
			if (!isFinite(dur) || dur < 0) {
				active = false;
				const msg = `Scheduler: negative or non-finite duration at beat ${nextBeat}`;
				console.error(msg, value);
				onError?.(msg);
				return;
			}
			if (dur === 0) {
				coincidentCount++;
				if (coincidentCount > MAX_COINCIDENT_EVENTS) {
					active = false;
					const msg = `Scheduler: ${MAX_COINCIDENT_EVENTS}+ consecutive zero-duration events at beat ${nextBeat} — aborting to prevent runaway`;
					console.error(msg);
					onError?.(msg);
					return;
				}
			} else {
				coincidentCount = 0;
			}
			// clock.beatToAudioTime returns an absolute AudioContext.currentTime value anchored
			// to when clock.start() was called (same timeline as ctx.currentTime).
			// sonic.initTime is the NTP base timestamp (seconds since 1900-01-01) at the moment
			// the AudioContext was created. Adding them converts a scheduled beat to the absolute
			// NTP timestamp required by SuperSonic's OSC bundle prescheduler.
			const ntpTime = sonic.initTime + clock.beatToAudioTime(nextBeat);
			try {
				callback(value, ntpTime);
			} catch (e) {
				const msg = e instanceof Error ? e.message : String(e);
				const errMsg = `Scheduler error at beat ${nextBeat}: ${msg}`;
				console.error(errMsg, e);
				onError?.(errMsg);
				// Non-fatal: log the error and skip this event, but keep running.
			}
			nextBeat += dur;
			try {
				beatTime = clock.beatToAudioTime(nextBeat);
			} catch {
				active = false;
				const msg = `Scheduler: clock not started at beat ${nextBeat} — stopping`;
				console.error(msg);
				onError?.(msg);
				return;
			}
		}

		timerId = setTimeout(tick, TICK_INTERVAL_MS);
	}

	tick();

	return {
		stop() {
			active = false;
			clearTimeout(timerId);
		},
		setStopBeat(beat: number) {
			stopBeat = beat;
		}
	};
}

// ---------------------------------------------------------------------------
// SuperCollider proxy
// ---------------------------------------------------------------------------

/**
 * Flatten SynthParams to an interleaved [key, value, ...] array, skipping any
 * non-finite values (NaN, Infinity) that would produce malformed OSC bundles.
 */
function flatFiniteParams(params: SynthParams, caller: string): (string | number)[] {
	return Object.entries(params).flatMap(([k, v]) => {
		if (typeof v !== 'number' || !Number.isFinite(v)) {
			console.error(`[sc.${caller}] dropping non-finite param "${k}":`, v);
			return [];
		}
		return [k, v];
	});
}

/**
 * Lazy proxy over the live SuperCollider server.
 * Import `sc` at module load time; the server need not be booted yet.
 */
export const sc: Pick<
	NonNullable<ReturnType<typeof getServer>>,
	'synth' | 'set' | 'free' | 'loadSynthDef'
> & {
	synthAt(ntpTime: number, name: string, group?: GroupName, params?: SynthParams): number;
	setAt(ntpTime: number, nodeId: number, params: SynthParams): void;
} = {
	synth: (name: string, group?: GroupName, params?: SynthParams) =>
		getServer()!.synth(name, group, params),
	set: (nodeId: number, params: SynthParams) => getServer()!.set(nodeId, params),
	free: (nodeId: number) => getServer()!.free(nodeId),
	loadSynthDef: (name: string) => getServer()!.loadSynthDef(name),

	/**
	 * Spawn a synth as a timed OSC bundle with a precise NTP timestamp.
	 * Use from scheduler callbacks where the second argument is an NTP time.
	 */
	synthAt(
		ntpTime: number,
		name: string,
		group: GroupName = 'source',
		params: SynthParams = {}
	): number {
		const sonic = getInstance();
		const osc = getOsc();
		if (!sonic || !osc) {
			console.error('[sc.synthAt] engine not ready — dropped event', { ntpTime, name });
			return -1;
		}
		const id = sonic.nextNodeId();
		const flat = flatFiniteParams(params, 'synthAt');
		const bytes = osc.encodeSingleBundle(ntpTime, '/s_new', [name, id, 0, GROUPS[group], ...flat]);
		sonic.sendOSC(bytes);
		return id;
	},

	/**
	 * Send a timed /n_set bundle to update a running node's parameters.
	 * Use from scheduler callbacks for gate-close and mono voice updates.
	 */
	setAt(ntpTime: number, nodeId: number, params: SynthParams): void {
		const sonic = getInstance();
		const osc = getOsc();
		if (!sonic || !osc) {
			console.error('[sc.setAt] engine not ready — dropped event', { ntpTime, nodeId });
			return;
		}
		const flat = flatFiniteParams(params, 'setAt');
		const bytes = osc.encodeSingleBundle(ntpTime, '/n_set', [nodeId, ...flat]);
		sonic.sendOSC(bytes);
	}
};

export { clock };
