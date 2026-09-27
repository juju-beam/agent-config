---
description: Split a branch or PR into a stack of small self-contained PRs with gh stack — layer-plan gate, rebase onto the fresh base, agent-voice titles and bodies
---
# Stack: $1

`$1` is a branch name, a PR number or URL, or empty for the current branch. Option args (everything after it): `$@[2]`
- `base=<branch>` — the trunk the stack lands on. Unspecified: the base of `$1`'s open PR if it has one, else the repository default branch.
- `key=<ABC-123>` — ticket key when it cannot be inferred from the branch name or the PR body.
- `auto` — skip the layer-plan gate.

Read `skill://stacked-prs` (the judgement: layers, order, size, rebase, bodies), `skill://gh-stack` (CLI mechanics and its non-interactive table), and `rule://agent-voice` before the first command. Every `gh stack` call uses the non-interactive form from that table; never a bare `submit`, `add`, `switch` or `modify`.

## 1. Resolve

- Source: a PR → `gh pr view $1 --json number,headRefName,baseRefName,title,body,isDraft`; a branch → as given; empty → the current branch. Trunk per `base=` precedence above. Ticket key: `key=`, else the branch name, else a `Fixes`/`Part of` line in the PR body. Say all three in one line.
- The working tree must be clean and not mid-rebase; otherwise stop and say what is in the way. `git fetch origin <trunk> <source>`; work from `origin/<trunk>` and the source tip.
- `gh stack view --json` exit 0 on the source branch means a stack already exists: report it and stop — use `/stack` on fresh work, or restructure by hand.

## 2. Plan

- `git log --oneline origin/<trunk>..<source>` and `git diff --shortstat origin/<trunk>...<source>`. Under ~500 additions and one concern → say a single PR is right and stop.
- If the branch belongs to a `/feature` run (session todo list or a Linear plan comment), split along its plan tasks first; otherwise derive layers from the diff. Apply the layer rules from the skill.
- Present the plan bottom to top: `k. <branch> — <one-sentence purpose> — <commits or paths> — ~<additions> added — stands on <k-1>`. Name anything in the source that will not be in the top layer.

## 3. Gate

Unless `auto` was passed, use the ask tool: 1. Build this stack; 2. Revise the plan (obtain feedback, return to step 2); 3. Stop.

## 4. Build and verify

- Per the skill's **Slicing an existing branch**: layer branches bottom-up from `origin/<trunk>`, the source branch name on the top layer, commit per layer with terse conventional messages, `gh stack init <bottom>` then `gh stack add <next>` in order (or `gh stack init <b1> <b2> …` to adopt branches already built).
- Verify each layer at its tip before building the one above — the project's build and the tests touching that layer. In a `/feature` session delegate to `verifier`; otherwise run them yourself with quiet reporters.
- The top tree equals the source tree, or every remaining difference is intentional and goes in the report.

## 5. Rebase and push

Per the skill's **Rebase onto the latest base before every push**: `git fetch origin <trunk>`, `gh stack rebase`, resolve exit 3 with `--continue`, re-verify anything the rebase touched, confirm `gh stack view --json` shows no `needsRebase`, then `gh stack submit --auto` (draft PRs; an existing PR on the top branch keeps its number and gets its base moved). Stop and report verbatim on any other non-zero exit.

## 6. Titles and bodies

Overwrite every PR, bottom to top, per the skill's **Title and body pass**: `gh pr edit <n> --title "[<key>] …" --body-file -`. `Fixes <key>` on the top PR only, `Part of <key>` below; the position line; What/Why in plain full sentences, three bullets or fewer where possible, never more than five.

## 7. Report

`gh stack view --json` once more for the final state. Report bottom to top: branch, PR URL, added lines, purpose; differences from the source; layers over the size rule and why. With a ticket key, post one Linear comment listing the PRs in order (`linear comment <KEY> -`, reply into the plan thread when one exists), per `rule://agent-voice`.
