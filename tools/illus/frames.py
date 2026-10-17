"""Approach A: frame-by-frame Qwen edits of the base drawing -> clean RGBA frames on the base canvas.
   ~/ComfyUI/.venv/bin/python tools/illus/frames.py   (reads raw/base.png, raw/q/*.png, raw/m/*.png; writes raw/a/, metrics_a.json)
   Main variant (raw/a/<kind>.png) keeps each frame's OWN head and face (the model's natural hair/face/head motion);
   it only fixes what reads as an error:
     BiRefNet alpha -> colour decontamination -> scale normalised so the figure keeps the base height (no head/body
     suddenly smaller or bigger) -> stand on the base ground line; horizontally: standing frames by the feet (no sliding),
     walking frames by the neck -> per-channel colour transfer to the base (Qwen drifts tones a few levels per edit)
     -> blink twins of pose frames: closed eyes from the blink edit laid on the frame's own eyes (only if the head matches).
   Rejected variant (raw/a/paste_<kind>.png): the base head pasted into pose frames / only eyes or mouth taken from face
   edits. It freezes the face and kills the life the user liked in cloud animations, kept for comparison only.
   Unprocessed cut-outs: raw/a/raw_<kind>.png."""
import json, os, sys
import numpy as np
from scipy import ndimage
from common import (HERE, load_rgb, load_mask, save_rgba, bg_color, decontaminate, clean_alpha, bbox, feet_row, neck_row,
                    shift, register_head, feather, over)

RAW = os.path.join(HERE, "raw")
OUT = os.path.join(RAW, "a")

# chosen edits (seeds picked by eye on sheet.py contact sheets); override with argv kind=edit_name pairs
PICK = {"blink": "q_blink_201", "talk": "q_talk_202", "wave": "q_wave_203", "wave2": "q_wave_213", "walkA": "q_walkA_204",
        "walkB": "q_walkB_235", "pass": "q_pass2_241", "pass2": "q_pass3_261"}
POSE = ("wave", "wave2", "walkA", "walkB", "pass", "pass2")
FACE = ("blink", "talk")


def load_frame(name):
    rgb = load_rgb(os.path.join(RAW, "q", name + ".png"))
    a = clean_alpha(load_mask(os.path.join(RAW, "m", "m_" + name + ".png")))
    return rgb, a


def base_setup():
    rgb = load_rgb(os.path.join(RAW, "base.png"))
    a = clean_alpha(load_mask(os.path.join(RAW, "m", "m_base.png")))
    bg = bg_color(rgb)
    x0, y0, x1, y1 = bbox(a)
    neck = neck_row(a, y0 + 150, y0 + 300)
    w = (a > 0.5).sum(1)
    collar = next(y for y in range(neck, neck + 80) if w[y] > 1.5 * w[neck])  # where the sweater starts
    hx0, hy0, hx1, _ = bbox(a[:neck])
    pad = 8
    head_box = (hx0 - pad, max(0, hy0 - pad), hx1 + pad, neck + pad)
    # head layer: hair, face and the whole neck down to the collar; the frame's sweater is laid over its lower edge,
    # so the seam sits on a real contour (collar) instead of a fade across the skin
    cols = np.where(a[neck] > 0.5)[0]
    head_a = a.copy()
    head_a[collar + 4:] = 0
    head_a[collar:collar + 4, :cols.min() - 2] = 0
    head_a[collar:collar + 4, cols.max() + 3:] = 0
    face = ndimage.binary_erosion(a[:neck] > 0.95, iterations=12)  # skin/eyes/mouth, without the hair outline
    face = np.vstack([face, np.zeros((a.shape[0] - neck, a.shape[1]), bool)])
    return dict(rgb=rgb, c=decontaminate(rgb, a, bg), a=a, bg=bg, neck=neck, collar=collar, foot=feet_row(a),
                head_box=head_box, head_a=head_a, face=face, neck_cols=(int(cols.min()), int(cols.max())),
                hc=((head_box[0] + head_box[2]) / 2, (head_box[1] + head_box[3]) / 2))


