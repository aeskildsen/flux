# Flux DSL

_This is the authoritative design document. For a compact, implementer-ready semantics reference structured for TDD, see [DSL-truthtables.md](DSL-truthtables.md). The two documents must remain consistent — any behavioural change requires updates to both._

## Comments

Line comments begin with `//` and run to end of line. Block comments are delimited by `/*` and `*/` and may span multiple lines. Both are invisible to the parser.

```flux
// this is a line comment
note lead [0 2 4]  // inline comment

/*
  This is a
  multi-line comment
*/
note lead [0 1 2 3]
```

## Generators

Generators are objects that yield a stream of values for use in synth instantiation or set messages. Literal numbers are generators that always yield the same value. Everything in `[...]` brackets is also a generator — not a data structure, but a stateful object that yields its elements on each call.

Unlike SuperCollider patterns/streams, all generators yield indefinitely. They are never exhausted — it's the caller's responsibility to stop polling when a phrase needs to end.

`[]` is the only non-scalar generator. All other generator forms — numeric literals, `rand`, `gau`, `step`, `mul`, `lin`, `geo`, etc. — are **scalar**: they yield a single value per poll and make no claim about time. `[]` does both: it yields values _and_ assigns each a temporal position within the cycle. This is why nesting `[]` inside `[]` subdivides time (the inner list fills its parent slot with multiple timed events) rather than violating the generator contract — the inner list's temporal extent is simply scaled to fit the outer slot.

This scalar/non-scalar distinction is load-bearing elsewhere in the spec: the right-hand side of transposition and the `'stut` count argument both require a scalar generator and reject `[...]` outright.

`{}` curly brackets are used exclusively by the `utf8{}` generator (see below). Outside of that context, a bare `{` or `}` is a lex error.

### Whitespace rules

