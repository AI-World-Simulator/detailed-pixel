"""Pack loader sprites into data/loader/sprites.json (inlined into the page by build.js).
   python tools/loader/pack.py PXDIR [PXDIR ...] [--out data/loader/sprites.json]
   PXDIR holds character folders made by `anim.py char` (<name>/meta.json + one PNG per frame) and/or
   prop sprites made by `anim.py cut` (<name>.png + cut.json). Characters become one horizontal strip
   (frames in meta order), props one image each; every PNG is palette-indexed and inlined as a data URI."""
import base64, io, json, os, sys
from PIL import Image


def png_uri(im):
    im = im.convert("RGBA")
    a = im.getchannel("A")
    q = im.convert("RGB").quantize(colors=255, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    t = max(i for _, i in q.getcolors(256)) + 1              # first index after the used ones = transparent; palette stays short
    pal = q.getpalette()[:3 * t]
    q.putpalette(pal + [0, 0, 0])
    px = q.load(); al = a.load()
    for y in range(im.height):
        for x in range(im.width):
            if al[x, y] < 128:
                px[x, y] = t
    b = io.BytesIO()
    q.save(b, "PNG", optimize=True, transparency=t)
    return "data:image/png;base64," + base64.b64encode(b.getvalue()).decode()


def main():
    args = sys.argv[1:]
    out = "data/loader/sprites.json"
    if "--out" in args:
        i = args.index("--out"); out = args[i + 1]; del args[i:i + 2]
    res = {"chars": {}, "props": {}}
    for d in args:
        for name in sorted(os.listdir(d)):
            p = os.path.join(d, name)
            if os.path.isdir(p) and os.path.exists(os.path.join(p, "meta.json")):
                m = json.load(open(os.path.join(p, "meta.json")))
                frames = [Image.open(os.path.join(p, f + ".png")).convert("RGBA") for f in m["frames"]]
                strip = Image.new("RGBA", (m["w"] * len(frames), m["h"]), (0, 0, 0, 0))
                for k, f in enumerate(frames):
                    strip.paste(f, (k * m["w"], 0))
                res["chars"][m["name"]] = {"w": m["w"], "h": m["h"], "feet": m["feet"], "cx": m.get("cx", m["w"] // 2), "frames": m["frames"], "src": png_uri(strip)}
            elif name.endswith(".png") and not name.startswith("_"):
                im = Image.open(p).convert("RGBA")
                res["props"][name[:-4]] = {"w": im.width, "h": im.height, "src": png_uri(im)}
    os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
    s = json.dumps(res, separators=(",", ":"))
    open(out, "w").write(s)
    print(f"{out}: {len(res['chars'])} characters, {len(res['props'])} props, {len(s) / 1024:.1f} KB")


if __name__ == "__main__":
    main()
