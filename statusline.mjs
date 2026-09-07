#!/usr/bin/env node
// fold-statusline — the Fold status line for Claude Code.
// Installed as ~/.claude/statusline.mjs by `npx github:SamiAbi/fold-statusline`.
//
// Six facts in a framed table, nothing else:
//   who · model+effort · context · 5h limit · week limit · Fable week limit
//
// Where each fact comes from:
//   who      ~/.claude.json  → oauthAccount.emailAddress
//   model    stdin payload   → model.display_name + effort.level
//   context  stdin payload   → context_window.used_percentage
//   5h / 7d  stdin payload   → rate_limits.five_hour / .seven_day   (live)
//   Fable    api.anthropic.com/api/oauth/usage, refreshed in the
//            background into ~/.claude/status-limits.json — the payload
//            does not carry per-model weekly limits.

import fs from "node:fs";
import os from "node:os";
import { spawn, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HOME = os.homedir();
const SELF = fileURLToPath(import.meta.url);
const LIMITS_CACHE = `${HOME}/.claude/status-limits.json`;
const LIMITS_MAX_AGE_MS = 120_000;

// ── background refresh mode ────────────────────────────────────────────────
if (process.argv[2] === "--refresh") { await refreshLimits(); process.exit(0); }

// ── paint ──────────────────────────────────────────────────────────────────
const E = "\x1b[0m";
const fg = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return `\x1b[38;2;${(n >> 16) & 255};${(n >> 8) & 255};${n & 255}m`;
};
const C = {
  mail: fg("#7dcfff"),   // cyan
  name: fg("#c8c8d4"),
  model: fg("#bb9af7"),  // purple
  effort: fg("#ff9e64"), // orange
  badge: fg("#2ac3de"),  // teal
  label: fg("#6a6a80"),
  dim: fg("#5a5a70"),
  rule: fg("#3a3a4c"),
  ok: fg("#9ece6a"),     // green
  warn: fg("#e0af68"),   // amber
  hot: fg("#f7768e"),    // red
  empty: fg("#33334a"),
};
const B = "\x1b[1m";
const paint = (c, s) => `${c}${s}${E}`;
const bold = (c, s) => `${c}${B}${s}${E}`;

// Icons, as \u escapes on purpose: literal PUA glyphs are invisible in an
// editor and a stray deletion looks like nothing happened.
//
// Inside Fold the Fold Icons font is on the terminal (U+E900-E913, a range no
// Nerd Font occupies). Everywhere else the Nerd Font originals, since only
// Fold ships that font. STATUS_ICONS=fold|nerd forces either way.
const inFold =
  process.env.FOLD === "1" ||
  (process.env.GHOSTTY_RESOURCES_DIR || "").includes("Fold.app");

const FOLD = {
  user: "\ue900", chip: "\ue901", db: "\ue903", dbHot: "\ue90e",
  hour: "\ue904", cal: "\ue905", clock: "\ue906",
  // Fold draws the effort bolt at four heights; the Nerd set has only one.
  bolt: { low: "\ue910", medium: "\ue911", high: "\ue912", max: "\ue913" },
  boltAny: "\ue902",
};
const NERD = {
  user: "\uf2bd",  // user-circle
  chip: "\uf2db",  // microchip
  db: "\uf1c0",    // database = context
  dbHot: "\uf06d", // fire = context nearly spent
  hour: "\uf252",  // hourglass-half = 5h window
  cal: "\uf073",   // calendar = a weekly window
  clock: "\uf017", // reset time
  bolt: {},
  boltAny: "\uf0e7",
};
const ICON = (process.env.STATUS_ICONS ?? (inFold ? "fold" : "nerd")) === "fold" ? FOLD : NERD;
const boltFor = (level) => ICON.bolt[String(level).toLowerCase()] ?? ICON.boltAny;

const level = (pct) => (pct >= 80 ? C.hot : pct >= 50 ? C.warn : C.ok);

// Bar length in cells. Short bars read as a stub — at six cells a full bar is
// a thumbnail and 98% looks like nothing. STATUS_BAR overrides.
const CELLS = (() => {
  const n = Number(process.env.STATUS_BAR);
  return Number.isFinite(n) && n >= 4 ? Math.round(n) : 16;
})();
function bar(pct) {
  const p = Math.max(0, Math.min(100, pct));
  // Any real usage shows at least one lit cell — an empty bar means zero.
  let full = Math.round((p / 100) * CELLS);
  if (p > 0 && full === 0) full = 1;
  return paint(level(p), "█".repeat(full)) + paint(C.empty, "░".repeat(CELLS - full));
}

