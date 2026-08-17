#!/usr/bin/env node
// Render the color strikes for FoldIcons.ttf — one SVG per glyph per strike
// size, in the glyph's BAKED color. colorize.py packs the rasterized PNGs
// into an sbix table (the mechanism emoji ship by), which is the only color
// format native CoreText/Ghostty terminals actually rasterize — COLR they
// silently flatten to the outline.
//
//   node font/render-strikes.mjs        (after build.mjs)
//
// Outputs font/strikes/<glyph>-<ppem>.svg + font/strikes/manifest.json.
// Rasterization to PNG happens in colorize.py's caller (qlmanage).
//
// Colors are the statusline's own palette. A bitmap glyph can't follow ANSI
// color, so every state that used to be an ANSI tint is its own glyph:
// dbHot/puzzleDown/boltMax bake danger red, the bolt's effort scale bakes
// its four hues, everything else bakes the muted icon grey — lit face
// full-strength, shadow face at 50%, exactly the design's fold.

import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { GLYPHS } from "./glyphs.mjs";
import { MARK } from "./design-icons.mjs";
import { toPathD } from "./lib/geo.mjs";
import { S as CELL_S, X_OFF, Y_OFF, ASCENT, STRIKE_BOX } from "./lib/cell.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "strikes");
mkdirSync(OUT, { recursive: true });

const PPEMS = [10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,30,32,34,36,40,44,48,52,56,64];

// glyph name → baked color (lit face; shadow renders at 50% of it)
const TONE = {
  user: "#8b8b9f", chip: "#8b8b9f", bolt: "#8b8b9f", db: "#8b8b9f",
  hour: "#8b8b9f", cal: "#8b8b9f", puzzle: "#8b8b9f", heart: "#8b8b9f",
  brush: "#8b8b9f", dollar: "#8b8b9f", wtree: "#8b8b9f",
  clock: "#71718a",                                   // rendered inside dim text
  fire: "#f7768e",                                    // only ever shown hot
  dbHot: "#f7768e", puzzleDown: "#f7768e",
  boltLow: "#71718a", boltMed: "#9ece6a", boltHigh: "#e0af68", boltMax: "#f7768e",
};

// The shared image box, converted from font units to the design grid the
// artwork lives in (inverse of the cell transform).
const BOX = {
  minX: (STRIKE_BOX.x0 - X_OFF) / CELL_S,
  maxX: (STRIKE_BOX.x1 - X_OFF) / CELL_S,
  minY: (ASCENT - STRIKE_BOX.y1 - Y_OFF) / CELL_S,
  maxY: (ASCENT - STRIKE_BOX.y0 - Y_OFF) / CELL_S,
};

const manifest = { glyphs: {} };

function emit(name, code, svgBody) {
  // Every strike shares the same full-em image box (see STRIKE_BOX), plus a
  // 2px transparent guard border: renderers quantize bitmap placement to
  // whole pixels, and any off-by-one lands in the border instead of clipping
  // or wrapping glyph ink.
  const GUARD = 2;
  const entry = { code, strikes: {} };
  for (const ppem of PPEMS) {
    const iw = Math.round(((STRIKE_BOX.x1 - STRIKE_BOX.x0) * ppem) / 1000);
    const ih = Math.round(((STRIKE_BOX.y1 - STRIKE_BOX.y0) * ppem) / 1000);
    const ux = (BOX.maxX - BOX.minX) / iw, uy = (BOX.maxY - BOX.minY) / ih; // design units per px
    const w = iw + 2 * GUARD, h = ih + 2 * GUARD;
    const vb = `${BOX.minX - GUARD * ux} ${BOX.minY - GUARD * uy} ${(BOX.maxX - BOX.minX) + 2 * GUARD * ux} ${(BOX.maxY - BOX.minY) + 2 * GUARD * uy}`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${vb}">${svgBody}</svg>`;
    const file = `${name}-${ppem}.svg`;
    writeFileSync(join(OUT, file), svg);
    entry.strikes[ppem] = {
      file, w, h,
      originOffsetX: Math.round((STRIKE_BOX.x0 * ppem) / 1000) - GUARD,
      originOffsetY: Math.round((STRIKE_BOX.y0 * ppem) / 1000) - GUARD,
    };
  }
  manifest.glyphs[name] = entry;
}

for (const g of GLYPHS) {
  if (g.name === "mark") continue; // gradient-colored below
  const tone = TONE[g.name];
  if (!tone) throw new Error(`no tone for ${g.name}`);
  const body =
    `<path d="${toPathD(g.shadow)}" fill="${tone}" fill-opacity="0.5"/>` +
    `<path d="${toPathD(g.lit)}" fill="${tone}"/>`;
  emit(g.name, g.code, body);
}

// -- the mark: the logo's own gradients, verbatim from brand/logo.html ------
{
  const vb = MARK.viewBox;
  const s = (17.6 / vb.h) * (1000 / 24); // logo box → 24-grid → design grid
  const ox = ((24 - vb.w * (17.6 / vb.h)) / 2) * (1000 / 24);
  const oy = ((24 - 17.6) / 2) * (1000 / 24);
  const pt = ([x, y]) => [ox + (x - vb.x) * s, oy + (y - vb.y) * s];
  const polys = MARK.faces.map((f) => f.pts.map(pt));
  const fills = [
    `url(#ft)`, "#2c5ec2", `url(#fs)`, "#22439c", `url(#fa)`, "#f2edda",
  ];
  const defs = `<defs>
    <linearGradient id="ft" x1="0" y1="0" x2="1" y2="0.3"><stop offset="0" stop-color="#5aa4f6"/><stop offset="1" stop-color="#3f7fe6"/></linearGradient>
    <linearGradient id="fs" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4c8bee"/><stop offset="1" stop-color="#2b52ad"/></linearGradient>
    <linearGradient id="fa" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#5f83d6" stop-opacity="0.55"/><stop offset="1" stop-color="#5c95ec"/></linearGradient>
  </defs>`;
  const body = defs + polys.map((pts, i) =>
    `<polygon points="${pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ")}" fill="${fills[i]}"/>`).join("");
  const mark = GLYPHS.find((g) => g.name === "mark");
  emit("mark", mark.code, body);
}

writeFileSync(join(OUT, "manifest.json"), JSON.stringify(manifest, null, 1));
console.log(`strikes: ${Object.keys(manifest.glyphs).length} glyphs × ${PPEMS.join("/")} ppem → font/strikes/`);
