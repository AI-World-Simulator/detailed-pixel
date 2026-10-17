"""Tile single-view proxies (p{A}_iso_*) into one turnaround sheet with a common scale and anchor.
   python sheet_proxy.py IN_DIR NAME COLS CELL ANGLES..."""
import sys, numpy as np
from PIL import Image
import os
I, name, cols, cell = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]); angs = sys.argv[5:]
SUF = os.environ.get("SUF", "")   # e.g. "_t" for the tall-window proxies
PAT = os.environ.get("PAT", "p{a}_iso" + SUF)   # file stem pattern of the single-view proxies
rows = (len(angs) + cols - 1) // cols
masks = [np.asarray(Image.open(f"{I}/{PAT.format(a=a)}_mask.png")) > 0 for a in angs]
ys, xs = np.nonzero(np.any(masks, axis=0)); pad = 24
x0, x1, y0, y1 = xs.min() - pad, xs.max() + pad, ys.min() - pad, ys.max() + pad
side = max(x1 - x0, y1 - y0); cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
box = (cx - side // 2, cy - side // 2, cx - side // 2 + side, cy - side // 2 + side)   # same square crop for every view
BG = {"colorn": (196, 196, 196), "color": (196, 196, 196), "lines": 0, "linesw": 0, "mask": 0, "faces": 0, "gray": 128, "depth": 0}
for kind, bg in BG.items():
    mode = "L" if kind in ("mask", "faces") else "RGB"
    sheet = Image.new(mode, (cols * cell, rows * cell), bg if mode == "L" else bg if isinstance(bg, tuple) else (bg, bg, bg))
    for i, a in enumerate(angs):
        src = Image.open(f"{I}/{PAT.format(a=a)}_{kind}.png").convert(mode)
        fill = bg if mode == "L" else (bg if isinstance(bg, tuple) else (bg, bg, bg))
        big = Image.new(mode, (src.width + 1024, src.height + 1024), fill); big.paste(src, (512, 512))   # crops may leave the canvas
        im = big.crop((box[0] + 512, box[1] + 512, box[2] + 512, box[3] + 512))
        im = im.resize((cell, cell), Image.NEAREST if kind in ("mask", "faces") else Image.LANCZOS)
        sheet.paste(im, ((i % cols) * cell, (i // cols) * cell))
    sheet.save(f"{I}/{name}_{kind}.png")
print(name, sheet.size)
