# Get Started

Flux is a live coding environment for stochastic music. You write patterns in the Flux DSL, evaluate them with **Ctrl+Enter**, and the audio engine plays them in sync — looping, updating, or stopping in real time.

## Boot the engine

Click **boot engine** in the sidebar, or press **Ctrl+B**. The engine initialises the Web Audio / scsynth WASM runtime. Audio only starts after a user interaction — this is a browser requirement, not a Flux limitation.

## Your first pattern

```flux
note lead [0 2 4]
```

This plays a major triad, looping indefinitely. Breaking it down:

- `note` — the content type: polyphonic pitched events
- `lead` — a name for this pattern (required)
- `[0 2 4]` — a sequence of scale degrees: root, 2nd degree, 4th degree

Each element takes an equal slice of one **cycle** (the global time unit). With three elements, each note lasts ⅓ of a cycle.

## Evaluate

Press **Ctrl+Enter** with your cursor anywhere in the editor to evaluate the whole buffer. Changes take effect at the next cycle boundary — you will never hear a glitch.

Press **Ctrl+.** (period) to stop all patterns.

## Add randomness

```flux
note lead [0rand4 2 4]
```

`0rand4` is a random integer generator: each cycle it draws a new value uniformly between 0 and 4. The sequence changes every cycle but stays in the same rhythmic slot.

## Stack patterns

```flux
note lead [0 2 4]
note bass [0]
```

Each named pattern runs independently. Evaluate both lines at once and they loop in sync.

## Set the key

```flux
set key(g# minor)

note lead [0 2 4 5]
```

`set key(...)` establishes root, scale, and optionally octave for all patterns below it. You can override per-pattern with an `@key(...)` decorator.

## Control and keyboard shortcuts

| Key        | Action            |
| ---------- | ----------------- |
| Ctrl+B     | Boot audio engine |
| Ctrl+Enter | Evaluate buffer   |
| Ctrl+.     | Stop all patterns |

## Next steps

- [Content Types](content-types) — `note`, `mono`, `sample`, `slice`, `cloud`
- [Generators](generators) — random, deterministic, and sequencing generators
- [Modifiers](modifiers) — shape, repeat, and time your sequences
- [Params](params) — direct SynthDef argument access with `"param`
- [Decorators](decorators) — pitch context (`@key`, `@scale`, `@root`, `@oct`) and buffer selection (`@buf`)
- [SynthDefs](synthdefs) — choosing and writing synthesis engines
- [Buffers](buffers) — loading and using audio samples
