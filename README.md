# flux

> **Alpha software.** Flux is in early development — the language syntax and API are unstable and will change. That said, playing around with it is very much encouraged.

A browser-based audio live-coding environment built on [SuperSonic](https://github.com/samaaron/supersonic), a WebAssembly port of the SuperCollider synthesis engine (scsynth). Write music in the Flux DSL, evaluate it with Ctrl+Enter, and hear it immediately — no installs, no plugins.

## Try it

[→ Live alpha](https://TODO) _(link coming soon)_

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
  - `supersonic-scsynth` — client API
  - `supersonic-scsynth-core` — WASM engine + AudioWorklet (GPL-3.0)
  - `supersonic-scsynth-synthdefs` — 127 Sonic Pi synth definitions

## Developing

```sh
pnpm install
pnpm dev
```

Open `http://localhost:5173`. Click **boot engine**, write some Flux code, then hit **Ctrl+Enter**.

> Browsers require a user interaction before audio can start — always boot from a button click.

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
