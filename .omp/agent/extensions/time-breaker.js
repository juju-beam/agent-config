// Resumable wall-clock circuit-breaker for interactive /feature sessions.
//
// Unlike omp --max-time, reaching the limit leaves the session responsive.
// The breaker pauses its clock, blocks new work tools, and gives the agent the
// wrap-up tools needed to preserve progress and explain the stop. The user can
// add time in place with /time +30m; no process-level resume is required.
//
// Configure:
//   OMP_TICKET_MAX_TIME       duration ceiling (e.g. 30m, 1h, 3600; 0 = off)
//   OMP_TICKET_TIME_SOFT_PCT  warning percentage (default 75)
//
// The allowance starts when this process attaches to the session. A later
// `start-ticket … resume` therefore receives a fresh allowance, matching the
// spend-breaker behavior. Headless subagents do not enforce their own copy;
// only the interactive orchestrator gates tools.

const WRAP_UP_TOOLS = new Set(["bash", "hub", "todo", "write", "read", "ask", "yield"]);
const TICK_MS = 1000;
const UNIT_MS = {
  ms: 1,
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

function parseDurationMs(raw) {
  const text = String(raw ?? "").trim().toLowerCase();
  const match = /^(\d+(?:\.\d+)?)(ms|s|m|h|d)?$/.exec(text);
  if (!match) return undefined;
  const amount = Number(match[1]);
  const milliseconds = amount * UNIT_MS[match[2] ?? "s"];
  return Number.isFinite(milliseconds) && milliseconds > 0 ? milliseconds : undefined;
}

function parseSoftPct() {
  const value = Number(process.env.OMP_TICKET_TIME_SOFT_PCT ?? "75");
  return Number.isFinite(value) && value > 0 && value < 100 ? value : 75;
}

function clock(milliseconds, long) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return long
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function human(milliseconds) {
  let totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const days = Math.floor(totalSeconds / 86_400);
  totalSeconds %= 86_400;
  const hours = Math.floor(totalSeconds / 3600);
  totalSeconds %= 3600;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  if (seconds || parts.length === 0) parts.push(`${seconds}s`);
  return parts.join(" ");
}

export default function hook(pi) {
  const configured = process.env.OMP_TICKET_MAX_TIME;
  const configuredOff = String(configured ?? "").trim() === "0";
  let limitMs = configured === undefined || configuredOff ? undefined : parseDurationMs(configured);
  const invalidConfiguredLimit = configured !== undefined && !configuredOff && limitMs === undefined;
  const softPct = parseSoftPct();

  let active = false;
  let ui;
  let timer;
  let timerContext;
  let accumulatedMs = 0;
  let runningSince;
  let warned = false;
  let stopped = false;
  let lastStatus;
  let configurationWarningShown = false;

  const elapsed = (now = Date.now()) =>
    accumulatedMs + (runningSince === undefined ? 0 : Math.max(0, now - runningSince));

  const softLimit = () => (limitMs === undefined ? Infinity : (limitMs * softPct) / 100);

  const pause = (used) => {
    accumulatedMs = used;
    runningSince = undefined;
  };

  const resumeClock = () => {
    if (runningSince === undefined) runningSince = Date.now();
  };

  // Footer item only when a ceiling is configured; `setStatus(key, undefined)`
  // removes the entry, so `/time off` clears it and `/time 2h` brings it back.
  const refreshStatus = () => {
    if (!active) return;
    let text;
    if (limitMs !== undefined) {
      const used = elapsed();
      const long = Math.max(used, limitMs) >= 3_600_000;
      text = `time ${clock(used, long)}/${clock(limitMs, long)}${stopped ? " STOP · /time +30m" : ""}`;
    }
    if (text === lastStatus) return;
    lastStatus = text;
    try {
      ui?.setStatus?.("time", text);
    } catch {
      // Status rendering is cosmetic.
    }
  };

  const notifyAgent = (body, display, { triggerTurn = false } = {}) =>
    pi.sendMessage?.(
      {
        customType: "time-breaker",
        content: `<system-notice>\n${body}\n</system-notice>`,
        display,
      },
      { deliverAs: "followUp", triggerTurn },
    );

  const stop = async (used) => {
    if (stopped || limitMs === undefined) return;
    // Freeze at the configured boundary. Wrap-up time and time spent waiting for
    // the user do not consume a later extension of the allowance.
    pause(Math.min(used, limitMs));
    stopped = true;
    refreshStatus();
    await notifyAgent(
      `Time limit reached: ${human(elapsed())} of ${human(limitMs)}.\n` +
        `Start no new work. Finish the current atomic operation, preserve todo and subagent state, ` +
        `commit and report exactly what remains. Work tools (task, edit, eval, grep, glob, lsp, ` +
        `browser, web_search) are now blocked; bash, hub, todo, write and read stay available for wrap-up. ` +
        `Tell the user the session stopped because its wall-clock allowance was exhausted and that they ` +
        `can continue here with \`/time +<duration>\` (for example \`/time +30m\`), then end your turn.`,
      `Time limit reached (${human(elapsed())}/${human(limitMs)}) — wrap-up only; /time +30m to continue`,
      { triggerTurn: true },
    );
  };

  const check = async () => {
    if (!active) return;
    const used = elapsed();
    refreshStatus();
    if (limitMs === undefined) return;

    if (used >= limitMs) {
      await stop(used);
      return;
    }

    if (used >= softLimit() && !warned) {
      warned = true;
      await notifyAgent(
        `Time warning: ${human(used)} of the ${human(limitMs)} wall-clock allowance has elapsed.\n` +
          `Stop widening scope and get to a committed, resumable state before the time breaker stops new work.`,
        `Time warning (${human(used)}/${human(limitMs)})`,
      );
    }
  };

  const attach = (ctx) => {
    if (timer && timerContext) timerContext.clearTimer(timer);
    timer = undefined;
    timerContext = undefined;

    active = Boolean(ctx?.hasUI);
    if (!active) return;
    ui = ctx.ui;
    accumulatedMs = 0;
    runningSince = Date.now();
    warned = false;
    stopped = false;
    lastStatus = undefined;
    refreshStatus();

    if (invalidConfiguredLimit && !configurationWarningShown) {
      configurationWarningShown = true;
      try {
        ui?.notify?.(
          `Invalid OMP_TICKET_MAX_TIME=${JSON.stringify(configured)}; time breaker has no ceiling.`,
          "warning",
        );
      } catch {
        // Notification is cosmetic.
      }
    }

    timer = ctx.setInterval(check, TICK_MS);
    timerContext = ctx;
  };

  pi.on("session_start", async (_event, ctx) => attach(ctx));
  pi.on("session_switch", async (_event, ctx) => attach(ctx));
  pi.on("session_shutdown", async () => {
    if (timer && timerContext) timerContext.clearTimer(timer);
    timer = undefined;
    timerContext = undefined;
    active = false;
  });

  pi.on("turn_end", async () => check());

  pi.on("tool_call", async (event) => {
    if (!active || limitMs === undefined) return;
    const used = elapsed();
    if (used < limitMs && !stopped) return;

    await stop(used);
    if (WRAP_UP_TOOLS.has(event.toolName)) return;
    return {
      block: true,
      reason:
        `Time limit reached (${human(elapsed())}/${human(limitMs)}): ${event.toolName} is blocked. ` +
        `Preserve progress with bash/hub/todo/write/read, tell the user to run ` +
        `\`/time +<duration>\` to continue in this session, then end your turn.`,
    };
  });

  pi.registerCommand("time", {
    description: "Wall-clock allowance: /time | /time 2h | /time +30m | /time off",
    handler: async (args, ctx) => {
      const say = (message, kind = "info") => {
        try {
          ctx.ui?.notify?.(message, kind);
        } catch {
          // Notification is cosmetic.
        }
      };

      const report = () => {
        const used = elapsed();
        if (limitMs === undefined) return `${human(used)} elapsed, no limit`;
        const remaining = Math.max(0, limitMs - used);
        return (
          `${human(used)} elapsed of ${human(limitMs)} (${human(remaining)} remaining)` +
          (stopped ? " — STOPPED" : "")
        );
      };

      const arg = args.trim().toLowerCase();
      if (!arg) {
        say(report(), stopped ? "warning" : "info");
        return;
      }

      const used = elapsed();
      const wasStopped = stopped;

      if (arg === "off") {
        limitMs = undefined;
        stopped = false;
        warned = false;
        resumeClock();
        refreshStatus();
        say(`time limit removed — ${report()}`);
        if (wasStopped) await resume(used);
        return;
      }

      const additive = arg.startsWith("+");
      const duration = parseDurationMs(additive ? arg.slice(1) : arg);
      if (duration === undefined) {
        say("usage: /time <duration> | +<duration> | off, e.g. /time 2h or /time +30m", "error");
        return;
      }

      limitMs = additive ? (limitMs ?? used) + duration : duration;
      stopped = used >= limitMs;
      warned = used >= softLimit();
      if (stopped) pause(used);
      else resumeClock();
      refreshStatus();
      say(`time limit ${human(limitMs)} — ${report()}`, stopped ? "warning" : "info");
      if (wasStopped && !stopped) await resume(used);
    },
  });

  const resume = (used) =>
    notifyAgent(
      `Time allowance ${limitMs === undefined ? "removed" : `raised to ${human(limitMs)}`} ` +
        `(${human(used)} elapsed). Work tools are unblocked and the wall clock is running again. ` +
        `Continue from the earliest unfinished todo item; do not repeat completed work.`,
      `Time ${limitMs === undefined ? "limit removed" : `raised to ${human(limitMs)}`} — continuing`,
      { triggerTurn: true },
    );
}
