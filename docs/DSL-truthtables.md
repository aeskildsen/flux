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

A modifier always attaches to the _immediately preceding syntactic token_, which must be a **generator expression** — a list, a scalar generator, a parenthesised expression, a whole content-type expression (via a continuation line), or a previous modifier (chaining). Attaching to any other token is a syntax error.

| Code Snippet                    | Interpretation                                                        | Evaluation                                   | Result                                                      |
| ------------------------------- | --------------------------------------------------------------------- | -------------------------------------------- | ----------------------------------------------------------- |
| `[1 2]'shuf`                    | Modifier attaches to list generator.                                  | List token is atomic.                        | Entire list shuffle behavior.                               |
| `0rand4'lock`                   | Modifier attaches to scalar generator.                                | Apply `'lock` to generator.                  | Fixed random value.                                         |
| `(0rand4)'lock`                 | Modifier attaches to parenthesized expression.                        | Group first, then modify.                    | Parent grouping respected.                                  |
| `[0 2 4]'stut(2)'lock`          | Chained modifiers: `'lock` attaches to `'stut`.                       | Each modifier returns `this`.                | Frozen stutter count.                                       |
| `note [0] + 2rand4` ↵ `  'lock` | Continuation-line modifier attaches to whole content-type expression. | Continuation rule sees `'` at INDENT.        | Modifier applies to the content-type expression as a whole. |
| `[0rand4'lock 1]`               | `'lock` applies only to first element.                                | Element-level modifier overrides outer ones. | First element frozen; second is eager.                      |

**Error cases**

| Code                 | Failure Type | Why                                                                              |
| -------------------- | ------------ | -------------------------------------------------------------------------------- |
| `'stut` alone        | Parse error  | Modifier has no preceding token to attach to.                                    |
| `note'legato(0.8)`   | Parse error  | Attaches to a bare content-type keyword, which is not a generator expression.    |
| `note [0] +'stut(2)` | Parse error  | Attaches to an operator, which is not a generator expression.                    |
| `note` ↵ `'stut`     | Parse error  | Continuation line requires a generator on the previous line, not a bare keyword. |

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

# 4. **Weighted Random `'pick` Truth Table**

How `?` weights on a `'pick` list are interpreted.

| Code               | Interpretation                      | Evaluation                                    | Result                          |
| ------------------ | ----------------------------------- | --------------------------------------------- | ------------------------------- |
| `[1 2 3]'pick`     | No weights.                         | All weights default to 1; uniform random.     | Uniform random.                 |
| `[1 2?2 3]'pick`   | Mixed explicit and default weights. | Weights 1/2/1 → probs 0.25/0.5/0.25.          | 2 appears half the time.        |
| `[1?3 2?1]'pick`   | Explicit weights.                   | Weighted selection.                           | 1 appears 3× as often as 2.     |
| `[x?0 y?1]'pick`   | Zero weight.                        | x is never picked.                            | y only.                         |
| `[x?0 y?0]'pick`   | All weights zero.                   | No element can be selected; emit rest.        | Silent slot (rest event).       |
| `[[1 2?3]'pick 5]` | `?` on inner `'pick` list.          | Inner list picks 2 with weight 3, else 1.     | Valid per-level check.          |
| `[[1 2?3] 5]'pick` | `?` on inner list without `'pick`.  | Inner `?3` ignored with warning; outer picks. | Warning logged; weight ignored. |

**Error cases**

| Code                | Failure Type | Why                                                                       |
| ------------------- | ------------ | ------------------------------------------------------------------------- |
| `[a?invalid]`       | Parse error  | Weight must be a non-negative numeric literal.                            |
| `[a?-1]'pick`       | Parse error  | Negative weights are not meaningful.                                      |
| `[a?(1rand3)]'pick` | Parse error  | Generator expressions are not valid as weights; weight must be a literal. |

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

| Code                                            | Interpretation          | Evaluation                  | Result                             |
| ----------------------------------------------- | ----------------------- | --------------------------- | ---------------------------------- |
| `@scale(minor)` ↵ `  note [0]`                  | Scope covering pattern. | scale=minor in block.       | Degree resolved under minor scale. |
| `@root(7)` ↵ `  @scale(minor)` ↵ `    note [0]` | Nested decorators.      | Inner overrides outer.      | root=7, scale=minor.               |
| `note [0]` with no decorators                   | Global defaults.        | Use global scale/root.      | Normal behavior.                   |
| `@key(g# lydian)` ↵ `  note [0]`                | Compound decorator.     | Sets root=g#, scale=lydian. | Multi-arg decorator, block form.   |
| `@key(g# lydian 4)` ↵ `  note [0]`              | With explicit octave.   | Sets root, scale, octave=4. | Three-arg form, block form.        |

**Error cases**

