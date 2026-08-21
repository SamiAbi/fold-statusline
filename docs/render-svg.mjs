#!/usr/bin/env node
// Renders the deck line to the SVGs the README embeds. Runs statusline.mjs for
// real — same code path as a live render — inside a scratch HOME and a scratch
// git repo, so the sample is hermetic and nobody's actual account, MCP list or
// checkout leaks into a committed file. ANSI runs become <tspan>s on the cell
// grid; Fold Icons rides along as an embedded @font-face, so the previews show
// the same glyphs a Fold terminal draws.
//
//   node docs/render-svg.mjs
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CELL = 8.4, LINE = 21, PAD_X = 18, BASE = 31.8, FONT = 14;

// ---- the sample session the README shows ----
const PAYLOAD = {
  session_id: "readme",
  model: { display_name: "Opus 5" },
  effort: { level: "high" },
  output_style: { name: "default" },
  context_window: { used_percentage: 62.4, context_window_size: 1000000 },
  rate_limits: {
    five_hour: { used_percentage: 41, resets_at: 0 },
    seven_day: { used_percentage: 12, resets_at: 0 },
  },
  cost: { total_duration_ms: 4380000 },
};

// ---- scratch HOME: account name + a settled MCP count, nothing real ----
const HOME = mkdtempSync(join(tmpdir(), "deckline-home-"));
mkdirSync(join(HOME, ".claude"));
writeFileSync(join(HOME, ".claude.json"),
  JSON.stringify({ oauthAccount: { emailAddress: "samiabishai@example.com" } }));
writeFileSync(join(HOME, ".claude", "mcp-status.cache"),
  ["github", "linear", "sentry", "figma"].map((n) => `${n}: https://x - ✔ Connected`).join("\n"));

// ---- scratch repo: repo name, branch, three dirty files ----
// realpath, or macOS's /var -> /private/var symlink makes gitInfo() read the
// checkout as a linked worktree and the title grows a worktree it does not have
const REPO = join(realpathSync(mkdtempSync(join(tmpdir(), "deckline-repo-"))), "fold");
mkdirSync(REPO);
const git = (...a) => execFileSync("git", a, { cwd: REPO, stdio: "ignore" });
git("init", "-q", "-b", "main");
git("-c", "user.email=a@b", "-c", "user.name=a", "commit", "-q", "--allow-empty", "-m", "x");
for (const f of ["a", "b", "c"]) writeFileSync(join(REPO, f), "x");

// resets_at is relative to render time, so the wall clocks stay plausible
const now = Date.now() / 1000;
PAYLOAD.rate_limits.five_hour.resets_at = Math.round(now + 2.6 * 3600);
PAYLOAD.rate_limits.seven_day.resets_at = Math.round(now + 3.4 * 86400);
PAYLOAD.workspace = { current_dir: REPO };

function render(cols) {
  return execFileSync("node", [join(ROOT, "statusline.mjs")], {
    input: JSON.stringify(PAYLOAD),
    encoding: "utf8",
    env: { ...process.env, HOME, STATUSLINE_COLS: String(cols), FOLD_STATUSLINE_ICONS: "fold", FOLD: "1" },
  }).replace(/\n⠀$/, "").split("\n");
}

// ---- ANSI → coloured runs ----
const ANSI = /\x1b\[([0-9;]*)m/g;
function runs(line) {
  const out = [];
  let fill = "rgb(213,213,224)", bold = false, i = 0, m;
  ANSI.lastIndex = 0;
  const push = (text) => { if (text) out.push({ text, fill, bold }); };
  while ((m = ANSI.exec(line))) {
    push(line.slice(i, m.index));
    for (const code of m[1].split(";").reduce((acc, c, k, arr) => {
      if (c === "38" && arr[k + 1] === "2") acc.push(["rgb", arr[k + 2], arr[k + 3], arr[k + 4]]);
      else if (c === "0") acc.push(["reset"]);
      else if (c === "1") acc.push(["bold"]);
      return acc;
    }, [])) {
      if (code[0] === "reset") { fill = "rgb(213,213,224)"; bold = false; }
      else if (code[0] === "bold") bold = true;
      else fill = `rgb(${code[1]},${code[2]},${code[3]})`;
    }
    i = m.index + m[0].length;
  }
  push(line.slice(i));
  return out;
}

const esc = (x) => x.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const FONT_B64 = readFileSync(join(ROOT, "font", "FoldIcons.ttf")).toString("base64");

function svg(blocks, file) {
  const cols = Math.max(...blocks.flat().map((l) => [...l.replace(ANSI, "")].length));
  let y = BASE, texts = [];
  blocks.forEach((block, bi) => {
    if (bi) y += LINE * 2;
    for (const line of block) {
      let col = 0;
      const spans = runs(line).map((r) => {
        const n = [...r.text].length;
        const x = PAD_X + col * CELL;
        col += n;
        if (!r.text.trim()) return "";
        return `<tspan x="${x.toFixed(1)}" textLength="${(n * CELL).toFixed(1)}" lengthAdjust="spacingAndGlyphs"` +
          ` style="fill:${r.fill};${r.bold ? "font-weight:700;" : ""}">${esc(r.text)}</tspan>`;
      }).join("");
      texts.push(`<text y="${y.toFixed(1)}" xml:space="preserve">${spans}</text>`);
      y += LINE;
    }
  });
  const w = Math.round(PAD_X * 2 + cols * CELL);
  const h = Math.round(y - BASE + 20);
  const out = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<style>@font-face{font-family:FoldIcons;src:url(data:font/ttf;base64,${FONT_B64}) format("truetype");unicode-range:U+E900-E913;}text{font-family:FoldIcons,"Maple Mono NF",ui-monospace,SFMono-Regular,Menlo,monospace;font-size:${FONT}px;white-space:pre;}</style>
<rect width="${w}" height="${h}" rx="12" fill="#131319"/>
${texts.join("\n")}
</svg>
`;
  writeFileSync(join(ROOT, "docs", file), out);
  console.log(file, `${w}×${h}`, `${cols} cols`);
}

svg([render(9999)], "preview.svg");
svg([render(120), render(80)], "folding.svg");
