import { asset } from '$app/paths';
import type { PageLoad } from './$types';

export type ParamSpec = {
	min?: number;
	max?: number;
	default?: number;
	warp?: string;
	unit?: string;
};

export type SynthDefMeta = {
	credit: string;
	description: string;
	source: string;
	type: string;
	fx_role?: string;
	url: string;
	contentTypes?: ('note' | 'mono' | 'sample' | 'slice' | 'cloud')[];
	specs?: Record<string, ParamSpec>;
};

export const load: PageLoad = async ({ fetch }) => {
	try {
		const res = await fetch(asset('/compiled_synthdefs/metadata.json'));
		if (res.ok) {
			const synthdefs = (await res.json()) as Record<string, SynthDefMeta>;
			return { synthdefs };
		}
	} catch {
		// metadata not yet compiled — return empty
	}
	return { synthdefs: {} as Record<string, SynthDefMeta> };
};