| Code                         | Failure Type   | Why                                                    |
| ---------------------------- | -------------- | ------------------------------------------------------ |
| `@scale(minor) note [0]`     | Parse error    | Inline decorator form is not allowed.                  |
| `@buf(kick) sample kick [0]` | Parse error    | Inline decorator form is not allowed.                  |
| `@key(g# lydian) note [0]`   | Parse error    | Inline decorator form is not allowed.                  |
| `note [0] + @root(5)`        | Semantic error | Decorator cannot appear as an arithmetic operand.      |
| `note [@root(5) 0]`          | Parse error    | Decorators are not valid inside list brackets.         |
| `@root(7)` with no body      | Semantic error | Decorator with no following expression is meaningless. |

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

# 10. **Generator Arithmetic Truth Table**

Element-wise arithmetic applied to degree values. Operators: `+`, `-`, `*`, `/`, `**`, `%`.

**Scalar right-hand side**

| Code                | Interpretation                     | Evaluation                                                         | Result                        |
| ------------------- | ---------------------------------- | ------------------------------------------------------------------ | ----------------------------- |
| `note [0 2] + 3`    | Add scalar to every degree.        | Apply after generator sampling.                                    | [3, 5].                       |
| `note [0 2] - 1`    | Subtract scalar from every degree. | Apply after generator sampling.                                    | [-1, 1].                      |
| `note [0 2] * 2`    | Multiply every degree by scalar.   | Apply after generator sampling.                                    | [0, 4].                       |
| `note [0 4] / 2`    | Divide every degree by scalar.     | Apply after generator sampling; result is float, rounded for MIDI. | [0, 2].                       |
| `note [2 3] ** 2`   | Exponentiate every degree.         | Apply after generator sampling.                                    | [4, 9].                       |
| `note [5 9] % 7`    | Modulo every degree.               | Apply after generator sampling.                                    | [5, 2].                       |
| `note [0] + 0rand3` | Random scalar transpose.           | Transpose sampled at correct eager/lock rate.                      | Per-cycle or per-event shift. |

**Generator right-hand side (wrap-around)**

| Code                   | Interpretation                       | Evaluation                                                    | Result                       |
| ---------------------- | ------------------------------------ | ------------------------------------------------------------- | ---------------------------- |
| `note [0 1 2] + [4 8]` | Add list RHS, wrap-around.           | pos i uses rhs[i % rhs_length]; both reset at cycle boundary. | [4, 9, 6].                   |
| `note [0 1 2] * [2 3]` | Multiply list RHS, wrap-around.      | pos i uses rhs[i % rhs_length].                               | [0, 3, 4].                   |
| `note [0 1 2] % [4 0]` | Modulo list RHS; zero is identity.   | 0%4=0, 1%0=1 (identity), 2%4=2.                               | [0, 1, 2].                   |
| `note [1 2 3] / [4 0]` | Division list RHS; zero skips event. | 1/4 fires; 2/0 skipped; 3/4 fires (pos 2 wraps to rhs[0]=4).  | [0.25, 0.75]; pos 1 skipped. |

**Error and edge cases**

| Code                  | Failure Type   | Why                                                             |
| --------------------- | -------------- | --------------------------------------------------------------- |
| `note [0] + @root(5)` | Semantic error | Decorator cannot appear as arithmetic operand.                  |
| `3 + note [0]`        | Semantic error | Arithmetic operator requires a content type keyword on the LHS. |
| `note [0 2] - -4`     | Parse error    | Double-negative with `-`; use `+ 4` instead.                    |
| `note [1 2] / [4 0]`  | Warning + skip | Division by zero: warning emitted, that event slot is skipped.  |
| `note [1 2] % [4 0]`  | Identity       | Modulo zero: `a % 0 = a` (no error, no skip).                   |

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

How legato values control note duration. Default legato for `note` is **0.8**. `'legato` has no effect on `mono`.

| Code                                       | Interpretation         | Evaluation                           | Result                                 |
| ------------------------------------------ | ---------------------- | ------------------------------------ | -------------------------------------- |
| `note [0 2 4]`                             | Default legato.        | Gate closed at 0.8 × event slot.     | Slightly detached notes (default).     |
| `note [0 2 4]'legato(0.8)`                 | Fixed legato.          | Gate closed at 0.8 × event slot.     | Same as default.                       |
| `note [0 2 4]'legato(1.0)`                 | Full legato.           | Gate closed exactly at next event.   | Notes touch without overlap.           |
| `note [0 2 4]'legato(1.5)`                 | Overlapping legato.    | Gate held past next event onset.     | Notes overlap (pad/drone effect).      |
| `note [0 2 4]'legato(0.5rand1.2)`          | Stochastic, eager(1).  | Value drawn once per cycle.          | Consistent legato within a cycle.      |
| `note [0 2 4]'legato(0.5rand1.2'eager(2))` | Redraw every 2 cycles. | New value drawn every 2 cycles.      | Slowly varying articulation.           |
| `note [0 2 4]'legato(0.5rand1.2'lock)`     | Frozen legato.         | Value drawn once, frozen forever.    | Same articulation for whole session.   |
| `mono x [0 2 4]'legato(0.8)`               | Legato on mono.        | Modifier accepted, silently ignored. | No effect — mono uses persistent node. |

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

Monophonic mode via the `mono` content type keyword. Single persistent synth node per named generator.

