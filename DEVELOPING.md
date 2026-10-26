# Developing Flux

This document tells you how to set up, run, test and build Flux on your own machine.

## Prerequisites

| Tool                                                  | Version                                                                                                      | Used for                         |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------- |
| Node.js                                               | The major version in `.node-version`                                                                         | All scripts                      |
| pnpm                                                  | The version in the `packageManager` field of `package.json`. pnpm 11 switches to that version automatically. | Dependencies and scripts         |
| Chromium for Playwright                               | Installed with `pnpm exec playwright install chromium`                                                       | Browser tests                    |
| sclang (SuperCollider language) and the JSONlib quark | Any recent SuperCollider 3                                                                                   | Compiling the SynthDefs          |
| podman or Docker                                      | Any recent version                                                                                           | `pnpm test:container` (optional) |

On Debian and Ubuntu, Chromium also needs some shared libraries. To install them, run `pnpm exec playwright install-deps chromium`.

To install JSONlib once, run `sclang scripts/install_sclang_dependencies.scd`.

> The compiled SynthDefs are not in git. If sclang is not installed, `pnpm dev` does not compile them. It shows a warning, and Flux starts without synths and makes no sound. The app log then shows an error after boot.

## Run the dev server

```sh
pnpm install
pnpm dev
```

Open `http://localhost:5173`. Click **boot engine**, write some Flux code, then press **Ctrl+Enter**.

> Browsers start audio only after a user interaction. Always boot the engine from a button click.

`pnpm dev` first prepares the engine and the SynthDefs (see below), then starts Vite.

### SynthDefs

Flux has its own SynthDefs in `synthdefs/*.scd`. `scripts/compile_synthdefs.scd` compiles them to `static/compiled_synthdefs/`.

- `pnpm dev` compiles only the SynthDefs that are missing or older than their source.
- `pnpm build:synthdefs` compiles all of them. It fails if sclang is not installed.
- `pnpm check:synthdefs` does the same check as `pnpm dev`, but does not start the server.

See `docs/synthdefs.md` and `docs/SynthDef-spec.md` for how to write a SynthDef.

### The engine

The engine is [flux-engine](https://github.com/aeskildsen/flux-engine): SuperSonic with more UGens, for example `PhysWoodbar`. It is the `flux-engine` dependency in `package.json`, a GitHub release tarball (the lockfile has its hash). Flux serves it itself, from the same origin, not from a CDN:

- `scripts/engine.ts` copies the engine into `static/flux-engine/` (not in git). `pnpm dev` and `pnpm build` run it first.
- The SynthDef compile puts the package's SuperCollider classes on the sclang class path, so that SynthDefs can use the flux-engine UGens. sclang then uses a configuration with only its class library, the JSONlib quark and the package classes; installed extensions are not compiled.

To use a local flux-engine build instead, set `FLUX_ENGINE_DIR` to an unpacked engine package, a folder with `dist/` and `classes/`:

```sh
FLUX_ENGINE_DIR=/somwhere-on-your-computer/flux-engine/build/package/latest pnpm dev
```

After a new local engine build, start `pnpm dev` again; it copies the engine at start.

## Checks

```sh
pnpm lint            # prettier and eslint
pnpm format          # prettier, writes the changes
pnpm check           # type-check with svelte-check
pnpm check:examples  # check the examples in static/examples/ (parse and static checks)
```

A pre-commit hook runs prettier on the staged files (`simple-git-hooks` and `lint-staged`). `pnpm install` does not install the hook. To install it once, run `pnpm exec simple-git-hooks`.

## Tests

```sh
pnpm test:unit       # all tests, watch mode
pnpm test            # all tests, one run
pnpm test:coverage   # server tests, with a coverage report in coverage/
pnpm test:container  # the CI test job, in the CI container image
```

To run one test file:

```sh
pnpm vitest run src/routes/page.svelte.spec.ts
```

Vitest has two projects, which `vite.config.ts` configures:

- **server** runs in Node. It runs `src/**/*.{test,spec}.{js,ts}` and `scripts/**/*.test.ts`, but not `.svelte.` files.
- **client** runs in headless Chromium through Playwright. It runs `src/**/*.svelte.{test,spec}.{js,ts}`.

To run only one project, add `--project server` or `--project client`.

### The CI container

`pnpm test:container` runs `scripts/ci-test.sh` in the same Playwright image as the CI test job. The script reads the image tag from `.github/workflows/deploy.yml`, so the two are always the same. `ci-test.sh` installs the pinned pnpm, compiles the SynthDefs (it installs `sclang` from the Ubuntu archive when it runs as root), then runs lint, the type-check, the server tests with coverage and the browser tests. The compile replaces the files in `static/compiled_synthdefs`. One browser test (`src/lib/supersonic/engine-synthdefs.integration.svelte.spec.ts`) loads and plays each compiled SynthDef in the flux-engine package from `node_modules`; it fails when a SynthDef uses a UGen that the engine does not have, and it is skipped when there are no compiled SynthDefs.

A pass in the container is what counts as green. `pnpm test` on your machine is faster, but it uses your own Node, browser and system libraries. If the two give different results, the container is correct.

The container gets its dependencies from a named volume (`flux-node-modules`), so it does not change the `node_modules` folder of your checkout. A second volume (`flux-pnpm-store`) keeps the pnpm store between runs.

The script works with rootless podman, rootless Docker and rootful Docker. With a rootful engine, it runs the job as your user, so that the files it writes into the checkout belong to you. Two environment variables change how it runs:

| Variable                 | Default                                | Example                                                                                  |
| ------------------------ | -------------------------------------- | ---------------------------------------------------------------------------------------- |
| `CONTAINER_ENGINE`       | `podman` if it is found, else `docker` | `docker`, or `podman --remote` to use the podman of the host from a toolbox or distrobox |
| `FLUX_CONTAINER_NETWORK` | The default network of the engine      | `host`, if containers on the default network cannot reach the internet                   |

`scripts/toolchain.test.ts` fails when the Node version or the Playwright image tag goes out of sync with the installed packages. If you update Playwright or Node, update `.node-version` and the image tag in `deploy.yml` too.

## Build

```sh
pnpm build
pnpm preview
```

`pnpm build` writes a static site to `build/`. To serve it from a subfolder, set `BASE_PATH` (`vite.config.ts`). It is empty or starts with a slash; CI uses `BASE_PATH=/flux`.

The page shows which build it is: the Flux version, the commit, the engine version, a link to the source of that commit, and a link to the engine notice (`scripts/build-info.ts`). A commit with `-dirty` was built from a tree with changes. A version with `-dev` comes from the dev server.

## CI and deploy

`.github/workflows/deploy.yml` runs on every push to `main` and to `feature/*` branches. It has three jobs:

1. **test** runs `scripts/ci-test.sh` in the Playwright container image.
2. **build** runs on an `ubuntu-24.04` runner, not in a container. The runner release is pinned, because the SynthDefs are compiled with the sclang from its apt archive. This job compiles the SynthDefs and builds the app.
3. **deploy** publishes the build to GitHub Pages. It runs only for `main`.

Every push to `main` deploys. A `v0.x.y` git tag marks a milestone only; set the same version in `package.json` before you tag.
