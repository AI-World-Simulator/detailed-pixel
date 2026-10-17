"""Assemble a block of the schema city from per-type turnaround sheets: every building = the type sprite at its view angle,
stretched to its length by repeating the middle bay (exact for an orthographic camera), recoloured to its wall/roof colours.
Writes the micro-map data: sprites, ground image, draw order, props.
   python block_build.py BLOCK_RAW.json OUT_DIR TYPE=SHEET.png [TYPE=SHEET.png ...]
   (a type without a sheet falls back to its proxy colour sheet, so the pipeline can be tested before generation)"""
import os, sys, json, math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage

I = os.path.expanduser("~/ComfyUI/input")
PPM = 14.0                                  # scene pixels per metre (ground x); game max zoom is ~9 CSS px/m, ~13-18 on retina
PITCH = 55.0; PS, PC = math.sin(math.radians(PITCH)), math.cos(math.radians(PITCH))
FRAME = 120                                 # half-size (m) of the shown area around the block centre
TOP = 240                                   # scene pixels above the ground image for the tallest roofs at the far edge
SUN = np.array([-0.5, 0.4, 0.75]); SUN /= np.linalg.norm(SUN)      # same light as the proxies (towards the sun)
SH = np.array([-SUN[0] / SUN[2], -SUN[1] / SUN[2]])                # ground shadow offset per metre of height

