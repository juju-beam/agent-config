---
description: Plan and implement a Linear ticket or branch — cost-tiered execution with a plan gate and verification loop
---
# Feature: $1

Option args (everything after the ticket/branch): `$@[2]`
- `auto` — skip the plan gate; implement all tasks without asking.
- `trivial` | `small` | `large` — effort tier (see below). Unspecified: use the ticket's `trivial`/`small`/`large` label from Linear if present, else `small`. A CLI tier arg always beats the label.
- `budget=<usd>` — spend ceiling in dollars for this run (orchestrator plus subagents, at list price), enforced by the `spend-breaker` extension (see **Spend guard**). Unspecified: `$5` for `trivial`, `$15` for `small`, `$40` for `large`.
- `base=<branch>` — stacked PR: the local branch this feature builds on. Sets the **feature base** (below); `start-ticket` forks the worktree from it. Unspecified: the repository default branch.

**Feature base:** resolve once in step 1 as the explicit `base=` value, else the repository default branch. Every comparison in this flow — branch-diff scope, reviewer diffs (`git diff <feature-base>...HEAD`), and the PR target (`gh pr create --base <feature-base>`) — uses this one branch. Never compare against or target the default branch when `base=` was given.

## Tiers

| | Research (step 2) | Implementation (step 5) | Review (step 7) | Visuals (step 8) |
|---|---|---|---|---|
| `trivial` | none — read the few relevant files yourself | `implementer` subagent, serial | none — verifier + tests are the gate; note "review skipped (trivial)" in the Linear summary comment, not the PR | `visuals` when the change is user-visible |
| `small` | scouts only if genuinely needed | `implementer` subagent, serial | `reviewer-sol` only; no merge step (nothing to merge) | `visuals` when the change is user-visible |
| `large` | full scout reconnaissance | `implementer` subagent, serial (fan-out only with disjoint file sets) | full: both reviewers + fable merge | `visuals` when the change is user-visible |

**Time and spend guards:** two resumable backstops are enforced without you doing anything. The `time-breaker` extension enforces the launcher's wall-clock allowance, and the `spend-breaker` extension enforces the dollar ceiling from `budget=`. Each warns at 75%, then soft-stops new work at 100% by blocking `task`, `edit`, `eval`, `grep`, `glob`, `lsp`, `browser` and `web_search` while leaving `bash`, `hub`, `todo`, `write` and `read` available for wrap-up; the current atomic operation is not hard-aborted. Treat either warning as the signal to get to a shippable state. When blocked, preserve todo and subagent state, report exactly what remains, tell the user which allowance was exhausted, and end your turn. The user resumes this same session with `/time +<duration>` or `/budget +<usd>`; the corresponding breaker prompts you to continue from the todo list.

All other steps (plan, gate, Linear plan comment, per-task commits, verifier, draft PR, inline comments, thread link) run in every tier.

**Context discipline (all tiers):** you are the long-lived, most expensive context in the run — everything you ingest is re-billed on every later turn. Consume summaries and references, never raw payloads: extract only the fields you need from the ticket (not the raw issue JSON), never re-read docs a scout already covered, and take subagent reports over their transcripts. Never run test suites or read large files yourself once implementation has started — delegate and consume the summary.

**No browser in this session (all tiers):** you never open a browser, start Storybook or a dev server, or run the app — not for a quick "does it render" check mid-implementation. Every browser interaction and visual verification goes to the `visuals` agent, which returns image paths and a one-line status. Those images are verification evidence for the Linear summary comment, never GitHub PR-description content. Browser work is exploratory by nature (permissions, timing, headless quirks) and has twice ballooned a parent context into dozens of probing turns; the isolation is what prevents that, and the agent's attempt caps are what stop the loop. A state `visuals` reports as not rendering is a finding for the PR or an inline comment — never something you go debug yourself in a browser.

## 1. Ticket

