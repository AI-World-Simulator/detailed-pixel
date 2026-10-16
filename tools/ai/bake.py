"""Seamless large img2img with Z-Image-Turbo (Apache-2.0) via MultiDiffusion.

   python bake.py SRC.png OUT.png --prompt-file P.txt [--strength 0.6] [--seed 1] [--win 1536x1024] [--stride 1024x640] [--steps 9]

   The whole canvas shares one latent. At every denoising step the transformer runs on overlapping windows
   (each window sees the same latent the model would see in a normal img2img run) and the predicted velocities
   are averaged with smooth window weights, so neighbouring windows agree and there are no seams.
   mflux's image_strength: higher = closer to the source image."""
import sys, time, math, argparse
import numpy as np
import mlx.core as mx
from PIL import Image
from mflux.models.common.config import ModelConfig
from mflux.models.common.config.config import Config
from mflux.models.z_image import ZImage
from mflux.models.z_image.latent_creator import ZImageLatentCreator
from mflux.models.common.vae.vae_util import VAEUtil
from mflux.utils.image_util import ImageUtil

ap = argparse.ArgumentParser()
ap.add_argument('src'); ap.add_argument('out')
ap.add_argument('--prompt-file', required=True)
ap.add_argument('--strength', type=float, default=0.6)
ap.add_argument('--seed', type=int, default=1)
ap.add_argument('--win', default='1536x1024')
ap.add_argument('--stride', default='1024x640')
ap.add_argument('--steps', type=int, default=9)
A = ap.parse_args()
prompt = open(A.prompt_file).read().strip()
ww, wh = map(int, A.win.split('x'))
sx, sy = map(int, A.stride.split('x'))

img = Image.open(A.src).convert('RGB')
Wc, Hc = (img.width // 16) * 16, (img.height // 16) * 16
img = img.crop((0, 0, Wc, Hc))
assert Wc >= ww and Hc >= wh, 'canvas smaller than a window'

t0 = time.time()
model = ZImage(model_path='Tongyi-MAI/Z-Image-Turbo', model_config=ModelConfig.z_image_turbo())
print(f'loaded {time.time() - t0:.1f}s', flush=True)
if Wc * Hc > 4_000_000:
    from mflux.models.common.vae.tiling_config import TilingConfig
    model.tiling_config = TilingConfig()

cfg = Config(width=ww, height=wh, guidance=0.0, scheduler='linear', image_path=A.src, image_strength=A.strength,
             model_config=model.model_config, num_inference_steps=A.steps)
sig = cfg.scheduler.sigmas
ts0 = cfg.init_time_step

enc = VAEUtil.encode(vae=model.vae, image=ImageUtil.to_array(img), tiling_config=model.tiling_config)
clean = ZImageLatentCreator.pack_latents(enc, Hc, Wc)            # [16, 1, h, w]
noise = ZImageLatentCreator.create_noise(A.seed, Hc, Wc)
lat = (1 - sig[ts0]) * clean + sig[ts0] * noise
mx.eval(lat)
te, _ = model._encode_prompts(prompt=prompt, negative_prompt=None, guidance=0.0)
predict = model._predict(model.transformer)

h, w = Hc // 8, Wc // 8
wh8, ww8, sy8, sx8 = wh // 8, ww // 8, sy // 8, sx // 8
def starts(total, win, stride):
    s = list(range(0, max(1, total - win) + 1, stride))
    if s[-1] != total - win:
        s.append(total - win)
    return s
wins = [(y, x) for y in starts(h, wh8, sy8) for x in starts(w, ww8, sx8)]
# smooth bump weights: ~0 at the window border, 1 inside; small floor so canvas edges still count
def bump(n):
    t = (np.arange(n) + 0.5) / n
    return np.clip(np.minimum(t, 1 - t) / 0.25, 0, 1) ** 2 * 0.98 + 0.02
Wwin = np.outer(bump(wh8), bump(ww8)).astype(np.float32)
print(f'canvas {Wc}x{Hc}, {len(wins)} windows, steps {ts0}..{A.steps - 1}', flush=True)

for t in range(ts0, A.steps):
    ts = time.time()
    timestep = (1 - sig[t]).reshape((1,))
    acc = np.zeros((16, 1, h, w), np.float32); wsum = np.zeros((h, w), np.float32)
    for (y, x) in wins:
        v = predict(latents=lat[:, :, y:y + wh8, x:x + ww8], timestep=timestep, sigmas=sig,
                    text_encodings=te, negative_encodings=None, guidance=0.0)
        v = np.array(v.astype(mx.float32))
        acc[:, :, y:y + wh8, x:x + ww8] += v * Wwin
        wsum[y:y + wh8, x:x + ww8] += Wwin
    vel = mx.array(acc / wsum).astype(lat.dtype)
    lat = lat + vel * (sig[t + 1] - sig[t]).astype(lat.dtype)
    mx.eval(lat)
    print(f'step {t} {time.time() - ts:.1f}s', flush=True)

dec = VAEUtil.decode(vae=model.vae, latent=ZImageLatentCreator.unpack_latents(lat, Hc, Wc), tiling_config=model.tiling_config)
ImageUtil.to_pil(dec).save(A.out)
print(f'done {time.time() - t0:.1f}s', flush=True)
