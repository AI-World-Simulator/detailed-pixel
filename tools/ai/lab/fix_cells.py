"""Regenerate only some cells of a turnaround sheet (inpainting), keeping the rest as context.
   python fix_cells.py SHEET.png PROXY_SHEET CELL COLS "c,r c,r ..." SEED OUT_PREFIX
   e.g. python fix_cells.py ~/ComfyUI/output/exp/r10_01_s1_00001_.png sheet7t 512 4 "0,0 3,0" 7 fix/r10_01"""
import sys, os, shutil, json, time
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import exp

src, proxy, cell, cols, cells, seed, prefix = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), sys.argv[5], int(sys.argv[6]), sys.argv[7]
STRENGTH = float(os.environ.get("FIX_S", "0.6"))
I = os.path.expanduser("~/ComfyUI/input")
name = os.path.basename(prefix)
orig = Image.open(src).convert("RGB"); W, H = orig.size
init = orig.copy(); prox = Image.open(f"{I}/{proxy}_colorn.png").convert("RGB")
m = np.zeros((H, W), np.uint8)
for cr in cells.split():
    c, r = map(int, cr.split(","))
    box = (c * cell, r * cell, (c + 1) * cell, (r + 1) * cell)
    m[box[1]:box[3], box[0]:box[2]] = 255
    init.paste(prox.crop(box), box[:2])          # broken cell -> this view's colour proxy, so the angle is anchored again
init.save(f"{I}/{name}_src.png")
Image.fromarray(m).convert("RGB").save(f"{I}/{name}_mask.png")

g = exp.wf(dict(init="colorn", d=0.85, ctrl="linesw", s=STRENGTH, e=0.8, prompt="p3_sheet5_7", proxy=proxy), seed, prefix)
# start from the generated sheet instead of the proxy; regenerate only inside the mask, fully (denoise 1 inside)
g["20"]["inputs"]["image"] = f"{name}_src.png"
g["30"] = {"class_type": "LoadImageMask", "inputs": {"image": f"{name}_mask.png", "channel": "red"}}
g["31"] = {"class_type": "SetLatentNoiseMask", "inputs": {"samples": ["21", 0], "mask": ["30", 0]}}
g["8"]["inputs"]["latent_image"] = ["31", 0]
g["8"]["inputs"]["denoise"] = 0.85   # first step from the proxy inside the mask
g["13"]["inputs"]["inpaint_image"] = ["20", 0]      # Fun ControlNet inpaint mode: the unmasked sheet is context
g["13"]["inputs"]["mask"] = ["30", 0]
pid = exp.post("/prompt", {"prompt": g})["prompt_id"]
t0 = time.time()
while True:
    time.sleep(3)
    h = exp.post(f"/history/{pid}")
    if pid in h:
        st = h[pid]["status"]
        if st.get("status_str") == "error": print(json.dumps(st)[:1500]); sys.exit(1)
        if h[pid]["outputs"]:
            fn = [im for o in h[pid]["outputs"].values() for im in o.get("images", [])][0]
            out = f"{exp.COMFY}/output/{fn['subfolder']}/{fn['filename']}"
            new = Image.open(out).convert("RGB"); mk = Image.fromarray(m)
            Image.composite(new, orig, mk).save(out)       # untouched cells stay pixel-identical to the original sheet
            print(f"done in {time.time() - t0:.0f}s ->", out); break
