// Dollar circuit-breaker for the parent (orchestrator) session.
//
// omp itself imposes no spend limit; this extension is the ceiling. It reads
// the session's own cost ledger plus live subagent spend and:
//
//   soft threshold  -> one steering message: converge, get shippable.
//   hard threshold  -> blocks work tools; only wrap-up tools stay callable.
//
// The ceiling is adjustable in-session, so hitting it never requires quitting:
// the agent wraps up and ends its turn, the user runs `/budget +10` (or
// `/budget 25`), and the agent is prompted to continue from the todo list.
//
// Configure:
//   OMP_TICKET_BUDGET_USD       dollar ceiling (unset = idle until /budget)
//   OMP_TICKET_BUDGET_SOFT_PCT  warning percentage (default 75)
//
// Accounting — USD at model list price × provider-reported tokens (notional
// under subscription logins, but cache reads are priced correctly, which raw
// token counts get badly wrong):
//   main    ctx.sessionManager.getUsageStatistics().cost — this transcript's
//           assistant turns, off-transcript model calls, and blocking task
//           results.
//   agents  Σ progress.cost over `task:subagent:progress` frames on the
//           session bus. Background (async) task spawns — the default — never
//           reach the main ledger (their result lands as a custom message
//           without usage), so this is the only live source. Direct children
//           only; grandchildren post on their parent's bus.
//
// Spend is measured from the moment this process attached to the session, so
// `start-ticket … resume` (omp -c) starts with a fresh allowance.
//
// Extensions are forwarded to subagent sessions too. Only the interactive
// parent enforces: everything is gated on ctx.hasUI (headless children have
// none), so a child never blocks its own tools over the parent's ceiling.
//
// Fails open by design: `tool_call` handlers that throw block the call, so
// every read is wrapped and any error leaves the session untouched.

// Tools that remain callable after the ceiling: commit, push, open the PR,
// talk to subagents, close out the todo list, write the PR body, report.
const WRAP_UP_TOOLS = new Set(["bash", "hub", "todo", "write", "read", "ask", "yield"]);
const PROGRESS_CHANNEL = "task:subagent:progress";