// Every row is: icon, label column, then the value. The label column and the
// percent are padded to a fixed width so the bars and numbers stack.
const LABEL_W = 5;
const lab = (text) => paint(C.label, text.padEnd(LABEL_W));

function meter(icon, label, pct, resetsAt, { withDay = false, hotIcon = null } = {}) {
  const glyph = hotIcon && Number.isFinite(pct) && pct >= 80 ? hotIcon : icon;
  const head = `${paint(Number.isFinite(pct) ? level(pct) : C.label, glyph)} ${lab(label)}`;
  if (pct === null || pct === undefined || !Number.isFinite(pct)) {
    return `${head} ${paint(C.dim, "\u2014")}`;
  }
  const p = Math.round(pct);
  const clock = resetsAt ? clockOf(resetsAt, withDay) : "";
  return (
    `${head} ${bar(p)} ${bold(level(p), String(p + "%").padStart(4))}` +
    (clock ? `  ${paint(C.dim, ICON.clock + " " + clock)}` : "")
  );
}

function clockOf(when, withDay) {
  // Two shapes in the wild: unix seconds (the stdin payload) and an ISO
  // string (the usage endpoint).
  const d = typeof when === "number" ? new Date(when * 1000) : new Date(when);
  if (!Number.isFinite(d.getTime())) return "";
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const sameDay = d.toDateString() === new Date().toDateString();
  if (sameDay || !withDay) return `${hh}:${mm}`;
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()];
  return `${day} ${hh}:${mm}`;
}

// ── facts ──────────────────────────────────────────────────────────────────
const payload = await readStdin();

function accountEmail() {
  try {
    const j = JSON.parse(fs.readFileSync(`${HOME}/.claude.json`, "utf8"));
    return j?.oauthAccount?.emailAddress ?? null;
  } catch { return null; }
}

function readLimitsCache() {
  try {
    const j = JSON.parse(fs.readFileSync(LIMITS_CACHE, "utf8"));
    return j && typeof j === "object" ? j : null;
  } catch { return null; }
}

// Pick the weekly limit scoped to one model out of whatever shape the usage
// endpoint hands back. Two known shapes: a `limits` array of weekly_scoped
// entries carrying scope.model.display_name, and flat seven_day_<model> keys.
function scopedWeek(raw, wanted) {
  if (!raw) return null;
  const want = wanted.toLowerCase();
  const rl = raw.rate_limits ?? raw;

  for (const entry of rl?.limits ?? []) {
    const name = entry?.scope?.model?.display_name;
    if (!name || !name.toLowerCase().includes(want)) continue;
    const pct = entry.percent ?? entry.utilization;
    if (pct === null || pct === undefined) continue;
    return { name, pct, resetsAt: entry.resets_at ?? null };
  }

  for (const [key, v] of Object.entries(rl ?? {})) {
    if (!key.startsWith("seven_day_") || !key.slice(10).toLowerCase().includes(want)) continue;
    const pct = v?.utilization ?? v?.percent ?? v?.used_percentage;
    if (pct === null || pct === undefined) continue;
    return { name: wanted, pct, resetsAt: v?.resets_at ?? null };
  }
  return null;
}

const email = accountEmail();
// "Opus 5 (1M context)" says the same thing twice once the 1M badge is on the
// row, and the parenthetical drags the whole value column wider. Keep the
// short name, let the badge carry the fact.
const modelRaw = payload?.model?.display_name ?? null;
const model = modelRaw ? modelRaw.replace(/\s*\(1M context\)\s*/i, "").trim() : null;
const modelId = payload?.model?.id ?? "";
const effort = payload?.effort?.level ?? null;
const wide = /\[1m\]/i.test(modelId) || /1m context/i.test(modelRaw ?? "");

const ctxPct = payload?.context_window?.used_percentage ?? null;
const fivePayload = payload?.rate_limits?.five_hour ?? null;
const weekPayload = payload?.rate_limits?.seven_day ?? null;

const cache = readLimitsCache();

