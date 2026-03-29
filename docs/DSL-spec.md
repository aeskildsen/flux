# Flux DSL

## Comments

Line comments begin with `//` and run to end of line. Block comments are delimited by `/*` and `*/` and may span multiple lines. Both are invisible to the parser.

```flux
// this is a line comment
loop [0 2 4]  // inline comment

/*
  This is a
  multi-line comment
*/
loop [0 1 2 3]
```

## Generators

Generators are objects that yield a stream of values for use in synth instantiation or set messages. Literal numbers are generators that always yield the same value. Everything in `[...]` brackets is also a generator — not a data structure, but a stateful object that yields its elements on each call.

Unlike SuperCollider patterns/streams, all generators yield indefinitely. They are never exhausted — it's the caller's responsibility to stop polling when a phrase needs to end.

### Whitespace rules

Whitespace (spaces or newlines) is required between distinct top-level tokens — for example, between `loop` and `[`. Inside generator expressions, however, tokens are written **adjacently with no whitespace**: `0rand4`, not `0 rand 4`. The same applies to all generator keywords (`gau`, `exp`, `bro`, `step`, `mul`, `lin`, `geo`) and their separators (`m`, `x`). Whitespace inside a generator expression is a syntax error.

Inside `[...]` sequence generators, elements are separated by spaces. Commas are not valid separators.

### Sequence generators

`[...]` is the fundamental generator type. By default it yields its elements in order, cycling back to the start. Modifiers change the traversal strategy:

```flux
[1 2 3]         // yields 1, 2, 3, 1, 2, 3, ... — like Pseq([1, 2, 3])
[1 2 3]'shuf    // shuffle then traverse, like Pshuf
[1 2 3]'pick    // pick a random element each time, like Prand
[1 2 3?2]'wran  // pick stochastically, like Pwrand
```

Specifically for `'wran`: weight for each element is 1 by default. The weight can be overridden with the `?` operator. The `?` weight syntax is only meaningful when `'wran` is present — using `?` without `'wran` is a semantic error.

### Rests

`_` marks an event slot as silence. It occupies the same time as any other element but no synth is spawned. The evaluator emits a `ScheduledEvent` with `type: 'rest'` so the scheduler knows the slot was intentionally silent (useful for `'mono` legato handling and visualisation).

```flux
loop [0 2 _ 4]    // rest on the 3rd slot — 4 elements, each gets 1/4 cycle
loop [_ 2 4]      // rest on the 1st slot
[0 _ 2]'stut      // rest is repeated alongside notes
```

`_` cannot carry accidentals, `?` weights, or generator suffixes — it is purely syntactic and carries no pitch information.

### Random number generators

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

The `'stut(n)` modifier repeats every element n times. Default: n = 2. The bare form `'stut` is valid and equivalent to `'stut(2)`.

```flux
loop [0'stut]                              // 0 yielded 2 times

// play each generated value two times instead of one
loop [0rand7 4rand6]'stut

// repeat each generated value 4 times
loop [0rand7 4rand6]'stut(4)

// repeat each value 2-4 times, count drawn once per cycle (default eager(1))
loop [0rand7 4rand6]'stut(2rand4)

// count redrawn every 4 cycles
loop [0rand7 4rand6]'stut(2rand4'eager(4))
```

How `'eager` and `'lock` apply to `'stut`:

- Default (`'eager(1)`): stutter count is drawn once per cycle — `loop [0rand7 4rand6]'stut(2rand4)`.
- `'stut(2rand4'eager(4))`: count is redrawn every 4 cycles.
- `'stut(2rand4'lock)`: stutter count is chosen once and frozen forever.

The stutter count must be a positive integer ≥ 1. A count of 0 or a negative value is a semantic error. The count argument must be a scalar generator — a list generator is a semantic error.

#### Probability (`'maybe`)

The `'maybe(p)` modifier passes each element through with probability `p` (0.0–1.0) and skips it otherwise. Default: p = 0.5. The bare form `'maybe` is valid and equivalent to `'maybe(0.5)`.

---

## Cyclic mode: `loop`

A `loop` consists of a number of elements defined within a set of brackets and delineated by spaces. A space is required between `loop` and `[`.

```flux
loop [0 1 2 3]
```

The elements are repeated indefinitely.

### Timing in loops

