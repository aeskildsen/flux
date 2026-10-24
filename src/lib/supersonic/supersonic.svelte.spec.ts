import { describe, it, expect, beforeEach } from 'vitest';
import { boot, _stateForTesting } from './supersonic.svelte.js';
import { localConfig } from './test-utils.js';
import type { SuperSonicConfig } from './types.js';

// The boot() success/error paths require a live CDN import() and cannot be unit-tested
// without injecting a loader. Only the guard logic (idempotency) is tested here —
// everything inside the try block is covered by e2e tests.

beforeEach(() => {
	_stateForTesting.booted = false;
	_stateForTesting.booting = false;
	_stateForTesting.status = '';
	_stateForTesting.statusKind = '';
	_stateForTesting.health = {
		status: 'ok',
		audioContextState: '',
		messagesDropped: 0,
		inBufferPct: 0,
		outBufferPct: 0
	};
});

describe('health initial state', () => {
	it('starts with ok status and zero counters', () => {
		expect(_stateForTesting.health).toMatchObject({
			status: 'ok',
			messagesDropped: 0,
			inBufferPct: 0,
			outBufferPct: 0
		});
	});
});

describe('boot() idempotency guards', () => {
	it('does nothing when already booted', async () => {
		_stateForTesting.booted = true;
		// If the guard is absent, boot() would attempt the CDN import and throw.
		// Completing without error confirms the guard fired.
		await expect(boot(localConfig)).resolves.toBeUndefined();
	});

	it('does nothing when a boot is already in progress', async () => {
		_stateForTesting.booting = true;
		await expect(boot(localConfig)).resolves.toBeUndefined();
	});
});

describe('boot() engine location', () => {
	it('rejects with a clear error when no location is given', async () => {
		await expect(boot(undefined as unknown as SuperSonicConfig)).rejects.toThrow(
			/baseURL.*coreBaseURL.*synthdefBaseURL/
		);
	});

	it('names the missing field when the location is incomplete', async () => {
		const { baseURL, coreBaseURL } = localConfig;
		await expect(boot({ baseURL, coreBaseURL } as unknown as SuperSonicConfig)).rejects.toThrow(
			/synthdefBaseURL/
		);
	});

	it('does not enter the booting state when the location is invalid', async () => {
		await boot({} as unknown as SuperSonicConfig).catch(() => {});
		expect(_stateForTesting.booting).toBe(false);
	});
});
