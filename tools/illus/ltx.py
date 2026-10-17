"""Approach C2: LTX-2.5 image-to-video on the same resident (local ComfyUI, M3 Max / MPS), in two steps you can split:
   1) draft:   ~/ComfyUI/.venv/bin/python tools/illus/ltx.py NAME "PROMPT" [--w 512 --h 672 --frames 121 --seed 42 --av] [--front]
               stage 1 of the official template (video_ltx2_5_i2v) at the base resolution; keeps the sampled latent
               (ComfyUI/output/illus/ltx/NAME_*.latent) so a draft you like can be upscaled without re-rolling it.
   2) upscale: ~/ComfyUI/.venv/bin/python tools/illus/ltx.py --upscale NAME [--front]
               stage 2 of the template: latent spatial upscaler x2 + 3 refine steps (sigmas 0.85 -> 0) with the draft's prompt,
               first frame re-anchored to the base image at full size. Same motion as the draft, ~2x width and height.
   Weights that run on MPS: transformer as GGUF Q8 (ComfyUI-GGUF), Gemma text encoder bf16, video VAE bf16
   (the template's int8_convrot files do not run on MPS). The server needs COMFY_UPCAST_BF16=1 (bf16 attention -> fp32),
   otherwise LTX-2.x gives black video on MPS (ComfyUI #15804).
   --av adds the empty audio latent like the template (the transformer is audio+video); by default the latent is video only.
   Output: raw/c/NAME/frames/*.png (+ raw/c/NAME_up/frames for the upscale) and job.json; frames also in ComfyUI/output/illus/ltx/."""
import json, os, shutil, sys, time, uuid, glob, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
URL = "http://127.0.0.1:8188"
COMFY = os.path.expanduser("~/ComfyUI")
OUT = os.path.join(COMFY, "output")
NEG = "blurry, distorted, deformed, extra limbs, flicker, color shift, oversaturated, text, watermark"
SIGMAS_DRAFT = "1.0, 0.99375, 0.9875, 0.98125, 0.975, 0.909375, 0.725, 0.421875, 0.0"   # distilled, 8 steps (template stage 1)
SIGMAS_REFINE = "0.85, 0.7250, 0.4219, 0.0"                                             # template stage 2 after the x2 upsampler
UPSCALER = "ltx-2.5-latent-spatial-upscaler-x2-bf16-1.0.safetensors"


def arg(k, d):
    return type(d)(sys.argv[sys.argv.index(k) + 1]) if k in sys.argv else d


def common(prompt, image, w, h):
    """Model loaders, prompt conditioning and the start image resized to w x h (nodes 1-9, 12, 13)."""
    return {
        "1": {"class_type": "UnetLoaderGGUF", "inputs": {"unet_name": "ltx-2.5-22b-distilled-Q8_0.gguf"}},
        "2": {"class_type": "CLIPLoader", "inputs": {"clip_name": "gemma4-12b-with-proj-ltx-2.5-bf16.safetensors", "type": "ltxv"}},
        "3": {"class_type": "VAELoader", "inputs": {"vae_name": "ltx-2.5-video-vae-conv-bf16.safetensors"}},
        "4": {"class_type": "LoadImage", "inputs": {"image": image}},
        "5": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["2", 0], "text": prompt}},
        "6": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["2", 0], "text": NEG}},
        "7": {"class_type": "LTXVConditioning", "inputs": {"positive": ["5", 0], "negative": ["6", 0], "frame_rate": 24.0}},
        "8": {"class_type": "ImageScale", "inputs": {"image": ["4", 0], "upscale_method": "lanczos", "width": w, "height": h, "crop": "center"}},
        "9": {"class_type": "LTXVPreprocess", "inputs": {"image": ["8", 0], "img_compression": 18}},
        "12": {"class_type": "CFGGuider", "inputs": {"model": ["1", 0], "positive": ["7", 0], "negative": ["7", 1], "cfg": 1.0}},
        "13": {"class_type": "KSamplerSelect", "inputs": {"sampler_name": "euler_ancestral"}},
    }


