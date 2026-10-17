"""Score generated type sheets against their proxies (per-cell IoU after the same alignment block_build.py does, cast shadows
ignored) and print the TYPE=sheet,... arguments for block_build.py: both seeds when both are good, otherwise the better one.
   python block_pick.py ROUND_PREFIX [min_iou]      e.g. ~/ComfyUI/output/exp/blk_clay 0.9"""
import sys, glob, os, json
import numpy as np
import block_build
from block_build import Type

TYPES = ("hip4", "hip6", "gable4", "gable6", "flat4", "flat6")
block_build.ALIGN = True                                   # scoring always searches the best fit
prefix = os.path.expanduser(sys.argv[1]); thr = float(sys.argv[2]) if len(sys.argv) > 2 else 0.9
args, report = [], {}
for i, t in enumerate(TYPES):
    files = sorted(glob.glob(f"{prefix}_{i:02d}_s*_00001_.png"))
    scored = []
    for f in files:
        T = Type(t, f); ious = [c["iou"] for c in T.align]
        scored.append((float(np.mean(ious)), float(np.min(ious)), f))
        report[os.path.basename(f)] = dict(type=t, mean=round(scored[-1][0], 3), worst=round(scored[-1][1], 3), cells=T.align)
    scored.sort(reverse=True)
    good = [f for m, w, f in scored if m >= thr and w >= thr - 0.08] or [scored[0][2]]
    args.append(f"{t}={','.join(good)}")
    print(t, " | ".join(f"{os.path.basename(f)} mean {m:.3f} worst {w:.3f}" for m, w, f in scored), file=sys.stderr)
json.dump(report, open(prefix + "_pick.json", "w"), indent=1)
print(" ".join(args))
