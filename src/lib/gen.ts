/**
 * gen() — scheduler event generator.
 *
 * Drives the lookahead scheduler by yielding one GenEvent per scheduled event
 * slot. Each yielded event carries a `duration` (beats) that the scheduler
 * uses to advance its cursor after dispatching. `skip: true` events are silent
 * stubs that advance the cursor without triggering audio.
 *
 * Dependencies are injected so the function is testable without a DOM, audio
 * context, or Svelte component.
 */

import type { EvalInstance, ScheduledEvent } from '$lib/lang/evaluator.js';
import { eventBeatPosition, genEventStrides } from '$lib/dispatch.js';

export type GenEvent =
	| { skip: true; duration: number }
	| {
			skip: false;
			duration: number;
			ev: ScheduledEvent;
			gateDurationSeconds: number;
	  };

export interface GenDeps {
	/** Evaluator instance (must be ok:true). */
	inst: Extract<EvalInstance, { ok: true }>;
	/** Convert a beat count to wall-clock seconds (from clock.beatsToSeconds). */
	beatsToSeconds: (beats: number) => number;
	/** The absolute beat at which the first cycle starts. */
	startBeat: number;
	/** Beats per DSL cycle (4 in normal use). */
	cycleBeatCount: number;
	/** Side-effect hook for log messages — errors and pattern-done notices. */
	onMessage: (text: string, kind: 'error' | 'info') => void;
}

/**
 * Create the generator that feeds the lookahead scheduler.
 *
 * Each cycle:
 *  1. Calls inst.evaluate({ cycleNumber }) to get this cycle's events.
 *  2. Sorts events by absolute beat position.
 *  3. For each event yields:
 *     a. A `skip: true` stub if there is a pre-event gap (parks the cursor).
 *     b. The real event (or a skip stub for fx/rest) with `duration` = stride
 *        to the next dispatch point.
 *  4. Snaps the cursor to the cycle boundary before the next cycle.
 */
export function* createGen(deps: GenDeps): Generator<GenEvent> {
	const { inst, beatsToSeconds, startBeat, cycleBeatCount, onMessage } = deps;

	let cycleIdx = 0;
	let schedulerBeat = startBeat;

	while (true) {
		const result = inst.evaluate({ cycleNumber: cycleIdx });
		if (!result.ok) {
			onMessage(`Pattern error in cycle ${cycleIdx}: ${result.error}`, 'error');
			console.error('[gen] evaluate() failed:', result.error);
			// Skip this cycle: yield a silent stub covering the full cycle boundary
			// so the scheduler cursor stays aligned, then continue to the next cycle.
			const nextCycleBoundary = startBeat + (cycleIdx + 1) * cycleBeatCount;
			const skipDuration = nextCycleBoundary - schedulerBeat;
			yield { skip: true, duration: skipDuration };
			schedulerBeat = nextCycleBoundary;
			cycleIdx++;
			continue;
		}
		if (result.done) {
			onMessage('Pattern finished', 'info');
			return;
		}

		// Sort by absolute beat position so events from multiple loops are
		// interleaved correctly, including cycleOffset-shifted events.
		const events = result.events
			.slice()
			.sort(
				(a, b) =>
					eventBeatPosition(a, cycleIdx, startBeat, cycleBeatCount) -
					eventBeatPosition(b, cycleIdx, startBeat, cycleBeatCount)
			);

		const strides = genEventStrides(events, cycleIdx, startBeat, cycleBeatCount, schedulerBeat);

		for (let i = 0; i < events.length; i++) {
			const ev = events[i];
			const targetBeat = eventBeatPosition(ev, cycleIdx, startBeat, cycleBeatCount);
			const { preGap, stride } = strides[i];

			if (targetBeat < schedulerBeat) {
				console.warn(
					`[gen] Event at beat ${targetBeat} is behind scheduler cursor ${schedulerBeat} ` +
						`(gap ${(targetBeat - schedulerBeat).toFixed(4)}). cycleOffset=${ev.cycleOffset ?? 0}, ` +
						`beatOffset=${ev.beatOffset}. Clamping to 0 — timing may be incorrect.`
				);
			}
			// Advance cursor to targetBeat — never move backward on a clamped event.
			schedulerBeat = Math.max(schedulerBeat, targetBeat);

			// Emit a skip stub to park the scheduler cursor at targetBeat before
			// dispatching, but only when there is a genuine pre-event gap.
			if (preGap > 0) {
				yield { duration: preGap, skip: true };
			}

			if (ev.contentType === 'fx' || ev.contentType === 'rest') {
				// FX routing not yet wired. Rest slots advance the clock but produce no sound.
				yield { duration: stride, skip: true };
			} else {
				const gateDurationSeconds = beatsToSeconds(ev.duration * cycleBeatCount);
				yield { skip: false, ev, duration: stride, gateDurationSeconds };
			}

			// Advance cursor by stride — the scheduler is now at targetBeat + stride.
			schedulerBeat += stride;
		}

		// schedulerBeat is now at the cycle boundary (last event's stride reaches it).
		// Snap to the exact boundary to absorb any floating-point drift.
		const nextCycleBoundary = startBeat + (cycleIdx + 1) * cycleBeatCount;
		if (schedulerBeat > nextCycleBoundary + 1e-9) {
			console.warn(
				`[gen] Cycle ${cycleIdx} overshot its boundary by ${(schedulerBeat - nextCycleBoundary).toFixed(4)} beats ` +
					`(schedulerBeat=${schedulerBeat}, boundary=${nextCycleBoundary}). ` +
					`Snapping cursor to prevent cumulative drift.`
			);
		}
		schedulerBeat = nextCycleBoundary;
		cycleIdx++;
	}
}