| Code                         | Interpretation      | Evaluation                                       | Result                                     |
| ---------------------------- | ------------------- | ------------------------------------------------ | ------------------------------------------ |
| `mono x [0 1 2]`             | Monophonic pattern. | First cycle: spawn node. Subsequent: `.set` msg. | Legato pitch changes, no re-instantiation. |
| `mono x [0 2 4]'n`           | Monophonic, once.   | Same single-node behaviour, plays once.          | Pitch sequence plays through once.         |
| `mono x [0 2]'stut`          | Stutter on mono.    | 2 repeated `.set` messages per slot.             | Each pitch change sent twice.              |
| `mono x [0 2 4]'legato(0.8)` | Legato on mono.     | Modifier accepted, silently ignored.             | No effect — mono uses persistent node.     |
| `note x [0 1 2]`             | Default polyphonic. | New synth per event.                             | Each note is a fresh synth instance.       |

---

# 19. **Buffer-backed Content Types Truth Table**

How `sample`, `slice`, and `cloud` interpret their event lists and select SynthDefs.

| Code                                    | Interpretation                   | Evaluation                                   | Result                                      |
| --------------------------------------- | -------------------------------- | -------------------------------------------- | ------------------------------------------- |
| `sample drums [\kick \hat \snare]`      | Buffer playback, by name.        | Each event picks buffer by `\symbol` name.   | `samplePlayer` triggered with buffer param. |
| `sample(\mySampler) drums [\kick \hat]` | Custom SynthDef.                 | `\mySampler` used instead of `samplePlayer`. | User SynthDef triggered.                    |
| `slice drums [0 2 4 8]`                 | Beat-sliced playback.            | Each event emits a slice index.              | `slicePlayer` triggered with slice index.   |
| `slice drums [0 2 4]'numSlices(16)`     | Slice with grid size.            | `numSlices=16` passed to SynthDef.           | Correct playback position.                  |
| `@buf(\myloop) slice drums [0 2 4]`     | Slice from named buffer.         | Buffer name attached to each slice event.    | `slicePlayer` uses `myloop` buffer.         |
| `cloud grain []`                        | Granular synth, persistent node. | Empty list; one CloudEvent per cycle.        | `grainCloud` node spawned / updated.        |
| `@buf(\recording) cloud grain []`       | Granular from named buffer.      | Buffer name on cloud event.                  | `grainCloud` uses `recording` buffer.       |

**Error cases**

| Code                            | Failure Type   | Why                                                 |
| ------------------------------- | -------------- | --------------------------------------------------- |
| `@buf(\x) sample drums [\kick]` | Semantic error | `@buf` is invalid on `sample`; buffer is per-event. |

---

# 20. **`@buf` Decorator Truth Table**

Pattern-level buffer selection for `slice` and `cloud`.

The `@buf` argument may be a static `\symbol` or any sequence generator form — the same traversal modifiers (`'pick`, `'shuf`, sequential, `'lock`, `'eager`) apply as on any `[...]` list. The generator is polled **once per cycle**; all events within the cycle share the same buffer name.

| Code                                            | Interpretation                   | Evaluation                                     | Result                                                         |
| ----------------------------------------------- | -------------------------------- | ---------------------------------------------- | -------------------------------------------------------------- |
| `@buf(\myloop) slice drums [0 2 4]`             | Static buffer.                   | `\myloop` attached to all events.              | All slice events use `myloop` buffer.                          |
| `@buf([\loopA \loopB]'pick) slice drums []`     | Uniform random, per-cycle.       | Generator polled once at cycle boundary.       | Buffer chosen randomly each cycle; all events share same name. |
| `@buf([\a \b \c]'shuf) slice drums []`          | Deck-shuffle, per-cycle.         | Visits all N buffers before repeating.         | Non-repeating until deck exhausted; then reshuffled.           |
| `@buf([\loopA \loopB]) slice drums []`          | Sequential (default), per-cycle. | Cycle 0→loopA, cycle 1→loopB, cycle 2→loopA, … | Cycles through buffers in order.                               |
| `@buf([\loopA \loopB]'lock) slice drums []`     | Frozen buffer.                   | First cycle picks a name; frozen thereafter.   | Same buffer for the entire session.                            |
| `@buf([\loopA \loopB]'eager(4)) slice drums []` | Slow rotation, per 4 cycles.     | Buffer name changes every 4 cycles.            | Buffer held for 4 cycles, then advances.                       |
| `@buf(\x) cloud grain []`                       | Buffer for cloud.                | `\x` attached to cloud event.                  | `grainCloud` uses `x` buffer.                                  |

**Error cases**

| Code                            | Failure Type   | Why                                                   |
| ------------------------------- | -------------- | ----------------------------------------------------- |
| `@buf(\x) sample drums [\kick]` | Semantic error | `sample` selects buffer per-event; `@buf` is invalid. |

---

# 18. **`"param` Truth Table**

Direct SynthDef argument access. Valid wherever modifiers are valid.

