# Pixel-art character sprite animation craft (for ~24–48 px chibi townsfolk, 3/4 front view, few frames)

Research date: 2026-10-17. Scope: how professional pixel artists and shipped games build small character animations (key poses, frame counts, timing, motion principles, on-model consistency, readability), with numbers where a source gives them.

Source notes:
- **Pedro Medeiros (Saint11, artist on Celeste/TowerFall).** His tutorials are image/GIF-only. I downloaded the GIFs and transcribed the text, and I read the per-frame delays with `ffprobe`.
- **Stardew Valley, Pokémon Emerald, Celeste, Habbo.** Numbers come from game code or data: the community Stardew wiki, the decompiled Stardew source on GitHub, the pret/pokeemerald disassembly, Celeste's officially published `Player.cs`, and archived Habbo client data. These are primary in the sense that they are the shipped values. Stardew and Habbo come through unofficial mirrors.
- **Not accessed.** Video-only sources (MortMort, AdamCYounis, Brandon James Greer) and the book *Pixel Logic* were not accessible; see Gaps.

---

## 1. Key poses and frame counts per action, and where the body sits relative to the ground line

### Takeaway
Shipped top-down/3/4 RPG sprites use very few unique drawings. A walk is a **4-entry loop built from 3 drawings** (step-A, stand, step-B, stand) in Stardew Valley and Pokémon Emerald, and 4 frames in Habbo. One-shot actions are **4–5 frames** (harvest, tool swing). Hand-work loops and laughing/waving are **2-frame alternations**. Saint11's canon for richer motion:
- side walk: 6 key frames (contact, down, down+, prepare-passing, passing, up), doubled to 12 for fluid motion
- top-down walk: 6 frames, which are 3 frames plus their mirror
- top-down run: minimal 4 frames
- idle bounce: 2, 3 or 6 frames
- jump: 5 phases (anticipation, going up, invert, fall, contact)

The ground line rule is consistent everywhere. The body is lowest on the frame(s) right after foot contact and highest on passing/up. The planted foot moves backward, never forward.

### Cited Findings