The duration of one iteration of the loop is always equal to the duration of one `cycle`, as in TidalCycles. Each element is triggered with a temporal interval of exactly 1/n cycles, distributing elements evenly in time across the cycle.

```flux
// n = 4, each element gets 1/4 cycle
loop [0 1 2 3]

// n = 6, each element gets 1/6 cycle
loop [0 1 2 3 4 5]

// elements in sublists get slices of the parent's time slot
// 0, 1 and 4 get 1/4 cycle; 2 and 3 each get 1/8 cycle (i.e. (1/4)/2)
loop [0 1 [2 3] 4]
```

The `'offset` modifier on a loop or line schedules all events a number of milliseconds early (negative value) or late (positive value) relative to their normal trigger time. Equivalent to the `\lag` key in SC.

```flux
loop [0 1 2]'offset(20)    // all events 20 ms late
loop [0 1 2]'offset(-10)   // all events 10 ms early
```

### Durations

`loop` spawns new self-releasing synth instances per event (not persistent nodes). Gate is closed via a scheduled `set` message after each event's time slot, scaled by a legato factor. This conforms to standard SC synthdef conventions (gate input + ADSR).

Legato is a modifier, patternisable like any other stochastic argument:

```flux
loop [0 2 4 7]'legato(0.8)                  // fixed legato
loop [0 2 4 7]'legato(0.5rand1.2)            // stochastic legato, eager(1) by default
loop [0 2 4 7]'legato(0.5rand1.2'eager(4))  // new legato value every 4 cycles
```

Legato values > 1.0 produce overlap (useful for pads/drones).

The scheduler must therefore track two times per event: note-on time and gate-close time.

### Determination of length

Structural length is frozen at the cycle boundary. All generators inside a `loop` list are evaluated for length once when the cycle begins; the resulting event array is pre-calculated and handed off to the scheduler.

---

## Linear mode: `line`

Linear mode is activated by the keyword `line`. A space is required between `line` and `[`.

By default, `line`:

- Gets scheduled to begin when the next cycle starts.
- Runs once, then stops.
- Uses the same concept of time relative to cycle as loop mode.

```flux
line [0 1 2 3]
```

### Start time

Start time is specified with the `'at` modifier. (Note: This also applies to loops.)

```flux
line [0 1 2 3]'at(0)    // default: begins on the start of the next cycle
line [0 1 2 3]'at(1)    // begin 1 cycle after the beginning of the next cycle
line [0 1 2 3]'at(3/4)  // begin 3/4 cycle after the beginning of the next cycle
line [0 1 2 3]'at(-1/8) // begin 1/8 cycle before the beginning of next cycle
```

If a line would be scheduled to start in the past, its start is postponed to the next cycle.

### Repetitions

Repetitions are specified with the `'repeat` modifier. The bare form `'repeat` is valid and means repeat indefinitely.

```flux
// repeat indefinitely
line [0 1 2 3]'repeat

// play 4 times
line [0 1 2 3]'repeat(4)
```

The repetition count must be a positive integer ≥ 1. Zero, negative, or non-integer counts are semantic errors.

### Determination of length

Like `loop`, structural length for a `line` is frozen at evaluation time — all generators inside the list are evaluated for length once when the line is first scheduled, and the resulting event array is pre-calculated for the entire duration of the line before any events are sent to the scheduler.

### Custom event timing

The `@` operator schedules an element at an absolute position within the cycle (0 = cycle start, 1 = one full cycle). Positions are fractions, written the same way as everywhere else in the DSL:

```flux
line [0@0 4@1/4 7@5/8]   // 0 at 0, 4 at 1/4 cycle, 7 at 5/8 cycle
```

`@` is optional on individual elements. A bare degree keeps its natural uniform-spacing slot; only elements with `@` have their position overridden:

```flux
line [0 4 7@1/2]   // 0 at 0, 4 at 1/3 (natural slot), 7 at 1/2 (override)
line [0 2@1]       // 0 at 0 (natural), 2 at 1 (one full cycle in)
```

---

## Monophonic mode: `'mono`

`'mono` is a modifier applied to `loop` or `line`. It instantiates a single synth node and sends `set` messages to the server instead of instantiating new synths on each event. Rough equivalent of SC's Pmono.

```flux
loop [0 1 2 3]'mono
line [4@1/2 7@1/4]'mono
```

---