| Code                                        | Interpretation              | Evaluation                           | Result                       |
| ------------------------------------------- | --------------------------- | ------------------------------------ | ---------------------------- |
| `note lead [0 2 4]"amp(0.5)`                | Set `amp` to literal.       | Value passed straight to synth node. | Amplitude fixed at 0.5.      |
| `note lead [0 2 4]"amp(0.5)"pan(-0.3)`      | Chained params.             | Each param applied independently.    | Both amp and pan set.        |
| `note pad [0 2 4]"amp(0.3rand0.8)`          | Stochastic value, eager(1). | Value drawn once per cycle.          | Amplitude varies per cycle.  |
| `note pad [0 2 4]"amp(0.3rand0.8'eager(4))` | Redraw every 4 cycles.      | Value held 4 cycles then redrawn.    | Slowly varying amplitude.    |
| `note pad [0 2 4]"amp(0.3rand0.8'lock)`     | Frozen value.               | Drawn once at first eval, frozen.    | Same amplitude forever.      |
| `note bass [0 2 4] \| fx(\lpf)"cutoff(800)` | Param on FX node.           | cutoff passed to FX synth node.      | Filter cutoff set to 800 Hz. |

**Error cases**

| Code                      | Failure Type | Why                                                     |
| ------------------------- | ------------ | ------------------------------------------------------- |
| `"amp` alone              | Parse error  | Param token has no preceding expression to attach to.   |
| `note lead [0]" amp(0.5)` | Lex error    | Whitespace between `"` and identifier is not permitted. |

---

# 17. **Error Condition Summary**

| Code                  | Failure Type   | Why                                                                              |
| --------------------- | -------------- | -------------------------------------------------------------------------------- |
| `[0 1 2`              | Parse error    | Missing `]`.                                                                     |
| `note [0] + @root(5)` | Semantic error | Decorator cannot appear as operand.                                              |
| `0rand4rand7`         | Semantic error | Ambiguous construction; parentheses required.                                    |
| `note [@root(5) 0]`   | Parse error    | Decorators invalid inside lists.                                                 |
| `'stut` alone         | Parse error    | No preceding target.                                                             |
| `note` ↵ `  'stut`    | Parse error    | No generator on previous line.                                                   |
| `[a?invalid]`         | Parse error    | Weight must be literal or generator.                                             |
| `note [0 2] - -4`     | Parse error    | Double-negative transposition; use `+ 4`.                                        |
| `note[0]`             | Parse error    | Missing space between content type keyword and `[`.                              |
| `0 rand 4`            | Parse error    | Whitespace inside generator expression.                                          |
| `[0, 1, 2]`           | Parse error    | Commas not valid as element separators.                                          |
| `[x]'eager(0)`        | Semantic error | eager period must be a positive integer ≥ 1.                                     |
| `[x]'eager(-1)`       | Semantic error | Negative eager period is not meaningful.                                         |
| `note [0]'n(0)`       | Semantic error | Zero repetitions means the pattern never plays.                                  |
| `note [0]'n(-1)`      | Semantic error | Negative repetition count is not meaningful.                                     |
| `{4:1/2 7:3/2}`       | Lex error      | `{}` outside of `utf8{...}` context is invalid; bare `{` or `}` is unrecognised. |
| `{`                   | Lex error      | Lone `{` outside `utf8{...}` is unrecognised by the lexer.                       |
| `}`                   | Lex error      | Lone `}` outside `utf8{...}` is unrecognised by the lexer.                       |
| `note [0]'n(1.5)`     | Semantic error | Repetition count must be a positive integer.                                     |

---

# 21. **`utf8{}` Generator Truth Table**

Converts a bare identifier to its UTF-8 byte sequence and yields the bytes cyclically.

| Code Snippet                           | Interpretation                                                   | Evaluation                                                                                 | Result                                        |
| -------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------- |
| `note lead utf8{coffee}`               | Generator yields bytes of "coffee": 99 111 102 102 101 101.      | Each poll returns the next byte in the sequence, cycling.                                  | Six events at degrees 99 111 102 102 101 101. |
| `note lead utf8{coffee} % 14`          | Byte values modulo 14.                                           | After each poll, `%` wraps value into [0, 13].                                             | Degrees: 1 7 4 4 3 3.                         |
| `note lead [utf8{hello} % 7 0 2]`      | `utf8{hello}` nested as a scalar element inside a sequence list. | Each cycle polls the next byte from "hello" (bytes: 104 101 108 108 111), then wraps by 7. | Cycling scalar inside the list.               |
| `note lead utf8{a}`                    | Single-character word — one byte.                                | Generator yields 97 (ASCII 'a') repeatedly (cycle of length 1).                            | All events at degree 97.                      |
| `note lead utf8{coffee} % 14 'shuf`    | `'shuf` modifier attached to the utf8 generator expression.      | Modifier applies to the scalar generator result (no-op on scalar; effectively ignored).    | Same as `% 14` without `'shuf`.               |
| `note lead [utf8{hello} % 7 0 2]'shuf` | `'shuf` on containing list.                                      | Whole list shuffled each cycle; utf8 element polls one byte per slot.                      | Shuffled list containing cycling utf8 byte.   |

**Error cases**

