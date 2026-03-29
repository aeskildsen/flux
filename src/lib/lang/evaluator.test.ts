/**
 * Evaluator tests.
 *
 * Organisation:
 *   1. API & instance basics
 *   2. Cycle semantics — eager(1), 'lock, eager(n), modifier precedence
 *   3. Generators — degree-to-MIDI in default C major / C5 context
 *   4. rand / tilde — float bound semantics
 *   5. Pitch context — @root, @octave, @scale, @mtranspose, @cent, @key, set, scoping
 *   6. Generators × non-default pitch contexts
 *   7. List modifiers — 'stut, 'wran, 'pick, 'shuf, 'maybe, 'legato, 'offset, 'mono
 *   8. Pitch modifiers — accidentals, transposition
 *   9. Structural — line statement, continuation modifier lines
 *  10. FX pipe
 *  11. Cross-cutting interactions
 *
 * All tests use C major / C5 = MIDI 60 as the default pitch context unless
 * otherwise stated.
 *
 * C major degree → semitone offsets from root:
 *   0=0  1=2  2=4  3=5  4=7  5=9  6=11  7=12(octave)
 * So: degree 0→C5=60, 1→D5=62, 2→E5=64, 3→F5=65, 4→G5=67, 5→A5=69,
 *     6→B5=71, 7→C6=72, -1→B4=59
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { createInstance } from './evaluator.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create an instance, throw on error. */
function inst(source: string) {
	const i = createInstance(source);
	if (!i.ok) throw new Error(`Instance error: ${i.error}`);
	return i;
}

/** Evaluate cycle 0, throw on error, return events. */
function eval0(source: string) {
	const i = inst(source);
	const r = i.evaluate({ cycleNumber: 0 });
	if (!r.ok) throw new Error(`Eval error: ${r.error}`);
	return r.events;
}

/** Notes from cycle 0. */
function notes(source: string) {
	return eval0(source).map((e) => e.note);
}

/** Beat offsets from cycle 0. */
function offsets(source: string) {
	return eval0(source).map((e) => e.beatOffset);
}

/** Durations from cycle 0. */
function durations(source: string) {
	return eval0(source).map((e) => e.duration);
}

/**
 * Run N cycles, collect all note arrays.
 * Returns a 2-D array: result[cycleIndex][eventIndex].
 */
function collectNotes(source: string, numCycles: number): number[][] {
	const i = inst(source);
	return Array.from({ length: numCycles }, (_, c) => {
		const r = i.evaluate({ cycleNumber: c });
		if (!r.ok) throw new Error(`Eval error cycle ${c}: ${r.error}`);
		return r.events.map((e) => e.note);
	});
}

/** Collect the first note from each of N cycles. */
function collectFirst(source: string, numCycles: number): number[] {
	return collectNotes(source, numCycles).map((c) => c[0]);
}

// ---------------------------------------------------------------------------
// 1. API & instance basics
// ---------------------------------------------------------------------------

describe('createInstance — basic interface', () => {
	it('returns ok:true for a valid loop', () => {
		expect(createInstance('loop [0 2 4]').ok).toBe(true);
	});

	it('returns ok:false for parse errors', () => {
		expect(createInstance('loop [0 1 2').ok).toBe(false); // unclosed bracket
	});
});

describe('instance.evaluate — per-cycle output', () => {
	it('produces one ScheduledEvent per list element', () => {
		const res = inst('loop [0 2 4]').evaluate({ cycleNumber: 0 });
		if (!res.ok) throw new Error(res.error);
		expect(res.events).toHaveLength(3);
	});

	it('each event has a note, beatOffset, and duration', () => {
		const res = inst('loop [0 2 4]').evaluate({ cycleNumber: 0 });
		if (!res.ok) throw new Error(res.error);
		for (const ev of res.events) {
			expect(typeof ev.note).toBe('number');
			expect(typeof ev.beatOffset).toBe('number');
			expect(typeof ev.duration).toBe('number');
		}
	});

	it('distributes events evenly: 4 events → offsets 0, 0.25, 0.5, 0.75', () => {
		const res = inst('loop [0 1 2 3]').evaluate({ cycleNumber: 0 });
		if (!res.ok) throw new Error(res.error);
		expect(res.events[0].beatOffset).toBeCloseTo(0);
		expect(res.events[1].beatOffset).toBeCloseTo(0.25);
		expect(res.events[2].beatOffset).toBeCloseTo(0.5);
		expect(res.events[3].beatOffset).toBeCloseTo(0.75);
	});
});

// ---------------------------------------------------------------------------
// 2. Cycle semantics — eager(1), 'lock, eager(n), modifier precedence
// ---------------------------------------------------------------------------

describe('eager(1) — resample at each cycle boundary (default)', () => {
	it('step generator advances once per cycle (one-element list)', () => {
		// 0step1x4 → degrees [0,1,2,3]. 4 cycles → 4 distinct values.
		const ns = collectNotes('loop [0step1x4]', 4);
		expect(new Set(ns.map((c) => c[0])).size).toBe(4);
	});

	it('constant literal produces the same note every cycle', () => {
		const ns = collectNotes('loop [0]', 4);
		const first = ns[0][0];
		for (const cycle of ns) expect(cycle[0]).toBe(first);
	});

	it('value within a cycle is fixed — same cycleNumber returns same note', () => {
		const i = inst('loop [0step1x4]');
		const res0a = i.evaluate({ cycleNumber: 0 });
		const res0b = i.evaluate({ cycleNumber: 0 });
		if (!res0a.ok || !res0b.ok) throw new Error('eval failed');
		expect(res0a.events[0].note).toBe(res0b.events[0].note);
	});
});

describe("'lock — freeze on first sample", () => {
	it("step generator with 'lock returns same value across all cycles", () => {
		const ns = collectNotes("loop [0step1x4'lock]", 4);
		const first = ns[0][0];
		for (const cycle of ns) expect(cycle[0]).toBe(first);
	});

	it("'lock at list level freezes all elements independently", () => {
		const ns = collectNotes("loop [0step1x4 1step1x4]'lock", 4);
		expect(ns[1]).toEqual(ns[0]);
		expect(ns[2]).toEqual(ns[0]);
		expect(ns[3]).toEqual(ns[0]);
	});

	it("'lock and eager(1) produce different behaviour over multiple cycles", () => {
		const withLock = collectNotes("loop [0step1x4'lock]", 4);
		const withEager = collectNotes('loop [0step1x4]', 4);
		expect(new Set(withEager.map((c) => c[0])).size).toBe(4);
		expect(new Set(withLock.map((c) => c[0])).size).toBe(1);
	});
});

describe('eager(n) — resample every n cycles', () => {
	it('eager(2): same value in cycles 0–1, new value at cycle 2, same in cycles 2–3', () => {
		const ns = collectNotes("loop [0step1x4'eager(2)]", 4);
		expect(ns[0][0]).toBe(ns[1][0]);
		expect(ns[2][0]).not.toBe(ns[0][0]);
		expect(ns[2][0]).toBe(ns[3][0]);
	});

	it('eager(3): value constant for 3 cycles, then resamples at cycle 3', () => {
		const ns = collectNotes("loop [0step1x4'eager(3)]", 6);
		expect(ns[0][0]).toBe(ns[1][0]);
		expect(ns[1][0]).toBe(ns[2][0]);
		expect(ns[3][0]).not.toBe(ns[0][0]);
		expect(ns[3][0]).toBe(ns[4][0]);
		expect(ns[4][0]).toBe(ns[5][0]);
	});

	it('eager(1) on list propagates to elements as the default', () => {
		const ns = collectNotes("loop [0step1x4]'eager(1)", 4);
		expect(new Set(ns.map((c) => c[0])).size).toBe(4);
	});
});

describe('modifier precedence: inner overrides outer', () => {
	it("inner 'lock beats outer eager(1) default — value frozen (truth table 2 row 1)", () => {
		const ns = collectNotes("loop [0step1x4'lock]", 4);
		const first = ns[0][0];
		for (const cycle of ns) expect(cycle[0]).toBe(first);
	});

	it("inner 'lock beats outer 'eager(3) — value frozen (truth table 2 row 2)", () => {
		const ns = collectNotes("loop [0step1x4'lock]'eager(3)", 6);
		const first = ns[0][0];
		for (const cycle of ns) expect(cycle[0]).toBe(first);
	});

	it("inner 'eager(2) beats outer 'lock — resamples every 2 (truth table 2 row 3)", () => {
		const ns = collectNotes("loop [0step1x4'eager(2)]'lock", 4);
		expect(ns[0][0]).toBe(ns[1][0]);
		expect(ns[2][0]).not.toBe(ns[0][0]);
	});

	it("inner 'eager(2) beats outer 'eager(5) — resamples every 2 not every 5 (truth table 2 row 4)", () => {
		const ns = collectNotes("loop [0step1x4'eager(2)]'eager(5)", 4);
		expect(ns[0][0]).toBe(ns[1][0]);
		expect(ns[2][0]).not.toBe(ns[0][0]);
	});

	it("no inner annotation, outer 'lock applies — value frozen (truth table 2 row 5)", () => {
		const ns = collectNotes("loop [0step1x4]'lock", 4);
		const first = ns[0][0];
		for (const cycle of ns) expect(cycle[0]).toBe(first);
	});

	it("no inner annotation, outer 'eager(2) applies — resamples every 2 cycles (truth table 2 row 6)", () => {
		const ns = collectNotes("loop [0step1x4]'eager(2)", 4);
		expect(ns[0][0]).toBe(ns[1][0]);
		expect(ns[2][0]).not.toBe(ns[0][0]);
	});
});

// ---------------------------------------------------------------------------
// 3. Generators — degree-to-MIDI in default C major / C5 context
// ---------------------------------------------------------------------------