// The payload has no rate_limits until the session's first API reply, so a
// fresh session would draw three dashes. The usage endpoint we already poll
// for Fable carries the same two numbers — use them until the live ones land.
function cachedLimit(key) {
  const rl = cache?.raw?.rate_limits ?? cache?.raw;
  const v = rl?.[key];
  const pct = v?.utilization ?? v?.percent;
  return Number.isFinite(pct) ? { used_percentage: pct, resets_at: v?.resets_at ?? null } : null;
}
if (!cache || Date.now() - (cache.fetchedAt ?? 0) > LIMITS_MAX_AGE_MS) kickRefresh();
const five = fivePayload ?? cachedLimit("five_hour");
const week = weekPayload ?? cachedLimit("seven_day");
const fable = scopedWeek(cache?.raw, "fable");

// ── the table ──────────────────────────────────────────────────────────────
// Every row is the same four cells, so the columns line up down the whole
// block: glyph, label, value, amount, when. A row that has nothing to put in
// a cell leaves it empty rather than closing the gap.
//
//   glyph  label   value    amount   when
//   ────────────────────────────────────────────
//    email   samyabab@…      (spans value..when)
//    model   Opus 5     high      1M
//    ctx     █░░░░░       7%
//    5h      █░░░░░      12%   14:00

const bare = (s) => s.replace(/\x1b\[[0-9;]*m/g, "");
// Nerd Font and Fold PUA glyphs each draw in one cell, so counting code
// points — not UTF-16 units — is the right measure.
const cells = (s) => [...bare(s)].length;
const padL = (s, w) => s + " ".repeat(Math.max(0, w - cells(s)));
const padR = (s, w) => " ".repeat(Math.max(0, w - cells(s))) + s;

const table = [];

// A spanning row: value..when is one run, not three columns.
table.push({
  glyph: paint(C.mail, ICON.user),
  label: "email",
  span: email ? paint(C.name, email) : paint(C.dim, "signed out"),
});

table.push({
  glyph: paint(C.model, ICON.chip),
  label: "model",
  span: [
    bold(C.model, model ?? "—"),
    effort ? paint(C.effort, boltFor(effort) + " " + effort) : "",
    wide ? paint(C.badge, "1M") : "",
  ].filter(Boolean).join("  "),
});

for (const m of [
  { icon: ICON.db, hot: ICON.dbHot, label: "ctx", pct: ctxPct, at: null, day: false },
  { icon: ICON.hour, label: "5h", pct: five?.used_percentage, at: five?.resets_at, day: false },
  { icon: ICON.cal, label: "week", pct: week?.used_percentage, at: week?.resets_at, day: true },
  { icon: ICON.cal, label: "fable", pct: fable?.pct ?? null, at: fable?.resetsAt, day: true },
]) {
  const p = Number.isFinite(m.pct) ? Math.round(m.pct) : null;
  const glyph = p !== null && m.hot && p >= 80 ? m.hot : m.icon;
  const clock = p !== null && m.at ? clockOf(m.at, m.day) : "";
  table.push({
    glyph: paint(p === null ? C.label : level(p), glyph),
    label: m.label,
    value: p === null ? paint(C.dim, "—") : bar(p),
    amount: p === null ? "" : bold(level(p), p + "%"),
    when: clock ? paint(C.dim, ICON.clock + " " + clock) : "",
  });
}

// Column widths come from the rows that actually have columns; a spanning row
// must not stretch them.
// ── grid ───────────────────────────────────────────────────────────────────
const GUT = "  "; // one gutter between every pair of columns
// STATUS_ALIGN=left  — every column starts at the same place, nothing pushed right
// STATUS_ALIGN=grid  — same columns, but the numbers right-align so digits stack
const RIGHT = (process.env.STATUS_ALIGN ?? "left").toLowerCase() === "grid";
const put = (s, w) => (RIGHT ? padR(s, w) : padL(s, w));

// Lay a set of rows out as its own grid: column widths come from just these
// rows, so two side-by-side blocks never stretch each other. Spanning rows
// (email, model) run across value..when and are kept out of the width maths.
function grid(part) {
  const boxed = part.filter((r) => r.span === undefined);
  const W = {
    glyph: Math.max(...part.map((r) => cells(r.glyph))),
    label: Math.max(...part.map((r) => cells(r.label))),
    value: boxed.length ? Math.max(...boxed.map((r) => cells(r.value))) : 0,
    amount: boxed.length ? Math.max(...boxed.map((r) => cells(r.amount))) : 0,
    when: boxed.length ? Math.max(...boxed.map((r) => cells(r.when))) : 0,
  };
  const line = (r) => {
    const head = padL(r.glyph, W.glyph) + GUT + padL(paint(C.label, r.label), W.label);
    if (r.span !== undefined) return head + GUT + r.span;
    return (
      head + GUT + padL(r.value, W.value) +
      GUT + put(r.amount, W.amount) +
      GUT + padL(r.when, W.when)
    );
  };
  const lines = part.map(line);
  const w = Math.max(...lines.map(cells));
  return { lines: lines.map((l) => padL(l, w)), width: w };
}

// ── frame ──────────────────────────────────────────────────────────────────
//   STATUS_LAYOUT = 2col (default) | 1col
//   STATUS_BORDER = on (default) | off
//   STATUS_SEP    = rule (default) | blank | none
//
// Claude Code post-processes our output with
//   stdout.trim().split("\n").flatMap((l) => l.trim() || []).join("\n")
// so it DELETES every whitespace-only line. U+2800 BRAILLE PATTERN BLANK
// draws as empty but is not whitespace, so a blank spacer survives it.
const BLANK = "⠀";
const TWO = (process.env.STATUS_LAYOUT ?? "2col").toLowerCase() !== "1col";
const SEP = (process.env.STATUS_SEP ?? "rule").toLowerCase();
const BORDER = (process.env.STATUS_BORDER ?? "on").toLowerCase() !== "off";
const PAD = 2;
const rule = (n) => "─".repeat(n);
const wall = paint(C.rule, "│");
const air = " ".repeat(PAD);

// Two columns: who-and-context on the left, the three limits on the right.
const parts = TWO ? [grid(table.slice(0, 3)), grid(table.slice(3))] : [grid(table)];
const height = parts[0].lines.length;
const spans = parts.map((p) => p.width + PAD * 2);

const body = Array.from({ length: height }, (_, i) =>
  parts.map((p) => p.lines[i]).join(air + (BORDER ? wall : paint(C.rule, "│")) + air)
);

const join = (l, mid, r) => paint(C.rule, l + spans.map(rule).join(mid) + r);
const out = [];

if (BORDER) {
  out.push(join("╭", "┬", "╮"));
  body.forEach((r, i) => {
    if (i && SEP !== "none") {
      out.push(SEP === "blank"
        ? wall + air + spans.map((n) => padL(BLANK, n - PAD * 2)).join(air + wall + air) + air + wall
        : join("├", "┼", "┤"));
    }
    out.push(wall + air + r + air + wall);
  });
  out.push(join("╰", "┴", "╯"));
} else {
  const flat = Math.max(...body.map(cells));
  body.forEach((r, i) => {
    if (i && SEP !== "none") out.push(SEP === "blank" ? BLANK : paint(C.rule, rule(flat)));
    out.push(r);
  });
}

process.stdout.write(out.join("\n"));

// ── plumbing ───────────────────────────────────────────────────────────────
function readStdin() {
  return new Promise((resolve) => {
    let buf = "";
    if (process.stdin.isTTY) return resolve(null);
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => (buf += c));
    process.stdin.on("end", () => { try { resolve(JSON.parse(buf)); } catch { resolve(null); } });
    process.stdin.on("error", () => resolve(null));
  });
}