- If `$1` matches a Linear issue key (e.g. `ABC-123`), fetch the issue with `linear issue <KEY>` (bash; JSON) and keep only what you need: title, description, acceptance criteria, labels, and the issue's git `branchName` (the exact string Linear's **Copy git branch name** button yields — step 5 checks out that branch) — not the raw payload. Read comments only when the description points at them (`linear comments <KEY>`).
- Ticket has attached images (mocks/screenshots — `attachments[]` or `uploads.linear.app` links in the description): fetch each once with `linear download <url> <tmp-path>`, view it, write a precise textual spec into the plan (layout, spacing, colors, components, states), then drop the image from your working set — agents re-open it via its path only at implementation and final-verification checkpoints. Pixels must not ride the session context.
- Otherwise treat `$1` as a git branch: check it out if it exists, infer the issue key from the branch name and fetch it from Linear. If no key can be inferred, derive scope from the branch's diff against the feature base.
- If `linear` fails (no API key, issue not found), stop and report its error verbatim.
- Resolve the effort tier now (CLI arg > Linear label > `small`) and state it in one line. Resolve the feature base in the same line (`base=` > default branch); with `base=`, verify it is a local branch (`git rev-parse --verify refs/heads/<branch>`) and stop if it is not.
- Resolve the dollar ceiling now (CLI `budget=` > the tier default) and state it in the same line as the tier; the `spend-breaker` extension is already enforcing it. If — and only if — the `goal` tool is present, also call it with `op: "create"` and the objective `Complete /feature $1 end to end: approved plan, implementation, verification, review, and draft PR.` — no `token_budget`; the breaker owns the spend limit. A breaker block means: finish the current atomic operation, preserve todo and subagent state, report exactly what remains, and end your turn without marking the goal complete.

## 2. Research

- Scope per tier (see Tiers): `trivial` → read the relevant files yourself, no scouts; `small` → scouts only when genuinely needed; `large` → delegate broad reconnaissance to `scout` subagents (parallel when slices are independent) and read only what you must judge yourself.
- Identify affected modules, existing conventions, and the test coverage relevant to the ticket.

## 3. Plan

- Write a numbered task list. Each task: self-contained, independently testable, with exact files/symbols. Mark dependencies between tasks and which tasks are independent (parallelizable).
- Tag mechanical tasks — storybook stories, fixtures, snapshots, translations, boilerplate — as `[mech]`. These are dispatched to `sonic` in every tier and mode; they never run in this session and never go to a full implementer.
- Record the plan as the session todo list (todo tool, one entry per task). This is required: it is the resume anchor for `/feature-resume` and todo state survives compaction — do not keep the plan only as prose.
- Record the resolved feature base in the plan (one line, `base: <branch>`) so `/feature-resume` targets the same branch; the Linear plan comment in step 4 carries that line too.

## 4. Gate

- Unless `auto` was passed, present the plan and use the ask tool with these options:
  1. Implement all tasks
  2. Implement up to task N, then ask again (obtain N)
  3. Revise the plan (obtain feedback, return to step 3)
  4. Stop here — with an active goal, call `goal` with `op: "drop"` first; then report.
- With `auto`, proceed as if "implement all tasks" was chosen.
- Once the plan is confirmed (by the user, or implicitly via `auto`), post it to the Linear ticket as a new top-level comment — `linear comment <KEY> -` with the body on stdin (heredoc), written per `rule://agent-voice`: the full numbered task list, plus a one-line note when only tasks 1..N were approved. Keep the returned comment `id` — step 8 replies to this thread. Do this before implementing. If no ticket was resolved in step 1 (pure branch-diff mode), skip this and say so.

## 5. Implement

