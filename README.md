# flux

A SvelteKit app for audio live coding in the browser, built on [SuperSonic](https://github.com/samaaron/supersonic) — a WebAssembly port of the SuperCollider synthesis engine (scsynth).

## What it does

Flux boots the scsynth audio engine inside a Web Audio AudioWorklet and lets you trigger synths by sending OSC messages from the browser. No plugins, no native installs — just WebAssembly and the Web Audio API.

The current state is a minimal working example: a boot button that initialises the engine and loads a synth definition, and a play button that triggers a note.

`src/lib/shared/` contains the shared SuperSonic infrastructure (boot lifecycle, server node tree, OSC wrappers, reactive state). This is intended to become a standalone `svelte-supersonic` git submodule shared with a future sibling app.

## Stack

- [SvelteKit](https://kit.svelte.dev) + Svelte 5 (runes)
- [SuperSonic](https://github.com/samaaron/supersonic) loaded from CDN at runtime
  - `supersonic-scsynth` — client API
  - `supersonic-scsynth-core` — WASM engine + AudioWorklet (GPL-3.0)
  - `supersonic-scsynth-synthdefs` — 127 Sonic Pi synth definitions

## Developing

```sh
pnpm install
pnpm dev
```

Open `http://localhost:5173`. Click **boot engine**, then **play sound**. Open DevTools console to see the SuperSonic debug output (OSC messages, scsynth logs).

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

## Also included

`example.html` — a standalone single-file version of the same demo with no build step, useful for isolating SuperSonic issues outside the framework. Open it directly in a browser or serve it with `npx serve .`.
