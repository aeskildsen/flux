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
import { getInstance } from 'svelte-supersonic';

/** How often the scheduler wakes to top up the OSC queue (milliseconds). */
export const TICK_INTERVAL_MS = 25;

/** How far ahead of AudioContext.currentTime to schedule OSC bundles (seconds). */
export const LOOKAHEAD_SECONDS = 0.1;

export interface SchedulerHandle {
	stop(): void;
}

function durationOf<T>(value: T, fallback: number): number {
	return ((value as Record<string, unknown>)?.duration as number) ?? fallback;
}

export function run<T>(
	gen: Generator<T>,
	callback: (value: T, ntpTime: number) => void,
	interval = 0.5
): SchedulerHandle {
	let active = true;
	let nextBeat = clock.currentBeat;
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
			const { value, done } = gen.next();
			if (done) {
				active = false;
				return;
			}
			const ntpTime = sonic.initTime + clock.beatToAudioTime(nextBeat);
			callback(value, ntpTime);
			nextBeat += durationOf(value, interval);
		}

		timerId = setTimeout(tick, TICK_INTERVAL_MS);
	}

	tick();

	return {
		stop() {
			active = false;
			clearTimeout(timerId);
		}
	};
}
