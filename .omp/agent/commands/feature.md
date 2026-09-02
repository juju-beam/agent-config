---
description: Plan and implement a Linear ticket or branch — cost-tiered execution with a plan gate and verification loop
---
# Feature: $1

Option args (everything after the ticket/branch): `$@[2]`
- `auto` — skip the plan gate; implement all tasks without asking.
- `opus` | `terra` — use `implementer-opus` / `implementer-terra` for subagent implementation instead of the default `implementer`.
- `trivial` | `small` | `large` — effort tier (see below). Unspecified: use the ticket's `trivial`/`small`/`large` label from Linear if present, else `small`. A CLI tier arg always beats the label.
- `budget=<N>[k|m]` — Goal Mode token ceiling for the orchestrator. Unspecified: `300k` for `trivial`, `800k` for `small`, `1.5m` for `large`.
- `base=<branch>` — stacked PR: the local branch this feature builds on. Sets the **feature base** (below); `start-ticket` forks the worktree from it. Unspecified: the repository default branch.

**Feature base:** resolve once in step 1 as the explicit `base=` value, else the repository default branch. Every comparison in this flow — branch-diff scope, reviewer diffs (`git diff <feature-base>...HEAD`), and the PR target (`gh pr create --base <feature-base>`) — uses this one branch. Never compare against or target the default branch when `base=` was given.

## Tiers

| | Research (step 2) | Implementation (step 5) | Review (step 7) | Visuals (step 8) |
|---|---|---|---|---|
| `trivial` | none — read the few relevant files yourself | in this session, serial (prewalk hands off at first edit) | none — verifier + tests are the gate; note "review skipped (trivial)" in the PR body | none |
| `small` | scouts only if genuinely needed | in this session, serial (prewalk hands off at first edit) | `reviewer-sol` only; no merge step (nothing to merge) | only if trivially available |
| `large` | full scout reconnaissance | **never in this session** — one `implementer` subagent works the task list serially (fan-out only with disjoint file sets); you stay orchestrator | full: both reviewers + fable merge | as specified in step 8 |

Budget defaults are deliberately tiered separately from model choice. Normalize `k`/`m` suffixes to a positive integer before calling `goal`; an explicit `budget=` always wins.

All other steps (plan, gate, Linear plan comment, per-task commits, verifier, draft PR, inline comments, thread link) run in every tier.

**Context discipline (all tiers):** you are the long-lived, most expensive context in the run — everything you ingest is re-billed on every later turn. Consume summaries and references, never raw payloads: extract only the fields you need from the ticket (not the raw issue JSON), never re-read docs a scout already covered, and take subagent reports over their transcripts. Never run test suites or read large files yourself once implementation has started — delegate and consume the summary.

## 1. Ticket

- If `$1` matches a Linear issue key (e.g. `ABC-123`), fetch the issue via the Linear MCP tools and keep only what you need: title, description, acceptance criteria, key comments — not the raw payload.
- Ticket has attached images (mocks/screenshots): view each once, write a precise textual spec into the plan (layout, spacing, colors, components, states), then drop the image from your working set — agents re-open it via its path/attachment only at implementation and final-verification checkpoints. Pixels must not ride the session context.
- Otherwise treat `$1` as a git branch: check it out if it exists, infer the issue key from the branch name and fetch it from Linear. If no key can be inferred, derive scope from the branch's diff against the feature base.
- If Linear tools are unavailable or the ticket cannot be found, stop and say so.
- Resolve the effort tier now (CLI arg > Linear label > `small`) and state it in one line. Resolve the feature base in the same line (`base=` > default branch); with `base=`, verify it is a local branch (`git rev-parse --verify refs/heads/<branch>`) and stop if it is not.
- Resolve the token ceiling now (CLI `budget=` > the tier default), normalize it to an integer, and call `goal` with `op: "create"`, objective `Complete /feature $1 end to end: approved plan, implementation, verification, review, and draft PR.`, and that `token_budget`. Goal Mode is the session-level spend guard: if it becomes `budget-limited`, do not start new work; finish the current atomic operation, preserve todo and subagent state, report exactly what remains, and stop. Do not mark the goal complete merely because its budget ran out.

## 2. Research

