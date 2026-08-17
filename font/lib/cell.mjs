// The design-grid → font-cell transform, shared by the outline build
// (build.mjs) and the color-strike build (render-strikes.mjs) so the bitmap
// strikes land exactly on the outlines they cover.
//
// 1000 upm, baseline at 800 (descent 200). The glyph advance is 500 — half
// an em, one terminal cell — and the 1000-grid artwork scales to 1.35 so its
// ink (~13% design margins) spans ~0.99 em: a full em of icon, dominating
// the line the way the design's strip icons do. The wide overhang past the
// advance lands on the spaces that always surround an icon in the deck line.
export const ADV = 500;
export const S = 1.35;
export const X_OFF = (ADV - 1000 * S) / 2;
export const Y_OFF = -245;
export const ASCENT = 800;
export const DESCENT = 200;

// The strikes' shared image box, in font units: full em vertically, the
// advance plus the overhang horizontally. Every strike uses this exact box
// (the emoji convention — big image, near-zero origin offsets), so any
// renderer quirk in offset handling moves all glyphs identically and
// invisibly instead of scattering them per-glyph.
export const STRIKE_BOX = { x0: -60, x1: ADV + 60, y0: -DESCENT, y1: ASCENT };

// design grid (y-down) → glyph SVG cell (y-down)
export const tf = ([x, y]) => [X_OFF + x * S, Y_OFF + y * S];

// design grid (y-down) → font units (y-up, baseline 0)
export const toFontX = (x) => X_OFF + x * S;
export const toFontY = (y) => ASCENT - (Y_OFF + y * S);
