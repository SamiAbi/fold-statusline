#!/usr/bin/env node
// Claude Code status line — "the deck line" (Fold design, approved 2026-08-06).
// One line inside a rounded box: title = place ( fold · main ✱3), row =
// icon-led groups separated by dim │ — user · model+effort · output style ·
// context (bar + % + time-left) · 5h · credits ($ left, when any) · week
// (wall-clock resets) · mcp · session time.
// Enterprise seats: the 5h slot collapses and cost takes its place.
// Always renders the full line at its natural width (no shrinking).
// Part of fold-statusline — install with `npx github:SamiAbi/fold-statusline`
// or `fold-statusline install`. Requires a Nerd Font (Maple Mono NF).

import { readFileSync, statSync, writeFileSync } from "node:fs";
import { execFileSync, spawn } from "node:child_process";
import { homedir, userInfo } from "node:os";
import { join, basename } from "node:path";

// ---- Fold palette (src/core/theme.css + editor syntax colors), truecolor ----
const RS = "\x1b[0m";
const BOLD = "\x1b[1m";
const fg = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return `\x1b[38;2;${(n >> 16) & 255};${(n >> 8) & 255};${n & 255}m`;
};
// Chrome colors are tuned against Fold's #16161e background; on other
// terminals' backgrounds they can vanish entirely. Fold sessions export
// FOLD=1 — inside, use the exact theme; elsewhere, a brighter border/track
// that stays visible on any dark background.
const inFold = process.env.FOLD === "1";
const C = {
  text: fg("#d5d5e0"), dim: fg("#71718a"), accent: fg("#7aa2f7"),
  ok: fg("#9ece6a"), warn: fg("#e0af68"), danger: fg("#f7768e"),
  cyan: fg("#7dcfff"), purple: fg("#bb9af7"), orange: fg("#ff9e64"), teal: fg("#2ac3de"),
  track: fg(inFold ? "#34344a" : "#4d4d63"), border: fg(inFold ? "#2c2c3a" : "#565672"),
};
const t = (s) => C.text + s + RS;
const d = (s) => C.dim + s + RS;
const a = (s) => C.accent + s + RS;
const b = (col, s) => col + BOLD + s + RS;

// ---- Nerd Font icons (Maple Mono NF; single-width in Fold sessions) ----
// Written as \u escapes on purpose: literal PUA glyphs are invisible in most
// editors, and an accidental deletion looks like nothing happened.
const I = {
  plane: "\uf1d8",  // paper plane (fold)
  user: "\uf2bd",   // user-circle
  chip: "\uf2db",   // microchip
  bolt: "\uf0e7",   // effort
  db: "\uf1c0",     // database = context tokens
  hour: "\uf252",   // hourglass-half = 5h window
  cal: "\uf073",    // calendar = week window
  clock: "\uf017",  // reset time
  puzzle: "\uf12e", // mcp
  heart: "\uf21e",  // heartbeat = session
  brush: "\uf1fc",  // paint-brush = output style
  fire: "\uf06d",   // context nearly spent
  dollar: "\uf155", // enterprise cost
  card: "\uf09d",   // credit-card = extra-usage credits
};