- Scope per tier (see Tiers): `trivial` → read the relevant files yourself, no scouts; `small` → scouts only when genuinely needed; `large` → delegate broad reconnaissance to `scout` subagents (parallel when slices are independent) and read only what you must judge yourself.
- Identify affected modules, existing conventions, and the test coverage relevant to the ticket.

## 3. Plan

- Write a numbered task list. Each task: self-contained, independently testable, with exact files/symbols. Mark dependencies between tasks and which tasks are independent (parallelizable).
- Tag mechanical tasks — storybook stories, fixtures, snapshots, translations, boilerplate — as `[mech]`. These are dispatched to `sonic` in every tier and mode; they never run in this session and never go to a full implementer.
- Record the plan as the session todo list (todo tool, one entry per task). This is required: the prewalk model hand-off only arms after a todo call, and todo state survives compaction — do not keep the plan only as prose.
- Record the resolved feature base in the plan (one line, `base: <branch>`) so `/feature-resume` targets the same branch; the Linear plan comment in step 4 carries that line too.

## 4. Gate

- Unless `auto` was passed, present the plan and use the ask tool with these options:
  1. Implement all tasks
  2. Implement up to task N, then ask again (obtain N)
  3. Revise the plan (obtain feedback, return to step 3)
  4. Stop here — call `goal` with `op: "drop"` before reporting.
- With `auto`, proceed as if "implement all tasks" was chosen.
- Once the plan is confirmed (by the user, or implicitly via `auto`), post it to the Linear ticket as a new top-level comment (`save_comment` with the issue id, no parent): the full numbered task list, plus a one-line note when only tasks 1..N were approved. Keep the returned comment id — step 8 replies to this thread. Do this before implementing. If no ticket was resolved in step 1 (pure branch-diff mode), skip this and say so.

## 5. Implement

- If the working tree already has uncommitted changes that are not yours, stop and recommend an isolated run (`start-ticket` launches this flow in its own git worktree) — another flow or the developer may be mid-work here.
- Fresh worktree missing dependencies (no `node_modules`, venv, etc.): run the project's install step before implementing.
- Before the first edit: if on the feature base (default branch, or the `base=` branch), create and switch to a feature branch — prefer the issue's suggested `branchName` from Linear (`get_issue`), else `<ticket-key>-<short-slug>`. If `$1` was a branch, you are already on it.
- **`trivial`/`small`: serial in this session** — implement tasks in order; the session hands off to the cheaper implement model at the first edit (prewalk), expected. Dispatch `[mech]` tasks to `sonic` instead of doing them inline.
- **`large`: never implement in this session** — your context is too expensive for the edit-test grind, and staying out of the editor keeps you on the planning model. Dispatch one `implementer` subagent with the full ordered task list (minus `[mech]` tasks, which go to `sonic` — parallel to the implementer when files are disjoint, after it otherwise), the conventions to follow, and the visual spec; it works serially, commits per task, and runs targeted tests as it goes. For "up to task N": give it tasks 1..N; after the re-ask, message the same (idle) implementer via hub to continue — do not spawn a fresh one while it can be revived. Use the opus/terra variant if that option arg was given.
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

- Scope per tier (see Tiers): `trivial` → skip this step entirely (verifier is the gate; note it in the PR body). `small` → dispatch `reviewer-sol` only; act on its findings directly (no merge step). `large` → the full flow below.
- Once the verifier is green, dispatch `reviewer-sol` and `reviewer-fable` in parallel — one batch, two items. The batch `context` must carry the ticket description and the approved plan verbatim; each task names the diff to review (`git diff <feature-base>...HEAD`, plus any commits made this session).
- **Merge via fable, not yourself**: message the still-idle `reviewer-fable` via hub with sol's findings list, asking for one merged, prioritized list — per finding: `fix-now` (with sonic-vs-implementer sizing), `defer-to-PR-comment`, or `drop`; dedupe overlaps; keep every `blocker`/`major`; resolve any contradiction between the two reviews in the same pass (its own diff context is still loaded — design-level calls are its to make). A contradiction whose resolution is too large for this PR: neither side silently wins — mark it `defer-to-PR-comment` for the "Needs attention" summary. Do not pull contested code into your own context to re-judge the merged list; execute it as returned.
- Apply the `fix-now` items per fable's sizing — trivial → `sonic`, substantial → a fresh `implementer` with the finding + suggestion as its task — then re-run `verifier` (and only re-review the affected areas if a blocker forced a redesign).
- If both reviewers `approve` (or `approve-with-nits` with nothing worth fixing), proceed. One review round by default; do not loop reviews indefinitely.

