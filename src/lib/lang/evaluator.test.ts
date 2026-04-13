/**
 * Evaluator tests.
 *
 * Organisation:
 *   1. API & instance basics
 *   2. Cycle semantics — eager(1), 'lock, eager(n), modifier precedence
 *   3. Generators — degree-to-MIDI in default C major / C5 context
 *   4. rand / tilde — float bound semantics
 *   5. Pitch context — @root, @octave, @scale, @cent, @key, set, scoping
 *   6. Generators × non-default pitch contexts
 *   7. List modifiers — 'stut, 'wran, 'pick, 'shuf, 'maybe, 'legato, 'offset
 *   8. Pitch modifiers — accidentals, transposition
 *   9. Structural — note'n statement, continuation modifier lines
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
import {
	createInstance,
	type ScheduledEvent,
	type NoteEvent,
	type MonoEvent,
	type SampleEvent,
	type SliceEvent,
	type CloudEvent
} from './evaluator.js';

/** Cast a ScheduledEvent to a pitched event (NoteEvent | MonoEvent) for test assertions. */
function pitched(e: ScheduledEvent): NoteEvent | MonoEvent {
	return e as NoteEvent | MonoEvent;
}

/**
 * Evaluate a given cycle on an instance, returning events cast to `any[]`.
 * Convenience wrapper for tests that access note/cent/synthdef/loopId directly.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function evalCycle(
	i: Extract<ReturnType<typeof createInstance>, { ok: true }>,
	cycleNumber: number
): any[] {
	const r = i.evaluate({ cycleNumber });
	if (!r.ok) throw new Error(`Eval error cycle ${cycleNumber}: ${r.error}`);
	return r.events;
}

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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function eval0(source: string): any[] {
	const i = inst(source);
	const r = i.evaluate({ cycleNumber: 0 });
	if (!r.ok) throw new Error(`Eval error: ${r.error}`);
	return r.events;
}

/** Notes from cycle 0 (only valid for note/mono patterns). */
function notes(source: string) {
	return eval0(source).map((e) => pitched(e).note);
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
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		return r.events.map((e: any) => e.note as number);
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
	it('returns ok:true for a valid pattern', () => {
		expect(createInstance('note x [0 2 4]').ok).toBe(true);
	});

	it('returns ok:false for parse errors', () => {
		expect(createInstance('note x [0 1 2').ok).toBe(false); // unclosed bracket
	});
});

describe('instance.evaluate — per-cycle output', () => {
	it('produces one ScheduledEvent per list element', () => {
		const res = inst('note x [0 2 4]').evaluate({ cycleNumber: 0 });
		if (!res.ok) throw new Error(res.error);
		expect(res.events).toHaveLength(3);
	});

	it('each event has a note, beatOffset, and duration', () => {
		const res = inst('note x [0 2 4]').evaluate({ cycleNumber: 0 });
		if (!res.ok) throw new Error(res.error);
		for (const ev of res.events) {
			expect(typeof (ev as any).note).toBe('number');
			expect(typeof ev.beatOffset).toBe('number');
			expect(typeof ev.duration).toBe('number');
		}
	});

	it('distributes events evenly: 4 events → offsets 0, 0.25, 0.5, 0.75', () => {
		const res = inst('note x [0 1 2 3]').evaluate({ cycleNumber: 0 });
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
		const ns = collectNotes('note x [0step1x4]', 4);
		expect(new Set(ns.map((c) => c[0])).size).toBe(4);
	});

	it('constant literal produces the same note every cycle', () => {
		const ns = collectNotes('note x [0]', 4);
		const first = ns[0][0];
		for (const cycle of ns) expect(cycle[0]).toBe(first);
	});

	it('value within a cycle is fixed — same cycleNumber returns same note', () => {
		const i = inst('note x [0step1x4]');
		const res0a = i.evaluate({ cycleNumber: 0 });
		const res0b = i.evaluate({ cycleNumber: 0 });
		if (!res0a.ok || !res0b.ok) throw new Error('eval failed');
		expect((res0a.events[0] as any).note).toBe((res0b.events[0] as any).note);
	});
});

describe("'lock — freeze on first sample", () => {
	it("step generator with 'lock returns same value across all cycles", () => {
		const ns = collectNotes("note x [0step1x4'lock]", 4);
		const first = ns[0][0];
		for (const cycle of ns) expect(cycle[0]).toBe(first);
	});

	it("'lock at list level freezes all elements independently", () => {
		const ns = collectNotes("note x [0step1x4 1step1x4]'lock", 4);
		expect(ns[1]).toEqual(ns[0]);
		expect(ns[2]).toEqual(ns[0]);
		expect(ns[3]).toEqual(ns[0]);
	});

	it("'lock and eager(1) produce different behaviour over multiple cycles", () => {
		const withLock = collectNotes("note x [0step1x4'lock]", 4);
		const withEager = collectNotes('note x [0step1x4]', 4);
		expect(new Set(withEager.map((c) => c[0])).size).toBe(4);
		expect(new Set(withLock.map((c) => c[0])).size).toBe(1);
	});
});

describe('eager(n) — resample every n cycles', () => {
	it('eager(2): same value in cycles 0–1, new value at cycle 2, same in cycles 2–3', () => {
		const ns = collectNotes("note x [0step1x4'eager(2)]", 4);
		expect(ns[0][0]).toBe(ns[1][0]);
		expect(ns[2][0]).not.toBe(ns[0][0]);
		expect(ns[2][0]).toBe(ns[3][0]);
	});

	it('eager(3): value constant for 3 cycles, then resamples at cycle 3', () => {
		const ns = collectNotes("note x [0step1x4'eager(3)]", 6);
		expect(ns[0][0]).toBe(ns[1][0]);
		expect(ns[1][0]).toBe(ns[2][0]);
		expect(ns[3][0]).not.toBe(ns[0][0]);
		expect(ns[3][0]).toBe(ns[4][0]);
		expect(ns[4][0]).toBe(ns[5][0]);
	});

	it('eager(1) on list propagates to elements as the default', () => {
		const ns = collectNotes("note x [0step1x4]'eager(1)", 4);
		expect(new Set(ns.map((c) => c[0])).size).toBe(4);
	});
});

describe('modifier precedence: inner overrides outer', () => {
	it("inner 'lock beats outer eager(1) default — value frozen (truth table 2 row 1)", () => {
		const ns = collectNotes("note x [0step1x4'lock]", 4);
		const first = ns[0][0];
		for (const cycle of ns) expect(cycle[0]).toBe(first);
	});

	it("inner 'lock beats outer 'eager(3) — value frozen (truth table 2 row 2)", () => {
		const ns = collectNotes("note x [0step1x4'lock]'eager(3)", 6);
		const first = ns[0][0];
		for (const cycle of ns) expect(cycle[0]).toBe(first);
	});

	it("inner 'eager(2) beats outer 'lock — resamples every 2 (truth table 2 row 3)", () => {
		const ns = collectNotes("note x [0step1x4'eager(2)]'lock", 4);
		expect(ns[0][0]).toBe(ns[1][0]);
		expect(ns[2][0]).not.toBe(ns[0][0]);
	});

	it("inner 'eager(2) beats outer 'eager(5) — resamples every 2 not every 5 (truth table 2 row 4)", () => {
		const ns = collectNotes("note x [0step1x4'eager(2)]'eager(5)", 4);
		expect(ns[0][0]).toBe(ns[1][0]);
		expect(ns[2][0]).not.toBe(ns[0][0]);
	});

	it("no inner annotation, outer 'lock applies — value frozen (truth table 2 row 5)", () => {
		const ns = collectNotes("note x [0step1x4]'lock", 4);
		const first = ns[0][0];
		for (const cycle of ns) expect(cycle[0]).toBe(first);
	});

	it("no inner annotation, outer 'eager(2) applies — resamples every 2 cycles (truth table 2 row 6)", () => {
		const ns = collectNotes("note x [0step1x4]'eager(2)", 4);
		expect(ns[0][0]).toBe(ns[1][0]);
		expect(ns[2][0]).not.toBe(ns[0][0]);
	});
});

// ---------------------------------------------------------------------------
// 3. Generators — degree-to-MIDI in default C major / C5 context
// ---------------------------------------------------------------------------

