#!/usr/bin/env node
// Build FoldIcons.ttf from the glyph definitions.
//   node font/build.mjs
// Outputs: font/FoldIcons.ttf (committed) and font/preview.html (visual QA).

import { Readable } from "node:stream";
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SVGIcons2SVGFontStream } from "svgicons2svgfont";
import svg2ttf from "svg2ttf";
import { toPathD } from "./lib/geo.mjs";
import { GLYPHS } from "./glyphs.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

// Cell geometry lives in lib/cell.mjs, shared with the color-strike build.
import { ADV, tf, toFontX, toFontY } from "./lib/cell.mjs";

function glyphSVG({ paths }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${ADV}" height="1000" viewBox="0 0 ${ADV} 1000"><path d="${toPathD(paths, tf)}"/></svg>`;
}

const fontStream = new SVGIcons2SVGFontStream({
  fontName: "Fold Icons",
  fontHeight: 1000,
  descent: 200,
  normalize: false,
  log: () => {},
});

let svgFont = "";
fontStream.on("data", (chunk) => (svgFont += chunk));
fontStream.on("end", () => {
  const ttf = svg2ttf(svgFont, { description: "Fold deck-line icon font", url: "https://github.com/SamiAbi/fold-statusline" });
  writeFileSync(join(HERE, "FoldIcons.ttf"), Buffer.from(ttf.buffer));
  writeFileSync(join(HERE, "colr-layers.json"), JSON.stringify(layerJSON()));
  writeFileSync(join(HERE, "preview.html"), previewHTML());
  console.log(`FoldIcons.ttf — ${GLYPHS.length} glyphs at U+E900–U+E9${(0x00 + GLYPHS.length - 1).toString(16).toUpperCase().padStart(2, "0")}`);
  console.log("now run: python3 font/colorize.py   (adds the COLR/CPAL two-tone fold)");
});

// The lit/shadow faces for colorize.py, in font units: same cell transform as
// the base glyphs, y flipped into font space (baseline at 0, ascent 800).
function layerJSON() {
  const toFont = ([x, y]) => { const [fx, fy] = tf([x, y]); return [Math.round(fx), Math.round(800 - fy)]; };
  const conv = (subs) => subs.map(({ pts }) => pts.map(toFont));
  return {
    advance: ADV,
    shadow: { color: "#8b8b9f", alpha: 0.5 },
    glyphs: Object.fromEntries(GLYPHS.map((g) => [g.code,
      { name: g.name, lit: conv(g.lit), shadow: conv(g.shadow) }])),
  };
}

for (const g of GLYPHS) {
  const stream = Readable.from([glyphSVG(g)]);
  stream.metadata = { unicode: [String.fromCharCode(g.code)], name: g.name };
  fontStream.write(stream);
}
fontStream.end();

// ---- visual QA page: the built TTF at design size and at terminal sizes ----
function previewHTML() {
  const rows = GLYPHS.map((g) => {
    const ch = `&#x${g.code.toString(16)};`;
    return `<tr><td class="n">${g.name}<br><span class="cp">U+${g.code.toString(16).toUpperCase()}</span></td>
      <td class="big">${ch}</td>
      ${[12, 14, 16, 20].map((s) => `<td class="cell" style="font-size:${s}px">${ch}</td>`).join("")}
      <td class="ctx" style="font-size:14px">${ch} main <span class="acc">fold/icons</span> ${ch} 42% ${ch} 18:30</td></tr>`;
  }).join("\n");
  return `<!doctype html><meta charset="utf-8"><title>Fold Icons preview</title>
<style>
  @font-face { font-family: "Fold Icons"; src: url("FoldIcons.ttf"); }
  body { background: #16161e; color: #d5d5e0; font-family: "Maple Mono NF", "SF Mono", Menlo, monospace; padding: 24px; }
  table { border-collapse: collapse; }
  td { border: 1px solid #2c2c3a; padding: 8px 14px; text-align: center; }
  .n { font-size: 12px; color: #71718a; text-align: left; }
  .cp { color: #4a4a5e; }
  .big { font-size: 96px; line-height: 1; }
  .big, .cell, .ctx { font-family: "Fold Icons", monospace; color: #7dcfff; }
  .ctx { text-align: left; color: #d5d5e0; }
  .acc { color: #7aa2f7; }
</style>
<h3 style="font-weight:normal">Fold Icons — built TTF</h3>
<table>${rows}</table>`;
}
