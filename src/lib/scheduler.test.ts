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
	getInstance: vi.fn(),
	getOsc: vi.fn(),
	getServer: vi.fn(),
	GROUPS: { source: 1, master: 2 }
}));

import { getInstance, getOsc } from 'svelte-supersonic';

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

import { run, sc, TICK_INTERVAL_MS, LOOKAHEAD_SECONDS } from './scheduler.js';
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

	it('does not emit when sonic.initTime is 0 (NTP sync pending)', () => {
		// initTime=0 means NTP hasn't synced yet — ntpTime would be computed as
		// 0 + beatToAudioTime(beat), a tiny number far in the past relative to NTP
		// epoch (1900), causing every bundle to arrive LATE.
		vi.mocked(getInstance).mockReturnValue({ initTime: 0 } as ReturnType<typeof getInstance>);
		vi.spyOn(clock, 'beatToAudioTime').mockReturnValue(fakeCurrentTime - 1);

		const callback = vi.fn();
		run(finiteGen([1]), callback);
		expect(callback).not.toHaveBeenCalled();
	});

	it('snaps nextBeat to currentBeat when engine becomes ready after a wait', () => {
		// Simulates the LATE scenario: run() is called with startBeat=0, but
		// initTime=0 delays the first real tick by several ticks. By then
		// currentBeat has advanced; without the snap, beatToAudioTime(0) is in
		// the past and the bundle arrives LATE.
		vi.mocked(getInstance).mockReturnValue({ initTime: 0 } as ReturnType<typeof getInstance>);

		// After the wait, currentBeat will be 5 — only beat 5 is in-window
		const currentBeatSpy = vi.spyOn(clock, 'currentBeat', 'get').mockReturnValue(5);
		vi.spyOn(clock, 'beatToAudioTime').mockImplementation((beat: number) =>
			beat === 5 ? fakeCurrentTime - 1 : fakeCurrentTime + LOOKAHEAD_SECONDS + 1
		);

		const callback = vi.fn();
		run(finiteGen([{ note: 60, duration: 1 }]), callback, 1, 0); // startBeat=0

		expect(callback).not.toHaveBeenCalled(); // still waiting for initTime

		// Engine becomes ready
		vi.mocked(getInstance).mockReturnValue(fakeSonic as ReturnType<typeof getInstance>);
		vi.advanceTimersByTime(TICK_INTERVAL_MS);

		// nextBeat snapped from 0 to currentBeat(5), so the event at beat 5 fires
		expect(callback).toHaveBeenCalledTimes(1);
		currentBeatSpy.mockRestore();
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

// ---------------------------------------------------------------------------
// 8. startBeat default (#9) — must use clock.currentBeat at call time
// ---------------------------------------------------------------------------

describe('run() — startBeat default (#9)', () => {
	it('uses clock.currentBeat at call time, not module load time', () => {
		// Simulate the engine being mid-session: currentBeat is 100.
		// Verifies startBeat defaults to clock.currentBeat at call time,
		// preventing a flood of late bundles for beats 0–99.
		// The fix ensures nextBeat starts at 100.
		const callTimeBeat = 100;
		vi.spyOn(clock, 'currentBeat', 'get').mockReturnValue(callTimeBeat);

		// Only beat 100 is in-window; beat 100+interval is out
		vi.spyOn(clock, 'beatToAudioTime').mockImplementation((beat: number) =>
			beat === callTimeBeat ? fakeCurrentTime : fakeCurrentTime + LOOKAHEAD_SECONDS + 1
		);

		const callback = vi.fn();
		// No explicit startBeat — should default to clock.currentBeat at call time
		run(finiteGen([{ note: 60, duration: 1 }]), callback, 1);

		expect(callback).toHaveBeenCalledTimes(1);
	});

	it('does NOT schedule events from beat 0 when currentBeat is non-zero', () => {
		// If startBeat defaults to 0 (old bug), beat 0 would be in-window when
		// currentBeat is 100, causing spurious early emission.
		vi.spyOn(clock, 'currentBeat', 'get').mockReturnValue(50);

		// beat 0 is in-window, beat 50 is not — the bug would emit at beat 0
		vi.spyOn(clock, 'beatToAudioTime').mockImplementation((beat: number) =>
			beat < 50 ? fakeCurrentTime - 1 : fakeCurrentTime + LOOKAHEAD_SECONDS + 1
		);

		const callback = vi.fn();
		run(finiteGen([1, 2, 3]), callback, 1);

		// With the fix, nextBeat starts at 50 (out-of-window), so nothing emits
		expect(callback).not.toHaveBeenCalled();
	});

	it('respects explicit startBeat=0, does not fall back to clock.currentBeat', () => {
		// Guards against a hypothetical ?? → || regression: || would treat 0 as falsy
		// and redirect to clock.currentBeat (100), silently skipping beat 0.
		vi.spyOn(clock, 'currentBeat', 'get').mockReturnValue(100);

		// beat 0 is in-window; beat 1 is not
		vi.spyOn(clock, 'beatToAudioTime').mockImplementation((beat: number) =>
			beat === 0 ? fakeCurrentTime - 1 : fakeCurrentTime + LOOKAHEAD_SECONDS + 1
		);

		const callback = vi.fn();
		run(finiteGen([{ note: 60, duration: 1 }]), callback, 1, 0); // explicit 0

		expect(callback).toHaveBeenCalledTimes(1);
	});
});

// ---------------------------------------------------------------------------
// 9. Duration guards (#11) — coincident events, negatives, NaN, runaway
// ---------------------------------------------------------------------------

describe('run() — duration guards', () => {
	it('dispatches coincident events (duration 0) without erroring', () => {
		// Two events at the same beat — e.g. downbeats from two patterns.
		// The scheduler fires both at the same ntpTime and keeps running.
		vi.spyOn(clock, 'beatToAudioTime').mockReturnValue(fakeCurrentTime - 1);

		const callback = vi.fn();
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		run(finiteGen([{ duration: 0 }, { duration: 1 }]), callback, 0.5, 0);

		expect(callback).toHaveBeenCalledTimes(2);
		expect(errorSpy).not.toHaveBeenCalled();
		errorSpy.mockRestore();
	});

	it('aborts when consecutive zero-duration events exceed MAX_COINCIDENT_EVENTS', () => {
		vi.spyOn(clock, 'beatToAudioTime').mockReturnValue(fakeCurrentTime - 1);

		// Infinite generator of zero-duration events — classic runaway.
		function* runaway() {
			while (true) yield { duration: 0 };
		}

		const callback = vi.fn();
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		run(runaway(), callback, 0.5, 0);

		expect(errorSpy).toHaveBeenCalledTimes(1);
		expect(errorSpy.mock.calls[0][0]).toMatch(/consecutive zero-duration events/i);
		errorSpy.mockRestore();
	});

	it('stops the scheduler when an event has negative duration', () => {
		vi.spyOn(clock, 'beatToAudioTime').mockReturnValue(fakeCurrentTime - 1);

		const callback = vi.fn();
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		run(finiteGen([{ duration: -1 }, { duration: 1 }]), callback, 0.5, 0);

		expect(callback).toHaveBeenCalledTimes(0);
		expect(errorSpy).toHaveBeenCalledTimes(1);
		expect(errorSpy.mock.calls[0][0]).toMatch(/negative or non-finite duration/i);
		errorSpy.mockRestore();
	});

	it('stops when event duration is NaN — does not hang silently', () => {
		// NaN <= 0 is false, so without !isFinite() the guard would not fire.
		// nextBeat += NaN makes nextBeat NaN permanently → eternal silent hang.
		vi.spyOn(clock, 'beatToAudioTime').mockReturnValue(fakeCurrentTime - 1);

		const callback = vi.fn();
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		run(finiteGen([{ duration: NaN }, { duration: 1 }]), callback, 0.5, 0);

		expect(callback).toHaveBeenCalledTimes(0);
		expect(errorSpy).toHaveBeenCalledTimes(1);
		errorSpy.mockRestore();
	});
});

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

// ---------------------------------------------------------------------------
// 10. sc.setAt — timed /n_set bundle (issue #18)
// ---------------------------------------------------------------------------

describe('sc.setAt()', () => {
	const fakeNodeId = 42;
	const fakeNtpTime = 1234.5;

	function makeOscMock() {
		const sendOSC = vi.fn();
		const encodeSingleBundle = vi.fn().mockReturnValue(new Uint8Array([1, 2, 3]));
		const sonic = { ...fakeSonic, nextNodeId: vi.fn().mockReturnValue(fakeNodeId) };
		const osc = { encodeSingleBundle };
		vi.mocked(getInstance).mockReturnValue(sonic as unknown as ReturnType<typeof getInstance>);
		vi.mocked(getOsc).mockReturnValue(osc as ReturnType<typeof getOsc>);
		// Patch sendOSC onto sonic
		(sonic as Record<string, unknown>).sendOSC = sendOSC;
		return { sendOSC, encodeSingleBundle, sonic };
	}

	it('calls encodeSingleBundle with /n_set and the nodeId', () => {
		const { encodeSingleBundle } = makeOscMock();
		sc.setAt(fakeNtpTime, fakeNodeId, { gate: 0 });
		expect(encodeSingleBundle).toHaveBeenCalledWith(fakeNtpTime, '/n_set', [fakeNodeId, 'gate', 0]);
	});

	it('sends the encoded bytes via sonic.sendOSC', () => {
		const { sendOSC } = makeOscMock();
		sc.setAt(fakeNtpTime, fakeNodeId, { gate: 0 });
		expect(sendOSC).toHaveBeenCalledWith(new Uint8Array([1, 2, 3]));
	});

	it('flattens multiple params into the OSC message', () => {
		const { encodeSingleBundle } = makeOscMock();
		sc.setAt(fakeNtpTime, fakeNodeId, { note: 64, amp: 0.8 });
		const args = encodeSingleBundle.mock.calls[0][2] as unknown[];
		// nodeId, then key-value pairs
		expect(args[0]).toBe(fakeNodeId);
		// params: note=64, amp=0.8 — order follows Object.entries
		expect(args).toContain('note');
		expect(args).toContain(64);
		expect(args).toContain('amp');
		expect(args).toContain(0.8);
	});

	it('sends only nodeId when params is empty', () => {
		const { encodeSingleBundle } = makeOscMock();
		sc.setAt(fakeNtpTime, fakeNodeId, {});
		expect(encodeSingleBundle).toHaveBeenCalledWith(fakeNtpTime, '/n_set', [fakeNodeId]);
	});
});

// ---------------------------------------------------------------------------
// 11. sc.synthAt / sc.setAt — null guard when engine not ready
// ---------------------------------------------------------------------------

describe('sc.synthAt() — null guard', () => {
	beforeEach(() => {
		vi.mocked(getInstance).mockReturnValue(null as ReturnType<typeof getInstance>);
		vi.mocked(getOsc).mockReturnValue(null as ReturnType<typeof getOsc>);
	});

	it('returns -1 and does not throw when engine is not ready', () => {
		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		expect(() => {
			const id = sc.synthAt(1234.5, 'sonic-pi-prophet');
			expect(id).toBe(-1);
		}).not.toThrow();
		consoleSpy.mockRestore();
	});

	it('logs an error when engine is not ready', () => {
		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		sc.synthAt(1234.5, 'sonic-pi-prophet');
		expect(consoleSpy).toHaveBeenCalled();
		consoleSpy.mockRestore();
	});
});

describe('sc.setAt() — null guard', () => {
	beforeEach(() => {
		vi.mocked(getInstance).mockReturnValue(null as ReturnType<typeof getInstance>);
		vi.mocked(getOsc).mockReturnValue(null as ReturnType<typeof getOsc>);
	});

	it('does not throw when engine is not ready', () => {
		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		expect(() => sc.setAt(1234.5, 42, { gate: 0 })).not.toThrow();
		consoleSpy.mockRestore();
	});

	it('logs an error when engine is not ready', () => {
		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		sc.setAt(1234.5, 42, { gate: 0 });
		expect(consoleSpy).toHaveBeenCalled();
		consoleSpy.mockRestore();
	});
});

// ---------------------------------------------------------------------------
// 12. run() — callback exception handling
// ---------------------------------------------------------------------------

describe('run() — callback exception handling', () => {
	it('calls onError when the callback throws', () => {
		vi.spyOn(clock, 'beatToAudioTime').mockImplementation(boundedBeatMock(1));
		vi.spyOn(clock, 'beatsToSeconds').mockReturnValue(0.5);

		const onError = vi.fn();
		const throwingCallback = vi.fn().mockImplementationOnce(() => {
			throw new Error('boom');
		});

		run(finiteGen([{ duration: 1 }]), throwingCallback, 1, 0, onError);

		expect(onError).toHaveBeenCalledWith(expect.stringContaining('boom'));
	});

	it('continues scheduling subsequent events after the callback throws (non-fatal)', () => {
		// The callback throws on the first event but the scheduler must continue
		// and deliver all remaining events in the lookahead window.
		// Use beat-aware mock: beats 0, 1, 2 all in-window; beat 3+ out-of-window.
		vi.spyOn(clock, 'beatToAudioTime').mockImplementation((beat: number) =>
			beat < 3 ? fakeCurrentTime : fakeCurrentTime + LOOKAHEAD_SECONDS + 1
		);

		const callback = vi.fn().mockImplementationOnce(() => {
			throw new Error('non-fatal error');
		});
		const onError = vi.fn();

		run(finiteGen([{ duration: 1 }, { duration: 1 }, { duration: 1 }]), callback, 1, 0, onError);

		// Callback threw on first call — subsequent events must still be delivered
		expect(callback).toHaveBeenCalledTimes(3);
		expect(onError).toHaveBeenCalledTimes(1);
	});

	it('does not set active=false after a callback exception — timer is still scheduled', () => {
		// After a callback throws, the scheduler must not stop. Verify by checking
		// that a new timer was scheduled (the tick loop continues) even after an exception.
		// We put the only event out-of-window so the loop exits normally (not via exception),
		// then verify that the exception on a prior tick didn't kill the timer.
		vi.spyOn(clock, 'beatToAudioTime').mockImplementation(boundedBeatMock(1));

		const callback = vi.fn().mockImplementationOnce(() => {
			throw new Error('recoverable');
		});
		const onError = vi.fn();

		run(finiteGen([{ duration: 1 }, { duration: 1 }]), callback, 1, 0, onError);

		// Callback threw and scheduler continued past it. Timer should be scheduled for next tick.
		expect(vi.getTimerCount()).toBeGreaterThan(0);
		expect(onError).toHaveBeenCalledTimes(1);
	});
});

// ---------------------------------------------------------------------------
// 13. sc.synthAt — non-finite param filtering
// ---------------------------------------------------------------------------

describe('sc.synthAt() — non-finite param filtering', () => {
	function makeOscMock() {
		const sendOSC = vi.fn();
		const encodeSingleBundle = vi.fn().mockReturnValue(new Uint8Array([1, 2, 3]));
		const sonic = { ...fakeSonic, nextNodeId: vi.fn().mockReturnValue(99) };
		const osc = { encodeSingleBundle };
		vi.mocked(getInstance).mockReturnValue(sonic as unknown as ReturnType<typeof getInstance>);
		vi.mocked(getOsc).mockReturnValue(osc as ReturnType<typeof getOsc>);
		(sonic as Record<string, unknown>).sendOSC = sendOSC;
		return { sendOSC, encodeSingleBundle };
	}

	it('drops NaN params and logs an error', () => {
		const { encodeSingleBundle } = makeOscMock();
		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		sc.synthAt(1234.5, 'sonic-pi-prophet', 'source', { freq: NaN, amp: 0.5 });
		const args = encodeSingleBundle.mock.calls[0][2] as unknown[];
		expect(args).not.toContain('freq');
		expect(args).not.toContain(NaN);
		expect(consoleSpy).toHaveBeenCalled();
		consoleSpy.mockRestore();
	});

	it('drops Infinity params and logs an error', () => {
		const { encodeSingleBundle } = makeOscMock();
		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		sc.synthAt(1234.5, 'sonic-pi-prophet', 'source', { freq: Infinity, amp: 0.5 });
		const args = encodeSingleBundle.mock.calls[0][2] as unknown[];
		expect(args).not.toContain('freq');
		expect(consoleSpy).toHaveBeenCalled();
		consoleSpy.mockRestore();
	});

	it('keeps finite params', () => {
		const { encodeSingleBundle } = makeOscMock();
		sc.synthAt(1234.5, 'sonic-pi-prophet', 'source', { freq: 440, amp: 0.5 });
		const args = encodeSingleBundle.mock.calls[0][2] as unknown[];
		expect(args).toContain('freq');
		expect(args).toContain(440);
	});
});
