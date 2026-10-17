"""Pack the experiment's frames and puppet parts into small WebP files next to demo.html (tools/illus/assets/).
   ~/ComfyUI/.venv/bin/python tools/illus/build_assets.py
   Sizes (each with its own crop box on the 768x1024 base canvas, shared by all approaches so they stand on one ground line):
     L  card in the comparison grid, 0.6 of the render (shown at half size: 2x density)
     S  map scale, the character ~150 px tall (shown at ~75 px)
     P  portrait for a character card: head and shoulders at 1.2 of the render (shown at half size)
   Frame sequences -> horizontal strips <name>_<size>.webp; puppet parts -> b_<part>_<size>.webp placed by the manifest.
   Writes assets/manifest.json and assets/manifest.js (the page is opened from file://, where fetch() is blocked)."""
import glob, json, os
import numpy as np
from PIL import Image
from common import HERE, load_rgba, bbox, extend_edges

RAW = os.path.join(HERE, "raw")
OUT = os.path.join(HERE, "assets")
SCALE = {"L": 0.6, "S": 0.17, "P": 1.2}
Q = {"L": 82, "S": 90, "P": 84}

A_MAIN = ["base", "blink", "talk", "wave", "wave_blink", "wave2", "wave2_blink", "walkA", "walkA_blink", "walkB", "walkB_blink",
          "pass", "pass_blink", "pass2", "pass2_blink"]
A_PASTE = ["paste_" + n for n in ("base", "blink", "talk", "wave", "wave2", "walkA", "walkB", "pass", "pass2")]
A_RAW = ["raw_" + n for n in ("base", "blink", "talk", "wave", "wave2", "walkA", "walkB", "pass", "pass2")]
PARTS = ["neck", "body", "head", "arm", "arm_up", "forearm", "eyes", "mouth"]
PORTRAIT = {"a": ["base", "blink", "talk"]}


def crop_img(rgb, a, box, s):
    x0, y0, x1, y1 = box
    H, W = a.shape
    pad = ((max(0, -y0), max(0, y1 - H)), (max(0, -x0), max(0, x1 - W)))
    if any(v for p in pad for v in p):
        rgb, a = np.pad(rgb, pad + ((0, 0),), mode="edge"), np.pad(a, pad)
        x0, x1, y0, y1 = x0 + pad[1][0], x1 + pad[1][0], y0 + pad[0][0], y1 + pad[0][0]
    im = Image.fromarray((np.dstack([rgb[y0:y1, x0:x1], a[y0:y1, x0:x1]]) * 255 + 0.5).astype(np.uint8), "RGBA")
    return im.resize((int(round((x1 - x0) * s)), int(round((y1 - y0) * s))), Image.LANCZOS)  # Pillow premultiplies RGBA


def save(im, name, size):
    p = os.path.join(OUT, f"{name}_{size}.webp")
    im.save(p, "WEBP", quality=Q[size], method=6)
    return os.path.getsize(p)


def strip(frames, name, box, size):
    ims = [crop_img(*f, box, SCALE[size]) for f in frames]
    w, h = ims[0].size
    st = Image.new("RGBA", (w * len(ims), h))
    for i, im in enumerate(ims):
        st.paste(im, (i * w, 0))
    return save(st, name, size), w, h


