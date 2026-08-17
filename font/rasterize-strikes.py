#!/usr/bin/env python3
"""Rasterize font/strikes/*.svg to exact-size PNGs (between render-strikes.mjs
and colorize.py). One Chrome-headless screenshot of a stacked sprite sheet,
sliced with PIL — qlmanage pads thumbnails to squares, which would corrupt the
sbix origin offsets."""
import json
import os
import subprocess
from PIL import Image

D = os.path.join(os.path.dirname(os.path.abspath(__file__)), "strikes")
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

man = json.load(open(os.path.join(D, "manifest.json")))
todo = [(name, ppem, st) for name, g in man["glyphs"].items()
        for ppem, st in g["strikes"].items()]

# Chrome clamps window height, so rasterize in pages of at most 4000px.
PAGE = 4000
count = 0
page = 0
i = 0
while i < len(todo):
    entries, parts, y, maxw = [], [], 0, 0
    while i < len(todo) and y + todo[i][2]["h"] <= PAGE:
        name, ppem, st = todo[i]
        svg = open(os.path.join(D, st["file"])).read()
        parts.append(
            f'<div style="position:absolute;left:0;top:{y}px;'
            f'width:{st["w"]}px;height:{st["h"]}px">{svg}</div>')
        entries.append((name, ppem, y, st["w"], st["h"]))
        y += st["h"]
        maxw = max(maxw, st["w"])
        i += 1
    sheet_html = os.path.join(D, f"sheet{page}.html")
    open(sheet_html, "w").write(
        f'<!doctype html><meta charset="utf-8">'
        f'<body style="margin:0;background:transparent">{"".join(parts)}</body>')
    subprocess.run([CHROME, "--headless=new", f"--screenshot={D}/sheet{page}.png",
                    f"--window-size={maxw},{y}", "--default-background-color=00000000",
                    "--hide-scrollbars", f"file://{sheet_html}"],
                   check=True, capture_output=True)
    sheet = Image.open(os.path.join(D, f"sheet{page}.png"))
    assert sheet.size[1] >= y, f"page {page}: screenshot {sheet.size} shorter than {y}px"
    for name, ppem, sy, w, h in entries:
        sheet.crop((0, sy, w, sy + h)).save(os.path.join(D, f"{name}-{ppem}.png"))
    count += len(entries)
    page += 1
print(f"rasterized {count} strikes across {page} pages")
