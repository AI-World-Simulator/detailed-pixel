"""Approach B: cut-out puppet from ONE drawing (the base), parts derived automatically from Qwen edits + BiRefNet + geometry.
   ~/ComfyUI/.venv/bin/python tools/illus/puppet.py     (after frames.py; writes raw/b/*.png full-canvas parts + raw/b/parts.json)
   Parts:
     body/neck base without the near arm and without the head, split at the collar (neck under the head, body over it);
               the area hidden behind the arm comes from the 'noarm' edit; the neck is extended 40 px up under the chin
               (so a tilted/raised head never opens a gap)
     head      base above the collar (hair, face, neck), no feathering: the body's collar covers its lower edge
     arm       near arm of the base (base vs 'noarm' difference), pivot at the shoulder
     arm_up    raised arm (static: upper arm + cuff) from the processed wave frame (raw/a/wave.png) minus the body
     forearm   forearm + hand of the raised arm (skin-coloured part), pivot at the elbow; it waves under the cuff
     eyes      closed-eyes patch (raw/a/paste_blink.png: base + the feathered eye area of the blink edit)
     mouth     open-mouth patch (raw/a/paste_talk.png)"""
import json, os
import numpy as np
from scipy import ndimage
from common import load_rgb, load_mask, load_rgba, save_rgba, bg_color, decontaminate, clean_alpha, bbox, shift, \
    register_head, feather, over
from frames import base_setup, RAW

OUT = os.path.join(RAW, "b")
NOARM = "q_noarm_206"


def largest(m):
    lab, n = ndimage.label(m)
    if n == 0:
        return m
    sizes = ndimage.sum(np.ones(m.shape), lab, range(1, n + 1))
    return lab == (int(np.argmax(sizes)) + 1)


