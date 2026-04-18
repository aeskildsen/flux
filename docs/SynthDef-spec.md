# Flux SynthDef Specification

_This is the authoritative reference for authoring SynthDefs that integrate with the Flux runtime. The `.scd` file is the single source of truth; the compile script extracts metadata from it and emits `metadata.json` for the web app._

_Conformance language follows RFC 2119: **must**, **must not**, **should**, **may**._

---

## 1. SynthDef types

Every SynthDef **must** declare one of two types:

| Type          | Routing group | Description                                          |
| ------------- | ------------- | ---------------------------------------------------- |
| `\instrument` | sources       | Sound source — synthesised, sample-based, or both    |
| `\fx`         | effects       | Effect processor that reads from and writes to buses |

### Instrument capabilities (inferred from arguments)

The runtime infers what a def needs from its declared arguments — no extra metadata field is required:

- **Tonal** — declares `freq`. Enables `\degree`, `\midinote`, `\scale` etc. in the event system.
- **Buffer-dependent** — declares `buf`. The runtime resolves the buffer from `defaultBuffer` metadata or `@buf` at pattern instantiation. A def may declare both `freq` and `buf` (e.g. a vocoder).

### FX sub-roles

FX defs **must** declare `fx_role` in metadata, as the runtime cannot reliably infer it from arguments alone:

- **`\insert`** — DSL-accessible via `| fx(\name)`. Reads from an explicit `in` bus, writes to `out`. Instantiated per-pattern by the scheduler.
- **`\master`** — configured in the FxPanel UI, not DSL-accessible. Uses `ReplaceOut` on `out` (reads from + replaces the hardware output bus in place). Must **not** declare an `in` argument.

> If a future def fits neither type (e.g. bus analysis, metering), extend with `\utility`.

---

## 2. Required and reserved argument names

These names carry runtime semantics. Use them **only** for their defined purpose; do not repurpose them.

### 2.1 Required by type

| Argument | Type(s)              | Default | Semantics                                                                                                                                         |
| -------- | -------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `out`    | all                  | `0`     | Output bus index. The runtime sets this before instantiation.                                                                                     |
| `in`     | insert `fx`          | —       | Input bus index. The runtime sets this before instantiation. No default. Master FX must not declare `in` — they read from `out` via `ReplaceOut`. |
| `gate`   | `fx`, sustained inst | `1`     | Set to `0` by the runtime to release the envelope and free the node.                                                                              |
| `amp`    | `instrument`         | `0.1`   | Output amplitude (linear). The runtime maps `\db` events through this.                                                                            |
| `freq`   | tonal `instrument`   | `440`   | Oscillator frequency in Hz. Signals tonality to the runtime (see §1).                                                                             |
| `buf`    | buffer-dependent     | —       | Buffer number. Signals buffer dependency to the runtime (see §1). Resolved from `defaultBuffer` or `@buf`.                                        |

**`instrument`** — must have `out`, `amp`. Should have `gate` if it uses a sustained envelope. Should have `freq` if tonal. Should have `buf` if it reads from a buffer, and must then include `defaultBuffer` in metadata.

**`fx` (insert)** — must have `in`, `out`, `gate`. The gated envelope is required (see §4).

**`fx` (master)** — must have `out`. Must **not** have `in`. Uses `ReplaceOut` on `out`. `gate` is not required (master FX are freed by the FxPanel toggle, not by DSL scheduling).

### 2.2 Recommended conventional names

Use these when the parameter matches the concept. They are not runtime-reserved but follow wide SuperCollider convention.

| Argument | Typical range | Semantics                    |
| -------- | ------------- | ---------------------------- |
| `pan`    | −1 … 1        | Stereo position; 0 = centre  |
| `cutoff` | 20 … 20 000   | Filter cutoff frequency (Hz) |
| `res`    | 0 … 1         | Filter resonance             |

### 2.3 Reserved names — do not use as SynthDef arguments

These names are consumed by SuperCollider's event/pattern system and will produce unexpected behaviour if used as SynthDef arguments in SuperCollider. For cross-compatibility, we advice against using these terms as SynthDef arguments:

`dur`, `sustain`, `stretch`, `legato`, `scale`, `degree`, `octave`, `midinote`, `detune`, `db`, `mtranspose`, `gtranspose`, `ctranspose`, `strum`, `strumEndsTogether`, `addAction`, `group`, `delta`.

---

## 3. Metadata schema

