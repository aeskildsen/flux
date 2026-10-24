# flux

> **Alpha software.** Flux is in early development — the language syntax and API are unstable and will change. That said, playing around with it is very much encouraged.

A browser-based audio live-coding environment built on [SuperSonic](https://github.com/samaaron/supersonic), a WebAssembly port of the SuperCollider synthesis engine (scsynth). Write music in the Flux DSL, evaluate it with Ctrl+Enter, and hear it immediately — no installs, no plugins.

## Try it

[→ Live alpha](https://aeskildsen.github.io/flux/)

Boot the engine first (browser autoplay policy requires a user interaction), then write some code and hit **Ctrl+Enter** to evaluate. **Ctrl+.** stops playback.

## What it is

- A DSL for describing musical patterns and loops, interpreted in the browser
- Sends OSC messages to scsynth running in a Web Audio AudioWorklet
- Uses 127 Sonic Pi synth definitions bundled with SuperSonic
- Language spec: [`docs/DSL-spec.md`](docs/DSL-spec.md) — subject to change

## Stack

- [SvelteKit](https://kit.svelte.dev) + Svelte 5 (runes)
- [Monaco Editor](https://microsoft.github.io/monaco-editor/) with a custom Flux language mode
- [SuperSonic](https://github.com/samaaron/supersonic) loaded from CDN at runtime
  - `supersonic-scsynth` — client API (AGPL-3.0-or-later)
  - `supersonic-scsynth-core` — WASM engine + AudioWorklet (AGPL-3.0-or-later)
- Flux-authored synthdefs in `synthdefs/*.scd`, compiled to `static/compiled_synthdefs/`

## Developing

```sh
pnpm install
pnpm dev
```

Open `http://localhost:5173`. Click **boot engine**, write some Flux code, then hit **Ctrl+Enter**.

> Browsers require a user interaction before audio can start — always boot from a button click.

### The engine

The engine is [flux-engine](https://github.com/aeskildsen/flux-engine): SuperSonic with more UGens, for example `PhysWoodbar`. It is the `flux-engine` dependency in `package.json`, a GitHub release tarball (the lockfile has its hash). Flux serves it itself, from the same origin, not from a CDN:

- `scripts/engine.ts` copies the engine into `static/flux-engine/` (not in git). `pnpm dev` and `pnpm build` run it first.
- The SynthDef compile (`pnpm dev`, `pnpm build:synthdefs`) puts the package's SuperCollider classes on the sclang class path, so that SynthDefs can use the flux-engine UGens. sclang then uses a configuration with only its class library, the JSONlib quark and the package classes; installed extensions are not compiled. Install JSONlib once with `sclang scripts/install_sclang_dependencies.scd`.

To use a local flux-engine build instead, set `FLUX_ENGINE_DIR` to an unpacked engine package, a folder with `dist/` and `classes/`:

```sh
FLUX_ENGINE_DIR=~/gp/audio/flux-engine/build/package/latest pnpm dev
```

After a new local engine build, start `pnpm dev` again; it copies the engine at start.

## Testing

```sh
pnpm test:unit   # vitest unit + component tests
pnpm test:e2e    # Playwright end-to-end tests
pnpm test        # both
```

## Building

```sh
pnpm build
pnpm preview
```

## License

Flux is licensed under the GNU Affero General Public License, version 3 or later (AGPL-3.0-or-later). See `LICENSE`.

The SuperSonic engine that Flux loads is also AGPL-3.0-or-later. The built-in samples are CC0 (see `static/samples/PROVENANCE.md`).
