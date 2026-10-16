"""Build the sprite atlas used by the street renderer.
   python pack.py spec.json OUT_PREFIX
   spec: {"tree": {"src": ["dir1", ...], "widths": [...], "classify": "hue", "trunk": true},
          "car":  {"src": [...], "widths": [...], "classify": "none"}}
   Writes OUT_PREFIX.png (atlas), OUT_PREFIX.json (groups -> categories -> sprites -> mips),
   OUT_PREFIX.rgba (raw RGBA for the headless renderer)."""
import sys, os, json, colorsys
import numpy as np
from PIL import Image
from scipy import ndimage as nd
sys.path.insert(0, os.path.dirname(__file__))
from sprites import pixelize


def load_sprites(dirs):
    out = []
    for d in dirs:
        for f in sorted(os.listdir(d)):
            if f.endswith('.png'):
                out.append((os.path.join(d, f), np.asarray(Image.open(os.path.join(d, f)).convert('RGBA')).astype(np.float32)))
    return out


def strip_trunk(a):
    """remove a brown trunk sticking out below a tree crown, then re-crop"""
    rgb, al = a[..., :3], a[..., 3] > 128
    hsv = np.array([colorsys.rgb_to_hsv(*(p / 255.0)) for p in rgb.reshape(-1, 3)]).reshape(rgb.shape)
    h, s, v = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    brown = al & (h > 0.02) & (h < 0.12) & (s > 0.3) & (v < 0.75)
    H = a.shape[0]
    rows = np.arange(H)[:, None] * np.ones((1, a.shape[1]))
    # only in the lower part, below the widest row of the crown
    widths = al.sum(1)
    wrow = int(np.argmax(widths))
    trunk = brown & (rows > wrow)
    keep = al & ~trunk
    # drop the narrow stem rows below the crown: rows whose width is < 30% of the max
    for y in range(H - 1, wrow, -1):
        if keep[y].sum() < 0.3 * widths.max():
            keep[y] = False
        else:
            break
    lab, n = nd.label(keep)
    if n > 1:
        sizes = nd.sum(keep, lab, range(1, n + 1))
        keep = lab == (1 + int(np.argmax(sizes)))
    b = a.copy()
    b[..., 3] = np.where(keep, b[..., 3], 0)
    ys, xs = np.where(keep)
    return b[ys.min():ys.max() + 1, xs.min():xs.max() + 1]


def tree_cat(a):
    al = a[..., 3] > 128
    rgb = a[..., :3][al] / 255.0
    hsv = np.array([colorsys.rgb_to_hsv(*p) for p in rgb])
    h = np.median(hsv[:, 0]); s = np.median(hsv[:, 1]); v = np.median(hsv[:, 2])
    if 0.7 < h < 0.85 or (0.6 < h <= 0.7):
        return 'p'
    if h >= 0.85 or (h < 0.03 and s < 0.5):
        return 'k'
    if h < 0.1:
        return 'o'
    if h < 0.17:
        return 'y'
    if v < 0.45:
        return 'd'
    return 'g'


