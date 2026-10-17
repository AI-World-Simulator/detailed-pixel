"""Z-Image-Turbo + Fun ControlNet experiments on a building proxy: queue configs on the local ComfyUI, wait, score, contact sheet.
   python exp.py ROUND        (rounds are defined in ROUNDS below)
   Scores: iou  = silhouette of the generated building vs the proxy mask (background = median border colour)
           lr   = luminance of the lit side wall / the shaded front wall (the proxy asks for > 1: light from the front-left)"""
import sys, os, json, time, urllib.request
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage

HOST = "http://127.0.0.1:8188"
COMFY = os.path.expanduser("~/ComfyUI")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "exp")
os.makedirs(OUT, exist_ok=True)
CN = "Z-Image-Turbo-Fun-Controlnet-Union-2.1-2602-8steps.safetensors"

PROMPTS = {
    "p1": ("A five-storey 19th-century European apartment building with a hipped terracotta tile roof, warm cream plaster facade "
           "with a rusticated ground floor, tall white-framed windows with stone surrounds, a cornice under the eaves, a wooden entrance "
           "door with a small porch. Three-quarter top-down view from above, hand-painted 2D game art, detailed cozy city-builder "
           "illustration, crisp clean edges. Soft warm sunlight from the left: the short left wall is brightly lit, the long front "
           "facade is in soft shade. Isolated on a plain flat light grey background, no ground, no trees, no people."),
    "p2": ("Hand-painted isometric game asset of a five-storey old European apartment house: hipped red clay tile roof with chimneys, "
           "cream stucco walls, rows of tall windows with white frames and sills, decorative cornice, arched wooden front door. "
           "Rich painterly texture, warm afternoon light from the left with soft shadows, high detail, cozy, clean silhouette, "
           "plain light grey background."),
    "p3": ("Cozy hand-painted storybook game art of a five-storey 19th-century European apartment house: hipped terracotta roof "
           "with chimneys and small dormers, cream stucco facade with a rusticated ground floor, tall white-framed windows with "
           "flower boxes, ornate cornice, arched wooden entrance door. Painterly brush textures, soft warm sunlight from the left, "
           "gentle ambient occlusion, rich but clean details, readable silhouette. Three-quarter top-down view, isolated on a "
           "plain light grey background."),
}
PROMPTS["p3_gable"] = PROMPTS["p3"].replace("hipped terracotta roof", "gabled terracotta roof with stepped gable ends")
PROMPTS["p3_iso"] = PROMPTS["p3"].replace("Three-quarter top-down view", "Classic 2:1 isometric game view, orthographic")
PROMPTS["p3_sheet"] = ("Turnaround sprite sheet of ONE building shown 13 times from different angles on a turntable. "
    + PROMPTS["p3_iso"].replace(" Three-quarter top-down view, isolated on a plain light grey background.", "")
    + " Exactly the same building in every view: identical windows, dormers, chimneys, colours and decorations. "
      "Classic 2:1 isometric game view, orthographic. Plain light grey background, no text, no labels.")
PROMPTS["p3_sheet5"] = PROMPTS["p3_sheet"].replace("five-storey 19th-century European apartment house:",
    "tall five-storey 19th-century European apartment house with five rows of windows (ground floor plus four upper floors), small windows relative to the building:")
PROMPTS["p3_sheet5_7"] = PROMPTS["p3_sheet5"].replace("shown 13 times", "shown 7 times")
PROMPTS["p3_ortho"] = PROMPTS["p3"].replace("Three-quarter top-down view", "Orthographic game view from above")
PROMPTS["p3_flat"] = PROMPTS["p3"].replace("hipped terracotta roof with chimneys and small dormers", "flat roof with a stone parapet, chimneys and a roof hatch")

