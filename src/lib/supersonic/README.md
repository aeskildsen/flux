# SuperSonic wrapper

Svelte 5 bindings for [SuperSonic](https://github.com/samaaron/supersonic). The code is in `src/lib/supersonic/`. Import it with the alias `svelte-supersonic`.

The wrapper started as a separate repository. Its history is part of this repository. The MIT license for the wrapper is in `LICENSE` in this folder.

## Usage

```ts
import { boot, serverState, getServer, GROUPS } from 'svelte-supersonic';
import { engineLocation } from '$lib/engine-location.js';

// Call from a user gesture (click or key press). The browser autoplay policy needs it.
await boot(engineLocation);

// Reactive state
serverState.booted; // boolean
serverState.health; // EngineHealth

// OSC wrappers
const sc = getServer();
sc.synth('my-synth', 'source', { freq: 440, amp: 0.5 });
sc.set(nodeId, { freq: 880 });
sc.free(nodeId);
```

## Engine location

`boot()` has no default location. The caller must give `baseURL`, `coreBaseURL` and `synthdefBaseURL`. If one is missing, `boot()` rejects with an error that names it. In Flux, `src/lib/engine-location.ts` is the only place that sets these URLs.

## Testing

Unit specs run in Node. The integration spec boots the real WASM engine in Chromium. It uses `localConfig` from `test-utils.ts`. This config loads the engine from `node_modules` and the test synthdef from `static/synthdefs/`.

```ts
import { boot } from './supersonic.svelte.js';
import { localConfig } from './test-utils.js';

await boot(localConfig);
```

Run the browser specs of the wrapper:

```sh
pnpm exec vitest run --project client src/lib/supersonic
```
