"""Score and compare the Q1 test: Qwen alone vs Z-Image / the Qwen->Z chain.
   Shape = silhouette IoU vs the proxy mask. Detail = mean |Laplacian| of luminance inside the eroded proxy mask (rough proxy for
   'how much fine detail', higher = busier; flat renders score low)."""
import json, sys, os
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import qscore
from qexp import checker

O = os.path.expanduser("~/ComfyUI/output"); I = os.path.expanduser("~/ComfyUI/input")

def detail(img, mask):
    im = Image.open(img).convert("RGB"); m = np.asarray(Image.open(mask).convert("L").resize(im.size)) > 127
    lum = np.asarray(im).astype(np.float32) @ np.array([0.299, 0.587, 0.114])
    lap = np.abs(ndimage.laplace(ndimage.gaussian_filter(lum, 0.7)))
    inner = ndimage.binary_erosion(m, iterations=6)
    return round(float(lap[inner].mean()), 2)

def row(label, img, mask):
    iou = qscore.score(img, mask, single="sheet7t" not in mask)[0]
    return dict(label=label, file=img, iou=iou, det=detail(img, mask))

A_MASK = f"{I}/p30_iso_mask.png"; B_MASK = f"{I}/p30_gable_iso_t_halftimber_mask.png"; C_MASK = f"{I}/sheet7t_mask.png"
qa = {r["label"]: r for r in json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "qexp/qa.json")))}
rows_a = [row(f"Z-Image (рецепт) s{s}", f"{O}/exp/za_00_s{s}_00001_.png", A_MASK) for s in (1, 2) if os.path.exists(f"{O}/exp/za_00_s{s}_00001_.png")]
rows_b = [row("Qwen→Z-Image (связка)", f"{O}/zbeauty/half_timbered_d75_s40_00001_.png", B_MASK), row("Qwen, болванка+фото (ночь)", f"{O}/qexp/q8_01_s1_00001_.png", B_MASK)]
for lab, r in sorted(qa.items(), key=lambda kv: (kv[1]["cfg"], kv[1]["seed"])):
    (rows_b if lab[3] == "B" else rows_a).append(row(lab[3:].split("|")[0].strip()[:34] + f" s{r['seed']}", r["file"], B_MASK if lab[3] == "B" else A_MASK))
rows_c = [row("Z-Image лист (r10)", f"{O}/exp/r10_01_s1_00001_.png", C_MASK)]
qs = os.path.join(os.path.dirname(os.path.abspath(__file__)), "qexp/qa_sheet.json")
if os.path.exists(qs):
    for r in json.load(open(qs)): rows_c.append(row("Qwen лист, болванка первой", r["file"], C_MASK))

F = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 15)
def sheet(rows, path, cols=4, S=300):
    n = len(rows); rr = (n + cols - 1) // cols
    g = Image.new("RGB", (cols * S, rr * (S + 40)), "white"); d = ImageDraw.Draw(g)
    for i, r in enumerate(rows):
        x, y = (i % cols) * S, (i // cols) * (S + 40)
        im = checker(Image.open(r["file"])); im.thumbnail((S, S)); g.paste(im, (x + (S - im.width) // 2, y + 40 + (S - im.height) // 2))
        d.text((x + 4, y + 2), r["label"], fill="black", font=F); d.text((x + 4, y + 20), f"форма {r['iou']}   детали {r['det']}", fill=(160, 30, 30), font=F)
    g.save(path, quality=88)
base = os.path.join(os.path.dirname(os.path.abspath(__file__)), "qexp")
sheet(rows_a, f"{base}/qa_compare_A.jpg"); sheet(rows_b, f"{base}/qa_compare_B.jpg", cols=3); sheet(rows_c, f"{base}/qa_compare_C.jpg", cols=1, S=900)
for name, rs in (("A", rows_a), ("B", rows_b), ("C", rows_c)):
    print(f"== {name}")
    for r in rs: print(f"  {r['label']:40s} form {r['iou']:.3f}  detail {r['det']:6.2f}")
