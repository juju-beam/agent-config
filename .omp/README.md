# omp config — setup

Personal defaults for [oh-my-pi](https://github.com/can1357/oh-my-pi).
Strategy: Fable orchestrates; OpenAI (Codex subscription) executes, with the
other family as backup for every role; tests are the safety net.

## Layout

```
.omp/agent/
├── config.yml            model roles + Claude/OpenAI backups, scout/sonic overrides, ast_grep + subagent LSP on
├── lsp.json              language servers: ruby-lsp + tsserver + eslint; solargraph/rubocop/tailwind off
├── (no mcp.json)         Linear goes through bin/linear — see "Linear" below
├── AGENTS.md             one-line pointer to skill://structural-search (parent/interactive sessions)
├── skills/
│   ├── structural-search/  lsp vs ast_grep vs grep by question type; autoloaded into every code agent
│   ├── ast-grep-rails/     verified ast_grep patterns for Rails + React, loaded on demand
│   ├── stacked-prs/        how to cut a branch or plan into a stack of ≤500-line PRs and what each PR says
│   └── gh-stack/           upstream github/gh-stack CLI skill, installed by gh (see "Stacked PRs")
├── commands/
│   ├── feature.md        /feature <ticket|branch> [tier] [auto] [model] [budget=<usd>]
│   ├── feature-resume.md resume the persisted /feature todo and agent state
│   ├── stack.md          /stack [branch|PR] [base=<branch>] [key=<ABC-123>] [auto] — split into a gh stack
│   └── investigate.md    /investigate <ticket|question> — research only, no code
├── extensions/
│   ├── spend-breaker.js  dollar circuit-breaker for the parent session (/budget)
│   └── time-breaker.js   resumable wall-clock breaker for the parent session (/time)
└── agents/
    ├── implementer.md        one planned task, self-tests (sol → opus)
    ├── verifier.md           full suite + linters; diagnoses; fixes trivia (terra → luna)
    ├── reviewer-sol.md       implementation-level review (read-only)
    ├── reviewer-fable.md     design-level review + findings merge (read-only)
    ├── scout.md              shadows the bundled scout: adds lsp + ast_grep (luna)
    └── visuals.md            the only browser agent: screenshots, visual checks (luna)
```

## Install

Per-item symlinks into `~/.omp/agent/` — never link the whole directory:
`~/.omp` and `~/.omp/agent` hold runtime state and credentials (`agent.db`,
`sessions/`, auth store, `logs/`) that must stay out of this repo.

From the **repo root**:

```sh
mkdir -p ~/.omp/agent
for f in config.yml lsp.json AGENTS.md commands agents extensions skills; do
  ln -sfn "$PWD/.omp/agent/$f" ~/.omp/agent/"$f"
done
```

Idempotent (`-sfn` replaces stale links after a `git pull`). If the machine
already ran omp, move any pre-existing real file/dir aside first, e.g.
`mv ~/.omp/agent/config.yml ~/.omp/agent/config.yml.bak`.

Then, once per machine:

```
omp
  /login anthropic        # Claude subscription (fable/sonnet/haiku/opus)
  /login openai-codex     # ChatGPT subscription (sol/luna/terra) — device flow for headless
```

Put `bin/` on `PATH` — the flows call `linear` and `start-ticket` by name:

```sh
export PATH="$HOME/dev/repos/agent-config/bin:$PATH"
```

### Linear

`bin/linear` wraps the four Linear operations the flows use — `issue`,
`comments`, `comment`, `attach`, plus `download` for ticket images — over
the GraphQL API with a personal API key (Linear → Settings → Security &
access → API keys). Store it once:

```sh
security add-generic-password -a "$USER" -s linear-api-key -w '<key>'   # or export LINEAR_API_KEY
```

Why a script rather than Linear's MCP server: the MCP server advertises 76
tools, omp mirrors all of them into the parent's prompt and, having no
per-tool filter, proxies every one into every subagent as well — about
16 KB of each subagent's system prompt on every turn, for tools only the
parent ever calls. The script costs nothing until invoked, is reachable only
through `bash`, and makes "Linear stays parent-only" a property of the flow
rather than a hope. If omp grows an MCP tool allowlist, the trade-off is
worth revisiting for `get_issue`'s richer formatting; nothing else is lost.

Language servers, once per machine. Ruby's come with the mise-managed Ruby
(`gem install ruby-lsp` if `mise where ruby` lacks `bin/ruby-lsp`); the
TypeScript and ESLint servers are global npm packages so no shared repo has
to carry them:

```sh
npm i -g typescript-language-server vscode-langservers-extracted
```

`lsp.json` keeps one server per language: `ruby-lsp` (rubocop runs inside it;
the standalone `rubocop --lsp` and `solargraph` would otherwise start too and
triple the Ruby footprint on a Rails monolith), `typescript-language-server`
(the project's TypeScript 6 still ships `tsserver`, so omp drops its native
`tsc --lsp` route), and `eslint` as a linter. The eslint block sits under the
`""` settings key because the server pulls `workspace/configuration` with an
empty section and omp answers with `settings[section]`. The html, css and
json servers bundled with `vscode-langservers-extracted` stay on; `clangd`
(matching on the Rails `Makefile`) and `tailwindcss` (completion-only) are
off. Servers start eagerly (`lsp.lazy: false`) and shut down after ten idle
minutes.

Subagents only receive `lsp` when `task.enableLsp` is on (omp default: off —
the tool is silently dropped from agent `tools:` lists otherwise). Every code
agent autoloads `skill://structural-search`, the short when-to-use guide for
`lsp` / `ast_grep` / `grep`; the parent gets the same via `AGENTS.md` because
omp 18 passes skills, not context files or rules, to subagents. `scout.md`
shadows the bundled scout, which ships without `lsp`/`ast_grep`.

### Parallel runs

`start-ticket <ticket> [options]` launches `/feature` in its own git
worktree.

A new worktree always forks from the **latest tip of its base as origin has
it**: the launcher fetches first and forks from `origin/<branch>`, never from
the current `HEAD` or a possibly stale local checkout. Without `base=` that
branch is the repository default branch (`origin/HEAD`, else `main`/`master`)
and the PR targets it. The worktree starts on a scaffold branch
`omp/<ticket>`; `/feature` renames it to the issue's Linear branch name (what
**Copy git branch name** yields) before the first edit. For a stacked PR,
name the local branch to build on:

```sh
start-ticket ABC-124 base=feature/abc-123
```

The worktree then forks from `origin/feature/abc-123`, `/feature` diffs
against it, and the draft PR opens into it. `base=` must be a local branch
(what GitHub accepts as a PR base) and pushed: if the local branch carries
commits origin does not have, the launcher refuses so the ticket never forks
from an unpublished base. An existing `omp/<ticket>` scaffold branch (a
prior run whose worktree was removed) is reused as is and reported, not
re-forked. A repo with no `origin` remote falls back to the local tip.

## Model tiers

Set in `config.yml → modelRoles`; a role holds one selector, so each role's
Claude backup sits in `config.yml → retry.fallbackChains` under the same role
name. omp switches to the backup when the primary is not resolvable at spawn or
keeps failing mid-run (429s, quota wall, outage) and reverts once the primary's
cooldown expires. Agent files reference roles (`@verifier`), so retiering is a
one-line change. Verify selectors with `omp models <pattern>`.

| Role | Primary | Backup | Used for |
|---|---|---|---|
| `default` | claude-fable-5.1:high | gpt-5.6-sol:high | planning, orchestration, review triage, shipping |
| `plan` | claude-fable-5.1:high | gpt-5.6-sol:high | plan mode |
| `smol` | gpt-5.6-sol:medium | claude-opus-5:medium | model-switcher cheap role; unused by `/feature` |
| `implementer` | gpt-5.6-sol | claude-opus-5 | role for implementer subagents |
| `verifier` | gpt-5.6-terra:medium | claude-sonnet-5:medium | test/lint gate, failure diagnosis |
| `fixer` | gpt-5.6-luna:low | claude-haiku-4.5:low | `sonic`, verifier's edit phase |
| `scout` | gpt-5.6-luna:low | claude-sonnet-5:low | research |
| `tiny` | gpt-5.6-luna | claude-haiku-4.5 | `visuals`, background chores (titles, classifiers) |

