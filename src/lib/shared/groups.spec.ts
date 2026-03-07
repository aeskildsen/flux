import { describe, it, expect, vi } from 'vitest';
import type { SuperSonicInstance } from './types.js';
import { GROUPS, setupGroups } from './groups.js';

describe('GROUPS constants', () => {
	it('source is 100', () => expect(GROUPS.source).toBe(100));
	it('effects is 200', () => expect(GROUPS.effects).toBe(200));
	it('master is 300', () => expect(GROUPS.master).toBe(300));

	it('group IDs are below the scsynth auto-assign range (1000+)', () => {
		for (const id of Object.values(GROUPS)) {
			expect(id).toBeLessThan(1000);
		}
	});

	it('all group IDs are unique', () => {
		const ids = Object.values(GROUPS);
		expect(new Set(ids).size).toBe(ids.length);
	});
});

describe('setupGroups', () => {
	function makeSend() {
		const calls: (string | number)[][] = [];
		const send: SuperSonicInstance['send'] = vi.fn((...args) => calls.push(args));
		return { send, calls };
	}

	it('sends exactly three /g_new messages', () => {
		const { send, calls } = makeSend();
		setupGroups(send);
		expect(calls).toHaveLength(3);
		expect(calls.every((c) => c[0] === '/g_new')).toBe(true);
	});

	it('creates source group (100) added to tail of root (addAction=1, target=0)', () => {
		const { send, calls } = makeSend();
		setupGroups(send);
		expect(calls[0]).toEqual(['/g_new', 100, 1, 0]);
	});

	it('creates effects group (200) after source', () => {
		const { send, calls } = makeSend();
		setupGroups(send);
		expect(calls[1]).toEqual(['/g_new', 200, 1, 0]);
	});

	it('creates master group (300) last', () => {
		const { send, calls } = makeSend();
		setupGroups(send);
		expect(calls[2]).toEqual(['/g_new', 300, 1, 0]);
	});

	it('creates groups in source → effects → master order (signal flow order)', () => {
		const { send, calls } = makeSend();
		setupGroups(send);
		const ids = calls.map((c) => c[1]);
		expect(ids).toEqual([GROUPS.source, GROUPS.effects, GROUPS.master]);
	});
});
