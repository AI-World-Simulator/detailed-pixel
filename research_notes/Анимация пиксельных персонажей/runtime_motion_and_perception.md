# Runtime / procedural layer of tiny-character animation and how viewers perceive it

Scope: timing, procedural motion and choreography for 2–4 chibi sprites (~43 art px tall, integer CSS scale x3/x2/x1) in browser loader scenes; frames switched by step-end keyframes on a frame strip, motion by whole-art-pixel translate. Project context checked in `src/loader.js` / `src/loader.css` (commit fa4cfa7): walk cycle `walkA 160 / idle 160 / walkB 160 / idle 160 ms`, ground and scenery belts at 25 art px/s, parade lanes 240 art px in 10.8 s with lanes offset by -2.7 s, chat loop 14 s with talk frames alternating on `TALK = [130,170,110,190,140,120,180,150] ms`, blink = one 140 ms frame, cheer = `jump`/`idle` alternating every 300 ms with a 2 px lift. Observations about that code are marked as Inferences.

## 1. Blinking: real rates and durations, animator timing, double blinks, desynchronising several characters

### Takeaway
Real adults blink roughly 12–20 times per minute at rest (one blink every ~3–5 s), more in conversation (~26/min) and far less while reading (~4–5/min). A spontaneous blink lasts ~100–300 ms and is asymmetric: the lid closes fast and opens slowly. Animators time a regular blink at about 2 closing frames, 1 closed and 3 opening frames, and tie blinks to motivations such as head turns, gaze shifts, changes of thought and the ends of utterances, not to a metronome. For tiny sprites with one closed-eye frame, a 100–160 ms closed frame fired at jittered 2–6 s intervals, with an occasional double blink and listener blinks placed 0.25–0.5 s after a speaker's pause, matches both the data and animation practice.

