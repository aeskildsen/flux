# Flux DSL — Core Truth Tables

_A compact, implementer-ready semantics document. For the authoritative narrative spec, see [DSL-spec.md](DSL-spec.md). The two documents must remain consistent — any behavioural change requires updates to both._

Each table follows the pattern:

- **Code** — minimal snippet
- **Interpretation** — what AST or binding is expected
- **Evaluation** — order of operations
- **Result** — stable behavior the runtime must exhibit

These tables are **directly usable** for TDD and for Claude Code.

> **Note on abstract snippets:** In tables that use metavariables (`x`, `a`, `b`), these stand for any valid generator expression (e.g. a literal integer or `0rand4`). They do not represent identifier tokens.

---

# 1. **Modifier Attachment Truth Table**

A modifier always attaches to the _immediately preceding syntactic token_, even across lines if the continuation-line rule applies.

| Code Snippet                    | Interpretation                                   | Evaluation                                   | Result                                 |
| ------------------------------- | ------------------------------------------------ | -------------------------------------------- | -------------------------------------- |
| `[1 2]'shuf`                    | Modifier attaches to list.                       | List token is atomic.                        | Entire list shuffle behavior.          |
| `0rand4'lock`                   | Modifier attaches to generator.                  | Apply `'lock` to generator.                  | Fixed random value.                    |
| `(0rand4)'lock`                 | Modifier attaches to parenthesized expression.   | Group first, then modify.                    | Parent grouping respected.             |
| `note [0] + 2rand4` ↵ `  'lock` | Continuation-line modifier attaches to _2rand4_. | Continuation rule sees `'` at INDENT.        | **Only** RHS scalar frozen.            |
| `[0rand4'lock 1]`               | `'lock` applies only to first element.           | Element-level modifier overrides outer ones. | First element frozen; second is eager. |

**Error cases**

| Code             | Failure Type | Why                                                                              |
| ---------------- | ------------ | -------------------------------------------------------------------------------- |
| `'stut` alone    | Parse error  | Modifier has no preceding token to attach to.                                    |
| `note` ↵ `'stut` | Parse error  | Continuation line requires a generator on the previous line, not a bare keyword. |

---

# 2. **Modifier Precedence Truth Table**

Inner overrides outer. `'lock` beats `'eager(n)`.

| Inner       | Outer       | Result              |
| ----------- | ----------- | ------------------- |
| `'lock`     | `'eager(1)` | `'lock`             |
| `'lock`     | `'eager(3)` | `'lock`             |
| `'eager(2)` | `'lock`     | inner `'eager(2)`   |
| `'eager(2)` | `'eager(5)` | inner `'eager(2)`   |
| none        | `'lock`     | `'lock` applies     |
| none        | `'eager(n)` | `'eager(n)` applies |

---

# 3. **Stutter `'stut` Truth Table**

How stutter counts are sampled. Applies to all content types.

| Code                        | Interpretation                | Evaluation                         | Result                        |
| --------------------------- | ----------------------------- | ---------------------------------- | ----------------------------- |
| `[x]'stut`                  | Default `'stut(2)`            | Draw count once per cycle.         | Each event repeats twice.     |
| `[x]'stut(4)`               | Fixed count.                  | No randomness.                     | Repeat each event 4×.         |
| `[x]'stut(2rand4)`          | Random count eager(1).        | Count drawn once per cycle.        | Each cycle has fixed k.       |
| `[x]'stut(2rand4'lock)`     | Frozen stutter count.         | k drawn once ever.                 | Same k for whole session.     |
| `[x]'stut(2rand4'eager(4))` | Count redrawn every 4 cycles. | k held for 4 cycles, then redrawn. | Slowly varying burst lengths. |

**Error cases**

| Code              | Failure Type   | Why                                                  |
| ----------------- | -------------- | ---------------------------------------------------- |
| `[x]'stut(0)`     | Semantic error | Count of 0 produces no events; must be ≥ 1.          |
| `[x]'stut(-1)`    | Semantic error | Negative count is not meaningful.                    |
| `[x]'stut([1 2])` | Semantic error | Count argument must be scalar, not a list generator. |

---

# 4. **Weighted Random `'wran` Truth Table**

How weights are interpreted.

| Code                  | Interpretation        | Evaluation                 | Result                           |
| --------------------- | --------------------- | -------------------------- | -------------------------------- |
| `[1 2 3]'wran`        | All weights = 1.      | Normalize equal weights.   | Uniform random.                  |
| `[1?3 2?1]'wran`      | Explicit weights.     | Weighted selection.        | 1 appears 3× as often as 2.      |
| `[x?0 y?1]'wran`      | Zero weight.          | Remove entry entirely.     | y only.                          |
| `[a?(1rand3)'lock b]` | Dynamic weight for a. | Lock weight at first eval. | Weight fixed for entire session. |

