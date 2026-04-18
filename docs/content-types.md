# Content Types

The first keyword on a pattern line is the **content type** — it determines what kind of events the pattern generates.

```flux
note  lead [0 2 4]        // polyphonic pitched events
mono  bass [0 -2 0 -3]    // monophonic pitched events
sample drums [\kick \hat \snare \hat]   // buffer playback by name
slice  amen [0 4 8 12]'numSlices(16)    // beat-sliced buffer
cloud  grain []                          // granular synthesis
```

A **name** is required between the content type and the generator — `note [0 2 4]` without a name is a parse error.

---

## `note` — polyphonic pitched events

Spawns a new synth instance for every event. Each instance is self-releasing: a gate-close message is sent after the event's time slot × the legato factor. This matches standard SuperCollider `Pbind` conventions.

```flux
note lead [0 2 4]              // default: loops forever
note lead [0 2 4 7]'n(2)       // play 2 cycles then stop
note lead [<0 4 7>]            // chord: three simultaneous voices
```

Default SynthDef: `fm`. Override with `note(\mySynth) lead [...]`.

Default legato: **0.8** (gate closes at 80 % of the event slot). Override with `'legato(n)`.

---

## `mono` — monophonic pitched events

Maintains a single persistent synth node per named pattern. The first cycle spawns the node; subsequent cycles send `.set` messages to update parameters in place. No re-spawning — no audible click on pitch change.

```flux
mono bass [0 -2 0 -3]          // smooth pitch updates
mono bass [0 2 4]'stut          // each pitch sent twice
```

`'legato` has no effect on `mono` — the node is persistent and legato as overlap-control is undefined.

`<>` chord syntax is a semantic error on `mono` — multiple simultaneous `.set` messages with different degrees produce non-deterministic behaviour.

---

## `sample` — buffer playback by name

Each event in the list is a `\symbol` that names a loaded buffer. The runtime looks up the buffer ID from the registry and passes it to the SynthDef.

```flux
sample drums [\kick \hat \snare \hat]
sample drums [\kick \hat]'stut(2)
```

Default SynthDef: `samplePlayer`. The runtime selects `samplePlayer_mono` or `samplePlayer_stereo` based on the buffer's channel count. Override the SynthDef with `sample(\mySampler) drums [...]`.

`@buf` is a semantic error on `sample` — buffer selection is per-event, inside the list.

---

## `slice` — beat-sliced buffer playback

Each event is an integer slice index into a fixed buffer. Use `'numSlices(n)` to tell the SynthDef how many slices the buffer is divided into.

```flux
@buf(\amen) slice drums [0 4 8 12]'numSlices(16)
@buf([\loopA \loopB]'pick) slice drums [0..15]'numSlices(16)
```

Default SynthDef: `slicePlayer`. The `@buf` decorator (required) selects which buffer to slice. Per-cycle buffer selection is supported — see [Decorators](decorators).

---

## `cloud` — granular synthesis

A persistent granular synth node, updated via `.set` messages each cycle. The event list is empty (`[]`) — parameters are controlled via `"param` notation.

```flux
@buf(\recording) cloud grain []"density(8)"pos(0.5rand0.8)
```

Default SynthDef: `grainCloud`. Like `mono`, `cloud` maintains a single node per name. Parameters can be modulated stochastically.

---

## Timing

One DSL **cycle** is one bar (4 beats). Each element in the list gets an equal time slice: `[0 2 4]` gives each note ⅓ of a cycle.

Sublists subdivide their parent slot:

```flux
note lead [0 1 [2 3] 4]
// 0, 1, 4 get 1/4 cycle each
// 2, 3 each get 1/8 cycle (half of the 1/4 slot)
```

### Finite playback: `'n`

```flux
note lead [0 2 4]'n       // play once (= 'n(1))
note lead [0 2 4]'n(4)    // play 4 cycles then stop
```

### Phase offset: `'at`

```flux
note lead [0 2 4]'at(1/4)     // start 1/4 cycle into the bar
note lead [0 2 4]'at(1/2)     // loop, phase-shifted half a bar
note lead [0 2 4]'n'at(1/4)   // play once, starting 1/4 in
```

`'at` is cycle-relative. Use `'offset` for millisecond nudges on individual events.

### Timing nudge: `'offset`

```flux
note lead [0 1 2]'offset(20)    // all events 20 ms late (humanise)
note lead [0 1 2]'offset(-10)   // all events 10 ms early
```

### Legato: `'legato`

Controls how long each note gate stays open, as a fraction of the event slot.

```flux
note lead [0 2 4]'legato(0.8)               // default
note lead [0 2 4]'legato(1.5)               // overlapping (pad-style)
note lead [0 2 4]'legato(0.5rand1.2)        // stochastic legato
```

Values > 1.0 create overlap, useful for pads and drones.

---

## SynthDef selection

All content types accept an optional `\symbol` argument to select the SynthDef:

```flux
note(\moog) lead [0 1 2 3]
sample(\oneshot) drums [\kick \hat]
```

---

## FX insert

Pipe `|` attaches insert FX to any pattern:

```flux
note lead [0 2 4] | fx(\lpf)'cutoff(800)
note lead [0 2 4] | fx(\delay)'time(3/8)'feedback(0.4)
note lead [0 2 4] | fx(\lpf)'cutoff(800) 50%   // 50% wet
```

See [SynthDefs](synthdefs) for more on FX.

---

## Derived patterns

A pattern can inherit from another with `child:parent` syntax:

```flux
sample drums [\kick \hat \snare]
sample perc:drums 'at(1/8) | fx(\hpf)
```

`perc` inherits `drums`'s pattern and params, overriding only what is explicitly written.
