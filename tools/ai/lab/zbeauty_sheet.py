"""Z-Image second pass over a Qwen turnaround sheet: resize the Qwen sheet to the proxy sheet, img2img with the sheet's window lines.
   python zbeauty_sheet.py QWEN_SHEET.png SHEET_TAG "description" PREFIX [denoise] [strength]"""
import sys, os, json, time
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import exp
src, tag, desc, prefix = sys.argv[1:5]
d = float(sys.argv[5]) if len(sys.argv) > 5 else 0.75; s = float(sys.argv[6]) if len(sys.argv) > 6 else 0.35
I = os.path.expanduser("~/ComfyUI/input"); O = os.path.expanduser("~/ComfyUI/output")
W, H = Image.open(f"{I}/sheet13_{tag}_linesw.png").size
Image.open(src).convert("RGB").resize((W, H), Image.LANCZOS).save(f"{I}/zbs_{tag}.png")
STYLE = ("Turnaround sprite sheet of one building shown 13 times. Cozy hand-painted storybook game art, painterly brush textures, "
         "rich but clean details, soft warm sunlight from the left, readable silhouettes. Classic 2:1 isometric game view, orthographic. "
         "Exactly the same building in every view. Plain light grey background, no text.")
g = exp.wf(dict(init="colorn", d=d, ctrl="linesw", s=s, e=0.8, prompt="p3", proxy=f"sheet13_{tag}"), 1, prefix)
g["20"]["inputs"]["image"] = f"zbs_{tag}.png"; g["5"]["inputs"]["text"] = f"{desc}. {STYLE}"
pid = exp.post("/prompt", {"prompt": g})["prompt_id"]; t0 = time.time()
while True:
    time.sleep(5); h = exp.post(f"/history/{pid}")
    if pid in h:
        st = h[pid]["status"]
        if st.get("status_str") == "error": print(json.dumps(st)[:800]); sys.exit(1)
        if h[pid]["outputs"]:
            fn = [im for o in h[pid]["outputs"].values() for im in o.get("images", [])][0]
            print(f"done {time.time() - t0:.0f}s -> {O}/{fn['subfolder']}/{fn['filename']}"); break
