"""Suggest a bay grid and floor bands for a generated facade elevation, and draw an annotated preview.
   python facgrid.py FACADE.png PREVIEW.png [floor_m=3.3]
   Prints a JSON fragment for kit_spec (bx, corn, floor, ground, ppm); the ground-floor types (gt) are filled in by hand
   from the preview: S shop window, s shop door, D entrance, A arch, W window."""
import sys, json
import numpy as np
from PIL import Image, ImageDraw, ImageFont

src, prev = sys.argv[1], sys.argv[2]
floor_m = float(sys.argv[3]) if len(sys.argv) > 3 else 3.3
a = np.asarray(Image.open(src).convert('RGB')).astype(int)
H, W = a.shape[:2]
lum = a.sum(-1) / 3
# window glass: darker than the wall and bluish/grey; use local darkness against the row median
dark = lum < np.median(lum) * 0.62


def runs(v, thr, minlen=1):
    on = v > thr; r = []; s = None
    for i, x in enumerate(on):
        if x and s is None: s = i
        if not x and s is not None:
            if i - s >= minlen: r.append((s, i))
            s = None
    if s is not None and len(on) - s >= minlen: r.append((s, len(on)))
    return r

# facade extent: columns that are not near-white background
bgc = np.median(np.concatenate([a[:6].reshape(-1, 3), a[:, :6].reshape(-1, 3), a[:, -6:].reshape(-1, 3)]), 0)
fg = np.abs(a - bgc).sum(-1) > 40
colsfg = runs(fg.mean(0), 0.5, 20); rowsfg = runs(fg.mean(1), 0.5, 20)
fx0, fx1 = colsfg[0][0], colsfg[-1][1]
fy0, fy1 = rowsfg[0][0], rowsfg[-1][1]
# window rows inside the facade
wrow = runs(dark[:, fx0:fx1].mean(1), 0.12, 8)
# keep rows that look like floors (repeated)
upper = [r for r in wrow if r[1] < fy0 + (fy1 - fy0) * 0.78]
period = int(np.median(np.diff([r[0] for r in upper]))) if len(upper) > 1 else (fy1 - fy0) // 5
# window columns from the upper floors only
y0u, y1u = upper[0][0], upper[-1][1]
wc = runs(dark[y0u:y1u, fx0:fx1].mean(0), 0.18, 6)
cent = []
for s, e in wc:   # merge mullion halves closer than 1/4 of the median gap
    c = (s + e) / 2 + fx0
    if cent and c - cent[-1][1] < 0.22 * (wc[-1][0] - wc[0][0]) / max(1, len(wc) - 1):
        cent[-1] = (cent[-1][0], c)
    else:
        cent.append((c, c))
cs = [(p + q) / 2 for p, q in cent]
bx = [int(cs[0] - (cs[1] - cs[0]) / 2)] + [int((cs[i] + cs[i + 1]) / 2) for i in range(len(cs) - 1)] + [int(cs[-1] + (cs[-1] - cs[-2]) / 2)]
bx[0] = max(bx[0], fx0); bx[-1] = min(bx[-1], fx1)
gap = int(period * 0.22)
mid = upper[len(upper) // 2]
floor = [mid[0] - gap, mid[0] - gap + period]
corn = [max(fy0, upper[0][0] - gap - int(period * 0.5)), upper[0][0] - gap]
ground = [upper[-1][0] - gap + period, fy1 - 2]
ppm = round(period / floor_m, 1)
out = {"bx": bx, "corn": corn, "floor": floor, "ground": ground, "ppm": ppm}
print(json.dumps(out))
im = Image.open(src).convert('RGB')
d = ImageDraw.Draw(im)
F = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 30)
for x in bx: d.line([(x, 0), (x, H)], fill=(255, 0, 255), width=3)
for i in range(len(bx) - 1): d.text(((bx[i] + bx[i + 1]) // 2 - 8, ground[0] - 40), str(i), fill=(255, 0, 255), font=F)
for y, c in [(floor[0], (0, 160, 255)), (floor[1], (0, 160, 255)), (ground[0], (255, 120, 0)), (ground[1], (255, 120, 0)), (corn[0], (0, 200, 0)), (corn[1], (0, 200, 0))]:
    d.line([(0, y), (W, y)], fill=c, width=3)
im.save(prev)
