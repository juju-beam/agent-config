---
description: Research a Linear ticket or question against the codebase — findings report to the Linear thread, no code changes
---
# Investigate: $1

Read-only engagement. You change no files, create no branches, open no PRs.

## 1. Subject

- If `$1` matches a Linear issue key, fetch the issue with `linear issue <KEY>` and its thread with `linear comments <KEY>` (bash; JSON); download any referenced images once via `linear download <url> <tmp-path>`.
- Otherwise treat `$ARGUMENTS` as a free-form research question about this codebase.

## 2. Research

- Decompose into independent slices and dispatch `scout` subagents in parallel; read yourself only what you must judge directly (they are cheaper readers than you).
- Chase the question to ground truth: actual code paths, configs, tests, and git history — not plausible guesses. Distinguish observed facts from inference explicitly.

## 3. Report

- Synthesize a terse findings report: the question, the answer, evidence (files/symbols/commits), open unknowns, and — when the subject is a ticket — a recommended approach and rough scope (candidate effort tier: trivial/small/large) for a later `/feature` run.
- Ticket subject → post the report as a new top-level comment on the Linear issue (`linear comment <KEY> -`, body on stdin), written per `rule://agent-voice`. Free-form subject → deliver the report in the session only.
- Do not create tickets, edit ticket state, or modify the repo.
