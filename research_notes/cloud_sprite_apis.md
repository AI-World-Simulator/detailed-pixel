# Cloud sprite-animation APIs: PixelLab vs Retro Diffusion

Verified on 2026-10-17 from the official OpenAPI specs, the official examples repo, the vendors' sites, and two
unauthenticated probes. `GET https://api.retrodiffusion.ai/v2/status` answered `200`. Unauthenticated calls to
`/v2/balance` (PixelLab) and `/v2/inferences/credits` (RD) answered `401`, which confirms the base URLs and auth
headers. Nothing paid was called. Items marked **[UNVERIFIED]** need an account or a test call to confirm.

Our input: `tools/loader/px/chars/*/idle.png`. The sizes are boy 40x49, builder 50x51, oldman 40x45 and
woman 39x48: 3/4 front view, black outline, transparent background.

---

## 0. TL;DR

| | PixelLab | Retro Diffusion (RD) |
|---|---|---|
| Base URL | `https://api.pixellab.ai/v2` | `https://api.retrodiffusion.ai/v2` (v1 still supported) |
| Auth | `Authorization: Bearer <token>` | `X-RD-Token: rdpk-...` |
| Key | token on https://pixellab.ai/account | https://www.retrodiffusion.ai/app/devtools (max 5 keys) |
| Billing | Subscription generations or USD credits (`usage.type` = `generations` or `usd`) | Prepaid USD balance only, no subscription. Failed jobs are auto-refunded |
| Free | Trial with no card: 40 fast generations, then 5 slow per day (up to 20 stored). API access is included | 50 free credits on sign-up (**[UNVERIFIED]** whether the API can spend them) |
| Paid entry | Tier 1 "Pixel Apprentice" $12/mo (2000 gens/mo), Tier 2 $24, Tier 3 $50 | Top-ups "from $5" (FAQ) |
| Walk | `animate-with-text-v3` (any image) or skeleton v3 / templates (`walking-8-frames` ...) | `rd_advanced_animation__walking`, $0.14 |
| Crouch | Text v3, or templates `crouching` / `picking-up` | `rd_advanced_animation__crouch`, $0.14 |
| Custom action | Text v3 (`action` text) | `rd_advanced_animation__custom_action`, $0.25 |
| Face lock | No API flag. "Fixed head" is a plugin option; it can be emulated in skeleton keypoints | None |
| Palette | `target_palette` on `/characters/animations` and v2 endpoints. **Not** on text-v3 or skeleton-v3 | `input_palette` (palette image) works on advanced animations |
| Sizes | text-v3 max 256 (no min/aspect stated). skeleton-v3 ≤256. estimate-skeleton and legacy endpoints use **16/32/64/128/256 squares only** | Advanced animations: 32–256, **multiples of 8**, any aspect |
| Output | Async job, then `last_response.images[]` (base64 PNG per frame) | Async task, then a GIF (base64, or `output_urls` for large results). `return_spritesheet` gives a PNG instead |
| Python SDK | `pip install pixellab` (1.0.5 on PyPI, 1.0.8 on GitHub). It targets **v1 and has no v3 methods**, so use `requests` | None. The examples repo ships `rd_client.py` (requests) |
| MCP | `https://api.pixellab.ai/mcp` (Bearer) | `https://mcp.retrodiffusion.ai/mcp` (Bearer) |
| One pass, 4 chars x 3 anims | About $0.30–0.80, depending on route | About $2.12 ($2.5–2.8 with optional side-view and 4-angle passes) |

**What blocks us:**
1. **Canvas.** None of our sprite sizes is valid as-is. RD needs multiples of 8, and PixelLab's skeleton estimation
   needs a square. Pad every character to **64x64**, bottom-centred.
2. **View.** An east or side walk needs a side view that we do not have. Both services can synthesize one
   (PixelLab rotations, RD `__rotate`), but that is a redraw, so the face will not stay identical.
3. **Face identity.** Neither API can freeze the head. Plan a local "paste the original head back" step and
   compare both the raw and the post-processed output.
4. **Payment by country.** PixelLab's pricing page says plans are not sold in **Russia, Belarus, Iran and
   Venezuela**. RD bills through Stripe (**[UNVERIFIED]** for those regions).
5. **Terms.** Both forbid training models on outputs. RD also forbids using outputs to "**evaluate** ... any AI
   model" (details in §3.6).

---

## 1. Shared preprocessing (both services)

- Send the **native-resolution** frame, never an upscaled copy. RD rejects anything outside 32–256, and
  PixelLab's docs say upscaled art "confuses every one of these models".
- Pad onto a transparent **64x64** canvas, bottom-centred, with ≥4 px under the feet. RD warns that "a sprite whose
  opaque pixels sit within ~3px of the canvas edge animates badly". 64 is a multiple of 8 (RD), a PixelLab
  skeleton size, and fits the largest sprite (builder, 50x51).
- Keep the output on the same 64x64 canvas with the same anchor. Cropping back to 40x49 would cut off arms and
  tools during the action.
- Extract the sprite's own colours and pass them as a palette (RD `input_palette`, PixelLab `target_palette` or
  `color_image`). Where an endpoint takes no palette, re-quantize locally.

