/**
 * Tests for createGen() — the scheduler event generator.
 *
 * createGen() is a pure generator factory: it takes injected dependencies
 * (evaluator instance, clock, startBeat, cycleBeatCount) and yields GenEvent
 * objects consumed by the lookahead scheduler.
 *
 * All dependencies are faked inline — no DOM, audio context, or Svelte runtime
 * required.
 */

import { describe, it, expect, vi } from 'vitest';
import { createGen } from './gen.js';
import type { GenDeps, GenEvent } from './gen.js';
import type { EvalInstance, EvalCycleResult, ScheduledEvent } from './lang/evaluator.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CB = 4; // CYCLE_BEATS — standard for all tests
const START = 100; // arbitrary startBeat

/** Collect up to `limit` events from a generator (prevents infinite loops). */
function take(gen: Generator<GenEvent>, limit: number): GenEvent[] {
	const out: GenEvent[] = [];
	for (const ev of gen) {
		out.push(ev);
		if (out.length >= limit) break;
	}
	return out;
}

/** Collect all non-skip events. */
function realEvents(events: GenEvent[]): Extract<GenEvent, { skip: false }>[] {
	return events.filter((e): e is Extract<GenEvent, { skip: false }> => !e.skip);
}

/** Build a minimal ScheduledEvent with defaults. */
function makeEvent(overrides: Partial<ScheduledEvent> & { type?: string } = {}): ScheduledEvent {
	const { type, ...rest } = overrides;
	// Map legacy 'type' field to 'contentType' for backwards compat in tests
	const contentType = (type ?? 'note') as
		| 'note'
		| 'mono'
		| 'sample'
		| 'slice'
		| 'cloud'
		| 'rest'
		| 'fx';
	if (contentType === 'rest') {
		return { contentType: 'rest', beatOffset: 0, duration: 0.25, ...rest } as ScheduledEvent;
	}
	if (contentType === 'fx') {
		return { contentType: 'fx', beatOffset: 0, duration: 0.25, ...rest } as ScheduledEvent;
	}
	return {
		contentType: 'note',
		note: 60,
		beatOffset: 0,
		duration: 0.25,
		...rest
	} as ScheduledEvent;
}

/** Build a fake EvalInstance that returns the given events for each cycle call. */
function fakeInst(
	eventsPerCycle: ScheduledEvent[],
	opts: { failOnCycle?: number; doneOnCycle?: number } = {}
): Extract<EvalInstance, { ok: true }> {
	return {
		ok: true,
		evaluate: vi.fn((ctx): EvalCycleResult => {
			if (opts.failOnCycle !== undefined && ctx.cycleNumber === opts.failOnCycle) {
				return { ok: false, error: 'fake error' };
			}
			if (opts.doneOnCycle !== undefined && ctx.cycleNumber >= opts.doneOnCycle) {
				return { ok: true, events: [], done: true };
			}
			return { ok: true, events: eventsPerCycle, done: false };
		}),
		reinit: vi.fn()
	};
}

/** Standard deps with a constant beatsToSeconds (1 beat = 1 second). */
function makeDeps(
	inst: Extract<EvalInstance, { ok: true }>,
	overrides: Partial<Omit<GenDeps, 'inst'>> = {}
): GenDeps {
	return {
		inst,
		beatsToSeconds: (beats) => beats,
		startBeat: START,
		cycleBeatCount: CB,
		onMessage: vi.fn(),
		...overrides
	};
}

// ---------------------------------------------------------------------------
// 1. Regression: zero-duration first event
// ---------------------------------------------------------------------------

describe('createGen() — zero-duration regression', () => {
	it('first event of note x [0 1 2 3] has duration > 0 (not zero)', () => {
		// beatOffset=0: event lands exactly at startBeat. Old bug: duration=0 → scheduler stops.
		const inst = fakeInst([
			makeEvent({ beatOffset: 0 }),
			makeEvent({ beatOffset: 0.25 }),
			makeEvent({ beatOffset: 0.5 }),
			makeEvent({ beatOffset: 0.75 })
		]);
		const gen = createGen(makeDeps(inst));
		const events = take(gen, 10); // enough for one cycle + boundary stub
		const first = events[0];
		expect(first.duration).toBeGreaterThan(0);
	});

	it('no yielded event ever has duration === 0', () => {
		const inst = fakeInst([
			makeEvent({ beatOffset: 0 }),
			makeEvent({ beatOffset: 0.25 }),
			makeEvent({ beatOffset: 0.5 }),
			makeEvent({ beatOffset: 0.75 })
		]);
		const gen = createGen(makeDeps(inst));
		// Collect two full cycles worth of events
		const events = take(gen, 20);
		for (const ev of events) {
			expect(ev.duration).toBeGreaterThan(0);
		}
	});
});

// ---------------------------------------------------------------------------
// 2. Basic emission
// ---------------------------------------------------------------------------

