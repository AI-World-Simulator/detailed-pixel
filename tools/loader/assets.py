"""Build the loader sprites from the AI renders in tools/loader/gen/out (made by tools/ai/cgen.py from gen/jobs_*.json).
   ~/ComfyUI/.venv/bin/python tools/loader/assets.py
   1. prop sheets -> anim.py cut -> named sprites in tools/loader/px/props
   2. characters: base pose (split from the lineup) + Qwen edits -> anim.py char -> tools/loader/px/chars/<name>
   3. pack.py -> data/loader/sprites.json (inlined by build.js)
   Names below map the sheet objects (anim.py orders them row by row) to what src/loader.js asks for."""
import json, os, shutil, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
GEN = os.path.join(HERE, "gen")
PX = os.path.join(HERE, "px")
ANIM = os.path.join(ROOT, "tools", "ai", "anim.py")
PY = sys.executable

SHEETS = {  # sheet -> (colors, {object index: name})
    "z_icons": (12, {0: "house", 1: "tree", 2: "coin", 3: "heart", 9: "coffee", 10: "star", 13: "fish", 14: "train"}),
    "z_props_crew": (16, {0: "brush", 1: "shovel", 2: "bucket", 3: "crate", 4: "stones", 5: "gear", 8: "barrow", 12: "cone", 13: "toolbox", 14: "dirt"}),
    "z_props_street": (16, {0: "lamp", 1: "bush", 2: "bench", 3: "flowers", 4: "birch", 5: "oak", 6: "mailbox", 7: "hydrant", 8: "sign", 9: "bin"}),
    "z_scenery": (16, {0: "s_mountain", 1: "s_pine", 2: "s_oak", 3: "s_oak2", 4: "s_hill", 5: "s_house", 6: "s_house2", 7: "s_tower",
                       8: "s_cloud", 9: "s_lighthouse", 11: "s_mill", 12: "s_mill2", 13: "s_boat"}),
}
LOCAL = {"blink": "eyes", "talk": "mouth", "laugh": True}   # face-only edits: only that part of the face comes from the edit
CHARS = {  # name -> (base canvas, frames)
    "woman": ("base/s1_0.png", ["blink", "talk", "laugh", "wave", "paint1", "paint2", "walkA", "walkB"]),
    "builder": ("base/s1_1.png", ["blink", "talk", "laugh", "wave", "shovelUp", "shovelDown", "carry", "walkA", "walkB"]),
    "oldman": ("base/s1_2.png", ["blink", "talk", "laugh", "read", "point"]),
    "boy": ("base/s1_3.png", ["blink", "talk", "laugh", "jump", "crouch", "wave", "walkA", "walkB"]),
}
SKIP = set(os.environ.get("LDR_SKIP", "").split(","))   # frames rejected after review, e.g. LDR_SKIP=boy:crouch


def run(*a):
    r = subprocess.run([PY, ANIM] + list(a), cwd=GEN, capture_output=True, text=True)
    if r.returncode:
        sys.exit(r.stderr)
    return r.stdout.strip()


def props(overrides):
    d = os.path.join(PX, "props")
    shutil.rmtree(d, ignore_errors=True); os.makedirs(d)
    for sheet, (colors, names) in SHEETS.items():
        names = overrides.get(sheet, names)
        src = os.path.join(GEN, "out", sheet + ".png")
        if not names or not os.path.exists(src):
            continue
        cut = os.path.join(GEN, "cut_" + sheet)
        shutil.rmtree(cut, ignore_errors=True)
        print(run("cut", src, cut, "--colors", str(colors)))
        for k, name in names.items():
            p = os.path.join(cut, f"obj{k}.png")
            if os.path.exists(p):
                shutil.copy(p, os.path.join(d, name + ".png"))
            else:
                print("  missing", sheet, k, name)


LINEUP = "out/z_lineup_s1.png"                 # all four were drawn on one canvas: one pixel size for all of them
ISLAND_PERIOD = 9.6                             # ~96x58 art px: fits between the residents in the 168x72 scene
EXTRA = {"island": ("out/z_island_b.png", ["roads", "relief", "smooth", "coast", "sea"])}   # world layers, not a person


def chars():
    d = os.path.join(PX, "chars")
    shutil.rmtree(d, ignore_errors=True); os.makedirs(d)
    period = float(run("grid", os.path.join(GEN, LINEUP)).split()[1].rstrip("px"))
    todo = dict(CHARS)
    if os.path.exists(os.path.join(GEN, EXTRA["island"][0])):
        todo.update(EXTRA)
    for name, (base, frames) in todo.items():
        fr = {}
        for f in frames:
            p = f"out/q_{name}_{f}.png"
            if f"{name}:{f}" in SKIP or not os.path.exists(os.path.join(GEN, p)):
                print("  no frame", name, f); continue
            fr[f] = {"src": p, "local": LOCAL[f]} if f in LOCAL else p
            m = f"out/m_{name}_{f}.png"                  # BiRefNet mask (cgen kind "bgmask") for light objects
            if os.path.exists(os.path.join(GEN, m)):
                fr[f] = {"src": p, "mask": m}
        spec = {"name": name, "colors": 32, "base": base, "frames": fr}
        if name in CHARS:
            spec["period"] = period
        else:                                     # the island: BiRefNet masks (snow has no outline), tone-matched edits
            spec["colors"] = 160                 # small snow cap must not merge into the sand
            spec["period"] = ISLAND_PERIOD
            spec["match_colors"] = True
            if os.path.exists(os.path.join(GEN, f"out/m_{name}_idle.png")):
                spec["base_mask"] = f"out/m_{name}_idle.png"
        sp = os.path.join(GEN, f"spec_{name}.json")
        json.dump(spec, open(sp, "w"), indent=1)
        print(run("char", sp, d))


if __name__ == "__main__":
    over = json.load(open(os.path.join(HERE, "names.json"))) if os.path.exists(os.path.join(HERE, "names.json")) else {}
    over = {k: {int(i): n for i, n in v.items()} for k, v in over.items()}
    props(over)
    chars()
    r = subprocess.run([PY, os.path.join(HERE, "pack.py"), os.path.join(PX, "chars"), os.path.join(PX, "props"),
                        "--out", os.path.join(ROOT, "data", "loader", "sprites.json")], capture_output=True, text=True)
    print(r.stdout.strip() or r.stderr)
