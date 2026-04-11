# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Flux** is a SvelteKit 5 application built around [SuperSonic](https://github.com/samaaron/supersonic) — a Web Audio library that runs the SuperCollider synthesis engine (scsynth) in the browser via WebAssembly. The app provides a UI for booting and controlling the scsynth audio engine, loading synth definitions, and sending OSC messages.

Key SuperSonic concepts:

- `supersonic-scsynth` — Client API, workers, and metrics web component (MIT)
- `supersonic-scsynth-core` — WASM engine + AudioWorklet (GPL-3.0)
- Flux ships its own synth definitions from `synthdefs/*.scd`, compiled to `static/compiled_synthdefs/` by `scripts/compile_synthdefs.scd`. The Sonic Pi synthdef CDN bundle is not used.
- Audio can only start after a user interaction (browser autoplay policy); always call `supersonic.init()` from a click/keypress handler.

## Commands

```bash
pnpm dev          # Start dev server
pnpm build        # Production build
pnpm preview      # Preview production build

pnpm check        # Type-check with svelte-check
pnpm lint         # prettier + eslint check
pnpm format       # Auto-format with prettier

pnpm test:unit    # Run vitest unit/component tests (watch mode)
pnpm test:e2e     # Run Playwright e2e tests (builds first)
pnpm test         # Run all tests (unit + e2e, non-watch)
```

To run a single unit test file:

```bash
pnpm vitest run src/routes/page.svelte.spec.ts
```

## Test Architecture

Two vitest projects are configured in `vite.config.ts`:

- **client** — browser tests using `vitest-browser-svelte` + Playwright/Chromium. Files matching `src/**/*.svelte.{test,spec}.{js,ts}` (excluding `src/lib/server/**`). Use `render()` from `vitest-browser-svelte` and `page` from `vitest/browser`.
- **server** — node environment. Files matching `src/**/*.{test,spec}.{js,ts}` excluding `.svelte.` tests.

File naming convention:

- `*.test.ts` — server/Node tests (no Svelte)
- `*.svelte.spec.ts` — browser/component tests (Svelte + vitest-browser)

E2e tests live in `e2e/` and use Playwright directly (builds the app before running).

## Code Conventions

- Svelte 5 runes syntax (`$props()`, `$state()`, `$derived()`, etc.)
- TypeScript throughout; `svelte-check` enforces type correctness
- `.svelte` and `.svx` (mdsvex markdown+Svelte) extensions are both supported
- ESLint + Prettier enforced; `no-undef` is disabled for TS projects per typescript-eslint recommendation

## DSL Documentation

The Flux DSL is documented in `docs/DSL-spec.md` — this is the single source of truth for language design. `docs/DSL-truthtables.md` and `docs/DSL-grammar.ebnf` flesh out the spec into concrete implementation references. Always consult these documents when working on the parser, evaluator, or anything DSL-related. Do not infer DSL behaviour from the codebase; if there is a conflict, the spec rules (ask user if in doubt).

**Keeping the documents in sync:** any change to the spec that affects observable behaviour must be reflected in the corresponding truth table section, and vice versa. The two files must never contradict each other.

When fixing a bug or implementing a feature, invoke the `/tdd` skill. Language design is full of ambiguity, so use `AskUserQuestion` liberally to confirm intent.

`docs/` is git-tracked. `dev-notes/` is not tracked yet — it contains design notes and open questions which have not been formalised into issues yet.

## Svelte MCP Tools

You have access to the Svelte MCP server with comprehensive Svelte 5 and SvelteKit documentation:

1. **list-sections** — Call this FIRST for any Svelte/SvelteKit topic to find relevant docs.
2. **get-documentation** — Fetch ALL relevant sections identified from `list-sections`. Analyze the `use_cases` field carefully.
3. **svelte-autofixer** — MUST be called on every Svelte component you write before sending to the user. Keep calling until no issues remain.
4. **playground-link** — Generate a Svelte Playground link. Only call after user confirms, and NEVER if code was written to project files.