- If the working tree already has uncommitted changes that are not yours, stop and recommend an isolated run (`start-ticket` launches this flow in its own git worktree) — another flow or the developer may be mid-work here.
- Fresh worktree missing dependencies (no `node_modules`, venv, etc.): run the project's install step before implementing.
- Before the first edit, be on the ticket's Linear branch — the `branchName` kept in step 1, verbatim; never invent a name of your own. Already on it → nothing to do. Otherwise, in this order: it exists locally → `git switch <branchName>` (checked out in another worktree → stop and report); on a `start-ticket` scaffold branch (`omp/<ticket>`) → rename it in place, `git branch -m <branchName>`; on the feature base → `git switch -c <branchName>`. `$1` was a branch → stay on it as given. No ticket resolved → stay on the current branch.
- **Never implement in this session, any tier** — your context is the most expensive in the run and re-billed every turn, and staying out of the editor keeps the planning model holding the pen for triage, review and shipping. Dispatch one `implementer` subagent with the full ordered task list (minus `[mech]` tasks, which go to `sonic` — parallel to the implementer when files are disjoint, after it otherwise), the conventions to follow, and the visual spec; it works serially, commits per task, and runs targeted tests as it goes. For a trivial ticket that is one implementer with one task. For "up to task N": give it tasks 1..N; after the re-ask, message the same (idle) implementer via hub to continue — do not spawn a fresh one while it can be revived.
- **Parallel fan-out** (large only, rare): one implementer per task in a single batch, only when the plan declares a disjoint file set per task — no shared files, including lockfiles, barrel/index files, generated code, and shared configs. If any two tasks could plausibly touch the same file, use the single-implementer path instead.
- Commit after each completed plan task — one logical commit, terse conventional message referencing the task. This keeps the branch inspectable mid-run and gives rollback points.
- After an "up to task N" batch finishes, re-ask before continuing.

## 6. Verify

- When implementation is complete, dispatch the `verifier` agent.
- Act on its `status`:
  - `green` / `fixed` → proceed to review.
  - `substantial` → dispatch a fresh `implementer` whose task is the verifier's diagnosis + `fix_hint`, then re-run `verifier`.
  - `cannot-diagnose` → investigate yourself; fix directly or dispatch as appropriate, then re-run `verifier`.
- Cap the fix loop at 3 verifier rounds; after that stop and report residual failures instead of looping.

## 7. Review

- Scope per tier (see Tiers): `trivial` → skip this step entirely (verifier is the gate; note it in the Linear summary comment). `small` → dispatch `reviewer-sol` only; act on its findings directly (no merge step). `large` → the full flow below.
- Once the verifier is green, dispatch `reviewer-sol` and `reviewer-fable` in parallel — one batch, two items. The batch `context` must carry the ticket description and the approved plan verbatim; each task names the diff to review (`git diff <feature-base>...HEAD`, plus any commits made this session).
- **Merge via fable, not yourself**: message the still-idle `reviewer-fable` via hub with sol's findings list, asking for one merged, prioritized list — per finding: `fix-now` (with sonic-vs-implementer sizing), `defer-to-PR-comment`, or `drop`; dedupe overlaps; keep every `blocker`/`major`; resolve any contradiction between the two reviews in the same pass (its own diff context is still loaded — design-level calls are its to make). A contradiction whose resolution is too large for this PR: neither side silently wins — mark it `defer-to-PR-comment`; it becomes an inline comment, and a one-line tradeoff in the PR's **Why** if it bears on the original requirements. Do not pull contested code into your own context to re-judge the merged list; execute it as returned.
- Apply the `fix-now` items per fable's sizing — trivial → `sonic`, substantial → a fresh `implementer` with the finding + suggestion as its task — then re-run `verifier` (and only re-review the affected areas if a blocker forced a redesign).
- If both reviewers `approve` (or `approve-with-nits` with nothing worth fixing), proceed. One review round by default; do not loop reviews indefinitely.

## 8. Ship

