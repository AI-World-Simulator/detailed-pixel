"""ComfyUI API client for the local server (127.0.0.1:8188) with the workflows we use, built in code.
   python cgen.py jobs.json OUTDIR [--server http://127.0.0.1:8188] [--front]
   jobs.json: [{"name": "a", "kind": "z", "prompt": "...", "w": 1024, "h": 1024, "seed": 1, "steps": 8},
               {"name": "b", "kind": "qedit", "prompt": "<image1> ...", "images": ["ref.png"], "seed": 2},
               {"name": "c", "kind": "qt2i", "prompt": "...", "w": 1024, "h": 1024, "seed": 3},
               {"name": "d", "kind": "bgmask", "images": ["in.png"]}]
   kinds: z = Z-Image-Turbo text-to-image; qt2i / qedit = Qwen-Image-2.1 + turbo LoRA (8 steps), qedit takes up to 10 references
          (image 1 is the edit target and sets the canvas); bgmask = BiRefNet foreground mask saved as a grey PNG.
   Jobs are run in the order given (keep jobs of one model together: the models do not fit in memory at the same time).
   --front puts each job at the head of the queue (short jobs on a server shared with long ones);
   --batch queues all jobs at once so they run back to back (only for jobs that do not use each other's outputs).
   Skips jobs whose output already exists; writes OUTDIR/<name>.png. Uploaded inputs are prefixed "ldr_" in ComfyUI/input."""
import json, os, sys, time, uuid, urllib.request, urllib.parse, mimetypes

SERVER = "http://127.0.0.1:8188"
SUBDIR = "loader"
Z = dict(unet="z_image_turbo_bf16.safetensors", clip="qwen_3_4b.safetensors", vae="ae.safetensors")
Q = dict(unet="qwen_image_2.1_bf16.safetensors", lora="qwen_image_2.1_turbo_lora_avg_rank_178_bf16.safetensors",
         clip="qwen3vl_8b_bf16.safetensors", vae="qwen_image_2.1_vae_bf16.safetensors")
TURBO_SIGMAS = "1.0, 0.978453, 0.95418, 0.926626, 0.89508, 0.845148, 0.704534, 0.414568, 0"  # official turbo template


def _req(path, data=None, headers=None, timeout=60):
    r = urllib.request.Request(SERVER + path, data=data, headers=headers or {})
    with urllib.request.urlopen(r, timeout=timeout) as f:
        return f.read()


def upload(path):
    """Upload a local image to ComfyUI/input as ldr_<basename>; returns the name LoadImage expects."""
    name = "ldr_" + os.path.basename(path)
    b = uuid.uuid4().hex
    body = b"".join([
        f"--{b}\r\nContent-Disposition: form-data; name=\"image\"; filename=\"{name}\"\r\nContent-Type: {mimetypes.guess_type(path)[0] or 'image/png'}\r\n\r\n".encode(),
        open(path, "rb").read(),
        f"\r\n--{b}\r\nContent-Disposition: form-data; name=\"overwrite\"\r\n\r\ntrue\r\n--{b}--\r\n".encode()])
    r = json.loads(_req("/upload/image", body, {"Content-Type": f"multipart/form-data; boundary={b}"}))
    return (r["subfolder"] + "/" if r.get("subfolder") else "") + r["name"]


def z_t2i(prompt, w, h, seed, steps=8, prefix="ldr"):
    return {
        "1": {"class_type": "UNETLoader", "inputs": {"unet_name": Z["unet"], "weight_dtype": "default"}},
        "2": {"class_type": "CLIPLoader", "inputs": {"clip_name": Z["clip"], "type": "lumina2", "device": "default"}},
        "3": {"class_type": "VAELoader", "inputs": {"vae_name": Z["vae"]}},
        "4": {"class_type": "ModelSamplingAuraFlow", "inputs": {"model": ["1", 0], "shift": 3.0}},
        "5": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["2", 0], "text": prompt}},
        "6": {"class_type": "ConditioningZeroOut", "inputs": {"conditioning": ["5", 0]}},
        "7": {"class_type": "EmptySD3LatentImage", "inputs": {"width": w, "height": h, "batch_size": 1}},
        "8": {"class_type": "KSampler", "inputs": {"model": ["4", 0], "seed": seed, "steps": steps, "cfg": 1.0,
              "sampler_name": "res_multistep", "scheduler": "simple", "positive": ["5", 0], "negative": ["6", 0],
              "latent_image": ["7", 0], "denoise": 1.0}},
        "9": {"class_type": "VAEDecode", "inputs": {"samples": ["8", 0], "vae": ["3", 0]}},
        "10": {"class_type": "SaveImage", "inputs": {"images": ["9", 0], "filename_prefix": f"{SUBDIR}/{prefix}"}},
    }


def _qwen_base():
    return {
        "1": {"class_type": "UNETLoader", "inputs": {"unet_name": Q["unet"], "weight_dtype": "default"}},
        "2": {"class_type": "LoraLoaderModelOnly", "inputs": {"model": ["1", 0], "lora_name": Q["lora"], "strength_model": 1.0}},
        "3": {"class_type": "QwenImage21Cache", "inputs": {"model": ["2", 0], "device": "auto", "dtype": "default"}},
        "4": {"class_type": "CLIPLoader", "inputs": {"clip_name": Q["clip"], "type": "qwen_image", "device": "default"}},
        "5": {"class_type": "VAELoader", "inputs": {"vae_name": Q["vae"]}},
        "8": {"class_type": "KSamplerSelect", "inputs": {"sampler_name": "euler"}},
        "10": {"class_type": "ManualSigmas", "inputs": {"sigmas": TURBO_SIGMAS}},
    }


