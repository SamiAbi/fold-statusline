// Geometry kit for Fold Icons — every shape becomes a filled polygon with
// explicit winding, because font rasterizers fill by the nonzero rule and
// silently mis-render evenodd tricks. Solids wind one way, holes the other;
// curves are sampled densely enough (≤0.5 units deviation at 1000 upm) that
// straight segments are indistinguishable from true arcs.

const TAU = Math.PI * 2;
const rad = (deg) => (deg * Math.PI) / 180;

// Shoelace sum — sign tells winding. Positive = clockwise on screen (y-down).
function signedArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}

// Enforce winding: solids clockwise (positive area), holes counter-clockwise.
function wind(pts, hole = false) {
  const cw = signedArea(pts) > 0;
  return cw === !hole ? pts : [...pts].reverse();
}

// ---- point-list producers (open polylines, building blocks) ----

// Sample an elliptical arc, degrees, y-down screen angles (0°=right, 90°=down).
export function arcPoints(cx, cy, rx, ry, a0, a1, n = 32) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = rad(a0 + ((a1 - a0) * i) / n);
    pts.push([cx + rx * Math.cos(t), cy + ry * Math.sin(t)]);
  }
  return pts;
}

// Sample a quadratic bezier P0→P2 with control P1.
export function bezPoints(p0, p1, p2, n = 24) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    pts.push([
      u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
      u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1],
    ]);
  }
  return pts;
}

export function rotate(pts, cx, cy, deg) {
  const t = rad(deg), c = Math.cos(t), s = Math.sin(t);
  return pts.map(([x, y]) => [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c]);
}

// ---- closed subpaths (return {pts, hole}) ----

export function poly(pts, { hole = false } = {}) {
  return { pts: wind(pts, hole), hole };
}

export function circle(cx, cy, r, { hole = false, n = 64 } = {}) {
  return poly(arcPoints(cx, cy, r, r, 0, 360, n).slice(0, -1), { hole });
}

export function ellipse(cx, cy, rx, ry, { hole = false, n = 64 } = {}) {
  return poly(arcPoints(cx, cy, rx, ry, 0, 360, n).slice(0, -1), { hole });
}

export function rect(x, y, w, h, { hole = false } = {}) {
  return poly([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], { hole });
}

export function roundRect(x, y, w, h, r, { hole = false, n = 8 } = {}) {
  r = Math.min(r, w / 2, h / 2);
  const pts = [
    ...arcPoints(x + w - r, y + r, r, r, 270, 360, n),
    ...arcPoints(x + w - r, y + h - r, r, r, 0, 90, n),
    ...arcPoints(x + r, y + h - r, r, r, 90, 180, n),
    ...arcPoints(x + r, y + r, r, r, 180, 270, n),
  ];
  return poly(pts, { hole });
}

// Outline an open polyline into a filled stroke shape. Miter joins (clamped),
// round or butt caps. This is how every "line" in the icon set is drawn.
export function stroke(pts, w, { hole = false, cap = "round", capN = 10, miterLimit = 4 } = {}) {
  const hw = w / 2;
  if (pts.length < 2) throw new Error("stroke needs ≥2 points");
  // segment normals (left side in travel direction)
  const norms = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const dx = pts[i + 1][0] - pts[i][0], dy = pts[i + 1][1] - pts[i][1];
    const len = Math.hypot(dx, dy) || 1;
    norms.push([-dy / len, dx / len]);
  }
  const offsetSide = (sign) => {
    const side = [];
    for (let i = 0; i < pts.length; i++) {
      const nPrev = norms[i - 1], nNext = norms[i];
      let nx, ny;
      if (!nPrev) [nx, ny] = nNext;
      else if (!nNext) [nx, ny] = nPrev;
      else {
        nx = nPrev[0] + nNext[0]; ny = nPrev[1] + nNext[1];
        const len = Math.hypot(nx, ny) || 1;
        nx /= len; ny /= len;
        // miter scale, clamped so spikes never explode
        const dot = nx * nNext[0] + ny * nNext[1];
        const scale = Math.min(1 / Math.max(dot, 1e-6), miterLimit);
        nx *= scale; ny *= scale;
      }
      side.push([pts[i][0] + sign * hw * nx, pts[i][1] + sign * hw * ny]);
    }
    return side;
  };
  const left = offsetSide(1);
  const right = offsetSide(-1).reverse();
  let outline;
  if (cap === "round") {
    // Starting from the left-offset end, a −180° sweep always bulges outward
    // (past the line tip), never dents back into the stroke.
    const capArc = (center, from) => {
      const a0 = (Math.atan2(from[1] - center[1], from[0] - center[0]) * 180) / Math.PI;
      return arcPoints(center[0], center[1], hw, hw, a0, a0 - 180, capN).slice(1, -1);
    };
    const end = pts[pts.length - 1], start = pts[0];
    outline = [...left, ...capArc(end, left[left.length - 1]), ...right,
      ...capArc(start, right[right.length - 1])];
  } else {
    outline = [...left, ...right];
  }
  return poly(outline, { hole });
}