// Never block the bar on the network: fire a detached refresh and draw the
// cache we already have.
function kickRefresh() {
  try {
    spawn(process.execPath, [SELF, "--refresh"], { detached: true, stdio: "ignore" }).unref();
  } catch {}
}

async function refreshLimits() {
  const stamp = () => { try { fs.writeFileSync(LIMITS_CACHE, JSON.stringify({ ...(readLimitsCache() ?? {}), fetchedAt: Date.now() })); } catch {} };
  const token = oauthToken();
  if (!token) return stamp();
  try {
    const r = await fetch("https://api.anthropic.com/api/oauth/usage", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return stamp();
    const raw = await r.json();
    fs.writeFileSync(LIMITS_CACHE, JSON.stringify({ fetchedAt: Date.now(), raw }, null, 2));
  } catch { stamp(); }
}

// The live token lives in the login keychain; the file copy goes stale.
function oauthToken() {
  const tries = [];
  try {
    tries.push(JSON.parse(execFileSync("security",
      ["find-generic-password", "-s", "Claude Code-credentials", "-w"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })));
  } catch {}
  try { tries.push(JSON.parse(fs.readFileSync(`${HOME}/.claude/.credentials.json`, "utf8"))); } catch {}
  for (const j of tries) {
    const o = j?.claudeAiOauth;
    if (o?.accessToken && Date.now() < (o.expiresAt ?? 0)) return o.accessToken;
  }
  return null;
}