def match_colours(src, ref, m_src, m_ref):
    """Per-channel affine colour transfer (mean/std) from src to ref, statistics over the masked pixels.
       Qwen edits drift in tone by a few levels; without this the body 'flickers' between frames."""
    out = src.copy()
    for ch in range(3):
        a, b = src[..., ch][m_src], ref[..., ch][m_ref]
        g = np.clip(b.std() / max(a.std(), 1e-4), 0.8, 1.25)
        out[..., ch] = (src[..., ch] - a.mean()) * g + b.mean()
    return np.clip(out, 0, 1)


def colour_drift(c, a, B, y0):
    """Mean absolute difference (0..255) of the per-channel means of the body below y0, frame vs base."""
    m, mb = a > 0.9, B["a"] > 0.9
    m[:y0] = False; mb[:y0] = False
    return round(float(np.abs(c[m].mean(0) - B["c"][mb].mean(0)).mean() * 255), 2)


def face_patch(B, rgb, kind):
    """Region of the face that the edit changed (eyes for blink, mouth for talk), as a feathered mask in base coordinates."""
    reg = register_head(B["rgb"], B["head_box"], rgb)
    al = shift(rgb, -int(round(reg["dy"])), -int(round(reg["dx"])))
    d = np.abs(al - B["rgb"]).max(2) * B["face"]
    m = ndimage.binary_opening(d > 0.16, iterations=1)
    m = ndimage.binary_closing(m, iterations=4)
    lab, n = ndimage.label(m)
    if n == 0:
        return reg, al, np.zeros_like(d), d
    sizes = ndimage.sum(np.ones_like(d), lab, range(1, n + 1))
    order = [int(i) + 1 for i in np.argsort(sizes)[::-1]]
    keep = order[:2] if kind == "blink" else order[:1]  # two eyes / one mouth; stray changes elsewhere are dropped
    keep = [k for k in keep if sizes[k - 1] >= 40]
    m = np.isin(lab, keep)
    m = ndimage.binary_dilation(m, iterations=6)
    return reg, al, feather(m, 4) * B["face"], d


def face_metrics(B, al):
    """Mean abs difference (0..255) and share of changed pixels (> 24/255) inside the face, frame aligned to the base."""
    d = np.abs(al - B["rgb"]).max(2)[B["face"]]
    return round(float(d.mean() * 255), 2), round(float((d > 24 / 255).mean() * 100), 2)


def silhouette(B, a):
    m, mb = a > 0.5, B["a"] > 0.5
    return dict(area_ratio=round(float(m.sum() / mb.sum()), 3), iou=round(float((m & mb).sum() / (m | mb).sum()), 3))


def neck_point(a, near_x):
    """Silhouette fallback: the narrowest row under the head and the centre of the run of pixels there closest to near_x."""
    y0 = bbox(a)[1]
    ny = neck_row(a, y0 + 150, y0 + 300)
    lab, n = ndimage.label(a[ny] > 0.5)
    runs = [np.where(lab == i)[0] for i in range(1, n + 1)]
    run = min(runs, key=lambda r: abs(r.mean() - near_x))
    return float(run.mean()), float(ny)


def locate_head(B, rgb, a, min_score=0.6):
    """Head registration by edges; if the model redrew the head (score < min_score) use the neck of the silhouette instead."""
    reg = register_head(B["rgb"], B["head_box"], rgb)
    if reg["score"] >= min_score:
        return dict(reg, method="edges")
    bx, by = neck_point(B["a"], B["hc"][0])
    fx, fy = neck_point(a, B["hc"][0])
    return dict(reg, s=1.0, dx=fx - bx, dy=fy - by, method="silhouette neck (edge match %.2f)" % reg["score"])


