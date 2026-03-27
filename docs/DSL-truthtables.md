# Flux DSL — Core Truth Tables

_A compact, implementer-ready semantics document._

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
| `loop [0] + 2rand4` ↵ `  'lock` | Continuation-line modifier attaches to _2rand4_. | Continuation rule sees `'` at INDENT.        | **Only** RHS scalar frozen.            |
| `[0rand4'lock 1]`               | `'lock` applies only to first element.           | Element-level modifier overrides outer ones. | First element frozen; second is eager. |

**Error cases**

| Code             | Failure Type | Why                                                                              |
| ---------------- | ------------ | -------------------------------------------------------------------------------- |
| `'stut` alone    | Parse error  | Modifier has no preceding token to attach to.                                    |
| `loop` ↵ `'stut` | Parse error  | Continuation line requires a generator on the previous line, not a bare keyword. |

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

How stutter counts are sampled.

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

# 6. **Loop Freezing Semantics**

Loop structure is frozen at cycle start.

| Code                     | Interpretation            | Evaluation                                | Result                                   |
| ------------------------ | ------------------------- | ----------------------------------------- | ---------------------------------------- |
| `loop [0rand4]`          | Single-element generator. | Sample once at cycle start.               | Same value entire cycle; new next cycle. |
| `loop [0rand4'eager(4)]` | Resample every 4 cycles.  | Sample held for 4 cycles, then redrawn.   | Slowly shifting value.                   |
| `loop [a b]'lock`        | Lock list values.         | Each element samples once at first cycle. | Pattern repeats identically forever.     |

**Error cases**

| Code                | Failure Type | Why                                    |
| ------------------- | ------------ | -------------------------------------- |
| `loop`              | Parse error  | `loop` requires a list argument.       |
| `loop [0 1 2`       | Parse error  | Unclosed `[`; missing `]`.             |
| `loop [@root(5) 0]` | Parse error  | Decorators are not valid inside lists. |

---

# 7. **Line Timing Truth Table**

Line runs once (or repeats), with predictable timing.

| Code                 | Interpretation     | Evaluation                       | Result                         |
| -------------------- | ------------------ | -------------------------------- | ------------------------------ |
| `line [0 1 2]`       | Linear sequence.   | All sampling done at line start. | Events scheduled once.         |
| `line [0 1]'at(1/4)` | Start offset.      | Shift entire line by ¼ cycle.    | Events occur later.            |
| `line [0]'at(-1/4)`  | Negative offset.   | Adjust to next cycle.            | Starts at next cycle boundary. |
| `line [0]'repeat(4)` | Finite repetition. | Full event list duplicated 4×.   | Line lasts 4 cycles.           |
| `line [0]'repeat`    | Indefinite repeat. | Line re-evaluates each cycle.    | Runs until stopped.            |

**Error cases**

| Code                   | Failure Type   | Why                                          |
| ---------------------- | -------------- | -------------------------------------------- |
| `line [0]'repeat(0)`   | Semantic error | Zero repetitions means the line never plays. |
| `line [0]'repeat(-1)`  | Semantic error | Negative repetition count is not meaningful. |
| `line [0]'repeat(1.5)` | Semantic error | Repetition count must be a whole number.     |

---

# 8. **Decorator Scoping Truth Table**

Decorators apply lexically like indentation-based blocks.

| Code                                            | Interpretation        | Evaluation                  | Result                                |
| ----------------------------------------------- | --------------------- | --------------------------- | ------------------------------------- |
| `@scale(minor)` ↵ `  loop [0]`                  | Scope covering loop.  | scale=minor in block.       | Degree resolved under minor scale.    |
| `@root(7)` ↵ `  @scale(minor)` ↵ `    loop [0]` | Nested decorators.    | Inner overrides outer.      | root=7, scale=minor.                  |
| `loop [0]` with no decorators                   | Global defaults.      | Use global scale/root.      | Normal behavior.                      |
| `@scale(minor) loop [0]`                        | Inline decorator.     | Single-expression scope.    | scale=minor for that loop only.       |
| `@key(g# lydian) loop [0]`                      | Compound decorator.   | Sets root=g#, scale=lydian. | Multi-arg decorator, no special case. |
| `@key(g# lydian 4) loop [0]`                    | With explicit octave. | Sets root, scale, octave=4. | Three-arg form.                       |