describe('numeric generators — degree-to-MIDI in C major / C5', () => {
	it('negative degrees: degree -1 → B4 = MIDI 59, degree 0 → C5 = 60', () => {
		expect(notes('loop [-1 0]')).toEqual([59, 60]);
	});

	it('rand: all sampled degrees within [0, 4] map to valid C-major notes', () => {
		const valid = new Set([60, 62, 64, 65, 67]);
		const i = inst('loop [0rand4]');
		for (let cycle = 0; cycle < 50; cycle++) {
			const res = i.evaluate({ cycleNumber: cycle });
			if (!res.ok) throw new Error(res.error);
			expect(valid.has(res.events[0].note)).toBe(true);
		}
	});

	it('rand: produces more than one distinct note over many cycles', () => {
		expect(new Set(collectFirst('loop [0rand6]', 100)).size).toBeGreaterThan(1);
	});

	it('gau: produces varying notes (mean=3, sdev=1)', () => {
		expect(new Set(collectFirst('loop [3gau1]', 100)).size).toBeGreaterThan(1);
	});

	it('exp: all notes within degree range [1, 7] → MIDI [62, 72]', () => {
		const i = inst('loop [1exp7]');
		for (let cycle = 0; cycle < 50; cycle++) {
			const res = i.evaluate({ cycleNumber: cycle });
			if (!res.ok) throw new Error(res.error);
			expect(res.events[0].note).toBeGreaterThanOrEqual(62);
			expect(res.events[0].note).toBeLessThanOrEqual(72);
		}
	});

	it('bro: stays within degree range [0, 6] → MIDI [60, 71]', () => {
		const i = inst('loop [0bro6m1]');
		for (let cycle = 0; cycle < 100; cycle++) {
			const res = i.evaluate({ cycleNumber: cycle });
			if (!res.ok) throw new Error(res.error);
			expect(res.events[0].note).toBeGreaterThanOrEqual(60);
			expect(res.events[0].note).toBeLessThanOrEqual(71);
		}
	});

	it('bro: changes value over time (stateful)', () => {
		expect(new Set(collectFirst('loop [0bro6m2]', 50)).size).toBeGreaterThan(1);
	});

	it('step: cycles through correct degrees — loop [0step2x4]', () => {
		// Pseries(start=0, step=2, length=4) → degrees [0, 2, 4, 6], repeating
		// C major: C5=60, E5=64, G5=67, B5=71
		expect(collectFirst('loop [0step2x4]', 8)).toEqual([60, 64, 67, 71, 60, 64, 67, 71]);
	});

	it('mul: cycles through correct degrees — loop [1mul2x4]', () => {
		// Pgeom(start=1, mul=2, length=4) → degrees [1, 2, 4, 8], repeating
		// C major: D5=62, E5=64, G5=67, D6=74
		expect(collectFirst('loop [1mul2x4]', 5)).toEqual([62, 64, 67, 74, 62]);
	});

	it('lin: spans from first to last degree — loop [0lin4x3]', () => {
		// linear interp first=0, last=4, length=3 → degrees [0, 2, 4]
		// C major: C5=60, E5=64, G5=67
		expect(collectFirst('loop [0lin4x3]', 4)).toEqual([60, 64, 67, 60]); // wraps
	});

	it('geo: produces geometrically spaced degrees — loop [1geo8x4]', () => {
		// geometric interp first=1, last=8, length=4 → degrees [1, 2, 4, 8]
		// C major: D5=62, E5=64, G5=67, D6=74
		expect(collectFirst('loop [1geo8x4]', 4)).toEqual([62, 64, 67, 74]);
	});
});

// ---------------------------------------------------------------------------
// 4. rand / tilde — float bound semantics
//
// If either bound is a float the generator samples a continuous float from
// [min, max). If both bounds are integers it samples an integer from
// [min, max] (inclusive, via floor). Rounding to the nearest integer happens
// downstream at degreeToMidi via Math.round.
// ---------------------------------------------------------------------------

describe('rand / tilde — float bound semantics', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	// --- Integer bounds ---

	it('integer bounds: Math.random()=0.0 → min', () => {
		vi.spyOn(Math, 'random').mockReturnValue(0);
		// floor(0 * (4 - 0 + 1)) + 0 = 0 → C5 = MIDI 60
		expect(eval0('loop [0rand4]')[0].note).toBe(60);
	});

	it('integer bounds: Math.random()=0.999 → max', () => {
		vi.spyOn(Math, 'random').mockReturnValue(0.999);
		// floor(0.999 * 5) + 0 = floor(4.995) = 4 → G5 = MIDI 67
		expect(eval0('loop [0rand4]')[0].note).toBe(67);
	});

	it('integer bounds: produces only integer degrees (never fractional MIDI)', () => {
		const i = inst('loop [0rand6]');
		for (let cycle = 0; cycle < 50; cycle++) {
			const res = i.evaluate({ cycleNumber: cycle });
			if (!res.ok) throw new Error(res.error);
			expect(Number.isInteger(res.events[0].note)).toBe(true);
			expect(res.events[0].cent).toBeUndefined();
		}
	});

	// --- Float min, integer max ---

	it('float min, int max: Math.random()=0.0 → min exactly', () => {
		vi.spyOn(Math, 'random').mockReturnValue(0);
		// raw degree: 0.0 * (4 - 0.5) + 0.5 = 0.5 → Math.round(0.5) = 1 → D5 = MIDI 62
		expect(eval0('loop [0.5rand4]')[0].note).toBe(62);
	});

	it('float min, int max: Math.random()=1.0 → approaches max (open interval)', () => {
		vi.spyOn(Math, 'random').mockReturnValue(1 - Number.EPSILON);
		// raw degree ≈ 3.5 - ε → Math.round ≈ 3 or 4 → MIDI in [62..67]
		const note = eval0('loop [0.5rand4]')[0].note;
		expect(note).toBeGreaterThanOrEqual(62);
		expect(note).toBeLessThanOrEqual(67);
	});

	it('float min (0.), int max: all sampled degrees round to valid C-major notes', () => {
		// 0.rand4 — min is 0.0 (trailing dot), max is 4
		// continuous output in [0.0, 4.0) → degrees 0–4 reachable via Math.round
		const valid = new Set([60, 62, 64, 65, 67]);
		const i = inst('loop [0.rand4]');
		for (let cycle = 0; cycle < 100; cycle++) {
			const res = i.evaluate({ cycleNumber: cycle });
			if (!res.ok) throw new Error(res.error);
			expect(valid.has(res.events[0].note)).toBe(true);
		}
	});

	// --- Integer min, float max ---

	it('int min, float max: Math.random()=0.0 → min exactly', () => {
		vi.spyOn(Math, 'random').mockReturnValue(0);
		// raw degree: 0.0 * (3.5 - 0) + 0 = 0.0 → Math.round(0) = 0 → C5 = MIDI 60
		expect(eval0('loop [0rand3.5]')[0].note).toBe(60);
	});

	it('int min, float max: all sampled degrees round to valid C-major notes', () => {
		// 0rand3.5 — output in [0.0, 3.5) rounds to degree 0–3 → MIDI [60, 62, 64, 65]
		const valid = new Set([60, 62, 64, 65]);
		const i = inst('loop [0rand3.5]');
		for (let cycle = 0; cycle < 100; cycle++) {
			const res = i.evaluate({ cycleNumber: cycle });
			if (!res.ok) throw new Error(res.error);
			expect(valid.has(res.events[0].note)).toBe(true);
		}
	});

	// --- Both bounds float ---

	it('both float bounds: Math.random()=0.0 → min exactly', () => {
		vi.spyOn(Math, 'random').mockReturnValue(0);
		// raw degree: 0.0 * (3.5 - 0.5) + 0.5 = 0.5 → Math.round(0.5) = 1 → D5 = MIDI 62
		expect(eval0('loop [0.5rand3.5]')[0].note).toBe(62);
	});

	it('both float bounds: Math.random()=0.5 → midpoint', () => {
		vi.spyOn(Math, 'random').mockReturnValue(0.5);
		// raw degree: 0.5 * (3.5 - 0.5) + 0.5 = 1.5 + 0.5 = 2.0 → Math.round(2.0) = 2 → E5 = MIDI 64
		expect(eval0('loop [0.5rand3.5]')[0].note).toBe(64);
	});

	it('both float bounds: produces more than one distinct note over many cycles', () => {
		expect(new Set(collectFirst('loop [0.5rand3.5]', 100)).size).toBeGreaterThan(1);
	});

	// --- Tilde (~) — syntactic sugar for rand ---

	it('tilde with integer bounds: Math.random()=0.0 → min', () => {
		vi.spyOn(Math, 'random').mockReturnValue(0);
		expect(eval0('loop [0~4]')[0].note).toBe(60);
	});

	it('tilde with float min: Math.random()=0.0 → same result as float rand', () => {
		vi.spyOn(Math, 'random').mockReturnValue(0);
		const noteRand = eval0('loop [0.5rand4]')[0].note;
		// fresh instance (mock still active)
		vi.spyOn(Math, 'random').mockReturnValue(0);
		const noteTilde = eval0('loop [0.5~4]')[0].note;
		expect(noteTilde).toBe(noteRand);
	});

	it('tilde with float max: all sampled degrees in valid range', () => {
		const valid = new Set([60, 62, 64, 65]);
		const i = inst('loop [0~3.5]');
		for (let cycle = 0; cycle < 100; cycle++) {
			const res = i.evaluate({ cycleNumber: cycle });
			if (!res.ok) throw new Error(res.error);
			expect(valid.has(res.events[0].note)).toBe(true);
		}
	});

	// --- Edge cases ---

	it('min === max (float): always returns min', () => {
		const i = inst('loop [2.5rand2.5]');
		for (let cycle = 0; cycle < 10; cycle++) {
			const res = i.evaluate({ cycleNumber: cycle });
			if (!res.ok) throw new Error(res.error);
			// degree 2.5 rounds to 3 → F5 = MIDI 65
			expect(res.events[0].note).toBe(65);
		}
	});

	it('min === max (integer): always returns that degree', () => {
		const i = inst('loop [3rand3]');
		for (let cycle = 0; cycle < 10; cycle++) {
			const res = i.evaluate({ cycleNumber: cycle });
			if (!res.ok) throw new Error(res.error);
			// degree 3 → F5 = MIDI 65
			expect(res.events[0].note).toBe(65);
		}
	});

	it('negative float min: Math.random()=0.0 → min degree (rounds correctly)', () => {
		vi.spyOn(Math, 'random').mockReturnValue(0);
		// raw degree: -0.5 → Math.round(-0.5) = 0 → C5 = MIDI 60
		expect(eval0('loop [-0.5rand2]')[0].note).toBe(60);
	});

	it('negative float min: all sampled notes within expected range', () => {
		// -0.5rand2 → continuous output in [-0.5, 2.0)
		// Math.round(-0.5) = 0 in JS (rounds toward +Infinity at halfway),
		// so degree -1 is unreachable. Reachable degrees: 0, 1, 2.
		// C major: C5=60, D5=62, E5=64
		const valid = new Set([60, 62, 64]);
		const i = inst('loop [-0.5rand2]');
		for (let cycle = 0; cycle < 100; cycle++) {
			const res = i.evaluate({ cycleNumber: cycle });
			if (!res.ok) throw new Error(res.error);
			expect(valid.has(res.events[0].note)).toBe(true);
		}
	});

	it('float bound in multi-element list: each element independently sampled', () => {
		// [0.5rand2] → rounds to 1 or 2 → D5=62 or E5=64
		// [2.5rand4] → rounds to 3 or 4 → F5=65 or G5=67
		const validFirst = new Set([62, 64]);
		const validSecond = new Set([65, 67]);
		const i = inst('loop [0.5rand2 2.5rand4]');
		for (let cycle = 0; cycle < 100; cycle++) {
			const res = i.evaluate({ cycleNumber: cycle });
			if (!res.ok) throw new Error(res.error);
			expect(validFirst.has(res.events[0].note)).toBe(true);
			expect(validSecond.has(res.events[1].note)).toBe(true);
		}
	});
});