def hull(pts):
    pts = sorted(set(map(tuple, np.round(pts, 2))))
    if len(pts) < 3: return pts
    cross = lambda o, a, b: (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lo, hi = [], []
    for q in pts:
        while len(lo) > 1 and cross(lo[-2], lo[-1], q) <= 0: lo.pop()
        lo.append(q)
    for q in reversed(pts):
        while len(hi) > 1 and cross(hi[-2], hi[-1], q) <= 0: hi.pop()
        hi.append(q)
    return lo[:-1] + hi[:-1]

def hexrgb(v): return np.array([(v >> 16) & 255, (v >> 8) & 255, v & 255], np.float32)

ALIGN = True       # per-cell alignment for models that re-frame cells (Codex); off for img2img sheets that keep the proxy layout

class Type:
    def __init__(self, name, sheet_path):
        self.name = name; tag = f"blk_{name}"
        self.m = json.load(open(f"{I}/{tag}_meta.json"))
        self.img = np.asarray(Image.open(sheet_path).convert("RGB").resize((self.m["cols"] * self.m["cell"], 2 * self.m["cell"]), Image.LANCZOS)).astype(np.float32)
        self.mask = np.asarray(Image.open(f"{I}/{tag}_mask.png")) > 0
        self.faces = np.asarray(Image.open(f"{I}/{tag}_faces.png"))
        self.u = np.asarray(Image.open(f"{I}/{tag}_umap.png")).astype(np.float32) / 100 - 300
        self.align = self.align_cells() if ALIGN else []
        # every pixel gets the u / face of the nearest proxy pixel, so details the model drew past the proxy edge stay attached
        _, (iy, ix) = ndimage.distance_transform_edt(~self.mask, return_indices=True)
        self.u_n, self.f_n = self.u[iy, ix], self.faces[iy, ix]
        bg = np.median(self.img[~ndimage.binary_dilation(self.mask, iterations=40)], axis=0)
        fg = np.linalg.norm(self.img - bg, axis=2) > 22
        # cast shadows on the backdrop are grey and darker than it: never part of the sprite
        chroma = self.img.max(axis=2) - self.img.min(axis=2)
        lum0 = self.img @ np.array([0.299, 0.587, 0.114]); bgl = float(bg @ np.array([0.299, 0.587, 0.114]))
        fg &= ~((chroma < 16) & (lum0 < bgl - 3) & (lum0 > bgl - 55) & ~self.mask)
        # extra pixels allowed just around the proxy, and further only straight above it (chimneys, dormers)
        up = np.zeros_like(self.mask)
        for k in range(1, 36, 3): up[:-k] |= self.mask[k:]
        near = ndimage.binary_dilation(self.mask, iterations=6) | up
        lab, _ = ndimage.label(fg & near)
        keep = np.unique(lab[self.mask & (lab > 0)])
        alpha = self.mask | np.isin(lab, keep[keep > 0])
        alpha = ndimage.binary_opening(alpha, iterations=1) | self.mask
        self.alpha = ndimage.gaussian_filter(alpha.astype(np.float32), 0.6)
        # measured base colours of the generated walls / roof (mid-luminance pixels only: no windows, no white trim)
        lum = self.img @ np.array([0.299, 0.587, 0.114])
        def base(sel):
            px = self.img[sel & (lum > 60) & (lum < 235)]
            return np.median(px, axis=0) if len(px) > 50 else np.array([200, 190, 170], np.float32)
        # per face (front wall, side wall, each roof slope) and per cell: each keeps its own shading after the tint
        n = self.m["cell"]; self.base = {}
        for c in self.m["cells"]:
            sl = (slice(c["row"] * n, c["row"] * n + n), slice(c["col"] * n, c["col"] * n + n))
            fc, mk = self.faces[sl], self.mask[sl]; im, lm = self.img[sl], lum[sl]
            for fid in np.unique(fc[mk]):
                sel = mk & (fc == fid) & (lm > 60) & (lm < 235)
                if sel.sum() > 50: self.base[(c["angle"], int(fid))] = np.median(im[sel], axis=0)

    def align_cells(self):
        """Models draw each view a few % bigger or shifted (Codex: 0-4 % of a cell, scale up to 1.06). Find per cell the scale about
        the cell centre and the shift that best put the drawn silhouette on the proxy mask, and resample the cell onto the proxy."""
        n = self.m["cell"]; q = 4; out = []
        bg = np.median(self.img[~ndimage.binary_dilation(self.mask, iterations=40)], axis=0)
        for c in self.m["cells"]:
            sl = (slice(c["row"] * n, c["row"] * n + n), slice(c["col"] * n, c["col"] * n + n))
            im = self.img[sl]
            chroma = im.max(axis=2) - im.min(axis=2); lum = im @ np.array([0.299, 0.587, 0.114]); bgl = float(bg @ np.array([0.299, 0.587, 0.114]))
            # grey roofs look like cast shadows by colour, so shadows are only dropped away from the proxy footprint
            far = ~ndimage.binary_dilation(self.mask[sl], iterations=8)
            fg = (np.linalg.norm(im - bg, axis=2) > 24) & ~((chroma < 16) & (lum < bgl - 3) & (lum > bgl - 55) & far)
            fg = ndimage.binary_fill_holes(ndimage.binary_closing(fg, iterations=2))
            a = fg[::q, ::q].astype(np.float32); m = self.mask[sl][::q, ::q].astype(np.float32); ctr = (n / q - 1) / 2
            best = (-1, 1.0, 0, 0)
            for s in np.arange(0.96, 1.061, 0.02):                # Codex: scale 1.00-1.06, centre shift 0-4 % of a cell
                for dy in range(-4, 5):
                    for dx in range(-4, 5):
                        # proxy mask placed where the model drew it: m'(p) = m((p - ctr - d) / s + ctr)
                        mm = ndimage.affine_transform(m, np.eye(2) / s, offset=ctr - (ctr + np.array([dy, dx])) / s, order=0)
                        inter = (mm * a).sum(); iou = inter / max(1.0, mm.sum() + a.sum() - inter)
                        if iou > best[0]: best = (iou, s, dy * q, dx * q)
            iou, s, dy, dx = best; C = (n - 1) / 2
            if abs(s - 1) > 1e-3 or dy or dx:                     # resample: aligned(p) = drawn(C + s (p - C) + d)
                for ch in range(3):
                    self.img[sl][..., ch] = ndimage.affine_transform(im[..., ch], np.eye(2) * s, offset=C - s * C + np.array([dy, dx]), order=1, mode="nearest")
            out.append(dict(angle=c["angle"], iou=round(float(iou), 3), s=round(float(s), 2), dy=dy, dx=dx))
        return out

    def cell(self, angle):
        c = next(c for c in self.m["cells"] if c["angle"] == angle)
        n = self.m["cell"]; x0, y0 = c["col"] * n, c["row"] * n
        sl = (slice(y0, y0 + n), slice(x0, x0 + n))
        return c, sl

def recolor(rgb, sel, base, target, sigma=48.0):
    """multiplicative tint towards the target colour, weighted by closeness to the measured base colour (keeps trim, glass)"""
    # luminance-preserving colour transfer: the target colour times the pixel's brightness relative to the base, so any base hue
    # (neutral cream from the local sheets, ochre/green from Codex) recolours cleanly and the clay texture (light/shade) stays
    d = np.linalg.norm(rgb - base, axis=2)
    w = np.exp(-(d / sigma) ** 2)[..., None] * sel[..., None]
    L = rgb @ np.array([0.299, 0.587, 0.114]); Lb = max(1.0, float(base @ np.array([0.299, 0.587, 0.114])))
    return rgb * (1 - w) + np.clip(target[None, None, :] * (L / Lb)[..., None], 0, 255) * w

def bay_sequence(k, hip):
    kmin = 4 if hip else 2
    k = max(k, kmin)
    if k >= 5: return [0, 1] + [2] * (k - 4) + [3, 4]
    if k == 4: return [0, 1, 3, 4]
    if k == 3: return [0, 2, 4]
    return [0, 4]

def assemble(T, angle, length, wc, rc):
    m = T.m; c, sl = T.cell(angle)
    img, a, u, f = T.img[sl], T.alpha[sl], T.u_n[sl], T.f_n[sl]
    hip = m["roof"] == "hip"
    rgb = img
    for group, target in (((1, 9), hexrgb(wc)), ((10, 255), hexrgb(rc))):
        fids = [k[1] for k in T.base if k[0] == angle and group[0] <= k[1] <= group[1]]
        if not fids: continue
        lum = lambda v: float(v @ np.array([0.299, 0.587, 0.114]))
        lref = max(lum(T.base[(angle, q)]) for q in fids)         # the brightest face shows the target colour, others keep their shade
        for q in fids:
            b = T.base[(angle, q)]
            rgb = recolor(rgb, f == q, b, target * lum(b) / lref)
    w, nb, L = m["bay"], m["nbay"], m["L"]
    seq = bay_sequence(int(round(length / w)), hip)
    t = math.radians(angle); su = np.array([math.cos(t), math.sin(t) * m["PS"]]) * m["ppm"]   # screen px per metre of u
    n = m["cell"]; pad = int(abs(su).max() * w * (len(seq) + nb) / 2) + 8
    out = np.zeros((n + 2 * pad, n + 2 * pad, 4), np.float32)
    k = len(seq); parts = []
    for j, i in enumerate(seq):
        du = (-k * w / 2 + j * w) - (-L / 2 + i * w)          # target bay start - source bay start
        parts.append((du * su[1], j, i, du))
    for _, j, i, du in sorted(parts):                           # far (smaller screen y shift) first
        # each bay reaches ~2 px into its neighbours: shifts are rounded to whole pixels, and without the overlap a 1 px gap
        # (a dark seam on walls, a dashed line on roofs) shows where repeated bays meet; nearer bays are drawn last and win
        lo = -np.inf if i == 0 else -L / 2 + i * w - 2.0 / m["ppm"]
        hi = np.inf if i == nb - 1 else -L / 2 + (i + 1) * w + 2.0 / m["ppm"]
        sel = (u >= lo) & (u < hi) & (a > 0.01)
        ys, xs = np.nonzero(sel)
        oy, ox = int(round(pad + du * su[1])), int(round(pad + du * su[0]))
        # one-pixel overlap towards the neighbour hides resampling seams
        out[ys + oy, xs + ox, :3] = rgb[ys, xs]; out[ys + oy, xs + ox, 3] = np.maximum(out[ys + oy, xs + ox, 3], a[ys, xs])
    ax, ay = c["ax"] + pad, c["ay"] + pad
    al = out[..., 3]; ys, xs = np.nonzero(al > 0.01)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    spr = out[y0:y1, x0:x1]
    s = PPM / m["ppm"]
    im = Image.fromarray(np.clip(np.dstack([spr[..., :3], spr[..., 3:] * 255]), 0, 255).astype(np.uint8), "RGBA")
    im = im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)
    return im, ((ax - x0) * s, (ay - y0) * s), len(seq) * w

