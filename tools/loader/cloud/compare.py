"""Side-by-side comparison of our local loader frames with two cloud pixel-art animation services.
   API notes: research_notes/cloud_sprite_apis.md. Keys live OUTSIDE the repo in ~/.config/detailed-pixel/cloud.env:
       PIXELLAB_SECRET=...        (https://pixellab.ai/account)
       RD_API_KEY=rdpk-...        (https://www.retrodiffusion.ai/app/devtools)
   ~/ComfyUI/.venv/bin/python tools/loader/cloud/compare.py prep            pad our idle sprites to 64x64 (no network)
   ~/ComfyUI/.venv/bin/python tools/loader/cloud/compare.py plan            what would be sent + free cost checks
   ~/ComfyUI/.venv/bin/python tools/loader/cloud/compare.py run --service pixellab|rd [--chars boy,woman] [--anims walk] --yes
   ~/ComfyUI/.venv/bin/python tools/loader/cloud/compare.py report          sheets + metrics -> tools/loader/cloud/report/
   ~/ComfyUI/.venv/bin/python tools/loader/cloud/compare.py page            animated side-by-side page -> tools/loader/cloud/compare.html
   Paid calls happen only with --yes. Every paid call is journalled (journal.jsonl: job/task ids, idempotency keys)
   and skipped on re-runs when its output exists, so nothing is bought twice by accident."""
import base64, io, json, os, sys, time, uuid
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageSequence

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(ROOT / "tools" / "ai"))
import anim  # noqa: E402  (our post-processing: palette, ground line, head paste)

CHARS = ["woman", "builder", "oldman", "boy"]
CANVAS, FOOT = 64, 4
ANIMS = {   # what each service is asked for; our own frames to compare against
    "walk": {"ours": ["walkA", "idle", "walkB", "idle"], "pl": "walking in place toward the viewer, small steps, arms swinging",
             "rd_style": "rd_advanced_animation__walking", "rd": "small bouncy steps in place", "frames": 8},
    "crouch": {"ours": ["idle", "crouch", "crouch", "idle"], "pl": "crouches down, places a small grey stone on the ground, stands back up",
               "rd_style": "rd_advanced_animation__custom_action", "rd": "crouches down and places a small grey stone on the ground, then stands up", "frames": 8},
    "wave": {"ours": ["idle", "wave", "idle", "wave"], "pl": "waves hello with the right hand, body still",
             "rd_style": "rd_advanced_animation__custom_action", "rd": "waves hello with the right hand, body still", "frames": 6},
}
# loader clips (PixelLab only, loader=True): not part of the side-by-side report
CLEAN = (" Clean character animation only: no visual effects, no particles, no sparkles, no motion lines, no smears,"
         " no extra objects unless mentioned; the character stays fully on the canvas.")
LOADER = {
    "idle": ("standing idle in place: gentle breathing, blinks once, hair sways a little", 8, ["woman", "builder", "oldman", "boy"]),
    "walkR": ("walks to the right in place, side view facing right, natural stride, arms swinging", 8, ["woman", "builder", "oldman", "boy"]),
    "talk": ("talks in place: mouth opens and closes, small head nods and hand gestures", 8, ["woman", "builder"]),
    "laugh": ("laughs happily in place: eyes squeezed, shoulders shaking, hand near the belly", 6, ["woman", "builder", "boy"]),
    "paint": ("paints the ground with a big paint brush held in both hands, steady brush strokes up and down", 8, ["woman"]),
    "dig": ("digs with a shovel: pushes the shovel into the ground, lifts dirt and tosses it aside", 8, ["builder"]),
    "carry": ("carries a wooden crate in both arms, standing, the crate bounces slightly", 6, ["builder"]),
    "cheer": ("jumps for joy with both arms raised, lands softly and smiles", 8, ["boy"]),
    "read": ("reads an open newspaper held in both hands, turns a page, nods slightly", 8, ["oldman"]),
    "waveC": ("waves hello with the right hand, body still, friendly smile", 6, ["woman", "builder", "oldman", "boy"]),
    "crouchC": ("crouches down, places a small grey stone on the ground, stands back up", 8, ["boy"]),
}
for _k, (_txt, _n, _who) in LOADER.items():
    ANIMS[_k] = {"ours": ["idle"], "pl": _txt + CLEAN, "frames": _n, "who": _who, "loader": True}