// ---- visible width (ANSI stripped; NF PUA glyphs render 1 cell here) ----
const ANSI = /\x1b\[[0-9;]*m/g;
const vis = (s) => [...s.replace(ANSI, "")].length;

// ---- terminal width, best-effort: the payload has no width, but this process
// still has the controlling tty. Unknown → assume wide (full design). ----
function termCols() {
  const forced = Number(process.env.STATUSLINE_COLS); // test override
  if (forced > 0) return forced;
  try {
    const out = execFileSync("sh", ["-c", "stty size < /dev/tty"],
      { encoding: "utf8", timeout: 300, stdio: ["ignore", "pipe", "ignore"] }).trim();
    const c = Number(out.split(/\s+/)[1]);
    if (c > 0) return c;
  } catch { /* no controlling tty */ }
  const env = Number(process.env.COLUMNS);
  if (env > 0) return env;
  return 9999; // unknown: never shrink the approved design on a guess
}

function readStdin() {
  try { return readFileSync(0, "utf8"); } catch { return ""; }
}

// ~/.claude.json, parsed once and shared (account identity + usage cache).
const CLAUDE_JSON = process.env.STATUSLINE_CLAUDE_JSON || join(homedir(), ".claude.json"); // test override
function claudeJson() {
  try { return JSON.parse(readFileSync(CLAUDE_JSON, "utf8")); } catch { return {}; }
}

function oauthAccount(cj) {
  return cj.oauthAccount || {};
}

function isEnterprisePlan(oa) {
  if (process.env.STATUSLINE_ENTERPRISE === "1") return true; // test override
  return /enterprise/i.test(oa.organizationType || "") ||
         /enterprise|usage_based/i.test(oa.seatTier || "");
}

// Extra-usage credits: money left, from the UNDOCUMENTED cachedUsageUtilization
// block of ~/.claude.json (no official statusline field carries a balance).
// Any surprise in shape or sign means null — section hidden, never a crash.
// used_credits units are unverified (minor units vs dollars): when the percent
// derived from it disagrees with the reported utilization, trust the percent.
function creditsInfo(cj) {
  try {
    const cu = cj.cachedUsageUtilization;
    const xu = cu?.utilization?.extra_usage;
    if (!xu || typeof xu !== "object") return null;
    if (xu.disabled_reason === "out_of_credits" || xu.spend_limit_reached === true) return null;
    const dp = Number.isFinite(xu.decimal_places) ? xu.decimal_places : 2;
    let left = null;
    if (Number.isFinite(xu.remaining_dollars)) {
      left = xu.remaining_dollars;
    } else if (Number.isFinite(xu.monthly_limit) && Number.isFinite(xu.used_credits)) {
      const used = xu.used_credits / 10 ** dp;
      left = xu.monthly_limit - used;
      if (Number.isFinite(xu.utilization) && xu.monthly_limit > 0) {
        const derived = (used / xu.monthly_limit) * 100;
        if (Math.abs(derived - xu.utilization) > 2) {
          left = xu.monthly_limit * (1 - xu.utilization / 100);
        }
      }
    }
    if (!Number.isFinite(left) || left <= 0) return null;
    const pct = Number.isFinite(xu.utilization) && Number.isFinite(xu.monthly_limit)
      ? xu.utilization : null;
    const age = Number.isFinite(cu.fetchedAtMs) ? Date.now() - cu.fetchedAtMs : null;
    return { left, pct, age };
  } catch { return null; }
}

// Local part of the account email (the deck line shows who, not the domain).
function accountName(oa) {
  const email = oa.emailAddress || "";
  if (email) return email.split("@")[0];
  if (oa.displayName) return oa.displayName;
  try { return userInfo().username; } catch { return process.env.USER || ""; }
}

// Repo name + branch + dirty count for the title. Best-effort, 1s timeouts.
function gitInfo(cwd) {
  if (!cwd) return null;
  const run = (args) =>
    execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 1000 }).trim();
  try {
    const branch = run(["rev-parse", "--abbrev-ref", "HEAD"]);
    if (!branch) return null;
    let repo = "";
    try { repo = basename(run(["rev-parse", "--show-toplevel"])); } catch { /* ignore */ }
    let dirty = 0;
    try { dirty = run(["status", "--porcelain"]).split("\n").filter(Boolean).length; } catch { /* ignore */ }
    return { repo, branch, dirty };
  } catch { return null; }
}

