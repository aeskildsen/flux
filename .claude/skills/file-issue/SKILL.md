---
name: file-issue
description: Create a GitHub issue from a Flux DSL issue description. Use this skill whenever the user asks to file, create, register, or post a GitHub issue — whether from dev-notes/Issues.md, from a description in the conversation, or from scratch. Always use this skill rather than running `gh issue create` directly, because it applies the project's quality bar before filing.
---

# Create GitHub Issue

This skill creates a GitHub issue for the Flux project, applying a quality gate before filing.

## The core principle

Issues are formal steering documents — contracts between design and implementation. The user is responsible for the design decisions in an issue. The agent's role is to check, format, and file — not to write the issue. An issue that the agent wrote is not a valid issue, because it hasn't been decided by the person who owns the work.

This means: **if content is missing, ask — don't fill it in.** The only exceptions are purely mechanical additions that involve no design judgement (see below).

## Issue types and required sections

Identify the issue type first — it determines what sections are required.

### DSL feature or change

- **Summary** — what changes and why
- **Examples** — truth-table-style input/output pairs showing the new behaviour. Format as a table or annotated code block. The bar is not "happy path + one edge case" — it is **every case where an implementer would otherwise have to choose between readings**. If a design decision can go two ways and the issue doesn't pin it down, the implementer will pick, and their pick becomes de facto spec. Examples that leave decisions open are a quality failure. Common decisions that get missed: edge inputs (empty, single-element, n=0), asymmetric inputs (even vs. odd lengths), interaction with other modifiers, rest/symbol handling, error cases.
- **Spec changes required** — each change listed explicitly with an action verb (**Add**, **Remove**, **Update**, **Generalise**) and enough detail that an implementer knows exactly what to edit.
- **Implementation scope** — specific files and the rule, token, or function being changed.

### Bug report

- **Summary** — what is wrong and what was expected
- **Minimal reproduction** — the shortest `flux` snippet (or UI steps) that reliably triggers the bug. Must be self-contained.
- **Actual behaviour** — what happens
- **Expected behaviour** — what should happen instead
- **Implementation scope** — where in the code the fault likely lives (file + function if known; subsystem if not yet diagnosed)

### UI / non-DSL feature

- **Summary** — what changes and why
- **Examples** — concrete description of the desired behaviour: screenshots, ASCII mockups, or a step-by-step user interaction. Vague descriptions ("make it nicer") fail the bar.
- **Implementation scope** — specific files and components affected.

### Common optional sections (all types)

- **Dependencies** — if this issue must land after another (e.g. "Depends on #1")
- **Notes** — ordering constraints, cross-cutting concerns

## Quality gate

Identify the issue type, then run these checks in order. For each failure, tell the user specifically what is missing and ask the resolving question directly. **Do not proceed past any failure until the user has resolved it.**

### 1. Section completeness

Every required section for the issue type must be present. A section fails if it is absent, or if its content is too vague to act on — e.g. a reproduction that isn't self-contained, spec change bullets without action verbs, or implementation scope that names subsystems but not files.

### 2. Narrative–example consistency

For any claim the prose makes about behaviour, verify the example table demonstrates it and does not contradict it. Common failure mode: prose says "output length matches input" while the table shows a different length. When they disagree, flag it and ask which is authoritative — don't silently pick one. (Seen twice in recent Flux issues; the table is usually more considered than the prose.)

### 3. File-path existence

For every file named in **Implementation scope**, run `ls <path>` to verify it exists. A named file that has been deleted or renamed is a stale reference — flag it and ask whether to drop the bullet or update the path. Same for files referenced in **Spec changes required** (e.g. `docs/DSL-spec.md`).

### 4. Scope size (soft check, does not block)

If Implementation scope touches more than four files or crosses three subsystems (lexer, parser, evaluator, UI, docs each count as separate subsystems), surface this to the user: "This issue spans N files across M subsystems — is it worth splitting?" The user may confirm it's a coherent single change; don't block on the answer, just ensure they made the call deliberately.

## What the agent may add without asking

Only mechanical additions that require no design judgement:

- **File paths** — if the implementation scope lists a subsystem but no file, look up the correct file path and add it, noting the addition.
- **Explicit dependency section** — if a dependency is mentioned inline (e.g. buried in a Notes bullet), move it to a proper Dependencies section.
- **Issue numbers** — if a dependency is named by title, resolve it to a `#N` reference using `gh issue list`.

Everything else — spec change lists, implementation decisions, before/after examples, what to remove or add — must come from the user.

## Workflow

### Step 1: Check existing issues

Run `gh issue list --repo aeskildsen/flux --limit 50 --state open` before doing anything else. Scan the results for:

- **Duplicates** — an issue whose title or body covers the same change. If found, tell the user and stop.
- **Contradictions** — an open issue that does the opposite of what's being filed (e.g. an issue to add a feature that the new issue removes). Surface this to the user before proceeding; it may mean the existing issue needs to be closed first.
- **Dependency gaps** — for each issue the new one depends on, run `gh issue view <N> --json state,title` to verify it exists and check its state. Flag if closed, missing, or contradicts the new issue's premise.

If the list is clean, proceed.

### Step 2: Get the issue content

The user will either point you to a section in `dev-notes/Issues.md` or provide the content directly. Read the relevant section.

### Step 3: Quality gate

Run the four checks in the Quality gate section above, in order: section completeness → narrative–example consistency → file-path existence → scope size. Stop at each failure, tell the user what's wrong, and ask the resolving question directly. Don't fill it in yourself.

Only apply the mechanical additions listed in "What the agent may add without asking" (file paths, dep section format, issue numbers). Everything else must come from the user before you proceed.

### Step 4: Confirm with user

Don't re-display the entire issue body if the source material was already fine — that's noise. Instead:

- **If no changes were made during the quality gate**: state the title and confirm with AskUserQuestion ("File as-is?").
- **If anything was added, changed, or resolved**: show only the delta — what you added (e.g. "added file path `src/lib/lang/parser.ts` to Implementation scope"), what you changed (e.g. "resolved 'the step generator issue' → #31"), and the user's quality-gate answers folded in. Confirm with AskUserQuestion.

The user needs to review what *you* did, not re-read what they already wrote.

### Step 5: File it

```bash
gh issue create --repo aeskildsen/flux --title "..." --body "$(cat <<'EOF'
...
EOF
)"
```

Report the issue URL when done.

### Step 6: Remove from Issues.md

If the issue came from `dev-notes/Issues.md`, remove its section from that file now that it has a canonical home on GitHub. Remove from the opening `---` separator through to (but not including) the next `---` separator. The file should remain valid with the remaining issues intact.

## Issue body format

Use the sections from `dev-notes/Issues.md` as-is. The standard sections are:

- **Summary** — what and why
- **Syntax** (if the change is syntactic) — before/after examples in ```flux code blocks
- **Semantics** (if relevant)
- **Spec changes required** — bulleted list, each item starting with **Add**, **Remove**, **Update**, or **Generalise**
- **Implementation scope** — bulleted list with file paths and specific rule/token/function names
- **Dependencies** (if any)
- **Notes** (if any)

Omit sections that don't apply. Don't add sections that aren't in the source material unless they're needed to pass the quality gate.
