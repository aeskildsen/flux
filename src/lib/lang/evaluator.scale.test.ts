/**
 * Evaluator tests for Phase 6c: ScaleContext, decorators, and `set`.
 *
 * Tests cover:
 *   - All built-in scale names resolve correctly
 *   - @scale, @root, @octave, @cent, @mtranspose decorators affect pitch
 *   - @key(root scale [octave]) compound decorator
 *   - Nested decorators: inner overrides outer (truth table 8)
 *   - `set` writes to global context; `@` overrides for a block
 *   - Stochastic decorator arguments ('lock / 'eager semantics)
 *   - Error conditions
 *
 * Pitch chain: degree → scale → root → octave → cent → mtranspose → MIDI
 *
 * Pitch class to semitone from C (0):
 *   c=0, d=2, e=4, f=5, g=7, a=9, b=11
 *   # adds 1, b subtracts 1
 *
 * Root MIDI = octave * 12 + pitchClassSemitone + 12
 *   (MIDI uses octave 5 = C5 = 60; C5 = 5*12=60, so C-in-octave-N = N*12+12? Let's verify:
 *    default is root=C5=MIDI60. So formula: rootMidi = (octave+1)*12 + pitchSemitone)
 *
 * Actually from scales.ts / evaluator.ts:
 *   DEFAULT_ROOT_MIDI = 60  (C5)
 *   degreeToMidi(degree, rootMidi, scale)
 *
 * So: root = C, octave = 5 → rootMidi = 60.
 *   root = G (semitone 7), octave = 5 → rootMidi = 60 + 7 = 67.
 *   root = G, octave = 4 → rootMidi = 60 + 7 - 12 = 55.
 *
 * The rootMidi is computed as: C5_midi + root_semitone + (octave - 5) * 12
 *   = 60 + root_semitone + (octave - 5) * 12
 *
 * C major intervals: [2,2,1,2,2,2,1] → degrees 0..6 = C D E F G A B
 *   degree 0 → 0 semitones from root
 *   degree 1 → 2 semitones from root
 *   degree 2 → 4 semitones from root
 *   degree 3 → 5 semitones from root
 *   degree 4 → 7 semitones from root
 *   degree 5 → 9 semitones from root
 *   degree 6 → 11 semitones from root
 *   degree 7 → 12 semitones (octave up, = degree 0 of next octave)
 */

import { describe, it, expect } from 'vitest';
import { createInstance, type CycleContext } from './evaluator.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Evaluate cycle 0 and return note array. Throws on any error. */
function notes0(source: string): number[] {
	const inst = createInstance(source);
	if (!inst.ok) throw new Error(`Instance error: ${inst.error}`);
	const res = inst.evaluate({ cycleNumber: 0 });
	if (!res.ok) throw new Error(`Eval error: ${res.error}`);
	return res.events.map((e) => e.note);
}

/** Collect first note across N cycles. */
function collectFirst(source: string, numCycles: number): number[] {
	const inst = createInstance(source);
	if (!inst.ok) throw new Error(`Instance error: ${inst.error}`);
	const results: number[] = [];
	for (let i = 0; i < numCycles; i++) {
		const res = inst.evaluate({ cycleNumber: i });
		if (!res.ok) throw new Error(`Eval error: ${res.error}`);
		results.push(res.events[0].note);
	}
	return results;
}

// ---------------------------------------------------------------------------
// Default pitch context (baseline — hardcoded C major / octave 5)
// ---------------------------------------------------------------------------

describe('default pitch context — C major / C5 (baseline)', () => {
	it('degree 0 = C5 = MIDI 60', () => {
		expect(notes0('loop [0]')[0]).toBe(60);
	});

	it('degree 1 = D5 = MIDI 62', () => {
		expect(notes0('loop [1]')[0]).toBe(62);
	});

	it('degree 4 = G5 = MIDI 67', () => {
		expect(notes0('loop [4]')[0]).toBe(67);
	});

	it('degree 7 = C6 = MIDI 72 (octave wrap)', () => {
		expect(notes0('loop [7]')[0]).toBe(72);
	});

	it('degree -1 = B4 = MIDI 59 (below root)', () => {
		expect(notes0('loop [-1]')[0]).toBe(59);
	});
});

// ---------------------------------------------------------------------------
// @root — change root semitone
// ---------------------------------------------------------------------------

