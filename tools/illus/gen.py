"""ComfyUI runner for the illustrated-animation experiment: tools/ai/cgen.py with our own output prefix and input names.
   python3 tools/illus/gen.py jobs.json OUTDIR [--batch] [--front]
   --front jumps the shared queue: only for a single short job, never for Wan (the neighbour session waits behind it).
   Same job kinds as cgen.py (z, qt2i, qedit, bgmask) plus:
     {"name": "v", "kind": "wan", "images": ["start.png"], "prompt": "...", "w": 576, "h": 768, "frames": 49, "steps": 20,
      "cfg": 5.0, "seed": 1, "dtype": "bf16", "tiled": true}
      -> Wan 2.2 TI2V-5B image-to-video + BiRefNet on every frame in the same job,
      saved as OUTDIR/v/frames/0000.png ..., OUTDIR/v/masks/0000.png ..., OUTDIR/v/job.json (job + wall time)
   Outputs go to ComfyUI/output/illus/, uploads are named illus_<basename> (the server is shared with another session)."""
import json, os, sys, time
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "ai"))
import cgen  # noqa: E402

cgen.SUBDIR = "illus"


def upload(path):
    """Like cgen.upload, but the input is named illus_<basename> (cgen uses ldr_, the loader's prefix)."""
    import uuid, mimetypes
    name = "illus_" + os.path.basename(path)
    b = uuid.uuid4().hex
    body = b"".join([
        f"--{b}\r\nContent-Disposition: form-data; name=\"image\"; filename=\"{name}\"\r\nContent-Type: "
        f"{mimetypes.guess_type(path)[0] or 'image/png'}\r\n\r\n".encode(),
        open(path, "rb").read(),
        f"\r\n--{b}\r\nContent-Disposition: form-data; name=\"overwrite\"\r\n\r\ntrue\r\n--{b}--\r\n".encode()])
    r = json.loads(cgen._req("/upload/image", body, {"Content-Type": f"multipart/form-data; boundary={b}"}))
    return (r["subfolder"] + "/" if r.get("subfolder") else "") + r["name"]


cgen.upload = upload

WAN = dict(unet="wan2.2_ti2v_5B_fp16.safetensors", clip="umt5_xxl_fp16.safetensors", vae="wan2.2_vae.safetensors")
WAN_NEG = ("色调艳丽，过曝，静态，细节模糊不清，字幕，风格，作品，画作，画面，静止，整体发灰，最差质量，低质量，JPEG压缩残留，丑陋的，残缺的，"
           "多余的手指，画得不好的手部，画得不好的脸部，畸形的，毁容的，形态畸形的肢体，手指融合，杂乱的背景，三条腿，背景人很多，倒着走")


def wan_graph(prompt, image, w, h, frames, steps, cfg, seed, prefix, tiled=True, dtype="default"):
    g = {
        "1": {"class_type": "UNETLoader", "inputs": {"unet_name": WAN["unet"], "weight_dtype": "default"}},
        "2": {"class_type": "CLIPLoader", "inputs": {"clip_name": WAN["clip"], "type": "wan", "device": "default"}},
        "3": {"class_type": "VAELoader", "inputs": {"vae_name": WAN["vae"]}},
        "4": {"class_type": "ModelSamplingSD3", "inputs": {"model": ["1", 0], "shift": 8.0}},
        "5": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["2", 0], "text": prompt}},
        "6": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["2", 0], "text": WAN_NEG}},
        "7": {"class_type": "LoadImage", "inputs": {"image": image}},
        "8": {"class_type": "Wan22ImageToVideoLatent", "inputs": {"vae": ["3", 0], "width": w, "height": h, "length": frames,
              "batch_size": 1, "start_image": ["7", 0]}},
        "9": {"class_type": "KSampler", "inputs": {"model": ["4", 0], "seed": seed, "steps": steps, "cfg": cfg,
              "sampler_name": "uni_pc", "scheduler": "simple", "positive": ["5", 0], "negative": ["6", 0],
              "latent_image": ["8", 0], "denoise": 1.0}},
        # tiled decode: the MPS VAE fails above ~2 MP per pass; 16 frames per temporal tile keeps each pass small
        "10": ({"class_type": "VAEDecodeTiled", "inputs": {"samples": ["9", 0], "vae": ["3", 0], "tile_size": 512, "overlap": 64,
                "temporal_size": 16, "temporal_overlap": 4}} if tiled else
               {"class_type": "VAEDecode", "inputs": {"samples": ["9", 0], "vae": ["3", 0]}}),
        "11": {"class_type": "SaveImage", "inputs": {"images": ["10", 0], "filename_prefix": f"illus/{prefix}"}},
        # BiRefNet on every frame in the same job (one model load instead of one per frame)
        "12": {"class_type": "LoadBackgroundRemovalModel", "inputs": {"bg_removal_name": "birefnet.safetensors"}},
        "13": {"class_type": "RemoveBackground", "inputs": {"bg_removal_model": ["12", 0], "image": ["10", 0]}},
        "14": {"class_type": "MaskToImage", "inputs": {"mask": ["13", 0]}},
        "15": {"class_type": "SaveImage", "inputs": {"images": ["14", 0], "filename_prefix": f"illus/{prefix}_mask"}},
    }
    if dtype != "default":
        # the fp16 checkpoint makes ComfyUI compute in fp16; on MPS that wrecked the clip after the first latent frames
        # (colours burn out, background blotches) -> compute in bf16, weights stay fp16 and are cast per layer
        g["16"] = {"class_type": "ModelComputeDtype", "inputs": {"model": ["1", 0], "dtype": dtype}}
        g["4"]["inputs"]["model"] = ["16", 0]
    return g


