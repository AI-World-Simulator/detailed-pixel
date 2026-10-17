# Sprite animation defects and QA: what makes 2D/pixel animation look cheap, and how teams prevent and catch it (state as of Oct 2026)

Scope: a catalogue of concrete frame-to-frame defects in small pixel-art character animation, the conventions and workflows professionals use to prevent them, and which checks can be automated in a Python post-processing step. Project context (from the assignment, not from the web): a browser pixel-art simulator, chibi characters about 43 art-px tall, frames produced by AI image-edit models and then pixelized (grid detection, shared palette, registration by colour overlap). The defects already seen are eye pixels vanishing or changing in walk frames, an eye getting thinner in an action frame, and a crouching character floating above the ground because frames are aligned by body overlap instead of by the feet.

Research note: research ran on 2026-10-17. Primary docs (Aseprite, Unity, Godot, TexturePacker, Lospec, Slynyrd) were fetched directly where possible. Several results are vendor blogs (SpriteCook, abratabia, Wayline, bugnet) and are flagged. The SpriteCook and bugnet pages returned 404 or off-topic content when fetched, so their claims come from search-result summaries only. I found no studio postmortem (Celeste, Owlboy, Hollow Knight, Shovel Knight) that describes *automated* sprite QA. The automated-check design below is my synthesis and is labelled as inference.

---

## 1. Defect catalogue: visual effect, cause, why it reads as cheap, how to fix

### Takeaway
Almost every "cheap" defect breaks an invariant the viewer expects to hold between frames: same identity (face, palette, outline weight, volume), same grid (pixel size, no sub-pixel blur, no rotation artefacts), and same contact with the world (feet on the baseline, stride matching travel). The pro fix is to stop each part from being redrawn when it shouldn't change, through linked cels, separate layers, a skeleton, or a 3D source. Each invariant can be measured per frame and flagged.

### Cited Findings