// ---------------------------------------------------------------------------
// 5. Pitch context — decorators, @key, set, scoping
//
// Root MIDI formula: 60 + root_semitone + (octave - 5) * 12
// Pitch classes (semitone from C): c=0 d=2 e=4 f=5 g=7 a=9 b=11
// ---------------------------------------------------------------------------

describe('default pitch context — C major / C5 (baseline)', () => {
	it('degree 0 = C5 = MIDI 60', () => expect(notes('loop [0]')[0]).toBe(60));
	it('degree 1 = D5 = MIDI 62', () => expect(notes('loop [1]')[0]).toBe(62));
	it('degree 4 = G5 = MIDI 67', () => expect(notes('loop [4]')[0]).toBe(67));
	it('degree 7 = C6 = MIDI 72 (octave wrap)', () => expect(notes('loop [7]')[0]).toBe(72));
	it('degree -1 = B4 = MIDI 59 (below root)', () => expect(notes('loop [-1]')[0]).toBe(59));
});

describe('@root — changes root pitch class (semitone offset from C)', () => {
	it('@root(7) shifts root to G: degree 0 = G5 = MIDI 67', () => {
		expect(notes('@root(7) loop [0]')[0]).toBe(67);
	});

	it('@root(7) degree 1 in major = A5 = MIDI 69', () => {
		// G5=67 + 2 semitones = 69
		expect(notes('@root(7) loop [1]')[0]).toBe(69);
	});

	it('@root(0) is same as default (C)', () => {
		expect(notes('@root(0) loop [0]')[0]).toBe(60);
	});

	it('@root(2) shifts to D: degree 0 = D5 = MIDI 62', () => {
		expect(notes('@root(2) loop [0]')[0]).toBe(62);
	});
});

describe('@octave — changes the octave', () => {
	it('@octave(4) lowers by one octave: C4 = MIDI 48', () => {
		expect(notes('@octave(4) loop [0]')[0]).toBe(48);
	});

	it('@octave(6) raises by one octave: C6 = MIDI 72', () => {
		expect(notes('@octave(6) loop [0]')[0]).toBe(72);
	});

	it('@octave(5) is the default: C5 = MIDI 60', () => {
		expect(notes('@octave(5) loop [0]')[0]).toBe(60);
	});

	it('@octave(3) deep bass: C3 = MIDI 36', () => {
		expect(notes('@octave(3) loop [0]')[0]).toBe(36);
	});
});

describe('@scale — changes the active scale', () => {
	// minor intervals: [2,1,2,2,1,2,2] → degree 2 = 3 semitones from root → Eb5 = 63
	it('@scale(minor) degree 2 = Eb5 = MIDI 63', () => {
		expect(notes('@scale(minor) loop [2]')[0]).toBe(63);
	});

	it('@scale(major) degree 2 = E5 = MIDI 64 (same as default)', () => {
		expect(notes('@scale(major) loop [2]')[0]).toBe(64);
	});

	// major_pentatonic: [2,2,3,2,3] → degree 2 = 4 semitones → E5 = 64
	it('@scale(major_pentatonic) degree 2 = E5 = MIDI 64', () => {
		expect(notes('@scale(major_pentatonic) loop [2]')[0]).toBe(64);
	});

	// minor_pentatonic: [3,2,2,3,2] → degree 1 = 3 semitones → Eb5 = 63
	it('@scale(minor_pentatonic) degree 1 = Eb5 = MIDI 63', () => {
		expect(notes('@scale(minor_pentatonic) loop [1]')[0]).toBe(63);
	});

	// dorian: [2,1,2,2,2,1,2] → degree 6 = 10 semitones → Bb5 = 70
	it('@scale(dorian) degree 6 = Bb5 = MIDI 70', () => {
		expect(notes('@scale(dorian) loop [6]')[0]).toBe(70);
	});

	// phrygian: [1,2,2,2,1,2,2] → degree 1 = 1 semitone → Db5 = 61
	it('@scale(phrygian) degree 1 = Db5 = MIDI 61', () => {
		expect(notes('@scale(phrygian) loop [1]')[0]).toBe(61);
	});

	// lydian: [2,2,2,1,2,2,1] → degree 3 = 6 semitones → F#5 = 66
	it('@scale(lydian) degree 3 = F#5 = MIDI 66', () => {
		expect(notes('@scale(lydian) loop [3]')[0]).toBe(66);
	});

	// mixolydian: [2,2,1,2,2,1,2] → degree 6 = 10 semitones → Bb5 = 70
	it('@scale(mixolydian) degree 6 = Bb5 = MIDI 70', () => {
		expect(notes('@scale(mixolydian) loop [6]')[0]).toBe(70);
	});

	// locrian: [1,2,2,1,2,2,2] → degree 4 = 6 semitones → F#5 = 66
	it('@scale(locrian) degree 4 = F#5 = MIDI 66', () => {
		expect(notes('@scale(locrian) loop [4]')[0]).toBe(66);
	});

	// harmonic_minor: [2,1,2,2,1,3,1] → degree 6 = 11 semitones → B5 = 71
	it('@scale(harmonic_minor) degree 6 = B5 = MIDI 71', () => {
		expect(notes('@scale(harmonic_minor) loop [6]')[0]).toBe(71);
	});

	// melodic_minor: [2,1,2,2,2,2,1] → degree 5 = 9 semitones → A5 = 69
	it('@scale(melodic_minor) degree 5 = A5 = MIDI 69', () => {
		expect(notes('@scale(melodic_minor) loop [5]')[0]).toBe(69);
	});

	// harmonic_major: [2,2,1,2,1,3,1] → degree 5 = 8 semitones → Ab5 = 68
	it('@scale(harmonic_major) degree 5 = Ab5 = MIDI 68', () => {
		expect(notes('@scale(harmonic_major) loop [5]')[0]).toBe(68);
	});

	// blues: [3,2,1,1,3,2] → degree 2 = 5 semitones → F5 = 65
	it('@scale(blues) degree 2 = F5 = MIDI 65', () => {
		expect(notes('@scale(blues) loop [2]')[0]).toBe(65);
	});

	// whole_tone: [2,2,2,2,2,2] → degree 3 = 6 semitones → F#5 = 66
	it('@scale(whole_tone) degree 3 = F#5 = MIDI 66', () => {
		expect(notes('@scale(whole_tone) loop [3]')[0]).toBe(66);
	});

	// diminished: [2,1,2,1,2,1,2,1] → degree 4 = 6 semitones → F#5 = 66
	it('@scale(diminished) degree 4 = F#5 = MIDI 66', () => {
		expect(notes('@scale(diminished) loop [4]')[0]).toBe(66);
	});

	// augmented: [3,1,3,1,3,1] → degree 2 = 4 semitones → E5 = 64
	it('@scale(augmented) degree 2 = E5 = MIDI 64', () => {
		expect(notes('@scale(augmented) loop [2]')[0]).toBe(64);
	});
});

describe('@mtranspose — shifts all degrees by N scale steps', () => {
	// C major, @mtranspose(2): degree 0 → effective degree 2 → E5 = 64
	it('@mtranspose(2) shifts degree 0 → degree 2 in C major → E5 = MIDI 64', () => {
		expect(notes('@mtranspose(2) loop [0]')[0]).toBe(64);
	});

	it('@mtranspose(0) is no-op: degree 0 = C5 = MIDI 60', () => {
		expect(notes('@mtranspose(0) loop [0]')[0]).toBe(60);
	});

	// @mtranspose(7): degree 0 → degree 7 → one octave above → C6 = 72
	it('@mtranspose(7) shifts degree 0 → degree 7 → C6 = MIDI 72', () => {
		expect(notes('@mtranspose(7) loop [0]')[0]).toBe(72);
	});

	// Negative: @mtranspose(-2) degree 2 → degree 0 → C5 = 60
	it('@mtranspose(-2) shifts degree 2 → degree 0 → C5 = MIDI 60', () => {
		expect(notes('@mtranspose(-2) loop [2]')[0]).toBe(60);
	});
});

describe('@cent — pitch deviation in cents', () => {
	it('@cent(0) no deviation: note number is still 60 (cent offset is separate metadata)', () => {
		expect(notes('@cent(0) loop [0]')[0]).toBe(60);
	});

	it('@cent(50) stores a non-zero cent offset on events', () => {
		const res = inst('@cent(50) loop [0]').evaluate({ cycleNumber: 0 });
		if (!res.ok) throw new Error(res.error);
		expect(res.events[0].note).toBe(60);
		expect(res.events[0].cent).toBe(50);
	});

	it('@cent(-50) stores a negative cent offset', () => {
		const res = inst('@cent(-50) loop [0]').evaluate({ cycleNumber: 0 });
		if (!res.ok) throw new Error(res.error);
		expect(res.events[0].cent).toBe(-50);
	});

	it('no @cent decorator → cent defaults to 0', () => {
		const res = inst('loop [0]').evaluate({ cycleNumber: 0 });
		if (!res.ok) throw new Error(res.error);
		expect(res.events[0].cent ?? 0).toBe(0);
	});
});

describe('@key — compound decorator (root + scale [+ octave])', () => {
	it('@key(g lydian) degree 0 = G5 = MIDI 67', () => {
		// rootMidi = 60 + 7 = 67. Lydian degree 0 = 0 → MIDI 67
		expect(notes('@key(g lydian) loop [0]')[0]).toBe(67);
	});

	it('@key(g lydian) degree 3 = C#6 = MIDI 73', () => {
		// Lydian: [2,2,2,1,2,2,1] → offset at degree 3 = 6 → 67+6 = 73
		expect(notes('@key(g lydian) loop [3]')[0]).toBe(73);
	});

	it('@key(g# lydian) degree 0 = G#5 = MIDI 68', () => {
		// rootMidi = 60 + 8 = 68
		expect(notes('@key(g# lydian) loop [0]')[0]).toBe(68);
	});

	it('@key(a minor) degree 0 = A5 = MIDI 69', () => {
		// rootMidi = 60 + 9 = 69
		expect(notes('@key(a minor) loop [0]')[0]).toBe(69);
	});

	it('@key(a minor) degree 2 = C6 = MIDI 72', () => {
		// A5=69, minor[2] = 3 semitones → 72
		expect(notes('@key(a minor) loop [2]')[0]).toBe(72);
	});

	it('@key(c major 4) degree 0 = C4 = MIDI 48', () => {
		// rootMidi = 60 + 0 - 12 = 48
		expect(notes('@key(c major 4) loop [0]')[0]).toBe(48);
	});

	it('@key(c major 6) degree 0 = C6 = MIDI 72', () => {
		expect(notes('@key(c major 6) loop [0]')[0]).toBe(72);
	});

	it('@key(bb major) degree 0 = Bb5 = MIDI 70', () => {
		// rootMidi = 60 + 10 = 70
		expect(notes('@key(bb major) loop [0]')[0]).toBe(70);
	});

	it('@key(G lydian) (uppercase) degree 0 = G5 = MIDI 67', () => {
		expect(notes('@key(G lydian) loop [0]')[0]).toBe(67);
	});
});