**Error cases**

| Code                              | Failure Type   | Why                                                                   |
| --------------------------------- | -------------- | --------------------------------------------------------------------- |
| `[a?invalid]`                     | Parse error    | Weight must be a numeric literal or generator, not a bare identifier. |
| `[a?-1]`                          | Semantic error | Negative weight is not meaningful.                                    |
| `[x?0 y?0]'wran`                  | Semantic error | All weights zero; no element can be selected.                         |
| `[1 2]'pick` with `?` on elements | Semantic error | `?` weight syntax is only valid with `'wran`.                         |

---

# 5. **Generator Polling / Nesting Truth Table**

Defines how often nested generators are sampled.

| Code                           | Interpretation                    | Evaluation                                                                       | Result                                                   |
| ------------------------------ | --------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `(0rand2)rand4`                | Nested white noise.               | Lower bound generator sampled each time outer polls.                             | min changes per outer cycle.                             |
| `(0rand2)'lock rand4`          | Frozen nested generator.          | Lower bound sampled once.                                                        | Constant lower bound.                                    |
| `[ (0rand2) 5 ]'eager(3)`      | Resample every 3 cycles.          | Both elements redrawn every 3 cycles.                                            | Slowly shifting pattern.                                 |
| `[ (0rand2)'lock 5 ]'eager(3)` | Lock overrides outer eager.       | First element frozen; second redraws every 3 cycles.                             | Mixed behavior.                                          |
| `[0.5rand3]`                   | Float lower bound.                | Produces continuous float in [0.5, 3); degree context rounds to nearest integer. | Same MIDI output as `[1rand3]` for degree lookup.        |
| `'legato(0.5rand1.2)`          | Float rand in non-degree context. | Produces continuous float in [0.5, 1.2).                                         | Duration varies continuously — float is meaningful here. |

**Note:** When either bound of `rand` (or `~`) is a float, the output is a continuous float sampled uniformly from `[min, max)`. When used as a scale degree inside `[]`, the float is rounded to the nearest integer before scale lookup — microtonal degrees are not supported. Float bounds are most useful in non-degree contexts such as `'legato`, `@cent`, and decorator arguments.

**Error cases**

| Code          | Failure Type   | Why                                                                    |
| ------------- | -------------- | ---------------------------------------------------------------------- |
| `0rand4rand7` | Semantic error | Ambiguous chained generators; parentheses required to clarify nesting. |

---

# 6. **Pattern Freezing Semantics**

Pattern structure is frozen at cycle start. Applies to all content types.

| Code                     | Interpretation            | Evaluation                                | Result                                   |
| ------------------------ | ------------------------- | ----------------------------------------- | ---------------------------------------- |
| `note [0rand4]`          | Single-element generator. | Sample once at cycle start.               | Same value entire cycle; new next cycle. |
| `note [0rand4'eager(4)]` | Resample every 4 cycles.  | Sample held for 4 cycles, then redrawn.   | Slowly shifting value.                   |
| `note [a b]'lock`        | Lock list values.         | Each element samples once at first cycle. | Pattern repeats identically forever.     |

**Error cases**

| Code                | Failure Type | Why                                            |
| ------------------- | ------------ | ---------------------------------------------- |
| `note`              | Parse error  | Content type keyword requires a list argument. |
| `note [0 1 2`       | Parse error  | Unclosed `[`; missing `]`.                     |
| `note [@root(5) 0]` | Parse error  | Decorators are not valid inside lists.         |

---

# 7. **Content Type Timing Truth Table**

All content types loop indefinitely by default. `'n` opts into finite playback; `'at` sets the phase offset.

| Code                 | Interpretation                    | Evaluation                           | Result                         |
| -------------------- | --------------------------------- | ------------------------------------ | ------------------------------ |
| `note [0 1 2]`       | Loops indefinitely (default).     | All sampling done fresh each cycle.  | Runs until stopped.            |
| `note [0 1 2]'n`     | Play once. Equivalent to `'n(1)`. | All sampling done at pattern start.  | Events scheduled once.         |
| `note [0 1 2]'n(1)`  | Play once (explicit).             | Same as bare `'n`.                   | Events scheduled once.         |
| `note [0 1 2]'n(4)`  | Finite repetition.                | Full event list produced 4×.         | Pattern lasts 4 cycles.        |
| `note [0 1]'at(1/4)` | Phase offset.                     | Shift pattern start by ¼ cycle.      | Events occur ¼ cycle later.    |
| `note [0]'at(-1/4)`  | Negative phase offset.            | Adjust to next cycle if past.        | Starts at next cycle boundary. |
| `note [0]'n'at(1/4)` | Play once, with phase offset.     | Scheduled once, starting ¼ cycle in. | Single run, offset start.      |
| `note [0]'at(1/2)`   | Loop with phase shift.            | All cycles begin ½ cycle in.         | Phase-shifted indefinite loop. |