def poly_yrange_at(p, x):
    """y-interval of a convex polygon (flat [x0,y0,...]) at column x, or None"""
    ys = []; n = len(p) // 2
    for i in range(n):
        x0, y0, x1, y1 = p[2 * i], p[2 * i + 1], p[2 * ((i + 1) % n)], p[2 * ((i + 1) % n) + 1]
        if (x0 - x) * (x1 - x) <= 0 and x0 != x1: ys.append(y0 + (x - x0) / (x1 - x0) * (y1 - y0))
        elif x0 == x == x1: ys += [y0, y1]
    return (min(ys), max(ys)) if ys else None

def draw_order(objs):
    """painter's order for convex footprints, camera looking north: A is drawn after B if A is nearer (larger y) on a shared column"""
    n = len(objs); after = [set() for _ in range(n)]
    for a in range(n):
        for b in range(a + 1, n):
            A, B = objs[a], objs[b]
            lo, hi = max(A["bx0"], B["bx0"]), min(A["bx1"], B["bx1"])
            if lo >= hi: continue
            for x in np.linspace(lo, hi, 5)[1:-1] if hi - lo > 0.2 else [(lo + hi) / 2]:
                ra, rb = poly_yrange_at(A["p"], x), poly_yrange_at(B["p"], x)
                if not ra or not rb: continue
                if ra[0] >= rb[1] - 0.05: after[a].add(b); break
                if rb[0] >= ra[1] - 0.05: after[b].add(a); break
    order, state = [], [0] * n
    def visit(v):
        if state[v] == 2: return
        if state[v] == 1: return                                  # cycle (rare): break it
        state[v] = 1
        for w in sorted(after[v], key=lambda k: objs[k]["cy"]): visit(w)
        state[v] = 2; order.append(v)
    for v in sorted(range(n), key=lambda k: objs[k]["cy"]): visit(v)
    return order