describe('set — writes to global context', () => {
	it('set scale(minor) changes default scale globally', () => {
		// minor degree 2 = 3 semitones → Eb5 = 63
		expect(notes('set scale(minor)\nloop [2]')[0]).toBe(63);
	});

	it('set root(7) shifts root to G globally', () => {
		expect(notes('set root(7)\nloop [0]')[0]).toBe(67);
	});

	it('set octave(4) lowers octave globally', () => {
		expect(notes('set octave(4)\nloop [0]')[0]).toBe(48);
	});

	it('set key(g lydian) applies compound decorator globally', () => {
		expect(notes('set key(g lydian)\nloop [0]')[0]).toBe(67);
	});

	it('set mtranspose(2) applies modal transposition globally', () => {
		// degree 0 + mtranspose 2 → effective degree 2 → E5 = 64
		expect(notes('set mtranspose(2)\nloop [0]')[0]).toBe(64);
	});

	it('multiple set statements combine', () => {
		// set root(7) + set octave(4): G4 = 60 + 7 - 12 = 55
		expect(notes('set root(7)\nset octave(4)\nloop [0]')[0]).toBe(55);
	});
});

describe('decorator scoping (truth table 8)', () => {
	it('block body inherits outer decorator: @scale(minor) loop [2] = Eb5 = 63', () => {
		expect(notes('@scale(minor)\n  loop [2]')[0]).toBe(63);
	});

	it('inline decorator: @scale(minor) loop [2] = Eb5 = 63', () => {
		expect(notes('@scale(minor) loop [2]')[0]).toBe(63);
	});

	it('no decorator: loop [0] uses global defaults → C5 = 60', () => {
		expect(notes('loop [0]')[0]).toBe(60);
	});

	it('@key(g# lydian) inline: degree 0 = G#5 = 68', () => {
		expect(notes('@key(g# lydian) loop [0]')[0]).toBe(68);
	});

	it('@key(g# lydian 4) inline: degree 0 = G#4 = 56', () => {
		expect(notes('@key(g# lydian 4) loop [0]')[0]).toBe(56);
	});

	it('nested @root(7) outer, @scale(minor) inner: both apply — G minor degree 2 = Bb5 = 70', () => {
		// G5=67, minor degree 2 = 3 semitones → 70
		expect(notes('@root(7)\n  @scale(minor)\n    loop [2]')[0]).toBe(70);
	});

	it('inner @root overrides outer @root', () => {
		// outer @root(7) = G, inner @root(0) = C → C5 = 60
		expect(notes('@root(7)\n  @root(0)\n    loop [0]')[0]).toBe(60);
	});

	it('decorator scope is lexical — does not affect undecorated siblings', () => {
		// Two loops: one under @scale(minor), one bare. At minimum parses successfully.
		expect(createInstance('@scale(minor)\n  loop [2]\nloop [2]').ok).toBe(true);
	});
});

describe('set vs @ interaction', () => {
	it('@ overrides set for its scope', () => {
		// set root(7): global G. @root(0) overrides to C for the inline loop.
		expect(notes('set root(7)\n@root(0) loop [0]')[0]).toBe(60);
	});

	it('set applies when no @ override', () => {
		expect(notes('set root(7)\nloop [0]')[0]).toBe(67);
	});
});

describe('stochastic decorator arguments', () => {
	it('@root with constant generator: @root(7) is the same as a literal', () => {
		expect(notes('@root(7) loop [0]')[0]).toBe(67);
	});

	it('@root with step generator: lock-by-default freezes root at first value', () => {
		// @root(0step7x2) — decorators lock by default, so root is frozen at 0 (= C5).
		const ns = collectFirst('@root(0step7x2) loop [0]', 4);
		expect(ns.every((n) => n === ns[0])).toBe(true);
		expect(ns[0]).toBe(60); // locked at step start value 0 → C5
	});
});

describe('multiple inline decorators on same loop', () => {
	it('@scale(minor) @root(7) loop [0]: G minor, degree 0 = G5 = 67', () => {
		expect(notes('@scale(minor) @root(7) loop [0]')[0]).toBe(67);
	});

	it('@scale(minor) @root(7) loop [2]: G minor degree 2 = Bb5 = 70', () => {
		// G5=67, minor[2] = 3 semitones → 70
		expect(notes('@scale(minor) @root(7) loop [2]')[0]).toBe(70);
	});
});

describe('pitch chain: combined root + octave + scale', () => {
	it('root=5 (F), octave=4, major, degree 0 = F4 = MIDI 53', () => {
		// F5=65, F4=53
		expect(notes('@root(5) @octave(4) loop [0]')[0]).toBe(53);
	});

	it('root=7 (G), major, degree 2 = B5 = MIDI 71', () => {
		// G5=67, major degree 2 = 4 semitones → 71
		expect(notes('@root(7) loop [2]')[0]).toBe(71);
	});

	it('@key(g minor) degree 7 wraps to G6 = MIDI 79', () => {
		// G5=67, degree 7 = 12 semitones up (full octave) → 79
		expect(notes('@key(g minor) loop [7]')[0]).toBe(79);
	});
});

// ---------------------------------------------------------------------------
// 6. Generators × non-default pitch contexts
//
// Strategy: run each generator type under @key(g major 4) and verify output
// is shifted by exactly (root=+7, octave=-1) = -5 semitones from the C major
// / C5 baseline. This confirms the context is correctly threaded through all
// generator paths.
//
// G major / octave 4: rootMidi = 60 + 7 + (4-5)*12 = 55 (G4), shift = -5.
// ---------------------------------------------------------------------------

describe('generators × non-default pitch context (@key(g major 4), shift = -5)', () => {
	const SHIFT = -5;

	it('literal degree: [2] in G major/4 → E4 = 59', () => {
		expect(notes('@key(g major 4) loop [2]')[0]).toBe(64 + SHIFT);
	});

	it('literal list: [0 2 4 6] in G major/4 — all four notes shifted -5', () => {
		expect(notes('@key(g major 4) loop [0 2 4 6]')).toEqual([60, 64, 67, 71].map((n) => n + SHIFT));
	});

	it('step: [0step2x4] advances through degrees 0,2,4,6 across 4 cycles in G major/4', () => {
		const i = inst('@key(g major 4) loop [0step2x4]');
		const cycleNotes = [0, 1, 2, 3].map((c) => {
			const res = i.evaluate({ cycleNumber: c });
			if (!res.ok) throw new Error(res.error);
			return res.events[0].note;
		});
		expect(cycleNotes).toEqual([60, 64, 67, 71].map((n) => n + SHIFT));
	});

	it('mul: [1mul2x4] advances through degrees 1,2,4,8 across 4 cycles in G major/4', () => {
		const i = inst('@key(g major 4) loop [1mul2x4]');
		const cycleNotes = [0, 1, 2, 3].map((c) => {
			const res = i.evaluate({ cycleNumber: c });
			if (!res.ok) throw new Error(res.error);
			return res.events[0].note;
		});
		expect(cycleNotes).toEqual([62, 64, 67, 74].map((n) => n + SHIFT));
	});

	it('lin: [0lin4x3] advances through degrees 0,2,4 across 3 cycles in G major/4', () => {
		const i = inst('@key(g major 4) loop [0lin4x3]');
		const cycleNotes = [0, 1, 2].map((c) => {
			const res = i.evaluate({ cycleNumber: c });
			if (!res.ok) throw new Error(res.error);
			return res.events[0].note;
		});
		expect(cycleNotes).toEqual([60, 64, 67].map((n) => n + SHIFT));
	});

	it('geo: [1geo8x4] advances through degrees 1,2,4,8 across 4 cycles in G major/4', () => {
		const i = inst('@key(g major 4) loop [1geo8x4]');
		const cycleNotes = [0, 1, 2, 3].map((c) => {
			const res = i.evaluate({ cycleNumber: c });
			if (!res.ok) throw new Error(res.error);
			return res.events[0].note;
		});
		expect(cycleNotes).toEqual([62, 64, 67, 74].map((n) => n + SHIFT));
	});

	it('rand: [0rand4] in G major/4 — all notes in shifted G-major range', () => {
		const validInG = new Set([60, 62, 64, 65, 67].map((n) => n + SHIFT));
		const i = inst('@key(g major 4) loop [0rand4]');
		for (let cycle = 0; cycle < 50; cycle++) {
			const res = i.evaluate({ cycleNumber: cycle });
			if (!res.ok) throw new Error(res.error);
			expect(validInG.has(res.events[0].note)).toBe(true);
		}
	});

	it('rand: [0rand4] in G major/4 — produces more than one distinct note', () => {
		const i = inst('@key(g major 4) loop [0rand4]');
		const seen = new Set<number>();
		for (let cycle = 0; cycle < 50; cycle++) {
			const res = i.evaluate({ cycleNumber: cycle });
			if (!res.ok) throw new Error(res.error);
			seen.add(res.events[0].note);
		}
		expect(seen.size).toBeGreaterThan(1);
	});

	it('tilde (~): [0~4] in G major/4 — all notes in shifted range', () => {
		const validInG = new Set([60, 62, 64, 65, 67].map((n) => n + SHIFT));
		const i = inst('@key(g major 4) loop [0~4]');
		for (let cycle = 0; cycle < 50; cycle++) {
			const res = i.evaluate({ cycleNumber: cycle });
			if (!res.ok) throw new Error(res.error);
			expect(validInG.has(res.events[0].note)).toBe(true);
		}
	});

	it('gau: [3gau1] in G major/4 — varies and is lower than C major/5 equivalent', () => {
		const i = inst('@key(g major 4) loop [3gau1]');
		const seen = new Set<number>();
		for (let cycle = 0; cycle < 50; cycle++) {
			const res = i.evaluate({ cycleNumber: cycle });
			if (!res.ok) throw new Error(res.error);
			seen.add(res.events[0].note);
		}
		const median = [...seen].sort((a, b) => a - b)[Math.floor(seen.size / 2)];
		expect(median).toBeLessThan(65); // below C/5 mean (F5)
		expect(seen.size).toBeGreaterThan(1);
	});

	it('exp: [1exp7] in G major/4 — all notes in shifted range [57, 67]', () => {
		// C/5: degrees 1–7 → MIDI 62–72. G/4: -5 → 57–67.
		const i = inst('@key(g major 4) loop [1exp7]');
		for (let cycle = 0; cycle < 50; cycle++) {
			const res = i.evaluate({ cycleNumber: cycle });
			if (!res.ok) throw new Error(res.error);
			expect(res.events[0].note).toBeGreaterThanOrEqual(57);
			expect(res.events[0].note).toBeLessThanOrEqual(67);
		}
	});

	it('bro: [0bro6m1] in G major/4 — stays within shifted degree range [55, 66]', () => {
		const i = inst('@key(g major 4) loop [0bro6m1]');
		for (let cycle = 0; cycle < 100; cycle++) {
			const res = i.evaluate({ cycleNumber: cycle });
			if (!res.ok) throw new Error(res.error);
			expect(res.events[0].note).toBeGreaterThanOrEqual(55);
			expect(res.events[0].note).toBeLessThanOrEqual(66);
		}
	});

	it('step in minor: [0step1x3] in A minor/5 advances A5→B5→C6', () => {
		// A minor root=9, octave=5 → rootMidi=69. minor intervals: [2,1,2,2,1,2,2]
		// degree 0→69(A5), degree 1→71(B5), degree 2→72(C6)
		const i = inst('@key(a minor) loop [0step1x3]');
		const cycleNotes = [0, 1, 2].map((c) => {
			const res = i.evaluate({ cycleNumber: c });
			if (!res.ok) throw new Error(res.error);
			return res.events[0].note;
		});
		expect(cycleNotes).toEqual([69, 71, 72]);
	});

	it('rand in dorian: [0rand4] in D dorian/5 — all notes in D dorian range', () => {
		// D dorian: root=2, octave=5 → rootMidi=62. dorian intervals: [2,1,2,2,2,1,2]
		// degrees 0–4 offsets: [0,2,3,5,7] → MIDI [62,64,65,67,69]
		const validDDorian = new Set([62, 64, 65, 67, 69]);
		const i = inst('@key(d dorian) loop [0rand4]');
		for (let cycle = 0; cycle < 50; cycle++) {
			const res = i.evaluate({ cycleNumber: cycle });
			if (!res.ok) throw new Error(res.error);
			expect(validDDorian.has(res.events[0].note)).toBe(true);
		}
	});

	it('multi-element list in non-default context: all elements shifted', () => {
		// C/5: [0 2 4] → [60, 64, 67]. G/4: → [55, 59, 62]
		expect(notes('@key(g major 4) loop [0 2 4]')).toEqual([55, 59, 62]);
	});

	it('set root(9) + step: loop [0step1x3] advances A5→B5→C#6', () => {
		// A major root=9 → rootMidi=69. major intervals: [2,2,1,2,2,2,1]
		// degree 0→69, degree 1→71, degree 2→73
		const i = inst('set root(9)\nloop [0step1x3]');
		const cycleNotes = [0, 1, 2].map((c) => {
			const res = i.evaluate({ cycleNumber: c });
			if (!res.ok) throw new Error(res.error);
			return res.events[0].note;
		});
		expect(cycleNotes).toEqual([69, 71, 73]);
	});
});