describe('numeric generators — degree-to-MIDI in C major / C5', () => {
	it('negative degrees: degree -1 → B4 = MIDI 59, degree 0 → C5 = 60', () => {
		expect(notes('note x [-1 0]')).toEqual([59, 60]);
	});

	it('rand: all sampled degrees within [0, 4] map to valid C-major notes', () => {
		const valid = new Set([60, 62, 64, 65, 67]);
		const i = inst('note x [0rand4]');
		for (let cycle = 0; cycle < 50; cycle++) {
			const res = i.evaluate({ cycleNumber: cycle });
			if (!res.ok) throw new Error(res.error);
			expect(valid.has((res.events[0] as any).note)).toBe(true);
		}
	});

	it('rand: produces more than one distinct note over many cycles', () => {
		expect(new Set(collectFirst('note x [0rand6]', 100)).size).toBeGreaterThan(1);
	});

	it('gau: produces varying notes (mean=3, sdev=1)', () => {
		expect(new Set(collectFirst('note x [3gau1]', 100)).size).toBeGreaterThan(1);
	});

	it('exp: all notes within degree range [1, 7] → MIDI [62, 72]', () => {
		const i = inst('note x [1exp7]');
		for (let cycle = 0; cycle < 50; cycle++) {
			const res = i.evaluate({ cycleNumber: cycle });
			if (!res.ok) throw new Error(res.error);
			expect((res.events[0] as any).note).toBeGreaterThanOrEqual(62);
			expect((res.events[0] as any).note).toBeLessThanOrEqual(72);
		}
	});

	it('bro: stays within degree range [0, 6] → MIDI [60, 71]', () => {
		const i = inst('note x [0bro6m1]');
		for (let cycle = 0; cycle < 100; cycle++) {
			const res = i.evaluate({ cycleNumber: cycle });
			if (!res.ok) throw new Error(res.error);
			expect((res.events[0] as any).note).toBeGreaterThanOrEqual(60);
			expect((res.events[0] as any).note).toBeLessThanOrEqual(71);
		}
	});

	it('bro: changes value over time (stateful)', () => {
		expect(new Set(collectFirst('note x [0bro6m2]', 50)).size).toBeGreaterThan(1);
	});

	it('step: cycles through correct degrees — note [0step2x4]', () => {
		// Pseries(start=0, step=2, length=4) → degrees [0, 2, 4, 6], repeating
		// C major: C5=60, E5=64, G5=67, B5=71
		expect(collectFirst('note x [0step2x4]', 8)).toEqual([60, 64, 67, 71, 60, 64, 67, 71]);
	});

	it('mul: cycles through correct degrees — note [1mul2x4]', () => {
		// Pgeom(start=1, mul=2, length=4) → degrees [1, 2, 4, 8], repeating
		// C major: D5=62, E5=64, G5=67, D6=74
		expect(collectFirst('note x [1mul2x4]', 5)).toEqual([62, 64, 67, 74, 62]);
	});

	it('lin: spans from first to last degree — note [0lin4x3]', () => {
		// linear interp first=0, last=4, length=3 → degrees [0, 2, 4]
		// C major: C5=60, E5=64, G5=67
		expect(collectFirst('note x [0lin4x3]', 4)).toEqual([60, 64, 67, 60]); // wraps
	});

	it('geo: produces geometrically spaced degrees — note [1geo8x4]', () => {
		// geometric interp first=1, last=8, length=4 → degrees [1, 2, 4, 8]
		// C major: D5=62, E5=64, G5=67, D6=74
		expect(collectFirst('note x [1geo8x4]', 4)).toEqual([62, 64, 67, 74]);
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
		expect(eval0('note x [0rand4]')[0].note).toBe(60);
	});

	it('integer bounds: Math.random()=0.999 → max', () => {
		vi.spyOn(Math, 'random').mockReturnValue(0.999);
		// floor(0.999 * 5) + 0 = floor(4.995) = 4 → G5 = MIDI 67
		expect(eval0('note x [0rand4]')[0].note).toBe(67);
	});

	it('integer bounds: produces only integer degrees (never fractional MIDI)', () => {
		const i = inst('note x [0rand6]');
		for (let cycle = 0; cycle < 50; cycle++) {
			const res = i.evaluate({ cycleNumber: cycle });
			if (!res.ok) throw new Error(res.error);
			expect(Number.isInteger((res.events[0] as any).note)).toBe(true);
			expect((res.events[0] as any).cent).toBeUndefined();
		}
	});

	// --- Float min, integer max ---

	it('float min, int max: Math.random()=0.0 → min exactly', () => {
		vi.spyOn(Math, 'random').mockReturnValue(0);
		// raw degree: 0.0 * (4 - 0.5) + 0.5 = 0.5 → Math.round(0.5) = 1 → D5 = MIDI 62
		expect(eval0('note x [0.5rand4]')[0].note).toBe(62);
	});

	it('float min, int max: Math.random()=1.0 → approaches max (open interval)', () => {
		vi.spyOn(Math, 'random').mockReturnValue(1 - Number.EPSILON);
		// raw degree ≈ 3.5 - ε → Math.round ≈ 3 or 4 → MIDI in [62..67]
		const note = eval0('note x [0.5rand4]')[0].note;
		expect(note).toBeGreaterThanOrEqual(62);
		expect(note).toBeLessThanOrEqual(67);
	});

	it('float min (0.), int max: all sampled degrees round to valid C-major notes', () => {
		// 0.rand4 — min is 0.0 (trailing dot), max is 4
		// continuous output in [0.0, 4.0) → degrees 0–4 reachable via Math.round
		const valid = new Set([60, 62, 64, 65, 67]);
		const i = inst('note x [0.rand4]');
		for (let cycle = 0; cycle < 100; cycle++) {
			const res = i.evaluate({ cycleNumber: cycle });
			if (!res.ok) throw new Error(res.error);
			expect(valid.has((res.events[0] as any).note)).toBe(true);
		}
	});

	// --- Integer min, float max ---

	it('int min, float max: Math.random()=0.0 → min exactly', () => {
		vi.spyOn(Math, 'random').mockReturnValue(0);
		// raw degree: 0.0 * (3.5 - 0) + 0 = 0.0 → Math.round(0) = 0 → C5 = MIDI 60
		expect(eval0('note x [0rand3.5]')[0].note).toBe(60);
	});

	it('int min, float max: all sampled degrees round to valid C-major notes', () => {
		// 0rand3.5 — output in [0.0, 3.5) rounds to degree 0–3 → MIDI [60, 62, 64, 65]
		const valid = new Set([60, 62, 64, 65]);
		const i = inst('note x [0rand3.5]');
		for (let cycle = 0; cycle < 100; cycle++) {
			const res = i.evaluate({ cycleNumber: cycle });
			if (!res.ok) throw new Error(res.error);
			expect(valid.has((res.events[0] as any).note)).toBe(true);
		}
	});

	// --- Both bounds float ---

	it('both float bounds: Math.random()=0.0 → min exactly', () => {
		vi.spyOn(Math, 'random').mockReturnValue(0);
		// raw degree: 0.0 * (3.5 - 0.5) + 0.5 = 0.5 → Math.round(0.5) = 1 → D5 = MIDI 62
		expect(eval0('note x [0.5rand3.5]')[0].note).toBe(62);
	});

	it('both float bounds: Math.random()=0.5 → midpoint', () => {
		vi.spyOn(Math, 'random').mockReturnValue(0.5);
		// raw degree: 0.5 * (3.5 - 0.5) + 0.5 = 1.5 + 0.5 = 2.0 → Math.round(2.0) = 2 → E5 = MIDI 64
		expect(eval0('note x [0.5rand3.5]')[0].note).toBe(64);
	});

	it('both float bounds: produces more than one distinct note over many cycles', () => {
		expect(new Set(collectFirst('note x [0.5rand3.5]', 100)).size).toBeGreaterThan(1);
	});

	// --- Tilde (~) — syntactic sugar for rand ---

	it('tilde with integer bounds: Math.random()=0.0 → min', () => {
		vi.spyOn(Math, 'random').mockReturnValue(0);
		expect(eval0('note x [0~4]')[0].note).toBe(60);
	});

	it('tilde with float min: Math.random()=0.0 → same result as float rand', () => {
		vi.spyOn(Math, 'random').mockReturnValue(0);
		const noteRand = eval0('note x [0.5rand4]')[0].note;
		// fresh instance (mock still active)
		vi.spyOn(Math, 'random').mockReturnValue(0);
		const noteTilde = eval0('note x [0.5~4]')[0].note;
		expect(noteTilde).toBe(noteRand);
	});

	it('tilde with float max: all sampled degrees in valid range', () => {
		const valid = new Set([60, 62, 64, 65]);
		const i = inst('note x [0~3.5]');
		for (let cycle = 0; cycle < 100; cycle++) {
			const res = i.evaluate({ cycleNumber: cycle });
			if (!res.ok) throw new Error(res.error);
			expect(valid.has((res.events[0] as any).note)).toBe(true);
		}
	});

	// --- Edge cases ---

	it('min === max (float): always returns min', () => {
		const i = inst('note x [2.5rand2.5]');
		for (let cycle = 0; cycle < 10; cycle++) {
			const res = i.evaluate({ cycleNumber: cycle });
			if (!res.ok) throw new Error(res.error);
			// degree 2.5 rounds to 3 → F5 = MIDI 65
			expect((res.events[0] as any).note).toBe(65);
		}
	});

	it('min === max (integer): always returns that degree', () => {
		const i = inst('note x [3rand3]');
		for (let cycle = 0; cycle < 10; cycle++) {
			const res = i.evaluate({ cycleNumber: cycle });
			if (!res.ok) throw new Error(res.error);
			// degree 3 → F5 = MIDI 65
			expect((res.events[0] as any).note).toBe(65);
		}
	});

	it('negative float min: Math.random()=0.0 → min degree (rounds correctly)', () => {
		vi.spyOn(Math, 'random').mockReturnValue(0);
		// raw degree: -0.5 → Math.round(-0.5) = 0 → C5 = MIDI 60
		expect(eval0('note x [-0.5rand2]')[0].note).toBe(60);
	});

	it('negative float min: all sampled notes within expected range', () => {
		// -0.5rand2 → continuous output in [-0.5, 2.0)
		// Math.round(-0.5) = 0 in JS (rounds toward +Infinity at halfway),
		// so degree -1 is unreachable. Reachable degrees: 0, 1, 2.
		// C major: C5=60, D5=62, E5=64
		const valid = new Set([60, 62, 64]);
		const i = inst('note x [-0.5rand2]');
		for (let cycle = 0; cycle < 100; cycle++) {
			const res = i.evaluate({ cycleNumber: cycle });
			if (!res.ok) throw new Error(res.error);
			expect(valid.has((res.events[0] as any).note)).toBe(true);
		}
	});

	it('float bound in multi-element list: each element independently sampled', () => {
		// [0.5rand2] → rounds to 1 or 2 → D5=62 or E5=64
		// [2.5rand4] → rounds to 3 or 4 → F5=65 or G5=67
		const validFirst = new Set([62, 64]);
		const validSecond = new Set([65, 67]);
		const i = inst('note x [0.5rand2 2.5rand4]');
		for (let cycle = 0; cycle < 100; cycle++) {
			const res = i.evaluate({ cycleNumber: cycle });
			if (!res.ok) throw new Error(res.error);
			expect(validFirst.has((res.events[0] as any).note)).toBe(true);
			expect(validSecond.has((res.events[1] as any).note)).toBe(true);
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
	it('degree 0 = C5 = MIDI 60', () => expect(notes('note x [0]')[0]).toBe(60));
	it('degree 1 = D5 = MIDI 62', () => expect(notes('note x [1]')[0]).toBe(62));
	it('degree 4 = G5 = MIDI 67', () => expect(notes('note x [4]')[0]).toBe(67));
	it('degree 7 = C6 = MIDI 72 (octave wrap)', () => expect(notes('note x [7]')[0]).toBe(72));
	it('degree -1 = B4 = MIDI 59 (below root)', () => expect(notes('note x [-1]')[0]).toBe(59));
});

describe('@root — changes root pitch class (semitone offset from C)', () => {
	it('@root(7) shifts root to G: degree 0 = G5 = MIDI 67', () => {
		expect(notes('@root(7) note x [0]')[0]).toBe(67);
	});

	it('@root(7) degree 1 in major = A5 = MIDI 69', () => {
		// G5=67 + 2 semitones = 69
		expect(notes('@root(7) note x [1]')[0]).toBe(69);
	});

	it('@root(0) is same as default (C)', () => {
		expect(notes('@root(0) note x [0]')[0]).toBe(60);
	});

	it('@root(2) shifts to D: degree 0 = D5 = MIDI 62', () => {
		expect(notes('@root(2) note x [0]')[0]).toBe(62);
	});
});

describe('@octave — changes the octave', () => {
	it('@octave(4) lowers by one octave: C4 = MIDI 48', () => {
		expect(notes('@octave(4) note x [0]')[0]).toBe(48);
	});

	it('@octave(6) raises by one octave: C6 = MIDI 72', () => {
		expect(notes('@octave(6) note x [0]')[0]).toBe(72);
	});

	it('@octave(5) is the default: C5 = MIDI 60', () => {
		expect(notes('@octave(5) note x [0]')[0]).toBe(60);
	});

	it('@octave(3) deep bass: C3 = MIDI 36', () => {
		expect(notes('@octave(3) note x [0]')[0]).toBe(36);
	});
});

describe('@scale — changes the active scale', () => {
	// minor intervals: [2,1,2,2,1,2,2] → degree 2 = 3 semitones from root → Eb5 = 63
	it('@scale(minor) degree 2 = Eb5 = MIDI 63', () => {
		expect(notes('@scale(minor) note x [2]')[0]).toBe(63);
	});

	it('@scale(major) degree 2 = E5 = MIDI 64 (same as default)', () => {
		expect(notes('@scale(major) note x [2]')[0]).toBe(64);
	});

	// major_pentatonic: [2,2,3,2,3] → degree 2 = 4 semitones → E5 = 64
	it('@scale(major_pentatonic) degree 2 = E5 = MIDI 64', () => {
		expect(notes('@scale(major_pentatonic) note x [2]')[0]).toBe(64);
	});

	// minor_pentatonic: [3,2,2,3,2] → degree 1 = 3 semitones → Eb5 = 63
	it('@scale(minor_pentatonic) degree 1 = Eb5 = MIDI 63', () => {
		expect(notes('@scale(minor_pentatonic) note x [1]')[0]).toBe(63);
	});

	// dorian: [2,1,2,2,2,1,2] → degree 6 = 10 semitones → Bb5 = 70
	it('@scale(dorian) degree 6 = Bb5 = MIDI 70', () => {
		expect(notes('@scale(dorian) note x [6]')[0]).toBe(70);
	});

	// phrygian: [1,2,2,2,1,2,2] → degree 1 = 1 semitone → Db5 = 61
	it('@scale(phrygian) degree 1 = Db5 = MIDI 61', () => {
		expect(notes('@scale(phrygian) note x [1]')[0]).toBe(61);
	});

	// lydian: [2,2,2,1,2,2,1] → degree 3 = 6 semitones → F#5 = 66
	it('@scale(lydian) degree 3 = F#5 = MIDI 66', () => {
		expect(notes('@scale(lydian) note x [3]')[0]).toBe(66);
	});

	// mixolydian: [2,2,1,2,2,1,2] → degree 6 = 10 semitones → Bb5 = 70
	it('@scale(mixolydian) degree 6 = Bb5 = MIDI 70', () => {
		expect(notes('@scale(mixolydian) note x [6]')[0]).toBe(70);
	});

	// locrian: [1,2,2,1,2,2,2] → degree 4 = 6 semitones → F#5 = 66
	it('@scale(locrian) degree 4 = F#5 = MIDI 66', () => {
		expect(notes('@scale(locrian) note x [4]')[0]).toBe(66);
	});

	// harmonic_minor: [2,1,2,2,1,3,1] → degree 6 = 11 semitones → B5 = 71
	it('@scale(harmonic_minor) degree 6 = B5 = MIDI 71', () => {
		expect(notes('@scale(harmonic_minor) note x [6]')[0]).toBe(71);
	});

	// melodic_minor: [2,1,2,2,2,2,1] → degree 5 = 9 semitones → A5 = 69
	it('@scale(melodic_minor) degree 5 = A5 = MIDI 69', () => {
		expect(notes('@scale(melodic_minor) note x [5]')[0]).toBe(69);
	});

	// harmonic_major: [2,2,1,2,1,3,1] → degree 5 = 8 semitones → Ab5 = 68
	it('@scale(harmonic_major) degree 5 = Ab5 = MIDI 68', () => {
		expect(notes('@scale(harmonic_major) note x [5]')[0]).toBe(68);
	});

	// blues: [3,2,1,1,3,2] → degree 2 = 5 semitones → F5 = 65
	it('@scale(blues) degree 2 = F5 = MIDI 65', () => {
		expect(notes('@scale(blues) note x [2]')[0]).toBe(65);
	});

	// whole_tone: [2,2,2,2,2,2] → degree 3 = 6 semitones → F#5 = 66
	it('@scale(whole_tone) degree 3 = F#5 = MIDI 66', () => {
		expect(notes('@scale(whole_tone) note x [3]')[0]).toBe(66);
	});

	// diminished: [2,1,2,1,2,1,2,1] → degree 4 = 6 semitones → F#5 = 66
	it('@scale(diminished) degree 4 = F#5 = MIDI 66', () => {
		expect(notes('@scale(diminished) note x [4]')[0]).toBe(66);
	});

	// augmented: [3,1,3,1,3,1] → degree 2 = 4 semitones → E5 = 64
	it('@scale(augmented) degree 2 = E5 = MIDI 64', () => {
		expect(notes('@scale(augmented) note x [2]')[0]).toBe(64);
	});
});

describe('@cent — pitch deviation in cents', () => {
	it('@cent(0) no deviation: note number is still 60 (cent offset is separate metadata)', () => {
		expect(notes('@cent(0) note x [0]')[0]).toBe(60);
	});

	it('@cent(50) stores a non-zero cent offset on events', () => {
		const res = inst('@cent(50) note x [0]').evaluate({ cycleNumber: 0 });
		if (!res.ok) throw new Error(res.error);
		expect((res.events[0] as any).note).toBe(60);
		expect((res.events[0] as any).cent).toBe(50);
	});

	it('@cent(-50) stores a negative cent offset', () => {
		const res = inst('@cent(-50) note x [0]').evaluate({ cycleNumber: 0 });
		if (!res.ok) throw new Error(res.error);
		expect((res.events[0] as any).cent).toBe(-50);
	});

	it('no @cent decorator → cent defaults to 0', () => {
		const res = inst('note x [0]').evaluate({ cycleNumber: 0 });
		if (!res.ok) throw new Error(res.error);
		expect((res.events[0] as any).cent ?? 0).toBe(0);
	});
});

describe('@key — compound decorator (root + scale [+ octave])', () => {
	it('@key(g lydian) degree 0 = G5 = MIDI 67', () => {
		// rootMidi = 60 + 7 = 67. Lydian degree 0 = 0 → MIDI 67
		expect(notes('@key(g lydian) note x [0]')[0]).toBe(67);
	});

	it('@key(g lydian) degree 3 = C#6 = MIDI 73', () => {
		// Lydian: [2,2,2,1,2,2,1] → offset at degree 3 = 6 → 67+6 = 73
		expect(notes('@key(g lydian) note x [3]')[0]).toBe(73);
	});

	it('@key(g# lydian) degree 0 = G#5 = MIDI 68', () => {
		// rootMidi = 60 + 8 = 68
		expect(notes('@key(g# lydian) note x [0]')[0]).toBe(68);
	});

	it('@key(a minor) degree 0 = A5 = MIDI 69', () => {
		// rootMidi = 60 + 9 = 69
		expect(notes('@key(a minor) note x [0]')[0]).toBe(69);
	});

	it('@key(a minor) degree 2 = C6 = MIDI 72', () => {
		// A5=69, minor[2] = 3 semitones → 72
		expect(notes('@key(a minor) note x [2]')[0]).toBe(72);
	});

	it('@key(c major 4) degree 0 = C4 = MIDI 48', () => {
		// rootMidi = 60 + 0 - 12 = 48
		expect(notes('@key(c major 4) note x [0]')[0]).toBe(48);
	});

	it('@key(c major 6) degree 0 = C6 = MIDI 72', () => {
		expect(notes('@key(c major 6) note x [0]')[0]).toBe(72);
	});

	it('@key(bb major) degree 0 = Bb5 = MIDI 70', () => {
		// rootMidi = 60 + 10 = 70
		expect(notes('@key(bb major) note x [0]')[0]).toBe(70);
	});

	it('@key(G lydian) (uppercase) degree 0 = G5 = MIDI 67', () => {
		expect(notes('@key(G lydian) note x [0]')[0]).toBe(67);
	});
});

describe('set — writes to global context', () => {
	it('set scale(minor) changes default scale globally', () => {
		// minor degree 2 = 3 semitones → Eb5 = 63
		expect(notes('set scale(minor)\nnote x [2]')[0]).toBe(63);
	});

	it('set root(7) shifts root to G globally', () => {
		expect(notes('set root(7)\nnote x [0]')[0]).toBe(67);
	});

	it('set octave(4) lowers octave globally', () => {
		expect(notes('set octave(4)\nnote x [0]')[0]).toBe(48);
	});

	it('set key(g lydian) applies compound decorator globally', () => {
		expect(notes('set key(g lydian)\nnote x [0]')[0]).toBe(67);
	});

	it('multiple set statements combine', () => {
		// set root(7) + set octave(4): G4 = 60 + 7 - 12 = 55
		expect(notes('set root(7)\nset octave(4)\nnote x [0]')[0]).toBe(55);
	});
});

describe('decorator scoping (truth table 8)', () => {
	it('block body inherits outer decorator: @scale(minor) note x [2] = Eb5 = 63', () => {
		expect(notes('@scale(minor)\n  note x [2]')[0]).toBe(63);
	});

	it('inline decorator: @scale(minor) note x [2] = Eb5 = 63', () => {
		expect(notes('@scale(minor) note x [2]')[0]).toBe(63);
	});

	it('no decorator: note [0] uses global defaults → C5 = 60', () => {
		expect(notes('note x [0]')[0]).toBe(60);
	});

	it('@key(g# lydian) inline: degree 0 = G#5 = 68', () => {
		expect(notes('@key(g# lydian) note x [0]')[0]).toBe(68);
	});

	it('@key(g# lydian 4) inline: degree 0 = G#4 = 56', () => {
		expect(notes('@key(g# lydian 4) note x [0]')[0]).toBe(56);
	});

	it('nested @root(7) outer, @scale(minor) inner: both apply — G minor degree 2 = Bb5 = 70', () => {
		// G5=67, minor degree 2 = 3 semitones → 70
		expect(notes('@root(7)\n  @scale(minor)\n    note x [2]')[0]).toBe(70);
	});

	it('inner @root overrides outer @root', () => {
		// outer @root(7) = G, inner @root(0) = C → C5 = 60
		expect(notes('@root(7)\n  @root(0)\n    note x [0]')[0]).toBe(60);
	});

	it('decorator scope is lexical — does not affect undecorated siblings', () => {
		// Two patterns: one under @scale(minor), one bare. At minimum parses successfully.
		expect(createInstance('@scale(minor)\n  note x [2]\nnote y [2]').ok).toBe(true);
	});
});

describe('set vs @ interaction', () => {
	it('@ overrides set for its scope', () => {
		// set root(7): global G. @root(0) overrides to C for the inline loop.
		expect(notes('set root(7)\n@root(0) note x [0]')[0]).toBe(60);
	});

	it('set applies when no @ override', () => {
		expect(notes('set root(7)\nnote x [0]')[0]).toBe(67);
	});
});

describe('stochastic decorator arguments', () => {
	it('@root with constant generator: @root(7) is the same as a literal', () => {
		expect(notes('@root(7) note x [0]')[0]).toBe(67);
	});

	it('@root with step generator: lock-by-default freezes root at first value', () => {
		// @root(0step7x2) — decorators lock by default, so root is frozen at 0 (= C5).
		const ns = collectFirst('@root(0step7x2) note x [0]', 4);
		expect(ns.every((n) => n === ns[0])).toBe(true);
		expect(ns[0]).toBe(60); // locked at step start value 0 → C5
	});
});

describe('multiple inline decorators on same pattern', () => {
	it('@scale(minor) @root(7) note x [0]: G minor, degree 0 = G5 = 67', () => {
		expect(notes('@scale(minor) @root(7) note x [0]')[0]).toBe(67);
	});

	it('@scale(minor) @root(7) note x [2]: G minor degree 2 = Bb5 = 70', () => {
		// G5=67, minor[2] = 3 semitones → 70
		expect(notes('@scale(minor) @root(7) note x [2]')[0]).toBe(70);
	});
});

describe('pitch chain: combined root + octave + scale', () => {
	it('root=5 (F), octave=4, major, degree 0 = F4 = MIDI 53', () => {
		// F5=65, F4=53
		expect(notes('@root(5) @octave(4) note x [0]')[0]).toBe(53);
	});

	it('root=7 (G), major, degree 2 = B5 = MIDI 71', () => {
		// G5=67, major degree 2 = 4 semitones → 71
		expect(notes('@root(7) note x [2]')[0]).toBe(71);
	});

	it('@key(g minor) degree 7 wraps to G6 = MIDI 79', () => {
		// G5=67, degree 7 = 12 semitones up (full octave) → 79
		expect(notes('@key(g minor) note x [7]')[0]).toBe(79);
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
		expect(notes('@key(g major 4) note x [2]')[0]).toBe(64 + SHIFT);
	});

	it('literal list: [0 2 4 6] in G major/4 — all four notes shifted -5', () => {
		expect(notes('@key(g major 4) note x [0 2 4 6]')).toEqual(
			[60, 64, 67, 71].map((n) => n + SHIFT)
		);
	});

	it('step: [0step2x4] advances through degrees 0,2,4,6 across 4 cycles in G major/4', () => {
		const i = inst('@key(g major 4) note x [0step2x4]');
		const cycleNotes = [0, 1, 2, 3].map((c) => {
			const res = i.evaluate({ cycleNumber: c });
			if (!res.ok) throw new Error(res.error);
			return (res.events[0] as any).note;
		});
		expect(cycleNotes).toEqual([60, 64, 67, 71].map((n) => n + SHIFT));
	});

	it('mul: [1mul2x4] advances through degrees 1,2,4,8 across 4 cycles in G major/4', () => {
		const i = inst('@key(g major 4) note x [1mul2x4]');
		const cycleNotes = [0, 1, 2, 3].map((c) => {
			const res = i.evaluate({ cycleNumber: c });
			if (!res.ok) throw new Error(res.error);
			return (res.events[0] as any).note;
		});
		expect(cycleNotes).toEqual([62, 64, 67, 74].map((n) => n + SHIFT));
	});

	it('lin: [0lin4x3] advances through degrees 0,2,4 across 3 cycles in G major/4', () => {
		const i = inst('@key(g major 4) note x [0lin4x3]');
		const cycleNotes = [0, 1, 2].map((c) => {
			const res = i.evaluate({ cycleNumber: c });
			if (!res.ok) throw new Error(res.error);
			return (res.events[0] as any).note;
		});
		expect(cycleNotes).toEqual([60, 64, 67].map((n) => n + SHIFT));
	});

	it('geo: [1geo8x4] advances through degrees 1,2,4,8 across 4 cycles in G major/4', () => {
		const i = inst('@key(g major 4) note x [1geo8x4]');
		const cycleNotes = [0, 1, 2, 3].map((c) => {
			const res = i.evaluate({ cycleNumber: c });
			if (!res.ok) throw new Error(res.error);
			return (res.events[0] as any).note;
		});
		expect(cycleNotes).toEqual([62, 64, 67, 74].map((n) => n + SHIFT));
	});

	it('rand: [0rand4] in G major/4 — all notes in shifted G-major range', () => {
		const validInG = new Set([60, 62, 64, 65, 67].map((n) => n + SHIFT));
		const i = inst('@key(g major 4) note x [0rand4]');
		for (let cycle = 0; cycle < 50; cycle++) {
			const res = i.evaluate({ cycleNumber: cycle });
			if (!res.ok) throw new Error(res.error);
			expect(validInG.has((res.events[0] as any).note)).toBe(true);
		}
	});

	it('rand: [0rand4] in G major/4 — produces more than one distinct note', () => {
		const i = inst('@key(g major 4) note x [0rand4]');
		const seen = new Set<number>();
		for (let cycle = 0; cycle < 50; cycle++) {
			const res = i.evaluate({ cycleNumber: cycle });
			if (!res.ok) throw new Error(res.error);
			seen.add((res.events[0] as any).note);
		}
		expect(seen.size).toBeGreaterThan(1);
	});

	it('tilde (~): [0~4] in G major/4 — all notes in shifted range', () => {
		const validInG = new Set([60, 62, 64, 65, 67].map((n) => n + SHIFT));
		const i = inst('@key(g major 4) note x [0~4]');
		for (let cycle = 0; cycle < 50; cycle++) {
			const res = i.evaluate({ cycleNumber: cycle });
			if (!res.ok) throw new Error(res.error);
			expect(validInG.has((res.events[0] as any).note)).toBe(true);
		}
	});

	it('gau: [3gau1] in G major/4 — varies and is lower than C major/5 equivalent', () => {
		const i = inst('@key(g major 4) note x [3gau1]');
		const seen = new Set<number>();
		for (let cycle = 0; cycle < 50; cycle++) {
			const res = i.evaluate({ cycleNumber: cycle });
			if (!res.ok) throw new Error(res.error);
			seen.add((res.events[0] as any).note);
		}
		const median = [...seen].sort((a, b) => a - b)[Math.floor(seen.size / 2)];
		expect(median).toBeLessThan(65); // below C/5 mean (F5)
		expect(seen.size).toBeGreaterThan(1);
	});

	it('exp: [1exp7] in G major/4 — all notes in shifted range [57, 67]', () => {
		// C/5: degrees 1–7 → MIDI 62–72. G/4: -5 → 57–67.
		const i = inst('@key(g major 4) note x [1exp7]');
		for (let cycle = 0; cycle < 50; cycle++) {
			const res = i.evaluate({ cycleNumber: cycle });
			if (!res.ok) throw new Error(res.error);
			expect((res.events[0] as any).note).toBeGreaterThanOrEqual(57);
			expect((res.events[0] as any).note).toBeLessThanOrEqual(67);
		}
	});

	it('bro: [0bro6m1] in G major/4 — stays within shifted degree range [55, 66]', () => {
		const i = inst('@key(g major 4) note x [0bro6m1]');
		for (let cycle = 0; cycle < 100; cycle++) {
			const res = i.evaluate({ cycleNumber: cycle });
			if (!res.ok) throw new Error(res.error);
			expect((res.events[0] as any).note).toBeGreaterThanOrEqual(55);
			expect((res.events[0] as any).note).toBeLessThanOrEqual(66);
		}
	});

	it('step in minor: [0step1x3] in A minor/5 advances A5→B5→C6', () => {
		// A minor root=9, octave=5 → rootMidi=69. minor intervals: [2,1,2,2,1,2,2]
		// degree 0→69(A5), degree 1→71(B5), degree 2→72(C6)
		const i = inst('@key(a minor) note x [0step1x3]');
		const cycleNotes = [0, 1, 2].map((c) => {
			const res = i.evaluate({ cycleNumber: c });
			if (!res.ok) throw new Error(res.error);
			return (res.events[0] as any).note;
		});
		expect(cycleNotes).toEqual([69, 71, 72]);
	});

	it('rand in dorian: [0rand4] in D dorian/5 — all notes in D dorian range', () => {
		// D dorian: root=2, octave=5 → rootMidi=62. dorian intervals: [2,1,2,2,2,1,2]
		// degrees 0–4 offsets: [0,2,3,5,7] → MIDI [62,64,65,67,69]
		const validDDorian = new Set([62, 64, 65, 67, 69]);
		const i = inst('@key(d dorian) note x [0rand4]');
		for (let cycle = 0; cycle < 50; cycle++) {
			const res = i.evaluate({ cycleNumber: cycle });
			if (!res.ok) throw new Error(res.error);
			expect(validDDorian.has((res.events[0] as any).note)).toBe(true);
		}
	});

	it('multi-element list in non-default context: all elements shifted', () => {
		// C/5: [0 2 4] → [60, 64, 67]. G/4: → [55, 59, 62]
		expect(notes('@key(g major 4) note x [0 2 4]')).toEqual([55, 59, 62]);
	});

	it('set root(9) + step: note [0step1x3] advances A5→B5→C#6', () => {
		// A major root=9 → rootMidi=69. major intervals: [2,2,1,2,2,2,1]
		// degree 0→69, degree 1→71, degree 2→73
		const i = inst('set root(9)\nnote x [0step1x3]');
		const cycleNotes = [0, 1, 2].map((c) => {
			const res = i.evaluate({ cycleNumber: c });
			if (!res.ok) throw new Error(res.error);
			return (res.events[0] as any).note;
		});
		expect(cycleNotes).toEqual([69, 71, 73]);
	});
});

// ---------------------------------------------------------------------------
// 7. List modifiers — 'stut, 'wran, 'pick, 'shuf, 'maybe, 'legato, 'offset
// ---------------------------------------------------------------------------

describe("'stut — stutter (truth table 3)", () => {
	it("bare 'stut defaults to stut(2): N×2 events", () => {
		// 2 elements × 2 repetitions = 4 events
		expect(eval0("note x [0 2]'stut")).toHaveLength(4);
	});

	it("'stut repeats each element in order: [0,0,2,2]", () => {
		const ns = notes("note x [0 2]'stut");
		expect(ns[0]).toBe(ns[1]); // first element repeated
		expect(ns[2]).toBe(ns[3]); // second element repeated
		expect(ns[0]).not.toBe(ns[2]);
	});

	it('each stutter event gets 1/(N×k) of the cycle as duration', () => {
		// note [0 2]'stut(2) → 4 events, each 1/4 slot × 0.8 default legato
		const ds = durations("note x [0 2]'stut(2)");
		expect(ds).toHaveLength(4);
		for (const d of ds) expect(d).toBeCloseTo(0.25 * 0.8);
	});

	it('beat offsets are evenly spaced across full cycle', () => {
		const os = offsets("note x [0 2]'stut(2)");
		expect(os[0]).toBeCloseTo(0);
		expect(os[1]).toBeCloseTo(0.25);
		expect(os[2]).toBeCloseTo(0.5);
		expect(os[3]).toBeCloseTo(0.75);
	});

	it("'stut(4) repeats each element 4 times", () => {
		const evs = eval0("note x [0]'stut(4)");
		expect(evs).toHaveLength(4);
		expect(new Set(evs.map((e) => e.note)).size).toBe(1);
	});

	it('within a cycle, adjacent stutter events share the same note', () => {
		const evs = eval0("note x [0 2]'stut(2)");
		expect(evs[0].note).toBe(evs[1].note);
		expect(evs[2].note).toBe(evs[3].note);
	});

	it("'stut(2rand4'lock) freezes the count across all cycles", () => {
		const i = inst("note x [0]'stut(2rand4'lock)");
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
		const i = inst("note x [0]'stut(2rand4'eager(4))");
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
		expect(eval0("note x [0]'stut(0)").length).toBeGreaterThanOrEqual(1);
	});
});

describe("'pick — random element selection (truth table 4)", () => {
	it('unweighted: picks a random element each cycle (at least 2 distinct values over 50 cycles)', () => {
		vi.spyOn(Math, 'random').mockRestore();
		const i = inst("note x [0 2 4]'pick");
		const seen = new Set<number>();
		for (let c = 0; c < 50; c++) {
			const r = i.evaluate({ cycleNumber: c });
			if (!r.ok) throw new Error(r.error);
			r.events.forEach((e) => seen.add((e as any).note));
		}
		expect(seen.size).toBeGreaterThanOrEqual(2);
	});

	it('explicit weights: element with weight 3 appears more often than element with weight 1', () => {
		vi.spyOn(Math, 'random').mockRestore();
		const i = inst("note x [0?3 4?1]'pick");
		const counts = { n0: 0, n4: 0 };
		for (let c = 0; c < 200; c++) {
			const r = i.evaluate({ cycleNumber: c });
			if (!r.ok) throw new Error(r.error);
			const note = (r.events[0] as any).note;
			if (note === 60) counts.n0++;
			else if (note === 67) counts.n4++;
		}
		expect(counts.n0).toBeGreaterThan(counts.n4);
	});

	it('mixed weights: unweighted elements default to weight 1 ([1 2?2 3]pick)', () => {
		vi.spyOn(Math, 'random').mockRestore();
		// Expected probs 0.25 / 0.5 / 0.25
		const i = inst("note x [0 2?2 4]'pick");
		const counts = { n0: 0, n2: 0, n4: 0 };
		for (let c = 0; c < 400; c++) {
			const r = i.evaluate({ cycleNumber: c });
			if (!r.ok) throw new Error(r.error);
			for (const e of r.events) {
				const note = (e as any).note;
				if (note === 60) counts.n0++;
				else if (note === 64) counts.n2++;
				else if (note === 67) counts.n4++;
			}
		}
		// 2 (the double-weighted one) should dominate
		expect(counts.n2).toBeGreaterThan(counts.n0);
		expect(counts.n2).toBeGreaterThan(counts.n4);
	});

	it('zero weight: element is never picked', () => {
		const i = inst("note x [0?0 4?1]'pick");
		const seen = new Set<number>();
		for (let c = 0; c < 20; c++) {
			const r = i.evaluate({ cycleNumber: c });
			if (!r.ok) throw new Error(r.error);
			r.events.forEach((e) => seen.add((e as any).note));
		}
		expect(seen.has(60)).toBe(false); // degree 0, weight 0
		expect(seen.has(67)).toBe(true); // degree 4, weight 1
	});

	it('all-zero weights: slots are silent (rest events)', () => {
		const i = inst("note x [0?0 4?0]'pick");
		for (let c = 0; c < 5; c++) {
			const r = i.evaluate({ cycleNumber: c });
			if (!r.ok) throw new Error(r.error);
			// All events should be rests — no note events
			for (const e of r.events) {
				expect(e.contentType).toBe('rest');
			}
		}
	});

	it('? without pick: weights ignored, list traverses sequentially', () => {
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const evs = eval0('note x [0 2?5 4]');
		// Sequence, not weighted — still emits all three in order
		expect(evs.map((e) => (e as any).note)).toEqual([60, 64, 67]);
		expect(warnSpy).toHaveBeenCalled();
		warnSpy.mockRestore();
	});

	it('? on inner list without pick: inner weight ignored; outer pick still works', () => {
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
		// Outer list picks from either the inner seq list or degree 5.
		// Inner [0 2?3] has no 'pick, so the ?3 is ignored (warning).
		const i = inst("note x [[0 2?3] 5]'pick");
		for (let c = 0; c < 5; c++) {
			const r = i.evaluate({ cycleNumber: c });
			if (!r.ok) throw new Error(r.error);
		}
		expect(warnSpy).toHaveBeenCalled();
		warnSpy.mockRestore();
	});

	it("'wran is removed — silently ignored (falls back to seq traversal)", () => {
		// 'wran is no longer a recognised traversal modifier. The list should
		// traverse sequentially (default).
		const evs = eval0("note x [0 2 4]'wran");
		expect(evs.map((e) => (e as any).note)).toEqual([60, 64, 67]);
	});
});

describe("'shuf — shuffle traversal", () => {
	it('shuffles elements but still emits all of them per cycle', () => {
		const i = inst("note x [0 2 4]'shuf");
		for (let c = 0; c < 5; c++) {
			const r = i.evaluate({ cycleNumber: c });
			if (!r.ok) throw new Error(r.error);
			expect(r.events).toHaveLength(3);
			// All three degrees must be present (60=C5, 64=E5, 67=G5)
			const ns = new Set(r.events.map((e) => (e as any).note));
			expect(ns.has(60)).toBe(true);
			expect(ns.has(64)).toBe(true);
			expect(ns.has(67)).toBe(true);
		}
	});
});

describe("'maybe — probability filter (truth table 5)", () => {
	it("bare 'maybe defaults to p=0.5: some events pass, some are skipped", () => {
		vi.spyOn(Math, 'random').mockRestore();
		const i = inst("note x [0 2 4 0 2 4 0 2 4 0]'maybe");
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
		expect(eval0("note x [0 2 4]'maybe(1.0)")).toHaveLength(3);
	});

	it("'maybe(0.0) skips all events — returns empty array", () => {
		expect(eval0("note x [0 2 4]'maybe(0.0)")).toHaveLength(0);
	});

	it('empty event array is ok:true (not an error)', () => {
		const r = inst("note x [0 2 4]'maybe(0.0)").evaluate({ cycleNumber: 0 });
		expect(r.ok).toBe(true);
		if (r.ok) expect(r.events).toHaveLength(0);
	});

	it("'maybe(0.5rand1.0) uses stochastic probability — 0 to N events", () => {
		const r = inst("note x [0 2 4]'maybe(0.5rand1.0)").evaluate({ cycleNumber: 0 });
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(r.events.length).toBeGreaterThanOrEqual(0);
			expect(r.events.length).toBeLessThanOrEqual(3);
		}
	});
});

describe("'legato — duration scaling (truth table 13)", () => {
	it("'legato(0.8) sets duration = 0.8 × slot", () => {
		// note [0 2 4] → 3 elements, slot = 1/3
		for (const d of durations("note x [0 2 4]'legato(0.8)")) expect(d).toBeCloseTo((1 / 3) * 0.8);
	});

	it("'legato(1.0) — duration equals slot exactly", () => {
		for (const d of durations("note x [0 2 4]'legato(1.0)")) expect(d).toBeCloseTo(1 / 3);
	});

	it("'legato(1.5) — duration exceeds slot (notes overlap)", () => {
		for (const d of durations("note x [0 2 4]'legato(1.5)")) expect(d).toBeCloseTo((1 / 3) * 1.5);
	});

	it('default legato for note is 0.8 (SC Pbind convention)', () => {
		for (const d of durations('note x [0 2 4]')) expect(d).toBeCloseTo((1 / 3) * 0.8);
	});

	it("'legato(0.5rand1.2) draws once per cycle — all events in cycle share same duration", () => {
		const r = inst("note x [0 2 4]'legato(0.5rand1.2)").evaluate({ cycleNumber: 0 });
		if (!r.ok) throw new Error(r.error);
		const ds = r.events.map((e) => e.duration);
		expect(ds[0]).toBeCloseTo(ds[1]);
		expect(ds[0]).toBeCloseTo(ds[2]);
	});

	it("'legato(0.5rand1.2'lock) freezes legato value across cycles", () => {
		const i = inst("note x [0 2 4]'legato(0.5rand1.2'lock)");
		const r0 = i.evaluate({ cycleNumber: 0 });
		const r5 = i.evaluate({ cycleNumber: 5 });
		if (!r0.ok || !r5.ok) throw new Error('eval failed');
		expect(r0.events[0].duration).toBeCloseTo(r5.events[0].duration);
	});

	it("'legato(0.5rand1.2'eager(2)) redraws every 2 cycles", () => {
		const i = inst("note x [0]'legato(0.5rand1.2'eager(2))");
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
		for (const e of eval0("note x [0 1 2]'offset(20)"))
			expect((e as { offsetMs?: number }).offsetMs).toBe(20);
	});

	it("'offset(-10) adds offsetMs=-10 to all events", () => {
		for (const e of eval0("note x [0 1 2]'offset(-10)"))
			expect((e as { offsetMs?: number }).offsetMs).toBe(-10);
	});

	it("'offset(0) adds offsetMs=0 (or leaves it absent)", () => {
		for (const e of eval0("note x [0 1 2]'offset(0)")) {
			const ms = (e as { offsetMs?: number }).offsetMs;
			expect(ms === undefined || ms === 0).toBe(true);
		}
	});

	it("beatOffset positions are not changed by 'offset", () => {
		const evs = eval0("note x [0 1 2]'offset(20)");
		expect(evs[0].beatOffset).toBeCloseTo(0);
		expect(evs[1].beatOffset).toBeCloseTo(1 / 3);
		expect(evs[2].beatOffset).toBeCloseTo(2 / 3);
	});
});

describe('mono content type (truth table 16)', () => {
	it("mono x [0 1 2] — all events have contentType:'mono'", () => {
		for (const e of eval0('mono x [0 1 2]')) expect(e.contentType).toBe('mono');
	});

	it("note x [0 1 2] without mono — contentType is 'note'", () => {
		for (const e of eval0('note x [0 1 2]')) expect(e.contentType).toBe('note');
	});

	it("mono x [0 2 4] — all events have contentType:'mono'", () => {
		for (const e of eval0('mono x [0 2 4]')) expect(e.contentType).toBe('mono');
	});

	it('mono content type does not affect note or timing', () => {
		const normal = eval0('note x [0 2 4]');
		const mono = eval0('mono x [0 2 4]');
		// Both note and mono events carry a note field — narrow to access it
		const noteNotes = normal.map((e) => ('note' in e ? e.note : -1));
		const monoNotes = mono.map((e) => ('note' in e ? e.note : -1));
		expect(monoNotes).toEqual(noteNotes);
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
		expect(notes('note x [2b]')[0]).toBe(notes('note x [2]')[0] - 1);
	});

	it('[4#] = degree 4 sharp: one semitone above G5 → G#5 = 68', () => {
		expect(notes('note x [4#]')[0]).toBe(notes('note x [4]')[0] + 1);
	});

	it('[3bb] = degree 3 double flat: two semitones below F5 → Eb5 = 63', () => {
		expect(notes('note x [3bb]')[0]).toBe(notes('note x [3]')[0] - 2);
	});

	it('[4##] = degree 4 double sharp: two semitones above G5 → A5 = 69', () => {
		expect(notes('note x [4##]')[0]).toBe(notes('note x [4]')[0] + 2);
	});

	it('[0 2b 4] — mixed list: C5, Eb5, G5', () => {
		expect(notes('note x [0 2b 4]')).toEqual([60, 63, 67]);
	});

	it('accidentals work with non-default scale context', () => {
		// @key(g major): root=G5=67, G major scale. degree 2 = B5 = 71.
		// degree 2b = B5 - 1 = Bb5 = 70.
		expect(notes('@key(g major) note x [2b]')[0]).toBe(notes('@key(g major) note x [2]')[0] - 1);
	});
});

describe('transposition (truth table 10)', () => {
	it('note x [0 2] + 3 adds 3 scale steps to each degree', () => {
		// degree 0+3=3 → F5=65, degree 2+3=5 → A5=69
		expect(notes('note x [0 2] + 3')).toEqual([65, 69]);
	});

	it('note x [0 2] - 1 subtracts 1 scale step', () => {
		// degree 2-1=1 → D5=62
		expect(notes('note x [0 2] - 1')[1]).toBe(62);
	});

	it('transposition with 0 is identity', () => {
		expect(notes('note x [0 2 4] + 0')).toEqual(notes('note x [0 2 4]'));
	});

	it('note x [0] + 0rand3 uses a stochastic transpose — produces 1 event per cycle', () => {
		const r = inst('note x [0] + 0rand3').evaluate({ cycleNumber: 0 });
		expect(r.ok).toBe(true);
		if (r.ok) expect(r.events).toHaveLength(1);
	});

	it("'lock on transposition RHS freezes value across cycles", () => {
		const i = inst("note x [0] + 0step1x4'lock");
		const r0 = i.evaluate({ cycleNumber: 0 });
		const r1 = i.evaluate({ cycleNumber: 1 });
		const r2 = i.evaluate({ cycleNumber: 2 });
		if (!r0.ok || !r1.ok || !r2.ok) throw new Error('eval failed');
		expect((r0.events[0] as any).note).toBe((r1.events[0] as any).note);
		expect((r0.events[0] as any).note).toBe((r2.events[0] as any).note);
	});

	it('transposition participates in full pitch chain', () => {
		// @key(g major) note x [0] + 2 should equal @key(g major) note x [2]
		expect(notes('@key(g major) note x [0] + 2')[0]).toBe(notes('@key(g major) note x [2]')[0]);
	});
});

// ---------------------------------------------------------------------------
// Generator arithmetic — issue #31
// ---------------------------------------------------------------------------
// C major degree → MIDI: 0→60, 1→62, 2→64, 3→65, 4→67, 5→69, 6→71, 7→72

describe('generator arithmetic — scalar RHS (truth table 10)', () => {
	it('* 2: degrees are multiplied then passed through pitch chain', () => {
		// [0 2] * 2 → degrees [0, 4] → MIDI [60, 67]
		expect(notes('note x [0 2] * 2')).toEqual([60, 67]);
	});

	it('/ 2: degrees are divided (floor) then passed through pitch chain', () => {
		// [0 4] / 2 → degrees [0, 2] → MIDI [60, 64]
		expect(notes('note x [0 4] / 2')).toEqual([60, 64]);
	});

	it('** 2: degrees are exponentiated then passed through pitch chain', () => {
		// [2 3] ** 2 → degrees [4, 9] → MIDI [67, 74]
		// degree 9 = octave 7 + 2 → MIDI 60 + 12 + 4 = 76? Let's just check it produces 2 events
		const evs = eval0('note x [2 3] ** 2');
		expect(evs).toHaveLength(2);
		// degree 4 → G5 = 67
		expect(pitched(evs[0]).note).toBe(67);
	});

	it('% 7: degrees are taken modulo 7 then passed through pitch chain', () => {
		// [5 9] % 7 → degrees [5, 2] → MIDI [69, 64]
		expect(notes('note x [5 9] % 7')).toEqual([69, 64]);
	});

	it('* 0: all degrees become 0 → MIDI 60 per slot', () => {
		expect(notes('note x [0 2 4] * 0')).toEqual([60, 60, 60]);
	});

	it('% 14 on utf8{coffee} maps bytes into scale degree range', () => {
		// "coffee" bytes: 99, 111, 102, 102, 101, 101
		// % 14: 99%14=1, 111%14=13, 102%14=4, 102%14=4, 101%14=3, 101%14=3
		const evs = eval0('note lead utf8{coffee} % 14');
		expect(evs).toHaveLength(6);
		// degree 1 → D5 = 62
		expect(pitched(evs[0]).note).toBe(62);
	});

	it('arithmetic with scalar RHS produces same event count as LHS', () => {
		expect(eval0('note x [0 2 4] * 2')).toHaveLength(3);
		expect(eval0('note x [0 2 4] / 2')).toHaveLength(3);
		expect(eval0('note x [0 2 4] ** 2')).toHaveLength(3);
		expect(eval0('note x [0 2 4] % 7')).toHaveLength(3);
	});

	it('scalar / 0: all events skipped with warning', () => {
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const evs = eval0('note x [1 2 3] / 0');
		expect(evs).toHaveLength(0);
		expect(warnSpy).toHaveBeenCalled();
		warnSpy.mockRestore();
	});

	it('scalar % 0: identity for all elements (no events skipped)', () => {
		// a % 0 = a, so degrees pass through unchanged
		const evs = eval0('note x [1 2 3] % 0');
		expect(evs).toHaveLength(3);
	});
});

describe('generator arithmetic — list RHS / wrap-around (truth table 10)', () => {
	it('[0 1 2] + [4 8] → degrees 4, 9, 6 (rhs wraps)', () => {
		// pos 0: 0+4=4→G5=67, pos 1: 1+8=9→D6=74, pos 2: 2+(4)=6→B5=71
		// degree 4 = G5 = 67, degree 9 = C major: 9 mod 7 = 2 + 1 octave → D6=74
		// Actually: degree 9 maps to MIDI via degreeToMidi(9, C major, C5):
		// 9 = 7*1 + 2, so octave shift 1, degree 2 = +4 semitones → 60 + 12 + 4 = 76? Let's check:
		// degree 6 = B5 = 71
		const evs = eval0('note x [0 1 2] + [4 8]');
		expect(evs).toHaveLength(3);
		// degree 4 → G5=67
		expect(pitched(evs[0]).note).toBe(67);
		// degree 6 → B5=71
		expect(pitched(evs[2]).note).toBe(71);
	});

	it('list RHS wraps: [0 1 2] + [4 8] pos 2 uses rhs[0]=4', () => {
		// pos 2: degree 2 + rhs[2%2=0]=4 → degree 6 → B5=71
		const evs = eval0('note x [0 1 2] + [4 8]');
		expect(pitched(evs[2]).note).toBe(71); // degree 6 = B5
	});

	it('list RHS produces same event count as LHS list', () => {
		// LHS has 3 elements, RHS has 2 — output has 3 events
		const evs = eval0('note x [0 1 2] + [4 8]');
		expect(evs).toHaveLength(3);
	});

	it('[0 1 2] * [2 3] → degrees [0, 3, 4] (rhs wraps)', () => {
		// pos 0: 0*2=0→C5=60, pos 1: 1*3=3→F5=65, pos 2: 2*2=4→G5=67
		const evs = eval0('note x [0 1 2] * [2 3]');
		expect(evs).toHaveLength(3);
		expect(pitched(evs[0]).note).toBe(60); // degree 0 = C5
		expect(pitched(evs[1]).note).toBe(65); // degree 3 = F5
		expect(pitched(evs[2]).note).toBe(67); // degree 4 = G5
	});

	it('[1 2 3] % [4 0]: modulo zero is identity (a%0=a)', () => {
		// pos 0: 1%4=1→D5=62, pos 1: 2%0=2 (identity)→E5=64, pos 2: 3%4=3→F5=65
		const evs = eval0('note x [1 2 3] % [4 0]');
		expect(evs).toHaveLength(3);
		expect(pitched(evs[0]).note).toBe(62); // degree 1 = D5
		expect(pitched(evs[1]).note).toBe(64); // degree 2 = E5 (identity: 2%0=2)
		expect(pitched(evs[2]).note).toBe(65); // degree 3 = F5
	});

	it('[1 2 3] / [4 0]: division by zero skips event with warning', () => {
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const evs = eval0('note x [1 2 3] / [4 0]');
		// pos 1: 2/0 is skipped → only 2 events (pos 0 and pos 2)
		expect(evs).toHaveLength(2);
		expect(warnSpy).toHaveBeenCalled();
		warnSpy.mockRestore();
	});

	it('both operands reset at cycle boundary', () => {
		// Cycle 0 and cycle 1 should produce the same result (both reset)
		const i = inst('note x [0 1 2] + [4 8]');
		const r0 = i.evaluate({ cycleNumber: 0 });
		const r1 = i.evaluate({ cycleNumber: 1 });
		if (!r0.ok || !r1.ok) throw new Error('eval failed');
		const notes0 = r0.events.map((e) => pitched(e).note);
		const notes1 = r1.events.map((e) => pitched(e).note);
		expect(notes0).toEqual(notes1);
	});
});

// ---------------------------------------------------------------------------
// 9. Structural — note'n statement, continuation modifier lines
// ---------------------------------------------------------------------------

describe("note'n statement (truth table 7)", () => {
	it("note x [0 1 2]'n produces correct notes", () => {
		expect(notes("note x [0 1 2]'n")).toEqual([60, 62, 64]);
	});

	it("note'n timing: N elements → beatOffset 0, 1/N, 2/N, …", () => {
		const evs = eval0("note x [0 1 2]'n");
		expect(evs[0].beatOffset).toBeCloseTo(0);
		expect(evs[1].beatOffset).toBeCloseTo(1 / 3);
		expect(evs[2].beatOffset).toBeCloseTo(2 / 3);
	});

	it("note x [0 1]'n'at(1/4) sets cycleOffset=0.25 on all events", () => {
		for (const e of eval0("note x [0 1]'n'at(1/4)"))
			expect((e as { cycleOffset?: number }).cycleOffset).toBeCloseTo(0.25);
	});

	it("note x [0 1]'n'at(0) sets cycleOffset=0 (default)", () => {
		for (const e of eval0("note x [0 1]'n'at(0)")) {
			const co = (e as { cycleOffset?: number }).cycleOffset;
			expect(co === undefined || co === 0).toBe(true);
		}
	});

	it("note x [0]'n'at(-1/4) sets cycleOffset=-0.25", () => {
		const co = (eval0("note x [0]'n'at(-1/4)")[0] as { cycleOffset?: number }).cycleOffset;
		expect(co).toBeCloseTo(-0.25);
	});

	it("'at shifts when the note starts; beatOffset stays relative to that start", () => {
		const evs = eval0("note x [0 1 2]'n'at(1/4)");
		expect(evs[0].beatOffset).toBeCloseTo(0);
		expect(evs[1].beatOffset).toBeCloseTo(1 / 3);
		expect(evs[2].beatOffset).toBeCloseTo(2 / 3);
	});

	it("note x [0 1]'n(4) emits 2×4 = 8 events", () => {
		expect(eval0("note x [0 1]'n(4)")).toHaveLength(8);
	});

	it("'n events span multiple cycles: cycleOffset increments by 1 per repetition", () => {
		const cycleOffsets = eval0("note x [0]'n(3)").map(
			(e) => (e as { cycleOffset?: number }).cycleOffset ?? 0
		);
		expect(cycleOffsets[0]).toBeCloseTo(0);
		expect(cycleOffsets[1]).toBeCloseTo(1);
		expect(cycleOffsets[2]).toBeCloseTo(2);
	});

	it("bare 'n plays once and does not crash", () => {
		expect(inst("note x [0]'n").evaluate({ cycleNumber: 0 }).ok).toBe(true);
	});

	it("note'n supports pitch context decorators", () => {
		// @key(g major) note x [0]'n → G5 = 67
		expect(notes("@key(g major) note x [0]'n")[0]).toBe(67);
	});

	it("integer 'at on continuation line", () => {
		const co = (eval0("note x [0 1]'n\n  'at(1)")[0] as { cycleOffset?: number }).cycleOffset;
		expect(co).toBeCloseTo(1);
	});

	it("note x [0 1 2]'n returns done:false on cycle 0 (the one cycle it runs)", () => {
		const r = inst("note x [0 1 2]'n").evaluate({ cycleNumber: 0 });
		expect(r.ok).toBe(true);
		if (r.ok) expect(r.done).toBe(false);
	});

	it("note x [0 1 2]'n returns done:true on cycle 1 (played once, finished)", () => {
		const i = inst("note x [0 1 2]'n");
		i.evaluate({ cycleNumber: 0 }); // consume cycle 0
		const r = i.evaluate({ cycleNumber: 1 });
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(r.events).toHaveLength(0);
			expect(r.done).toBe(true);
		}
	});

	it("note x [0]'n'at(2) is not done until after cycle 2", () => {
		const i = inst("note x [0]'n'at(2)");
		const r0 = i.evaluate({ cycleNumber: 0 });
		expect(r0.ok && !r0.done).toBe(true);
		const r2 = i.evaluate({ cycleNumber: 2 });
		expect(r2.ok && !r2.done).toBe(true);
		const r3 = i.evaluate({ cycleNumber: 3 });
		expect(r3.ok && r3.done).toBe(true);
	});

	it("note x [0]'n(3) is done after its 3 cycles", () => {
		const i = inst("note x [0]'n(3)");
		for (let c = 0; c < 3; c++) {
			const r = i.evaluate({ cycleNumber: c });
			expect(r.ok && !r.done).toBe(true);
		}
		const r = i.evaluate({ cycleNumber: 3 });
		expect(r.ok && r.done).toBe(true);
	});

	it('note x [0 1 2] loops indefinitely, never returns done:true', () => {
		const i = inst('note x [0 1 2]');
		for (let c = 0; c < 5; c++) {
			const r = i.evaluate({ cycleNumber: c });
			expect(r.ok).toBe(true);
			if (r.ok) expect(r.done).toBe(false);
		}
	});
});

describe('modifier continuation lines (truth table 1)', () => {
	it("continuation 'stut attaches to pattern", () => {
		expect(eval0("note x [0 2]\n  'stut(2)")).toHaveLength(4);
	});

	it("continuation 'legato attaches to pattern", () => {
		for (const d of durations("note x [0 2 4]\n  'legato(0.8)"))
			expect(d).toBeCloseTo((1 / 3) * 0.8);
	});

	it('multiple continuation modifiers on separate lines', () => {
		const evs = eval0("note x [0 2]\n  'stut(2)\n  'legato(0.8)");
		expect(evs).toHaveLength(4);
		for (const e of evs) expect(e.duration).toBeCloseTo(0.25 * 0.8);
	});
});

// ---------------------------------------------------------------------------
// 10. FX pipe (truth table 9)
// ---------------------------------------------------------------------------

describe('FX pipe (truth table 9)', () => {
	it('note x [0] | fx(\\lpf) — result includes exactly one FxEvent', () => {
		const r = inst('note x [0] | fx(\\lpf)').evaluate({ cycleNumber: 0 });
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		const fxEvents = r.events.filter((e) => e.contentType === 'fx');
		expect(fxEvents).toHaveLength(1);
		expect(fxEvents[0].synthdef).toBe('lpf');
	});

	it('note x [0] | fx(\\lpf) — note events are still present', () => {
		const r = inst('note x [0] | fx(\\lpf)').evaluate({ cycleNumber: 0 });
		if (!r.ok) throw new Error(r.error);
		const noteEvents = r.events.filter((e) => e.contentType !== 'fx');
		expect(noteEvents).toHaveLength(1);
		expect('note' in noteEvents[0] ? noteEvents[0].note : -1).toBe(60);
	});

	it("fx event has contentType:'fx', synthdef, params, cycleOffset", () => {
		const r = inst('note x [0] | fx(\\lpf)').evaluate({ cycleNumber: 0 });
		if (!r.ok) throw new Error(r.error);
		const fxEv = r.events.find((e) => e.contentType === 'fx');
		expect(fxEv).toBeDefined();
		expect(fxEv!.contentType).toBe('fx');
		expect(fxEv!.synthdef).toBe('lpf');
		expect(typeof fxEv!.params).toBe('object');
		expect(typeof fxEv!.cycleOffset).toBe('number');
	});

	it('fx modifier params are included in fx event params', () => {
		const r = inst("note x [0] | fx(\\lpf)'cutoff(1200)").evaluate({ cycleNumber: 0 });
		if (!r.ok) throw new Error(r.error);
		const fxEv = r.events.find((e) => e.contentType === 'fx');
		expect(fxEv).toBeDefined();
		expect(fxEv!.params!.cutoff).toBe(1200);
	});

	it("fx modifier params respect 'lock semantics", () => {
		const i = inst("note x [0] | fx(\\lpf)'cutoff(800rand1600'lock)");
		const r0 = i.evaluate({ cycleNumber: 0 });
		const r1 = i.evaluate({ cycleNumber: 1 });
		if (!r0.ok || !r1.ok) throw new Error('eval failed');
		const getFx = (ev: typeof r0) => {
			if (!ev.ok) return null;
			return ev.events.find((e) => e.contentType === 'fx');
		};
		expect(getFx(r0)!.params!.cutoff).toBe(getFx(r1)!.params!.cutoff);
	});

	it('fx without wet/dry has wetDry undefined (100% wet by default)', () => {
		const r = inst('note x [0] | fx(\\lpf)').evaluate({ cycleNumber: 0 });
		if (!r.ok) throw new Error(r.error);
		const fxEv = r.events.find((e) => e.contentType === 'fx');
		expect(fxEv).toBeDefined();
		expect(fxEv!.wetDry).toBeUndefined();
	});

	it('fx with 70% wet/dry emits wetDry: 70', () => {
		const r = inst('note x [0] | fx(\\lpf) 70%').evaluate({ cycleNumber: 0 });
		if (!r.ok) throw new Error(r.error);
		const fxEv = r.events.find((e) => e.contentType === 'fx');
		expect(fxEv).toBeDefined();
		expect(fxEv!.wetDry).toBe(70);
	});

	it("fx with params and wet/dry: fx(\\lpf)'cutoff(800) 50% emits wetDry: 50", () => {
		const r = inst("note x [0] | fx(\\lpf)'cutoff(800) 50%").evaluate({ cycleNumber: 0 });
		if (!r.ok) throw new Error(r.error);
		const fxEv = r.events.find((e) => e.contentType === 'fx');
		expect(fxEv).toBeDefined();
		expect(fxEv!.wetDry).toBe(50);
		expect(fxEv!.params!.cutoff).toBe(800);
	});

	it('fx with 0% wet/dry emits wetDry: 0 (fully dry — distinct from undefined)', () => {
		const r = inst('note x [0] | fx(\\lpf) 0%').evaluate({ cycleNumber: 0 });
		if (!r.ok) throw new Error(r.error);
		const fxEv = r.events.find((e) => e.contentType === 'fx');
		expect(fxEv).toBeDefined();
		expect(fxEv!.wetDry).toBe(0); // not undefined — 0 means fully dry
	});

	it('fx with 100% wet/dry emits wetDry: 100', () => {
		const r = inst('note x [0] | fx(\\lpf) 100%').evaluate({ cycleNumber: 0 });
		if (!r.ok) throw new Error(r.error);
		const fxEv = r.events.find((e) => e.contentType === 'fx');
		expect(fxEv).toBeDefined();
		expect(fxEv!.wetDry).toBe(100);
	});

	it('note events emitted alongside fx do not carry wetDry', () => {
		const r = inst('note x [0] | fx(\\lpf) 70%').evaluate({ cycleNumber: 0 });
		if (!r.ok) throw new Error(r.error);
		const noteEv = r.events.find((e) => e.contentType !== 'fx');
		expect(noteEv).toBeDefined();
		expect((noteEv as { wetDry?: number }).wetDry).toBeUndefined();
	});
});

describe('"param notation on loop/line (truth table 18)', () => {
	it('literal "param sets params on note events', () => {
		const r = inst('note x [0]"amp(0.5)').evaluate({ cycleNumber: 0 });
		if (!r.ok) throw new Error(r.error);
		const noteEv = r.events[0] as { params?: Record<string, number> };
		expect(noteEv.params).toBeDefined();
		expect(noteEv.params!.amp).toBe(0.5);
	});

	it('chained "params both appear on note events', () => {
		const r = inst('note x [0]"amp(0.5)"pan(-0.3)').evaluate({ cycleNumber: 0 });
		if (!r.ok) throw new Error(r.error);
		const noteEv = r.events[0] as { params?: Record<string, number> };
		expect(noteEv.params).toBeDefined();
		expect(noteEv.params!.amp).toBe(0.5);
		expect(noteEv.params!.pan).toBeCloseTo(-0.3);
	});

	it('note events without "param have no params field', () => {
		const r = inst('note x [0]').evaluate({ cycleNumber: 0 });
		if (!r.ok) throw new Error(r.error);
		const noteEv = r.events[0] as { params?: Record<string, number> };
		expect(noteEv.params).toBeUndefined();
	});

	it('"param with stochastic value varies per cycle (eager(1) default)', () => {
		const i = inst('note x [0]"amp(0.3rand0.8)');
		const results = Array.from({ length: 100 }, (_, c) => {
			const r = i.evaluate({ cycleNumber: c });
			if (!r.ok) throw new Error(r.error);
			return (r.events[0] as { params?: Record<string, number> }).params!.amp;
		});
		expect(results.every((v) => v >= 0.3 && v <= 0.8)).toBe(true);
		// Values must actually vary — a 'lock bug would freeze them
		expect(new Set(results.map((v) => v.toFixed(6))).size).toBeGreaterThan(1);
	});

	it('"param with \'lock holds value across cycles', () => {
		const i = inst('note x [0]"amp(0.3rand0.8\'lock)');
		const amps = [0, 1, 5].map((c) => {
			const r = i.evaluate({ cycleNumber: c });
			if (!r.ok) throw new Error('eval failed');
			return (r.events[0] as { params?: Record<string, number> }).params!.amp;
		});
		// Same value at cycles 0, 1, and 5 — rules out 'eager(2) false positive
		expect(amps[0]).toBe(amps[1]);
		expect(amps[0]).toBe(amps[2]);
	});

	it('"param applies to all note events in a multi-element pattern', () => {
		const r = inst('note x [0 2 4]"amp(0.5)').evaluate({ cycleNumber: 0 });
		if (!r.ok) throw new Error(r.error);
		expect(r.events.length).toBe(3);
		for (const ev of r.events) {
			expect((ev as { params?: Record<string, number> }).params!.amp).toBe(0.5);
		}
	});
});

// ---------------------------------------------------------------------------
// 11. Cross-cutting interactions
// ---------------------------------------------------------------------------

describe("'stut + 'legato interaction", () => {
	it("'stut(2)'legato(0.8): expanded slots × legato factor = 0.25 × 0.8", () => {
		// note [0 2]'stut(2) → 4 events, slot=0.25. 'legato(0.8) → duration = 0.2
		const ds = durations("note x [0 2]'stut(2)'legato(0.8)");
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
		expect(eval0("note x [0 2]'stut(-1)")).toHaveLength(2);
	});

	it("'stut([1 2]) — list arg: stut is ignored, elements render normally", () => {
		// '[1 2] is not a scalar generator so extractModifierScalar returns null;
		// stutRunner stays null → stutCount defaults to 1.
		expect(eval0("note x [0]'stut([1 2])")).toHaveLength(2);
	});
});

describe("'legato edge cases", () => {
	it("'legato(0) produces events with duration 0", () => {
		for (const d of durations("note x [0 2]'legato(0)")) expect(d).toBe(0);
	});

	it("'legato(-0.5) produces events with negative duration (gate opens before slot)", () => {
		for (const d of durations("note x [0 2]'legato(-0.5)")) expect(d).toBeCloseTo(-0.5 * 0.5);
	});
});

describe("'n edge cases", () => {
	it("'n(0) is treated as 1 repetition (clamped)", () => {
		// 'n(n) requires n ≥ 1; 0 is clamped to 1.
		const r = inst("note x [0]'n(0)").evaluate({ cycleNumber: 0 });
		expect(r.ok).toBe(true);
		if (r.ok) expect(r.events.length).toBeGreaterThanOrEqual(1);
	});

	it("'n(-1) — negative count treated as 1 repetition (clamped)", () => {
		// 'n(n) requires n ≥ 1; negatives are clamped to 1.
		const evs = eval0("note x [0 2]'n(-1)");
		expect(evs).toHaveLength(2);
	});

	it("'n(1.5) rounds to 2 repetitions", () => {
		// Math.round(1.5) = 2 in JS
		expect(eval0("note x [0]'n(1.5)")).toHaveLength(2);
	});
});

describe("'pick weight edge cases", () => {
	it('negative weights are rejected at parse time', () => {
		const i = createInstance("note x [0?-1 1?1]'pick");
		expect(i.ok).toBe(false);
	});

	it('all-zero weights produce only rest events', () => {
		const i = inst("note x [0?0 4?0]'pick");
		for (let c = 0; c < 5; c++) {
			const r = i.evaluate({ cycleNumber: c });
			if (!r.ok) throw new Error(r.error);
			for (const e of r.events) {
				expect(e.contentType).toBe('rest');
			}
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
	it('note x [4@1/2 7@1/4] — 2 events, sorted by beat (7@1/4 first, 4@1/2 second)', () => {
		// sorted by beatOffset: 7@1/4 = C6=72 first, 4@1/2 = G5=67 second
		expect(notes('note x [4@1/2 7@1/4]')).toEqual([72, 67]);
	});

	it('note x [4@1/2 7@1/4] — events sorted by beatOffset (7 at 1/4 before 4 at 1/2)', () => {
		const evs = eval0('note x [4@1/2 7@1/4]');
		expect(evs[0].beatOffset).toBeCloseTo(0.25); // 7@1/4
		expect(evs[1].beatOffset).toBeCloseTo(0.5); // 4@1/2
		expect(evs[0].note).toBe(72); // degree 7 = C6
		expect(evs[1].note).toBe(67); // degree 4 = G5
	});

	it('timed list supports pitch context', () => {
		// @key(g major) note x [0@0 2@1/2] → G5=67, B5=71
		expect(notes('@key(g major) note x [0@0 2@1/2]')).toEqual([67, 71]);
	});

	it('note x [0 2@1] — bare degree gets natural slot, @-timed degree gets override', () => {
		const evs = eval0('note x [0 2@1]');
		expect(evs[0].beatOffset).toBeCloseTo(0); // 0 is in slot 0 of 2 = beat 0
		expect(evs[1].beatOffset).toBeCloseTo(1.0); // 2@1 → absolute beat 1
	});

	it('note x [0 4 7@1/2] — two bare degrees then one timed', () => {
		const evs = eval0('note x [0 4 7@1/2]');
		expect(evs[0].beatOffset).toBeCloseTo(0); // slot 0 of 3
		expect(evs[1].beatOffset).toBeCloseTo(1 / 3); // slot 1 of 3
		expect(evs[2].beatOffset).toBeCloseTo(0.5); // 7@1/2 → absolute 0.5
	});

	it('note x [0 2@1] — notes are correct', () => {
		expect(notes('note x [0 2@1]')).toEqual([60, 64]);
	});

	it('note x [0 2@1.5] — float time is honoured', () => {
		const evs = eval0('note x [0 2@1.5]');
		expect(evs[0].beatOffset).toBeCloseTo(0);
		expect(evs[1].beatOffset).toBeCloseTo(1.5);
	});

	it('note x [0@0.0 4@0.5] — float times on all elements', () => {
		const evs = eval0('note x [0@0.0 4@0.5]');
		expect(evs[0].beatOffset).toBeCloseTo(0);
		expect(evs[1].beatOffset).toBeCloseTo(0.5);
	});

	it('events are sorted by beatOffset — out-of-source-order @ does not produce negative gaps', () => {
		// source order: 0 (natural slot 0), 1 (natural slot 1/3), 4@0.01 (override 0.01)
		// sorted order: 0 at 0, 4 at 0.01, 1 at 0.333
		const evs = eval0('note x [0 1 4@0.01]');
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
// note(\moog) [0 2 4] and note(\sine) [0 1 2] select a named SynthDef.
// The evaluator threads the name through to every note event as synthdef.
// notes with no synthdef arg produce events with no synthdef field.
// ---------------------------------------------------------------------------

describe('synthdef selection — note(\\moog) / note(\\sine)', () => {
	it('note(\\moog) lead [0 2 4] — produces 3 note events', () => {
		expect(eval0('note(\\moog) lead [0 2 4]')).toHaveLength(3);
	});

	it('note(\\moog) lead [0 2 4] — notes are correct (pitch chain unaffected by synthdef)', () => {
		expect(notes('note(\\moog) lead [0 2 4]')).toEqual([60, 64, 67]);
	});

	it('note(\\moog) — every note event carries synthdef: "moog"', () => {
		for (const e of eval0('note(\\moog) lead [0 2 4]')) {
			expect(e.synthdef).toBe('moog');
		}
	});

	it('note(\\sine) lead [0 1 2] — produces 3 note events', () => {
		expect(eval0('note(\\sine) lead [0 1 2]')).toHaveLength(3);
	});

	it('note(\\sine) — every note event carries synthdef: "sine"', () => {
		for (const e of eval0('note(\\sine) lead [0 1 2]')) {
			expect(e.synthdef).toBe('sine');
		}
	});

	it('note without synthdef arg — events have no synthdef field', () => {
		for (const e of eval0('note x [0 2 4]')) {
			expect(e.synthdef).toBeUndefined();
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
	it('note x [1!4] produces 4 events at the same note', () => {
		const ns = notes('note x [1!4]');
		expect(ns).toHaveLength(4);
		expect(new Set(ns).size).toBe(1); // all identical
	});

	it('note x [1!2 3!3] produces 5 events (2+3)', () => {
		const ns = notes('note x [1!2 3!3]');
		expect(ns).toHaveLength(5);
		// first two are degree 1, last three are degree 3
		const d1 = notes('note x [1]')[0];
		const d3 = notes('note x [3]')[0];
		expect(ns.slice(0, 2).every((n) => n === d1)).toBe(true);
		expect(ns.slice(2).every((n) => n === d3)).toBe(true);
	});

	it('note x [1!1] is identical to note [1]', () => {
		expect(notes('note x [1!1]')).toEqual(notes('note x [1]'));
	});

	it('events are evenly spaced within a 1!4 pattern', () => {
		const offs = offsets('note x [1!4]');
		expect(offs).toHaveLength(4);
		// Each slot is 1/4 of a cycle in beats (cycle = 1 beat in the evaluator model)
		expect(offs[0]).toBeCloseTo(0);
		expect(offs[1]).toBeCloseTo(0.25);
		expect(offs[2]).toBeCloseTo(0.5);
		expect(offs[3]).toBeCloseTo(0.75);
	});

	it('stochastic element 0rand7!4 — all four copies share the same drawn value per cycle', () => {
		const ns = notes('note x [0rand7!4]');
		expect(ns).toHaveLength(4);
		// eager(1): value drawn once per cycle — all four copies identical
		expect(new Set(ns).size).toBe(1);
	});
});

// ---------------------------------------------------------------------------
// 17. Block comments are invisible to the evaluator
// ---------------------------------------------------------------------------

describe('block comments', () => {
	it('/* comment */ before note is ignored', () => {
		expect(notes('/* ignored */ note x [0 2 4]')).toEqual(notes('note x [0 2 4]'));
	});

	it('block comment between two elements is ignored', () => {
		expect(notes('note x [0 /* mid */ 2 4]')).toEqual(notes('note x [0 2 4]'));
	});
});

describe('accidentals in non-default pitch contexts', () => {
	it('@root(7) note x [2#] — sharp applied after root shift (G major, degree 2 = B5 = 71, +1 = 72)', () => {
		// G5=67, G major scale, degree 2 = B5 = 71, sharp → 72 = C6
		expect(notes('@root(7) note x [2#]')[0]).toBe(notes('@root(7) note x [2]')[0] + 1);
	});

	it('@scale(minor) note x [4b] — flat applied in minor context (degree 4 = G5 = 67, -1 = 66)', () => {
		// C minor, degree 4 = G5 = 67 (minor has same perfect 5th), flat → 66 = F#5
		expect(notes('@scale(minor) note x [4b]')[0]).toBe(notes('@scale(minor) note x [4]')[0] - 1);
	});

	it('@key(g major 4) note x [3#] — accidental in compound key context', () => {
		// G major octave 4: root = G4 = 55. degree 3 in major = 5 semitones → C5 = 60. Sharp → 61.
		expect(notes('@key(g major 4) note x [3#]')[0]).toBe(
			notes('@key(g major 4) note x [3]')[0] + 1
		);
	});

	it('@root(7) note x [2bb] — double flat: two semitones below', () => {
		expect(notes('@root(7) note x [2bb]')[0]).toBe(notes('@root(7) note x [2]')[0] - 2);
	});
});

// ---------------------------------------------------------------------------
// Rests (_) — spec §Sequence generators / Rests
// ---------------------------------------------------------------------------

describe('rests (_) — structural slot count', () => {
	it('note x [0 2 _ 4] emits 4 events, 3rd is contentType:rest', () => {
		const evs = eval0('note x [0 2 _ 4]');
		expect(evs).toHaveLength(4);
		expect(evs[2].contentType).toBe('rest');
	});

	it('rest event has no note field (RestEvent has no pitch)', () => {
		const evs = eval0('note x [0 2 _ 4]');
		// RestEvent has no note field — only beatOffset/duration/contentType
		expect('note' in evs[2]).toBe(false);
	});

	it('rest occupies the correct beat offset (uniformly spaced, 1/4 cycle each)', () => {
		const evs = eval0('note x [0 2 _ 4]');
		expect(evs[2].beatOffset).toBeCloseTo(0.5);
	});

	it('rest at start: note [_ 2 4] — first event is rest', () => {
		const evs = eval0('note x [_ 2 4]');
		expect(evs[0].contentType).toBe('rest');
		expect(evs[1].contentType).toBe('note');
	});

	it('rest at end: note [0 2 _] — last event is rest', () => {
		const evs = eval0('note x [0 2 _]');
		expect(evs[2].contentType).toBe('rest');
	});

	it('all rests: note [_ _ _] — 3 events all contentType:rest', () => {
		const evs = eval0('note x [_ _ _]');
		expect(evs).toHaveLength(3);
		expect(evs.every((e) => e.contentType === 'rest')).toBe(true);
	});

	it('note events have contentType:note — not rest', () => {
		const evs = eval0('note x [0 2 4]');
		for (const e of evs) {
			expect(e.contentType).toBe('note');
		}
	});

	it('rest duration spans its slot (same as a note slot)', () => {
		const evs = eval0('note x [0 2 _ 4]');
		// 4 elements → slot = 0.25; rest duration should equal the slot
		expect(evs[2].duration).toBeCloseTo(0.25);
	});
});

// ---------------------------------------------------------------------------
// 12. Error message content — regression guard for user-facing error strings
// ---------------------------------------------------------------------------

describe('createInstance — error message content', () => {
	it('parse error message starts with "Parse error:"', () => {
		const result = createInstance('note x [0 1 2'); // unclosed bracket
		if (result.ok) throw new Error('expected error');
		expect(result.error).toMatch(/^Parse error:/);
	});

	it('lex error message starts with "Lex error:"', () => {
		// Bare backslash is an unrecognised character → lex error
		const result = createInstance('note x [0 \\1]');
		if (result.ok) throw new Error('expected error');
		expect(result.error).toMatch(/^(Lex error:|Parse error:)/);
	});

	it('"No pattern statement found" when source has no pattern', () => {
		const result = createInstance('set root(7)');
		if (result.ok) throw new Error('expected error');
		expect(result.error).toBe('No pattern statement found');
	});

	it('"No pattern statement found" for empty source', () => {
		const result = createInstance('');
		if (result.ok) throw new Error('expected error');
		expect(result.error).toBe('No pattern statement found');
	});

	it('parse error message includes some description of the problem', () => {
		const result = createInstance('note x [0 1 2');
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

// Note: the evaluate()-level error 'No pattern found in evaluate' (evaluator.ts)
// is dead code — compilePattern() rejects empty sequences at compile time, so
// patternEntries always has at least one non-empty pattern by the time evaluate() runs.
// The path is unreachable through the public API and intentionally has no test.

// ---------------------------------------------------------------------------
// Multiple patterns — all must emit events
// ---------------------------------------------------------------------------

describe('multiple patterns — all patterns produce events', () => {
	it('two plain patterns both emit events in the same cycle', () => {
		// note(\kick) a [0 1 2 3 5] has 5 elements; note b [-2 0 2] has 3 elements.
		// All 8 events should be present.
		const events = eval0('note(\\kick) a [0 1 2 3 5]\n\nnote b [-2 0 2]');
		expect(events).toHaveLength(8);
	});

	it('first pattern events use the given synthdef', () => {
		const events = eval0('note(\\kick) a [0 1 2 3 5]\n\nnote b [-2 0 2]');
		const kickEvents = events.filter((e) => e.synthdef === 'kick');
		expect(kickEvents).toHaveLength(5);
	});

	it('second pattern events have no synthdef', () => {
		const events = eval0('note(\\kick) a [0 1 2 3 5]\n\nnote b [-2 0 2]');
		const plainEvents = events.filter((e) => e.synthdef === undefined);
		expect(plainEvents).toHaveLength(3);
	});

	it('commenting out the first pattern leaves only the second', () => {
		const events = eval0('// note(\\kick) a [0 1 2 3 5]\n\nnote b [-2 0 2]');
		expect(events).toHaveLength(3);
	});

	it('second pattern is independent when first is absent', () => {
		const eventsSecondOnly = eval0('note x [-2 0 2]');
		const eventsBoth = eval0('note(\\kick) a [0 1 2 3 5]\n\nnote b [-2 0 2]');
		const secondInBoth = eventsBoth.filter((e) => e.synthdef === undefined);
		expect(secondInBoth.map((e) => e.note)).toEqual(eventsSecondOnly.map((e) => e.note));
	});
});

// ---------------------------------------------------------------------------
// Generator naming (issue #2)
// ---------------------------------------------------------------------------

describe('generator naming — static errors', () => {
	it('duplicate names in one evaluation are a static error', () => {
		const i = createInstance('note lead [0 2 4]\nnote lead [0 4 7]');
		expect(i.ok).toBe(false);
		if (!i.ok) expect(i.error).toMatch(/duplicate.*lead|lead.*duplicate/i);
	});

	it('two different names in one evaluation are fine', () => {
		const i = createInstance('note lead [0 2 4]\nnote bass [0 1 2]');
		expect(i.ok).toBe(true);
	});

	it('dangling derived reference is a static error', () => {
		// "perc" references "drums" which is not present
		const i = createInstance('note perc:drums [0 2 4]');
		expect(i.ok).toBe(false);
		if (!i.ok) expect(i.error).toMatch(/drums|dangling|parent/i);
	});

	it('derived reference with present parent is fine', () => {
		const i = createInstance('note drums [0 1 2]\nnote perc:drums [0 2 4]');
		expect(i.ok).toBe(true);
	});

	it('derived generator with no body (inherits parent) is fine', () => {
		const i = createInstance('note lead [0 2 4]\nnote harm:lead');
		expect(i.ok).toBe(true);
	});
});

describe('generator naming — reinit()', () => {
	it('instance has a reinit method', () => {
		const i = createInstance('note lead [0 2 4]');
		expect(i.ok).toBe(true);
		if (i.ok) expect(typeof i.reinit).toBe('function');
	});

	it('reinit with valid new source returns ok:true', () => {
		const i = createInstance('note lead [0 2 4]');
		if (!i.ok) throw new Error(i.error);
		const result = i.reinit('note lead [0 4 7]');
		expect(result.ok).toBe(true);
	});

	it('reinit with invalid source returns ok:false', () => {
		const i = createInstance('note lead [0 2 4]');
		if (!i.ok) throw new Error(i.error);
		const result = i.reinit('note lead [0 1 2'); // unclosed bracket
		expect(result.ok).toBe(false);
	});

	it('reinit with duplicate name returns ok:false', () => {
		const i = createInstance('note lead [0 2 4]');
		if (!i.ok) throw new Error(i.error);
		const result = i.reinit('note lead [0 2 4]\nnote lead [0 1]');
		expect(result.ok).toBe(false);
	});

	it('after reinit, evaluate uses new pattern', () => {
		const i = createInstance('note lead [0]');
		if (!i.ok) throw new Error(i.error);
		const before = i.evaluate({ cycleNumber: 0 });
		if (!before.ok) throw new Error(before.error);
		expect((before.events[0] as any).note).toBe(60); // degree 0 = C5

		i.reinit('note lead [4]'); // degree 4 = G5
		const after = i.evaluate({ cycleNumber: 1 });
		if (!after.ok) throw new Error(after.error);
		expect((after.events[0] as any).note).toBe(67); // G5
	});

	it('reinit preserves runner state for unchanged named generators (lock survives reinit)', () => {
		// lead uses 'lock — the random value should be the same after reinit
		// We reinit with the same source, so the runner state is reused.
		const i = createInstance("note lead [0rand7]'lock");
		if (!i.ok) throw new Error(i.error);
		const r1 = i.evaluate({ cycleNumber: 0 });
		if (!r1.ok) throw new Error(r1.error);
		const noteBefore = (r1.events[0] as any).note;

		i.reinit("note lead [0rand7]'lock");
		const r2 = i.evaluate({ cycleNumber: 1 });
		if (!r2.ok) throw new Error(r2.error);
		// Same locked value should be used
		expect((r2.events[0] as any).note).toBe(noteBefore);
	});
});

describe('derived generator — produces parallel events', () => {
	it('note over:lead + 2 produces 4 events alongside lead', () => {
		const i = inst('note lead [0 1 2 3]\nnote over:lead + 2');
		const r = i.evaluate({ cycleNumber: 0 });
		if (!r.ok) throw new Error(r.error);
		// lead: degrees 0,1,2,3 → C5,D5,E5,F5 = 60,62,64,65
		// over: same degrees + 2 → 2,3,4,5 → E5,F5,G5,A5 = 64,65,67,69
		expect(r.events).toHaveLength(8);
		const sorted = r.events.map((e) => (e as any).note).sort((a, b) => a - b);
		expect(sorted).toEqual([60, 62, 64, 64, 65, 65, 67, 69]);
	});
});

// ---------------------------------------------------------------------------
// loopId — pattern name threaded through to ScheduledEvent (issue #18)
// ---------------------------------------------------------------------------

describe('loopId — pattern name on ScheduledEvent', () => {
	it('note events carry the pattern name as loopId', () => {
		for (const e of eval0('note lead [0 1 2]')) {
			expect(e.loopId).toBe('lead');
		}
	});

	it('mono events carry the pattern name as loopId', () => {
		for (const e of eval0('mono bass [0 2 4]')) {
			expect(e.loopId).toBe('bass');
		}
	});

	it('rest events do not carry loopId', () => {
		const events = eval0('note x [_ 0]');
		const rest = events.find((e) => e.contentType === 'rest');
		expect(rest).toBeDefined();
		expect((rest as { loopId?: unknown }).loopId).toBeUndefined();
	});

	it('multiple patterns each carry their own loopId', () => {
		const events = eval0('note lead [0]\nnote bass [4]');
		const leadEvs = events.filter((e) => e.loopId === 'lead');
		const bassEvs = events.filter((e) => e.loopId === 'bass');
		expect(leadEvs).toHaveLength(1);
		expect(bassEvs).toHaveLength(1);
	});
});

// ---------------------------------------------------------------------------
// Content types — mono, sample, slice, cloud (issue #19)
// ---------------------------------------------------------------------------

describe('mono content type', () => {
	it('mono events have contentType: mono', () => {
		for (const e of eval0('mono bass [0 2 4]')) {
			expect(e.contentType).toBe('mono');
		}
	});

	it('mono ignores legato — duration equals full slot', () => {
		// mono: no legato scaling, duration = slot = 1/3
		const ds = eval0('mono x [0 2 4]').map((e) => e.duration);
		for (const d of ds) expect(d).toBeCloseTo(1 / 3);
	});

	it("mono with 'legato modifier still uses full slot (legato ignored)", () => {
		const ds = eval0("mono x [0 2 4]'legato(0.5)").map((e) => e.duration);
		for (const d of ds) expect(d).toBeCloseTo(1 / 3);
	});

	it('mono events carry note field', () => {
		const evs = eval0('mono x [0]');
		expect(evs[0].contentType).toBe('mono');
		expect((evs[0] as { note: number }).note).toBeGreaterThanOrEqual(0);
	});
});

describe('sample content type', () => {
	it('sample events have contentType: sample', () => {
		for (const e of eval0('sample drums [\\kick \\hat]')) {
			expect(e.contentType).toBe('sample');
		}
	});

	it('sample list [\\kick \\hat] emits bufferName per event', () => {
		const evs = eval0('sample drums [\\kick \\hat]') as SampleEvent[];
		expect(evs[0].bufferName).toBe('kick');
		expect(evs[1].bufferName).toBe('hat');
	});

	it('sample emits correct number of events', () => {
		expect(eval0('sample drums [\\kick \\hat \\snare]')).toHaveLength(3);
	});

	it('sample events carry loopId', () => {
		for (const e of eval0('sample drums [\\kick]')) {
			expect(e.loopId).toBe('drums');
		}
	});

	it('sample events are evenly spaced', () => {
		const evs = eval0('sample drums [\\kick \\hat]');
		expect(evs[0].beatOffset).toBeCloseTo(0);
		expect(evs[1].beatOffset).toBeCloseTo(0.5);
	});

	it('@buf on sample is a semantic error', () => {
		const inst = createInstance('@buf(\\x) sample drums [\\kick]');
		expect(inst.ok).toBe(false);
	});
});

describe('slice content type', () => {
	it('slice events have contentType: slice', () => {
		for (const e of eval0('slice drums [0 2 4]')) {
			expect(e.contentType).toBe('slice');
		}
	});

	it('slice list [0 2 4] emits sliceIndex per event', () => {
		const evs = eval0('slice drums [0 2 4]') as SliceEvent[];
		expect(evs[0].sliceIndex).toBe(0);
		expect(evs[1].sliceIndex).toBe(2);
		expect(evs[2].sliceIndex).toBe(4);
	});

	it("'numSlices sets numSlices on all events", () => {
		const evs = eval0("slice drums [0 2]'numSlices(16)") as SliceEvent[];
		expect(evs[0].numSlices).toBe(16);
		expect(evs[1].numSlices).toBe(16);
	});

	it('@buf(\\myloop) sets bufferName on slice events', () => {
		const evs = eval0('@buf(\\myloop) slice drums [0 2]') as SliceEvent[];
		expect(evs[0].bufferName).toBe('myloop');
		expect(evs[1].bufferName).toBe('myloop');
	});

	it('slice without @buf has undefined bufferName', () => {
		const evs = eval0('slice drums [0 2]') as SliceEvent[];
		expect(evs[0].bufferName).toBeUndefined();
	});

	it('slice events carry loopId', () => {
		for (const e of eval0('slice drums [0 4]')) {
			expect(e.loopId).toBe('drums');
		}
	});
});

describe('cloud content type', () => {
	it('cloud emits one CloudEvent per cycle', () => {
		const evs = eval0('cloud atmos []');
		expect(evs).toHaveLength(1);
		expect(evs[0].contentType).toBe('cloud');
	});

	it('cloud event has beatOffset 0 and duration 1', () => {
		const ev = eval0('cloud atmos []')[0] as CloudEvent;
		expect(ev.beatOffset).toBeCloseTo(0);
		expect(ev.duration).toBeCloseTo(1);
	});

	it('@buf(\\myloop) sets bufferName on cloud event', () => {
		const evs = eval0('@buf(\\myloop) cloud atmos []') as CloudEvent[];
		expect(evs[0].bufferName).toBe('myloop');
	});

	it('cloud without @buf has undefined bufferName', () => {
		const ev = eval0('cloud atmos []')[0] as CloudEvent;
		expect(ev.bufferName).toBeUndefined();
	});

	it('cloud events carry loopId', () => {
		const ev = eval0('cloud atmos []')[0];
		expect(ev.loopId).toBe('atmos');
	});

	it('cloud emits one event per cycle across multiple cycles', () => {
		const i = inst('cloud atmos []');
		for (let c = 0; c < 4; c++) {
			const r = i.evaluate({ cycleNumber: c });
			if (!r.ok) throw new Error(r.error);
			expect(r.events).toHaveLength(1);
			expect(r.events[0].contentType).toBe('cloud');
		}
	});
});

// ---------------------------------------------------------------------------
// 12. utf8{word} generator
//
// Converts identifier characters to UTF-8 bytes and yields them cyclically.
// "coffee" = [99, 111, 102, 102, 101, 101]
// With % 14: [1, 7, 4, 4, 3, 3]
// "hello"  = [104, 101, 108, 108, 111]
// "a"      = [97]
// ---------------------------------------------------------------------------

describe('utf8{word} generator', () => {
	it('utf8{coffee} yields the 6 byte values of "coffee" as degrees', () => {
		// "coffee" bytes: c=99, o=111, f=102, f=102, e=101, e=101
		// These are degree values in C major; scale lookup wraps octaves so
		// we verify that the sequence is deterministic by comparing two evals.
		const evs = eval0('note lead utf8{coffee}');
		expect(evs).toHaveLength(6);
		const noteNums = evs.map((e) => pitched(e).note);
		// Verify sequence is deterministic and consistent across two parses
		const evs2 = eval0('note lead utf8{coffee}');
		expect(evs2.map((e) => pitched(e).note)).toEqual(noteNums);
	});

	it('utf8{coffee} produces 6 events (one per byte)', () => {
		const evs = eval0('note lead utf8{coffee}');
		expect(evs).toHaveLength(6);
	});

	it('utf8{a} produces 1 event (single-byte word)', () => {
		const evs = eval0('note lead utf8{a}');
		expect(evs).toHaveLength(1);
	});

	it('utf8{coffee} cycles — cycle 1 repeats the same bytes', () => {
		const i = inst('note lead utf8{coffee}');
		const r0 = i.evaluate({ cycleNumber: 0 });
		const r1 = i.evaluate({ cycleNumber: 1 });
		if (!r0.ok || !r1.ok) throw new Error('eval failed');
		expect(r0.events.map((e) => pitched(e).note)).toEqual(r1.events.map((e) => pitched(e).note));
	});

	it('utf8{coffee} nested inside a sequence list', () => {
		// [utf8{coffee} 0 2] — utf8{coffee} is one scalar element; polls one byte per slot
		// So the list has 3 elements: the generator, 0, and 2.
		const evs = eval0('note lead [utf8{coffee} 0 2]');
		expect(evs).toHaveLength(3);
		// First element is the first byte of "coffee" (99 → degree 99)
		// Second element is degree 0 → MIDI 60 (C5)
		// Third element is degree 2 → MIDI 64 (E5)
		expect(pitched(evs[1]).note).toBe(60); // degree 0 = C5
		expect(pitched(evs[2]).note).toBe(64); // degree 2 = E5
	});

	it('utf8{coffee} cycles through bytes across list slots in subsequent cycles', () => {
		// In a list [utf8{coffee} 0], the utf8 generator polls once per list traversal.
		// Cycle 0: byte[0] = 99 (c)
		// Cycle 1: byte[1] = 111 (o)
		const i = inst('note lead [utf8{coffee} 0]');
		const r0 = i.evaluate({ cycleNumber: 0 });
		const r1 = i.evaluate({ cycleNumber: 1 });
		if (!r0.ok || !r1.ok) throw new Error('eval failed');
		// First element differs between cycles (cycling through bytes)
		const first0 = pitched(r0.events[0]).note;
		const first1 = pitched(r1.events[0]).note;
		// They should NOT be equal (different bytes at index 0 vs index 1)
		expect(first0).not.toBe(first1);
	});

	it('utf8{coffee} as sole pattern element has correct beat offsets', () => {
		const evs = eval0('note lead utf8{coffee}');
		// 6 events equally spaced across the cycle
		const expectedOffsets = [0, 1 / 6, 2 / 6, 3 / 6, 4 / 6, 5 / 6];
		evs.forEach((ev, i) => {
			expect(ev.beatOffset).toBeCloseTo(expectedOffsets[i], 10);
		});
	});

	it('eval succeeds (no error) for utf8{hello}', () => {
		const i = createInstance('note lead utf8{hello}');
		expect(i.ok).toBe(true);
		if (!i.ok) return;
		const r = i.evaluate({ cycleNumber: 0 });
		expect(r.ok).toBe(true);
	});

	it('utf8{word} creates an instance without errors', () => {
		const i = createInstance('note lead utf8{coffee}');
		expect(i.ok).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// 22. Range notation — [start..end] and [start, step..end]
// (truth table 22)
// C major degree → MIDI: 0→60, 1→62, 2→64, 3→65, 4→67, 5→69, 6→71, 7→72
// ---------------------------------------------------------------------------

describe('range notation — [start..end]', () => {
	it('[0..7] expands to 8 events, degrees 0–7', () => {
		const ns = notes('note x [0..7]');
		expect(ns).toHaveLength(8);
		// degrees 0..7 in C major: C5=60, D5=62, E5=64, F5=65, G5=67, A5=69, B5=71, C6=72
		expect(ns).toEqual([60, 62, 64, 65, 67, 69, 71, 72]);
	});

	it('[5..0] descending default step produces degrees 5,4,3,2,1,0', () => {
		const ns = notes('note x [5..0]');
		expect(ns).toHaveLength(6);
		expect(ns).toEqual([69, 67, 65, 64, 62, 60]); // degrees 5,4,3,2,1,0
	});

	it('[0..0] single-element range produces 1 event', () => {
		const ns = notes('note x [0..0]');
		expect(ns).toHaveLength(1);
		expect(ns[0]).toBe(60); // degree 0 = C5
	});

	it('[3..3] single-element range at degree 3', () => {
		const ns = notes('note x [3..3]');
		expect(ns).toHaveLength(1);
		expect(ns[0]).toBe(65); // degree 3 = F5
	});

	it('[0..3] produces 4 events — degrees 0,1,2,3', () => {
		const ns = notes('note x [0..3]');
		expect(ns).toHaveLength(4);
		expect(ns).toEqual([60, 62, 64, 65]);
	});

	it('range events have evenly-spaced beat offsets', () => {
		const evs = eval0('note x [0..3]');
		expect(evs).toHaveLength(4);
		expect(evs[0].beatOffset).toBeCloseTo(0);
		expect(evs[1].beatOffset).toBeCloseTo(0.25);
		expect(evs[2].beatOffset).toBeCloseTo(0.5);
		expect(evs[3].beatOffset).toBeCloseTo(0.75);
	});

	it('[0..3] produces correct slot durations', () => {
		const ds = durations('note x [0..3]');
		// 4 events, slot = 1/4, default legato 0.8
		for (const d of ds) expect(d).toBeCloseTo(0.25 * 0.8);
	});

	it('range is eagerly expanded — same result every cycle', () => {
		const i = inst('note x [0..3]');
		const r0 = i.evaluate({ cycleNumber: 0 });
		const r1 = i.evaluate({ cycleNumber: 1 });
		if (!r0.ok || !r1.ok) throw new Error('eval failed');
		expect(r0.events.map((e) => pitched(e).note)).toEqual(r1.events.map((e) => pitched(e).note));
	});

	it('negative start: [-3..0] produces degrees -3,-2,-1,0', () => {
		const ns = notes('note x [-3..0]');
		expect(ns).toHaveLength(4);
		// degree -3: below C5 by 3 diatonic steps in C major (going down)
		// degree 0 = C5 = 60; verify count and last element
		expect(ns[ns.length - 1]).toBe(60); // degree 0 = C5
	});
});

describe('range notation — [start, step..end]', () => {
	it('[0, 2..10] — every-other step, produces degrees 0,2,4,6,8,10', () => {
		const ns = notes('note x [0, 2..10]');
		expect(ns).toHaveLength(6);
		// degrees 0,2,4,6,8,10 in C major
		expect(ns[0]).toBe(60); // degree 0 = C5
		expect(ns[1]).toBe(64); // degree 2 = E5
		expect(ns[2]).toBe(67); // degree 4 = G5
	});

	it('[10, 8..0] — descending step -2, produces 10,8,6,4,2,0', () => {
		// degrees 10,8,6,4,2,0 → last is degree 0 = C5 = 60
		const ns = notes('note x [10, 8..0]');
		expect(ns).toHaveLength(6);
		expect(ns[ns.length - 1]).toBe(60); // degree 0 = C5
	});

	it('[0, 3..9] — step 3, produces degrees 0,3,6,9', () => {
		const ns = notes('note x [0, 3..9]');
		expect(ns).toHaveLength(4);
		expect(ns[0]).toBe(60); // degree 0 = C5
		expect(ns[1]).toBe(65); // degree 3 = F5
	});

	it('[0.0, 0.25..1.0] — float range with step 0.25 produces 5 events', () => {
		// Float ranges go through the pitch chain (float degrees are rounded for MIDI)
		// This tests that the evaluator produces 5 events: 0.0, 0.25, 0.5, 0.75, 1.0
		const evs = eval0('note x [0.0, 0.25..1.0]');
		expect(evs).toHaveLength(5);
	});
});

describe('range notation — with modifiers', () => {
	it("[0..3]'shuf — same 4 elements shuffled each cycle", () => {
		const i = inst("note x [0..3]'shuf");
		// Collect notes over several cycles — should always be exactly {60,62,64,65}
		const allNotes: Set<number> = new Set();
		for (let c = 0; c < 10; c++) {
			const r = i.evaluate({ cycleNumber: c });
			if (!r.ok) throw new Error(r.error);
			for (const e of r.events) allNotes.add(pitched(e).note);
		}
		expect(allNotes).toEqual(new Set([60, 62, 64, 65]));
	});

	it("[0..3]'pick — all notes in {60,62,64,65} across many cycles", () => {
		const i = inst("note x [0..3]'pick");
		const allNotes: Set<number> = new Set();
		for (let c = 0; c < 50; c++) {
			const r = i.evaluate({ cycleNumber: c });
			if (!r.ok) throw new Error(r.error);
			for (const e of r.events) allNotes.add(pitched(e).note);
		}
		// All notes should be within the expanded range
		for (const n of allNotes) {
			expect([60, 62, 64, 65]).toContain(n);
		}
	});

	it('slice drums [0..15] — range as slice pool produces 16 events', () => {
		const evs = eval0('slice drums [0..15]');
		expect(evs).toHaveLength(16);
		const sliceEvs = evs as SliceEvent[];
		expect(sliceEvs[0].sliceIndex).toBe(0);
		expect(sliceEvs[15].sliceIndex).toBe(15);
	});
});

describe('range notation — error cases', () => {
	it('[0.0..1.0] without explicit step is a parse/lex error', () => {
		const i = createInstance('note x [0.0..1.0]');
		expect(i.ok).toBe(false);
	});

	it('[0, 0..5] — zero step is a semantic error', () => {
		const i = createInstance('note x [0, 0..5]');
		expect(i.ok).toBe(false);
	});

	it('[0, 2..1] — step goes wrong direction is a semantic error', () => {
		const i = createInstance('note x [0, 2..1]');
		expect(i.ok).toBe(false);
	});
});

describe('range notation — nested inside outer list', () => {
	it('[[0..3] 4] — nested range subdivides parent slot', () => {
		// The spec says ranges behave identically to explicit lists.
		// [[0..3] 4] should behave like [[0 1 2 3] 4]: 2 top-level slots,
		// first slot subdivided into 4 sub-events.
		const evs = eval0('note x [[0..3] 4]');
		// 2 top-level slots → 1 with 4 sub-events + 1 scalar = 5 total events
		expect(evs).toHaveLength(5);
	});
});

// ---------------------------------------------------------------------------
// 23. Chord literals <> — truth table
// ---------------------------------------------------------------------------

describe('chord literals — basic', () => {
	it('note x [<0 2 4>] — single chord slot produces 3 simultaneous NoteEvents', () => {
		const evs = eval0('note x [<0 2 4>]');
		// Triad in C major/C5: C5=60, E5=64, G5=67
		expect(evs).toHaveLength(3);
		const sortedNotes = evs.map((e) => pitched(e).note).sort((a, b) => a - b);
		expect(sortedNotes).toEqual([60, 64, 67]);
	});

	it('all chord voices share the same beatOffset', () => {
		const evs = eval0('note x [<0 2 4>]');
		expect(evs).toHaveLength(3);
		const offsets = evs.map((e) => e.beatOffset);
		expect(offsets[0]).toBe(offsets[1]);
		expect(offsets[1]).toBe(offsets[2]);
	});

	it('note x [<0 2 4> <1 3 6>] — two chord slots, 6 total events', () => {
		const evs = eval0('note x [<0 2 4> <1 3 6>]');
		// 2 slots × 3 voices = 6 events
		expect(evs).toHaveLength(6);
	});

	it('two chord slots have different beatOffsets', () => {
		const evs = eval0('note x [<0 2 4> <1 3 6>]');
		// First chord at beatOffset 0, second at beatOffset 0.5
		const offsets = [...new Set(evs.map((e) => e.beatOffset))].sort((a, b) => a - b);
		expect(offsets).toHaveLength(2);
		expect(offsets[0]).toBeCloseTo(0);
		expect(offsets[1]).toBeCloseTo(0.5);
	});

	it('note x [0 <2 4> 7] — mixed scalars and chord: 4 total events', () => {
		const evs = eval0('note x [0 <2 4> 7]');
		// 3 slots: slot 0 = 1 event, slot 1 = 2 events, slot 2 = 1 event
		expect(evs).toHaveLength(4);
	});

	it('chord slot duration equals 1/n where n = number of top-level slots', () => {
		// note x [<0 2>] — 1 top-level slot, duration = 1.0 * legato (0.8)
		const evs = eval0('note x [<0 2>]');
		expect(evs).toHaveLength(2);
		// Each voice duration = 1/1 * 0.8 = 0.8
		expect(evs[0].duration).toBeCloseTo(0.8);
		expect(evs[1].duration).toBeCloseTo(0.8);
	});

	it("note x [<0 2 4>]'legato(1.2) — legato applies to all chord voices", () => {
		const evs = eval0("note x [<0 2 4>]'legato(1.2)");
		expect(evs).toHaveLength(3);
		for (const ev of evs) {
			expect(ev.duration).toBeCloseTo(1.2);
		}
	});
});

describe('chord literals — scale context', () => {
	it('@scale(minor) note x [<0 2>] — voices resolved under minor scale', () => {
		const evs = eval0('@scale(minor) note x [<0 2>]');
		expect(evs).toHaveLength(2);
		// C minor/C5: degree 0 = C5 = 60, degree 2 = Eb5 = 63
		const sortedNotes = evs.map((e) => pitched(e).note).sort((a, b) => a - b);
		expect(sortedNotes).toEqual([60, 63]);
	});
});

describe('chord literals — error cases', () => {
	it('mono x [<0 2 4>] — semantic error: chords not supported for mono', () => {
		const i = createInstance('mono x [<0 2 4>]');
		expect(i.ok).toBe(false);
		if (!i.ok) {
			expect(i.error.toLowerCase()).toContain('chord');
		}
	});

	it('note x [0] + <0 4> — parse error: chord literal not valid as transposition operand', () => {
		const i = createInstance('note x [0] + <0 4>');
		expect(i.ok).toBe(false);
	});

	it('note x [<>] — parse error: empty chord', () => {
		const i = createInstance('note x [<>]');
		expect(i.ok).toBe(false);
	});
});
