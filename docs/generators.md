# Generators

Generators are objects that yield a stream of values. They are the building blocks of every pattern — the sequence list `[...]`, random expressions, byte encodings, and arithmetic on top of them.

Generators are evaluated **eagerly at cycle boundaries**, never mid-cycle. The full event array is calculated once per cycle and handed to the scheduler as a concrete sequence.

---

## Sequence lists `[...]`

The fundamental generator. By default it yields its elements in order, cycling back to the start.

```flux
[1 2 3]          // yields 1, 2, 3, 1, 2, 3, …
[0 _ 4]          // rest on the 2nd slot — _ is silence
[0 [2 3] 4]      // sublist: 2 and 3 share the time of one slot
```

Elements are separated by **spaces** — commas are not valid separators, except inside range expressions (see below).

### Rests `_`

`_` occupies a time slot without spawning a synth. It can appear anywhere an element can appear.

```flux
note lead [0 _ 2 _ 4]    // alternating notes and silences
```

### Traversal modifiers

Attach modifiers to `[...]` to change traversal:

| Modifier | Behaviour                                                         |
| -------- | ----------------------------------------------------------------- |
| `'pick`  | Pick one element at random each cycle                             |
| `'shuf`  | Shuffle the deck then traverse in order, reshuffle when exhausted |
| `'arp`   | Arpeggiate — see below                                            |

```flux
[1 2 3]'pick       // uniform random each cycle
[1 2?2 3]'pick     // weighted: 2 appears twice as often
[1 2 3]'shuf       // like Pshuf — deck-shuffled
```

### Weighted random `'pick`

Add `?weight` after any element to bias selection. Weights are non-negative number literals (not generators). Missing weights default to 1.

```flux
[1 2?3 3?0]'pick   // 1 gets weight 1, 2 gets weight 3, 3 is never picked
[x?0 y?0]'pick     // all zero weights → silent slot (rest)
```

---

## Range notation `[start..end]`

Compact syntax for integer or float sequences. Ranges are expanded to a flat list at compile time.

```flux
[0..7]             // [0 1 2 3 4 5 6 7]
[0, 2..10]         // [0 2 4 6 8 10]  (explicit step)
[0.0, 0.25..1.0]   // [0.0 0.25 0.5 0.75 1.0]
[10, 8..0]         // [10 8 6 4 2 0]  (descending)
[5..0]             // [5 4 3 2 1 0]   (auto-descending)
```

Both bounds are **inclusive**. Float ranges require an explicit step — `[0.0..1.0]` is a parse error.

Ranges can carry the usual list modifiers:

```flux
[0..15]'pick               // random slice from 0–15
[0..7]'shuf                // shuffled 0–7
slice drums [0..15]'numSlices(16)    // all 16 slices
```

---

## Random generators

All random generators produce a single value per poll (they are **scalar generators**). Write them with no whitespace: `0rand4`, not `0 rand 4`.

### White noise `rand` / `~`

Uniform random integer (or float) between min and max.

```flux
0rand4     // integer in {0, 1, 2, 3, 4} — equivalent to Pwhite(0, 4)
0~4        // shorthand for rand
0.rand4    // float in [0.0, 4.0) — either bound as float → continuous output
```

When either bound is a float, the output is a continuous float. In a degree context (inside `[...]`), floats are rounded to the nearest integer before scale lookup. Float bounds are most useful in non-degree contexts like `'legato(0.5rand1.2)`.

### Gaussian noise `gau`

Normal distribution with mean and standard deviation.

```flux
0gau4      // Pgauss(mean=0, sdev=4)
4gau0.5    // mean=4, sdev=0.5 — tight cluster around 4
```

### Exponential random `exp`

Exponentially distributed value between min and max. Sounds more natural for frequencies and amplitudes.

```flux
1exp7      // Pexprand(min=1, max=7)
100exp4000 // useful for filter cutoff
```

### Brownian noise `bro`

Random walk (Brownian motion) bounded between min and max, with a configurable maximum step.

```flux
0bro10m2   // Pbrown(min=0, max=10, maxStep=2)
```

Syntax: `min bro max m maxStep`. The `m` separator is part of the generator syntax — no whitespace.

---

## Deterministic generators

### Linear series `step`

Arithmetic series: start, start+step, start+2×step, …

```flux
0step2x4   // Pseries(start=0, step=2, length=4) → 0, 2, 4, 6
```

Syntax: `start step stepSize x length`. Cycles after length elements. Stateful — loops from start when exhausted.

### Geometric series `mul`

Geometric series: start, start×mul, start×mul², …