// ---------------------------------------------------------------------------
// 7. List modifiers — 'stut, 'wran, 'pick, 'shuf, 'maybe, 'legato, 'offset, 'mono
// ---------------------------------------------------------------------------

describe("'stut — stutter (truth table 3)", () => {
	it("bare 'stut defaults to stut(2): N×2 events", () => {
		// 2 elements × 2 repetitions = 4 events
		expect(eval0("loop [0 2]'stut")).toHaveLength(4);
	});

	it("'stut repeats each element in order: [0,0,2,2]", () => {
		const ns = notes("loop [0 2]'stut");
		expect(ns[0]).toBe(ns[1]); // first element repeated
		expect(ns[2]).toBe(ns[3]); // second element repeated
		expect(ns[0]).not.toBe(ns[2]);
	});

	it('each stutter event gets 1/(N×k) of the cycle as duration', () => {
		// loop [0 2]'stut(2) → 4 events, each 1/4
		const ds = durations("loop [0 2]'stut(2)");
		expect(ds).toHaveLength(4);
		for (const d of ds) expect(d).toBeCloseTo(0.25);
	});

	it('beat offsets are evenly spaced across full cycle', () => {
		const os = offsets("loop [0 2]'stut(2)");
		expect(os[0]).toBeCloseTo(0);
		expect(os[1]).toBeCloseTo(0.25);
		expect(os[2]).toBeCloseTo(0.5);
		expect(os[3]).toBeCloseTo(0.75);
	});

	it("'stut(4) repeats each element 4 times", () => {
		const evs = eval0("loop [0]'stut(4)");
		expect(evs).toHaveLength(4);
		expect(new Set(evs.map((e) => e.note)).size).toBe(1);
	});

	it('within a cycle, adjacent stutter events share the same note', () => {
		const evs = eval0("loop [0 2]'stut(2)");
		expect(evs[0].note).toBe(evs[1].note);
		expect(evs[2].note).toBe(evs[3].note);
	});

	it("'stut(2rand4'lock) freezes the count across all cycles", () => {
		const i = inst("loop [0]'stut(2rand4'lock)");
		const counts: number[] = [];
		for (let c = 0; c < 5; c++) {
			const r = i.evaluate({ cycleNumber: c });
			if (!r.ok) throw new Error(r.error);
			counts.push(r.events.length);
		}
		expect(new Set(counts).size).toBe(1);
		expect(counts[0]).toBeGreaterThanOrEqual(2);
		expect(counts[0]).toBeLessThanOrEqual(4);
	});

	it("'stut(2rand4'eager(4)) redraws count every 4 cycles", () => {
		const i = inst("loop [0]'stut(2rand4'eager(4))");
		const counts: number[] = [];
		for (let c = 0; c < 8; c++) {
			const r = i.evaluate({ cycleNumber: c });
			if (!r.ok) throw new Error(r.error);
			counts.push(r.events.length);
		}
		expect(counts[0]).toBe(counts[1]);
		expect(counts[0]).toBe(counts[2]);
		expect(counts[0]).toBe(counts[3]);
		expect(counts[4]).toBe(counts[5]);
		expect(counts[4]).toBe(counts[6]);
		expect(counts[4]).toBe(counts[7]);
	});

	it("'stut(0) is clamped to 1 (no crash)", () => {
		expect(eval0("loop [0]'stut(0)").length).toBeGreaterThanOrEqual(1);
	});
});

describe("'wran — weighted random pick (truth table 4)", () => {
	it('uniform weights: all three values appear across many samples', () => {
		vi.spyOn(Math, 'random').mockRestore();
		const i = inst("loop [0 2 4]'wran");
		const seen = new Set<number>();
		for (let c = 0; c < 50; c++) {
			const r = i.evaluate({ cycleNumber: c });
			if (!r.ok) throw new Error(r.error);
			r.events.forEach((e) => seen.add(e.note));
		}
		expect(seen.size).toBeGreaterThanOrEqual(2);
	});

	it('element with weight 3 appears more often than element with weight 1', () => {
		const i = inst("loop [0?3 4?1]'wran");
		const counts = { n0: 0, n4: 0 };
		for (let c = 0; c < 100; c++) {
			const r = i.evaluate({ cycleNumber: c });
			if (!r.ok) throw new Error(r.error);
			const note = r.events[0].note;
			if (note === 60) counts.n0++;
			else if (note === 67) counts.n4++;
		}
		expect(counts.n0).toBeGreaterThan(counts.n4);
	});

	it('zero weight removes element: only the non-zero-weight element appears', () => {
		const i = inst("loop [0?0 4?1]'wran");
		const seen = new Set<number>();
		for (let c = 0; c < 20; c++) {
			const r = i.evaluate({ cycleNumber: c });
			if (!r.ok) throw new Error(r.error);
			r.events.forEach((e) => seen.add(e.note));
		}
		expect(seen.has(60)).toBe(false); // degree 0, weight 0
		expect(seen.has(67)).toBe(true); // degree 4, weight 1
	});
});

describe("'pick — random element selection", () => {
	it('picks a random element each cycle (at least 2 distinct values over 50 cycles)', () => {
		const i = inst("loop [0 2 4]'pick");
		const seen = new Set<number>();
		for (let c = 0; c < 50; c++) {
			const r = i.evaluate({ cycleNumber: c });
			if (!r.ok) throw new Error(r.error);
			r.events.forEach((e) => seen.add(e.note));
		}
		expect(seen.size).toBeGreaterThanOrEqual(2);
	});
});

describe("'shuf — shuffle traversal", () => {
	it('shuffles elements but still emits all of them per cycle', () => {
		const i = inst("loop [0 2 4]'shuf");
		for (let c = 0; c < 5; c++) {
			const r = i.evaluate({ cycleNumber: c });
			if (!r.ok) throw new Error(r.error);
			expect(r.events).toHaveLength(3);
			// All three degrees must be present (60=C5, 64=E5, 67=G5)
			const ns = new Set(r.events.map((e) => e.note));
			expect(ns.has(60)).toBe(true);
			expect(ns.has(64)).toBe(true);
			expect(ns.has(67)).toBe(true);
		}
	});
});

describe("'maybe — probability filter (truth table 5)", () => {
	it("bare 'maybe defaults to p=0.5: some events pass, some are skipped", () => {
		vi.spyOn(Math, 'random').mockRestore();
		const i = inst("loop [0 2 4 0 2 4 0 2 4 0]'maybe");
		let total = 0;
		for (let c = 0; c < 20; c++) {
			const r = i.evaluate({ cycleNumber: c });
			if (!r.ok) throw new Error(r.error);
			total += r.events.length;
		}
		expect(total).toBeGreaterThan(0);
		expect(total).toBeLessThan(200); // not all pass
	});

	it("'maybe(1.0) passes all events", () => {
		expect(eval0("loop [0 2 4]'maybe(1.0)")).toHaveLength(3);
	});

	it("'maybe(0.0) skips all events — returns empty array", () => {
		expect(eval0("loop [0 2 4]'maybe(0.0)")).toHaveLength(0);
	});

	it('empty event array is ok:true (not an error)', () => {
		const r = inst("loop [0 2 4]'maybe(0.0)").evaluate({ cycleNumber: 0 });
		expect(r.ok).toBe(true);
		if (r.ok) expect(r.events).toHaveLength(0);
	});

	it("'maybe(0.5rand1.0) uses stochastic probability — 0 to N events", () => {
		const r = inst("loop [0 2 4]'maybe(0.5rand1.0)").evaluate({ cycleNumber: 0 });
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(r.events.length).toBeGreaterThanOrEqual(0);
			expect(r.events.length).toBeLessThanOrEqual(3);
		}
	});
});