def main():
    raw, out = json.load(open(sys.argv[1])), sys.argv[2]
    kv = dict(a.split("=", 1) for a in sys.argv[3:])
    adir = kv.pop("assets", None)                                  # optional: tools/ai/lab/block_assets.py output (sprites + textures)
    alias = dict(x.split(":") for x in kv.pop("alias", "").split(",") if x)   # e.g. alias=flat6:flat4 when a type has no sheet
    global ALIGN
    ALIGN = kv.pop("align", "1") != "0"                            # align=0: img2img sheets already sit on the proxy
    sheets = kv
    assets = json.load(open(f"{adir}/assets.json")) if adir else {"trees": [], "props": {}, "textures": {}}
    if adir:
        import shutil
        shutil.copytree(f"{adir}/assets", f"{out}/assets", dirs_exist_ok=True)
    os.makedirs(f"{out}/spr", exist_ok=True)
    CX, CY = raw["cx"], raw["cy"]
    types = {}
    def get(name, bid):
        """TYPE=a.png,b.png gives several generated sheets of one type: buildings alternate between them by id"""
        if name not in types: types[name] = [Type(name, f) for f in sheets.get(name, f"{I}/blk_{name}_colorn.png").split(",")]
        vs = types[name]
        return vs[(bid * 2654435761 >> 7) % len(vs)]
    blds, errs = [], []
    for b in raw["buildings"]:
        r = b["rect"]
        if abs(r["cx"] - CX) > FRAME + 25 or abs(r["cy"] - CY) > FRAME + 25: continue
        roof = {0: "flat", 1: "hip", 3: "gable"}.get(b["roof"], "hip")
        name = f"{roof}{4 if round(b['h'] / 3.1) <= 4 else 6}"
        name = alias.get(name, name)
        ux, uy = r["ux"], r["uy"]; nx, ny = -uy, ux                # facade along rect.u, front normal across it
        # the drawn front (with the door) goes to the side that faces the nearest street, not to the courtyard
        def street_dist(px_, py_):
            best = 1e9
            for e in raw["edges"]:
                ex, ey = e["xb"] - e["xa"], e["yb"] - e["ya"]; L2 = ex * ex + ey * ey or 1
                t_ = max(0, min(1, ((px_ - e["xa"]) * ex + (py_ - e["ya"]) * ey) / L2))
                best = min(best, math.hypot(px_ - e["xa"] - t_ * ex, py_ - e["ya"] - t_ * ey))
            return best
        off = r["hd"] + 3
        if street_dist(r["cx"] - nx * off, r["cy"] - ny * off) < street_dist(r["cx"] + nx * off, r["cy"] + ny * off): nx, ny = -nx, -ny
        t = math.degrees(math.atan2(-nx, ny)) % 360
        T = get(name, b["id"] & 0xffffffff); angs = [c["angle"] for c in T.m["cells"]]
        a = min(angs, key=lambda q: min(abs(q - t), 360 - abs(q - t)))
        errs.append(min(abs(a - t), 360 - abs(a - t)))
        im, (ax, ay), Lb = assemble(T, a, 2 * r["hl"], b["wc"], b["rc"])
        fn = f"spr/b{len(blds):03d}.png"; im.save(f"{out}/{fn}")
        p = b["p"]; xs = p[0::2]
        # screen silhouette of the drawn building (type height, snapped angle, assembled length) for people occlusion tests
        ta = math.radians(a); uu = np.array([math.cos(ta), math.sin(ta)]); nn = np.array([-math.sin(ta), math.cos(ta)])
        Ht, Rt = T.m["H"], T.m["ridge"]; c0 = np.array([r["cx"], r["cy"]])
        foot = [c0 + su_ * Lb / 2 * uu + sn_ * T.m["D"] / 2 * nn for su_ in (-1, 1) for sn_ in (-1, 1)]
        pts3 = [(q[0], q[1], z) for q in foot for z in (0, Ht)] + [(c0[0] + su_ * max(0, Lb / 2 - T.m["D"] / 2) * uu[0], c0[1] + su_ * max(0, Lb / 2 - T.m["D"] / 2) * uu[1], Ht + Rt) for su_ in (-1, 1)]
        scr = [((x_ - CX + FRAME) * PPM, (y_ - CY + FRAME) * PPM * PS - z_ * PPM * PC + TOP) for x_, y_, z_ in pts3]
        blds.append(dict(kind="b", spr=fn, x=r["cx"], y=r["cy"], ax=ax, ay=ay, w=im.width, h=im.height, p=p, bx0=min(xs), bx1=max(xs),
                         cy=r["cy"], type=name, angle=a, err=round(errs[-1], 1), L=round(2 * r["hl"], 1), Lb=Lb, hgt=Ht + Rt * 0.6,
                         hull=[[round(x_, 1), round(y_, 1)] for x_, y_ in hull(scr)]))
    # trees and props as small footprints so they sort with the buildings
    stat = list(blds)
    for tr in raw["trees"]:
        if abs(tr["x"] - CX) > FRAME + 10 or abs(tr["y"] - CY) > FRAME + 10: continue
        rr = max(0.6, tr["r"] * 0.35)
        stat.append(dict(kind="tree", x=tr["x"], y=tr["y"], r=tr["r"], pal=tr.get("pal", 0), id=tr["id"],
                         p=[tr["x"] - rr, tr["y"] - rr, tr["x"] + rr, tr["y"] - rr, tr["x"] + rr, tr["y"] + rr, tr["x"] - rr, tr["y"] + rr],
                         bx0=tr["x"] - rr, bx1=tr["x"] + rr, cy=tr["y"]))
    for pr in raw["props"]:
        if abs(pr["x"] - CX) > FRAME + 5 or abs(pr["y"] - CY) > FRAME + 5: continue
        rr = 0.5
        stat.append(dict(kind="prop", t=pr["t"], x=pr["x"], y=pr["y"], id=pr["id"],
                         p=[pr["x"] - rr, pr["y"] - rr, pr["x"] + rr, pr["y"] - rr, pr["x"] + rr, pr["y"] + rr, pr["x"] - rr, pr["y"] + rr],
                         bx0=pr["x"] - rr, bx1=pr["x"] + rr, cy=pr["y"]))
    order = draw_order(stat)
    for k, v in enumerate(order): stat[v]["z"] = k
    # ground: yards, sidewalks, carriageways (flat colours here; textures come from the page)
    W = int(2 * FRAME * PPM); H = int(2 * FRAME * PPM * PS)
    X = lambda x: (x - CX + FRAME) * PPM; Y = lambda y: (y - CY + FRAME) * PPM * PS
    # material labels: 0 base, 1 yard, 2 park, 3 sidewalk, 4 road
    g = Image.new("L", (W, H), 3); d = ImageDraw.Draw(g)
    for F in raw["faces"]:
        d.polygon([(X(x), Y(y)) for x, y in zip(F["px"], F["py"])], fill=2 if F["kind"] == 1 or F["gd"] else 1)
    def strip(e, half, col):
        dx, dy = e["xb"] - e["xa"], e["yb"] - e["ya"]; ln = math.hypot(dx, dy) or 1; ox, oy = -dy / ln * half, dx / ln * half
        ex, ey = dx / ln * half * 0.2, dy / ln * half * 0.2
        d.polygon([(X(e["xa"] + ox - ex), Y(e["ya"] + oy - ey)), (X(e["xb"] + ox + ex), Y(e["yb"] + oy + ey)),
                   (X(e["xb"] - ox + ex), Y(e["yb"] - oy + ey)), (X(e["xa"] - ox - ex), Y(e["ya"] - oy - ey))], fill=col)
    for e in raw["edges"]: strip(e, e["cw"] + e["sw"], 3)
    for e in raw["edges"]:
        strip(e, e["cw"], 4)
        r_ = e["cw"] * PPM * 1.0
        for x_, y_ in ((e["xa"], e["ya"]), (e["xb"], e["yb"])):
            d.ellipse([X(x_) - r_, Y(y_) - r_ * PS, X(x_) + r_, Y(y_) + r_ * PS], fill=4)
    lab = np.asarray(g)
    FLAT = {1: (178, 172, 140), 2: (150, 170, 112), 3: (184, 178, 168), 4: (96, 98, 104)}
    TEXOF = {1: "grass", 2: "grass", 3: "paving", 4: "asphalt"}
    ga = np.zeros((H, W, 3), np.float32)
    def tiled(name):
        t = assets["textures"][name]; tw, th = max(8, round(t["tile_m"] * PPM)), max(8, round(t["tile_m"] * PPM * PS))
        tex = np.asarray(Image.open(f"{adir}/{t['file']}").convert("RGB").resize((tw, th), Image.LANCZOS)).astype(np.float32)
        return np.tile(tex, (H // th + 1, W // tw + 1, 1))[:H, :W]
    for k in (1, 2, 3, 4):
        sel = lab == k
        if TEXOF[k] in assets["textures"]: ga[sel] = tiled(TEXOF[k])[sel]
        else: ga[sel] = FLAT[k]
    if "gravel" in assets["textures"]:                             # yards: lawn with worn gravel patches
        rng = np.random.default_rng(5); nz = ndimage.gaussian_filter(rng.random((H // 8 + 1, W // 8 + 1)), 3)
        nz = np.asarray(Image.fromarray(nz.astype(np.float32)).resize((W, H), Image.BILINEAR))
        patch = np.clip((nz - np.percentile(nz, 55)) * 60, 0, 1)[..., None] * (lab == 1)[..., None]
        ga = ga * (1 - patch) + tiled("gravel") * patch
    curb = (ndimage.binary_dilation(lab == 4, iterations=1) & (lab == 3))   # kerb line between road and sidewalk
    ga[curb] *= 0.72
    g = Image.fromarray(np.clip(ga, 0, 255).astype(np.uint8))
    # shadows: one mask for all casters so overlaps do not darken twice
    sm = Image.new("L", (W, H), 0); ds = ImageDraw.Draw(sm)
    for o in stat:
        if o["kind"] == "b":
            q = np.array(o["p"]).reshape(-1, 2); hh = o["hgt"]
            ds.polygon([(X(x_), Y(y_)) for x_, y_ in hull(np.vstack([q, q + SH * hh]))], fill=255)
        elif o["kind"] == "tree":
            th = 2.2 * o["r"] + 2; cx_, cy_ = o["x"] + SH[0] * th * 0.8, o["y"] + SH[1] * th * 0.8; rr = o["r"] * 0.95
            ds.ellipse([X(cx_ - rr), Y(cy_ - rr), X(cx_ + rr), Y(cy_ + rr)], fill=200)
    sm = sm.filter(ImageFilter.GaussianBlur(2.2))
    ga = np.asarray(g).astype(np.float32); k = np.asarray(sm).astype(np.float32)[..., None] / 255
    ga = ga * (1 - 0.38 * k) * (1 - 0.06 * k * np.array([1.0, 0.6, -0.4]))       # a little cooler in the shade
    g = Image.fromarray(np.clip(ga, 0, 255).astype(np.uint8))
    g.save(f"{out}/ground.jpg", quality=90)
    # walk graph for people: sidewalk centre lines (both sides of every street)
    walks = []
    for e in raw["edges"]:
        dx, dy = e["xb"] - e["xa"], e["yb"] - e["ya"]; ln = math.hypot(dx, dy) or 1; off = e["cw"] + e["sw"] * 0.5
        for s in (-1, 1):
            ox, oy = -dy / ln * off * s, dx / ln * off * s
            walks.append([e["xa"] + ox, e["ya"] + oy, e["xb"] + ox, e["yb"] + oy])
    meta = dict(ppm=PPM, pitch=PITCH, PS=PS, PC=PC, cx=CX, cy=CY, frame=FRAME, top=TOP, ground=dict(file="ground.jpg", w=W, h=H),
                tree_sprites=assets["trees"], prop_sprites=assets["props"],
                objects=[{k: v for k, v in o.items() if k not in ("bx0", "bx1")} for o in stat], walks=walks)
    json.dump(meta, open(f"{out}/block.json", "w"))
    open(f"{out}/block.js", "w").write("window.BLOCK = " + json.dumps(meta) + ";\n")       # loads from file:// too
    e = np.array(errs)
    print(f"buildings {len(blds)}, trees+props {len(stat) - len(blds)}, angle error mean {e.mean():.1f} max {e.max():.1f}; "
          f"types used {sorted(set(b['type'] for b in blds))}; length error mean {np.mean([abs(b['Lb'] - b['L']) for b in blds]):.1f} m")

if __name__ == "__main__":
    main()