// resets_at (epoch s) → wall clock: "14:32" if within 24h, else weekday "Fri".
function resetClock(sec) {
  if (typeof sec !== "number") return null;
  const dt = new Date(sec * 1000);
  if (sec * 1000 - Date.now() < 24 * 3600 * 1000) {
    return `${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;
  }
  return dt.toLocaleDateString("en-US", { weekday: "short" });
}

function fmtDur(mins) {
  if (mins < 60) return `~${Math.max(1, Math.round(mins))}m`;
  return `~${Math.round(mins / 60)}h`;
}

// cache age → compact largest-unit form: 45m / 3h / 16d
function fmtAge(ms) {
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

// Meter hue by threshold: quiet green under 50, amber to 80, red above.
function level(pct) {
  if (pct >= 80) return C.danger;
  if (pct >= 50) return C.warn;
  return C.ok;
}

function bar(pct, width = 10) {
  let fill = Math.round((pct / 100) * width);
  if (pct > 0 && fill === 0) fill = 1;
  fill = Math.max(0, Math.min(width, fill));
  return level(pct) + "█".repeat(fill) + RS + C.track + "░".repeat(width - fill) + RS;
}

const effortColor = { low: C.dim, medium: C.ok, high: C.warn, xhigh: C.danger, max: C.danger };

// ---- MCP cache (detached refresh; rendered as a count) ----
const MCP_CACHE = process.env.STATUSLINE_MCP_CACHE || // test override
  join(homedir(), ".claude", "mcp-status.cache");
const MCP_TTL_MS = 120000;
function mcpRefreshIfStale() {
  let age = Infinity;
  try { age = Date.now() - statSync(MCP_CACHE).mtimeMs; } catch { /* none */ }
  if (age < MCP_TTL_MS) return;
  const tmp = `${MCP_CACHE}.tmp`;
  try { if (Date.now() - statSync(tmp).mtimeMs < 15000) return; } catch { /* no lock */ }
  try {
    spawn("sh", ["-c", `claude mcp list > "${tmp}" 2>/dev/null && mv "${tmp}" "${MCP_CACHE}"`],
      { detached: true, stdio: "ignore" }).unref();
  } catch { /* ignore */ }
}
// → {ok, bad} counts; auth-pending connectors are ignored (effectively disabled).
function mcpCounts() {
  mcpRefreshIfStale();
  let raw = "";
  try { raw = readFileSync(MCP_CACHE, "utf8"); } catch { return null; }
  let ok = 0, bad = 0;
  for (const line of raw.split("\n")) {
    const m = line.match(/^(.+?):\s+https?:\/\/.*?-\s+(.+)$/);
    if (!m) continue;
    const st = m[2];
    if (/Connected|✔/.test(st)) ok++;
    else if (/fail|✗|✘/i.test(st)) bad++;
  }
  return ok + bad > 0 ? { ok, bad } : null;
}

// ---- main ----
function main() {
  let data = {};
  try { data = JSON.parse(readStdin() || "{}"); } catch { /* bare */ }

  // Usage cache: last-known values per session + burn-rate samples.
  // rate_limits are account-global (reused across sessions); context/cost are
  // per-session. samples[] = {t, used} context-token samples for burn rate.
  const USAGE_CACHE = process.env.STATUSLINE_USAGE_CACHE || // test override
    join(homedir(), ".claude", "statusline-usage.cache");
  let cache = {};
  try { cache = JSON.parse(readFileSync(USAGE_CACHE, "utf8")); } catch { /* none */ }
  const sameSession = cache.session_id && cache.session_id === data.session_id;
  let cacheDirty = false;

  if (data.rate_limits != null) { cache.rate_limits = data.rate_limits; cacheDirty = true; }
  else if (cache.rate_limits != null) data.rate_limits = cache.rate_limits;

  let ownerDirty = false;
  for (const k of ["context_window", "cost"]) {
    if (data[k] != null) { cache[k] = data[k]; cacheDirty = true; ownerDirty = true; }
    else if (sameSession && cache[k] != null) data[k] = cache[k];
  }
  if (ownerDirty) cache.session_id = data.session_id;

  // burn-rate samples: only within one session, min 15s apart, keep last 6
  const ctx = data.context_window;
  let rate = null; // tokens per minute
  if (ctx && typeof ctx.used_percentage === "number" && ctx.context_window_size) {
    const used = Math.round((ctx.context_window_size * ctx.used_percentage) / 100);
    if (!sameSession) cache.samples = [];
    const s = cache.samples || [];
    const last = s[s.length - 1];
    if (!last || Date.now() - last.t > 15000) {
      s.push({ t: Date.now(), used });
      cache.samples = s.slice(-6);
      cacheDirty = true;
    }
    const win = cache.samples || [];
    if (win.length >= 2) {
      const dt = (win[win.length - 1].t - win[0].t) / 60000;
      const dTok = win[win.length - 1].used - win[0].used;
      if (dt > 0.2 && dTok > 0) rate = dTok / dt;
    }
  }
  if (cacheDirty) { try { writeFileSync(USAGE_CACHE, JSON.stringify(cache)); } catch { /* ignore */ } }

  const cj = claudeJson();
  const oa = oauthAccount(cj);
  const enterprise = isEnterprisePlan(oa);
  const cwd = data?.workspace?.current_dir || data?.cwd;
  const git = gitInfo(cwd);
  const rl = data?.rate_limits || {};
  const cost = data?.cost?.total_cost_usd;
  const mcp = mcpCounts();
  const credits = enterprise ? null : creditsInfo(cj);

  // Exactly two cases: the full approved deck line on one row, or — only when
  // that row would be cut off — the SAME content folded onto two rows: row 1 =
  // who/what (user, model), row 2 = the budgets. Nothing dropped or shortened.
  function buildGroups() {
    const id = [];
    const meters = [];

    //  user
    const user = accountName(oa);
    if (user) id.push(`${C.cyan}${I.user}${RS}  ${b(C.text, user)}`);

    //  model ·  effort (+ FAST)
    const model = data?.model?.display_name;
    if (model) {
      const eff = data?.effort?.level;
      const ec = (eff && effortColor[eff]) || C.teal;
      let g = `${C.purple}${I.chip}${RS}  ${t(model)}`;
      if (eff) g += ` ${ec}${I.bolt} ${eff}${RS}`;
      if (data?.fast_mode) g += ` ${b(C.danger, "FAST")}`;
      id.push(g);
    }

    //  output style — how Claude writes; the default stays quiet (dim)
    const style = data?.output_style?.name;
    if (style) {
      id.push(`${C.orange}${I.brush}${RS}  ${style === "default" ? d(style) : t(style)}`);
    }

    //  context: bar + bold % + ~time-left (falls back to tokens left)
    if (ctx && typeof ctx.used_percentage === "number") {
      const pct = ctx.used_percentage;
      const lc = level(pct);
      const size = ctx.context_window_size || 0;
      const leftTok = size ? Math.round((size * (100 - pct)) / 100) : 0;
      let extra = "";
      if (rate && leftTok) {
        const mins = leftTok / rate;
        extra = pct >= 80 ? ` ${C.danger}${I.fire} ${fmtDur(mins)}${RS}` : ` ${d(fmtDur(mins))}`;
      } else if (leftTok) {
        extra = ` ${d(`${Math.round(leftTok / 1000)}k`)}`;
      }
      meters.push(`${pct >= 80 ? C.danger : C.teal}${I.db}${RS}  ${bar(pct)} ${b(lc, Math.round(pct) + "%")}${extra}`);
    } else {
      meters.push(`${C.teal}${I.db}${RS}  ${d("—")}`);
    }

    //  5h (subscription only) — % +  wall-clock reset
    if (!enterprise) {
      const five = rl.five_hour;
      if (five && typeof five.used_percentage === "number") {
        const clock = resetClock(five.resets_at);
        meters.push(`${C.purple}${I.hour}${RS}  ${b(level(five.used_percentage), Math.round(five.used_percentage) + "%")}${clock ? ` ${d(I.clock + " " + clock)}` : ""}`);
      } else {
        meters.push(`${C.purple}${I.hour}${RS}  ${d("—")}`);
      }
    }

    //  credits — extra-usage money left; absent unless there is a positive number.
    // The balance is a cache Claude Code refreshes only occasionally — flag old readings.
    if (credits) {
      const col = credits.pct == null ? C.text : level(credits.pct);
      let g = `${C.ok}${I.card}${RS}  ${b(col, "$" + credits.left.toFixed(2))} ${d("left")}`;
      if (credits.age != null && credits.age > 3600 * 1000) g += ` ${d("(" + fmtAge(credits.age) + ")")}`;
      meters.push(g);
    }

    //  week — % +  wall-clock reset (all seats, when present)
    const week = rl.seven_day;
    if (week && typeof week.used_percentage === "number") {
      const clock = resetClock(week.resets_at);
      meters.push(`${C.orange}${I.cal}${RS}  ${b(level(week.used_percentage), Math.round(week.used_percentage) + "%")}${clock ? ` ${d(I.clock + " " + clock)}` : ""}`);
    } else if (!enterprise) {
      meters.push(`${C.orange}${I.cal}${RS}  ${d("—")}`);
    }

    //  cost — enterprise seats only (takes the collapsed 5h slot)
    if (enterprise) {
      const budget = Number(process.env.CLAUDE_COST_BUDGET);
      if (typeof cost === "number" && cost > 0 && budget > 0) {
        meters.push(`${C.ok}${I.dollar}${RS}  ${bar((cost / budget) * 100)} ${b(C.ok, "$" + cost.toFixed(2))} ${d("of $" + budget.toFixed(0))}`);
      } else if (typeof cost === "number" && cost > 0) {
        meters.push(`${C.ok}${I.dollar}${RS}  ${b(C.ok, "$" + cost.toFixed(2))}`);
      } else {
        meters.push(`${C.ok}${I.dollar}${RS}  ${d("—")}`);
      }
    }

    //  mcp — count; N/M in red while a server is down
    if (mcp) {
      meters.push(mcp.bad > 0
        ? `${C.danger}${I.puzzle}  ${mcp.ok}/${mcp.ok + mcp.bad}${RS}`
        : `${C.cyan}${I.puzzle}${RS}  ${d(String(mcp.ok))}`);
    }

    //  session duration
    const ms = data?.cost?.total_duration_ms;
    if (typeof ms === "number" && ms > 0) {
      const m = Math.round(ms / 60000);
      const dur = m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${m % 60}m`;
      meters.push(`${C.accent}${I.heart}${RS}  ${d(dur)}`);
    }

    return { id, meters };
  }

  // ---- title:  repo · branch ✱N (falls back to the cwd basename) ----
  let title = `${C.border}─ ${RS}${C.accent}${I.plane}${RS} `;
  if (git) {
    title += t(git.repo || basename(cwd || "") || "session");
    title += ` ${d("·")} ${a(git.branch)}`;
    if (git.dirty > 0) title += ` ${C.warn}✱${git.dirty}${RS}`;
  } else {
    title += t(cwd ? basename(cwd) : "session");
  }
  title += " ";

  // ---- assemble: one row when it fits; otherwise the same content on two
  // BALANCED rows — split where the two halves are closest in width, then
  // each row's gaps stretch so both fill the box edge-to-edge. ----
  const cols = termCols();
  const { id, meters } = buildGroups();
  const all = [...id, ...meters];
  const rowWidth = (gs) => gs.reduce((w, g) => w + vis(g), 0) + (gs.length - 1) * 5;

  // join with gaps stretched evenly so the row is exactly `target` wide
  function joinJustify(gs, target) {
    if (gs.length === 0) return "";
    if (gs.length === 1) return gs[0] + " ".repeat(Math.max(0, target - vis(gs[0])));
    let extra = Math.max(0, target - rowWidth(gs));
    const gaps = gs.length - 1;
    const per = Math.floor(extra / gaps);
    let rem = extra % gaps;
    let out = gs[0];
    for (let i = 1; i < gs.length; i++) {
      const add = per + (rem-- > 0 ? 1 : 0);
      const before = 2 + Math.ceil(add / 2);
      const after = 2 + Math.floor(add / 2);
      out += `${" ".repeat(before)}${C.track}│${RS}${" ".repeat(after)}${gs[i]}`;
    }
    return out;
  }

  // order-preserving split of the groups into n rows, minimizing the widest row
  function bestSplit(gs, n) {
    if (n === 1 || gs.length <= n) return { parts: [gs], max: rowWidth(gs) };
    let best = null;
    const cuts = (start, left) => {
      // enumerate cut positions recursively (tiny n, tiny group count)
      const walk = (i, acc) => {
        if (acc.length === left) {
          const points = [0, ...acc, gs.length];
          const parts = [];
          for (let p = 0; p < points.length - 1; p++) parts.push(gs.slice(points[p], points[p + 1]));
          const m = Math.max(...parts.map(rowWidth));
          if (!best || m < best.max) best = { parts, max: m };
          return;
        }
        for (let c = i; c < gs.length; c++) walk(c + 1, [...acc, c]);
      };
      walk(start, []);
    };
    cuts(1, n - 1);
    return best;
  }

  // rows with "DIV" (rendered as ├───┤) between each content row
  function layout(n) {
    const { parts, max } = bestSplit(all, n);
    const target = Math.max(max, vis(title));
    const rows = [];
    parts.forEach((p, i) => {
      if (i) rows.push("DIV");
      rows.push(joinJustify(p, target));
    });
    return { rows, width: target + 4 };
  }

  // three cases: one row → two rows → three rows, first that fits (last wins)
  let rows;
  const one = layout(1);
  if (Math.max(one.width, vis(title) + 4) <= cols - 1 || all.length < 2) {
    rows = one.rows;
  } else {
    const two = layout(2);
    rows = two.width <= cols - 1 ? two.rows : layout(3).rows;
  }

  const iw = Math.max(...rows.map((r) => vis(r) + 2), vis(title) + 2);
  const top = `${C.border}╭${RS}${title}${C.border}${"─".repeat(iw - vis(title))}╮${RS}`;
  const mids = rows.map((r) =>
    r === "DIV"
      ? `${C.border}├${"─".repeat(iw)}┤${RS}`
      : `${C.border}│${RS} ${r}${" ".repeat(iw - 2 - vis(r))} ${C.border}│${RS}`,
  );
  const bottom = `${C.border}╰${"─".repeat(iw)}╯${RS}`;

  // Trailing U+2800 spacer survives the status-line trimmer (blank gap above input).
  process.stdout.write(`${top}\n${mids.join("\n")}\n${bottom}\n⠀`);
}

main();
