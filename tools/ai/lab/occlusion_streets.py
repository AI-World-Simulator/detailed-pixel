"""Hidden share split into streets (the largest connected open-ground area) and enclosed yards, per camera pitch.
   python occlusion_streets.py DIR   (reads DIR/heights_<city>_900.f32 written by occlusion.js with DUMP_DIR)"""
import sys, glob, math, os
import numpy as np
from scipy import ndimage
PERSON = 1.7
PITCHES = [30, 40, 45, 50, 55, 60]
def hidden_mask(H, tn):
    N = H.shape[0]; hid = np.zeros_like(H, bool); lim = np.full(N, 1e9)
    for j in range(N - 1, -1, -1):                     # south (camera side) to north
        h = H[j]; y = j + 0.5
        b = h > PERSON; lim[b] = np.minimum(lim[b], y - (h[b] - PERSON) / tn)
        hid[j] = (h == 0) & (y > lim)
    return hid
print(f"{'город':9s} {'где':6s} " + " ".join(f"{p:>5d}°" for p in PITCHES) + "  движок")
for f in sorted(glob.glob(os.path.join(sys.argv[1], "heights_*_900.f32"))):
    city = os.path.basename(f).split("_")[1]
    H = np.fromfile(f, dtype=np.float32).reshape(900, 900)
    ground = H == 0
    lab, n = ndimage.label(ground)
    big = np.argmax(ndimage.sum(ground, lab, range(1, n + 1))) + 1
    street = lab == big; yard = ground & ~street
    rows = {"улицы": street, "дворы": yard}
    res = {k: [] for k in rows}
    for tn in [math.tan(math.radians(p)) for p in PITCHES] + [1 / 0.6]:
        hm = hidden_mask(H, tn)
        for k, m in rows.items(): res[k].append(hm[m].mean() if m.any() else float("nan"))
    for k in rows:
        print(f"{city:9s} {k:6s} " + " ".join(f"{v * 100:5.0f}%" for v in res[k][:-1]) + f"  {res[k][-1] * 100:5.0f}%   (доля площади {rows[k].mean() * 100:.0f}%)")
