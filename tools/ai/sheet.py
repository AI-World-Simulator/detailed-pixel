"""Contact sheet of cut sprites with their numbers, for hand-picking types.
   python sheet.py CUTDIR OUT.png"""
import sys, os
from PIL import Image, ImageDraw, ImageFont

d, out = sys.argv[1], sys.argv[2]
files = sorted(f for f in os.listdir(d) if f.endswith('.png'))
cell = 160
cols = 6
rows = (len(files) + cols - 1) // cols
sheet = Image.new('RGB', (cols * cell, rows * cell), (70, 74, 88))
dr = ImageDraw.Draw(sheet)
try:
    F = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 18)
except Exception:
    F = None
for i, f in enumerate(files):
    im = Image.open(os.path.join(d, f)).convert('RGBA')
    im.thumbnail((cell - 20, cell - 30))
    x, y = (i % cols) * cell, (i // cols) * cell
    sheet.paste(im, (x + (cell - im.width) // 2, y + 26 + (cell - 30 - im.height) // 2), im)
    dr.text((x + 6, y + 4), f[:-4], fill=(255, 230, 120), font=F)
sheet.save(out)
print(len(files), 'sprites')
