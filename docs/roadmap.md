# Flux roadmap

Target: a stable, playable instrument with complete core DSL, working defaults for all content types, and a discoverable UI.

`'stretch` (#38) is explicitly deferred to post-0.1.0.

---

## DSL completeness

Foundational changes first — later items depend on them.

1. **#36** Remove `absTimedList`, free `{}` brackets
2. **#37** `utf8{word}` generator _(depends on #36)_
3. **#31** Generator arithmetic with generator operands
4. **#26** Array range notation with optional step
5. **#28** Chord literal `<>`
6. **#29** `'spread` modifier _(depends on #28)_
7. **#34** `'arp` generator _(depends on #28)_
8. **#35** `'rev`, `'mirror`, `'bounce` sequence shape modifiers
9. **#40** `@buf` with generator expression

---

## UI and discoverability

1. **#23** Sample panel — view, add, rename loaded buffers
2. **#41** Context-aware autocomplete _(benefits from #45 docs being done first)_

---

## Stability and error handling

1. **#43** Error handling and feedback — non-fatal layer errors with visible reporting

---

## Documentation and examples

Order matters: reference docs feed into autocomplete hover hints and prefill examples.

1. **#45** Complete reference docs for all built-in generators, modifiers, decorators
2. **#44** Prefill editor with one working example per content type _(integration smoke test — do last)_
