# Requires just 1.23.0 or later.
import 'just/loader.just'

# List available recipes
default:
    @just --list

# Fast check: the server tests on this machine (browser tests: just test)
check:
    pnpm vitest run --project server