- For a user-visible change, dispatch `visuals` with the story IDs or URLs, the states to capture, the viewport, the output directory `~/Documents/screenshots/` and the filename prefix `<ticket-key>-`; it appends a descriptive state name per image (`rule://agent-voice`, Screenshots). Use the returned images as verification evidence. When a Linear plan thread exists, upload them in one `bash` call looping `linear attach <KEY> <file> --title <state>` over every image, not one turn per file, and keep each printed `assetUrl` — the summary comment below embeds them. Never embed or link those images in the GitHub PR description. `visuals` returning `partial`/`failed` is not a reason to open a browser yourself: ship without the missing state and note it in text. Skip visual verification for changes with no user-visible surface; never fake or pad it.
- Commit all remaining work in logical commits with terse conventional messages (do not commit unrelated dirty files that predate this session).
- Read `skill://stacked-prs` now. Split the branch into a stack when its additions against the feature base exceed ~500 lines or the approved plan has two or more tasks a reviewer could accept on their own; otherwise ship one PR. Both paths rebase onto the freshly fetched feature base first, then push; then everything a human reads — PR bodies, inline comments, Linear replies — follows `rule://agent-voice` (read it now; its **PR descriptions** section is the body spec).
  - **Stack:** follow `/stack` steps 4–6 with `auto` (the plan gate already happened): layers along the approved plan tasks, bottom-up from `origin/<feature-base>`, the Linear branch name on the top layer, each layer verified at its tip by `verifier`; `gh stack rebase`, no `needsRebase`, `gh stack submit --auto`; then overwrite every title and body. Trunk is the feature base — with `base=`, `gh stack init --base <feature-base>`.
  - **Single PR:** `git fetch origin <feature-base>` and `git rebase origin/<feature-base>`; a conflicting rebase means one more `verifier` round before pushing. Push and open a **draft** PR with `gh pr create --draft --base <feature-base>`.
  - With `base=`, the feature base must already exist on GitHub (`git ls-remote --exit-code --heads origin <branch>`); if it does not, stop and report it — never push another worktree's branch to satisfy the PR target.
  - Title: `[<ticket-key>] <imperative summary>`; body opens `Fixes <ticket-key>` (stack: top PR only, `Part of <ticket-key>` below), two blank lines, attribution header.
  - `base=` given → the stacked-PR position line at the top, naming the base branch's PR number.
  - Plan approved only up to task N → a `Not in scope:` line naming what remains.
  - Bug ticket → **Steps to reproduce** from the ticket's report, `Before`/`After` from what the fix changes.
  - Never screenshots, image links or embeds in the description — they go to the Linear summary comment.
- After creating the PR(s), attach **inline comments** on the relevant diff lines for every unapplied reviewer finding, compromise taken, or spot needing human verification — one review per affected PR via `gh api repos/{owner}/{repo}/pulls/{number}/reviews` with `event: COMMENT` and a `comments[]` array (`path`, `line`, `side: RIGHT`); the findings' `file:line` locations map directly, in a stack to the layer that introduces the line. Each comment carries the attribution header and stands alone for a cold reader (`rule://agent-voice`).
- Post the **summary comment** as a reply in the plan comment thread from step 4 (`linear comment <KEY> --parent <plan-comment-id> -`, body on stdin), per `rule://agent-voice`: attribution header; the PR link — for a stack every PR link, bottom to top, one per line; a few bullets on what changed for the ticket reader (the change, not the process); then every screenshot embedded inline, `![<state>](<assetUrl>)` from the `linear attach` output, one per line. A state `visuals` could not capture gets one plain sentence instead of an image. No ticket thread (branch-diff mode) → skip and say so.
- If `gh` is unavailable or the push fails, stop and report the exact blocker — do not paste a diff as a substitute for a PR.

## 9. Report

Terse summary: ticket, plan outcome, files changed, verification result, review verdicts and applied findings, PR URL (a stack: every PR, bottom to top), anything left open. With an active goal, call `goal` with `op: "complete"` once every deliverable is complete and verified, before the final report.