// ---- SVG import: turn design-file markup into sampled polygons ----

// Full `d` parser. Curves/arcs are sampled (24 segments each — ≤0.5 unit
// deviation at this glyph scale). Returns an array of open/closed point
// lists, one per subpath.
export function parsePathD(d) {
  const tokens = d.match(/[MmLlHhVvCcSsQqTtAaZz]|-?(?:\d*\.\d+|\d+)(?:e-?\d+)?/g) || [];
  let i = 0, cmd = "", cx = 0, cy = 0, sx = 0, sy = 0, px = null, py = null, pcmd = "";
  const subs = []; let cur = null;
  const num = () => parseFloat(tokens[i++]);
  const start = (x, y) => { cur = [[x, y]]; subs.push(cur); cx = sx = x; cy = sy = y; };
  const lineTo = (x, y) => { cur.push([x, y]); cx = x; cy = y; };
  const cubic = (x1, y1, x2, y2, x, y, n = 24) => {
    for (let k = 1; k <= n; k++) {
      const t = k / n, u = 1 - t;
      cur.push([u*u*u*cx + 3*u*u*t*x1 + 3*u*t*t*x2 + t*t*t*x,
                u*u*u*cy + 3*u*u*t*y1 + 3*u*t*t*y2 + t*t*t*y]);
    }
    px = x2; py = y2; cx = x; cy = y;
  };
  const quad = (x1, y1, x, y, n = 24) => {
    for (let k = 1; k <= n; k++) {
      const t = k / n, u = 1 - t;
      cur.push([u*u*cx + 2*u*t*x1 + t*t*x, u*u*cy + 2*u*t*y1 + t*t*y]);
    }
    px = x1; py = y1; cx = x; cy = y;
  };
  // SVG spec F.6.5: endpoint → center parameterization
  const arc = (rx, ry, rotDeg, laf, sf, x, y, n = 24) => {
    if (rx === 0 || ry === 0 || (cx === x && cy === y)) { lineTo(x, y); return; }
    rx = Math.abs(rx); ry = Math.abs(ry);
    const phi = (rotDeg * Math.PI) / 180, cosP = Math.cos(phi), sinP = Math.sin(phi);
    const dx = (cx - x) / 2, dy = (cy - y) / 2;
    const x1 = cosP * dx + sinP * dy, y1 = -sinP * dx + cosP * dy;
    const lam = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
    if (lam > 1) { const s = Math.sqrt(lam); rx *= s; ry *= s; }
    const sign = laf === sf ? -1 : 1;
    const den = rx * rx * y1 * y1 + ry * ry * x1 * x1;
    const co = sign * Math.sqrt(Math.max(0, (rx * rx * ry * ry - den) / den));
    const cxp = co * (rx * y1) / ry, cyp = co * (-ry * x1) / rx;
    const ccx = cosP * cxp - sinP * cyp + (cx + x) / 2;
    const ccy = sinP * cxp + cosP * cyp + (cy + y) / 2;
    const ang = (ux, uy, vx, vy) => {
      const s2 = ux * vy - uy * vx < 0 ? -1 : 1;
      const dot = Math.max(-1, Math.min(1, (ux * vx + uy * vy) / (Math.hypot(ux, uy) * Math.hypot(vx, vy))));
      return s2 * Math.acos(dot);
    };
    const t1 = ang(1, 0, (x1 - cxp) / rx, (y1 - cyp) / ry);
    let dt = ang((x1 - cxp) / rx, (y1 - cyp) / ry, (-x1 - cxp) / rx, (-y1 - cyp) / ry);
    if (!sf && dt > 0) dt -= TAU;
    if (sf && dt < 0) dt += TAU;
    for (let k = 1; k <= n; k++) {
      const t = t1 + (dt * k) / n;
      cur.push([ccx + rx * Math.cos(t) * cosP - ry * Math.sin(t) * sinP,
                ccy + rx * Math.cos(t) * sinP + ry * Math.sin(t) * cosP]);
    }
    cx = x; cy = y;
  };
  while (i < tokens.length) {
    const t = tokens[i];
    if (/[A-Za-z]/.test(t)) { cmd = t; i++; } // else: implicit repeat of cmd
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    if (C === "Z") { cx = sx; cy = sy; pcmd = C; continue; }
    if (C === "M") {
      const x = num() + (rel ? cx : 0), y = num() + (rel ? cy : 0);
      start(x, y); cmd = rel ? "l" : "L";
    } else if (C === "L") lineTo(num() + (rel ? cx : 0), num() + (rel ? cy : 0));
    else if (C === "H") lineTo(num() + (rel ? cx : 0), cy);
    else if (C === "V") lineTo(cx, num() + (rel ? cy : 0));
    else if (C === "C") cubic(num() + (rel ? cx : 0), num() + (rel ? cy : 0),
                              num() + (rel ? cx : 0), num() + (rel ? cy : 0),
                              num() + (rel ? cx : 0), num() + (rel ? cy : 0));
    else if (C === "S") {
      const refl = /[CS]/.test(pcmd) ? [2 * cx - px, 2 * cy - py] : [cx, cy];
      cubic(refl[0], refl[1], num() + (rel ? cx : 0), num() + (rel ? cy : 0),
            num() + (rel ? cx : 0), num() + (rel ? cy : 0));
    } else if (C === "Q") quad(num() + (rel ? cx : 0), num() + (rel ? cy : 0),
                               num() + (rel ? cx : 0), num() + (rel ? cy : 0));
    else if (C === "T") {
      const refl = /[QT]/.test(pcmd) ? [2 * cx - px, 2 * cy - py] : [cx, cy];
      quad(refl[0], refl[1], num() + (rel ? cx : 0), num() + (rel ? cy : 0));
    } else if (C === "A") arc(num(), num(), num(), num(), num(),
                              num() + (rel ? cx : 0), num() + (rel ? cy : 0));
    else throw new Error("bad path cmd " + cmd);
    pcmd = C;
  }
  return subs;
}

