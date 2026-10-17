"""Animation frames from AI pixel-art renders: grid detection, per-cell sampling, background removal,
   one palette per character, registration of every frame onto the base frame.

  python anim.py grid IMG
      print the detected pixel grid (period and phase in source pixels)
  python anim.py split IMG OUTPREFIX [--canvas 768] [--pad 24]
      separate objects of a lineup/sheet (flat background) -> OUTPREFIX_<i>.png, each centred on a square canvas
      of the background colour (input for edit models, which keep the canvas and the grid)
  python anim.py cut IMG OUTDIR [--names a,b,c] [--colors 16] [--min 6]
      sheet of separate objects -> one low-res RGBA sprite per object (own grid phase, period near the sheet's)
  python anim.py char SPEC.json OUTDIR
      character frames -> OUTDIR/<name>/<frame>.png + meta.json + qa.json, OUTDIR/_<name>_preview.png (ground/neck lines)
      SPEC: {"name": "woman", "colors": 28, "period": 12.28, "base": "base.png",
             "frames": {"wave": "wave.png", "blink": {"src": "blink.png", "local": "eyes"},
                        "read": {"src": "read.png", "mask": "m_read.png"}, "hop": {"src": "hop.png", "air": true}}}
      People (default; rules in docs/character-animation.md):
        - every frame is cut on the base frame's cell lattice shifted by the head drift (phase correlation), so
          features of ~1.5 cells (eyes) round the same way in every frame;
        - one palette from the base frame, near-twin colours merged, a few slots for colours only new objects bring;
        - frames stand on the base ground line: the lowest row of shoe colours (not colour-overlap registration,
          which glues the head and lifts a crouching body); "air": true keeps the model's lift;
        - pose frames get the base head pasted (rises at most 1 px; objects in front of the face are kept);
          "local": "eyes" | "mouth" | true takes only that changed part of the face from the edit;
        - missing outer outline closed, lone pixels dropped; a "squash" frame is derived from idle (one shin row out),
          "squash_from": ["laugh"] adds squash_<frame> keeping that expression; every pose frame gets a blinking
          twin <frame>_blink (the blink frame's eyes moved by the pose's head offset; "blink_poses": false to skip);
        - qa.json per frame: contact (0 = on the ground), face_diff, area, outline share, lonely pixels, offsets.
      "kind": "terrain" (e.g. the island layers) keeps the older colour-registration path; "base_mask"/"match_colors"
      apply there; "mask": "m.png" (BiRefNet, cgen kind "bgmask") is joined with the colour-based foreground.
Background = median border colour; it and the soft grey ground shadow are removed by a flood fill from the border
that cannot cross the dark outline, plus enclosed holes of exactly the background colour."""
import sys, os, json
import numpy as np
from PIL import Image
from scipy import ndimage as nd


def load_rgb(p):
    return np.asarray(Image.open(p).convert("RGB")).astype(np.float32)


def _profiles(a):
    """Boundary energy: cx[x] = colour change between columns x-1 and x (x = 0..W), ry likewise for rows."""
    cx = np.zeros(a.shape[1] + 1); ry = np.zeros(a.shape[0] + 1)
    cx[1:-1] = np.abs(np.diff(a, axis=1)).sum(axis=2).sum(axis=0)
    ry[1:-1] = np.abs(np.diff(a, axis=0)).sum(axis=2).sum(axis=1)
    k = np.array([0.5, 1.0, 0.5])                        # AI "pixels" often have 2-px soft transitions
    return np.convolve(cx, k, "same"), np.convolve(ry, k, "same")


def _autocorr(prof):
    x = prof - prof.mean()
    n = len(x)
    f = np.fft.rfft(x, 2 * n)
    ac = np.fft.irfft(f * np.conj(f))[:n]
    return ac / (ac[0] + 1e-9)


def detect_period(a, lo=5.0, hi=48.0):
    """Mean cell size from the autocorrelation of the boundary profiles (robust to a drifting, uneven grid)."""
    cx, ry = _profiles(a)
    n = min(len(cx), len(ry))
    ac = _autocorr(cx)[:n] + _autocorr(ry)[:n]
    lags = np.arange(n)
    ok = (lags >= lo) & (lags <= hi)
    peaks = [l for l in lags[ok] if ac[l] >= ac[l - 1] and ac[l] >= ac[min(l + 1, n - 1)]]
    if not peaks:
        return 12.0
    L = max(peaks, key=lambda l: ac[l])
    for k in (4, 3, 2):                                   # prefer the fundamental if it is nearly as strong
        q = L / k
        if q >= lo:
            near = [l for l in peaks if abs(l - q) <= 1.5]
            if near and max(ac[l] for l in near) > 0.6 * ac[L]:
                L = max(near, key=lambda l: ac[l]); break
    # parabolic refinement of the peak
    if 1 <= L < n - 1:
        y0, y1, y2 = ac[L - 1], ac[L], ac[L + 1]
        den = y0 - 2 * y1 + y2
        return float(L + (0.5 * (y0 - y2) / den if den != 0 else 0))
    return float(L)


def _comb(prof, p):
    """How well boundaries x = phase + k*p collect the edge energy (1 = no better than random) and the best phase."""
    x = np.arange(len(prof), dtype=float)
    nb = max(2, int(np.ceil(p)))
    b = np.minimum(np.mod(x, p).astype(int), nb - 1)
    h = np.bincount(b, weights=prof, minlength=nb)
    h2 = h + np.roll(h, 1)                                 # a boundary straddling two bins
    k = int(np.argmax(h2))
    w0, w1 = h[(k - 1) % nb], h[k]
    phase = ((k - 0.5) * w0 + (k + 0.5) * w1) / (w0 + w1 + 1e-9)
    return h2[k] * nb / (2 * prof.sum() + 1e-9), phase % p


