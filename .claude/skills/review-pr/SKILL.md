---
name: review-pr
description: Flux-specific PR review. Runs the generic pr-review-toolkit first, then applies Flux quality gates — DSL consistency triad (spec ↔ truth tables ↔ code/tests), silent design decisions, spec change quality — and logs findings to .agent/logs/issue-N.md. Use whenever a PR is ready for review in the Flux project.
allowed-tools: Read, Grep, Glob, Edit, Write, Bash, Agent, AskUserQuestion, TodoWrite
---

# review-pr

Flux-specific PR review skill. Runs the generic review toolkit, then applies project quality gates that only a Flux-aware reviewer can check.

## Step 1: Identify the PR and issue

Determine the PR under review:

```bash
gh pr view --json number,title,body,headRefName,baseRefName
```

Extract the issue number from the PR body (`Closes #N`) or branch name (`issue<N>-…`). If the issue number cannot be determined, ask the user.

Read the issue body for later comparison:

```bash
gh issue view <N>
```

Store the issue number — it is used throughout.

## Step 2: Run the generic review toolkit

Invoke the `/pr-review-toolkit:review-pr` skill. Let it run to completion. Its output forms the baseline review — do not duplicate its checks.

## Step 3: Collect the diff

```bash
git diff $(git merge-base HEAD main)..HEAD
```

Also list changed files:

```bash
git diff --name-only $(git merge-base HEAD main)..HEAD
```

## Step 4: Flux quality gate — DSL consistency triad

This gate applies **only if any of these are true**:
- Files in `docs/` were changed (spec or truth tables)
- Files in `src/lib/lang/` were changed (parser, evaluator, etc.)
- Test files related to the DSL were changed

If none apply, skip to Step 5.

### 4a. Spec ↔ truth tables

Read `docs/DSL-spec.md` and `docs/DSL-truthtables.md`. For every behavioural change in the diff:

- **If the spec was changed:** verify that a corresponding truth table row was added, updated, or removed to match.
- **If a truth table row was changed:** verify that the spec narrative reflects the same semantics.
- **If neither was changed but implementation changed behaviour:** flag this — a behavioural change without spec/truth-table updates is always a finding.

Record each check result (pass/finding).

### 4b. Truth tables ↔ implementation/tests

For every truth table row that was added or modified:

- **Trace it to a test.** Search test files for a test case that exercises that exact row. The test should be identifiable by its input snippet or description. If no test exists, that is a finding.
- **Trace it to implementation.** Confirm the implementation handles the case described by the row. If the row describes a syntax error, confirm the parser rejects it. If it describes evaluation, confirm the evaluator produces the expected result.

Report explicit tracing: "Truth table row `[1 2]'shuf` → tested in `parser.svelte.spec.ts:L142` → implemented in `parser.ts:L380`". Missing links are findings.

### 4c. Implementation ↔ spec

For every implementation change in `src/lib/lang/`:

- Confirm the behaviour it implements is described in the spec.
- If the implementation introduces behaviour not in the spec, flag it as a finding ("implementation introduces undocumented behaviour").

## Step 5: Flux quality gate — no silent design decisions

Compare the PR's implementation against the issue body from Step 1.

- **Scope additions**: Does the PR implement anything the issue didn't ask for? Flag as finding.
- **Scope omissions**: Does the issue specify something the PR doesn't implement? Flag as finding.
- **Semantic divergence**: Does the PR interpret a requirement differently from the issue's examples or spec-change bullets? Flag as finding.

Each finding should quote the relevant issue text and the divergent code/test.

## Step 6: Flux quality gate — spec change quality

If `docs/DSL-spec.md` or `docs/DSL-truthtables.md` were modified, review the changes for:

- **Action verbs**: Spec change bullets should use action verbs (Add, Remove, Update, Generalise). Flag vague language.
- **Precision**: Changes must be specific enough that an implementer can act on them without guessing. Flag ambiguous phrasing.
- **Consistency**: New spec text must not contradict existing spec text elsewhere in the document. If contradictions exist, flag them and suggest resolutions.

## Step 7: Compile findings and log

### Classify findings

Each finding is one of:
- **Critical** — must fix before merge (e.g. spec/implementation mismatch, missing truth table coverage, undocumented behaviour)
- **Important** — should fix (e.g. scope divergence from issue, vague spec language)
- **Suggestion** — nice to have (e.g. minor wording improvements)

### Write to agent log

Ensure `.agent/logs/` exists:

```bash
mkdir -p .agent/logs
```

Append a `## Review` section to `.agent/logs/issue-<N>.md` (create the file if it doesn't exist). Format:

```markdown
## Review

**Date:** YYYY-MM-DD
**PR:** #<pr-number>
**Reviewer:** Claude (review-pr skill)

### Generic review (pr-review-toolkit)

<summary of generic review findings — 2-4 bullets>

### DSL consistency triad

| Check | Status | Notes |
|-------|--------|-------|
| Spec ↔ truth tables | PASS/FINDING | ... |
| Truth tables ↔ tests | PASS/FINDING | ... |
| Implementation ↔ spec | PASS/FINDING | ... |

<detailed tracing for each truth table row if applicable>

### Silent design decisions

<findings or "No divergences from issue spec detected.">

### Spec change quality

<findings or "No spec changes in this PR." or "Spec changes meet quality bar.">

### Summary

- **Critical:** N
- **Important:** N
- **Suggestions:** N

**Recommendation:** Approve / Request changes / Needs discussion
```

## Step 8: Notify and ask

Run the HA notify script:

```bash
bash notify.sh "PR review complete for issue #<N> — <recommendation>"
```

If the script fails (e.g. webhook not configured), log a warning but do not block.

Finally, use AskUserQuestion to present a summary of findings and the recommended action. The question should include:
- Total finding counts by severity
- The 1-3 most important findings (quoted)
- The recommended action

Options: **"Approve"** / **"Request changes"** / **"Needs discussion"**