function pointInPoly(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Orient subpaths by containment depth (evenodd semantics → nonzero winding):
// depth even = solid, odd = hole. Test point sits just inside the leftmost
// vertex, where the interior is always to the right.
export function fixWinding(pointLists) {
  return pointLists.map((pts) => {
    let L = 0;
    for (let k = 1; k < pts.length; k++) if (pts[k][0] < pts[L][0]) L = k;
    const [tx, ty] = [pts[L][0] + 0.02, pts[L][1]];
    let depth = 0;
    for (const other of pointLists) {
      if (other !== pts && pointInPoly(tx, ty, other)) depth++;
    }
    return poly(pts, { hole: depth % 2 === 1 });
  });
}

// Parse a design-file fragment (<path>/<rect>/<circle>, fill or stroke) into
// oriented subpaths. Stroked paths are outlined with the given width.
export function parseFragment(svg) {
  const lists = [];
  const strokes = [];
  for (const m of svg.matchAll(/<(path|rect|circle)([^/]*)\/?>/g)) {
    const attrs = {};
    for (const a of m[2].matchAll(/([\w-]+)="([^"]*)"/g)) attrs[a[1]] = a[2];
    if (m[1] === "path") {
      const subs = parsePathD(attrs.d);
      if (attrs.stroke && attrs.fill === "none") {
        const w = parseFloat(attrs["stroke-width"] || "1");
        for (const s of subs) strokes.push(stroke(s, w, { cap: "round" }));
      } else lists.push(...subs);
    } else if (m[1] === "rect") {
      const [x, y, w, h] = ["x", "y", "width", "height"].map((k) => parseFloat(attrs[k] || "0"));
      const r = parseFloat(attrs.rx || "0");
      lists.push(roundRect(x, y, w, h, r).pts);
    } else if (m[1] === "circle") {
      lists.push(circle(parseFloat(attrs.cx), parseFloat(attrs.cy), parseFloat(attrs.r)).pts);
    }
  }
  return [...fixWinding(lists), ...strokes];
}

// Sutherland–Hodgman against the half-plane nx·x + ny·y ≤ c. Orientation of
// the surviving polygon is preserved, so hole/solid winding carries through.
function clipHalf(pts, nx, ny, c) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const da = nx * a[0] + ny * a[1] - c, db = nx * b[0] + ny * b[1] - c;
    if (da <= 0) out.push(a);
    if ((da <= 0) !== (db <= 0)) {
      const t = da / (da - db);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

// Shrink a convex polygon inward by d: clip against each edge's inward
// offset half-plane. Used to open hairline gaps between the brand mark's
// faces so the facet structure survives in a single-color glyph.
export function insetConvex(pts, d, { hole = false } = {}) {
  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  let out = pts;
  for (let i = 0; i < pts.length && out.length >= 3; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    let nx = b[1] - a[1], ny = -(b[0] - a[0]);
    const len = Math.hypot(nx, ny) || 1; nx /= len; ny /= len;
    if (nx * (cx - a[0]) + ny * (cy - a[1]) > 0) { nx = -nx; ny = -ny; } // point outward
    out = clipHalf(out, nx, ny, nx * a[0] + ny * a[1] - d);
  }
  return poly(out.length >= 3 ? out : pts, { hole });
}

// Exact two-face split along the fold line (no gap): the lit face above,
// the shadow face below — the layers of the COLR color build.
export function splitFold(subpaths, { x0, y0, x1, y1 }) {
  let nx = y1 - y0, ny = -(x1 - x0);
  const len = Math.hypot(nx, ny); nx /= len; ny /= len;
  if (-(nx * x0 + ny * y0) > 0) { nx = -nx; ny = -ny; }
  const c = nx * x0 + ny * y0;
  const side = (sx, sy, sc) => subpaths
    .map(({ pts, hole }) => ({ pts: clipHalf(pts, sx, sy, sc), hole }))
    .filter((p) => p.pts.length >= 3);
  return { lit: side(nx, ny, c), shadow: side(-nx, -ny, -c) };
}

// The folded-glyph crease: split every subpath along the fold line with a
// small gap — the monochrome stand-in for the design's ghosted shadow face.
export function crease(subpaths, { x0, y0, x1, y1 }, gap) {
  // half-plane normal for "above the line" (lit face)
  let nx = y1 - y0, ny = -(x1 - x0);
  const len = Math.hypot(nx, ny); nx /= len; ny /= len;
  if (nx * 0 + ny * 0 - (nx * x0 + ny * y0) > 0) { nx = -nx; ny = -ny; } // origin (top-left) is lit
  const c = nx * x0 + ny * y0;
  const out = [];
  for (const { pts, hole } of subpaths) {
    for (const clipped of [clipHalf(pts, nx, ny, c - gap / 2),
                           clipHalf(pts, -nx, -ny, -(c + gap / 2))]) {
      if (clipped.length >= 3) out.push({ pts: clipped, hole });
    }
  }
  return out;
}

export function scalePts(subpaths, s, dx = 0, dy = 0) {
  return subpaths.map(({ pts, hole }) => ({ pts: pts.map(([x, y]) => [x * s + dx, y * s + dy]), hole }));
}

// ---- assembly ----

// Turn subpaths into one SVG path `d`, coordinates transformed by fn.
export function toPathD(subpaths, tf = (p) => p) {
  const fmt = (v) => String(Math.round(v * 10) / 10);
  return subpaths.map(({ pts }) => {
    const t = pts.map(tf);
    return "M" + t.map(([x, y]) => `${fmt(x)} ${fmt(y)}`).join("L") + "Z";
  }).join("");
}
