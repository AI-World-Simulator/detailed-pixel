"""Angle guide sheets for image models: one building in N exact orientations on one canvas (3x3 by default).
   python angle_sheet.py OUT_DIR [--mode lines|footprint|massing|all] [--camera oblique|iso]
                         [--L 26 --D 16 --H 12 --ridge 4] [--angles 0,30,45,60,90,120,135,150,180]
   Angle = rotation of the building; 0 = front facade (with the door) facing the viewer, 90 = front facing left, 180 = back.
   oblique: the engine's 3/4 view (ground not foreshortened, heights x K); iso: orthographic camera pitched down by --pitch.
   Every view uses the same scale, so sizes are comparable across cells."""
import argparse, math, os
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ap = argparse.ArgumentParser()
ap.add_argument("out"); ap.add_argument("--mode", default="all"); ap.add_argument("--camera", default="oblique")
ap.add_argument("--K", type=float, default=0.6); ap.add_argument("--pitch", type=float, default=30.0)
ap.add_argument("--L", type=float, default=26.0); ap.add_argument("--D", type=float, default=16.0)
ap.add_argument("--H", type=float, default=12.0); ap.add_argument("--ridge", type=float, default=4.0)
ap.add_argument("--angles", default="0,30,45,60,90,120,135,150,180"); ap.add_argument("--cell", type=int, default=512)
A = ap.parse_args()
os.makedirs(A.out, exist_ok=True)
ANG = [float(a) for a in A.angles.split(",")]
COLS = 3; ROWS = (len(ANG) + COLS - 1) // COLS; CELL = A.cell; LABEL = 64
FONT = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 40)
LIGHT = np.array([-0.5, 0.4, 0.75]); LIGHT /= np.linalg.norm(LIGHT)
if A.camera == "oblique":
    proj = lambda p: (p[0], p[1] - A.K * p[2])
else:
    sp, cp = math.sin(math.radians(A.pitch)), math.cos(math.radians(A.pitch))
    proj = lambda p: (p[0], p[1] * sp - p[2] * cp)

def geometry(deg):
    t = math.radians(deg)
    f = np.array([-math.sin(t), math.cos(t), 0.0])    # front normal: 0 deg -> towards the viewer (south), 90 -> left (west)
    u = np.array([math.cos(t), math.sin(t), 0.0])     # long axis
    c = np.zeros(3); L, D, H = A.L, A.D, A.H
    # corners: 0-1 front edge, 2-3 back edge
    k = [c - L/2*u + D/2*f, c + L/2*u + D/2*f, c + L/2*u - D/2*f, c - L/2*u - D/2*f]
    return f, u, c, k

def lam(n):
    n = n / np.linalg.norm(n); return 0.35 + 0.6 * max(0.0, float(n @ LIGHT))

# common scale: the largest view (massing with roof) must fit every cell
pts = []
for a in ANG:
    f, u, c, k = geometry(a)
    for p in k:
        pts += [proj(p), proj(np.array([p[0], p[1], A.H + A.ridge]))]
pts = np.array(pts); span = max(pts[:, 0].max() - pts[:, 0].min(), pts[:, 1].max() - pts[:, 1].min())
S = (CELL * 0.78) / span