Pinned outside the role table, on purpose: `implementer.md` (sol → opus),
`reviewer-sol.md` (sol → opus), `reviewer-fable.md` (fable — the second
reviewer is meant to be a different family).

## The /feature pipeline

ticket → research → plan → **gate** (ask; plan posted to Linear) → implement
(one `implementer` subagent in every tier; per-task commits) → verify loop → review
(tiered: none / sol-only / sol+fable with fable merging findings) → **draft PR**
(repo What/Why template per `rule://agent-voice`; unapplied findings as inline
comments) → summary comment with screenshots replied into the Linear plan thread.

- Tier from CLI arg, else the ticket's `trivial`/`small`/`large` Linear label, else `small`.
- Implementation never happens in the orchestrator session: fable plans, one sol implementer executes, fable keeps the pen for triage, review and shipping. No prewalk hand-off.
- Linear is parent-only by construction: no MCP server is configured, and only the parent's flow calls `bin/linear`.
- No browser in the parent session, any tier: screenshots and visual checks go
  to `visuals`, which is the only agent holding the `browser` tool.
- Ship step: over ~500 added lines, or a plan with two or more independently
  reviewable tasks, becomes a stack along the plan tasks (see "Stacked PRs");
  either way the branch is rebased onto the freshly fetched feature base
  before it is pushed.

## Stacked PRs

`/stack [branch|PR] [base=<branch>] [key=<ABC-123>] [auto]` splits existing
work into a chain of small PRs and `/feature` does the same at its ship step.
Two skills carry the knowledge, so any session or subagent can apply it:

- `skill://stacked-prs` (ours) — the judgement: aim for 500 added lines or
  fewer per PR; each layer builds, passes its tests and reads on its own
  without the other PRs; layers ordered the way the change would be
  introduced step by step (foundations → behaviour → surface → cleanup);
  tests ride with their code; how to slice an existing branch; the mandatory
  `git fetch` + `gh stack rebase` onto the latest base before every push; and
  the title/body pass — `gh stack submit` invents bodies, so every PR is
  rewritten to `rule://agent-voice` (What/Why, under five bullets, ideally
  three, plain full sentences, attribution header; `Fixes` on the top PR only,
  `Part of` below).
- `skill://gh-stack` (upstream) — the `gh stack` CLI: non-interactive flags,
  exit codes, conflict recovery, layer-design notes. Installed and updated by
  `gh`, not hand-edited:

```sh
gh extension install github/gh-stack
gh skill install github/gh-stack gh-stack --dir ~/.omp/agent/skills
gh skill update --dir ~/.omp/agent/skills     # later
```

`/stack` gates the layer plan (branch, purpose, contents, size, order) with
`ask` before any history is rewritten or pushed; `/feature` skips that gate
because its plan was already approved. The Linear branch name stays on the
top layer so an existing PR keeps its number and comments.

## Limits and resume

Two resumable circuit breakers are enforced on every `start-ticket` run:
`time-breaker` for wall-clock time and `spend-breaker` for estimated dollar
spend. Both leave the TUI responsive after stopping new work:

```sh
start-ticket ABC-123 large budget=60       # default time: 2h
start-ticket ABC-123 trivial time=45m      # explicit override
export OMP_TICKET_BUDGET=25
export OMP_TICKET_MAX_TIME=3h              # overrides every tier
```

Wall-clock defaults are `30m` (`trivial`), `1h` (`small`), and `2h` (`large`);
`time=0` disables the ceiling. The launcher can apply a tier time only when the
tier is supplied on its command line. Without one it uses `small`'s `1h`,
because a Linear label is not resolved until `/feature` is already running.