```python
# deps: pip install requests pillow    (Python 3.10+)
from __future__ import annotations
import base64, io, logging, os, time, uuid
from pathlib import Path
import requests
from PIL import Image, ImageSequence

log = logging.getLogger("cloud_sprites")
CANVAS = 64        # multiple of 8 (RD) and a PixelLab skeleton size
FOOT_MARGIN = 4    # px under the feet (RD: opaque pixels <~3px from the edge animate badly)

def pad_sprite(path: Path) -> tuple[Image.Image, tuple[int, int]]:
    """Bottom-centre the native-resolution sprite on a transparent CANVAS x CANVAS image."""
    src = Image.open(path).convert("RGBA")
    w, h = src.size
    if w > CANVAS - 2 or h > CANVAS - FOOT_MARGIN - 1:
        raise ValueError(f"{path}: {w}x{h} does not fit {CANVAS}x{CANVAS} with margins")
    off = ((CANVAS - w) // 2, CANVAS - FOOT_MARGIN - h)
    out = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    out.paste(src, off)
    return out, off

def to_b64_png(img: Image.Image) -> str:
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("ascii")   # raw base64, no "data:" prefix

def from_b64(s: str) -> bytes:
    return base64.b64decode(s.split(",", 1)[1] if s.startswith("data:") else s)

def sprite_colors(img: Image.Image) -> list[tuple[int, int, int]]:
    return sorted({p[:3] for p in img.convert("RGBA").getdata() if p[3] >= 128})

def palette_strip(colors: list[tuple[int, int, int]]) -> Image.Image:
    """1-px-high RGB strip: RD input_palette / PixelLab color_image."""
    strip = Image.new("RGB", (len(colors), 1))
    strip.putdata(colors)
    return strip

def hex_palette(colors) -> list[str]:          # PixelLab target_palette.colors (2..256)
    return [f"#{r:02x}{g:02x}{b:02x}" for r, g, b in colors][:256]
```

---

## 2. PixelLab

### 2.1 Access, billing and limits
- **Base URL** `https://api.pixellab.ai/v2`. Auth is `Authorization: Bearer YOUR_API_TOKEN`. Create an account and
  copy the token from https://pixellab.ai/account. `GET /v2/balance` returns `{credits:{usd}, subscription:{status, plan, generations, total}}`.
- **Plans** come from the public `GET https://api.pixellab.ai/get-subscriptions`, which the pricing page uses.
  Monthly: Tier 1 Pixel Apprentice $12, Tier 2 Pixel Artisan $24, Tier 3 Pixel Architect $50. Yearly: $99 / $220 / $500.
  The site JS maps these to 2000 / 5000 / 10000 generations per month, but the `/balance` example shows a Tier 2
  account with `total: 2000` (**[UNVERIFIED]** exact quota). Loyalty discounts apply (Tier 1: $12 → $10 → $9.5 → $9).
- **Free trial** (pricing page, no credit card): 40 fast generations, then 5 slow per day (up to 20 stored),
  images up to 200x200, "Basic animation: animate characters from text", API access and MCP. Skeleton animation
  is listed only under Tier 1 ("animate using either text or skeletons"). **[UNVERIFIED]** whether skeleton-v3
  can be called on the trial, and whether USD credits can be bought without a subscription. The site only offers
  "buy credits" once a plan's generations run out.
