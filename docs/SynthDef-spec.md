# Flux SynthDef Specification

_This is the authoritative reference for authoring SynthDefs that integrate with the Flux runtime. The `.scd` file is the single source of truth; the compile script extracts metadata from it and emits `synthdefs.json` for the web app._

_Conformance language follows RFC 2119: **must**, **must not**, **should**, **may**._

---

## 1. SynthDef types

Every SynthDef **must** declare one of three types:

| Type                | Routing group | Description                                          |
| ------------------- | ------------- | ---------------------------------------------------- |
| `instrument_synth`  | sources       | Synthesised sound source                             |
| `instrument_sample` | sources       | Sound source that reads from a runtime buffer        |
| `fx`                | effects       | Effect processor that reads from and writes to buses |

The `fx` type covers two sub-roles with different bus conventions:

- **Insert FX** — DSL-accessible via `| fx(\name)`. Read from an explicit `in` bus, write to `out` via `Out` or `ReplaceOut`. Instantiated per-pattern by the scheduler.
- **Master bus FX** — configured in the FxPanel UI, not DSL-accessible. Use `ReplaceOut` on `out` (reads from + replaces the hardware output bus in place). Do **not** declare an `in` argument — bus routing is implicit via `ReplaceOut`.

Both sub-roles use `type: fx` in metadata. The runtime distinguishes them by context (FxPanel vs DSL), not by type value.

> If a future def fits none of the above (e.g. bus analysis, metering), extend with `utility`.

---

## 2. Required and reserved argument names

These names carry runtime semantics. Use them **only** for their defined purpose; do not repurpose them.

### 2.1 Required by type

| Argument | Type(s)              | Default | Semantics                                                                                                                                             |
| -------- | -------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `out`    | all                  | `0`     | Output bus index. The runtime sets this before instantiation.                                                                                         |
| `in`     | insert `fx`          | —       | Input bus index. The runtime sets this before instantiation. No default. Master bus FX must not declare `in` — they read from `out` via `ReplaceOut`. |
| `gate`   | `fx`, sustained inst | `1`     | Set to `0` by the runtime to release the envelope and free the node.                                                                                  |
| `amp`    | `instrument_*`       | `0.1`   | Output amplitude (linear). The runtime maps `\db` events through this.                                                                                |
| `freq`   | tonal `instrument_*` | `440`   | Oscillator frequency in Hz. Enables `\degree`, `\midinote`, `\scale` etc.                                                                             |
| `buf`    | `instrument_sample`  | —       | Buffer number. The runtime resolves this from `defaultBuffer` or `@buf`.                                                                              |

**`instrument_synth`** — must have `out`, `amp`. Should have `gate` if it uses a sustained envelope. Should have `freq` if it is a pitched instrument.

**`instrument_sample`** — must have `out`, `amp`, `buf`. Should have `gate` if sustained.

**`fx` (insert)** — must have `in`, `out`, `gate`. The gated envelope is required (see §4).

**`fx` (master bus)** — must have `out`. Must **not** have `in`. Uses `ReplaceOut` on `out`. `gate` is not required (master FX are freed by the FxPanel toggle, not by DSL scheduling).

### 2.2 Recommended conventional names

Use these when the parameter matches the concept. They are not runtime-reserved but follow wide SuperCollider convention.

| Argument | Typical range | Semantics                    |
| -------- | ------------- | ---------------------------- |
| `pan`    | −1 … 1        | Stereo position; 0 = centre  |
| `cutoff` | 20 … 20 000   | Filter cutoff frequency (Hz) |
| `res`    | 0 … 1         | Filter resonance             |

### 2.3 Reserved names — do not use as SynthDef arguments

These names are consumed by SuperCollider's event/pattern system and will produce unexpected behaviour if used as SynthDef arguments:

`dur`, `sustain`, `stretch`, `legato`, `scale`, `degree`, `octave`, `midinote`, `detune`, `db`, `mtranspose`, `gtranspose`, `ctranspose`, `strum`, `strumEndsTogether`, `addAction`, `group`, `delta`.

---

## 3. Metadata schema

Metadata is embedded in the `.scd` file as a SuperCollider dictionary and extracted by the compile script.

### 3.1 Top-level fields

| Field           | Type     | Required                     | Description                                                      |
| --------------- | -------- | ---------------------------- | ---------------------------------------------------------------- |
| `name`          | string   | yes                          | Must match the SC def name exactly                               |
| `type`          | enum     | yes                          | `instrument_synth`, `instrument_sample`, or `fx`                 |
| `category`      | enum     | yes                          | See §3.2                                                         |
| `description`   | string   | yes                          | Prose description of the sound or character                      |
| `tags`          | string[] | no                           | Free-form tags for search and discovery                          |
| `defaultBuffer` | string   | yes (if `instrument_sample`) | Buffer name in the runtime registry loaded automatically at boot |
| `specs`         | spec[]   | yes                          | One entry per control (see §3.3)                                 |

### 3.2 `category` values

Extend deliberately, not freely:

- `percussive`
- `tonal`
- `noise`
- `granular`
- `pad`
- `bass`
- `fx-time` — delay, reverb, echo
- `fx-spectral` — filter, EQ, distortion
- `fx-dynamics` — compression, limiting, gating

