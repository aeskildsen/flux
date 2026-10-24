import type { SuperSonicInstance, AddAction } from './types.js';
import { GROUPS, type GroupName } from './groups.js';

export type SynthParams = Record<string, number | string>;

export type Server = ReturnType<typeof createServer>;

export function createServer(instance: SuperSonicInstance) {
	return {
		// Create a new synth in a named group
		synth(
			name: string,
			group: GroupName = 'source',
			params: SynthParams = {},
			addAction: AddAction = 0
		): number {
			const id = instance.nextNodeId();
			const flat = Object.entries(params).flat();
			instance.send('/s_new', name, id, addAction, GROUPS[group], ...flat);
			return id;
		},

		// Set one or more controls on a node
		set(nodeId: number, params: SynthParams): void {
			const flat = Object.entries(params).flat();
			instance.send('/n_set', nodeId, ...flat);
		},

		// Free a node
		free(nodeId: number): void {
			instance.send('/n_free', nodeId);
		},

		// Free all nodes in a named group
		freeGroup(group: GroupName): void {
			instance.send('/g_freeAll', GROUPS[group]);
		},

		// Allocate an empty buffer
		allocBuffer(id: number, frames: number, channels: number): void {
			instance.send('/b_alloc', id, frames, channels);
		},

		// Write sample data into a buffer (wavetables, pitch arrays, etc.)
		fillBuffer(id: number, data: number[]): void {
			instance.send('/b_setn', id, 0, data.length, ...data);
		},

		// Load an audio file into a buffer (WAV, FLAC, etc.)
		loadSample(
			bufnum: number,
			source: string | ArrayBuffer | ArrayBufferView | Blob
		): Promise<unknown> {
			return instance.loadSample(bufnum, source);
		},

		// Load a synthdef by name
		loadSynthDef(name: string): Promise<void> {
			return instance.loadSynthDef(name);
		},

		// Query server status
		query(): void {
			instance.send('/status');
		},

		// Raw passthrough — always available when wrappers aren't enough
		send(...args: (string | number)[]): void {
			instance.send(...args);
		}
	};
}