- **Per-call USD estimates** (https://www.pixellab.ai/pixellab-api). The page says these are "estimates, not fixed
  prices" and that they vary with GPU time:
  - `animate-with-text-v3`: $0.0221 (32², 4 fr), $0.0302 (256², 8 fr), $0.0424 (128², 16 fr)
  - `animate-with-skeleton-v3`: $0.0436 (3 fr), $0.0513 (8 fr), $0.0622 (15 fr), at any size. The spec says 3 / 8 / 15 frames = 2 / 3 / 4 generations
  - `estimate-skeleton`: about $0.005. Legacy `animate-with-skeleton` (3 frames): $0.0143 at 64²
  - `animate-pixminimax`: $0.0178–0.0231 at 64² (4–8 fr). **Tier 1+ only**
  - `create-character-v3`: $0.041 at 64². `animate-character` v3 mode: $0.0129 per direction at 64², 4 fr. Template mode: $0.0323 per direction at 64²
  - `generate-8-rotations-v3`: $0.0337 at 64². `inpaint`: $0.0072 at 64². `inpaint-v3` (Pro): $0.08–0.15
- **Concurrency:** Tier 2 allows up to 10 concurrent background jobs and Tier 3 up to 20 (pricing page). The trial
  and Tier 1 limits are **[UNVERIFIED]**, so run sequentially. Responses: `429` "Too many concurrent background
  jobs", and `529` "Rate limit exceeded" on the sync legacy endpoints. `402` means insufficient credits.
- **No idempotency key.** Never blindly re-POST after a lost response, because that can charge twice. Log
  `background_job_id` right away. To cancel, use `DELETE /v2/background-jobs/{id}`. A queued job is not charged.
- **Latency:** text-v3 takes 30–180 s and skeleton-v3 3–5 min. Poll every 5–10 s.

### 2.2 Endpoints relevant to us (all `POST`, JSON, images as `{"type":"base64","base64":"...","format":"png"}`)

| Endpoint | Use | Key fields and limits |
|---|---|---|
| `/animate-with-text-v3` | **Main candidate.** Animates *our* frame from text | `first_frame`* (≤256x256), `action`* (≤1000 chars, describe motion), `frame_count` 4–16 **even** (default 8), `last_frame`?, `seed` (0 = random), `no_background`, `drift_threshold` (colour de-flicker toward frame 0), `enhance_prompt` (+0.05 gen). Pixel budget w·h·frames ≤ 524,288. **No direction, view or palette params**: facing is taken from the image |
| `/estimate-skeleton` | 18-joint skeleton of our sprite | `image` must be a **16/32/64/128/256 square**. Sync. Returns `keypoints[{x,y,label,z_index}]`. Units are not documented (**[UNVERIFIED]** pixels or 0–1) |
| `/animate-with-skeleton-v3` (beta) | Poses *our* sprite with per-frame skeletons. "Moves the character instead of redrawing it": the best identity option | `description`* (appearance), `action`* (label), `direction`* (8 compass values), `view` (`side` / `low top-down` / `high top-down`), `first_frame`*, `first_frame_keypoints`* (all 18 joints, x/y as **fractions 0–1**), `keypoints`* (3–15 frames x 18 joints), `template_id` (`mannequin` ...), `seed`, `no_background` (default true). Canvas ≤256. Returns exactly `len(keypoints)` frames the size of `first_frame`. The reference frame is not returned |
| `/create-character-v3` + `/characters/animations` | Imports our sprite as a stored character, then uses server-side templates | `reference_image` is treated as **SOUTH** (facing viewer). `n_directions` 4/8, `view`, `template_id`. `direction_images` lets you supply your own other views (0.25 gen import if all are given). Animation `mode`: `template` / `skeleton-v3` / `v3` / `pixminimax` / `pro`. `template_animation_id` (e.g. `walking-8-frames`, `walking-6-frames`, `crouching`, `picking-up`, `crouched-walking`, `breathing-idle`, `throw-object`; full list at https://api.pixellab.ai/mcp/docs). `directions` (exactly one for v3 / pixminimax), `custom_start_frame`, `end_frame`, `keep_first_frame`, **`target_palette`**, `color_image` + `force_colors`, `frame_count` (v3: 4–16 even) |
| `/animate-with-skeleton` (legacy) | Sync, **exactly 3 frames** per call. The only endpoint with real inpainting and freeze-by-mask | `image_size` 16..256 (docs: 16/32/64/128/256), `reference_image`*, `skeleton_keypoints` (3 frames, pixel coords), `view`, `direction`, `inpainting_images[3]`, `mask_images[3]` (**white = regenerate**, black = keep), **`color_image`** (forced palette), `guidance_scale`, `init_images`, `seed` |
| `/animate-with-text` (legacy) | Sync, **64x64 only**, always 4 frames | `description`*, `action`*, `reference_image`*, `view`, `direction`, `n_frames`, `start_frame_index`, `inpainting_images`, `mask_images`, `color_image` |
| `/animate-with-text-v2` (Pro) | Async. 32–256 px. 16 frames at ≤64 px, 4 frames at 128 px and above | `reference_image`*, `reference_image_size`*, `image_size`*, `action`*, `view` / `direction` (incl. `none`), **`target_palette`** |
| `/inpaint-v3` (Pro) | Async inpaint, 32–512 px | `description`*, `inpainting_image{image,size}`*, `mask_image{image,size}`* (white = generate), `crop_to_mask`, `no_background`, `seed` |
| `/inpaint` (legacy) | Sync inpaint, 16–200 px | `description`*, `image_size`*, `inpainting_image`*, `mask_image`*, **`color_image`**, `no_background`, `outline` / `shading` / `detail` / `view` / `direction` |
| `/generate-8-rotations-v3` | Synthesizes east and other views from our south frame | `first_frame`* (≤256), `description`?, `no_background`, `seed`. Returns 8 images |
| `GET /background-jobs/{id}` | Polling | `status`: `processing` / `completed` / `failed`. Frames in `last_response.images[]` (Base64Image dicts). While queued, `last_response.queue_position` and `estimated_wait_seconds` are shown |
| `GET /characters/{id}/zip` | Downloads character animations | `animations/{type}/{direction}/frame_000.png` + `metadata.json`. **No auth: the id is the access key.** `423` while still generating |

**"Fixed head" or face freeze.** There is no such field in the v2 API. The Aseprite plugin's option "fixed head →
always" works by "copy[ing] over the head of [the] reference skeleton to the template"
(https://www.pixellab.ai/docs/tools/animate-with-skeleton). It is a keypoint edit, so we can do the same
client-side before calling skeleton-v3 (`fix_head` below). The plugin's "freeze" frames correspond to the legacy
endpoint's `inpainting_images` + `mask_images`. That mapping is inferred from the plugin docs (**[UNVERIFIED]**).

**Palette.** text-v3 and skeleton-v3 accept no palette; they only have `drift_threshold`. To force our palette,
either go through `/characters/animations` (`target_palette` applies in v3 / pixminimax / pro modes) or quantize
locally afterwards.

**Python SDK.** `pip install pixellab` installs 1.0.5 (PyPI, 2025-05). GitHub master is 1.0.8 (2025-11). The
client defaults to `https://api.pixellab.ai/v1` and only wraps pixflux, bitforge, animate_with_skeleton,
animate_with_text, estimate_skeleton, inpaint, rotate and get_balance. The v2 spec's own snippets use
`client.animate_with_text_v3(...)`, but that method does not exist in the published SDK, so use raw `requests`.
**MCP:** a remote server at `https://api.pixellab.ai/mcp`, configured as
`{"url": "https://api.pixellab.ai/mcp", "transport": "http", "headers": {"Authorization": "Bearer ..."}}`.
Tool list: https://api.pixellab.ai/mcp/docs.

### 2.3 Code (requests)

```python
PL_BASE = "https://api.pixellab.ai/v2"

def _pl_headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {os.environ['PIXELLAB_SECRET']}"}

def _img(img: Image.Image) -> dict:
    return {"type": "base64", "base64": to_b64_png(img), "format": "png"}

def pl_post(path: str, body: dict) -> dict:
    # No idempotency key on PixelLab: do NOT auto-retry a POST whose response was lost (double charge).
    r = requests.post(f"{PL_BASE}{path}", headers=_pl_headers(), json=body, timeout=(10, 120))
    if r.status_code >= 400:   # 401 token, 402 credits, 422 validation, 429 concurrency, 529 rate limit
        raise RuntimeError(f"PixelLab {path} -> {r.status_code}: {r.text[:500]}")
    return r.json()

def pl_wait(job_id: str, poll_s: float = 5.0, deadline_s: float = 1200) -> dict:
    t0 = time.monotonic()
    while True:
        r = requests.get(f"{PL_BASE}/background-jobs/{job_id}", headers=_pl_headers(), timeout=(10, 30))
        r.raise_for_status()
        job = r.json()
        if job["status"] == "completed":
            return job
        if job["status"] == "failed":
            raise RuntimeError(f"PixelLab job {job_id} failed: {job.get('last_response')}")
        if time.monotonic() - t0 > deadline_s:   # cancel with DELETE /background-jobs/{id} if abandoning
            raise TimeoutError(f"PixelLab job {job_id} still {job['status']}")
        time.sleep(poll_s)

def pl_frames(job: dict) -> list[Image.Image]:
    imgs = (job.get("last_response") or {}).get("images") or []
    return [Image.open(io.BytesIO(from_b64(i["base64"] if isinstance(i, dict) else i))).convert("RGBA")
            for i in imgs]

# --- (A) animate-with-text-v3: our frame + text -------------------------------------------------
def pl_text_v3(frame: Image.Image, action: str, frame_count: int = 8, seed: int = 0) -> list[Image.Image]:
    job = pl_post("/animate-with-text-v3", {
        "first_frame": _img(frame),
        "action": action,                 # motion only, e.g. "walking in place, arms swinging"
        "frame_count": frame_count,       # 4..16, even
        "seed": seed,                     # 0 = random
        "no_background": True,
        # "drift_threshold": 0.0,         # pull every frame's colours toward frame 0
        # "last_frame": _img(end_pose),   # optional end pose, same size
    })
    log.info("pixellab text-v3 job=%s usage=%s", job["background_job_id"], job.get("usage"))
    return pl_frames(pl_wait(job["background_job_id"]))   # check whether frame 0 == input [UNVERIFIED]

# --- (B) skeleton v3 with our own keypoints + client-side "fixed head" --------------------------
HEAD = {"NOSE", "RIGHT EYE", "LEFT EYE", "RIGHT EAR", "LEFT EAR"}

def pl_estimate_skeleton(frame: Image.Image) -> list[dict]:
    """frame must be 16/32/64/128/256 square. Returns keypoints as 0..1 fractions for skeleton-v3."""
    kps = pl_post("/estimate-skeleton", {"image": _img(frame)})["keypoints"]
    w, h = frame.size
    if any(k["x"] > 1 or k["y"] > 1 for k in kps):          # units undocumented -> normalise pixels
        kps = [{**k, "x": k["x"] / w, "y": k["y"] / h} for k in kps]
    clamp = lambda v: min(1.0, max(0.0, float(v)))
    return [{"label": k["label"], "x": clamp(k["x"]), "y": clamp(k["y"]), "z_index": int(k.get("z_index", 0))}
            for k in kps]                                      # must contain all 18 labels for v3

def fix_head(ref: list[dict], frame_kps: list[dict]) -> list[dict]:
    """Emulates the plugin's 'fixed head = always': head joints keep their reference offset from NECK."""
    r = {k["label"]: k for k in ref}
    f = {k["label"]: k for k in frame_kps}
    dx, dy = f["NECK"]["x"] - r["NECK"]["x"], f["NECK"]["y"] - r["NECK"]["y"]
    return [{**k, "x": r[k["label"]]["x"] + dx, "y": r[k["label"]]["y"] + dy} if k["label"] in HEAD else k
            for k in frame_kps]

def pl_skeleton_v3(frame, ref_kps, motion_kps, description, action,
                   direction="south", view="low top-down", seed=0) -> list[Image.Image]:
    job = pl_post("/animate-with-skeleton-v3", {
        "description": description,       # appearance noun phrase, e.g. "chibi boy, red cap, blue overalls"
        "action": action,                 # short label: "walk", "crouch"
        "direction": direction,           # our 3/4 front sprite = "south"; an east walk needs an east-facing frame
        "view": view,                     # "low top-down" ~ classic 3/4 RPG view
        "first_frame": _img(frame),
        "first_frame_keypoints": ref_kps,
        "keypoints": [fix_head(ref_kps, f) for f in motion_kps],   # 3..15 frames x 18 joints
        "template_id": "mannequin",
        "seed": seed,
        "no_background": True,
    })
    return pl_frames(pl_wait(job["background_job_id"], poll_s=10))

# --- (C) import as character -> server templates / v3 with palette -------------------------------
def pl_import_character(frame: Image.Image, description: str) -> str:
    job = pl_post("/create-character-v3", {
        "description": description,
        "reference_image": _img(frame),   # taken as SOUTH; v3 generates the other directions
        "n_directions": 4, "view": "low top-down", "template_id": "mannequin", "no_background": True,
    })
    pl_wait(job["background_job_id"])
    return job["character_id"]

def pl_character_animation(character_id: str, **kw) -> list[str]:
    resp = pl_post("/characters/animations", {"character_id": character_id, **kw})
    for j in resp["background_job_ids"]:
        pl_wait(j, poll_s=10)
    return resp["background_job_ids"]   # then GET /characters/{id}/zip -> animations/{type}/{dir}/frame_*.png

# Example calls (one character):
# frame, off = pad_sprite(Path("tools/loader/px/chars/boy/idle.png"))
# walk   = pl_text_v3(frame, "walking in place toward the viewer, small steps, arms swinging", 8)
# crouch = pl_text_v3(frame, "crouches down, places a small box on the ground, stands back up", 8)
# wave   = pl_text_v3(frame, "waves hello with the right hand", 8)
# cid = pl_import_character(frame, "chibi boy with red cap and blue overalls")
# pl_character_animation(cid, mode="skeleton-v3", template_animation_id="walking-8-frames", directions=["east"])
# pl_character_animation(cid, mode="skeleton-v3", template_animation_id="picking-up", directions=["south"])
# pl_character_animation(cid, mode="v3", action_description="digs with a shovel", directions=["south"],
#                        frame_count=8, keep_first_frame=False,
#                        target_palette={"colors": hex_palette(sprite_colors(frame))})
```

Notes on route C:
- `create-character-v3` stores the character at the uploaded size, but "Animations get their own larger canvas
  when the motion needs room". Its MCP docs say "a 96px character commonly animates at ~132px", so re-anchor
  locally.
- The east view is AI-rotated, so expect face drift. Whether the south rotation keeps our pixels byte-exact is
  **[UNVERIFIED]**.
- Rotation URLs live in a public bucket, and the zip endpoint needs no auth.

### 2.4 Terms (https://www.pixellab.ai/termsofservice, last updated 2025-11-23)
- §1.3 / §3.3: "You own the copyrights to your creations, permitting usage for both commercial and non-commercial
  purposes". A non-commercial research project is fine.
- §1.2 / §3.3: you may **not train your own models** on PixelLab outputs without written permission.
- §2.2: "Programmatic usage is only allowed through our official API ... designed for vibe coding and in-game live
  asset creation". Building a service or reselling needs their consent. A comparison script is asset creation,
  which looks fine.
- §3.4: they may store inputs and outputs for debugging or quality, and won't train on user content without
  notice in the UI. §4.1: you must comply with Open RAIL-M. Swedish law applies.
- Pricing page: plans are "not support[ed]" in Russia, Belarus, Iran and Venezuela. Payments go through Paddle.

---

## 3. Retro Diffusion

### 3.1 Access, billing and limits
- **Base URL** `https://api.retrodiffusion.ai/v2` (v1 is still supported, with no retirement plan). Auth header is
  `X-RD-Token: rdpk-...`. Create a key at https://www.retrodiffusion.ai/app/devtools (max 5 per account).
- **Billing:** prepaid USD balance, deducted before generation and **auto-refunded on failure**. There is no
  subscription, and credits can't be bought through the API (use auto-refill on the site).
  `GET /v2/inferences/credits` returns `{"credits": 0, "balance": 100.75}`.
- **Free:** "New accounts get 50 free credits" (retrodiffusion.ai/llms.txt and the FAQ). **[UNVERIFIED]** whether
  the v2 API can spend them, since the API docs only talk about the USD balance. Per the ToS, "content created with
  free usage may be public". The FAQ says "credit packages starting at just $5".
- **Free dry run:** add `"check_cost": true` to any `/v2/inferences` payload. It returns `balance_cost`, generates
  nothing and charges nothing. Use it to validate our payload before paying.
- **Prices** (flat, any size): advanced animations **$0.14**; `custom_action` and `subtle_motion` **$0.25**;
  `rotate` **$0.10**; prompt-only `rd_animation__*` $0.07 (`any_animation`, `big_animation` and `8_dir_rotation`
  $0.25). Edit tools: `inpainting` $0.18, `background_remover` $0.01, and `palette_converter` / `color_reducer` free
  (some need a minimum balance).
- **Rate limits:** generation only documents `429` + `Retry-After` (**[UNVERIFIED]** numbers). Pixel Fixer allows
  10 req/min, or 120/min after any completed purchase. Check `GET /v2/status` (no key) before batches.
- **Idempotency:** send `Idempotency-Key: <uuid>` on paid POSTs. Retrying with the same key never charges twice; a
  different body with the same key returns `409`. If the key is lost, recover tasks with
  `GET /v2/inferences/tasks?limit=20&status=running`.
- **Failures:** `inference_failed` (502, retry once), `provider_busy` (503, wait a few minutes),
  `provider_timeout` / `request_timeout` (504). All are refunded. Animations fail more often than stills.

### 3.2 Animation styles (`prompt_style`), from the live catalog embedded in the API docs page

| Style | Input image | Size | Frames | Cost | Notes |
|---|---|---|---|---|---|
| `rd_advanced_animation__walking` | **required** | 32–256, mult. of 8, any aspect | `frames_duration` 4/6/8/10/12/16 | $0.14 | Example prompt "Slow, heavy steps". The examples say "side profile works best" |
| `rd_advanced_animation__idle` / `__jump` / `__attack` / `__destroy` | required | same | same | $0.14 | |
| `rd_advanced_animation__crouch` | required | same | same | $0.14 | "Best results when uploading a neutral pose" |
| `rd_advanced_animation__custom_action` | required | same | same | **$0.25** | Free-text motion ("waves hello", "digs with a shovel"). Built with PixelEngine |
| `rd_advanced_animation__subtle_motion` | required | same | same | $0.25 | Ambient scene motion |
| `rd_advanced_animation__rotate` | required | 32–256, mult. of 8 | 8 views (ignores frames_duration) | $0.10 | GIF, or with `return_spritesheet` a **3x3 sheet with an empty centre where every view faces the centre**: the middle-**left** cell faces right (east). Single provider, so expect `provider_busy` |
| `rd_animation__four_angle_walking` / `_walking_idle` | catalog: optional; llms.txt: prompt-only (**[UNVERIFIED]**) | **48x48 only** | 4 dirs x 4 frames | $0.07 | Generates its own character. Identity unlikely to match |
| `rd_animation__any_animation` | optional (64x64), up to 9 refs | 64x64 only | fixed | $0.25 | |
| `rd_animation__battle_sprites` | optional | 64x64 | idle 3 / walk 6 / jump 2 / attack 3, 4 dirs | $0.07 | |

All advanced styles support `input_palette` and `remove_bg` and have batch = 1. Confirm live limits with
`GET /v2/styles/selector?tab=tab:advanced-animation` (needs the key, but is free).

**Request fields** (`POST /v2/inferences`): `prompt`, `prompt_style`, `width`*, `height`*, `num_images`* (1 for
animations), `seed`, `input_image` (**raw base64, no `data:` prefix**; must equal `width`x`height`),
`frames_duration`, `return_spritesheet`, `input_palette` (base64 palette image, well under 1 MB),
`return_pre_palette`, `remove_bg`, `return_non_bg_removed`, `bypass_prompt_expansion` (turns off automatic LLM
prompt rewriting; useful for reproducibility), `upscale_output_factor` (1 = native), `upload_outputs`,
`check_cost`. `negative` is accepted but unused.
- Transparency: "Animations inherit the start frame's background: a transparent frame yields a transparent GIF".
  The "RGB without transparency" rule applies to img2img `input_image`.

**Response.** `POST` returns `{"status":"accepted","task_id",...}`. Poll `GET /v2/inferences/tasks/{task_id}` until
`status` is `succeeded` or `failed`; `result` is then `InferenceRun`:
`{base64_images[], output_urls[], balance_cost, remaining_balance, model, request_id, output_url_expires_at, ...}`.
- Animations come back as **GIF** (PNG spritesheet with `return_spritesheet`). The non-rotate sheet layout is
  **[UNVERIFIED]**.
- **Large results, multi-frame animations in particular, come back only as `output_urls`, with `base64_images`
  empty.** Handle both. Signed URLs last 15 min. Outputs can be recovered via `GET /v2/inferences/requests/{id}`
  for 24 h.

### 3.3 Code (requests; modelled on `example-scripts/rd_client.py` + `05_animation.py`)

```python
RD_BASE = "https://api.retrodiffusion.ai/v2"

def _rd_headers(idem: str | None = None) -> dict[str, str]:
    h = {"X-RD-Token": os.environ["RD_API_KEY"]}
    if idem:
        h["Idempotency-Key"] = idem
    return h

def rd_check_cost(payload: dict) -> float:          # free, immediate, no task
    r = requests.post(f"{RD_BASE}/inferences", headers=_rd_headers(),
                      json={**payload, "check_cost": True}, timeout=(10, 60))
    r.raise_for_status()
    return float(r.json()["balance_cost"])

def rd_submit(payload: dict, idem: str) -> str:
    """Persist `idem` BEFORE calling; on an uncertain failure retry with the SAME key (never double-charges)."""
    r = requests.post(f"{RD_BASE}/inferences", headers=_rd_headers(idem), json=payload, timeout=(10, 120))
    if r.status_code >= 400:   # body: {"error": {"code", "message", "request_id"}}; honour Retry-After on 429
        raise RuntimeError(f"RD -> {r.status_code}: {r.text[:500]}")
    return r.json()["task_id"]

def rd_wait(task_id: str, poll_s: float = 3.0, deadline_s: float = 900) -> dict:
    t0 = time.monotonic()
    while True:
        r = requests.get(f"{RD_BASE}/inferences/tasks/{task_id}", headers=_rd_headers(), timeout=(10, 30))
        r.raise_for_status()
        task = r.json()
        if task["status"] == "succeeded":
            return task["result"]
        if task["status"] == "failed":   # refunded; error.code: inference_failed / provider_busy / *_timeout
            raise RuntimeError(f"RD task {task_id} failed: {task.get('error')}")
        if time.monotonic() - t0 > deadline_s:
            raise TimeoutError(f"RD task {task_id} still {task['status']}")
        time.sleep(poll_s)

def rd_outputs(result: dict) -> list[bytes]:
    blobs = [from_b64(b) for b in result.get("base64_images") or []]
    if not blobs:                                    # large animations: hosted URLs only
        for url in result.get("output_urls") or []:
            resp = requests.get(url, timeout=60)
            resp.raise_for_status()
            blobs.append(resp.content)
    return blobs

def gif_frames(data: bytes) -> list[Image.Image]:
    im = Image.open(io.BytesIO(data))
    return [f.convert("RGBA").copy() for f in ImageSequence.Iterator(im)]   # Pillow composites GIF disposal

def rd_animate(frame: Image.Image, style: str, prompt: str, frames: int = 8,
               palette: Image.Image | None = None, seed: int | None = None) -> list[Image.Image]:
    payload = {
        "prompt": prompt,                                  # motion description
        "prompt_style": style,                             # e.g. "rd_advanced_animation__walking"
        "width": frame.width, "height": frame.height,      # must equal the input; 32..256, multiples of 8
        "num_images": 1,
        "frames_duration": frames,                         # 4/6/8/10/12/16 (8 for loops, 6 for snappy actions)
        "input_image": to_b64_png(frame),                  # transparent frame -> transparent GIF
        "bypass_prompt_expansion": True,
        # "remove_bg": True,                               # A/B: may help or eat outline pixels
    }
    if palette is not None:
        payload["input_palette"] = to_b64_png(palette.convert("RGB"))
    if seed is not None:
        payload["seed"] = seed
    log.info("RD %s would cost $%.2f", style, rd_check_cost(payload))
    idem = str(uuid.uuid4()); log.info("RD idempotency key %s", idem)   # persist this in real runs
    result = rd_wait(rd_submit(payload, idem))
    log.info("RD charged $%s, remaining $%s", result.get("balance_cost"), result.get("remaining_balance"))
    out: list[Image.Image] = []
    for blob in rd_outputs(result):
        out += gif_frames(blob) if blob[:3] == b"GIF" else [Image.open(io.BytesIO(blob)).convert("RGBA")]
    return out

# Example calls (one character):
# frame, off = pad_sprite(Path("tools/loader/px/chars/boy/idle.png"))
# pal = palette_strip(sprite_colors(frame))
# walk   = rd_animate(frame, "rd_advanced_animation__walking", "small bouncy steps", 8, pal, seed=7)
# crouch = rd_animate(frame, "rd_advanced_animation__crouch", "crouches down slowly", 6, pal, seed=7)
# place  = rd_animate(frame, "rd_advanced_animation__custom_action",
#                     "crouches down and places a small wooden box on the ground, then stands up", 8, pal, seed=7)
# side view first (identity risk!): rd_animate(frame, "rd_advanced_animation__rotate", "", 8, pal)
#   with "return_spritesheet": True -> 3x3 sheet, middle-left cell = facing right
```

### 3.4 Terms (ToS in the app, "Last updated 2026-09-28"; previous version 2025-08-19)
- **Outputs** are "owned by the person who generated them", and RD assigns you its rights. Commercial use is
  allowed (FAQ). Outputs may not be unique.
- **AI training (§7):** "you may not use outputs ... to train, fine-tune, distill, **evaluate** or otherwise
  improve any AI or machine-learning model", nor compile datasets, without written permission. This applies even
  though you own the outputs.
  - Comparing outputs side by side to pick a tool is probably fine.
  - Using RD frames as a **reference, benchmark or ground truth to tune or score our local pipeline** is close to
    "evaluate ... improve", so email support@retrodiffusion.com first.
- RD may use **outputs** to train its own models, but does not train on inputs. Outputs made with **free usage**
  may be displayed publicly, in RD's gallery and in promotion.
- One person, one account; no creating extra accounts for free usage. Stripe processes payments. New Hampshire
  law, with individual arbitration.

---

## 4. Fit to our case

| Requirement | PixelLab | RD | Action |
|---|---|---|---|
| Same canvas | text-v3 and skeleton-v3 return frames the size of the input. Character route may enlarge the canvas | Output = `width`x`height` = input | Pad to 64x64 and keep 64x64 |
| Our odd sizes (39–50 x 45–51) | skeleton estimation needs squares | needs multiples of 8 | 64x64 pad (§1) |
| 3/4 front input | skeleton-v3 `view="low top-down"`, `direction="south"` match it. text-v3 takes facing from the image | No view or direction param. "Side profile works best" | First test **walk toward the viewer / in place** in 3/4. Treat an east walk as a separate experiment that needs a synthesized side view |
| East or side walk | `create-character-v3` → `directions=["east"]`, or `generate-8-rotations-v3` | `__rotate` → middle-left cell → `__walking` | Expect the face to change in the rotated view |
| Identical face | skeleton-v3 "moves" rather than redraws, plus `fix_head` keypoints | none | Local head-paste. Optional seam repair with `/inpaint` + `color_image` (PixelLab) or the RD `inpainting` tool (`soft_inpaint=false` restores unmasked pixels exactly, $0.18) |
| Fixed palette | Only via `/characters/animations` `target_palette`, v2 Pro, or legacy `color_image` | `input_palette` on every advanced style | Plus a local re-quantization to the source palette as a guarantee |
| Custom text action | text-v3 `action`, v3 `action_description` | `custom_action` ($0.25) | |

## 5. Cost estimate: 4 characters x 3 animations

| Route | One pass | With ~3 seeds per item |
|---|---|---|
| **PixelLab A**: 12 x text-v3 at 64², 8 fr | ≈ 12 x $0.025–0.03 = **$0.30–0.36** | ≈ $1.0 |
| **PixelLab B**: skeleton-v3 for walk + crouch (8 x $0.051) + text-v3 custom (4 x $0.03) + 4 x estimate-skeleton | ≈ **$0.55** | ≈ $1.7 |
| **PixelLab C**: 4 x create-character-v3 ($0.041) + 8 x skeleton-v3 template (2–4 gens) + 4 x v3 custom | ≈ **$0.6–0.8** | ≈ $2–2.4 |
| **RD**: per char walk $0.14 + crouch $0.14 + custom $0.25 = $0.53 | **$2.12** | ≈ $6.4 |
| RD extras: rotate to side view ($0.10/char), four-angle walking ($0.07/char) | +$0.40 / +$0.28 | |

- **PixelLab:** a Tier 1 month ($12, 2000 generations) covers this many times over. The free trial (40 fast
  generations) *may* cover route A once (**[UNVERIFIED]** how many generations text-v3 costs, and whether
  skeleton-v3 is allowed on the trial).
- **RD:** the minimum top-up is about $5 (FAQ), which covers one full pass plus retries. The 50 free credits may
  or may not cover a first test.

## 6. Unverified items (check with the first key, cheaply)
1. PixelLab text-v3: minimum size, non-square acceptance, whether frame 0 of `images` echoes the input, and the
   generation cost per call on the trial.
2. PixelLab `estimate-skeleton`: coordinate units, and whether all 18 joints always come back (skeleton-v3 needs all 18).
3. PixelLab plans: trial access to skeleton-v3, buying USD credits without a plan, concurrency for trial and
   Tier 1, and the exact monthly generation quota.
4. PixelLab `create-character-v3`: whether the south view keeps our pixels exactly, and the stored and animation
   canvas sizes.
5. RD: whether the 50 free credits work on the API, the current minimum top-up, and generation rate limits.
6. RD: frame count vs `frames_duration`, the non-rotate spritesheet layout, and which way a 3/4 front sprite walks.
7. RD `rd_animation__four_angle_walking`: what an optional `input_image` actually does (the docs contradict each other).
8. Payment availability for the user's billing country (PixelLab explicitly excludes RU/BY/IR/VE; RD uses Stripe).

## 7. Sources
- PixelLab v2 OpenAPI: https://api.pixellab.ai/v2/openapi.json · interactive docs https://api.pixellab.ai/v2/docs · LLM summary https://api.pixellab.ai/v2/llms.txt
- PixelLab per-call prices: https://www.pixellab.ai/pixellab-api · plans (public JSON used by the pricing page): https://api.pixellab.ai/get-subscriptions · pricing UI: https://www.pixellab.ai/#checkout
- PixelLab ToS: https://www.pixellab.ai/termsofservice · fixed head / freeze: https://www.pixellab.ai/docs/tools/animate-with-skeleton
- PixelLab Python SDK: https://github.com/pixellab-code/pixellab-python · https://pypi.org/project/pixellab/ · MCP: https://github.com/pixellab-code/pixellab-mcp · tool list and template IDs: https://api.pixellab.ai/mcp/docs
- RD examples repo (README, llms.txt, `contracts/v2/openapi.json`, `example-scripts/rd_client.py`, `05_animation.py`): https://github.com/Retro-Diffusion/api-examples
- RD API reference (SPA; style catalog with size limits is embedded): https://www.retrodiffusion.ai/app/guide/api · site summary https://retrodiffusion.ai/llms.txt
- RD ToS (SPA page "Terms of Service", last updated 2026-09-28): https://retrodiffusion.ai/terms · FAQ (free credits, $5 packages, commercial use): https://retrodiffusion.ai/learn-more
- RD MCP: https://github.com/Retro-Diffusion/retro-diffusion-mcp · status: https://api.retrodiffusion.ai/v2/status
