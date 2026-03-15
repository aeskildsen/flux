/**
 * Clock module — BPM tracking and beats-to-AudioContext time conversion.
 * Consumed by the Phase 4 lookahead scheduler.
 *
 * Must not construct AudioContext before a user interaction (browser autoplay policy).
 * Call clock.start() from a click/keypress handler.
 */

let _ctx: AudioContext | null = null;
let _startTime: number | null = null;
let _bpm = 120;

function getCtx(): AudioContext {
	if (!_ctx) _ctx = new AudioContext();
	return _ctx;
}

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
		if (_startTime === null) return 0;
		return (getCtx().currentTime - _startTime) / (60 / _bpm);
	},

	start(): void {
		_startTime = getCtx().currentTime;
	},

	stop(): void {
		_startTime = null;
	},

	/** Convert a duration in beats to a duration in seconds at the current BPM. */
	beatsToSeconds(beats: number): number {
		return beats * (60 / _bpm);
	},

	/** Convert an absolute beat position to an AudioContext.currentTime offset. */
	beatToAudioTime(beat: number): number {
		if (_startTime === null) throw new Error('Clock not started');
		return _startTime + this.beatsToSeconds(beat);
	}
};
