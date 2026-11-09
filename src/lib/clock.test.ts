/**
 * clock.ts unit tests.
 *
 * The clock module uses module-level singletons.  We give it a fake time source
 * whose now() is NTP_BASE + a programmable time, as the engine clock gives NTP
 * seconds.  Tests that need the clock running call clock.start() after setting
 * the time; they call clock.stop() in afterEach to reset _startTime between tests.
 *
 * NOTE: _bpm resets to 100 before each test for predictability.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { clock } from './clock.js';

// ---------------------------------------------------------------------------
// Fake time source
// ---------------------------------------------------------------------------

// An NTP time in 2023. The engine clock gives 0 until the engine has rendered its
// first block, so a time of 0 means "not running".
const NTP_BASE = 3_900_000_000;
let fakeCurrentTime = 0;

const fakeSource = { now: () => NTP_BASE + fakeCurrentTime };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setTime(t: number) {
	fakeCurrentTime = t;
}

// ---------------------------------------------------------------------------
// Reset between tests
// ---------------------------------------------------------------------------

beforeEach(() => {
	fakeCurrentTime = 0;
	clock.setTimeSource(fakeSource);
	clock.stop();
	clock.bpm = 100;
});

afterEach(() => {
	clock.stop();
	clock.bpm = 100;
});

// ---------------------------------------------------------------------------
// 1. BPM property
// ---------------------------------------------------------------------------

describe('clock.bpm', () => {
	it('defaults to 100', () => {
		expect(clock.bpm).toBe(100);
	});

	it('can be set to a new value', () => {
		clock.bpm = 120;
		expect(clock.bpm).toBe(120);
	});

	it('accepts fractional BPM', () => {
		clock.bpm = 98.5;
		expect(clock.bpm).toBe(98.5);
	});
});

// ---------------------------------------------------------------------------
// 2. start / stop / startTime
// ---------------------------------------------------------------------------

describe('clock.start / clock.stop', () => {
	it('startTime is null before clock.start()', () => {
		expect(clock.startTime).toBeNull();
	});

	it('startTime equals the time of the time source at the moment of start()', () => {
		setTime(2.5);
		clock.start();
		expect(clock.startTime).toBeCloseTo(NTP_BASE + 2.5);
	});

	it('startTime is null after clock.stop()', () => {
		clock.start();
		clock.stop();
		expect(clock.startTime).toBeNull();
	});

	it('calling start() twice updates startTime to the latest call', () => {
		setTime(1.0);
		clock.start();
		setTime(3.0);
		clock.start();
		expect(clock.startTime).toBeCloseTo(NTP_BASE + 3.0);
	});
});

// ---------------------------------------------------------------------------
// 3. currentBeat
// ---------------------------------------------------------------------------

describe('clock.currentBeat', () => {
	it('returns 0 when the clock is not started', () => {
		setTime(5);
		expect(clock.currentBeat).toBe(0);
	});

	it('returns 0 immediately after start at t=0', () => {
		setTime(0);
		clock.start();
		expect(clock.currentBeat).toBeCloseTo(0);
	});

	it('returns correct beat at 100 BPM: 1 second = 100/60 beats', () => {
		setTime(0);
		clock.start();
		setTime(0.6); // 0.6 s at 100 BPM = 0.6 / (60/100) = 1 beat
		expect(clock.currentBeat).toBeCloseTo(1);
	});

	it('returns correct beat at 120 BPM: 0.5 s = 1 beat', () => {
		clock.bpm = 120;
		setTime(0);
		clock.start();
		setTime(0.5);
		expect(clock.currentBeat).toBeCloseTo(1);
	});

	it('returns correct beat at 60 BPM: 2 s = 2 beats', () => {
		clock.bpm = 60;
		setTime(0);
		clock.start();
		setTime(2);
		expect(clock.currentBeat).toBeCloseTo(2);
	});

	it('beat increases linearly with elapsed time', () => {
		setTime(0);
		clock.start();
		setTime(0.3); // 0.5 beat at 100 BPM
		const b1 = clock.currentBeat;
		setTime(0.6); // 1.0 beat at 100 BPM
		const b2 = clock.currentBeat;
		expect(b2).toBeCloseTo(b1 * 2, 5);
	});

	it('beat is negative if currentTime is before startTime (clock started in the future)', () => {
		setTime(5.0);
		clock.start();
		setTime(4.0); // 1 second before start
		expect(clock.currentBeat).toBeLessThan(0);
	});
});

// ---------------------------------------------------------------------------
// 4. beatsToSeconds
// ---------------------------------------------------------------------------

describe('clock.beatsToSeconds', () => {
	it('1 beat at 60 BPM = 1 second', () => {
		clock.bpm = 60;
		expect(clock.beatsToSeconds(1)).toBeCloseTo(1);
	});

	it('1 beat at 120 BPM = 0.5 seconds', () => {
		clock.bpm = 120;
		expect(clock.beatsToSeconds(1)).toBeCloseTo(0.5);
	});

	it('1 beat at 100 BPM = 0.6 seconds', () => {
		clock.bpm = 100;
		expect(clock.beatsToSeconds(1)).toBeCloseTo(0.6);
	});

	it('2 beats = 2 × 1-beat duration', () => {
		clock.bpm = 90;
		expect(clock.beatsToSeconds(2)).toBeCloseTo(clock.beatsToSeconds(1) * 2);
	});

	it('0 beats = 0 seconds', () => {
		expect(clock.beatsToSeconds(0)).toBe(0);
	});

	it('fractional beats are handled correctly', () => {
		clock.bpm = 120;
		expect(clock.beatsToSeconds(0.5)).toBeCloseTo(0.25);
	});
});

// ---------------------------------------------------------------------------
// 5. beatToNtp
// ---------------------------------------------------------------------------

describe('clock.beatToNtp', () => {
	it('throws if clock is not started', () => {
		expect(() => clock.beatToNtp(0)).toThrow('Clock not started');
	});

	it('beat 0 returns startTime', () => {
		setTime(2.0);
		clock.start();
		expect(clock.beatToNtp(0)).toBeCloseTo(NTP_BASE + 2.0);
	});

	it('beat 1 at 60 BPM = startTime + 1', () => {
		clock.bpm = 60;
		setTime(1.0);
		clock.start();
		expect(clock.beatToNtp(1)).toBeCloseTo(NTP_BASE + 2.0);
	});

	it('beat 2 at 120 BPM = startTime + 1', () => {
		clock.bpm = 120;
		setTime(0);
		clock.start();
		expect(clock.beatToNtp(2)).toBeCloseTo(NTP_BASE + 1.0);
	});

	it('negative beat gives time before startTime', () => {
		clock.bpm = 60;
		setTime(5.0);
		clock.start();
		expect(clock.beatToNtp(-1)).toBeCloseTo(NTP_BASE + 4.0);
	});
});

// ---------------------------------------------------------------------------
// 6. clock.reset() — restarts the clock from beat 0 at the current time
// ---------------------------------------------------------------------------

describe('clock.reset()', () => {
	it('sets startTime to the current time of the time source', () => {
		setTime(5.0);
		clock.start(); // started at t=5
		setTime(10.0); // time has advanced
		clock.reset(); // reset at t=10
		expect(clock.startTime).toBeCloseTo(NTP_BASE + 10.0);
	});

	it('currentBeat is 0 immediately after reset', () => {
		setTime(0);
		clock.start();
		setTime(2.4); // some beats have elapsed
		clock.reset(); // reset at t=2.4
		// After reset, startTime = 2.4, currentTime = 2.4, so currentBeat = 0
		expect(clock.currentBeat).toBeCloseTo(0);
	});

	it('currentBeat advances from 0 after reset', () => {
		setTime(0);
		clock.start();
		setTime(5.0); // elapsed 5 seconds
		clock.reset();
		// clock was reset at t=5; now advance to t=5.6 (0.6s = 1 beat at 100bpm)
		setTime(5.6);
		expect(clock.currentBeat).toBeCloseTo(1);
	});

	it('sets startTime correctly when called before any start() (time source already set)', () => {
		// The module-level singleton makes it impossible to unset the time source from a test
		// without accessing private state. This test verifies that reset() works from a
		// never-started state (startTime is null). beforeEach always calls setTimeSource().
		setTime(3.0);
		clock.reset(); // should not throw — the time source was set in beforeEach
		expect(clock.startTime).toBeCloseTo(NTP_BASE + 3.0);
	});

	it('is independent of prior start() calls — discards old startTime', () => {
		setTime(1.0);
		clock.start();
		setTime(100.0);
		clock.reset(); // discard old startTime=1.0, set new startTime=100.0
		expect(clock.startTime).toBeCloseTo(NTP_BASE + 100.0);
		expect(clock.currentBeat).toBeCloseTo(0);
	});

	it('works even when clock was previously stopped (startTime was null)', () => {
		clock.stop(); // startTime = null
		setTime(7.0);
		clock.reset(); // should set startTime to 7.0 even from stopped state
		expect(clock.startTime).toBeCloseTo(NTP_BASE + 7.0);
		expect(clock.currentBeat).toBeCloseTo(0);
	});
});

// ---------------------------------------------------------------------------
// 7. Time source
// ---------------------------------------------------------------------------

describe('clock time source', () => {
	it('now() gives the time of the time source', () => {
		setTime(4.25);
		expect(clock.now()).toBeCloseTo(NTP_BASE + 4.25);
	});

	it('start() and reset() throw while the time source gives 0 (engine not running yet)', () => {
		// A start time of 0 puts every beat in 1900: each bundle would be LATE.
		clock.setTimeSource({ now: () => 0 });
		expect(() => clock.start()).toThrow('does not run yet');
		expect(() => clock.reset()).toThrow('does not run yet');
		expect(clock.startTime).toBeNull();
	});

	it('running is true only while the time source gives a time after 0', () => {
		expect(clock.running).toBe(true);
		clock.setTimeSource({ now: () => 0 });
		expect(clock.running).toBe(false);
	});

	it('currentBeat is 0 while the time source gives 0, also when a start time is set', () => {
		setTime(10);
		clock.start();
		// For example, the engine stops its clock while a loop runs.
		clock.setTimeSource({ now: () => 0 });
		expect(clock.currentBeat).toBe(0);
	});
});