_build = cgen.build


def build(job):
    if job.get("kind") == "wan":
        return wan_graph(job["prompt"], upload(job["images"][0]), job.get("w", 640), job.get("h", 832), job.get("frames", 49),
                         job.get("steps", 20), job.get("cfg", 5.0), job.get("seed", 1), job["name"], job.get("tiled", True),
                         job.get("dtype", "default"))
    return _build(job)


cgen.build = build


def wait_by_node(pid, timeout=4 * 3600):
    """Like cgen.wait, but returns {node_id: [png bytes, ...]} so frames and masks of one job stay apart."""
    import urllib.parse
    t0 = time.time()
    while time.time() - t0 < timeout:
        h = json.loads(cgen._req(f"/history/{pid}"))
        if pid in h:
            st = h[pid].get("status", {})
            if st.get("status_str") == "error":
                raise RuntimeError("ComfyUI execution error: " + json.dumps(st.get("messages", []))[:2000])
            if st.get("completed"):
                out = {}
                for nid, node in h[pid]["outputs"].items():
                    for im in node.get("images", []):
                        q = urllib.parse.urlencode({"filename": im["filename"], "subfolder": im["subfolder"], "type": im["type"]})
                        out.setdefault(nid, []).append(cgen._req("/view?" + q, timeout=120))
                return out
        time.sleep(3)
    raise TimeoutError(pid)


def main():
    jobs = json.load(open(sys.argv[1]))
    out = sys.argv[2]
    front, batch = "--front" in sys.argv, "--batch" in sys.argv
    os.makedirs(out, exist_ok=True)
    done = lambda j: os.path.exists(os.path.join(out, j["name"] + ".png")) or os.path.isdir(os.path.join(out, j["name"]))
    todo = [j for j in jobs if not done(j)]
    queued = [(j, cgen.submit(build(j), front)) for j in todo] if batch else [(j, None) for j in todo]
    t_prev = time.time()
    for job, pid in queued:
        t0 = time.time()
        if job.get("kind") == "wan":
            res = wait_by_node(pid or cgen.submit(build(job), front))
            for nid, sub in (("11", "frames"), ("15", "masks")):
                d = os.path.join(out, job["name"], sub); os.makedirs(d, exist_ok=True)
                for i, b in enumerate(res.get(nid, [])):
                    open(os.path.join(d, f"{i:04d}.png"), "wb").write(b)
            json.dump(dict(job, seconds=round(time.time() - t0, 1), size=[job.get("w", 640), job.get("h", 832)]),
                      open(os.path.join(out, job["name"], "job.json"), "w"), indent=1)
        else:
            imgs = cgen.wait(pid, timeout=4 * 3600) if pid else cgen.run(build(job), timeout=4 * 3600, front=front)
            dst = os.path.join(out, job["name"] + ".png")
            for i, b in enumerate(imgs):
                open(dst if i == 0 else dst[:-4] + f"_{i}.png", "wb").write(b)
        now = time.time()
        # with --batch the wall time between two finished jobs is the job's own run time (they run back to back)
        print(f"{job['name']}: {now - t0:.1f}s (since previous {now - t_prev:.1f}s)", flush=True)
        t_prev = now


if __name__ == "__main__":
    main()