def grid(a, p=None, span=0.15):
    """Uniform grid (period, x phase, y phase). Without p: autocorrelation estimate, refined by the comb score.
    With p (e.g. the base frame's): only the phases are fitted, so every frame of a character shares the cell size."""
    cx, ry = _profiles(a)
    if p is None:
        p0 = detect_period(a)
        best = max(np.arange(p0 * (1 - span), p0 * (1 + span), 0.02), key=lambda q: _comb(cx, q)[0] + _comb(ry, q)[0])
        p = float(best)
    return p, _comb(cx, p)[1], _comb(ry, p)[1]


def sample(a, p, fx, fy):
    """Median colour of the central half of every cell of the uniform grid."""
    H, W = a.shape[:2]
    xs = np.arange(fx - p, W, p); ys = np.arange(fy - p, H, p)
    xs = xs[(xs + p * 0.25 >= 0) & (xs + p * 0.75 <= W)]; ys = ys[(ys + p * 0.25 >= 0) & (ys + p * 0.75 <= H)]   # central half inside
    out = np.zeros((len(ys), len(xs), 3), np.float32)
    q = p * 0.25
    for j, y in enumerate(ys):
        ya, yb = int(round(max(0, y + q))), int(round(min(H, y + p - q)))
        for i, x in enumerate(xs):
            xa, xb = int(round(max(0, x + q))), int(round(min(W, x + p - q)))
            out[j, i] = np.median(a[ya:max(yb, ya + 1), xa:max(xb, xa + 1)].reshape(-1, 3), axis=0)
    return out


def remove_bg(lo, bg=None, hole_tol=14.0):
    """Alpha mask for a low-res image: flood fill from the border over light, unsaturated cells (background and its
    soft ground shadow); the dark outline stops it. Enclosed holes of the exact background colour are removed too."""
    H, W = lo.shape[:2]
    if bg is None:
        border = np.concatenate([lo[0], lo[-1], lo[:, 0], lo[:, -1]])
        bg = np.median(border, axis=0)
    lum = lo.mean(axis=2)
    sat = lo.max(axis=2) - lo.min(axis=2)
    dist = np.sqrt(((lo - bg) ** 2).sum(axis=2))
    # the ground shadow: grey a bit darker than the background in the lower third; whites brighter than the background
    # (sneakers, shirts) and greys darker than the shadow are never background
    bl = float(bg.mean())
    low = lo[int(H * 0.66):]
    cand = low[((low.max(axis=2) - low.min(axis=2)) < 14) & (low.mean(axis=2) > 150) & (low.mean(axis=2) < bl - 12)]
    sl = float(np.median(cand.mean(axis=1))) if len(cand) >= 3 else bl
    passable = (dist < 24) | ((sat < 14) & (lum >= sl - 10) & (lum <= bl + 5))
    lab, n = nd.label(passable)
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bgm = np.isin(lab, list(edge))
    holes = (dist < hole_tol) & ~bgm
    hl, hn = nd.label(holes)
    for k in range(1, hn + 1):
        if (hl == k).sum() >= 2:
            bgm |= hl == k
    fg = ~bgm
    # peel a soft halo: shadow-grey cells on the outer edge of the silhouette (anti-aliased ground shadow, twice)
    halo = (dist < 32) | ((sat < 16) & (lum >= sl - 16) & (lum <= bl + 5))
    for _ in range(2):
        edge = fg & nd.binary_dilation(~fg)
        fg &= ~(edge & halo)
    # drop specks not connected to the largest blob(s)
    fl, fn = nd.label(fg, structure=np.ones((3, 3)))
    if fn > 1:
        sizes = nd.sum(fg, fl, range(1, fn + 1))
        keep = [k + 1 for k, s in enumerate(sizes) if s >= max(4, 0.02 * sizes.max())]
        fg = np.isin(fl, keep)
    return fg, bg


def lowres(path, period=None, mask=None):
    """Cells of a render; with `mask` (a white-on-black foreground mask of the same render, e.g. BiRefNet) also the
    per-cell foreground, sampled on the same grid (for objects the colour-based background removal would eat)."""
    a = load_rgb(path)
    p, fx, fy = grid(a, period)
    lo = sample(a, p, fx, fy)
    if mask is None:
        return lo, p
    m = np.asarray(Image.open(mask).convert("L").resize((a.shape[1], a.shape[0]))).astype(np.float32)
    # union with the colour-based foreground: the mask saves light parts (snow, paper), colour saves what the mask
    # model calls background (a flat sea plate); the soft ground shadow is in neither
    return lo, p, (sample(np.dstack([m] * 3), p, fx, fy)[..., 0] > 127) | remove_bg(lo)[0]