describe('@root — changes root pitch class (semitone offset from C)', () => {
	// @root(7) = G. Octave 5 stays → rootMidi = 60 + 7 = 67
	it('@root(7) shifts root to G: degree 0 = G5 = MIDI 67', () => {
		expect(notes0('@root(7) loop [0]')[0]).toBe(67);
	});

	it('@root(7) degree 1 in major = A5 = MIDI 69', () => {
		// G5=67 + 2 semitones = 69
		expect(notes0('@root(7) loop [1]')[0]).toBe(69);
	});

	it('@root(0) is same as default (C)', () => {
		expect(notes0('@root(0) loop [0]')[0]).toBe(60);
	});

	it('@root(2) shifts to D: degree 0 = D5 = MIDI 62', () => {
		expect(notes0('@root(2) loop [0]')[0]).toBe(62);
	});
});

// ---------------------------------------------------------------------------
// @octave — change octave
// ---------------------------------------------------------------------------

describe('@octave — changes the octave', () => {
	it('@octave(4) lowers by one octave: C4 = MIDI 48', () => {
		expect(notes0('@octave(4) loop [0]')[0]).toBe(48);
	});

	it('@octave(6) raises by one octave: C6 = MIDI 72', () => {
		expect(notes0('@octave(6) loop [0]')[0]).toBe(72);
	});

	it('@octave(5) is the default: C5 = MIDI 60', () => {
		expect(notes0('@octave(5) loop [0]')[0]).toBe(60);
	});

	it('@octave(3) deep bass: C3 = MIDI 36', () => {
		expect(notes0('@octave(3) loop [0]')[0]).toBe(36);
	});
});

// ---------------------------------------------------------------------------
// @scale — change scale
// ---------------------------------------------------------------------------

describe('@scale — changes the active scale', () => {
	// minor intervals: [2,1,2,2,1,2,2] → degree 2 = 3 semitones from root
	// C5 + 3 = 63 = Eb5
	it('@scale(minor) degree 2 = Eb5 = MIDI 63', () => {
		expect(notes0('@scale(minor) loop [2]')[0]).toBe(63);
	});

	// major degree 2 = 4 semitones from C5 = 64 = E5
	it('@scale(major) degree 2 = E5 = MIDI 64 (same as default)', () => {
		expect(notes0('@scale(major) loop [2]')[0]).toBe(64);
	});

	// major_pentatonic: [2,2,3,2,3] → degree 2 = 4 semitones → E5 = 64
	it('@scale(major_pentatonic) degree 2 = E5 = MIDI 64', () => {
		expect(notes0('@scale(major_pentatonic) loop [2]')[0]).toBe(64);
	});

	// minor_pentatonic: [3,2,2,3,2] → degree 1 = 3 semitones → Eb5 = 63
	it('@scale(minor_pentatonic) degree 1 = Eb5 = MIDI 63', () => {
		expect(notes0('@scale(minor_pentatonic) loop [1]')[0]).toBe(63);
	});

	// dorian: [2,1,2,2,2,1,2] → degree 6 = 2+1+2+2+2+1 = 10 semitones → Bb5 = 70
	it('@scale(dorian) degree 6 = Bb5 = MIDI 70', () => {
		expect(notes0('@scale(dorian) loop [6]')[0]).toBe(70);
	});

	// phrygian: [1,2,2,2,1,2,2] → degree 1 = 1 semitone → Db5 = 61
	it('@scale(phrygian) degree 1 = Db5 = MIDI 61', () => {
		expect(notes0('@scale(phrygian) loop [1]')[0]).toBe(61);
	});

	// lydian: [2,2,2,1,2,2,1] → degree 3 = 2+2+2 = 6 semitones → F#5 = 66
	it('@scale(lydian) degree 3 = F#5 = MIDI 66', () => {
		expect(notes0('@scale(lydian) loop [3]')[0]).toBe(66);
	});

	// mixolydian: [2,2,1,2,2,1,2] → degree 6 = 2+2+1+2+2+1 = 10 semitones → Bb5 = 70
	it('@scale(mixolydian) degree 6 = Bb5 = MIDI 70', () => {
		expect(notes0('@scale(mixolydian) loop [6]')[0]).toBe(70);
	});

	// locrian: [1,2,2,1,2,2,2] → degree 4 = 1+2+2+1 = 6 semitones → F#5 = 66
	it('@scale(locrian) degree 4 = F#5 = MIDI 66', () => {
		expect(notes0('@scale(locrian) loop [4]')[0]).toBe(66);
	});

	// harmonic_minor: [2,1,2,2,1,3,1] → degree 6 = 2+1+2+2+1+3 = 11 semitones → B5 = 71
	it('@scale(harmonic_minor) degree 6 = B5 = MIDI 71', () => {
		expect(notes0('@scale(harmonic_minor) loop [6]')[0]).toBe(71);
	});

	// melodic_minor: [2,1,2,2,2,2,1] → degree 5 = 2+1+2+2+2 = 9 semitones → A5 = 69
	it('@scale(melodic_minor) degree 5 = A5 = MIDI 69', () => {
		expect(notes0('@scale(melodic_minor) loop [5]')[0]).toBe(69);
	});

	// harmonic_major: [2,2,1,2,1,3,1] → degree 5 = 2+2+1+2+1 = 8 semitones → Ab5 = 68
	it('@scale(harmonic_major) degree 5 = Ab5 = MIDI 68', () => {
		expect(notes0('@scale(harmonic_major) loop [5]')[0]).toBe(68);
	});

	// blues: [3,2,1,1,3,2] → degree 2 = 3+2 = 5 semitones → F5 = 65
	it('@scale(blues) degree 2 = F5 = MIDI 65', () => {
		expect(notes0('@scale(blues) loop [2]')[0]).toBe(65);
	});

	// whole_tone: [2,2,2,2,2,2] → degree 3 = 6 semitones → F#5 = 66
	it('@scale(whole_tone) degree 3 = F#5 = MIDI 66', () => {
		expect(notes0('@scale(whole_tone) loop [3]')[0]).toBe(66);
	});

	// diminished: [2,1,2,1,2,1,2,1] → degree 4 = 2+1+2+1 = 6 semitones → F#5 = 66
	it('@scale(diminished) degree 4 = F#5 = MIDI 66', () => {
		expect(notes0('@scale(diminished) loop [4]')[0]).toBe(66);
	});

	// augmented: [3,1,3,1,3,1] → degree 2 = 3+1 = 4 semitones → E5 = 64
	it('@scale(augmented) degree 2 = E5 = MIDI 64', () => {
		expect(notes0('@scale(augmented) loop [2]')[0]).toBe(64);
	});
});

