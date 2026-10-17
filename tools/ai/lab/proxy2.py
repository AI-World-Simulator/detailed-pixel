"""Massing proxy of one building in the 3/4 oblique view, in several renderings for ControlNet / img2img experiments.
   python proxy2.py OUT_DIR ANGLE [roof: hip|gable|flat]
   writes p{A}_{kind}.png: gray (shaded grey), color (shaded colours), lines (silhouette + face edges), linesw (+ windows),
   depth (near = bright), mask (building), faces (face id map: 1 front wall, 2 side wall, 10+ roof faces)
   World: x east, y south, z up (m). Screen: sx = CX + S*x, sy = CY + S*(y - K*z). Light from the front-left, high."""
import sys, math, os
import numpy as np
from PIL import Image, ImageDraw

out_dir, ang = sys.argv[1], float(sys.argv[2])
roof = sys.argv[3] if len(sys.argv) > 3 else "hip"
cam = sys.argv[4] if len(sys.argv) > 4 else "oblique"      # oblique (engine 3/4 view) | iso (orthographic, 30 deg down)
tall = len(sys.argv) > 5 and sys.argv[5] == "tall"          # 19th-century windows: 1.0 x 1.8 m instead of 1.3 x 1.4 m
W = H_IMG = 1024
PITCH = float(os.environ.get("PPITCH", 30))   # orthographic camera pitch below the horizon (iso camera only)
PS, PC = math.sin(math.radians(PITCH)), math.cos(math.radians(PITCH))
# building dimensions (metres); env overrides make per-building proxies: PL (front width), PD (depth), PFL floors, PFH floor height,
# PRIDGE roof rise, PAXIS ridge direction: u = along the front, n = front gable (ridge runs away from the street), PTAG output tag
L, D = float(os.environ.get("PL", 34)), float(os.environ.get("PD", 13))
FLOORS, FH, RIDGE = int(os.environ.get("PFL", 5)), float(os.environ.get("PFH", 3.1)), float(os.environ.get("PRIDGE", 4.0))
AXIS = os.environ.get("PAXIS", "u")
H = FLOORS * FH
if cam == "oblique":
    S, K, CX, CY = 18.0, 0.6, 512, 640
elif "PL" in os.environ or "PD" in os.environ:   # custom building: fit the frame, same scale for every angle
    ext = L + D; S = min(0.74 * W / ext, 0.74 * H_IMG / (ext * PS + (H + RIDGE) * PC)); K = 0.0
    CX, CY = 512, 512 + S * (H + RIDGE) * PC / 2
else:
    S, K, CX, CY = 22.0, 0.0, 512, 560
LIGHT = np.array([float(v) for v in os.environ.get("PLIGHT", "-0.5,0.4,0.75").split(",")]); LIGHT /= np.linalg.norm(LIGHT)
NEAR = np.array([0.0, K, 1.0]) / math.hypot(K, 1.0) if cam == "oblique" else np.array([0.0, PC, PS])  # towards the viewer

t = math.radians(ang)
# angle convention as in tools/ai/angle_sheet.py: 0 = front (door) faces the viewer, growing angle turns the front to the left
u = np.array([math.cos(t), math.sin(t), 0.0]); n = np.array([-math.sin(t), math.cos(t), 0.0])
c = np.zeros(3)
corners = [c - L/2*u - D/2*n, c + L/2*u - D/2*n, c + L/2*u + D/2*n, c - L/2*u + D/2*n]
T = lambda p, z: np.array([p[0], p[1], z])
P = (lambda p: (CX + S * p[0], CY + S * (p[1] - K * p[2]))) if cam == "oblique" else (lambda p: (CX + S * p[0], CY + S * (p[1] * PS - p[2] * PC)))

def lam(normal):
    nn = normal / np.linalg.norm(normal); return min(1.0, 0.32 + 0.68 * max(0.0, float(nn @ LIGHT)))

# faces: (world polygon, kind, id, normal, holes=[(polygon, kind)])
faces = []
walls = []
for i in range(4):
    a, b = corners[i], corners[(i + 1) % 4]
    e = b - a; m = np.array([e[1], -e[0], 0.0]); m /= np.linalg.norm(m)
    if m @ (a + b - 2 * c) < 0: m = -m
    if m[1] > 0.02: walls.append((float((a[1] + b[1]) / 2), a, b, m))
