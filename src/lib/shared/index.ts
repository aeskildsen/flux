// State + boot lifecycle
export { serverState, boot, getInstance } from './supersonic.svelte.js';

// Group constants
export { GROUPS } from './groups.js';
export type { GroupName } from './groups.js';

// OSC wrappers
export { spawnSynth, freeNode, setParam, allocBuffer, fillBuffer, loadSynthDef, queryServer, send } from './osc.js';
export type { SynthParams } from './osc.js';

// Types
export type { SuperSonicInstance, SuperSonicConfig, StatusKind } from './types.js';

// Config
export { defaultConfig, SUPERSONIC_VERSION } from './config.js';