def draft_graph(name, prompt, image, w, h, frames, seed, av):
    g = common(prompt, image, w, h)
    g.update({
        "10": {"class_type": "EmptyLTXVLatentVideo", "inputs": {"width": w, "height": h, "length": frames, "batch_size": 1}},
        "11": {"class_type": "LTXVImgToVideoInplace", "inputs": {"vae": ["3", 0], "image": ["9", 0], "latent": ["10", 0], "strength": 1.0, "bypass": False}},
        "14": {"class_type": "ManualSigmas", "inputs": {"sigmas": SIGMAS_DRAFT}},
        "15": {"class_type": "RandomNoise", "inputs": {"noise_seed": seed}},
        "16": {"class_type": "SamplerCustomAdvanced", "inputs": {"noise": ["15", 0], "guider": ["12", 0], "sampler": ["13", 0],
                                                                "sigmas": ["14", 0], "latent_image": ["11", 0]}},
        "17": {"class_type": "VAEDecodeTiled", "inputs": {"samples": ["16", 0], "vae": ["3", 0], "tile_size": 512, "overlap": 64,
                                                         "temporal_size": 64, "temporal_overlap": 16}},
        "18": {"class_type": "SaveImage", "inputs": {"images": ["17", 0], "filename_prefix": f"illus/ltx/{name}"}},
        "19": {"class_type": "SaveLatent", "inputs": {"samples": ["16", 0], "filename_prefix": f"illus/ltx/{name}"}},
    })
    if av:   # the template's layout: empty audio latent concatenated with the video latent, split again before decoding
        g["20"] = {"class_type": "VAELoader", "inputs": {"vae_name": "ltx-2.5-audio-vae-bf16.safetensors"}}
        g["21"] = {"class_type": "LTXVEmptyLatentAudio", "inputs": {"frames_number": frames, "frame_rate": 24, "batch_size": 1,
                                                                   "audio_vae": ["20", 0]}}
        g["22"] = {"class_type": "LTXVConcatAVLatent", "inputs": {"video_latent": ["11", 0], "audio_latent": ["21", 0]}}
        g["16"]["inputs"]["latent_image"] = ["22", 0]
        g["23"] = {"class_type": "LTXVSeparateAVLatent", "inputs": {"av_latent": ["16", 0]}}
        g["17"]["inputs"]["samples"] = ["23", 0]
        g["19"]["inputs"]["samples"] = ["23", 0]
    return g


def upscale_graph(name, prompt, image, w, h, latent_file, seed=42):
    g = common(prompt, image, 2 * w, 2 * h)
    g.update({
        "30": {"class_type": "LoadLatent", "inputs": {"latent": latent_file}},
        "31": {"class_type": "LatentUpscaleModelLoader", "inputs": {"model_name": UPSCALER}},
        "32": {"class_type": "LTXVLatentUpsampler", "inputs": {"samples": ["30", 0], "upscale_model": ["31", 0], "vae": ["3", 0]}},
        "33": {"class_type": "LTXVImgToVideoInplace", "inputs": {"vae": ["3", 0], "image": ["9", 0], "latent": ["32", 0], "strength": 1.0, "bypass": False}},
        "34": {"class_type": "ManualSigmas", "inputs": {"sigmas": SIGMAS_REFINE}},
        "35": {"class_type": "RandomNoise", "inputs": {"noise_seed": seed}},
        "36": {"class_type": "SamplerCustomAdvanced", "inputs": {"noise": ["35", 0], "guider": ["12", 0], "sampler": ["13", 0],
                                                                "sigmas": ["34", 0], "latent_image": ["33", 0]}},
        "17": {"class_type": "VAEDecodeTiled", "inputs": {"samples": ["36", 0], "vae": ["3", 0], "tile_size": 512, "overlap": 64,
                                                         "temporal_size": 64, "temporal_overlap": 16}},
        "18": {"class_type": "SaveImage", "inputs": {"images": ["17", 0], "filename_prefix": f"illus/ltx/{name}_up"}},
    })
    return g


