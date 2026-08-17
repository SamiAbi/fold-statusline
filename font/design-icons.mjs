// The statusline icon set from Fold's design system — "folded glyphs":
// solid single-colour forms with a diagonal crease, the lit face
// full-strength above the fold line, the shadow face ghosted below.
// Source: Fold Design System project, icons/statusline.html
// (claude.ai/design/p/1d00d39a-cfcd-4ad7-aef4-d6718ecd0381).
//
// Fragments are verbatim from the design file: 24×24 viewBox, currentColor
// fills. The design assigns U+F8010–F801C in Fold's flight-glyph font
// (ADR-0045); fold-statusline ships the same artwork at its own BMP range
// U+E900–E90D (see glyphs.mjs) — supplementary-plane PUA has unreliable
// width handling across terminals.
//
// The crease in the design is opacity-based (whole glyph at 50%, lit face
// overdrawn at 100% clipped to `M0 0h24v8.5L0 14.5Z`). A font is monochrome,
// so glyphs.mjs renders the crease as a thin slit along the fold line
// (0,14.5)→(24,8.5) instead.
//
// Keys are the statusline's icon names; `design` is the name used in the
// design file. `cost` is `<text>$</text>` in the design (not outlinable in a
// font) and there is no worktree glyph — both are drawn in glyphs.mjs in the
// same language.

export const FOLD_LINE = { x0: 0, y0: 14.5, x1: 24, y1: 8.5 };

// The Fold brand mark (brand/logo.html, canonical assets/logo.svg): six flat
// faces, one light source, viewBox 66 30 188 196. `tone` records which face
// carries light in the logo's gradients — the font build maps lit faces to
// the text color and shadow faces to the ghost layer.
export const MARK = {
  viewBox: { x: 66, y: 30, w: 188, h: 196 },
  faces: [
    { pts: [[92, 30], [236, 34], [152, 98]], tone: "lit" },     // top sheet
    { pts: [[236, 34], [222, 98], [152, 98]], tone: "shadow" }, // right underfold
    { pts: [[92, 30], [152, 98], [84, 226]], tone: "lit" },     // long left face
    { pts: [[152, 98], [124, 152], [84, 226]], tone: "shadow" },// inner shade
    { pts: [[124, 152], [204, 144], [194, 186], [114, 188]], tone: "shadow" }, // swoosh
    { pts: [[218, 140], [254, 140], [246, 188], [210, 188]], tone: "lit" },    // cream tab
  ],
};

