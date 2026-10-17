# Keeping AI-generated sprite animation frames consistent ("on-model") and clean (state as of 2026-10-17)

Scope: multi-frame character animation (walk, idle, action, crouch) made with image and image-edit models, kept consistent in identity, face, proportions, palette and ground contact. Covers generation-side control, deterministic post-processing, dedicated tools, failure modes of edit models, and 2024–2026 papers.

Project context, from the assignment: local ComfyUI on an M3 Max with Z-Image-Turbo, Qwen-Image 2.1 Edit plus a turbo LoRA, BiRefNet, and Fun ControlNet Union for Z-Image and Qwen 2.1. Characters are ~43 art-px tall chibi townsfolk, pixelized from ~768 px renders. The current pipeline is: per-frame edit from a base pose → grid detection → shared palette → registration by colour overlap → local "face-only" edits that keep only the changed face rows. Observed defects: (1) eye pixels change across walk frames; (2) an eye gets thinner in an action frame; (3) the crouch frame floats above the ground. No hand drawing is allowed, so every fix must be automatic.

Legend: **[vendor]** = claim from the vendor or its marketing; **[single test]** = one blog or tester, not replicated; **[unverified]** = could not confirm against a primary source; **[inference]** = this researcher's reasoning or design, not a sourced fact.

Assumption used in the inferences: at ~768 px render height and ~43 art-px character height, one art-pixel is about 12–18 render pixels. The exact number depends on how much of the render the character fills.

---

## 1. Generation side: what gives the most frame-to-frame stability for small pixel characters?

### Takeaway
The most stable approach for small sprites is "change only what moves". Generate or edit only the limbs and torso from one approved base frame, freeze the head (in the generator and again in post), feed the reference at native resolution so the latent grids line up, and always edit from the base rather than from the previous output. Pose ControlNets and single-canvas strips help, but they do not lock identity on their own. Pose detectors work poorly on chibi proportions, and sources disagree on whether one-canvas strips beat per-frame edits.

### Cited Findings