| Code               | Failure Type | Why                                                                                                            |
| ------------------ | ------------ | -------------------------------------------------------------------------------------------------------------- |
| `utf8 {coffee}`    | Lex error    | Whitespace between `utf8` and `{` is not permitted; `utf8` becomes an Identifier and bare `{` is unrecognised. |
| `utf8{}`           | Parse error  | Empty braces — identifier is required inside `{}`.                                                             |
| `utf8{1coffee}`    | Parse error  | Content must be a valid identifier (cannot start with a digit).                                                |
| `utf8{coffee bar}` | Parse error  | Only a single bare identifier is allowed; spaces are not permitted.                                            |

---

# 22. **Range Notation Truth Table**

Compact `[start..end]` / `[start, step..end]` syntax. All bounds inclusive. Eagerly expanded to a flat value array at compile time.

| Code Snippet          | Interpretation                                 | Evaluation                                      | Result                   |
| --------------------- | ---------------------------------------------- | ----------------------------------------------- | ------------------------ |
| `[0..7]`              | Integer range, default step 1.                 | Expand to `[0 1 2 3 4 5 6 7]`.                  | 8 elements: 0–7.         |
| `[0, 2..10]`          | Integer range, explicit step 2 (second−first). | Expand to `[0 2 4 6 8 10]`.                     | 6 elements.              |
| `[0.0, 0.25..1.0]`    | Float range, explicit step 0.25.               | Expand to `[0.0 0.25 0.5 0.75 1.0]`.            | 5 float elements.        |
| `[10, 8..0]`          | Descending, explicit step −2.                  | Expand to `[10 8 6 4 2 0]`.                     | 6 elements, descending.  |
| `[5..0]`              | Descending, default step −1.                   | Expand to `[5 4 3 2 1 0]`.                      | 6 elements.              |
| `[0..0]`              | Single-element range.                          | Expand to `[0]`.                                | 1 element.               |
| `[0..3]'shuf`         | Range with modifier.                           | Expand then apply `'shuf`.                      | `[0 1 2 3]` shuffled.    |
| `[0..3]'pick`         | Range with `'pick`.                            | Expand then pick randomly each slot.            | Uniform random from 0–3. |
| `slice drums [0..15]` | Range as slice pool.                           | Expand to 16 elements; slice index cycles 0→15. | All 16 slices in order.  |

**Error cases**

| Code         | Failure Type   | Why                                                                                                 |
| ------------ | -------------- | --------------------------------------------------------------------------------------------------- |
| `[0.0..1.0]` | Parse error    | Float before `..` with no preceding comma (no explicit step); step would be fractional and unknown. |
| `[0, 0..5]`  | Semantic error | Step of zero produces an infinite loop; rejected at compile time.                                   |
| `[0, 2..1]`  | Semantic error | Step (2) goes the wrong direction relative to end (1), so no elements would be produced.            |

---

# 23. **Chord Literals Truth Table**

`<d1 d2 ... dn>` — N simultaneous degree values in one event slot. Spawns N synths at the same beat offset.

| Code Snippet                   | Interpretation                            | Evaluation                                                                 | Result                                                    |
| ------------------------------ | ----------------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------- |
| `note x [<0 2 4>]`             | Single chord slot — triad.                | Three NoteEvents at the same beatOffset.                                   | Three simultaneous notes (MIDI 60, 64, 67 in C major/C5). |
| `note x [<0 2 4> <1 3 6>]`     | Two chord slots, each a triad.            | Cycle: two slots; each produces three NoteEvents.                          | Chords timed like a 2-element list.                       |
| `note x [<0 4~7> 2]`           | Chord with a generator element.           | `4~7` polled at cycle boundary (`'eager(1)`); degree 2 is the second slot. | First slot: chord (0, random 4–7); second slot: degree 2. |
| `note x [0 <2 4> 7]`           | Mixed: scalars and chord inside one list. | Three slots; middle slot emits two simultaneous notes.                     | Slot 0: one note; slot 1: two notes; slot 2: one note.    |
| `@scale(minor) note x [<0 2>]` | Chord in non-default scale context.       | Degrees resolved under minor scale.                                        | Two notes at minor-scale MIDI values for degrees 0 and 2. |
| `note x [<0 2>]'legato(1.2)`   | Legato applied to chord.                  | Legato applies uniformly to all voices in the chord.                       | Both notes have `duration = slot × 1.2`.                  |

**Error cases**

| Code                 | Failure Type   | Why                                                                            |
| -------------------- | -------------- | ------------------------------------------------------------------------------ |
| `mono x [<0 2 4>]`   | Semantic error | Chords are not supported for mono content type.                                |
| `note x [0] + <0 4>` | Parse error    | Chord literal is not valid as a transposition operand; the grammar rejects it. |
| `note x [<>]`        | Parse error    | Empty chord — at least one element is required.                                |

---

# 24. **`'spread` Truth Table**

`'spread` is a per-element modifier inside `[...]` that expands a multi-value generator's single iteration into multiple consecutive sibling cycle slots.

## Basic cases — series generators

