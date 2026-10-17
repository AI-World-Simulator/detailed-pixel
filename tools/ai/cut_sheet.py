"""Cut a generated turnaround sheet into per-angle RGBA sprites, add mirrored angles, write sprites.json.
   python cut_sheet.py SHEET.png PROXY_MASK.png OUT_DIR --cols 4 --cell 512 --angles 0,15,30,45,60,75,90 [--mirror]
   The building is cut by the proxy mask of its cell (dilated), refined by colour distance from the cell's background
   (plain grey) so the generated silhouette, not the proxy's, decides the edge. Every sprite keeps the same scale and the
   same anchor (cell centre of the footprint), so the engine can place any angle at the same ground point.
   --mirror adds 360-a for every a in (0, 180) by flipping horizontally (valid for front/back-symmetric lighting).
   RGBA sheets (transparent background) skip the colour step and use their own alpha."""
import argparse, json, os
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

ap = argparse.ArgumentParser()
ap.add_argument("sheet"); ap.add_argument("mask"); ap.add_argument("out")
ap.add_argument("--cols", type=int, default=4); ap.add_argument("--cell", type=int, default=512)
ap.add_argument("--angles", default="0,15,30,45,60,75,90"); ap.add_argument("--mirror", action="store_true")
ap.add_argument("--grow", type=int, default=10, help="mask dilation in px: room for eaves, chimneys, details")
A = ap.parse_args()
os.makedirs(A.out, exist_ok=True)
sheet = Image.open(A.sheet); has_alpha = sheet.mode == "RGBA" and np.asarray(sheet)[..., 3].min() < 250
rgb = np.asarray(sheet.convert("RGB")).astype(np.float32)
alpha_src = np.asarray(sheet)[..., 3] if has_alpha else None
pm = np.asarray(Image.open(A.mask).convert("L").resize(sheet.size, Image.NEAREST)) > 127
angles = [float(a) for a in A.angles.split(",")]
meta = {"cell": A.cell, "sprites": []}

def cut(i):
    c, r = i % A.cols, i // A.cols
    y0, x0 = r * A.cell, c * A.cell
    cell = rgb[y0:y0 + A.cell, x0:x0 + A.cell]; m = pm[y0:y0 + A.cell, x0:x0 + A.cell]
    if not m.any(): return None, None
    if has_alpha:
        a = alpha_src[y0:y0 + A.cell, x0:x0 + A.cell].astype(np.float32) / 255
    else:
        ring = ndimage.binary_dilation(m, iterations=A.grow + 12) & ~ndimage.binary_dilation(m, iterations=A.grow + 4)
        bg = np.median(cell[ring] if ring.any() else cell.reshape(-1, 3), axis=0)
        dist = np.abs(cell - bg).sum(2)
        a = np.clip((dist - 18) / 30, 0, 1)                         # soft edge from colour distance to the background
        a *= ndimage.binary_dilation(m, iterations=A.grow)          # never outside the (grown) proxy footprint
        a = np.maximum(a, ndimage.binary_erosion(m, iterations=3))  # solid inside the proxy
        a = ndimage.binary_fill_holes(a > 0.5) * np.maximum(a, 0.0) # no holes where the facade matches the grey
        a = np.asarray(Image.fromarray((a * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.6))) / 255.0
    ys, xs = np.nonzero(m)
    anchor = (float(xs.mean()), float(ys.max()))                    # bottom of the footprint, centre column
    img = np.dstack([cell, a * 255]).astype(np.uint8)
    return Image.fromarray(img, "RGBA"), anchor

for i, ang in enumerate(angles):
    sp, anchor = cut(i)
    if sp is None: continue
    name = f"a{int(round(ang)):03d}.png"; sp.save(os.path.join(A.out, name))
    meta["sprites"].append({"angle": ang, "file": name, "anchor": anchor, "mirrored": False})
    if A.mirror and 0 < ang < 180:
        m_ang = (360 - ang) % 360; mname = f"a{int(round(m_ang)):03d}.png"
        sp.transpose(Image.FLIP_LEFT_RIGHT).save(os.path.join(A.out, mname))
        meta["sprites"].append({"angle": m_ang, "file": mname, "anchor": (A.cell - 1 - anchor[0], anchor[1]), "mirrored": True})
meta["sprites"].sort(key=lambda s: s["angle"])
json.dump(meta, open(os.path.join(A.out, "sprites.json"), "w"), indent=1)
print(f"{len(meta['sprites'])} sprites -> {A.out}")