def paste_head(B, rgb, a, reg, head_rgb):
    """Rejected variant A': erase the frame's own head and put the base head UNDER the frame's body, its neck on the
       frame's neck (the collar of the frame covers the seam)."""
    s, (cx, cy) = reg["s"], B["hc"]
    fx = cx + reg["dx"]                                      # frame head centre
    fy = cy + reg["dy"]
    neck_frame = fy + s * (B["neck"] - cy)                  # where the frame's neck row is
    collar_frame = fy + s * (B["collar"] - cy)
    px, py = int(round(fx - cx)), int(round(neck_frame - B["neck"]))
    # footprint of the frame's head + neck: the base head layer scaled by s about its centre, moved to the frame head
    hm = (B["head_a"] > 0.3).astype(np.float32)
    zm = ndimage.affine_transform(hm, [1 / s, 1 / s], offset=[cy - fy / s, cx - fx / s], order=0)
    erase = ndimage.binary_dilation(zm > 0.5, iterations=6)
    erase[int(collar_frame) + 1:] = False                  # never erase the sweater, arms, body
    a = a * (1 - erase)
    hrgb, ha = shift(head_rgb, py, px), shift(B["head_a"], py, px)
    rgb, a = over(hrgb, ha, rgb, a)                          # frame body over the base head
    return rgb, a, (px, py)


def rescale(c, rgb, a, k):
    """Scale a frame by k about the middle of its feet (ground contact stays where it is)."""
    fy = feet_row(a)
    fx = float(np.where(a[fy - 30:fy] > 0.5)[1].mean())
    M, off = [1 / k, 1 / k], [fy - fy / k, fx - fx / k]
    c = np.dstack([ndimage.affine_transform(c[..., i], M, offset=off, order=1) for i in range(3)])
    rgb = np.dstack([ndimage.affine_transform(rgb[..., i], M, offset=off, order=1, cval=1.0) for i in range(3)])
    return c, rgb, np.clip(ndimage.affine_transform(a, M, offset=off, order=1), 0, 1)


def feet_x(a, rows=30):
    fy = feet_row(a)
    return float(np.where(a[fy - rows:fy + 1] > 0.5)[1].mean())


def boots(a, rows=60):
    """Centres of the two boots (left to right) from the bottom rows of the silhouette."""
    fy = feet_row(a)
    lab, n = ndimage.label(a[fy - rows:fy + 1] > 0.5)
    cs = sorted([np.where(lab == i)[1].mean() for i in range(1, n + 1) if (lab == i).sum() > 150])
    return cs


def shape(B, rgb, a):
    """Proportion/shape stability of a frame against the base (what the eye reads as a mistake if it jumps):
       head scale and head-centre shift, figure height, silhouette area, ground contact."""
    reg = locate_head(B, rgb, a)
    top, foot = bbox(a)[1], feet_row(a)
    bt = bbox(B["a"])[1]
    return dict(head_scale=round(reg["s"], 3), head_match=round(reg["score"], 3), head_shift=[round(reg["dx"], 1), round(reg["dy"], 1)],
                height=round((foot - top) / (B["foot"] - bt), 3), area=round(float((a > 0.5).sum() / (B["a"] > 0.5).sum()), 3),
                ground=int(B["foot"] - foot))