> _See truth tables [12 (Whitespace)](DSL-truthtables.md#12-whitespace-truth-table)._

Whitespace (spaces or newlines) is required between distinct top-level tokens — for example, between `note` and `[`. Inside generator expressions, however, tokens are written **adjacently with no whitespace**: `0rand4`, not `0 rand 4`. The same applies to all generator keywords (`gau`, `exp`, `bro`, `step`, `mul`, `lin`, `geo`) and their separators (`m`, `x`). Whitespace inside a generator expression is a syntax error.

Inside `[...]` sequence generators, elements are separated by spaces. Commas are not valid separators.

### Sequence generators

> _See truth table [4 (Weighted random / `'pick`)](DSL-truthtables.md#4-weighted-random-pick-truth-table)._

`[...]` is the fundamental generator type. By default it yields its elements in order, cycling back to the start. Modifiers change the traversal strategy:

```flux
[1 2 3]            // yields 1, 2, 3, 1, 2, 3, ... — like Pseq([1, 2, 3])
[1 2 3]'shuf       // shuffle then traverse, like Pshuf
[1 2 3]'pick       // uniform random element each time, like Prand
[1 2?2 3]'pick     // weighted random — like Pwrand with weights 1/2/1
```

`'pick` supports optional per-element weights via the `?` operator. Unweighted elements default to weight 1; when no weights are present, `'pick` is uniform random. When any weights are present, selection is proportional to the weights (normalised to sum to 1).

- `?n` — `n` must be a non-negative numeric literal (integer or float). `?0` means the element is never picked.
- If every element has weight 0, the slot is silent (rest event), the same as `_`.
- Negative weights (e.g. `?-1`) are a parse error.
- Generator expressions are not valid as weights — `?` must be followed by a numeric literal.
- The `?` weight syntax is only meaningful on a list whose own modifiers include `'pick`. Using `?` on a list without `'pick` is not an error, but the weight is ignored and a warning is logged. This rule applies per list level: `[[1 2?3]'pick 5]` is fine, but `[[1 2?3] 5]'pick` ignores the inner `?3` because the inner list has no `'pick`.

### Rests

`_` marks an event slot as silence. It occupies the same time as any other element but no synth is spawned. The evaluator emits a `ScheduledEvent` with `type: 'rest'` so the scheduler knows the slot was intentionally silent (useful for `'mono` legato handling and visualisation).

```flux
note lead [0 2 _ 4]    // rest on the 3rd slot — 4 elements, each gets 1/4 cycle
note lead [_ 2 4]      // rest on the 1st slot
[0 _ 2]'stut           // rest is repeated alongside notes (inside a list, not a top-level statement)
```

`_` cannot carry accidentals, `?` weights, or generator suffixes — it is purely syntactic and carries no pitch information.

### Random number generators

> _See truth table [5 (Generator polling / nesting)](DSL-truthtables.md#5-generator-polling--nesting-truth-table)._

```flux
0rand4   // Pwhite(min = 0, max = 4) => 4, 1, 0, 4, 3, 0, 2, 1  (canonical form)
0.rand4  // Pwhite(min = 0.0, max = 4) => 3.123891023, 0.23123424, 2.023909
0~4      // Shorthand for rand — syntactic sugar

// When either bound is a float, rand produces a continuous float in [min, max).
// The float passes through the generator unchanged; rounding happens downstream.
// In degree context (inside []) degreeToMidi rounds to nearest integer before
// scale lookup — microtonal degrees are not supported. Float bounds are most
// meaningful in non-degree contexts, e.g. 'legato(0.5rand1.2).

0gau4    // Pgauss(mean = 0, sdev = 4)

1exp7    // Pexprand(min = 1, max = 7)

0bro10m2 // Pbrown(min = 0, max = 10, max_step = 2), aka. Perlin noise
```

### Deterministic generators

```flux
// Linear series like Pseries(start = 0, step = 2, length = 4)
0step2x4

// Geometric series like Pgeom(start = 1, multiplier = 2, length = 4)
5mul2x4

// Linear interpolation Pseq(Array.interpolation(first = 2, last = 7, length = 8))
2lin7x8

// Geometric/exponential interpolation (no counterpart in SC)
2geo7x8
```

### UTF-8 byte generator

> _See truth table [21 (utf8 generator)](DSL-truthtables.md#21-utf8-generator-truth-table)._

`utf8{word}` converts the characters of a bare identifier to their UTF-8 byte values and yields them in sequence, cycling indefinitely.

```flux
// "coffee" → [99 111 102 102 101 101] → % 14 → [1 7 4 4 3 3]
note lead utf8{coffee} % 14

// nested inside a sequence list
note lead [utf8{hello} % 7 0 2]'shuf
```

**Syntax:**

```ebnf
utf8Generator   = "utf8" "{" identifier "}" ;

(* utf8Generator is a new alternative in atomicGenerator *)
atomicGenerator = sequenceGenerator
                | utf8Generator
                | numericGenerator ;
```

- `utf8` must be immediately followed by `{` with no whitespace.
- The content inside `{}` is a single bare identifier (letters, digits, underscores — same as any Flux identifier).
- The identifier is treated as a **literal string** — its characters are encoded as UTF-8 bytes. It is not looked up as a variable name or generator alias.
- The generator cycles: after the last byte, it restarts from the first.
- `utf8{word}` is a **scalar generator** — it yields a single integer per poll. It is valid wherever a scalar generator is valid: directly as the sole generator in a pattern, or nested inside `[...]`.
- Combined with `%` (modulo), it maps byte values into a useful scale-degree range, e.g. `utf8{coffee} % 14`.

**Whitespace rule:** `utf8` must be written adjacent to `{` — `utf8 {coffee}` is a lex error: with the space, `utf8` tokenises as a plain identifier and the bare `{` is unrecognised by the lexer.

### Generator nesting

Generators can be sequenced like any literals.

```flux
[0 1exp7 4gau2] // Pseq([0, Pexprand(1, 7), Pgauss(4, 2)])
```

Nesting generators as input to other generators is achieved with parentheses, which disambiguates chained expressions such as `0rand2rand4`:

```flux
(0rand2)rand4   // Pwhite(Pwhite(0, 2), 4)
```

How often nested generators are polled is determined by `'lock` vs. `'eager`. Stateful generators (`step`, `mul`, `lin`, `geo`) maintain their state and loop after the sequence ends.

### Generator filters

A number of generators work by filtering events that come from upstream generators.

- `'stut` — repeat each element n times
- `'maybe` — pass each element through with a given probability, otherwise skip it

#### Stuttering (`'stut`)

> _See truth table [3 (Stutter)](DSL-truthtables.md#3-stutter-stut-truth-table)._

The `'stut(n)` modifier repeats every element n times. Default: n = 2. The bare form `'stut` is valid and equivalent to `'stut(2)`.

```flux
note lead [0'stut]                              // 0 yielded 2 times

// play each generated value two times instead of one
note lead [0rand7 4rand6]'stut

// repeat each generated value 4 times
note lead [0rand7 4rand6]'stut(4)

// repeat each value 2-4 times, count drawn once per cycle (default eager(1))
note lead [0rand7 4rand6]'stut(2rand4)

// count redrawn every 4 cycles
note lead [0rand7 4rand6]'stut(2rand4'eager(4))
```

How `'eager` and `'lock` apply to `'stut`:

- Default (`'eager(1)`): stutter count is drawn once per cycle — `note lead [0rand7 4rand6]'stut(2rand4)`.
- `'stut(2rand4'eager(4))`: count is redrawn every 4 cycles.
- `'stut(2rand4'lock)`: stutter count is chosen once and frozen forever.

The stutter count must be a positive integer ≥ 1. A count of 0 or a negative value is a semantic error. The count argument must be a scalar generator — a list generator is a semantic error.

#### Probability (`'maybe`)

The `'maybe(p)` modifier passes each element through with probability `p` (0.0–1.0) and skips it otherwise. Default: p = 0.5. The bare form `'maybe` is valid and equivalent to `'maybe(0.5)`.

---

## Content types

The primary keyword specifies the _content type_ — what kind of events are generated. All content types loop indefinitely by default. The `'n` modifier opts into finite playback.

| Keyword  | Description                                                                                                                                            |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `note`   | Polyphonic pitched events. New synth instance per event.                                                                                               |
| `mono`   | Monophonic pitched events. Single persistent synth node; events send `set` messages instead of spawning new instances. Rough equivalent of SC's Pmono. |
| `sample` | Buffer playback. Event list contains `\symbol` buffer refs; each event picks a buffer by name.                                                         |
| `slice`  | Beat-sliced buffer playback. Event list contains integer slice indices into a fixed buffer.                                                            |
| `cloud`  | Granular synthesis. Persistent granular synth node, modulated via `.set` messages. No event list — use `[]`.                                           |

A name is required between the content type keyword and the generator expression (see "Generator naming" below). A space is required between the name and `[`.

```flux
note lead [0 1 2 3]       // polyphonic pitched events, loops indefinitely
mono bass [0 1 2 3]       // monophonic pitched events, loops indefinitely
```

### Timing

The duration of one cycle is always one `cycle`, as in TidalCycles. Each element is triggered with a temporal interval of exactly 1/n cycles, distributing elements evenly in time.

```flux
// n = 4, each element gets 1/4 cycle
note lead [0 1 2 3]

// n = 6, each element gets 1/6 cycle
note lead [0 1 2 3 4 5]

// elements in sublists get slices of the parent's time slot
// 0, 1 and 4 get 1/4 cycle; 2 and 3 each get 1/8 cycle (i.e. (1/4)/2)
note lead [0 1 [2 3] 4]
```

The `'offset` modifier schedules all events a number of milliseconds early (negative value) or late (positive value) relative to their normal trigger time. Equivalent to the `\lag` key in SC. Applies to all content types. See truth table [14 (`'offset`)](DSL-truthtables.md#14-offset-truth-table).

```flux
note lead [0 1 2]'offset(20)    // all events 20 ms late
note lead [0 1 2]'offset(-10)   // all events 10 ms early
```

### Durations (`'legato`)

> _See truth table [13 (`'legato`)](DSL-truthtables.md#13-legato-truth-table)._

`note` spawns new self-releasing synth instances per event (not persistent nodes). Gate is closed via a scheduled `set` message after each event's time slot, scaled by a legato factor. This conforms to standard SC synthdef conventions (gate input + ADSR).

The default legato for `note` is **0.8**, matching SuperCollider's `Pbind` convention. Overridable per-pattern via `'legato(n)`.

Legato is a modifier, patternisable like any other stochastic argument:

```flux
note lead [0 2 4 7]'legato(0.8)                  // fixed legato (same as default)
note lead [0 2 4 7]'legato(0.5rand1.2)            // stochastic legato, eager(1) by default
note lead [0 2 4 7]'legato(0.5rand1.2'eager(4))  // new legato value every 4 cycles
```

Legato values > 1.0 produce overlap (useful for pads/drones).

`'legato` has no effect on `mono` — `mono` uses a persistent node and legato as note-overlap control is undefined there.

The scheduler must therefore track two times per event: note-on time and gate-close time.

### `mono` lifecycle

`mono` maintains a single persistent synth node per named generator:

- **First evaluation:** a new synth node is spawned.
- **Subsequent evaluations (same name, new cycle):** `.set` messages are sent to the existing node — no re-spawn.
- **Stop or removal:** the runtime closes the gate automatically. Release duration is governed entirely by the SynthDef envelope; there is no DSL `'release` modifier.
- **`'stut(n)` on `mono`:** sends n repeated `.set` messages to the persistent node within the event slot. Audibility is SynthDef-dependent.
- **`'legato` has no effect on `mono`** — legato as note-overlap control is undefined for persistent nodes.

```flux
mono bass [0 1 2 3]       // single persistent node, pitch updated each event
mono bass [0 1 2 3]'stut  // each pitch change sent twice
```

### Buffer-backed content types

`sample`, `slice`, and `cloud` operate on audio buffers loaded into the engine at boot.

| Content type | List contents                                             | Default SynthDef | Default buffer          |
| ------------ | --------------------------------------------------------- | ---------------- | ----------------------- |
| `sample`     | `\symbol` buffer refs — each event picks a buffer by name | `samplePlayer`   | bundled one-shot kit    |
| `slice`      | integer slice indices into a fixed buffer                 | `slicePlayer`    | bundled amen-style loop |
| `cloud`      | no list — use `[]`                                        | `grainCloud`     | bundled voice recording |

**SynthDef override:** `sample(\name)`, `slice(\name)`, `cloud(\name)` follow the same convention as `note(\name)`: the argument replaces the default SynthDef entirely.

**Channel-count-based SynthDef variant selection:** At event dispatch time, the channel count of the active buffer is looked up from the buffer registry. The SynthDef name is resolved to `samplePlayer_mono` or `samplePlayer_stereo` (and similarly for `slicePlayer`). If no variant exists for the detected channel count, the event is skipped with a logged error. `grainCloud` SynthDefs only exist as `_mono` variants — if a stereo buffer is selected, a warning is logged and the mono variant is used.

**`@buf` decorator:** `@buf(\name)` specifies which buffer a `slice` or `cloud` pattern operates on. Accepts generator expressions for per-cycle buffer selection:

```flux
@buf(\myloop) slice drums [0 2 4 8]'numSlices(16)
@buf([\loopA \loopB]'pick) slice drums [0 4 8 12]
```

`@buf` on `sample` is a semantic error — buffer selection in `sample` is per-event inside the list.

**`'numSlices(n)`** is a pattern-level modifier on `slice` that tells the SynthDef how many slices the buffer has been divided into:

```flux
slice drums [0 2 4 8]'numSlices(16)   // 16-slice grid
```

**`cloud` persistent node:** `cloud` works like `mono` — it spawns a single persistent granular synth node and sends `.set` messages each cycle. The event list is empty (`[]`). Parameters are controlled via `"param` notation:

```flux
@buf(\recording) cloud grain []"density(8)"pos(0.5rand0.8)
```

### Determination of length

Structural length is frozen at the cycle boundary. All generators inside the list are evaluated for length once when the cycle begins; the resulting event array is pre-calculated and handed off to the scheduler.

### Finite playback: `'n`

> _See truth table [7 (Content type timing)](DSL-truthtables.md#7-content-type-timing-truth-table)._

By default all content types loop indefinitely. The `'n` modifier opts into finite playback:

```flux
note lead [0 2 4]          // loop indefinitely (default)
note lead [0 2 4]'n        // play once (equivalent to 'n(1))
note lead [0 2 4]'n(1)     // play once
note lead [0 2 4]'n(4)     // play 4 times
```

The count must be a positive integer ≥ 1. Zero, negative, or non-integer counts are semantic errors.

### Start time: `'at`

> _See truth table [7 (Content type timing)](DSL-truthtables.md#7-content-type-timing-truth-table)._

`'at` applies to all content types and specifies the phase offset at which the pattern begins within the cycle. Useful for establishing phase relationships between patterns, and for scheduling finite runs at a specific point in time.

```flux
note lead [0 2 4]'at(0)    // default: begins on the start of the next cycle
note lead [0 2 4]'at(1)    // begin 1 cycle after the beginning of the next cycle
note lead [0 2 4]'at(3/4)  // begin 3/4 cycle after the beginning of the next cycle
note lead [0 2 4]'at(-1/8) // begin 1/8 cycle before the beginning of next cycle
note lead [0 2 4]'at(1/2)  // loop, phase-shifted half a cycle
note lead [0 2 4]'n'at(1/4) // play once, starting 1/4 cycle in
```

If a pattern would be scheduled to start in the past, its start is postponed to the next cycle.

**`'at` vs `'offset` distinction:**

- `'at(n)` — where in the cycle the pattern begins (cycle-relative, fractional cycles; affects the whole pattern).
- `'offset(n)` — millisecond nudge per event for timing feel (sub-rhythmic; affects individual event placement within the grid).

### Custom event timing

The `@` operator schedules an element at an absolute position within the cycle (0 = cycle start, 1 = one full cycle). Positions are fractions, written the same way as everywhere else in the DSL:

```flux
note lead [0@0 4@1/4 7@5/8]   // 0 at 0, 4 at 1/4 cycle, 7 at 5/8 cycle
```

`@` is optional on individual elements. A bare degree keeps its natural uniform-spacing slot; only elements with `@` have their position overridden:

```flux
note lead [0 4 7@1/2]   // 0 at 0, 4 at 1/3 (natural slot), 7 at 1/2 (override)
note lead [0 2@1]       // 0 at 0 (natural), 2 at 1 (one full cycle in)
```

---

## Musical pitch

In `note [0 1 2]`, 0, 1, and 2 are interpreted as scale degrees which specify musical pitch.

To arrive at the final oscillator frequency, the degree passes through this chain:

`degree → scale → root → octave → cent → frequency`

The variables in this chain can be overridden with the `set` command or `@` decorators.

- `scale`: Preset. Default: "major".
- `root`: Distance from C, measured in semitones. Default: 0 (C).
- `octave`: Octave on a piano. Default: 5.
- `cent`: Pitch deviation from ideal frequency, measured in cents (100 per semitone step). Default: 0.
- Degrees are relative to root (0 is the root, 1 is the 2nd degree, etc.). No default — must be specified.

Chromatic transposition (`ctranspose`) is not supported — it mixes degree-space and semitone-space incoherently. If genuinely needed, `'st(n)` is reserved as an escape-hatch modifier but is not implemented in the initial version.

### `@key` — compound pitch context decorator

The common case of setting root, scale, and octave together uses `@key`:

```flux
@key(g# lydian)     // root + scale; octave defaults to 5
@key(g# lydian 4)   // explicit octave
```

`set key(...)` is also valid and equivalent to `@key` at global scope:

```flux
set key(g# lydian)
```

The `@cent` decorator remains available for fine-tuning but is not part of the common vocabulary.

### Generator arithmetic operators

> _See truth table [10 (Generator arithmetic)](DSL-truthtables.md#10-generator-arithmetic-truth-table)._

Arithmetic operators apply element-wise to the degree values produced by the left-hand generator. The left-hand side is always the pattern's generator expression; the right-hand side is a scalar generator or a list generator.

Supported operators:

| Operator | Meaning        | Example                       |
| -------- | -------------- | ----------------------------- |
| `+`      | Addition       | `note lead [0 2 4] + 2`       |
| `-`      | Subtraction    | `note lead [0 2 4] - 1`       |
| `*`      | Multiplication | `note lead [0 2 4] * 2`       |
| `/`      | Division       | `note lead [0 2 4] / 2`       |
| `**`     | Exponentiation | `note lead [0 2 4] ** 2`      |
| `%`      | Modulo         | `note lead utf8{coffee} % 14` |

```flux
note lead [0 2 4] + 2        // shift all degrees up 2 scale steps
note lead [0 2 4] - 1        // shift down 1 scale step
note lead [0 2 4] + 0rand3   // stochastic transposition, eager(1) by default
note lead [0 1 2] * 2        // double each degree: 0, 2, 4
note lead utf8{coffee} % 14  // map byte values into scale-degree range
```

**Scalar right-hand side** — the value is applied uniformly to every element each cycle (existing `+`/`-` behaviour is preserved):

```flux
note lead [0 2 4] + 3        // every element gets +3 scale steps
```

**Generator right-hand side** — a list generator (`[...]`) or scalar generator may appear on the right. When a list generator is used, its values wrap around for position i: `rhs_value = rhs[i % rhs_length]`. Both operands reset their state at cycle boundaries.

```flux
// [0 1 2] + [4 8] → pos 0: 0+4=4, pos 1: 1+8=9, pos 2: 2+4=6
note lead [0 1 2] + [4 8]    // → 4, 9, 6, 4, 9, 6 per cycle

// scalar RHS — existing behaviour, applied uniformly
note lead [0 1 2] + 3        // → 3, 4, 5
```

**Division by zero** — when the right-hand side evaluates to zero for a given element slot, a warning is emitted and the event for that slot is skipped (best-effort for live coding):

```flux
[1 2 3] / [4 0]   // 1/4 fires; 2/0 is skipped with a warning; 3/4 fires (pos 2 wraps to rhs[0]=4)
```

**Modulo zero** — `a % 0` is defined as the identity `a` (not an error or skip):

```flux
[1 2 3] % [4 0]   // 1%4=1, 2%0=2, 3%4=3
```

**Double-negative** — `note [0] - -4` is a parse error; use `note [0] + 4` instead. This restriction applies only to `+` and `-` because the leading `-` on the RHS is syntactically ambiguous with a negative number literal; for `*`, `/`, `**`, and `%` the RHS must always be a positive scalar or a list generator.

### Accidentals

> _See truth table [15 (Accidentals)](DSL-truthtables.md#15-accidentals-truth-table)._

Accidentals modify a scale degree by one semitone. They are written as a suffix directly on the degree integer, with no space:

```flux
2b  // third, flat
4#  // fifth, sharp
3bb // third, double flat
4## // fifth, double sharp
```

Accidentals are interpreted as literals at parse time — `2b` is a single token with value degree=2, accidental=flat. They are valid wherever a degree literal appears (inside `[...]` lists or as transposition operands).

---

## Session state: `set` and `@`

### Global session state: `set`

`set` is a top-level statement for setting ambient session parameters that apply globally unless overridden. This avoids modifier sprawl and prevents the DSL from reinventing Pbind-style key-value pairs piecemeal.

```flux
set scale(minor)
set root(7)
set tempo(120)
set key(g# lydian)
```

Parameters: `scale`, `root`, `octave`, `tempo`, `cent`, `key`.

### Scoped context: `@` decorators

> _See truth tables [8 (Decorator scoping)](DSL-truthtables.md#8-decorator-scoping-truth-table) and [11 (Indentation)](DSL-truthtables.md#11-indentation-truth-table)._

`@` decorators apply session parameters to a scoped block of expressions, overriding global `set` values within that scope. They use a parenthesised argument list — the same syntax supports single arguments (`@root(7)`), compound arguments (`@key(g# lydian 4)`), and stochastic arguments (`@root(3rand7)`).

```flux
@scale(minor) @root(7)
  note lead [0 1 2]
  @octave(4)
    note lead [0 2 4 5]
```

Here `note lead [0 1 2]` inherits `@scale(minor)` and `@root(7)`. `note lead [0 2 4 5]` inherits all three, with `@octave(4)` added at the nested level.

For single-expression use, decorators may appear inline on the same line:

```flux
@scale(minor) note lead [0 1 2]
```

**`set` is `@` at global scope.** `set scale(minor)` is sugar for a top-level `@scale(minor)` with no indented body. They are the same mechanism at different scopes — `set` establishes session-wide defaults, `@` overrides them for a block.

**Indentation:** block scope uses fixed indentation (2 spaces). Variable indentation is not supported — indentation level is determined by the number of leading 2-space units. This keeps the parser simple and the code visually consistent.

**Stochastic decorator arguments** follow the same `'lock`/`'eager(n)` semantics as everything else. `@root(3rand7)` with `'eager(4)` redraws every 4 cycles; with `'lock` the value is drawn once when the block is first entered and frozen thereafter. `'lock` is the sensible default for decorators — a randomly wandering root is an opt-in, not the default.

### `@buf` — buffer selection for `slice` and `cloud`

`@buf(\name)` is a pattern-level decorator that specifies which buffer a `slice` or `cloud` pattern operates on. It is written inline before the content type keyword:

```flux
@buf(\myloop) slice drums [0 2 4 8]
@buf(\recording) cloud grain []
```

`@buf` accepts a `\symbol` argument or a generator expression that produces `\symbol` values:

```flux
@buf([\loopA \loopB]'pick) slice drums [0 4 8 12]  // per-cycle buffer selection
```

`@buf` on `sample` is a semantic error — buffer selection in `sample` is per-event inside the list.

---

## Name conventions

Flux uses two conventions for naming things, depending on whether the name refers to a runtime artefact or built-in language vocabulary.

### `\symbol` — runtime artefacts

SynthDef names, FX names, and buffer names are written as **symbols**: a backslash immediately followed by an identifier, with no space.

```flux
\moog     // SynthDef name
\lpf      // FX name
\kit      // buffer name
```

This is borrowed from SuperCollider. The backslash+identifier is a single token; whitespace between `\` and the name is not permitted. String literals (`"moog"`) are not valid in Flux — use symbols instead.

`\symbol` means "look this up in a runtime registry" — the set of valid names is open and user-extensible.

### Bare identifiers — built-in vocabulary

Scale names, key names, and root names are written as **bare identifiers** — no backslash.

```flux
set scale(minor)       // scale name — bare identifier
set key(g# lydian)     // key name — bare identifier
@scale(dorian) note lead [0 2 4]
```

Bare identifiers in these positions mean "this is a fixed, language-defined name" — the set of valid values is closed and defined by the language.

---

## SynthDef selection

All content type keywords take exactly one optional `\symbol` argument to choose a SynthDef. The `\symbol` notation is required (not a bare identifier) to avoid name collisions with named generators.

```flux
note(\moog) lead [0 1 2 3]'lfoRate(1/4)
sample(\oneshot) drums [bd sn bd sn]
```

---

## Generator naming

Generators are named by placing an identifier between the content type keyword (and optional SynthDef argument) and the generator expression. A name is **mandatory** — unnamed generator expressions are a parse error.

```flux
note lead [0 2 4]
sample drums [\kick \hat \snare]
mono bass [0 -2 0 -3]
note(\moog) lead [0 1 2 3]'lfoRate(1/4)
```

### Assignment semantics

Generator naming is **assignment, not declaration**. Re-evaluating with the same name replaces the previous binding. The runtime diffs old and new state and updates in place where possible (e.g. `set` messages for `mono` content). Running synths are updated rather than killed and restarted — this preserves FX tails and avoids audible cuts. New synths are started for changed generator content where in-place update is not possible.

**Duplicate names within a single evaluation are a static error**, detected before any audio changes are made:

```flux
// ERROR — two generators named "lead" in one evaluation
note lead [0 2 4]
note lead [0 4 7]
```

### Derived generators

A named generator can be the parent of derived voices, using `child:parent` syntax:

```flux
sample drums [\kick \hat \snare]
sample perc:drums 'at(1/8) | fx(\hpf)
```

`perc` inherits `drums`'s pattern and params, overriding only what's explicitly specified. The parent name is resolved at evaluation time. If `drums` is edited, `perc` re-derives.

Derivation is always named — anonymous derived generators are not supported.

**Removing a parent while derived generators still reference it is a static error**, detected before any audio changes are made. The user must remove or re-parent derived generators first:

```flux
// ERROR — "perc" references "drums" which is not present
sample perc:drums 'at(1/8)
```

### FX ownership

Named generators own their insert FX chains. Removing or redefining a named generator triggers drain-and-free: the FX synth runs until silence or a configurable timeout before being freed.

---

## FX

> _See truth table [9 (FX pipe)](DSL-truthtables.md#9-fx-pipe-truth-table)._

Flux uses a two-tier FX model:

- **Master bus FX** — configured via the UI, not the DSL. All audio routes through a default chain (EQ → Reverb → Compressor → Limiter). The DSL cannot reference or modify master bus FX.
- **Insert FX** — DSL-instantiated, scoped to a source pattern via `|`. Created when the source starts, released after a silence tail when the source stops.

There are no send FX.

### Master bus FX (UI-configured)

A default master bus chain is set up at boot:

1. EQ
2. Reverb
3. Compressor
4. Limiter

The UI allows adjusting parameters, reordering, adding, and removing FX from the chain. The DSL has no syntax for master bus FX — it is a UI-only concern.

### Insert FX

Insert FX are anonymous, scoped to a source pattern via the `|` pipe operator. Created when the source starts, released after a silence tail when the source stops.

```flux
note lead [0 2 4 7] | fx(\lpf)'cutoff(800)
note lead [0 2 4 7] | fx(\lpf)'cutoff([800 1200 2000 400]'eager)
note lead [0 2 4 7] | fx(\delay)'time(3/8)'feedback(0.4)
```

The pipe operator implicitly passes the source as the audio input to the FX node — no explicit routing required.

FX parameters use the same `'key(value)` modifier syntax as everything else. Values can be literals, generators, or stochastic expressions. FX nodes are plain scsynth nodes and receive `.set` messages like any other synth.

**Wet/dry level** is an optional integer percentage written after all parameter modifiers. Default is 100% wet.

```flux
note lead [0 2 4 7] | fx(\ringmod) 70%      // 70% wet, 30% dry
note lead [0 2 4 7] | fx(\lpf)'cutoff(800) 50%
```

**Silence tail** duration defaults to 5 seconds (post-envelope — the FX node runs until silence after its source has stopped). Override with `'tail`:

```flux
note lead [0 2 4 7] | fx(\lpf)'cutoff(1200)'tail(10)  // 10s tail
note lead [0 2 4 7] | fx(\lpf)'cutoff(1200)'tail(0)   // free immediately when source stops
```

`'tail` value is in seconds and must be a non-negative number.

---

## Three syntactic roles

Three prefix characters serve distinct, non-overlapping roles in the DSL. Understanding the boundary between them is essential for reading and writing Flux code.

| Sigil | Role      | What it does                                                                                                                                                                                                                                                                   |
| ----- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@`   | Decorator | Language-side pitch calculation. Sets parameters in the degree-to-frequency chain (`root`, `scale`, `octave`, `cent`). Always translates musical intent — never a raw synth argument passthrough.                                                                              |
| `'`   | Modifier  | Transforms the event stream or controls generator behaviour. Agnostic about content: `'stut`, `'legato`, `'lock`, `'eager`, etc. Never touches raw synth arguments directly.                                                                                                   |
| `"`   | Param     | Direct synth argument access. Bypasses language abstractions and sends a value straight to a named SynthDef parameter. Intentionally unglamorous — heavy reliance on `"param` is a signal to reconsider the SynthDef design or elevate the parameter to a first-class concept. |

The three mechanisms are mutually exclusive in what they can express:

- `@root(7)` is a decorator — it participates in pitch calculation.
- `'legato(0.8)` is a modifier — it shapes the event stream.
- `"amp(0.5)` is a param — it passes `0.5` directly to the `amp` argument of the current SynthDef.

No sigil can substitute for another. Using `'amp(0.5)` to set amplitude is not valid — `amp` is a SynthDef argument, not a stream modifier.

---

## Modifier syntax

> _See truth tables [1 (Modifier attachment)](DSL-truthtables.md#1-modifier-attachment-truth-table) and [2 (Modifier precedence)](DSL-truthtables.md#2-modifier-precedence-truth-table)._

The sign `'` in an expression like `x'y` indicates a **modifier**, i.e. that `y` modifies the behaviour of `x`. Modifiers are strictly for stream and generator operations — they do not provide direct access to SynthDef arguments. Use `"param` notation for that (see below).

Modifiers are methods that return `this`, so chaining is supported:

```flux
note lead [0rand7 4rand6]'eager'stut(2)
```

Modifiers attach to the **immediately preceding token**, not to the whole expression. This is the core rule governing modifier placement throughout the language.

```flux
[0rand7 4rand6]'stut(2)'lock   // 'lock attaches to the generator, not to the content type keyword
```

Modifiers are generally written **after** the list they modify. Evaluation order is left-to-right.

**Valid attachment points.** A modifier (`'name`) or a `"param` must attach directly to a **generator expression**. The valid targets are:

| Target                        | Example                    | Notes                                                                               |
| ----------------------------- | -------------------------- | ----------------------------------------------------------------------------------- |
| List generator                | `[0 2 4]'stut(2)`          | Attaches to the whole list.                                                         |
| Scalar generator              | `0rand7'lock`              | Attaches to a single stochastic or literal generator.                               |
| Parenthesised expression      | `(0rand4)'lock`            | The group is treated as one generator token.                                        |
| Whole content-type expression | `note [0 2 4]'legato(0.8)` | Attaches to the content-type expression as a whole — see below.                     |
| Another modifier (chaining)   | `[0 2 4]'stut(2)'lock`     | Chained modifiers return `this`, so the next modifier attaches to the previous one. |

Placement **after a non-generator token is a syntax error**. In particular, a modifier or `"param` cannot attach to a bare content-type keyword, decorator, operator, or separator:

| Code                 | Failure                                                                 |
| -------------------- | ----------------------------------------------------------------------- |
| `note'legato(0.8)`   | Syntax error — `note` alone is a content-type keyword, not a generator. |
| `note"amp(0.5)`      | Syntax error — `"param` requires a preceding generator expression.      |
| `'stut(2)`           | Syntax error — no preceding token to attach to (see truth table 1).     |
| `note [0] +'stut(2)` | Syntax error — the transposition operator is not a generator.           |

To apply a modifier to the whole content-type expression (including a transposition operand), use a **modifier continuation line** — see below.

> **Implementation note:** No whitespace is permitted between `'` and the modifier name (`[0]'lock`, not `[0]' lock`). The current JS parser has a known deviation — it accepts a space because the lexer tokenises `'` and the identifier separately and Chevrotain ignores inter-token whitespace. Enforcing this would require a compound lexer token or a contextual lexer mode. Until fixed, the parser should emit a parse error for `[0]' lock` rather than silently accepting it. See truth table 12.

### `'lock` and `'eager(n)`

`'eager(1)` is the default for all generators. The argument is a positive integer cycle period:

- `'eager(1)` — draw once per cycle (default; bare `'eager` is shorthand for this)
- `'eager(n)` — redraw every n cycles (n must be a positive integer ≥ 1)
- `'lock` — draw once at first evaluation, freeze forever

`'eager(0)` and negative arguments are semantic errors — the cycle-boundary evaluation model requires n ≥ 1.

Each generator is an independent stateful object. `'eager(n)` on a list propagates down as the default to each element; each element applies the annotation to its own generator independently. There is no implicit value-sharing between elements.

```flux
// draw new values on every cycle (explicit, same as default)
note lead [0rand7 4]'eager(1)
// redraw every 4 cycles
note lead [0 4rand6]'eager(4)
// frozen after first evaluation — each element locks at its own first-drawn value
note lead [0rand7 4rand6]'lock
```

`'lock` and `'eager` can be used at whatever level of granularity is needed (list-level, element-level, modifier argument-level).

```flux
note lead [0rand7 4rand6]'lock       // both elements lock at their own first-drawn values
note lead [0rand7'lock 4rand6]       // first element locked, second draws every cycle (inner overrides outer)
```

### Modifier continuation lines

Because modifiers attach to the immediately preceding token, a modifier written directly after a transposition operand would attach only to that operand — not to the whole content-type expression. To attach a modifier to a whole content-type expression (including its transposition operand), write it on an indented continuation line:

```flux
note lead [0 2 4] + 0rand3
  'stut(2)
  'legato(0.8)
```

Each continuation line begins with `'` and attaches to the content-type expression as a whole, in the order written. This is the only way to reach the whole-content-type-expression attachment point described in the table above. The parser distinguishes modifier continuations from decorator block bodies by the leading `'` character on the indented line.

Continuation lines are currently modifier-only; `"param` does not have a continuation form and must be written inline after a generator expression.

### `"param` — direct SynthDef argument access

> _See truth table [18 (`"param`)](DSL-truthtables.md#18-param-truth-table)._

`"param(value)` sends a value directly to a named SynthDef argument, bypassing the language's pitch and stream abstractions. It is valid anywhere a modifier is valid.

The token form is `"` immediately followed by an identifier, with no whitespace — analogous to `\symbol`. The `"identifier` is a single token.

```flux
note [0 2 4]"amp(0.5)            // set amp to 0.5
note [0 2 4]"amp(0.5)"pan(-0.3)  // chained: set amp and pan
note [0 2 4] | fx(\lpf)"cutoff(800)"rq(0.3)  // on FX node
```

The value argument accepts the same expressions as modifiers — literals, generators, stochastic expressions:

```flux
note [0 2 4]"amp(0.3rand0.8)              // stochastic amp, eager(1) by default
note [0 2 4]"amp(0.3rand0.8'eager(4))     // redraw every 4 cycles
note [0 2 4]"amp(0.3rand0.8'lock)         // freeze at first drawn value
```

**SynthDef parameter names** come from the SynthDef's `specs` object in `static/compiled_synthdefs/metadata.json`. Each key is a parameter name (e.g. `amp`, `pan`, `rel`); the value carries `{ default, min, max, unit, curve }`. The active SynthDef is determined by the `\symbol` argument on the content type keyword (`note(\kick)` → look up `kick`). Parameter names are lowercase identifiers.

**Tooling:**

- The completion provider offers parameter names on `"` trigger, prefix-filtered as the user types.
- The hover provider shows `min`, `max`, `default`, and `unit` for a hovered `"param` token.

---

## Evaluation process

Redefinition of a running pattern takes effect at the next cycle boundary. This is the musically correct behaviour — consistent with TidalCycles and with how performers think about metric structure.

### Eager evaluation at cycle boundary

All generators are evaluated eagerly at the cycle boundary — never lazily mid-cycle. This is a fundamental design constraint:

- For looping patterns (default): all generators inside the list are fully evaluated at the start of each cycle. The resulting event array is handed off to the scheduler as a concrete sequence. No generator polling happens during playback.
- For finite patterns (`'n`): all generators are evaluated once when the pattern is first scheduled, producing a fixed event array for the entire duration (including all repetitions).

This guarantee is what makes `'stut` and other count-modifying modifiers tractable: the scheduler receives a complete, fixed-length event array per cycle and can calculate durations, gate times, and subdivisions without needing to consult generators again during playback.

Generators have no access to external runtime state (e.g. MIDI input, sensor values, another pattern's current position) at the moment of playback. Values are committed at cycle start. This is intentional: Flux is a live coding tool, not a DAW. If a value should change, the performer re-evaluates the expression, which takes effect at the next cycle boundary.
