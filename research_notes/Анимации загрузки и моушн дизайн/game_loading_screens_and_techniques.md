# Game-style loading screens & loading-time animation: examples, techniques, web stack

Scope: real, citable examples of loading screens where characters act, game elements animate, or the player can play; the animation techniques behind them; the browser stack for building such a loader; UX evidence. Current as of 2026-10-17. Project context: browser world simulator (planet → city → street), all art AI-generated; loader may show small characters doing things / talking.

Legend: **[weak]** = only fan wiki / forum / blog / listicle sourcing; **[conflict]** = sources disagree; **[unverified]** = could not confirm from a primary source in this session.

---

## Key Question 1 — Real examples: what is animated, and how (frame-by-frame vs skeletal vs procedural vs interactive)

### Takeaway
The canonical lineage is: C64 "Invade-a-Load" (1987) → Namco's US 5,718,632 (Ridge Racer's Galaxian loader, patent expired 27 Nov 2015) → patent workarounds (practice-during-loading in Bayonetta/FIFA, Splatoon's GamePad mini-games, "walk around the void" in Assassin's Creed) → today's tips/lore + joke-status-text loaders (SimCity/Sims "reticulating splines", Don't Starve, Hearthstone). The single best-documented web example is Chrome's offline T-Rex: one PNG sprite sheet (1x/2x), 2-frame cycles at 3–12 fps, and procedurally generated obstacles and physics, written in dependency-free JS/TS on `<canvas>`.

### Cited Findings

