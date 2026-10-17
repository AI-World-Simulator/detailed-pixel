"""Qwen-Image-2.1 experiments on the local ComfyUI: text-to-image, reference editing, RGBA, optional Fun ControlNet.
   python qexp.py ROUND [seeds]          rounds live in QROUNDS (qrounds.py), results -> ./qexp/<round>.json + sheet
   Config keys: prompt, neg, refs [input-relative paths], w, h (or size="ref" = first reference's size), turbo (bool),
                cfg, steps (base), res (reference resolution), ctrl (input-relative control image), s, e (ControlNet), init + d"""
import sys, os, json, time, urllib.request
from PIL import Image, ImageDraw, ImageFont

HOST = "http://127.0.0.1:8188"
COMFY = os.path.expanduser("~/ComfyUI")
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "qexp"); os.makedirs(OUT, exist_ok=True)
TURBO_SIGMAS = "1.0, 0.978453, 0.95418, 0.926626, 0.89508, 0.845148, 0.704534, 0.414568, 0"
RGBA = "This is an RGBA image with transparency. "
RGBA_END = " The image has an alpha channel and the background is fully transparent."

def wf(cfg, seed, prefix):
    g = {
        "1": {"class_type": "UNETLoader", "inputs": {"unet_name": "qwen_image_2.1_bf16.safetensors", "weight_dtype": "default"}},
        "2": {"class_type": "CLIPLoader", "inputs": {"clip_name": "qwen3vl_8b_bf16.safetensors", "type": "qwen_image", "device": "default"}},
        "3": {"class_type": "VAELoader", "inputs": {"vae_name": "qwen_image_2.1_vae_bf16.safetensors"}},
    }
    model = ["1", 0]
    if cfg.get("turbo", True):
        g["1b"] = {"class_type": "LoraLoaderModelOnly", "inputs": {"model": model, "lora_name": "qwen_image_2.1_turbo_lora_avg_rank_178_bf16.safetensors", "strength_model": cfg.get("lora", 1.0)}}
        model = ["1b", 0]
    if cfg.get("ctrl"):
        g["c0"] = {"class_type": "LoadImage", "inputs": {"image": cfg["ctrl"]}}
        g["c1"] = {"class_type": "ModelPatchLoader", "inputs": {"name": "qwen_image_2.1_fun_controlnet_union_bf16.safetensors"}}
        g["c2"] = {"class_type": "ZImageFunControlnet", "inputs": {"model": model, "model_patch": ["c1", 0], "vae": ["3", 0], "strength": cfg.get("s", 0.7),
                   "image": ["c0", 0], "start_percent": 0.0, "end_percent": cfg.get("e", 1.0)}}
        model = ["c2", 0]
    g["4"] = {"class_type": "QwenImage21Cache", "inputs": {"model": model, "device": "auto", "dtype": "default"}}
    model = ["4", 0]
    prompt = cfg["prompt"]
    if cfg.get("rgba"): prompt = RGBA + prompt + RGBA_END
    enc = {"clip": ["2", 0], "prompt": prompt, "negative_prompt": cfg.get("neg", ""), "vae": ["3", 0], "resolution": cfg.get("res", 1024)}
    for i, r in enumerate(cfg.get("refs", []), 1):
        g[f"r{i}"] = {"class_type": "LoadImage", "inputs": {"image": r}}
        enc[f"images.image_{i}"] = [f"r{i}", 0]
    g["5"] = {"class_type": "TextEncodeQwenImage21", "inputs": enc}
    if cfg.get("init"):
        g["20"] = {"class_type": "LoadImage", "inputs": {"image": cfg["init"]}}
        g["21"] = {"class_type": "VAEEncode", "inputs": {"pixels": ["20", 0], "vae": ["3", 0]}}
        lat = ["21", 0]
    elif cfg.get("size") == "ref":
        lat = ["5", 2]
    else:
        g["7"] = {"class_type": "EmptyLatentImage", "inputs": {"width": cfg.get("w", 1024), "height": cfg.get("h", 1024), "batch_size": 1}}
        lat = ["7", 0]
    if cfg.get("turbo", True):
        sig = cfg.get("sigmas", TURBO_SIGMAS)
        if cfg.get("d"):   # img2img with the turbo schedule: drop the first, noisiest sigmas
            vals = [float(x) for x in sig.split(",")]; vals = [v for v in vals if v <= cfg["d"] + 1e-6]; sig = ", ".join(str(v) for v in vals)
        g["9"] = {"class_type": "ManualSigmas", "inputs": {"sigmas": sig}}
        g["10"] = {"class_type": "KSamplerSelect", "inputs": {"sampler_name": "euler"}}
        g["11"] = {"class_type": "RandomNoise", "inputs": {"noise_seed": seed}}
        g["12"] = {"class_type": "CFGGuider", "inputs": {"model": model, "positive": ["5", 0], "negative": ["5", 1], "cfg": cfg.get("cfg", 1.0)}}
        g["13"] = {"class_type": "SamplerCustomAdvanced", "inputs": {"noise": ["11", 0], "guider": ["12", 0], "sampler": ["10", 0], "sigmas": ["9", 0], "latent_image": lat}}
    else:
        g["13"] = {"class_type": "KSampler", "inputs": {"model": model, "positive": ["5", 0], "negative": ["5", 1], "latent_image": lat, "seed": seed,
                   "steps": cfg.get("steps", 25), "cfg": cfg.get("cfg", 1.0), "sampler_name": "euler", "scheduler": "simple", "denoise": cfg.get("d", 1.0)}}
    g["14"] = {"class_type": "VAEDecode", "inputs": {"samples": ["13", 0], "vae": ["3", 0]}}
    g["15"] = {"class_type": "SaveImage", "inputs": {"images": ["14", 0], "filename_prefix": prefix}}
    return g

