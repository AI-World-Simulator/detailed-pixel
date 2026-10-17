"""Put PixelLab animation clips into the loader sprites as they are (no recolouring, no head pasting:
   the clips' own hair/eye/face motion is the point — docs/character-animation.md).
   ~/ComfyUI/.venv/bin/python tools/loader/cloud/pack_cloud.py [--service pixellab]
   Reads tools/loader/cloud/out/<service>/<char>/<clip>/frame_*.png (64x64, made by compare.py run),
   crops every character's frames to their common box, writes one strip per character into data/loader/sprites.json
   (frame names "<clip>_<k>", plus "clips": {clip: frame count}); props and the island stay as they were.
   Review sheets: tools/loader/px_cloud/_<char>.png (ground line in green). The only changes to the frames: PixelLab's
   effects (sparkles, motion lines, dust) are removed, see drop_effects(), and frames whose effect cannot be separated
   from the body are left out (EXCLUDE)."""
import json, sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(ROOT / "tools" / "loader"))
from pack import png_uri  # noqa: E402

SVC = sys.argv[sys.argv.index("--service") + 1] if "--service" in sys.argv else "pixellab"
CLIPS = {   # loader clip -> source animation folder (first existing wins)
    "idle": ["idle"], "walk": ["walkR"], "talk": ["talk"], "laugh": ["laugh"], "wave": ["waveC", "wave"],
    "crouch": ["crouchC", "crouch"], "paint": ["paint"], "dig": ["dig"], "carry": ["carry"], "cheer": ["cheer"], "read": ["read"],
}
DEBRIS = {"dig", "crouch", "paint"}   # actions whose detached dark bits are part of the action
DROP_FIRST = {"walk"}   # frame 0 is the input pose (front 3/4); in a side-view walk loop it would pop once per cycle
EXCLUDE = {("oldman", "wave"): {1, 2, 3}}   # outlined white smear glued to the hand: not separable, frames dropped
OUTDIR = HERE / "out" / SVC
SPR = ROOT / "data" / "loader" / "sprites.json"
REV = ROOT / "tools" / "loader" / "px_cloud"


def _light(a):
    rgb = a[..., :3].astype(int); mx, mn = rgb.max(-1), rgb.min(-1)
    pale = (mn > 175) & (mx - mn < 60)                                               # white / pale grey
    yel = (rgb[..., 0] > 200) & (rgb[..., 1] > 170) & (rgb[..., 2] < 140)            # yellow sparkle
    return (a[..., 3] > 127) & (pale | yel)


def drop_effects(img, debris=False):
    """PixelLab paints sparkles, motion lines, "zz" and dust around the character even when told not to. Its characters
    are outlined, its effects are not, so:
      1. a light blob (white / pale / yellow) most of whose pixels touch empty space directly is an effect -> removed,
         attached to the body or not (a white smear on a waving hand, a "+" on a helmet);
      2. what is left of such an effect once it is gone (its dark bits, now detached) is removed too;
      3. small detached pieces floating above the ground with any light pixel in them (outlined dust specks, cyan
         sparkles) are removed, and so are loose 1-2 px dots and, unless the action throws things (debris=True: dirt
         off a shovel, a stone put down), any floating piece of up to 10 px.
    Outlined light parts (shirt, eyes, newspaper, sneakers) and dark detached pieces (dirt off a shovel, a stone on the
    ground) stay. Returns (image, pixels removed)."""
    from scipy import ndimage as nd
    a = np.asarray(img).copy(); S8 = np.ones((3, 3))
    al = a[..., 3] > 127
    tr = np.pad(~al, 1, constant_values=True)
    open4 = tr[:-2, 1:-1] | tr[2:, 1:-1] | tr[1:-1, :-2] | tr[1:-1, 2:]
    lab, n = nd.label(_light(a), structure=S8)
    gone = np.zeros_like(al)
    for k in range(1, n + 1):
        m = lab == k; sz = int(m.sum())
        if 2 <= sz <= 240 and (m & open4).sum() > sz / 2:
            gone |= m
    near = nd.binary_dilation(gone, S8)
    al2 = al & ~gone
    lab, n = nd.label(al2, structure=S8)
    if n:
        sizes = nd.sum(al2, lab, range(1, n + 1)); main = 1 + int(np.argmax(sizes))
        ground = int(np.where((lab == main).any(axis=1))[0].max())
        for k in range(1, n + 1):
            if k == main:
                continue
            m = lab == k; sz = int(sizes[k - 1])
            floating = int(np.where(m.any(axis=1))[0].max()) < ground - 3
            lit = (a[..., :3][m].astype(int).mean(-1) > 150).any()       # has a light pixel (dirt and stones do not)
            if sz <= 2 or sz <= 40 and ((m & near).any() or floating and (lit or sz <= 10 and not debris)):
                gone |= m
    a[gone, 3] = 0
    return Image.fromarray(a, "RGBA"), int(gone.sum())


