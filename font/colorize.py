#!/usr/bin/env python3
"""Add the folded-glyph two-tone to FoldIcons.ttf via COLR/CPAL.

The design ghosts each glyph's shadow face (below the diagonal crease) to
50% opacity. A plain TTF can't do that, so build.mjs emits the two faces as
outlines (colr-layers.json) and this script layers them:

  layer 1: shadow face — CPAL color #8b8b9f @ 50% alpha
  layer 2: lit face    — palette index 0xFFFF = the current text color

Renderers that speak COLRv0 (Chromium/Electron terminals like Fold, CoreText
terminals) show the two-tone fold; everything else falls back to the base
glyph, which keeps the crease as a monochrome slit.

Run after build.mjs:  python3 font/colorize.py
"""
import json
import os
from fontTools.ttLib import TTFont
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.colorLib.builder import buildCOLR, buildCPAL

HERE = os.path.dirname(os.path.abspath(__file__))
TTF = os.path.join(HERE, "FoldIcons.ttf")

layers = json.load(open(os.path.join(HERE, "colr-layers.json")))
font = TTFont(TTF)
if "COLR" in font:  # already colorized (re-run after a rebuild only)
    raise SystemExit("FoldIcons.ttf already has COLR — run build.mjs first")

cmap = font.getBestCmap()
glyf, hmtx = font["glyf"], font["hmtx"]
order = font.getGlyphOrder()
adv = layers["advance"]

def add_glyph(name, contours):
    pen = TTGlyphPen(None)
    for pts in contours:
        pen.moveTo(tuple(pts[0]))
        for p in pts[1:]:
            pen.lineTo(tuple(p))
        pen.closePath()
    g = pen.glyph()
    order.append(name)
    glyf[name] = g
    g.recalcBounds(glyf)
    hmtx[name] = (adv, g.xMin)

colr = {}
for code_str, data in layers["glyphs"].items():
    base = cmap.get(int(code_str))
    if base is None:
        raise SystemExit(f"codepoint {code_str} missing from cmap")
    add_glyph(base + ".shadow", data["shadow"])
    add_glyph(base + ".lit", data["lit"])
    colr[base] = [(base + ".shadow", 0), (base + ".lit", 0xFFFF)]

# ---- vertical metrics: match Maple Mono NF's ratios ------------------------
# Terminals that auto-scale fallback fonts (Ghostty: ex-height, cap-height,
# then line-height matching) must compute a 1.0 scale for this font, or the
# icons balloon. svg2ttf leaves x/cap heights at 0 and a 1.0 em line, which
# made Ghostty upscale everything 1.32x. These are Maple Mono NF's values at
# 1000 upm — the primary face the deck line is designed against.
os2, hhea = font["OS/2"], font["hhea"]
os2.sxHeight, os2.sCapHeight = 550, 730
os2.sTypoAscender, os2.sTypoDescender, os2.sTypoLineGap = 1020, -300, 0
os2.usWinAscent, os2.usWinDescent = 1020, 300
hhea.ascent, hhea.descent, hhea.lineGap = 1020, -300, 0

font.setGlyphOrder(order)
font["glyf"].glyphOrder = order  # keep the table's own copy in step
font["maxp"].numGlyphs = len(order)
font["COLR"] = buildCOLR(colr)
r, g, b = (int(layers["shadow"]["color"][i : i + 2], 16) for i in (1, 3, 5))
font["CPAL"] = buildCPAL([[(r / 255, g / 255, b / 255, layers["shadow"]["alpha"])]])

# ---- sbix color strikes (font/strikes, from render-strikes.mjs) -----------
# The layer that actually shows color in native CoreText/Ghostty terminals:
# they rasterize sbix bitmaps (the emoji path) but flatten COLR to outlines.
# Chromium prefers COLR, so web contexts keep the crisp vector two-tone.
strikes_dir = os.path.join(HERE, "strikes")
manifest_path = os.path.join(strikes_dir, "manifest.json")
if os.path.exists(manifest_path):
    from fontTools.ttLib import newTable
    from fontTools.ttLib.tables.sbixStrike import Strike
    from fontTools.ttLib.tables.sbixGlyph import Glyph as SbixGlyph

    strikes = json.load(open(manifest_path))
    sbix = newTable("sbix")
    sbix.version, sbix.flags = 1, 1
    sbix.strikes = {}
    count = 0
    for name, entry in strikes["glyphs"].items():
        base = cmap.get(entry["code"])
        if base is None:
            raise SystemExit(f"strike glyph {name}: codepoint missing from cmap")
        for ppem_str, st in entry["strikes"].items():
            ppem = int(ppem_str)
            if ppem not in sbix.strikes:
                s = Strike(ppem=ppem, resolution=72)
                s.glyphs = {}
                sbix.strikes[ppem] = s
            png = open(os.path.join(strikes_dir, f"{name}-{ppem}.png"), "rb").read()
            g = SbixGlyph(glyphName=base, graphicType="png ",
                          originOffsetX=st["originOffsetX"], originOffsetY=st["originOffsetY"])
            g.imageData = png
            sbix.strikes[ppem].glyphs[base] = g
            count += 1
    font["sbix"] = sbix
    print(f"sbix added — {count} strikes across {len(sbix.strikes)} sizes")

font.save(TTF)
print(f"COLR/CPAL added — {len(colr)} two-tone glyphs, shadow {layers['shadow']['color']} @ {layers['shadow']['alpha']:.0%}")