## Musical pitch

In `loop [0 1 2]`, 0, 1, and 2 are interpreted as scale degrees which specify musical pitch.

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

### Modal transposition via `+` and `-`

Modal transposition uses infix `+` and `-` operators on a `loop` or `line` expression:

```flux
loop [0 2 4] + 2        // shift all degrees up 2 scale steps
loop [0 2 4] - 1        // shift down 1 scale step
loop [0 2 4] + 0rand3   // stochastic transposition, eager(1) by default
```

The right-hand side must be a non-negative scalar value or scalar generator. List generators (`[...]`) are not permitted as operands — two list generators combined arithmetically creates unresolvable stream-combination ambiguity. A double-negative such as `loop [0] - -4` is a syntax error; use `loop [0] + 4` instead.

### Accidentals

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
set scale(\minor)
set root(7)
set tempo(120)
set key(g# lydian)
```

Parameters: `scale`, `root`, `octave`, `tempo`, `cent`, `key`.

### Scoped context: `@` decorators

`@` decorators apply session parameters to a scoped block of expressions, overriding global `set` values within that scope. They use a parenthesised argument list — the same syntax supports single arguments (`@root(7)`), compound arguments (`@key(g# lydian 4)`), and stochastic arguments (`@root(3rand7)`).

```flux
@scale(\minor) @root(7)
  loop [0 1 2]
  @octave(4)
    line [0 2 4 5]
```

Here `loop [0 1 2]` inherits `@scale(\minor)` and `@root(7)`. `line [0 2 4 5]` inherits all three, with `@octave(4)` added at the nested level.

For single-expression use, decorators may appear inline on the same line:

```flux
@scale(\minor) loop [0 1 2]
```

**`set` is `@` at global scope.** `set scale(\minor)` is sugar for a top-level `@scale(\minor)` with no indented body. They are the same mechanism at different scopes — `set` establishes session-wide defaults, `@` overrides them for a block.

**Indentation:** block scope uses fixed indentation (2 spaces). Variable indentation is not supported — indentation level is determined by the number of leading 2-space units. This keeps the parser simple and the code visually consistent.

**Decorator vs. modifier boundary:** the distinction is functional, not syntactic. **Decorators (`@`) affect how the numbers inside `[]` are used to calculate the final pitch** — they are parameters in the degree-to-frequency chain: `degree → scale → root → octave → cent → frequency`. **Modifiers (`'`) are everything else** — operations on the event stream or synth parameters.

**Stochastic decorator arguments** follow the same `'lock`/`'eager(n)` semantics as everything else. `@root(3rand7)` with `'eager(4)` redraws every 4 cycles; with `'lock` the value is drawn once when the block is first entered and frozen thereafter. `'lock` is the sensible default for decorators — a randomly wandering root is an opt-in, not the default.

---

## Symbols

Names in Flux — SynthDef names, FX names, and scale names passed as arguments — are written as **symbols**: a backslash immediately followed by an identifier, with no space.

```flux
\moog     // symbol whose name is "moog"
\lpf      // symbol whose name is "lpf"
\minor    // symbol whose name is "minor"
```

This is borrowed from SuperCollider. The backslash+identifier is a single token; whitespace between `\` and the name is not permitted.

String literals (`"moog"`) are not valid in Flux — use symbols instead.

---

## SynthDef selection

`loop` and `line` take exactly one optional argument to choose a SynthDef.

```flux
line(\moog) [0 1 2 3]'lfoRate(1/4)
```

---

## FX

FX nodes are plain scsynth nodes and receive `.set` messages like any other synth. There is no architectural distinction between source and effect at the server level — the source/effect distinction is entirely a DSL/routing concern. FX parameters are therefore patternisable using the same `'lock`/`'eager` model as everything else.

FX parameters use the same `'key(value)` modifier syntax as everything else. Values can be literals, generators, or stochastic expressions.

Two categories of FX node, distinguished syntactically by whether they are named:

### Named FX (persistent)

Send effects. Defined at the top level via assignment, long-lived, independent of any source pattern.

```flux
reverb = send_fx(\reverb)'room(0.5)
delay  = send_fx(\delay)
```

The master bus effect is a standalone statement — there is no need to keep a reference to it, since all audio routes to master:

```flux
master_fx(\limiter)
```

### Anonymous FX (insert)

Scoped to a source pattern via the `|` pipe operator. Created when the source starts, released after a configurable silence tail when the source stops.

```flux
loop [0 2 4 7] | fx(\lpf)'cutoff([800 1200 2000 400]'eager)
```

The pipe operator implicitly passes the source as the audio input to the FX node — no explicit lambda required.

Silence tail duration for anonymous inserts is controlled via `'tail` on the `fx(...)` call (default TBD):

```flux
loop [0 2 4 7] | fx(\lpf)'cutoff(1200)'tail(4)  // release after 4s silence
```

---

## Modifier syntax

The sign `'` in an expression like `x'y` indicates a **modifier**, i.e. that `y` modifies the behaviour of `x`.

Modifiers are methods that return `this`, so chaining is supported:

```flux
loop [0rand7 4rand6]'eager'stut(2)
```

Modifiers attach to the **immediately preceding token**, not to the whole expression. This is the core rule governing modifier placement throughout the language.

```flux
[0rand7 4rand6]'stut(2)'lock   // 'lock attaches to the generator, not to loop
```

Modifiers are generally written **after** the list they modify. Evaluation order is left-to-right.

> **Implementation note:** The spec requires no whitespace between `'` and the modifier name (`[0]'lock`, not `[0]' lock`). The current JS parser does not enforce this — it accepts a space because the lexer tokenises `'` and the identifier separately and Chevrotain ignores inter-token whitespace. This is a known deviation; enforcing it would require a compound lexer token or a contextual lexer mode. For now, treat `[0]' lock` as valid input with a style warning.

### `'lock` and `'eager(n)`

`'eager(1)` is the default for all generators. The argument is a positive integer cycle period:

- `'eager(1)` — draw once per cycle (default; bare `'eager` is shorthand for this)
- `'eager(n)` — redraw every n cycles (n must be a positive integer ≥ 1)
- `'lock` — draw once at first evaluation, freeze forever

`'eager(0)` and negative arguments are semantic errors — the cycle-boundary evaluation model requires n ≥ 1.

Each generator is an independent stateful object. `'eager(n)` on a list propagates down as the default to each element; each element applies the annotation to its own generator independently. There is no implicit value-sharing between elements.

```flux
// draw new values on every cycle (explicit, same as default)
loop [0rand7 4]'eager(1)
// redraw every 4 cycles
loop [0 4rand6]'eager(4)
// frozen after first evaluation — each element locks at its own first-drawn value
loop [0rand7 4rand6]'lock
```

`'lock` and `'eager` can be used at whatever level of granularity is needed (list-level, element-level, modifier argument-level).

```flux
loop [0rand7 4rand6]'lock       // both elements lock at their own first-drawn values
loop [0rand7'lock 4rand6]       // first element locked, second draws every cycle (inner overrides outer)
```

### Modifier continuation lines

Because modifiers attach to the immediately preceding token, modifiers intended to apply to a whole `loop`/`line` expression (including its transposition operand) are written on an indented continuation line:

```flux
loop [0 2 4] + 0rand3
  'stut(2)
  'legato(0.8)
```

The parser distinguishes modifier continuations from decorator block bodies by the leading `'` character on the indented line.

---

## Evaluation process

Redefinition of a running `loop` takes effect at the next cycle boundary. This is the musically correct behaviour — consistent with TidalCycles and with how performers think about metric structure.

### Eager evaluation at cycle/line boundary

All generators are evaluated eagerly at the cycle or line boundary — never lazily mid-cycle. This is a fundamental design constraint:

- For `loop`: all generators inside the list are fully evaluated at the start of each cycle. The resulting event array is handed off to the scheduler as a concrete sequence. No generator polling happens during playback.
- For `line`: all generators are evaluated once when the line is first scheduled, producing a fixed event array for the entire duration of the line (including all repetitions of a `'repeat`ed line).

This guarantee is what makes `'stut` and other count-modifying modifiers tractable: the scheduler receives a complete, fixed-length event array per cycle and can calculate durations, gate times, and subdivisions without needing to consult generators again during playback.

Generators have no access to external runtime state (e.g. MIDI input, sensor values, another loop's current position) at the moment of playback. Values are committed at cycle/line start. This is intentional: Flux is a live coding tool, not a DAW. If a value should change, the performer re-evaluates the expression, which takes effect at the next cycle boundary.
