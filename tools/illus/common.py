"""Shared image helpers for the illustrated-animation experiment (numpy/scipy/Pillow only, run with ~/ComfyUI/.venv/bin/python).
   Images are float32 arrays in 0..1: rgb (H, W, 3), alpha (H, W)."""
import os
import numpy as np
from PIL import Image
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))


def load_rgb(p):
    return np.asarray(Image.open(p).convert("RGB"), dtype=np.float32) / 255.0


def load_mask(p):
    return np.asarray(Image.open(p).convert("L"), dtype=np.float32) / 255.0


def save_rgba(p, rgb, a):
    os.makedirs(os.path.dirname(p) or ".", exist_ok=True)
    arr = np.dstack([np.clip(rgb, 0, 1), np.clip(a, 0, 1)])
    Image.fromarray((arr * 255 + 0.5).astype(np.uint8), "RGBA").save(p)


def load_rgba(p):
    arr = np.asarray(Image.open(p).convert("RGBA"), dtype=np.float32) / 255.0
    return arr[..., :3], arr[..., 3]


def bg_color(rgb, border=6):
    """Median colour of the image border (our renders have a flat light background)."""
    b = np.concatenate([rgb[:border].reshape(-1, 3), rgb[-border:].reshape(-1, 3),
                        rgb[:, :border].reshape(-1, 3), rgb[:, -border:].reshape(-1, 3)])
    return np.median(b, axis=0)


def decontaminate(rgb, a, bg):
    """Remove the background colour mixed into soft edge pixels: C = (I - (1 - a) * bg) / a."""
    aa = np.maximum(a, 0.05)[..., None]
    out = (rgb - (1 - aa) * bg) / aa
    return np.where(a[..., None] > 0.02, np.clip(out, 0, 1), rgb)


def clean_alpha(a, lo=0.04, hi=0.97, min_area=400):
    """Snap near-0/near-1 values and drop small detached specks (BiRefNet sometimes keeps a few background blobs)."""
    a = np.where(a < lo, 0, np.where(a > hi, 1, a)).astype(np.float32)
    lab, n = ndimage.label(a > 0.5)
    if n > 1:
        sizes = ndimage.sum(np.ones_like(a), lab, range(1, n + 1))
        keep = np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s >= min_area])
        grown = ndimage.binary_dilation(keep, iterations=3)
        a = a * grown
    return a


def bbox(a, thr=0.5):
    ys, xs = np.where(a > thr)
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def feet_row(a, thr=0.5, min_px=6):
    """Lowest row with a few solid pixels: the ground line of a standing character."""
    rows = np.where((a > thr).sum(1) >= min_px)[0]
    return int(rows.max())


def neck_row(a, y0, y1):
    """Narrowest silhouette row between the head and the shoulders (searched in [y0, y1))."""
    w = (a[y0:y1] > 0.5).sum(1)
    return y0 + int(np.argmin(w))


def shift(img, dy, dx):
    """Integer shift with zero fill (works for (H, W) and (H, W, C))."""
    out = np.zeros_like(img)
    H, W = img.shape[:2]
    ys, yd = (slice(0, H - dy), slice(dy, H)) if dy >= 0 else (slice(-dy, H), slice(0, H + dy))
    xs, xd = (slice(0, W - dx), slice(dx, W)) if dx >= 0 else (slice(-dx, W), slice(0, W + dx))
    out[yd, xd] = img[ys, xs]
    return out


def grey(rgb):
    return rgb @ np.array([0.299, 0.587, 0.114], dtype=np.float32)


def resize(arr, s):
    """Bilinear resize of a float image by factor s (Pillow, per channel)."""
    H, W = arr.shape[:2]
    size = (max(1, int(round(W * s))), max(1, int(round(H * s))))
    if arr.ndim == 2:
        return np.asarray(Image.fromarray(arr.astype(np.float32), "F").resize(size, Image.BILINEAR))
    return np.dstack([resize(arr[..., c], s) for c in range(arr.shape[2])])


