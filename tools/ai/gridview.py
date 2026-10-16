"""Preview with a coordinate grid (every 50 source px, labelled every 100) for hand-annotating facades.
   python gridview.py IN.png OUT.png [scale=0.75]"""
import sys
from PIL import Image, ImageDraw, ImageFont
src, out = sys.argv[1], sys.argv[2]
sc = float(sys.argv[3]) if len(sys.argv) > 3 else 0.75
im = Image.open(src).convert('RGB'); W, H = im.size
im = im.resize((int(W * sc), int(H * sc)))
d = ImageDraw.Draw(im); F = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 13)
for x in range(0, W, 50):
    d.line([(x * sc, 0), (x * sc, H * sc)], fill=(255, 0, 255) if x % 100 == 0 else (255, 160, 255), width=1)
    if x % 100 == 0: d.text((x * sc + 2, 2), str(x), fill=(200, 0, 200), font=F)
for y in range(0, H, 50):
    d.line([(0, y * sc), (W * sc, y * sc)], fill=(0, 160, 255) if y % 100 == 0 else (150, 210, 255), width=1)
    if y % 100 == 0: d.text((2, y * sc + 2), str(y), fill=(0, 100, 200), font=F)
im.save(out)