Metadata is embedded in the `.scd` file as a SuperCollider `Event` (dictionary literal) on the `SynthDef` `metadata:` argument. The compile script reads this at build time and emits `metadata.json` for the web app. **The `.scd` file is the source of truth** — never edit the generated JSON directly.

### 3.1 Top-level fields

All fields are SC symbols or values as they appear in the `.scd` source.

| Field             | SC type      | Required                | Description                                                                         |
| ----------------- | ------------ | ----------------------- | ----------------------------------------------------------------------------------- |
| `credit`          | String       | yes                     | Author name                                                                         |
| `type`            | Symbol       | yes                     | `\instrument` or `\fx`                                                              |
| `fx_role`         | Symbol       | yes (if `\fx`)          | `\insert` or `\master`                                                              |
| `contentTypes`    | Array\[Sym\] | no (see §3.3)           | Content-type keywords this SynthDef can back (e.g. `[\note, \mono]` or `[\sample]`) |
| `description`     | String       | yes                     | Prose description of the sound or character                                         |
| `specs`           | Dictionary   | yes                     | Keyed by control name Symbol; values are `ControlSpec` (see §3.2)                   |
| `defaultBuffer`   | String       | yes (if declares `buf`) | Buffer name in the runtime registry loaded automatically at boot                    |
| `buffer_channels` | Integer      | yes (if declares `buf`) | Expected channel count of the associated buffer                                     |
| `url`             | String       | no                      | Link to documentation or demo                                                       |

> `name` and `source` are not authored in the `.scd` file — they are injected by the compile script from the `SynthDef` name and filename respectively.

### 3.2 `specs` — parameter descriptors

`specs` is a `Dictionary` keyed by control name Symbol. Each value is a `ControlSpec`. The compile script serialises each `ControlSpec` to a JSON object.

**Guideline:** expose parameters the DSL or performer may want to modulate per-event or per-cycle by adding a ControlSpec with the argument's name. For what should be stable or not be set by the user, don't add a spec. Frequency-like parameters should use `\exp` warp with meaningful min/max values.

```sclang
specs: Dictionary.newFrom([
    \freq, ControlSpec(minVal, maxVal, warp, step, default, units),
    ...
])
```

`ControlSpec` argument order: `minVal, maxVal, warp, step, default, units`.

**Warp values** — pass a SC symbol or a number:

| Value           | SC class          | Description                                                                  |
| --------------- | ----------------- | ---------------------------------------------------------------------------- |
| `\lin` (or `0`) | `LinearWarp`      | Linear mapping — use for most knobs                                          |
| `\exp`          | `ExponentialWarp` | Exponential — use for frequency and time parameters                          |
| `\sin`          | `SineWarp`        | Sine curve (smooth acceleration)                                             |
| `\cos`          | `CosineWarp`      | Cosine curve (smooth deceleration)                                           |
| `\amp`          | `FaderWarp`       | Amplitude fader — perceptually even loudness                                 |
| `\db`           | `DbFaderWarp`     | dB fader — maps through dB/amplitude conversion                              |
| _any number_    | `CurveWarp`       | Envelope-style curve; positive = convex, negative = concave (e.g. `4`, `-4`) |

The compile script serialises each `ControlSpec` to a JSON object with the keys `min`, `max`, `default`, `curve`, `unit`. The `curve` field holds the SC symbol name (e.g. `"lin"`, `"exp"`, `"amp"`, `"db"`, `"sin"`, `"cos"`) or a number for `CurveWarp` instances. Named warps are kept as strings because each represents a distinct mapping function (`\exp` is a true exponential, `\amp` is x², `\db` maps through decibels) — there is no lossless reduction to a single number.

### 3.3 `contentTypes` — DSL content-keyword eligibility

`contentTypes` is an **optional** array of content-type symbols advertising which DSL keywords this SynthDef can serve as a default or selectable alternative for. It powers context-aware autocomplete in the editor: `note(\…)` suggests only defs whose `contentTypes` includes `\note`, and so on.

| Content keyword | Meaning when listed                                                                |
| --------------- | ---------------------------------------------------------------------------------- |
| `\note`         | Polyphonic pitched instrument — new node per event                                 |
| `\mono`         | Monophonic pitched instrument — single persistent node (usually pair with `\note`) |
| `\sample`       | One-shot buffer player; event list contains `\symbol` buffer names                 |
| `\slice`        | Beat-slice player; consumes `sliceIndex` + `numSlices`                             |
| `\cloud`        | Granular cloud synth; persistent node                                              |