def upload(path):
    name = "illus_" + os.path.basename(path)
    if os.path.exists(os.path.join(COMFY, "input", name)):
        return name
    import requests
    with open(path, "rb") as f:
        requests.post(f"{URL}/upload/image", files={"image": (name, f, "image/png")}, data={"overwrite": "true"}, timeout=60).raise_for_status()
    return name


def run(g):
    body = {"prompt": g, "client_id": str(uuid.uuid4())}
    if "--front" in sys.argv:
        body["front"] = True
    r = json.load(urllib.request.urlopen(urllib.request.Request(f"{URL}/prompt", data=json.dumps(body).encode(),
                                                                headers={"Content-Type": "application/json"})))
    if r.get("node_errors"):
        print(json.dumps(r["node_errors"], indent=1)); sys.exit(1)
    pid = r["prompt_id"]
    while True:
        hist = json.load(urllib.request.urlopen(f"{URL}/history/{pid}"))
        if pid in hist:
            st = hist[pid]["status"]
            if st.get("status_str") != "success":
                print(json.dumps(st.get("messages", [])[-2:], indent=1)[:3000]); sys.exit(1)
            return hist[pid]["outputs"]
        time.sleep(5)


def collect(outputs, name):
    d = os.path.join(HERE, "raw", "c", name, "frames")
    os.makedirs(d, exist_ok=True)
    for f in glob.glob(os.path.join(d, "*.png")):
        os.remove(f)
    imgs = sorted((im for node in outputs.values() for im in node.get("images", [])), key=lambda i: i["filename"])
    for k, im in enumerate(imgs):
        shutil.copy(os.path.join(OUT, im["subfolder"], im["filename"]), os.path.join(d, f"{k:04d}.png"))
    return len(imgs)


def main():
    t0 = time.time()
    if "--upscale" in sys.argv:
        name = sys.argv[sys.argv.index("--upscale") + 1]
        job = json.load(open(os.path.join(HERE, "raw", "c", name, "job.json")))
        lat = sorted(glob.glob(os.path.join(OUT, "illus", "ltx", f"{name}_*.latent")), key=os.path.getmtime)
        assert lat, f"no saved latent for {name}: re-run the draft (drafts made before 18.10 did not keep it)"
        latent_file = f"illus_ltx_{name}.latent"          # LoadLatent reads from ComfyUI/input
        shutil.copy(lat[-1], os.path.join(COMFY, "input", latent_file))
        n = collect(run(upscale_graph(name, job["prompt"], upload(os.path.join(HERE, "raw", "base.png")), job["w"], job["h"], latent_file)),
                    f"{name}_up")
        up = dict(job, name=f"{name}_up", w=2 * job["w"], h=2 * job["h"], from_draft=name, seconds=round(time.time() - t0, 1))
        json.dump(up, open(os.path.join(HERE, "raw", "c", f"{name}_up", "job.json"), "w"), indent=1)
        print(f"{name}_up: {n} frames {2 * job['w']}x{2 * job['h']}, {up['seconds']}s (incl. queue wait)")
        return
    name, prompt = sys.argv[1], sys.argv[2]
    w, h, frames, seed = arg("--w", 512), arg("--h", 672), arg("--frames", 49), arg("--seed", 42)
    assert w % 32 == 0 and h % 32 == 0 and (frames - 1) % 8 == 0, "LTX: width/height multiple of 32, frames = 8n+1"
    n = collect(run(draft_graph(name, prompt, upload(os.path.join(HERE, "raw", "base.png")), w, h, frames, seed, "--av" in sys.argv)), name)
    job = dict(name=name, prompt=prompt, w=w, h=h, frames=frames, seed=seed, av="--av" in sys.argv,
               seconds=round(time.time() - t0, 1), model="ltx-2.5 Q8 GGUF")
    json.dump(job, open(os.path.join(HERE, "raw", "c", name, "job.json"), "w"), indent=1)
    print(f"{name}: {n} frames {w}x{h}, {job['seconds']}s (incl. queue wait)")


if __name__ == "__main__":
    main()
