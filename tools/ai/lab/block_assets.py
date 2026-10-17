"""Small assets for the block micro-map in the chosen clay style (Z-Image text-to-image): trees, bushes, lamp, bench, kiosk as
cut-out RGBA sprites with a ground anchor, and seamless ground textures (asphalt, paving, grass, gravel).
   python block_assets.py gen OUT_DIR      queue + wait + post-process everything
   python block_assets.py post OUT_DIR     only post-process already generated images (reads OUT_DIR/raw.json)"""
import os, sys, json, time, math
import numpy as np
from PIL import Image
from scipy import ndimage
import exp

COMFY = os.path.expanduser("~/ComfyUI")
CLAY = ("as a handmade plasticine claymation miniature: soft matte modelling clay, rounded edges, subtle fingerprints, soft diffuse studio "
        "light, a stop-motion set miniature")
VIEW = ("Seen from high above at about 55 degrees, orthographic game view. Isolated single object on a plain flat light grey background, "
        "no ground, no shadow on the ground, no text.")
TEX = "Seamless tileable texture, flat top-down orthographic view straight down, even soft lighting, no objects, no shadows, no perspective."
# kind: sprite (h_m = real height for scale) or texture (tile_m = metres covered by one texture tile)
ASSETS = {
    "tree_a": dict(p=f"A single deciduous linden tree {CLAY}: a big round puffy crown of soft green clay leaf clumps, a short brown clay trunk. {VIEW}", h_m=9, seeds=[1, 2]),
    "tree_b": dict(p=f"A single birch tree {CLAY}: a light airy crown of small yellow-green clay leaf clumps, a white clay trunk with black marks. {VIEW}", h_m=10, seeds=[3]),
    "tree_c": dict(p=f"A single poplar tree {CLAY}: a tall oval crown of dark green clay leaf clumps, a brown clay trunk. {VIEW}", h_m=12, seeds=[4]),
    "lilac": dict(p=f"A single round lilac bush with purple flower clusters {CLAY}. {VIEW}", h_m=2.5, seeds=[5]),
    "hedge": dict(p=f"A single small round green shrub {CLAY}. {VIEW}", h_m=1.4, seeds=[6]),
    "flower": dict(p=f"A small round flower bed with red, yellow and white flowers and green leaves {CLAY}. {VIEW}", h_m=0.6, seeds=[7]),
    "lamp": dict(p=f"A single old Moscow cast-iron street lamp post {CLAY}: a thin dark green clay post with a glass lantern on top. {VIEW}", h_m=4.8, seeds=[8]),
    "bench": dict(p=f"A single wooden park bench with cast-iron legs {CLAY}. {VIEW}", h_m=0.9, seeds=[9]),
    "kiosk": dict(p=f"A single small green Moscow newspaper kiosk with a glass window and a sign {CLAY}. {VIEW}", h_m=2.8, seeds=[10]),
    "busstop": dict(p=f"A single small bus stop shelter with a bench and a roof {CLAY}. {VIEW}", h_m=2.7, seeds=[11]),
    "tex_asphalt": dict(p=f"{TEX} Dark grey asphalt road surface made of modelling clay, gently uneven, {CLAY}.", tile_m=9),
    "tex_paving": dict(p=f"{TEX} Light grey square concrete paving slabs of a sidewalk made of modelling clay, {CLAY}.", tile_m=6),
    "tex_grass": dict(p=f"{TEX} Short green lawn grass made of modelling clay with tiny clay blades, {CLAY}.", tile_m=10),
    "tex_gravel": dict(p=f"{TEX} Beige packed earth with small pebbles of a courtyard, made of modelling clay, {CLAY}.", tile_m=8),
}
NOGRID = "irregular and natural, no tiles, no slabs, no squares, no grid, no lines, no repeating pattern"
ASSETS["tex_asphalt"]["p"] = f"{TEX} Smooth dark grey asphalt made of modelling clay: an even flat surface with subtle smudges, tiny pits and soft fingerprints, {NOGRID}."
ASSETS["tex_grass"]["p"] = f"{TEX} A lawn made of green modelling clay: many tiny clay grass tufts scattered randomly, slightly uneven, {NOGRID}."
ASSETS["tex_gravel"]["p"] = f"{TEX} Beige packed earth made of modelling clay with scattered small clay pebbles, {NOGRID}."

def generate(out, only=None, front=False):
    jobs = {}
    for name, a in ASSETS.items():
        if only and name not in only: continue
        exp.PROMPTS["asset_" + name] = a["p"]
        for sd in a.get("seeds", [21]):
            cfg = dict(prompt="asset_" + name)
            pid = exp.post("/prompt", {"prompt": exp.wf(cfg, sd, f"assets/{name}_s{sd}"), "front": front})["prompt_id"]
            jobs[pid] = (name, sd)
    print("queued", len(jobs), flush=True)
    raw = json.load(open(f"{out}/raw.json")) if only and os.path.exists(f"{out}/raw.json") else {}
    for n in (only or []): raw.pop(n, None)
    while jobs:
        time.sleep(5)
        for pid in list(jobs):
            h = exp.post(f"/history/{pid}")
            if pid not in h: continue
            name, sd = jobs.pop(pid)
            ims = [im for o in h[pid]["outputs"].values() for im in o.get("images", [])]
            if not ims: print("FAILED", name, flush=True); continue
            raw.setdefault(name, []).append(f"{COMFY}/output/{ims[0]['subfolder']}/{ims[0]['filename']}")
            print("done", name, sd, flush=True)
    json.dump(raw, open(f"{out}/raw.json", "w"), indent=1)

