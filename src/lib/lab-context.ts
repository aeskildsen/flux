import { getServer } from 'svelte-supersonic';
import type { Server } from 'svelte-supersonic';
import { run } from '$lib/scheduler';
import { clock } from '$lib/clock';

// Proxy that delegates to the live server at call-time.
// Sketch files import `sc` at module load; the server may not be booted yet.
export const sc: Pick<Server, 'synth' | 'set' | 'free' | 'loadSynthDef'> = {
	synth: (...args) => getServer()!.synth(...args),
	set: (...args) => getServer()!.set(...args),
	free: (...args) => getServer()!.free(...args),
	loadSynthDef: (...args) => getServer()!.loadSynthDef(...args)
};

export { run, clock };