def main():
    os.makedirs(OUT, exist_ok=True)
    for f in glob.glob(os.path.join(OUT, "*.webp")):
        os.remove(f)
    have = lambda names: [n for n in names if os.path.exists(os.path.join(RAW, "a", n + ".png"))]
    lists = {"a": have(A_MAIN), "ap": have(A_PASTE), "araw": have(A_RAW)}
    cache = {}
    def frames(names, sub="a"):
        out = []
        for n in names:
            p = os.path.join(RAW, sub, n + ".png") if sub else n
            if p not in cache:
                rgb, a = load_rgba(p)
                cache[p] = (extend_edges(rgb, a), a)  # bleed edge colours outward once (no dark fringe after resize)
            out.append(cache[p])
        return out
    seqs = {k: frames(v) for k, v in lists.items()}
    vm_path = os.path.join(RAW, "c", "video_meta.json")
    vmeta = json.load(open(vm_path)) if os.path.exists(vm_path) else {}
    for name in vmeta:
        seqs["c_" + name] = frames(sorted(glob.glob(os.path.join(RAW, "c", name, "rgba", "*.png"))), sub=None)
    parts = {p: frames([p], "b")[0] for p in PARTS if os.path.exists(os.path.join(RAW, "b", p + ".png"))}
    pj = json.load(open(os.path.join(RAW, "b", "parts.json")))
    ma = json.load(open(os.path.join(HERE, "metrics_a.json")))
    # crop boxes: L/S = union of everything + margin (the waving forearm swings outside the drawn frames)
    boxes = [bbox(a, 0.02) for seq in seqs.values() for _, a in seq] + [bbox(a, 0.02) for _, a in parts.values()]
    full = (max(0, min(b[0] for b in boxes) - 36), max(0, min(b[1] for b in boxes) - 24),
            min(768, max(b[2] for b in boxes) + 36), min(1024, max(b[3] for b in boxes) + 12))
    hb = ma["base"]["head_box"]
    portrait = (hb[0] - 70, max(0, hb[1] - 24), hb[2] + 70, ma["base"]["collar"] + 170)
    box_of = {"L": full, "S": full, "P": portrait}
    man = dict(boxes=box_of, scale=SCALE, strips={}, parts={},
               video_meta={k: {kk: vv for kk, vv in v.items() if kk != "per_frame"} for k, v in vmeta.items()},
               **{k + "_frames": v for k, v in lists.items()})
    for size, s in SCALE.items():
        box = box_of[size]
        todo = list(seqs.items()) if size != "P" else [(k, frames(v)) for k, v in PORTRAIT.items()] + \
            [(k, v) for k, v in seqs.items() if k.startswith("c_")]
        for name, seq in todo:
            if seq:
                b, w, h = strip(seq, name, box, size)
                man["strips"][f"{name}_{size}"] = dict(n=len(seq), w=w, h=h, bytes=b)
        for p, (rgb, a) in parts.items():
            pb0 = bbox(a, 0.02)
            px0, py0 = max(pb0[0] - 4, box[0]), max(pb0[1] - 4, box[1])
            px1, py1 = min(pb0[2] + 4, box[2]), min(pb0[3] + 4, box[3])
            if px1 <= px0 + 2 or py1 <= py0 + 2:
                continue
            # snap the part box to the output pixel grid so parts land on whole output pixels
            pb = (box[0] + int(np.floor((px0 - box[0]) * s)) / s, box[1] + int(np.floor((py0 - box[1]) * s)) / s,
                  box[0] + int(np.ceil((px1 - box[0]) * s)) / s, box[1] + int(np.ceil((py1 - box[1]) * s)) / s)
            pb = tuple(int(round(v)) for v in pb)
            im = crop_img(rgb, a, pb, s)
            man["parts"][f"{p}_{size}"] = dict(x=round((pb[0] - box[0]) * s), y=round((pb[1] - box[1]) * s), w=im.size[0],
                                                h=im.size[1], bytes=save(im, "b_" + p, size))
        man[f"canvas_{size}"] = [round((box[2] - box[0]) * s), round((box[3] - box[1]) * s)]
        man[f"foot_{size}"] = round((pj["foot"] - box[1]) * s, 1)
        for k in ("neck", "shoulder", "shoulder_up", "elbow"):
            man[f"{k}_{size}"] = [round((pj[k][0] - box[0]) * s, 1), round((pj[k][1] - box[1]) * s, 1)]
    tot = {}
    for k, v in man["strips"].items():
        name, size = k.rsplit("_", 1)
        g = ("c" if name.startswith("c_") else name) + "_" + size
        tot[g] = tot.get(g, 0) + v["bytes"]
    for k, v in man["parts"].items():
        g = "b_" + k.rsplit("_", 1)[1]
        tot[g] = tot.get(g, 0) + v["bytes"]
    man["bytes"] = tot
    man["metrics_a"] = {k: {kk: v.get(kk) for kk in ("raw", "fixed", "scale_fix", "colour_drift_raw", "colour_drift_fixed",
                                                     "feet_slide_raw", "feet_slide", "blink_twin")}
                        for k, v in ma["frames"].items()}
    man["puppet"] = {k: pj[k] for k in ("reassembly_mad", "reassembly_bad_pct", "silhouette_diff_px")}
    json.dump(man, open(os.path.join(OUT, "manifest.json"), "w"), indent=1)
    open(os.path.join(OUT, "manifest.js"), "w").write("window.MANIFEST = " + json.dumps(man) + ";\n")
    print(json.dumps(dict(boxes=box_of, bytes=tot, videos=list(vmeta)), indent=1))


if __name__ == "__main__":
    main()