def draw_cell(d, ox, oy, deg, mode):
    f, u, c, k = geometry(deg); T = lambda p, z: np.array([p[0], p[1], z])
    # centre the building's bounding box (with roof) in the cell
    bb = np.array([proj(T(p, z)) for p in k for z in (0, A.H + A.ridge)])
    mx, my = (bb[:, 0].min() + bb[:, 0].max()) / 2, (bb[:, 1].min() + bb[:, 1].max()) / 2
    P = lambda p: (ox + CELL / 2 + S * (proj(p)[0] - mx), oy + CELL / 2 + S * (proj(p)[1] - my))
    INK, FRONT = (30, 30, 30), (210, 40, 40)
    def arrow(p0, p1, col, w):
        a, b = np.array(P(p0)), np.array(P(p1)); d.line([tuple(a), tuple(b)], fill=col, width=w)
        v = (b - a) / max(1e-6, np.linalg.norm(b - a)); n = np.array([-v[1], v[0]])
        d.polygon([tuple(b), tuple(b - 22 * v + 11 * n), tuple(b - 22 * v - 11 * n)], fill=col)
    if mode == "lines":   # long axis on the ground + an arrow out of the front facade
        d.line([P(c - A.L/2*u), P(c + A.L/2*u)], fill=INK, width=8)
        arrow(c, c + (A.D/2 + 4) * f, FRONT, 6)
        return
    if mode == "footprint":
        d.polygon([P(p) for p in k], outline=INK, width=4, fill=(232, 232, 232))
        d.line([P(k[0]), P(k[1])], fill=FRONT, width=9)
        arrow(c + A.D/2 * f, c + (A.D/2 + 6) * f, FRONT, 6)
        return
    # massing: visible walls (facing the viewer), hip roof, the door on the front wall
    walls = []
    for i in range(4):
        a, b = k[i], k[(i + 1) % 4]; e = b - a; m = np.array([e[1], -e[0], 0.0]); m /= np.linalg.norm(m)
        if m @ (a + b - 2 * c) < 0: m = -m
        if m[1] > 0.02: walls.append((float((a[1] + b[1]) / 2), i, a, b, m))
    walls.sort()
    ground = [P(p) for p in k]; d.polygon(ground, fill=(225, 225, 225))
    arrow(c + A.D/2 * f, c + (A.D/2 + 6) * f, FRONT, 6)
    for _, i, a, b, m in walls:
        g = int(255 * lam(m)); q = [P(T(a, 0)), P(T(b, 0)), P(T(b, A.H)), P(T(a, A.H))]
        d.polygon(q, fill=(g, g, g), outline=INK, width=3)
        if i == 0:   # front wall: door in the middle
            mid = (a + b) / 2; e = (b - a) / np.linalg.norm(b - a)
            dq = [P(T(mid - 1.2 * e, 0)), P(T(mid + 1.2 * e, 0)), P(T(mid + 1.2 * e, 3.2)), P(T(mid - 1.2 * e, 3.2))]
            d.polygon(dq, fill=FRONT, outline=INK, width=2)
    top = [T(p, A.H) for p in k]
    r0, r1 = T(c - (A.L/2 - A.D/2) * u, A.H + A.ridge), T(c + (A.L/2 - A.D/2) * u, A.H + A.ridge)
    faces = [[top[0], top[1], r1, r0], [top[2], top[3], r0, r1], [top[1], top[2], r1], [top[3], top[0], r0]]
    def nrm(fc):
        n = np.cross(fc[1] - fc[0], fc[2] - fc[0]); return n if n[2] > 0 else -n
    faces.sort(key=lambda fc: float(np.mean([p[1] for p in fc])))
    for fc in faces:
        g = int(235 * lam(nrm(fc))); d.polygon([P(p) for p in fc], fill=(g, g - 8, g - 14), outline=INK, width=3)

modes = ["lines", "footprint", "massing"] if A.mode == "all" else [A.mode]
for mode in modes:
    img = Image.new("RGB", (COLS * CELL, ROWS * (CELL + LABEL)), (250, 250, 250)); d = ImageDraw.Draw(img)
    for i, deg in enumerate(ANG):
        ox, oy = (i % COLS) * CELL, (i // COLS) * (CELL + LABEL)
        draw_cell(d, ox, oy, deg, mode)
        lab = f"{deg:g}°"; w = d.textlength(lab, font=FONT)
        d.text((ox + CELL / 2 - w / 2, oy + CELL + 6), lab, fill=(20, 20, 20), font=FONT)
    for x in range(1, COLS): d.line([(x * CELL, 0), (x * CELL, img.height)], fill=(215, 215, 215), width=2)
    for y in range(1, ROWS): d.line([(0, y * (CELL + LABEL)), (img.width, y * (CELL + LABEL))], fill=(215, 215, 215), width=2)
    path = os.path.join(A.out, f"angles_{mode}_{A.camera}.png"); img.save(path); print(path)