def quantize_shared(frames, colors):
    """frames: list of (rgb float HxWx3, alpha bool). One median-cut palette for all opaque cells, no dithering."""
    px = np.concatenate([f[a] for f, a in frames]).astype(np.uint8)
    if len(px) == 0:
        return [f.astype(np.uint8) for f, _ in frames]
    strip = Image.fromarray(px.reshape(1, -1, 3), "RGB")
    pal = strip.quantize(colors=colors, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    out = []
    for f, a in frames:
        q = Image.fromarray(f.astype(np.uint8), "RGB").quantize(palette=pal, dither=Image.Dither.NONE).convert("RGB")
        out.append(np.asarray(q))
    return out


def register(base_rgb, base_a, rgb, a, r=6):
    """Integer shift (dy, dx) of a frame that best matches the base: count of cells with the same colour."""
    H, W = base_a.shape
    best = (-1, 0, 0)
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            sa = np.zeros_like(a); sr = np.zeros_like(rgb)
            ys0, ys1 = max(0, -dy), min(a.shape[0], H - dy)
            xs0, xs1 = max(0, -dx), min(a.shape[1], W - dx)
            if ys1 <= ys0 or xs1 <= xs0:
                continue
            sa = a[ys0:ys1, xs0:xs1]; sr = rgb[ys0:ys1, xs0:xs1]
            ba = base_a[ys0 + dy:ys1 + dy, xs0 + dx:xs1 + dx]; br = base_rgb[ys0 + dy:ys1 + dy, xs0 + dx:xs1 + dx]
            m = (sa & ba & (np.abs(sr.astype(int) - br.astype(int)).sum(axis=2) < 24)).sum() - 0.5 * (sa ^ ba).sum()
            if m > best[0]:
                best = (m, dy, dx)
    return best[1], best[2]


def shift(img, dy, dx, fill=0):
    out = np.full_like(img, fill)
    H, W = img.shape[:2]
    ys0, ys1 = max(0, dy), min(H, H + dy)
    xs0, xs1 = max(0, dx), min(W, W + dx)
    out[ys0:ys1, xs0:xs1] = img[ys0 - dy:ys1 - dy, xs0 - dx:xs1 - dx]
    return out


def rgba(rgb, a):
    return Image.fromarray(np.dstack([rgb.astype(np.uint8), (a * 255).astype(np.uint8)]), "RGBA")


def preview(imgs, labels, path, scale=6, bg=(52, 64, 84), ground=None, neck=None):
    """Frames side by side; optional guide lines: ground (green, under the base contact row) and neck (blue)."""
    from PIL import ImageDraw
    w = max(i.width for i in imgs) * scale; h = max(i.height for i in imgs) * scale
    sheet = Image.new("RGB", ((w + 12) * len(imgs) + 12, h + 40), bg)
    d = ImageDraw.Draw(sheet)
    for k, (im, lb) in enumerate(zip(imgs, labels)):
        x = 12 + k * (w + 12)
        if ground is not None:
            d.line([(x, 30 + (ground + 1) * scale), (x + w, 30 + (ground + 1) * scale)], fill=(80, 200, 120), width=1)
        if neck is not None:
            d.line([(x, 30 + neck * scale), (x + w, 30 + neck * scale)], fill=(90, 130, 220), width=1)
        big = im.resize((im.width * scale, im.height * scale), Image.NEAREST)
        sheet.paste(big, (x, 30), big)
        d.text((x, 8), lb, fill=(230, 230, 230))
    sheet.save(path)


def cmd_grid(path):
    a = load_rgb(path)
    p, fx, fy = grid(a)
    print(f"period {p:.2f}px (autocorr {detect_period(a):.2f}), phase {fx:.1f},{fy:.1f} -> {a.shape[1] / p:.1f} x {a.shape[0] / p:.1f} cells")


def objects(a, bg=None, minpx=400, pad=10):
    """Bounding boxes of separate objects on a flat background (full-res)."""
    if bg is None:
        border = np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]])
        bg = np.median(border, axis=0)
    dist = np.sqrt(((a - bg) ** 2).sum(axis=2))
    sat = a.max(axis=2) - a.min(axis=2)
    fg = (dist > 40) & ~((sat < 28) & (a.mean(axis=2) > 140))   # ignore the soft grey ground shadow
    fg = nd.binary_closing(fg, iterations=6)
    lab, n = nd.label(fg)
    boxes = []
    for k, sl in enumerate(nd.find_objects(lab)):
        if sl is None:
            continue
        ys, xs = sl
        if (lab[sl] == k + 1).sum() < minpx:
            continue
        boxes.append((max(0, xs.start - pad), max(0, ys.start - pad), min(a.shape[1], xs.stop + pad), min(a.shape[0], ys.stop + pad)))
    boxes.sort(key=lambda b: (round(b[1] / 150), b[0]))
    return boxes, bg


def cmd_split(path, prefix, canvas=768, pad=24):
    a = load_rgb(path)
    boxes, bg = objects(a, pad=pad)
    p = detect_period(a)
    im = Image.open(path).convert("RGB")
    for k, (x0, y0, x1, y1) in enumerate(boxes):
        # keep the source grid: offsets are rounded to whole cells of the source grid
        c = im.crop((x0, y0, x1, y1))
        can = Image.new("RGB", (canvas, canvas), tuple(int(v) for v in bg))
        ox = int(round(((canvas - c.width) / 2) / p) * p); oy = int(round(((canvas - c.height) / 2) / p) * p)
        can.paste(c, (ox, oy))
        can.save(f"{prefix}_{k}.png")
        print(f"{prefix}_{k}.png  box {x0},{y0},{x1},{y1}")


