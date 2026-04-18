import { asset } from '$app/paths';
import type { PageLoad } from './$types';
import type { ExampleEntry } from '$lib/examples.js';

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
	/** Which DSL content keywords this SynthDef can back. See docs/SynthDef-spec.md §3.3. */
	contentTypes?: ('note' | 'mono' | 'sample' | 'slice' | 'cloud')[];
};

export const load: PageLoad = async ({ fetch }) => {
	const [synthdefs, examples] = await Promise.all([fetchSynthdefs(fetch), fetchExamples(fetch)]);
	return { synthdefs, examples };
};

async function fetchSynthdefs(
	fetch: typeof globalThis.fetch
): Promise<Record<string, SynthDefMeta>> {
	try {
		const res = await fetch(asset('/compiled_synthdefs/metadata.json'));
		if (res.ok) {
			return (await res.json()) as Record<string, SynthDefMeta>;
		}
	} catch {
		// metadata not available (e.g. not yet compiled) — return empty
	}
	return {} as Record<string, SynthDefMeta>;
}

async function fetchExamples(fetch: typeof globalThis.fetch): Promise<ExampleEntry[]> {
	try {
		const res = await fetch(asset('/examples/index.json'));
		if (res.ok) {
			return (await res.json()) as ExampleEntry[];
		}
	} catch {
		// examples not available — return empty list
	}
	return [];
}
