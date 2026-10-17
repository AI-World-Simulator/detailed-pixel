"""IoU of a generated RGBA sprite (alpha) or opaque image (vs border colour) against a proxy mask; also a shift-tolerant IoU
   (best over small translations) to separate 'wrong place' from 'wrong shape/angle'.  python qscore.py IMG MASK"""
import sys, numpy as np
from PIL import Image
from scipy import ndimage

def fg_mask(path):
    im = Image.open(path)
    if im.mode == "RGBA" and (np.asarray(im)[..., 3] < 64).mean() > 0.05:   # really transparent, not just a stray alpha
        return np.asarray(im)[..., 3] > 128
    a = np.asarray(im.convert("RGB")).astype(np.float32)
    border = np.concatenate([a[:12].reshape(-1, 3), a[-12:].reshape(-1, 3), a[:, :12].reshape(-1, 3), a[:, -12:].reshape(-1, 3)])
    fg = np.abs(a - np.median(border, 0)).sum(2) > 40
    return ndimage.binary_fill_holes(ndimage.binary_opening(fg, iterations=2))

def iou(a, b): return float((a & b).sum() / max(1, (a | b).sum()))

def score(img, mask_path, single=True):
    m = np.asarray(Image.open(mask_path).convert("L").resize(Image.open(img).size)) > 127
    g = fg_mask(img)
    lab, n = ndimage.label(g)
    if n > 1 and single: g = lab == (np.argmax(ndimage.sum(g, lab, range(1, n + 1))) + 1)   # sheets: keep all buildings
    best = iou(g, m)
    cy, cx = ndimage.center_of_mass(g); my, mx = ndimage.center_of_mass(m)
    sh = np.roll(np.roll(g, int(round(my - cy)), 0), int(round(mx - cx)), 1)   # align centroids
    return round(iou(g, m), 3), round(max(best, iou(sh, m)), 3)

if __name__ == "__main__":
    print(score(sys.argv[1], sys.argv[2]))
