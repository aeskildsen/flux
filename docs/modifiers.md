# Modifiers

Modifiers are stream and generator operations written with a leading `'`. They attach to the immediately preceding generator expression and return `this`, so they can be chained.

```flux
[0 2 4]'stut(2)'lock    // stutter, then freeze the count
```

The `'` must be written directly adjacent to the modifier name — no whitespace between them.

---

## List traversal modifiers

These attach to `[...]` lists and change how elements are selected each cycle.

### `'pick` — random selection

Picks one element at random each cycle. See [Generators](generators) for weighted `?` syntax.

```flux
[1 2 3]'pick          // uniform random
[1 2?3 3]'pick        // weighted: 2 picked 3× more often
```

### `'shuf` — deck shuffle

Shuffles the list, traverses in order, then reshuffles when exhausted. Every element is heard before repeating — unlike `'pick`.

```flux
[1 2 3]'shuf          // like Pshuf
```

### `'arp` — arpeggiation

Collects the cycle's output values, removes duplicates, filters rests, and traverses them melodically.

```flux
[0..10]'arp               // sorted ascending (default \up)
[0..10]'arp(\down)        // sorted descending
[0..10]'arp(\updown)      // palindrome: ascending then descending, no repeated endpoints
[0..10]'arp(\inward)      // pincer: outer pairs toward middle
[0..10]'arp(\outward)     // starts at middle, expands outward
[0..10]'arp(\down 16)     // \down traversal cycled to 16 values
```

**Algorithms:**

| Symbol                  | Traversal                                   |
| ----------------------- | ------------------------------------------- |
| `\up`                   | Sorted ascending (default)                  |
| `\down`                 | Sorted descending                           |
| `\updown`               | Ascending then descending; length = 2×(N−1) |
| `\inward` / `\converge` | Pincer from both ends toward middle         |
| `\outward` / `\diverge` | Starts at middle, expands outward           |

**Rules:**

- Duplicates are removed before arpeggiation (preserving first-occurrence order).
- Rests are filtered out. If all elements are rests, one rest event is emitted.
- `'arp` on a single element is a no-op.
- `'arp` cannot be combined with `'shuf` or `'pick` — choose one traversal strategy.

**Grammar:** `'arp` | `'arp(\symbol)` | `'arp(\symbol integer)`

---

## Sequence shape modifiers

These reshape the event array for a cycle **after** traversal, before scheduling. Applied after `'shuf`/`'pick`/`'arp`.

### `'rev` — reverse

Reverses the event array.

```flux
[1 2 3 4]'rev       // plays as [4 3 2 1]
[1~4]'rev           // reverses this cycle's random draws
```

`'rev` on a single element is a no-op.

### `'mirror` — palindrome with repeated endpoints

Appends the reverse without its first element: `[a b c]` → `[a b c b a]`. Natural length = 2N − 1.

```flux
[1 2 3]'mirror      // plays as [1 2 3 2 1]
[1 2]'mirror        // plays as [1 2 1]
```

Both endpoints appear twice. Single element is a no-op.

### `'bounce` — palindrome without repeated endpoints

Appends the reverse with both endpoints removed: `[a b c]` → `[a b c b]`. Natural length = 2(N − 1).

```flux
[1 2 3]'bounce      // plays as [1 2 3 2]
[1 2]'bounce        // plays as [1 2]   (nothing to append for 2-element)
```

No endpoint repeats. Single element is a no-op.

**Composition with `'stut`:** shape modifiers apply before `'stut`.

```flux
[1 2 3]'mirror'stut(2)   // mirror first (5 events), then stutter each → 10 events
```

---

## Repetition modifiers

### `'stut(n)` — stutter

Repeats every event n times within the cycle. Default n = 2.

```flux
[0 2 4]'stut           // each element repeated 2×
[0 2 4]'stut(4)        // each element repeated 4×
[0 2 4]'stut(2rand4)   // random count, redrawn each cycle (default eager(1))
```

The stutter count is drawn at the start of each cycle by default. Use `'eager` or `'lock` to control this:

```flux
[0 2 4]'stut(2rand4'eager(4))   // count redrawn every 4 cycles
[0 2 4]'stut(2rand4'lock)       // count frozen at first-drawn value
```

Count must be ≥ 1. `'stut(0)` and `'stut(-1)` are semantic errors. Count argument must be a scalar generator — a list argument is a semantic error.