**Error cases**

| Code              | Failure Type   | Why                                             |
| ----------------- | -------------- | ----------------------------------------------- |
| `note [0]'n(0)`   | Semantic error | Zero repetitions means the pattern never plays. |
| `note [0]'n(-1)`  | Semantic error | Negative repetition count is not meaningful.    |
| `note [0]'n(1.5)` | Semantic error | Repetition count must be a positive integer.    |

---

# 8. **Decorator Scoping Truth Table**

Decorators apply lexically like indentation-based blocks.

| Code                                            | Interpretation          | Evaluation                  | Result                                |
| ----------------------------------------------- | ----------------------- | --------------------------- | ------------------------------------- |
| `@scale(minor)` ↵ `  note [0]`                  | Scope covering pattern. | scale=minor in block.       | Degree resolved under minor scale.    |
| `@root(7)` ↵ `  @scale(minor)` ↵ `    note [0]` | Nested decorators.      | Inner overrides outer.      | root=7, scale=minor.                  |
| `note [0]` with no decorators                   | Global defaults.        | Use global scale/root.      | Normal behavior.                      |
| `@scale(minor) note [0]`                        | Inline decorator.       | Single-expression scope.    | scale=minor for that note only.       |
| `@key(g# lydian) note [0]`                      | Compound decorator.     | Sets root=g#, scale=lydian. | Multi-arg decorator, no special case. |
| `@key(g# lydian 4) note [0]`                    | With explicit octave.   | Sets root, scale, octave=4. | Three-arg form.                       |

**Error cases**

| Code                    | Failure Type   | Why                                                    |
| ----------------------- | -------------- | ------------------------------------------------------ |
| `note [0] + @root(5)`   | Semantic error | Decorator cannot appear as an arithmetic operand.      |
| `note [@root(5) 0]`     | Parse error    | Decorators are not valid inside list brackets.         |
| `@root(7)` with no body | Semantic error | Decorator with no following expression is meaningless. |

---

# 9. **FX Pipe Truth Table**

Piped insert FX attaches to preceding pattern expression. Wet/dry level (integer `%`) is optional and written after all parameter modifiers.

| Code                                   | Interpretation       | Evaluation                              | Result                       |
| -------------------------------------- | -------------------- | --------------------------------------- | ---------------------------- |
| `note [0] \| fx(\lpf)`                 | Insert FX, 100% wet. | Create FX node for duration of pattern. | Pattern audio → lpf.         |
| `note [0] \| fx(\lpf)'cutoff(1200)`    | Parameter modifier.  | cutoff sampled per eager/lock.          | Fixed or dynamic cutoff.     |
| `note [0] \| fx(\lpf) 70%`             | Wet/dry level.       | 70% wet signal mixed with 30% dry.      | Partial effect blend.        |
| `note [0] \| fx(\lpf)'cutoff(800) 50%` | Params + wet/dry.    | cutoff mod applied; 50% wet.            | Combined mod and blend.      |
| `note [0] \| fx(\lpf)'tail(10)`        | Custom silence tail. | FX node freed 10s after source stops.   | Extended reverb/delay tails. |
| `note [0] \| fx(\lpf)'tail(0)`         | Immediate free.      | FX node freed when source stops.        | No tail.                     |

**Error cases**

| Code                    | Failure Type   | Why                                                             |
| ----------------------- | -------------- | --------------------------------------------------------------- |
| `\| fx(\lpf)`           | Parse error    | Pipe operator requires a LHS expression.                        |
| `note [0] \| note [1]`  | Semantic error | RHS of pipe must be an `fx(...)` call, not a pattern.           |
| `note [0] \| fx("lpf")` | Lex error      | FX name must be a `\symbol`, not a string literal.              |
| `note [0] \| fx(lpf)`   | Parse error    | FX name must be a `\symbol`, not a bare identifier.             |
| `send_fx(\reverb)`      | Parse error    | `send_fx` is not supported — use `\| fx(...)` insert syntax.    |
| `master_fx(\limiter)`   | Parse error    | `master_fx` is not supported — master bus FX are UI-configured. |

---

# 10. **Arithmetic Transposition Truth Table**

