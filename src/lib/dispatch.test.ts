/**
 * Tests for pure dispatch helpers (issue #18).
 *
 * Covers:
 *  - noteToFreq: MIDI note → Hz, with and without cent offset
 *  - buildOscParams: param priority (synthdef defaults < ev.params < freq)
 */

import { describe, it, expect, vi } from 'vitest';
import { noteToFreq, buildOscParams } from './dispatch.js';

// ---------------------------------------------------------------------------
// noteToFreq
// ---------------------------------------------------------------------------

describe('noteToFreq', () => {
	it('MIDI 69 = A4 = 440 Hz (no cent offset)', () => {
		expect(noteToFreq(69)).toBeCloseTo(440, 5);
	});

	it('MIDI 60 = C4 ≈ 261.63 Hz', () => {
		expect(noteToFreq(60)).toBeCloseTo(261.626, 2);
	});

	it('100 cent offset raises pitch by exactly one semitone', () => {
		// note 60 + 100 cents = note 61 = C#4
		expect(noteToFreq(60, 100)).toBeCloseTo(noteToFreq(61), 5);
	});

	it('-100 cent offset lowers pitch by exactly one semitone', () => {
		expect(noteToFreq(60, -100)).toBeCloseTo(noteToFreq(59), 5);
	});

	it('50 cent offset raises pitch by half a semitone', () => {
		// 50 cents up from MIDI 69 = halfway between A4 and A#4
		const halfStep = noteToFreq(69, 50);
		const a4 = noteToFreq(69);
		const asharp4 = noteToFreq(70);
		// Frequency midpoint in log space — geometric mean
		expect(halfStep).toBeCloseTo(Math.sqrt(a4 * asharp4), 3);
	});

	it('0 cent offset is identical to no cent', () => {
		expect(noteToFreq(60, 0)).toBeCloseTo(noteToFreq(60), 10);
	});

	it('undefined cent behaves the same as 0', () => {
		expect(noteToFreq(60, undefined)).toBeCloseTo(noteToFreq(60), 10);
	});
});

// ---------------------------------------------------------------------------
// buildOscParams
// ---------------------------------------------------------------------------

describe('buildOscParams', () => {
	it('always includes freq computed from note', () => {
		const result = buildOscParams({ note: 69 }, undefined);
		expect(result.freq).toBeCloseTo(440, 5);
	});

	it('never includes a note key', () => {
		const result = buildOscParams({ note: 60 }, undefined);
		expect('note' in result).toBe(false);
	});

	it('includes synthdef defaults from metadata specs', () => {
		const meta = { specs: { amp: { default: 0.5 }, pan: { default: 0 } } };
		const result = buildOscParams({ note: 60 }, meta);
		expect(result.amp).toBe(0.5);
		expect(result.pan).toBe(0);
	});

	it('ev.params overrides synthdef defaults', () => {
		const meta = { specs: { amp: { default: 0.5 } } };
		const result = buildOscParams({ note: 60, params: { amp: 0.8 } }, meta);
		expect(result.amp).toBe(0.8);
	});

	it('freq always wins over both defaults and ev.params', () => {
		// Even if synthdef has a default for freq, the computed value wins
		const meta = { specs: { freq: { default: 999 } } };
		const result = buildOscParams({ note: 69 }, meta);
		expect(result.freq).toBeCloseTo(440, 5);
	});

	it('freq in ev.params is overridden by computed freq', () => {
		// User should not manually set freq — the computed value always wins
		const result = buildOscParams({ note: 69, params: { freq: 999 } }, undefined);
		expect(result.freq).toBeCloseTo(440, 5);
	});

	it('cent offset is applied to freq', () => {
		const result = buildOscParams({ note: 60, cent: 100 }, undefined);
		expect(result.freq).toBeCloseTo(noteToFreq(61), 5);
	});

	it('works with no synthdef metadata (undefined)', () => {
		const result = buildOscParams({ note: 60 }, undefined);
		expect(typeof result.freq).toBe('number');
	});

	it('works with synthdef metadata that has no specs', () => {
		const result = buildOscParams({ note: 60 }, {});
		expect(typeof result.freq).toBe('number');
	});

	it('merges multiple ev.params alongside freq', () => {
		const result = buildOscParams({ note: 60, params: { amp: 0.9, pan: -0.5 } }, undefined);
		expect(result.amp).toBe(0.9);
		expect(result.pan).toBe(-0.5);
		expect(result.freq).toBeCloseTo(noteToFreq(60), 5);
	});

	it('warns when freq appears in ev.params', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		buildOscParams({ note: 69, params: { freq: 999 } }, undefined);
		expect(warn).toHaveBeenCalled();
		warn.mockRestore();
	});

	it('throws for negative note values (sentinel -1 for rests)', () => {
		expect(() => buildOscParams({ note: -1 }, undefined)).toThrow();
	});

	it('throws for NaN note', () => {
		expect(() => buildOscParams({ note: NaN }, undefined)).toThrow();
	});

	it('throws for Infinity note', () => {
		expect(() => buildOscParams({ note: Infinity }, undefined)).toThrow();
	});
});
