---
name: handle-issue
description: Full issue-to-PR cycle for the Flux project. Use this skill whenever the user wants to pick up the next GitHub issue, work on an issue, do the next ticket, or ship something from the backlog — even if they just say "what's next?" or "let's work on something". Handles everything: pulling main, selecting the lowest-numbered open issue, branching, implementing via TDD, committing, and opening a PR.
allowed-tools: Read, Grep, Glob, Edit, Write, Bash, AskUserQuestion, TodoWrite
---

# handle-issue

Automates the full cycle from "what's next?" to an open PR. Follow each step in order — don't skip ahead.

## Step 1: Sync main

```bash
git checkout main && git pull
```

If there are uncommitted changes that block the checkout, stop and tell the user before doing anything destructive.

## Step 2: Select the issue

```bash
gh issue list --repo aeskildsen/flux --state open --limit 50
```

Pick the issue with the **lowest number**. Read its full body:

```bash
gh issue view <N>
```

## Step 3: Confirm with the user

Show the issue number and title, then use AskUserQuestion to ge t confirmation:

> "Ready to work on #N — [title]?"

Options: **"Yes, work on this"** / **"Pick a different issue"**.

If they pick a different one, ask which number and run `gh issue view <N>` for that one instead.

## Step 4: Check out a branch

Branch name is always something like `issue7-reverse-generator` for issue #7.

```bash
git checkout -b issue<N>-<short-description>
```

## Step 5: Implement with TDD

Invoke `/tdd`, passing the full issue title and body as context so it starts with complete information. The `/tdd` skill owns everything from spec consultation through a passing test suite — don't duplicate its steps here.

`/tdd` must leave both of these passing before it hands back:

```bash
pnpm check
pnpm test
```

Do not proceed to step 6 if either fails.

## Step 6: Ask before committing

Ask the user using AskUserQuestion:

> "Implementation done and tests passing. Ready to commit and open a PR?"

Options: **"Yes, commit and PR"** / **"Not yet"**.

If they say not yet, stop here. The branch is local — they can continue manually.

## Step 7: Commit, push, open PR

### Commit

Read the last 5 commits to match the repo's style:

```bash
git log --oneline -5
```

Stage all modified tracked files (be specific — don't `git add .` blindly):

```bash
git diff --name-only
```

Commit message format follows conventional commits: `feat(scope): description (#N)` (or `fix` instead of feat if issue is a bug report). Derive `scope` from the primary files changed (e.g. `parser`, `evaluator`, `lang`, `ui`). Keep the subject line under 72 characters. Add the co-author trailer:

```
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```

### Push

```bash
git push -u origin i<N>
```

### PR

Read recent merged PRs to match body style:

```bash
gh pr list --repo aeskildsen/flux --state merged --limit 3
```

Create the PR:

```bash
gh pr create --title "feat(scope): description (#N)" --body "$(cat <<'EOF'
Closes #N

## Summary
- <bullet>
- <bullet>

Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

`Closes #N` must be present — it tells GitHub to auto-close the issue when the PR merges.

## Step 8: Report

Print the PR URL and the issue it closes.