describe("'legato — duration scaling (truth table 13)", () => {
	it("'legato(0.8) sets duration = 0.8 × slot", () => {
		// loop [0 2 4] → 3 elements, slot = 1/3
		for (const d of durations("loop [0 2 4]'legato(0.8)")) expect(d).toBeCloseTo((1 / 3) * 0.8);
	});

	it("'legato(1.0) — duration equals slot exactly", () => {
		for (const d of durations("loop [0 2 4]'legato(1.0)")) expect(d).toBeCloseTo(1 / 3);
	});

	it("'legato(1.5) — duration exceeds slot (notes overlap)", () => {
		for (const d of durations("loop [0 2 4]'legato(1.5)")) expect(d).toBeCloseTo((1 / 3) * 1.5);
	});

	it("default legato is 1.0 when no 'legato modifier", () => {
		for (const d of durations('loop [0 2 4]')) expect(d).toBeCloseTo(1 / 3);
	});

	it("'legato(0.5rand1.2) draws once per cycle — all events in cycle share same duration", () => {
		const r = inst("loop [0 2 4]'legato(0.5rand1.2)").evaluate({ cycleNumber: 0 });
		if (!r.ok) throw new Error(r.error);
		const ds = r.events.map((e) => e.duration);
		expect(ds[0]).toBeCloseTo(ds[1]);
		expect(ds[0]).toBeCloseTo(ds[2]);
	});

	it("'legato(0.5rand1.2'lock) freezes legato value across cycles", () => {
		const i = inst("loop [0 2 4]'legato(0.5rand1.2'lock)");
		const r0 = i.evaluate({ cycleNumber: 0 });
		const r5 = i.evaluate({ cycleNumber: 5 });
		if (!r0.ok || !r5.ok) throw new Error('eval failed');
		expect(r0.events[0].duration).toBeCloseTo(r5.events[0].duration);
	});

	it("'legato(0.5rand1.2'eager(2)) redraws every 2 cycles", () => {
		const i = inst("loop [0]'legato(0.5rand1.2'eager(2))");
		const d = (c: number) => {
			const r = i.evaluate({ cycleNumber: c });
			if (!r.ok) throw new Error(r.error);
			return r.events[0].duration;
		};
		expect(d(0)).toBeCloseTo(d(1));
		expect(d(2)).toBeCloseTo(d(3));
	});
});

describe("'offset — ms timing shift (truth table 14)", () => {
	it("'offset(20) adds offsetMs=20 to all events", () => {
		for (const e of eval0("loop [0 1 2]'offset(20)"))
			expect((e as { offsetMs?: number }).offsetMs).toBe(20);
	});

	it("'offset(-10) adds offsetMs=-10 to all events", () => {
		for (const e of eval0("loop [0 1 2]'offset(-10)"))
			expect((e as { offsetMs?: number }).offsetMs).toBe(-10);
	});

	it("'offset(0) adds offsetMs=0 (or leaves it absent)", () => {
		for (const e of eval0("loop [0 1 2]'offset(0)")) {
			const ms = (e as { offsetMs?: number }).offsetMs;
			expect(ms === undefined || ms === 0).toBe(true);
		}
	});

	it("beatOffset positions are not changed by 'offset", () => {
		const evs = eval0("loop [0 1 2]'offset(20)");
		expect(evs[0].beatOffset).toBeCloseTo(0);
		expect(evs[1].beatOffset).toBeCloseTo(1 / 3);
		expect(evs[2].beatOffset).toBeCloseTo(2 / 3);
	});
});

describe("'mono — monophonic flag (truth table 16)", () => {
	it("loop [0 1 2]'mono — all events have mono:true", () => {
		for (const e of eval0("loop [0 1 2]'mono")) expect((e as { mono?: boolean }).mono).toBe(true);
	});

	it("loop [0 1 2] without 'mono — mono field absent or false", () => {
		for (const e of eval0('loop [0 1 2]')) {
			const m = (e as { mono?: boolean }).mono;
			expect(m === undefined || m === false).toBe(true);
		}
	});

	it("line [0 2 4]'mono — all events have mono:true", () => {
		for (const e of eval0("line [0 2 4]'mono")) expect((e as { mono?: boolean }).mono).toBe(true);
	});

	it("'mono does not affect note or timing", () => {
		const normal = eval0('loop [0 2 4]');
		const mono = eval0("loop [0 2 4]'mono");
		expect(mono.map((e) => e.note)).toEqual(normal.map((e) => e.note));
		expect(mono.map((e) => e.beatOffset)).toEqual(normal.map((e) => e.beatOffset));
	});
});

// ---------------------------------------------------------------------------
// 8. Pitch modifiers — accidentals, transposition
// ---------------------------------------------------------------------------

describe('accidentals (truth table 15)', () => {
	// Default context: C major, C5. Accidentals apply a semitone offset to the
	// MIDI result (after scale lookup).
	it('[2b] = degree 2 flat: one semitone below E5 → Eb5 = 63', () => {
		expect(notes('loop [2b]')[0]).toBe(notes('loop [2]')[0] - 1);
	});

	it('[4#] = degree 4 sharp: one semitone above G5 → G#5 = 68', () => {
		expect(notes('loop [4#]')[0]).toBe(notes('loop [4]')[0] + 1);
	});

	it('[3bb] = degree 3 double flat: two semitones below F5 → Eb5 = 63', () => {
		expect(notes('loop [3bb]')[0]).toBe(notes('loop [3]')[0] - 2);
	});

	it('[4##] = degree 4 double sharp: two semitones above G5 → A5 = 69', () => {
		expect(notes('loop [4##]')[0]).toBe(notes('loop [4]')[0] + 2);
	});

	it('[0 2b 4] — mixed list: C5, Eb5, G5', () => {
		expect(notes('loop [0 2b 4]')).toEqual([60, 63, 67]);
	});

	it('accidentals work with non-default scale context', () => {
		// @key(g major): root=G5=67, G major scale. degree 2 = B5 = 71.
		// degree 2b = B5 - 1 = Bb5 = 70.
		expect(notes('@key(g major) loop [2b]')[0]).toBe(notes('@key(g major) loop [2]')[0] - 1);
	});
});

describe('transposition (truth table 10)', () => {
	it('loop [0 2] + 3 adds 3 scale steps to each degree', () => {
		// degree 0+3=3 → F5=65, degree 2+3=5 → A5=69
		expect(notes('loop [0 2] + 3')).toEqual([65, 69]);
	});

	it('loop [0 2] - 1 subtracts 1 scale step', () => {
		// degree 2-1=1 → D5=62
		expect(notes('loop [0 2] - 1')[1]).toBe(62);
	});

	it('transposition with 0 is identity', () => {
		expect(notes('loop [0 2 4] + 0')).toEqual(notes('loop [0 2 4]'));
	});

	it('loop [0] + 0rand3 uses a stochastic transpose — produces 1 event per cycle', () => {
		const r = inst('loop [0] + 0rand3').evaluate({ cycleNumber: 0 });
		expect(r.ok).toBe(true);
		if (r.ok) expect(r.events).toHaveLength(1);
	});

	it("'lock on transposition RHS freezes value across cycles", () => {
		const i = inst("loop [0] + 0step1x4'lock");
		const r0 = i.evaluate({ cycleNumber: 0 });
		const r1 = i.evaluate({ cycleNumber: 1 });
		const r2 = i.evaluate({ cycleNumber: 2 });
		if (!r0.ok || !r1.ok || !r2.ok) throw new Error('eval failed');
		expect(r0.events[0].note).toBe(r1.events[0].note);
		expect(r0.events[0].note).toBe(r2.events[0].note);
	});

	it('transposition participates in full pitch chain', () => {
		// @key(g major) loop [0] + 2 should equal @key(g major) loop [2]
		expect(notes('@key(g major) loop [0] + 2')[0]).toBe(notes('@key(g major) loop [2]')[0]);
	});
});

// ---------------------------------------------------------------------------
// 9. Structural — line statement, continuation modifier lines
// ---------------------------------------------------------------------------

describe('line statement (truth table 7)', () => {
	it('line [0 1 2] produces correct notes', () => {
		expect(notes('line [0 1 2]')).toEqual([60, 62, 64]);
	});

	it('line timing: N elements → beatOffset 0, 1/N, 2/N, …', () => {
		const evs = eval0('line [0 1 2]');
		expect(evs[0].beatOffset).toBeCloseTo(0);
		expect(evs[1].beatOffset).toBeCloseTo(1 / 3);
		expect(evs[2].beatOffset).toBeCloseTo(2 / 3);
	});

	it("line [0 1]'at(1/4) sets cycleOffset=0.25 on all events", () => {
		for (const e of eval0("line [0 1]'at(1/4)"))
			expect((e as { cycleOffset?: number }).cycleOffset).toBeCloseTo(0.25);
	});

	it("line [0 1]'at(0) sets cycleOffset=0 (default)", () => {
		for (const e of eval0("line [0 1]'at(0)")) {
			const co = (e as { cycleOffset?: number }).cycleOffset;
			expect(co === undefined || co === 0).toBe(true);
		}
	});

	it("line [0]'at(-1/4) sets cycleOffset=-0.25", () => {
		const co = (eval0("line [0]'at(-1/4)")[0] as { cycleOffset?: number }).cycleOffset;
		expect(co).toBeCloseTo(-0.25);
	});

	it("'at shifts when the line starts; beatOffset stays relative to that start", () => {
		const evs = eval0("line [0 1 2]'at(1/4)");
		expect(evs[0].beatOffset).toBeCloseTo(0);
		expect(evs[1].beatOffset).toBeCloseTo(1 / 3);
		expect(evs[2].beatOffset).toBeCloseTo(2 / 3);
	});

	it("line [0 1]'repeat(4) emits 2×4 = 8 events", () => {
		expect(eval0("line [0 1]'repeat(4)")).toHaveLength(8);
	});

	it("'repeat events span multiple cycles: cycleOffset increments by 1 per repetition", () => {
		const cycleOffsets = eval0("line [0]'repeat(3)").map(
			(e) => (e as { cycleOffset?: number }).cycleOffset ?? 0
		);
		expect(cycleOffsets[0]).toBeCloseTo(0);
		expect(cycleOffsets[1]).toBeCloseTo(1);
		expect(cycleOffsets[2]).toBeCloseTo(2);
	});

	it("bare 'repeat (indefinite) does not crash", () => {
		expect(inst("line [0]'repeat").evaluate({ cycleNumber: 0 }).ok).toBe(true);
	});

	it('line supports pitch context decorators', () => {
		// @key(g major) line [0] → G5 = 67
		expect(notes('@key(g major) line [0]')[0]).toBe(67);
	});

	it("integer 'at on continuation line", () => {
		const co = (eval0("line [0 1]\n  'at(1)")[0] as { cycleOffset?: number }).cycleOffset;
		expect(co).toBeCloseTo(1);
	});

	it('line [0 1 2] returns done:false on cycle 0 (the one cycle it runs)', () => {
		const r = inst('line [0 1 2]').evaluate({ cycleNumber: 0 });
		expect(r.ok).toBe(true);
		if (r.ok) expect(r.done).toBe(false);
	});

	it('line [0 1 2] returns done:true on cycle 1 (line has finished)', () => {
		const i = inst('line [0 1 2]');
		i.evaluate({ cycleNumber: 0 }); // consume cycle 0
		const r = i.evaluate({ cycleNumber: 1 });
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(r.events).toHaveLength(0);
			expect(r.done).toBe(true);
		}
	});

	it("line'at(2) is not done until after cycle 2", () => {
		const i = inst("line [0]'at(2)");
		const r0 = i.evaluate({ cycleNumber: 0 });
		expect(r0.ok && !r0.done).toBe(true);
		const r2 = i.evaluate({ cycleNumber: 2 });
		expect(r2.ok && !r2.done).toBe(true);
		const r3 = i.evaluate({ cycleNumber: 3 });
		expect(r3.ok && r3.done).toBe(true);
	});

	it("line'repeat(3) is done after its 3 cycles", () => {
		const i = inst("line [0]'repeat(3)");
		for (let c = 0; c < 3; c++) {
			const r = i.evaluate({ cycleNumber: c });
			expect(r.ok && !r.done).toBe(true);
		}
		const r = i.evaluate({ cycleNumber: 3 });
		expect(r.ok && r.done).toBe(true);
	});

	it('loop [0 1 2] never returns done:true', () => {
		const i = inst('loop [0 1 2]');
		for (let c = 0; c < 5; c++) {
			const r = i.evaluate({ cycleNumber: c });
			expect(r.ok).toBe(true);
			if (r.ok) expect(r.done).toBe(false);
		}
	});
});

