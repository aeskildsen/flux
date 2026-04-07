/**
 * Tests for pure dispatch helpers (issue #18, #20).
 *
 * Covers:
 *  - noteToFreq: MIDI note → Hz, with and without cent offset
 *  - buildOscParams: param priority (synthdef defaults < ev.params < freq)
 *  - eventBeatPosition: absolute beat position for cycleOffset / 'at wiring
 */

import { describe, it, expect, vi } from 'vitest';
import { noteToFreq, buildOscParams, eventBeatPosition } from './dispatch.js';

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

// ---------------------------------------------------------------------------
// eventBeatPosition (issue #20 — cycleOffset / 'at wiring)
// ---------------------------------------------------------------------------

describe('eventBeatPosition', () => {
	const CB = 4; // CYCLE_BEATS

	// No cycleOffset: position is cycleNumber + beatOffset, scaled by CYCLE_BEATS
	it('no cycleOffset, cycleNumber=0, beatOffset=0 → startBeat', () => {
		expect(eventBeatPosition({ beatOffset: 0 }, 0, 100, CB)).toBeCloseTo(100);
	});

	it('no cycleOffset, cycleNumber=0, beatOffset=0.5 → startBeat + 0.5*CB', () => {
		expect(eventBeatPosition({ beatOffset: 0.5 }, 0, 100, CB)).toBeCloseTo(100 + 0.5 * CB);
	});

	it('no cycleOffset, cycleNumber=1, beatOffset=0 → startBeat + 1*CB', () => {
		expect(eventBeatPosition({ beatOffset: 0 }, 1, 100, CB)).toBeCloseTo(100 + CB);
	});

	it('no cycleOffset, cycleNumber=2, beatOffset=0.25 → startBeat + 2*CB + 0.25*CB', () => {
		expect(eventBeatPosition({ beatOffset: 0.25 }, 2, 100, CB)).toBeCloseTo(
			100 + 2 * CB + 0.25 * CB
		);
	});

	// cycleOffset=0: same as no cycleOffset (cycleNumber still applied)
	it('cycleOffset=0, cycleNumber=1, beatOffset=0 → startBeat + 1*CB', () => {
		expect(eventBeatPosition({ beatOffset: 0, cycleOffset: 0 }, 1, 100, CB)).toBeCloseTo(100 + CB);
	});

	// cycleOffset shifts the anchor relative to cycleNumber (total offset = cycleNumber + cycleOffset)
	it("'at(1/4): cycleOffset=0.25, cycleNumber=0, beatOffset=0 → startBeat + 0.25*CB", () => {
		expect(eventBeatPosition({ beatOffset: 0, cycleOffset: 0.25 }, 0, 100, CB)).toBeCloseTo(
			100 + 0.25 * CB
		);
	});

	it("'at(1/4): cycleOffset=0.25, cycleNumber=0, beatOffset=1/3 → startBeat + 0.25*CB + (1/3)*CB", () => {
		expect(eventBeatPosition({ beatOffset: 1 / 3, cycleOffset: 0.25 }, 0, 100, CB)).toBeCloseTo(
			100 + 0.25 * CB + (1 / 3) * CB
		);
	});

	it("'at(1) shifts pattern one full cycle: cycleOffset=1 → startBeat + 1*CB", () => {
		expect(eventBeatPosition({ beatOffset: 0, cycleOffset: 1 }, 0, 100, CB)).toBeCloseTo(100 + CB);
	});

	// Finite pattern 'n(3): events emitted in cycleNumber=0 with cycleOffset=0,1,2
	it("'n(3) rep 0: cycleOffset=0, cycleNumber=0 → startBeat", () => {
		expect(eventBeatPosition({ beatOffset: 0, cycleOffset: 0 }, 0, 0, CB)).toBeCloseTo(0);
	});

	it("'n(3) rep 1: cycleOffset=1, cycleNumber=0 → startBeat + CB", () => {
		expect(eventBeatPosition({ beatOffset: 0, cycleOffset: 1 }, 0, 0, CB)).toBeCloseTo(CB);
	});

	it("'n(3) rep 2: cycleOffset=2, cycleNumber=0 → startBeat + 2*CB", () => {
		expect(eventBeatPosition({ beatOffset: 0, cycleOffset: 2 }, 0, 0, CB)).toBeCloseTo(2 * CB);
	});

	// Looping with 'at(0.25): cycleOffset stays 0.25 each cycle; cycleNumber provides the integer part
	it("looping 'at(0.25), cycleNumber=1 → startBeat + (1+0.25)*CB", () => {
		expect(eventBeatPosition({ beatOffset: 0, cycleOffset: 0.25 }, 1, 0, CB)).toBeCloseTo(
			1.25 * CB
		);
	});

	it("looping 'at(0.25), cycleNumber=2 → startBeat + (2+0.25)*CB", () => {
		expect(eventBeatPosition({ beatOffset: 0, cycleOffset: 0.25 }, 2, 0, CB)).toBeCloseTo(
			2.25 * CB
		);
	});

	// Negative cycleOffset 'at(-1/4)
	it("'at(-1/4): cycleOffset=-0.25, cycleNumber=0 → startBeat - 0.25*CB", () => {
		expect(eventBeatPosition({ beatOffset: 0, cycleOffset: -0.25 }, 0, 100, CB)).toBeCloseTo(
			100 - 0.25 * CB
		);
	});

	// beatOffset > 1 (event extends beyond current cycle boundary)
	it('beatOffset=1.5 extends 1.5 cycles past startBeat', () => {
		expect(eventBeatPosition({ beatOffset: 1.5 }, 0, 0, CB)).toBeCloseTo(1.5 * CB);
	});

	// Large cycleNumber — no float precision surprises
	it('large cycleNumber produces correct absolute beat', () => {
		expect(eventBeatPosition({ beatOffset: 0 }, 10000, 0, CB)).toBeCloseTo(10000 * CB);
	});

	// Input validation
	it('throws for CYCLE_BEATS = 0', () => {
		expect(() => eventBeatPosition({ beatOffset: 0 }, 0, 0, 0)).toThrow(
			'eventBeatPosition: invalid CYCLE_BEATS 0'
		);
	});

	it('throws for negative CYCLE_BEATS', () => {
		expect(() => eventBeatPosition({ beatOffset: 0 }, 0, 0, -4)).toThrow(
			'eventBeatPosition: invalid CYCLE_BEATS -4'
		);
	});

	it('throws for non-finite CYCLE_BEATS', () => {
		expect(() => eventBeatPosition({ beatOffset: 0 }, 0, 0, Infinity)).toThrow(
			'eventBeatPosition: invalid CYCLE_BEATS Infinity'
		);
	});

	it('throws for NaN beatOffset', () => {
		expect(() => eventBeatPosition({ beatOffset: NaN }, 0, 0, CB)).toThrow(
			'eventBeatPosition: beatOffset is not finite'
		);
	});
});