**Wall-clock allowance — `extensions/time-breaker.js`.** `start-ticket`
exports the resolved duration as `OMP_TICKET_MAX_TIME`; it deliberately does
not pass omp's `--max-time`, whose expired absolute deadline prevents later
prompts from reaching the model. The breaker measures active wall time from
when the process attaches to the session and shows `time elapsed/limit` in the
status line. At 75% it warns. At 100% it pauses its clock and blocks `task`,
`edit`, `eval`, `grep`, `glob`, `lsp`, `browser` and `web_search`, while
leaving `bash`, `hub`, `todo`, `write` and `read` available to preserve and
report progress. The current atomic operation is not hard-aborted; an in-flight
subagent may finish and remains revivable. Waiting for the user while stopped
does not consume a later time extension. Set `OMP_TICKET_TIME_SOFT_PCT` to
move the warning percentage.

In the running session:

```
/time             # elapsed, total allowance and time remaining
/time 2h          # set total allowance for this process to two hours
/time +30m        # add 30 minutes and resume if stopped
/time off          # remove the ceiling
```

**Dollar ceiling — `extensions/spend-breaker.js`.** `start-ticket` normalizes
`budget=` (or the tier default: `$5` / `$15` / `$40`) into
`OMP_TICKET_BUDGET_USD`, which the extension reads. The figure it enforces is
omp's own cost estimate — provider-reported tokens × the model's list price,
with cache reads priced at their discounted rate — summed over the
orchestrator's transcript **plus** every subagent it spawned (read live from
omp's subagent progress feed; background task spawns never reach the parent's
own ledger). It is notional under subscription logins but tracks real cost far
better than a token count, which over-weights cached context re-reads roughly
tenfold. At 75% it warns; at 100% it applies the same wrap-up-only tool policy.
Nothing is aborted and no work is lost. Set `OMP_TICKET_BUDGET_SOFT_PCT` to
move the warning percentage.

```
/budget          # spent so far, split main / subagents, vs the ceiling
/budget 25       # set the ceiling to $25
/budget +10      # add $10 and resume if stopped
/budget off      # remove the ceiling
```

When a raise lifts either block, its extension queues a notice telling the
agent to continue from the earliest unfinished todo item and starts the turn
itself if the agent is idle. The status line appends `STOP` to the exhausted
allowance. If both limits are exhausted, raise both before work tools are
available.

Both breakers measure from the moment the process attaches to the session, so
a process-level resume receives fresh allowances:

```sh
start-ticket ABC-123 resume budget=25 time=2h
```

The todo list, per-task commits, transcript, worktree, and revivable subagents
carry a run forward. Use `/time +…` or `/budget +…` while the process is still
open. Use `start-ticket … resume` only after the process or terminal closed.

**Goal Mode is TUI-only and separate.** `/goal` is an interactive command and
the `goal` tool stays hidden until it runs; a slash command given on the omp
command line is not executed (a `commands/` prompt file such as `/feature`
does expand, a built-in TUI action does not). A session launched straight into
`/feature` therefore has no `goal` tool — the breaker is what enforces spend
there. For goal-mode accounting on top, start omp in the worktree yourself,
run `/goal <objective>` and `/goal budget <N>`, then `/feature …`; the flow
detects the tool and drives it, and the interactive budget path is `/goal` →
**Adjust budget…** → **Resume**.

When active, Goal Mode accounts the parent session, while each task subagent
keeps separate usage. OMP fixes the hard threshold at 1.5× the warning
threshold, so `task.softRequestBudget` is set to 80: warning at 80, forced
resumable wrap-up at 120. A non-isolated budget-stopped agent remains
revivable through `hub send`.
Avoid `task.maxRuntimeMs` as the primary guard: its hard abort is terminal for that subagent.

omp's built-in status-line cost is the same list-price estimate, but it covers
only the parent transcript — background subagent spend is excluded — so on a
delegation-heavy run it understates the total; the breaker's `spend` status and
`/budget` are the all-in figure. Parent and subagent usage is persisted
separately under the session directory; use `omp stats --summary` for
aggregate accounting and `omp usage` for actual provider quota windows.

## Secrets

None live here. OAuth credentials sit in `~/.omp`'s auth store; the
whitelist `.gitignore` plus explicit deny patterns keep runtime state,
logs, databases, and anything credential-shaped untracked.