Rules for `+` / `-` on loops and lines.

| Code                | Interpretation        | Evaluation                                    | Result                        |
| ------------------- | --------------------- | --------------------------------------------- | ----------------------------- |
| `note [0 2] + 3`    | Add scalar transpose. | Apply after generator sampling.               | [3, 5].                       |
| `note [0] + 0rand3` | Random transpose.     | Transpose sampled at correct eager/lock rate. | Per-cycle or per-event shift. |

**Error cases**

| Code                  | Failure Type   | Why                                                                |
| --------------------- | -------------- | ------------------------------------------------------------------ |
| `[0 1] + [2 3]`       | Semantic error | Both operands are list generators; no valid stream combination.    |
| `note [0] + @root(5)` | Semantic error | Decorator cannot appear as arithmetic operand.                     |
| `3 + note [0]`        | Semantic error | Transposition operator requires a content type keyword on the LHS. |
| `note [0 2] - -4`     | Parse error    | Double-negative in transposition; use `+ 4` instead.               |

---

# 11. **Indentation Truth Table**

Defines what indentation _does_ and _does not_ mean.

| Pattern                                     | Interpretation                                        | Result |
| ------------------------------------------- | ----------------------------------------------------- | ------ |
| Decorator followed by INDENT                | New scope.                                            | OK.    |
| Modifier continuation (`INDENT + 'mod`)     | Modifier attaches to last generator on previous line. | OK.    |
| Extra indentation with no block or modifier | Invalid.                                              | Error. |
| Indent not multiple of 2                    | Invalid.                                              | Error. |
| Mixed tabs/spaces                           | Invalid.                                              | Error. |
| DEDENT to a level that was never opened     | Invalid.                                              | Error. |

**Error cases**

| Code                        | Failure Type | Why                                                           |
| --------------------------- | ------------ | ------------------------------------------------------------- |
| `@root(7)` ↵ `    note [0]` | Parse error  | Indent of 4 spaces when no outer block establishes level 2.   |
| `  note [0]` (top-level)    | Parse error  | Indented expression at top level with no enclosing decorator. |
| `@root(7)` ↵ `\tnote [0]`   | Parse error  | Tab character in indentation; only spaces are permitted.      |

---

# 12. **Whitespace Truth Table**

Defines where whitespace is required, forbidden, or irrelevant.

| Context                              | Rule                   | Example     | Result       |
| ------------------------------------ | ---------------------- | ----------- | ------------ |
| Between content type keyword and `[` | Required.              | `note [0]`  | OK.          |
| Between content type keyword and `[` | Absent.                | `note[0]`   | Parse error. |
| Inside a numeric generator           | Forbidden.             | `0rand4`    | OK.          |
| Inside a numeric generator with gap  | Forbidden.             | `0 rand 4`  | Parse error. |
| Between elements inside `[...]`      | Required (space only). | `[0 1 2]`   | OK.          |
| Comma as element separator           | Invalid.               | `[0, 1, 2]` | Parse error. |
| Between modifier `'` and name        | Forbidden.             | `[0]'lock`  | OK.          |
| Between modifier `'` and name        | Absent (gap).          | `[0]' lock` | Parse error. |

---

# 13. **`'legato` Truth Table**

How legato values control note duration.

| Code                                       | Interpretation         | Evaluation                         | Result                               |
| ------------------------------------------ | ---------------------- | ---------------------------------- | ------------------------------------ |
| `note [0 2 4]'legato(0.8)`                 | Fixed legato.          | Gate closed at 0.8 × event slot.   | Slightly detached notes.             |
| `note [0 2 4]'legato(1.0)`                 | Full legato.           | Gate closed exactly at next event. | Notes touch without overlap.         |
| `note [0 2 4]'legato(1.5)`                 | Overlapping legato.    | Gate held past next event onset.   | Notes overlap (pad/drone effect).    |
| `note [0 2 4]'legato(0.5rand1.2)`          | Stochastic, eager(1).  | Value drawn once per cycle.        | Consistent legato within a cycle.    |
| `note [0 2 4]'legato(0.5rand1.2'eager(2))` | Redraw every 2 cycles. | New value drawn every 2 cycles.    | Slowly varying articulation.         |
| `note [0 2 4]'legato(0.5rand1.2'lock)`     | Frozen legato.         | Value drawn once, frozen forever.  | Same articulation for whole session. |

**Error cases**

| Code                    | Failure Type   | Why                                            |
| ----------------------- | -------------- | ---------------------------------------------- |
| `note [0]'legato(0)`    | Semantic error | Zero legato means zero-duration gate; invalid. |
| `note [0]'legato(-0.5)` | Semantic error | Negative legato is not meaningful.             |

