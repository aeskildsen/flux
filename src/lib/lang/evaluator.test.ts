/**
 * Evaluator tests for Phase 6b: CycleContext, 'lock, and 'eager(n) semantics.
 *
 * The evaluator API:
 *   createInstance(source) → EvalInstance | { ok: false, error }
 *   instance.evaluate(ctx)  → { ok: true, events: ScheduledEvent[] } | { ok: false, error }
 *
 * Tests drive the evaluator through explicit cycle boundaries so we can assert
 * on exactly when generators are (re-)sampled without relying on random output.
 * We use 0step1xN (Pseries: 0, 1, 2, …) as a deterministic, always-different
 * source so "same value" vs "new value" is unambiguous.
 *
 * Test battery derived from:
 *   DSL-truthtables.md §2  (Modifier Precedence)
 *   DSL-spec.md §Modifier syntax → 'lock and 'eager(n)
 *
 * Note: 'eager(0) does not exist in the language — it is a semantic error.
 * The minimum valid period is 1 (once per cycle, which is also the default).
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { createInstance, type CycleContext } from './evaluator.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create an instance (throws on error) and run it for `numCycles` cycles.
 * Returns a 2-D array: notes[cycleIndex][eventIndex].
 */
function collectNotes(source: string, numCycles: number): number[][] {
	const inst = createInstance(source);
	if (!inst.ok) throw new Error(`Instance error: ${inst.error}`);
	const result: number[][] = [];
	for (let cycle = 0; cycle < numCycles; cycle++) {
		const ctx: CycleContext = { cycleNumber: cycle };
		const ev = inst.evaluate(ctx);
		if (!ev.ok) throw new Error(`Eval error (cycle ${cycle}): ${ev.error}`);
		result.push(ev.events.map((e) => e.note));
	}
	return result;
}

/** Collect the first note from each of N cycles (module-scope for use across describe blocks). */
function notesAcrossCycles(source: string, numCycles: number): number[] {
	return collectNotes(source, numCycles).map((c) => c[0]);
}

// ---------------------------------------------------------------------------
// createInstance — basic interface
// ---------------------------------------------------------------------------

