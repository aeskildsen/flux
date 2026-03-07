import { describe, it, expect, vi } from 'vitest';
import type { SuperSonicInstance } from './types.js';
import { spawnSynth, freeNode, setParam, allocBuffer, fillBuffer, queryServer, send } from './osc.js';

function makeMockInstance(): { instance: SuperSonicInstance; calls: (string | number)[][] } {
	const calls: (string | number)[][] = [];
	const instance = {
		init: vi.fn(),
		loadSynthDef: vi.fn(),
		send: vi.fn((...args: (string | number)[]) => calls.push(args))
	} satisfies SuperSonicInstance;
	return { instance, calls };
}

describe('spawnSynth', () => {
	it('sends /s_new with correct args for source group', () => {
		const { instance, calls } = makeMockInstance();
		spawnSynth(instance, 'sonic-pi-prophet', 'source', { note: 52, release: 4 });
		expect(calls).toEqual([['/s_new', 'sonic-pi-prophet', -1, 0, 100, 'note', 52, 'release', 4]]);
	});

	it('sends /s_new targeting effects group (200)', () => {
		const { instance, calls } = makeMockInstance();
		spawnSynth(instance, 'my-fx', 'effects');
		expect(calls).toEqual([['/s_new', 'my-fx', -1, 0, 200]]);
	});

	it('sends /s_new targeting master group (300)', () => {
		const { instance, calls } = makeMockInstance();
		spawnSynth(instance, 'my-limiter', 'master');
		expect(calls).toEqual([['/s_new', 'my-limiter', -1, 0, 300]]);
	});

	it('defaults to source group when group is omitted', () => {
		const { instance, calls } = makeMockInstance();
		spawnSynth(instance, 'sonic-pi-prophet');
		expect(calls[0][4]).toBe(100);
	});

	it('sends no extra args when params are empty', () => {
		const { instance, calls } = makeMockInstance();
		spawnSynth(instance, 'beep', 'source', {});
		expect(calls).toEqual([['/s_new', 'beep', -1, 0, 100]]);
	});
});

describe('freeNode', () => {
	it('sends /n_free with the node id', () => {
		const { instance, calls } = makeMockInstance();
		freeNode(instance, 1001);
		expect(calls).toEqual([['/n_free', 1001]]);
	});
});

describe('setParam', () => {
	it('sends /n_set with node id, key, value', () => {
		const { instance, calls } = makeMockInstance();
		setParam(instance, 1001, 'cutoff', 80);
		expect(calls).toEqual([['/n_set', 1001, 'cutoff', 80]]);
	});
});

describe('allocBuffer', () => {
	it('sends /b_alloc with id, frames, channels', () => {
		const { instance, calls } = makeMockInstance();
		allocBuffer(instance, 0, 44100, 1);
		expect(calls).toEqual([['/b_alloc', 0, 44100, 1]]);
	});
});

describe('fillBuffer', () => {
	it('sends /b_setn with startIndex=0, count, then values', () => {
		const { instance, calls } = makeMockInstance();
		fillBuffer(instance, 0, [60, 62, 64]);
		expect(calls).toEqual([['/b_setn', 0, 0, 3, 60, 62, 64]]);
	});

	it('sends correct count for a single-element buffer', () => {
		const { instance, calls } = makeMockInstance();
		fillBuffer(instance, 1, [440]);
		expect(calls).toEqual([['/b_setn', 1, 0, 1, 440]]);
	});
});

describe('queryServer', () => {
	it('sends /status', () => {
		const { instance, calls } = makeMockInstance();
		queryServer(instance);
		expect(calls).toEqual([['/status']]);
	});
});

describe('send (raw passthrough)', () => {
	it('forwards arbitrary OSC args', () => {
		const { instance, calls } = makeMockInstance();
		send(instance, '/d_recv', 42, 'blob');
		expect(calls).toEqual([['/d_recv', 42, 'blob']]);
	});
});
