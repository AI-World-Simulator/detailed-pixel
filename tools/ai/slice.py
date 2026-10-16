"""Cut a baked district into webp chunks with a soft transparent outer edge.
   python slice.py BAKED.png OUTPREFIX CHUNK FEATHER"""
import sys, os
import numpy as np
from PIL import Image

src, pre, cs, fe = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
a = np.asarray(Image.open(src).convert('RGB'))
H, W = a.shape[:2]
def ramp(n):
    t = np.minimum(np.arange(n), n - 1 - np.arange(n)).astype(np.float32)
    r = np.clip(t / fe, 0, 1)
    return r * r * (3 - 2 * r)
al = (np.outer(ramp(H), ramp(W)) * 255).astype(np.uint8)
rgba = np.dstack([a, al])
os.makedirs(os.path.dirname(pre) or '.', exist_ok=True)
tot = 0
for j in range(H // cs):
    for i in range(W // cs):
        p = f'{pre}{i}_{j}.webp'
        Image.fromarray(rgba[j * cs:(j + 1) * cs, i * cs:(i + 1) * cs], 'RGBA').save(p, 'WEBP', quality=86, method=6)
        tot += os.path.getsize(p)
print('chunks', (W // cs) * (H // cs), 'total KB', tot // 1024)
