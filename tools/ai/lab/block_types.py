"""Building types for the Moscow block test: massing proxies at the exact view angles the block needs, tiled into one
turnaround sheet per type, plus per-cell projection metadata for cutting the generated sheet into modules.
   python block_types.py            -> ~/ComfyUI/input/blk_<type>_{colorn,linesw,mask,faces,umap}.png + blk_<type>_meta.json
Every type is one footprint (L = 5 bays of 3.25 m along the front, D = 12.5 m) so a building of any length is assembled from
bays: 0,1 | 2 repeated | 3,4 (see block_build.py). The door sits in bay 1 so the repeated middle bay has none."""
import os, sys, json, subprocess
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
I = os.path.expanduser("~/ComfyUI/input")
PY = os.path.expanduser("~/ComfyUI/.venv/bin/python")
ANGLES = [65, 155, 245, 335, 0, 90, 180, 270]          # the block's four street orientations + the axis-aligned few
COLS, CELL = 4, 512
BAY, NBAY, DEPTH, FH = 3.25, 5, 12.5, 3.2
WALL, ROOF = "e8d8b6", "a3a49f"                       # neutral cream walls and grey roof, recoloured per building later
TYPES = {
    "hip4": dict(roof="hip", floors=4), "hip6": dict(roof="hip", floors=6),
    "gable4": dict(roof="gable", floors=4), "gable6": dict(roof="gable", floors=6),
    "flat4": dict(roof="flat", floors=4), "flat6": dict(roof="flat", floors=6),
}

def stem(a, roof, tag):
    return f"p{a}{'' if roof == 'hip' else '_' + roof}_iso_t_{tag}"

def build(name, t):
    tag = f"blk_{name}"
    env = dict(os.environ, PL=str(BAY * NBAY), PD=str(DEPTH), PFL=str(t["floors"]), PFH=str(FH),
               PRIDGE="5" if t["roof"] != "flat" else "0", PAXIS="u", PPITCH="55", PWALL=WALL, PROOF=ROOF, PDOOR="1", PTAG="_" + tag)
    for a in ANGLES:
        subprocess.run([PY, f"{HERE}/proxy2.py", I, str(a), t["roof"], "iso", "tall"], env=env, check=True, stdout=subprocess.DEVNULL)
    stems = [stem(a, t["roof"], tag) for a in ANGLES]
    masks = [np.asarray(Image.open(f"{I}/{s}_mask.png")) > 0 for s in stems]
    ys, xs = np.nonzero(np.any(masks, axis=0)); pad = 24
    x0, x1, y0, y1 = xs.min() - pad, xs.max() + pad, ys.min() - pad, ys.max() + pad
    side = int(max(x1 - x0, y1 - y0)); cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
    box = (int(cx - side // 2), int(cy - side // 2))
    rows = (len(ANGLES) + COLS - 1) // COLS
    kinds = {"colorn": ("RGB", (196, 196, 196), Image.LANCZOS), "linesw": ("RGB", (0, 0, 0), Image.LANCZOS),
             "mask": ("L", 0, Image.NEAREST), "faces": ("L", 0, Image.NEAREST), "umap": ("I;16", 0, Image.NEAREST)}
    for kind, (mode, bg, rs) in kinds.items():
        sheet = Image.new(mode, (COLS * CELL, rows * CELL), bg)
        for i, s in enumerate(stems):
            src = Image.open(f"{I}/{s}_{kind}.png")
            src = src.convert(mode) if kind != "umap" else src
            big = Image.new(mode, (src.width + 1024, src.height + 1024), bg); big.paste(src, (512, 512))
            im = big.crop((box[0] + 512, box[1] + 512, box[0] + side + 512, box[1] + side + 512)).resize((CELL, CELL), rs)
            sheet.paste(im, ((i % COLS) * CELL, (i // COLS) * CELL))
        sheet.save(f"{I}/{tag}_{kind}.png")
    m0 = json.load(open(f"{I}/{stems[0]}_meta.json"))
    k = CELL / side                                         # proxy px -> sheet px
    cells = [dict(angle=a, col=i % COLS, row=i // COLS,
                  # ground centre of the building (world origin) inside the cell, and the screen vector of one metre along u
                  ax=(m0["CX"] - box[0]) * k, ay=(m0["CY"] - box[1]) * k) for i, a in enumerate(ANGLES)]
    meta = dict(type=name, **t, cell=CELL, cols=COLS, ppm=m0["S"] * k, PS=m0["PS"], PC=m0["PC"], bay=BAY, nbay=NBAY,
                L=BAY * NBAY, D=DEPTH, H=m0["H"], ridge=m0["ridge"], wall=WALL, roofc=ROOF, cells=cells)
    json.dump(meta, open(f"{I}/{tag}_meta.json", "w"), indent=1)
    print(name, f"ppm {meta['ppm']:.1f}", f"sheet {COLS * CELL}x{rows * CELL}")

if __name__ == "__main__":
    for name in (sys.argv[1:] or TYPES):
        build(name, TYPES[name])
