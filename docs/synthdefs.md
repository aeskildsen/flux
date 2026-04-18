# SynthDefs

SynthDefs are the synthesis engines that Flux patterns drive. Flux ships its own SynthDef library compiled from SuperCollider `.scd` files.

---

## Selecting a SynthDef

All content types accept an optional `\symbol` argument to choose the SynthDef:

```flux
note(\moog) lead [0 1 2 3]
sample(\oneshot) drums [\kick \hat]
mono(\pad) bass [0 -2 0 -3]
```

Without an explicit `\symbol`, the default SynthDef for the content type is used:

| Content type    | Default SynthDef |
| --------------- | ---------------- |
| `note` / `mono` | `fm`             |
| `sample`        | `samplePlayer`   |
| `slice`         | `slicePlayer`    |
| `cloud`         | `grainCloud`     |

---

## Built-in instrument SynthDefs

The following SynthDefs ship with Flux. Their available `"param` names and ranges are visible in the SynthDef panel in the sidebar.

### `fm` — FM synthesis (default)

The default tonal synth for `note` and `mono`. Supports standard pitch via `freq` and a gated envelope via `gate`.

Key params: `amp`, `pan`, `freq`, `gate`.

### `samplePlayer` — one-shot sample playback

Used by the `sample` content type. The runtime selects `samplePlayer_mono` or `samplePlayer_stereo` based on the loaded buffer's channel count.

Key params: `amp`, `pan`, `buf`, `gate`.

### `slicePlayer` — beat-slicer playback

Used by the `slice` content type. The `sliceIndex` and `numSlices` params control playback position.

Key params: `amp`, `pan`, `buf`, `sliceIndex`, `numSlices`, `gate`.

### `grainCloud` — granular synthesis

Used by the `cloud` content type. Persistent node updated via `.set` messages.

Key params: `amp`, `pan`, `buf`, `density`, `pos`, `gate`.

---

## Insert FX

Insert FX are pattern-scoped and attached with the `|` pipe operator:

```flux
note lead [0 2 4 7] | fx(\lpf)'cutoff(800)
note lead [0 2 4 7] | fx(\delay)'time(3/8)'feedback(0.4)
note lead [0 2 4 7] | fx(\lpf)'cutoff(800) 50%   // 50% wet, 50% dry
```

The pipe operator implicitly routes the pattern's audio output into the FX node.

**Wet/dry level** is an optional integer percentage after all parameter modifiers. Default: 100% wet.

**Silence tail** — FX nodes run until silence after their source stops. Default: 5 seconds. Override with `'tail`:

```flux
note lead [0 2 4] | fx(\lpf)'cutoff(1200)'tail(10)   // 10s tail
note lead [0 2 4] | fx(\lpf)'cutoff(1200)'tail(0)    // free immediately
```

### Built-in FX SynthDefs

| Name       | Description                                   |
| ---------- | --------------------------------------------- |
| `\lpf`     | Low-pass filter. Key params: `cutoff`, `res`  |
| `\hpf`     | High-pass filter. Key params: `cutoff`, `res` |
| `\delay`   | Delay line. Key params: `time`, `feedback`    |
| `\ringmod` | Ring modulator                                |

---

## Master bus FX

A default master bus chain is set up at engine boot:

1. EQ
2. Reverb
3. Dynamics (compressor + limiter)

The master bus chain is configured in the **FX panel** in the sidebar — not from the DSL. The DSL has no syntax for master bus FX.

---

## Channel-count variant selection

At event dispatch, the runtime looks up the active buffer's channel count and selects the appropriate SynthDef variant:

- Mono buffer → `samplePlayer_mono`
- Stereo buffer → `samplePlayer_stereo`

If no variant exists for the detected channel count, the event is skipped with a logged error.

`grainCloud` only exists as a `_mono` variant — if a stereo buffer is selected, a warning is logged and the mono variant is used.

---

## Writing custom SynthDefs

Custom SynthDefs are compiled from SuperCollider `.scd` files. Each def must:

- Declare `type: \instrument` or `type: \fx` in metadata.
- Include `out` (output bus) and `amp` for instruments; `in`, `out`, `gate` for insert FX.
- Use `gate` + a sustained envelope (ADSR) if the runtime should release the node.

The compile script reads metadata from the `.scd` file and emits `metadata.json`. Place compiled `.scsyndef` files in `static/compiled_synthdefs/`. See `docs/SynthDef-spec.md` for the full authoring specification.