| Code Snippet                  | Interpretation                                       | Evaluation                                                               | Result                                                     |
| ----------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------- |
| `note x [0step1x4'spread]`    | Bare spread on step generator (length 4).            | Consume one full iteration: [0,1,2,3]. Each value gets 1/4 of the cycle. | 4 events: degrees 0,1,2,3; beatOffsets 0, 0.25, 0.5, 0.75. |
| `note x [0step1x4'spread(2)]` | Explicit count 2 — take 2 values from one iteration. | Consume 2 values: [0,1]. Each gets 1/2 of the cycle.                     | 2 events: degrees 0,1; beatOffsets 0, 0.5.                 |
| `note x [0step1x4'spread(6)]` | Explicit count 6 — wraps around (length 4 < 6).      | 6 polls with wrap: [0,1,2,3,0,1]. Each gets 1/6 of the cycle.            | 6 events: degrees 0,1,2,3,0,1.                             |
| `note x [A 0step1x4'spread]`  | Mixed: scalar A + 4 spread values.                   | List has 5 total slots: A, 0, 1, 2, 3. Each gets 1/5 of the cycle.       | 5 events; slot 0 = degree A, slots 1–4 = 0,1,2,3.          |
| `note x [0mul2x4'spread]`     | Geometric series of length 4: 0,0,0,0 (start=0).     | Consume one full iteration.                                              | 4 events.                                                  |
| `note x [1mul2x4'spread]`     | Geometric series: 1,2,4,8.                           | Consume full iteration.                                                  | 4 events: degrees 1,2,4,8.                                 |
| `note x [2lin7x4'spread]`     | Linear interpolation, length 4: 2,4,5,7 (rounded).   | Consume full iteration.                                                  | 4 events.                                                  |

## Basic cases — list generators

| Code Snippet                 | Interpretation                                          | Evaluation                                      | Result                                            |
| ---------------------------- | ------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------- |
| `note x [[0 2 4]'spread]`    | Inner list spread into outer — equivalent to `[0 2 4]`. | Inner list [0,2,4] flattened into parent slots. | 3 events: degrees 0,2,4; beatOffsets 0, 1/3, 2/3. |
| `note x [A [0 2 4]'spread]`  | A plus spread inner list.                               | 4 slots total: A, 0, 2, 4.                      | 4 events; slot 0 = A, slots 1–3 = 0,2,4.          |
| `note x [[0..3]'spread]`     | Range notation: `[0..3]` is `[0 1 2 3]`, then spread.   | 4 values spread into parent.                    | 4 events: degrees 0,1,2,3.                        |
| `note x [[0 2 4]'spread(2)]` | Explicit count 2 on list (first 2 elements).            | Take 2 values: [0,2]. 2 slots.                  | 2 events: degrees 0,2.                            |
| `note x [[0 2 4]'spread(5)]` | Explicit count 5 > list length 3 — wraps.               | 5 polls with wrap: [0,2,4,0,2].                 | 5 events: degrees 0,2,4,0,2.                      |

## Scalar generators — no-op warning

| Code Snippet                | Interpretation                                       | Evaluation                                            | Result                                                                 |
| --------------------------- | ---------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------- |
| `note x [4'spread]`         | Bare spread on scalar literal — no natural length.   | Warning emitted; `'spread` ignored; 1 slot as normal. | 1 event: degree 4. Console warning: `'spread on scalar has no effect`. |
| `note x [0rand7'spread]`    | Bare spread on rand — scalar, no natural length.     | Warning emitted; `'spread` ignored; 1 slot as normal. | 1 event. Console warning.                                              |
| `note x [utf8{hi}'spread]`  | Bare spread on utf8 generator — scalar.              | Warning emitted; `'spread` ignored; 1 slot as normal. | 1 event. Console warning.                                              |
| `note x [4'spread(3)]`      | Explicit count on scalar literal — valid.            | 3 polls of the literal: [4,4,4]. 3 slots.             | 3 events: all degree 4.                                                |
| `note x [0rand7'spread(3)]` | Explicit count on rand — valid; 3 independent polls. | 3 random polls. 3 slots.                              | 3 events with random degrees.                                          |

## `'spread` × `'stut` interaction

| Code Snippet                         | Interpretation                                                        | Evaluation                                                     | Result                                                          |
| ------------------------------------ | --------------------------------------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------- |
| `note x [0step1x4'spread]'stut(2)`   | Spread inside list expands to 4 slots; outer `'stut(2)` doubles each. | After spread: [0,1,2,3]. After stut(2): [0,0,1,1,2,2,3,3].     | 8 events: degrees [0,0,1,1,2,2,3,3]; beatOffsets at 0,1/8,2/8,… |
| `note x [A 0step1x4'spread]'stut(2)` | A + 4 spread = 5 slots; stut doubles each to 10 slots.                | After spread: [A,0,1,2,3]. After stut(2): each repeated twice. | 10 events.                                                      |
| `note x [[0 2 4]'spread]'stut(2)`    | List spread into 3 slots; outer stut doubles each.                    | After spread: [0,2,4]. After stut(2): [0,0,2,2,4,4].           | 6 events.                                                       |

## Error cases

