"""Sprite extraction and pixelisation for AI-generated sprite sheets.

  python sprites.py cut SHEET.png OUTDIR [--minarea N] [--tol T]
      background = median border colour; components not touching the border become sprites
  python sprites.py px IN.png OUT.png WIDTH [--colors N] [--outline]
      area-downscale to WIDTH px, alpha threshold, per-sprite palette, optional dark outline
"""
import sys, os, json
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage as nd


def load(p):
    return np.asarray(Image.open(p).convert('RGBA')).astype(np.float32)


def cut(sheet, outdir, minarea=900, tol=38.0, pad=2):
    a = load(sheet)
    rgb = a[..., :3]
    H, W = rgb.shape[:2]
    border = np.concatenate([rgb[:4].reshape(-1, 3), rgb[-4:].reshape(-1, 3), rgb[:, :4].reshape(-1, 3), rgb[:, -4:].reshape(-1, 3)])
    bg = np.median(border, axis=0)
    d = np.sqrt(((rgb - bg) ** 2).sum(-1))
    transparent = (a[..., 3] < 20).mean() > 0.2      # a real alpha channel (e.g. Qwen-Image RGBA output)
    if transparent:
        d = a[..., 3] / 255.0 * (tol * 2)
    fg = d > tol
    fg = nd.binary_opening(fg, iterations=1)
    fg = nd.binary_fill_holes(fg)
    lab, n = nd.label(fg)
    os.makedirs(outdir, exist_ok=True)
    meta = []
    objs = nd.find_objects(lab)
    k = 0
    for i, sl in enumerate(objs):
        if sl is None:
            continue
        m = lab[sl] == i + 1
        area = int(m.sum())
        if area < minarea:
            continue
        ys, xs = sl
        if ys.start == 0 or xs.start == 0 or ys.stop == H or xs.stop == W:
            continue
        crop = a[sl].copy()
        # soft alpha from distance to background near the edge
        dd = d[sl]
        alpha = np.clip((dd - tol * 0.6) / (tol * 0.8), 0, 1)
        alpha = np.where(nd.binary_erosion(m, iterations=1), 1.0, 0.0)
        crop[..., 3] = alpha * 255
        crop = np.pad(crop, ((pad, pad), (pad, pad), (0, 0)))
        im = Image.fromarray(crop.astype(np.uint8), 'RGBA')
        name = f'{k:03d}.png'
        im.save(os.path.join(outdir, name))
        meta.append({'f': name, 'x': xs.start, 'y': ys.start, 'w': xs.stop - xs.start, 'h': ys.stop - ys.start, 'area': area})
        k += 1
    json.dump({'bg': bg.tolist(), 'sprites': meta}, open(os.path.join(outdir, 'meta.json'), 'w'), indent=1)
    print(f'{sheet}: bg={bg.round()} {k} sprites')


def pixelize(src, width, colors=14, outline=False, height=None, athr=0.5, sharp=0.0):
    """src: RGBA float array (0..255). Returns uint8 RGBA at target size.
       sharp > 0: unsharp mask on the downscaled image before the palette (crisper windows and edges)."""
    H, W = src.shape[:2]
    if height is None:
        height = max(1, round(H * width / W))
    al = src[..., 3:4] / 255.0
    pm = np.concatenate([src[..., :3] * al, al], -1)
    # area average via PIL BOX on premultiplied channels
    chans = []
    for c in range(4):
        im = Image.fromarray(pm[..., c].astype(np.float32), 'F').resize((width, height), Image.BOX)
        chans.append(np.asarray(im))
    pm2 = np.stack(chans, -1)
    a2 = pm2[..., 3]
    rgb = np.where(a2[..., None] > 1e-4, pm2[..., :3] / np.maximum(a2[..., None], 1e-4), 0)
    mask = a2 > athr
    if sharp > 0 and mask.any():
        if not mask.all():  # spread opaque colours outwards so the transparent surround does not darken the edges
            idx = nd.distance_transform_edt(~mask, return_distances=False, return_indices=True)
            rgb = rgb[idx[0], idx[1]]
        im = Image.fromarray(rgb.clip(0, 255).astype(np.uint8), 'RGB').filter(ImageFilter.UnsharpMask(radius=0.8, percent=int(sharp * 100), threshold=1))
        rgb = np.asarray(im).astype(np.float32)
    out = np.zeros((height, width, 4), np.uint8)
    if mask.sum() == 0:
        return out
    px = rgb[mask].clip(0, 255).astype(np.uint8)
    # palette by median cut on the opaque pixels only
    strip = Image.fromarray(px.reshape(1, -1, 3), 'RGB')
    q = strip.quantize(colors=min(colors, max(2, len(px))), method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    pal = np.array(q.getpalette()[:3 * colors]).reshape(-1, 3)
    idx = np.asarray(q).reshape(-1)
    out[mask, :3] = pal[idx]
    out[mask, 3] = 255
    if outline:
        m = mask
        edge = m & ~nd.binary_erosion(m)
        # darken the silhouette edge (stronger at bottom/right, away from the light)
        o = out.astype(np.float32)
        sh = np.zeros_like(m, np.float32)
        sh[edge] = 0.72
        br = edge & ~np.roll(m, -1, 0) | edge & ~np.roll(m, -1, 1)
        sh[br] = 0.55
        o[..., :3] = np.where(sh[..., None] > 0, o[..., :3] * sh[..., None], o[..., :3])
        out = o.clip(0, 255).astype(np.uint8)
    return out


if __name__ == '__main__':
    cmd = sys.argv[1]
    if cmd == 'cut':
        args = sys.argv[2:]
        kw = {}
        if '--minarea' in args:
            kw['minarea'] = int(args[args.index('--minarea') + 1])
        if '--tol' in args:
            kw['tol'] = float(args[args.index('--tol') + 1])
        cut(args[0], args[1], **kw)
    elif cmd == 'px':
        src, dst, w = sys.argv[2], sys.argv[3], int(sys.argv[4])
        args = sys.argv[5:]
        colors = int(args[args.index('--colors') + 1]) if '--colors' in args else 14
        out = pixelize(load(src), w, colors, '--outline' in args)
        Image.fromarray(out, 'RGBA').save(dst)
