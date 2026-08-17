// Fold Icons — the deck-line glyphs, taken from Fold's design system
// ("folded glyphs", icons/statusline.html — see design-icons.mjs for the
// verbatim fragments and provenance).
//
// Every glyph carries the set's signature: a diagonal crease from (0,14.5)
// to (24,8.5) on the 24-grid. The design ghosts the shadow face below the
// fold at 50% opacity; a font is monochrome, so here the crease is a thin
// slit splitting each form along the same line — invisible weight at cell
// sizes, clearly a fold at display sizes.
//
// `cost` and `wtree` are drawn here in the same language: the design's cost
// glyph is live text ("$") which a font can't embed, and the set has no
// worktree glyph yet.

import { arcPoints, circle, stroke, parseFragment, crease, splitFold, insetConvex, scalePts } from "./lib/geo.mjs";
import { DESIGN, FOLD_LINE, MARK } from "./design-icons.mjs";

const GAP = 1.0;             // crease slit width, 24-grid units
const S = 1000 / 24;         // design grid → font grid

// Each glyph ships three outline sets: `paths` (combined, crease slit — the
// glyph renderers without COLR support see), and `lit`/`shadow` (the exact
// two faces, layered by the COLR build: lit follows the text color, shadow
// ghosts at 50%).
const folded = (subpaths) => {
  const { lit, shadow } = splitFold(subpaths, FOLD_LINE);
  return {
    paths: scalePts(crease(subpaths, FOLD_LINE, GAP), S),
    lit: scalePts(lit, S),
    shadow: scalePts(shadow, S),
  };
};
const fromDesign = (key) => folded(parseFragment(DESIGN[key].svg));

// -- cost: the $ the design writes as Menlo text, drawn as outlines --------
// Two elliptical arcs sweeping opposite ways (the reversal at the waist is
// what makes an S), plus the bar, both stroked.
function dollarGlyph() {
  const upper = arcPoints(12, 8.3, 3.65, 3.4, -40, -270, 40);
  const lower = arcPoints(12, 15.7, 3.65, 3.4, -90, 140, 40);
  return folded([
    stroke([...upper, ...lower.slice(1)], 2.3, { cap: "round" }),
    stroke([[12, 1.7], [12, 22.3]], 1.7, { cap: "round" }),
  ]);
}

// -- wtree: trunk with two nodes, a third hanging off a quarter-ellipse ----
function wtreeGlyph() {
  const R = 2.2, H = 1.05;
  return folded([
    circle(7.9, 4.4, R), circle(7.9, 4.4, H, { hole: true }),
    circle(7.9, 19.6, R), circle(7.9, 19.6, H, { hole: true }),
    circle(17.5, 8.0, R), circle(17.5, 8.0, H, { hole: true }),
    stroke([[7.9, 6.6], [7.9, 17.4]], 1.55, { cap: "butt" }),
    // leaves the trunk at (7.9,16.6), arrives vertically at the node bottom
    stroke(arcPoints(17.5, 16.6, 9.6, 16.6 - (8.0 + R), 180, 270, 24), 1.55, { cap: "butt" }),
  ]);
}

// -- mark: the Fold brand mark, faceted paper fold --------------------------
// The mark IS a fold, so it skips the crease treatment. Faces are inset a
// hair so the facet boundaries survive: strongly in the monochrome base
// (visible creases), lightly in the color layers (the tone change carries
// the structure there).
function markGlyph() {
  const { viewBox: vb, faces } = MARK;
  const s = 17.6 / vb.h; // match the icon set's ink height (3.2..20.8 on 24)
  const ox = (24 - vb.w * s) / 2, oy = (24 - vb.h * s) / 2;
  const tf = (subs) => scalePts(subs, S).map(({ pts, hole }) =>
    ({ pts: pts.map(([x, y]) => [x, y]), hole }));
  const face = (f, inset) => insetConvex(f.pts.map(([x, y]) =>
    [(x - vb.x) * s + ox, (y - vb.y) * s + oy]), inset);
  return {
    paths: tf(faces.map((f) => face(f, 0.22))),
    lit: tf(faces.filter((f) => f.tone === "lit").map((f) => face(f, 0.08))),
    shadow: tf(faces.filter((f) => f.tone === "shadow").map((f) => face(f, 0.08))),
  };
}

// State variants: the same outlines at their own codepoints, so the color
// strikes can bake each state's hue (a bitmap glyph ignores the terminal's
// ANSI color, so "turn red when hot" becomes "switch to the red codepoint").
// Each is nudged 0.1 units — invisible at 1000 upm, but it keeps svg2ttf
// from deduplicating identical outlines into one glyph, which would also
// collapse their distinct strikes.
const vary = (g, dx) => ({
  paths: scalePts(g.paths, 1, dx, 0),
  lit: scalePts(g.lit, 1, dx, 0),
  shadow: scalePts(g.shadow, 1, dx, 0),
});
const dbG = fromDesign("db"), puzzleG = fromDesign("puzzle"), boltG = fromDesign("bolt");

// Codepoints are frozen — appending is fine, reordering is a breaking change.
export const GLYPHS = [
  { name: "user",   code: 0xe900, ...fromDesign("user") },
  { name: "chip",   code: 0xe901, ...fromDesign("chip") },
  { name: "bolt",   code: 0xe902, ...fromDesign("bolt") },
  { name: "db",     code: 0xe903, ...fromDesign("db") },
  { name: "hour",   code: 0xe904, ...fromDesign("hour") },
  { name: "cal",    code: 0xe905, ...fromDesign("cal") },
  { name: "clock",  code: 0xe906, ...fromDesign("clock") },
  { name: "puzzle", code: 0xe907, ...fromDesign("puzzle") },
  { name: "heart",  code: 0xe908, ...fromDesign("heart") },
  { name: "brush",  code: 0xe909, ...fromDesign("brush") },
  { name: "fire",   code: 0xe90a, ...fromDesign("fire") },
  { name: "dollar", code: 0xe90b, ...dollarGlyph() },
  { name: "wtree",  code: 0xe90c, ...wtreeGlyph() },
  { name: "mark",   code: 0xe90d, ...markGlyph() },
  { name: "dbHot",      code: 0xe90e, ...vary(dbG, 0.1) },
  { name: "puzzleDown", code: 0xe90f, ...vary(puzzleG, 0.1) },
  { name: "boltLow",    code: 0xe910, ...vary(boltG, 0.1) },
  { name: "boltMed",    code: 0xe911, ...vary(boltG, 0.2) },
  { name: "boltHigh",   code: 0xe912, ...vary(boltG, 0.3) },
  { name: "boltMax",    code: 0xe913, ...vary(boltG, 0.4) },
];