**When to omit:** FX SynthDefs (`type: \fx`) are not driven by content keywords — they are invoked via `| fx(\…)`, `send_fx`, or `master_fx`. Omit `contentTypes` for FX defs. An empty array `[]` is semantically misleading (it would claim the def has zero valid content contexts), so omission is the idiomatic choice.

**Example:**

```sclang
metadata: (
    type: \instrument,
    contentTypes: [\note, \mono],    // pitched — valid for both
    ...
)
```

---

## 4. FX SynthDef requirements

### 4.1 Insert FX

Insert FX **must** implement an internal envelope gated by `gate`:

- When the DSL frees an insert FX it sets `gate` to `0`. The FX node closes its envelope and frees itself with `doneAction: Done.freeSelf`. A click-free fade is the SynthDef's responsibility.
- `'tail` in the DSL starts **after** the node has freed itself; it is not a substitute for the envelope fade. The default `'tail` is 5 seconds, overridable per insert with `'tail(n)`.
- Insert FX SynthDefs without a gated envelope are non-conforming and will produce clicks on removal.

**Bus convention:** Read from bus `in`, write to bus `out` using `ReplaceOut` (or `Out` to a different bus). Do not hardcode bus numbers.

### 4.2 Master FX

Master FX do **not** require a gated envelope. They are long-lived nodes freed only when the user disables the slot in the FxPanel (via `sc.free`).

**Bus convention:** Read from bus `out` using `In.ar(out, 2)`, write back to the same bus using `ReplaceOut.ar(out, sig)`. This replaces the hardware output in place — no private bus is needed. Master FX **must** be instantiated in chain order on the `master` group so that `ReplaceOut` stages compose correctly.

---

## 5. Buffer-dependent SynthDefs

SynthDefs that declare a `buf` argument require a buffer at runtime.

**Buffer resolution order:**

1. `@buf(...)` decorator on the pattern — highest priority
2. `defaultBuffer` from the SynthDef metadata
3. Runtime error — the pattern does not start

`@buf` is a semantic error on `sample` content type (buffer selection is per-event, not per-pattern).

**Channel variants:** SynthDefs that differ only in channel count use a `_mono` / `_stereo` suffix. The runtime selects the correct variant automatically based on the buffer's channel count. The DSL surface is unchanged — the performer never specifies channel count.

Granular SynthDefs exist only as `_mono` variants. If a stereo buffer is selected via `@buf`, the runtime logs a warning and uses the mono first channel in the buffer.

---

## 6. Example metadata

The following example is drawn from `synthdefs/master_fx.scd` (`\master_reverb`).

**`.scd` source (authored):**

```sclang
SynthDef(\master_reverb, {
    arg out = 0, mix = 0.2, room = 0.2, damp = 0.5;
    var sig = In.ar(out, 2);
    sig = FreeVerb2.ar(sig[0], sig[1], mix, room, damp, 1);
    ReplaceOut.ar(out, sig);
},
metadata: (
    credit: "Anders Eskildsen",
    type: \fx,
    fx_role: \master,
    specs: Dictionary.newFrom([
        \mix,  ControlSpec(0, 1, \lin, 0, 0.2, ""),
        \room, ControlSpec(0, 1, \lin, 0, 0.2, ""),
        \damp, ControlSpec(0, 1, \lin, 0, 0.5, ""),
    ]),
    description: "A stereo reverb effect using FreeVerb2. Applies room simulation to a stereo input bus with controls for wet/dry mix, room size, and high-frequency damping.",
    url: ""
));
```

**`metadata.json` (generated by compile script):**

```json
"master_reverb": {
    "credit": "Anders Eskildsen",
    "description": "A stereo reverb effect using FreeVerb2. Applies room simulation to a stereo input bus with controls for wet/dry mix, room size, and high-frequency damping.",
    "fx_role": "master",
    "source": "master_fx.scd",
    "specs": {
        "damp": { "curve": "lin", "default": 0.5, "max": 1, "min": 0, "unit": "" },
        "mix":  { "curve": "lin", "default": 0.2, "max": 1, "min": 0, "unit": "" },
        "room": { "curve": "lin", "default": 0.2, "max": 1, "min": 0, "unit": "" }
    },
    "type": "fx",
    "url": ""
}
```

> `name` and `source` are injected by the compile script. For `CurveWarp` instances (numeric warp), `curve` is the raw number (e.g. `4`); for all named warps it is the symbol string (e.g. `"lin"`, `"exp"`, `"amp"`).
