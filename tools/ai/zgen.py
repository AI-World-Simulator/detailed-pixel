"""Batch generation with Z-Image-Turbo (Apache-2.0), model loaded once.
   python zgen.py jobs.json OUTDIR [--q 8]
   jobs.json: [{"name": "trees1", "prompt": "...", "w": 1024, "h": 1024, "seed": 1, "steps": 9}, ...]
   Skips jobs whose output already exists."""
import sys, json, os, time
from mflux.models.common.config import ModelConfig
from mflux.models.z_image import ZImage

jobs = json.load(open(sys.argv[1]))
out = sys.argv[2]
q = None
if '--q' in sys.argv:
    q = int(sys.argv[sys.argv.index('--q') + 1])
os.makedirs(out, exist_ok=True)
t0 = time.time()
model = ZImage(quantize=q, model_path='Tongyi-MAI/Z-Image-Turbo', model_config=ModelConfig.z_image_turbo())
print(f'loaded in {time.time() - t0:.1f}s', flush=True)
for j in jobs:
    p = os.path.join(out, j['name'] + '.png')
    if os.path.exists(p):
        continue
    t = time.time()
    img = model.generate_image(seed=j.get('seed', 1), prompt=j['prompt'], num_inference_steps=j.get('steps', 9),
                               width=j.get('w', 1024), height=j.get('h', 1024),
                               image_path=j.get('img'), image_strength=j.get('strength'))
    img.save(p)
    print(f"{j['name']} {time.time() - t:.1f}s", flush=True)
print('done', flush=True)
