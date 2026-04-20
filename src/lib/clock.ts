/**
 * Clock module — BPM tracking and beats-to-AudioContext time conversion.
 * Consumed by the Phase 4 lookahead scheduler.
 *
 * Must not construct AudioContext before a user interaction (browser autoplay policy).
 * Call clock.start() from a click/keypress handler.
 */

let _ctx: AudioContext | null = null;
let _startTime: number | null = null;
let _bpm = 100;

export const clock = {
	get bpm(): number {
		return _bpm;
	},
	set bpm(value: number) {
		_bpm = value;
	},

	get startTime(): number | null {
		return _startTime;
	},

	get audioContext(): AudioContext | null {
		return _ctx;
	},

	get currentBeat(): number {
		if (_startTime === null || _ctx === null) return 0;
		return (_ctx.currentTime - _startTime) / (60 / _bpm);
	},

	/** Set the AudioContext to use. Must be called before start(). */
	setContext(ctx: AudioContext): void {
		_ctx = ctx;
	},

	start(): void {
		if (_ctx === null) throw new Error('Clock: call setContext() before start()');
		_startTime = _ctx.currentTime;
	},

	/**
	 * Reset the clock to beat 0 at the current AudioContext time.
	 * Use this for stop→play transitions so playback begins immediately
	 * rather than waiting for the next cycle boundary on the old clock.
	 * The cycle counter resets to 0 because generators always restart
	 * their traversal when playback begins from stopped.
	 */
	reset(): void {
		if (_ctx === null) throw new Error('Clock: call setContext() before reset()');
		_startTime = _ctx.currentTime;
	},

	stop(): void {
		_startTime = null;
	},

	/** Convert a duration in beats to a duration in seconds at the current BPM. */
	beatsToSeconds(beats: number): number {
		return beats * (60 / _bpm);
	},

	/** Convert an absolute beat position to an AudioContext.currentTime value. */
	beatToAudioTime(beat: number): number {
		if (_startTime === null) throw new Error('Clock not started');
		return _startTime + this.beatsToSeconds(beat);
	}
};