```flux
1mul2x4    // Pgeom(start=1, multiplier=2, length=4) → 1, 2, 4, 8
5mul0.5x4  // 5, 2.5, 1.25, 0.625
```

Syntax: `start mul multiplier x length`.

### Linear interpolation `lin`

Evenly spaced values from first to last.

```flux
2lin7x8    // [2.0, 2.71, 3.43, 4.14, 4.86, 5.57, 6.29, 7.0] (8 values)
0lin1x5    // [0.0, 0.25, 0.5, 0.75, 1.0]
```

Syntax: `first lin last x length`.

### Geometric interpolation `geo`

Exponentially spaced values from first to last.

```flux
2geo7x8    // 8 values from 2 to 7, geometrically spaced
1geo100x5  // 1, ~3.16, ~10, ~31.6, 100
```

Syntax: `first geo last x length`.

---

## UTF-8 byte generator `utf8{word}`

Converts the characters of an identifier to their UTF-8 byte values and yields them in sequence, cycling indefinitely.

```flux
note lead utf8{coffee} % 14
// "coffee" → bytes [99 111 102 102 101 101] → % 14 → [1 7 4 4 3 3]

note lead [utf8{hello} % 7 0 2]
// nested as a scalar inside a sequence list
```

- `utf8` must be immediately followed by `{` with no whitespace.
- The content inside `{}` is a single bare identifier (letters, digits, underscores).
- Combined with `%` (modulo), byte values map into a useful scale-degree range.
- `utf8{word}` is a scalar generator — it yields one integer per poll.

---

## Generator nesting

Generators can be used as inputs to other generators using parentheses:

```flux
(0rand2)rand4    // lower bound is itself random: Pwhite(Pwhite(0,2), 4)
```

Without parentheses, `0rand2rand4` is a semantic error — ambiguous chaining requires explicit grouping.

Generators can also appear inside sequence lists:

```flux
[0 1exp7 4gau2]   // Pseq([0, Pexprand(1,7), Pgauss(4,2)])
```

---

## Generator arithmetic

Arithmetic operators apply element-wise to the values produced by the left-hand generator:

| Operator | Meaning        | Example             |
| -------- | -------------- | ------------------- |
| `+`      | Addition       | `[0 2 4] + 2`       |
| `-`      | Subtraction    | `[0 2 4] - 1`       |
| `*`      | Multiplication | `[0 2 4] * 2`       |
| `/`      | Division       | `[0 2 4] / 2`       |
| `**`     | Exponentiation | `[0 2 4] ** 2`      |
| `%`      | Modulo         | `utf8{coffee} % 14` |

```flux
note lead [0 2 4] + 2        // shift all degrees up 2 scale steps
note lead [0 2 4] + 0rand3   // stochastic transposition, redrawn each cycle
note lead [0 1 2] + [4 8]    // list RHS: pos i uses rhs[i % rhs_length]
                              // → 4, 9, 6
```

**Division by zero** skips that event slot with a warning. **Modulo zero** is defined as identity (`a % 0 = a`).

`note [0] - -4` is a parse error — use `note [0] + 4` instead.

---

## Chord literals `<...>`

`<d1 d2 ... dn>` denotes N simultaneous degree values in one event slot. All voices fire at the same beat offset.

```flux
note chords [<0 2 4>]           // one slot: triad (root, 3rd, 5th)
note chords [<0 4 7> <1 3 6>]   // two chord slots
note chords [<0 4~7> 2]         // chord with a random voice
```

Chords are not supported for `mono` — they produce a semantic error.

---

## Accidentals

Write accidentals directly on degree integers — no space:

```flux
2b   // third, flat
4#   // fifth, sharp
3bb  // third, double flat
4##  // fifth, double sharp

note lead [0 2b 4 6#]
```

---

## `'lock` and `'eager(n)`

Control how often a generator is resampled:

| Annotation  | Behaviour                                       |
| ----------- | ----------------------------------------------- |
| `'eager(1)` | Resample every cycle (default)                  |
| `'eager(n)` | Resample every n cycles                         |
| `'lock`     | Sample once at first evaluation, freeze forever |

```flux
note lead [0rand7]             // new value each cycle (default)
note lead [0rand7]'eager(4)    // new value every 4 cycles
note lead [0rand7]'lock        // frozen at first-drawn value

// element-level override:
note lead [0rand7'lock 4rand6] // first frozen, second eager
```

Inner annotations override outer ones.

---

## Custom event timing `@`

Schedule an element at an absolute position within the cycle (0 = cycle start, 1 = one full cycle):

```flux
note lead [0@0 4@1/4 7@5/8]    // absolute positions
note lead [0 4 7@1/2]          // 0 and 4 use natural spacing; 7 forced to 1/2
```