### 3.3 `specs` — parameter descriptors

One entry per SC control. Mirrors `ControlSpec` fields.

| Field             | Type   | Required | Description                                                                |
| ----------------- | ------ | -------- | -------------------------------------------------------------------------- |
| `name`            | string | yes      | Must match the SC control name exactly                                     |
| `default`         | number | yes      | Default value                                                              |
| `minVal`          | number | yes      | Minimum value                                                              |
| `maxVal`          | number | yes      | Maximum value                                                              |
| `warp`            | enum   | yes      | `lin`, `exp`, `db`, `amp`, `curve`                                         |
| `units`           | string | no       | Human-readable label, e.g. `Hz`, `dB`, `s`, `ms`                           |
| `description`     | string | no       | Short description of what the parameter does                               |
| `curveValue`      | float  | no       | Required when `warp` is `curve`; SC's `\curve` float                       |
| `buffer_channels` | int    | no       | `instrument_sample` only — expected channel count of the associated buffer |

**`warp` values:**

- `lin` — linear
- `exp` — exponential; use for frequency and time parameters
- `db` — decibel; use for amplitude perceived as level
- `amp` — squared curve; perceptually even amplitude
- `curve` — custom SC curve; supply `curveValue`

**Guideline:** expose parameters the DSL or performer may want to modulate per-event or per-cycle. Bake in what should be stable. Parameters governing density, rate, or internal rhythmic variation are good candidates. Frequency-like and density parameters should use `exp` warp with meaningful `minVal`/`maxVal`.

---

## 4. FX SynthDef requirements

### 4.1 Insert FX

Insert FX **must** implement an internal envelope gated by `gate`:

- When the DSL frees an insert FX it sets `gate` to `0`. The FX node closes its envelope and frees itself with `doneAction: Done.freeSelf`. A click-free fade is the SynthDef's responsibility.
- `'tail` in the DSL starts **after** the node has freed itself; it is not a substitute for the envelope fade. The default `'tail` is 5 seconds, overridable per insert with `'tail(n)`.
- Insert FX SynthDefs without a gated envelope are non-conforming and will produce clicks on removal.

**Bus convention:** Read from bus `in`, write to bus `out` using `ReplaceOut` (or `Out` to a different bus). Do not hardcode bus numbers.

### 4.2 Master bus FX

Master bus FX do **not** require a gated envelope. They are long-lived nodes freed only when the user disables the slot in the FxPanel (via `sc.free`).

**Bus convention:** Read from bus `out` using `In.ar(out, 2)`, write back to the same bus using `ReplaceOut.ar(out, sig)`. This replaces the hardware output in place — no private bus is needed. Master bus FX **must** be instantiated in chain order on the `master` group so that `ReplaceOut` stages compose correctly.

---

## 5. Sample-backed SynthDefs

`instrument_sample` SynthDefs require a buffer at runtime.

**Buffer resolution order:**

1. `@buf(...)` decorator on the pattern — highest priority
2. `defaultBuffer` from the SynthDef metadata
3. Runtime error — the pattern does not start

`@buf` is a semantic error on `sample` content type (buffer selection is per-event, not per-pattern).

**Channel variants:** SynthDefs that differ only in channel count use a `_mono` / `_stereo` suffix. The runtime selects the correct variant automatically based on the buffer's channel count. The DSL surface is unchanged — the performer never specifies channel count.

Granular SynthDefs exist only as `_mono` variants. If a stereo buffer is selected via `@buf`, the runtime logs a warning and uses the mono first channel in the buffer.

---

## 6. Example metadata

```json
{
	"name": "moog",
	"type": "instrument_synth",
	"category": "bass",
	"tags": ["filter", "subtractive", "analog-style"],
	"description": "Moog-style subtractive synth with resonant ladder filter. Dense low end, characteristic filter saturation.",
	"specs": [
		{
			"name": "freq",
			"default": 440,
			"minVal": 20,
			"maxVal": 20000,
			"warp": "exp",
			"units": "Hz",
			"description": "Fundamental frequency"
		},
		{
			"name": "cutoff",
			"default": 1000,
			"minVal": 20,
			"maxVal": 20000,
			"warp": "exp",
			"units": "Hz",
			"description": "Filter cutoff frequency"
		},
		{
			"name": "res",
			"default": 0.3,
			"minVal": 0,
			"maxVal": 1,
			"warp": "lin",
			"description": "Filter resonance (self-oscillates above ~0.9)"
		},
		{
			"name": "amp",
			"default": 0.5,
			"minVal": 0,
			"maxVal": 1,
			"warp": "amp",
			"units": "amp",
			"description": "Output amplitude"
		},
		{
			"name": "gate",
			"default": 1,
			"minVal": 0,
			"maxVal": 1,
			"warp": "lin",
			"description": "Gate — set to 0 to release envelope and free node"
		},
		{
			"name": "out",
			"default": 0,
			"minVal": 0,
			"maxVal": 127,
			"warp": "lin",
			"description": "Output bus"
		}
	]
}
```
