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
- **Examples** — truth-table-style input/output pairs showing the new behaviour. Format as a table or annotated code block. Must cover the happy path and at least one edge case.
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

Identify the issue type, then check every required section for that type. A section fails if it is absent, or if its content is too vague to act on — e.g. examples that don't cover edge cases, a reproduction that isn't self-contained, spec change bullets without action verbs, or implementation scope that names subsystems but not files.

For each failure, tell the user specifically what is missing and ask the resolving question directly.

**Do not proceed until all failures are resolved by the user.**

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
- **Dependency gaps** — if the new issue depends on an issue that is already closed or doesn't exist, flag it.

If the list is clean, proceed.

### Step 2: Get the issue content

The user will either point you to a section in `dev-notes/Issues.md` or provide the content directly. Read the relevant section.

### Step 3: Quality gate

Check every required section. For each failure, tell the user what is missing and ask the resolving question directly — don't just flag it and don't fill it in yourself.

Stop here and wait for the user's response. Only apply the mechanical additions listed above (file paths, dep section format, issue numbers). Everything else must come from the user before you proceed.

### Step 4: Show the user what will be filed

Present the issue title and body in the conversation before running `gh issue create`. Use AskUserQuestion to ask for confirmation if anything was changed or added during the quality gate step.

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
