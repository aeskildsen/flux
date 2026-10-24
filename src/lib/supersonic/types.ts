export interface SuperSonicInstance {
	init(): Promise<void>;
	nextNodeId(): number;
	loadSynthDef(name: string): Promise<void>;
	loadSample(
		bufnum: number,
		source: string | ArrayBuffer | ArrayBufferView | Blob
	): Promise<unknown>;
	send(...args: (string | number)[]): void;
	sendOSC(
		oscData: Uint8Array | ArrayBuffer,
		options?: { sessionId?: string; runTag?: string }
	): void;
	readonly audioContext: AudioContext | null;
	readonly initTime: number;
}

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
	messagesDropped: number; // scsynthMessagesDropped cumulative counter
	inBufferPct: number; // inBufferUsed.percentage, rounded
	outBufferPct: number; // outBufferUsed.percentage, rounded
};
