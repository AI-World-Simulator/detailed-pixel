# AI-assisted pipelines for 2D character / sprite animation without hand drawing (state as of Oct 2026)

Scope: small loops (idle, walk, talk, gesture; 4–12 frames), two characters interacting, all art from AI image models. Project context: a browser-based world simulator in a "detailed pixel" style. The developer runs MLX/mflux locally on an M3 Max with 64 GB (Z-Image-Turbo, Qwen-Image 2.1 Edit). The existing `tools/ai/sprites.py` cuts sprites from AI sheets and pixelizes them with a BOX area-downscale plus a **per-sprite** median-cut palette (14 colours by default). I read that from the local file; it is not a web source.

Research note: research ran on 2026-10-17. Many sources in this space are vendor blogs or competitor comparison pages, and they are flagged as such. I found no independent benchmark comparing these tools on animation consistency. Reddit threads (r/aigamedev, r/StableDiffusion) did not surface in the search index, so community evidence comes mostly from itch.io devlogs, Hacker News, Civitai and Hugging Face model cards.

---

## 1. Dedicated AI pixel-art animation tools (PixelLab, Retro Diffusion, Ludo, Scenario, God Mode AI, Sprite-AI, others): what they produce, frame counts, consistency, pricing/licensing, API

### Takeaway
Only two tools generate animation **natively on a real pixel grid** and expose it through an API with explicit frame counts: **PixelLab** (skeleton-guided and text-guided, 3–16 frames up to 256 px, plus 4/8-direction rotations) and **Retro Diffusion** (start-frame-driven walk/idle/jump/attack/custom actions, 4–16 frames up to 256 px). Ludo, Scenario, God Mode AI and AutoSprite are essentially **image-to-video pipelines with frame extraction and cleanup**. They are fine for larger or smoother sprites, but they inherit video-model morphing. Sprite-AI does not animate at all. None of these is local or open. All are cheap per call (cents), and their licences allow commercial use, which is more than this non-commercial project needs.

### Cited Findings