def main():
    pick = dict(PICK)
    for arg in sys.argv[1:]:
        k, v = arg.split("=")
        pick[k] = v
    os.makedirs(OUT, exist_ok=True)
    B = base_setup()
    for n in ("base", "raw_base", "paste_base"):
        save_rgba(os.path.join(OUT, n + ".png"), B["c"], B["a"])
    metrics = dict(base=dict(neck=B["neck"], collar=B["collar"], foot=B["foot"], head_box=B["head_box"],
                             boots=boots(B["a"])), frames={})
    body_m = lambda a: (a > 0.9) & (np.arange(a.shape[0])[:, None] > B["collar"] + 20)
    blink_patch = None
    for kind in FACE + POSE:
        if kind not in pick:
            continue
        rgb, a = load_frame(pick[kind])
        c = decontaminate(rgb, a, bg_color(rgb))
        save_rgba(os.path.join(OUT, f"raw_{kind}.png"), c, a)
        m = dict(source=pick[kind], raw=shape(B, rgb, a))
        if kind in FACE + ("wave", "wave2"):
            bb, fb = boots(B["a"]), boots(a)
            m["feet_slide_raw"] = round(max(abs(x - y) for x, y in zip(bb, fb)), 1) if len(bb) == len(fb) else None
        reg = locate_head(B, rgb, a)
        # 1. proportions: keep the base figure height (neck-to-feet), the model often draws the figure 2-5 % smaller
        neck_f = B["hc"][1] + reg["dy"] + reg["s"] * (B["neck"] - B["hc"][1])
        k = float(np.clip((B["foot"] - B["neck"]) / (feet_row(a) - neck_f), 0.94, 1.06))
        # only when the head says the whole drawing is off-size; a shorter body with a right-size head is the pose (bent knees)
        if abs(k - 1) > 0.01 and abs(reg["s"] - 1) > 0.015:
            c, rgb, a = rescale(c, rgb, a, k)
            reg = locate_head(B, rgb, a)
        m["scale_fix"] = round(k if abs(k - 1) > 0.01 and abs(m["raw"]["head_scale"] - 1) > 0.015 else 1.0, 3)
        # 2. ground line + horizontal anchor (standing: feet, walking: neck)
        dy = B["foot"] - feet_row(a)
        walking = kind.startswith(("walk", "pass"))
        dx = -int(round(reg["dx"])) if walking else int(round(feet_x(B["a"]) - feet_x(a)))
        c, rgb, a = shift(c, dy, dx), shift(rgb, dy, dx), shift(a, dy, dx)
        # 3. tones: face frames have the base composition -> whole figure; pose frames -> body below the collar
        mf, mb = ((a > 0.9), (B["a"] > 0.9)) if kind in FACE else (body_m(a), body_m(B["a"]))
        drift_raw = round(float(np.abs(c[mf].mean(0) - B["c"][mb].mean(0)).mean() * 255), 2)
        c = match_colours(c, B["c"], mf, mb)
        save_rgba(os.path.join(OUT, f"{kind}.png"), c, a)
        m.update(fixed=shape(B, c, a), colour_drift_raw=drift_raw,
                 colour_drift_fixed=round(float(np.abs(c[mf].mean(0) - B["c"][mb].mean(0)).mean() * 255), 2))
        if kind in FACE + ("wave", "wave2"):              # standing frames: the boots must not move
            bb, fb = boots(B["a"]), boots(a)
            m["feet_slide"] = round(max(abs(x - y) for x, y in zip(bb, fb)), 1) if len(bb) == len(fb) else None
        # 4. rejected rigid variant + blink patch
        if kind in FACE:
            reg_f, al, patch, _ = face_patch(B, load_rgb(os.path.join(RAW, "q", pick[kind] + ".png")), kind)
            al_c = decontaminate(al, shift(load_frame(pick[kind])[1], -int(round(reg_f["dy"])), -int(round(reg_f["dx"]))),
                                 bg_color(al))
            ring = B["face"] & ~ndimage.binary_dilation(patch > 0.02, iterations=4)
            al_c = match_colours(al_c, B["c"], ring, ring)
            rig = B["c"] * (1 - patch[..., None]) + al_c * patch[..., None]
            save_rgba(os.path.join(OUT, f"paste_{kind}.png"), rig, B["a"])
            if kind == "blink":
                blink_patch = (al_c, patch)
            m["face_mad_info"] = face_metrics(B, al)[0]
        else:
            r2 = locate_head(B, c, a)
            out, oa, _ = paste_head(B, c, a, r2, B["c"])
            save_rgba(os.path.join(OUT, f"paste_{kind}.png"), out, oa)
            # blink twin on the frame's own face: only where the frame's head is the base head moved (same drawing)
            if blink_patch is not None and r2["method"] == "edges" and r2["score"] >= 0.9 and abs(r2["s"] - 1) < 0.03:
                pr, pm = blink_patch
                ox, oy = int(round(r2["dx"])), int(round(r2["dy"]))
                pr, pm = shift(pr, oy, ox), shift(pm, oy, ox)
                ringf = shift(B["face"], oy, ox) & ~ndimage.binary_dilation(pm > 0.02, iterations=4)
                pr = match_colours(pr, c, ringf, ringf)
                save_rgba(os.path.join(OUT, f"{kind}_blink.png"), c * (1 - pm[..., None]) + pr * pm[..., None], a)
                m["blink_twin"] = True
            else:
                m["blink_twin"] = False
        metrics["frames"][kind] = m
        print(kind, json.dumps({k2: m[k2] for k2 in m if k2 != "source"}))
    json.dump(metrics, open(os.path.join(HERE, "metrics_a.json"), "w"), indent=1)


if __name__ == "__main__":
    main()