---

# 14. **`'offset` Truth Table**

How `'offset` shifts event timing relative to the grid.

| Code                         | Interpretation          | Evaluation                                      | Result                                  |
| ---------------------------- | ----------------------- | ----------------------------------------------- | --------------------------------------- |
| `note [0 1 2]'offset(20)`    | All events 20 ms late.  | Scheduler adds 20 ms to each event time.        | Pattern plays slightly behind the grid. |
| `note [0 1 2]'offset(-10)`   | All events 10 ms early. | Scheduler subtracts 10 ms from each event time. | Pattern plays slightly ahead of grid.   |
| `note [0 1 2]'offset(0)`     | No offset.              | No change to event times.                       | Equivalent to no `'offset`.             |
| `note [0 1]'offset(0rand20)` | Stochastic offset.      | Offset value drawn per eager/lock rate.         | Humanised timing.                       |

**Error cases**

| Code                     | Failure Type   | Why                                              |
| ------------------------ | -------------- | ------------------------------------------------ |
| `note [0]'offset([1 2])` | Semantic error | Offset must be a scalar; list generator invalid. |

---

# 15. **Accidentals Truth Table**

How accidentals modify degree literals.

| Code       | Interpretation          | Evaluation                           | Result                        |
| ---------- | ----------------------- | ------------------------------------ | ----------------------------- |
| `[2b]`     | Degree 2, flat.         | Parsed as (degree=2, accidental=−1). | One semitone below degree 2.  |
| `[4#]`     | Degree 4, sharp.        | Parsed as (degree=4, accidental=+1). | One semitone above degree 4.  |
| `[3bb]`    | Degree 3, double flat.  | Parsed as (degree=3, accidental=−2). | Two semitones below degree 3. |
| `[4##]`    | Degree 4, double sharp. | Parsed as (degree=4, accidental=+2). | Two semitones above degree 4. |
| `[0 2b 4]` | Mixed list.             | Each element parsed independently.   | Normal, flat third, fifth.    |

**Error cases**

| Code        | Failure Type | Why                                                                               |
| ----------- | ------------ | --------------------------------------------------------------------------------- |
| `[2 b]`     | Parse error  | Accidental must be written adjacent to the degree; space is invalid.              |
| `[0rand4b]` | Parse error  | Accidentals are not valid on generator expressions, only on bare degree integers. |

---

# 16. **`mono` Content Type Truth Table**

Monophonic mode via the `mono` content type keyword.

| Code             | Interpretation      | Evaluation                                 | Result                                     |
| ---------------- | ------------------- | ------------------------------------------ | ------------------------------------------ |
| `mono [0 1 2]`   | Monophonic pattern. | Single synth node; events send `set` msgs. | Legato pitch changes, no re-instantiation. |
| `mono [0 2 4]'n` | Monophonic, once.   | Same single-node behaviour, plays once.    | Pitch sequence plays through once.         |
| `note [0 1 2]`   | Default polyphonic. | New synth per event.                       | Each note is a fresh synth instance.       |

---

# 17. **Error Condition Summary**

| Code                  | Failure Type   | Why                                                 |
| --------------------- | -------------- | --------------------------------------------------- |
| `[0 1 2`              | Parse error    | Missing `]`.                                        |
| `note [0] + @root(5)` | Semantic error | Decorator cannot appear as operand.                 |
| `0rand4rand7`         | Semantic error | Ambiguous construction; parentheses required.       |
| `note [@root(5) 0]`   | Parse error    | Decorators invalid inside lists.                    |
| `'stut` alone         | Parse error    | No preceding target.                                |
| `note` ↵ `  'stut`    | Parse error    | No generator on previous line.                      |
| `[a?invalid]`         | Parse error    | Weight must be literal or generator.                |
| `note [0 2] - -4`     | Parse error    | Double-negative transposition; use `+ 4`.           |
| `note[0]`             | Parse error    | Missing space between content type keyword and `[`. |
| `0 rand 4`            | Parse error    | Whitespace inside generator expression.             |
| `[0, 1, 2]`           | Parse error    | Commas not valid as element separators.             |
| `[x]'eager(0)`        | Semantic error | eager period must be a positive integer ≥ 1.        |
| `[x]'eager(-1)`       | Semantic error | Negative eager period is not meaningful.            |
| `note [0]'n(0)`       | Semantic error | Zero repetitions means the pattern never plays.     |
| `note [0]'n(-1)`      | Semantic error | Negative repetition count is not meaningful.        |
| `note [0]'n(1.5)`     | Semantic error | Repetition count must be a positive integer.        |