walls.sort(key=lambda w: w[0])
long_wall = max(walls, key=lambda w: np.linalg.norm(w[2] - w[1]))
for _, a, b, m in walls:
    fid = 1 if long_wall[1] is a else 2
    length = float(np.linalg.norm(b - a)); e = (b - a) / length
    nb = max(1, round(length / 3.3)); bw = length / nb
    holes = []
    for f in range(FLOORS):
        for k in range(nb):
            u0, u1 = (k * bw + 0.35 * bw, k * bw + 0.65 * bw) if tall else (k * bw + 0.3 * bw, k * bw + 0.7 * bw)
            z0, z1 = (f * FH + 0.7, f * FH + 2.5) if tall else (f * FH + 0.9, f * FH + 2.3); kind = "win"
            if f == 0 and k == int(os.environ.get("PDOOR", nb // 2)) and float(m @ n) > 0.9: z0, kind = 0.0, "door"   # door only on the real front wall (PDOOR = bay index)
            p0, p1 = a + e * u0, a + e * u1
            holes.append(([T(p0, z0), T(p1, z0), T(p1, z1), T(p0, z1)], kind))
    faces.append(([T(a, 0), T(b, 0), T(b, H), T(a, H)], "wall", fid, m, holes))

C4 = [T(p, H) for p in corners]
if roof == "flat":
    rf = [(C4, np.array([0, 0, 1.0]))]
else:
    if AXIS == "u":
        A, la, B, lb = u, L / 2, n, D / 2
        sideB = ([C4[2], C4[3]], [C4[0], C4[1]])            # long eaves on the +n / -n sides
        endA = ([C4[1], C4[2]], [C4[3], C4[0]])             # gable / hip ends at +u / -u
    else:
        A, la, B, lb = n, D / 2, u, L / 2
        sideB = ([C4[1], C4[2]], [C4[3], C4[0]])            # eaves on the +u / -u sides
        endA = ([C4[2], C4[3]], [C4[0], C4[1]])             # ends at +n (front) / -n (back)
    rr = max(0.0, la - lb) if roof == "hip" else la
    rp, rm = T(c + rr * A, H + RIDGE), T(c - rr * A, H + RIDGE)
    def toward(pt, vec): return float((pt - c) @ vec)
    def ridge_near(e2): return rp if toward(e2[0], A) + toward(e2[1], A) > 0 else rm
    polys = []
    for e2 in sideB:     # slopes: eave edge + the two ridge ends, ordered along the eave
        a0, a1 = e2; polys.append([a0, a1, rp if toward(a1, A) > 0 else rm, rp if toward(a0, A) > 0 else rm])
    for e2 in endA:
        tri = [e2[0], e2[1], ridge_near(e2)]
        if roof == "hip": polys.append(tri)
        else:            # gable end: vertical wall triangle
            nrm = np.cross(tri[1] - tri[0], tri[2] - tri[0]); nrm = nrm if nrm[1] > 0 else -nrm
            if nrm[1] > 0.02: faces.append((tri, "wall", 2, nrm, []))
    rf = []
    for p in polys:
        nrm = np.cross(p[1] - p[0], p[2] - p[0]); rf.append((p, nrm if nrm[2] > 0 else -nrm))
rf.sort(key=lambda f: float(np.mean([q[1] for q in f[0]])))
for k, (p, nrm) in enumerate(rf):
    faces.append((p, "roof", 10 + k, nrm, []))

# --- rasterise (painter's order: walls north-first, then roof faces north-first) ---
hexrgb = lambda v: np.array([int(v[i:i + 2], 16) for i in (0, 2, 4)])    # PWALL / PROOF env: facade / roof colour as hex, e.g. e2bf78
COL = {"wall": hexrgb(os.environ["PWALL"]) if "PWALL" in os.environ else np.array([226, 206, 168]),
       "roof": hexrgb(os.environ["PROOF"]) if "PROOF" in os.environ else np.array([176, 84, 58]) if roof != "flat" else np.array([150, 150, 146]),
       "win": np.array([52, 62, 78]), "door": np.array([96, 62, 40])}
gray = Image.new("L", (W, H_IMG), 128); color = Image.new("RGB", (W, H_IMG), (196, 196, 196))
lines = Image.new("L", (W, H_IMG), 0); linesw = Image.new("L", (W, H_IMG), 0)
mask = Image.new("L", (W, H_IMG), 0); fmap = Image.new("L", (W, H_IMG), 0)
ys, xs = np.mgrid[0:H_IMG, 0:W].astype(np.float32)
# ground nearness (z = 0): y = (sy - CY)/S
depth = (K * ((ys + 0.5 - CY) / S)) / math.hypot(K, 1.0) if cam == "oblique" else PC * ((ys + 0.5 - CY) / S / PS)
dg, dc, dl, dlw, dm, df = (ImageDraw.Draw(x) for x in (gray, color, lines, linesw, mask, fmap))
umap = np.zeros((H_IMG, W), np.float32)   # u (metres along the front facade, 0 = centre) of the visible surface; NaN-free, mask says where
LW = 3

def plane_nearness(poly3):
    """nearness as an affine function of screen coords, from three vertices of a planar face"""
    A = np.array([[P(p)[0], P(p)[1], 1.0] for p in poly3[:3]]); bvec = np.array([float(NEAR @ p) for p in poly3[:3]])
    return np.linalg.solve(A, bvec)

for poly, kind, fid, nrm, holes in faces:
    q = [P(p) for p in poly]; sh = lam(nrm)
    g = int(255 * sh); col = tuple(int(v) for v in np.clip(COL[kind] * (0.45 + 0.75 * sh), 0, 255))
    dg.polygon(q, fill=g); dc.polygon(q, fill=col); dm.polygon(q, fill=255); df.polygon(q, fill=fid)
    for img in (dl, dlw): img.polygon(q, fill=0); img.line(q + [q[0]], fill=255, width=LW)
    m = Image.new("L", (W, H_IMG), 0); ImageDraw.Draw(m).polygon(q, fill=1); mm = np.array(m, dtype=bool)
    a_, b_, c_ = plane_nearness(poly); depth[mm] = (a_ * (xs + 0.5) + b_ * (ys + 0.5) + c_)[mm]
    Au = np.array([[P(p)[0], P(p)[1], 1.0] for p in poly[:3]]); cu = np.linalg.solve(Au, np.array([float(u @ p) for p in poly[:3]]))
    umap[mm] = (cu[0] * (xs + 0.5) + cu[1] * (ys + 0.5) + cu[2])[mm]
    for hp, hk in holes:
        hq = [P(p) for p in hp]
        dg.polygon(hq, fill=int(g * 0.35)); dc.polygon(hq, fill=tuple(int(v) for v in COL[hk] * (0.6 + 0.4 * sh)))
        dlw.line(hq + [hq[0]], fill=255, width=2)
    if kind == "wall":   # cornice band
        a, b = poly[0], poly[1]
        band = [P(T(a, H - 0.5)), P(T(b, H - 0.5)), P(T(b, H)), P(T(a, H))]
        dg.polygon(band, fill=min(255, g + 30)); dc.polygon(band, fill=tuple(int(min(255, v * 1.12)) for v in col))

d = depth - depth.min(); d = (255 * d / d.max()).astype(np.uint8)
tag = f"p{int(ang)}{'' if roof == 'hip' else '_' + roof}{'' if cam == 'oblique' else '_iso'}{'_t' if tall else ''}{os.environ.get('PTAG', '')}"
gray.convert("RGB").save(f"{out_dir}/{tag}_gray.png"); color.save(f"{out_dir}/{tag}_color.png")
# colour proxy with grain: noise in the img2img source lets the model invent texture instead of copying flat fills
rng = np.random.default_rng(int(ang * 10) & 0xffff)
cn = np.asarray(color).astype(np.float32); mk = np.asarray(mask)[..., None] > 0
grain = rng.normal(0, 14, cn.shape[:2])[..., None] + rng.normal(0, 6, cn.shape)
Image.fromarray(np.clip(cn + grain * mk, 0, 255).astype(np.uint8)).save(f"{out_dir}/{tag}_colorn.png")
lines.convert("RGB").save(f"{out_dir}/{tag}_lines.png"); linesw.convert("RGB").save(f"{out_dir}/{tag}_linesw.png")
Image.fromarray(d).convert("RGB").save(f"{out_dir}/{tag}_depth.png")
mask.save(f"{out_dir}/{tag}_mask.png"); fmap.save(f"{out_dir}/{tag}_faces.png")
Image.fromarray(np.clip((umap + 300) * 100, 0, 65535).astype(np.uint16)).save(f"{out_dir}/{tag}_umap.png")   # u = v/100 - 300 m
import json   # projection of this proxy: screen = (CX + S*x, CY + S*(y*PS - z*PC)) for the iso camera
json.dump(dict(S=S, CX=CX, CY=CY, K=K, PS=PS, PC=PC, pitch=PITCH, angle=ang, L=L, D=D, H=H, ridge=RIDGE, roof=roof, cam=cam), open(f"{out_dir}/{tag}_meta.json", "w"))
print(tag)
