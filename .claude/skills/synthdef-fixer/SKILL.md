---
name: synthdef-fixer
description: Validate and fix SuperCollider SynthDef .scd files in the Flux project against the SynthDef spec. Use this skill whenever the user wants to validate, lint, check conformance, or fix a .scd file — or when they mention .add, ~synthdefs, missing metadata, wrong args, or anything about SynthDef authoring rules. Also use proactively after writing or editing a SynthDef.
---

# SynthDef Fixer

Validates and fixes Flux `.scd` SynthDef files against `docs/SynthDef-spec.md`.

## Setup

1. Read the spec: `/home/pax/gp/flux/docs/SynthDef-spec.md` (ground truth — the rules below are a summary)
2. Identify scope: file or directory the user specified. Default to `/home/pax/gp/flux/synthdefs/` if unspecified.
3. Read all `.scd` files in scope.

## Parsing approach

SuperCollider is not JSON — parse by text analysis. For each file, find:

- **SynthDef blocks**: `SynthDef(\name, { ... }, metadata: ( ... ))` — may span many lines
- **Variable assignment**: `varName = SynthDef(...)` at the start (any single identifier, including single letters like `x`, `a`, `k`)
- **`.add` calls**: `)..add` or `)).add` immediately after the closing `)` of a SynthDef
- **`arg` declarations**: inside the function body, `arg foo = 0, bar;` or named-control style `var foo = \foo.kr(0)`
- **`metadata:` block**: the `( ... )` event literal following `metadata:`
- **`~synthdefs = [...]`**: the export line, usually at the bottom of the file

## Validation checklist

Run every check. Emit `[FAIL]` for must-fix violations, `[WARN]` for should-fix issues.

### 1. Export pattern

| Check | Severity |
|---|---|
| SynthDef is assigned to a named variable: `var = SynthDef(...)` | FAIL |
| `.add` is NOT called on the SynthDef | FAIL |
| `~synthdefs = [var1, var2]` exists at bottom, listing every SynthDef var | FAIL |

> **Why**: The runtime loads defs by evaluating the file and reading `~synthdefs`. Calling `.add` directly fires the def into the server immediately, bypassing the compile/load pipeline. Missing `~synthdefs` means the runtime can't find the def at all.

### 2. Required metadata fields

| Field | Required when | Severity if missing |
|---|---|---|
| `type` (`\instrument` or `\fx`) | always | FAIL |
| `fx_role` (`\insert` or `\master`) | type is `\fx` | FAIL |
| `credit` | always | FAIL |
| `description` | always | FAIL |
| `specs` (Dictionary) | always | FAIL |
| `contentTypes` | must be **absent** for FX defs | WARN if present on FX |
| `defaultBuffer` | SynthDef declares `buf` arg | FAIL |
| `buffer_channels` | SynthDef declares `buf` arg | FAIL |

### 3. Required arguments by type

Extract declared arguments (both `arg` style and `\name.kr()` named-control style count).

**All types** — must declare:
- `out` (default `0`)

**`\instrument`** — must declare:
- `amp` (default `0.1`)
- `gate` if the body uses a sustained envelope (`Env.adsr`, `Env.asr`) — WARN if missing
- `freq` if tonal (uses `SinOsc`, oscillators driven by pitch) — WARN if missing
- `buf` if it reads a buffer — then also require `defaultBuffer`/`buffer_channels` in metadata

**`\fx` `\insert`** — must declare:
- `in`, `out`, `gate` — all FAIL if missing
- Body must implement a gated envelope (look for `gate` used in an Env) — WARN if absent

**`\fx` `\master`** — must declare:
- `out`
- Must NOT declare `in` — FAIL if present
- Body should use `ReplaceOut.ar(out, ...)` — WARN if not found

### 3b. Specs content validation

For each entry in the `specs` Dictionary, check:

| Check | Severity |
|---|---|
| Key has a matching declared arg in the SynthDef body | WARN (orphaned spec) |
| ControlSpec has exactly 6 positional args: `(min, max, warp, step, default, units)` | FAIL |
| Warp is a valid named symbol (`\lin`, `\exp`, `\sin`, `\cos`, `\amp`, `\db`) or a number | FAIL if unrecognised symbol |
| Warp `0` (numeric) used where `\lin` is meant | WARN — `0` produces CurveWarp, not LinearWarp; use `\lin` for linear knobs (spec §3.2 lists `\lin (or 0)` but `\lin` is idiomatic and serialises correctly) |
| `\exp` warp with `min ≤ 0` | FAIL — ExponentialWarp requires both endpoints to be strictly positive (or both negative); `min = 0` produces NaN at runtime |
| `default` is outside `[min, max]` | WARN |
| Frequency/time params (`freq`, `cutoff`, `rate`, `lfoRate`, or any param measured in Hz/seconds) use `\lin` warp | WARN — spec §3.2 says "frequency-like parameters should use `\exp`" |

**Missing specs — advisory only:** The spec says to expose params the performer may want to modulate per-event; it is a guideline, not a must. Flag WARN only for the core reserved args (`amp`, `freq`, `pan`) if they are declared but have no spec entry.

**Report specs issues inline** under the relevant SynthDef, e.g.:

```
  \master_reverb  [fx, master]
    [PASS] metadata: type, fx_role, credit, description
    [WARN] specs[\mix]: warp is numeric 0 — use \lin
    [WARN] specs[\room]: warp is numeric 0 — use \lin
    [WARN] specs[\damp]: warp is numeric 0 — use \lin
```

### 4. Reserved argument names

Flag WARN if any of these appear as SynthDef argument names:
`dur`, `sustain`, `stretch`, `legato`, `scale`, `degree`, `octave`, `midinote`, `detune`, `db`, `mtranspose`, `gtranspose`, `ctranspose`, `strum`, `strumEndsTogether`, `addAction`, `group`, `delta`

## Report format

Emit one section per file, one sub-section per SynthDef:

```
FILE: synthdefs/fm.scd
  \fm  [instrument, note+mono]
    [FAIL] export: calls .add — remove it; the runtime loads via ~synthdefs
    [PASS] metadata: type, credit, description, specs, contentTypes
    [PASS] args: out, amp, freq, gate

FILE: synthdefs/sample.scd
  \samplePlayer_stereo  [instrument, sample]
    [PASS] export: assigned to x, listed in ~synthdefs
    [PASS] metadata: all required fields present
    [PASS] args: out, amp, buf (defaultBuffer + buffer_channels present)
```

Print a summary line at the end:  
`N files, M defs — X FAILs, Y WARNs`

## Fixing

After the report, fix every FAIL you can fix automatically:

1. **Remove `.add`** — delete the `.add` suffix from the SynthDef expression
2. **Add or correct `~synthdefs`** — ensure the bottom of the file has `~synthdefs = [var1, var2, ...]` with every SynthDef variable, in declaration order
3. **Add missing `fx_role`** — if you can determine insert vs master from the body (insert reads `in`, master uses `ReplaceOut` without `in`), add it; otherwise ask the user
4. **Do NOT silently change argument names or metadata values** — for arg or content issues, report them and ask the user

Preserve all whitespace, indentation, and comments exactly. Edit only the lines that need changing. After editing, show a compact summary:

```
Fixed fm.scd:
  - Removed .add on \fm
```

If nothing needed fixing, say so.

## Edge cases

- Files with a single SynthDef: `~synthdefs = [var]` (one element, square brackets)
- Files where `~synthdefs` already exists but is missing a var: update the list, don't replace the line wholesale if it has comments
- Named-control style args (`var gate = \gate.kr(1)`) count the same as `arg gate = 1` for all checks
- A SynthDef that uses `DetectSilence` with `doneAction: 2` is self-freeing — `gate` is not needed for it even if it has a long body