**Reference/latent-grid alignment (the most underrated stability lever for Qwen edits)**
- In ComfyUI, `TextEncodeQwenImageEditPlus` force-rescales the reference image to about 1 MP. For example, an 832×1216 input becomes 848×1240, while the output latent stays 832×1216. Every edit therefore shifts and slightly zooms the picture. Measured drift was dx +8.0 px / dy −3.3 px, with the horizontal shift growing from +3 px at the left edge to +14 px at the right **[single test]** — [lilting.ch, Qwen-Image-Edit ReferenceLatent](https://lilting.ch/en/articles/qwen-image-edit-pixel-perfect-referencelatent)
- Fix, using stock nodes only: disconnect the VAE input on `TextEncodeQwenImageEditPlus`, encode the source at native size with VAEEncode, and pass it through the stock `ReferenceLatent` node. Drift fell to a uniform ~1 px (dx +1.1 / dy +0.5). Change outside the edited faces fell from 19.0% to 0.7–0.8%. In a pose change, character heights matched the source exactly, whereas with the stock node bodies grew about 2.0% — [lilting.ch](https://lilting.ch/en/articles/qwen-image-edit-pixel-perfect-referencelatent)
- Same source: inputs should be multiples of 16, because the latent uses an 8 px grid and the DiT patchifies 2×2. An 831×1215 input was silently floored to 824×1208. "Snap-to-16 preprocessing is mandatory." Once the grids were aligned, adding "keep everything else unchanged" to the prompt made no measurable difference (0.8% vs 0.7%). With misaligned grids, that clause did not stop the body from moving — [lilting.ch](https://lilting.ch/en/articles/qwen-image-edit-pixel-perfect-referencelatent)
- Qwen-Image 2.1 (Diffusers `QwenImage21Pipeline`) resizes the reference to an area of `output_resolution`² (default 1024²), rounded to multiples of 32. An 832×1216 source becomes 832×1248, a 2.6% vertical stretch. Fix: set `output_resolution = round(sqrt(w*h))`, e.g. 1006 for 832×1216, 1109 for 960×1280, 1254 for 1024×1536. Square sizes such as 1024×1024 keep their dimensions at the default. Measured drift went from dx +1.1 px (with blocks shifting ±6–8 px in opposite directions) to dx 0.0 / dy 0.1 px **[single test]** — [lilting.ch, Qwen-Image 2.1 Edit output resolution](https://lilting.ch/en/articles/qwen-image-2-1-edit-pixel-perfect-output-resolution)
- Even with aligned grids, Qwen-Image 2.1 expression edits changed 20.8% of face pixels and 2.6% of non-face pixels, compared with 16.9% and 0.7% for Qwen-Image-Edit 2511. A VAE round trip alone changed only 0.02%. Residual difference lines followed body contours: outlines came out slightly thinner and skin shading slightly lighter — [lilting.ch 2.1 article](https://lilting.ch/en/articles/qwen-image-2-1-edit-pixel-perfect-output-resolution)
- Qwen-Image 2.1 alpha: RGBA outputs had alpha 255 everywhere unless transparency was prompted for. With a "transparent background" prompt, background alpha was mostly 1–8 rather than 0, and white shirts and socks stayed opaque — [lilting.ch 2.1 article](https://lilting.ch/en/articles/qwen-image-2-1-edit-pixel-perfect-output-resolution)
- Qwen-Image-Edit-2511 model card: "character consistency has been significantly improved". The model is described as built to "mitigate image drift" (no mechanism given). Its example settings are 40 steps, `true_cfg_scale` 4.0 **[vendor]** — [HF Qwen-Image-Edit-2511](https://huggingface.co/Qwen/Qwen-Image-Edit-2511)
- Community ComfyUI nodes for Qwen drift: LockPixel Pad Image pads to a multiple of 32 without resizing and records the padding so it can be undone. Rennart Pixel Drift Fix warps the edit back onto the source using SIFT keypoints. Qwen Edit Measure Drift returns `drift_x_px` and `drift_y_px` — [comfy.icu LockPixelPadImage](https://comfy.icu/node/LockPixelPadImage), [comfy.icu RennartPixelDriftFix](https://comfy.icu/node/RennartPixelDriftFix), [comfy.icu QwenEditMeasureShift](https://comfy.icu/node/QwenEditMeasureShift)

**Freezing the head / inpainting only the changing parts**
- PixelLab's skeleton animation has a "Fixed head" option, set to "always", that "copies the reference skeleton's head into the template so the face stays consistent". It also has inpainting where "inpainted frames are regenerated while frozen frames are kept", with an example that edits only an arm. Generation modes include "Freeze 1 → Generate 2" (recommended first) and "Freeze 2 → Generate 1", which is best for adding frames because "the model gets more information" — [PixelLab Animate with skeleton](https://www.pixellab.ai/docs/tools/animate-with-skeleton)
- PixelLab's recommended loop: make rough fixes, then regenerate with those frames as init images, and "gradually increase the init image strength" as you converge — [PixelLab](https://www.pixellab.ai/docs/tools/animate-with-skeleton)

**Pose conditioning (OpenPose/DWPose/depth)**
- Sprite Sheet Diffusion annotated poses with DW-Pose/OpenPose, but the authors had to annotate difficult cases by hand because pose detectors "performed poorly on exaggerated or non-human sprites" — [arXiv 2412.03685](https://arxiv.org/html/2412.03685v2)
- Chibi figures are 1–4 heads tall versus 7–8 for a standard human. That is the likely reason human-trained pose skeletons misfit chibis, but no source directly documents an OpenPose failure on chibi characters **[inference from the proportions source]** — [Clip Studio tips, posing chibi](https://tips.clip-studio.com/de-de/articles/4856?org=1)
- The Z-Image-Turbo Fun ControlNet Union is one model supporting Canny, HED, Depth, Pose and MLSD. The official optimal `control_context_scale` is 0.65–0.80 — [HF Z-Image-Turbo-Fun-Controlnet-Union mirror](https://huggingface.co/biali/Z-Image-Turbo-Fun-Controlnet-Union). A secondary page gives per-control values (pose 0.9 with guidance end 0.65; depth 0.8; canny 0.7), but they may be copied from a Flux article **[unverified]** — [comfyui-wiki](https://comfyui-wiki.com/ja/news/2025-12-02-z-image-turbo-controlnet-union)
- Pose-sheet ControlNet workflows for Flux character sheets: the random seed can vary, but upscale and face-detailer steps should use a fixed seed "otherwise consistency may suffer" — [ThinkDiffusion](https://learn.thinkdiffusion.com/consistent-character-creation-with-flux-comfyui/)

**One canvas (strip) vs per-frame edits — sources conflict**
- Strip camp: put the shipped sprite on a 1024×1024 transparent canvas (nearest-neighbour upscaled) with reserved slots and request the whole strip at once. "Editing frame by frame … causes character drift." Keep strips to 4–8 frames and ≤9 objects per request. Lock frame 1 to the shipped idle sprite. Use one global scale for the whole strip so that taller poses show as extra height. Attributed to @chongdashu's March 2026 guide **[secondary; original post not located]** — [openskillindex animated-sprite-gen](https://openskillindex.com/skills/jamditis-claude-skills-journalism-animated-sprite-gen)
- Per-frame camp: generate each frame separately with the first frame as the reference ("walk cycle frame 2 of 6"), then assemble — [Summer Engine via search summary](https://www.claudepluginhub.com/skills/summerengine-summer/sprite-sheet). Also: separate character consistency (LoRA), pose variation (prompting) and post-processing rather than making the final sheet in one pass — [Apatero](https://apatero.com/blog/generate-clean-spritesheets-comfyui-guide-2025)
- Nano Banana Pro sheets: the head changes size, boots slide, and the last frame snaps back to the first. The article suggests a six-frame strip of 128×128 cells (768×128) and recommends slicing and re-aligning in an editor rather than trusting the model's grid. It calls the prompt "a request, not a guarantee" — [Geek Vibes Nation](https://geekvibesnation.com/nano-banana-pro-sprite-sheets-make-the-walk-cycle-work/)
- Redrawn poses can come back on a different implied pixel grid (chunkier or finer). In SpriteCook's example, a 158×158 sprite's back view snapped to 80×80. Retrying the same character often reproduces the same grid. SpriteCook now checks each pose's grid against the character resolution and fails the run if it is too far off **[vendor]** — [SpriteCook, why AI can't match pixel-art resolution](https://www.spritecook.ai/blog/why-ai-cant-match-pixel-art-resolution)

**Multi-reference edit models**
- FLUX.2 [pro]/[flex] accept up to 8 references via the API (9 MP limit) or 10 in the playground; [klein] accepts 4. BFL claims "the best character / product / style consistency available today" **[vendor]** — [BFL FLUX.2 docs](https://docs.bfl.ai/flux_2/flux2_overview), [BFL blog](https://bfl.ai/blog/flux-2)
- The FLUX.1 Kontext paper measured identity drift over successive edits with AuraFace embedding similarity. Kontext drifted more slowly than competitors, but it still drifted — [arXiv 2506.15742](https://arxiv.org/html/2506.15742v2)

**LoRAs for sprite sheets**
- `svntax-dev/pixel_spritesheet_4walk_small_lora_v1` is for FLUX.2 Klein base 4B; the distilled model is "not suitable". It produces a 4×4 sheet: 3 walk frames per direction plus 1 special pose. Generate at 512×512, then downscale ×4 to 128×128 with k-centroid. It was trained on edited CC-BY 16×16 assets. Known issues: hair or headwear gets cut off, and the back-view row is inconsistent (e.g. a werewolf's scarf disappears). The 3000-step checkpoint is more consistent for humanoids — [HF model card](https://huggingface.co/svntax-dev/pixel_spritesheet_4walk_small_lora_v1/blob/main/README.md)
- A FLUX.2-klein-4B edit LoRA (rank 16) turns one object image into a 2×2 sheet of four camera angles. It covers angles, not walk cycles — [HF xocialize](https://huggingface.co/xocialize/spritesheet-FLUX.2-klein-4B-lora)
- The FlyMy.AI trainer supports Qwen-Image-Edit LoRA training, so a custom "base pose → walk frame N" edit LoRA could be trained — [flymyai-lora-trainer](https://cnb.cool/NovaGridEra/flymyai-lora-trainer)

**Video-model route**
- Scenario's documented spritesheet workflow: base still → "Convert to Video" with Seedance 1 Lite/Pro (first frame; Lite also takes a last frame) or Pixverse v4.5 (first and last frame) → extract 8 or 16 key poses at a uniform resolution. Attack loops are made by swapping the first and last frames for the return video — [Scenario help](https://help.scenario.com/articles/9088582240-create-spritesheets-with-scenario)
- Pixie.haus I2V (Seedance-1-Pro-Fast, Wan 2.2 I2V Fast) uses the sprite as the exact first frame. Documented failures: "morphing" (pixels shift, colours blend, structure blurs), camera drift, and grid breakage — [pixie.haus](https://pixie.haus/resources/creating-movement-engineering-pixel-art-animation-ai)
- Wan 2.2 loop trick: feed the same image as both first and last frame to the First–Last-Frame node — [NextDiffusion](https://www.nextdiffusion.ai/tutorials/wan-2-2-looping-animations-in-comfyui)

### Inferences
- **[inference] Defect (1), changing eye pixels, is most likely sub-pixel phase aliasing, not only "the model redrew the eyes".** With ~12–18 render px per art-px, the stock Qwen node's 8–14 px drift and ~2% scale growth amount to 0.5–1 art-px. That is enough to move eye edges across sampling-block boundaries, so a 1-px eye becomes 0 or 2 px wide after the dominant/median downscale. A ~1 px drift after the ReferenceLatent fix is ~0.06–0.08 art-px and mostly harmless. Fix the latent grid first (§1 findings), then register in render space before pixelizing, and reuse the base frame's grid phase (§2).
- **[inference] Ranking for ~43 px chibis**, most to least stable:
  1. Masked edit of only the limbs/torso from the base frame, using native-size ReferenceLatent, with the head mask vetoed in post (§2 diff-mask).
  2. Pose-conditioned img2img from an automatic "cut-out warp" of the base sprite: rigid rotation of limb segments as the init image, denoised at low strength. This mirrors PixelLab's skeleton plus init-image approach.
  3. A whole strip on one canvas with the base in slot 1.
  4. Independent per-frame text-to-image.
  
  Video models are best kept for motions that are hard to pose, and they need the full §2 cleanup.
- **[inference] Topology:** always edit from the base frame (a star), never from the previous frame (a chain). The project's current pipeline already does this, which matches the drift evidence in §4.
- **[inference] Pose ControlNet for chibis:** human-proportion pose skeletons misplace the head and limbs. Depth or canny from a warped base sprite is likely a better control signal than a pose skeleton at this size. Use strength within the official 0.65–0.80 range.

### Gaps
- No independent benchmark compares Qwen-Image 2.1 Edit, FLUX.2, Nano Banana and GPT Image specifically for pixel-sprite frame consistency.
- No source isolates the effect of a turbo/lightning LoRA on drift. The lilting.ch tests used a lightning-merged 2511 build and did not compare against a non-distilled model.
- No source documents OpenPose or DWPose accuracy on chibi proportions directly.

---

## 2. Post-processing: algorithms and concrete implementations

### Takeaway
Shipped pipelines enforce consistency deterministically after generation. The steps are: detect and snap the pixel grid, use one global palette per character, register frames on stable anchors (torso x and a feet baseline, not the whole body), composite the source back wherever the change is small (diff mask plus a veto mask), and apply per-pixel temporal hysteresis against the base frame. No public tool implements "head template-match and paste" or "1-px outline normalisation" for AI sprites, but both are straightforward to build from the primitives below.

### Cited Findings

**Grid detection, snapping and downscaling**
- unfake (JS, with a Python port):
  - Scale detection: `auto` tries runs-based first (GCD of horizontal and vertical colour-run lengths; fast, suited to clean art) and falls back to edge-aware (Sobel-based grid finding; slower, handles anti-aliasing). `--scale N` overrides.
  - Downscale methods: `dominant` (default; most frequent colour per block, falling back to the mean if none dominates; "preserves original palette colors"), `median`, `mode`, `mean` ("can create new colors"), and `content-adaptive` (Kopf & Lischinski 2011).
  - Quantisation: Wu (1992). `fixed_palette` / `--palette FILE` supply a fixed palette.
  - Cleanup: `morph` removes noise; `jaggy` removes isolated diagonal pixels.
  - Alpha and grid: `--alpha-threshold` (example value 200); `snap_grid=True` by default; transparent background via an edge flood fill with tolerance 10.
  
  Sources: [PyPI unfake](https://pypi.org/project/unfake/), [unfake.js GitHub](https://github.com/jenissimo/unfake.js). The unfake.js README also mentions fractional grids (e.g. 10.24 px per cell) and an "elastic grid" for uneven cells — [unfake.js](https://github.com/jenissimo/unfake.js)
- The fal.ai Image2Pixel wrapper lists the dominant-colour threshold default as 0.05 — [fal.ai image2pixel](https://fal.ai/models/fal-ai/image2pixel/llms.txt)
- proper-pixel-art (Python) finds grid lines with edge detection plus a Hough transform, then samples the most common colour per cell. Default is 16 colours **[secondary summary]** — [SourcePulse](https://www.sourcepulse.org/projects/13911015)
- Pixel Snapper (Rust/WASM, MIT, Sprite Fusion) auto-detects pixel size (`--pixel-size` override), uses a 16-colour default or a fixed hex `--palette`, and "preserves … dithering". The README does not describe the algorithm — [GitHub spritefusion-pixel-snapper](https://github.com/Hugo-Dz/spritefusion-pixel-snapper)
- K-Centroid (Astropulse) runs k-means per output tile to choose a representative colour, which reduces noise and blur. It is available as an Aseprite extension and in Python via PixelOE — [itch.io K-Centroid](https://astropulse.itch.io/k-centroid)
- PixelOE: contrast-aware outline expansion *before* downscaling. Steps: compute local median brightness; weight bright-vs-dark detail; blend an eroded and a dilated image by that weight; apply morphological close/open. The "contrast" downscale mode works in LAB and keeps the min pixel in dark-skewed patches and the max in bright ones, so thin dark lines survive the resize. Options include k-means/maxcover palette reduction and colour matching — [GitHub PixelOE](https://github.com/KohakuBlueleaf/PixelOE)

**Global palette and temporal stabilisation**
- The "Pixel Art Studio" ComfyUI node runs three stages:
  - per-block vote over colour bins (not averaging);
  - one k-means palette fitted across all frames, "which keeps the palette from flickering";
  - per-pixel temporal hysteresis, meant "to stop static pixels from changing thickness when their colors drift". A block keeps its previous winner unless it is clearly beaten.
  
  Parameters: `pixel_size`, `kernel_size`, `num_colors`, `stability`. The repo and licence could not be verified **[unverified listing]** — [comfy.icu Pixel-Art-Studio](https://comfy.icu/node/Pixel-Art-Studio) (details via search summary)

**Snap-back of unchanged regions (diff-mask compositing)**
- WepeNerd's "Image Edit Difference Mask" pipeline:
  1. Optional translation-only alignment (`align_first`; the affine version is a separate node).
  2. Blur both images by `pre_blur_px` = 2, for the comparison only.
  3. Compute a `diff_mode` difference: color (max RGB channel), luminance, or chroma. Alpha changes count when both images are RGBA.
  4. Apply `threshold` = 0.08.
  5. Drop regions smaller than `min_region_px` = 64, fill holes, `grow_px` = 2, `feather_px` = 2.
  6. Apply an optional `limit_mask` veto: wherever it is black, the source wins.
  
  Where the mask is 0, the output is the untouched source pixel, with no VAE re-decode — [comfy.icu QwenEditDiffMask](https://comfy.icu/node/QwenEditDiffMask)
- lilting.ch recommends compositing through a diff mask to get zero difference against the original. Because differences stay localised once the grids are aligned, a simple threshold may be enough. For multiple characters, edit one character at a time and composite — [lilting.ch](https://lilting.ch/en/articles/qwen-image-edit-pixel-perfect-referencelatent)

**Registration and ground contact**
- agent-sprite-forge pipeline: key (magenta #FF00FF, with despill) → slice → register → scale → palette → QA → export. `scale_frames.py --root-lock torso-x` keeps the torso at a fixed x, and `--row-baseline` gives a shared baseline per row. `sheet_qc.py` reports PASS/WARN/FAIL, and `--strict-qc` publishes nothing on failure — [tessl agent-sprite-forge](https://tessl.io/registry/skills/github/0x0funky/agent-sprite-forge/generate2dsprite/review)
- perfectpixel-studio: YCbCr chrominance matting, projection profiles plus dynamic programming for frame segmentation, and "alpha-weighted centroids" for frame alignment. A "self-correcting loop" turns measured defects into corrective hints injected into the next prompt **[secondary aggregator]** — [SourcePulse perfectpixel-studio](https://www.sourcepulse.org/projects/31645438), [README.ko](https://raw.githubusercontent.com/gykim80/perfectpixel-studio/main/README.ko.md)
- One global scale computed from the anchor, frame 1 locked to the shipped idle sprite, and a palette-drift check between the first and last frames — [openskillindex](https://openskillindex.com/skills/jamditis-claude-skills-journalism-animated-sprite-gen)
- "Fixed ground line and a central position guide" on identical canvases; "keep intentional movement" when correcting placement — [Geek Vibes Nation](https://geekvibesnation.com/nano-banana-pro-sprite-sheets-make-the-walk-cycle-work/)

**Measuring drift**
- Phase correlation gives whole-image dx/dy; per-block phase correlation exposes scale drift (opposite-sign shifts on the left and right). The author notes it "measures the best overall overlap, not that every pixel is within 0.1 px" — [lilting.ch 2.1 article](https://lilting.ch/en/articles/qwen-image-2-1-edit-pixel-perfect-output-resolution)

**In-betweens and interpolation**
- Alonso & Patow (arXiv 2610.16423, 12 Oct 2026) use a ~10M-parameter U-Net on RGBA input with premultiplied alpha and separate RGB and alpha warping. On 42 test triplets, mean FLIP was 0.258 versus 0.313 for RIFE and 0.449 for Lucas-Kanade (lower is better). Walk cycles scored best (0.198). RIFE adds "subtle blur and color bleeding" on sprites. There is no discrete-palette loss, so palette adherence is indirect. The code is on GitHub (NethamGH/deepinterframes_neural_sprite_inbetweening); the dataset is not released. The train/test split is not source-disjoint, and the baselines were not retrained — [arXiv 2610.16423](https://arxiv.org/html/2610.16423)

### Inferences (concrete automatic algorithms for the three observed defects)
All of this is **[inference]**: designs built from the primitives above, not taken from a source.

- **A. Pixelize every frame with the base frame's grid.**
  - Register each frame to the base in *render space* before pixelizing. Use phase correlation on a torso and head crop, or the "Measure Drift"-style dx/dy.
  - Then sample every frame with the base frame's detected grid (offset and scale) instead of re-detecting the grid per frame. Per-frame grid detection is where a 0.5 art-px shift turns into a thinner eye.
  - Prefer `dominant` or a PixelOE-style contrast/min-darkness downscale, so 1-px dark features (pupils, outline) are not voted away.
- **B. Head/face lock at art-px resolution, after quantisation to palette indices.**
  1. On the base frame, define the head mask once. For example: all opaque rows above the narrowest row between the head and shoulders in the alpha width profile, or a one-time BiRefNet/segmentation pass. Also define an eye sub-mask: the darkest palette indices inside the head's upper half.
  2. For each frame, search integer offsets (dx, dy ∈ [−3, 3] art-px) that minimise the mismatch count of palette indices inside the head mask. Optionally weight outline and eye pixels by 3.
  3. If the best mismatch is below a threshold (e.g. ≤10% of head pixels), paste the base head verbatim at that offset. This keeps head bob but kills eye and face boiling.
  4. If the mismatch is above the threshold (head turned, deliberate expression), do not paste the whole head. Paste only the eye sub-mask, and only if its local neighbourhood matches. Otherwise flag the frame for regeneration.
  5. This directly fixes defects (1) and (2) without any face-only edit pass.
- **C. Snap near-unchanged pixels back to the base (anti-boiling).**
  1. After head lock and integer alignment, compute the per-pixel index difference with the base.
  2. Label connected components of changed pixels.
  3. Revert components of ≤2–3 px that lie outside the "intended motion" mask. That mask is the large changed components, i.e. the limbs, dilated by 1 px.
  
  This is the WepeNerd min-region rule plus Pixel Art Studio hysteresis, applied at art-px scale.
- **D. Ground contact (defect 3).**
  - Do not register whole bodies by colour overlap. Overlap with an upright base pulls a crouching body *up*, because maximising overlap favours aligning the head and torso.
  - Vertical: shift each grounded frame so its lowest opaque row in the feet columns equals the base baseline. Exempt frames tagged as airborne (jump).
  - Horizontal: root-lock on the torso-band column centroid (agent-sprite-forge `torso-x`), not on the whole-body or alpha-weighted centroid, which arm swing biases.
  - Never rescale per frame. Use one global scale (chongdashu).
- **E. Palette lock.**
  - Build the character palette from the base frame only, with a reserved outline index and reserved eye indices.
  - Map every frame by nearest colour in OKLab (or Lab) with `fixed_palette`, and forbid new colours.
  - Check palette drift between the first and last frames.
- **F. Outline normalisation to a consistent 1-px dark outline.**
  1. Compute the silhouette from alpha (threshold ~200, as in unfake's example).
  2. Set every opaque pixel 4-adjacent to transparency to the outline index.
  3. Replace outline-index pixels that are not adjacent to transparency and not inside protected masks (eyes, mouth, deliberate interior lines taken from the base) with the most common non-outline neighbour.
  4. Remove isolated opaque pixels and jaggies (unfake `jaggy`, plus a minimum component size of 2).
  5. Re-run head lock after this step, so the face stays byte-identical.
- **G. QA gates (flag rather than silently fix).**
  - Silhouette IoU vs base after alignment.
  - Head exact-match percentage.
  - Palette size equals the base palette size.
  - Bounding-box height ratio within the expected range per pose (crouch < 1, others ≈ 1).
  - Lowest-row equality.
  - Loop seam: last→first difference comparable to the mean adjacent difference.
  
  Failures go back into the prompt or the regeneration queue, perfectpixel-studio style.
- **H. In-betweens.** Do not use RIFE or FILM on pixel art (blur and palette violations). If in-betweens are needed, generate them at render resolution with the same masked-edit approach, or try the Alonso & Patow model, then run steps A–F.

### Gaps
- No public implementation was found of head template-matching and pasting, or of automatic 1-px outline normalisation, specifically for AI sprite frames. These are reasonable designs, not cited practice.
- The Pixel Art Studio node's hysteresis threshold and code could not be inspected (no repo link found).
- The unfake.js `morph` and `jaggy` internals and the Pixel Snapper grid algorithm are not documented in their READMEs. Reading the source would be the next step.

---

## 3. Dedicated tools: how they keep frames (and faces) stable, and their documented limits

### Takeaway
Dedicated tools get consistency mostly from *structure*, not from magic. PixelLab freezes frames, can copy the head ("Fixed head"), inpaints, uses skeletons and supports target palettes. Retro Diffusion uses fixed per-style layouts, sizes and palettes. Scenario and Pixie use video models that keep the input as frame 1. Ludo and God Mode publish no verifiable consistency mechanisms or limits.

### Cited Findings
- **PixelLab, Animate with skeleton:**
  - Canvas sizes: 256, 128, 64, 32 or 16 px square.
  - Modes: freeze 1 → generate 2; freeze 2 → generate 1; custom freeze/inpaint per frame.
  - "Fixed head: always" copies the reference head.
  - Options include seed, target palette, init image and guidance weight.
  - Skeleton estimation "isn't perfect and might require some touch ups".
  - Requires Tier 1.
  
  Source: [PixelLab docs](https://www.pixellab.ai/docs/tools/animate-with-skeleton). Skeletons can be saved and reused across characters — [PixelLab skeleton animation](https://www.pixellab.ai/docs/tools/skeleton-animation)
- **PixelLab, Animate with text (New):**
  - "The input image is always kept as frame 1."
  - 4–16 frames, even counts only. Reference image up to 256×256, with width × height × frames ≤ 524,288 (256² → 4–8 frames; 64² → 16).
  - Options: seed, remove background.
  - Described as "faster … smoother, more natural motion" **[vendor]**.
  - No known issues listed.
  
  Source: [PixelLab docs](https://www.pixellab.ai/docs/tools/animate-with-text-new). The legacy text animation was fixed at 64×64 **[third-party MCP listing]** — [glama](https://glama.ai/mcp/servers/rabbitcannon/pixellab-forge-mcp/tools/animate_with_text)
- **Retro Diffusion, RD Animation:**
  - Outputs a grid sprite sheet per generation, at low frame counts.
  - "Each style has a dedicated look and format, ensuring positioning and action consistency."
  - An input palette enforces strict colours.
  - Image references "are not used as direct starting images".
  
  Source: [Replicate readme](https://replicate.com/retro-diffusion/rd-animation/readme). Its four-direction walking style uses 4-frame cycles and is limited to 48 px width; there is a 32×32 small-sprites style **[search summary of Replicate listing]** — [Replicate rd-animation](https://replicate.com/retro-diffusion/rd-animation). The models were trained "in collaboration with experienced pixel artists" and came to Replicate in Nov 2025 — [Replicate blog](https://replicate.com/blog/retro-diffusions-pixel-art-models-are-now-on-replicate). No training or consistency method has been published.
- **Scenario:**
  - Video route (Seedance/Pixverse, first and optionally last frame) with key-pose extraction. "Motion may be slow or slightly imperfect" — [Scenario help](https://help.scenario.com/articles/9088582240-create-spritesheets-with-scenario)
  - The Pixelate tool sets grid size and a custom palette that can be locked and reused across assets — [Scenario blog via search](https://www.scenario.com/blog/pixelate-tool-scenario)
  - Pixel Snapper is integrated — [Scenario help](https://help.scenario.com/articles/1753861053-pixel-snapper-the-essentials)
  - RD Animation is also offered — [Scenario model page](https://www.scenario.com/models/retro-diffusion-animation)
- **Pixie.haus:** I2V (Seedance/Wan 2.2), grid-specific spritesheet models at 32/48/64/96 px, and RD Animation. Documented failure modes are morphing, camera drift and grid breakage — [pixie.haus](https://pixie.haus/resources/creating-movement-engineering-pixel-art-animation-ai)
- **Ludo.ai:** animated sheets from a prompt, from user-controlled keyframes, or from motion transfer (preset or video). There is no documentation of consistency limits — [Ludo docs](https://ludo.ai/docs/game-asset-generation). Ludo's comparison page claims a competitor (AutoSprite) has "characters can drift between the input image and the animation" **[vendor marketing]** — [Ludo vs AutoSprite](https://ludo.ai/compare/ludo-vs-autosprite)
- **God Mode AI:** marketing only ("upload a character design, select actions, download sprites"; from $19/mo). No independent consistency tests were found **[vendor]** — [search summary; godmodeai mirror](https://backiee.wasmer.app/https_godmodeai_co)
- **SpriteCook:** rejects poses whose implied grid mismatches the character resolution and refunds credits **[vendor]** — [SpriteCook](https://www.spritecook.ai/blog/why-ai-cant-match-pixel-art-resolution)
- **Sloyd:** claims to lock "identity, outfit, palette, proportions, camera, and scale to the opening pose" **[vendor]** — [Sloyd](https://www.sloyd.ai/spritesheet-generator)

### Inferences
- **[inference]** The PixelLab "Fixed head" plus freeze/inpaint design is the commercial version of "freeze the head, regenerate only the limbs". It is evidence that the leading pixel-specific tool also does not trust the model to keep faces stable unaided.
- **[inference]** Retro Diffusion's stability comes from a narrow output contract: fixed layout, size and palette, with no arbitrary reference-as-init. That conflicts with the need to animate *an existing* character, so it is a poor fit for an existing townsfolk roster.

### Gaps
- No primary documentation was found for God Mode AI's or Ludo's consistency mechanisms, nor any independent tests of them.
- Retro Diffusion's animation training and consistency method is unpublished.

---

## 4. Known failure modes of image-edit models for sprites, and mitigations

### Takeaway
The dominant failures are geometric drift (shift and zoom from mismatched latent sizes), whole-image re-rendering (outline thinning, shading shifts, face redraws), drift accumulating over chained edits, and implied-grid changes on redraws. Most are reduced far more by pipeline mechanics than by prompt wording: native-size references, multiple-of-16/32 sizes, editing from the base, and diff-mask compositing.

### Cited Findings
- **Re-rendering of unchanged regions.** Qwen-Image 2.1 under the default setup changed 12.8% of pixels outside the faces in an expression edit, and 2.6–2.7% with aligned grids. Residual lines followed contours, with outlines "slightly thinner" — [lilting.ch 2.1](https://lilting.ch/en/articles/qwen-image-2-1-edit-pixel-perfect-output-resolution). The model "re-emits the whole frame" — [lilting.ch ReferenceLatent](https://lilting.ch/en/articles/qwen-image-edit-pixel-perfect-referencelatent). VAE encode/decode is lossy, so untouched regions come back "close but not identical" — [comfy.icu LockPixelPadImage](https://comfy.icu/node/LockPixelPadImage)
- **Scale/size growth.** Stock-node pose edits grew bodies by about 2%, and one head touched the top edge — [lilting.ch](https://lilting.ch/en/articles/qwen-image-edit-pixel-perfect-referencelatent)
- **Cross-talk.** Editing two characters' expressions at once leaked between them — [lilting.ch](https://lilting.ch/en/articles/qwen-image-edit-pixel-perfect-referencelatent)
- **Chained-edit drift.** The FLUX.1 Kontext paper shows identity similarity falling over successive edits, more slowly than in competitors — [arXiv 2506.15742](https://arxiv.org/html/2506.15742v2). BFL reportedly shows degradation after six sequential edits and recommends shorter edit chains **[unverified; via Vercel model page]** — [Vercel](https://vercel.com/ai-gateway/models/flux-kontext-pro). A 2026 paper attributes multi-turn drift mainly to the DiT injecting "dominant low-frequency drift" rather than to the VAE. It proposes training-free VAE-LFA: low-pass filter the latent differences between rounds and align their low-frequency statistics to an EMA of previous rounds — [arXiv 2605.08250](https://arxiv.org/abs/2605.08250)
- **Implied pixel-grid change on redraw.** A pose comes back on a different pixel size, and "every frame inherits the degraded resolution" — [SpriteCook](https://www.spritecook.ai/blog/why-ai-cant-match-pixel-art-resolution)
- **Flicker from tiny outline and shading shifts.** "Tiny shifts in outline, shading bands, or anatomy will flicker like crazy once you animate it" **[forum opinion]** — [chronocrash forum](https://chronocrash.com/forum/goto/post?id=111189). "Watch for inconsistent outlines and isolated pixels that flicker between frames" — [Geek Vibes Nation](https://geekvibesnation.com/nano-banana-pro-sprite-sheets-make-the-walk-cycle-work/)
- **Inventing or dropping details.** The back view loses a scarf, and hair or headwear gets cut off — [svntax LoRA card](https://huggingface.co/svntax-dev/pixel_spritesheet_4walk_small_lora_v1/blob/main/README.md). A gun disappears and hairstyles degrade — [Sprite Sheet Diffusion](https://arxiv.org/html/2412.03685v2). A backpack switches shoulders, a frame is missing from the sequence, and the loop seam snaps — [Geek Vibes Nation](https://geekvibesnation.com/nano-banana-pro-sprite-sheets-make-the-walk-cycle-work/)
- **Model-specific notes from a secondary source:** GPT Image 1.5 frame sizes vary; Nano Banana 2 "may struggle with complex directions"; isometric sprites remain "an open problem" — [openskillindex](https://openskillindex.com/skills/jamditis-claude-skills-journalism-animated-sprite-gen)
- **Alpha.** Qwen-Image 2.1 does not produce clean alpha: background alpha is 1–8, not 0, and white garments stay opaque. A colour-threshold removal would also erase white clothing — [lilting.ch 2.1](https://lilting.ch/en/articles/qwen-image-2-1-edit-pixel-perfect-output-resolution). Fake checkerboard or opaque backgrounds leave halos around boots and scarves — [Geek Vibes Nation](https://geekvibesnation.com/nano-banana-pro-sprite-sheets-make-the-walk-cycle-work/)
- **Prompt mitigation is weak once grids are fixed.** The "keep everything else" clause had no measurable effect — [lilting.ch](https://lilting.ch/en/articles/qwen-image-edit-pixel-perfect-referencelatent). Prompts should name the view, action, pose count, direction, invariant features, fixed scale, fixed ground level, plain background, and "no labels, panel borders, or perspective changes" — [Geek Vibes Nation](https://geekvibesnation.com/nano-banana-pro-sprite-sheets-make-the-walk-cycle-work/). For I2V, describe the motion rather than the character, and add "seamless loop" and "static camera" — [pixie.haus](https://pixie.haus/resources/creating-movement-engineering-pixel-art-animation-ai)

### Inferences
- **[inference] Defect (2), an eye getting thinner in an action frame**, is consistent with two documented effects: outline and thin-line thinning in Qwen-Image 2.1 re-renders, and the ~0.5 art-px phase shift described in §1. Keeping only the changed face rows from a local edit can still import a thinned eye if the edit touched those rows. A lock against the base frame's eye indices (§2 B) is more robust than a row-level diff.
- **[inference] Defect (3), crouch floating**, is caused by registration (colour-overlap maximisation), not by generation. A feet-baseline alignment fixes it deterministically (§2 D).
- **[inference]** For BiRefNet matting on 768 px renders, run the matte at render resolution and binarise alpha *before* pixelization. Do not rely on Qwen's alpha.

### Gaps
- No controlled measurement exists of eye or face drift for tiny (<64 px) sprites across edit models. All quantitative drift data found concerns ~1 MP anime/line-art images (lilting.ch).
- The VAE-LFA paper's abstract page does not name its test models or give numbers. Its applicability to Qwen-Image 2.1 is unverified.

---

## 5. Research papers 2024–2026 on consistent character/sprite animation

### Takeaway
Academic work specific to sprites is thin. Sprite Sheet Diffusion (2024/25) is the reference point; it adapts Animate Anyone and still struggles with fine details and subject consistency. A sprite in-betweening U-Net (Oct 2026) beats RIFE on pixel art. General multi-turn edit-drift work (Kontext 2025, VAE-LFA 2026) explains chained-edit degradation. Nothing found addresses temporal consistency of pixel art generated by diffusion at ~32–64 px directly.

### Cited Findings
- **Sprite Sheet Diffusion** (Hsieh, Zhang, Yan; arXiv 2412.03685, v2 Mar 2025):
  - Method: ReferenceNet (SD-based, spatial attention) for appearance; a 4-conv Pose Guider; and a Motion Module. Stage 1 trains pose-to-image; Stage 2 trains only the motion module.
  - Data: 152 action sequences, 3–8 frames each, from GameArt2D and SpriteDatabase.
  - In-sample results: fine-tuned Animate Anyone SSIM 0.659, PSNR 18.405, LPIPS 0.125, subject consistency 0.901. The SD+IP-Adapter+ControlNet baseline scored SSIM 0.421 but subject consistency 0.910.
  - Out-of-sample: Stage-1-only subject consistency 0.931 > full model 0.893, which the authors attribute to Stage 2 overfitting.
  - Limitations: weak on "finer details like hairstyles", props disappear, small dataset. The paper does not address pixel art specifically.
  
  Source: [arXiv 2412.03685](https://arxiv.org/html/2412.03685v2)
- **Low-Cost Deep Learning for Automated Keyframe Interpolation in Sprite Animation** (Alonso, Patow; arXiv 2610.16423, Oct 2026): U-Net in-betweener trained on 280 triplets, at 32×32 to 256×256. FLIP 0.258 vs RIFE 0.313. Code is public; data is not. Temporal consistency across sequences is untested — [arXiv 2610.16423](https://arxiv.org/html/2610.16423)
- **FLUX.1 Kontext** (arXiv 2506.15742, 2025): multi-turn identity drift measured with AuraFace similarity; slower drift than competitors — [arXiv](https://arxiv.org/html/2506.15742v2)
- **Why Do DiT Editors Drift? VAE-LFA** (arXiv 2605.08250, 2026): low-frequency drift comes from the DiT. A training-free latent low-frequency alignment to an EMA of previous rounds works with white-box and black-box editors — [arXiv](https://arxiv.org/abs/2605.08250)
- **Adjacent work on character animation from stylised art (not pixel-specific):** AniDoc (CVPR 2025, line-art video colourisation), MikuDance (ICCV 2025, animating character art with mixed motion), Animate-X (ICLR 2025, animating various character types) — [CVF AniDoc](https://openaccess.thecvf.com/content/CVPR2025/html/Meng_AniDoc_Animation_Creation_Made_Easier_CVPR_2025_paper.html), [CVF MikuDance](https://openaccess.thecvf.com/content/ICCV2025/html/Zhang_MikuDance_Animating_Character_Art_with_Mixed_Motion_Dynamics_ICCV_2025_paper.html), [Animate-X mirror](https://gitee.com/monkeycc/animate-x)
- **Low-res quantised image generation:** SD-πXL (arXiv 2410.06236) generates low-resolution quantised imagery via score distillation. It covers still images, not animation (seen only as a search listing) — [arXiv 2410.06236](https://arxiv.org/pdf/2410.06236)
- **AnimationBench** (arXiv 2604.15299, 2026) evaluates whether video models are good at character-centric animation (title only; not read) — [arXiv](https://arxiv.org/html/2604.15299v1)
- **Contrast-aware outline expansion for pixelization** (PixelOE, open-source method; no peer-reviewed paper found) — [GitHub](https://github.com/KohakuBlueleaf/PixelOE)

### Inferences
- **[inference]** The paper results support the pipeline-level conclusion: appearance conditioning (ReferenceNet, IP-Adapter, multi-reference) keeps *style* and coarse identity, but not pixel-exact faces at tiny scale. Byte-exact face stability has to come from compositing or locking, not from the generator.
- **[inference]** The Sprite Sheet Diffusion ablation (Stage-1-only had the best subject consistency) suggests that adding temporal or motion modules trained on small data can *reduce* identity consistency. That is a caution against video-model routes for a fixed roster without heavy post-locking.

### Gaps
- No 2024–2026 paper was found on diffusion-generated pixel-art animation with explicit palette or grid temporal consistency.
- AnimationBench and SD-πXL were seen only as listings and were not read.
- Sprite Sheet Diffusion's code and weights availability was not checked.