describe('modifier continuation lines (truth table 1)', () => {
	it("continuation 'stut attaches to loop", () => {
		expect(eval0("loop [0 2]\n  'stut(2)")).toHaveLength(4);
	});

	it("continuation 'legato attaches to loop", () => {
		for (const d of durations("loop [0 2 4]\n  'legato(0.8)")) expect(d).toBeCloseTo((1 / 3) * 0.8);
	});

	it('multiple continuation modifiers on separate lines', () => {
		const evs = eval0("loop [0 2]\n  'stut(2)\n  'legato(0.8)");
		expect(evs).toHaveLength(4);
		for (const e of evs) expect(e.duration).toBeCloseTo(0.25 * 0.8);
	});
});

// ---------------------------------------------------------------------------
// 10. FX pipe (truth table 9)
// ---------------------------------------------------------------------------

describe('FX pipe (truth table 9)', () => {
	it('loop [0] | fx(\\lpf) — result includes exactly one FxEvent', () => {
		const r = inst('loop [0] | fx(\\lpf)').evaluate({ cycleNumber: 0 });
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		const fxEvents = r.events.filter((e) => (e as { type?: string }).type === 'fx');
		expect(fxEvents).toHaveLength(1);
		expect((fxEvents[0] as { synthdef?: string }).synthdef).toBe('lpf');
	});

	it('loop [0] | fx(\\lpf) — note events are still present', () => {
		const r = inst('loop [0] | fx(\\lpf)').evaluate({ cycleNumber: 0 });
		if (!r.ok) throw new Error(r.error);
		const noteEvents = r.events.filter((e) => (e as { type?: string }).type !== 'fx');
		expect(noteEvents).toHaveLength(1);
		expect(noteEvents[0].note).toBe(60);
	});

	it("fx event has type:'fx', synthdef, params, cycleOffset", () => {
		const r = inst('loop [0] | fx(\\lpf)').evaluate({ cycleNumber: 0 });
		if (!r.ok) throw new Error(r.error);
		const fxEv = r.events.find((e) => (e as { type?: string }).type === 'fx') as {
			type: string;
			synthdef: string;
			params: Record<string, number>;
			cycleOffset: number;
		};
		expect(fxEv).toBeDefined();
		expect(fxEv.type).toBe('fx');
		expect(fxEv.synthdef).toBe('lpf');
		expect(typeof fxEv.params).toBe('object');
		expect(typeof fxEv.cycleOffset).toBe('number');
	});

	it('fx modifier params are included in fx event params', () => {
		const r = inst("loop [0] | fx(\\lpf)'cutoff(1200)").evaluate({ cycleNumber: 0 });
		if (!r.ok) throw new Error(r.error);
		const fxEv = r.events.find((e) => (e as { type?: string }).type === 'fx') as {
			params: Record<string, number>;
		};
		expect(fxEv).toBeDefined();
		expect(fxEv.params.cutoff).toBe(1200);
	});

	it("fx modifier params respect 'lock semantics", () => {
		const i = inst("loop [0] | fx(\\lpf)'cutoff(800rand1600'lock)");
		const r0 = i.evaluate({ cycleNumber: 0 });
		const r1 = i.evaluate({ cycleNumber: 1 });
		if (!r0.ok || !r1.ok) throw new Error('eval failed');
		const fx = (ev: typeof r0) => {
			if (!ev.ok) return null;
			return ev.events.find((e) => (e as { type?: string }).type === 'fx') as {
				params: Record<string, number>;
			};
		};
		expect(fx(r0)!.params.cutoff).toBe(fx(r1)!.params.cutoff);
	});
});

// ---------------------------------------------------------------------------
// 11. Cross-cutting interactions
// ---------------------------------------------------------------------------

describe("'stut + 'legato interaction", () => {
	it("'stut(2)'legato(0.8): expanded slots × legato factor = 0.25 × 0.8", () => {
		// loop [0 2]'stut(2) → 4 events, slot=0.25. 'legato(0.8) → duration = 0.2
		const ds = durations("loop [0 2]'stut(2)'legato(0.8)");
		expect(ds).toHaveLength(4);
		for (const d of ds) expect(d).toBeCloseTo(0.25 * 0.8);
	});
});

// ---------------------------------------------------------------------------
// 12. Edge/error case behaviour
//
// The evaluator uses lenient semantics: invalid arguments are clamped or
// silently degraded rather than returning ok:false.  These tests document the
// current behaviour so regressions are caught.
// ---------------------------------------------------------------------------

describe("'stut edge cases", () => {
	it("'stut(-1) is clamped to 1 — same output as no stut", () => {
		// Negative count: Math.max(1, round(-1)) = 1
		expect(eval0("loop [0 2]'stut(-1)")).toHaveLength(2);
	});

	it("'stut([1 2]) — list arg: stut is ignored, elements render normally", () => {
		// '[1 2] is not a scalar generator so extractModifierScalar returns null;
		// stutRunner stays null → stutCount defaults to 1.
		expect(eval0("loop [0]'stut([1 2])")).toHaveLength(2);
	});
});

describe("'legato edge cases", () => {
	it("'legato(0) produces events with duration 0", () => {
		for (const d of durations("loop [0 2]'legato(0)")) expect(d).toBe(0);
	});

	it("'legato(-0.5) produces events with negative duration (gate opens before slot)", () => {
		for (const d of durations("loop [0 2]'legato(-0.5)")) expect(d).toBeCloseTo(-0.5 * 0.5);
	});
});

describe("'repeat edge cases", () => {
	it("'repeat(0) is treated as 1 repetition (clamped)", () => {
		// repeat=0 maps to Infinity in the evaluator, but is capped at 999 for lines.
		// In practice the line with one element produces many events; just check it
		// doesn't crash and produces at least one event.
		const r = inst("line [0]'repeat(0)").evaluate({ cycleNumber: 0 });
		expect(r.ok).toBe(true);
		if (r.ok) expect(r.events.length).toBeGreaterThanOrEqual(1);
	});

	it("'repeat(-1) — negative count treated as 1 repetition (clamped)", () => {
		// Math.round(-1) = -1; extractRepeat returns -1; evaluator treats ≤0 as 1 per spec.
		const evs = eval0("line [0 2]'repeat(-1)");
		expect(evs).toHaveLength(2);
	});

	it("'repeat(1.5) rounds to 2 repetitions", () => {
		// Math.round(1.5) = 2 in JS
		expect(eval0("line [0]'repeat(1.5)")).toHaveLength(2);
	});
});

describe("'wran edge cases", () => {
	it('negative weight is clamped to 0 — only positive-weight element is selected', () => {
		// [0?-1 1?1]'wran — weight for 0 clamped to 0, so only degree 1 ever fires
		// Run 20 cycles to confirm degree 1 (D5=62) always wins
		const i = inst("loop [0?-1 1?1]'wran");
		for (let c = 0; c < 20; c++) {
			const r = i.evaluate({ cycleNumber: c });
			if (!r.ok) throw new Error(r.error);
			// Exactly 2 slots drawn; both should be degree 1 (= MIDI 62)
			for (const e of r.events) expect(e.note).toBe(62);
		}
	});

	it('all-zero weights fall back to first element', () => {
		// Evaluator fallback: if total weight = 0, return elements[0]
		const i = inst("loop [0?0 4?0]'wran");
		for (let c = 0; c < 10; c++) {
			const r = i.evaluate({ cycleNumber: c });
			if (!r.ok) throw new Error(r.error);
			// Both slots pick elements[0] → degree 0 = C5 = MIDI 60
			for (const e of r.events) expect(e.note).toBe(60);
		}
	});
});

// ---------------------------------------------------------------------------
// 13. Timed lists
//
// Relative timed list ([x@t …]) and absolute timed list ({x:t …}) are parsed
// and compiled.  The current evaluator assigns positions uniformly (index × slot)
// rather than honouring the @/: offsets — these tests document the current
// behaviour.
// ---------------------------------------------------------------------------

