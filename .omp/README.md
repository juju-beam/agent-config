# omp config — setup

Personal defaults for [oh-my-pi](https://github.com/can1357/oh-my-pi).
Strategy: expensive model plans, cheap models execute, tests are the safety net.

## Layout

```
.omp/agent/
├── config.yml            model roles, prewalk, scout/sonic overrides
├── mcp.json              Linear MCP server
├── commands/
│   ├── feature.md        /feature <ticket|branch> [tier] [auto] [model] [budget=N]
│   ├── feature-resume.md resume the persisted /feature todo and agent state
│   └── investigate.md    /investigate <ticket|question> — research only, no code
└── agents/
    ├── implementer.md        one planned task, self-tests (sol)
    ├── implementer-opus.md   heavier-reasoning variant (opus)
    ├── implementer-terra.md  terra variant
    ├── verifier.md           full suite + linters; diagnoses; fixes trivia (sonnet → luna)
    ├── reviewer-sol.md       implementation-level review (read-only)
    └── reviewer-fable.md     design-level review + findings merge (read-only)
```

## Install

Per-item symlinks into `~/.omp/agent/` — never link the whole directory:
`~/.omp` and `~/.omp/agent` hold runtime state and credentials (`agent.db`,
`sessions/`, auth store, `logs/`) that must stay out of this repo.

From the **repo root**:

```sh
mkdir -p ~/.omp/agent
for f in config.yml mcp.json commands agents; do
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
  /mcp reauth linear      # Linear OAuth (browser)
```

Optional, for parallel runs (`start-ticket <ticket> [options]` launches
`/feature` in its own git worktree):

```sh
export PATH="$HOME/dev/repos/agent-config/bin:$PATH"
```

Without `base=`, the new `omp/<ticket>` worktree forks from the current
`HEAD` of the checkout you run it from, and the PR targets the default
branch. For a stacked PR, name the local branch to build on:

```sh
start-ticket ABC-124 base=feature/abc-123
```

The worktree then forks from `feature/abc-123`, `/feature` diffs against
it, and the draft PR opens into it. An existing `omp/<ticket>` branch is
reused as is. `base=` must be a local branch (what GitHub accepts as a
PR base) and must already be pushed by the time the PR is created.

## Model tiers

Set in `config.yml → modelRoles`; agent files reference roles (`@implementer`),
so retiering is a one-line config change. Verify selectors with `omp models <pattern>`.

| Role | Model | Used for |
|---|---|---|
| `default` | claude-fable-5 | planning, orchestration, review triage |
| `smol` | gpt-5.6-sol | prewalk hand-off target (implementation) |
| `implementer` | gpt-5.6-sol | task implementation subagents |
| `verifier` | claude-sonnet-5:medium | test/lint gate, failure diagnosis |
| `fixer` | gpt-5.6-luna:low | trivial fixes, sonic, verifier's edit phase |
| `tiny` | gpt-5.6-luna | background chores (titles, classifiers) |
| scout override | gpt-5.4-mini:low | research (feeds the plan — mid-tier on purpose) |

## The /feature pipeline

ticket → research → plan → **gate** (ask; plan posted to Linear) → implement
(serial via prewalk by default; per-task commits) → verify loop → review
(tiered: none / sol-only / sol+fable with fable merging findings) → **draft PR**
(visual summary, highlights, "Needs attention"; unapplied findings as inline
comments) → PR link replied into the Linear plan thread.

- Tier from CLI arg, else the ticket's `trivial`/`small`/`large` Linear label, else `small`.
- Prewalk hands the session from fable to `@smol` at the first file edit — expected.
- Subagents have no Linear/MCP access; only the parent touches the ticket.

## Spend limits and resume

`start-ticket` enables Goal Mode and gives the orchestrator a token ceiling.
Defaults are `300k` (`trivial`), `800k` (`small`), and `1.5m` (`large`).
Override per run or for the shell:

```sh
start-ticket ABC-123 large budget=2m       # default time: 2h
start-ticket ABC-123 trivial time=45m      # explicit override
export OMP_TICKET_BUDGET=2m
export OMP_TICKET_MAX_TIME=3h              # overrides every tier
```

Wall-clock defaults are `30m` (`trivial`), `1h` (`small`), and `2h` (`large`);
`time=0` disables the backstop. The launcher can apply a tier time only when
the tier is supplied on its command line. Without one it uses `small`'s `1h`,
because a Linear label is not resolved until `/feature` is already running.
The token ceiling is graceful: omp persists the goal, todo list, transcript,
worktree, and revivable subagents before the workflow stops. Grant another
allowance without repeating completed work:

```sh
start-ticket ABC-123 resume budget=8m
```

Omit `budget=` to grant the previous ceiling again when it was exhausted.
The equivalent interactive path is `/goal` → **Adjust budget…** → **Resume**.

Goal Mode accounts the parent session, while each task subagent keeps separate
usage. OMP fixes the hard threshold at 1.5× the warning threshold, so
`task.softRequestBudget` is set to 80: warning at 80, forced resumable wrap-up
at 120. A non-isolated budget-stopped agent remains revivable through
`hub send`.
Avoid `task.maxRuntimeMs` as the primary guard: its hard abort is terminal for that subagent.

The TUI cost is provider-reported token usage multiplied by omp's model-price
catalog. It is a useful API-price estimate, but subscription logins make it
notional rather than a billed-dollar total. Parent and subagent usage is
persisted separately in `~/.omp/agent/agent.db`; use `omp stats --summary` for
aggregate accounting and `omp usage` for actual provider quota windows.

## Secrets

None live here. OAuth credentials sit in `~/.omp`'s auth store; the
whitelist `.gitignore` plus explicit deny patterns keep runtime state,
logs, databases, and anything credential-shaped untracked.
