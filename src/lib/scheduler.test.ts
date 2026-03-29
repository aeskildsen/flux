/**
 * scheduler.ts unit tests.
 *
 * The scheduler depends on two external seams:
 *   1. `clock` (from $lib/clock) — provides beatToAudioTime, audioContext
 *   2. `getInstance` (from svelte-supersonic) — provides initTime
 *
 * We mock both so tests run in Node without a real AudioContext or WASM engine.
 * setTimeout is replaced with vitest fake timers so the lookahead tick loop
 * can be controlled deterministically.
 *
 * IMPORTANT: Every test that uses a generator must ensure that beatToAudioTime
 * eventually returns a value outside the lookahead window, otherwise the
 * inner while-loop in tick() runs without bound and exhausts memory.  We
 * achieve this by:
 *   a) Using finiteGen so gen.next() eventually returns done:true, or
 *   b) Using a beatToAudioTime mock that goes out-of-window after N calls.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock svelte-supersonic BEFORE importing the scheduler
// ---------------------------------------------------------------------------

vi.mock('svelte-supersonic', () => ({
	getInstance: vi.fn()
}));

import { getInstance } from 'svelte-supersonic';

// ---------------------------------------------------------------------------
// Shared fake state
// ---------------------------------------------------------------------------

let fakeCurrentTime = 0;

const fakeAudioContext = {
	get currentTime() {
		return fakeCurrentTime;
	}
};

const fakeSonic = {
	initTime: 1000 // arbitrary NTP epoch offset
};

// ---------------------------------------------------------------------------
// Import module under test (after mocks are set up)
// ---------------------------------------------------------------------------

import { run, TICK_INTERVAL_MS, LOOKAHEAD_SECONDS } from './scheduler.js';
import { clock } from './clock.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Yields each value in `values` then finishes — bounded, safe with any mock. */
function* finiteGen<T>(values: T[]): Generator<T> {
	for (const v of values) yield v;
}

/**
 * Build a beatToAudioTime mock that returns `inWindow` for the first
 * `count` calls and `outOfWindow` for all subsequent calls.
 * This ensures the tick() while-loop terminates after exactly `count` events.
 */