def main(noarm=NOARM):
    os.makedirs(OUT, exist_ok=True)
    B = base_setup()
    a0, c0, neck = B["a"], B["c"], B["neck"]
    H, W = a0.shape
    # --- noarm edit aligned to the base by the head (the edit may drift a few px)
    rgb = load_rgb(os.path.join(RAW, "q", noarm + ".png"))
    na = clean_alpha(load_mask(os.path.join(RAW, "m", "m_" + noarm + ".png")))
    reg = register_head(B["rgb"], B["head_box"], rgb)
    dy, dx = -int(round(reg["dy"])), -int(round(reg["dx"]))
    nrgb, na = shift(rgb, dy, dx), shift(na, dy, dx)
    nc = decontaminate(nrgb, na, bg_color(rgb))
    # --- arm = base pixels that are gone or recoloured in the noarm edit, below the neck, on the near-arm side
    neck_cols = np.where(a0[neck] > 0.5)[0]
    nx = int(neck_cols.mean())
    gone = (a0 > 0.5) & (na < 0.5)
    recol = (a0 > 0.5) & (na > 0.5) & (np.abs(B["rgb"] - nrgb).max(2) > 0.22)
    side = np.zeros_like(gone)
    side[neck + 10:, nx + 20:] = True
    arm = ndimage.binary_opening((gone | recol) & side, iterations=2)
    arm = largest(arm)
    arm = ndimage.binary_closing(arm, iterations=6)
    arm = ndimage.binary_fill_holes(arm)
    arm_a = np.minimum(feather(arm, 2.0), a0) * (arm | ndimage.binary_dilation(arm, iterations=2))
    ax0, ay0, ax1, ay1 = bbox(arm_a)
    # shoulder pivot: centre of the top 40 px of the arm, a little below its top edge
    top = arm[ay0:ay0 + 40]
    ys, xs = np.where(top)
    shoulder = (float(xs.mean()), float(ay0 + 18))
    # --- body: base outside the arm; inside the (grown) arm area the noarm edit shows what is behind the arm
    grow = feather(ndimage.binary_dilation(arm, iterations=8), 4.0)
    body_rgb = c0 * (1 - grow[..., None]) + nc * grow[..., None]
    body_a = a0 * (1 - grow) + na * grow
    # remove the head; keep a neck that goes on under the chin (copy of the neck rows, stretched up 40 px)
    body_a[:neck] = 0
    cols = np.where(a0[neck] > 0.5)[0]
    n0, n1 = cols.min() + 2, cols.max() - 1
    for y in range(neck - 40, neck):
        body_a[y, n0:n1] = 1.0
        body_rgb[y, n0:n1] = c0[neck + 2, n0:n1]
    # --- raised arm from the processed wave frame: everything outside the body silhouette on the arm side, above the waist
    wr, wa = load_rgba(os.path.join(RAW, "a", "wave.png"))
    body_m = (body_a > 0.5) | (B["head_a"] > 0.5)
    up = (wa > 0.5) & ~body_m
    side_up = np.zeros_like(up)
    side_up[:neck + 220, nx + 30:] = True
    up = largest(ndimage.binary_opening(up & side_up, iterations=2))
    up = ndimage.binary_fill_holes(ndimage.binary_closing(up, iterations=3))
    # overlap the body by a few px (wave-frame pixels), so the anti-aliased body edge never shows as a light seam
    up = ndimage.binary_dilation(up, iterations=5) & (wa > 0.5) & ~(B["head_a"] > 0.5)
    up_a = np.minimum(feather(up, 2.0), wa)
    ux0, uy0, ux1, uy1 = bbox(up_a)
    ys, xs = np.where(up[uy1 - 50:uy1])
    shoulder_up = (float(xs.mean()), float(uy1 - 25))
    # forearm + hand of the raised arm: the skin-coloured component at the top of it (skin colour sampled on the face);
    # it waves around the elbow (the cuff), drawn UNDER the static sleeve so the joint stays covered
    fc = c0[B["face"]]
    skin = np.median(fc[(fc.mean(1) > 0.65) & (fc[:, 0] > fc[:, 1]) & (fc[:, 1] > fc[:, 2])], 0)  # light warm face pixels
    sk = up & (np.abs(wr - skin).max(2) < 0.16)
    sk = largest(ndimage.binary_opening(sk, iterations=2))
    fy0, fy1 = np.where(sk.any(1))[0][[0, -1]]
    bx = np.where(sk[fy1 - 6:fy1 + 1].any(0))[0]
    elbow = (float(bx.mean()), float(fy1 - 10))
    fore = ndimage.binary_dilation(sk, iterations=4) & up
    fore[int(elbow[1]) + 14:] = False                       # a little of the forearm stays inside the cuff
    fore_a = np.minimum(feather(fore, 1.5), wa) * ndimage.binary_dilation(fore, iterations=2)
    static = up & ~(fore & (np.arange(H)[:, None] < elbow[1]))
    static_a = np.minimum(feather(static, 2.0), wa) * ndimage.binary_dilation(static, iterations=2)
    # --- face patches: where the processed blink/talk frames differ from the base
    patches = {}
    for k, name in (("eyes", "blink"), ("mouth", "talk")):
        pr, pa = load_rgba(os.path.join(RAW, "a", "paste_" + name + ".png"))  # base + only the eye/mouth area
        d = np.abs(pr - c0).max(2)
        m = ndimage.binary_dilation(d > 0.02, iterations=3) & (B["head_a"] > 0.9)
        save_rgba(os.path.join(OUT, k + ".png"), pr, feather(m, 2.0) * (B["head_a"] > 0.9))
        patches[k] = bbox(m.astype(np.float32))
    # layer order in the puppet: neck (under) -> head -> body from the collar down (over), so the collar covers the
    # bottom of the head's neck and a tilting head never shows a cut
    collar = B["collar"]
    neck_a = body_a.copy(); neck_a[collar + 2:] = 0
    torso_a = body_a.copy(); torso_a[:collar] = 0
    save_rgba(os.path.join(OUT, "neck.png"), body_rgb, neck_a)
    save_rgba(os.path.join(OUT, "body.png"), body_rgb, torso_a)
    save_rgba(os.path.join(OUT, "head.png"), c0, B["head_a"])
    save_rgba(os.path.join(OUT, "arm.png"), c0, arm_a)
    save_rgba(os.path.join(OUT, "arm_up.png"), wr, static_a)
    save_rgba(os.path.join(OUT, "forearm.png"), wr, fore_a)
    # sanity: re-assembled puppet vs base
    r, a = over(body_rgb, neck_a, c0, B["head_a"])
    r, a = over(r, a, body_rgb, torso_a)
    r, a = over(r, a, c0, arm_a)
    save_rgba(os.path.join(OUT, "assembled.png"), r, a)
    err = np.abs(r - c0).max(2)[(a0 > 0.5)]
    parts = dict(neck=[float(nx), float(neck)], shoulder=shoulder, shoulder_up=shoulder_up, elbow=elbow, foot=B["foot"],
                 noarm_head_reg=reg, arm_bbox=[ax0, ay0, ax1, ay1], arm_up_bbox=[ux0, uy0, ux1, uy1], patches=patches,
                 reassembly_mad=round(float(err.mean() * 255), 2), reassembly_bad_pct=round(float((err > 0.1).mean() * 100), 2),
                 silhouette_diff_px=int(((a > 0.5) != (a0 > 0.5)).sum()))
    json.dump(parts, open(os.path.join(OUT, "parts.json"), "w"), indent=1)
    print(json.dumps(parts, indent=1))


if __name__ == "__main__":
    import sys
    main(*sys.argv[1:])