def ncc_search(img, tpl, cx, cy, rad):
    """Best top-left position of tpl inside img near (cx, cy) (± rad) by normalised cross-correlation. Returns (score, x, y)."""
    th, tw = tpl.shape
    t = tpl - tpl.mean()
    tn = np.sqrt((t * t).sum()) + 1e-6
    best = (-2, cx, cy)
    x0, x1 = max(0, cx - rad), min(img.shape[1] - tw, cx + rad)
    y0, y1 = max(0, cy - rad), min(img.shape[0] - th, cy + rad)
    for step in (4, 1):
        xs = range(x0, x1 + 1, step) if step == 4 else range(max(x0, best[1] - 4), min(x1, best[1] + 4) + 1)
        ys = range(y0, y1 + 1, step) if step == 4 else range(max(y0, best[2] - 4), min(y1, best[2] + 4) + 1)
        for y in ys:
            for x in xs:
                p = img[y:y + th, x:x + tw]
                pm = p - p.mean()
                s = (pm * t).sum() / (np.sqrt((pm * pm).sum()) * tn + 1e-6)
                if s > best[0]:
                    best = (s, x, y)
    return best


def register_head(base_rgb, box, rgb, scales=np.arange(0.84, 1.101, 0.02), rad=140):
    """Find the base head (box = x0, y0, x1, y1) in another frame: scale s and the position of the head centre.
       Matching runs on the gradient magnitude of grey images at half resolution (fast, ignores flat colour drift).
       Returns dict(s, dx, dy, score): the head centre moved by (dx, dy), its size is s * base size."""
    def edges(g):
        g = ndimage.gaussian_filter(g, 1.0)
        return np.hypot(ndimage.sobel(g, 0), ndimage.sobel(g, 1))
    h = 0.5
    B = edges(grey(resize(base_rgb, h)))
    F = edges(grey(resize(rgb, h)))
    x0, y0, x1, y1 = [int(round(v * h)) for v in box]
    tpl0 = B[y0:y1, x0:x1]
    ccx, ccy = (x0 + x1) / 2, (y0 + y1) / 2
    # coarse: base size, wide window (the model may move the whole figure); fine: all scales around the coarse hit
    sc, x, y = ncc_search(F, tpl0, x0, y0, int(rad * h))
    cx0, cy0 = x + (x1 - x0) / 2, y + (y1 - y0) / 2
    best = None
    for s in scales:
        tpl = resize(tpl0, s)
        th, tw = tpl.shape
        sc, x, y = ncc_search(F, tpl, int(round(cx0 - tw / 2)), int(round(cy0 - th / 2)), 8)
        if best is None or sc > best[0]:
            best = (sc, s, x + tw / 2 - ccx, y + th / 2 - ccy)
    sc, s, dx, dy = best
    return dict(score=float(sc), s=float(s), dx=float(dx / h), dy=float(dy / h))


def feather(mask, r):
    """Soft edge: blur a binary mask by a Gaussian of radius r (px)."""
    return np.clip(ndimage.gaussian_filter(mask.astype(np.float32), r / 2.0), 0, 1)


def over(dst_rgb, dst_a, src_rgb, src_a):
    """Porter-Duff 'over' for straight (non-premultiplied) alpha."""
    out_a = src_a + dst_a * (1 - src_a)
    num = src_rgb * src_a[..., None] + dst_rgb * (dst_a * (1 - src_a))[..., None]
    out_rgb = np.where(out_a[..., None] > 1e-4, num / np.maximum(out_a, 1e-4)[..., None], 0)
    return out_rgb, out_a


def extend_edges(rgb, a, iters=12):
    """Bleed the colours of opaque pixels into transparent ones (avoids dark/grey fringes after resampling)."""
    rgb = rgb.copy()
    known = a > 0.5
    for _ in range(iters):
        grown = ndimage.binary_dilation(known)
        ring = grown & ~known
        if not ring.any():
            break
        acc = np.zeros_like(rgb)
        cnt = np.zeros(a.shape, np.float32)
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                k = shift(known.astype(np.float32), dy, dx)
                acc += shift(rgb * known[..., None], dy, dx)
                cnt += k
        rgb[ring] = (acc[ring] / np.maximum(cnt[ring], 1)[:, None])
        known = grown
    return rgb
