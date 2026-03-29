/**
 * clock.ts unit tests.
 *
 * The clock module uses module-level singletons.  We inject a fake AudioContext
 * via vi.stubGlobal so every getCtx() call returns a controlled object with a
 * programmable currentTime.  Tests that need the clock running call clock.start()
 * after setting up the fake; they call clock.stop() in afterEach to reset
 * _startTime between tests.
 *
 * NOTE: _bpm resets to 100 before each test for predictability.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Fake AudioContext
// ---------------------------------------------------------------------------

let fakeCurrentTime = 0;

// Stub before importing the module so getCtx() picks up the fake.
// Must be a constructible function (used with `new AudioContext()`).
class FakeAudioContextCtor {
	get currentTime() {
		return fakeCurrentTime;
	}
}
vi.stubGlobal('AudioContext', FakeAudioContextCtor);

// Import after stubbing.
const { clock } = await import('./clock.js');

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

	it('startTime equals AudioContext.currentTime at the moment of start()', () => {
		setTime(2.5);
		clock.start();
		expect(clock.startTime).toBeCloseTo(2.5);
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
		expect(clock.startTime).toBeCloseTo(3.0);
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
// 5. beatToAudioTime
// ---------------------------------------------------------------------------

describe('clock.beatToAudioTime', () => {
	it('throws if clock is not started', () => {
		expect(() => clock.beatToAudioTime(0)).toThrow('Clock not started');
	});

	it('beat 0 returns startTime', () => {
		setTime(2.0);
		clock.start();
		expect(clock.beatToAudioTime(0)).toBeCloseTo(2.0);
	});

	it('beat 1 at 60 BPM = startTime + 1', () => {
		clock.bpm = 60;
		setTime(1.0);
		clock.start();
		expect(clock.beatToAudioTime(1)).toBeCloseTo(2.0);
	});

	it('beat 2 at 120 BPM = startTime + 1', () => {
		clock.bpm = 120;
		setTime(0);
		clock.start();
		expect(clock.beatToAudioTime(2)).toBeCloseTo(1.0);
	});

	it('negative beat gives time before startTime', () => {
		clock.bpm = 60;
		setTime(5.0);
		clock.start();
		expect(clock.beatToAudioTime(-1)).toBeCloseTo(4.0);
	});
});

// ---------------------------------------------------------------------------
// 6. audioContext accessor
// ---------------------------------------------------------------------------

describe('clock.audioContext', () => {
	it('returns the AudioContext instance after first access', () => {
		// Any call that triggers getCtx() (e.g. start) initialises it.
		clock.start();
		expect(clock.audioContext).not.toBeNull();
	});
});
