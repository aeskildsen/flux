/**
 * Pure helpers for the audio dispatch layer (gen() + scheduler callback).
 *
 * Extracted from +page.svelte so they can be unit-tested without a DOM or
 * audio engine. All functions are stateless.
 */

import { midiToFreq } from '$lib/scales';
import type { ScheduledEvent } from '$lib/lang/evaluator';

export type ParamSpec = {
	min?: number;
	max?: number;
	default?: number;
	curve?: number | string;
	unit?: string;
};

export type SynthDefMeta = {
	specs?: Record<string, ParamSpec>;
};

/**
 * Compute the OSC pitch parameter for a note event.
 *
 * SuperCollider SynthDefs accept `freq` (Hz), not a MIDI note number.
 * When a cent offset is present, it shifts the pitch by cent/100 semitones
 * before conversion. Standard 12-TET: A4 (MIDI 69) = 440 Hz.
 */
export function noteToFreq(note: number, cent?: number): number {
	return midiToFreq(note + (cent ?? 0) / 100);
}

/**
 * Compute the absolute beat position of a scheduled event.
 *
 * Events without `cycleOffset` (looping, no 'at) are positioned relative to
 * the cycle they come from: startBeat + cycleNumber * CYCLE_BEATS + beatOffset * CYCLE_BEATS.
 *
 * Events with `cycleOffset` (from 'at or finite 'n repetitions) are anchored
 * from startBeat using the formula from the issue spec:
 *   startBeat + (cycleNumber + cycleOffset) * CYCLE_BEATS + beatOffset * CYCLE_BEATS
 *
 * For looping patterns with 'at(X), the evaluator always emits cycleOffset=X and
 * cycleNumber increments each cycle — so the full offset is (cycleNumber + X).
 *
 * For finite patterns 'n(N), the evaluator emits all repetitions in cycleNumber=0
 * with cycleOffset=0,1,...,N-1 — so cycleNumber contributes 0 and cycleOffset provides
 * the integer rep offset.
 */
export function eventBeatPosition(
	ev: Pick<ScheduledEvent, 'beatOffset' | 'cycleOffset'>,
	cycleNumber: number,
	startBeat: number,
	CYCLE_BEATS: number
): number {
	const cycleOff = ev.cycleOffset ?? 0;
	return startBeat + (cycleNumber + cycleOff) * CYCLE_BEATS + ev.beatOffset * CYCLE_BEATS;
}

/**
 * Build the OSC parameter object for a note event.
 *
 * Priority (lowest → highest):
 *   1. SynthDef metadata defaults (from specs[param].default)
 *   2. User "param overrides (ev.params)
 *   3. freq — always computed from note + cent, always wins
 *
 * The legacy `note` key is never sent; `freq` is the correct SC convention.
 */
export function buildOscParams(
	ev: Pick<ScheduledEvent, 'note' | 'cent' | 'params'>,
	synthdefMeta: SynthDefMeta | undefined
): Record<string, number> {
	if (!Number.isFinite(ev.note) || ev.note < 0) {
		throw new Error(`buildOscParams: invalid note value ${ev.note}`);
	}
	const defaults: Record<string, number> = {};
	if (synthdefMeta?.specs) {
		for (const [key, spec] of Object.entries(synthdefMeta.specs)) {
			if (spec.default !== undefined) defaults[key] = spec.default;
		}
	}
	const freq = noteToFreq(ev.note, ev.cent);
	if (ev.params && 'freq' in ev.params) {
		console.warn('[flux] "freq" in params is ignored — freq is always computed from note + cent');
	}
	return { ...defaults, ...(ev.params ?? {}), freq };
}