describe('createGen() — basic emission', () => {
	it('yields one real event per event in the cycle', () => {
		const inst = fakeInst([makeEvent({ beatOffset: 0 }), makeEvent({ beatOffset: 0.5 })], {
			doneOnCycle: 1
		});
		const gen = createGen(makeDeps(inst, { cycleBeatCount: CB }));
		const events = take(gen, 10);
		expect(realEvents(events)).toHaveLength(2);
	});

	it('real event carries the ScheduledEvent on ev', () => {
		const ev = makeEvent({ beatOffset: 0, note: 64 });
		const inst = fakeInst([ev]);
		const gen = createGen(makeDeps(inst));
		const events = take(gen, 5);
		const real = realEvents(events);
		expect((real[0].ev as any).note).toBe(64);
	});

	it('gateDurationSeconds = ev.duration * cycleBeatCount * beatsToSeconds', () => {
		// ev.duration=0.5 cycle, CB=4 → 2 beats; beatsToSeconds(b)=b*2 → 4 s
		const ev = makeEvent({ beatOffset: 0, duration: 0.5 });
		const inst = fakeInst([ev]);
		const gen = createGen(makeDeps(inst, { beatsToSeconds: (b) => b * 2 }));
		const events = take(gen, 5);
		const real = realEvents(events);
		expect(real[0].gateDurationSeconds).toBeCloseTo(0.5 * CB * 2);
	});

	it('stops when evaluator returns done:true', () => {
		const inst = fakeInst([makeEvent()], { doneOnCycle: 1 });
		const gen = createGen(makeDeps(inst));
		const events = take(gen, 100);
		// Cycle 0 fires events; cycle 1 returns done → generator finishes
		expect(realEvents(events)).toHaveLength(1);
	});

	it('skips the bad cycle (yields a skip stub) and calls onMessage(error) when evaluator returns ok:false', () => {
		const onMessage = vi.fn();
		// Cycle 0 fails, cycle 1+ succeeds — generator must continue
		const inst = fakeInst([makeEvent()], { failOnCycle: 0, doneOnCycle: 2 });
		const gen = createGen(makeDeps(inst, { onMessage }));
		const events = take(gen, 100);
		// Cycle 0 skipped (1 skip stub), cycle 1 fires a real event
		expect(realEvents(events)).toHaveLength(1);
		expect(onMessage).toHaveBeenCalledWith(expect.stringContaining('Pattern error'), 'error');
	});

	it('yields a single skip stub covering exactly cycleBeatCount beats when a cycle fails', () => {
		const onMessage = vi.fn();
		// Cycle 0 fails — must yield exactly one skip stub of duration CB
		const inst = fakeInst([makeEvent()], { failOnCycle: 0, doneOnCycle: 1 });
		const gen = createGen(makeDeps(inst, { onMessage }));
		const events = take(gen, 10);
		// Cycle 0: one skip stub (whole cycle)
		// Cycle 1: done → generator finishes
		expect(events).toHaveLength(1);
		expect(events[0].skip).toBe(true);
		expect(events[0].duration).toBeCloseTo(CB);
	});

	it('continues producing events after a failed cycle', () => {
		// Cycle 0 fails, cycles 1 and 2 succeed, cycle 3 done
		const inst = fakeInst([makeEvent({ beatOffset: 0 })], { failOnCycle: 0, doneOnCycle: 3 });
		const gen = createGen(makeDeps(inst));
		const events = take(gen, 50);
		// 2 successful cycles → 2 real events
		expect(realEvents(events)).toHaveLength(2);
	});

	it('keeps cursor aligned after a skipped cycle — subsequent events have correct durations', () => {
		// Cycle 0 fails (skip), cycle 1 has 2 events — total duration should be 2*CB
		const inst = fakeInst([makeEvent({ beatOffset: 0 }), makeEvent({ beatOffset: 0.5 })], {
			failOnCycle: 0,
			doneOnCycle: 2
		});
		const gen = createGen(makeDeps(inst));
		const events = take(gen, 30);
		const total = events.reduce((s, e) => s + e.duration, 0);
		expect(total).toBeCloseTo(CB * 2);
	});

	it('calls onMessage(info) when pattern finishes', () => {
		const onMessage = vi.fn();
		const inst = fakeInst([], { doneOnCycle: 0 });
		const gen = createGen(makeDeps(inst, { onMessage }));
		take(gen, 10);
		expect(onMessage).toHaveBeenCalledWith('Pattern finished', 'info');
	});
});

// ---------------------------------------------------------------------------
// 3. Duration / stride semantics
// ---------------------------------------------------------------------------