**`'stut` on `mono`:** sends n repeated `.set` messages to the persistent node. Audibility depends on the SynthDef.

### `'spread` — expand to sibling slots

Expands a multi-value generator's iteration into multiple consecutive slots within the parent list. The generator is a **per-element modifier** — it attaches to an element inside `[...]`, not to the outer list.

```flux
// step generator of length 4 → 4 sibling slots
note lead [0step1x4'spread]        // equivalent to [0 1 2 3]

// explicit count
note lead [0step1x4'spread(2)]     // take 2 values → [0 1]

// list element
note lead [A [0 2 4]'spread]       // A + 3 spread values = 4 slots

// scalar with explicit count
note lead [4'spread(3)]            // three copies of 4 → [4 4 4]
```

**Bare `'spread` on a scalar** (literal, `rand`, `gau`, etc.) is a no-op with a console warning — scalars have no natural iteration length. Use `'spread(n)` to poll n times.

`'spread` on a top-level list (no enclosing `[...]`) is a semantic error — there are no sibling slots to spread into.

**Interaction with `'stut`:**

```flux
[0step1x4'spread]'stut(2)   // spread (4 slots) then stutter each → 8 events
```

---

## Probability modifier

### `'maybe(p)` — probabilistic gate

Passes each event through with probability p (0.0–1.0) and skips it otherwise. Default p = 0.5.

```flux
[0 2 4]'maybe          // each event 50% likely to fire
[0 2 4]'maybe(0.75)    // each event 75% likely
```

---

## Timing modifiers

### `'n(count)` — finite playback

Play the pattern a fixed number of cycles then stop. Default (bare `'n`) = 1 cycle.

```flux
note lead [0 2 4]'n       // play once
note lead [0 2 4]'n(4)    // play 4 cycles
```

Count must be a positive integer ≥ 1.

### `'at(phase)` — phase offset

Shift when the pattern starts within the cycle. Phase is cycle-relative (0–1).

```flux
note lead [0 2 4]'at(1/4)     // start 1/4 cycle into the bar
note lead [0 2 4]'at(-1/8)    // start 1/8 cycle before the bar
note lead [0 2 4]'at(1/2)     // loop, phase-shifted half a cycle
```

### `'offset(ms)` — millisecond timing nudge

Shifts all events a fixed number of milliseconds. Positive = late, negative = early. Useful for humanising or correcting latency.

```flux
note lead [0 1 2]'offset(20)    // 20 ms late
note lead [0 1 2]'offset(-10)   // 10 ms early
```

`'offset` must be a scalar value — a list generator argument is a semantic error.

### `'legato(factor)` — note duration

Controls how long each note gate stays open as a fraction of the event slot. Only affects `note`; no effect on `mono`.

```flux
note lead [0 2 4]'legato(0.8)            // default
note lead [0 2 4]'legato(1.5)            // overlapping (pad)
note lead [0 2 4]'legato(0.5rand1.2)     // stochastic legato
```

Values > 1.0 produce overlap. Zero and negative values are semantic errors.

---

## Resampling control

### `'eager(n)` — resample every n cycles

The default for all generators. The cycle count must be a positive integer ≥ 1.

```flux
note lead [0rand7]'eager(1)    // redraw every cycle (default; bare 'eager is shorthand)
note lead [0rand7]'eager(4)    // redraw every 4 cycles
```

### `'lock` — freeze forever

Sample once at the first cycle and never redraw.

```flux
note lead [0rand7]'lock          // frozen at first-drawn value
note lead [0rand7'lock 4rand6]   // element-level: first frozen, second eager
```

Inner annotations override outer ones: `[0rand7'lock 4rand6]'eager(4)` — first element ignores the outer `eager(4)` and stays locked.

---

## `'numSlices(n)` — slice grid size

For `slice` content type only. Tells the SynthDef how many slices the buffer is divided into.

```flux
@buf(\amen) slice drums [0 4 8 12]'numSlices(16)
```

---

## Modifier continuation lines

To apply a modifier to the whole content-type expression (including a transposition operand), write it on an indented continuation line:

```flux
note lead [0 2 4] + 0rand3
  'stut(2)
  'legato(0.8)
```

Each continuation line begins with `'` and attaches to the content-type expression as a whole, in order. This is the only way to reach the whole-expression attachment point.
