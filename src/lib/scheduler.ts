/**
 * Lookahead scheduler.
 *
 * Replaces the naive setTimeout loop with the Chris Wilson lookahead pattern
 * plus SuperSonic's NTP prescheduler for sample-accurate OSC dispatch:
 *
 * 1. A JS timer wakes every TICK_INTERVAL_MS (~25ms).
 * 2. On each tick, events within LOOKAHEAD_SECONDS of the engine clock's time
 *    are pulled from the generator and passed to the callback with a precise
 *    NTP timestamp on that clock.
 * 3. The callback (typically sc.synthAt) encodes a timed OSC bundle and hands
 *    it to SuperSonic's prescheduler. The engine plays a bundle that arrives
 *    before its time tag at sample accuracy. The lookahead gives a margin
 *    against small delays of the JS timer.
 * 4. When a tick comes late, an event can be late too. The engine plays a late
 *    bundle immediately. An event that is late by LATE_TOLERANCE_SECONDS or
 *    less is sent. An event that is more late is not sent: this occurs after
 *    a gap, for example a laptop suspend, when the engine clock jumps forward
 *    by the length of the gap. The generator still moves past the event, so
 *    the pattern keeps its position. One tick moves past a maximum of
 *    MAX_SKIPPED_EVENTS_PER_TICK late events, so that a long gap does not
 *    block the page. The scheduler reports the late events through onError.
 *
 * The `interval` parameter (in beats) is a per-call fixed duration fallback,
 * used when the yielded value has no `.duration` field. This preserves full
 * backward compatibility with existing sketches.
 */

import { clock } from '#lib/clock.js';
import { getInstance, getServer, getOsc, GROUPS } from '#svelte-supersonic';
import type { SynthParams, GroupName } from '#svelte-supersonic';

/** How often the scheduler wakes to top up the OSC queue (milliseconds). */
export const TICK_INTERVAL_MS = 25;

/** How far ahead of the engine clock's time to schedule OSC bundles (seconds). */
export const LOOKAHEAD_SECONDS = 0.1;

/**
 * How late an event can be and still be sent (seconds). The engine plays a
 * late bundle immediately, so after a gap all the missed events would sound
 * together. The scheduler does not send an event that is later than this.
 *
 * With the lookahead, a tick can come LOOKAHEAD_SECONDS + LATE_TOLERANCE_SECONDS
 * (0.35 s) late before the scheduler drops events. This covers usual delays of
 * the main thread, for example garbage collection or a long evaluation. After
 * a longer delay, a maximum of 0.25 s of events sound together.
 */
export const LATE_TOLERANCE_SECONDS = 0.25;

/**
 * The maximum number of late events that one tick moves past. After a long
 * gap, the next ticks continue at once until the pattern is on time again.
 */
export const MAX_SKIPPED_EVENTS_PER_TICK = 1000;

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

	// The late events that were not sent and not reported yet. A catch-up after
	// a long gap can use many ticks; the scheduler reports it one time.
	let skipped = 0;
	let maxLate = 0;

	function reportSkipped() {
		if (skipped === 0) return;
		const msg = `Scheduler: did not send ${skipped} late events (up to ${maxLate.toFixed(2)} s late)`;
		console.warn(msg);
		onError?.(msg);
		skipped = 0;
		maxLate = 0;
	}

	function tick() {
		if (!active) return;
		let delay = TICK_INTERVAL_MS;
		try {
			delay = fill();
		} finally {
			// Report the late events when the catch-up is complete or the loop stops.
			if (delay > 0 || !active) reportSkipped();
		}
		if (active) timerId = setTimeout(tick, delay);
	}

	/**
	 * Send the events in the lookahead window. Return the delay before the
	 * next tick in milliseconds: 0 when the tick stopped during a catch-up.
	 */
	function fill(): number {
		// The clock counts on the engine clock. It gives 0 until the engine has rendered its first block.
		const now = clock.now();

		if (!now) {
			// The engine clock does not run yet. Try again at the next tick.
			waitedForEngine = true;
			return TICK_INTERVAL_MS;
		}

		if (waitedForEngine) {
			// Time passed while the scheduler waited for the engine. Move nextBeat
			// forward to the current beat, so that no event is in the past.
			waitedForEngine = false;
			nextBeat = Math.max(nextBeat, clock.currentBeat);
		}

		const horizon = now + LOOKAHEAD_SECONDS;

		let beatTime: number;
		try {
			beatTime = clock.beatToNtp(nextBeat);
		} catch {
			// Clock was stopped while the scheduler was running — stop cleanly.
			active = false;
			const msg = `Scheduler: clock not started at beat ${nextBeat} — stopping`;
			console.error(msg);
			onError?.(msg);
			return TICK_INTERVAL_MS;
		}

		let coincidentCount = 0;
		let skippedThisTick = 0;

		while (beatTime <= horizon) {
			if (nextBeat >= stopBeat) {
				active = false;
				return TICK_INTERVAL_MS;
			}
			const { value, done } = gen.next();
			if (done) {
				active = false;
				return TICK_INTERVAL_MS;
			}
			const dur = durationOf(value, interval);
			if (!isFinite(dur) || dur < 0) {
				active = false;
				const msg = `Scheduler: negative or non-finite duration at beat ${nextBeat}`;
				console.error(msg, value);
				onError?.(msg);
				return TICK_INTERVAL_MS;
			}
			if (dur === 0) {
				coincidentCount++;
				if (coincidentCount > MAX_COINCIDENT_EVENTS) {
					active = false;
					const msg = `Scheduler: ${MAX_COINCIDENT_EVENTS}+ consecutive zero-duration events at beat ${nextBeat} — aborting to prevent runaway`;
					console.error(msg);
					onError?.(msg);
					return TICK_INTERVAL_MS;
				}
			} else {
				coincidentCount = 0;
			}
			// The beat time is an NTP time (seconds since 1900-01-01) on the engine clock, the
			// clock that the engine compares time tags with. Thus it is the time tag of the event.
			if (beatTime < now - LATE_TOLERANCE_SECONDS) {
				// Too late: do not send the event (see LATE_TOLERANCE_SECONDS).
				skipped++;
				skippedThisTick++;
				maxLate = Math.max(maxLate, now - beatTime);
			} else {
				try {
					callback(value, beatTime);
				} catch (e) {
					const msg = e instanceof Error ? e.message : String(e);
					const errMsg = `Scheduler error at beat ${nextBeat}: ${msg}`;
					console.error(errMsg, e);
					onError?.(errMsg);
					// Non-fatal: log the error and skip this event, but keep running.
				}
			}
			nextBeat += dur;
			try {
				beatTime = clock.beatToNtp(nextBeat);
			} catch {
				active = false;
				const msg = `Scheduler: clock not started at beat ${nextBeat} — stopping`;
				console.error(msg);
				onError?.(msg);
				return TICK_INTERVAL_MS;
			}
			// Give the page time to do other work during a long catch-up.
			if (skippedThisTick >= MAX_SKIPPED_EVENTS_PER_TICK) return 0;
		}

		return TICK_INTERVAL_MS;
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