def post(path, data=None):
    req = urllib.request.Request(HOST + path, data=json.dumps(data).encode() if data is not None else None, headers={"Content-Type": "application/json"})
    return json.load(urllib.request.urlopen(req, timeout=120))

def checker(im, n=16):
    """composite RGBA over a checkerboard so transparency is visible in sheets"""
    if im.mode != "RGBA": return im.convert("RGB")
    bg = Image.new("RGB", im.size, (235, 235, 235)); d = ImageDraw.Draw(bg)
    for y in range(0, im.height, n):
        for x in range(0, im.width, n):
            if (x // n + y // n) % 2: d.rectangle([x, y, x + n - 1, y + n - 1], fill=(205, 205, 205))
    bg.paste(im, (0, 0), im); return bg

def sheet(rows, path, cols=4, S=320):
    F = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 14)
    r = (len(rows) + cols - 1) // cols
    g = Image.new("RGB", (cols * S, r * (S + 36)), "white"); d = ImageDraw.Draw(g)
    for i, row in enumerate(rows):
        x, y = (i % cols) * S, (i // cols) * (S + 36)
        im = checker(Image.open(row["file"])); im.thumbnail((S, S)); g.paste(im, (x + (S - im.width) // 2, y + 36 + (S - im.height) // 2))
        d.text((x + 4, y + 2), row["label"][:46], fill="black", font=F); d.text((x + 4, y + 18), f"{row['sec']}s  {row.get('mode', '')}", fill="#555", font=F)
    g.save(path)

def run(name, cfgs, seeds, cols=4):
    jobs, pend, rows = [], {}, []
    for ci, cfg in enumerate(cfgs):
        for sd in seeds:
            pre = f"qexp/{name}_{ci:02d}_s{sd}"
            try:
                body = {"prompt": wf(cfg, sd, pre)}
                if os.environ.get("FRONT"): body["front"] = True     # jump ahead of already queued (own) rounds
                pid = post("/prompt", body)["prompt_id"]
            except urllib.error.HTTPError as e:
                print("QUEUE ERROR", cfg.get("name"), e.read().decode()[:600], flush=True); continue
            pend[pid] = (ci, sd)
    print(f"{name}: queued {len(pend)} jobs", flush=True)
    while pend:
        time.sleep(5)
        for pid in list(pend):
            try: h = post(f"/history/{pid}")
            except Exception: continue
            if pid not in h: continue
            ci, sd = pend.pop(pid); st = h[pid]["status"]
            if st.get("status_str") == "error":
                msg = [m for m in st.get("messages", []) if m[0] == "execution_error"]
                print("ERROR", cfgs[ci].get("name"), json.dumps(msg)[:700], flush=True); continue
            ts = {m[0]: m[1].get("timestamp", 0) for m in st.get("messages", [])}
            sec = round((ts.get("execution_success", 0) - ts.get("execution_start", 0)) / 1000)
            fn = [im for o in h[pid]["outputs"].values() for im in o.get("images", [])][0]
            f = f"{COMFY}/output/{fn['subfolder']}/{fn['filename']}"
            mode = Image.open(f).mode
            row = dict(cfg=ci, seed=sd, label=f"{ci:02d} {cfgs[ci].get('name', '')} s{sd}", file=f, sec=sec, mode=mode)
            rows.append(row); print(json.dumps({k: row[k] for k in ("label", "sec", "mode", "file")}, ensure_ascii=False), flush=True)
    rows.sort(key=lambda r: (r["cfg"], r["seed"]))
    json.dump(rows, open(f"{OUT}/{name}.json", "w"), ensure_ascii=False, indent=1)
    if rows:
        sheet(rows, f"{OUT}/{name}_sheet.png", cols=cols); print("sheet:", f"{OUT}/{name}_sheet.png", flush=True)
    return rows

if __name__ == "__main__":
    import qrounds
    name = sys.argv[1]; seeds = [int(s) for s in (sys.argv[2].split(",") if len(sys.argv) > 2 else ["1"])]
    run(name, qrounds.QROUNDS[name], seeds, cols=qrounds.COLS.get(name, 4))