def wf(cfg, seed, prefix):
    p = cfg.get("proxy", "p30")
    g = {
        "1": {"class_type": "UNETLoader", "inputs": {"unet_name": "z_image_turbo_bf16.safetensors", "weight_dtype": "default"}},
        "2": {"class_type": "CLIPLoader", "inputs": {"clip_name": "qwen_3_4b.safetensors", "type": "lumina2", "device": "default"}},
        "3": {"class_type": "VAELoader", "inputs": {"vae_name": "ae.safetensors"}},
        "4": {"class_type": "ModelSamplingAuraFlow", "inputs": {"model": ["1", 0], "shift": cfg.get("shift", 3.0)}},
        "5": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["2", 0], "text": PROMPTS[cfg.get("prompt", "p1")]}},
        "6": {"class_type": "ConditioningZeroOut", "inputs": {"conditioning": ["5", 0]}},
        "9": {"class_type": "VAEDecode", "inputs": {"samples": ["8", 0], "vae": ["3", 0]}},
        "10": {"class_type": "SaveImage", "inputs": {"images": ["9", 0], "filename_prefix": prefix}},
    }
    if cfg.get("init"):
        g["20"] = {"class_type": "LoadImage", "inputs": {"image": f"{p}_{cfg['init']}.png"}}
        g["21"] = {"class_type": "VAEEncode", "inputs": {"pixels": ["20", 0], "vae": ["3", 0]}}
        lat = ["21", 0]
    else:
        g["7"] = {"class_type": "EmptySD3LatentImage", "inputs": {"width": 1024, "height": 1024, "batch_size": 1}}
        lat = ["7", 0]
    model = ["4", 0]
    if cfg.get("ctrl"):
        src = cfg["ctrl"]
        g["11"] = {"class_type": "LoadImage", "inputs": {"image": f"{p}_{'gray' if src == 'canny' else src}.png"}}
        img = ["11", 0]
        if src == "canny":
            g["14"] = {"class_type": "Canny", "inputs": {"image": ["11", 0], "low_threshold": 0.1, "high_threshold": 0.3}}
            img = ["14", 0]
        g["12"] = {"class_type": "ModelPatchLoader", "inputs": {"name": CN}}
        g["13"] = {"class_type": "ZImageFunControlnet", "inputs": {"model": model, "model_patch": ["12", 0], "vae": ["3", 0],
                   "strength": cfg.get("s", 0.7), "image": img, "start_percent": 0.0, "end_percent": cfg.get("e", 1.0)}}
        model = ["13", 0]
    g["8"] = {"class_type": "KSampler", "inputs": {"model": model, "positive": ["5", 0], "negative": ["6", 0], "latent_image": lat,
              "seed": seed, "steps": cfg.get("steps", 8), "cfg": 1.0, "sampler_name": cfg.get("sampler", "res_multistep"),
              "scheduler": "simple", "denoise": cfg.get("d", 1.0)}}
    return g

def post(path, data=None):
    req = urllib.request.Request(HOST + path, data=json.dumps(data).encode() if data is not None else None,
                                 headers={"Content-Type": "application/json"})
    return json.load(urllib.request.urlopen(req, timeout=60))

def score(img_path, proxy):
    im = np.asarray(Image.open(img_path).convert("RGB")).astype(np.float32)
    mask = np.asarray(Image.open(f"{COMFY}/input/{proxy}_mask.png")) > 127
    faces = np.asarray(Image.open(f"{COMFY}/input/{proxy}_faces.png"))
    border = np.concatenate([im[:12].reshape(-1, 3), im[-12:].reshape(-1, 3), im[:, :12].reshape(-1, 3), im[:, -12:].reshape(-1, 3)])
    bg = np.median(border, axis=0)
    fg = np.abs(im - bg).sum(axis=2) > 40
    fg = ndimage.binary_fill_holes(ndimage.binary_opening(ndimage.binary_closing(fg, iterations=3), iterations=2))
    lab, n = ndimage.label(fg)
    if n > 1:  # keep the component that overlaps the proxy most
        best = np.argmax(ndimage.sum(mask, lab, range(1, n + 1))) + 1; fg = lab == best
    iou = float((fg & mask).sum() / max(1, (fg | mask).sum()))
    lum = im @ np.array([0.299, 0.587, 0.114])
    if not (faces == 1).any() or not (faces == 2).any(): return round(iou, 3), None   # only one wall visible (0/90 deg)
    lf, ls = lum[faces == 1].mean(), lum[faces == 2].mean()
    return round(iou, 3), round(float(ls / max(1.0, lf)), 2)

