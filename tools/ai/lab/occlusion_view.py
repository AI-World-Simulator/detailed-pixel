"""Render a piece of a city height raster (from occlusion.js DUMP_DIR) with an orthographic camera at several pitches,
   with random 'people' on the ground: green = visible, red = fully hidden behind a building (person height 1.7 m).
   python occlusion_view.py heights_moscow_900.f32 OUT.png [cx cy size] [pitches...]"""
import sys, math
import numpy as np
from PIL import Image, ImageDraw, ImageFont

src, out = sys.argv[1], sys.argv[2]
cx, cy, size = (int(v) for v in sys.argv[3:6]) if len(sys.argv) > 5 else (450, 450, 220)
pitches = [float(p) for p in sys.argv[6:]] or [30, 45, 60]
N = int(round(math.sqrt(np.fromfile(src, dtype=np.float32).size)))
H = np.fromfile(src, dtype=np.float32).reshape(N, N)
win = H[cy - size // 2:cy + size // 2, cx - size // 2:cx + size // 2]
n = win.shape[0]; SC = 3                                   # px per metre
PERSON = 1.7
rng = np.random.default_rng(7)
gy, gx = np.nonzero(win == 0)
pick = rng.choice(len(gy), size=min(260, len(gy)), replace=False)
people = list(zip(gx[pick], gy[pick]))
F = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 22)

def render(pitch):
    sp, cp = math.sin(math.radians(pitch)), math.cos(math.radians(pitch)); tn = math.tan(math.radians(pitch))
    hmax = float(win.max())
    W = n * SC; Hs = int((n * sp + hmax * cp) * SC) + 4
    img = np.zeros((Hs, W, 3), np.uint8); img[:] = (205, 214, 190)
    oy = hmax * cp * SC + 2
    for j in range(n):                                     # far (north, small y) first, near rows overwrite
        h = win[j]; yb = oy + j * sp * SC
        for i in np.nonzero(h > 0)[0]:
            top = int(yb - h[i] * cp * SC); bot = int(yb + sp * SC)
            shade = 150 + int(min(1.0, h[i] / 60) * 60)
            img[max(0, top):max(0, int(yb)), i * SC:(i + 1) * SC] = (shade - 40, shade - 50, shade - 60)   # wall
            img[max(0, int(yb - h[i] * cp * SC)):max(0, int(yb - h[i] * cp * SC + sp * SC) + 1), i * SC:(i + 1) * SC] = (180, 95, 70) if h[i] < 25 else (150, 150, 155)  # roof
    im = Image.fromarray(img); d = ImageDraw.Draw(im)
    hidden = 0
    for (i, j) in people:
        lim = 1e9                                          # same test as occlusion.js, per person column
        for jj in range(j + 1, n):
            hh = win[jj, i]
            if hh > PERSON and (jj - j) < (hh - PERSON) / tn: lim = 0; break
        hid = lim == 0; hidden += hid
        x = i * SC + 1; y = oy + j * sp * SC
        if hid: d.line([(x - 4, y - 4), (x + 4, y + 4)], fill=(220, 30, 30), width=2); d.line([(x - 4, y + 4), (x + 4, y - 4)], fill=(220, 30, 30), width=2)
        else: d.rectangle([x - 2, y - 10, x + 2, y], fill=(20, 150, 40))
    d.rectangle([0, 0, 360, 34], fill=(255, 255, 255)); d.text((8, 5), f"наклон {pitch:g}°: скрыто {hidden}/{len(people)}", fill="black", font=F)
    return im

ims = [render(p) for p in pitches]
Wt = sum(i.width for i in ims) + 10 * (len(ims) - 1); Ht = max(i.height for i in ims)
g = Image.new("RGB", (Wt, Ht), "white"); x = 0
for im in ims: g.paste(im, (x, 0)); x += im.width + 10
g.save(out, quality=88); print(out, g.size)
