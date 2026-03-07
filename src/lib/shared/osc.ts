import type { SuperSonicInstance } from './types.js';
import { GROUPS, type GroupName } from './groups.js';

export type SynthParams = Record<string, number | string>;

export function spawnSynth(
	instance: SuperSonicInstance,
	name: string,
	group: GroupName = 'source',
	params: SynthParams = {}
): void {
	const groupId = GROUPS[group];
	// /s_new name nodeId addAction targetGroupId ...params
	const flatParams = Object.entries(params).flat();
	instance.send('/s_new', name, -1, 0, groupId, ...flatParams);
}

export function freeNode(instance: SuperSonicInstance, nodeId: number): void {
	instance.send('/n_free', nodeId);
}

export function setParam(
	instance: SuperSonicInstance,
	nodeId: number,
	key: string,
	value: number
): void {
	instance.send('/n_set', nodeId, key, value);
}

export function allocBuffer(
	instance: SuperSonicInstance,
	id: number,
	frames: number,
	channels: number
): void {
	instance.send('/b_alloc', id, frames, channels);
}

export function fillBuffer(
	instance: SuperSonicInstance,
	id: number,
	data: number[]
): void {
	// /b_setn bufnum startIndex count values...
	instance.send('/b_setn', id, 0, data.length, ...data);
}

export function loadSynthDef(instance: SuperSonicInstance, name: string): Promise<void> {
	return instance.loadSynthDef(name);
}

export function queryServer(instance: SuperSonicInstance): void {
	instance.send('/status');
}

// Raw passthrough — always available when wrappers aren't enough
export function send(instance: SuperSonicInstance, ...args: (string | number)[]): void {
	instance.send(...args);
}
