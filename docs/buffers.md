# Buffers

Buffers are audio files loaded into the scsynth engine. They are used by `sample`, `slice`, and `cloud` content types.

---

## Loading buffers

Open the **Sample panel** in the sidebar and drag-and-drop audio files (WAV, AIFF, MP3, OGG). Each loaded file gets a name (derived from the filename) and a buffer ID allocated by the registry.

Loaded buffers persist for the session. Removing a buffer from the panel sends a `b_free` OSC message to release the memory in scsynth.

---

## Referencing buffers

Buffers are referenced by their **name** as a `\symbol`:

```flux
sample drums [\kick \hat \snare \hat]
```

The name must match the name shown in the Sample panel exactly (case-sensitive).

---

## `sample` — per-event buffer selection

Each element in the list is a `\symbol` naming a buffer. The runtime looks up the buffer ID from the registry for each event.

```flux
sample drums [\kick \hat \snare \hat]
sample drums [\kick \hat]'pick      // random pick each time
sample drums [\kick \snare]'shuf    // deck-shuffle
```

---

## `@buf` — pattern-level buffer selection for `slice` and `cloud`

`@buf(\name)` binds a single buffer to the whole pattern for one cycle. All events in that cycle share the same buffer.

```flux
@buf(\amen) slice drums [0 4 8 12]'numSlices(16)
@buf(\recording) cloud grain []
```

The buffer name can be selected dynamically per cycle using sequence generators:

```flux
@buf([\loopA \loopB]'pick)    slice drums [0..15]   // random per cycle
@buf([\loopA \loopB])         slice drums [0..15]   // sequential cycling
@buf([\loopA \loopB]'shuf)    slice drums [0..15]   // deck-shuffle per cycle
@buf([\loopA \loopB]'lock)    slice drums [0..15]   // frozen at first pick
@buf([\loopA \loopB]'eager(4)) slice drums [0..15]  // change every 4 cycles
```

The generator is polled **once per cycle** — not once per event.

---

## Beat slicing with `slice`

`slice` divides a buffer into equal-length slices and plays individual slices by index. Use `'numSlices(n)` to tell the SynthDef how many slices the buffer is divided into.

```flux
@buf(\amen) slice drums [0 4 8 12]'numSlices(16)   // 16-slice grid
@buf(\amen) slice drums [0..15]'numSlices(16)      // all 16 slices in order
@buf(\amen) slice drums [0..15]'pick'numSlices(16) // random slice each event
```

Slice indices are integers starting at 0.

---

## Granular synthesis with `cloud`

`cloud` uses a persistent granular synth node. The event list is empty (`[]`) — parameters are modulated via `"param` each cycle.

```flux
@buf(\recording) cloud grain []"density(8)"pos(0.5rand0.8)
```

Key params for `grainCloud`: `density` (grains per second), `pos` (playback position 0.0–1.0).

---

## Channel count and SynthDef variant selection

At event dispatch, the runtime checks the buffer's channel count and selects the appropriate SynthDef variant:

| Channels | Variant selected                             |
| -------- | -------------------------------------------- |
| Mono     | `samplePlayer_mono` / `slicePlayer_mono`     |
| Stereo   | `samplePlayer_stereo` / `slicePlayer_stereo` |

If no variant exists for the channel count, the event is skipped with a logged error. `grainCloud` only exists as a `_mono` variant — stereo buffers fall back to mono with a warning.

---

## Buffer names in the DSL

Buffer names follow the `\symbol` convention — a backslash immediately followed by an identifier, no space:

```flux
\kick          // buffer named "kick"
\amen          // buffer named "amen"
\myRecording   // buffer named "myRecording"
```

The backslash distinguishes buffer names (runtime artefacts) from bare identifiers (built-in language vocabulary like scale names). String literals (`"kick"`) are not valid in Flux — always use `\symbol`.