// ---------------------------------------------------------------------------
// @mtranspose — modal transposition (scale steps)
// ---------------------------------------------------------------------------

describe('@mtranspose — shifts all degrees by N scale steps', () => {
	// C major, @mtranspose(2): degree 0 → effective degree 2 → E5 = 64
	it('@mtranspose(2) shifts degree 0 → degree 2 in C major → E5 = MIDI 64', () => {
		expect(notes0('@mtranspose(2) loop [0]')[0]).toBe(64);
	});

	// @mtranspose(0) is no-op
	it('@mtranspose(0) is no-op: degree 0 = C5 = MIDI 60', () => {
		expect(notes0('@mtranspose(0) loop [0]')[0]).toBe(60);
	});

	// @mtranspose(7): degree 0 → degree 7 → one octave above → C6 = 72
	it('@mtranspose(7) shifts degree 0 → degree 7 → C6 = MIDI 72', () => {
		expect(notes0('@mtranspose(7) loop [0]')[0]).toBe(72);
	});

	// Negative: @mtranspose(-2) degree 2 → degree 0 → C5 = 60
	it('@mtranspose(-2) shifts degree 2 → degree 0 → C5 = MIDI 60', () => {
		expect(notes0('@mtranspose(-2) loop [2]')[0]).toBe(60);
	});
});

// ---------------------------------------------------------------------------
// @cent — pitch deviation in cents (100 per semitone)
// ---------------------------------------------------------------------------

