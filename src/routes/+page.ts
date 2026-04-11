import { asset } from '$app/paths';
import type { PageLoad } from './$types';

export type ParamSpec = {
	min?: number;
	max?: number;
	default?: number;
	warp?: string;
	unit?: string;
};

type SynthDefMeta = {
	credit: string;
	description: string;
	source: string;
	type: string;
	fx_role?: string;
	url: string;
	specs?: Record<string, ParamSpec>;
};

export const load: PageLoad = async ({ fetch }) => {
	try {
		const res = await fetch(asset('/compiled_synthdefs/metadata.json'));
		if (res.ok) {
			const synthdefs: Record<string, SynthDefMeta> = await res.json();
			return { synthdefs };
		}
	} catch {
		// metadata not available (e.g. not yet compiled) — return empty
	}
	return { synthdefs: {} as Record<string, SynthDefMeta> };
};