function boundedBeatMock(count: number, inWindow = fakeCurrentTime - 1) {
	let calls = 0;
	return vi.fn(() => (calls++ < count ? inWindow : fakeCurrentTime + LOOKAHEAD_SECONDS + 1));
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

beforeEach(() => {
	vi.useFakeTimers();
	fakeCurrentTime = 0;

	vi.spyOn(clock, 'audioContext', 'get').mockReturnValue(fakeAudioContext as AudioContext);
	vi.mocked(getInstance).mockReturnValue(fakeSonic as ReturnType<typeof getInstance>);
});

afterEach(() => {
	vi.restoreAllMocks();
	vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe('exported constants', () => {
	it('TICK_INTERVAL_MS is a positive number', () => {
		expect(TICK_INTERVAL_MS).toBeGreaterThan(0);
	});

	it('LOOKAHEAD_SECONDS is a positive number', () => {
		expect(LOOKAHEAD_SECONDS).toBeGreaterThan(0);
	});
});

// ---------------------------------------------------------------------------
// 1. Handle interface
// ---------------------------------------------------------------------------

describe('run() — SchedulerHandle interface', () => {
	it('returns an object with stop() and setStopBeat()', () => {
		vi.spyOn(clock, 'beatToAudioTime').mockReturnValue(fakeCurrentTime + LOOKAHEAD_SECONDS + 1);

		const handle = run(finiteGen([1]), vi.fn());
		expect(typeof handle.stop).toBe('function');
		expect(typeof handle.setStopBeat).toBe('function');
		handle.stop();
	});
});

// ---------------------------------------------------------------------------
// 2. Engine not ready — defers until sonic/ctx available
// ---------------------------------------------------------------------------

describe('run() — engine not ready', () => {
	it('does not emit on first tick when getInstance() returns null', () => {
		vi.mocked(getInstance).mockReturnValue(null as ReturnType<typeof getInstance>);

		const callback = vi.fn();
		vi.spyOn(clock, 'beatToAudioTime').mockReturnValue(fakeCurrentTime + LOOKAHEAD_SECONDS + 1);
		run(finiteGen([1, 2, 3]), callback);

		// First tick fired synchronously: engine not ready → no events
		expect(callback).not.toHaveBeenCalled();
	});

	it('emits on the next tick once engine becomes available', () => {
		vi.mocked(getInstance).mockReturnValue(null as ReturnType<typeof getInstance>);

		const callback = vi.fn();
		// beatToAudioTime: first call after engine is available emits one event
		vi.spyOn(clock, 'beatToAudioTime').mockImplementation(boundedBeatMock(1));
		run(finiteGen([42]), callback);

		expect(callback).not.toHaveBeenCalled();

		vi.mocked(getInstance).mockReturnValue(fakeSonic as ReturnType<typeof getInstance>);
		vi.advanceTimersByTime(TICK_INTERVAL_MS);

		expect(callback).toHaveBeenCalledTimes(1);
	});

	it('does not emit on first tick when audioContext is null', () => {
		vi.spyOn(clock, 'audioContext', 'get').mockReturnValueOnce(null);
		vi.spyOn(clock, 'beatToAudioTime').mockReturnValue(fakeCurrentTime + LOOKAHEAD_SECONDS + 1);

		const callback = vi.fn();
		run(finiteGen([1]), callback);
		expect(callback).not.toHaveBeenCalled();
	});

	it('emits on the next tick once audioContext becomes available', () => {
		// First audioContext call returns null; subsequent calls return the fake
		vi.spyOn(clock, 'audioContext', 'get')
			.mockReturnValueOnce(null)
			.mockReturnValue(fakeAudioContext as AudioContext);
		vi.spyOn(clock, 'beatToAudioTime').mockImplementation(boundedBeatMock(1));

		const callback = vi.fn();
		run(finiteGen([99]), callback);

		expect(callback).not.toHaveBeenCalled();

		vi.advanceTimersByTime(TICK_INTERVAL_MS);
		expect(callback).toHaveBeenCalledTimes(1);
	});
});

// ---------------------------------------------------------------------------
// 3. Event emission
// ---------------------------------------------------------------------------

describe('run() — event emission', () => {
	it('emits all values from a finite generator (generator exhaustion stops loop)', () => {
		// All beats always in-window: the loop terminates only because gen is finite
		vi.spyOn(clock, 'beatToAudioTime').mockReturnValue(fakeCurrentTime - 1);

		const callback = vi.fn();
		run(finiteGen([10, 20, 30]), callback, 1);
		expect(callback).toHaveBeenCalledTimes(3);
	});

	it('passes the event value as first argument to callback', () => {
		vi.spyOn(clock, 'beatToAudioTime').mockImplementation(boundedBeatMock(1));

		const callback = vi.fn();
		run(finiteGen([42]), callback, 1);
		expect(callback.mock.calls[0][0]).toBe(42);
	});

	it('passes ntpTime (number) as second argument to callback', () => {
		vi.spyOn(clock, 'beatToAudioTime').mockImplementation(boundedBeatMock(1));

		const callback = vi.fn();
		run(finiteGen([1]), callback, 1);
		const ntpTime = callback.mock.calls[0][1] as number;
		expect(typeof ntpTime).toBe('number');
	});

	it('ntpTime includes sonic.initTime as the base', () => {
		// Emit one event within the lookahead window and verify that
		// ntpTime is offset from sonic.initTime (not 0 or some other base).
		vi.spyOn(clock, 'beatToAudioTime').mockImplementation(boundedBeatMock(2));

		const callback = vi.fn();
		run(finiteGen([1]), callback, 1);
		const ntpTime = callback.mock.calls[0][1] as number;
		// ntpTime = sonic.initTime + beatToAudioTime(beat)
		// beatToAudioTime returns fakeCurrentTime - 1 = -1 for the first call
		expect(ntpTime).toBe(fakeSonic.initTime + (fakeCurrentTime - 1));
	});

	it('stops emitting after generator is done (finite gen)', () => {
		vi.spyOn(clock, 'beatToAudioTime').mockImplementation(boundedBeatMock(10));

		const callback = vi.fn();
		run(finiteGen([1, 2]), callback, 1);
		vi.advanceTimersByTime(TICK_INTERVAL_MS * 5);
		// Generator had 2 values; no more even after more ticks
		expect(callback).toHaveBeenCalledTimes(2);
	});
});

// ---------------------------------------------------------------------------
// 4. Lookahead window
// ---------------------------------------------------------------------------

describe('run() — lookahead window', () => {
	it('does not emit when beat is beyond the lookahead horizon', () => {
		vi.spyOn(clock, 'beatToAudioTime').mockReturnValue(fakeCurrentTime + LOOKAHEAD_SECONDS + 1);

		const callback = vi.fn();
		run(finiteGen([1, 2, 3]), callback, 1);
		expect(callback).not.toHaveBeenCalled();
	});

	it('emits when beat is exactly at the horizon (<=)', () => {
		vi.spyOn(clock, 'beatToAudioTime')
			.mockReturnValueOnce(fakeCurrentTime + LOOKAHEAD_SECONDS)
			.mockReturnValue(fakeCurrentTime + LOOKAHEAD_SECONDS + 1);

		const callback = vi.fn();
		run(finiteGen([1, 2]), callback, 1);
		expect(callback).toHaveBeenCalledTimes(1);
	});
});

// ---------------------------------------------------------------------------
// 5. stop()
// ---------------------------------------------------------------------------

describe('handle.stop()', () => {
	it('stops the tick loop immediately', () => {
		// All beats out-of-window: nothing emits, just ticks scheduling ticks
		vi.spyOn(clock, 'beatToAudioTime').mockReturnValue(fakeCurrentTime + LOOKAHEAD_SECONDS + 1);

		const handle = run(finiteGen([1, 2, 3]), vi.fn());
		handle.stop();

		// Advance timers — if stop() worked, no more timeouts fire
		const timers = vi.getTimerCount();
		vi.advanceTimersByTime(TICK_INTERVAL_MS * 3);
		// After stop, timer count should not grow
		expect(vi.getTimerCount()).toBeLessThanOrEqual(timers);
	});

	it('prevents emission on subsequent ticks after stop()', () => {
		// First tick: nothing in window (safe). Stop before ticks fire.
		vi.spyOn(clock, 'beatToAudioTime').mockReturnValue(fakeCurrentTime + LOOKAHEAD_SECONDS + 1);

		const callback = vi.fn();
		const handle = run(finiteGen([1, 2, 3]), callback, 1);
		handle.stop();
		vi.advanceTimersByTime(TICK_INTERVAL_MS * 5);
		expect(callback).not.toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// 6. setStopBeat()
// ---------------------------------------------------------------------------

describe('handle.setStopBeat()', () => {
	it('halts emission when nextBeat >= stopBeat', () => {
		// First tick: all beats out-of-window → no events, loop just reschedules.
		// Then set stopBeat=0 and move beats in-window.
		// Second tick: while condition passes but nextBeat(0) >= stopBeat(0) → guard fires.
		const spy = vi
			.spyOn(clock, 'beatToAudioTime')
			.mockReturnValue(fakeCurrentTime + LOOKAHEAD_SECONDS + 1); // first tick: nothing in window

		const callback = vi.fn();
		const handle = run(finiteGen([1, 2, 3]), callback, 1, 0);

		expect(callback).not.toHaveBeenCalled();

		// Now put beats in-window and set stopBeat=0 before the next tick
		spy.mockReturnValue(fakeCurrentTime - 1);
		handle.setStopBeat(0); // guard fires immediately at nextBeat=0

		vi.advanceTimersByTime(TICK_INTERVAL_MS);

		// Guard fires before any event is emitted
		expect(callback).not.toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// 7. durationOf — custom .duration field on events
// ---------------------------------------------------------------------------

describe('run() — event duration field', () => {
	it('advances nextBeat by event.duration when the field is present', () => {
		// With duration=2 and startBeat=0: nextBeat goes 0 → 2 → 4
		// Only beat 0 is in-window; beat 2 is not
		vi.spyOn(clock, 'beatToAudioTime').mockImplementation((beat: number) =>
			beat === 0 ? fakeCurrentTime : fakeCurrentTime + LOOKAHEAD_SECONDS + 1
		);

		const callback = vi.fn();
		const eventWithDuration = { note: 60, duration: 2 };
		run(finiteGen([eventWithDuration, eventWithDuration]), callback, 0.5, 0);

		expect(callback).toHaveBeenCalledTimes(1);
	});

	it('uses interval fallback when event has no .duration field', () => {
		// With fallback interval=1 and startBeat=0: nextBeat goes 0 → 1
		// Only beat 0 is in-window
		vi.spyOn(clock, 'beatToAudioTime').mockImplementation((beat: number) =>
			beat === 0 ? fakeCurrentTime : fakeCurrentTime + LOOKAHEAD_SECONDS + 1
		);

		const callback = vi.fn();
		run(finiteGen([42, 99]), callback, 1, 0);
		expect(callback).toHaveBeenCalledTimes(1);
	});
});
