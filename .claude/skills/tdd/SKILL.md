---
name: tdd
description: TDD workflow for fixing bugs or implementing new features in the Flux DSL — spec-first, test-first, then implement
allowed-tools: Read, Grep, Glob, Edit, Write, Bash, AskUserQuestion, TodoWrite
---

# tdd

## Instructions

Follow this workflow for every bug fix or new feature. Do not skip steps.

### 1. Consult the spec

Read the relevant files in `docs/` — especially `docs/DSL-spec.md` — to understand the intended behaviour and syntax. The spec is the single source of truth. Do not infer behaviour from the codebase. If you find inconcgruencies between spec and codebase, flag them for the user.

### 2. Clarify intent before proceeding

Language design is full of ambiguity. Use `AskUserQuestion` liberally to confirm the owner's intent before writing tests or code. It is better to ask than to assume. If there is any uncertainty about edge cases, error handling, or syntax, ask now.

### 3. Update the spec if needed

If the bug or feature reveals a gap or ambiguity in the spec, refine `docs/DSL-spec.md` first — before touching tests or implementation. The spec change should be agreed with the user.

### 4. Write or refine tests first

- Identify existing tests related to the change (look in `src/lib/lang/`)
- Add or adjust tests so they **fail** for the bug / unimplemented feature
- Run `pnpm vitest run <test-file>` to confirm the tests fail as expected

### 5. Implement

Fix the bug or build the feature. Run tests repeatedly until all pass:

```bash
pnpm vitest run <test-file>
```

### 6. Type-check and run full test suite

```bash
pnpm check
pnpm test
```

Both must pass before handing off to the user.
