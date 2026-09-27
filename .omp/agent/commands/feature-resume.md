---
description: Resume an interrupted /feature session without losing todo or subagent progress
---
# Resume Feature: $1

Option args (everything after the ticket/branch): `$@[2]`
- `budget=<usd>` — dollar ceiling for this resumed process, enforced by the `spend-breaker` extension. Unspecified: `start-ticket` re-applies the tier default. Either way the allowance is fresh: the breaker counts spend from the moment this process attached, not from the start of the transcript.
- `base=<branch>` — must equal the feature base recorded in the persisted plan; a mismatch stops the resume. Never changes the base of an existing session.

This command runs only in the existing session selected by `start-ticket $1 resume`. Never repeat ticket research, planning, completed todo items, or completed agent work.

1. The **todo list is the resume anchor**, not goal state: read it and continue at the earliest unfinished item. Completed items stay completed. Nothing to resume (no todo list and no branch commits from a prior run) → stop and say this is not a resumable `/feature` session.
2. The `spend-breaker` and `time-breaker` extensions enforce fresh allowances for this resumed process. Each warns at 75%, then blocks new work tools at 100% while leaving `bash`/`hub`/`todo`/`write`/`read` available for wrap-up; neither hard-aborts the current atomic operation. If either blocks, preserve todo and subagent state, report exactly what remains, tell the user which allowance was exhausted, and end your turn. The user raises it in this session with `/budget +<usd>` or `/time +<duration>`, and the breaker prompts you to continue. Goal Mode is separate and TUI-only, so a session launched straight into `/feature` has no `goal` tool and no goal to restore. Only when the tool is present: call it with `op: "get"`; status paused → `resume`; status `budget-limited` → `drop` and `create` again with the retained objective and no `token_budget`; status active → leave it unchanged.

   No `goal` tool: say `goal mode unavailable (TUI-only) — resuming from todo state` once and carry on; the time and spend breakers are the guards.
3. Recover the feature base from the persisted plan's `base: <branch>` line: that branch is the target for reviewer diffs and `gh pr create --base`. If an explicit `base=` was passed and differs, stop and report both values. A plan without a `base:` line predates this option — use the repository default branch.
4. Reuse any idle or parked implementer through `hub send`; do not spawn a replacement merely because the parent session stopped. If an agent was terminally aborted, start a replacement with the remaining work and the prior agent's report.
5. Continue the original `/feature` workflow through verification, review, shipping, and reporting. If either renewed allowance is exhausted, wrap up with exact remaining work and leave the goal incomplete. With an active goal, call `goal` with `op: "complete"` only after every deliverable is complete and verified, before the final report.
