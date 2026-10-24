import { describe, it, expect, vi } from 'vitest';
import type { SuperSonicInstance } from './types.js';
import { createServer } from './osc.js';

function makeMockInstance(): { instance: SuperSonicInstance; calls: (string | number)[][] } {
	const calls: (string | number)[][] = [];
	let nodeIdCounter = 1000;
	const instance = {
		init: vi.fn(),
		nextNodeId: vi.fn(() => nodeIdCounter++),
		loadSynthDef: vi.fn().mockResolvedValue(undefined),
		loadSample: vi.fn().mockResolvedValue(undefined),
		send: vi.fn((...args: (string | number)[]) => calls.push(args)),
		sendOSC: vi.fn(),
		audioContext: null,
		clock: undefined
	} satisfies SuperSonicInstance;
	return { instance, calls };
}

describe('synth', () => {
	it('sends /s_new with correct args for source group', () => {
		const { instance, calls } = makeMockInstance();
		const sc = createServer(instance);
		sc.synth('sonic-pi-prophet', 'source', { note: 52, release: 4 });
		expect(calls).toEqual([['/s_new', 'sonic-pi-prophet', 1000, 0, 100, 'note', 52, 'release', 4]]);
	});

	it('sends /s_new targeting effects group (200)', () => {
		const { instance, calls } = makeMockInstance();
		const sc = createServer(instance);
		sc.synth('my-fx', 'effects');
		expect(calls).toEqual([['/s_new', 'my-fx', 1000, 0, 200]]);
	});

	it('sends /s_new targeting master group (300)', () => {
		const { instance, calls } = makeMockInstance();
		const sc = createServer(instance);
		sc.synth('my-limiter', 'master');
		expect(calls).toEqual([['/s_new', 'my-limiter', 1000, 0, 300]]);
	});

	it('returns the allocated node id', () => {
		const { instance } = makeMockInstance();
		const sc = createServer(instance);
		expect(sc.synth('beep')).toBe(1000);
		expect(sc.synth('beep')).toBe(1001);
	});

	it('defaults to source group when group is omitted', () => {
		const { instance, calls } = makeMockInstance();
		const sc = createServer(instance);
		sc.synth('sonic-pi-prophet');
		expect(calls[0][4]).toBe(100);
	});

	it('sends no extra args when params are empty', () => {
		const { instance, calls } = makeMockInstance();
		const sc = createServer(instance);
		sc.synth('beep', 'source', {});
		expect(calls).toEqual([['/s_new', 'beep', 1000, 0, 100]]);
	});
});

describe('set', () => {
	it('sends /n_set with node id and flattened params', () => {
		const { instance, calls } = makeMockInstance();
		const sc = createServer(instance);
		sc.set(1001, { cutoff: 80, amp: 0.5 });
		expect(calls).toEqual([['/n_set', 1001, 'cutoff', 80, 'amp', 0.5]]);
	});

	it('sends /n_set with a single param', () => {
		const { instance, calls } = makeMockInstance();
		const sc = createServer(instance);
		sc.set(1001, { freq: 440 });
		expect(calls).toEqual([['/n_set', 1001, 'freq', 440]]);
	});

	it('sends /n_set with only node id when params are empty', () => {
		const { instance, calls } = makeMockInstance();
		const sc = createServer(instance);
		sc.set(1001, {});
		expect(calls).toEqual([['/n_set', 1001]]);
	});
});

describe('free', () => {
	it('sends /n_free with the node id', () => {
		const { instance, calls } = makeMockInstance();
		const sc = createServer(instance);
		sc.free(1001);
		expect(calls).toEqual([['/n_free', 1001]]);
	});
});

describe('freeGroup', () => {
	it('sends /g_freeAll for source group (100)', () => {
		const { instance, calls } = makeMockInstance();
		const sc = createServer(instance);
		sc.freeGroup('source');
		expect(calls).toEqual([['/g_freeAll', 100]]);
	});

	it('sends /g_freeAll for effects group (200)', () => {
		const { instance, calls } = makeMockInstance();
		const sc = createServer(instance);
		sc.freeGroup('effects');
		expect(calls).toEqual([['/g_freeAll', 200]]);
	});

	it('sends /g_freeAll for master group (300)', () => {
		const { instance, calls } = makeMockInstance();
		const sc = createServer(instance);
		sc.freeGroup('master');
		expect(calls).toEqual([['/g_freeAll', 300]]);
	});
});

describe('allocBuffer', () => {
	it('sends /b_alloc with id, frames, channels', () => {
		const { instance, calls } = makeMockInstance();
		const sc = createServer(instance);
		sc.allocBuffer(0, 44100, 1);
		expect(calls).toEqual([['/b_alloc', 0, 44100, 1]]);
	});
});

describe('fillBuffer', () => {
	it('sends /b_setn with startIndex=0, count, then values', () => {
		const { instance, calls } = makeMockInstance();
		const sc = createServer(instance);
		sc.fillBuffer(0, [60, 62, 64]);
		expect(calls).toEqual([['/b_setn', 0, 0, 3, 60, 62, 64]]);
	});

	it('sends correct count for a single-element buffer', () => {
		const { instance, calls } = makeMockInstance();
		const sc = createServer(instance);
		sc.fillBuffer(1, [440]);
		expect(calls).toEqual([['/b_setn', 1, 0, 1, 440]]);
	});
});

describe('loadSample', () => {
	it('delegates to instance.loadSample with bufnum and source', async () => {
		const { instance } = makeMockInstance();
		const sc = createServer(instance);
		const result = sc.loadSample(0, 'kick.wav');
		expect(instance.loadSample).toHaveBeenCalledWith(0, 'kick.wav');
		await expect(result).resolves.toBeUndefined();
	});

	it('passes ArrayBuffer sources through', async () => {
		const { instance } = makeMockInstance();
		const sc = createServer(instance);
		const buf = new ArrayBuffer(8);
		await sc.loadSample(1, buf);
		expect(instance.loadSample).toHaveBeenCalledWith(1, buf);
	});
});

describe('loadSynthDef', () => {
	it('delegates to instance.loadSynthDef and returns its promise', async () => {
		const { instance } = makeMockInstance();
		const sc = createServer(instance);
		const result = sc.loadSynthDef('sonic-pi-prophet');
		expect(instance.loadSynthDef).toHaveBeenCalledWith('sonic-pi-prophet');
		await expect(result).resolves.toBeUndefined();
	});
});

describe('query', () => {
	it('sends /status', () => {
		const { instance, calls } = makeMockInstance();
		const sc = createServer(instance);
		sc.query();
		expect(calls).toEqual([['/status']]);
	});
});

describe('send (raw passthrough)', () => {
	it('forwards arbitrary OSC args', () => {
		const { instance, calls } = makeMockInstance();
		const sc = createServer(instance);
		sc.send('/d_recv', 42, 'blob');
		expect(calls).toEqual([['/d_recv', 42, 'blob']]);
	});
});