export const DESIGN = {
  user: { design: "you", svg: `<circle cx="12" cy="8" r="3.4"/><path d="M12 13.2c-3.8 0-6.8 2.1-6.8 4.7v1.7h13.6v-1.7c0-2.6-3-4.7-6.8-4.7Z"/>` },
  chip: { design: "model", svg: `<path fill-rule="evenodd" d="M7.8 6.4h8.4a1.4 1.4 0 0 1 1.4 1.4v8.4a1.4 1.4 0 0 1-1.4 1.4H7.8a1.4 1.4 0 0 1-1.4-1.4V7.8a1.4 1.4 0 0 1 1.4-1.4ZM9.6 9.6v4.8h4.8V9.6Z"/><rect x="8.6" y="3.2" width="1.7" height="2.9" rx=".85"/><rect x="13.7" y="3.2" width="1.7" height="2.9" rx=".85"/><rect x="8.6" y="17.9" width="1.7" height="2.9" rx=".85"/><rect x="13.7" y="17.9" width="1.7" height="2.9" rx=".85"/><rect x="3.2" y="8.6" width="2.9" height="1.7" rx=".85"/><rect x="3.2" y="13.7" width="2.9" height="1.7" rx=".85"/><rect x="17.9" y="8.6" width="2.9" height="1.7" rx=".85"/><rect x="17.9" y="13.7" width="2.9" height="1.7" rx=".85"/>` },
  bolt: { design: "effort", svg: `<path d="M13.6 2.8 6 13.4h4.3L9.4 21.2l7.9-10.9h-4.5Z"/>` },
  db: { design: "context", svg: `<path d="M12 3.4c-4 0-7 1.2-7 2.9s3 2.9 7 2.9 7-1.2 7-2.9-3-2.9-7-2.9Z"/><path d="M5 8.7v3c0 1.7 3 2.9 7 2.9s7-1.2 7-2.9v-3c-1.5 1.1-4.1 1.8-7 1.8s-5.5-.7-7-1.8Z"/><path d="M5 14.2v3.4c0 1.7 3 2.9 7 2.9s7-1.2 7-2.9v-3.4c-1.5 1.1-4.1 1.8-7 1.8s-5.5-.7-7-1.8Z"/>` },
  hour: { design: "window", svg: `<rect x="5.6" y="3.2" width="12.8" height="1.9" rx=".95"/><rect x="5.6" y="18.9" width="12.8" height="1.9" rx=".95"/><path d="M7 6h10l-4.1 4.9a1.2 1.2 0 0 1-1.8 0Z"/><path d="M12 13.1a1.2 1.2 0 0 1 .9.4L17 18H7l4.1-4.5a1.2 1.2 0 0 1 .9-.4Z"/>` },
  cal: { design: "week", svg: `<path fill-rule="evenodd" d="M4.6 5.6h14.8a1.4 1.4 0 0 1 1.4 1.4v12a1.4 1.4 0 0 1-1.4 1.4H4.6a1.4 1.4 0 0 1-1.4-1.4V7a1.4 1.4 0 0 1 1.4-1.4ZM5.2 10.4v7.9h13.6v-7.9Z"/><rect x="7" y="3.2" width="1.9" height="4" rx=".95"/><rect x="15.1" y="3.2" width="1.9" height="4" rx=".95"/><rect x="7.4" y="12.4" width="3.4" height="3.4" rx=".7"/>` },
  clock: { design: "clock", svg: `<path fill-rule="evenodd" d="M12 3.2a8.8 8.8 0 1 0 0 17.6 8.8 8.8 0 0 0 0-17.6Zm0 2a6.8 6.8 0 1 1 0 13.6 6.8 6.8 0 0 1 0-13.6Z"/><path d="M11.2 7h1.7v5.2l3.5 2-.9 1.5-4.3-2.5Z"/>` },
  puzzle: { design: "mcp", svg: `<rect x="4" y="6.8" width="5.5" height="5.5" rx="1.1"/><rect x="4" y="13.4" width="5.5" height="5.5" rx="1.1"/><rect x="10.6" y="13.4" width="5.5" height="5.5" rx="1.1"/><rect x="12.6" y="4.4" width="5.5" height="5.5" rx="1.1"/>` },
  heart: { design: "activity", svg: `<path d="M4 12.6h3.4l1.9-4.4 3 7.4 2.1-5 1.2 2h4.4" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>` },
  brush: { design: "style", svg: `<path d="M18.6 3.6l1.8 1.8a1.3 1.3 0 0 1 0 1.8l-7.2 7.2-3.6-3.6 7.2-7.2a1.3 1.3 0 0 1 1.8 0Z"/><path d="M8.6 11.9l3.5 3.5c-.5 2.6-2.5 4.2-6.1 4.6-.9.1-1.7.2-2.5.6 1-1.1 1.2-2.2 1.4-3.3.4-2.6 1.4-4.6 3.7-5.4Z"/>` },
  fire: { design: "burn", svg: `<path d="M12.6 3c.3 2.7-.9 4.2-2.4 5.8-1.5 1.6-3 3.3-3 6.1a5.4 5.4 0 0 0 10.8 0c0-2-.8-3.4-1.8-4.7-.4 1.1-1 1.7-1.9 2.1-.1-3.5-.4-6.6-1.7-9.3Z"/>` },
};