def cmd_cut(path, outdir, names=None, colors=16, minc=6):
    os.makedirs(outdir, exist_ok=True)
    a = load_rgb(path)
    p_sheet = detect_period(a)
    boxes, bg = objects(a, pad=int(p_sheet * 1.5))
    imgs, labels, meta = [], [], {}
    for k, (x0, y0, x1, y1) in enumerate(boxes):
        sub = a[y0:y1, x0:x1]
        p, fx, fy = grid(sub, None, 0.2) if min(sub.shape[:2]) > 6 * p_sheet else grid(sub, p_sheet)
        lo = sample(sub, p, fx, fy)
        fg, _ = remove_bg(lo, bg)
        if fg.sum() < minc:
            continue
        ys, xs = np.where(fg)
        lo, fg = lo[ys.min():ys.max() + 1, xs.min():xs.max() + 1], fg[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
        q = quantize_shared([(lo, fg)], colors)[0]
        nm = names[len(imgs)] if names and len(imgs) < len(names) else f"obj{k}"
        im = rgba(q, fg)
        im.save(os.path.join(outdir, nm + ".png"))
        meta[nm] = {"w": im.width, "h": im.height, "period": round(float(p), 2), "box": [x0, y0, x1, y1]}
        imgs.append(im); labels.append(nm)
    json.dump(meta, open(os.path.join(outdir, "cut.json"), "w"), indent=1)
    preview(imgs, labels, os.path.join(outdir, "_preview.png"), 4)
    print(f"{len(imgs)} sprites -> {outdir}")


def fsrc_mask(fsrc):
    return isinstance(fsrc, dict) and bool(fsrc.get("mask"))


def cmd_char_terrain(spec, spec_path, outdir):
    root = os.path.dirname(os.path.abspath(spec_path))
    P = lambda s: s if os.path.isabs(s) else os.path.join(root, s)
    name = spec["name"]
    if spec.get("base_mask"):
        base_lo, p, base_fg = lowres(P(spec["base"]), spec.get("period"), P(spec["base_mask"]))
        bg = np.median(np.concatenate([base_lo[0], base_lo[-1], base_lo[:, 0], base_lo[:, -1]]), axis=0)
    else:
        base_lo, p = lowres(P(spec["base"]), spec.get("period"))
        base_fg, bg = remove_bg(base_lo)
    frames = {"idle": (base_lo, base_fg, None)}
    for fn, fsrc in spec.get("frames", {}).items():
        src = fsrc if isinstance(fsrc, str) else fsrc["src"]
        if isinstance(fsrc, dict) and fsrc.get("mask"):
            lo, _, fg = lowres(P(src), p, P(fsrc["mask"]))
        else:
            lo, _ = lowres(P(src), p)
            fg, fbg = remove_bg(lo)                # each render has its own background grey (edits drift a little)
        # same grid size as the base: pad/crop to the base cell count
        H, W = base_lo.shape[:2]
        L = np.zeros((H, W, 3), np.float32); L[:] = bg if fsrc_mask(fsrc) else fbg; A = np.zeros((H, W), bool)
        h, w = min(H, lo.shape[0]), min(W, lo.shape[1])
        L[:h, :w] = lo[:h, :w]; A[:h, :w] = fg[:h, :w]
        if spec.get("match_colors"):              # edits drift in tone (a lighter sea): fit frame -> base per channel
            both = A & base_fg                     # on cells that already agree roughly, so removed/added things don't count
            near = both & (np.abs(L - base_lo).max(axis=2) < 50)
            if near.sum() > 50:
                for c in range(3):
                    x, y = L[..., c][near], base_lo[..., c][near]
                    k, b0 = np.polyfit(x, y, 1)
                    L[..., c] = np.clip(L[..., c] * k + b0, 0, 255)
        loc = None if isinstance(fsrc, str) else fsrc.get("local")
        frames[fn] = (L, A, None if isinstance(fsrc, str) else (fsrc.get("keep") or (("local", loc) if loc else None)))
    names = list(frames)
    q = quantize_shared([(frames[n][0], frames[n][1]) for n in names], spec.get("colors", 24))
    qbase, abase = q[0], frames["idle"][1]
    out = {}
    for k, n in enumerate(names):
        rgb, a = q[k], frames[n][1]
        if n != "idle":
            dy, dx = register(qbase, abase, rgb, a)
            rgb, a = shift(rgb, dy, dx), shift(a, dy, dx, False)
            keep = frames[n][2]
            if isinstance(keep, tuple):             # face-only edit: keep the changed cells in the top half of the body
                ys, xs = np.where(abase)
                top, mid = ys.min(), ys.min() + (ys.max() - ys.min()) // 2
                diff = (a | abase) & ((a ^ abase) | (np.abs(rgb.astype(int) - qbase.astype(int)).sum(axis=2) > 24))
                diff[mid:] = False
                if keep[1] in ("eyes", "mouth"):    # strongly changed rows form runs: eyes = the biggest run, mouth = the lowest real one
                    strong = diff & (np.abs(rgb.astype(int) - qbase.astype(int)).sum(axis=2) > 60)
                    cnt = strong.sum(axis=1)
                    rows = np.where(cnt >= 2)[0]
                    if len(rows):
                        runs = np.split(rows, np.where(np.diff(rows) > 1)[0] + 1)
                        tot = [int(cnt[r].sum()) for r in runs]
                        if keep[1] == "eyes":
                            pick = runs[int(np.argmax(tot))]
                        else:
                            real = [r for r, t in zip(runs, tot) if t >= 4]
                            pick = (real or runs)[-1]
                        band = np.zeros(len(diff), bool); band[pick.min():pick.max() + 1] = True
                        diff &= band[:, None]
                dy_, dx_ = np.where(diff)
                keep = None if len(dy_) == 0 else [max(0, dx_.min() - 1), max(0, dy_.min() - 1), dx_.max() + 2, dy_.max() + 2]
                if keep is None:
                    rgb, a = qbase, abase
            if keep:
                m = np.zeros_like(a); x0, y0, x1, y1 = keep; m[y0:y1, x0:x1] = True
                rgb = np.where(m[..., None], rgb, qbase); a = np.where(m, a, abase)
        out[n] = (rgb, a)
    # shared canvas = union of all frames + 1 cell margin
    U = np.zeros_like(abase)
    for rgb, a in out.values():
        U |= a
    ys, xs = np.where(U)
    y0, y1, x0, x1 = max(0, ys.min() - 1), ys.max() + 2, max(0, xs.min() - 1), xs.max() + 2
    d = os.path.join(outdir, name)
    os.makedirs(d, exist_ok=True)
    imgs = []
    feet = int(np.where(abase.any(axis=1))[0].max()) - y0
    for n, (rgb, a) in out.items():
        im = rgba(rgb[y0:y1, x0:x1], a[y0:y1, x0:x1])
        if spec.get("mirror"):
            im = im.transpose(Image.FLIP_LEFT_RIGHT)
        im.save(os.path.join(d, n + ".png"))
        imgs.append(im)
    cx = int(np.median(np.where(abase)[1]) - x0)     # body centre column of the base pose (placement anchor)
    if spec.get("mirror"):
        cx = int(x1 - x0) - 1 - cx
    meta = {"name": name, "w": int(x1 - x0), "h": int(y1 - y0), "feet": int(feet), "cx": cx, "period": round(float(p), 2), "frames": names}
    json.dump(meta, open(os.path.join(d, "meta.json"), "w"), indent=1)
    preview(imgs, names, os.path.join(outdir, f"_{name}_preview.png"))
    print(f"{name}: {meta['w']}x{meta['h']} cells, period {p:.2f}px, frames {names}")

# ---------------------------------------------------------------- people: frames as data around one base pose
# Rules (docs/character-animation.md): every frame is cut on the base frame's lattice shifted by the head drift, one
# palette built from the base, frames stand on the base ground line (shoe row), the head is data pasted from the base.

def base_lattice(a, p, fx, fy):
    """Cell origins exactly as sample() picks them: cell (j, i) means the same place in every frame."""
    H, W = a.shape[:2]
    xs = np.arange(fx - p, W, p); ys = np.arange(fy - p, H, p)
    return (xs[(xs + p * 0.25 >= 0) & (xs + p * 0.75 <= W)], ys[(ys + p * 0.25 >= 0) & (ys + p * 0.75 <= H)])


def sample_at(a, xs, ys, p):
    """sample() on a given (possibly shifted) lattice; cells are clipped to the image."""
    H, W = a.shape[:2]; q = p * 0.25
    out = np.zeros((len(ys), len(xs), 3), np.float32)
    for j, y in enumerate(ys):
        ya = min(max(int(round(y + q)), 0), H - 1); yb = min(max(int(round(y + p - q)), ya + 1), H)
        for i, x in enumerate(xs):
            xa = min(max(int(round(x + q)), 0), W - 1); xb = min(max(int(round(x + p - q)), xa + 1), W)
            out[j, i] = np.median(a[ya:yb, xa:xb].reshape(-1, 3), axis=0)
    return out


def drift(base, img, box, limit):
    """Integer move (dy, dx) in render px of img against base inside box (x0, y0, x1, y1): windowed phase correlation."""
    x0, y0, x1, y1 = box
    win = np.outer(np.hanning(y1 - y0), np.hanning(x1 - x0))
    A = (base[y0:y1, x0:x1].mean(axis=2) - base[y0:y1, x0:x1].mean()) * win
    B = (img[y0:y1, x0:x1].mean(axis=2) - img[y0:y1, x0:x1].mean()) * win
    R = np.fft.fft2(B) * np.conj(np.fft.fft2(A))
    r = np.real(np.fft.ifft2(R / (np.abs(R) + 1e-9)))
    dy, dx = np.unravel_index(np.argmax(r), r.shape); h, w = r.shape
    dy, dx = int(dy - h if dy > h // 2 else dy), int(dx - w if dx > w // 2 else dx)
    return (dy, dx) if abs(dy) <= limit and abs(dx) <= limit else (0, 0)


def ckey(rgb):
    rgb = rgb.astype(np.int64)
    return (rgb[..., 0] << 16) | (rgb[..., 1] << 8) | rgb[..., 2]


def lum(rgb):
    return rgb.astype(np.float32).mean(axis=-1)


def neck_row(a):
    """Narrowest silhouette row between 20 % and 55 % of the height: the line between head and shoulders."""
    ys = np.where(a.any(axis=1))[0]; top, h = ys.min(), ys.max() - ys.min()
    w = a.sum(axis=1); lo, hi = top + int(0.2 * h), top + int(0.55 * h)
    return int(lo + np.argmin(w[lo:hi]))


def palette_from(base_rgb, base_a, others, k=28, merge=12, extra=8, far=36):
    """Palette = base colours (median cut) with near-twins merged (L1 <= merge), plus a few slots for colours that only
    new objects bring (brush, shovel, crate, paper)."""
    def mc(px, n):
        im = Image.fromarray(px.astype(np.uint8).reshape(1, -1, 3), "RGB").quantize(colors=n, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
        pal = np.array(im.getpalette()[:768]).reshape(-1, 3)
        return [pal[i].astype(int) for _, i in sorted(im.getcolors(256), reverse=True)]
    cols = []
    def add(c):
        if all(np.abs(c - d).sum() > merge for d in cols):
            cols.append(c)
    for c in mc(base_rgb[base_a], k):
        add(c)
    base_n = len(cols)
    pool = []
    for rgb, a in others:
        v = rgb[a].astype(int)
        if len(v):
            dmin = np.abs(v[:, None, :] - np.array(cols)[None]).sum(axis=2).min(axis=1)
            pool.append(v[dmin > far])
    pool = np.concatenate(pool) if pool else np.zeros((0, 3), int)
    if len(pool) >= 6:
        for c in mc(pool, extra):
            add(c)
    return np.array(cols, dtype=np.uint8), base_n


def map_to(rgb, pal):
    d = np.abs(rgb[..., None, :].astype(np.int32) - pal[None, None].astype(np.int32)).sum(axis=-1)
    return pal[d.argmin(axis=-1)]


def shoe_keys(rgb, a, rows=3):
    """Colours of the shoes: the base pose's bottom rows without the dark outline."""
    y1 = int(np.where(a.any(axis=1))[0].max()); band = slice(y1 - rows + 1, y1 + 1)
    sel = a[band] & (lum(rgb[band]) > 40)
    return np.unique(ckey(rgb[band])[sel])


def contact_row(rgb, a, keys):
    rows = np.where((a & np.isin(ckey(rgb), keys)).sum(axis=1) >= 2)[0]
    return int(rows.max()) if len(rows) else int(np.where(a.any(axis=1))[0].max())


def head_lock(rgb, a, qbase, abase, neck, prior_dy, r=2):
    """Paste the base head (everything above the neck row) at the best integer offset near prior_dy. A foreign object in
    front of the face (brush, paper, a sleeve in a non-head colour) is kept; leftover hair/outline of the frame's own
    head just outside the pasted silhouette is cleared. Returns (rgb, a, (dy, dx), mismatch before the paste)."""
    head = abase.copy(); head[neck:] = False
    hy, hx = np.where(head)
    H, W = abase.shape
    best = None
    for dy in range(max(prior_dy - r, -1), max(prior_dy + r, -1) + 1):   # rises at most 1 px: the figure keeps its height
        for dx in range(-r, r + 1):
            y2, x2 = hy + dy, hx + dx
            ok = (y2 >= 0) & (y2 < H) & (x2 >= 0) & (x2 < W)
            good = (a[y2[ok], x2[ok]] & (np.abs(rgb[y2[ok], x2[ok]].astype(int) - qbase[hy[ok], hx[ok]].astype(int)).sum(axis=1) <= 24)).sum()
            if best is None or good > best[0]:
                best = (good, dy, dx)
    good, dy, dx = best
    mis = 1 - good / max(1, len(hy))
    rgb, a = rgb.copy(), a.copy()
    head_keys = np.unique(ckey(qbase[head]))
    body_keys = np.unique(ckey(qbase[abase & ~head]))
    hair_keys = np.setdiff1d(head_keys, body_keys)              # colours only the head has (hair, eyes)
    dark = lum(rgb) < 40
    # clear the frame's own head leftovers around the pasted silhouette (rows above the pasted neck only)
    pasted = np.zeros_like(abase); y2, x2 = hy + dy, hx + dx
    ok = (y2 >= 0) & (y2 < H) & (x2 >= 0) & (x2 < W); pasted[y2[ok], x2[ok]] = True
    ring = nd.binary_dilation(pasted, iterations=2) & ~pasted
    ring[max(0, neck + dy):] = False
    stray = ring & a & (np.isin(ckey(rgb), hair_keys) | dark)
    a[stray] = False
    # paste, keeping foreign objects in front of the face
    ty, tx, sy, sx = y2[ok], x2[ok], hy[ok], hx[ok]
    front = a[ty, tx] & ~np.isin(ckey(rgb[ty, tx]), head_keys) & (lum(rgb[ty, tx]) >= 40)
    rgb[ty[~front], tx[~front]] = qbase[sy[~front], sx[~front]]
    a[ty[~front], tx[~front]] = True
    return rgb, a, (dy, dx), float(mis)


def outline_fix(rgb, a, ink):
    """Close the 1-px outer outline: where an edge cell is not dark, its empty 4-neighbours become outline (ink)."""
    k = np.array([[0, 1, 0], [1, 1, 1], [0, 1, 0]], bool)
    edge = a & nd.binary_dilation(~a, structure=k)
    open_ = edge & (lum(rgb) >= 60)
    add = nd.binary_dilation(open_, structure=k) & ~a
    rgb, a = rgb.copy(), a.copy()
    rgb[add] = ink; a[add] = True
    return rgb, a


def synth_blink(qbase, abase, neck):
    """Closed eyes from the base face: every eye (a small dark blob inside the face, taller than 1 cell) keeps only its
    bottom row; the cells above take the skin colour found just under the eye. For renders whose thin closed-eye line
    was thinner than a cell and vanished in the downscale. Returns (rgb, number of eyes found)."""
    head = abase.copy(); head[neck:] = False
    core = head & nd.binary_erosion(abase, iterations=1)
    lab, n = nd.label(core & (lum(qbase) < 50))
    rgb, eyes = qbase.copy(), 0
    for k in range(1, n + 1):
        ys, xs = np.where(lab == k)
        if not (2 <= len(ys) <= 12 and ys.max() - ys.min() >= 1 and xs.max() - xs.min() <= 3):
            continue
        y1 = ys.max(); below = qbase[min(y1 + 1, qbase.shape[0] - 1), int(np.median(xs))]
        if lum(below) < 50:
            continue
        top = ys < y1
        rgb[ys[top], xs[top]] = below
        eyes += 1
    return rgb, eyes


def eyes_onto(rgb, a, brgb, qbase, abase, neck, off):
    """Blink overlay (Stardew-style): the cells where the blink face differs from the base face, moved by the head offset
    of a pose frame; a foreign object in front of the face stays in front."""
    head = abase.copy(); head[neck:] = False
    diff = head & (np.abs(brgb.astype(int) - qbase.astype(int)).sum(axis=2) > 0)
    hy, hx = np.where(diff); ty, tx = hy + off[0], hx + off[1]
    H, W = a.shape
    ok = (ty >= 0) & (ty < H) & (tx >= 0) & (tx < W)
    hy, hx, ty, tx = hy[ok], hx[ok], ty[ok], tx[ok]
    head_keys = np.unique(ckey(qbase[head]))
    front = a[ty, tx] & ~np.isin(ckey(rgb[ty, tx]), head_keys) & (lum(rgb[ty, tx]) >= 40)
    rgb = rgb.copy(); rgb[ty[~front], tx[~front]] = brgb[hy[~front], hx[~front]]
    return rgb


def despeck(rgb, a):
    """Drop opaque cells with no opaque 4-neighbour."""
    k = np.array([[0, 1, 0], [1, 0, 1], [0, 1, 0]])
    n = nd.convolve(a.astype(int), k, mode="constant")
    return a & (n > 0)


def squash_of(rgb, a, contact):
    """Landing/anticipation squash without scaling: drop one row at shin height, the body above comes down a pixel."""
    ys = np.where(a.any(axis=1))[0]; h = contact - ys.min()
    knee = contact - max(3, int(round(0.13 * h)))
    r2, a2 = rgb.copy(), a.copy()
    r2[1:knee + 1] = rgb[0:knee]; a2[1:knee + 1] = a[0:knee]; a2[0] = False
    return r2, a2


def qa_frame(rgb, a, qbase, abase, keys, base_contact, neck, air=False, off=(0, 0)):
    head = abase.copy(); head[neck:] = False
    core = head & nd.binary_erosion(abase, iterations=2)
    sr, sa = shift(rgb, -off[0], -off[1]), shift(a, -off[0], -off[1], False)      # look at the face where it was pasted
    face_diff = float(((np.abs(sr.astype(int) - qbase.astype(int)).sum(axis=2) > 24) | ~sa)[core].mean()) if core.any() else 0.0
    edge = a & nd.binary_dilation(~a)
    k = np.array([[0, 1, 0], [1, 0, 1], [0, 1, 0]])
    lone = a & (nd.convolve(a.astype(int), k, mode="constant") <= 1)
    return {"contact": int(contact_row(rgb, a, keys) - base_contact), "air": bool(air),
            "face_diff": round(face_diff, 3), "area": round(float(a.sum()) / max(1, abase.sum()), 3),
            "outline": round(float((lum(rgb)[edge] < 60).mean()) if edge.any() else 1.0, 3),
            "lonely": int(lone.sum())}


def cmd_char_person(spec, spec_path, outdir):
    root = os.path.dirname(os.path.abspath(spec_path))
    P = lambda s: s if os.path.isabs(s) else os.path.join(root, s)
    name = spec["name"]
    base_img = load_rgb(P(spec["base"]))
    p, fx, fy = grid(base_img, spec.get("period"))
    xs, ys = base_lattice(base_img, p, fx, fy)
    base_lo = sample_at(base_img, xs, ys, p)
    base_fg, bg = remove_bg(base_lo)
    neck = neck_row(base_fg)
    hy, hx = np.where(base_fg[:neck])
    box = (max(0, int(xs[hx.min()] - p)), max(0, int(ys[hy.min()] - p)),
           min(base_img.shape[1], int(xs[hx.max()] + 2 * p)), min(base_img.shape[0], int(ys[neck] + p)))
    raw = {"idle": (base_lo, base_fg, {})}
    for fn, fsrc in spec.get("frames", {}).items():
        f = {"src": fsrc} if isinstance(fsrc, str) else dict(fsrc)
        img = load_rgb(P(f["src"]))
        dy, dx = drift(base_img, img, box, limit=4 * p)
        lo = sample_at(img, xs + dx, ys + dy, p)
        fg = remove_bg(lo)[0]
        if f.get("mask"):
            m = np.asarray(Image.open(P(f["mask"])).convert("L").resize((img.shape[1], img.shape[0]))).astype(np.float32)
            fg = fg | (sample_at(np.dstack([m] * 3), xs + dx, ys + dy, p)[..., 0] > 127)
        f["drift"] = (dy, dx)
        raw[fn] = (lo, fg, f)
    pal, base_n = palette_from(base_lo, base_fg, [(v[0], v[1]) for k, v in raw.items() if k != "idle"], k=spec.get("colors", 28))
    ink = pal[int(np.argmin(lum(pal)))]
    qbase, abase = map_to(base_lo, pal), base_fg
    keys = shoe_keys(qbase, abase)
    base_contact = contact_row(qbase, abase, keys)
    neck = neck_row(abase)
    qbase, abase = outline_fix(qbase, abase, ink)
    out, qa = {"idle": (qbase, abase)}, {}
    for fn, (lo, fg, f) in raw.items():
        if fn == "idle":
            continue
        rgb, a = map_to(lo, pal), fg
        dyg = 0 if f.get("air") else base_contact - contact_row(rgb, a, keys)
        rgb, a = shift(rgb, dyg, 0), shift(a, dyg, 0, False)
        loc = f.get("local")
        if loc:                                      # face-only edit: only the changed eye/mouth band comes from the edit
            ys_, _ = np.where(abase); mid = ys_.min() + (ys_.max() - ys_.min()) // 2
            diff = (a | abase) & ((a ^ abase) | (np.abs(rgb.astype(int) - qbase.astype(int)).sum(axis=2) > 24))
            diff[mid:] = False
            if loc in ("eyes", "mouth"):
                strong = diff & (np.abs(rgb.astype(int) - qbase.astype(int)).sum(axis=2) > 60)
                cnt = strong.sum(axis=1); rows = np.where(cnt >= 2)[0]
                if len(rows):
                    runs = np.split(rows, np.where(np.diff(rows) > 1)[0] + 1)
                    tot = [int(cnt[r].sum()) for r in runs]
                    pick = runs[int(np.argmax(tot))] if loc == "eyes" else ([r for r, t in zip(runs, tot) if t >= 4] or runs)[-1]
                    band = np.zeros(len(diff), bool); band[pick.min():pick.max() + 1] = True
                    diff &= band[:, None]
            dy_, dx_ = np.where(diff)
            m = np.zeros_like(abase)
            if len(dy_):
                m[max(0, dy_.min() - 1):dy_.max() + 2, max(0, dx_.min() - 1):dx_.max() + 2] = True
                m &= nd.binary_erosion(abase, iterations=2)          # inside the face only: ears, hair and outline stay
            rgb = np.where(m[..., None], rgb, qbase); a = np.where(m, a, abase)
            hd, mis = (0, 0), 0.0
        else:                                        # pose: the head is data from the base frame
            rgb, a, hd, mis = head_lock(rgb, a, qbase, abase, neck, dyg)
            rgb, a = outline_fix(rgb, a, ink)
        a = despeck(rgb, a)
        out[fn] = (rgb, a)
        qa[fn] = dict(qa_frame(rgb, a, qbase, abase, keys, base_contact, neck, f.get("air"), hd), drift=list(f["drift"]),
                      ground_shift=int(dyg), head_offset=list(hd), head_mismatch=round(mis, 3))
    out["squash"] = squash_of(qbase, abase, base_contact)
    qa["squash"] = dict(qa_frame(*out["squash"], qbase, abase, keys, base_contact, neck, off=(1, 0)), note="derived from idle")
    if "blink" in out and int((np.abs(out["blink"][0].astype(int) - qbase.astype(int)).sum(axis=2) > 0).sum()) < 12:
        sb, ne = synth_blink(qbase, abase, neck)            # the edit's closed-eye line was lost in the downscale
        if ne >= 2:
            out["blink"] = (sb, abase.copy())
            qa["blink"]["note"] = f"synthesised from the base eyes ({ne})"
    if "blink" in out and spec.get("blink_poses", True):   # every pose frame gets a blinking twin <frame>_blink
        for fn in [k for k in list(out) if k not in ("idle", "blink", "talk", "laugh", "squash") and not raw[k][2].get("local")]:
            off = tuple(qa[fn]["head_offset"])
            out[fn + "_blink"] = (eyes_onto(out[fn][0], out[fn][1], out["blink"][0], qbase, abase, neck, off), out[fn][1])
    for fn in spec.get("squash_from", []):           # squash keeping an expression (a laughing hop must not blink open-eyed)
        if fn in out:
            out["squash_" + fn] = squash_of(*out[fn], base_contact)
            qa["squash_" + fn] = {"contact": int(contact_row(*out["squash_" + fn], keys) - base_contact), "face_diff": 0.0, "note": "derived from " + fn}
    names = list(out)
    U = np.zeros_like(abase)
    for rgb, a in out.values():
        U |= a
    ys_, xs_ = np.where(U)
    y0, y1, x0, x1 = max(0, ys_.min() - 1), ys_.max() + 2, max(0, xs_.min() - 1), xs_.max() + 2
    d = os.path.join(outdir, name)
    os.makedirs(d, exist_ok=True)
    imgs = []
    for n in names:
        rgb, a = out[n]
        im = rgba(rgb[y0:y1, x0:x1], a[y0:y1, x0:x1])
        im.save(os.path.join(d, n + ".png"))
        imgs.append(im)
    cx = int(np.median(np.where(abase)[1]) - x0)
    meta = {"name": name, "w": int(x1 - x0), "h": int(y1 - y0), "feet": int(base_contact - y0), "cx": cx,
            "period": round(float(p), 2), "colors": int(len(pal)), "frames": names}
    json.dump(meta, open(os.path.join(d, "meta.json"), "w"), indent=1)
    json.dump(qa, open(os.path.join(d, "qa.json"), "w"), indent=1)
    preview(imgs, names, os.path.join(outdir, f"_{name}_preview.png"), ground=base_contact - y0, neck=neck - y0)
    bad = {k: v for k, v in qa.items() if (not v.get("air") and v["contact"] != 0) or (v["face_diff"] > 0.02 and k not in ("blink", "talk", "laugh"))}
    print(f"{name}: {meta['w']}x{meta['h']} cells, {len(pal)} colours, frames {names}" + (f"  QA FLAGS {sorted(bad)}" if bad else "  QA ok"))


def cmd_char(spec_path, outdir):
    spec = json.load(open(spec_path))
    if spec.get("kind") == "terrain":
        return cmd_char_terrain(spec, spec_path, outdir)
    return cmd_char_person(spec, spec_path, outdir)


if __name__ == "__main__":
    cmd, args = sys.argv[1], sys.argv[2:]
    opt = lambda k, d: type(d)(args[args.index(k) + 1]) if k in args else d
    if cmd == "grid":
        cmd_grid(args[0])
    elif cmd == "split":
        cmd_split(args[0], args[1], opt("--canvas", 768), opt("--pad", 24))
    elif cmd == "cut":
        cmd_cut(args[0], args[1], opt("--names", "").split(",") if "--names" in args else None, opt("--colors", 16), opt("--min", 6))
    elif cmd == "char":
        cmd_char(args[0], args[1])
    else:
        print(__doc__)