**Error cases**

| Code                    | Failure Type   | Why                                                    |
| ----------------------- | -------------- | ------------------------------------------------------ |
| `loop [0] + @root(5)`   | Semantic error | Decorator cannot appear as an arithmetic operand.      |
| `loop [@root(5) 0]`     | Parse error    | Decorators are not valid inside list brackets.         |
| `@root(7)` with no body | Semantic error | Decorator with no following expression is meaningless. |

---

# 9. **FX Pipe Truth Table**

Piped FX attaches to preceding expression.

| Code                                 | Interpretation | Evaluation                              | Result                   |
| ------------------------------------ | -------------- | --------------------------------------- | ------------------------ |
| `loop [0] \| fx("lpf")`              | Insert FX.     | Create FX node for duration of pattern. | Loop audio → lpf.        |
| `loop [0] \| fx("lpf")'cutoff(1200)` | Parameter mod. | cutoff sampled per eager/lock.          | Fixed or dynamic cutoff. |

**Error cases**

| Code                   | Failure Type   | Why                                                   |
| ---------------------- | -------------- | ----------------------------------------------------- |
| `\| fx("lpf")`         | Parse error    | Pipe operator requires a LHS expression.              |
| `loop [0] \| loop [1]` | Semantic error | RHS of pipe must be an `fx(...)` call, not a pattern. |

---

# 10. **Arithmetic Transposition Truth Table**

Rules for `+` / `-` on loops and lines.

| Code                | Interpretation        | Evaluation                                    | Result                        |
| ------------------- | --------------------- | --------------------------------------------- | ----------------------------- |
| `loop [0 2] + 3`    | Add scalar transpose. | Apply after generator sampling.               | [3, 5].                       |
| `loop [0] + 0rand3` | Random transpose.     | Transpose sampled at correct eager/lock rate. | Per-cycle or per-event shift. |

**Error cases**

| Code                  | Failure Type   | Why                                                             |
| --------------------- | -------------- | --------------------------------------------------------------- |
| `[0 1] + [2 3]`       | Semantic error | Both operands are list generators; no valid stream combination. |
| `loop [0] + @root(5)` | Semantic error | Decorator cannot appear as arithmetic operand.                  |
| `3 + loop [0]`        | Semantic error | Transposition operator requires a `loop`/`line` on the LHS.     |
| `loop [0 2] - -4`     | Parse error    | Double-negative in transposition; use `+ 4` instead.            |

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
| `@root(7)` ↵ `    loop [0]` | Parse error  | Indent of 4 spaces when no outer block establishes level 2.   |
| `  loop [0]` (top-level)    | Parse error  | Indented expression at top level with no enclosing decorator. |
| `@root(7)` ↵ `\tloop [0]`   | Parse error  | Tab character in indentation; only spaces are permitted.      |

---

# 12. **Whitespace Truth Table**

Defines where whitespace is required, forbidden, or irrelevant.

| Context                             | Rule                   | Example     | Result       |
| ----------------------------------- | ---------------------- | ----------- | ------------ |
| Between `loop`/`line` and `[`       | Required.              | `loop [0]`  | OK.          |
| Between `loop`/`line` and `[`       | Absent.                | `loop[0]`   | Parse error. |
| Inside a numeric generator          | Forbidden.             | `0rand4`    | OK.          |
| Inside a numeric generator with gap | Forbidden.             | `0 rand 4`  | Parse error. |
| Between elements inside `[...]`     | Required (space only). | `[0 1 2]`   | OK.          |
| Comma as element separator          | Invalid.               | `[0, 1, 2]` | Parse error. |
| Between modifier `'` and name       | Forbidden.             | `[0]'lock`  | OK.          |
| Between modifier `'` and name       | Absent (gap).          | `[0]' lock` | Parse error. |

---

# 13. **`'legato` Truth Table**

How legato values control note duration.