describe('createGen() — duration semantics', () => {
	it('4 uniform events: each real event has duration = CB/4', () => {
		const events = [0, 0.25, 0.5, 0.75].map((bo) => makeEvent({ beatOffset: bo }));
		const inst = fakeInst(events, { doneOnCycle: 1 });
		const gen = createGen(makeDeps(inst));
		const yielded = take(gen, 20);
		const real = realEvents(yielded);
		for (const r of real) {
			expect(r.duration).toBeCloseTo(CB / 4);
		}
	});

	it('single event per cycle: duration = cycleBeatCount', () => {
		const inst = fakeInst([makeEvent({ beatOffset: 0 })], { doneOnCycle: 1 });
		const gen = createGen(makeDeps(inst));
		const yielded = take(gen, 10);
		const real = realEvents(yielded);
		expect(real[0].duration).toBeCloseTo(CB);
	});

	it('sum of all durations in one cycle equals cycleBeatCount', () => {
		// All yielded durations (skip + real) for one cycle must sum to CB.
		// doneOnCycle:1 so the generator stops after cycle 0.
		const events = [0, 0.25, 0.5, 0.75].map((bo) => makeEvent({ beatOffset: bo }));
		const inst = fakeInst(events, { doneOnCycle: 1 });
		const gen = createGen(makeDeps(inst));
		const yielded = take(gen, 20);
		const total = yielded.reduce((s, e) => s + e.duration, 0);
		expect(total).toBeCloseTo(CB);
	});

	it('durations sum to CB across two cycles', () => {
		const events = [0, 0.5].map((bo) => makeEvent({ beatOffset: bo }));
		const inst = fakeInst(events, { doneOnCycle: 2 });
		const gen = createGen(makeDeps(inst));
		const yielded = take(gen, 30);
		const total = yielded.reduce((s, e) => s + e.duration, 0);
		expect(total).toBeCloseTo(CB * 2);
	});
});

// ---------------------------------------------------------------------------
// 4. Pre-event gap stubs (cycleOffset / 'at)
// ---------------------------------------------------------------------------

describe("createGen() — pre-event gap stubs ('at)", () => {
	it('event with cycleOffset=0.5 emits a skip stub before the real event', () => {
		// 'at(1/2): event lands at startBeat + 0.5*CB; cursor starts at startBeat.
		const inst = fakeInst([makeEvent({ beatOffset: 0, cycleOffset: 0.5 })], { doneOnCycle: 1 });
		const gen = createGen(makeDeps(inst));
		const yielded = take(gen, 10);
		// First yielded event must be a skip stub
		expect(yielded[0].skip).toBe(true);
		expect(yielded[0].duration).toBeCloseTo(CB * 0.5);
		// Second yielded event is the real one
		expect(yielded[1].skip).toBe(false);
	});

	it('no stub emitted when beatOffset=0 and no cycleOffset (plain pattern)', () => {
		const inst = fakeInst([makeEvent({ beatOffset: 0 })], { doneOnCycle: 1 });
		const gen = createGen(makeDeps(inst));
		const [first] = take(gen, 5);
		// First event must be real — no leading skip stub
		expect(first.skip).toBe(false);
	});

	it('durations still sum to CB when cycleOffset is present', () => {
		const inst = fakeInst([makeEvent({ beatOffset: 0, cycleOffset: 0.25 })], { doneOnCycle: 1 });
		const gen = createGen(makeDeps(inst));
		const yielded = take(gen, 10);
		const total = yielded.reduce((s, e) => s + e.duration, 0);
		expect(total).toBeCloseTo(CB);
	});
});

// ---------------------------------------------------------------------------
// 5. fx and rest events are skipped
// ---------------------------------------------------------------------------

describe('createGen() — fx/rest events are skipped', () => {
	it('fx events yield skip:true', () => {
		const ev = makeEvent({ beatOffset: 0, type: 'fx' });
		const inst = fakeInst([ev], { doneOnCycle: 1 });
		const gen = createGen(makeDeps(inst));
		const yielded = take(gen, 5);
		const real = realEvents(yielded);
		expect(real).toHaveLength(0);
	});

	it('rest events yield skip:true', () => {
		const ev = makeEvent({ beatOffset: 0, type: 'rest' });
		const inst = fakeInst([ev], { doneOnCycle: 1 });
		const gen = createGen(makeDeps(inst));
		const yielded = take(gen, 5);
		expect(realEvents(yielded)).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// 6. Multi-cycle cursor continuity
// ---------------------------------------------------------------------------

describe('createGen() — multi-cycle cursor continuity', () => {
	it('each cycle advances by exactly cycleBeatCount beats', () => {
		// With 2 cycles, total duration must be 2 * CB.
		const inst = fakeInst([makeEvent({ beatOffset: 0 })], { doneOnCycle: 2 });
		const gen = createGen(makeDeps(inst));
		const yielded = take(gen, 30);
		const total = yielded.reduce((s, e) => s + e.duration, 0);
		expect(total).toBeCloseTo(CB * 2);
	});

	it('events in cycle 1 follow immediately after cycle 0 boundary', () => {
		// Two cycles, single event each. The first real event in cycle 1 must not
		// have a leading skip stub (its targetBeat equals the cycle 0 boundary,
		// which is exactly where the cursor lands after cycle 0).
		const inst = fakeInst([makeEvent({ beatOffset: 0 })], { doneOnCycle: 2 });
		const gen = createGen(makeDeps(inst));
		const yielded = take(gen, 10);
		// yielded[0] = real event (cycle 0), yielded[1] = real event (cycle 1)
		// No skip stub between them
		expect(yielded[0].skip).toBe(false);
		expect(yielded[1].skip).toBe(false);
	});
});
