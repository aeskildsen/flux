# Decorators

Decorators set pitch context and buffer selection for patterns. They are written with a leading `@` and use a parenthesised argument list.

```flux
@key(g# minor)
  note lead [0 2 4]
```

Decorators can scope a block (indented body) or apply inline to a single expression.

---

## Pitch decorators

These decorators control the degree-to-frequency chain:

```
degree → scale → root → octave → cent → frequency
```

### `@key` — compound pitch context

Sets root, scale, and optionally octave together. The most common way to establish key.

```flux
@key(g# minor)           // root = G#, scale = minor; octave defaults to 5
@key(g# lydian 4)        // root = G#, scale = lydian, octave = 4
@key(c major)            // root = C, scale = major
```

`set key(...)` is equivalent at global scope:

```flux
set key(g# minor)
```

**Root names** use lowercase letter + optional accidental: `c`, `d`, `e`, `f`, `g`, `a`, `b`, `c#`, `db`, `f#`, `gb`, `g#`, `ab`, `a#`, `bb`.

**Scale names** include at minimum: `major`, `minor`, `dorian`, `phrygian`, `lydian`, `mixolydian`, `locrian`, `pentatonic_major`, `pentatonic_minor`, `chromatic`, `whole_tone`.

---

### `@scale` — scale only

```flux
@scale(dorian)
  note lead [0 2 4 5 7]

@scale(minor) note lead [0 2 4]   // inline
```

---

### `@root` — root note (semitones from C)

```flux
@root(7)              // root = G (7 semitones from C)
@root(3rand7)         // stochastic root, eager by default
@root(3rand7'lock)    // root chosen once and frozen
```

Accepts an integer 0–11 or a stochastic generator.

---

### `@octave` — octave

```flux
@octave(4)     // octave 4 (one below default 5)
@octave(6)     // octave 6
```

---

### `@cent` — fine pitch deviation

Deviates pitch by the given number of cents (100 cents = 1 semitone). Default: 0.

```flux
@cent(10)           // 10 cents sharp
@cent(-20)          // 20 cents flat
@cent(-50rand50)    // random detuning each cycle
```

---

## Scoped blocks

Decorators can scope a block of expressions using indentation:

```flux
@scale(minor) @root(7)
  note lead [0 1 2]
  @oct(4)
    note bass [0 2 4 5]
```

- `note lead [0 1 2]` inherits `scale=minor` and `root=7`.
- `note bass [0 2 4 5]` inherits all three, with `octave=4` added.

Indentation uses **2-space units**. The block closes when indentation returns to the enclosing level.

For a single expression, decorators can appear inline on the same line:

```flux
@scale(minor) note lead [0 1 2]
```

---

## `set` — global session state

`set` is `@` at global scope — it establishes session-wide defaults that all patterns inherit unless overridden.

```flux
set scale(minor)
set root(7)
set tempo(120)
set key(g# lydian)
```

Parameters: `scale`, `root`, `octave`, `tempo`, `cent`, `key`.

---

## `@buf` — buffer selection for `slice` and `cloud`

`@buf(\name)` specifies which buffer a `slice` or `cloud` pattern operates on. Written inline before the content type keyword.

```flux
@buf(\myloop) slice drums [0 2 4 8]
@buf(\recording) cloud grain []
```

**Static buffer:**

```flux
@buf(\myloop) slice drums [0 2 4 8]'numSlices(16)
```

**Per-cycle buffer selection:** `@buf` accepts any sequence generator, polled once per cycle. All events within the cycle share the same buffer.

```flux
@buf([\loopA \loopB]'pick)    slice drums [0 4 8 12]   // random per cycle
@buf([\a \b \c]'shuf)         slice drums [0 4 8 12]   // deck-shuffle
@buf([\loopA \loopB])         slice drums [0 4 8 12]   // sequential cycling
@buf([\loopA \loopB]'lock)    slice drums [0 4 8 12]   // frozen after first pick
@buf([\loopA \loopB]'eager(4)) slice drums [0 4 8 12]  // changes every 4 cycles
```

`@buf` on `sample` is a semantic error — buffer selection in `sample` is per-event inside the list.

---

## Stochastic decorator arguments

Decorator arguments follow the same `'lock`/`'eager(n)` semantics as any other generator:

```flux
@root(3rand7)           // new root each cycle
@root(3rand7'lock)      // root drawn once when block is first entered, frozen thereafter
@root(3rand7'eager(4))  // new root every 4 cycles
```

`'lock` is the sensible default for decorators — a randomly wandering root is an opt-in, not the default.