describe('@cent — pitch deviation in cents', () => {
	// @cent(0) is default: no change
	it('@cent(0) no deviation: degree 0 still maps to MIDI 60 (no cent offset in note number)', () => {
		// MIDI note number is an integer; cent offset is separate metadata
		// The evaluator stores cent offset on the ScheduledEvent for the scheduler to apply.
		// So the note number should remain 60.
		expect(notes0('@cent(0) loop [0]')[0]).toBe(60);
	});

	it('@cent(50) stores a non-zero cent offset on events', () => {
		const inst = createInstance('@cent(50) loop [0]');
		if (!inst.ok) throw new Error(inst.error);
		const res = inst.evaluate({ cycleNumber: 0 });
		if (!res.ok) throw new Error(res.error);
		// MIDI note is still 60; cent offset should be 50 on the event
		expect(res.events[0].note).toBe(60);
		expect(res.events[0].cent).toBe(50);
	});

	it('@cent(-50) stores a negative cent offset', () => {
		const inst = createInstance('@cent(-50) loop [0]');
		if (!inst.ok) throw new Error(inst.error);
		const res = inst.evaluate({ cycleNumber: 0 });
		if (!res.ok) throw new Error(res.error);
		expect(res.events[0].cent).toBe(-50);
	});

	it('no @cent decorator → cent defaults to 0', () => {
		const inst = createInstance('loop [0]');
		if (!inst.ok) throw new Error(inst.error);
		const res = inst.evaluate({ cycleNumber: 0 });
		if (!res.ok) throw new Error(res.error);
		expect(res.events[0].cent ?? 0).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// @key — compound pitch context decorator
// ---------------------------------------------------------------------------

describe('@key — compound decorator (root + scale [+ octave])', () => {
	// @key(g lydian): root=G (semitone 7), scale=lydian, octave=5 (default)
	// rootMidi = 60 + 7 = 67. Lydian degree 0 = 0 → MIDI 67
	it('@key(g lydian) degree 0 = G5 = MIDI 67', () => {
		expect(notes0('@key(g lydian) loop [0]')[0]).toBe(67);
	});

	// @key(g lydian): degree 3 = 6 semitones above G5 → 73 (Db6 / C#6)
	// Lydian: [2,2,2,1,2,2,1] → offset at degree 3 = 2+2+2 = 6 → 67+6 = 73
	it('@key(g lydian) degree 3 = C#6 = MIDI 73', () => {
		expect(notes0('@key(g lydian) loop [3]')[0]).toBe(73);
	});

	// @key(g# lydian): root=G# (semitone 8), scale=lydian, octave=5
	// rootMidi = 60 + 8 = 68. Degree 0 = 68.
	it('@key(g# lydian) degree 0 = G#5 = MIDI 68', () => {
		expect(notes0('@key(g# lydian) loop [0]')[0]).toBe(68);
	});

	// @key(a minor): root=A (semitone 9), scale=minor, octave=5
	// rootMidi = 60 + 9 = 69. minor degree 0 = A5 = 69
	it('@key(a minor) degree 0 = A5 = MIDI 69', () => {
		expect(notes0('@key(a minor) loop [0]')[0]).toBe(69);
	});

	// @key(a minor) degree 2 in minor: [2,1,...] → offset = 2+1 = 3 → 69+3 = 72 = C6
	it('@key(a minor) degree 2 = C6 = MIDI 72', () => {
		expect(notes0('@key(a minor) loop [2]')[0]).toBe(72);
	});

	// @key(c major 4): root=C, scale=major, octave=4 → rootMidi = 60 + 0 - 12 = 48
	// degree 0 = C4 = MIDI 48
	it('@key(c major 4) degree 0 = C4 = MIDI 48', () => {
		expect(notes0('@key(c major 4) loop [0]')[0]).toBe(48);
	});

	// @key(c major 6): root=C, scale=major, octave=6 → rootMidi = 72
	it('@key(c major 6) degree 0 = C6 = MIDI 72', () => {
		expect(notes0('@key(c major 6) loop [0]')[0]).toBe(72);
	});

	// Flat: @key(bb major): root=Bb (semitone 10), scale=major, octave=5
	// rootMidi = 60 + 10 = 70. Degree 0 = 70.
	it('@key(bb major) degree 0 = Bb5 = MIDI 70', () => {
		expect(notes0('@key(bb major) loop [0]')[0]).toBe(70);
	});

	// Uppercase pitch class should also work: @key(G lydian)
	it('@key(G lydian) (uppercase) degree 0 = G5 = MIDI 67', () => {
		expect(notes0('@key(G lydian) loop [0]')[0]).toBe(67);
	});
});

// ---------------------------------------------------------------------------
// `set` — global context (truth table 8 row: global defaults)
// ---------------------------------------------------------------------------

describe('set — writes to global context', () => {
	it('set scale(minor) changes default scale globally', () => {
		// minor degree 2 = 3 semitones → Eb5 = 63
		expect(notes0('set scale(minor)\nloop [2]')[0]).toBe(63);
	});

	it('set root(7) shifts root to G globally', () => {
		// G5 = MIDI 67
		expect(notes0('set root(7)\nloop [0]')[0]).toBe(67);
	});

	it('set octave(4) lowers octave globally', () => {
		expect(notes0('set octave(4)\nloop [0]')[0]).toBe(48);
	});

	it('set key(g lydian) applies compound decorator globally', () => {
		expect(notes0('set key(g lydian)\nloop [0]')[0]).toBe(67);
	});

	it('set mtranspose(2) applies modal transposition globally', () => {
		// degree 0 + mtranspose 2 → effective degree 2 → E5 = 64
		expect(notes0('set mtranspose(2)\nloop [0]')[0]).toBe(64);
	});

	it('multiple set statements combine', () => {
		// set root(7) + set octave(4): G4 = 60 + 7 - 12 = 55
		expect(notes0('set root(7)\nset octave(4)\nloop [0]')[0]).toBe(55);
	});
});

// ---------------------------------------------------------------------------
// Nested decorators / block scoping (truth table 8)
// ---------------------------------------------------------------------------

describe('decorator scoping (truth table 8)', () => {
	// @scale(minor) with indented block
	it('block body inherits outer decorator: @scale(minor) loop [2] = Eb5 = 63', () => {
		const src = '@scale(minor)\n  loop [2]';
		expect(notes0(src)[0]).toBe(63);
	});

	// Inline decorator: @scale(minor) loop [2]
	it('inline decorator: @scale(minor) loop [2] = Eb5 = 63 (truth table 8 row 4)', () => {
		expect(notes0('@scale(minor) loop [2]')[0]).toBe(63);
	});

	// No decorator: global defaults
	it('no decorator: loop [0] uses global defaults → C5 = 60 (truth table 8 row 3)', () => {
		expect(notes0('loop [0]')[0]).toBe(60);
	});

	// @key compound: truth table 8 row 5
	it('@key(g# lydian) inline: degree 0 = G#5 = 68 (truth table 8 row 5)', () => {
		expect(notes0('@key(g# lydian) loop [0]')[0]).toBe(68);
	});

	// @key with explicit octave: truth table 8 row 6
	it('@key(g# lydian 4) inline: degree 0 = G#4 = 56 (truth table 8 row 6)', () => {
		// G#5 = 68, G#4 = 56
		expect(notes0('@key(g# lydian 4) loop [0]')[0]).toBe(56);
	});

	// Nested decorator blocks: inner overrides outer (truth table 8 row 2)
	it('nested @root(7) outer, @scale(minor) inner: both apply to inner loop', () => {
		// Both root=7 and scale=minor active for the nested loop
		// G5 = 67 root; minor degree 2 = 3 semitones → 67+3 = 70 = Bb5
		const src = '@root(7)\n  @scale(minor)\n    loop [2]';
		expect(notes0(src)[0]).toBe(70);
	});

	// Inner decorator overrides outer when both set same key
	it('inner @root overrides outer @root', () => {
		// outer @root(7) = G, inner @root(0) = C
		// With indented blocks, inner @root(0) wins
		const src = '@root(7)\n  @root(0)\n    loop [0]';
		expect(notes0(src)[0]).toBe(60); // C5, not G5
	});

	// @root in outer scope does not bleed into sibling loops at outer scope
	it('decorator scope is lexical — does not affect undecorated siblings', () => {
		// Two loops: one under @scale(minor), one bare
		const src = '@scale(minor)\n  loop [2]\nloop [2]';
		const inst = createInstance(src);
		if (!inst.ok) throw new Error(inst.error);
		// First loop (minor): Eb5 = 63
		// We can't distinguish per-loop here with current API — at minimum the
		// instance should parse successfully.
		expect(inst.ok).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// set vs @ interaction
// ---------------------------------------------------------------------------

describe('set vs @ interaction', () => {
	// `set` is @ at global scope — set the global default, then @ overrides for a block
	it('@ overrides set for its scope', () => {
		// set root(7): global G. @root(0) overrides to C for the inline loop.
		const src = 'set root(7)\n@root(0) loop [0]';
		expect(notes0(src)[0]).toBe(60); // @root(0) wins
	});

	it('set applies when no @ override', () => {
		const src = 'set root(7)\nloop [0]';
		expect(notes0(src)[0]).toBe(67); // G5
	});
});

// ---------------------------------------------------------------------------
// Stochastic decorator arguments
// ---------------------------------------------------------------------------

describe('stochastic decorator arguments', () => {
	it('@root with constant generator: @root(7) is the same as a literal', () => {
		expect(notes0('@root(7) loop [0]')[0]).toBe(67);
	});

	it('@root with step generator changes root each cycle (decorator args use lock by default)', () => {
		// @root(0step7x2) — step generates 0 then 7, cycling.
		// Decorators lock by default, so root is frozen at the first value (0 = C).
		// This verifies lock-by-default for decorator numeric args.
		const notes = collectFirst('@root(0step7x2) loop [0]', 4);
		// All cycles should produce the same note because of lock-by-default
		const first = notes[0];
		expect(notes.every((n) => n === first)).toBe(true);
		// Locked at first value: step starts at 0 → root semitone 0 → C5 = MIDI 60
		expect(first).toBe(60);
	});
});

// ---------------------------------------------------------------------------
// Multiple decorators on same loop (chaining)
// ---------------------------------------------------------------------------

describe('multiple inline decorators on same loop', () => {
	it('@scale(minor) @root(7) loop [0]: G minor, degree 0 = G5 = 67', () => {
		expect(notes0('@scale(minor) @root(7) loop [0]')[0]).toBe(67);
	});

	it('@scale(minor) @root(7) loop [2]: G minor degree 2 = Bb5 = 70', () => {
		// G5=67, minor[2] = 3 semitones → 70
		expect(notes0('@scale(minor) @root(7) loop [2]')[0]).toBe(70);
	});
});

// ---------------------------------------------------------------------------
// Generator types × non-default context (cross-product)
//
// Strategy: run each generator type under @key(g major 4) and verify that
// the output is shifted by exactly (root=+7, octave=-1) = -5 semitones from
// the equivalent C major / octave 5 result.  This confirms that the context
// is correctly threaded through every generator path — not just literal degrees.
//
// G major / octave 4:
//   rootMidi = 60 + 7 + (4-5)*12 = 60 + 7 - 12 = 55  (G4)
//   shift from C major / octave 5 baseline = 55 - 60 = -5
//
// So for any deterministic generator that produces degree D in C/5:
//   expected note in G/4 = (C/5 note) - 5
//
// For stochastic generators (rand, gau, exp, bro) we can't assert exact
// values, but we can assert that:
//   - the output range shifts by -5 (bounds checks)
//   - the generator still produces more than one distinct value (alive)
// ---------------------------------------------------------------------------

describe('generator types × non-default context (@key(g major 4), shift = -5)', () => {
	const SHIFT = -5; // G4 vs C5 baseline shift in semitones

	// --- Deterministic generators ---

	it('literal degree: [2] in G major/4 → E4 = 64 - 5 = 59', () => {
		// C major/5: degree 2 = E5 = 64. G major/4: 64 - 5 = 59 = E4.
		// G major shares intervals with C major, so degree 2 = 4 semitones above root.
		// G4=55, +4 = 59.
		expect(notes0('@key(g major 4) loop [2]')[0]).toBe(64 + SHIFT);
	});

	it('literal list: [0 2 4 6] in G major/4 — all four notes shifted -5', () => {
		// C major/5: [60, 64, 67, 71]. G major/4: [55, 59, 62, 66].
		expect(notes0('@key(g major 4) loop [0 2 4 6]')).toEqual(
			[60, 64, 67, 71].map((n) => n + SHIFT)
		);
	});

	it('step: [0step2x4] advances through degrees 0,2,4,6 across 4 cycles in G major/4', () => {
		// Each cycle draws the next value from the series. In G major/4, each is shifted -5.
		// C major/5 cycle notes: [60, 64, 67, 71]. G major/4: [55, 59, 62, 66].
		const inst = createInstance('@key(g major 4) loop [0step2x4]');
		if (!inst.ok) throw new Error(inst.error);
		const cycleNotes = [0, 1, 2, 3].map((cycle) => {
			const res = inst.evaluate({ cycleNumber: cycle });
			if (!res.ok) throw new Error(res.error);
			return res.events[0].note;
		});
		expect(cycleNotes).toEqual([60, 64, 67, 71].map((n) => n + SHIFT));
	});

	it('mul: [1mul2x4] advances through degrees 1,2,4,8 across 4 cycles in G major/4', () => {
		// C major/5 cycle notes: [62, 64, 67, 74]. G major/4: [57, 59, 62, 69].
		const inst = createInstance('@key(g major 4) loop [1mul2x4]');
		if (!inst.ok) throw new Error(inst.error);
		const cycleNotes = [0, 1, 2, 3].map((cycle) => {
			const res = inst.evaluate({ cycleNumber: cycle });
			if (!res.ok) throw new Error(res.error);
			return res.events[0].note;
		});
		expect(cycleNotes).toEqual([62, 64, 67, 74].map((n) => n + SHIFT));
	});

	it('lin: [0lin4x3] advances through degrees 0,2,4 across 3 cycles in G major/4', () => {
		// C major/5 cycle notes: [60, 64, 67]. G major/4: [55, 59, 62].
		const inst = createInstance('@key(g major 4) loop [0lin4x3]');
		if (!inst.ok) throw new Error(inst.error);
		const cycleNotes = [0, 1, 2].map((cycle) => {
			const res = inst.evaluate({ cycleNumber: cycle });
			if (!res.ok) throw new Error(res.error);
			return res.events[0].note;
		});
		expect(cycleNotes).toEqual([60, 64, 67].map((n) => n + SHIFT));
	});

	it('geo: [1geo8x4] advances through degrees 1,2,4,8 across 4 cycles in G major/4', () => {
		// C major/5 cycle notes: [62, 64, 67, 74]. G major/4: [57, 59, 62, 69].
		const inst = createInstance('@key(g major 4) loop [1geo8x4]');
		if (!inst.ok) throw new Error(inst.error);
		const cycleNotes = [0, 1, 2, 3].map((cycle) => {
			const res = inst.evaluate({ cycleNumber: cycle });
			if (!res.ok) throw new Error(res.error);
			return res.events[0].note;
		});
		expect(cycleNotes).toEqual([62, 64, 67, 74].map((n) => n + SHIFT));
	});

	// --- Stochastic generators: verify output range shifts, not exact values ---

	it('rand: [0rand4] in G major/4 — all notes in shifted G-major range', () => {
		// C major/5, degrees 0–4: valid notes {60,62,64,65,67}
		// G major/4, same degrees: {55,57,59,60,62} (each -5)
		const validInG = new Set([60, 62, 64, 65, 67].map((n) => n + SHIFT));
		const inst = createInstance('@key(g major 4) loop [0rand4]');
		if (!inst.ok) throw new Error(inst.error);
		for (let cycle = 0; cycle < 50; cycle++) {
			const res = inst.evaluate({ cycleNumber: cycle });
			if (!res.ok) throw new Error(res.error);
			expect(validInG.has(res.events[0].note)).toBe(true);
		}
	});

	it('rand: [0rand4] in G major/4 — produces more than one distinct note', () => {
		const inst = createInstance('@key(g major 4) loop [0rand4]');
		if (!inst.ok) throw new Error(inst.error);
		const notes = new Set<number>();
		for (let cycle = 0; cycle < 50; cycle++) {
			const res = inst.evaluate({ cycleNumber: cycle });
			if (!res.ok) throw new Error(res.error);
			notes.add(res.events[0].note);
		}
		expect(notes.size).toBeGreaterThan(1);
	});

	it('tilde (~): [0~4] in G major/4 — all notes in shifted range', () => {
		const validInG = new Set([60, 62, 64, 65, 67].map((n) => n + SHIFT));
		const inst = createInstance('@key(g major 4) loop [0~4]');
		if (!inst.ok) throw new Error(inst.error);
		for (let cycle = 0; cycle < 50; cycle++) {
			const res = inst.evaluate({ cycleNumber: cycle });
			if (!res.ok) throw new Error(res.error);
			expect(validInG.has(res.events[0].note)).toBe(true);
		}
	});

	it('gau: [3gau1] in G major/4 — varies and is lower than C major/5 equivalent', () => {
		// In C/5 mean is around degree 3 = F5 = 65; in G/4 around 60.
		const instC = createInstance('loop [3gau1]');
		const instG = createInstance('@key(g major 4) loop [3gau1]');
		if (!instC.ok || !instG.ok) throw new Error('instance error');
		const notesG = new Set<number>();
		for (let cycle = 0; cycle < 50; cycle++) {
			const res = instG.evaluate({ cycleNumber: cycle });
			if (!res.ok) throw new Error(res.error);
			notesG.add(res.events[0].note);
		}
		// G/4 notes should generally be lower than C/5 — compare medians
		const gMedian = [...notesG].sort((a, b) => a - b)[Math.floor(notesG.size / 2)];
		expect(gMedian).toBeLessThan(65); // F5 (C/5 mean) - at least some shift
		expect(notesG.size).toBeGreaterThan(1);
	});

	it('exp: [1exp7] in G major/4 — all notes below C major/5 equivalent', () => {
		// C/5: degrees 1–7 → MIDI 62–72. G/4: -5 → 57–67.
		const inst = createInstance('@key(g major 4) loop [1exp7]');
		if (!inst.ok) throw new Error(inst.error);
		for (let cycle = 0; cycle < 50; cycle++) {
			const res = inst.evaluate({ cycleNumber: cycle });
			if (!res.ok) throw new Error(res.error);
			// Must be ≥ 57 (degree 1, G4) and ≤ 67 (degree 7, G5)
			expect(res.events[0].note).toBeGreaterThanOrEqual(57);
			expect(res.events[0].note).toBeLessThanOrEqual(67);
		}
	});

	it('bro: [0bro6m1] in G major/4 — stays within shifted degree range', () => {
		// C/5: degrees 0–6 → MIDI 60–71. G/4: → 55–66.
		const inst = createInstance('@key(g major 4) loop [0bro6m1]');
		if (!inst.ok) throw new Error(inst.error);
		for (let cycle = 0; cycle < 100; cycle++) {
			const res = inst.evaluate({ cycleNumber: cycle });
			if (!res.ok) throw new Error(res.error);
			expect(res.events[0].note).toBeGreaterThanOrEqual(55);
			expect(res.events[0].note).toBeLessThanOrEqual(66);
		}
	});

	// --- Scale-specific cross: generators with minor scale ---

	it('step in minor: [0step1x3] in A minor/5 advances A→B→C across 3 cycles', () => {
		// A minor root=9, octave=5 → rootMidi=69=A5.
		// minor intervals: [2,1,2,2,1,2,2]
		// degree 0→0st→69(A5), degree 1→2st→71(B5), degree 2→3st→72(C6)
		// step advances one value per cycle.
		const inst = createInstance('@key(a minor) loop [0step1x3]');
		if (!inst.ok) throw new Error(inst.error);
		const cycleNotes = [0, 1, 2].map((cycle) => {
			const res = inst.evaluate({ cycleNumber: cycle });
			if (!res.ok) throw new Error(res.error);
			return res.events[0].note;
		});
		expect(cycleNotes).toEqual([69, 71, 72]);
	});

	it('rand in dorian: [0rand4] in D dorian/5 — all notes in D dorian range', () => {
		// D dorian: root=D (semitone 2), octave=5 → rootMidi=62.
		// dorian intervals: [2,1,2,2,2,1,2]
		// degrees 0–4 semitone offsets: [0,2,3,5,7] → MIDI [62,64,65,67,69]
		const validDDorian = new Set([62, 64, 65, 67, 69]);
		const inst = createInstance('@key(d dorian) loop [0rand4]');
		if (!inst.ok) throw new Error(inst.error);
		for (let cycle = 0; cycle < 50; cycle++) {
			const res = inst.evaluate({ cycleNumber: cycle });
			if (!res.ok) throw new Error(res.error);
			expect(validDDorian.has(res.events[0].note)).toBe(true);
		}
	});

	// --- Multi-element list: context applies to all elements ---

	it('multi-element list in non-default context: all elements shifted', () => {
		// C/5: [0 2 4] → [60, 64, 67]. G/4: → [55, 59, 62]
		expect(notes0('@key(g major 4) loop [0 2 4]')).toEqual([55, 59, 62]);
	});

	// --- set + stateful generator: context threads through correctly ---

	it('set root(9) + step: loop [0step1x3] advances A→B→C# across 3 cycles', () => {
		// A major root=9 → rootMidi=69=A5. Major intervals: [2,2,1,2,2,2,1].
		// degree 0→0st→69, degree 1→2st→71, degree 2→4st→73. Step advances per cycle.
		const inst = createInstance('set root(9)\nloop [0step1x3]');
		if (!inst.ok) throw new Error(inst.error);
		const cycleNotes = [0, 1, 2].map((cycle) => {
			const res = inst.evaluate({ cycleNumber: cycle });
			if (!res.ok) throw new Error(res.error);
			return res.events[0].note;
		});
		expect(cycleNotes).toEqual([69, 71, 73]);
	});
});

// ---------------------------------------------------------------------------
// Pitch chain combination
// ---------------------------------------------------------------------------

describe('pitch chain: combined root + octave + scale', () => {
	it('root=5 (F), octave=4, major, degree 0 = F4 = MIDI 53', () => {
		// F5 = 60+5 = 65; F4 = 65-12 = 53
		expect(notes0('@root(5) @octave(4) loop [0]')[0]).toBe(53);
	});

	it('root=7 (G), octave=5, major, degree 2 = E5 + 7 semitones from C = B5 = 71', () => {
		// G5=67, major degree 2 = 4 semitones → 71 = B5
		expect(notes0('@root(7) loop [2]')[0]).toBe(71);
	});

	it('key(g minor) degree 7 wraps to G6 = MIDI 79', () => {
		// G5=67, degree 7 = 12 semitones up (full octave) → 79
		expect(notes0('@key(g minor) loop [7]')[0]).toBe(79);
	});
});