def main():
    sprites = json.load(open(SPR))
    REV.mkdir(exist_ok=True)
    for ch in sorted(p.name for p in OUTDIR.iterdir() if p.is_dir()):
        clips = {}
        for clip, srcs in CLIPS.items():
            for src in srcs:
                fr = sorted((OUTDIR / ch / src).glob("frame_*.png"))
                if fr:
                    skip = EXCLUDE.get((ch, clip), set()) | ({0} if clip in DROP_FIRST and len(fr) > 2 else set())
                    imgs = [drop_effects(Image.open(f).convert("RGBA"), clip in DEBRIS) for k, f in enumerate(fr) if k not in skip]
                    clips[clip] = [im for im, _ in imgs]
                    removed = sum(g for _, g in imgs)
                    if removed:
                        print(f"  {ch}/{clip}: removed {removed} effect pixels")
                    break
        if "idle" not in clips:
            print(f"{ch}: no idle clip, skipped"); continue
        # common crop box over every frame, 1 px margin
        U = np.zeros((64, 64), bool)
        for fr in clips.values():
            for f in fr:
                U |= np.asarray(f)[..., 3] > 127
        ys, xs = np.where(U)
        x0, y0, x1, y1 = max(0, xs.min() - 1), max(0, ys.min() - 1), min(64, xs.max() + 2), min(64, ys.max() + 2)
        w, h = x1 - x0, y1 - y0
        names, cells = [], []
        for clip, fr in clips.items():
            for k, f in enumerate(fr):
                names.append(f"{clip}_{k}"); cells.append(f.crop((x0, y0, x1, y1)))
        strip = Image.new("RGBA", (w * len(cells), h), (0, 0, 0, 0))
        for k, c in enumerate(cells):
            strip.paste(c, (k * w, 0))
        stride = None
        if "walk" in clips:     # step length: spread of the feet at the ground, legs apart minus legs together
            ext = []
            for f in clips["walk"]:
                al = np.asarray(f)[..., 3] > 127
                yb = int(np.where(al.any(axis=1))[0].max()); xs_ = np.where(al[yb - 1:yb + 1].any(axis=0))[0]
                ext.append(int(xs_.max() - xs_.min() + 1) if len(xs_) else 0)
            stride = int(np.clip(max(ext) - min(ext), 6, 16))
        a0 = np.asarray(clips["idle"][0])[..., 3] > 127
        feet = int(np.where(a0.any(axis=1))[0].max() - y0)
        cx = int(np.median(np.where(a0)[1]) - x0)
        sprites["chars"][ch] = {"w": int(w), "h": int(h), "feet": feet, "cx": cx, "frames": names,
                                "clips": {c: len(f) for c, f in clips.items()}, "src": png_uri(strip), "source": SVC}
        if stride:
            sprites["chars"][ch]["stride"] = stride
        # review sheet: one row per clip
        S, n = 4, max(len(f) for f in clips.values())
        sheet = Image.new("RGB", (90 + n * (w * S + 4), len(clips) * (h * S + 4)), (40, 48, 64))
        dr = ImageDraw.Draw(sheet)
        for r, (clip, fr) in enumerate(clips.items()):
            y = r * (h * S + 4)
            dr.text((6, y + 6), f"{clip} ({len(fr)})", fill=(230, 230, 230))
            dr.line([(90, y + (feet + 1) * S), (sheet.width, y + (feet + 1) * S)], fill=(80, 200, 120))
            for k, f in enumerate(fr):
                big = f.crop((x0, y0, x1, y1)).resize((w * S, h * S), Image.NEAREST)
                sheet.paste(big, (90 + k * (w * S + 4), y), big)
        sheet.save(REV / f"_{ch}.png")
        print(f"{ch}: {w}x{h}, stride {stride}, clips " + ", ".join(f"{c}:{len(f)}" for c, f in clips.items()))
    s = json.dumps(sprites, separators=(",", ":"))
    SPR.write_text(s)
    print(f"{SPR.relative_to(ROOT)}: {len(s) / 1024:.1f} KB")


if __name__ == "__main__":
    main()
