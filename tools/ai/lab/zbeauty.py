"""Second pass with Z-Image-Turbo: start from a Qwen result (identity, exact shape) and add storybook detail,
   holding the shape with the proxy's window lines.   python zbeauty.py ROUND   (jobs listed in JOBS)
   Each job: (name, init image in output/, proxy stem in input/, building description, denoise, strength)"""
import sys, os, shutil, json, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import exp

I = os.path.expanduser("~/ComfyUI/input"); O = os.path.expanduser("~/ComfyUI/output")
STYLE = ("Cozy hand-painted storybook game art, painterly brush textures, rich but clean details, soft warm sunlight from the left, "
         "gentle ambient occlusion, readable silhouette. Classic 2:1 isometric game view, orthographic, plain light grey background.")
Q8 = {"izba": ("q8_00", "p30_gable_iso_t_izba", "A Russian wooden village house (izba): green painted log walls, white carved window frames, grey plank roof, carved gable"),
      "half_timbered": ("q8_01", "p30_gable_iso_t_halftimber", "A three-storey German half-timbered house: dark brown timber frame on cream plaster, steep brown tile roof, small windows with shutters"),
      "canal_house": ("q8_03", "p30_gable_iso_t_canal", "A narrow Amsterdam canal house: red-brown brick, ornate stepped and bell gable with white stone trim, tall white-framed windows"),
      "thatched_cottage": ("q8_04", "p30_gable_iso_t_thatched", "An English cottage: thick golden thatched roof, white-washed walls, small dark windows, a brick chimney"),
      "khrushchevka": ("q8_05", "p30_flat_iso_t_khrush", "A Soviet five-storey prefabricated apartment block: light concrete panels, rows of windows, flat roof, small entrance canopies")}

def job(name, init_png, stem, desc, d, s, seed=1):
    shutil.copy(f"{O}/qexp/{init_png}_s1_00001_.png", f"{I}/zb_{name}.png")
    g = exp.wf(dict(init="colorn", d=d, ctrl="linesw", s=s, e=0.8, prompt="p3", proxy=stem), seed, f"zbeauty/{name}_d{int(d*100)}_s{int(s*100)}")
    g["20"]["inputs"]["image"] = f"zb_{name}.png"
    g["5"]["inputs"]["text"] = f"{desc}. {STYLE}"
    return g

if __name__ == "__main__":
    jobs = []
    for k, (q, stem, desc) in Q8.items():
        jobs.append((k, job(k, q, stem, desc, 0.75, 0.4)))
    jobs.append(("izba_d85", job("izba", Q8["izba"][0], Q8["izba"][1], Q8["izba"][2], 0.85, 0.4)))
    pend = {}
    for name, g in jobs:
        body = {"prompt": g}
        if os.environ.get("FRONT"): body["front"] = True
        pend[exp.post("/prompt", body)["prompt_id"]] = name
    print(f"queued {len(pend)}", flush=True)
    while pend:
        time.sleep(5)
        for pid in list(pend):
            h = exp.post(f"/history/{pid}")
            if pid not in h: continue
            name = pend.pop(pid); st = h[pid]["status"]
            if st.get("status_str") == "error": print("ERROR", name, json.dumps(st)[:500], flush=True); continue
            ts = {m[0]: m[1].get("timestamp", 0) for m in st.get("messages", [])}
            fn = [im for o in h[pid]["outputs"].values() for im in o.get("images", [])][0]
            print(json.dumps({"name": name, "sec": round((ts.get("execution_success", 0) - ts.get("execution_start", 0)) / 1000),
                              "file": f"{O}/{fn['subfolder']}/{fn['filename']}"}), flush=True)
    print("done", flush=True)
