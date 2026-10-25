# flux

> **Alpha software.** Flux is in early development — the language syntax and API are unstable and will change. That said, playing around with it is very much encouraged.

A browser-based audio live-coding environment built on [SuperSonic](https://github.com/samaaron/supersonic), a WebAssembly port of the SuperCollider synthesis engine (scsynth). Write music in the Flux DSL, evaluate it with Ctrl+Enter, and hear it immediately — no installs, no plugins.

## Try it

[→ Live alpha](https://aeskildsen.github.io/flux/)

Boot the engine first (browser autoplay policy requires a user interaction), then write some code and hit **Ctrl+Enter** to evaluate. **Ctrl+.** stops playback.

## What it is

- A DSL for describing musical patterns and loops, interpreted in the browser
- Sends OSC messages to scsynth running in a Web Audio AudioWorklet
- Plays its own synth definitions, written for Flux
- Language spec: [`docs/DSL-spec.md`](docs/DSL-spec.md) — subject to change

## Stack

- [SvelteKit](https://kit.svelte.dev) + Svelte 5 (runes)
- [Monaco Editor](https://microsoft.github.io/monaco-editor/) with a custom Flux language mode
- [flux-engine](https://github.com/aeskildsen/flux-engine): [SuperSonic](https://github.com/samaaron/supersonic) with extra UGens (for example `PhysWoodbar`), served by Flux itself from the same origin, not from a CDN (AGPL-3.0-or-later)
  - Svelte bindings for SuperSonic in `src/lib/supersonic/`
- Flux-authored synthdefs in `synthdefs/*.scd`, compiled to `static/compiled_synthdefs/`

## Developing

```sh
pnpm install
pnpm dev
```

Open `http://localhost:5173`, click **boot engine**, write some Flux code, then press **Ctrl+Enter**. The SynthDefs need sclang to compile.

See [`DEVELOPING.md`](DEVELOPING.md) for the prerequisites, the engine and SynthDef setup, the tests, the CI container and the build.

## License

Flux is licensed under the GNU Affero General Public License, version 3 or later (AGPL-3.0-or-later). See `LICENSE`.

The engine that Flux loads (flux-engine, based on SuperSonic) is also AGPL-3.0-or-later; the page links to its notice. The built-in samples are CC0 (see `static/samples/PROVENANCE.md`).