**Namco patent and Ridge Racer**
- US 5,718,632 A, "Recording medium, method of loading games program code means, and games machine". Inventor Yoichi Hayashi; original assignee Namco Ltd. Priority JP 1994-12-02, filed 1995-11-27, granted 1998-02-17. Status "Expired - Lifetime", anticipated expiration 2015-11-27. Google flags the legal status as an assumption. — [Google Patents](https://patents.google.com/patent/US5718632A/en)
- Claim structure: auxiliary-game code is smaller than the main-game code and is always loaded first (claim 1). The main game loads **in parallel** while the auxiliary game runs (claims 2, 7). A **result of the auxiliary game is reflected in the main game** (claim 3). — [Google Patents](https://patents.google.com/patent/US5718632A/en)
- Spec example: an alien-shooting game of about 15 s. The racing game takes about 10 s to load and the auxiliary game 1–2 s. Destroying all aliens unlocks all 4 cars; otherwise only 2 are selectable. A second embodiment uses a mouse-driven setup screen for the main game's initial conditions instead of a mini-game. — [Google Patents](https://patents.google.com/patent/US5718632A/en)
- Ridge Racer on PlayStation shipped Galaxian as the loading game. Beating it before loading finished gave in-game bonuses. EFF calls the patent anticipated by Richard Aplin's **Invade-a-Load** (Commodore 64, 1987). — [EFF, Elliot Harmon, 2015-12-04](https://www.eff.org/deeplinks/2015/12/loading-screen-game-patent-finally-expires)
- The exact unlock is **[conflict]**. Wikipedia says winning gives "eight additional cars" ([Wikipedia](https://en.wikipedia.org/wiki/Ridge_Racer_(1993_video_game))). PSX Data Center says defeating 100% of enemies makes all 12 cars selectable, excluding the 13th "Devil" car ([PSX Data Center](https://psxdatacenter.com/games/U/R/SCUS-94300.html)). One cheat site and God is a Geek call the game "Galaga" ([cheatcc](https://www.cheatcc.com/?p=88421), [God is a Geek](https://www.godisageek.com/2015/12/loading-screen-mini-games-patent/)). Most sources say Galaxian.
- Game Developer (David Hoppe, 2015-01-09) lists workarounds used during the patent's life:
  - Static "now loading" screens with tips.
  - Load times hidden in the world (Castlevania SotN transition rooms, Resident Evil doors, Wind Waker ocean).
  - Loading a small slice of the main game so players can **practice** (FIFA, Bayonetta).

  It also notes that Onechanbara (X360) had a 2D side-scrolling loading game that reviewers found more fun than the main game. — [Game Developer](https://gamedeveloper.com/business/2015-the-year-we-get-loading-screen-mini-games-back)
- The Japanese counterpart reportedly expired in December 2014 (single source). — [Gigazine](https://gigazine.net/gsc_news/en/20151204-loading-screen-jam)
- An itch.io **Loading Screen Jam** ran 2015-11-27 to 2015-12-07 (host KaiClavier) to celebrate the expiry. It drew 43–45 entries **[conflict between jam pages]**, 25 of them browser-playable. — [itch.io jam](https://itch.io/jam/loading-screen-jam), [PC Gamer](https://www.pcgamer.com/uk/loading-screen-jam-celebrates-the-end-of-namcos-dumb-minigame-patent)

**Interactive "move around while loading"**
- **Assassin's Creed, Animus "Memory Corridor"** (nicknamed the "White Room"; light-grey background with white lines in Animus 2.0) **[weak: fan wiki]**:
  - A loading area where you roam while a memory "compiles".
  - Desync sends you back there.
  - In Animus 2.0 you could only walk or run.

  — [AC Wiki](https://assassinscreedwiki.accesstheanimus.com/wiki/Memory_Corridor)
- Kotaku (Zack Zwiezen) on the Memory Corridor:
  - It was dropped in Unity and Odyssey and returned in Origins and Valhalla.
  - In Valhalla you can run and "chop the air" with both weapons, and stamina doesn't drain.
  - On PS5 faster loads leave less time to run.

  — [Kotaku](https://kotaku.com/running-around-during-loading-screens-is-an-important-p-1844170039)
- **Bayonetta**: the loading screen shows a combo list with button prompts, and you can try the combos live. Per players, a key or button press keeps you on the screen as a "practice/training mode" **[weak: forums/guides; access key differs by platform]**. — [Nintendo Life guide](https://nintendolife.com/guides/tips-and-tricks-to-get-you-started-in-bayonetta-2), [Steam thread 1](https://steamcommunity.com/app/460790/discussions/0/1696040635928263260), [Steam thread 2](https://steamcommunity.com/app/460790/discussions/0/1319961618829825377)
- **Splatoon (Wii U)**: while matchmaking on the TV, the GamePad offers squid mini-games. **Squid Jump** (Doodle-Jump-like, rising water) is the default; amiibo unlock Squidball, Squid Racer and Squid Beatz. Progress pauses and resumes at the next wait but is lost when the game closes. This is a matchmaking wait, not disk loading. The minigames reportedly vanished in Splatoon 2 because the Switch has no second screen **[weak]**. — [Inkipedia](https://splatoonwiki.org/wiki/Minigame), [Stars and Stripes review](https://www.stripes.com/living/entertainment/video_games/matchmaking-flaws-tarnish-splatoon-s-gooey-greatness-1.349019), [Wikipedia](https://en.wikipedia.org/wiki/Splatoon_(video_game))
- Reader-submitted (unverified) interactive loaders:
  - Rayman Origins: run around on the loading map.
  - Fire Emblem: Three Houses: tilt the Switch.
  - Super Mario Maker 2: a random level plays during the intro load.
  - Phantasy Star Online: steer the teleporter tunnel.
  - Warframe: fly your ship.

  — [Nintendo Life comments, 2022](https://www.nintendolife.com/features/18-best-credits-sequences-and-loading-screens-that-let-you-do-stuff)

**Chrome offline T-Rex (most relevant web reference)**
- **Origin.** Built in 2014 by Sebastien Gabriel, Alan Bettes and Edward Jung (codename "Project Bolan"; the character is the "Lonely T-Rex"). The pixel style deliberately nods to Chrome's pixel-art error illustrations. Bettes: the team's one self-imposed rule was keeping motion "rigid", like vintage games.
- **History.** Pterodactyls were added in 2015. Creators cited about 270M games/month in 2018. It is reachable via `chrome://dino`. Release date **[conflict]**: Wikipedia 2014-09-23, Know Your Meme 2014-09-06. A rewrite followed in December 2014 because older Android devices performed poorly.
- Sources: [Wikipedia](https://en.wikipedia.org/wiki/Dinosaur_Game), [Google blog interview](https://blog.google/products/chrome/chrome-dino/), [TNW](https://thenextweb.com/dd/2018/09/07/4-years-later-google-finally-explains-the-origins-of-its-chrome-dinosaur-game/)
- **Current source layout.** The game is now TypeScript in `components/neterror/resources/dino_game/` (19 files), including `offline.ts`, `trex.ts`, `horizon.ts`, `obstacle.ts`, `night_mode.ts`, `cloud.ts`, `offline_sprite_definitions.ts`, `image_sprite_provider.ts` and `generated_sound_fx.ts`. — [Chromium source dir](https://chromium.googlesource.com/chromium/src/+/main/components/neterror/resources/dino_game/)
- **One sprite sheet at two densities.** `neterror.html` loads it via `<img id="offline-resources-1x" src=".../100-offline-sprite.png">` and `offline-resources-2x` (`200-offline-sprite.png`). The three mp3 sound effects (press, hit, score-reached) sit in an inert `<template id="audio-resources">`. — [neterror.html](https://chromium.googlesource.com/chromium/src/+/main/components/neterror/resources/neterror.html)
- **Sprite definitions** store LDPI and HDPI `{x,y}` origins per sprite. Examples: tRex at (848,2) LDPI and (1678,2) HDPI; pterodactyl at (134,2) and (260,2); horizon at (2,54) and (2,104). — [offline_sprite_definitions.ts](https://chromium.googlesource.com/chromium/src/+/main/components/neterror/resources/dino_game/offline_sprite_definitions.ts)
- **T-Rex frame table** (frame-by-frame, sprite x-offsets). — [trex.ts](https://chromium.googlesource.com/chromium/src/+/main/components/neterror/resources/dino_game/trex.ts)

  | State | Frames (x-offsets) | Rate |
  |---|---|---|
  | WAITING | [44, 0] | 3 fps |
  | RUNNING | [88, 132] | 12 fps (about 83 ms) |
  | DUCKING | [264, 323] | 8 fps |
  | JUMPING, CRASHED | 1 frame | — |

  - Blinks are triggered at a random delay of up to `BLINK_TIMING = 7000` ms.
  - Size is 44×47 standing and 59×25 ducking.
- **Pterodactyl**: 2 frames at `1000/6` ms (6 fps); variable heights `[100, 75, 50]`; appears only above speed 8.5. — [offline_sprite_definitions.ts](https://chromium.googlesource.com/chromium/src/+/main/components/neterror/resources/dino_game/offline_sprite_definitions.ts)
- **Procedural parts.** — [freeCodeCamp](https://www.freecodecamp.org/news/how-the-chrome-dino-game-works)
  - Physics: gravity 0.6 px/frame², initial jump velocity −10, variable jump height.
  - Speed: starts at 6 and accelerates by 0.001 per frame to a max of 13.
  - Spacing: obstacle gap ≈ obstacleWidth × speed + minGap × 0.6 plus randomness.
  - Variety: a third identical obstacle in a row is re-rolled (`MAX_OBSTACLE_DUPLICATION = 2`).
  - Night mode: switches at 700 points, with moon phases taken from sprite offsets.
  - Collision: multiple hitboxes per sprite (6 for the running T-Rex).
  - Movement scales with delta time, assuming 60 FPS.
- `generated_sound_fx.ts` synthesizes sound entirely with Web Audio and no audio files:
  - Each note uses two triangle oscillators detuned by +1/−2 Hz.
  - Footsteps loop every 280 ms; jump is 659→880 Hz.
  - It also covers collect and background notes.

  — [generated_sound_fx.ts](https://chromium.googlesource.com/chromium/src/+/main/components/neterror/resources/dino_game/generated_sound_fx.ts)
- The code is under the Chromium BSD-style licence. The `wayou/t-rex-runner` fork extracts it as a standalone page **[secondary source]**. — [dinogame.gg](https://dinogame.gg/blog/chrome-dino-source-code-explained)

**Tips, lore and joke status text**
- **"Reticulating splines"** was coined for SimCity 2000 (Will Wright) and was first **spoken aloud**. It is meaningless ("sounded cool") and spread to The Sims and other games **[weak: fan wiki relays an interview]**. — [Sims Wiki](https://sims.fandom.com/wiki/Reticulating_splines), [Giant Bomb](https://giantbomb.com/wiki/Concepts/Reticulating_Splines), [Unsung (aresluna)](https://www.unsung.aresluna.org/some-rather-obscure-and-complex-mathematical-process)
- Sims 4 players saw odd joke loading texts, and EA staff ("Gurus") said they were funny by design. — [EA forum](https://forums.ea.com/discussions/the-sims-4-gameplay-en/re-removed-fitness-stuff-earbuds-dialog-options-now-appear-as-loading-screen-tip/8576147)
- **Don't Starve world-generation screen** — [Don't Starve Wiki](https://dontstarve.wiki.gg/wiki/World_Generation_Screen), [Klei forum](https://forums.kleientertainment.com/forums/topic/138755-guide-modding-loading-tips/):
  - Two shadow hands hover over a small **globe dotted with tiny 2D models**: rabbits, trees and grass on the day side; spiky trees, a headstone and a spider on the night side.
  - The title changes per world type: "GENERATING WORLD", "CARVING OUT CAVE", "BOILING MAGMA", "GENERATING ISLANDS".
  - Status lines are random **verb + noun** pairs ("Wrangling monsters…", "Reticulating pines…", "Insinuating Wilson's beard…").
  - Don't Starve Together adds tips and lore written in character voices; players can turn them off. Mods hook in via `AddLoadingTip` / `RemoveLoadingTip`.
- Don't Starve animations use Klei's `anim.bin` + `build.bin` + atlas format. The `krane` tool converts them to Spriter projects, and the native format supports shearing, which Spriter cannot represent. This points to a transform-based cutout rig rather than per-frame bitmaps. — [ktools README](https://github.com/nsimplex/ktools/blob/master/README.md)
- **Terraria**:
  - World generation shows per-pass status text over the loading bar (e.g., "Generating world terrain"). "Not the Bees" worlds replace every line with "Generating bees". — [Terraria Wiki, World generation](https://terraria.wiki.gg/wiki/Debug_world_generation)
  - Update 1.4 (Journey's End, 2020-05-16) added "loading screen informative help text when generating worlds". — [505 Games patch notes](https://support.505games.com/support/solutions/articles/150000146949-terraria-journey-s-end-update-1-4-playstation-4-and-xbox-one-), [Terraria Wiki 1.4.0.1](https://terraria.wiki.gg/1.4.0.1)
- **Minecraft**:
  - Random yellow title-screen **splash texts** pulse twice a second, are not translated, and can be edited via resource packs. — [Minecraft Wiki mirror](https://breezewiki.discard.no/minecraft/wiki/Splash)
  - Splashes referencing Notch were removed in 19w13a (2019). — [Kotaku](https://kotaku.com/minecraft-update-removes-mentions-of-notch-the-games-c-1833624305)
  - On Java Edition, the world-loading screen displays chunk generation/loading progress, and a mod replaces the default chunk map with a progress bar. The exact visual and the version history are **[unverified]**. — [Minecraft Fandom: Chunk](https://minecraft.fandom.com/wiki/Chunk), [Better World Loading mod](https://www.curseforge.com/minecraft/mc-mods/better-world-loading-fabric)
- **Dwarf Fortress**:
  - During the erosion/river stage, the game moves the camera to a river's starting point "so the player can watch the process" (Toady One interview).
  - History generation can be paused, but only at a year boundary, and the world saved early.

  — [DF Wiki](https://dwarffortresswiki.org/index.php/World_generation)
- **Factorio**: "Tips and tricks" are data prototypes that can carry a scripted in-engine **simulation**, plus a category, triggers and show conditions. — [Factorio Lua API](https://lua-api.factorio.com/latest/prototypes/TipsAndTricksItem.html). A player on an animated-loader idea: "as long as it doesn't take longer i don't care what it looks like". — [Factorio forum](https://forums.factorio.com/viewtopic.php?p=184167)
- **Hearthstone**:
  - The "Finding Opponent" screen (the "Spinner") is a mechanical slot-machine-style spinner of joke opponent descriptions ("An Owl Team", "A Rat Prince"). In 1v1 it always stops on "Worthy Opponent".
  - Random tips, partly mode-dependent, appear on Finding Opponent and Starting Game.

  — [Hearthstone Wiki: Finding Opponent](https://hearthstone.wiki.gg/wiki/Finding_Opponent), [Hearthstone Wiki: Tips](https://hearthstone.wiki.gg/wiki/Tips)
- **Clash Royale**: the only find is a 2018 "new loading screen" used to announce Trophy Road. — [devtrackers (r/ClashRoyale)](https://devtrackers.gg/clash-royale/p/0398381d-official-april-update-patch-notes-trophy-road-new-card-new-game-modes-more)
- **Stardew Valley**:
  - On the ConcernedApe logo screen, clicking the sleeping creature opens its eyes and plays a sound; a rarer variant reportedly exists. — [GamePro.de](https://www.gamepro.de/artikel/stardew-valley-geheime-animation-startbildschirm,3430258.html)
  - A Switch patch (1.2.36) added an **animated saving screen**. — [Eurogamer.de](https://eurogamer.de/stardew-valley-neuer-switch-patch-laesst-euch-videos-aufnehmen-und-verbessert-die-ladezeiten)

### Inferences
- The patent's own claims describe the strongest design idea: the loading game should **feed back into the main experience** (claim 3, e.g., unlocks). For the simulator, that could mean the loader's characters, or whatever the player did there, carrying over into the world (e.g., the agent you watched becomes a resident).
- Two loader families recur:
  - **Interactive**: mini-game, practice, free movement.
  - **Ambient/narrative**: tips, lore, joke status lines, tiny animated diorama.

  Ambient diorama loaders (Don't Starve globe, Hearthstone spinner, Chrome dino idle) cost little and fit short loads. Interactive ones only pay off when waits are long (the Kotaku PS5 remark).
- The Chrome dino shows how little animation is needed for charm: **2-frame cycles** at 3–12 fps plus procedural motion (jump arcs, scrolling, random blinks). That is a strong template for AI-generated art, where producing many frame-consistent frames is the hard part.
- "World assembling" loaders already exist and are well liked:
  - Don't Starve's globe with tiny models.
  - Terraria's honest per-pass status text.
  - Dwarf Fortress's camera following river formation.

  These map directly onto planet → city → street generation.

### Gaps
- No reliable source found for what **Hollow Knight, Celeste, Dead Cells or Spore** show on their loading screens; searches returned only unrelated pages. Treat any claims about them as unverified.
- No reliable source on **Clash Royale's** current loading screen, or on Supercell's or Blizzard's animation tooling for loaders.
- The exact Ridge Racer unlock condition (8 extra cars vs. all 12) remains unresolved.
- I could not confirm whether Factorio's main-menu background is a live simulation; only the tips-and-tricks simulation prototype is documented above.

---

## Key Question 2 — Techniques: sprite sheets, frame-by-frame conventions, skeletal/cutout, procedural, particles, talking characters

### Takeaway
For tiny loader characters, use **frame-by-frame sprite strips with very few frames** (2–4 idle, 4–8 walk, about 8–12 fps; the dino runs at 12 fps on 2 frames) packed into one atlas. Add **procedural motion** on top (bobbing, squash and stretch, hops, easing, particles). Skeletal or cutout rigs (Spine, DragonBones, Rive, Unity 2D Animation, Klei-style transform rigs) suit higher-resolution illustrated characters, not 16–32 px pixel sprites. "Talking" can be done almost asset-free: typewriter text plus per-letter synthesized blips (Animalese-style) from a tiny sample bank or Web Audio oscillators.

### Cited Findings

**Sprite sheets / atlases**
- **TexturePacker (PixiJS 8 tutorial):** — [CodeAndWeb TexturePacker + PixiJS 8](https://www.codeandweb.com/texturepacker/tutorials/how-to-create-sprite-sheets-and-animations-with-pixijs)
  - Trims transparent edges; Pixi compensates offsets.
  - MultiPack splits sprites across sheets with a `{n}` filename placeholder (TexturePacker ≥ 7.0.2).
  - Auto-detects animations from numbered filenames (`walk-01.png` → animation `walk`).
  - Switching PNG-32 to **PNG-8 cut one sheet from about 700 KB to 194 KB**.
  - Supports Basis/KTX2 GPU-compressed textures; Pixi uses WebGPU with WebGL fallback.
  - Example: `new AnimatedSprite(sheet.animations["character/walk"]); character.animationSpeed = 1/6; // 6 fps`.
- **Aseprite CLI:** — [Aseprite CLI docs](https://www.aseprite.org/cli/), [Aseprite forum (JSON example)](https://community.aseprite.org/t/how-to-process-the-generated-json-sprite-sheet/34), [Aseprite forum (trim caveat)](https://community.aseprite.org/t/json-missing-empty-frame-meta-duration-needed/4239)
  - `--sheet out.png --data out.json --format json-hash|json-array`.
  - `--sheet-type horizontal|vertical|rows|columns|packed`.
  - The JSON carries a per-frame `duration` in ms.
  - `--trim` drops empty frames, and their durations with them.

**Frame-by-frame pixel-animation conventions** (practice, not standards)
- **Chrome dino as a reference point**: run = 2 frames at 12 fps, idle = 2 frames at 3 fps, duck = 2 frames at 8 fps, flying enemy = 2 frames at 6 fps. — [trex.ts](https://chromium.googlesource.com/chromium/src/+/main/components/neterror/resources/dino_game/trex.ts), [sprite definitions](https://chromium.googlesource.com/chromium/src/+/main/components/neterror/resources/dino_game/offline_sprite_definitions.ts)
- **Walk** cycles need 4–8 drawings; the common 4-frame version is contact / down / passing / up. **Idle** is often 2–4 frames. **[weak]** — [Sprite-AI blog](https://www.sprite-ai.art/blog/sprite-animation-frames)
- **12 fps** is "one of the most common" rates for pixel animation; "on twos" means each drawing held for 2 frames at 24 fps, i.e., 12 drawings per second **[weak]**. — [Divoom blog](https://divoom.com/blogs/setup-ideas/pixel-art-animation-frame-rate)
- Other tutorials suggest about 100 ms per walk frame (10 fps) and 150–500 ms per idle/breathing frame. These are community guides **[weak, conflicting]**.
- One 10-frame walk method: lift a foot by 1 px; hands move opposite to the feet. — [JIK-A-4 on itch.io](https://itch.io/blog/526535/pixel-art-walk-cycle-animation)
- **Pedro Medeiros (saint11)** — [saint11.art tutorials](https://saint11.art/blog/pixel-art-tutorials/), [Creative Bloq](https://creativebloq.com/news/artist-makes-animated-gif-tutorials-to-teach-you-pixel-art), [itch.io thread](https://itch.io/jam/heartjam/topic/208072/pixel-art-tips-by-celestes-designer):
  - Free-to-access animated-GIF tutorials cover walk, simple run cycle, top-down walk/run, four-legged walk, character idle, jump, wall slide, squash, easings, subpixel, motion blur, smoke sheet, explosion, impact, fire, wind and more.
  - He is credited as Celeste's pixel artist (community thread calls him "Celeste's designer").
- Squash and stretch in Celeste's Madeline lasts only 1–2 frames **[weak]**. — [Sprite-AI guide (FR)](https://www.sprite-ai.art/fr/guides/animation-principles)
- **Sub-pixel animation** simulates motion smaller than one pixel by shifting colour and anti-alias pixels; it works best on areas with less detail. — [Tiny Warrior Games](https://tinywarriorgames.com/?p=434)

**Skeletal / cutout 2D**
- **Spine**:
  - Positioned as the game-industry standard.
  - Open-source-visible JS runtimes for Phaser, PixiJS, Three.js and Babylon.js. — [abratabia](https://www.abratabia.com/game-animation/skeletal-animation.php)
  - Esoteric says the runtime is "primarily designed for character animation and game development". — [Spine forum](https://en.esotericsoftware.com/forum/d/29544-can-i-use-spine-as-an-alternative-for-rivejs)
  - **Licence:** products built on the runtimes require "each user of the Products [to] obtain their own Spine Editor license". No free or non-commercial tier is described. — [Spine Runtimes License](https://esotericsoftware.com/spine-runtimes-license)
- **DragonBones**:
  - Free editor; bones, keyframes, mesh deformation (FFD), IK, blending; JS runtime for Phaser and PixiJS. — [abratabia](https://www.abratabia.com/game-animation/skeletal-animation.php)
  - npm `dragonbones-runtime` 5.6.200 is MIT. — [jsDelivr](https://www.jsdelivr.com/package/npm/dragonbones-runtime)
  - Maintenance looks stalled (e.g., the Haxe runtime's last release was about 5 years ago) **[unverified for core repos]**. — [haxelib](https://lib.haxe.org/p/dragonbones/versions/)
- **Rive** — [Rive web runtime docs](https://rive.app/docs/runtimes/web/), [Rive: canvas vs WebGL](https://rive.app/docs/runtimes/web/canvas-vs-webgl.md):
  - State-machine-driven interactive vector/raster animation.
  - Web packages: `@rive-app/webgl2` (the recommended default), `@rive-app/canvas` (smaller) and `@rive-app/canvas-lite` (smallest; drops Rive Text, Layouts, Scripting and Audio).
  - The WASM grew in v2.0 because of the text engine.
  - State machines need `stateMachines: "<name>"` and `autoplay: true`.
- **Unity 2D Animation** — [Unity 2D Animation 5.2 manual](https://docs.unity3d.com/Packages/com.unity.2d.animation@5.2/manual), [Preparing artwork (7.1)](https://docs.unity3d.com/Packages/com.unity.2d.animation@7.1/manual/PreparingArtwork.html):
  - The PSD Importer turns a layered `.psb` into a prefab "actor".
  - The Sprite Skin component lets bones deform sprite meshes.
  - Burst + Collections speed up deformation.

**Procedural animation and "juice"**
- **David Rosen (Wolfire), GDC 2014 "An Indie Approach to Procedural Animation":**
  - Simple procedural techniques give interactive, fluid animation from **very few keyframes** (Overgrowth, Receiver, Black Shades). — [Game Developer](https://gamedeveloper.com/design/video-an-indie-approach-to-procedural-animation)
  - A community claim puts it at "13 keyframes in total" **[weak]**. — [Unity Discussions](https://discussions.unity.com/t/an-indie-approach-to-procedural-animation-gdc-video-talk/538228)
- **"Juice it or lose it"** (Martin Jonasson & Petri Purho, 2012): turns a Breakout clone "juicy" with easing/tweening, squash and stretch on events, screenshake, flashes, and particles used sparingly. — [RPG Playground summary](https://rpgplayground.com/research-making-a-juicy-game/), [Game Developer](https://gamedeveloper.com/design/video-is-your-game-juicy-enough-)
  - Venue **[conflict]**: Nordic Game 2012 vs GDC Europe. — [Juicy Break](https://crcdng.itch.io/juicy-break)
- **Chrome dino's procedural layer**: jump physics, speed ramp, random obstacle spacing and de-duplication, parallax stars slower than the ground (`STAR_SPEED` 0.3), random blink timing. — [freeCodeCamp](https://www.freecodecamp.org/news/how-the-chrome-dino-game-works)

**"Talking" characters**
- **Animalese** (Animal Crossing) — [Nookipedia](https://nookipedia.com/wiki/Animalese):
  - Each letter is voiced with the basic sound of that letter, so speech is mispronounced but has rhythm; Japanese versions map kana properly.
  - Scrolling text faster makes speech faster and higher.
  - Mood shifts pitch (happy higher, sad or angry lower).
  - From New Leaf each personality has its own pitch; in Pocket Camp and New Horizons species/body size also shifts it.
  - In Wild World it was just a random syllable per letter (a DS limitation).
- **animalese.js algorithm** (open source) — [animalese.js source](https://raw.githubusercontent.com/Acedio/animalese.js/master/animalese.js), [repo](https://github.com/Acedio/animalese.js):
  - A single 8-bit mono WAV holds 26 letter slots of 0.15 s each.
  - Output uses 0.075 s per character, taken from the start of the slot.
  - `pitch` is a read-step multiplier: above 1 is higher/faster, below 1 lower.
  - Non-letters become silence.
  - Optional "shorten" mode keeps only the first and last letter of each word.
  - Output is a 44.1 kHz WAV data-URI.
- **`animalese-tts` (npm):** Web Audio in the browser; character-by-character real-time synthesis via `AsyncGenerator`; "melody" via sine-wave pitch modulation. — [animalese-tts README](https://cdn.jsdelivr.net/npm/animalese-tts@1.1.3/readme.md)
- **Per-character "voice blips" with typewriter text** (Undertale-style) are a recognised pattern: most characters get their own beep and a few get special sounds **[weak: fan projects]**. RPG Maker plugins recreate it with per-character random bleeps. — [TurboWarp fan project](https://turbowarp.org/113618749), [RPG Maker MZ dialogue bleep plugin](https://winterbitestudios.itch.io/plugin-rpg-maker-mz-dialogue-bleep)
- **Zero-asset SFX precedent**: Chrome dino's `generated_sound_fx.ts` builds all its sounds from oscillators. — [generated_sound_fx.ts](https://chromium.googlesource.com/chromium/src/+/main/components/neterror/resources/dino_game/generated_sound_fx.ts)

### Inferences
- **Fit for AI-generated art.** Current image models struggle to produce many *consistent* frames of one character (identity drift between frames). The dino's lesson suggests a strategy:
  - Generate **one clean sprite per character** (optionally a 2nd "contact" frame or an eyes-closed variant).
  - Get life from procedural transforms:
    - vertical sine bob of 1–2 px at about 2–3 Hz for walking;
    - squash/stretch (scaleY 0.9↔1.1, compensating scaleX) on hop or land;
    - horizontal flip for direction;
    - random blink every 1–7 s;
    - a small shadow ellipse that scales with hop height.
  - This avoids frame-consistency problems entirely. (Inference; validate visually.)
- If multi-frame cycles are wanted, keep them at **2–4 frames** at 6–12 fps. With AI art, generate one sheet in a single image (all poses in one grid) rather than separate generations, then slice; per-frame regeneration magnifies drift. (Inference; test with your models.)
- Skeletal tools: **Spine's per-user licence clause and DragonBones' apparent stagnation make both poor fits** for a non-commercial research loader. **Rive** is viable but adds a WASM runtime, which conflicts with "the loader must appear instantly".
- For "talking" agents, a speech bubble with typewriter reveal at about 30–60 chars/s plus a blip per visible letter (oscillator or tiny sample bank, per-agent pitch) gives Animal-Crossing-style chatter for a few hundred bytes of code. Showing **gibberish** rather than real text also sidesteps localisation and nonsense-LLM-text risks in the loader. (Inference.)

### Gaps
- No primary-source canon (e.g., an industry style guide) for frame counts and fps; the numbers above are community conventions.
- Couldn't retrieve Rosen's slides or transcript; the "13 keyframes" figure is unverified.
- Found no direct sources on how mobile games (Clash Royale, Hearthstone) author their loader animations (Spine vs frame-by-frame vs in-engine).
- Rive runtime licence and exact package byte sizes were not retrieved (the docs point to a "Runtime Sizes" page).

---

## Key Question 3 — Web stack: Canvas 2D / PixiJS v8 / Phaser 4 / KAPLAY / CSS steps(); pixel-perfect rendering; smoothness under main-thread load; asset budget

### Takeaway
A loader that must appear instantly is best written **without the game framework**: plain Canvas 2D (`imageSmoothingEnabled = false`) or CSS sprite animation, with one tiny inlined atlas. If the main thread will be busy (world generation, parsing, WASM init), run the loader canvas in a **Web Worker via OffscreenCanvas** (Baseline since March 2023), or use **compositor-only CSS** (`transform`/`opacity` with `steps()`). Use PixiJS v8 or Phaser 4 for the in-app scene; their pixel-art settings are `scaleMode: 'nearest'` / `roundPixels` and `pixelArt: true` / `smoothPixelArt`.

### Cited Findings

**Canvas 2D and CSS pixel-perfect rendering**
- `CanvasRenderingContext2D.imageSmoothingEnabled`: default `true`; set it to `false` to keep pixels sharp when `drawImage` scales up. MDN calls it useful for pixel-art games. Baseline since April 2017. — [MDN imageSmoothingEnabled](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/imageSmoothingEnabled)
- CSS `image-rendering` — [MDN image-rendering](https://developer.mozilla.org/en-US/docs/Web/CSS/image-rendering):
  - Values: `auto`, `smooth`, `high-quality` (unsupported everywhere), `crisp-edges` (nearest-neighbour-like, for pixel art) and `pixelated`.
  - `pixelated` scales with nearest neighbour to the nearest integer multiple, then smoothly to the final size.
  - Baseline since January 2020.
- CSS `steps(n, jump-start|jump-end|jump-none|jump-both)` is a staircase easing that divides time into n equal intervals; it is the standard way to do discrete frame-by-frame changes in CSS. — [MDN steps()](https://developer.mozilla.org/en-US/docs/Web/CSS/easing-function/steps)
- CSS animations and native Web Animations "are typically handled on … the compositor thread". `transform` and `opacity` changes can often stay on the compositor, but any animation that triggers paint or layout needs the main thread. — [web.dev, Animations and performance](https://web.dev/articles/animations-and-performance)
- Compositor-capable properties are `transform`, `opacity`, `filter` and `clip-path`. rAF-driven JS animation runs on the main thread and janks when it is blocked. — [Motion.dev tier list](https://motion.dev/blog/web-animation-performance-tier-list)

**OffscreenCanvas**
- `canvas.transferControlToOffscreen()` → `worker.postMessage({canvas}, [canvas])`.
- The worker can render with `requestAnimationFrame`.
- Baseline "widely available" since March 2023.

— [MDN OffscreenCanvas](https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas)
- web.dev demo: under main-thread overload, a regular canvas animation stalls while "the worker-based OffscreenCanvas plays smoothly". Support: Chrome 69, Edge 79, Firefox 105, Safari 16.4. Workers have no DOM. — [web.dev OffscreenCanvas (Tim Dresser)](https://web.dev/articles/offscreen-canvas)
- Safari 16.4 shipped OffscreenCanvas without WebGL (`getContext("webgl2")` returned null in a worker); **Safari 17 added WebGL** in OffscreenCanvas. 2D in workers on 16.4 is implied but **[unverified]**. — [WebKit bug 253431](https://bugs.webkit.org/show_bug.cgi?id=253431), [WebKit bug 263010](https://bugs.webkit.org/show_bug.cgi?id=263010)

**PixiJS v8**
- Spritesheets load via `Assets.load("x.json")`. Animate with `new AnimatedSprite(sheet.animations[name])`. `animationSpeed` is relative to the ticker (1/6 ≈ 6 fps at 60 Hz). Use ticker `deltaTime` for movement. — [CodeAndWeb](https://www.codeandweb.com/texturepacker/tutorials/how-to-create-sprite-sheets-and-animations-with-pixijs)
- Per-texture sampling is set with `texture.source.scaleMode = 'linear' | 'nearest'`. — [PixiJS 8 Textures guide](https://pixijs.com/8.x/guides/components/textures.md), [html5gamedevs forum](https://html5gamedevs.com/topic/55669-using-scalemode-strings-on-pixi-v8)
- v8.10 added `textureStyle: { scaleMode: 'nearest' }` on `TextStyle`, for pixel fonts. — [PixiJS 8.10.0 release](https://pixijs.com/blog/8.10.0)
- The global-default API (`TextureSource.defaultOptions` / `TextureStyle.defaultOptions`) is **[unverified]**.

**Phaser 4**
- Releases: v4.0.0 "Caladan" (2026-04-10), v4.1.0 "Salusa" (2026-04-30), v4.2.0 "Giedi" (2026-06-19) and v4.2.1 (2026-07-09), the latest on the page when checked. — [Phaser 4 downloads](https://phaser.io/download/phaser4)
- Phaser 4 introduced the "Beam" WebGL renderer. — [Phaser mega update](https://phaser.io/news/2025/05/phaser-mega-update)
- **Phaser 4 Pixel Art Guide** — [Phaser 4 Pixel Art Guide](https://cdn.jsdelivr.net/npm/phaser@4.2.0/docs/Phaser%204%20Pixel%20Art%20Guide/Phaser%204%20Pixel%20Art%20Guide.md):
  - `render.pixelArt: true` sets `antialias`/`antialiasGL` to false and `roundPixels` to true. Use it only if you never scale, rotate or zoom.
  - New `render.smoothPixelArt: true` gives crisp pixels with antialiased edges for scaled or rotated sprites. Don't mix the two modes.
  - Per-object control via `gameObject.vertexRoundMode` (`safeAuto`, `safe`, `full`, `fullAuto`, `off`).
  - Pixel-art pitfalls:
    - non-integer scales (e.g., 1.3) cause uneven pixels and flicker;
    - odd-sized sprites with origin 0.5 land on half pixels;
    - camera zoom breaks rounding.
  - Camera filters: Blocky, Pixelate, Quantize, and GradientMap (palette swaps).
- Integer scaling example: `Scale.FIT` with `snap` set to the base size (240×160 example). — [Phaser example 585](https://phaser.io/examples-show/585), [Phaser skill doc](https://unpkg.com/phaser@4.2.1/skills/game-setup-and-config/SKILL.md)

**KAPLAY (Kaboom successor)**
- KAPLAY is the fork/successor of Kaboom; the stable line is v3001. — [npm kaplay](https://www.npmjs.com/package/kaplay)
- Latest releases are 4000.0.0 alphas (alpha.27.1 on 2026-05-12); last 3001.x was 3001.0.19 (June 2025). — [GitHub releases](https://github.com/kaplayjs/kaplay/releases)
- Sprites: `loadSprite(name, url, { sliceX, sliceY, anims: { run: { from, to, loop, speed } } })`. — [JSLegendDev](https://jslegenddev.substack.com/p/how-animations-work-in-kaplay)

**Asset-budget precedent**
- Chrome dino ships all art as one PNG sheet per density (1x/2x) and synthesizes some SFX in code. — [neterror.html](https://chromium.googlesource.com/chromium/src/+/main/components/neterror/resources/neterror.html), [generated_sound_fx.ts](https://chromium.googlesource.com/chromium/src/+/main/components/neterror/resources/dino_game/generated_sound_fx.ts)
- Indexed PNG-8 cut an atlas by about 72% (700 KB → 194 KB). — [CodeAndWeb](https://www.codeandweb.com/texturepacker/tutorials/how-to-create-sprite-sheets-and-animations-with-pixijs)

### Inferences
- **Recommended loader architecture (inference):**
  1. Inline critical HTML/CSS plus a tiny loader script in `index.html`, with the atlas as a data URI or a small `<link rel=preload>` PNG-8. Base64 adds about 33% (4 chars per 3 bytes), so inline only atlases of a few KB.
  2. If the loader is CSS-only:
     - animate `transform: translateX()` of a sprite strip inside an `overflow:hidden` box with `steps(n)`;
     - do not animate `background-position` — it is a paint-triggering property, so it likely won't stay on the compositor while JS is busy (inference from web.dev's paint/compositor rule; verify in DevTools Performance).
     - Add `image-rendering: pixelated` and integer scale factors.
  3. If the loader is canvas-based with characters walking or talking, render it in a **worker via OffscreenCanvas**, so world generation, JSON parsing or shader compile on the main thread don't freeze it. Forward only the input you need (pointer events) by `postMessage`. Fall back to main-thread canvas when `transferControlToOffscreen` is missing.
  4. Don't import PixiJS or Phaser for the loader; the loader exists *while* those bundles download. Hand the canvas or scene off to the app afterwards (or cross-fade).
- **Pixel-perfect checklist (if the art really is pixel art):**
  - Integer scale only (compute `floor(min(vw/baseW, vh/baseH))`).
  - Set `imageSmoothingEnabled = false` — and set it again after every canvas resize, since resizing resets context state (well-known canvas behaviour; not verified in this session).
  - Round positions to integers.
  - Size the backing store by `devicePixelRatio`.
- **Project-specific caveat:** the project memory says the art direction is "3/4 view… *not* pixel art, arbitrary angles", while this brief calls the project "pixel-art-style". If the AI art is detailed illustration rather than true low-res pixel grids:
  - `image-rendering: pixelated` and nearest-neighbour will look *worse*;
  - use smooth scaling (Phaser `smoothPixelArt`, Pixi `linear`) and treat "pixel" only as a stylistic label.

  Resolve this before choosing render settings.

### Gaps
- No measured numbers found for compositor vs main-thread behaviour of `steps()` sprite animations specifically; the `background-position` claim is an inference.
- PixiJS v8's global default scale-mode API was not confirmed from official docs.
- Exact Phaser 4 or PixiJS v8 bundle sizes were not retrieved; they matter for deciding when the "real" scene can take over from the loader.

---

## Key Question 4 — UX caveats: mini-games & player reactions, tips/lore, "fake"/progressive loading (world assembling as the animation)

### Takeaway
Evidence favours **giving waiting players something to do or watch**: interactive loaders shorten perceived waits more than passive ones. But busy animation is not automatically better: passive animation can make waits feel *longer*, and too much feedback can lengthen perceived time. Long load time still dominates experience. Honest, stage-based progress tied to real generation steps (Terraria's per-pass text, Dwarf Fortress's camera on rivers, Don't Starve's globe of tiny models) is the best-precedented "progressive" pattern for a world generator.

### Cited Findings
- **Liu, Eroglu, Gregg, Galbiati, Kuwahara, Scovell, Claypool — "Waiting to Play", FDG 2024 (doi 10.1145/3649921.3649937)** — [paper PDF](https://web.cs.wpi.edu/~claypool/papers/game-load-fdg-24/paper.pdf):
  - Setup: 54 participants, 12 games, load videos scaled from 25% to 125% length.
  - QoE fell about **1.9 points/min (game launch)** and **2.6 points/min (level load)** on a 5-point scale.
  - A **50% cut in load time ≈ +0.75 QoE**.
  - QoE < 2 was almost always "unacceptable" and > 3.5 almost always acceptable. To stay acceptable, keep **launch < 27 s and level loads < 33 s**.
  - Counting scene changes and progress indicators added modest predictive power. The authors say only "far fewer" games offer "a lightly-interactive interface for waiters".
- Related work summarised in the same paper — [paper PDF](https://web.cs.wpi.edu/~claypool/papers/game-load-fdg-24/paper.pdf):
  - **Cheng et al.**: an interactive loading screen on mobile shortened perceived time and was preferred over a rotating ring.
  - **Nimwegen & Rijn**: "passive" (reading) and "active" (doing something) waits were more enjoyable than "no activity".
  - **Lallemand & Gronier**: informative waiting UIs satisfy more, but "too much feedback … can make a wait seem longer".
  - **Ip & Jacobs**: games rated "good" had about 15 s loads, "poor" ones about 40 s.
  - **Ledbetter**: simple interactive math games during a virtual roller-coaster queue shortened perceived waits.
- Secondary summaries of other studies **[secondary]** — [Uni Regensburg thesis page](https://wiki.mi.uni-r.de/arbeiten/evaluating_interactive_loading_screens), [UX Psychology](https://uxpsychology.substack.com/p/beyond-the-wait-enhancing-user-experience), [SVR 2024 paper](https://sol.sbc.org.br/index.php/svr/article/view/30541):
  - **Hohenstein et al. 2016**: interactive animation beat a progress bar or passive animation on both perceived wait and satisfaction.
  - **Zhao et al. 2017**: a passive animated loader *lengthened* estimated duration versus a plain screen.
  - **Heidrich, Wohlan & Schaller 2020 (VR)**: interactive loading screens raised perceived speed and enjoyment and lowered frustration.
  - A 2024 VR study found interactive **2D** loaders gave engagement comparable to 3D ones at lower cost.
  - Pruyn & Smidts (1998): overly complex stimuli may backfire.
- **Harrison, Yeo & Hudson, "Faster Progress Bars", CHI 2010:**
  - Visual augmentations change perceived duration. — [Chris Harrison](https://chrisharrison.net/index.php/Research/ProgressBars2)
  - Secondary sources say backwards-moving ribbing feels faster. — [UX Movement](https://uxmovement.com/buttons/how-to-make-progress-bars-feel-faster-to-users/)
  - In one test a 5.61 s rippling bar felt equal to a 5 s plain bar (about 11%). The attribution is **[conflict]**: possibly the 2007 "Rethinking the Progress Bar" paper. — [SBS](https://www.sbs.com.au/news/article/making-downloads-faster-with-trickery/tjsw1rlli)
- A Viget experiment found novel loading animations kept users waiting longer, with lower abandonment, than generic spinners **[weak: blog]**. — [Viget](https://www.viget.com/articles/experiments-in-loading-how-long-will-you-wait)
- **Player reactions:**
  - Kotaku calls running around the AC corridor "comforting and even nostalgic" and notes faster PS5 loads shrink that time. — [Kotaku](https://kotaku.com/running-around-during-loading-screens-is-an-important-p-1844170039)
  - Onechanbara's loading game was reviewed as more fun than the main game. — [Game Developer](https://gamedeveloper.com/business/2015-the-year-we-get-loading-screen-mini-games-back)
  - Splatoon **preserves Squid Jump progress** across successive waits. — [Inkipedia](https://splatoonwiki.org/wiki/Minigame)
  - DST lets players **turn tips off**. — [Don't Starve Wiki](https://dontstarve.wiki.gg/wiki/World_Generation_Screen)
- **Tips/lore patterns:**
  - Hearthstone: random tips filtered by game mode. — [Hearthstone Wiki](https://hearthstone.wiki.gg/wiki/Tips)
  - DST: survival tips in character voice plus lore tidbits. — [Don't Starve Wiki](https://dontstarve.wiki.gg/wiki/World_Generation_Screen)
  - Terraria: help text during world generation. — [505 Games](https://support.505games.com/support/solutions/articles/150000146949-terraria-journey-s-end-update-1-4-playstation-4-and-xbox-one-)
  - Minecraft: random splash quips. — [Minecraft Wiki mirror](https://breezewiki.discard.no/minecraft/wiki/Splash)
- **"Fake-technical" humour:** "Reticulating splines" is a deliberate joke status line — [Giant Bomb](https://giantbomb.com/wiki/Concepts/Reticulating_Splines). Don't Starve's random verb+noun generator also produces "Reticulating pines…" — [Don't Starve Wiki](https://dontstarve.wiki.gg/wiki/World_Generation_Screen).
- **Progressive / world-assembling precedents:**
  - Dwarf Fortress shows river formation so "the player can watch the process", and lets you stop history generation early. — [DF Wiki](https://dwarffortresswiki.org/index.php/World_generation)
  - Terraria labels each generation pass. — [Terraria Wiki](https://terraria.wiki.gg/wiki/Debug_world_generation)
  - Minecraft Java shows chunk-generation progress on the world-loading screen **[visual details unverified]**. — [Minecraft Fandom](https://minecraft.fandom.com/wiki/Chunk)
- **Legal note:** the US loading-game patent expired 2015-11-27 ([EFF](https://www.eff.org/deeplinks/2015/12/loading-screen-game-patent-finally-expires)), and the JP counterpart reportedly in Dec 2014 ([Gigazine](https://gigazine.net/gsc_news/en/20151204-loading-screen-jam)).

### Inferences
- **For this project (planet → city → street), the best-supported loader is "honest progressive generation as the animation" (inference):**
  - Render the actual generation stages as they complete: planet silhouette, then continents, then city grid lines drawing themselves, then buildings popping in with a small overshoot (squash/stretch on landing).
  - Add one or two tiny AI-sprite residents walking the freshly drawn street and exchanging gibberish speech bubbles.
  - Status lines come from real pipeline stages with a joke vocabulary (Don't Starve-style verb+noun): "Laying cobblestones…", "Persuading pigeons…".
  - This satisfies both "progress feedback" (Liu et al.; Lallemand & Gronier) and "something to watch" (Cheng; Nimwegen & Rijn) without lying about progress.
- **Avoid fake progress.** Bars that move independently of real work erode trust once noticed. If stage durations are unknown, use stage-count progress (k of N stages), not invented percentages.
- **Mini-games:** worth it only if waits regularly exceed about 10–15 s (cf. Ip & Jacobs' 15 s vs 40 s and the FDG thresholds). Otherwise a mini-game gets interrupted mid-play, which is annoying.
  - If added, keep the input model trivial (one key or tap, dino-style).
  - **Persist mini-game state across loads** (Splatoon).
  - Make the transition non-blocking: "Ready — press any key", or auto-continue after the current run.
  - Optionally reflect a mini-game result into the world (the patent's claim 3 idea).
- **Keep it calm.** Prefer a gentle ambient diorama over flashy effects, given evidence that passive busy animation and over-feedback can lengthen perceived waits.
  - Respect `prefers-reduced-motion`: drop the bob, squash and particles and keep the status text.
  - Allow muting the voice blips; default them to muted or low volume, since browsers block autoplaying audio until a user gesture anyway (well-known browser policy, not sourced here).
- **Observability (inference):**
  - Log per-stage load timings and loader-visible time (`performance.mark`/`measure`), so loader length can be tuned against the FDG thresholds.
  - Track whether players interact with the loader.

### Gaps
- Primary texts of Hohenstein 2016, Zhao 2017 and Heidrich 2020 were not read; their findings above come from secondary summaries.
- No study found specifically on **web** game loaders (browser games) or on loaders that visualise procedural world generation.
- No data on how players react to *watching* world generation (DF and Terraria are anecdotal precedents, not studies).
