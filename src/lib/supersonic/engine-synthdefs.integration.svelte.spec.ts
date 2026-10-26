/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { userEvent } from 'vitest/browser';
import { boot, serverState, getInstance, getServer } from './supersonic.svelte.js';

// Flux's compiled SynthDefs in the engine that Flux deploys: the flux-engine
// package (node_modules/flux-engine), not the stock SuperSonic engine of the
// other integration tests. Each SynthDef must load with /done and play in
// that engine with no /fail reply. The engine sends /fail, for example, when
// a SynthDef uses a UGen that the engine does not have. Thus this test finds
// a SynthDef that does not fit the engine when either of them changes.
//
// The compiled SynthDefs come from `pnpm build:synthdefs` (sclang). Without
// them, for example on a machine with no sclang, the tests are skipped.
// scripts/ci-test.sh compiles them and sets VITE_FLUX_REQUIRE_SYNTHDEFS=1;
// then no compiled SynthDefs is a failure, not a skip.

const COMPILED = '/static/compiled_synthdefs/';
const ENGINE = '/node_modules/flux-engine/dist/';
const required = import.meta.env.VITE_FLUX_REQUIRE_SYNTHDEFS === '1';

const metadata: Record<string, unknown> | null = await fetch(`${COMPILED}metadata.json`)
	.then((r) => (r.ok ? r.json() : null))
	.catch(() => null);
const names = Object.keys(metadata ?? {}).sort();

function wait(ms: number) {
	return new Promise((r) => setTimeout(r, ms));
}

const fails: unknown[][] = [];
const done: string[] = [];

it.runIf(required)('finds the compiled SynthDefs', () => {
	expect(names.length, `no SynthDefs in ${COMPILED}metadata.json`).toBeGreaterThan(0);
});

describe.skipIf(names.length === 0)('compiled SynthDefs in the flux-engine package', () => {
	beforeAll(async () => {
		await userEvent.click(document.body);
		await boot({ baseURL: ENGINE, coreBaseURL: ENGINE, synthdefBaseURL: COMPILED });
		(getInstance() as any).on('in', (msg: unknown[]) => {
			// A SynthDef that frees itself (a percussive envelope) can be gone
			// before the test frees it; the engine then answers /n_free with
			// /fail. That is not a fault of the SynthDef.
			if (msg[0] === '/fail' && msg[1] !== '/n_free') fails.push(Array.from(msg));
			if (msg[0] === '/done') done.push(String(msg[1]));
		});
	}, 15_000);

	afterEach(async () => {
		getServer()?.freeGroup('source');
		await wait(100);
	});

	it('boots the flux-engine package', () => {
		expect(serverState.booted).toBe(true);
		expect(serverState.statusKind).toBe('ok');
	});

	it.each(names)('%s loads with /done and plays with no /fail', async (name) => {
		fails.length = 0;
		done.length = 0;
		const sc = getServer()!;
		await sc.loadSynthDef(name);
		const node = sc.synth(name, 'source', {});
		await wait(200);
		sc.free(node);
		await wait(100);
		expect(done).toContain('/d_recv');
		expect(fails).toEqual([]);
	});
});