### Cited Findings
- Spontaneous blink rate: about 14/min on average, with large variation between and within people. — [Wascher et al., EXCLI J. 2015](https://eldorado.tu-dortmund.de:443/bitstream/2003/35060/1/Wascher_27112015_proof.pdf)
- A video study of 150 healthy volunteers found a mean blink rate of 17/min at rest, rising to 26/min during conversation and falling to 4.5/min while reading; the most common pattern was conversation > rest > reading. — [Bentivoglio et al., "Analysis of blink rate patterns in normal subjects", Mov. Disord. (record)](https://wicri-demo.istex.fr/Wicri/Sante/explor/MovDisordV3/Site/fr/Main/Exploration/bibRecord.php?hk=005409)
- Doughty's literature review (reported second-hand): 1.4–14.4 blinks/min during reading, 8–21 in primary gaze and 10.5–32.5 during conversation. "The large ranges ... are indicative of the high variability among subjects." — [Review of Ophthalmology, "Breaking down the blink"](https://www.reviewofophthalmology.com/article/breaking-down-the-blink)
- A wearable eye-tracker study (24 students) measured 10.7 ± 9.7 blinks/min during reading vs 32.4 ± 12.4 during conversation. I took the attribution from a search summary and did not open the PDF. — [medRxiv 2022.11.19.22282503](https://medrxiv.org/content/10.1101/2022.11.19.22282503.full.pdf)
- Baseline viewing gave a median of 15.5 blinks/min, against 5–6/min when reading on a tablet or book rest. — [Argilés et al., BMJ Open Ophthalmology, table](https://pmc.ncbi.nlm.nih.gov/articles/PMC6020759/table/T2)
- Blink duration estimates conflict. Two early studies give a mean spontaneous blink of ~283–285 ms and a later one ~334 ms, while another puts endogenous blinks at 95–220 ms. Part of the disagreement is that the lid often does not return fully to its start position, so "the end of the blink" is hard to define. — [arXiv 1507.01046 (literature summary)](https://arxiv.org/pdf/1507.01046)
- High-speed camera at 600 fps, 25 volunteers, *voluntary* blinks: total 572 ± 25 ms; closing 76 ± 2 ms; closed 58 ± 4 ms; opening 438 ± 24 ms. Peak closing speed is ~243 mm/s against ~157 mm/s opening, which the authors describe as "a much faster closing action than opening action." The intro gives ~1/3 s as a rough benchmark for one blink. — [Kwon et al., J. R. Soc. Interface 2013](https://pmc.ncbi.nlm.nih.gov/articles/PMC4043155/)
- Animator frame counts. Regular blink: "Closing lids (2 frames) hold eyes closed (1 frame) opening lids (3 frames)". Fast blink: 2 closing + 3 opening with no hold. Long blink: 3 closing + 2 held + 4 opening. Eye batting: 3/4 close (1 frame) and open over 2. An eye dart takes ~3 frames, and a change of point of interest takes 3–4 frames. The page does not state the frame rate. — [Bloop Animation, blinking](https://www.bloopanimation.com/blinking-animation/)
- Motivations for blinks: head turns and fast head movement "would almost always get us to blink"; a change of thought, where the blink marks a realisation; and long stares, where a blink keeps the look from feeling dead. — [Bloop Animation](https://www.bloopanimation.com/blinking-animation/)
- Ren'Py's EasyBlink exposes a "double blink percent" setting, and characters "will never blink thrice in a row". — [Feniks, Easy Blinking for Ren'Py](https://feniksdev.itch.io/easy-blinking-for-renpy)
- Adobe Character Animator's auto-blink was reported to produce rapid double or triple blinks that looked wrong. Users fixed it by lowering blinks per minute. — [Adobe community thread](https://community.adobe.com/t5/character-animator-discussions/get-rid-of-double-blink/m-p/13296040)
- Listener blink entrainment: listeners blinked 0.25–0.5 s after the speaker blinked, mainly when the speaker's blink fell at the end of, or during, a pause in speech. The effect was absent without sound, so it is not automatic imitation. — [Nakano & Kitazawa 2010, Exp. Brain Res. 205:577–581](https://doi.org/10.1007/s00221-010-2387-z)
- Listener blinks act as feedback. With identical 499 ms nods, a long listener blink (607 ms) made speakers give significantly shorter answers than a short blink (208 ms). In the corpus, the longest 25 % of blinks were > 410 ms, and most listener blinks fell around the ends of turn units. — [Hömke, Holler & Levinson 2018, PLoS ONE](https://pmc.ncbi.nlm.nih.gov/articles/PMC6291193/)
- Ken Perlin's Improv drove decisions "from low-level animation triggering (e.g., eye blinking)" up to higher-level attitudes with noise-influenced models. — [Perlin & Goldberg 1996, Improv](https://www.cs.princeton.edu/courses/archive/spr01/cs598b/papers/perlin96.pdf)

### Inferences
- **Rates for the scenes.** Real rest rate is 12–20/min (mean interval 3–5 s); conversation is ~26/min (~2.3 s). Stylised characters usually blink less, but going much below ~6/min makes a face that is stared at for 10 s look "dead" (Bloop's staring point). In the 14 s chat loop each neighbour blinks twice, which is ~8.6/min, about a third of the real conversational rate. Raising this to 3–4 blinks per loop per character and placing some of them at turn ends would be closer to the data. This is a judgment call, not a measured threshold.
- **Duration with a single closed frame.** AI-generated sprites usually have no half-lid frame, so the whole blink is one "closed" frame. A real closed phase is short (~58 ms), but one frame shown for 60 ms at x2–x3 is easy to miss. 100–160 ms keeps the blink readable and stays inside the 95–300 ms spontaneous range; the current 140 ms fits. If a half-closed frame can be generated, use half 40–60 ms → closed 60–80 ms → half 80–120 ms. That copies the fast-close/slow-open asymmetry (Kwon) and the 2/1/3 animator pattern (at an assumed 24 fps that is 83/42/125 ms ≈ 250 ms).
- **Double blinks.** Make them ~10–20 % of blink events, with the two closed frames ~150–250 ms apart, and never three in a row (EasyBlink rule). The percentage is a design choice; I found no published game value.
- **Desync.** Give every character its own blink schedule from a seeded PRNG, with intervals drawn from roughly 2–6 s (exponential-like, or uniform plus jitter). Don't use a shared period with offsets, because equal periods with offsets still show a common rhythm. If blinks are baked into fixed-length CSS loops, give each character a different, mutually prime loop length (e.g. 13 s / 17 s / 19 s); see §2.
- **Motivated blinks beat random ones.** Fire a blink on every head turn or look-around frame, at the end of each "line" in the chat scene, and as the listener's blink 250–500 ms after the speaker stops. Random filler blinks only fill the gaps.

### Gaps
- No primary, verified number for *spontaneous* (not voluntary) blink phase durations: Kwon et al. measured voluntary blinks (572 ms total, much longer than spontaneous).
- No published blink rates or double-blink percentages from shipped 2D games (Animal Crossing, Stardew Valley) were found.
- Bloop's frame counts give no fps, so the ms conversions assume 24 fps.

## 2. Idle life: breathing bob, weight shifts, look-arounds, fidgets, loop variation, desynchronising characters

### Takeaway
A good idle has a quiet base loop: breathing of 1 art px over ~1–2 s in games (real breathing is 3–5 s per breath). Rarer fidgets such as look-arounds, weight shifts and scratches are layered on top on a randomised timer, varied across 3–6 base loops and never repeated back-to-back. Characters stay out of sync because each has its own loop lengths, mutually prime where possible, plus negative start offsets, rather than the same loop phase-shifted.

### Cited Findings
- Resting adult respiratory rate is "roughly 12 to 20 breaths per minute", with some references narrowing it to 12–16, which is a period of 3–5 s. This is a hospital blog, and its attribution to WHO/ATS is unverified. — [Acıbadem, normal respiratory rate](https://acibademinternational.com/blog/normal-respiratory-rate-by-age-adults-children-and-when-breathing-speed-is-a-warning-sign/)
- Pixel-art idle breathing: "2-4 frames at 300-500ms (about 1-2s loop)". "The body shifts down 1px on the exhale frame and up 1px on the inhale frame". At low resolution, "you're working with 1-3 pixel shifts". — [Sprite-AI, animation principles for pixel art](https://www.sprite-ai.art/guides/animation-principles)
- The idle base loop is "some type of breathing cycle with back-and-forth movement, tensing and relaxing", forming the "ground texture". Hips drive the motion, which overlaps up the spine and into the arms. "Use variation in timing and frequency to create contrast + draw the viewer's attention". Macro variations should play out over "three to six loops". "Remember not to just repeat the fidget multiple times". Blending fidgets so the character never fully stops "can be a good way to hide the loop". — [AnimSchool, "Breathing Life into Idle Animations" (2024)](https://blog.animschool.edu/2024/06/14/breathing-life-into-idle-animations)
- Smaller animations chained together randomly and periodically can do the job of one very long cycle; big, distinctive moves belong in the randomised layer, not the main idle. The first and last keyframes must match to avoid a pop at the loop seam. — [Polycount discussion](https://polycount.com/discussion/comment/2358827)
- Opsive's idle system plays delayed idle variations on a timer, with tunable minimum and maximum durations so variations fire neither too often nor too rarely. With random selection, the same variation can repeat. — [Opsive Idle ability docs](https://opsive.com/support/documentation/ultimate-character-controller/character/abilities/included-abilities/idle/)
- Cicada principle: prime-length repeat units "maximize the look of organic randomness" when the parameters are independent. Two prime cycles realign only at multiples of their product (periods 3 and 5 first realign at 15). — [Lea Verou, "The Cicada Principle revisited with CSS variables" (2020)](https://lea.verou.me/2020/07/the-cicada-principle-revisited-with-css-variables/); [Devopedia, Cicada Principle](https://devopedia.org/cicada-principle); origin: [Alex Walker, SitePoint 2011](https://www.sitepoint.com/the-cicada-principle-and-why-it-matters-to-web-designers)
- Perlin's Improv: "rhythmic and stochastic noise functions" drive time-varying parameters of puppets. Because only the "texture" of motion is conveyed, dynamics simulation is unnecessary, and noise in limb movements gives "the impression of naturalistic motions without needing precise keyframes". — [Perlin & Goldberg 1996](https://www.cs.princeton.edu/courses/archive/spr01/cs598b/papers/perlin96.pdf); [NYU MRL Improv page](https://mrl.cs.nyu.edu/projects/improv/)
- A negative `animation-delay` starts the animation immediately, partway through its cycle. — [MDN, animation-delay](https://developer.mozilla.org/en-US/docs/Web/CSS/animation-delay)

### Inferences
- **Breathing numbers for a 43 px chibi at x3/x2.** Use a 1 art px vertical shift of the upper body (head and torso) or the whole sprite, with a period of 1.6–3 s. That is slower than the generic 1–2 s game idle and faster than a real 3–5 s breath, which reads as calm. 2 px already reads as bouncing at this size. Hold the "up" and "down" positions unevenly (e.g. 55 % low, 45 % high) so the loop is not a symmetric square wave. If the sprite has no separate torso frame, bob the whole sprite by 1 px: at this scale it reads as breathing, unlike the 2+ px static-frame bob discussed in §4.
- **Fidget schedule.** Base idle runs continuously. A fidget (look left/right, weight shift, scratch, glance at the partner) fires every ~4–10 s per character with jitter. The same fidget does not repeat back-to-back, and big gestures appear at most once per ~3–6 base loops (AnimSchool). These are design numbers, not measured norms.
- **Desync recipe for CSS loops.**
  1. Each character gets its own loop lengths, not a shared one with offsets.
  2. Pick lengths whose LCM is long: prime seconds (7, 11, 13, 17, 19 s) for the whole-character track, or prime-ish ms for sub-loops (e.g. breathing 2.3 s / 2.9 s / 3.1 s).
  3. Layer two or three independent loops of different prime lengths per character (breath, blink, fidget). The combined pattern then repeats only after their product, so blinks drift against breaths.
  4. Use negative `animation-delay` so every loop starts mid-cycle on the first frame (the parade and dots in this project already do this).
  5. Seed a PRNG per character (e.g. hash of name), so the variety is deterministic and testable.
- **Short baked loops need extra variation.** A loader is seen for 5–10 s, so a 14 s baked timeline is rarely seen twice. The visible-loop risk is mostly *within* a short loop, e.g. two characters with identical 300 ms cheer loops. Irregular holds inside one long baked track (as `TALK` already does) are worth more than more loop variety.

### Gaps
- I found no authoritative game-industry numbers for breathing amplitude or period in tiny sprites, only one secondary pixel-art guide (Sprite-AI). Saint11 / Slynyrd idle posts were not reached.
- No source quantified how quickly viewers notice a repeating idle loop (seconds or repetitions to detection).

## 3. Walking across a scene: speed vs cycle (no foot sliding), bob, entering/exiting, spacing, typical px/s

### Takeaway
Ground speed must equal step length × cadence: speed (art px/s) = (art px between successive foot contacts) × (steps/s). Measure the step length from the frames and derive the translation from it, not the other way round. Classic walks run at about 2 steps/s (one step per 12 frames at 24 fps). Pixel sprites use 4–8-frame cycles at 100–170 ms per frame. The body dips 1 px at contact or down, rises 1 px at passing or up, and its path should be closer to a triangle wave than a sine. For whole-pixel motion, also choose a speed whose ms-per-pixel divides evenly into display frames (§6).

### Cited Findings
- Human gait: self-selected cadence ~100 steps/min (Wikipedia summary). Typical adult range ~108–118 steps/min, preferred speed ~1.2–1.4 m/s. One lab study of young adults found 1.32 m/s, ~112 steps/min and ~0.71 m step length. Every +10 steps/min of cadence adds ~14 cm/s of speed. — [Wikipedia, Effect of gait parameters on energetic cost](https://en.wikipedia.org/wiki/Effect_of_gait_parameters_on_energetic_cost); [J NeuroEng Rehabil 2009 table](https://jneuroengrehab.biomedcentral.com/articles/10.1186/1743-0003-6-9/tables/1); [PMC7002475 table](https://pmc.ncbi.nlm.nih.gov/articles/PMC7002475/table/T2)
- Animation: "A typical walk cycle uses 24 frames for one full stride at 24 fps, resulting in two steps per second". "Faster cycles (12–16 frames) suggest urgency or haste"; "Slower cycles (28–32 frames) imply weariness or deliberation". Contact falls at frames 1/13, recoil (lowest) at 3/15, passing at 7/19 and high point at 10/22. Note: the same page's prose puts the lowest point at passing, contradicting its own table. — [Adobe, animation walk cycle](https://www.adobe.com/in/creativecloud/roc/blog/video/animation-walk-cycle)
- Four key walk poses: forward contact, first passing, back contact, second passing. — [Wikipedia, Walk cycle](https://en.wikipedia.org/wiki/Walk_cycle)
- Slynyrd: "8 frames achieves the optimum fluid animation", with 6- and 4-frame variants also shown. "Moving the breast down one pixel on the contact frame makes all the difference". "If the head position across the sequence creates a perfect sine wave, the uniform motion feels a bit unnatural", so a triangle-shaped head path is preferred. — [Slynyrd Pixelblog 50, Human Walk Cycle (2024)](https://slynyrd.com/blog/2024/5/24/pixelblog-50-human-walk-cycle)
- Pixel walk: "4-6 frames at 100-150ms (about 0.5-0.8s loop)". The body drops 1 px on contact and rises 1 px on the passing frame, and contact frames are held at 120 ms. — [Sprite-AI](https://www.sprite-ai.art/guides/animation-principles)
- The 8-frame LPC walk can be cut to 6 frames for a "purposeful" feel or 4 frames for a "hasted" feel. — [OpenGameArt forum, LPC walk cycle with varying speed](https://opengameart.org/forumtopic/lpc-walk-cycle-with-varying-speed)
- Foot sliding is a mismatch between movement speed and animation speed. The fixes are to move at the speed the cycle was authored for or to scale playback rate to movement speed, or to use root motion, blend spaces or foot IK. — [Bugnet, how to fix animation foot sliding](https://bugnet.io/blog/how-to-fix-animation-foot-sliding)
- Foot slippage also comes from walking in place without matching stride length to distance covered. — [DAZ forum](https://www.daz3d.com/forums/discussion/comment/87010)

### Inferences
- **Formula and the project's numbers.**
  - Walk scene: 4 frames × 160 ms = 640 ms per two steps, so 3.125 steps/s. The ground moves 25 art px/s, so the implied step length is 25 / 3.125 = **8.0 art px**.
  - Parade: 4 × 170 ms = 680 ms per two steps, so 2.94 steps/s. The lane speed is 240 / 10.8 = 22.2 art px/s, so the implied step length is **7.55 art px**.
  - Check both against the sprites: measure the horizontal distance a planted foot would travel between walkA contact and walkB contact. If the art shows e.g. 10 px between feet, either speed up the translation or slow the frames (25 px/s at 10 px/step needs 2.5 steps/s = 200 ms frames).
- **Cadence vs human.** 3.1 steps/s is about 1.7× human cadence (112/min ≈ 1.87 steps/s). Short chibi legs justify a faster, "pattering" cadence, and the 4-frame cycle reads as "hasted" per the LPC note. For a calmer stroll use 180–220 ms frames (2.3–2.8 steps/s) and lower the speed proportionally.
- **Typical px/s for these sprites.** A realistically proportioned human covers ~0.75 body heights/s (1.3 m/s ÷ 1.7 m), which for a 43 px sprite would be ~32 art px/s. Chibi proportions (legs ~30–35 % of height) shorten the step, so **18–30 art px/s** is a plausible range. That is 54–90 screen px/s at x3 and 36–60 at x2. The project's 22–25 px/s sits inside it. This is derived, not taken from a published table.
- **Sliding within a frame.** With continuous 1 px translation and 160 ms frames at 25 px/s, a "planted" foot drifts up to 4 art px (12 screen px at x3) before the next frame swaps. Three options:
  - (a) Accept it. This is normal for low-frame-count sprites, and the eye tracks the body rather than the foot.
  - (b) Move in bursts synchronised with frame swaps (4 px at each frame change). Feet then lock, but motion becomes 6 Hz-choppy.
  - (c) Hybrid: hold position during contact frames and move faster during passing frames, all in whole pixels on one shared timeline (same duration as the frame track, started in the same frame).

  Option (c) is the most "planted", and step-end keyframe tracks can encode it exactly.
- **Bob.** The current cycle uses `idle` as the passing pose. If walkA, walkB and idle share a baseline, there is no bob. Add a 1 art px *up* offset on the passing (`idle`) frames and/or 1 px *down* on contact, on a wrapper element with the same 640 ms duration. Keep it asymmetric (Slynyrd's triangle, not sine): one frame low, one frame high, the rest neutral.
- **Entering and exiting.** Start each walker fully outside the clip (x < −sprite width) and end fully outside (x > scene width + sprite width), with `overflow: hidden` on the stage. The parade's −40…200 range with a 168 px stage does this. Use negative delays so the street is populated on frame 1, which the project already does.
- **Spacing several walkers.** Equal lane offsets (−2.7 s × k over a 10.8 s loop means exactly 60 px gaps) read as a conveyor belt. Prefer irregular gaps (e.g. 0, −2.3, −5.9, −8.1 s). Optionally give each walker a slightly different cadence *and* matched speed: e.g. 160 ms frames at 25 px/s, 180 ms at 22 px/s, 200 ms at 20 px/s, recomputing speed = step length × cadence per walker. Different loop durations (prime-ish, e.g. 9.7 s, 10.9 s, 12.1 s) also keep the gaps changing over time. Watch for overtaking: give lanes fixed z-order by depth (y), or keep speeds equal when lanes share a depth.
- **Walker in front of scrolling scenery.** The character stays in place, and ground speed must equal the derived walk speed (sidewalk slabs at 25 px/s now). Scenery layers further back move slower (parallax), e.g. 1/2 and 1/4 of ground speed. The current belts move at the same 25 px/s as the ground, which flattens depth. Background-layer speeds also need whole-pixel stepping, with ms per px chosen per §6.

### Gaps
- No primary-source px/s table for small game sprites was found. The range above is derived from gait data and chibi proportions.
- Richard Williams' exact walk timing tables ("on 12s/16s/8s" brisk vs stroll) were not verifiable from the sources reached. Only the secondary "2 steps/s at 24 frames per stride" figure is confirmed.

## 4. Small jumps / cheers: anticipation, airtime, landing squash, settle; why bobbing a static frame reads as floating

### Takeaway
A tiny jump reads as a jump, not a float, when it has the whole chain: crouch (anticipation, 1–2 px shorter) → launch (stretched pose) → airborne with slow-in/slow-out (the apex is held longest) → landing squash (1–2 px) → settle back to idle. Each phase lasts roughly 60–180 ms. Moving one unchanged frame up and down with even timing has no force cues (no anticipation, no squash, no contact), so the brain reads it as hovering.

### Cited Findings
- Pixel jump timing: launch "1-2 frames at 60-80ms (about 0.1s total)"; apex "1 frame at 120-180ms, held (about 0.15s total)"; landing squash "1-2 frames at 80-120ms (about 0.1-0.2s total)". Impact and apex frames are "held longer", e.g. "Hold an impact frame for 150ms instead of 80ms". — [Sprite-AI](https://www.sprite-ai.art/guides/animation-principles)
- Pixel squash amounts: for jump anticipation, a 14 px-tall character becomes 12–13 px tall and 1 px wider; at launch it becomes 15–16 px tall and ~1 px narrower ("two pixels of difference"). — [Sprite-AI](https://www.sprite-ai.art/guides/animation-principles)
- Anticipation "is used to prepare the audience for an action, and to make the action appear more realistic". In squash and stretch, "an object's volume does not change when squashed or stretched". Slow in and slow out: "more pictures are drawn near the beginning and end of an action". "Most natural action tends to follow an arched trajectory". Follow-through: "loosely tied parts of a body should continue moving after the character has stopped". — [Wikipedia, Twelve basic principles of animation](https://en.wikipedia.org/wiki/Twelve_basic_principles_of_animation)
- Exaggerating anticipation and follow-through gives a jump energy. — [Animation Mentor, jump and land tutorial](https://www.animationmentor.com/blog/tutorial-animate-a-jump-and-land/)

### Inferences
- **Why a static-frame bob floats.** Weight is read from *changes of shape and speed at contact*: crouch before take-off, squash on landing, and the deceleration and acceleration around the apex. A rigid frame translated up and down with equal holds has constant speed and no shape change, which matches nothing that pushes off the ground. It matches something buoyant, like a balloon or a ghost. Even a single pose swap (idle ↔ jump) helps but is not enough without the crouch and land frames.
- **Recipe for a ~43 px chibi cheer** (art px; heights for x3 are ×3 on screen):

  | Phase | Frame | Offset | Hold |
  |---|---|---|---|
  | Anticipation | `crouch`, or `idle` shifted 1 px down | 1 px down | 100–140 ms |
  | Launch | `jump` (arms up) | 2 px up | 60–80 ms |
  | Rise | `jump` | 4 px up | 60 ms |
  | Apex | `jump` | 5 px up | 120–160 ms |
  | Fall | `jump` | 4 px → 2 px up | 60 ms each |
  | Land | `crouch`/squash | 0 px (or 1 px down) | 80–120 ms |
  | Settle | `idle` | 0 px | 150–400 ms before the next jump |

  Total ≈ 0.7–1.0 s per cheer. Vary the settle hold between repeats (e.g. 180/320/240 ms) and between characters so cheers never pulse in unison. A 4–6 px peak is ~10–14 % of body height, visible at x2 without looking like a leap.
- **Parabola in whole pixels.** Height under gravity is h(t) = 4H·(t/T)(1 − t/T), so the body spends half the airtime above 75 % of H. In stepped form, hold the top 1 px for the longest time: spacing like 0 → 2 → 4 → 5 → 5 → 4 → 2 → 0 px with equal 50–60 ms holds produces slow-in at the apex automatically. That is "easing in whole pixels" (§6).
- **The project's cheer** (`jump`/`idle` every 300 ms with a 2 px lift) is a symmetric 1.67 Hz square wave with no crouch or land. It falls exactly into the floating/mechanical category. Two fixes: insert a 1 px-down crouch hold before each lift and a 1 px-down land hold after it, and make the lift a 2–3-position arc instead of a single 2 px jump. If AI-generated squash frames are unreliable, a 1 px vertical offset of the same frame for crouch and land is a cheap substitute that still adds the contact cue.

### Gaps
- Pixel jump timings rest on one secondary guide (Sprite-AI). Saint11 / Celeste-style timing breakdowns and GDC "game feel" talks (e.g. "Juice it or lose it", Jonasson & Purho, Nordic Game Jam 2012) were not reachable as text. Search snippets confirm the talk exists (Breakout demo with "juicy" effects added live), but no transcript or numbers were found.
- David Rosen's GDC 2014 "Animation Bootcamp: An Indie Approach to Procedural Animation" was not reached; no numbers from it.

## 5. Conversation choreography: turn-taking, mouth-flap rate, nods and reactions, bubble/icon timing, pauses

### Takeaway
Human turn gaps cluster at 0–200 ms (mean ~200 ms). Nods and other visible responses come even faster, and "dispreferred" or disconfirming replies come 100–500 ms later. Speech syllable rhythm is ~4–5 Hz (range 2–8 Hz), so a mouth that opens and closes once per syllable flaps at 4–5 Hz (100–125 ms per frame). Pixel characters usually read better slightly slower and irregular (3–4 Hz). Text or bubbles need a minimum on-screen time of ~0.8 s and a reading budget of ~17–20 characters/s. Icon bubbles need less, but still about a second. Game "speech" such as Animalese is built from per-letter blips whose speed follows text speed and whose pitch follows mood.

### Cited Findings
- Turn-taking across 10 languages: each language's mode falls "between 0 and +200 ms", and the overall mode is 0 ms. The overall median is +100 ms and the full-dataset mean +208 ms. Japanese is fastest (+7 ms mean) and Danish slowest (+469 ms). Language means fall within ~250 ms of the overall mean, "a single English syllable". — [Stivers et al. 2009, PNAS](https://pmc.ncbi.nlm.nih.gov/articles/PMC2705608/)
- Timing by response type, same study: answers are faster than non-answers (+~132 ms for non-answers). Confirmations are "between 100 and 500 ms faster on average" than disconfirmations (model: ~207 ms). Visible responses (nods, shrugs, head shakes, blinks and eyebrow flashes) are faster than vocal-only responses in every language (~87 ms). Questioner gaze is associated with ~69 ms faster responses. — [Stivers et al. 2009](https://pmc.ncbi.nlm.nih.gov/articles/PMC2705608/)
- Syllable rhythm: a 17-language corpus shows a speech-envelope peak "around 5 Hz (between 4 and 6.5 Hz across languages)", within a syllabic range of 2–6 Hz. Neural phase locking is boosted near ~4.5 Hz. — [eLife reviewed preprint 110310](https://elifesciences.org/reviewed-preprints/110310); [Bidelman lab PDF (brnl24)](https://bidelman.lab.indiana.edu/pdfs/brnl24.pdf)
- Per-language envelope modulation of ~5.1 Hz French, ~4.9 Hz Japanese and ~4.3 Hz English, and an overall range of 2–8 Hz. These come from search summaries of the same result set; I did not verify which of the linked papers or posts states each figure. — [Language Log, "Speech rhythms and brain rhythms"](https://languagelog.ldc.upenn.edu/nll/?p=8116); [Univ. Padova repository PDF](https://www.research.unipd.it//retrieve/handle/11577/3560601/1258013/unpaywall-bitstream--1936813862.pdf)
- Listener blinks 0.25–0.5 s after a speaker's blink at pauses (Nakano & Kitazawa 2010). Long listener blinks (607 ms vs 208 ms) work as backchannel feedback alongside nods (Hömke et al. 2018). — see §1 ([Nakano & Kitazawa](https://doi.org/10.1007/s00221-010-2387-z), [Hömke et al.](https://pmc.ncbi.nlm.nih.gov/articles/PMC6291193/))
- Blink rate rises in conversation: 26/min vs 17/min at rest. — [Bentivoglio et al.](https://wicri-demo.istex.fr/Wicri/Sante/explor/MovDisordV3/Site/fr/Main/Exploration/bibRecord.php?hk=005409)
- Animalese maps each letter to a basic sound (each kana in Japanese releases). Faster text scrolling makes it faster and higher-pitched. Mood shifts pitch: happy is higher, sad or angry lower. Speed differs by game: the original and New Leaf are very fast, Wild World and City Folk slower. — [Nookipedia, Animalese](https://nookipedia.com/wiki/Animalese). The sounds are chopped recorded speech, sped up and strung together. — [Matinee, video game languages](https://matinee.co.uk/blog/video-game-languages/). "Bebebese" typewriter blips are used for muttered asides and item pickups. — [Nookipedia, Bebebese](https://nookipedia.com/wiki/Bebebese)
- Subtitle timing norms: minimum 5/6 s per event (20 frames at 24 fps), maximum 7 s. — [Netflix Timed Text Style Guide: General Requirements](https://backlothelp.netflix.com/hc/en-us/articles/215758617). English reading speed is "up to 20 characters per second" for adult programmes and 17 for children's. A pause between utterances under 2 s is treated as continuous. — [Netflix English (USA) Timed Text Style Guide](https://partnerhelp.netflixstudios.com/hc/en-us/articles/217350977-English-USA-Timed-Text-Style-Guide)
- Habbo: room owners can set how chat bubbles flow, how fast they scroll up and how far away chat is heard. Speech modes are whisper, say and shout. — [Habbo wiki, Guest room](https://habbo.fandom.com/wiki/Guest_room); [Giant Bomb, Habbo Hotel](https://www.giantbomb.com/games/3030-23072/)
- The Sims (original) has conversation-topic speech-bubble icons such as Weather, Sports and Sci-fi, plus need icons such as Toilet, Shower and TV, in its bubble string table. Some topic icons were cut ("Old Conv. Topic"). — [The Cutting Room Floor, The Sims unused graphics](https://tcrf.net/The_Sims_(Windows)/Unused_Graphics); [TCRF, Sim features](https://new.tcrf.net/The_Sims_(Windows)/Unused_Behaviors/Sim_Features). The Sims 4 ships ~205 thought/speech bubble icons. — [Sims Community](https://simscommunity.info/2014/10/10/sims-4-205-thoughtspeech-bubble-icons/)
- Secondary action "gives a scene more life" but should "emphasize, rather than take attention away from the main action". — [Wikipedia, 12 principles](https://en.wikipedia.org/wiki/Twelve_basic_principles_of_animation)

### Inferences
- **Mouth flap.** One open+closed cycle per syllable at 4–5 Hz means 200–250 ms per cycle, i.e. talk/idle frames of ~100–125 ms. The project's `TALK` holds average ~149 ms (110–190), which is ~3.4 Hz. That is slightly slower than real syllables, a good fit for low-res sprites where 100 ms flips at x2 risk reading as flicker. Keep the irregular lengths and add occasional longer "word gaps" of 250–400 ms with the mouth closed, every 3–6 flaps. A metronomic flap reads as a machine. Never go above ~6 Hz: WCAG treats 3+ flashes/s as flashing for large high-contrast areas (§6), though a tiny mouth is far below the area threshold.
- **Icon-bubble timing for the chat scene.**

  | Element | Timing |
  |---|---|
  | Bubble pop-in | 2 frames, e.g. 1 px smaller then full, 60–80 ms each, or opacity 0→1 in one step |
  | Icon readable time | ≥ 0.8–1.2 s for a single icon (Netflix's 5/6 s minimum transferred to an icon); 1.5–2.5 s for a two-icon "sentence"; mouth flaps while the bubble is up |
  | Bubble out | one step, then a gap |
  | Turn gap (bubble A out → bubble B in) | 200–500 ms. Real ~200 ms is too fast to register as a turn at this scale; 300–600 ms reads as a reply |
  | Fast reaction (nod, laugh, wave) | 100–300 ms after the speaker's bubble starts or ends; visible responses are faster than speech |
  | "Thinking", disagreement, `?` icons | 600–900 ms before the reply bubble (dispreferred replies run 100–500 ms later) |
  | Listener blink | 250–500 ms after a speaker's line ends |
  | Long pause between exchanges | 1.5–3 s of idle and fidget (above Netflix's 2 s continuity threshold, so it reads as a new exchange) |

- **Gestures and nods.** The listener should not be frozen while the other talks. Give it 1–2 nods per bubble, each a 1 px head or body dip held 120–200 ms, placed on the speaker's "word gaps". Add an occasional glance or blink at the turn end, and a reaction frame (laugh or wave) that *starts* during the speaker's last 300 ms. Real backchannels overlap the end of a turn. Speaker and listener frames must never switch on the same tick, or the two characters read as one machine.
- **Bubble placement.** Alternate sides and keep each bubble's tail pointing at the speaker. Don't stack more than one bubble per character, unlike Habbo's scrolling chat log, which suits a busy room but not a 2-character vignette.

### Gaps
- No primary data found on the exact on-screen duration of Animal Crossing or Stardew Valley NPC emote bubbles, or on game text speed in characters/s. Stardew's decompiled `Character.doEmote` timing was not reachable.
- No Habbo flood-control or bubble-rise timing numbers were found, only that scroll speed is room-configurable.
- The English Netflix page did not state the min/max duration. Those come from the general requirements page, and Netflix notes values may change.
- No study measured how long viewers need to read a single icon versus text. The ≥ 0.8 s figure is transferred from subtitle norms.

## 6. Movement in whole pixels and CSS implementation: steps() vs step-end, compositor-only properties, transform conflicts and wrappers, syncing timelines, reduced motion

### Takeaway
Animate only `transform` and `opacity`, encode every pose and position as explicit hold keyframes played with `step-end` (or `steps(n, jump-none)` for uniform strips), and keep all offsets in whole art pixels multiplied by the integer scale. A wrapper element is needed per independent transform track, because one element has one `transform` value. The alternatives are the individual `translate` property or `animation-composition: add`. Separate CSS animations cannot be phase-locked after the fact (only the Web Animations API can set `startTime`), so build tracks that start together and share a duration or an LCM. Honour `prefers-reduced-motion`. A preload-only loader is exempt from WCAG's 5-second pause rule.

### Cited Findings
- `steps()`: the second argument defaults to `jump-end`, and `step-end` is `steps(1, jump-end)`. `jump-none` holds at both the 0 % and 100 % marks, each for 1/n of the duration. — [MDN, steps()](https://developer.mozilla.org/en-US/docs/Web/CSS/easing-function/steps)
- Sprite strips: with `jump-end`, `steps(5)` yields 0 %, 20 %, 40 %, 60 % and 80 % and never reaches 100 %. For a looping sprite the last frame must be one of the shown values, so use `steps(5, jump-none)`. The example animates `object-position` with `object-fit: cover` over a 5-frame, 1 s loop (200 ms per frame). `steps()` copes poorly with interrupted transitions; one workaround is linear timing plus `round()`. — [Josh Comeau, Sprites on the web](https://www.joshwcomeau.com/animation/sprites/)
- Performance: "restrict animations to `opacity` and `transform` to keep animations on the compositing stage". Use `will-change` sparingly, since "layer creation can cause other performance issues". — [web.dev, How to create high-performance CSS animations](https://web.dev/articles/animations-guide)
- The individual `translate` property specifies translation "individually and independently of the `transform` property". It is Baseline widely available since August 2022. — [MDN, translate](https://developer.mozilla.org/en-US/docs/Web/CSS/translate)
- `animation-composition` sets "the composite operation to use when multiple animations affect the same property simultaneously" (`replace` by default, or `add` / `accumulate`). With `add`, `translateX(30px) rotate(45deg)` plus a keyframe `translateY(30px)` becomes `translateX(30px) rotate(45deg) translateY(30px)`. Baseline widely available since July 2023. — [MDN, animation-composition](https://developer.mozilla.org/en-US/docs/Web/CSS/animation-composition)
- Syncing: a new WAAPI animation joins an existing one by copying its start time, `newAnimationPlayer.startTime = catRunning.startTime;`. MDN states "it is impossible to sync two separate animations with CSS animations". `startTime` precision may be reduced (Firefox: 0.02 ms by default; 16.667 ms with resistFingerprinting). — [MDN, Animation.startTime](https://developer.mozilla.org/en-US/docs/Web/API/Animation/startTime)
- `image-rendering: pixelated` scales "with the 'nearest neighbor' or similar algorithm to the nearest integer multiple of the original image size, then uses smooth interpolation to bring the image to the final desired size". `crisp-edges` uses nearest neighbour with "no blurring or color smoothing". Baseline since January 2020. — [MDN, image-rendering](https://developer.mozilla.org/en-US/docs/Web/CSS/image-rendering)
- Sub-pixel jitter: engines keep float positions while the pixel grid is integer, so sprites "shimmer" between pixels. Snapping to whole pixels removes the blending but looks choppier. Common practice is to keep the simulation in floats, snap only what is drawn, round the camera to the grid and use integer scaling, because fractional scaling smears the art. — [Bugnet, pixel-perfect camera jitter](https://bugnet.io/blog/how-to-fix-pixel-perfect-camera-jitter); [Unicopia devlog](https://squeakypig.itch.io/unicopia/devlog/787703/a-tale-about-chasing-a-pixel-perfect-tail); [Unity discussions](https://discussions.unity.com/t/smooth-looking-pixel-art-in-motion/907566)
- Browser frame callbacks generally match the display refresh rate (60 Hz most common). — [MDN, requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame)
- `prefers-reduced-motion: reduce` is true when the user has enabled the OS setting. "Animations such as scaling or panning large objects can be vestibular motion triggers". MDN's example swaps a scale pulse for an opacity-only dissolve. OS paths include macOS (Accessibility > Display or Motion > Reduce motion), Windows 11 (Accessibility > Visual Effects > Animation Effects), iOS (Accessibility > Motion) and Android 9+ (Remove animations). — [MDN, prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion)
- WCAG 2.2.2 Pause, Stop, Hide applies to moving content that starts automatically, lasts > 5 s and is shown in parallel with other content. "An animation that occurs as part of a preload phase ... can be considered essential if interaction cannot occur during that phase". If the loader is the only content, no pause mechanism is required. Blinking ≥ 3 flashes/s counts as flashing (Guideline 2.3). — [W3C, Understanding SC 2.2.2](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html)

### Inferences
- **`step-end` with hold keyframes vs `steps(n)`.** For uniform strips (walk frames at equal holds, a belt moving 1 px per tick), `steps(n, jump-none)` or `steps(n)` on a from→to translate is the compact form. For anything with *uneven* holds (blinks, talk, eased jumps, crouch → apex → land), generate explicit keyframes, one per held value, and play them with `step-end`, as `track()` in `src/loader.js` already does. That is the only way to get easing in whole pixels while staying compositor-only.
- **Why not `round()` / custom properties.** Eased motion snapped with `calc(round(var(--y)) …)` needs an animated registered custom property (`@property`). Custom-property animations run on the main thread, not the compositor, so they would freeze while `boot()` blocks the main thread, which is the loader's key constraint. This is from general knowledge of browser architecture and should be verified in DevTools before relying on it either way.
- **Wrapper elements.** One element has one `transform`. Two animations that both set `transform` resolve with `replace`, so the later one in the `animation-name` list wins. Hence one element per independent track:
  - lane / path (translate X across the scene)
  - bob / jump (translate Y)
  - flip (`scaleX(-1)`, static)
  - frame window with `overflow: hidden`
  - frame strip (translateX of the strip)

  The project uses `.lwalker > .la (motion) > .lp.flip > i (strip)`, which is the right shape. The alternatives are the `translate` property for motion plus `transform` for the strip on the same element (Baseline 2022), or `animation-composition: add` (Baseline 2023). Wrappers remain the most predictable and debuggable choice. Keep `scaleX(-1)` on its own element so flipping never interferes with percentage-based strip offsets.
- **Integer pixels end to end.** All offsets should be `calc(var(--s) * N px)` with integer N and an integer `--s`, which the project does. The strip offset `translateX(-k/n * 100%)` is an exact integer only if the strip's rendered width is an integer multiple of the frame width, which holds when `--w` is an integer and `--s` is an integer. Avoid any ancestor with fractional `left`/`top` (centering with `50%` or `place-items: center` can produce .5 px offsets at odd widths). Round the stage size to whole device pixels, or snap the stage with `translate` in JS once. On HiDPI (DPR 2, 3) CSS pixels × DPR stay integer only if DPR is an integer, and fractional zoom (110 %) breaks crispness regardless.
- **Pace pixel steps to the display.** 25 art px/s means 40 ms per pixel, which at 60 Hz is 2.4 vsyncs, so pixel steps alternate 33/50 ms (a 2-3-2-3 cadence that reads as micro-judder). Prefer ms-per-pixel that are multiples of 16.67 ms *and* 8.33 ms (120 Hz):

  | ms per px | art px/s | Vsyncs at 60 Hz | Vsyncs at 120 Hz |
  |---|---|---|---|
  | 33.3 | 30 | 2 | 4 |
  | 50 | 20 | 3 | 6 |
  | 66.7 | 15 | 4 | 8 |

  The parade's 45 ms/px (22.2 px/s) is also uneven. This matters most for the slow parallax layers and the large ground stripe. For frame holds (100–200 ms) the ±8 ms quantisation is imperceptible.
- **Keeping several timelines in sync.**
  1. Tracks that must lock together (one character's frames, bob and walk lane) get the *same* duration and are assigned in the same JS task, so they start on the same frame. In practice they share a start time; this is not formally guaranteed.
  2. Phase relationships come from negative delays computed from one shared clock (`-(now - t0) % period`) rather than from separate starts.
  3. For hard guarantees, create them with WAAPI and copy `startTime`.

  Tracks that must *not* sync (different characters) should use different prime-ish durations (§2).
- **Reduced motion for this loader.** The current approach (frames hold, only stage opacity pulses at 2.4 s, walkers parked at `--rx`) matches MDN's "swap motion for opacity". Optional extras: keep blinks under reduced motion (a blink is not vestibular motion), and show bubbles statically. The loader is preload-only, so WCAG 2.2.2 does not require a pause control. If the loader ever overlays interactive content, add one or stop motion after 5 s.
- **Layer budget.** A few dozen small animated elements is fine. Don't sprinkle `will-change` on every sprite: transform/opacity animations get promoted while running anyway, and permanent `will-change` on many elements costs memory (web.dev's caution).

### Gaps
- No primary source confirmed whether CSS animations assigned in the same task are guaranteed to share an identical start time. MDN only says separate CSS animations cannot be synced *after the fact*.
- Main-thread vs compositor behaviour of animated `@property` custom properties was not confirmed from an authoritative source in this session.
- No measurement was found of perceived judder from 2/3-vsync alternation for 1 px steps at x2–x3. The recommendation is reasoned, not tested.

## 7. Perception: the 12 principles for micro-characters, why perfectly regular timing feels mechanical, the value of irregularity, attention to faces and eyes

### Takeaway
At 43 px, only a handful of the 12 principles survive as concrete tools. Timing/spacing (holds and slow-in/out), anticipation, squash in 1–2 px, secondary action (blinks, nods, bubbles) and overlapping action (body parts not switching in lock-step) do most of the work. The strongest "alive vs mechanical" lever is irregularity: uneven holds, non-sine paths, noise-driven triggers and no two characters on a shared clock. Viewers' first looks go to faces, so eyes (blinks, gaze) and mouths carry most of the perceived life.

### Cited Findings
- Timing "refers to the number of drawings or frames for a given action, which translates to the speed of the action on film". Slow in and slow out puts more drawings near the start and end of an action. Exaggeration: "animated motions that strive for a perfect imitation of reality can look static and dull". Overlapping action is "the tendency for parts of the body to move at different rates". Appeal "corresponds to what would be called charisma in an actor". — [Wikipedia, Twelve basic principles of animation](https://en.wikipedia.org/wiki/Twelve_basic_principles_of_animation)
- "If the head position across the sequence creates a perfect sine wave, the uniform motion feels a bit unnatural". — [Slynyrd Pixelblog 50](https://slynyrd.com/blog/2024/5/24/pixelblog-50-human-walk-cycle)
- Holding key poses longer (impact, apex) is what makes pixel motion read as professional. "Hold the first frames of a movement longer" gives slow-in. — [Sprite-AI](https://www.sprite-ai.art/guides/animation-principles)
- Improv layers rhythmic and stochastic noise to give "the impression of naturalistic motions without needing precise keyframes". Noise also gates low-level triggers such as blinking. — [Perlin & Goldberg 1996](https://www.cs.princeton.edu/courses/archive/spr01/cs598b/papers/perlin96.pdf)
- Cicada principle: prime-length cycles look organic because repetitions coincide only at the product of their periods. — [Lea Verou 2020](https://lea.verou.me/2020/07/the-cicada-principle-revisited-with-css-variables/)
- Idle loops: "variation in timing and frequency" creates contrast and draws attention. Never repeat the same fidget back-to-back. — [AnimSchool 2024](https://blog.animschool.edu/2024/06/14/breathing-life-into-idle-animations)
- Animators avoid blinking "for its own sake": blinks attach to thought or gaze changes and head turns. — [Bloop Animation](https://www.bloopanimation.com/blinking-animation/)
- Face viewing: first fixations show a centre-of-face bias, shaped by screen-centre and leftward biases. — [Luke & Pollux 2016, PeerJ](https://peerj.com/articles/2241). In an eye-tracking study of animate objects, the head and eyes of animals were a typical region attracting many fixations. — [Eye tracking study of animate objects (academia.edu)](https://www.academia.edu/143887809/Eye_tracking_study_of_animate_objects)
- Humans read even blinks as communicative. Listener blink duration changed speakers' behaviour without anyone noticing the manipulation. — [Hömke et al. 2018](https://pmc.ncbi.nlm.nih.gov/articles/PMC6291193/)

### Inferences
- **Principles that matter at 43 px, in priority order:**
  1. Timing and holds: uneven holds and a held apex or contact.
  2. Secondary action: blinks, nods, bubbles and dust are cheap and high-value.
  3. Anticipation and settle around every big action (jump, wave, laugh).
  4. Squash and stretch as 1–2 px vertical offsets or a crouch frame.
  5. Overlapping action: offset the head/bubble/accessory change by 1 tick from the body change.
  6. Arcs: the bob path as a triangle or parabola, not a sine or square wave.

  Exaggeration and appeal are mostly decided in the AI-generated art, not at runtime.
- **What reads as "mechanical"** (checklist for the scenes):
  - identical hold lengths everywhere (e.g. 300 ms cheer loops, 160 ms × 4 walk with no bob)
  - several characters changing frame on the same tick
  - evenly spaced walkers
  - symmetric up/down bobs
  - blinks on a fixed period
  - every bubble lasting the same time
  - loops that restart with a visible pop

  Each has a cheap fix: jitter (±15–30 % on holds), per-character prime-ish periods, motivated triggers, asymmetric holds, and first frame = last frame.
- **How much irregularity.** Keep the structure regular (the walk cycle stays a cycle, and speed stays locked to cadence) and irregularise the *events* (blinks, fidgets, gaps, bubble durations) and the *phases* between characters. Jittering walk-frame holds independently would break the foot-to-ground match. If walk timing varies, scale cadence and speed together.
- **Faces first.** Attention goes to heads and eyes, so for each character the most valuable runtime frames are blink, look-left/right (gaze or head turn) and talk/mouth. Body frames come second. In the 2–4-character scenes, the listener's reactions (blink after the line, nod, laugh) sell "they are actually talking" more than extra speaker frames.
- **Loader-specific attention budget.** The scene is watched for ~5–10 s with the eye moving between the progress bar or text and the characters. One focal action at a time per scene (one speaker, one jumper) with quieter secondary life elsewhere avoids visual noise. That is Disney's "secondary action should not take attention away from the main action" applied to choreography.

### Gaps
- No eye-tracking study specific to cartoon or chibi pixel characters was found. Face-attention evidence comes from real faces and photos, and its transfer to 43 px sprites is an inference. One monkey eye-tracking result (eyes inspected first even when scrambled) surfaced in search, but I could not open the source to verify it, so it is not cited.
- No controlled study was found that quantifies how much timing jitter maximises perceived "aliveness" in 2D character loops. Recommendations of ±15–30 % jitter are practitioner judgment.
- Richard Williams' Animator's Survival Kit could not be consulted directly (only catalog pages and an archive.org scan). No page-level numbers from it are cited.
