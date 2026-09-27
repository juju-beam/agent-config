---
name: stacked-prs
description: How to split a branch, PR, or /feature plan into a stack of small, self-contained PRs (≤500 added lines each) and ship it with gh stack — layer design, slicing an existing branch, mandatory rebase onto the freshly fetched base before any push, and the title/body pass every layer needs. Read before creating, splitting, rebasing, or pushing a stack. CLI flags, exit codes and recovery live in skill://gh-stack.
---
A stack is a chain of PRs, each based on the one below, so a reviewer sees one layer's diff at a time. This skill owns the judgement: what goes in each layer, in what order, how big, and what the PRs say. `skill://gh-stack` owns the CLI (always `view --json`, `submit --auto`, `init <branch>`, `add <branch>`; never bare `submit`, `add`, `switch`, or `modify` — they open prompts and hang). Read its non-interactive table before the first `gh stack` call.

## When to stack

- The change adds more than ~500 lines, or it has two or more parts a reviewer could accept independently → stack.
- One small logical change → one PR. Never stack for its own sake.
- From a `/feature` plan: the approved task list is the first cut. Split along plan tasks; merge tasks that cannot stand alone; split a task that exceeds the size limit.

## Layer rules

- **Size:** aim for 500 added lines or fewer per PR (`git diff --shortstat <base>...<tip>`; the additions figure). Generated files and lockfiles that cannot be cut smaller are the only excuse to exceed it — say so in that PR's body.
- **Self-contained:** each layer builds, its own tests pass, and the application works with only the layers below it merged. No references to code that arrives in a higher layer. A reviewer reads it cold, without context from the other PRs, and can follow the change from the diff plus the description.
- **Order:** the sequence in which you would introduce the change step by step — foundations first (schema, data model, pure helpers, config), then behaviour (services, endpoints, jobs), then the surface (UI, wiring, feature flags), then removals and cleanup. A layer depends only on layers below it.
- **Cohesion:** tests ride with the code they cover. A migration, generated file or lockfile lands in the layer that first needs it. Refactors that only prepare the ground are their own bottom layer.
- **One story:** one stack per feature or ticket. Unrelated fixes discovered along the way go in a separate PR, not a layer.
- A layer you cannot describe in one plain sentence is two layers.

## Slicing an existing branch

Never rewrite the original branch until the stack is pushed and verified; work on copies.

1. `git fetch origin <base> <source>`. Confirm the source tip is what will be split (`git log --oneline origin/<base>..<source>`; `git diff --shortstat origin/<base>...<source>`).
2. Draft the layer plan: for each layer, in order — branch name, one-sentence purpose, contents (commits, or paths/hunks), estimated additions, what it stands on. Gate it with the user unless the flow is unattended.
3. Build layers bottom-up from `origin/<base>`:
   - Clean, per-concern commits → `git rebase -i` to group them; each group becomes a layer (`gh stack init <first>` on the base, commit, `gh stack add <next>`, commit, …).
   - Mixed commits → build by content: on each new layer branch, `git checkout <source> -- <paths>` for whole files and `git checkout -p <source> -- <path>` for partial ones, then commit. Repeat on top for the next layer.
   - The top layer's tree must equal the source tree: `git diff --stat <source> <top>` is empty, or every remaining difference is intentional and named in the report.
4. Verify every layer at its own tip — build plus the tests touching that layer — before moving up. In a `/feature` session, delegate this to `verifier` per the context discipline; elsewhere run the project's own check commands.
5. Branch names: the ticket's Linear branch name stays on the **top** layer (so an existing PR keeps its number, reviewers and comments, and Linear's link); lower layers take `<linear-branch>-<k>-<slug>` with `k` counting from the bottom. No ticket: `<topic>/<concern>` per `skill://gh-stack/references/stack-design.md`. Repository naming conventions win over both.

## Rebase onto the latest base before every push

Do this immediately before `gh stack submit` or `gh stack sync`, every time, not only the first:

1. `git fetch origin <base>`.
2. `gh stack rebase` — fetches the trunk and cascades every layer onto its updated parent. Exit 3 → resolve the files, `git add`, `gh stack rebase --continue`; `gh stack rebase --abort` restores every branch.
3. `gh stack view --json`: no branch may report `needsRebase: true` and `trunk` must be the intended base.
4. If the rebase changed any layer's content (conflicts resolved, or base moved under it), re-verify the affected layers and everything above them before pushing.
5. Only then `gh stack submit --auto` (creates drafts; updates bases of existing PRs) for new PRs, or `gh stack sync` to push updates to an existing stack. Never `git push --force` a stack branch by hand — `gh stack` pushes with `--force-with-lease --atomic`.

## Title and body pass — required after every submit

`gh stack submit` invents titles and bodies. Overwrite each PR immediately with `gh pr edit <number> --title … --body-file -`, bottom to top, per `rule://agent-voice` (its **PR descriptions** section is the spec). Stack specifics:

- Title: `[<ticket-key>] <imperative summary of this layer>`.
- First line: `Fixes <ticket-key>` on the **top** PR only. Every lower PR opens with `Part of <ticket-key>` instead, so the ticket closes when the whole stack lands. Then two blank lines, then the attribution header `*🤖 <model-id> (agent):*`.
- Next line, the position: bottom PR `1/N, bottom of the stack; #<above> builds on it.`; others `k/N, stacked on #<below> — context in #<bottom>.`
- **What** and **Why**, bold inline headers only. Under five bullets each; aim for three or fewer. Every bullet is a full, natural, plain-English sentence a colleague from another team would understand: high level, no function names, file lists, or jargon unless the jargon is the critical piece of this PR. Each description stands on its own — a reader should not need the other PRs to follow this one.
- Nothing about the process: no test reports, review verdicts, agent or workflow detail. A layer exceeding the size rule gets one sentence saying why.
- Bug fix layer → **Steps to reproduce** after Why. Deliberate gap → one `Not in scope:` line.

## Reporting

Report the stack bottom to top: branch, PR URL, added lines, one-sentence purpose. Note anything intentionally left out of the top layer versus the source branch, and any layer over the size rule with its reason. On Linear, one comment carrying every PR link in order (`rule://agent-voice`), as a reply in the plan thread when one exists.