def q_graph(prompt, seed, images=(), w=1024, h=1024, resolution=0, negative="", prefix="ldr"):
    """Qwen-Image-2.1 turbo. With images: edit (canvas follows image 1). Without: text-to-image at w x h."""
    g = _qwen_base()
    enc = {"clip": ["4", 0], "prompt": prompt, "negative_prompt": negative, "resolution": resolution, "vae": ["5", 0]}
    for i, name in enumerate(images):
        g[f"20{i}"] = {"class_type": "LoadImage", "inputs": {"image": name}}
        enc[f"images.image_{i + 1}"] = [f"20{i}", 0]
    g["6"] = {"class_type": "TextEncodeQwenImage21", "inputs": enc}
    if images:
        latent = ["6", 2]
    else:
        g["12"] = {"class_type": "EmptyLatentImage", "inputs": {"width": w, "height": h, "batch_size": 1}}
        latent = ["12", 0]
    g["7"] = {"class_type": "CFGGuider", "inputs": {"model": ["3", 0], "positive": ["6", 0], "negative": ["6", 1], "cfg": 1.0}}
    g["9"] = {"class_type": "RandomNoise", "inputs": {"noise_seed": seed}}
    g["11"] = {"class_type": "SamplerCustomAdvanced", "inputs": {"noise": ["9", 0], "guider": ["7", 0], "sampler": ["8", 0],
               "sigmas": ["10", 0], "latent_image": latent}}
    g["13"] = {"class_type": "VAEDecode", "inputs": {"samples": ["11", 0], "vae": ["5", 0]}}
    g["14"] = {"class_type": "SaveImage", "inputs": {"images": ["13", 0], "filename_prefix": f"{SUBDIR}/{prefix}"}}
    return g


def bg_mask(image, prefix="ldr"):
    return {
        "1": {"class_type": "LoadImage", "inputs": {"image": image}},
        "2": {"class_type": "LoadBackgroundRemovalModel", "inputs": {"bg_removal_name": "birefnet.safetensors"}},
        "3": {"class_type": "RemoveBackground", "inputs": {"bg_removal_model": ["2", 0], "image": ["1", 0]}},
        "4": {"class_type": "MaskToImage", "inputs": {"mask": ["3", 0]}},
        "5": {"class_type": "SaveImage", "inputs": {"images": ["4", 0], "filename_prefix": f"{SUBDIR}/{prefix}"}},
    }


def submit(graph, front=False):
    req = {"prompt": graph, "client_id": "ldr-" + uuid.uuid4().hex[:8]}
    if front:
        req["front"] = True
    try:
        return json.loads(_req("/prompt", json.dumps(req).encode(), {"Content-Type": "application/json"}))["prompt_id"]
    except urllib.error.HTTPError as e:
        raise RuntimeError("ComfyUI rejected the graph: " + e.read().decode()[:2000])


def wait(pid, timeout=3600):
    """Wait for a queued prompt, return the bytes of its saved images."""
    t0 = time.time()
    while time.time() - t0 < timeout:
        h = json.loads(_req(f"/history/{pid}"))
        if pid in h:
            st = h[pid].get("status", {})
            if st.get("status_str") == "error":
                msgs = [m for m in st.get("messages", []) if m[0] == "execution_error"]
                raise RuntimeError("ComfyUI execution error: " + json.dumps(msgs)[:2000])
            if st.get("completed"):
                out = []
                for node in h[pid]["outputs"].values():
                    for im in node.get("images", []):
                        q = urllib.parse.urlencode({"filename": im["filename"], "subfolder": im["subfolder"], "type": im["type"]})
                        out.append(_req("/view?" + q, timeout=120))
                return out
        time.sleep(1.5)
    raise TimeoutError(f"prompt {pid} did not finish in {timeout}s")


def run(graph, timeout=3600, front=False):
    """Queue a graph, wait for it, return the bytes of its saved images."""
    return wait(submit(graph, front), timeout)


def build(job):
    k = job.get("kind", "z")
    seed = job.get("seed", 1)
    if k == "z":
        return z_t2i(job["prompt"], job.get("w", 1024), job.get("h", 1024), seed, job.get("steps", 8), job["name"])
    if k in ("qt2i", "qedit"):
        imgs = [upload(p) for p in job.get("images", [])]
        return q_graph(job["prompt"], seed, imgs, job.get("w", 1024), job.get("h", 1024), job.get("resolution", 0),
                       job.get("negative", ""), job["name"])
    if k == "bgmask":
        return bg_mask(upload(job["images"][0]), job["name"])
    raise ValueError("unknown kind " + k)


def main():
    global SERVER
    if "--server" in sys.argv:
        SERVER = sys.argv[sys.argv.index("--server") + 1]
    jobs = json.load(open(sys.argv[1]))
    out = sys.argv[2]
    front, batch = "--front" in sys.argv, "--batch" in sys.argv
    os.makedirs(out, exist_ok=True)
    todo = [j for j in jobs if not os.path.exists(os.path.join(out, j["name"] + ".png"))]
    # --batch queues everything first (jobs must not depend on each other's outputs), so they run back to back
    queued = [(j, submit(build(j), front)) for j in todo] if batch else [(j, None) for j in todo]
    for job, pid in queued:
        dst = os.path.join(out, job["name"] + ".png")
        t0 = time.time()
        imgs = wait(pid) if pid else run(build(job), front=front)
        for i, b in enumerate(imgs):
            open(dst if i == 0 else dst[:-4] + f"_{i}.png", "wb").write(b)
        print(f"{job['name']}: {time.time() - t0:.1f}s", flush=True)

if __name__ == "__main__":
    main()