describe('createInstance — basic interface', () => {
	it('returns ok:true for a valid loop', () => {
		const inst = createInstance('loop [0 2 4]');
		expect(inst.ok).toBe(true);
	});

	it('returns ok:false for parse errors', () => {
		const inst = createInstance('loop [0 1 2'); // unclosed bracket
		expect(inst.ok).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// evaluate — per-cycle output
// ---------------------------------------------------------------------------

describe('instance.evaluate — per-cycle output', () => {
	it('produces one ScheduledEvent per list element', () => {
		const inst = createInstance('loop [0 2 4]');
		if (!inst.ok) throw new Error(inst.error);
		const res = inst.evaluate({ cycleNumber: 0 });
		if (!res.ok) throw new Error(res.error);
		expect(res.events).toHaveLength(3);
	});

	it('each event has a note, beatOffset, and duration', () => {
		const inst = createInstance('loop [0 2 4]');
		if (!inst.ok) throw new Error(inst.error);
		const res = inst.evaluate({ cycleNumber: 0 });
		if (!res.ok) throw new Error(res.error);
		for (const ev of res.events) {
			expect(typeof ev.note).toBe('number');
			expect(typeof ev.beatOffset).toBe('number');
			expect(typeof ev.duration).toBe('number');
		}
	});

	it('distributes events evenly across 1 beat: 4 events → offsets 0, 0.25, 0.5, 0.75', () => {
		const inst = createInstance('loop [0 1 2 3]');
		if (!inst.ok) throw new Error(inst.error);
		const res = inst.evaluate({ cycleNumber: 0 });
		if (!res.ok) throw new Error(res.error);
		expect(res.events[0].beatOffset).toBeCloseTo(0);
		expect(res.events[1].beatOffset).toBeCloseTo(0.25);
		expect(res.events[2].beatOffset).toBeCloseTo(0.5);
		expect(res.events[3].beatOffset).toBeCloseTo(0.75);
	});
});

// ---------------------------------------------------------------------------
// eager(1) — default: resample once per cycle
// ---------------------------------------------------------------------------

describe('eager(1) — default: resample at each cycle boundary', () => {
	it('step generator advances once per cycle (one-element list)', () => {
		// 0step1x4 → degrees [0,1,2,3].  With eager(1) each cycle draws the
		// next value, so all 4 cycles produce distinct notes.
		const notes = collectNotes('loop [0step1x4]', 4);
		const uniqueValues = new Set(notes.map((c) => c[0]));
		expect(uniqueValues.size).toBe(4);
	});

	it('constant literal produces the same note every cycle', () => {
		const notes = collectNotes('loop [0]', 4);
		const first = notes[0][0];
		for (const cycle of notes) expect(cycle[0]).toBe(first);
	});

	it('step generator: value within a cycle is fixed (cycle-boundary model)', () => {
		// A single-element list: the one event per cycle always sees the value
		// drawn at cycle start — calling evaluate again with the same cycleNumber
		// must return the same note (the cache is keyed on cycle number).
		const inst = createInstance('loop [0step1x4]');
		if (!inst.ok) throw new Error(inst.error);
		const res0a = inst.evaluate({ cycleNumber: 0 });
		const res0b = inst.evaluate({ cycleNumber: 0 });
		if (!res0a.ok || !res0b.ok) throw new Error('eval failed');
		expect(res0a.events[0].note).toBe(res0b.events[0].note);
	});
});

// ---------------------------------------------------------------------------
// lock — sample once, freeze forever
// ---------------------------------------------------------------------------

describe("'lock — freeze on first sample", () => {
	it("step generator with 'lock returns same value across all cycles", () => {
		const notes = collectNotes("loop [0step1x4'lock]", 4);
		const first = notes[0][0];
		for (const cycle of notes) {
			expect(cycle[0]).toBe(first);
		}
	});

	it("'lock at list level freezes all elements independently", () => {
		// Each element's generator locks at its own first-drawn value.
		const notes = collectNotes("loop [0step1x4 1step1x4]'lock", 4);
		expect(notes[1]).toEqual(notes[0]);
		expect(notes[2]).toEqual(notes[0]);
		expect(notes[3]).toEqual(notes[0]);
	});

	it("'lock and eager(1) produce different behaviour over multiple cycles", () => {
		// Without lock, the step generator advances each cycle.
		// With lock, it stays at the first value forever.
		const withLock = collectNotes("loop [0step1x4'lock]", 4);
		const withEager = collectNotes('loop [0step1x4]', 4);
		// eager: 4 distinct values across 4 cycles
		expect(new Set(withEager.map((c) => c[0])).size).toBe(4);
		// lock: all cycles return the same value
		expect(new Set(withLock.map((c) => c[0])).size).toBe(1);
	});
});

// ---------------------------------------------------------------------------
// eager(n) — resample every n cycles
// ---------------------------------------------------------------------------

describe('eager(n) — resample every n cycles', () => {
	it('eager(2): same value in cycles 0–1, new value at cycle 2, same in cycles 2–3', () => {
		const notes = collectNotes("loop [0step1x4'eager(2)]", 4);
		expect(notes[0][0]).toBe(notes[1][0]); // held: cycles 0 and 1
		expect(notes[2][0]).not.toBe(notes[0][0]); // redrawn at cycle 2
		expect(notes[2][0]).toBe(notes[3][0]); // held: cycles 2 and 3
	});

	it('eager(3): value constant for 3 cycles, then resamples at cycle 3', () => {
		const notes = collectNotes("loop [0step1x4'eager(3)]", 6);
		expect(notes[0][0]).toBe(notes[1][0]);
		expect(notes[1][0]).toBe(notes[2][0]);
		expect(notes[3][0]).not.toBe(notes[0][0]);
		expect(notes[3][0]).toBe(notes[4][0]);
		expect(notes[4][0]).toBe(notes[5][0]);
	});

	it('eager(1) on list propagates to elements as the default', () => {
		// Explicit eager(1) on the list: same as the default.
		// Step generator should still advance each cycle.
		const notes = collectNotes("loop [0step1x4]'eager(1)", 4);
		expect(new Set(notes.map((c) => c[0])).size).toBe(4);
	});
});

// ---------------------------------------------------------------------------
// Modifier precedence (truth table 2: inner overrides outer)
// ---------------------------------------------------------------------------

describe('modifier precedence: inner overrides outer', () => {
	it("inner 'lock beats outer eager(1) default — value frozen (truth table 2 row 1)", () => {
		const notes = collectNotes("loop [0step1x4'lock]", 4);
		const first = notes[0][0];
		for (const cycle of notes) expect(cycle[0]).toBe(first);
	});

	it("inner 'lock beats outer 'eager(3) — value frozen (truth table 2 row 2)", () => {
		// Outer eager(3) would redraw every 3 cycles; inner lock overrides.
		const notes = collectNotes("loop [0step1x4'lock]'eager(3)", 6);
		const first = notes[0][0];
		for (const cycle of notes) expect(cycle[0]).toBe(first);
	});

	it("inner 'eager(2) beats outer 'lock — resamples every 2 (truth table 2 row 3)", () => {
		// Outer 'lock would freeze; inner eager(2) overrides.
		const notes = collectNotes("loop [0step1x4'eager(2)]'lock", 4);
		expect(notes[0][0]).toBe(notes[1][0]); // held: cycles 0 and 1
		expect(notes[2][0]).not.toBe(notes[0][0]); // redrawn at cycle 2 (inner wins)
	});

	it("inner 'eager(2) beats outer 'eager(5) — resamples every 2 not every 5 (truth table 2 row 4)", () => {
		const notes = collectNotes("loop [0step1x4'eager(2)]'eager(5)", 4);
		expect(notes[0][0]).toBe(notes[1][0]);
		expect(notes[2][0]).not.toBe(notes[0][0]);
	});

	it("no inner annotation, outer 'lock applies — value frozen (truth table 2 row 5)", () => {
		const notes = collectNotes("loop [0step1x4]'lock", 4);
		const first = notes[0][0];
		for (const cycle of notes) expect(cycle[0]).toBe(first);
	});

	it("no inner annotation, outer 'eager(2) applies — resamples every 2 cycles (truth table 2 row 6)", () => {
		const notes = collectNotes("loop [0step1x4]'eager(2)", 4);
		expect(notes[0][0]).toBe(notes[1][0]);
		expect(notes[2][0]).not.toBe(notes[0][0]);
	});
});

// ---------------------------------------------------------------------------
// Generator correctness — degree-to-MIDI mapping for all generator types.
// These tests were previously in parser.test.ts using the legacy evaluate()
// API; they now use createInstance + evaluate(ctx).
// All use C major / C5 = MIDI 60 (the evaluator's hardcoded default for now).
// ---------------------------------------------------------------------------

describe('numeric generators — degree-to-MIDI correctness', () => {
	/** Collect the first N notes from cycle 0 of a loop. */
	function notesFromCycle0(source: string, count: number): number[] {
		const inst = createInstance(source);
		if (!inst.ok) throw new Error(inst.error);
		const res = inst.evaluate({ cycleNumber: 0 });
		if (!res.ok) throw new Error(res.error);
		return res.events.slice(0, count).map((e) => e.note);
	}

	/** Collect cycle-0 notes across multiple instances (each fresh) to test
	 *  stateful generators that advance per cycle. */
	function notesAcrossCycles(source: string, numCycles: number): number[] {
		return collectNotes(source, numCycles).map((c) => c[0]);
	}

	it('negative degrees: degree -1 → B4 = MIDI 59, degree 0 → C5 = 60', () => {
		const notes = notesFromCycle0('loop [-1 0]', 2);
		expect(notes[0]).toBe(59);
		expect(notes[1]).toBe(60);
	});

	it('rand: all sampled degrees within [0, 4] map to valid C-major notes', () => {
		// degrees 0–4: C5=60, D5=62, E5=64, F5=65, G5=67
		const valid = new Set([60, 62, 64, 65, 67]);
		const inst = createInstance('loop [0rand4]');
		if (!inst.ok) throw new Error(inst.error);
		for (let cycle = 0; cycle < 50; cycle++) {
			const res = inst.evaluate({ cycleNumber: cycle });
			if (!res.ok) throw new Error(res.error);
			expect(valid.has(res.events[0].note)).toBe(true);
		}
	});

	it('rand: produces more than one distinct note over many cycles', () => {
		const notes = notesAcrossCycles('loop [0rand6]', 100);
		expect(new Set(notes).size).toBeGreaterThan(1);
	});

	it('gau: produces varying notes (mean=3, sdev=1)', () => {
		const notes = notesAcrossCycles('loop [3gau1]', 100);
		expect(new Set(notes).size).toBeGreaterThan(1);
	});

	it('exp: all notes within degree range [1, 7] → MIDI [62, 72]', () => {
		const inst = createInstance('loop [1exp7]');
		if (!inst.ok) throw new Error(inst.error);
		for (let cycle = 0; cycle < 50; cycle++) {
			const res = inst.evaluate({ cycleNumber: cycle });
			if (!res.ok) throw new Error(res.error);
			expect(res.events[0].note).toBeGreaterThanOrEqual(62); // degree 1 = D5
			expect(res.events[0].note).toBeLessThanOrEqual(72); // degree 7 = C6
		}
	});

	it('bro: stays within degree range [0, 6] → MIDI [60, 71]', () => {
		const inst = createInstance('loop [0bro6m1]');
		if (!inst.ok) throw new Error(inst.error);
		for (let cycle = 0; cycle < 100; cycle++) {
			const res = inst.evaluate({ cycleNumber: cycle });
			if (!res.ok) throw new Error(res.error);
			expect(res.events[0].note).toBeGreaterThanOrEqual(60);
			expect(res.events[0].note).toBeLessThanOrEqual(71);
		}
	});

	it('bro: changes value over time (stateful)', () => {
		const notes = notesAcrossCycles('loop [0bro6m2]', 50);
		expect(new Set(notes).size).toBeGreaterThan(1);
	});

	it('step: cycles through correct degrees — loop [0step2x4]', () => {
		// Pseries(start=0, step=2, length=4) → degrees [0, 2, 4, 6], repeating
		// C major: C5=60, E5=64, G5=67, B5=71
		const notes = notesAcrossCycles('loop [0step2x4]', 8);
		expect(notes).toEqual([60, 64, 67, 71, 60, 64, 67, 71]);
	});

	it('mul: cycles through correct degrees — loop [1mul2x4]', () => {
		// Pgeom(start=1, mul=2, length=4) → degrees [1, 2, 4, 8], repeating
		// C major: D5=62, E5=64, G5=67, D6=74
		const notes = notesAcrossCycles('loop [1mul2x4]', 5);
		expect(notes).toEqual([62, 64, 67, 74, 62]);
	});

	it('lin: spans from first to last degree — loop [0lin4x3]', () => {
		// linear interp first=0, last=4, length=3 → degrees [0, 2, 4]
		// C major: C5=60, E5=64, G5=67
		const notes = notesAcrossCycles('loop [0lin4x3]', 4);
		expect(notes).toEqual([60, 64, 67, 60]); // wraps
	});

	it('geo: produces geometrically spaced degrees — loop [1geo8x4]', () => {
		// geometric interp first=1, last=8, length=4 → degrees [1, 2, 4, 8]
		// C major: D5=62, E5=64, G5=67, D6=74
		const notes = notesAcrossCycles('loop [1geo8x4]', 4);
		expect(notes).toEqual([62, 64, 67, 74]);
	});
});

// ---------------------------------------------------------------------------
// rand / tilde — float bound semantics
//
// The generator's output type follows its inputs: if either bound is a float,
// the generator samples a continuous float from [min, max). If both bounds are
// integers, it samples an integer from [min, max] (inclusive, via floor).
//
// Rounding to the nearest integer happens *downstream* at degreeToMidi, not
// inside the generator. Float output is therefore most meaningful in
// non-degree contexts (e.g. 'legato). In degree context the float round-trips
// through Math.round inside degreeToMidi, so the observable MIDI note is the
// nearest degree.
//
// We verify exact output by spying on Math.random with a known return value,
// then computing the expected result by hand for each branch.
// ---------------------------------------------------------------------------

describe('rand / tilde — float bound semantics', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	// -------------------------------------------------------------------------
	// Integer bounds — baseline: floor(random * (max - min + 1)) + min
	// -------------------------------------------------------------------------

	it('integer bounds: Math.random()=0.0 → min', () => {
		vi.spyOn(Math, 'random').mockReturnValue(0);
		// floor(0 * (4 - 0 + 1)) + 0 = 0  → C5 = MIDI 60
		const inst = createInstance('loop [0rand4]');
		if (!inst.ok) throw new Error(inst.error);
		const res = inst.evaluate({ cycleNumber: 0 });
		if (!res.ok) throw new Error(res.error);
		expect(res.events[0].note).toBe(60);
	});

	it('integer bounds: Math.random()=0.999 → max', () => {
		vi.spyOn(Math, 'random').mockReturnValue(0.999);
		// floor(0.999 * 5) + 0 = floor(4.995) = 4  → G5 = MIDI 67
		const inst = createInstance('loop [0rand4]');
		if (!inst.ok) throw new Error(inst.error);
		const res = inst.evaluate({ cycleNumber: 0 });
		if (!res.ok) throw new Error(res.error);
		expect(res.events[0].note).toBe(67);
	});

	it('integer bounds: produces only integer degrees (never fractional MIDI)', () => {
		// All MIDI output from integer rand must be a whole number (which it always
		// is post-degreeToMidi, but this guards against unexpected cent values).
		const inst = createInstance('loop [0rand6]');
		if (!inst.ok) throw new Error(inst.error);
		for (let cycle = 0; cycle < 50; cycle++) {
			const res = inst.evaluate({ cycleNumber: cycle });
			if (!res.ok) throw new Error(res.error);
			expect(Number.isInteger(res.events[0].note)).toBe(true);
			expect(res.events[0].cent).toBeUndefined();
		}
	});

	// -------------------------------------------------------------------------
	// Float min, integer max — output is continuous float
	// -------------------------------------------------------------------------

	it('float min, int max: Math.random()=0.0 → min exactly', () => {
		vi.spyOn(Math, 'random').mockReturnValue(0);
		// expected raw degree: 0.0 * (4 - 0.5) + 0.5 = 0.5 → Math.round(0.5) = 1 → D5 = MIDI 62
		// (currently the impl floors, so this test will FAIL until the fix is applied)
		const inst = createInstance('loop [0.5rand4]');
		if (!inst.ok) throw new Error(inst.error);
		const res = inst.evaluate({ cycleNumber: 0 });
		if (!res.ok) throw new Error(res.error);
		// degree 0.5 rounds to 1 → D5
		expect(res.events[0].note).toBe(62);
	});

	it('float min, int max: Math.random()=1.0 → approaches max (open interval)', () => {
		vi.spyOn(Math, 'random').mockReturnValue(1 - Number.EPSILON);
		// raw degree ≈ 3.5 - ε → Math.round ≈ 4 → G5 = MIDI 67
		const inst = createInstance('loop [0.5rand4]');
		if (!inst.ok) throw new Error(inst.error);
		const res = inst.evaluate({ cycleNumber: 0 });
		if (!res.ok) throw new Error(res.error);
		// degree just below 3.5 rounds to 3 or 4 depending on exact value;
		// either way it must be a valid C-major degree in [1..4] → MIDI in [62..67]
		expect(res.events[0].note).toBeGreaterThanOrEqual(62);
		expect(res.events[0].note).toBeLessThanOrEqual(67);
	});

	it('float min (0.), int max: all sampled degrees round to valid C-major notes', () => {
		// 0.rand4 — min is 0.0 (trailing dot), max is 4
		// continuous output in [0.0, 4.0) — Math.round(3.999) = 4, so degrees 0–4 are all reachable
		const valid = new Set([60, 62, 64, 65, 67]);
		const inst = createInstance('loop [0.rand4]');
		if (!inst.ok) throw new Error(inst.error);
		for (let cycle = 0; cycle < 100; cycle++) {
			const res = inst.evaluate({ cycleNumber: cycle });
			if (!res.ok) throw new Error(res.error);
			expect(valid.has(res.events[0].note)).toBe(true);
		}
	});

	// -------------------------------------------------------------------------
	// Integer min, float max — output is continuous float
	// -------------------------------------------------------------------------

	it('int min, float max: Math.random()=0.0 → min exactly', () => {
		vi.spyOn(Math, 'random').mockReturnValue(0);
		// raw degree: 0.0 * (3.5 - 0) + 0 = 0.0 → Math.round(0) = 0 → C5 = MIDI 60
		const inst = createInstance('loop [0rand3.5]');
		if (!inst.ok) throw new Error(inst.error);
		const res = inst.evaluate({ cycleNumber: 0 });
		if (!res.ok) throw new Error(res.error);
		expect(res.events[0].note).toBe(60);
	});

	it('int min, float max: all sampled degrees round to valid C-major notes', () => {
		// 0rand3.5 — output in [0.0, 3.5) rounds to degree 0–3 → MIDI [60, 62, 64, 65]
		const valid = new Set([60, 62, 64, 65]);
		const inst = createInstance('loop [0rand3.5]');
		if (!inst.ok) throw new Error(inst.error);
		for (let cycle = 0; cycle < 100; cycle++) {
			const res = inst.evaluate({ cycleNumber: cycle });
			if (!res.ok) throw new Error(res.error);
			expect(valid.has(res.events[0].note)).toBe(true);
		}
	});

	// -------------------------------------------------------------------------
	// Both bounds float
	// -------------------------------------------------------------------------

	it('both float bounds: Math.random()=0.0 → min exactly', () => {
		vi.spyOn(Math, 'random').mockReturnValue(0);
		// raw degree: 0.0 * (3.5 - 0.5) + 0.5 = 0.5 → Math.round(0.5) = 1 → D5 = MIDI 62
		const inst = createInstance('loop [0.5rand3.5]');
		if (!inst.ok) throw new Error(inst.error);
		const res = inst.evaluate({ cycleNumber: 0 });
		if (!res.ok) throw new Error(res.error);
		expect(res.events[0].note).toBe(62);
	});

	it('both float bounds: Math.random()=0.5 → midpoint', () => {
		vi.spyOn(Math, 'random').mockReturnValue(0.5);
		// raw degree: 0.5 * (3.5 - 0.5) + 0.5 = 1.5 + 0.5 = 2.0 → Math.round(2.0) = 2 → E5 = MIDI 64
		const inst = createInstance('loop [0.5rand3.5]');
		if (!inst.ok) throw new Error(inst.error);
		const res = inst.evaluate({ cycleNumber: 0 });
		if (!res.ok) throw new Error(res.error);
		expect(res.events[0].note).toBe(64);
	});

	it('both float bounds: produces more than one distinct note over many cycles', () => {
		const notes = notesAcrossCycles('loop [0.5rand3.5]', 100);
		expect(new Set(notes).size).toBeGreaterThan(1);
	});

	// -------------------------------------------------------------------------
	// Tilde (~) — syntactic sugar for rand, same float semantics
	// -------------------------------------------------------------------------

	it('tilde with integer bounds: Math.random()=0.0 → min', () => {
		vi.spyOn(Math, 'random').mockReturnValue(0);
		const inst = createInstance('loop [0~4]');
		if (!inst.ok) throw new Error(inst.error);
		const res = inst.evaluate({ cycleNumber: 0 });
		if (!res.ok) throw new Error(res.error);
		expect(res.events[0].note).toBe(60);
	});

	it('tilde with float min: Math.random()=0.0 → same result as float rand', () => {
		vi.spyOn(Math, 'random').mockReturnValue(0);
		const instRand = createInstance('loop [0.5rand4]');
		const instTilde = createInstance('loop [0.5~4]');
		if (!instRand.ok) throw new Error(instRand.error);
		if (!instTilde.ok) throw new Error(instTilde.error);
		const resRand = instRand.evaluate({ cycleNumber: 0 });
		const resTilde = instTilde.evaluate({ cycleNumber: 0 });
		if (!resRand.ok) throw new Error(resRand.error);
		if (!resTilde.ok) throw new Error(resTilde.error);
		expect(resTilde.events[0].note).toBe(resRand.events[0].note);
	});

	it('tilde with float max: all sampled degrees in valid range', () => {
		const valid = new Set([60, 62, 64, 65]);
		const inst = createInstance('loop [0~3.5]');
		if (!inst.ok) throw new Error(inst.error);
		for (let cycle = 0; cycle < 100; cycle++) {
			const res = inst.evaluate({ cycleNumber: cycle });
			if (!res.ok) throw new Error(res.error);
			expect(valid.has(res.events[0].note)).toBe(true);
		}
	});

	// -------------------------------------------------------------------------
	// Edge cases
	// -------------------------------------------------------------------------

	it('min === max (float): always returns min', () => {
		const inst = createInstance('loop [2.5rand2.5]');
		if (!inst.ok) throw new Error(inst.error);
		for (let cycle = 0; cycle < 10; cycle++) {
			const res = inst.evaluate({ cycleNumber: cycle });
			if (!res.ok) throw new Error(res.error);
			// degree 2.5 rounds to 3 → F5 = MIDI 65
			expect(res.events[0].note).toBe(65);
		}
	});

	it('min === max (integer): always returns that degree', () => {
		const inst = createInstance('loop [3rand3]');
		if (!inst.ok) throw new Error(inst.error);
		for (let cycle = 0; cycle < 10; cycle++) {
			const res = inst.evaluate({ cycleNumber: cycle });
			if (!res.ok) throw new Error(res.error);
			// degree 3 → F5 = MIDI 65
			expect(res.events[0].note).toBe(65);
		}
	});

	it('negative float min: Math.random()=0.0 → min degree (rounds correctly)', () => {
		vi.spyOn(Math, 'random').mockReturnValue(0);
		// raw degree: -0.5 → Math.round(-0.5) = 0 → C5 = MIDI 60
		const inst = createInstance('loop [-0.5rand2]');
		if (!inst.ok) throw new Error(inst.error);
		const res = inst.evaluate({ cycleNumber: 0 });
		if (!res.ok) throw new Error(res.error);
		expect(res.events[0].note).toBe(60);
	});

	it('negative float min: all sampled notes within expected range', () => {
		// -0.5rand2 → continuous output in [-0.5, 2.0)
		// Math.round(-0.5) = 0 in JS (rounds toward +Infinity at halfway), so degree -1
		// is unreachable. Reachable degrees: 0, 1 (Math.round(1.999) = 2 is also reachable).
		// C major: C5=60, D5=62, E5=64
		const valid = new Set([60, 62, 64]);
		const inst = createInstance('loop [-0.5rand2]');
		if (!inst.ok) throw new Error(inst.error);
		for (let cycle = 0; cycle < 100; cycle++) {
			const res = inst.evaluate({ cycleNumber: cycle });
			if (!res.ok) throw new Error(res.error);
			expect(valid.has(res.events[0].note)).toBe(true);
		}
	});

	it('float bound in multi-element list: each element independently sampled', () => {
		// Both elements use float rand — verify both stay in valid ranges
		// [0.5rand2] → rounds to 1 or 2 → D5=62 or E5=64
		// [2.5rand4] → rounds to 3 or 4 → F5=65 or G5=67
		const validFirst = new Set([62, 64]);
		const validSecond = new Set([65, 67]);
		const inst = createInstance('loop [0.5rand2 2.5rand4]');
		if (!inst.ok) throw new Error(inst.error);
		for (let cycle = 0; cycle < 100; cycle++) {
			const res = inst.evaluate({ cycleNumber: cycle });
			if (!res.ok) throw new Error(res.error);
			expect(validFirst.has(res.events[0].note)).toBe(true);
			expect(validSecond.has(res.events[1].note)).toBe(true);
		}
	});
});