function parseUsd(raw) {
  const s = String(raw ?? "").trim().replace(/^\$/, "");
  if (!/^\d+(\.\d+)?$/.test(s)) return undefined;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function parseSoftPct() {
  const raw = (process.env.OMP_TICKET_BUDGET_SOFT_PCT ?? "").trim();
  const n = Number.parseInt(raw, 10);
  return Number.isInteger(n) && n > 0 && n < 100 ? n : 75;
}

const usd = (n) => `$${n.toFixed(2)}`;

export default function hook(pi) {
  let ceiling = parseUsd(process.env.OMP_TICKET_BUDGET_USD);
  const softPct = parseSoftPct();
  const soft = () => (ceiling === undefined ? Infinity : (ceiling * softPct) / 100);

  let active = false; // true only in the interactive parent session
  let ui; // captured at attach; status updates also arrive from bus frames
  let baseline = 0; // main-ledger cost when this process attached
  let lastMain = 0;
  let warned = false;
  let stopped = false;

  // Per-subagent cumulative cost. A revived agent starts a new run whose
  // counter restarts at 0, so a drop below the last seen value settles the
  // previous run instead of overwriting it.
  const agents = new Map(); // id -> { run, settled }
  let agentTotal = 0;

  const mainCost = (ctx) => {
    try {
      const c = ctx?.sessionManager?.getUsageStatistics?.()?.cost;
      return typeof c === "number" && Number.isFinite(c) ? c : undefined;
    } catch {
      return undefined;
    }
  };

  const spent = (ctx) => {
    const m = mainCost(ctx);
    if (m !== undefined) lastMain = m;
    const main = Math.max(0, lastMain - baseline);
    return { main, agents: agentTotal, total: main + agentTotal };
  };

  let lastStatus;
  const refreshStatus = (ctx) => {
    if (!active) return;
    const s = spent(ctx);
    const text =
      ceiling === undefined
        ? `spend ${usd(s.total)}`
        : `spend ${usd(s.total)}/${usd(ceiling)}${stopped ? " STOP · /budget +N" : ""}`;
    if (text === lastStatus) return;
    lastStatus = text;
    try {
      ui?.setStatus?.("spend", text);
    } catch {
      // status line is cosmetic
    }
  };

  const attach = (ctx) => {
    active = Boolean(ctx?.hasUI);
    if (!active) return;
    ui = ctx.ui;
    baseline = mainCost(ctx) ?? 0;
    lastMain = baseline;
    agents.clear();
    agentTotal = 0;
    warned = false;
    stopped = false;
    lastStatus = undefined;
    refreshStatus(ctx);
  };

  pi.on("session_start", async (_event, ctx) => attach(ctx));
  pi.on("session_switch", async (_event, ctx) => attach(ctx));

  pi.events.on(PROGRESS_CHANNEL, (data) => {
    if (!active) return;
    const p = data?.progress;
    if (!p || typeof p.id !== "string" || typeof p.cost !== "number" || !Number.isFinite(p.cost)) return;
    const rec = agents.get(p.id) ?? { run: 0, settled: 0 };
    if (p.cost < rec.run) rec.settled += rec.run;
    rec.run = p.cost;
    agents.set(p.id, rec);
    let sum = 0;
    for (const r of agents.values()) sum += r.run + r.settled;
    agentTotal = sum;
    refreshStatus();
  });

  const notice = (body, display) =>
    pi.sendMessage?.({
      customType: "spend-breaker",
      content: `<system-notice>\n${body}\n</system-notice>`,
      display,
    });

  pi.on("turn_end", async (_event, ctx) => {
    if (!active) return;
    const s = spent(ctx);
    refreshStatus(ctx);
    if (ceiling === undefined) return;

    if (s.total >= ceiling && !stopped) {
      stopped = true;
      refreshStatus(ctx);
      await notice(
        `Budget exhausted: ${usd(s.total)} of ${usd(ceiling)} (main ${usd(s.main)}, subagents ${usd(s.agents)}).\n` +
          `Start no new work. Finish the current atomic operation, commit what is done, ` +
          `push and open the draft PR if the branch is shippable, then report exactly what remains. ` +
          `Work tools (task, edit, eval, grep, glob, lsp, browser, web_search) are now blocked; ` +
          `bash, hub, todo, write and read stay available for wrap-up. ` +
          `Tell the user they can continue in this session with \`/budget +<usd>\`, then end your turn.`,
        `Budget exhausted (${usd(s.total)}/${usd(ceiling)}) — wrap-up only; /budget +N to continue`,
      );
      return;
    }

    if (s.total >= soft() && !warned) {
      warned = true;
      await notice(
        `Spend warning: ${usd(s.total)} of the ${usd(ceiling)} ceiling.\n` +
          `Stop widening scope. Delegate remaining work rather than reading files yourself, ` +
          `and get to a committed, shippable state before the ceiling stops new work.`,
        `Spend warning (${usd(s.total)}/${usd(ceiling)})`,
      );
    }
  });

  pi.on("tool_call", async (event, ctx) => {
    if (!active || ceiling === undefined) return;
    if (WRAP_UP_TOOLS.has(event.toolName)) return;

    const s = spent(ctx);
    if (s.total < ceiling) return;

    stopped = true;
    refreshStatus(ctx);
    return {
      block: true,
      reason:
        `Budget exhausted (${usd(s.total)}/${usd(ceiling)}): ${event.toolName} is blocked. ` +
        `Commit and report remaining work with bash/hub/todo/write, ` +
        `tell the user to run \`/budget +<usd>\` to continue in this session, then end your turn.`,
    };
  });

  pi.registerCommand("budget", {
    description: "Spend ceiling in USD: /budget | /budget 20 | /budget +5 | /budget off",
    handler: async (args, ctx) => {
      const say = (msg, kind = "info") => {
        try {
          ctx.ui?.notify?.(msg, kind);
        } catch {
          // notification is cosmetic
        }
      };
      if (!active) {
        say("spend-breaker is inactive in this session (no UI).", "warning");
        return;
      }

      const arg = args.trim();
      const s = spent(ctx);
      const report = () =>
        `${usd(s.total)} spent (main ${usd(s.main)}, subagents ${usd(s.agents)})` +
        (ceiling === undefined ? ", no ceiling" : ` of ${usd(ceiling)}${stopped ? " — STOPPED" : ""}`);

      if (!arg) {
        say(report());
        return;
      }

      if (arg === "off") {
        const wasStopped = stopped;
        ceiling = undefined;
        stopped = false;
        warned = false;
        refreshStatus(ctx);
        say(`ceiling removed — ${report()}`);
        if (wasStopped) resume(s);
        return;
      }

      let next;
      if (arg.startsWith("+")) {
        const delta = parseUsd(arg.slice(1));
        if (delta === undefined) return say(`usage: /budget +<usd>, e.g. /budget +5`, "error");
        next = (ceiling ?? s.total) + delta;
      } else {
        next = parseUsd(arg);
        if (next === undefined) return say(`usage: /budget <usd> | +<usd> | off`, "error");
      }

      const wasStopped = stopped;
      ceiling = next;
      stopped = s.total >= ceiling;
      warned = s.total >= soft();
      refreshStatus(ctx);
      say(`ceiling ${usd(ceiling)} — ${report()}`, stopped ? "warning" : "info");
      if (wasStopped && !stopped) resume(s);
    },
  });

  // After a raise that lifts the block, tell the agent to pick the work back
  // up. followUp waits for any in-flight wrap-up turn; triggerTurn starts one
  // when the agent is idle, so no user prompt is needed.
  const resume = (s) =>
    pi.sendMessage?.(
      {
        customType: "spend-breaker",
        content:
          `<system-notice>\nBudget ${ceiling === undefined ? "removed" : `raised to ${usd(ceiling)}`} ` +
          `(${usd(s.total)} spent so far). Work tools are unblocked. ` +
          `Continue from the earliest unfinished todo item; do not repeat completed work.\n</system-notice>`,
        display: `Budget ${ceiling === undefined ? "removed" : `raised to ${usd(ceiling)}`} — continuing`,
      },
      { deliverAs: "followUp", triggerTurn: true },
    );
}