## 8. Ship

- Commit all remaining work in logical commits with terse conventional messages (do not commit unrelated dirty files that predate this session).
- Push the branch and open a **draft** PR with `gh pr create --draft --base <feature-base>`. With `base=`, the feature base must already exist on GitHub (`git ls-remote --exit-code --heads origin <branch>`); if it does not, stop and report it — never push another worktree's branch to satisfy the PR target. Title: `<ticket-key>: <imperative summary>`. Body structure, in order:
  1. **Visual summary first, where it adds signal.** User-visible change → screenshot: run the app, capture with the browser tool, compress (webp, ≤200KB), and **commit it to the PR branch** under `.github/pr-assets/<ticket-key>/` — embed with the repo-relative path so GitHub renders it. Never embed Linear attachment URLs in the PR body: GitHub proxies images through Camo, which fetches anonymously and gets a 401 from Linear's signed URLs. Also upload the screenshot to the Linear plan thread (attachment upload) so the ticket carries the visual record. Backend, infra, or architectural change → a Mermaid diagram in the body (GitHub renders it natively) showing the changed flow/structure — the delta, not the whole system. Skip visuals for trivial changes; never fake or pad one.
  2. **Ticket reference** — `Fixes <ticket-key>` on its own line (Linear/GitHub auto-link).
  3. **Highlights** — terse, high-level bullets: what changed and why. The PR body describes the **change, not the process**: no verification/test-pass reports (passing checks are the baseline, CI shows them), no review verdicts, no agent/workflow implementation details. Anything a reviewer must actually weigh goes as an inline comment or in "Needs attention" — never as a status line in Highlights.
  4. **Needs attention** — only when non-empty, and only the important items: a high-level summary of issues that genuinely need a developer's judgment (architectural choices with cross-cutting impact, risky compromises). Details live in the inline comments below — do not duplicate them here; minor items belong inline only.
- After creating the PR, attach **inline comments** on the relevant diff lines for every unapplied reviewer finding, compromise taken, or spot needing human verification — one review via `gh api repos/{owner}/{repo}/pulls/{number}/reviews` with `event: COMMENT` and a `comments[]` array (`path`, `line`, `side: RIGHT`); the findings' `file:line` locations map directly.
- **Inline comment style — plain English for a cold reader.** Every comment opens with an attribution one-liner naming the model writing it — these comments must never read as authored by the developer personally: `*🤖 <model-id> (agent):*` followed by a blank line. Then assume the reader knows nothing about the ticket, this part of the codebase, or how the change was produced. Each comment stands alone: one sentence of context (what this code does), then the concern or thing to check and why it matters, then the concrete suggestion if one exists. No other workflow or agent jargon — never "human verification requested", "reviewer-x found", "fix-now", "passed browser checks"; instead of citing checks that ran, state the residual doubt plainly. E.g.:

  > *🤖 gpt-5.6-sol (agent):*
  >
  > This caps the panel height so the submit button stays visible on short screens.
  >
  > Tested at 1024×720, but worth a quick look on a real small laptop. If scrolling feels cramped, loosen this value here rather than changing the shared layout component.
- **Let the writing breathe** — in everything a human reads (PR body, inline comments, Linear comments): short sentences, a blank line between context and concern, bullets for more than two parallel items, code formatting for identifiers. Never a single dense wall of prose.
- Post the PR URL as a reply in the plan comment thread from step 4 (`save_comment` with the issue id and the plan comment id as parent), one line: PR link + one-sentence status. No ticket thread (branch-diff mode) → skip and say so.
- If `gh` is unavailable or the push fails, stop and report the exact blocker — do not paste a diff as a substitute for a PR.

## 9. Report

Terse summary: ticket, plan outcome, files changed, verification result, review verdicts and applied findings, PR URL, anything left open. Once every deliverable is complete and verified, call `goal` with `op: "complete"` before the final report.
