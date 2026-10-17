"""Measure base-edge angles of the buildings on a 3x3 angle sheet and compare with exact values for an orthographic camera.
   python measure_sheet.py SHEET.png OUT.png [pitch_deg=30] [angles=0,30,45,60,90,120,135,150,180]
   Buildings are found as the 9 largest blobs (labels and edge fringe are cut off by a morphological opening) and ordered
   row by row, so the grid need not be even. For each one the base corners come from the lower part of its convex hull:
   the lowest point and the leftmost / rightmost points; the two angles are the screen slopes of the edges meeting at the
   lowest corner. Frontal views (0, 90, 180...) should give ~0/0. Stairs, porches and eaves that reach the lower part of the
   silhouette bias the numbers, so check the annotated image."""
import sys, math
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage
from scipy.spatial import ConvexHull

src, out = sys.argv[1], sys.argv[2]
pitch = float(sys.argv[3]) if len(sys.argv) > 3 else 30.0
ANG = [float(a) for a in (sys.argv[4].split(",") if len(sys.argv) > 4 else "0,30,45,60,90,120,135,150,180".split(","))]
im = Image.open(src); rgba = np.asarray(im.convert("RGBA")).astype(np.float32)
alpha = rgba[..., 3]; lum = rgba[..., :3] @ np.array([0.299, 0.587, 0.114])
fg = ((alpha > 128) & (lum > 18)) if alpha.min() < 250 else (lum > 18)
fg = ndimage.binary_opening(fg, iterations=4)
lab, n = ndimage.label(fg)
sizes = ndimage.sum(fg, lab, range(1, n + 1))
keep = (np.argsort(sizes)[::-1][:len(ANG)] + 1).tolist()
cent = {k: ndimage.center_of_mass(lab == k) for k in keep}
rows = int(math.ceil(len(ANG) / 3))
by_y = sorted(keep, key=lambda k: cent[k][0])
order = []
for r in range(rows):
    order += sorted(by_y[r * 3:(r + 1) * 3], key=lambda k: cent[k][1])
sp = math.sin(math.radians(pitch))

def expected(a):
    if a % 90 == 0: return 0.0, 0.0
    t = math.radians(a)
    return sorted([math.degrees(math.atan(abs(math.tan(t)) * sp)), math.degrees(math.atan(abs(1 / math.tan(t)) * sp))])

def actual(a, aL, aR):
    """drawn rotation and camera pitch from the two base edges: tan aL = tan t * sin p, tan aR = cot t * sin p"""
    if a % 90 == 0: return None, None
    tl, tr = math.tan(math.radians(max(aL, 0.1))), math.tan(math.radians(max(aR, 0.1)))
    return 90 * (a // 90) + math.degrees(math.atan(math.sqrt(tl / tr))), math.degrees(math.asin(min(1.0, math.sqrt(tl * tr))))

vis = im.convert("RGB").copy(); d = ImageDraw.Draw(vis)
F = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 20)
print(f"{'угол':>5} {'левое':>7} {'правое':>7} {'точно':>12} {'ошибка':>7} {'нарисован':>10} {'наклон камеры':>14}")
for a, k in zip(ANG, order):
    ys, xs = np.nonzero(lab == k); pts = np.c_[xs, ys].astype(float)
    hull = pts[ConvexHull(pts).vertices]
    top, bot = ys.min(), ys.max(); low = hull[hull[:, 1] > bot - 0.35 * (bot - top)]
    B = low[np.argmax(low[:, 1])]; Lc = low[np.argmin(low[:, 0])]; Rc = low[np.argmax(low[:, 0])]
    aL = math.degrees(math.atan2(B[1] - Lc[1], B[0] - Lc[0])); aR = math.degrees(math.atan2(B[1] - Rc[1], Rc[0] - B[0]))
    e = expected(a); g = sorted([aL, aR]); err = max(abs(e[0] - g[0]), abs(e[1] - g[1]))
    d.line([tuple(Lc), tuple(B)], fill=(0, 220, 255), width=4); d.line([tuple(B), tuple(Rc)], fill=(255, 0, 220), width=4)
    d.text((xs.min(), max(0, top - 24)), f"{a:g}°: {aL:.0f}/{aR:.0f} (надо {e[0]:.0f}/{e[1]:.0f})", fill=(255, 255, 0), font=F)
    t, p = actual(a, aL, aR)
    print(f"{a:5g} {aL:7.1f} {aR:7.1f}   {e[0]:4.1f}/{e[1]:4.1f}  {err:6.1f} " + (f"{t:9.0f}° {p:12.0f}°" if t is not None else "      анфас"))
vis.save(out)
