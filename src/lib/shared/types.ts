export interface SuperSonicInstance {
	init(): Promise<void>;
	loadSynthDef(name: string): Promise<void>;
	send(...args: (string | number)[]): void;
}

export interface SuperSonicConfig {
	baseURL: string;
	coreBaseURL: string;
	synthdefBaseURL: string;
	debug?: boolean;
}

export type StatusKind = '' | 'ok' | 'error';