| Code                               | Failure Type   | Why                                                                                                                                                                                              |
| ---------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `note x [0 2 4]'spread`            | Semantic error | `'spread` attaches to the outer list — there is no enclosing list to spread into. Emits: `'spread on a top-level list is not valid — 'spread must be applied to an element inside a [...] list`. |
| `note x 0step1x4'spread`           | Parse error    | The grammar requires `[...]` as the pattern body; a bare generator with `'spread` does not parse. (Surfaced as a parse error rather than a semantic error.)                                      |
| `note x [0step1x4'spread(0)]`      | Semantic error | Count of 0 produces no events; must be ≥ 1 (consistent with `'stut(0)`).                                                                                                                         |
| `note x [0step1x4'spread(-1)]`     | Semantic error | Negative count is not meaningful.                                                                                                                                                                |
| `note x [0step1x4'spread([1 2])]`  | Semantic error | Count argument must be a scalar generator, not a list.                                                                                                                                           |
| `note x [0step1x4'stut(2)'spread]` | Semantic error | `'stut` and `'spread` on the same element are ambiguous. Use list-level `'stut` instead: `[0step1x4'spread]'stut(2)`.                                                                            |

---

# 25. **`'arp` Truth Table**

`'arp` collects a list's cycle output, removes duplicate numeric values (preserving order of first occurrence), filters rests, and traverses the result via the chosen algorithm.

**Canonical input:** `[0..10]` = `[0 1 2 3 4 5 6 7 8 9 10]` (11 elements, N=11, odd).
Default pitch context: C major / C5. Degree → MIDI: 0→60, 1→62, 2→64, 3→65, 4→67, 5→69, 6→71, 7→72, 8→74, 9→76, 10→77.

## Algorithm rows — canonical input `[0..10]`

| Code Snippet                    | Algorithm       | Output (degrees)                           | Output length | Notes                                                           |
| ------------------------------- | --------------- | ------------------------------------------ | ------------- | --------------------------------------------------------------- |
| `note x [0..10]'arp`            | `\up` (default) | `0 1 2 3 4 5 6 7 8 9 10`                   | 11            | Sorted ascending                                                |
| `note x [0..10]'arp(\up)`       | `\up`           | `0 1 2 3 4 5 6 7 8 9 10`                   | 11            | Explicit; same as bare `'arp`                                   |
| `note x [0..10]'arp(\down)`     | `\down`         | `10 9 8 7 6 5 4 3 2 1 0`                   | 11            | Sorted descending                                               |
| `note x [0..10]'arp(\inward)`   | `\inward`       | `0 10 1 9 2 8 3 7 4 6 5`                   | 11            | Pincer outer→inner; odd N ends on single middle                 |
| `note x [0..10]'arp(\outward)`  | `\outward`      | `5 6 4 7 3 8 2 9 1 10 0`                   | 11            | Reverse of `\inward`                                            |
| `note x [0..10]'arp(\updown)`   | `\updown`       | `0 1 2 3 4 5 6 7 8 9 10 9 8 7 6 5 4 3 2 1` | 20            | Palindrome; **default length = 2×(N−1)**; no repeated endpoints |
| `note x [0..10]'arp(\converge)` | `\converge`     | same as `\inward`                          | 11            | Alias for `\inward`                                             |
| `note x [0..10]'arp(\diverge)`  | `\diverge`      | same as `\outward`                         | 11            | Alias for `\outward`                                            |

## Even-length input — `[0..9]` (N=10)

| Code Snippet                  | Algorithm  | Output (degrees)      | Notes                                             |
| ----------------------------- | ---------- | --------------------- | ------------------------------------------------- |
| `note x [0..9]'arp(\inward)`  | `\inward`  | `0 9 1 8 2 7 3 6 4 5` | Even N: ends on the two middle elements as a pair |
| `note x [0..9]'arp(\outward)` | `\outward` | `5 4 6 3 7 2 8 1 9 0` | Reverse of `\inward`; starts with middle pair     |

## Length override

| Code Snippet                    | Output                              | Notes                               |
| ------------------------------- | ----------------------------------- | ----------------------------------- |
| `note x [0..10]'arp(\down 16)`  | `10 9 8 7 6 5 4 3 2 1 0 10 9 8 7 6` | 16 values cycling `\down` traversal |
| `note x [0..10]'arp(\up 5)`     | `0 1 2 3 4`                         | First 5 values of `\up`             |
| `note x [0..10]'arp(\updown 5)` | `0 1 2 3 4`                         | First 5 values of updown traversal  |

## Duplicate removal

| Code Snippet                      | Deduped input                        | Output    | Notes                                      |
| --------------------------------- | ------------------------------------ | --------- | ------------------------------------------ |
| `note x [5 3 7 3 1]'arp`          | `[5 3 7 1]` (first-occurrence order) | `1 3 5 7` | `\up` sorts numerically; dedup before sort |
| `note x [5 3 7 3 1]'arp(\inward)` | `[5 3 7 1]` → sorted `[1 3 5 7]`     | `1 7 3 5` | Sort, then inward on deduplicated input    |

## Rests and edge cases

