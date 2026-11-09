/**
 * Clock module — BPM tracking and beats-to-NTP time conversion.
 * The lookahead scheduler (scheduler.ts) uses this clock.
 *
 * The clock counts beats on the engine's own clock: the time source is the
 * engine clock (`sonic.clock`), whose now() is the NTP time (seconds since
 * 1900) that its audio thread has reached. The engine plays a timed OSC bundle
 * when this clock reaches the time tag of the bundle. Thus a time tag from
 * beatToNtp() needs no conversion, and the engine plays the event on its beat.
 *
 * Call clock.start() from a click/keypress handler, after the engine has booted.
 */

/** A clock that gives the current time in NTP seconds, for example the engine clock. */
export interface TimeSource {
	now(): number;
}

let _source: TimeSource | null = null;
let _startTime: number | null = null;
let _bpm = 100;

function sourceNow(caller: string): number {
	if (_source === null) throw new Error(`Clock: call setTimeSource() before ${caller}()`);
	const now = _source.now();
	// The engine clock gives 0 until the engine has rendered its first block.
	if (!(now > 0)) throw new Error(`Clock: the time source does not run yet (${caller})`);
	return now;
}

export const clock = {
	get bpm(): number {
		return _bpm;
	},
	set bpm(value: number) {
		_bpm = value;
	},

	/** The NTP time of beat 0, or null when the clock is stopped. */
	get startTime(): number | null {
		return _startTime;
	},

	/** The current time of the time source in NTP seconds, or 0 when there is none yet. */
	now(): number {
		return _source?.now() ?? 0;
	},

	/** True when the time source gives a time after 0. The engine clock gives 0 until it runs. */
	get running(): boolean {
		return (_source?.now() ?? 0) > 0;
	},

	/** The current beat, or 0 when the clock is stopped or the time source does not run. */
	get currentBeat(): number {
		if (_startTime === null || _source === null) return 0;
		const now = _source.now();
		if (!(now > 0)) return 0;
		return (now - _startTime) / (60 / _bpm);
	},

	/** Set the time source to use. Must be called before start(). */
	setTimeSource(source: TimeSource): void {
		_source = source;
	},

	start(): void {
		_startTime = sourceNow('start');
	},

	/**
	 * Reset the clock to beat 0 at the current time.
	 * Use this for stop→play transitions so playback begins immediately
	 * rather than waiting for the next cycle boundary on the old clock.
	 * The cycle counter resets to 0 because generators always restart
	 * their traversal when playback begins from stopped.
	 */
	reset(): void {
		_startTime = sourceNow('reset');
	},

	stop(): void {
		_startTime = null;
	},

	/** Convert a duration in beats to a duration in seconds at the current BPM. */
	beatsToSeconds(beats: number): number {
		return beats * (60 / _bpm);
	},

	/** Convert an absolute beat position to an NTP time on the time source's clock. */
	beatToNtp(beat: number): number {
		if (_startTime === null) throw new Error('Clock not started');
		return _startTime + this.beatsToSeconds(beat);
	}
};
