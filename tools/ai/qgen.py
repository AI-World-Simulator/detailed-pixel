"""Batch generation with Qwen-Image-2.1 Turbo (Qwen Research License — experiments only), model loaded once.
   python qgen.py jobs.json OUTDIR [--q 8]
   Same job format as zgen.py; add "alpha": true to ask for a transparent background (RGBA output).
   Skips jobs whose output already exists."""
import sys, json, os, time
from mflux.models.common.config import ModelConfig
from mflux.models.qwen21.reference import QwenImage21Edit

jobs = json.load(open(sys.argv[1]))
out = sys.argv[2]
q = int(sys.argv[sys.argv.index('--q') + 1]) if '--q' in sys.argv else 8
os.makedirs(out, exist_ok=True)
t0 = time.time()
model = QwenImage21Edit(quantize=q, model_config=ModelConfig.qwen_image_21_turbo())
print(f'loaded in {time.time() - t0:.1f}s', flush=True)
for j in jobs:
    p = os.path.join(out, j['name'] + '.png')
    if os.path.exists(p):
        continue
    prompt = j['prompt']
    if j.get('alpha'):
        prompt = 'This is an RGBA image with transparency. ' + prompt + ' The image has alpha channel and the background is transparent.'
    t = time.time()
    img = model.generate_image(seed=j.get('seed', 1), prompt=prompt, width=j.get('w', 1024), height=j.get('h', 1024))
    img.save(p)
    print(f"{j['name']} {time.time() - t:.1f}s", flush=True)
print('done', flush=True)
