"""Approach C: image-to-video frames (Wan 2.2 TI2V-5B via gen.py, BiRefNet masks from the same job) -> RGBA loop + metrics.
   ~/ComfyUI/.venv/bin/python tools/illus/video.py NAME ACTION [--every 2] [--full]   (--full: keep the whole clip, no loop cut)
   reads  raw/c/NAME/frames/*.png, raw/c/NAME/masks/*.png (video size, e.g. 576x768)
   writes raw/c/NAME/rgba/*.png on the 768x1024 base canvas, raw/c/video_meta.json (fps, loop length, metrics)
   Steps: alpha + decontamination -> upscale to the base canvas -> shape metrics per frame (head scale/shift, height, area,
   ground, feet slide; same definitions as approach A) -> lock the feet (vertical: ground line, horizontal: feet centre,
   only if the clip drifts) -> loop: cut at the frame most similar to frame 0 in the second half (no first/last-frame
   conditioning in TI2V-5B) -> keep every Nth frame for the sprite strip."""
import glob, json, os, sys
import numpy as np
from PIL import Image
from common import HERE, load_rgb, load_mask, save_rgba, bg_color, decontaminate, clean_alpha, feet_row, shift
from frames import base_setup, shape, feet_x, boots

RAW = os.path.join(HERE, "raw")


def to_canvas(arr, W=768, H=1024):
    im = Image.fromarray((np.clip(arr, 0, 1) * 255 + 0.5).astype(np.uint8))
    return np.asarray(im.resize((W, H), Image.LANCZOS), dtype=np.float32) / 255.0


def main():
    name, action = sys.argv[1], sys.argv[2]
    every = int(sys.argv[sys.argv.index("--every") + 1]) if "--every" in sys.argv else 2
    full = "--full" in sys.argv
    d = os.path.join(RAW, "c", name)
    fr = sorted(glob.glob(os.path.join(d, "frames", "*.png")))
    ms = sorted(glob.glob(os.path.join(d, "masks", "*.png")))
    assert fr and len(fr) == len(ms), (len(fr), len(ms))
    B = base_setup()
    frames, per = [], []
    for f, m in zip(fr, ms):
        rgb, a = load_rgb(f), clean_alpha(load_mask(m))
        c = decontaminate(rgb, a, bg_color(rgb))
        rgb, c, a = to_canvas(rgb), to_canvas(c), to_canvas(a)
        a = clean_alpha(a)
        m = a > 0.9
        per.append(dict(shape(B, rgb, a), feet_x=round(feet_x(a), 1), boots=[round(v, 1) for v in boots(a)],
                        mean_rgb=[round(float(v) * 255, 1) for v in c[m].mean(0)],
                        bg=[round(float(v) * 255, 1) for v in np.median(rgb[a < 0.05], 0)]))
        frames.append((rgb, c, a))
    # feet lock: the camera of a generated clip may creep; standing clips keep the feet where frame 0 has them
    f0x, f0y = feet_x(frames[0][2]), feet_row(frames[0][2])
    dy0 = B["foot"] - f0y
    dx0 = int(round(feet_x(B["a"]) - f0x))
    out = []
    for (rgb, c, a), p in zip(frames, per):
        dy = dy0 + (f0y - feet_row(a))
        dx = dx0 + int(round(f0x - feet_x(a)))
        out.append((shift(c, dy, dx), shift(a, dy, dx)))
        p["lock"] = [dx - dx0, dy - dy0]
    # loop point: most similar frame to frame 0 in the second half (grey, masked)
    g0 = (out[0][0] * out[0][1][..., None]).mean(2)
    n = len(out)
    diffs = [float(np.abs((o[0] * o[1][..., None]).mean(2) - g0).mean() * 255) for o in out]
    k = n if full else int(np.argmin(diffs[n // 2:]) + n // 2)
    loop = list(range(0, k, every))
    # colour drift of the figure against frame 0 (mean of channel means, 0..255): video models tend to "burn" colours
    # and per-pixel difference to frame 0 inside the figure (idle barely moves, so this is mostly colour/texture change)
    c0 = np.array(per[0]["mean_rgb"])
    f0c, f0a = frames[0][1], frames[0][2]
    for p, (_, c, a) in zip(per, frames):
        p["colour_drift"] = round(float(np.abs(np.array(p["mean_rgb"]) - c0).mean()), 1)
        both = (a > 0.9) & (f0a > 0.9)
        p["mad_vs_0"] = round(float(np.abs(c - f0c).max(2)[both].mean() * 255), 1)
    onset = next((i for i, p in enumerate(per) if p["mad_vs_0"] > 25), None)
    od = os.path.join(d, "rgba")
    os.makedirs(od, exist_ok=True)
    for f in glob.glob(os.path.join(od, "*.png")):
        os.remove(f)
    for i, j in enumerate(loop):
        save_rgba(os.path.join(od, f"{i:04d}.png"), *out[j])
    hs = [p["head_scale"] for p in per]
    hh = [p["height"] for p in per]
    ar = [p["area"] for p in per]
    gr = [p["ground"] for p in per]
    sl = [abs(p["feet_x"] - per[0]["feet_x"]) for p in per]
    meta_p = os.path.join(RAW, "c", "video_meta.json")
    meta = json.load(open(meta_p)) if os.path.exists(meta_p) else {}
    job = json.load(open(os.path.join(d, "job.json"))) if os.path.exists(os.path.join(d, "job.json")) else {}
    meta[name] = dict(action=action, fps=24 / every, frames_total=n, loop_end=k, loop_frames=len(loop),
                      loop_jump=round(diffs[k], 2) if k < n else None, seconds=job.get("seconds"), size=job.get("size"),
                      colour_drift_max=max(p["colour_drift"] for p in per), mad_vs_0_max=max(p["mad_vs_0"] for p in per),
                      colour_onset_frame=onset,
                      colour_onset_s=round(onset / 24, 2) if onset is not None else None, dtype=job.get("dtype", "default"),
                      head_scale=[min(hs), max(hs)], head_match_min=round(min(p["head_match"] for p in per), 3),
                      height=[min(hh), max(hh)], area=[min(ar), max(ar)], ground_raw=[min(gr), max(gr)],
                      feet_slide_raw=round(max(sl), 1), per_frame=per)
    json.dump(meta, open(meta_p, "w"), indent=1)
    print(json.dumps({k2: v for k2, v in meta[name].items() if k2 != "per_frame"}, indent=1))


if __name__ == "__main__":
    main()