**Line boil / jitter in parts that should be static**
- "Line boil" is the industry name for undulating lines caused by slight deviations between repeated drawings. It is usually unintentional, though it is sometimes exaggerated on purpose. Studios that used it deliberately called it "Squigglevision" (Dr. Katz, Home Movies). — [TV Tropes: Line Boil](https://TVTropes.org/pmwiki/pmwiki.php/Main/LineBoil); [Fantasy Animation Footnote #22 – Boiling](https://www.fantasy-animation.org/footnote-episodes/footnote-22-boiling); [Adobe Community thread](https://community.adobe.com/t5/animate-discussions/how-do-i-make-a-ripple-effect-on-my-lines-animate/td-p/12401954) (search-summary level)
- Some sources defend wobble as intentional. An itch.io animator writes: "Don't worry about getting the frame to match the one before perfectly because then you will lose the beautiful wobble!" They "mostly always use four frames for things like the characters' faces", and two frames "usually looks too jittery". — [itch.io post 3683514](https://itch.io/post/3683514). (This describes a deliberate hand-drawn boil style, not accidental per-pixel noise in a face.)
- Vendor guidance on consistency says one stray pixel at 1–2 px scale changes how a pose reads, so each frame should be checked zoomed out for flicker and played at target fps to spot jitter. — [SpriteCook blog](https://www.spritecook.ai/blog/animating-sprite-sheets-tips-for-consistency) (vendor; page returned 404 on fetch, claims from search summary)

**Identity drift in AI-generated frames (face, proportion, colour, outline, accessories)**
- A June-2026 guide to AI sprite sheets lists the typical frame-to-frame drift: "the character's head size or body width changes slightly between frames" (proportion drift); "skin tone or equipment color varies" (colour shift); "accessories appear or disappear" (detail gain or loss); and "line thickness changes" (outline inconsistency). — [abratabia: AI sprite sheets](https://abratabia.com/ai-game-art/ai-sprite-sheets.php) (fetched)
- The same guide gives these fixes: skeleton-based generation (PixelLab), because a skeleton "constrains the character's proportions across frames"; using the base frame as an image-to-image reference for every frame; and frame-by-frame manual correction in Aseprite. — [abratabia](https://abratabia.com/ai-game-art/ai-sprite-sheets.php)
- Community sentiment (OpenGameArt 2024; a June-2026 guide) holds that general image models produce inconsistent frames and that AI is weakest at multi-frame animation of a single character. — [OpenGameArt forum](https://opengameart.org/forumtopic/ai-for-spritesheet-generation); [SummerEngine guide](https://www.summerengine.com/blog/ai-2d-game-asset-generator.md) (search-summary level)

**Outline thickness changes / doubles / jaggies**
- Lospec: a clean outline "has a consistent thickness, and smooth curves". The cleanup is to remove pixels "until the line segments only connect at the corners". Diagonals "should be made up of identical line segments", and breaking that "creates jaggy looking lines". — [Lospec: Pixel Art Outlines](https://lospec.com/articles/pixel-art-outlines) (fetched)
- "Doubles" are spots where a 1-px line becomes 2 px thick, which makes the line look uneven. They come from brushing instead of placing pixels, or from tracing with "alpha from image". "Pixel perfect" drawing modes prevent them. — [BraceletBook outline tutorial](https://www.braceletbook.com/tutorials/120_making-better-outlines-for-alpha-patterns/) (search-summary level; a generic outline tutorial, not a pixel-art authority)
- One community post attributes to Michael Azzi's *Pixel Logic* the rule that all art stays on the same grid and that outline thickness matches across all the art. — search result for [squeakypig devlog "A tale about chasing a pixel perfect tail"](https://squeakypig.itch.io/unicopia/devlog/787703/a-tale-about-chasing-a-pixel-perfect-tail) (attribution taken from a search snippet; I did not verify it against the book)

**Volume / proportion changes ("character shrinks", accordion)**
- Slynyrd (Raymond Schlitter) on quadruped walks: if front and back legs don't cover the same distance, "the body will appear to stretch and contract like an accordion". General rules: "Take careful note of the position of all the body parts in every frame", and "The more detailed the design, the more difficult it will be to keep the movement clean." — [Slynyrd Pixelblog 25 – Motion Cycles](https://slynyrd.com/blog/2020/1/23/pixelblog-25-motion-cycles) (fetched)
- A reference overlay of the base frame at reduced opacity reveals drift as areas that are "significantly larger, smaller, or offset". — [abratabia](https://abratabia.com/ai-game-art/ai-sprite-sheets.php)

**Palette / colour flicker**
- Suggested QA: sample RGB for skin, hair and primary outfit colour across frames, and flag differences of "more than 5 to 10 values in any channel". — [abratabia](https://abratabia.com/ai-game-art/ai-sprite-sheets.php) (vendor-adjacent guide; the threshold is a rule of thumb, not a standard)
- Palette-membership validators exist. PixelPal's `validate` command checks that every pixel of an image comes from a given palette, and `convert` remaps to it. — [PixelPal (GitHub)](https://github.com/vulpivia/pixelpal)

**Pivot / anchor errors (sprite jumps when frames switch)**
- When frames of different sizes share one pivot, the sprite shifts when the frame size changes. In one report, larger attack frames drifted sideways even though the pivot was at the feet. — [Godot forums: texture size for animations](https://godotforums.org/d/21243-texture-size-for-animations); [itch.io post](https://itch.io/post/14791440) (search-summary level)
- On PlayCanvas, a trimmed TexturePacker sprite "bounced" because the trim offset (`spriteSourceSize` x/y) wasn't applied at runtime. — [PlayCanvas forum](https://forum.playcanvas.com/t/texture-packer-trimmed-sprites-and-positioning/15024)

**Floating / sinking (feet not on the ground line)**
- Lospec: leave out the outline where an object touches another, such as "feet on the ground", because otherwise the object "can look like it's floating". This shows that ground contact is a perceptual cue the art itself must support. — [Lospec: Pixel Art Outlines](https://lospec.com/articles/pixel-art-outlines)
- Recommended setup: a fixed canvas size per frame, a baseline for the feet and a centerline for the torso, plus a "register layer" to check alignment. — [SpriteCook](https://www.spritecook.ai/blog/animating-sprite-sheets-tips-for-consistency) (vendor; search summary)

**Foot sliding (walk cycle speed doesn't match movement)**
- Cornell's game-design lab defines the "traversal step" as the number of pixels it is safe to slide the image before the next frame. Too little looks like "marching in place", and too much looks like "moonwalking". — [Cornell CS5152 Design lab](https://www.cs.cornell.edu/courses/cs5152/2025sp/labs/design1)
- Spine forum method: measure the pixels the character moves each frame, enter that as the X offset in the ghosting view, and adjust the animation length "until it looks like there is no feet sliding". — [Esoteric Software forum](https://de.esotericsoftware.com/forum/d/6777)
- Stride length is the distance the foot travels across the ground in one step. — [SIGGRAPH HyperGraph walking exercise](https://education.siggraph.org/static/HyperGraph/animation/character_animation/walking/walking_excercise.htm)
- Retro reference: a Pokémon-style walk moves 1 px per frame for 16 frames, which is one 16-px tile per step. — [Blake Crosley: Pixel-Art Motion](https://blakecrosley.com/blog/pixel-art-motion-on-iphone) (search-summary level)
- A walk where the body is held completely still while only the limbs move "feels pinned in place". The whole body should shift weight. — [gamedev.net critique thread](https://gamedev.net/forums/topic/687288-new-to-pixel-animation-need-critique/)

**Mixed pixel sizes (mixels), rotated or scaled pixel art**
- Community criticism says mixels feel "uncanny, strange, and just… unprofessional" and should only be used for background layers. — [Flowlab community: "Stop using mixels"](https://community.flowlab.io/t/mini-rant-stop-using-mixels/38287) (search-summary level)
- Naive pixel rotation gives "very noisy and messy results". Lospec's Pixel Art Rotator uses better algorithms, but small details still get lost and most need redrawing. — [Lospec](https://lospec.com/articles/pixel-art-where-to-start/); [Aseprite community: rotating sprites](https://community.aseprite.org/t/is-there-a-way-to-easily-rotate-objects-and-sprites-without-having-to-remake-them/7997)
- Rendering the whole game at native 1:1 resolution and upscaling the final frame keeps every sprite on one grid, and rotations look "twinkly" like on SNES. — [MonoGame community](https://community.monogame.net/t/miles-kilo-is-out-now-on-steam-its-a-tough-retro-platformer-i-developed-using-monogame/10023/32) (search-summary level)

**Sub-pixel blur / shimmer (rendering, not art)**
- Unity 2D Pixel Perfect: "Upscale Render Texture" renders near the reference resolution and then upscales, which "results in unaliased and unrotated pixels". "Pixel Snapping" (available only when upscaling is off) "prevents subpixel movement and makes Sprites appear to move in pixel-by-pixel increments". The Point filter is sharp but can shimmer; Retro AA is blurrier and shimmers less. — [Unity 2D Pixel Perfect manual](https://docs.unity3d.com/Packages/com.unity.2d.pixel-perfect@2.0/manual/index.html); [Unity 6 URP Pixel Perfect reference](https://docs.unity.com/en-us/engine/6000.0/manual/unity2d/2d-urp/2d-pixelperfect/ref)
- Godot AnimatedSprite2D: "For games with a pixel art aesthetic, textures may appear deformed when centered." The fixes are `centered = false` or the snap-to-pixel project settings. — [Godot AnimatedSprite2D docs](https://docs.godotengine.org/en/stable/classes/class_animatedsprite2d.html) (fetched)
- A third-party blog attributes "crawling pixels" to the artist's pixel grid and the renderer's grid drifting apart by fractions of a pixel. Its fixes are integer camera snapping and point sampling. — [bugnet.io](https://bugnet.io/blog/how-to-debug-pixel-perfect-2d-rendering-issues) (vendor; the fetch returned unrelated content, so this comes from the search summary)

**Inconsistent light direction**
- Dead Cells rendered a normal map with every frame and used it to preview the final look through a toon shader. Lighting therefore came from one source by construction instead of being painted per frame. — [80.lv: Dead Cells character art pipeline](https://80.lv/articles/case-study-dead-cells-character-art-pipeline/); [wnhub summary](https://wnhub.io/news/art/item-13775) (secondary write-ups; the original Game Developer article by Thomas Vasseur was not fetched)

**Frames too similar (no read) or too different (pops); missing frames**
- Slynyrd: "The extremes of motion are keyframes. so you should start with these." — [Slynyrd Pixelblog 25](https://slynyrd.com/blog/2020/1/23/pixelblog-25-motion-cycles)
- In-engine playback should look for frames that "look out of order" and "gaps where a frame was missed". — [abratabia](https://abratabia.com/ai-game-art/ai-sprite-sheets.php)

**3D-source pipelines remove whole classes of defects**
- Dead Cells (Motion Twin) animated a 3D model and skeleton in 3ds Max and rendered each frame without smoothing to a low-res PNG plus a normal map, using a private tool. The stated motivation was to avoid hand-redrawing every frame on retakes. — [80.lv](https://80.lv/articles/case-study-dead-cells-character-art-pipeline/); [GoNintendo summary of the dev blog](https://gonintendo.com/archives/280488-dead-cells-dev-blog-art-design-deep-dive-giving-back-colors-to-cryptic-worlds)

### Inferences

**Defect table (synthesis).** "Auto-check" columns are my proposals for a Python/Pillow/NumPy post-step. They are not taken from any single source.

| Defect | What the viewer sees | Typical cause in *this* pipeline | Why it reads as cheap | Fix (prevent) | Auto-check (detect) |
|---|---|---|---|---|---|
| Face boil / eye change | Eyes blink or shift without intent; an eye loses a pixel | Each frame is regenerated by the AI edit, so the face is re-synthesised. The pixelizer's grid phase or majority vote drops 1-px dark features | Identity is unstable, and the eyes are where attention goes first (section 5) | Do not re-derive the face per frame. Paste a canonical head/face from the reference frame and allow only integer translation (head bob) or approved expression variants | Track the head by integer template match. Hamming distance of the face mask vs reference > 0 is a fail unless the frame is tagged with an expression |
| Eye thinner in an action frame | One eye 1 px narrower or shorter | The eye falls on a grid-cell boundary. Area/mode downsampling lets skin outvote the eye | Asymmetry of eyes reads as an error, not a pose | Lock the grid phase from the reference frame and do not re-detect per frame. Use feature-preserving downsampling with priority for eye/outline colours | Per-eye connected component: pixel count, bbox w/h and centroid must match the reference (±0) |
| Line boil in static parts | Static torso or clothes shimmer | Independent synthesis per frame plus quantization noise | Looks like noise, not motion | Composite unchanged parts from the reference (the "linked cel" equivalent) | Per-region diff of parts declared static |
| Outline thickness change / doubles | Line gets heavier or lighter between frames | Different upscale/downscale per frame; AI soft edges | Breaks the "one grid, one line weight" rule | Re-derive the outline from the alpha mask with a fixed rule (1-px outer outline); remove doubles | 2×2 blocks entirely in outline colour = doubles. Outline pixel count / perimeter ratio vs reference |
| Volume / proportion drift | Character shrinks or grows; head size varies | The model re-imagines proportions; scaling differs during registration | Reads as a different character | Pin scale: do not rescale per frame. Use a skeleton/pose-conditioned generation or 3D source | Opaque area, bbox height (excluding tagged squash/crouch), head bbox from template match: tolerance ±1 px |
| Palette flicker | Skin or hair colour alternates between two indices | Quantization ties; per-frame palette | Flicker draws attention as a transient | One shared palette (already in place) plus per-region index locking | All pixels ∈ palette. Per-region colour histogram vs reference (index counts) |
| Pivot jump | Whole sprite pops sideways or up on frame change | Frames registered by colour overlap; different trimmed bboxes | Reads as a glitch, not motion | Uniform canvas + bottom-centre anchor, or explicit per-frame anchor metadata | Anchor (foot-contact x, baseline y) per frame must equal the canonical value unless tagged |
| Floating / sinking in crouch or land | Feet hover 1–8 px above or sink below the ground | Body-mass overlap registration aligns head/torso, so in crouch the feet rise | Breaks ground contact, the strongest physical cue | Register vertically by the ground-contact row; use colour overlap only for horizontal alignment or rigid-part refinement | Lowest opaque non-shadow row per frame == baseline for all ground-contact frames |
| Foot sliding | Feet skate along the ground while walking | Movement speed is set independently of the stride drawn in the art | Breaks contact; reads as "moonwalking" | Speed (px/s) = stride_px / frames_per_step × fps; or adjust frame durations | Measure the planted-foot x across contact frames in a world-space replay; drift > 0 px is a fail |
| Loop seam | Hitch or pop at wrap-around | Last frame duplicates the first (held twice), or the last→first jump is larger than any other step | Rhythm breaks once per cycle | Treat the cycle as circular; never duplicate frame 0 at the end | diff(last, first) ≈ median neighbour diff; identical last/first is a fail |
| Too similar / too different | Dead frames or pops | AI edits that barely change, or overshoot | No read or a stutter | Regenerate or drop | Changed-pixel ratio per neighbour pair: ≈0 flags a duplicate; > k × median flags a pop |
| Mixels / scaled or rotated pixels | Mixed cell sizes; jagged rotated edges | Rotating or scaling after pixelization; AI renders that aren't grid-aligned | Breaks the medium's grammar | Pixelize last; never transform pixel art afterwards except by integer scale and flip | Grid-detection confidence per frame. Run-length histogram: all runs multiples of 1 art-px |
| Sub-pixel blur | Soft or semi-transparent edges | Bilinear resampling, fractional positions in canvas | Looks smeared and unprofessional | Binary alpha, integer positions, no smoothing at render time | Alpha ∈ {0,255}; no colours outside the palette |
| Light direction flip | Highlight jumps sides between frames | AI re-lights each frame | Volume reads as unstable | Shade from one rule (normal-map or fixed palette ramps) or composite from the reference | Centroid of highlight-index pixels relative to the body centroid: sign must be constant |

- **Why the observed crouch floats.** Colour-overlap registration maximises agreement of the largest coloured masses: head, hair and torso. In a crouch the head and torso drop relative to the feet. Pinning the head to its standing position therefore lifts the feet by roughly the crouch depth, which is the floating seen in the project. The correct registration target for any ground-contact pose is the contact itself (lowest foot pixels), not the body.
- **Why eyes vanish in walk frames.** At about 43 px tall, a chibi head is probably 15–20 px and an eye 1–3 px. Any per-frame re-synthesis plus re-gridding gives that eye an independent chance of losing a cell to skin in the majority vote. At this size a 1-px change in an eye is a 30–100% change of the feature. An earlier project note records that `tools/ai/sprites.py` used BOX area-downscale with per-sprite median-cut palettes. Area averaging is exactly the mechanism that dilutes 1-px dark features. I have not checked whether the current pipeline still does this.

### Gaps
- I found no primary source with numeric thresholds for "frames too similar or too different" in pixel animation. The thresholds in the table are proposals to tune on project data.
- I found no source specifically about inconsistent light direction as a frame-to-frame sprite defect. That row is inference, apart from the Dead Cells normal-map practice.
- I found no source on loop seam errors in pixel animation specifically. The loop-seam row is inference from general animation practice.
- Saint11 (Pedro Medeiros) original tutorials did not surface in search; only secondary write-ups on sub-pixel animation ([Tiny Warrior Games](https://tinywarriorgames.com/2019/01/04/game-development-pixel-art-sub-pixel-animation/)). Saint11's views on face consistency are not covered here.
- *Pixel Logic* (Azzi) was not accessed directly.

---

## 2. Anchoring / pivot conventions in engines and sprite tools

### Takeaway
The standard convention for characters is a bottom-centre (feet / ground-contact) pivot on a uniform canvas. When frames must differ in size, engines rely on per-frame pivots (Unity, TexturePacker) or per-frame offsets in code (Godot). Jitter appears when trimming, varying frame sizes or registration move the anchor and nobody records the offset. Crouch and landing frames must keep the contact pixels on the baseline. Jump height is either baked into the canvas with the pivot left at the "navigation point" or applied by gameplay code, and this needs to be decided explicitly.

### Cited Findings
- **Uniform canvas (most common advice).** Design all sprites in the same size frame regardless of unused space, slice as a grid, and put the pivot at the bottom-centre of each cell. Another artist suggests fitting the character into a fixed 64×64 canvas and centering it in each square. — [Unity Discussions: Animation frame by frame](https://discussions.unity.com/t/animation-frame-by-frame/609077); [itch.io comments, deadrevolver pixel prototype](https://deadrevolver.itch.io/pixel-prototype-player-sprites/comments?before=31) (search-summary level)
- **Trade-off of padding.** Padding the bottom enough for a wide sword swing creates a large transparent gap below the feet and puts the character too far above its navigation point. — [itch.io post](https://itch.io/post/14791440); [Godot forums 21243](https://godotforums.org/d/21243-texture-size-for-animations) (search-summary level)
- **Unity per-frame pivots.** In the Sprite Editor choose Pivot = Custom and Pivot Unit Mode = Pixels to enter pivot coordinates in pixels or snap the pivot to pixel corners. Unity stores the pivot as normalised 0..1 internally; Pixels mode only changes the representation (the issue tracker closed a related bug "By Design"). Users fix animation drift by giving every frame a custom pivot that lines up with the idle sprite. — [Unity 6 manual: prepare sprites for pixel perfect](https://docs-alpha.unity3d.com/Manual/urp/2d-pixelperfect-prep-sprites.html); [Unity forum: pivot unit mode](https://forum.unity.com/threads/cant-apply-pivot-unit-mode-change-in-the-sprite-editor.744116/); [Unity issue tracker](https://issuetracker.unity3d.com/issues/cannot-apply-in-sprite-editor-when-changing-only-pivot-unit-mode); [Unity Discussions](https://discussions.unity.com/t/animation-frame-by-frame/609077)
- **Legacy Unity docs.** The pivot is one of nine presets (rectangle-relative) or a Custom location. — [Unity 2018.2 Sprite Editor manual](https://docs.unity.cn/2018.2/Documentation/Manual/SpriteEditor.html)
- **TexturePacker.** Pivots are set per sprite (double-click the sprite). "Enable pivot points" is a global switch. Trim modes "Crop, keep position" and "Polygon outline" shrink bounds and automatically adjust pivots to keep alignment. Disabling pivots while trimming can misalign animation frames. Pivot controls disappear in "Crop, flush position" mode. — [CodeAndWeb: Unity pivot points](https://www.codeandweb.com/texturepacker/knowledgebase/unity-pivot-points) (fetched); [CodeAndWeb: pivot settings missing](https://www.codeandweb.com/texturepacker/knowledgebase/pivot-point-settings-missing)
- **Engines that ignore trim offsets bounce the sprite.** On PlayCanvas the fix was to apply `spriteSourceSize` x/y at runtime. — [PlayCanvas forum](https://forum.playcanvas.com/t/texture-packer-trimmed-sprites-and-positioning/15024)
- **Godot.** AnimatedSprite2D has a single `offset` ("The texture's drawing offset") and `centered` (default true) for the whole node. The docs describe no per-frame offset or origin. — [Godot AnimatedSprite2D docs](https://docs.godotengine.org/en/stable/classes/class_animatedsprite2d.html). The community workaround is a script holding an array of per-frame offsets, applied when the frame changes, or exporting frames on a fixed border. — [Godot forum: setting pivot points for frames](https://forum.godotengine.org/t/animatedsprite-setting-pivot-points-for-frames/29644); [GameDev.tv community](https://community.gamedev.tv/t/change-offset-of-a-single-animation-frame/96420)
- **Aseprite.** Slices have a pivot ("to specify the central/base location of the sprite inside the slice"). Slice data exports in sprite-sheet JSON under `meta.slices[].keys[]` with `frame`, `bounds` and `center` (the docs example shows `center`, not `pivot`). — [Aseprite docs: Slices](https://aseprite.org/docs/slices/) (fetched). Slices are keyed: a key applies from its frame onward, so per-frame pivots need a key on each frame. — [Aseprite community: pivot and other points](https://community.aseprite.org/t/sprite-pivot-and-other-points/3883); [Aseprite community: which frame a slice is on](https://community.aseprite.org/t/how-do-i-figure-out-which-frame-a-slice-is-on/4033). Aseprite2Unity reads a slice named `unity:pivot` and uses its centre as the pivot. — [Aseprite2Unity docs](https://aseprite2unity.readthedocs.io/en/latest/manual/sprite-pivots.html)
- **Baseline and centerline as authoring guides.** Fix canvas size per frame, use a feet baseline and a torso centerline, and check alignment with a register layer. — [SpriteCook](https://www.spritecook.ai/blog/animating-sprite-sheets-tips-for-consistency) (vendor; search summary)
- **Pixel-grid placement at runtime.** Unity's Pixel Snapping moves sprites only in whole-pixel increments. — [Unity 2D Pixel Perfect](https://docs.unity3d.com/Packages/com.unity.2d.pixel-perfect@2.0/manual/index.html). Godot warns that centered textures may deform in pixel art. — [Godot docs](https://docs.godotengine.org/en/stable/classes/class_animatedsprite2d.html)

### Inferences
- **Recommended convention for this project.** Use a uniform canvas per animation (or per character), an anchor at (foot-centre x, ground-contact row y), integer coordinates only, and an even/odd-safe origin. Godot's warning about centered textures implies that a centred origin on an odd-width sprite falls on a half pixel. Using a bottom-left integer origin, or `floor(w/2)`, avoids that. Emit a sidecar JSON per frame, `{anchor_x, anchor_y, contact: true/false, tag}`, so the browser renderer never infers alignment from bounding boxes.
- **How crouch, land and jump frames should be aligned:**
  - *Ground-contact frames* (idle, walk, crouch, kneel, land, attack-in-place): align vertically by the contact row (lowest non-shadow foot pixels). Align horizontally by the planted foot or the hip centre, not by mass centroid, so arm swings and weapon extensions don't drag the body sideways (the Godot attack-frame drift above is this failure).
  - *Airborne frames*: either bake the vertical offset into the canvas and keep the anchor at the logical ground point (the "navigation point" convention), or keep the art at the baseline and drive height from code. Decide per animation and record it in the tag. Mixing the two produces double-height or zero-height jumps.
- **Colour-overlap registration still has a role.** Use it as a second, constrained pass: after vertical contact alignment, search only horizontal shifts (and maybe ±1 px vertical for airborne frames) that maximise overlap of rigid parts (head, torso outline). It should never be the primary vertical anchor for contact frames.
- **Browser rendering (not fetched in this session; standard web APIs).** The equivalent of Unity Pixel Snapping and point filtering is canvas `imageSmoothingEnabled = false`, CSS `image-rendering: pixelated`, integer scale factors, and rounding draw positions to whole art-pixels. Otherwise the half-pixel jitter described for Unity and Godot reappears.

### Gaps
- I could not confirm from current Aseprite docs whether the exported slice JSON includes a `pivot` field per key in the latest release. The docs example shows only `bounds` and `center`. Verify by exporting a test file.
- I found no official Godot proposal or doc for per-frame SpriteFrames offsets; only community workarounds. I did not check godot-proposals directly.
- I found no studio-level written convention, such as a public art bible, that specifies how crouch frames are aligned. The guidance above is inferred from engine pivot conventions plus contact-based reasoning.

---

## 3. How pro pixel animators keep faces (and other invariant parts) identical

### Takeaway
Professionals don't redraw what shouldn't change. They separate invariant parts onto layers or linked cels, animate body sections in passes, use onion skin to register new drawings against neighbours, and in larger pipelines move to skeletons or 3D sources so identity is guaranteed by construction. For an AI pipeline, the equivalent is compositing: generate the motion, then restore invariant regions from a canonical reference.

### Cited Findings
- **Aseprite linked cels.** Two cels are linked when they share the same image and xy position. Editing one updates all, and the docs suggest them for static parts across an animation. They are created by copying cels within a "Continuous" layer, and unlinking gives a cel its own image copy. — [Aseprite docs: Linked Cels](https://www.aseprite.org/docs/linked-cels/)
- **Aseprite onion skinning.** It shows several frames at once so other frames can be used as reference while drawing the current one. You can configure how many previous and next frames are shown and use red/blue tinting (F3 toggles it). — [Aseprite docs: Onion Skinning](https://aseprite.org/docs/onion-skinning/)
- **Separate layers for parts.** Put animated parts (e.g. the head) on their own layer so a new frame edits only the head and leaves the body alone. Duplicate the previous frame and change only the target region. Limbs are often copied across frames, moved, then cleaned up by hand. — search summary of [KDE forum](https://forum.kde.org/viewtopic.php%3Ff=139&t=165286.html), [itch.io post](https://itch.io/post/12536366), [itch.io post](https://itch.io/post/10268612) (community, search-summary level)
- **Animate in passes, one body section at a time across all frames** (legs, then arms, head, overall body), starting from extremes and keyframes. — [Slynyrd Pixelblog 25](https://slynyrd.com/blog/2020/1/23/pixelblog-25-motion-cycles)
- **Reuse.** Classic 8-bit JRPGs commonly reuse the same 2-frame walk cycle as the idle animation. — [Slynyrd Pixelblog 8 – Intro to Animation](https://slynyrd.com/blog/2018/8/19/pixelblog-8-intro-to-animation) (search-summary level)
- **Skeleton- or bone-based 2D tools.** After splitting a drawing into parts you must fill the areas hidden behind each part so they can move independently. — [PixelOver docs: Bones animation](https://docs.pixelover.io/tutorials/bones_animation/). PixelLab's skeleton-based generation constrains proportions across frames. — [abratabia](https://abratabia.com/ai-game-art/ai-sprite-sheets.php)
- **3D source pipelines.** Dead Cells used a 3D model to avoid hand-redrawing on retakes, so model consistency is inherited from the mesh. — [80.lv](https://80.lv/articles/case-study-dead-cells-character-art-pipeline/)
- **Celeste.** The developer's public `Player.cs` Readme lists "player sprite, player hair" as separate reusable components. This suggests the hair, Madeline's most animated feature, is handled separately from the body sprite frames. — [NoelFB/Celeste Source/Player Readme](https://github.com/NoelFB/Celeste/tree/master/Source/Player) (fetched listing; implementation not read)
- **AI-specific hybrid advice.** Generate only the base frame with AI and animate by hand in Aseprite. Apply one cleanup pass (outline, shading, palette) uniformly to every frame. — [SpriteCook](https://www.spritecook.ai/blog/animating-sprite-sheets-tips-for-consistency) (vendor; search summary). PerfectPixel Studio (GitHub) generates a few directions with AI, mirrors the rest, applies deterministic shared-palette quantization and grid snapping, and scores "identity consistency and motion". — [SourcePulse listing](https://www.sourcepulse.org/projects/31645438) (young project; maintenance unknown)

### Inferences
- **Make a "face lock" the AI equivalent of linked cels:**
  1. Pick a reference frame (idle frame 0), or a small set of approved expression or blink variants.
  2. Define a face mask, either by hand once per character or automatically from palette indices (eye, eye-white, mouth, brow) inside the head bbox.
  3. For each generated frame, locate the head by integer template matching on the outline and hair silhouette, allowing ±N px translation and optional horizontal flip.
  4. Paste the canonical face pixels at that offset (or the whole head if the head doesn't turn). If the match score is low, for example because the head turns, flag the frame for regeneration instead of guessing.
  5. Allow eye changes only for frames tagged `blink`/`expression`, and take those pixels from an approved variant library, not from the AI output.
- **Generalise to "rigid parts" (head, hat, held item).** This turns the classic pro practice (head on its own layer, copied between frames, with tweening only on the body) into deterministic code, and it removes face boil by construction.
- **Pixelization must be grid-phase-stable across frames.** Registering after pixelization and re-detecting the grid per frame lets each frame sample the face at a different phase. Better: register in high-res space, detect the grid once on the reference, and reuse the phase. Or skip AI pixelization for the face entirely by pasting the canonical face.

### Gaps
- I found no published studio art bible (Celeste, Owlboy, Shovel Knight, Hollow Knight) that explicitly documents "face lock" or head-layer conventions. The pro workflow evidence here comes from tool docs (Aseprite) and individual artists (Slynyrd) plus community threads.
- Celeste's hair implementation was not read; only its existence as a separate component is confirmed.
- I did not retrieve AdamCYounis video content, Lospec critique conventions, or r/PixelArt critique norms; Reddit did not surface in search.

---

## 4. QA methods: manual practice and automatable checks

### Takeaway
The manual QA kit is consistent across sources: onion skin, side-by-side sheets, reference overlay at reduced opacity, playing at target fps and at 1× size, zooming out to catch flicker, colour sampling, and in-engine playback for foot sliding and pivot jumps. No widely used off-the-shelf "sprite animation linter" exists. Existing tools cover palettes and export validation. Frame-consistency checks (static-region diff, ground line, anchor, eye invariants) have to be custom, but each is a few dozen lines of NumPy.

### Cited Findings
- **Manual methods.**
  - Onion skin. — [Aseprite docs](https://aseprite.org/docs/onion-skinning/)
  - Check each frame at 100% or zoomed out for flicker; preview at target fps for jitter, foot sliding and unreadable poses. — [SpriteCook](https://www.spritecook.ai/blog/animating-sprite-sheets-tips-for-consistency) (vendor; search summary)
  - Side-by-side review of all frames of a sequence; reference overlay of the base frame at reduced opacity; RGB sampling with a 5–10-per-channel tolerance; confirm every frame occupies the same pixel area; in-engine playback for out-of-order or missing frames. — [abratabia](https://abratabia.com/ai-game-art/ai-sprite-sheets.php)
  - Spine's ghosting view with X offset equal to the per-frame movement, to tune for zero foot sliding. — [Esoteric Software forum](https://de.esotericsoftware.com/forum/d/6777)
- **Existing automated tools (partial coverage):**
  - PixelPal (Go CLI): `validate` checks every pixel against a palette, and `convert` remaps. — [GitHub vulpivia/pixelpal](https://github.com/vulpivia/pixelpal)
  - spritetools.py: `spritecheck.py` validates MSX2 hardware constraints. This is a precedent for constraint linting. — [GitHub pvmm/spritetools.py](https://github.com/pvmm/spritetools.py/blob/pal-optimisation/README.md)
  - aseprite-mcp `validate_sprite_for_game_export`: dimensions (exact or tile multiple), colour mode, frame counts, required animation tags, transparent background and palette budget, with a pass/fail result plus errors and warnings. — [Glama: aseprite-mcp tool](https://glama.ai/mcp/servers/MalloyTheDev/aseprite-mcp/tools/validate_sprite_for_game_export)
  - character-animation-creator-skill (Python/Pillow): `pixel_snap.py` cleanup and `validate_64_sheet.py` sheet validation. — [SourcePulse listing](https://www.sourcepulse.org/projects/32289298)
  - PerfectPixel Studio: quality score for identity consistency and motion. — [SourcePulse](https://www.sourcepulse.org/projects/31645438)
  - pixtxt: a text format for pixel art with a Python SDK for parsing, validating and exporting, designed for git diff and CI validation. — [PyPI pixtxt](https://pypi.org/project/pixtxt/)
- **Rendering QA.** Unity's Pixel Perfect Camera exposes the trade-off between pixel snapping and upscaled render texture, and between Point (sharp, may shimmer) and Retro AA (blurrier, less shimmer). — [Unity URP Pixel Perfect ref](https://docs.unity.com/en-us/engine/6000.0/manual/unity2d/2d-urp/2d-pixelperfect/ref)

### Inferences
- **Proposed automated check suite for the Python post-step.** Run after pixelization and registration, before export. Each check produces a per-frame verdict plus a debug overlay PNG. Tolerances are starting points to tune on real data.

| # | Check | Implementation sketch (NumPy on indexed RGBA) | Fail condition (initial) |
|---|---|---|---|
| C1 | Grid / medium | alpha ∈ {0,255}; all RGB ∈ shared palette; frame size identical across the animation | any violation |
| C2 | Anchor / pivot | per frame: `contact_y` = max row with opaque non-shadow pixels in the foot band; `contact_x` = centre of the lowest foot run(s) | contact frames: `contact_y ≠ baseline`; `|contact_x − ref| > 1` unless tagged |
| C3 | Floating / sinking | same as C2 restricted to frames tagged contact (crouch, kneel, land) | any non-zero gap |
| C4 | Face lock | integer template match of head region vs reference (search ±3 px, optional flip); Hamming distance inside face mask | > 0 changed pixels in untagged frames |
| C5 | Eye invariants | connected components of eye-colour indices inside head bbox: count, per-eye pixel count, bbox w×h, relative offset between eyes | any change from reference (unless `blink`/`expression`) |
| C6 | Static regions | user- or auto-declared static mask (e.g. torso logo, hat); diff after alignment | > 0–1 px changed |
| C7 | Volume | opaque pixel count, bbox h/w, head bbox size | > ±3% area or ±1 px head size outside tagged squash frames |
| C8 | Palette per region | index histogram in head, hair, torso and legs regions vs reference | new index appearing or > N px index swap |
| C9 | Outline | outline-index mask: count 2×2 all-outline blocks (doubles); outline pixels per perimeter pixel vs reference | doubles > 0, or ratio drift > 10% |
| C10 | Silhouette continuity | IoU of alpha masks between neighbours (after anchor alignment) | IoU ≈ 1.0 (duplicate) or < (median − 3σ) (pop) |
| C11 | Loop seam | treat diff(last, first) as a neighbour pair in C10 | outlier or exact duplicate |
| C12 | Foot sliding (walk/run) | track the planted-foot x over contact frames at the configured world speed | world-space drift ≠ 0 px; emit recommended `speed = stride_px / frames_per_step × fps` |
| C13 | Light direction | signed offset of highlight-index centroid from the body centroid | sign flips between frames |
| C14 | Orphans and noise | isolated single pixels whose 8 neighbours are all a different index, excluding eye/highlight indices | count > reference + k |

- **Visual reports to automate the manual methods:**
  - Auto-generate (a) an onion-skin overlay strip: previous frame in red and next in blue over the current frame, matching Aseprite's tint convention.
  - (b) a difference heatmap per neighbour pair, using red for pixels changed inside "should-be-static" masks.
  - (c) a GIF at target fps at 1× and at the target game zoom, mirroring the "play at target fps, at actual size" practice.
  - (d) a horizontally flipped copy. Flipping reveals asymmetry and drift, as in traditional practice; I found no source for this in pixel art specifically.
- **Fix, don't just flag.** Several checks have deterministic auto-fixes: C2/C3 by re-anchoring with an integer shift; C4/C5/C6 by compositing from the reference; C1/C8 by snapping to the nearest palette index with region-locked indices; C9 by removing doubles (delete outline pixels whose removal keeps 8-connectivity, per the Lospec "connect only at corners" rule); C12 by computing speed. C7, C10 and C13 failures should go back to regeneration, because they mean the pose itself is wrong.

### Gaps
- I found no public blog post or postmortem from an established studio describing automated frame-consistency QA for sprite animation (static-region diffing, ground-line validation). The checks above are original synthesis.
- I did not evaluate the quality or maintenance status of PerfectPixel Studio, character-animation-creator-skill, or aseprite-mcp beyond their listings.

---

## 5. Perception: why tiny face changes are so noticeable

### Takeaway
Faces attract early fixations, and within faces the eyes usually attract the first fixation through a hard-to-suppress early bias. Observers reliably detect small relational shifts in eye position (in one study about 3.5% of face height vertically, at roughly 86–90% accuracy), and frame-to-frame changes add a visual transient, which is a known attention-capturing event. On a chibi with a roughly 15–20 px head, a single art-pixel change in an eye is at or above that detectable range. That is why "noise" in faces reads as a defect even when the rest of the sprite boils unnoticed.

### Cited Findings
- **Faces draw first fixations** more often than other object categories and are processed faster, with shorter fixations. — [Morrisey et al. 2019, Visual Cognition (McMaster record)](https://experts.mcmaster.ca/scholarly-works/1652852) (abstract-level via search summary)
- **Eyes get the first look.** First fixations landed on the eyes more often than the mouth even when participants were told to look at the mouth. The bias is hard to inhibit early on and gives way to voluntary control later. — [Thompson et al. 2019, Acta Psychologica (Essex repository)](https://repository.essex.ac.uk/27760/) (search-summary level)
- **Eyes are diagnostic.** Recognition accuracy was higher when the first fixation fell on the eyes rather than the mouth. — [Hills et al., ARU repository](https://aru.figshare.com/articles/journal_contribution/First_fixations_in_face_processing_The_more_diagnostic_they_are_the_smaller_the_face-inversion_effect/23774331/1) (search-summary level)
- **Caveat.** One study found that for a single face the nose was fixated first more often than the eyes, while with multiple faces the eyes were. — [Journal of Psychological Science 2017 (ECNU)](https://jps.ecnu.edu.cn/EN/Y2017/V40/I3/520) (search-summary level)
- **Sensitivity to small eye displacements.** On 300×400 px face images, moving eyes and eyebrows by 20 px horizontally or 14 px vertically was calibrated to match featural replacement at about 90% correct in pilot testing. In the main study, upright changes were detected at 86% correct (d′ = 2.36) in young adults. Adults showed much larger inversion effects for vertical than horizontal eye shifts (following Goffaux & Rossion 2007). — [Frontiers in Psychology 2015 (PMC4531213)](https://pmc.ncbi.nlm.nih.gov/articles/PMC4531213/) (fetched)
- **Vertical eye-position changes are more disrupted by inversion than horizontal ones** (JEP:HPP 2012). — [Lingnan University record](https://scholars.ln.edu.hk/en/publications/face-inversion-disproportionately-disrupts-sensitivity-to-vertica/) (search-summary level)
- **Older work on feature displacement.** Haig (1984), "The effect of feature displacement on face recognition", *Perception* 13:505–512, is the classic reference. I could not retrieve its findings. — [ModelDB citation](https://modeldb.science/citations/70222). Kemp's UCL thesis reports subjects are more sensitive to feature displacement in normal faces than in inverted or negated ones. — [UCL Discovery](https://discovery-pp.ucl.ac.uk/id/eprint/10099486) (search-summary level)
- **Transients capture attention.** Abrupt onsets capture attention (Yantis & Jonides 1984, placeholder paradigm). Whether this comes from the luminance transient or from "new object" status is debated. Mathôt & Theeuwes (2012) found that intra-saccadic onsets, which have no perceived transient, did not capture attention, which favours a local-transient account. — [Frontiers in Psychology 2013 review](https://www.frontiersin.org/articles/10.3389/fpsyg.2013.00958/full); [Yantis lecture PDF (UNL)](https://psych.unl.edu/mdodd/Psy498/Yantis.pdf) (search-summary level)
- **Intentional vs accidental wobble in craft practice.** Avoiding all line boil "can make characters seem frozen in place like statues", so boil is sometimes used deliberately. — [TV Tropes: Line Boil](https://TVTropes.org/pmwiki/pmwiki.php/Main/LineBoil). Hand-drawn wobble on faces is usually done as a 4-frame loop, because 2 frames look "too jittery". — [itch.io post 3683514](https://itch.io/post/3683514)

### Inferences
- **Scale comparison to the project's sprites.** In the Frontiers study, 14 px vertical on a 400-px face is about 3.5% of face height, and 20 px horizontal on a 300-px face is about 6.7% of face width. Both were detected at about 86–90%. For a chibi head about 15–20 art-px tall, one art-pixel is about 5–7% of head height. A single-pixel eye shift is therefore in the same or a larger relative range than displacements people reliably notice. This holds even in a static two-image comparison, which is harder than animation, where the change also produces a transient. (Caveats: different stimuli, a photographic face vs a stylised sprite, and a different task. Treat this as an order-of-magnitude argument, not a threshold.)
- **Why a 1-px eye change reads as error rather than motion.** Intentional face motion in pixel art is structured: a blink is a vertical collapse to a line; a look direction is both pupils moving the same way; a squash affects the whole head. Accidental AI or pixelization noise is unstructured. One eye changes, a pixel appears or disappears, the left and right eyes become asymmetric. An automated rule can encode this: allow eye changes only if both eyes change by the same transform (same dx/dy, or the same blink pattern), and only in frames tagged as such. Treat anything else as noise.
- **Practical threshold.** For faces at this scale the tolerance should be 0 changed pixels in untagged frames. For non-face static regions, 0–1 px is acceptable if it doesn't flicker back and forth (an A-B-A-B pattern at the loop rate is the most noticeable transient). These are proposals, not literature values.
- **Prioritisation.** Given eye-first fixation and transient capture, QA effort should go first to faces and eyes (C4/C5), then contact and anchor (C2/C3, since floating breaks physical plausibility), then palette flicker (C8), and outline and volume last.

### Gaps
- I found no perception study measuring detectability of pixel-level changes in low-resolution or pixel-art faces, nor any study of "intentional vs noise" thresholds for animated stylised faces. The scale argument above is an extrapolation from photographic-face research.
- Haig (1984) numeric findings were not obtained (paywalled; abstract not in results).
- Several perception citations are based on abstracts or search summaries, not full-text reads.
