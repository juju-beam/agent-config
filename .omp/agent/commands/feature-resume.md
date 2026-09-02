---
description: Resume a budget-limited /feature session without losing todo or subagent progress
---
# Resume Feature: $1

Option args (everything after the ticket/branch): `$@[2]`
- `budget=<N>[k|m]` — new Goal Mode token allowance. Unspecified: reuse the previous ceiling as an additional allowance when it was exhausted.
- `base=<branch>` — must equal the feature base recorded in the persisted plan; a mismatch stops the resume. Never changes the base of an existing session.

This command runs only in the existing session selected by `start-ticket $1 resume`. Never repeat ticket research, planning, completed todo items, or completed agent work.

1. Call `goal` with `op: "get"` and retain its objective, status, and prior token budget.
2. If no goal exists, stop: this is not a resumable `/feature` session.
3. Resolve an explicit `budget=` to a positive integer. Then:
   - Explicit budget: `drop` the current goal and `create` it again with the retained objective and the explicit `token_budget`. This resets accounting and grants that additional allowance.
   - No explicit budget and status `budget-limited`: `drop` and `create` the goal again with the retained objective and previous `token_budget`, granting one more equal allowance.
   - No explicit budget and status paused: call `resume`.
   - No explicit budget and status active: leave the goal unchanged.
4. Read the persisted todo list. Continue at the earliest unfinished item. Completed items remain completed.
5. Recover the feature base from the persisted plan's `base: <branch>` line: that branch is the target for reviewer diffs and `gh pr create --base`. If an explicit `base=` was passed and differs, stop and report both values. A plan without a `base:` line predates this option — use the repository default branch.
6. Reuse any idle or parked implementer through `hub send`; do not spawn a replacement merely because the parent session stopped. If an agent was terminally aborted, start a replacement with the remaining work and the prior agent's report.
7. Continue the original `/feature` workflow through verification, review, shipping, and reporting. If the renewed ceiling is reached, wrap up with exact remaining work and leave the goal incomplete. Only after every deliverable is complete and verified, call `goal` with `op: "complete"` before the final report.