def seamless(a, crop):
    H, W = a.shape[:2]
    y0, x0 = (H - crop) // 2, (W - crop) // 2
    a = a[y0:y0 + crop, x0:x0 + crop].astype(np.float32)
    N = crop
    t = np.minimum(np.arange(N), N - 1 - np.arange(N)) / (N / 2)
    wa = np.outer(t, t)[..., None] + 1e-3
    b = np.roll(np.roll(a, N // 2, 0), N // 2, 1)
    wb = np.roll(np.roll(wa, N // 2, 0), N // 2, 1)
    return (a * wa + b * wb) / (wa + wb)


def main():
    spec = json.load(open(sys.argv[1]))
    pre = sys.argv[2]
    items = []  # (group, cat, sprite_index, mip_w, array)
    groups = {}
    for gname, g in spec.items():
        cats = {}
        if g.get('fk'):  # modular facades: bands cut to a bay grid, ground-floor bay types annotated by hand
            for fd in g['fk']:
                im = np.asarray(Image.open(fd['f']).convert('RGBA')).astype(np.float32)
                ppm = fd['ppm']
                bx = fd.get('bx') or [fd['x0'] + fd['bay'] * i for i in range(fd['nb'] + 1)]   # bay boundaries (source px)
                x0, x1, nb = bx[0], bx[-1], len(bx) - 1
                bf = [round((b - x0) / (x1 - x0), 5) for b in bx]
                bands = [im[fd[k][0]:fd[k][1], x0:x1] for k in ('corn', 'floor', 'ground')]
                Wm = (x1 - x0) / ppm; Hm = [b.shape[0] / ppm for b in bands]
                fl = bands[1][..., :3].reshape(-1, 3)
                qv = (fl // 12).astype(int); keys = qv[:, 0] * 10000 + qv[:, 1] * 100 + qv[:, 2]
                vals, cnt = np.unique(keys, return_counts=True); wall = fl[keys == vals[np.argmax(cnt)]].mean(0)
                mips = []
                for sc in g['scales']:
                    w = max(nb, round(Wm * sc))
                    parts = []
                    for b, hm in zip(bands, Hm):
                        h = max(1, round(hm * sc * g['stf']))
                        b2 = b.copy(); b2[..., 3] = 255
                        parts.append(pixelize(b2, w, g.get('colors', 24), height=h))
                    m = np.concatenate(parts, 0); m[..., 3] = 255
                    mips.append((m, w / Wm, [pp.shape[0] for pp in parts]))
                cats.setdefault(fd['cat'], []).append((fd['f'], mips, {'Wm': Wm, 'Hc': Hm[0], 'Hf': Hm[1], 'Hg': Hm[2], 'nb': nb, 'bf': bf, 'keep': bool(fd.get('keep')), 'gt': fd.get('gt', ''), 'gm': {k: [[round((r[0] - x0) / (x1 - x0), 5), round((r[1] - x0) / (x1 - x0), 5)] for r in v] for k, v in fd.get('gm', {}).items()}, 'wall': [int(v) for v in wall]}))
            groups[gname] = cats
            print(gname, {k: len(v) for k, v in cats.items()})
            continue
        if g.get('facs'):
            for fd in g['facs']:
                im = np.asarray(Image.open(fd['f']).convert('RGBA')).astype(np.float32)
                x0, x1 = fd['x']; ppm = fd['ppm']
                bands = [im[fd[k][0]:fd[k][1], x0:x1] for k in ('corn', 'floor', 'ground')]
                Wm = (x1 - x0) / ppm; Hm = [(b.shape[0]) / ppm for b in bands]
                # dominant wall colour: most common quantised colour of the floor band
                fl = bands[1][..., :3].reshape(-1, 3)
                q = (fl // 12).astype(int); keys = q[:, 0] * 10000 + q[:, 1] * 100 + q[:, 2]
                vals, cnt = np.unique(keys, return_counts=True); k = vals[np.argmax(cnt)]
                wall = fl[keys == k].mean(0)
                mips = []
                for sc in g['scales']:
                    w = max(2, round(Wm * sc))
                    parts = []
                    for b, hm in zip(bands, Hm):
                        h = max(1, round(hm * sc * g['stf']))
                        b2 = b.copy(); b2[..., 3] = 255
                        parts.append(pixelize(b2, w, g.get('colors', 24), height=h))
                    m = np.concatenate(parts, 0)
                    m = m.copy(); m[..., 3] = 255
                    mips.append((m, sc, [p.shape[0] for p in parts]))
                cats.setdefault(fd['cat'], []).append((fd['f'], mips, {'Wm': Wm, 'Hc': Hm[0], 'Hf': Hm[1], 'Hg': Hm[2], 'wall': [int(v) for v in wall]}))
            groups[gname] = cats
            print(gname, {k: len(v) for k, v in cats.items()})
            continue
        if g.get('tex'):
            for cat, f in g['tex'].items():
                if isinstance(f, dict):   # an exact crop that already tiles (e.g. a whole number of seam periods)
                    x0, y0, x1, y1 = f['box']
                    a = np.asarray(Image.open(f['f']).convert('RGBA')).astype(np.float32)[y0:y1, x0:x1].copy()
                    if f.get('blend'):
                        a = seamless(a, min(a.shape[0], a.shape[1]))
                else:
                    a = seamless(np.asarray(Image.open(f).convert('RGBA')).astype(np.float32), g.get('crop', 512))
                a[..., 3] = 255
                mips = [pixelize(a, w, g.get('colors', 16)) for w in g['widths']]
                cats[cat] = [(f, mips)]
            groups[gname] = cats
            print(gname, list(cats))
            continue
        sprites = load_sprites(g['src'])
        for path, a in sprites:
            if g.get('trunk'):
                try:
                    a = strip_trunk(a)
                except Exception as ex:
                    print('skip', path, ex)
                    continue
            if a.shape[0] < 8 or a.shape[1] < 8:
                continue
            if g.get('grade'):
                sat, val = g['grade']
                rgb = a[..., :3] / 255.0
                mx = rgb.max(-1, keepdims=True); mn = rgb.min(-1, keepdims=True)
                grey = (mx + mn) / 2
                rgb = (grey + (rgb - grey) * sat) * val
                a = a.copy(); a[..., :3] = (rgb.clip(0, 1) * 255)
            ar = a.shape[0] / a.shape[1]
            if g.get('maxar') and (ar > g['maxar'] or ar < 1 / g['maxar']):
                print('aspect skip', path, round(ar, 2))
                continue
            cat = tree_cat(a) if g.get('classify') == 'hue' else g.get('cat', 'a')
            if path in g.get('override', {}):
                cat = g['override'][path]
            mips = []
            for w in g['widths']:
                if w > a.shape[1] * 1.05:
                    break
                mips.append(pixelize(a, w, g.get('colors', 14), g.get('outline', False)))
            if not mips:
                continue
            cats.setdefault(cat, []).append((path, mips))
        groups[gname] = cats
        print(gname, {k: len(v) for k, v in cats.items()})
    # shelf packing, tallest first
    flat = []
    extra = {}
    for gname, cats in groups.items():
        for cat, sl in cats.items():
            for si, ent in enumerate(sl):
                path, mips = ent[0], ent[1]
                for mi, m in enumerate(mips):
                    info = None
                    if isinstance(m, tuple):
                        m, scv, bh = m
                        info = {'s': scv, 'b': bh}
                        info.update(ent[2])
                    flat.append((gname, cat, si, mi, m, info))
    flat.sort(key=lambda t: -t[4].shape[0])
    AW = 1024
    x = y = sh = 0
    pos = []
    for t in flat:
        h, w = t[4].shape[:2]
        if x + w + 1 > AW:
            x = 0; y += sh + 1; sh = 0
        pos.append((x, y))
        x += w + 1; sh = max(sh, h)
    AH = y + sh + 1
    atlas = np.zeros((AH, AW, 4), np.uint8)
    meta = {}
    for t, (px, py) in zip(flat, pos):
        gname, cat, si, mi, m, info = t
        h, w = m.shape[:2]
        atlas[py:py + h, px:px + w] = m
        L = meta.setdefault(gname, {}).setdefault(cat, [])
        while len(L) <= si:
            L.append([])
        d = {'x': px, 'y': py, 'w': w, 'h': h}
        if info:
            d.update(info)
        L[si].append(d)
    for g in meta.values():
        for L in g.values():
            for sp in L:
                sp.sort(key=lambda m: m['w'])
    Image.fromarray(atlas, 'RGBA').save(pre + '.png', optimize=True)
    open(pre + '.rgba', 'wb').write(atlas.tobytes())
    json.dump({'w': AW, 'h': AH, 'g': meta}, open(pre + '.json', 'w'))
    print('atlas', AW, AH, os.path.getsize(pre + '.png') // 1024, 'KB')


if __name__ == '__main__':
    main()
