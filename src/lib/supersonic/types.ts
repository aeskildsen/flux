import type { SuperSonic, ClockworkClock } from 'flux-engine';

// The types come from the declarations in the flux-engine package: the
// SuperSonic client API of the engine that Flux loads. Thus a type check finds
// a member that the engine no longer has.

// The part of the SuperSonic client that this wrapper and its users call.
// clock is undefined until init() resolves.
export type SuperSonicInstance = Pick<
	SuperSonic,
	| 'init'
	| 'nextNodeId'
	| 'loadSynthDef'
	| 'loadSample'
	| 'send'
	| 'sendOSC'
	| 'audioContext'
	| 'clock'
>;

// The part of the engine clock that this wrapper and its users read. now() is
// the NTP time (seconds since 1900) that the audio thread has reached: the
// engine plays a timed bundle when this clock reaches its time tag. It is 0
// until the engine has rendered its first block.
export type SuperSonicClock = Pick<ClockworkClock, 'now'>;

export interface SuperSonicConfig {
	baseURL: string;
	coreBaseURL: string;
	synthdefBaseURL: string;
	debug?: boolean;
}

export type StatusKind = '' | 'ok' | 'error';

// scsynth /s_new add actions (4th argument)
export type AddAction = 0 | 1 | 2 | 3 | 4;

export type EngineHealth = {
	status: 'ok' | 'warn' | 'error';
	audioContextState: string; // 'running' | 'suspended' | 'closed' | '' (before first poll)
	messagesDropped: number; // engineMessagesDropped cumulative counter
	inBufferPct: number; // inBufferUsed.percentage, rounded
	outBufferPct: number; // outBufferUsed.percentage, rounded
};