def sheet(rows, path, cols=4, S=300):
    F = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 15)
    n = len(rows); r = (n + cols - 1) // cols
    g = Image.new("RGB", (cols * S, r * (S + 40)), "white"); d = ImageDraw.Draw(g)
    for i, row in enumerate(rows):
        x, y = (i % cols) * S, (i // cols) * (S + 40)
        g.paste(Image.open(row["file"]).convert("RGB").resize((S, S)), (x, y + 40))
        d.text((x + 6, y + 2), row["label"], fill="black", font=F)
        d.text((x + 6, y + 20), f"iou {row['iou']}  light {row['lr']}  {row['sec']}s", fill="#444", font=F)
    g.save(path)

ROUNDS = {
    "r1": [
        dict(name="lines s.7", ctrl="lines", s=0.7),
        dict(name="lines s.5 e.8", ctrl="lines", s=0.5, e=0.8),
        dict(name="linesW s.7", ctrl="linesw", s=0.7),
        dict(name="depth s.7", ctrl="depth", s=0.7),
        dict(name="depth s.5 e.8", ctrl="depth", s=0.5, e=0.8),
        dict(name="i2i .75 + lines s.6 e.8", init="color", d=0.75, ctrl="lines", s=0.6, e=0.8),
        dict(name="i2i .85 + lines s.5 e.8", init="color", d=0.85, ctrl="lines", s=0.5, e=0.8),
        dict(name="i2i .65 no ctrl", init="color", d=0.65),
        dict(name="canny(gray) s.6 e.7", ctrl="canny", s=0.6, e=0.7),
    ],
    "r2": [
        dict(name="i2i .90 + lines s.6 e.8", init="color", d=0.90, ctrl="lines", s=0.6, e=0.8),
        dict(name="i2i .90 + linesW s.6 e.8", init="color", d=0.90, ctrl="linesw", s=0.6, e=0.8),
        dict(name="i2i .95 + linesW s.7 e.8", init="color", d=0.95, ctrl="linesw", s=0.7, e=0.8),
        dict(name="i2i .90 + linesW s.6 e.8 p2", init="color", d=0.90, ctrl="linesw", s=0.6, e=0.8, prompt="p2"),
        dict(name="i2i(grain) .85 + linesW s.6 e.8", init="colorn", d=0.85, ctrl="linesw", s=0.6, e=0.8),
        dict(name="i2i(grain) .90 + linesW s.7 e.8", init="colorn", d=0.90, ctrl="linesw", s=0.7, e=0.8),
        dict(name="linesW s.85", ctrl="linesw", s=0.85),
        dict(name="linesW s1.0", ctrl="linesw", s=1.0),
    ],
    "r3": [
        dict(name="linesW s.85 p3", ctrl="linesw", s=0.85, prompt="p3"),
        dict(name="lines s.85 (no windows)", ctrl="lines", s=0.85),
        dict(name="lines s1.0 p3", ctrl="lines", s=1.0, prompt="p3"),
        dict(name="i2i(grain) skip1 + lines s.6 e.8 p3", init="colorn", d=0.85, ctrl="lines", s=0.6, e=0.8, prompt="p3"),
        dict(name="linesW s.85 12 steps", ctrl="linesw", s=0.85, steps=12),
        dict(name="lines s.85 12 steps p3", ctrl="lines", s=0.85, steps=12, prompt="p3"),
    ],
    "r4": [
        dict(name="best @ 30°", proxy="p30", **{}, init="colorn", d=0.85, ctrl="lines", s=0.6, e=0.8, prompt="p3"),
        dict(name="best @ 0°", proxy="p0", init="colorn", d=0.85, ctrl="lines", s=0.6, e=0.8, prompt="p3"),
        dict(name="best @ 45°", proxy="p45", init="colorn", d=0.85, ctrl="lines", s=0.6, e=0.8, prompt="p3"),
        dict(name="best @ 60°", proxy="p60", init="colorn", d=0.85, ctrl="lines", s=0.6, e=0.8, prompt="p3"),
        dict(name="best @ -30°", proxy="p-30", init="colorn", d=0.85, ctrl="lines", s=0.6, e=0.8, prompt="p3"),
        dict(name="best @ 30° gable", proxy="p30_gable", init="colorn", d=0.85, ctrl="lines", s=0.6, e=0.8, prompt="p3_gable"),
        dict(name="best @ 45° flat", proxy="p45_flat", init="colorn", d=0.85, ctrl="lines", s=0.6, e=0.8, prompt="p3_flat"),
    ],
    "r5": [
        dict(name="iso 0°", proxy="p0_iso", init="colorn", d=0.85, ctrl="lines", s=0.6, e=0.8, prompt="p3_iso"),
        dict(name="iso 30°", proxy="p30_iso", init="colorn", d=0.85, ctrl="lines", s=0.6, e=0.8, prompt="p3_iso"),
        dict(name="iso 45°", proxy="p45_iso", init="colorn", d=0.85, ctrl="lines", s=0.6, e=0.8, prompt="p3_iso"),
        dict(name="iso 60°", proxy="p60_iso", init="colorn", d=0.85, ctrl="lines", s=0.6, e=0.8, prompt="p3_iso"),
        dict(name="oblique 0° recipe, lines s.85", proxy="p0", init="colorn", d=0.85, ctrl="lines", s=0.85, e=0.8, prompt="p3"),
        dict(name="oblique 0° linesW s.85 p1", proxy="p0", ctrl="linesw", s=0.85),
    ],
    "r6": [
        dict(name="sheet13 recipe", proxy="sheet13", init="colorn", d=0.85, ctrl="lines", s=0.6, e=0.8, prompt="p3_sheet"),
        dict(name="sheet13 lines s.75", proxy="sheet13", init="colorn", d=0.85, ctrl="lines", s=0.75, e=0.8, prompt="p3_sheet"),
    ],
    "r7": [
        dict(name="sheet13 recipe + window lines s.6", proxy="sheet13", init="colorn", d=0.85, ctrl="linesw", s=0.6, e=0.8, prompt="p3_sheet5"),
        dict(name="sheet13 recipe lines s.6, 5-storey prompt", proxy="sheet13", init="colorn", d=0.85, ctrl="lines", s=0.6, e=0.8, prompt="p3_sheet5"),
        dict(name="sheet13 window lines s.75 + skip-2", proxy="sheet13", init="colorn", d=0.75, ctrl="linesw", s=0.75, e=0.8, prompt="p3_sheet5"),
    ],
    "r8": [
        dict(name="sheet13 LARGE 2560x1536, 5-storey prompt", proxy="sheet13L", init="colorn", d=0.85, ctrl="lines", s=0.6, e=0.8, prompt="p3_sheet5"),
        dict(name="sheet13 window lines s.45, 5-storey prompt", proxy="sheet13", init="colorn", d=0.85, ctrl="linesw", s=0.45, e=0.8, prompt="p3_sheet5"),
    ],
    "r9": [
        dict(name="sheet7 2048x1024 (cells 512), 5-storey prompt", proxy="sheet7", init="colorn", d=0.85, ctrl="lines", s=0.6, e=0.8, prompt="p3_sheet5_7"),
        dict(name="sheet7 + window lines s.45", proxy="sheet7", init="colorn", d=0.85, ctrl="linesw", s=0.45, e=0.8, prompt="p3_sheet5_7"),
    ],
    "r10": [
        dict(name="sheet7 TALL windows + window lines s.45", proxy="sheet7t", init="colorn", d=0.85, ctrl="linesw", s=0.45, e=0.8, prompt="p3_sheet5_7"),
        dict(name="sheet7 TALL windows + window lines s.35", proxy="sheet7t", init="colorn", d=0.85, ctrl="linesw", s=0.35, e=0.8, prompt="p3_sheet5_7"),
    ],
    # camera pitch test (2026-10-17): same building and recipe, orthographic camera pitched 30/45/55/60 deg, frontal and 30 deg rotation
    # fair Z-Image baseline for the Q1 test: the current p30_iso proxy (rotation convention changed after r5)
    "za": [dict(name="Z-Image recipe @30 (current p30_iso)", proxy="p30_iso", init="colorn", d=0.85, ctrl="lines", s=0.6, e=0.8, prompt="p3_iso")],
    "rp": [dict(name=f"pitch {pt} @{a}", proxy=f"p{a}_iso_t_apt{pt}", init="colorn", d=0.85, ctrl="lines", s=0.6, e=0.8, prompt="p3_ortho")
           for pt in (30, 45, 55, 60) for a in (0, 30)],
}

if __name__ == "__main__":
    rnd = sys.argv[1]; seeds = [int(s) for s in (sys.argv[2].split(",") if len(sys.argv) > 2 else ["1", "2"])]
    cfgs = ROUNDS[rnd]; jobs = []
    for ci, cfg in enumerate(cfgs):
        for sd in seeds:
            pre = f"exp/{rnd}_{ci:02d}_s{sd}"
            pid = post("/prompt", {"prompt": wf(cfg, sd, pre)})["prompt_id"]
            jobs.append((ci, sd, pid))
    print(f"queued {len(jobs)} jobs", flush=True)
    rows, pending = [], {j[2]: j for j in jobs}
    while pending:
        time.sleep(5)
        for pid in list(pending):
            h = post(f"/history/{pid}")
            if pid not in h: continue
            ci, sd, _ = pending.pop(pid); st = h[pid]["status"]
            if st.get("status_str") == "error":
                print("ERROR", cfgs[ci]["name"], json.dumps(st)[:800], flush=True); continue
            ts = {m[0]: m[1].get("timestamp", 0) for m in st.get("messages", [])}
            sec = round((ts.get("execution_success", 0) - ts.get("execution_start", 0)) / 1000)
            fn = [im for o in h[pid]["outputs"].values() for im in o.get("images", [])][0]
            f = f"{COMFY}/output/{fn['subfolder']}/{fn['filename']}"
            iou, lr = score(f, cfgs[ci].get("proxy", "p30"))
            row = dict(cfg=ci, seed=sd, label=f"{ci:02d} {cfgs[ci]['name']} | seed {sd}", file=f, iou=iou, lr=lr, sec=sec)
            rows.append(row); print(json.dumps({k: row[k] for k in ("label", "iou", "lr", "sec")}, ensure_ascii=False), flush=True)
    rows.sort(key=lambda r: (r["cfg"], r["seed"]))
    json.dump(rows, open(f"{OUT}/{rnd}.json", "w"), ensure_ascii=False, indent=1)
    sheet(rows, f"{OUT}/{rnd}_sheet.png", cols=len(seeds) * 2 if len(seeds) <= 2 else len(seeds))
    print("sheet:", f"{OUT}/{rnd}_sheet.png")