| Code Snippet             | Result                | Notes                                       |
| ------------------------ | --------------------- | ------------------------------------------- |
| `note x [0 _ 4 _ 8]'arp` | `[0 4 8]` arpeggiated | Rests filtered before arpeggiation          |
| `note x [_ _ _]'arp`     | One rest event        | All-rest input → single rest (silent cycle) |
| `note x [4]'arp`         | `[4]` (one event)     | Single element → no-op                      |

## Composition

| Code Snippet                | Result   | Notes                                                        |
| --------------------------- | -------- | ------------------------------------------------------------ |
| `note x [0..3]'arp'stut(2)` | 8 events | `'arp` produces 4-element traversal; `'stut(2)` doubles each |

## Error cases

| Code Snippet                | Failure Type   | Why                                                                               |
| --------------------------- | -------------- | --------------------------------------------------------------------------------- |
| `note x [0rand7'arp]`       | Semantic error | `'arp` is list-level — attach to the `[...]` list, not to a scalar element inside |
| `note x [0..5]'arp'shuf`    | Semantic error | Cannot combine `'arp` with `'shuf` — choose one traversal strategy                |
| `note x [0..5]'arp'pick`    | Semantic error | Cannot combine `'arp` with `'pick` — choose one traversal strategy                |
| `note x [0..5]'arp(\bogus)` | Semantic error | Unknown algorithm symbol                                                          |
| `note x [0..5]'arp(\up 0)`  | Semantic error | Length override must be a positive integer ≥ 1                                    |
| `note x [0..5]'arp(\up -3)` | Semantic error | Negative length override is not meaningful                                        |

---

# 26. **Sequence Shape Modifiers Truth Table**

`'rev`, `'mirror`, `'bounce` — transform the event array post-traversal. Applied after `'shuf`/`'pick`/`'arp` and before `'stut`.

## `'rev` — reverse

| Code Snippet           | Interpretation               | Evaluation                       | Result                                    |
| ---------------------- | ---------------------------- | -------------------------------- | ----------------------------------------- |
| `note x [1 2 3 4]'rev` | Reverse the 4-element array. | Array reversed: `[4 3 2 1]`.     | 4 events; beatOffsets 0, 0.25, 0.5, 0.75. |
| `note x [1 2 3]'rev`   | Reverse 3-element array.     | Array reversed: `[3 2 1]`.       | 3 events at degrees 3, 2, 1.              |
| `note x [5]'rev`       | Single-element — no-op.      | Reverse of length-1 is itself.   | 1 event at degree 5.                      |
| `note x [1~4]'rev`     | Random draw then reverse.    | Draws evaluated; array reversed. | This cycle's random values, reversed.     |

## `'mirror` — palindrome with repeated endpoints

| Code Snippet            | Interpretation                            | Evaluation                                                          | Result                             |
| ----------------------- | ----------------------------------------- | ------------------------------------------------------------------- | ---------------------------------- |
| `note x [1 2 3]'mirror` | Append reverse without its first element. | `[1 2 3]` + `[2 1]` = `[1 2 3 2 1]`. Natural length = `2N − 1` = 5. | 5 events at degrees 1, 2, 3, 2, 1. |
| `note x [1 2]'mirror`   | 2-element palindrome.                     | `[1 2]` + `[1]` = `[1 2 1]`. Natural length = `2N − 1` = 3.         | 3 events at degrees 1, 2, 1.       |
| `note x [5]'mirror`     | Single-element — no-op.                   | Reverse without first element is empty; result is `[5]`.            | 1 event at degree 5.               |

## `'bounce` — palindrome without repeated endpoints

| Code Snippet            | Interpretation                              | Evaluation                                                                                               | Result                          |
| ----------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `note x [1 2 3]'bounce` | Append reverse with both endpoints removed. | `[1 2 3]` + rev-without-first-and-last = `[1 2 3]` + `[2]` = `[1 2 3 2]`. Natural length = `2(N−1)` = 4. | 4 events at degrees 1, 2, 3, 2. |
| `note x [1 2]'bounce`   | 2-element bounce.                           | Reverse without both endpoints is empty; result = `[1 2]`. Natural length = 2.                           | 2 events at degrees 1, 2.       |
| `note x [5]'bounce`     | Single-element — no-op.                     | Nothing to append; result is `[5]`.                                                                      | 1 event at degree 5.            |

## Interaction with `'stut`

| Code Snippet                    | Interpretation                           | Evaluation                           | Result     |
| ------------------------------- | ---------------------------------------- | ------------------------------------ | ---------- |
| `note x [1 2 3]'mirror'stut(2)` | mirror first (5 elements), then stutter. | `[1 2 3 2 1]` → stut(2) → 10 events. | 10 events. |
| `note x [1 2 3]'bounce'stut(2)` | bounce first (4 elements), then stutter. | `[1 2 3 2]` → stut(2) → 8 events.    | 8 events.  |
| `note x [1 2 3 4]'rev'stut(2)`  | rev first (4 elements), then stutter.    | `[4 3 2 1]` → stut(2) → 8 events.    | 8 events.  |
