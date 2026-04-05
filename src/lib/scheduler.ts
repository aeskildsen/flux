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
	startBeat?: number
): SchedulerHandle {
	let active = true;
	let nextBeat = startBeat ?? clock.currentBeat;
	let stopBeat = Infinity;
	let timerId: ReturnType<typeof setTimeout>;

	function tick() {
		if (!active) return;

		const sonic = getInstance();
		const ctx = clock.audioContext;

		if (!sonic || !ctx) {
			// Engine not ready yet — retry next tick
			timerId = setTimeout(tick, TICK_INTERVAL_MS);
			return;
		}

		const horizon = ctx.currentTime + LOOKAHEAD_SECONDS;

		while (clock.beatToAudioTime(nextBeat) <= horizon) {
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
			if (dur <= 0) {
				active = false;
				console.error(`Scheduler: zero or negative duration at beat ${nextBeat}`, value);
				return;
			}
			// clock.beatToAudioTime returns AudioContext-relative time (seconds since ctx creation).
			// sonic.initTime is the NTP offset: AudioContext epoch expressed as NTP wall-clock seconds.
			// Their sum is the absolute NTP timestamp required by SuperSonic's OSC bundle prescheduler.
			const ntpTime = sonic.initTime + clock.beatToAudioTime(nextBeat);
			callback(value, ntpTime);
			nextBeat += dur;
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
 * Lazy proxy over the live SuperCollider server.
 * Import `sc` at module load time; the server need not be booted yet.
 */
export const sc: Pick<
	NonNullable<ReturnType<typeof getServer>>,
	'synth' | 'set' | 'free' | 'loadSynthDef'
> & {
	synthAt(ntpTime: number, name: string, group?: GroupName, params?: SynthParams): number;
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
		const sonic = getInstance()!;
		const osc = getOsc()!;
		const id = sonic.nextNodeId();
		const flat = Object.entries(params).flat();
		const bytes = osc.encodeSingleBundle(ntpTime, '/s_new', [name, id, 0, GROUPS[group], ...flat]);
		sonic.sendOSC(bytes);
		return id;
	}
};

export { clock };
