#!/usr/bin/env node
// Renders the status line to the SVGs the README embeds. Runs statusline.mjs
// for real — the same code path as a live render — inside a scratch HOME, so
// the sample is hermetic: nobody's account, token or limits leak into a
// committed file. ANSI runs become <tspan>s on the cell grid; Fold Icons rides
// along as an embedded @font-face, so the previews show the glyphs a Fold
// terminal draws.
//
//   node docs/render-svg.mjs        (needs font/FoldIcons.ttf: npm run build:font)
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CELL = 8.4, LINE = 21, PAD_X = 18, BASE = 31.8, FONT = 14;

// ---- the sample session the README shows ----
const now = Date.now();
const at = (h) => new Date(now + h * 3600_000);
const PAYLOAD = {
  session_id: "readme",
  model: { id: "claude-opus-5[1m]", display_name: "Opus 5 (1M context)" },
  effort: { level: "high" },
  context_window: { used_percentage: 7 },
  rate_limits: {
    five_hour: { used_percentage: 13, resets_at: Math.round(at(2.6).getTime() / 1000) },
    seven_day: { used_percentage: 55, resets_at: Math.round(at(3.4 * 24).getTime() / 1000) },
  },
};

// ---- scratch HOME: an account name and a settled limits cache, nothing real.
// fetchedAt is fresh so the script never kicks a background refresh (which
// would read the login keychain) while rendering a picture.
const HOME = mkdtempSync(join(tmpdir(), "fold-statusline-home-"));
mkdirSync(join(HOME, ".claude"));
writeFileSync(join(HOME, ".claude.json"),
  JSON.stringify({ oauthAccount: { emailAddress: "sami@example.com" } }));
writeFileSync(join(HOME, ".claude", "status-limits.json"), JSON.stringify({
  fetchedAt: now,
  raw: {
    limits: [{
      kind: "weekly_scoped", percent: 98, resets_at: at(1.2 * 24).toISOString(),
      scope: { model: { display_name: "Claude Fable 5.1" } },
    }],
  },
}));

function render(env = {}) {
  return execFileSync("node", [join(ROOT, "statusline.mjs")], {
    input: JSON.stringify(PAYLOAD),
    encoding: "utf8",
    env: { ...process.env, HOME, STATUS_ICONS: "fold", FOLD: "1", ...env },
  }).split("\n");
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

svg([render()], "preview.svg");
svg([render({ STATUS_LAYOUT: "1col" })], "stacked.svg");
