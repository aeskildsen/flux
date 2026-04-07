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