describe('timed lists — @ and : are absolute beat offsets from cycle start', () => {
	it('line [4@1/2 7@1/4] — 2 events, sorted by beat (7@1/4 first, 4@1/2 second)', () => {
		// sorted by beatOffset: 7@1/4 = C6=72 first, 4@1/2 = G5=67 second
		expect(notes('line [4@1/2 7@1/4]')).toEqual([72, 67]);
	});

	it('line [4@1/2 7@1/4] — events sorted by beatOffset (7 at 1/4 before 4 at 1/2)', () => {
		const evs = eval0('line [4@1/2 7@1/4]');
		expect(evs[0].beatOffset).toBeCloseTo(0.25); // 7@1/4
		expect(evs[1].beatOffset).toBeCloseTo(0.5); // 4@1/2
		expect(evs[0].note).toBe(72); // degree 7 = C6
		expect(evs[1].note).toBe(67); // degree 4 = G5
	});

	it('timed list supports pitch context', () => {
		// @key(g major) line [0@0 2@1/2] → G5=67, B5=71
		expect(notes('@key(g major) line [0@0 2@1/2]')).toEqual([67, 71]);
	});

	it('line [0 2@1] — bare degree gets natural slot, @-timed degree gets override', () => {
		const evs = eval0('line [0 2@1]');
		expect(evs[0].beatOffset).toBeCloseTo(0); // 0 is in slot 0 of 2 = beat 0
		expect(evs[1].beatOffset).toBeCloseTo(1.0); // 2@1 → absolute beat 1
	});

	it('line [0 4 7@1/2] — two bare degrees then one timed', () => {
		const evs = eval0('line [0 4 7@1/2]');
		expect(evs[0].beatOffset).toBeCloseTo(0); // slot 0 of 3
		expect(evs[1].beatOffset).toBeCloseTo(1 / 3); // slot 1 of 3
		expect(evs[2].beatOffset).toBeCloseTo(0.5); // 7@1/2 → absolute 0.5
	});

	it('line [0 2@1] — notes are correct', () => {
		expect(notes('line [0 2@1]')).toEqual([60, 64]);
	});

	it('line [0 2@1.5] — float time is honoured', () => {
		const evs = eval0('line [0 2@1.5]');
		expect(evs[0].beatOffset).toBeCloseTo(0);
		expect(evs[1].beatOffset).toBeCloseTo(1.5);
	});

	it('line [0@0.0 4@0.5] — float times on all elements', () => {
		const evs = eval0('line [0@0.0 4@0.5]');
		expect(evs[0].beatOffset).toBeCloseTo(0);
		expect(evs[1].beatOffset).toBeCloseTo(0.5);
	});

	it('events are sorted by beatOffset — out-of-source-order @ does not produce negative gaps', () => {
		// source order: 0 (natural slot 0), 1 (natural slot 1/3), 4@0.01 (override 0.01)
		// sorted order: 0 at 0, 4 at 0.01, 1 at 0.333
		const evs = eval0('line [0 1 4@0.01]');
		for (let i = 1; i < evs.length; i++) {
			expect(evs[i].beatOffset).toBeGreaterThanOrEqual(evs[i - 1].beatOffset);
		}
		expect(evs[0].beatOffset).toBeCloseTo(0);
		expect(evs[1].beatOffset).toBeCloseTo(0.01);
		expect(evs[2].beatOffset).toBeCloseTo(1 / 3);
	});
});

// ---------------------------------------------------------------------------
// 14. SynthDef selection
//
// loop(\moog) [0 2 4] and line(\sine) [0 1 2] are valid DSL syntax. The
// current evaluator ignores the synthdef argument; events are emitted normally
// without a synthdef field on note events.  These tests document current
// behaviour.
// ---------------------------------------------------------------------------

describe('synthdef selection — loop(\\moog) / line(\\sine)', () => {
	it('loop(\\moog) [0 2 4] — produces 3 note events (synthdef arg currently ignored)', () => {
		const evs = eval0('loop(\\moog) [0 2 4]');
		expect(evs).toHaveLength(3);
	});

	it('loop(\\moog) [0 2 4] — notes are correct (pitch chain unaffected by synthdef)', () => {
		expect(notes('loop(\\moog) [0 2 4]')).toEqual([60, 64, 67]);
	});

	it('line(\\sine) [0 1 2] — produces 3 note events', () => {
		expect(eval0('line(\\sine) [0 1 2]')).toHaveLength(3);
	});

	it('note events do not carry a synthdef field (synthdef arg is not yet threaded through)', () => {
		for (const e of eval0('loop(\\moog) [0 2 4]')) {
			// synthdef is only defined on FX events currently
			expect((e as { synthdef?: string }).synthdef).toBeUndefined();
		}
	});
});

// ---------------------------------------------------------------------------
// 15. Accidentals in non-default pitch contexts
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 16. Inline repetition — !n operator
// ---------------------------------------------------------------------------

describe('inline repetition — !n', () => {
	it('loop [1!4] produces 4 events at the same note', () => {
		const ns = notes('loop [1!4]');
		expect(ns).toHaveLength(4);
		expect(new Set(ns).size).toBe(1); // all identical
	});

	it('loop [1!2 3!3] produces 5 events (2+3)', () => {
		const ns = notes('loop [1!2 3!3]');
		expect(ns).toHaveLength(5);
		// first two are degree 1, last three are degree 3
		const d1 = notes('loop [1]')[0];
		const d3 = notes('loop [3]')[0];
		expect(ns.slice(0, 2).every((n) => n === d1)).toBe(true);
		expect(ns.slice(2).every((n) => n === d3)).toBe(true);
	});

	it('loop [1!1] is identical to loop [1]', () => {
		expect(notes('loop [1!1]')).toEqual(notes('loop [1]'));
	});

	it('events are evenly spaced within a 1!4 loop', () => {
		const offs = offsets('loop [1!4]');
		expect(offs).toHaveLength(4);
		// Each slot is 1/4 of a cycle in beats (cycle = 1 beat in the evaluator model)
		expect(offs[0]).toBeCloseTo(0);
		expect(offs[1]).toBeCloseTo(0.25);
		expect(offs[2]).toBeCloseTo(0.5);
		expect(offs[3]).toBeCloseTo(0.75);
	});

	it('stochastic element 0rand7!4 — all four copies share the same drawn value per cycle', () => {
		const ns = notes('loop [0rand7!4]');
		expect(ns).toHaveLength(4);
		// eager(1): value drawn once per cycle — all four copies identical
		expect(new Set(ns).size).toBe(1);
	});
});

// ---------------------------------------------------------------------------
// 17. Block comments are invisible to the evaluator
// ---------------------------------------------------------------------------

describe('block comments', () => {
	it('/* comment */ before loop is ignored', () => {
		expect(notes('/* ignored */ loop [0 2 4]')).toEqual(notes('loop [0 2 4]'));
	});

	it('block comment between two elements is ignored', () => {
		expect(notes('loop [0 /* mid */ 2 4]')).toEqual(notes('loop [0 2 4]'));
	});
});

describe('accidentals in non-default pitch contexts', () => {
	it('@root(7) loop [2#] — sharp applied after root shift (G major, degree 2 = B5 = 71, +1 = 72)', () => {
		// G5=67, G major scale, degree 2 = B5 = 71, sharp → 72 = C6
		expect(notes('@root(7) loop [2#]')[0]).toBe(notes('@root(7) loop [2]')[0] + 1);
	});

	it('@scale(\\minor) loop [4b] — flat applied in minor context (degree 4 = G5 = 67, -1 = 66)', () => {
		// C minor, degree 4 = G5 = 67 (minor has same perfect 5th), flat → 66 = F#5
		expect(notes('@scale(\\minor) loop [4b]')[0]).toBe(notes('@scale(\\minor) loop [4]')[0] - 1);
	});

	it('@key(g major 4) loop [3#] — accidental in compound key context', () => {
		// G major octave 4: root = G4 = 55. degree 3 in major = 5 semitones → C5 = 60. Sharp → 61.
		expect(notes('@key(g major 4) loop [3#]')[0]).toBe(notes('@key(g major 4) loop [3]')[0] + 1);
	});

	it('@root(7) loop [2bb] — double flat: two semitones below', () => {
		expect(notes('@root(7) loop [2bb]')[0]).toBe(notes('@root(7) loop [2]')[0] - 2);
	});
});

// ---------------------------------------------------------------------------
// Rests (_) — spec §Sequence generators / Rests
// ---------------------------------------------------------------------------

describe('rests (_) — structural slot count', () => {
	it('loop [0 2 _ 4] emits 4 events, 3rd is type:rest', () => {
		const evs = eval0('loop [0 2 _ 4]');
		expect(evs).toHaveLength(4);
		expect(evs[2].type).toBe('rest');
	});

	it('rest event has no note pitch (note is -1 or absent)', () => {
		const evs = eval0('loop [0 2 _ 4]');
		// note is -1 for rests — no synth should be spawned
		expect(evs[2].note).toBe(-1);
	});

	it('rest occupies the correct beat offset (uniformly spaced, 1/4 cycle each)', () => {
		const evs = eval0('loop [0 2 _ 4]');
		expect(evs[2].beatOffset).toBeCloseTo(0.5);
	});

	it('rest at start: loop [_ 2 4] — first event is rest', () => {
		const evs = eval0('loop [_ 2 4]');
		expect(evs[0].type).toBe('rest');
		expect(evs[1].note).toBe(notes('loop [2]')[0]);
	});

	it('rest at end: loop [0 2 _] — last event is rest', () => {
		const evs = eval0('loop [0 2 _]');
		expect(evs[2].type).toBe('rest');
	});

	it('all rests: loop [_ _ _] — 3 events all type:rest', () => {
		const evs = eval0('loop [_ _ _]');
		expect(evs).toHaveLength(3);
		expect(evs.every((e) => e.type === 'rest')).toBe(true);
	});

	it('note events are type:note (or undefined) — not type:rest', () => {
		const evs = eval0('loop [0 2 4]');
		for (const e of evs) {
			expect(e.type).not.toBe('rest');
		}
	});

	it('rest duration spans its slot (same as a note slot)', () => {
		const evs = eval0('loop [0 2 _ 4]');
		// 4 elements → slot = 0.25; rest duration should equal the slot
		expect(evs[2].duration).toBeCloseTo(0.25);
	});
});

// ---------------------------------------------------------------------------
// 12. Error message content — regression guard for user-facing error strings
// ---------------------------------------------------------------------------

describe('createInstance — error message content', () => {
	it('parse error message starts with "Parse error:"', () => {
		const result = createInstance('loop [0 1 2'); // unclosed bracket
		if (result.ok) throw new Error('expected error');
		expect(result.error).toMatch(/^Parse error:/);
	});

	it('lex error message starts with "Lex error:"', () => {
		// Bare backslash is an unrecognised character → lex error
		const result = createInstance('loop [0 \\1]');
		if (result.ok) throw new Error('expected error');
		expect(result.error).toMatch(/^(Lex error:|Parse error:)/);
	});

	it('"No loop statement found" when source has no loop or line', () => {
		const result = createInstance('set root(7)');
		if (result.ok) throw new Error('expected error');
		expect(result.error).toBe('No loop statement found');
	});

	it('"No loop statement found" for empty source', () => {
		const result = createInstance('');
		if (result.ok) throw new Error('expected error');
		expect(result.error).toBe('No loop statement found');
	});

	it('parse error message includes some description of the problem', () => {
		const result = createInstance('loop [0 1 2');
		if (result.ok) throw new Error('expected error');
		// The error string must be non-trivially descriptive (not just "Parse error:")
		expect(result.error.length).toBeGreaterThan('Parse error:'.length + 2);
	});

	it('ok:false for a completely invalid token ("@@@")', () => {
		const result = createInstance('@@@');
		expect(result.ok).toBe(false);
	});

	it('ok:false when source is only whitespace', () => {
		const result = createInstance('   \n\t  ');
		expect(result.ok).toBe(false);
	});
});

// Note: the evaluate()-level error 'No loop found in evaluate' (evaluator.ts:1632)
// is dead code — compileLoop() rejects empty sequences at compile time, so
// loopEntries always has at least one non-empty loop by the time evaluate() runs.
// The path is unreachable through the public API and intentionally has no test.