PX = ROOT / "tools" / "loader" / "px" / "chars"
IN, OUT, REP = HERE / "in", HERE / "out", HERE / "report"
JOURNAL = HERE / "journal.jsonl"


# ---------------------------------------------------------------- keys, journal
def keys():
    env = dict(os.environ)
    f = Path.home() / ".config" / "detailed-pixel" / "cloud.env"
    if f.exists():
        for line in f.read_text().splitlines():
            if "=" in line and not line.strip().startswith("#"):
                k, v = line.split("=", 1); env.setdefault(k.strip(), v.strip())
    return env


def journal(rec):
    with open(JOURNAL, "a") as fh:
        fh.write(json.dumps({"t": time.strftime("%Y-%m-%dT%H:%M:%S"), **rec}) + "\n")


def b64png(img):
    b = io.BytesIO(); img.save(b, "PNG"); return base64.b64encode(b.getvalue()).decode()


def unb64(s):
    return base64.b64decode(s.split(",", 1)[1] if s.startswith("data:") else s)


# ---------------------------------------------------------------- inputs
def pad(img):
    w, h = img.size
    out = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    out.paste(img, ((CANVAS - w) // 2, CANVAS - FOOT - h)); return out


def meta_off(ch):
    m = json.load(open(PX / ch / "meta.json")); im = Image.open(PX / ch / "idle.png")
    return m, ((CANVAS - im.width) // 2, CANVAS - FOOT - im.height)


def cmd_prep():
    IN.mkdir(exist_ok=True)
    for ch in CHARS:
        im = Image.open(PX / ch / "idle.png").convert("RGBA")
        p = pad(im); p.save(IN / f"{ch}.png")
        arr = np.asarray(p); cols = sorted({tuple(int(v) for v in c) for c in arr[arr[..., 3] >= 128][:, :3]})
        strip = Image.new("RGB", (len(cols), 1)); strip.putdata(cols); strip.save(IN / f"{ch}_palette.png")
        print(f"{ch}: {im.size} -> 64x64, {len(cols)} colours")


# ---------------------------------------------------------------- PixelLab (animate-with-text-v3)
PL = "https://api.pixellab.ai/v2"


def pl_run(ch, an, key, req):
    import requests
    H = {"Authorization": f"Bearer {key}"}
    body = {"first_frame": {"type": "base64", "base64": b64png(Image.open(IN / f"{ch}.png")), "format": "png"},
            "action": ANIMS[an]["pl"], "frame_count": ANIMS[an]["frames"], "seed": 7, "no_background": True}
    r = req.post(f"{PL}/animate-with-text-v3", headers=H, json=body, timeout=(10, 120))   # no idempotency: never auto-retry
    if r.status_code >= 400:
        raise RuntimeError(f"PixelLab {r.status_code}: {r.text[:400]}")
    job = r.json(); jid = job["background_job_id"]
    journal({"service": "pixellab", "char": ch, "anim": an, "job": jid, "usage": job.get("usage")})
    t0 = time.time()
    while True:
        j = req.get(f"{PL}/background-jobs/{jid}", headers=H, timeout=(10, 30)).json()
        if j["status"] == "completed":
            break
        if j["status"] == "failed" or time.time() - t0 > 1200:
            raise RuntimeError(f"PixelLab job {jid}: {j.get('status')} {str(j.get('last_response'))[:300]}")
        time.sleep(6)
    imgs = (j.get("last_response") or {}).get("images") or []
    return [Image.open(io.BytesIO(unb64(i["base64"] if isinstance(i, dict) else i))).convert("RGBA") for i in imgs]


# ---------------------------------------------------------------- Retro Diffusion (advanced animations)
RD = "https://api.retrodiffusion.ai/v2"


def rd_payload(ch, an, rmbg=False):
    a = ANIMS[an]
    extra = {"remove_bg": True} if rmbg else {}
    return {**extra, "prompt": a["rd"], "prompt_style": a["rd_style"], "width": CANVAS, "height": CANVAS, "num_images": 1,
            "frames_duration": a["frames"], "input_image": b64png(Image.open(IN / f"{ch}.png")),
            "input_palette": b64png(Image.open(IN / f"{ch}_palette.png").convert("RGB")), "seed": 7,
            "bypass_prompt_expansion": True}


def rd_cost(ch, an, key, req):
    r = req.post(f"{RD}/inferences", headers={"X-RD-Token": key}, json={**rd_payload(ch, an), "check_cost": True}, timeout=(10, 60))
    r.raise_for_status(); return float(r.json()["balance_cost"])


def rd_run(ch, an, key, req, rmbg=False):
    idem = str(uuid.uuid4())
    journal({"service": "rd" + ("_rmbg" if rmbg else ""), "char": ch, "anim": an, "idempotency_key": idem, "state": "submitting"})
    r = req.post(f"{RD}/inferences", headers={"X-RD-Token": key, "Idempotency-Key": idem}, json=rd_payload(ch, an, rmbg), timeout=(10, 120))
    if r.status_code >= 400:
        raise RuntimeError(f"RD {r.status_code}: {r.text[:400]}")
    tid = r.json()["task_id"]
    journal({"service": "rd", "char": ch, "anim": an, "task": tid, "idempotency_key": idem})
    t0 = time.time()
    while True:
        t = req.get(f"{RD}/inferences/tasks/{tid}", headers={"X-RD-Token": key}, timeout=(10, 30)).json()
        if t["status"] == "succeeded":
            res = t["result"]; break
        if t["status"] == "failed" or time.time() - t0 > 900:
            raise RuntimeError(f"RD task {tid}: {t.get('status')} {t.get('error')}")
        time.sleep(3)
    journal({"service": "rd", "char": ch, "anim": an, "task": tid, "cost": res.get("balance_cost"), "remaining": res.get("remaining_balance")})
    blobs = [unb64(b) for b in res.get("base64_images") or []] or [req.get(u, timeout=60).content for u in res.get("output_urls") or []]
    out = []
    for b in blobs:
        im = Image.open(io.BytesIO(b))
        out += [f.convert("RGBA").copy() for f in ImageSequence.Iterator(im)] if b[:3] == b"GIF" else [im.convert("RGBA")]
    return out


def cmd_plan(args):
    env = keys()
    print("chars", CHARS, "anims", list(ANIMS))
    for ch in CHARS:
        if not (IN / f"{ch}.png").exists():
            sys.exit("run `prep` first")
    try:
        import requests
    except ImportError:
        sys.exit("pip install requests (into the ComfyUI venv)")
    if env.get("PIXELLAB_SECRET"):
        r = requests.get(f"{PL}/balance", headers={"Authorization": f"Bearer {env['PIXELLAB_SECRET']}"}, timeout=30)
        print("PixelLab balance:", r.status_code, r.text[:300])
    else:
        print("PixelLab: no PIXELLAB_SECRET (cloud.env) - skipped")
    if env.get("RD_API_KEY"):
        r = requests.get(f"{RD}/inferences/credits", headers={"X-RD-Token": env["RD_API_KEY"]}, timeout=30)
        print("RD balance:", r.status_code, r.text[:300])
        total = 0.0
        for ch in CHARS:
            for an in ANIMS:
                c = rd_cost(ch, an, env["RD_API_KEY"], requests); total += c
                print(f"  RD {ch}/{an}: ${c:.2f}")
        print(f"RD one pass: ${total:.2f}")
    else:
        print("RD: no RD_API_KEY (cloud.env) - skipped")
    print("PixelLab one pass (estimate from the price page): ~$0.30-0.40 for", len(CHARS) * len(ANIMS), "text-v3 calls")


def cmd_run(args):
    import requests
    svc = args[args.index("--service") + 1]          # pixellab | rd | rd_rmbg (rd with remove_bg)
    chars = args[args.index("--chars") + 1].split(",") if "--chars" in args else CHARS
    anims = args[args.index("--anims") + 1].split(",") if "--anims" in args else list(ANIMS)
    env = keys(); key = env.get("PIXELLAB_SECRET" if svc == "pixellab" else "RD_API_KEY")
    runner = pl_run if svc == "pixellab" else (lambda c, a, k, r: rd_run(c, a, k, r, rmbg=svc == "rd_rmbg"))
    if not key:
        sys.exit(f"no key for {svc} in ~/.config/detailed-pixel/cloud.env")
    for ch in chars:
        for an in anims:
            if ch not in ANIMS[an].get("who", CHARS):
                continue
            d = OUT / svc / ch / an
            if (d / "frame_00.png").exists():
                print(f"{svc} {ch}/{an}: already there, skipped"); continue
            if "--yes" not in args:
                print(f"[dry run] would call {svc} for {ch}/{an} (add --yes to pay)"); continue
            frames = runner(ch, an, key, requests)
            d.mkdir(parents=True, exist_ok=True)
            for k, f in enumerate(frames):
                f.save(d / f"frame_{k:02d}.png")
            print(f"{svc} {ch}/{an}: {len(frames)} frames")


# ---------------------------------------------------------------- report
def as_cells(img):
    a = np.asarray(img.convert("RGBA")); return a[..., :3].copy(), a[..., 3] > 127


def ours_padded(ch, frame):
    """Our frame on the same 64x64 canvas as the cloud input; a frame we never made (the old man walking) shows idle."""
    m, off = meta_off(ch)
    if not (PX / ch / f"{frame}.png").exists():
        frame = "idle"
    im = Image.open(PX / ch / f"{frame}.png").convert("RGBA")
    out = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0)); out.paste(im, off); return out


def postprocess(ch, frames):
    """Cloud frames through our rules: our palette, our ground line (shoe row), our head pasted."""
    q0, a0 = as_cells(ours_padded(ch, "idle"))
    pal = np.unique(q0[a0].reshape(-1, 3), axis=0).astype(np.uint8)
    keys_ = anim.shoe_keys(q0, a0); c0 = anim.contact_row(q0, a0, keys_); neck = anim.neck_row(a0)
    out = []
    from scipy import ndimage as nd
    for f in frames:
        rgb, a = as_cells(f)
        lab, n = nd.label(a, structure=np.ones((3, 3)))       # drop detached bits (flying hair, sparkles, stray dots)
        if n > 1:
            sizes = nd.sum(a, lab, range(1, n + 1)); a = lab == (1 + int(np.argmax(sizes)))
        rgb = anim.map_to(rgb.astype(np.float32), pal)
        dy = c0 - anim.contact_row(rgb, a, keys_)
        if abs(dy) > 4:                                        # no shoe row found (recoloured shoes): use the lowest row
            dy = int(np.clip(c0 - int(np.where(a.any(axis=1))[0].max()), -4, 4))
        rgb, a = anim.shift(rgb, dy, 0), anim.shift(a, dy, 0, False)
        rgb, a, _, _ = anim.head_lock(rgb, a, q0, a0, neck, dy, r=3)
        out.append(anim.rgba(rgb, a))
    return out


def metrics(ch, frames):
    """Stability against our idle: colours used, ground-line spread, head mismatch at the best offset (dx +-3, dy -3..+6)."""
    q0, a0 = as_cells(ours_padded(ch, "idle")); neck = anim.neck_row(a0)
    head = a0.copy(); head[neck:] = False; hy, hx = np.where(head)
    cols, grounds, mis = set(), [], []
    for f in frames:
        rgb, a = as_cells(f)
        cols |= {tuple(c) for c in rgb[a].reshape(-1, 3)}
        rows = np.where(a.any(axis=1))[0]; grounds.append(int(rows.max()) if len(rows) else -1)
        best = 1.0
        for dy in range(-3, 7):                    # a crouching head sits up to 6 px lower
            for dx in range(-3, 4):
                y2, x2 = hy + dy, hx + dx; ok = (y2 >= 0) & (y2 < CANVAS) & (x2 >= 0) & (x2 < CANVAS)
                good = (a[y2[ok], x2[ok]] & (np.abs(rgb[y2[ok], x2[ok]].astype(int) - q0[hy[ok], hx[ok]].astype(int)).sum(axis=1) <= 24)).sum()
                best = min(best, 1 - good / max(1, len(hy)))
        mis.append(best)
    return {"frames": len(frames), "colours": len(cols), "ground_spread": max(grounds) - min(grounds),
            "head_mismatch_mean": round(float(np.mean(mis)), 3), "head_mismatch_max": round(float(np.max(mis)), 3)}


def cmd_report():
    REP.mkdir(exist_ok=True); S = 4; summary = {}
    for an, spec in [(k, v) for k, v in ANIMS.items() if not v.get("loader")]:
        rows = []
        for ch in CHARS:
            rows.append((f"{ch} ours", [ours_padded(ch, f) for f in spec["ours"]]))
            for svc in ("pixellab", "rd", "rd_rmbg"):
                d = OUT / svc / ch / an
                fr = [Image.open(p).convert("RGBA") for p in sorted(d.glob("frame_*.png"))] if d.exists() else []
                if fr:
                    rows.append((f"{ch} {svc}", fr)); rows.append((f"{ch} {svc}+ours", postprocess(ch, fr)))
        for label, fr in rows:
            ch = label.split()[0]; summary[f"{an} {label}"] = metrics(ch, fr)
        n = max(len(fr) for _, fr in rows)
        sheet = Image.new("RGB", (150 + n * (CANVAS * S + 6), len(rows) * (CANVAS * S + 6)), (40, 48, 64))
        dr = ImageDraw.Draw(sheet)
        for r, (label, fr) in enumerate(rows):
            y = r * (CANVAS * S + 6)
            dr.text((6, y + 6), label, fill=(230, 230, 230)); m = summary[f"{an} {label}"]
            dr.text((6, y + 24), f"head {m['head_mismatch_mean']}/{m['head_mismatch_max']}", fill=(200, 200, 160))
            dr.text((6, y + 40), f"ground +-{m['ground_spread']}  {m['colours']} col", fill=(200, 200, 160))
            dr.line([(150, y + (CANVAS - FOOT) * S), (sheet.width, y + (CANVAS - FOOT) * S)], fill=(80, 200, 120))
            for k, f in enumerate(fr):
                big = f.resize((CANVAS * S, CANVAS * S), Image.NEAREST)
                sheet.paste(big, (150 + k * (CANVAS * S + 6), y), big)
        sheet.save(REP / f"{an}.png")
    json.dump(summary, open(REP / "metrics.json", "w"), indent=1)
    for k, v in summary.items():
        print(k.ljust(30), v)


def uri(img):
    return "data:image/png;base64," + b64png(img)


def cmd_page():
    """tools/loader/cloud/compare.html: every resident x action animated side by side, plus two street scenes
    (our walk frames vs Retro Diffusion + our post-process). Self-contained (frames inlined), stays local (.gitignore)."""
    REP.mkdir(exist_ok=True)
    cols = [("ours", "Наш конвейер"), ("pixellab", "PixelLab"), ("pixellab+ours", "PixelLab + наша обработка"),
            ("rd", "Retro Diffusion"), ("rd+ours", "Retro Diffusion + наша обработка")]
    MS = {"walk": 130, "crouch": 150, "wave": 150}
    data, metr = {}, json.load(open(REP / "metrics.json")) if (REP / "metrics.json").exists() else {}
    for an, spec in [(k, v) for k, v in ANIMS.items() if not v.get("loader")]:
        for ch in CHARS:
            row = {"ours": [uri(ours_padded(ch, f)) for f in spec["ours"]]}
            for svc in ("pixellab", "rd"):
                src = svc
                if svc == "rd" and (OUT / "rd_rmbg" / ch / an / "frame_00.png").exists():
                    src = "rd_rmbg"                      # the clean retry replaces a background-filled original
                d = OUT / src / ch / an
                fr = [Image.open(p).convert("RGBA") for p in sorted(d.glob("frame_*.png"))] if d.exists() else []
                if fr:
                    row[svc] = [uri(f) for f in fr]; row[svc + "+ours"] = [uri(f) for f in postprocess(ch, fr)]
                    row[svc + "_src"] = src
            data[f"{an}/{ch}"] = row
    html = """<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Облака против нашего конвейера</title>
<style>
:root { color-scheme: dark; } body { margin: 0; background: #0b1626; color: #eef3fa; font: 14px/1.4 ui-monospace, Menlo, monospace; }
header, section { max-width: 1240px; margin: 0 auto; padding: 12px 16px; } h1 { font-size: 18px; margin: 8px 0; } h2 { font-size: 15px; margin: 18px 0 8px; color: #f2a516; }
p { color: #93a8c3; margin: 4px 0; } .grid { display: grid; grid-template-columns: 120px repeat(5, minmax(0, 1fr)); gap: 6px; align-items: center; }
.hd { color: #93a8c3; font-size: 12px; text-align: center; } .lbl { color: #cfd8e6; font-size: 13px; }
.cell { background: #13233a; box-shadow: inset 0 0 0 1px #2a4466; display: flex; flex-direction: column; align-items: center; padding: 4px; min-height: 40px; }
.cell canvas { image-rendering: pixelated; width: 100%; max-width: 192px; aspect-ratio: 1; } .m { font-size: 11px; color: #9fb0c6; text-align: center; }
.scenes { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 560px), 1fr)); gap: 12px; }
.scene canvas { width: 100%; image-rendering: pixelated; background: #0b1626; box-shadow: inset 0 0 0 1px #2a4466; }
</style></head><body>
<header><h1>PixelLab и Retro Diffusion против нашего конвейера</h1>
<p>Каждая ячейка — анимация в цикле (наши кадры — 4 рисунка, облака — 6–9). «+ наша обработка» = палитра базы, постановка на землю по обуви,
голова из базового кадра, удаление оторванных пикселей. Retro Diffusion показан из повтора с remove_bg, где он был. Под ячейкой: голова — доля
несовпавших пикселей головы с idle (сред./макс.), земля — разброс нижнего ряда, цвета.</p></header>
<section><h2>В сцене: шествие</h2><div class="scenes">
<div class="scene"><p>Наши кадры (4 рисунка: шаг, стойка, шаг, стойка)</p><canvas id="sOurs" width="336" height="80"></canvas></div>
<div class="scene"><p>Retro Diffusion + наша обработка (8 кадров)</p><canvas id="sRd" width="336" height="80"></canvas></div>
</div></section>
<section id="rows"></section>
<script>
const DATA = %DATA%, METR = %METR%, MS = %MS%, COLS = %COLS%;
const load = (u) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = u; });
const players = [];
async function player(canvas, uris, ms) { const fr = await Promise.all(uris.map(load)); players.push({ c: canvas.getContext('2d'), fr, ms, t0: performance.now() }); }
function tick(now) {
  for (const p of players) { const k = Math.floor(Math.max(0, now - p.t0) / p.ms) % p.fr.length; if (k !== p.k) { p.k = k; p.c.clearRect(0, 0, 64, 64); p.c.drawImage(p.fr[k], 0, 0); } }
  scenes(now); requestAnimationFrame(tick);
}
const rows = document.getElementById('rows');
for (const an of ['walk', 'crouch', 'wave']) {
  const h = document.createElement('h2'); h.textContent = {walk: 'Ходьба', crouch: 'Присесть и положить камень', wave: 'Взмах рукой'}[an]; rows.appendChild(h);
  const g = document.createElement('div'); g.className = 'grid'; rows.appendChild(g);
  g.appendChild(document.createElement('div')); for (const [, t] of COLS) { const d = document.createElement('div'); d.className = 'hd'; d.textContent = t; g.appendChild(d); }
  for (const ch of ['woman', 'builder', 'oldman', 'boy']) {
    const row = DATA[an + '/' + ch]; const l = document.createElement('div'); l.className = 'lbl'; l.textContent = ch; g.appendChild(l);
    for (const [k] of COLS) {
      const cell = document.createElement('div'); cell.className = 'cell'; g.appendChild(cell);
      if (!row[k]) { cell.textContent = '—'; continue; }
      const cv = document.createElement('canvas'); cv.width = cv.height = 64; cell.appendChild(cv); player(cv, row[k], MS[an]);
      const src = k.startsWith('rd') ? (row.rd_src || 'rd') + (k.endsWith('+ours') ? '+ours' : '') : k;
      const m = METR[an + ' ' + ch + ' ' + src];
      if (m) { const t = document.createElement('div'); t.className = 'm'; t.textContent = `голова ${(m.head_mismatch_mean * 100).toFixed(0)}/${(m.head_mismatch_max * 100).toFixed(0)}% · земля ±${m.ground_spread} · ${m.colours} цв.`; cell.appendChild(t); }
    }
  }
}
// street scenes: walkers cross at 20 px/s; each walker's frames from its walk row
const walkers = {};
async function prepScenes() {
  for (const [id, key] of [['sOurs', 'ours'], ['sRd', 'rd+ours']]) {
    walkers[id] = await Promise.all(['woman', 'builder', 'boy', 'oldman'].map(async (ch, k) => ({ fr: await Promise.all((DATA["walk/" + ch][key] || DATA["walk/" + ch].ours).map(load)), off: k * 33 })));
  }
}
function scenes(now) {
  for (const id of Object.keys(walkers)) {
    const c = document.getElementById(id).getContext('2d'); c.clearRect(0, 0, 336, 80);
    c.fillStyle = '#3c475a'; c.fillRect(0, 70, 336, 10); c.fillStyle = '#5b6a82'; c.fillRect(0, 70, 336, 1);
    for (const w of walkers[id]) {
      const x = Math.floor(((now / 50) + w.off * 3) % 400) - 64;          // 20 art px per second, whole pixels
      const ms = id === 'sOurs' ? 130 : 130 * 4 / w.fr.length * 2;        // our 4-frame cycle vs an 8-frame cycle at the same pace
      const f = w.fr[Math.floor(Math.max(0, now) / ms) % w.fr.length];
      if (f) c.drawImage(f, x, 70 - 60);
    }
  }
}
prepScenes().then(() => requestAnimationFrame(tick));
</script></body></html>"""
    html = (html.replace("%DATA%", json.dumps(data)).replace("%METR%", json.dumps(metr))
            .replace("%MS%", json.dumps(MS)).replace("%COLS%", json.dumps(cols)))
    (HERE / "compare.html").write_text(html)
    print("compare.html", len(html) // 1024, "KB")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    {"prep": lambda: cmd_prep(), "plan": lambda: cmd_plan(sys.argv[2:]), "run": lambda: cmd_run(sys.argv[2:]),
     "report": lambda: cmd_report(), "page": lambda: cmd_page()}.get(cmd, lambda: print(__doc__))()