**Walk – side view (key poses)**
- Saint11 "Walk Cycle": **12 frames = fluid animation, 6 frames for each leg; 6 frames = "useful in low resolution", 3 frames for each leg.** The "important frames" are:
  1. **Contact**: "the first frame where the front leg touches the ground"
  2. **Down**: "the impact causes the torso and head to go down"
  3. **Down+**: "the lowest frame in the animation, widest position of the arms"
  4. **Prepare passing**: "get ready for moving up – I added a head delay in this one"
  5. **Passing**: "moving up – lots of potential for variation here"
  6. **Up**: "highest point in the animation"

  Rules: "arms always move with the opposite leg"; "leg on ground always moves towards the back" — [Saint11, Walk.gif](https://saint11.art/img/pixel-tutorials/Walk.gif) (index: [saint11.art pixel-art tutorials](https://saint11.art/blog/pixel-art-tutorials/); original post 2017, [tweet](https://twitter.com/saint11/status/905098438571958272) as listed by [Lospec](https://lospec.com/pixel-art-tutorials/tags/animation))
- Slynyrd (Raymond Schlitter), Pixelblog 50:
  - **8 frames** is "the best balance of economy and fluidity". A **6-frame** version that drops the least important frames still reads well. A **4-frame key-pose-only** version is "lacking on its own".
  - Poses: Contact (heel strikes, limbs at swing extremes, figure lowest), Down (front foot flat, weight to centre, back foot lifts), Pass (legs cross, figure tallest), Swing (forward leg most extended, still airborne).
  - The second four frames mirror the first four — [Slynyrd Pixelblog 50](https://slynyrd.com/blog/2024/5/24/pixelblog-50-human-walk-cycle)
- Slynyrd: head height across the cycle should trace a **triangle wave, not a sine wave**. "If the head position across the sequence creates a perfect sine wave, the uniform motion feels a bit unnatural." — [Slynyrd Pixelblog 50](https://slynyrd.com/blog/2024/5/24/pixelblog-50-human-walk-cycle)
- Slynyrd's working order: "Animate the legs first, then the arms, head, and overall body movement", one body section across all frames at a time. "The extremes of motion are keyframes." — [Slynyrd Pixelblog 25](https://www.slynyrd.com/blog/2020/1/23/pixelblog-25-motion-cycles)
- Generic four-key description of a walk: forward contact, first passing, back contact, second passing — [Wikipedia: Walk cycle](https://en.wikipedia.org/wiki/Walk_cycle) (via search snippet)

**Walk – top-down / 3/4 front view (the project's case)**
- Saint11 "Top Down Walk Cycle":
  - "Start with the idle frame."
  - "Remember the perspective: feet behind legs, legs behind torso, torso behind head."
  - **"Basic 6-frame cycle":** "move one leg forward while moving the arm on the same side back", "then flip those 3 frames horizontally for the other leg movement".
  - **Smoother:** "duplicate every frame and make an intermediate action; with the extra frames you can add more personality and bounciness".
  - **Walking up (away):** "less aggressive vertical movement on torso and head".
  - **Sideways:** "use strong contrast points on hand and feet", "similar to a platform walk cycle"

  — [Saint11, TopDownWalkCycle.gif](https://saint11.art/img/pixel-tutorials/TopDownWalkCycle.gif)
- Stardew Valley farmer (16×32 px sprite) walk down = frames **0, 1, 0, 2**, each 200 ms. That is 3 unique drawings in a 4-entry loop. Left/right and up follow the same pattern (6,7,6,8 and 12,13,12,14). Left is the mirrored right sprite — [Stardew Valley Wiki: Modding:Farmer sprite](https://stardewvalleywiki.com/Modding:Farmer_sprite)
- Pokémon Emerald overworld walk south = frame **3 (step) → 0 (stand) → 4 (other step) → 0**, 8 ticks each. Some sprites reuse the same step frame horizontally flipped (`ANIMCMD_FRAME(3, 8, .hFlip = TRUE)`) instead of drawing a second step — [pret/pokeemerald object_event_anims.h](https://github.com/pret/pokeemerald/blob/master/src/data/object_events/object_event_anims.h)
- Habbo avatar "Move" action: **4 frames (0–3)** for the body, legs and hand part sets — [HabboAvatarAnimation data (archived client)](https://github.com/xnumad/HabboSwfOpenSource/blob/master/src/binaryData/HabboAvatarRenderLib_HabboAvatarAnimation.bin). Leg assets are named `h_wlk_lg_<id>_<dir>_0..3` — [CycloneIO offset.json](https://github.com/itsezc/CycloneIO)

**Run**
- Saint11 "Run Cycle 1 – simple run": **8 frames vs 16 frames**. "A simple cycle can be understood in 4 frames then you repeat everything with the other leg. You can make the animation more fluid by making inbetweens." Key poses:
  - **Jump**: "both legs in the air, arms always alternated with legs"; highest position
  - **Fall down**: "fall just a little, open arms/legs a little"; widest
  - **Contact**: "hit the ground, forward leg is straight"; thinnest
  - **Recover**: "forward leg moves back, back leg moves forward"; lowest position

  — [Saint11, RunCycleSimple.gif](https://saint11.art/img/pixel-tutorials/RunCycleSimple.gif)
- Saint11 "Top Down Run Cycle":
  - "think of the head, body and feet as 3 shapes on top of each other"
  - "A minimal run down anim can be made with only 4 frames"
  - "the second half is the first half flipped except for the hair and other asymmetries"
  - Jump frames: "3 frames of leg stretched, hair and clothes going up w/ the wind". Recover frames: "2 frames of switching the legs, it's the lowest position". Side and back anims use the same idea (3 jump, 2 recover).
  - "I like to exaggerate arms movement to make it more expressive"

  — [Saint11, TopDownRun.gif](https://saint11.art/img/pixel-tutorials/TopDownRun.gif)

**Idle / breathing**
- Saint11 "Character Idle" ("I really like to make very bouncy character idles"):
  - **2 frames:** (1) "move down one pixel, open arms, bend knees"; (2) "move up one pixel, arms move down". "Character doesn't change mass."
  - **3 frames:** "that middle frame adds a lot": it makes the "fall down" slower, improves the knee-bend transition, and makes the head transition smoother "by delaying the face movement".
  - **6 frames:** "with more frames I like to add secondary animations, like the hair lagging behind the head… lots of <1 pixel movement".
  - Tips: "a good trick is to move the contents of the face/body/etc after the silhouette has moved"; "vertical movement alone is boring – I always try to have the horizontal movement compensate the vertical"; the idle pose is the place for personality and for special animations such as **blink, yawn, look around, scratch**.

  — [Saint11, characterIdle.gif](https://saint11.art/img/pixel-tutorials/characterIdle.gif) (2017, [tweet](https://twitter.com/saint11/status/882228769230073858))
- An AI-tool vendor guide (low reliability) lists idle/breathing at **2–4 frames** and claims shipped idles "often use 2–4 frames with long hold times", ~400–500 ms per frame — [sprite-ai.art guide](https://www.sprite-ai.art/guides/how-to-animate-pixel-art) (via search snippet; treat as unverified)
- Habbo has a separate "Idle" action that animates **only the head part set** (`activepartset="head"`, `assetpartdefinition="idl"`, `preventheadturn="true"`) — [HabboAvatarActions.xml (archived)](https://github.com/DennisObject/retro-hotel-files/blob/master/flash/gamedata/HabboAvatarActions.xml)

**Blink**
- Stardew farmer blink is a **separate eye overlay**, not a body frame:
  - The eye patch is **6 px wide × 2 px tall** (front-facing) on a 16×32 sprite. Facing sideways it is 2×2 px.
  - It is drawn over the body at per-frame feature offsets (`featureXOffsetPerFrame` / `featureYOffsetPerFrame`) — [decompiled FarmerRenderer.cs](https://github.com/veywrn/StardewValley/blob/master/StardewValley/FarmerRenderer.cs)
  - The wiki confirms: "the eye blink sprite is drawn from a rectangle starting at X=5, Y=16 that is 6px wide and 2px tall" — [Stardew wiki](https://stardewvalleywiki.com/Modding:Farmer_sprite)
- Stardew blink sequence (decompiled `Farmer.cs`): eye state **4 → 1 → 4 → open**, each held ~**50 ms**, for ~150 ms total. State 4 is also the "exhausted" eye state, so it is probably half-closed; that reading is my inference — [decompiled Farmer.cs](https://github.com/veywrn/StardewValley/blob/master/StardewValley/Farmer.cs)

**Talk (mouth flaps)**
- Habbo "Talk": the **head part only**, **2 frames** (`spk` frames 0, 1). Asset names are `h_spk_hd_<id>_<dir>_0/1` — [Habbo animation data](https://github.com/xnumad/HabboSwfOpenSource/blob/master/src/binaryData/HabboAvatarRenderLib_HabboAvatarAnimation.bin); [open-hotel client sheet.json](https://github.com/open-hotel/open-hotel-client)

**Jump**
- Saint11 "Jump":
  - "I like having 2 animations for jumping": **UP** when starting X_SPEED = 0, **FORWARD** when X_SPEED > 0. "Don't forget dust and particles!"
  - Phases:
    1. "Anticipation? Avoid on player controlled characters"
    2. "Going up! Simple animation, doesn't loop"
    3. "Invert: when changing the Y speed, use this as a bridge between up and fall"
    4. "Fall: arms go up, head looks down; hair, cloth and other objects flap in the wind"
    5. "Contact: squash as much as you can on contact; this can be a long animation that's interrupted if necessary"
  - "Hands: this is a fast animation, use hands with high contrast to track the movement"

  — [Saint11, Jump.gif](https://saint11.art/img/pixel-tutorials/Jump.gif)
- Vendor guide (low reliability):
  - Timing: launch 1–2 frames (60–80 ms), apex hold 120–180 ms, landing squash 1–2 frames (80–120 ms).
  - Squash/stretch sizing for a ~14 px character: anticipation squash to 12–13 px tall and +1 px wide; launch stretch to 15–16 px tall and ~1 px narrower.

  — [sprite-ai.art animation principles](https://www.sprite-ai.art/guides/animation-principles) (via search snippet; unverified)

**Crouch / kneel / place something on the ground**
- Stardew "Harvesting" (bending to the ground to pick up): **4 frames, 100 ms each** per direction (54–57 down, 58–61 side, 62–65 up) — [Stardew wiki](https://stardewvalleywiki.com/Modding:Farmer_sprite)
- Celeste's duck is a code squash: `Sprite.Scale = new Vector2(1.4f, .6f)` when Madeline ducks — [Celeste Player.cs](https://github.com/NoelFB/Celeste/blob/master/Source/Player/Player.cs)

**Digging / shovelling (heavy-tool swing)**
- Stardew axe/pickaxe/hoe, down: **5 frames: 150, 40, 40, 170, 75 ms**. Side: 100, 40, 40, 220, 75. Up: 100, 40, 40, 220, 75. It plays once. For charged tools, the second-to-last (impact) frame is held an extra 30 × toolPower — [Stardew wiki](https://stardewvalleywiki.com/Modding:Farmer_sprite)

**Painting / brushing / repetitive hand work (closest analogues)**
- Stardew milking and shearing: **2-frame alternation, 400 ms per frame**, repeated twice — [Stardew wiki](https://stardewvalleywiki.com/Modding:Farmer_sprite)
- Stardew panning: 3 drawings in an A-B-A-C pattern at **150 ms**, repeated, ending on a **500 ms** hold.
- Stardew watering: 75, 100, then a **500 ms** hold on the pour pose — [Stardew wiki](https://stardewvalleywiki.com/Modding:Farmer_sprite)

**Waving**
- Habbo "Wave": `activepartset="handLeft"`. Only the left-hand part animates, with **2 frames** (`wav` 0, 1; one part set lists 4) — [HabboAvatarActions.xml](https://github.com/DennisObject/retro-hotel-files/blob/master/flash/gamedata/HabboAvatarActions.xml); [Habbo animation data](https://github.com/xnumad/HabboSwfOpenSource/blob/master/src/binaryData/HabboAvatarRenderLib_HabboAvatarAnimation.bin). Asset sequence `hh_human_body_h_wav_lh_1_<dir>_0/1` — [open-hotel client](https://github.com/open-hotel/open-hotel-client)

**Laughing / cheering**
- Stardew "Laughing" (cutscenes): **2 frames** (102, 103) — [Stardew wiki](https://stardewvalleywiki.com/Modding:Farmer_sprite)
- Habbo "Laugh": `activepartset="handRightAndHead"`, `startfromframezero="true"`, `preventheadturn="true"`. Head and right hand animate; the body stays static — [HabboAvatarActions.xml](https://github.com/DennisObject/retro-hotel-files/blob/master/flash/gamedata/HabboAvatarActions.xml)

### Inferences
- **Recommended frame budgets** for a 43-px chibi in 3/4 front view, derived from the shipped examples above:

  | Action | Frames |
  |---|---|
  | Walk | 3 drawings in a 4-entry loop (stepL, stand, stepR, stand), or Saint11's 6 (3 + mirror) for more bounce |
  | Run | 4 |
  | Idle | 2–3, plus a blink overlay |
  | Talk | 2–3 mouth states on the head only |
  | Wave | 2 (arm only) |
  | Laugh | 2 (head and shoulders) |
  | Crouch/place | 4 one-shot |
  | Dig | 5 one-shot (wind-up, 2 fast swing frames, impact hold, recover) |
  | Paint/brush | 2-frame loop with long holds, optionally an A-B-A-C variant |
  | Jump | 5 (anticipation crouch, going up/stretch, apex/invert, fall, landing squash) |
  | Cheer | 2–3 (arms down/crouch → arms up/stretch, optional small hop) |

  None of these games ships a "cheer" animation that I could verify.
- **Ground-line rules:**
  - The lowest pixel row of the feet stays on a fixed baseline in every grounded frame.
  - The body drops ~1 px on contact/down frames and rises on passing/up (Saint11, Slynyrd).
  - At 43 px tall, a 1 px bob is ~2.3 % of height. It is visible and sufficient; Saint11's idle uses exactly 1 px.
  - The supporting foot slides backward relative to the body ("leg on ground always moves towards the back"). In-world translation speed must match stride length or feet will skate. Pokémon ties exactly one step-frame plus one stand-frame to one 16-px tile.
  - Only jump/cheer-hop frames may leave the baseline.
- **Anticipation for NPCs:** Saint11's "avoid anticipation on player-controlled characters" is about input latency. Townsfolk are not player-controlled, so anticipation frames (crouch before hop, wind-up before dig) are allowed and help readability.
- **Programmatic enforcement:**
  - Check the baseline by finding the lowest opaque row per frame; it must equal the ground y for all grounded frames.
  - Detect foot skating by comparing the planted-foot x position across contact frames.
  - Mirrored second halves can be generated by horizontal flip, then patched for asymmetric items (hair parting, held tool).

### Gaps
- No authoritative frame-by-frame breakdown found for **cheering** or **painting/brushing** in any shipped game. The Stardew hand-work loops are analogues, not the same action.
- No developer-confirmed frame counts for Earthbound/Mother 3 or Undertale walk/talk; I did not find citable data in this pass.
- The Habbo Wave part set listing 4 frames (vs 2) was not resolved. Which part uses 4 frames needs a closer look at the XML.
- The Stardew eye-state meaning (4 = half-closed, 1 = closed) is inferred from code usage, not documented.

---

## 2. Timing: frame durations, holds, uneven timing, blink rate and length, conversation turns

### Takeaway
Pixel-art cycles run at roughly **5–12 fps of unique drawings** (80–200 ms per frame):
- Saint11 plays his walk/idle demos at 100 ms per frame and his jump/run/squash demos at 80 ms.
- Stardew walks at 200 ms per frame.
- Pokémon Emerald walks at ~133 ms per frame (8 ticks at ~60 Hz).

What makes motion feel professional is **uneven timing**:
- Stardew's tool swing is 150/40/40/170/75 ms; its run alternates 60–140 ms.
- Pokémon's run alternates 5 and 3 ticks.
- Long holds sit on key poses (500 ms pour, 6000 ms collapse).

Blinks are short (~150 ms in Stardew, 100–150 ms in humans) and occur every few seconds at random (Stardew: ≥2.2 s plus random; humans ~17/min).

### Cited Findings
- Saint11 tutorial GIF playback delays (read with ffprobe):
  - Walk, Character Idle, Top Down Walk Cycle and Top Down Run: **100 ms per frame**
  - Jump, Run Cycle 1, Squash and Stretch and Animation Easing: **80 ms per frame**

  Sources: [Walk.gif](https://saint11.art/img/pixel-tutorials/Walk.gif), [characterIdle.gif](https://saint11.art/img/pixel-tutorials/characterIdle.gif), [TopDownWalkCycle.gif](https://saint11.art/img/pixel-tutorials/TopDownWalkCycle.gif), [TopDownRun.gif](https://saint11.art/img/pixel-tutorials/TopDownRun.gif), [Jump.gif](https://saint11.art/img/pixel-tutorials/Jump.gif), [RunCycleSimple.gif](https://saint11.art/img/pixel-tutorials/RunCycleSimple.gif), [Squash.gif](https://saint11.art/img/pixel-tutorials/Squash.gif), [Easings.gif](https://saint11.art/img/pixel-tutorials/Easings.gif)
- Stardew farmer timings in ms ([Stardew wiki](https://stardewvalleywiki.com/Modding:Farmer_sprite)):
  - **Walk:** 200 per frame
  - **Run down:** 90, 60, 120, 60, 90, 60, 120, 60
  - **Run side:** 90, 140, 100, 90, 140, 100
  - **Harvest:** 4 × 100
  - **Heavy tool:** 150, 40, 40, 170, 75
  - **Watering:** 75, 100, 500
  - **Eating:** 250, 400, 401, 250, 250…
  - **Drinking:** 250, 150, 250, 200…, ending 50
  - **Milking/shearing:** 400 per frame
  - **Nausea:** 2 frames alternating at 350
  - **Passing out:** 1000, 500, 1000, 200, then a 6000 hold
  - **Melee swing:** 55, 45, 25, 25, 25, then a weapon-speed-dependent hold
- Pokémon Emerald (GBA, timings in display ticks):
  - Walk anim: 8 ticks per frame (`ANIMCMD_FRAME(3, 8)…`)
  - Faster movement speeds halve it to 4, then 2 ticks
  - Running: **5, 3, 5, 3 ticks** (frames 12, 9, 13, 9), an uneven rhythm
  - Facing/standing frame: 16 ticks

  — [pokeemerald object_event_anims.h](https://github.com/pret/pokeemerald/blob/master/src/data/object_events/object_event_anims.h). Normal walking moves **1 px per tick for 16 ticks** per 16-px tile (`sStep1Funcs` has 16 entries) — [pokeemerald event_object_movement.c](https://github.com/pret/pokeemerald/blob/master/src/event_object_movement.c)
- Ones and twos: "A drawing held for two frames is called 'on twos'… when each consecutive frame has a new drawing, it is called 'on ones'". On twos at 24 fps = 12 drawings/s. Fast action is usually on ones — [Animation Podcast: Ones and Twos](https://animationpodcast.com/2005/06/04/ones-and-twos/) (via search snippet)
- Saint11 on easing: "Easing is all about acceleration."
  - "In real life nothing moves linearly; linear movement looks dull and uninteresting."
  - "I love making the movement accelerate and/or decelerate during motion… I like to distort the middle frame."
  - Back in/out, "also called anticipation and overshoot", is "specially useful for attacks and other fast or strong movements; sometimes I even skip the middle frame to make the movement stronger".
  - "The distance between drawings gives us the feeling of acceleration."

  — [Saint11, Easings.gif](https://saint11.art/img/pixel-tutorials/Easings.gif)
- Stardew blink timing ([decompiled Farmer.cs](https://github.com/veywrn/StardewValley/blob/master/StardewValley/Farmer.cs)):
  - `blinkTimer` accumulates elapsed ms. Once it exceeds **2200 ms**, each update has a **1 % chance** to start a blink.
  - A blink sets the timer to −150 and steps the eye state at −100 and −50, then reopens at 0. That gives **~150 ms of closing/closed/opening in ~50 ms steps**.
- Human reference values ([Wikipedia: Blinking](https://en.wikipedia.org/wiki/Blinking)):
  - Rate: "around 17 blinks per minute" in the lab, with blinks 2–10 s apart. It drops to ~4–5/min during sustained focus such as reading (Bentivoglio et al. 1997, cited there).
  - Duration: 100–150 ms (UCL), or 100–400 ms (Harvard BioNumbers BNID 100706). Closures over 1000 ms count as microsleeps.
- Conversation turn gaps:
  - "The typical gap between them is just 200 milliseconds", "nigh-universal" across cultures (Levinson / Max Planck, quoted from Ed Yong in *The Atlantic*). The same piece says turns average "around 2 seconds" — [Language Hat: The universal gap](https://languagehat.com/the-universal-gap/)
  - Stivers et al. (2009, PNAS, 10 languages): all languages avoid overlap and minimise silence. Mean gaps differ across languages within a ~250 ms range of the cross-language mean — [MPI record of Stivers et al. 2009](https://forms.mpi.nl/node/50939) (via search snippet)

### Inferences
- **Expected Stardew blink interval:** at 60 updates/s, a 1 % per-update chance gives an expected ~100 updates (~1.7 s) after the 2.2 s threshold. That is a mean of ~3.9 s between blinks with a 2.35 s minimum, i.e. ~15/min. This matches the human ~17/min and is a good default.
- **Blink recipe:**
  - Interval: random, uniform or exponential, ~2–6 s.
  - Shape: half (50 ms) → closed (50–100 ms) → half (50 ms), or a single closed frame of 100–150 ms.
  - Occasionally do a double blink. Do not sync blinks across NPCs; per-NPC random phase avoids "crowd blinking in unison".
  - Pause blinking during fast actions; Stardew suppresses the eye overlay while using most tools.
- **Hold pattern for one-shot actions** (Stardew's tool timing is the template): a medium wind-up (100–150 ms), 1–2 very fast frames (~40 ms, effectively smears), a long impact/result hold (170–500 ms), then a short recovery (~75 ms).
- **Repetitive work loops** (paint, brush, dig repeatedly) can be slow, 2-frame alternations at ~350–400 ms. That reads as calm labour rather than frantic motion.
- **Walk speed vs frame duration:** Stardew 200 ms is leisurely, Pokémon ~133 ms is brisk, Saint11's demos run at 100 ms. For townsfolk strolling, 150–200 ms per frame with a 4-entry loop is consistent with Stardew.
- **Conversation staging:**
  - Leave ~200 ms (up to ~500 ms) between one NPC's bubble ending and the next NPC's mouth starting, rather than overlapping.
  - Mouth flaps should run only while text is "being spoken" and must end on the closed mouth.
- **CSS implication:** `steps(n)` gives equal frame durations. Uneven timing therefore needs either (a) per-frame keyframe percentages, (b) duplicated frames in the strip to emulate holds (the classic "on twos" trick), or (c) a JS scheduler using a Stardew-style `frame@ms` table.

### Gaps
- No authoritative source found for **mouth-flap speed** (ms per mouth state) in shipped pixel games (Undertale, Animal Crossing, Habbo). A value of ~100–150 ms per flap is a common-practice guess, not cited.
- Habbo's avatar animation playback rate (ms per frame) was not found.
- Aseprite's default frame duration (widely believed to be 100 ms) was not confirmed; the docs page fetched did not state it.
- PMC full texts of blink-rate studies were blocked (reCAPTCHA); human blink figures come via Wikipedia's citations.

---

## 3. Motion principles applied to tiny sprites (anticipation, squash/stretch, follow-through, arcs, secondary motion, sub-pixel, smears)

### Takeaway
At small sizes the principles survive in compressed form:
- **Anticipation and squash** are a 1–2 frame crouch.
- **Stretch** replaces in-betweens on fast moves.
- **Mass must stay constant**: if you change width, change height too.
- **Follow-through** is hair, cloth or a face that lags 1 frame behind the silhouette.
- **Arcs and easing** come from uneven spacing between drawings.
- **Sub-pixel motion** is faked by recolouring edge pixels.

Shipped games mix drawn frames with code-driven transforms. Celeste squashes Madeline via sprite scale in code, and Saint11 explicitly recommends adding squash/stretch tweens in game code. Owlboy's art team, by contrast, treated rotation as their only non-hand-drawn compromise.

### Cited Findings
- **Squash & stretch**, Saint11:
  - "Mass… mass never changes. When changing the width of an object, always change the height too. This way the mass is constant. This is the most important rule of squash and stretch."
  - "Like motion blur, squash is very useful to convey movement."
  - "Stretching is a good and cheap way of smoothing fast animations."
  - "The preparation squashes the object in the opposite direction of the action."
  - "Stiff objects do not deform as much."
  - "Mix with motion blur for an extreme effect."
  - "Add squash and stretch tweens to your game code for more dynamism."
  - Sequence shown: prepare → jump → brake → prepare → recover.

  — [Saint11, Squash.gif](https://saint11.art/img/pixel-tutorials/Squash.gif)
- Classic definition: squash & stretch with constant volume; anticipation; follow-through and overlapping action ("drag" = parts lagging a few frames); slow in/out (more drawings near the extremes); arcs; secondary action ("should emphasize the main action, not compete"); timing = number of drawings; exaggeration; solid drawing; appeal. Source: Thomas & Johnston, *The Illusion of Life* (1981), summarised at [Wikipedia: Twelve basic principles of animation](https://en.wikipedia.org/wiki/Twelve_basic_principles_of_animation)
- **Celeste, code-driven squash/stretch** (official `Player.cs`):
  - Jump: `Sprite.Scale = new Vector2(.6f, 1.4f)`
  - Spring bounces: `SuperBounce` uses `(.5f, 1.5f)`; `SideBounce` and the respawn intro use `(1.5f, .5f)`
  - Duck: `(1.4f, .6f)`
  - Landing: `X = Lerp(1, 1.6, squish)`, `Y = Lerp(1, .4, squish)`, where squish = fall speed / max fast-fall speed
  - Every frame the scale approaches 1 at **1.75 units/s**

  — [NoelFB/Celeste Player.cs](https://github.com/NoelFB/Celeste/blob/master/Source/Player/Player.cs)
- **Follow-through / secondary motion:**
  - Saint11's 6-frame idle adds "secondary animations, like the hair lagging behind the head" — [characterIdle.gif](https://saint11.art/img/pixel-tutorials/characterIdle.gif)
  - In the fall phase, "hair, cloth and other objects flap in the wind" — [Jump.gif](https://saint11.art/img/pixel-tutorials/Jump.gif)
  - In run jump frames, "hair and clothes going up w/ the wind" — [TopDownRun.gif](https://saint11.art/img/pixel-tutorials/TopDownRun.gif)
- **Delay / overlap inside the body:**
  - "Move the contents of the face/body/etc after the silhouette has moved"; the 3-frame idle smooths the head "by delaying the face movement" — [characterIdle.gif](https://saint11.art/img/pixel-tutorials/characterIdle.gif)
  - The walk's prepare-passing frame has "a head delay" — [Walk.gif](https://saint11.art/img/pixel-tutorials/Walk.gif)
- **Weight compensation:** "Vertical movement alone is boring – I always try to have the horizontal movement compensate the vertical." — [characterIdle.gif](https://saint11.art/img/pixel-tutorials/characterIdle.gif)
- **Cute characters**, Saint11:
  - "Make it extra bouncy"
  - "Use lots and lots of stretch and squash"
  - "Everything is soft, bend the shapes"
  - "Make everything malleable"
  - Body "heights down to the bottom, like a flour sack"
  - "Usually short (less than 4 heads)"
  - "Oversized hair"

  — [Saint11, Cuteness.gif](https://saint11.art/img/pixel-tutorials/Cuteness.gif)
- **Sub-pixel (<1 px) movement**, Saint11 ("You can't [move less than 1 pixel], but you can fake some very subtle movements"). Techniques:
  - "move part of it first; too many steps cause object to look bent"
  - "create an extra pixel then slide it through the line"
  - "move the interior after or before the silhouette; use dark color near borders"
  - "fade colors for an illusion of <1 pixel movement"
  - "careful: too many colors makes everything look blurry"
  - "mostly move light; avoid moving shapes"
  - "note that the silhouette barely changes"
  - "slide line breaking points for a very subtle movement"

  — [Saint11, Subpixel.gif](https://saint11.art/img/pixel-tutorials/Subpixel.gif). A secondary description of the same idea (recolouring edge pixels; Metal Slug cited as an example) is at [Tiny Warrior Games](https://tinywarriorgames.com/2019/01/04/game-development-pixel-art-sub-pixel-animation/)
- **Smear frames:** frames "used in between key frames… to stylistically visualize fast movement along a path of motion" — [Wikipedia: Smear frame](https://en.wikipedia.org/wiki/Smear_frame). Saint11: "making a trail is good for fast movement"; sometimes skip the middle frame "to make the movement stronger" — [Easings.gif](https://saint11.art/img/pixel-tutorials/Easings.gif)
- **Owlboy:** art director Simon Stafsnes Andersen says the game is pixel by pixel with "no gradient or blur effects, no tracing, and no 3D captures", and that allowing **rotations** was the one compromise — [Siliconera](https://www.siliconera.com/owlboy-result-nearly-decade-spent-chasing-pixel-art-perfection/) (via search snippet)
- **Joints:** "mark the joint placement… gives a clear folding point and keeps [limbs] from looking rubbery"; keep front and back legs covering the same distance "or the body will appear to stretch and contract like an accordion" — [Slynyrd Pixelblog 25](https://www.slynyrd.com/blog/2020/1/23/pixelblog-25-motion-cycles)

### Inferences
- **Translating Celeste's scale values into dedicated frames for a 43-px chibi:**

  | Celeste scale | Pose | Size in dedicated frame |
  |---|---|---|
  | 0.6 × 1.4 | Takeoff stretch | ~52–55 px tall, ~70 % width |
  | ~1.4–1.6 × 0.6–0.4 | Landing squash | ~26–34 px tall, ~140 % width |

  For chibi townsfolk a milder version is enough: ±10–20 % (4–8 px). Hand-drawn or AI-drawn squash frames can approximate this while keeping mass constant: width × height roughly constant.
- **Code scaling vs pixel grid:** applying code scaling (CSS `transform: scale`) directly to a pixel sprite at screen resolution would mix pixel sizes and break the pixel grid. Celeste presumably avoids this by rendering to a low-res buffer, but that was **not verified**. For a CSS pipeline, prefer dedicated squash frames, or render the sprite into a low-res canvas, scale there, then upscale by an integer.
- **Sub-pixel tricks rely on deliberate palette choices on edge pixels.** AI image models are unlikely to produce them reliably. Treat sub-pixel motion as optional polish that could be generated programmatically (e.g., shifting a highlight colour by one step), not something to request from the model.
- **Follow-through can be enforced programmatically** if hair/ponytail is a separate layer: offset the hair layer by the head's displacement from the *previous* frame (1-frame lag). This is the same "delay the contents after the silhouette" trick Saint11 describes.

### Gaps
- No source found for Celeste's internal render resolution / how Sprite.Scale is pixel-snapped (would confirm whether code squash stays on-grid).
- No first-hand Paul Robertson or Derek Yu animation statements were retrieved in this pass.

---

## 4. On-model consistency: head and face reuse, outline, proportions, palette, volume

### Takeaway
Shipped games keep characters on-model largely by construction, not by redrawing carefully:
- **Stardew** draws the head/torso base, then hair, hat, accessories and arms as separate layers placed per animation frame. Eyes are a tiny overlay positioned by per-frame offset tables, and body parts are identified by exact palette colours.
- **Habbo** decomposes the avatar into part sets (head, body, left hand, right hand, legs). Each action animates only the parts it needs: Talk = head, Wave = left hand.

Artists add rules on top: keep mass constant, keep the dummy structure and fold anchor points constant, mirror carefully.

### Cited Findings
- **Stardew farmer sprite layers**, bottom to top: Head/Torso/Boots → Pants → Shirt → Accessories → Hair → Hat → Arms (top). "The placement of layers… is dependent upon the animation, and cannot be modified by editing png files other than by shifting the accessory within its frame." Each sprite is 16 × 32 px — [Stardew wiki](https://stardewvalleywiki.com/Modding:Farmer_sprite)
- Stardew renderer draws the eye/blink patch at `featureXOffsetPerFrame[currentFrame]` / `featureYOffsetPerFrame[currentFrame]`. The face features are one unit moved by a per-body-frame offset table, not redrawn per frame — [decompiled FarmerRenderer.cs](https://github.com/veywrn/StardewValley/blob/master/StardewValley/FarmerRenderer.cs)
- Stardew palette as data: "The game identifies skin, eyes, boots, pants, arms, and shirt sleeves in the farmer base using the color" and recolours them per player choice — [Stardew wiki](https://stardewvalleywiki.com/Modding:Farmer_sprite)
- **Habbo** actions declare an `activepartset`: Wave → `handLeft`; Laugh and Blow → `handRightAndHead`; Idle → `head`; plus flags such as `preventheadturn`. Parts are separate assets with per-frame x/y offsets, e.g. `"h_spk_hd_1_0_1": {"x": "-18", "y": "73"}` — [HabboAvatarActions.xml](https://github.com/DennisObject/retro-hotel-files/blob/master/flash/gamedata/HabboAvatarActions.xml); [open-hotel offset.json](https://github.com/open-hotel/open-hotel-client)
- **Mass/volume:** "Mass never changes… this is the most important rule of squash and stretch" — [Saint11 Squash.gif](https://saint11.art/img/pixel-tutorials/Squash.gif); the idle "character doesn't change mass" — [Saint11 characterIdle.gif](https://saint11.art/img/pixel-tutorials/characterIdle.gif)
- **Slynyrd on construction:**
  - Start from a colour-coded dummy (head, neck, torso, arms, legs) and keep its structure consistent across frames.
  - Clothing folds should keep "consistent tension anchor points and direction"; "keep the details of folding lines minimal".
  - Asymmetric elements must be drawn, not mirrored: "Simply reflecting the sprite from right to left would be inaccurate."

  — [Slynyrd Pixelblog 50](https://slynyrd.com/blog/2024/5/24/pixelblog-50-human-walk-cycle)
- **Mirroring is standard practice:**
  - Saint11: "flip those 3 frames horizontally for the other leg"; "the second half is the first half flipped except for the hair and other asymmetries" — [TopDownWalkCycle.gif](https://saint11.art/img/pixel-tutorials/TopDownWalkCycle.gif), [TopDownRun.gif](https://saint11.art/img/pixel-tutorials/TopDownRun.gif)
  - Pokémon uses `.hFlip = TRUE` on step frames — [pokeemerald anims](https://github.com/pret/pokeemerald/blob/master/src/data/object_events/object_event_anims.h)
  - Stardew left = flipped right — [Stardew wiki](https://stardewvalleywiki.com/Modding:Farmer_sprite)
- Thomas & Johnston: straight-ahead animation "makes proportions harder to hold"; pose-to-pose suits keeping structure. They warn against "twins" (mirror-symmetric poses) as lifeless — [Wikipedia: Twelve principles](https://en.wikipedia.org/wiki/Twelve_basic_principles_of_animation)
- Saint11's drawing process: "silhouette sketch → add details → animate"; "you can sketch the anim using silhouettes, it's easier and you make sure the action is easy to read" — [Saint11 Silhouette.gif](https://saint11.art/img/pixel-tutorials/Silhouette.gif)

### Inferences
- **Most important design decision for an AI-frame pipeline:** don't let the model redraw the face per frame. Generate (or pick) one canonical head with face, plus separate eye-state and mouth-state patches. Composite them onto AI-generated body frames using a per-frame head-offset table (Stardew/Habbo style). This turns "face drift", the dominant failure mode of image models across frames, into a solved problem.
- **Checks enforceable in code:**
  - Canvas and anchor: identical canvas size; fixed foot anchor (see §1).
  - Palette lock: quantise every frame to a master palette and reject or repair off-palette pixels. Stardew's use of exact colours as part IDs shows how strict palettes are in production.
  - Outline: a single outline colour (or a fixed small set) and 1-px thickness. Check that every boundary pixel between sprite and transparency belongs to the outline set.
  - Volume: opaque pixel count per frame within a tolerance (e.g., ±8 %) of the idle frame, except deliberate squash/stretch frames. Those still conserve area roughly, which is checkable via width × height.
  - Static-region diff: in idle/talk/blink, pixel-diff consecutive frames and assert that only the allowed regions change (mouth box, eye box, chest/arms).
- **Mirroring:** generate one half-cycle, flip it, then patch known asymmetries (hair part, held tool, bag strap) as a post-step, rather than asking the model for both halves.

### Gaps
- No published statement found from a named pixel artist explicitly describing "copy-paste the head across body frames". The practice is evidenced in shipped data (Stardew layers/offsets, Habbo part sets) rather than in a tutorial quote.

---

## 5. Readability at small scale: silhouettes, contrast, exaggeration, minimal pixel changes, flicker

### Takeaway
At 16–48 px, motion reads through the **silhouette** and a few **high-contrast points** (hands, feet). Exaggerate arm swings and squash. Single-pixel changes are very noticeable: Slynyrd's 1-px chest drop "makes all the difference", and Saint11's idle bob is 1 px. Stardew's whole blink is a **6×2 px** patch, which shows how few pixels a facial change needs when it sits in a high-contrast spot.

The flip side: unintended 1-px changes (lines shifting, extra colours, non-integer scaling) read as wobble or blur.

### Cited Findings
- **Silhouette first:**
  - "The silhouette is the prologue, the first thing the viewer will notice"
  - "Sketch the anim using silhouettes… you make sure the action is easy to read"
  - Add "strong elements to the silhouette, something that will make it easy to recognize"

  — [Saint11 Silhouette.gif](https://saint11.art/img/pixel-tutorials/Silhouette.gif)
- **Contrast points:**
  - Jump: "this is a fast animation, use hands with high contrast to track the movement" — [Saint11 Jump.gif](https://saint11.art/img/pixel-tutorials/Jump.gif)
  - Top-down sideways walk: "use strong contrast points on hand and feet" — [Saint11 TopDownWalkCycle.gif](https://saint11.art/img/pixel-tutorials/TopDownWalkCycle.gif)
- **Exaggeration:** "I like to exaggerate arms movement to make it more expressive" — [Saint11 TopDownRun.gif](https://saint11.art/img/pixel-tutorials/TopDownRun.gif). Cute characters: "extra bouncy… lots and lots of stretch and squash" — [Saint11 Cuteness.gif](https://saint11.art/img/pixel-tutorials/Cuteness.gif)
- **Cute-face proportions** for small sprites: "big forehead, big eye sockets, big ears, small nose, tiny maxilla, wide head, fewer marks". "Shiny and dark eyes have a very strong puppy effect." — [Saint11 Cuteness.gif](https://saint11.art/img/pixel-tutorials/Cuteness.gif)
- **Single-pixel significance:** "Moving the breast down one pixel on the contact frame makes all the difference." — [Slynyrd Pixelblog 50](https://slynyrd.com/blog/2024/5/24/pixelblog-50-human-walk-cycle). Saint11's idle uses exactly ±1 px vertical moves — [characterIdle.gif](https://saint11.art/img/pixel-tutorials/characterIdle.gif)
- **Minimal facial change:** Stardew's blink/eye overlay is 6×2 px (front) or 2×2 px (side) on a 16×32 body — [Stardew wiki](https://stardewvalleywiki.com/Modding:Farmer_sprite); [FarmerRenderer.cs](https://github.com/veywrn/StardewValley/blob/master/StardewValley/FarmerRenderer.cs). Habbo's talk swaps only the head asset across 2 frames — [Habbo animation data](https://github.com/xnumad/HabboSwfOpenSource/blob/master/src/binaryData/HabboAvatarRenderLib_HabboAvatarAnimation.bin)
- **Sub-pixel cautions** (the risks of tiny changes): "too many steps cause object to look bent"; "too many colors makes everything look blurry" — [Saint11 Subpixel.gif](https://saint11.art/img/pixel-tutorials/Subpixel.gif)
- **Scaling wobble:** with nearest-neighbour scaling at non-integer factors, the number of screen pixels per art pixel varies unevenly, producing "doddering/wobbling" during motion — [Defold forum](https://forum.defold.com/t/how-to-get-rid-of-dodder-woobling-while-animating-position-scale-zoom/64780)
- **Line quality** (static, but it matters when lines shift per frame): "regular straight lines – all steps have the same number of pixels"; curves: "each step should be smaller than the previous"; avoid "bad corners" and "unintentional squares" — [Saint11 Fundamentals2.gif](https://saint11.art/img/pixel-tutorials/Fundamentals2.gif)

### Inferences
- **Why 1-px features flicker:** if a 1-px line or eye pixel changes position, length or colour between frames without intent, the viewer sees it as motion (Slynyrd shows 1 px is perceptible). AI-generated frames typically introduce many such unintended deltas, which reads as "boiling".
  - **Mitigation:** composite static parts (face, outline of unmoving regions) from a single source, and diff-check everything else.
- **For a 43-px chibi** (roughly 2.5× Stardew's 16×32 height), eyes are likely ~2–4 px tall. A blink can be a 1–2 px tall dark line replacing the eye, and talk can use a 2-state mouth (closed 1–2 px line vs open 2×2 or 3×2 dark shape) in the same high-contrast face zone. These pixel sizes are my extrapolation, not sourced.
- **Render pipeline:** display only at integer scale factors with nearest-neighbour (`image-rendering: pixelated`), and snap sprite positions to the art-pixel grid. Otherwise the art wobbles regardless of how good the frames are.
- **Readability checks enforceable programmatically:**
  - Silhouette check: binarise frames and compare silhouettes of key poses. They should differ clearly (IoU below a threshold) for distinct poses, and be near-identical for static parts.
  - Contrast of hands/feet vs body: a luminance-difference threshold.

### Gaps
- No quantitative source found on minimum pixel size for an eye/mouth change to read at a given display scale.
- *Pixel Logic* (Michael Azzi), MortMort, AdamCYounis and Brandon James Greer material on readability was not accessible (book/video), so not cited.

---

## 6. Concrete reference examples from shipped games

### Takeaway
The best-documented numbers come from game code and data:
- **Stardew Valley:** frame@ms tables for every farmer action.
- **Pokémon Emerald:** tick-exact walk/run tables.
- **Celeste:** exact squash/stretch scale values.
- **Habbo:** the part-set action model with 4-frame walk, 2-frame wave and 2-frame talk.

For Owlboy, Hyper Light Drifter, Eastward and Sea of Stars I found only general art-direction statements, no frame counts or timings.

### Cited Findings
- **Stardew Valley** (farmer 16×32 px): all frame@ms data in §1–2 above — [Stardew wiki](https://stardewvalleywiki.com/Modding:Farmer_sprite).
  - Walk: 3 drawings, 4-entry loop at 200 ms.
  - Run: 8 entries over 5 drawings at 60–120 ms (down).
  - Tool: 150/40/40/170/75.
  - Harvest: 4 × 100.
  - Hand-work loops: 2 × 400.
  - Blink: ~150 ms, at least 2.2 s apart plus random — [decompiled Farmer.cs](https://github.com/veywrn/StardewValley/blob/master/StardewValley/Farmer.cs)
- **Pokémon Emerald (GBA overworld)** — [pokeemerald anims](https://github.com/pret/pokeemerald/blob/master/src/data/object_events/object_event_anims.h); [movement](https://github.com/pret/pokeemerald/blob/master/src/event_object_movement.c):
  - Walk: frames 3/0/4/0 at 8 ticks each.
  - 1 px per tick over a 16-px tile.
  - Run: 12/9/13/9 at 5/3/5/3 ticks.
  - Facing: 16 ticks.
  - Some NPCs reuse one step frame with hFlip.
- **Celeste:** jump stretch 0.6×1.4; landing squash up to 1.6×0.4 scaled by fall speed; duck 1.4×0.6; recovery toward 1.0 at 1.75/s — [Celeste Player.cs](https://github.com/NoelFB/Celeste/blob/master/Source/Player/Player.cs). Its artist's tutorials (Saint11) are cited throughout §1–5.
- **Habbo:** Move = 4 frames on body/legs/hands; Wave = 2 frames on the left hand only; Talk = 2 frames on the head only; Laugh = right hand + head, starting from frame zero, no head turn; Idle = head-only — [Habbo animation data](https://github.com/xnumad/HabboSwfOpenSource/blob/master/src/binaryData/HabboAvatarRenderLib_HabboAvatarAnimation.bin); [HabboAvatarActions.xml](https://github.com/DennisObject/retro-hotel-files/blob/master/flash/gamedata/HabboAvatarActions.xml). These are community archives of the official client data, not official documentation.
- **Owlboy:** fully hand-pixelled, "no gradient or blur effects, no tracing, and no 3D captures"; rotations were the one compromise — [Siliconera](https://www.siliconera.com/owlboy-result-nearly-decade-spent-chasing-pixel-art-perfection/) (via search snippet)
- **Hyper Light Drifter:** Alx Preston cites Street Fighter III's "that many frames of handcrafted animation" as an inspiration — [Kill Screen](https://www.killscreen.com/see-how-far-hyper-light-drifter-has-come-before-its-arrival-next-week/) (via search snippet). No frame counts found.
- **Eastward:** Pixpil's pixel art combined with a "modern, innovative 3D lighting system", inspired by 90s Japanese animation and Mother/Zelda — [Gematsu](https://gematsu.com/2018/04/chucklefish-and-chinese-developer-pixpil-announce-90s-anime-inspired-adventure-rpg-eastward-for-pc) (via search snippet). No frame data found.

### Inferences
- **The two closest analogues to this project:**
  - **Stardew** (3/4 front-view farm townsfolk, 16×32) is the best timing template.
  - **Habbo** (3/4 chibi avatars, part-based) is the best structural template for AI-generated frames. Generate parts and actions per part set, so a "talk" or "wave" never touches the rest of the body.
- **Shipped games use far fewer unique drawings than tutorials suggest.** 3 drawings for a walk and 2 for many gestures are production-proven at this scale. Quality comes from timing tables and holds, not frame count. This favours an AI pipeline, where each extra frame is another chance for drift.

### Gaps
- No frame counts or timings found for **Hyper Light Drifter, Owlboy, Eastward, Sea of Stars, Earthbound/Mother 3, Undertale** in this pass. They would need sprite-sheet analysis (e.g., Spriters Resource rips) or developer talks, which were not retrieved.
- The Stardew data comes from a community wiki and a decompiled source mirror (unofficial). The Habbo data comes from community archives of client files. The values are the shipped ones, but provenance is unofficial.
