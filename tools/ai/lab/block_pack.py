"""Shrink a built block set for the repository: sprites, asset sprites and the ground -> lossy WebP, block.js rewritten to match,
ground textures (only needed while building) dropped.
   python block_pack.py SET_DIR [quality=70]      (e.g. experiments/moscow-block/ai)
PNG sprites are ~30 MB per set (and *.png is git-ignored); WebP keeps the look at a small fraction of that."""
import os, sys, glob, re, json
from PIL import Image

d = sys.argv[1]; q = int(sys.argv[2]) if len(sys.argv) > 2 else 70
before = after = 0
for src in glob.glob(f"{d}/spr/*.png") + glob.glob(f"{d}/assets/*.png") + [f"{d}/ground.jpg"]:
    if not os.path.exists(src): continue
    dst = src.rsplit(".", 1)[0] + ".webp"
    im = Image.open(src)
    im.save(dst, "WEBP", quality=q, method=6, **({"alpha_quality": 80} if im.mode == "RGBA" else {}))
    before += os.path.getsize(src); after += os.path.getsize(dst)
    os.remove(src)
for t in glob.glob(f"{d}/assets/tex_*"): before += os.path.getsize(t); os.remove(t)
js = open(f"{d}/block.js").read()
js = re.sub(r'"((?:spr|assets)/[^"]+)\.png"', r'"\1.webp"', js).replace('"ground.jpg"', '"ground.webp"')
# coordinates to 2 decimals (cm / sub-pixel): the data file shrinks by about half
data = json.loads(js[js.index("{"):js.rindex("}") + 1])
rnd = lambda v: round(v, 2) if isinstance(v, float) else [rnd(x) for x in v] if isinstance(v, list) else {k: rnd(x) for k, x in v.items()} if isinstance(v, dict) else v
keep = {k: data[k] for k in ("ppm", "pitch", "cx", "cy", "frame", "top")}       # projection constants stay exact
data = rnd(data); data.update(keep)
import math; data["PS"], data["PC"] = math.sin(math.radians(data["pitch"])), math.cos(math.radians(data["pitch"]))
js = "window.BLOCK = " + json.dumps(data, separators=(",", ":")) + ";\n"
open(f"{d}/block.js", "w").write(js)
print(f"{d}: {before / 1e6:.1f} MB -> {after / 1e6:.1f} MB")
