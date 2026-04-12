---
name: run-roadmap
description: Autonomously runs through the roadmap issues in order, implementing each with TDD and opening a PR, pausing only for design questions and dependency checkpoints. Use when ready to start working through the roadmap.
allowed-tools: Read, Grep, Glob, Edit, Write, Bash, Agent, AskUserQuestion, TodoWrite
---

# run-roadmap

Orchestrates the Flux roadmap end-to-end. Reads the roadmap, resolves the dependency graph, and processes each issue in order by delegating to two specialized agents: `issue-handler` (implements and opens a PR) and `pr-reviewer` (reviews the PR and fixes critical issues). The user only gets asked questions when an agent hits genuine ambiguity — otherwise everything runs hands-off.

## Arguments

The user may specify a limit on how many issues to process in this run, e.g. "run the first issue" or "do the next 3 issues". If a limit is given, stop after that many issues are completed (or attempted) and print the progress summary. If no limit is given, process the entire roadmap.

## Step 1: Parse the roadmap and build the dependency graph

Read `docs/roadmap.md`. Extract every issue number and its dependencies. The roadmap encodes dependencies two ways:

- **Explicit**: "(depends on #28)" in the issue description
- **Implicit by ordering**: Within a section, earlier issues are foundational for later ones — but only within the same section. Issues across sections (DSL, UI, Stability, Docs) are independent unless explicitly linked.
- **Special markers**: "do last" means the issue depends on all other issues in the roadmap. "benefits from" is a soft dependency — treat it the same as "depends on" for ordering purposes.

Build an in-memory representation. Example from the current roadmap:

```
#36 → []                    (no deps)
#37 → [#36]                 (explicit)
#31 → []
#26 → []
#28 → []
#29 → [#28]                 (explicit)
#34 → [#28]                 (explicit)
#35 → []
#40 → []
#23 → []
#41 → [#45]                 (explicit: "benefits from #45")
#43 → []
#45 → []
#44 → [all others]          (roadmap says "do last")
```

Persist the dependency graph and each issue's status (pending, in-progress, done, skipped) to `.agent/logs/roadmap-progress.md`. On startup, always check if this file already exists — if it does, read it and resume from where the previous run left off rather than starting from scratch. Use the in-conversation todo list as well for live visibility, but the file is the durable source of truth.

## Step 2: Pick the next issue

Select the next issue to work on using these rules, in priority order:

1. **All dependencies satisfied** — every issue it depends on must be in the "done" state (PR merged into main).
2. **Roadmap order** — among eligible issues, pick the one that appears first in the roadmap. The roadmap sections are ordered intentionally: DSL completeness first, then UI, stability, docs.

If no issue is eligible (all remaining issues are blocked), stop and tell the user what's blocking progress.

## Step 3: Check if the issue is already closed

Before spawning work, check the issue's current state:

```bash
gh issue view <N> --json state
```

If the issue is already closed, mark it as done and move to the next one.

Also check if a PR already exists for it:

```bash
gh pr list --search "Closes #<N>" --state open --json number,title
```

If an open PR exists, skip to Step 5 (review) instead of re-implementing.

## Step 4: Implement — spawn the issue-handler agent

Delegate implementation to the `issue-handler` agent. Use the Agent tool with `subagent_type: "issue-handler"`:

```
Handle issue #<N> for the Flux project.

Context: This is part of the v0.1.0 roadmap. The following prerequisite issues have already been completed and merged: <list completed issue numbers and their PR numbers>.

Implement the issue end-to-end — read it, plan, implement with TDD, and open a PR. If you have ambiguous questions, batch them into a single AskUserQuestion call.
```

**Important considerations:**
- The issue-handler checks out a normal local branch — no worktree isolation needed.
- Wait for the agent to complete before proceeding. It will return the PR number in its output.
- If the agent fails or reports an error, log it and ask the user whether to retry or skip.

Extract the PR number from the agent's response. If you can't find it, query GitHub:

```bash
gh pr list --search "Closes #<N>" --state open --json number --jq '.[0].number'
```

## Step 5: Review — spawn the pr-reviewer agent

Once the PR exists, delegate review to the `pr-reviewer` agent:

```
Review PR #<PR> for the Flux project. This PR implements issue #<N>.

Context: This is part of the v0.1.0 roadmap. Check the PR for correctness, test coverage, DSL consistency (if applicable), and adherence to the issue scope. Fix any critical or important issues directly. Log findings to .agent/logs/issue-<N>.md.
```

Wait for the reviewer to complete. It will classify the outcome as PASSED, PASSED WITH FIXES, or NEEDS USER INPUT.

- **PASSED / PASSED WITH FIXES**: Proceed to merge check (Step 5b).
- **NEEDS USER INPUT**: The reviewer will have already asked the user via AskUserQuestion. After the user responds, the reviewer handles it. Once resolved, proceed to merge check (Step 5b).

### Step 5b: Merge the PR

After the review passes, merge the PR so that subsequent issues build on top of the completed work:

```bash
gh pr merge <PR> --squash
```

This merges remotely, switches to main, and pulls — all in one step. If it fails (e.g. merge conflicts, branch protection rules), ask the user for help — do not force-merge. Mark the issue as done only after a successful merge.

## Step 6: Record progress and continue

After each issue+review cycle completes:

1. Update the todo list — mark the issue as completed.
2. Log a summary line to `.agent/logs/roadmap-progress.md`:

```markdown
| #<N> | <title> | PR #<PR> | <status> | <date> |
```

3. Return to Step 2 to pick the next issue.

## Step 7: Roadmap complete

When all issues are processed, print a final summary:

- Total issues processed
- Issues completed successfully
- Issues that needed user input
- Issues skipped or deferred
- Link to `.agent/logs/roadmap-progress.md`

Run the notify script:
```bash
.agent/notify.sh "Roadmap v0.1.0 complete — all issues processed"
```

## Handling failures and edge cases

- **Agent timeout or crash**: Log the failure, notify the user, and ask whether to retry or skip.
- **Merge conflicts**: If the issue-handler can't merge cleanly (because a previous PR changed overlapping code), it should rebase on main. If that fails, notify the user.
- **Flaky tests**: If tests pass on retry, proceed. If they fail consistently, log it and ask the user.
- **Issue already has a PR**: Skip implementation, go straight to review.
- **Issue is closed**: Skip entirely, mark as done.
- **Circular dependencies**: Should not happen with a well-formed roadmap, but if detected, stop and report.
