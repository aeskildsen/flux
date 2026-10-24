/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { userEvent } from 'vitest/browser';
import { boot, serverState, getServer, getInstance } from './supersonic.svelte.js';
import { localConfig } from './test-utils.js';

function wait(ms: number) {
	return new Promise((r) => setTimeout(r, ms));
}

// Poll until the node tree version changes (i.e. scsynth has processed the OSC message).
async function waitForTreeChange(timeoutMs = 2000): Promise<void> {
	const instance = getInstance() as any;
	const before = instance?.getRawTree()?.version ?? 0;
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		await wait(10);
		if ((instance?.getRawTree()?.version ?? 0) !== before) return;
	}
	throw new Error(`Tree version did not change within ${timeoutMs}ms`);
}

// Walk the node tree and return all synth nodes inside a given group id.
function synthsInGroup(groupId: number): { id: number; defName: string }[] {
	const tree = (getInstance() as any)?.getTree();
	if (!tree?.root) return [];
	const group = findNode(tree.root, groupId);
	return group?.children?.filter((n: any) => n.type === 'synth') ?? [];
}

function findNode(node: any, id: number): any {
	if (node.id === id) return node;
	for (const child of node.children ?? []) {
		const found = findNode(child, id);
		if (found) return found;
	}
	return null;
}

// Integration tests: boots the real WASM engine in Chromium.
// These are slow and require a user-gesture simulation — Vitest browser mode runs in a
// real browser context, so the AudioContext restriction applies.
// userEvent.click() on a DOM element satisfies the user-gesture requirement.

// Boot once for the whole suite — engine startup is expensive.
beforeAll(async () => {
	await userEvent.click(document.body);
	await boot(localConfig);
}, 15_000);

afterEach(async () => {
	// Clean up any nodes spawned during tests and wait for tree to settle.
	getServer()?.freeGroup('source');
	await wait(100);
});

describe('boot()', () => {
	it('sets serverState.booted to true', () => {
		expect(serverState.booted).toBe(true);
		expect(serverState.statusKind).toBe('ok');
	});
});

describe('loadSynthDef', () => {
	it('loads the test.scsyndef fixture without error', async () => {
		const sc = getServer()!;
		// Resolved against synthdefBaseURL → /src/lib/supersonic/fixtures/test.scsyndef
		// Source: fixtures/test.scd
		await expect(sc.loadSynthDef('test')).resolves.not.toThrow();
	}, 5_000);
});

describe('synth create and free', () => {
	it('node appears in source group after spawn and is gone after free', async () => {
		const sc = getServer()!;
		// SOURCE_GROUP = 100 (see groups.ts)
		const SOURCE_GROUP = 100;

		await sc.loadSynthDef('test');
		const node = sc.synth('test', 'source', { freq: 440, amp: 0.1 });
		await waitForTreeChange();
		expect(synthsInGroup(SOURCE_GROUP).length).toBe(1);
		expect(synthsInGroup(SOURCE_GROUP)[0].defName).toBe('test');

		sc.free(node);
		await waitForTreeChange();
		expect(synthsInGroup(SOURCE_GROUP).length).toBe(0);
	});
});

describe('synth set ', () => {
	it('node param "gate" can be set, releasing the node after envelope ends', async () => {
		const sc = getServer()!;
		// SOURCE_GROUP = 100 (see groups.ts)
		const SOURCE_GROUP = 100;

		await sc.loadSynthDef('test');
		const node = sc.synth('test', 'source', { freq: 440, amp: 0.1 });
		await wait(200);

		sc.set(node, { gate: 0 });

		await waitForTreeChange();
		expect(synthsInGroup(SOURCE_GROUP).length).toBe(0);
	});
});

describe('health metrics', () => {
	it('reports audioContextState as "running" after the first poll', async () => {
		// tickHealth() runs every 250ms — wait long enough for at least two polls.
		await wait(600);
		expect(serverState.health.audioContextState).toBe('running');
	});
});
