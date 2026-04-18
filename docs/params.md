# Params

The `"param` notation sends a value directly to a named SynthDef argument, bypassing all of Flux's musical abstractions.

The token is `"` immediately followed by an identifier — no whitespace — analogous to `\symbol` names.

```flux
note lead [0 2 4]"amp(0.5)
```

---

## Syntax

```flux
note [0 2 4]"amp(0.5)            // set amp to 0.5
note [0 2 4]"amp(0.5)"pan(-0.3)  // chain multiple params
note [0 2 4] | fx(\lpf)"cutoff(800)"rq(0.3)   // on an FX node
```

`"param` attaches to the immediately preceding generator expression, just like modifiers. The quote character `"` must not have whitespace before the identifier name.

---

## Stochastic values

The value argument accepts the same expressions as modifiers — literals, generators, and stochastic expressions:

```flux
note [0 2 4]"amp(0.3rand0.8)              // random each cycle (eager(1) by default)
note [0 2 4]"amp(0.3rand0.8'eager(4))     // new value every 4 cycles
note [0 2 4]"amp(0.3rand0.8'lock)         // frozen at first drawn value
```

---

## Available parameters

Parameter names come from the SynthDef's specification. The common built-in parameters are:

| Parameter | Range      | Description                  |
| --------- | ---------- | ---------------------------- |
| `amp`     | 0.0 – 1.0  | Output amplitude (linear)    |
| `pan`     | −1.0 – 1.0 | Stereo position; 0 = centre  |
| `freq`    | 20 – 20000 | Oscillator frequency in Hz   |
| `cutoff`  | 20 – 20000 | Filter cutoff frequency (Hz) |
| `res`     | 0.0 – 1.0  | Filter resonance             |

The exact set of available parameters depends on the active SynthDef. Use `note(\mySynth)` to target a specific def, then `"param` to access its arguments.

---

## On FX nodes

`"param` applies equally to patterns and FX nodes:

```flux
note lead [0 2 4] | fx(\lpf)"cutoff(1200)"rq(0.2)
note lead [0 2 4] | fx(\delay)"time(3/8)"feedback(0.45)
```

---

## Design intent

`"param` is intentionally unglamorous. It is the escape hatch for raw SynthDef access when a higher-level abstraction does not exist. Heavy reliance on `"param` is a signal to consider elevating the parameter to a first-class concept or redesigning the SynthDef.

The three sigils serve distinct, non-overlapping roles:

| Sigil | Role      | What it does                                              |
| ----- | --------- | --------------------------------------------------------- |
| `@`   | Decorator | Musical pitch context (`root`, `scale`, `octave`, `cent`) |
| `'`   | Modifier  | Event stream and generator behaviour                      |
| `"`   | Param     | Direct SynthDef argument passthrough                      |

No sigil can substitute for another. `'amp(0.5)` is not valid — `amp` is a SynthDef argument, not a stream modifier.
