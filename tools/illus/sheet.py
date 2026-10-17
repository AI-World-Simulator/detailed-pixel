"""Contact sheet of RGBA frames on a checker-free flat background with the base ground line (for eyeballing):
   ~/ComfyUI/.venv/bin/python tools/illus/sheet.py OUT.png frame.png ... [--crop x0,y0,x1,y1] [--scale 0.5] [--ground ROW]
   (the red line is the base ground row, from metrics_a.json)"""
import sys
import numpy as np
from PIL import Image, ImageDraw
import json, os
from common import HERE, load_rgba

args = [a for a in sys.argv[1:] if not a.startswith("--")]
opt = {sys.argv[i][2:]: sys.argv[i + 1] for i in range(len(sys.argv)) if sys.argv[i].startswith("--")}
args = [a for a in args if a not in opt.values()]
out, files = args[0], args[1:]
crop = tuple(int(v) for v in opt.get("crop", "0,0,768,1024").split(","))
sc = float(opt.get("scale", "0.5"))
mp = os.path.join(HERE, "metrics_a.json")
ground = int(opt.get("ground", json.load(open(mp))["base"]["foot"] if os.path.exists(mp) else 966))
tiles = []
for f in files:
    rgb, a = load_rgba(f)
    bg = np.array([0.80, 0.86, 0.92], np.float32)
    im = rgb * a[..., None] + bg * (1 - a[..., None])
    t = Image.fromarray((im * 255).astype(np.uint8)).crop(crop)
    t = t.resize((int(t.width * sc), int(t.height * sc)), Image.LANCZOS)
    d = ImageDraw.Draw(t)
    gy = (ground - crop[1]) * sc
    d.line([(0, gy), (t.width, gy)], fill=(200, 40, 40), width=1)
    d.text((4, 4), f.split("/")[-1], fill=(0, 0, 0))
    tiles.append(t)
W = sum(t.width for t in tiles)
c = Image.new("RGB", (W, tiles[0].height), "white")
x = 0
for t in tiles:
    c.paste(t, (x, 0)); x += t.width
c.save(out)
