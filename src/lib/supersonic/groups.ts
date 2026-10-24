import type { SuperSonicInstance } from './types.js';

export const GROUPS = {
	source: 100,
	effects: 200,
	master: 300
} as const;

export type GroupName = keyof typeof GROUPS;

// Called once after supersonic.init() resolves.
// Groups are ordered source → effects → master, which matches scsynth's signal
// flow order (nodes are processed in tree order top-to-bottom).
export function setupGroups(send: SuperSonicInstance['send']): void {
	send('/g_new', GROUPS.source, 1, 0); // add to tail of root node (0)
	send('/g_new', GROUPS.effects, 1, 0);
	send('/g_new', GROUPS.master, 1, 0);
}