**PixelLab**
- Product surface: a web creator, an in-browser editor (PixelLab Pixelorama), an Aseprite extension and an API. Docs list these animation tools: Animate with text (New/Pro/old), Create animated object/character (Pro), Animation to animation, Animate with skeleton, Edit animation (Pro), Transfer outfit (Pro), Re-pose, Interpolate, Create animations (automatic), Rotate, Create 8-directional sprite (Pro), and an experimental "Create walking character". — [PixelLab docs](https://www.pixellab.ai/docs)
- How skeleton animation works. You set the character as the reference, which auto-estimates a skeleton. You then pick an animation template or copy poses from an existing animation ("Animation to animation") and edit keypoints manually. Generation modes are "Freeze 1 → Generate 2 frames" (the recommended first pass), "Custom" (choose which frames are frozen and which are inpainted, e.g. to fix only an arm) and "Freeze 2 → Generate 1". The docs note that more guidance frames generally give better results. Consistency tips: set "fixed head = always" when the head should not change, and iterate (generate → rough manual fix → regenerate using those frames as init images with inpainting, raising init strength). Options include guidance weight, camera view, **target palette**, init image and seed. The canvas must be 16/32/64/128/256 px, and Tier 1 or higher is required. — [PixelLab docs: Animate with skeleton](https://www.pixellab.ai/docs/tools/animate-with-skeleton)
- API endpoints and prices (USD estimates, all under `/v2/`):
  - `animate-with-skeleton-v3`: up to 256×256, 3–15 frames, $0.0436 (3 f) / $0.0513 (8 f) / $0.0622 (15 f).
  - Older `animate-with-skeleton`: up to 128 px, about $0.014–0.016.
  - `estimate-skeleton`: about $0.005.
  - `animate-with-text-v3`: up to 256 px, 4–16 frames. Example prices: 32 px/4 f $0.0221, 128 px/16 f $0.0424.
  - `animate-pixminimax`: up to 256 px, 4–40 frames in multiples of 4, $0.018–0.079. Labelled "Powered by MiniMax H3", beta, Tier 1+.
  - `animate-character` / `animate-object`: v3 is 4 frames at 64 or 128 px, about $0.013–0.0145 per direction. Pro is $0.08–0.15 per direction.
  - `animate-with-text-v2` (Pro): 4, 9 or 16 frames, $0.08–0.15.
  - `edit-animation-v2` (2–16 frames), `interpolation-v2` and `transfer-outfit-v2` (Pro).
  - `generate-8-rotations-v3`: up to 256 px, $0.029–0.038.
  - `inpaint` and `vfx` (up to 32 frames).
  - Prices vary with GPU time. Skeleton v3 and PixMiniMax are beta. — [PixelLab API](https://pixellab.ai/pixellab-api)
- An MCP integration exists: the API page links to `/mcp` and recommends MCP for VFX. A community npm `pixellab-mcp` package exposes skeleton estimation. — [PixelLab API](https://pixellab.ai/pixellab-api); [pixellab-mcp on npm](https://npmjs.com/package/pixellab-mcp)
- Licence (FAQ): generated images can be used commercially, including in Steam games. The only stated restriction is "do not train new models with the images". The FAQ does not explicitly address ownership. — [PixelLab FAQ](https://www.pixellab.ai/docs/faq)
- Subscription pricing (Sep 2026 comparison): 40 trial generations; $12/mo (2,000 generations), $24/mo and $50/mo (10,000 generations). — [Cinevva comparison, Sep 2026](https://app.cinevva.com/guides/ai-pixel-art-generators). Other sources give conflicting figures, including $9–50/mo and 20 free generations ([AlternativeTo](https://alternativeto.net/software/pixellab/about); [80.lv, older](https://80.lv/articles/easily-create-pixel-art-based-on-sketch-with-this-ai-tool-for-aseprite/)).
- The same comparison calls PixelLab "the only one that treats a sprite as a skeleton you can pose and rotate rather than a picture" and says it generates on a true pixel grid. This is affiliate-style content. — [Cinevva](https://app.cinevva.com/guides/ai-pixel-art-generators)

**Retro Diffusion**
- API animation styles:
  - `rd_advanced_animation__{walking, idle, jump, crouch, attack, destroy, subtle_motion, custom_action}`: a start frame is **required**, 32–256 px, **4/6/8/10/12/16 frames**. $0.14 per call; custom_action and subtle_motion are $0.25.
  - `rd_advanced_animation__rotate`: fixed 8 views, $0.10.
  - Prompt-only styles: `rd_animation__battle_sprites`, `__vfx`, `__four_angle_walking` (48 px only), `__four_angle_walking_idle` (48 px), `__small_sprites` (32 px, batch ≤16), each $0.07. `__any_animation` (64 px), `__big_animation` (128 px) and `__8_dir_rotation` are $0.25 each.
  - `return_spritesheet: true` returns a PNG sheet instead of a GIF. `input_palette` is supported, `remove_bg` works, and transparent start frames produce transparent GIFs.
  - `reference_images` is limited to RD Pro styles.
  - Billing is prepaid USD, and failed generations are refunded automatically. — [Retro-Diffusion/api-examples (GitHub)](https://github.com/Retro-Diffusion/api-examples)
- RD Animation on Replicate: grid-aligned, limited-colour sprite sheets in per-style layouts (walking+idle, small sprites); low frame rates "that match established conventions". Image references "are not used as direct initial images", an input palette gives strict colour adherence, and each style supports only specific sizes. The model was last updated about 11 months ago. — [Replicate rd-animation readme](https://replicate.com/retro-diffusion/rd-animation/readme)
- MCP server: walk/idle/jump/crouch/attack cycles from a start frame, four-angle walks, 8-direction rotations, VFX, battle sprites. For a consistent character, generate it with RD Pro first and pass that as the reference. — [Retro Diffusion MCP listing](https://mcpservers.org/servers/retro-diffusion/retro-diffusion-mcp)
- Pricing: Aseprite extension $20 Lite or $65 full (one-time, runs locally, output belongs to the user). Web credits run from $5 for 250 to $50 for 3,500, with 50 free credits. — [Cinevva, Sep 2026](https://app.cinevva.com/guides/ai-pixel-art-generators)
- Conflict: pixie.haus says "Retro-Diffusion does not accept reference images; it generates character and animation simultaneously from text". That matches the prompt-only `rd_animation__*` styles but not the newer `rd_advanced_animation__*` styles, which take a start frame. — [pixie.haus (vendor, undated)](https://pixie.haus/resources/creating-movement-engineering-pixel-art-animation-ai) vs [api-examples](https://github.com/Retro-Diffusion/api-examples)
- Retro Diffusion models are also hosted inside Scenario. — [Scenario help: Retro Diffusion models](https://help.scenario.com/articles/4202673551-retro-diffusion-models-the-essentials)

**Ludo.ai**
- Sprite animation offers four modes: preset motion ("Transfer Motion", e.g. Run Forward or Sword Slash), motion from an uploaded video, Keyframe Animation (first, middle and final frames), and Edit Spritesheet (restyle while keeping motion).
- Clips are up to 5 s and billed per second of animation. Tools include "Fix Loop", "Improve Details" and Directional Sprites (up to 8 directions). The Forge Pixel model offers a pixel grid of typically 64/96/128 px.
- Exports: PNG sheet, sheet + JSON atlas, GIF, frame ZIP and MP4.
- REST API and MCP are available on the Pro/Studio plans. The licence is nonexclusive, worldwide, personal and commercial. — [Ludo docs: game asset generation](https://ludo.ai/docs/game-asset-generation)
- Pricing (vendor page): Indie $20/mo with 250 credits; Pro $50/mo with API/MCP. Video and sprite generation cost roughly 0.6–2.6 credits per second. Example sheets have 25–36 frames. — [Ludo: best AI sprite generators (vendor)](https://ludo.ai/compare/best-ai-sprite-generators). Another source says $15/mo annual Indie with 3,000 credits/yr, no free tier. — [Cinevva](https://app.cinevva.com/guides/ai-pixel-art-generators)
- Ludo's own comparison says AutoSprite (the "animate existing character → sprite sheet" specialist) costs $12/mo Starter with 500 credits and $29/mo Pro with API/MCP. That is a competitor's claim. — [Ludo vs AutoSprite](https://ludo.ai/compare/ludo-vs-autosprite)

**Scenario**
- The official guide (updated Aug 17, 2026) makes sprite sheets by generating a side-view base image, producing a video clip with Seedance or Pixverse (Nano Banana for stills), and **extracting key poses from the video**. It warns that motion "may sometimes be slow or slightly imperfect". — [Scenario help: Create spritesheets](https://help.scenario.com/articles/9088582240-create-spritesheets-with-scenario)
- Scenario's agent skill lists routes by the control you need:
  - Purpose-trained pixel animation model: GIF preview, then a same-seed spritesheet re-run, then slicing.
  - High-adherence general image model with a written grid spec: one run, slice, snap each tile, assemble.
  - First-and-last-frame video model fed the **same still at both ends** for seamless loops.
  - Keyframe video model to pin poses to frame indices.
  - Reference-to-video with a turnaround, reusing references and settings across actions.
  - The skill also notes that a bare prompt like "sprite sheet, walk cycle, 8 frames" returns a *picture* of a sprite sheet. — [Scenario sprite-animation skill](https://www.skills.sh/scenario-labs/skills/scenario-sprite-animation)
- Third-party competitor comparisons list Scenario as having no dedicated sprite-sheet animation tool. The free tier is personal-use only; Starter is $15/mo and Pro $45/mo. — [Cinevva](https://app.cinevva.com/guides/ai-pixel-art-generators); [SpriteCook vs Scenario (competitor)](https://www.spritecook.ai/compare/scenario)
- Scenario also sells a "2D animation rigging sheet" app that splits a character into separate consistent parts for Spine, Live2D or Moho. It produces parts, not a rig. — [Scenario app](https://scenario.com/apps/2d-animation-rigging-sheet)

**God Mode AI, Sprite-AI, others**
- God Mode AI (Show HN): takes one character image, lets you pick an action (run, jump, punch and so on) and outputs a sprite sheet. The author says improvements in image-to-video models made the results "exceed expectations". The thread has very little substantive discussion. — [HN: Show HN AI game animation sprite generator](https://news.ycombinator.com/item?id=44204181)
- God Mode AI pricing conflicts across sources: $12 credit packs per [Ludo comparison](https://ludo.ai/compare/best-ai-sprite-generators), and "from ~$10/mo" or "from $19/mo" per [The Daily Workflow](https://thedailyworkflow.com/service/God%20Mode%20AI). It claims 8-direction walk/run/combat support ([site mirror](https://backiee.wasmer.app/https_godmodeai_co)). Not verified from the official site.
- Sprite-AI: no animation. Generates on a true grid, $8/mo Creator. Sprixen: small animated sprites, true grid, $10/mo. Layer: limited animation. — [Cinevva](https://app.cinevva.com/guides/ai-pixel-art-generators)
- Vendor-only claims, unverified: Sorceress Auto-Sprite v2 generates a character, animates it with a video model and converts the clip to a sheet ([Sorceress wiki](https://sorceress.games/wiki/sorceress/auto-sprite-v2)). Several web "AI sprite sheet" sites (spritesheets.ai, aispritesheet.com, spritegen.ai and others) also exist with unverified claims ([HN search results listing](https://www.spritesheets.ai/)).

### Inferences
- For this project, **PixelLab skeleton v3** and **Retro Diffusion advanced animation** are the only paid options worth a trial. Both accept the developer's own AI-generated start frame, so the character design can stay in the local pipeline, and both enforce a palette (`target palette` / `input_palette`). At $0.05–0.14 per animation, a 10-character × 6-animation test costs single-digit dollars.
- PixelLab's tight sizes (≤256 px) and pixel-grid output fit classic pixel art. The memory notes say the project is drifting away from strict pixel art toward a "detailed" painterly-pixel look at arbitrary angles. If characters end up larger than about 128 px or less grid-strict, those tools lose their advantage and local edit-model pipelines become competitive.
- PixMiniMax ("Powered by MiniMax H3") is likely a video-model backend wrapped in pixel post-processing. That is an inference from the name; MiniMax is known for video models. It is not documented.
- Ludo, Scenario, God Mode and AutoSprite are all video-first. Expect 25–36-frame clips that need decimation to 6–8 frames and loop fixing.
- PixelLab's "do not train models on outputs" clause matters if the plan is to train a LoRA on outputs from any of these services.

### Gaps
- No independent, side-by-side quality evaluation of PixelLab and Retro Diffusion animation consistency. Reddit and HN user reviews did not surface.
- Retro Diffusion's per-style frame counts for prompt-only styles, and its output licence terms, are not stated in the API docs. Its website returned no content to the fetcher.
- God Mode AI and AutoSprite official pricing and frame counts were not verified from their own sites.
- PixelLab's licence for non-commercial research use is not explicitly addressed. Commercial use is allowed, so research use is presumably fine.
- Whether any of these tools handles a **two-character interaction** (handshake, conversation) in one generation: no documentation found. All examples are single-character.

---

## 2. Open-model approaches: sprite sheet on one canvas, edit models for pose variations, ControlNet/OpenPose, sprite-sheet LoRAs, video models → frames

### Takeaway
Of the local routes, the most effective one in 2026 is **"generate the whole cycle on one canvas"** with an edit model and a **pose/sheet template as the image to edit**, optionally with a sprite-sheet LoRA. The model then sees all frames at once, which gives shared identity, lighting and scale, and the template fixes the layout and the anchors. Per-frame editing ("same character, now left leg forward") drifts more. Video models (Wan 2.2) can produce smooth loops through first/last-frame conditioning, but for pixel art they morph and flicker. They are also slow on a Mac (tens of minutes per short clip), so treat them as a fallback for larger, painterly sprites. All key models now run locally via mflux, including **Qwen-Image 2.1 Edit with RGBA output, up to 10 references, masks and LoRA**.

### Cited Findings

**Local tooling (mflux, verified from the README on 2026-10-17)**
- Supported model families include:
  - Z-Image (Nov 2025, 6B; LoRA, training).
  - FLUX.2 Klein 4B/9B (Jan 2026; editing; LoRA incl. LoKr; training).
  - **FLUX 3 Image Klein** (Oct 2026, 5.6B; "editing with up to 10 reference images", bounding-box layouts).
  - Qwen Image (20B, edit).
  - **Qwen Image 2.1** (Sep 2026, 7.1B DiT + Qwen3-VL encoder; "multi-reference editing, LoRA, and RGBA").
  - FLUX.1 Kontext (legacy).
  - ControlNet Union for Z-Image and Qwen-Image-2.1. — [mflux README](https://github.com/filipstrand/mflux)
- Qwen-Image 2.1 edit in mflux (`mflux-generate-qwen-2.1-edit`):
  - Up to ten reference images, and **RGBA output via a 64-channel RGBA VAE**. RGBA references keep their alpha. Reference order is significant, and the last reference sets the aspect ratio when width and height are omitted.
  - `--mask-image` inpainting: unmasked latents follow the source's own noise trajectory and the final composite keeps them exact.
  - `--auto-mask "<object>"`, which uses Qwen3-VL to locate the region.
  - `--strength`.
  - `--verify --verify-retries N`: Qwen3-VL checks that the edit applied and the rest is unchanged, and regenerates otherwise.
  - LoRA loading, defaults of 40 steps (Turbo 8 steps) and dimensions in multiples of 32. The full checkpoint is about a 33 GB download. — [mflux Qwen-Image-2.1 reference editing README](https://github.com/filipstrand/mflux/blob/main/src/mflux/models/qwen21/reference/README.md)

**Sprite-sheet LoRAs**
- `svntax-dev/pixel_spritesheet_4walk_small_lora_v1` for **FLUX.2 Klein base 4B**, Apache-2.0.
  - Layout: a 4×4 grid. Rows 1–4 hold 3 walk frames each (down, left, right, up), and the fourth column holds extra poses (arms raised, jump left, jump right, lying down).
  - Generate at 512×512, then **downscale ×4 with k-centroid** to 128×128, for 32×32 characters.
  - The author advises against the distilled Klein because it "ruins the quality of the pixels and the consistency".
  - Two checkpoints: 3000 steps is more consistent on humanoids, 2750 more creative for non-humanoids "with edit and an image reference".
  - Known issues: hair or headwear cut off, bad anatomy on non-humans, an inconsistent back-view row.
  - Trained on sheets derived from a CC-BY-4.0 OpenGameArt template. — [HF model card](https://huggingface.co/svntax-dev/pixel_spritesheet_4walk_small_lora_v1/blob/main/README.md)
- `xocialize/spritesheet-FLUX.2-klein-4B-lora`: a mirror of fal's 2×2 sheet edit LoRA, which turns one object into four camera angles. It is for turnarounds, not walk cycles. — [HF](https://huggingface.co/xocialize/spritesheet-FLUX.2-klein-4B-lora)
- **SpriteForge v3** (LoRA for **Qwen-Image-Edit-2511**):
  - Input: a character reference plus a **4×4 template sheet** as the image to edit (1024×1024, 16 frames of 256×256). The prompt asks to "replace the character in the sheet with the one from the reference".
  - The pack contains 42 references, 22 templates covering idle, walk, kicks and punches, and 32 example outputs.
  - Templates were made from VRoid characters and Mixamo animations.
  - Works best with clear full-body references. Unseen extreme poses produce artifacts.
  - Hosted on ModelScope (`tantk7/spriteforgev3`), with the pipeline on GitHub. No licence is stated on the itch page. — [SpriteForge itch.io page](https://tantk.itch.io/spritesheet)
- "Lah Animation Sheet": LoRA for Qwen-Image-Edit 2509, Apache-2.0, 3×3 grids (some actions 3×2) of anime-style action sheets. Seen in search snippet only, not fetched. — [Civitai 2177558](https://civitai.com/models/2177558)
- CharacterSheet TripleView/QuadView LoRAs exist for multi-view character sheets. Seen in search results only; base model not verified. — [HF Alissonerdx/CharacterSheet](https://huggingface.co/Alissonerdx/CharacterSheet)
- BFL's guide says a FLUX.2 Klein style LoRA can be trained on 15–40 images sharing one look in under 60 minutes on a GPU. — [HF blog: Fine-tune FLUX.2 klein with a LoRA](https://huggingface.co/blog/black-forest-labs/flux-2-klein-lora)

**Grid-on-one-canvas prompting with general models**
- A bare "sprite sheet, walk cycle, 8 frames" prompt returns a *picture* of a sprite sheet. A written grid spec on a high-adherence model returns a usable sheet, which is then sliced and each tile snapped. — [Scenario skill](https://www.skills.sh/scenario-labs/skills/scenario-sprite-animation)
- Practical template used for production listings: "exactly 6 equal frames in ONE horizontal row, even spacing, centered per frame with padding, flat magenta background". — [Summer Engine asset listing](https://www.summerengine.com/asset-store/wind-spirit-fairy-6-frame-sprite-sheet-f974dd10). A Rosebud tutorial recommends "Align all frames on the same baseline" and checking the grid is evenly spaced. — [Rosebud blog](https://rosebud.ai/blog/how-to-create-a-sprite-sheet-with-ai-using-google-gemini-and-nano-banana-easy-guide)
- A sprite-sheet skill guide argues the opposite. It says models will render "a sprite sheet of a knight walking" with 8 frames, but inter-frame consistency (anatomy, costume, lighting) is poor and "usually looks worse than the static sprite". It recommends per-frame generation using the base frame as a reference. — [Summer Engine sprite-sheet skill](https://www.claudepluginhub.com/skills/summerengine-summer/sprite-sheet). This conflicts with the template/LoRA results above. The reconciling factor appears to be **whether a layout or pose template is supplied** (see Inferences).

**Pose-conditioned / research approaches**
- Sprite Sheet Diffusion (arXiv 2412.03685):
  - Adapts Animate Anyone (ReferenceNet + Pose Guider + Motion Module) to sprites, mapping a reference image and a pose sequence to frames.
  - Off-the-shelf pose detectors "performed poorly on exaggerated sprites", so poses were labelled manually.
  - Best SSIM is about 0.66. Weaknesses: hair and props (a gun disappeared), overfitting, a small dataset.
  - Code/weight release is not confirmed. — [arXiv HTML](https://arxiv.org/html/2412.03685v2)
- A game-jam devlog that used SD + ControlNet for animation found output "determined by the original input", which made it "constrained so you get similar results all the time". — [Bromberry devlog (2023)](https://bromberry.itch.io/dueling-dynasties/devlog/522129/we-made-animations-with-ai-stable-diffusion)
- mflux supports ControlNet Union for Z-Image and Qwen-Image-2.1, which includes pose-type conditioning in Union models. — [mflux README](https://github.com/filipstrand/mflux). That this covers OpenPose specifically for these two models is inferred from the "Union" naming; not verified.

**Video models → frames**
- Civitai "Sprite sheet generator v1.2" (ComfyUI): Wan 2.2 I2V on a 480×480 input, with **first-and-last-frame** conditioning for loopable cycles. It then applies chroma-key on a green screen, a ColorMatch step back to the original palette (against washed-out or green-tinted output), and ImageQuantize plus nearest-exact downscale to a 64×64 grid, then extracts selected frames into a horizontal sheet. — [Civitai post](https://civitai.com/posts/26933027)
- Video models produce "morphing" artifacts: pixels shift, colours blend, and the sprite "dissolves into a wobbly, anti-aliased mess". Image-to-video needs a transparent-background still or the model animates empty space. Prompt "static camera" and use action verbs plus "seamless loop". This is a vendor page. — [pixie.haus](https://pixie.haus/resources/creating-movement-engineering-pixel-art-animation-ai)
- Keep motion slow and subtle so pixel edges survive. — [Kling pixel-art guide (vendor)](https://kling.ai/topics/animate-pixel-art-ai)
- An itch.io developer using image → video → frame extraction → background removal reports the process was hard and took a long time. — [itch.io post](https://itch.io/post/14144159/view-in-topic)
- Speed on a Mac:
  - mlx-video supports Wan2.2 T2V-14B, TI2V-5B and I2V-14B, and the Wan2.2-Lightning LoRA allows about 4 steps. — [mlx-video](https://github.com/Blaizzy/mlx-video)
  - The Wan2.2-TI2V-5B MLX q8 conversion reports about **15 min for 720p × 41 frames × 20 steps** on a 64 GB Mac. — [HF Anes1032/Wan2.2-TI2V-5B-mlx-q8](https://huggingface.co/Anes1032/Wan2.2-TI2V-5B-mlx-q8)
  - GGUF Wan 2.2 on an M1 Max 64 GB took **82 min per 2-s clip**, and FP8 LTX-2 failed on Metal. — [lilting.ch](https://lilting.ch/en/articles/ltx2-wan22-mac-local-video-gen)

### Inferences
- **Recommended local recipe (inference, not a sourced recipe):**
  1. Generate a canonical character (Z-Image-Turbo or Qwen 2.1, RGBA).
  2. Build a **pose-template sheet** procedurally: a 1×N or 2×4 grid, a fixed cell size, a fixed ground line, and a grey-mannequin silhouette or stick-figure per frame. Script it from a hand-specified keyframe table or render it from a BVH/Mixamo clip as 2D skeletons. No hand drawing is involved.
  3. Run Qwen-Image 2.1 Edit with references = [character, template] and the prompt "replace the mannequin in every cell with the character from image 1, keep the cell layout and poses", with `--verify`.
  4. Slice on the known grid and post-process with a shared palette (section 3).
  
  This mirrors the SpriteForge method, which is demonstrated on Qwen-Image-Edit-2511. It has **not been verified on Qwen-Image 2.1, which is a different architecture, so SpriteForge LoRA weights will not load on it**.
- For **idle and talk** loops, the motion is small (breathing, mouth, blink). **Masked inpainting** of just the head or mouth region (`--mask-image` / `--auto-mask "mouth"`) on a fixed base frame should give near-zero drift, because unmasked pixels are composited back exactly. This is the cheapest high-consistency route for 2–4-frame talk cycles.
- For **walk** loops, the svntax FLUX.2 Klein LoRA is the only open, pixel-specific walk-sheet LoRA found. It targets 32 px characters and a 3-frame walk. Its existence, plus BFL's 15–40-image LoRA recipe and mflux's Klein LoRA training support, suggests a project-specific "walk sheet in our style" LoRA is trainable locally. It would need training sheets, which could come from PixelLab or Retro Diffusion outputs; PixelLab's ToS forbids training on its outputs.
- **Video models are the wrong default here.** They are slow on M3 Max (expect tens of minutes per clip for 14B), they need decimation from about 24 fps to 6–8 frames, they morph identity, and they require heavy colour matching. They are worth it only for longer, smooth, non-pixel motions, if the style moves further from pixel art.
- **Two characters interacting:** no source shows reliable joint generation. The pragmatic approach is to animate each character separately on its own anchor, choose loops whose contact points are loose (talk, gesture, nod), and compose them in the engine with offsets and z-order. Generating both characters on one canvas doubles identity-drift risk and requires segmentation afterwards.

### Gaps
- No published side-by-side test of Qwen-Image 2.1 Edit (or FLUX 3 Image Klein) on sprite-sheet consistency. Both models are new (Sep and Oct 2026).
- No open sprite-sheet LoRA for Qwen-Image 2.1 was found.
- No source gives a working OpenPose ControlNet for Qwen-Image-2.1 or Z-Image in mflux specifically. Union ControlNet support is stated, but pose-mode quality on stylised sprites was not found.
- No Wan 2.2 14B I2V timing on an M3 Max specifically.
- FLUX.1 Kontext pixel-art sprite tests: only SEO and marketing content was found ([Segmind blog](https://blog.segmind.com/create-consistent-character-with-flux-1-with-1-image/)). Not reliable.

---

## 3. Post-processing: pixelization, shared palette across frames, anchor alignment, alpha cleanup, atlas building

### Takeaway
Animation needs three things that single sprites do not: (1) **one palette for all frames** of a character (ideally a project palette), mapped without dithering; (2) **one pixel-grid scale and phase** for all frames; (3) **a stable anchor** (foot or ground line) applied before downscaling. Mature open tools (unfake, perfectPixel, Pixel Snapper, ComfyUI-PixelArt-Detector) handle grid detection, dominant-colour downscale and quantization. unfake accepts a **fixed palette file**, which is the hook for a shared palette. None of them documents multi-frame or animation-aware processing, so batching consistency is the pipeline's job.

### Cited Findings
- unfake.js and its pipeline:
  - Scale detection: Sobel edges on the highest-variance tiles, then 1D profiles, then a histogram of peak spacings.
  - Grid-offset search and crop, then Wu quantization (image-q).
  - Downscaling by **dominant-colour voting** per block: the winner must beat the runner-up by more than 5%, otherwise the block takes the mean RGB.
  - Optional morphological cleanup, plus a second quantization pass after downscaling.
  - Alpha and animation frames are not covered. — [dev.to: How to tame your AI pixel art](https://dev.to/jenissimo/how-to-tame-your-ai-pixel-art-3pk5); repo github.com/jenissimo/unfake.js
- unfake (Python, MIT, v1.0.7, Oct 2025, Rust-accelerated): `--palette file.txt` (hex per line) / `fixed_palette=[...]`, `-c N` max colours, `--auto-colors`, downscale methods `dominant|median|mode|mean|content-adaptive`, `--alpha-threshold`, `--transparent-background` (edge flood fill), `--scale` to force the factor, `--no-snap`, `--cleanup morph,jaggy`. Batch processing is not documented. — [PyPI unfake](https://pypi.org/project/unfake/)
- perfectPixel (MIT, Python, about 2.2k stars): grid size from the **FFT magnitude**, refined with Sobel edges; `center|median|majority` sampling; manual `grid_size` override. A ComfyUI node exists. Palette handling and batch support are not documented. — [GitHub theamusing/perfectPixel](https://github.com/theamusing/perfectpixel)
- ComfyUI-PixelArt-Detector (about 318 stars, based on Astropulse/pixeldetector): downscale, palette swap, dithering, restore. — [GitHub dimtoneff](https://github.com/dimtoneff/ComfyUI-PixelArt-Detector)
- Sprite Fusion Pixel Snapper: an MIT Rust tool that snaps to the grid and quantizes with k colours. — [Scenario help: Pixel Snapper](https://help.scenario.com/articles/1753861053-pixel-snapper-the-essentials)
- Typical AI pixel-art defects:
  - Output is about 1024 px but not snapped to a consistent grid; "some pixels 6px wide, others 7px".
  - Fake pixels and colour bleeding.
  - Extra subtle colour variations.
  - Models default to 3/4 angles and ignore requested canvas sizes.
  
  Recommended fixes: generate at the highest resolution, run grid detection with an overlay check, reduce to a fixed palette (8/16/32/64 presets), and use point filtering in the engine. — [SpriteCook blog, Mar 19, 2026](https://www.spritecook.ai/blog/nanobanana-pixel-art-for-games)
- The svntax LoRA recommends **k-centroid** downscaling ×4 for pixel-perfect output. — [HF model card](https://huggingface.co/svntax-dev/pixel_spritesheet_4walk_small_lora_v1/blob/main/README.md)
- The Wan-based workflow uses ColorMatch to the original character's palette, then quantization plus nearest-exact. — [Civitai](https://civitai.com/posts/26933027)
- Engine-side checks:
  - Fixed canvas size per frame (e.g. 64×64).
  - A baseline for the feet.
  - Preview at the target fps and look for jitter, foot sliding and unreadable poses. — [summary via SpriteCook/Summer Engine guides](https://www.claudepluginhub.com/skills/summerengine-summer/sprite-sheet)
  
  A Phaser-oriented agent pipeline uses ground-line alignment and atlas output. — [skills.sh game-sprite-pipeline](https://www.skills.sh/notque/vexjoy-agent/game-sprite-pipeline)
- A Codex/GPT skill makes 64×64 8-direction idle/walk/attack strips with palette quantization and a validation step. — [SourcePulse: character-animation-creator-skill](https://www.sourcepulse.org/projects/32289298)
- Retro Diffusion's API `input_palette` and PixelLab's "target palette" option enforce a palette at generation time. — [RD api-examples](https://github.com/Retro-Diffusion/api-examples); [PixelLab skeleton docs](https://www.pixellab.ai/docs/tools/animate-with-skeleton)

### Inferences
These are concrete changes to `tools/ai/sprites.py` for animation. They are inferences from the sources plus the local code.
- **Palette:** replace per-sprite median-cut with a **per-character palette**. Run median-cut or Wu over the *union* of opaque pixels from all frames of all animations of that character, or snap to a project-wide palette (Lospec-style). Then map every frame with `Image.quantize(palette=pal_img, dither=NONE)`. Per-frame palettes are the main cause of colour flicker. With 14 colours, a single shift in skin or shadow tone is very visible at 6–8 fps.
- **Grid phase:** frames must be cropped on the **same lattice**. Cell origin and anchor offset should be integer multiples of the downscale factor. Otherwise BOX/area downscaling samples a different sub-pixel phase per frame and static parts (head, torso) "shimmer" by one pixel. Detect the scale once per sheet (unfake `--scale` / perfectPixel `grid_size`), never per frame.
- **Anchor:** compute the anchor at **high resolution before downscaling**. The anchor is the bottom-most opaque row; horizontally, use the centroid of the torso band (e.g. the 40–70% height band), not the bbox centre, because swinging arms and legs move the bbox. Shift each frame to put it on a fixed (x, ground_y) in a fixed-size cell, then downscale. For walk cycles, keep the vertical bob from the source (it carries weight) but lock the horizontal drift.
- **Alpha:** with Qwen-Image 2.1 RGBA output, no chroma-key is needed. Still binarize alpha (the current `athr`), then remove isolated pixels and one-pixel islands after downscaling. An optional single dark outline should be applied *after* palette mapping and use a palette colour, so it does not add a colour.
- **Dominant vs area downscale:** the current BOX (area) average plus quantize is fine for painterly "detailed pixel" output. For hard-edged AI pixel art (fake-pixel input), unfake's dominant-colour voting or perfectPixel's majority sampling preserves edges better and is more stable frame to frame.
- **Atlas:** pack per-character sheets with fixed cell sizes; plain grid packing is enough at this scale. Emit JSON with per-animation frame ranges, fps and anchor, which is the Phaser/Pixi `AnimatedSprite` format. Per-frame trimming saves little at these sizes and complicates anchors.

### Gaps
- None of the cleanup tools documents batch or animation-aware processing (shared grid phase or shared palette across frames). Batch support in unfake is undocumented.
- No quantitative comparison of k-centroid, dominant, majority and area downscaling for temporal stability.

---

## 4. Cutout / rig approach: segment a generated character into parts and animate with bones (Rive, Spine, DragonBones, Live2D, Animated Drawings, img2rig)

### Takeaway
Cutout rigs give perfect identity consistency, unlimited frames, cheap new animations and code-driven blending (look-at, talk while walking). They suit a **watching-characters simulator** with many NPCs doing small motions. The price is a flat, "paper-puppet" look, the need to inpaint occluded parts (the arm behind the torso, the leg under the skirt), and weak support for 3/4 turns. Automated tools are immature: Meta's Animated Drawings (MIT) works on Apple Silicon but is **archived**, img2rig is a tiny early project, Spine has no auto-rig on its roadmap, and Live2D auto-generates deformers only for humanoid PSDs. The most practical route for this project is a **semi-procedural rig in code**: AI generates a "parts sheet", Qwen 2.1 masks or segments the parts, and a small bone hierarchy is animated in Pixi/canvas. Its weakness for pixel art is that rotated parts break the pixel grid unless frames are baked and re-pixelized.

### Cited Findings
- Animated Drawings (Meta):
  - MIT for code, weights and the Amateur Drawings dataset.
  - **Archived Sep 3, 2025** ("I won't be able to maintain this repository anymore").
  - Tested on macOS Ventura and Ubuntu, Apple Silicon conda notes, TorchServe (Docker about 16 GB RAM, or local).
  - Pipeline: drawn-humanoid detector, segmentation mask (editable), joint predictions (a web UI to fix them), **ARAP (as-rigid-as-possible) deformation**, motion from **BVH** retargeted to a 2D rig.
  - Outputs MP4 or transparent GIF.
  - Designed for two-arm, two-leg humanoids; other skeletons need manual config. — [GitHub facebookresearch/AnimatedDrawings](https://github.com/facebookresearch/AnimatedDrawings)
- img2rig (Apache-2.0):
  - Pipeline: one SD illustration, then GroundingDINO + SAM text masks, an agent-driven cleanup and inpainting loop, then layer PNGs + `rig.txt`, played by a dependency-free C++ runtime and a canvas web player.
  - Motions: breathing, blinking and spring hair; hit, stagger and enrage. Large poses use full-frame keyframe swaps.
  - "No mesh deformation". A cutout rig "can never exceed what the source illustration contains". Segmentation point tables must be re-derived per character over 4–6 agent review rounds.
  - 11 stars, no releases. — [GitHub SSnemo/img2rig](https://github.com/SSnemo/img2rig)
- spine-animation-ai (Genielabs): a Claude skill that auto-positions body parts from a reference image (SIFT + RANSAC), builds Spine skeleton JSON, and uses Gemini for asset splitting and "reskin". About 74 stars as of Apr 2026. — [GitHub GenielabsOpenSource/spine-animation-ai](https://github.com/GenielabsOpenSource/spine-animation-ai); [SourcePulse summary](https://www.sourcepulse.org/projects/33030572)
- Spine (Esoteric Software) said auto-rigging is "not yet on our roadmap as a concrete plan". The forum post is undated. — [Esoteric forum](https://esotericsoftware.com/forum/d/24270-auto-rig-ai-)
- Live2D Cubism 5.0 (2023) added AI semi-automatic face deformers and facial motion. 5.1 (Jul 2024) added **automatic full-body deformer generation for humanoid models right after PSD import** and automatic sway for hair and accessories. No 2026 AI features were found. — [Live2D 5.1 docs](https://docs.live2d.com/en/cubism-editor-manual/new-function5-1/)
- Scenario's "2D animation rigging sheet" app generates consistent separated parts for Spine, Live2D or Moho; you rig them yourself. — [Scenario app](https://scenario.com/apps/2d-animation-rigging-sheet)
- Cutout animation basics: separate drawings for head, body, each arm and each leg connected at joints. — [Tahoma2D docs](https://tahoma2d.readthedocs.io/en/latest/creating_cutout_animation.html)

### Inferences
- **Recommendation for this project:** a hybrid.
  - Use **frame-by-frame** (generated sheets) for whole-body cycles that change silhouette: walk, sit, turn. Cutouts look worst there, especially in 3/4 view.
  - Use **cutout overlays** for high-frequency small motions on top of a base frame: mouth (talk), eyes (blink), head tilt or nod, one arm gesture. Generate the mouth and eye variants by masked inpainting (Qwen 2.1 `--mask-image`) on the same base, so the parts are pixel-aligned by construction. No segmentation and no occlusion inpainting are needed for these.
- **Pixel-grid caveat:** rotating a pixel-art arm by an arbitrary angle at runtime produces jaggies and mixels. Either bake rig poses offline at high resolution and run them through the same pixelize step (deterministic, shared palette), or restrict runtime transforms to integer translations and frame swaps. For a "detailed pixel" or painterly look, runtime rotation is acceptable.
- Animated Drawings can still be used offline (MIT, BVH input, macOS), and BVH/Mixamo-style clips give "free" motion. Its ARAP deformation of a single image smears texture and does not handle occlusion. It is better for doodles than for detailed sprites, and nobody maintains it.
- Rive and DragonBones are viable runtimes, but no AI auto-rig was found for them. The rigging work would be manual, which conflicts with the "no hand drawing" preference less than it conflicts with "low effort".

### Gaps
- No 2026 Rive or DragonBones AI auto-rig feature was found. A search for Rive AI produced no results.
- No source on using SAM 2 specifically to split AI-generated characters into rig parts with occlusion inpainting; img2rig uses SAM v1 + GroundingDINO.
- No measured quality comparison of cutout and frame-by-frame for pixel-art NPCs.

---

## 5. LLM-generated animation code (CSS/SVG/canvas/Lottie): practical quality

### Takeaway
LLMs write valid **static SVG** reliably, but **animated vector output (Lottie, SVG animation) is far from solved**. 2026 benchmarks show low success and similarity scores. For this project, the useful role of an LLM is writing the **procedural layer** around raster sprites: bobbing, squash-stretch, breathing scale, look-at offsets, timing tables, sprite-sheet players, and generating the pose-template sheets for the edit model. It is not a good tool for authoring character art as vector animation.

### Cited Findings
- Graphic-Design-Bench (arXiv 2604.04192): Lottie generation is "feasible but far from solved"; the best model reached a FrameS-SIM of **0.598**, well below its static SVG results. Claude Opus 4.6 and GPT-5.4 reached near-perfect *render validity* on SVG tasks. — [arXiv 2604.04192](https://arxiv.org/pdf/2604.04192)
- OmniLottie (CVPR 2026): existing LLMs emit Lottie JSON with poor success because of strict nested structure and weak instruction-following. Supplemental results: Qwen2.5-VL 0% (schema hallucination), DeepSeek 29.3%, GPT-5 12.7–68.7% across tasks. The authors propose a Lottie tokenizer trained on MMLottie-2M. — [arXiv 2603.02138](https://arxiv.org/abs/2603.02138); [CVPR supplemental](https://openaccess.thecvf.com/content/CVPR2026/supplemental/Yang_OmniLottie_Generating_Vector_CVPR_2026_supplemental.pdf)
- LottieGPT: Lottie is more compact than SVG, about 1.6k tokens versus 2.6k for the same icons. — [CVPR 2026 supplemental](https://openaccess.thecvf.com/content/CVPR2026/supplemental/Chen_LottieGPT_Tokenizing_Vector_CVPR_2026_supplemental.pdf)
- SBC Games paper: local LLMs (Qwen, Gemma, GLM) produce structurally valid SVG game assets, but aesthetics trail Gemini 3. — [SBGames paper](https://sol.sbc.org.br/index.php/sbgames/article/view/45382)
- Codrops reverse-engineered Claude's mascot animation (SVG + GSAP) and found it relies on hand-tuned per-frame offsets and timeline delays. — [Codrops](https://tympanus.net/codrops/?p=114688)
- Tooling exists for agent-driven Lottie: a Claude Code plugin converts SVG to Lottie keyframes with a validation and preview loop ([lottie-animator plugin](https://www.claudepluginhub.com/plugins/obeskay-lottie-animator)), and diffusionstudio/lottie targets Claude Code or Codex ([gittrend listing](https://gittrend.io/repo/diffusionstudio/lottie)). No quality evaluations were found.

### Inferences
- LLM-written code is reliable for deterministic layers on top of sprites: sine-based idle bob (1 px at pixel scale), breathing scale, talk-mouth frame toggling driven by the simulator's dialogue events, head-turn frame selection, footstep-synchronised walk speed (stride length × fps), and two-character "conversation choreography" (alternate talk/listen loops, face-each-other flips). This is where most perceived life in a watching-characters sim comes from, and it costs no art.
- An LLM can also generate the **pose-template sheets** for section 2 (stick figures or mannequins from a keyframe table or BVH) and the post-processing scripts. That keeps the "no hand drawing" constraint.
- Using LLMs to author the characters themselves as SVG or Lottie would conflict with the AI-raster art direction and, per the benchmarks, give low fidelity.

### Gaps
- No benchmark for LLM-written canvas or CSS procedural *character* animation quality was found; evidence is anecdotal.
- Claude-family results on the Lottie benchmarks specifically were not extracted (only SVG validity was mentioned).

---

## 6. Concrete reported results and common failure modes

### Takeaway
Public evidence is thin and mostly vendor-authored. Independent reports agree on the same failure modes:
- **identity drift across frames** (hair, outfit, proportions, props vanish);
- **morphing and flicker** from video models;
- **fake-pixel grids and extra colours** from general image models;
- **broken loops**;
- **anchor jitter and foot sliding**;
- **weak back or rare views**;
- "**it doesn't always work, frames need manual fixes**".

Successful pipelines constrain the problem: a fixed layout or template, a start frame, an enforced palette, a fixed canvas and baseline, and automated validation.

### Cited Findings
- The SpriteForge AI (itch.io tool) developer says it "does not always work", so individual frames often need manual fixes. — [lbacaj.itch.io/spriteforge-ai](https://lbacaj.itch.io/spriteforge-ai)
- The video → frames → background-removal pipeline was described as hard and slow by an itch.io developer asking for easier methods. — [itch.io post](https://itch.io/post/14144159/view-in-topic)
- The SD + ControlNet game-jam animation was constrained by the input and gave samey results. — [Bromberry devlog](https://bromberry.itch.io/dueling-dynasties/devlog/522129/we-made-animations-with-ai-stable-diffusion)
- God Mode AI's HN author credits image-to-video model improvements for results that "exceed expectations". Discussion is minimal. — [HN item 44204181](https://news.ycombinator.com/item?id=44204181)
- Sprite Sheet Diffusion: pose detectors fail on exaggerated sprites, props and hair are lost, and the motion module overfits. — [arXiv 2412.03685](https://arxiv.org/html/2412.03685v2)
- svntax LoRA: headwear cut off, bad anatomy on non-humans, inconsistent back row. — [HF](https://huggingface.co/svntax-dev/pixel_spritesheet_4walk_small_lora_v1/blob/main/README.md)
- SpriteForge LoRA: artifacts on unseen extreme poses; works best with clear full-body references. — [itch.io](https://tantk.itch.io/spritesheet)
- General image models give inconsistent pixel width (6 vs 7 px), extra colours, default 3/4 views and ignored canvas sizes. — [SpriteCook, Mar 2026](https://www.spritecook.ai/blog/nanobanana-pixel-art-for-games)
- Video models: pixels shift, colours blend, an "anti-aliased mess"; animating an empty background; camera motion. — [pixie.haus](https://pixie.haus/resources/creating-movement-engineering-pixel-art-animation-ai). Also slow or slightly imperfect motion. — [Scenario guide](https://help.scenario.com/articles/9088582240-create-spritesheets-with-scenario)
- A one-image sheet "usually looks worse than the static sprite" because of poor inter-frame consistency. — [Summer Engine skill](https://www.claudepluginhub.com/skills/summerengine-summer/sprite-sheet)
- Scale of the task: a hand-made 8-direction × 12-frame walk is 96 frames ([itch.io devlog](https://gramiscreations.itch.io/barebyte/devlog/991844/devlog-2-movement-begins-walk-cycle-complete)). A walk cycle is typically 6–8 frames ([Cinevva](https://app.cinevva.com/guides/ai-pixel-art-generators)).
- PixelLab's own recommended workflow includes "rough manual fixes" between regenerations. Even the leading tool assumes some touch-up. — [PixelLab skeleton docs](https://www.pixellab.ai/docs/tools/animate-with-skeleton)

### Inferences
- **Cross-approach comparison** (my synthesis; "quality" means for small pixel-style NPC loops):

| Approach | Frame-to-frame consistency | Pixel-grid quality | Effort / automation | Local on M3 Max | Best for |
|---|---|---|---|---|---|
| PixelLab skeleton / text (API) | High (start frame + skeleton + palette) | Native grid | Low; API/MCP; touch-ups recommended | No (cloud, ~$0.05/anim) | Walk/idle/gesture ≤256 px, 4–8 directions |
| Retro Diffusion advanced animation (API) | High (start frame, palette) | Native grid | Low; 4–16 frames per call | No (cloud, $0.14/anim); Aseprite extension runs locally | Walk/idle/jump/attack/custom ≤256 px |
| Edit model + pose-template sheet (Qwen 2.1 Edit, optionally a LoRA) | Medium–high (whole cycle in one canvas) | Needs pixelize + shared palette | Medium; scripted templates; `--verify` | Yes (mflux, RGBA) | Custom cycles in project style, any size |
| Masked inpaint on a base frame (Qwen 2.1 `--mask-image`) | Very high (unmasked pixels exact) | Same as base | Low | Yes | Talk, blink, small gesture, 2–4 frames |
| Per-frame edit ("now step left") | Low–medium (drift) | Needs pixelize | High (many retries) | Yes | Key poses only |
| Video I2V (Wan 2.2 FLF) → frames | Medium (morphing) | Poor; needs colour-match + quantize | Medium–high; decimation, loop fixing | Slow (tens of min per clip) | Large or painterly sprites, smooth motion |
| Cutout rig (parts + bones in code) | Perfect identity | Breaks grid under rotation unless baked | High setup, then near-zero per animation | Yes | Head, mouth, arm overlays, many NPCs |
| LLM procedural layer (bob, squash, choreography) | n/a (transforms existing frames) | Integer offsets keep the grid | Low | Yes | Life on top of any of the above |

- **Suggested build order for this project (inference):**
  1. LLM-written procedural layer plus masked-inpaint talk and blink: highest value, lowest risk.
  2. Switch the pixelizer to a shared palette with a fixed grid phase and anchor.
  3. Run a template-sheet walk cycle with Qwen-Image 2.1 Edit on 3–5 characters and measure drift. Use a perceptual metric such as DINO/CLIP similarity between frames and the reference, plus the palette ΔE count.
  4. In parallel, spend about $5 on PixelLab skeleton v3 and RD advanced walk for the same characters as a quality baseline.
  5. Only if both fall short, try a locally trained FLUX.2 Klein walk-sheet LoRA, or video FLF for large sprites.
- **Two-character interaction:** treat it as a choreography problem, not a generation problem. Use per-character loops (talk, listen, nod, gesture, hand-offer), a shared timeline from the simulator, facing flips, and spacing from anchors. Physical contact (handshake, hug) is the hard case. It may need one jointly generated 2–4-frame clip per pair archetype, then segmentation into per-character layers for z-order. No source shows a reliable method for this.

### Gaps
- r/aigamedev, r/StableDiffusion and r/gamedev threads with concrete before/after outcomes were not retrievable through search. There is no Reddit evidence in these notes.
- No independent user reports on PixelLab or Retro Diffusion animation quality; only vendor docs and affiliate comparisons.
- No examples of AI-generated **two-character interaction** sprite animations were found anywhere.
- No reports on FLUX 3 Image Klein (Oct 2026) or Qwen-Image 2.1 Edit for sprite animation; both are too new.