| Code                                       | Interpretation         | Evaluation                         | Result                               |
| ------------------------------------------ | ---------------------- | ---------------------------------- | ------------------------------------ |
| `loop [0 2 4]'legato(0.8)`                 | Fixed legato.          | Gate closed at 0.8 × event slot.   | Slightly detached notes.             |
| `loop [0 2 4]'legato(1.0)`                 | Full legato.           | Gate closed exactly at next event. | Notes touch without overlap.         |
| `loop [0 2 4]'legato(1.5)`                 | Overlapping legato.    | Gate held past next event onset.   | Notes overlap (pad/drone effect).    |
| `loop [0 2 4]'legato(0.5rand1.2)`          | Stochastic, eager(1).  | Value drawn once per cycle.        | Consistent legato within a cycle.    |
| `loop [0 2 4]'legato(0.5rand1.2'eager(2))` | Redraw every 2 cycles. | New value drawn every 2 cycles.    | Slowly varying articulation.         |
| `loop [0 2 4]'legato(0.5rand1.2'lock)`     | Frozen legato.         | Value drawn once, frozen forever.  | Same articulation for whole session. |

**Error cases**

| Code                    | Failure Type   | Why                                            |
| ----------------------- | -------------- | ---------------------------------------------- |
| `loop [0]'legato(0)`    | Semantic error | Zero legato means zero-duration gate; invalid. |
| `loop [0]'legato(-0.5)` | Semantic error | Negative legato is not meaningful.             |

---

# 14. **`'offset` Truth Table**

How `'offset` shifts event timing relative to the grid.

| Code                         | Interpretation          | Evaluation                                      | Result                                  |
| ---------------------------- | ----------------------- | ----------------------------------------------- | --------------------------------------- |
| `loop [0 1 2]'offset(20)`    | All events 20 ms late.  | Scheduler adds 20 ms to each event time.        | Pattern plays slightly behind the grid. |
| `loop [0 1 2]'offset(-10)`   | All events 10 ms early. | Scheduler subtracts 10 ms from each event time. | Pattern plays slightly ahead of grid.   |
| `loop [0 1 2]'offset(0)`     | No offset.              | No change to event times.                       | Equivalent to no `'offset`.             |
| `loop [0 1]'offset(0rand20)` | Stochastic offset.      | Offset value drawn per eager/lock rate.         | Humanised timing.                       |

**Error cases**

| Code                     | Failure Type   | Why                                              |
| ------------------------ | -------------- | ------------------------------------------------ |
| `loop [0]'offset([1 2])` | Semantic error | Offset must be a scalar; list generator invalid. |

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

# 16. **`'mono` Modifier Truth Table**

Monophonic mode via the `'mono` modifier.

| Code                | Interpretation      | Evaluation                                 | Result                                     |
| ------------------- | ------------------- | ------------------------------------------ | ------------------------------------------ |
| `loop [0 1 2]'mono` | Monophonic loop.    | Single synth node; events send `set` msgs. | Legato pitch changes, no re-instantiation. |
| `line [0 2 4]'mono` | Monophonic line.    | Same single-node behaviour for `line`.     | Pitch glides through the line.             |
| `loop [0 1 2]`      | Default polyphonic. | New synth per event.                       | Each note is a fresh synth instance.       |

**Error cases**

| Code                 | Failure Type   | Why                                              |
| -------------------- | -------------- | ------------------------------------------------ |
| `loop [0]'mono'mono` | Semantic error | Duplicate `'mono` modifier is redundant/invalid. |

---

# 17. **Error Condition Summary**

| Code                  | Failure Type   | Why                                           |
| --------------------- | -------------- | --------------------------------------------- |
| `[0 1 2`              | Parse error    | Missing `]`.                                  |
| `loop [0] + @root(5)` | Semantic error | Decorator cannot appear as operand.           |
| `0rand4rand7`         | Semantic error | Ambiguous construction; parentheses required. |
| `loop [@root(5) 0]`   | Parse error    | Decorators invalid inside lists.              |
| `'stut` alone         | Parse error    | No preceding target.                          |
| `loop` ↵ `  'stut`    | Parse error    | No generator on previous line.                |
| `[a?invalid]`         | Parse error    | Weight must be literal or generator.          |
| `loop [0 2] - -4`     | Parse error    | Double-negative transposition; use `+ 4`.     |
| `loop[0]`             | Parse error    | Missing space between `loop` and `[`.         |
| `0 rand 4`            | Parse error    | Whitespace inside generator expression.       |
| `[0, 1, 2]`           | Parse error    | Commas not valid as element separators.       |
| `[x]'eager(0)`        | Semantic error | eager period must be a positive integer ≥ 1.  |
| `[x]'eager(-1)`       | Semantic error | Negative eager period is not meaningful.      |