def cutout(path):
    im = np.asarray(Image.open(path).convert("RGB")).astype(np.float32)
    border = np.concatenate([im[:8].reshape(-1, 3), im[-8:].reshape(-1, 3), im[:, :8].reshape(-1, 3), im[:, -8:].reshape(-1, 3)])
    bg = np.median(border, axis=0)
    d = np.linalg.norm(im - bg, axis=2)
    chroma = im.max(axis=2) - im.min(axis=2); lum = im @ np.array([0.299, 0.587, 0.114])
    bgl = float(bg @ np.array([0.299, 0.587, 0.114]))
    shadow = (chroma < 16) & (lum < bgl - 3) & (lum > bgl - 55)          # soft grey cast shadow on the backdrop (dark objects stay)
    d = np.where(shadow, 0, d)
    fg = d > 20
    fg = ndimage.binary_closing(fg, iterations=2)
    fg = ndimage.binary_fill_holes(fg)
    lab, n = ndimage.label(fg)
    if n == 0: return None
    sizes = ndimage.sum(fg, lab, range(1, n + 1)); big = np.argmax(sizes) + 1
    keep = sizes >= 0.05 * sizes.max()                       # the object plus detached bits (leaf clumps) of reasonable size
    fg = np.isin(lab, np.nonzero(keep)[0] + 1)
    a = np.clip((d - 12) / 16, 0, 1) * ndimage.binary_dilation(fg, iterations=1)
    a = ndimage.gaussian_filter(a, 0.5)
    ys, xs = np.nonzero(a > 0.05)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    rgba = np.dstack([im, a * 255])[y0:y1, x0:x1]
    # ground anchor: centre of the lowest 6 % of the opaque rows (trunk / post / base)
    ay = y1 - y0 - 1; rows = a[y0:y1, x0:x1] > 0.5
    low = rows[int((y1 - y0) * 0.94):]
    xs_low = np.nonzero(low.any(axis=0))[0]
    ax = float(xs_low.mean()) if len(xs_low) else (x1 - x0) / 2
    return Image.fromarray(np.clip(rgba, 0, 255).astype(np.uint8), "RGBA"), ax, ay

def seamless(path, out_path):
    """cross-fade the texture with itself shifted by half a tile: the borders come from the shifted copy, which wraps continuously"""
    t = np.asarray(Image.open(path).convert("RGB")).astype(np.float32)
    h, w = t.shape[:2]; r = np.roll(t, (h // 2, w // 2), axis=(0, 1))
    wy = 1 - np.abs(np.linspace(-1, 1, h)); wx = 1 - np.abs(np.linspace(-1, 1, w))
    m = np.clip(np.minimum.outer(wy, wx) * 2.2, 0, 1)[..., None]
    Image.fromarray(np.clip(t * m + r * (1 - m), 0, 255).astype(np.uint8)).resize((512, 512), Image.LANCZOS).save(out_path, quality=92)

def post(out):
    raw = json.load(open(f"{out}/raw.json"))
    os.makedirs(f"{out}/assets", exist_ok=True)
    meta = {"trees": [], "props": {}, "textures": {}}
    PC = math.cos(math.radians(55))
    for name, files in raw.items():
        a = ASSETS[name]
        for k, f in enumerate(sorted(files)):
            if name.startswith("tex_"):
                fn = f"assets/{name}.jpg"; seamless(f, f"{out}/{fn}")
                meta["textures"][name[4:]] = dict(file=fn, tile_m=a["tile_m"]); continue
            res = cutout(f)
            if not res: print("empty cutout", name); continue
            im, ax, ay = res
            fn = f"assets/{name}_{k}.png"; im.save(f"{out}/{fn}")
            ppm = im.height / (a["h_m"] * PC + 1.0)              # sprite px per scene metre (height foreshortened by the camera)
            ent = dict(file=fn, ax=round(float(ax), 1), ay=round(float(ay), 1), w=im.width, h=im.height, ppm=round(float(ppm), 2))
            if name.startswith("tree"): meta["trees"].append(ent)
            else: meta["props"].setdefault(name, ent)
    json.dump(meta, open(f"{out}/assets.json", "w"), indent=1)
    print("assets:", len(meta["trees"]), "trees,", list(meta["props"]), list(meta["textures"]))

if __name__ == "__main__":
    mode, out = sys.argv[1], sys.argv[2]
    os.makedirs(out, exist_ok=True)
    if mode == "gen": generate(out)
    if mode == "regen": generate(out, only=sys.argv[3].split(","), front=True)
    post(out)
