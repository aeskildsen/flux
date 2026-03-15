import { getServer, getInstance, getOsc, GROUPS } from 'svelte-supersonic';
import type { Server, SynthParams, GroupName } from 'svelte-supersonic';
import { run } from '$lib/scheduler';
import { clock } from '$lib/clock';

// Proxy that delegates to the live server at call-time.
// Sketch files import `sc` at module load; the server may not be booted yet.
export const sc: Pick<Server, 'synth' | 'set' | 'free' | 'loadSynthDef'> & {
	synthAt(ntpTime: number, name: string, group?: GroupName, params?: SynthParams): number;
} = {
	synth: (...args) => getServer()!.synth(...args),
	set: (...args) => getServer()!.set(...args),
	free: (...args) => getServer()!.free(...args),
	loadSynthDef: (...args) => getServer()!.loadSynthDef(...args),

	/**
	 * Spawn a synth as a timed OSC bundle with a precise NTP timestamp.
	 * SuperSonic's prescheduler holds the bundle and dispatches at the scheduled time,
	 * regardless of JS thread jitter or background-tab throttling.
	 *
	 * Use this from scheduler callbacks where the second argument is an NTP time:
	 *   return run(gen(), (e, t) => sc.synthAt(t, 'sonic-pi-prophet', 'source', { note: e }), 0.5)
	 */
	synthAt(
		ntpTime: number,
		name: string,
		group: GroupName = 'source',
		params: SynthParams = {}
	): number {
		const sonic = getInstance()!;
		const osc = getOsc()!;
		const id = sonic.nextNodeId();
		const flat = Object.entries(params).flat();
		const bytes = osc.encodeSingleBundle(ntpTime, '/s_new', [name, id, 0, GROUPS[group], ...flat]);
		sonic.sendOSC(bytes);
		return id;
	}
};

export { run, clock };
