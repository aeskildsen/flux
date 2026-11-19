# Requires just 1.23.0 or later.
import 'just/loader.just'

# List available recipes
default:
    @just --list

# Where the stack stands: releases, pins and local checkouts of md2misc, isospin, flux-engine and Flux (--no-fetch: no git fetch)
status *args:
    @pnpm exec tsx scripts/stack-status.ts {{args}}

# Fast check: the server tests on this machine (browser tests: just test)
check:
    pnpm vitest run --project server
