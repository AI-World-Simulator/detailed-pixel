# Vector character and loader animation: Lottie / dotLottie, Rive, and code-first (SVG + GSAP / Motion / WAAPI / anime.js)

Research date: 2026-10-17. Scope: web front-end, small mascot and loader animations, pipeline from authoring tool to export format to runtime, with AI-generated raster art in mind.

Measurement note: the "measured" bundle sizes below come from this researcher running `npm pack` on the published packages on 2026-10-17 and compressing the shipped files with `gzip -9`. Brotli was not available, so real CDN transfer sizes are usually 10–20% smaller than these gzip figures. Versions measured: lottie-web 5.13.0, @lottiefiles/dotlottie-web 0.81.0, @rive-app/{canvas,canvas-lite,webgl2} 2.44.2, gsap 3.15.0, animejs 4.5.0, motion 14.3.0. Package pages: [npm lottie-web](https://www.npmjs.com/package/lottie-web), [npm dotlottie-web](https://www.npmjs.com/package/@lottiefiles/dotlottie-web), [npm @rive-app/canvas](https://www.npmjs.com/package/@rive-app/canvas), [npm gsap](https://www.npmjs.com/package/gsap), [npm animejs](https://www.npmjs.com/package/animejs), [npm motion](https://www.npmjs.com/package/motion).

| Runtime (web) | JS (min, gz-9) | WASM (gz-9) | Total gz-9 | Notes |
|---|---|---|---|---|
| lottie-web `lottie_light.min.js` (SVG only, no expressions) | 45.4 KB | none | ~45 KB | raw 164 KB |
| lottie-web `lottie_svg.min.js` | 60.9 KB | none | ~61 KB | raw 237 KB |
| lottie-web `lottie.min.js` (all renderers) | 74.4 KB | none | ~74 KB | raw 299 KB |
| dotlottie-web 0.81 (software/canvas) | 32.2 KB | 484.8 KB | ~517 KB | the README says the WASM is "~500 KB compressed" and is fetched from a CDN by default |
| dotlottie-web `/webgl` WASM | — | 529.1 KB | ~561 KB | |
| dotlottie-web `/webgpu` WASM | — | 534.3 KB | ~567 KB | |
| Rive `canvas-lite` 2.44.2 | 106.7 KB | 306.8 KB | ~414 KB | no text, layout, audio or scripting engines |
| Rive `canvas` 2.44.2 | 122.0 KB | 829.3 KB | ~951 KB | |
| Rive `webgl2` 2.44.2 (Rive Renderer) | 117.8 KB | 881.2 KB | ~999 KB | recommended default per Rive docs |
| GSAP core `gsap.min.js` 3.15 | 27.7 KB | none | ~28 KB | MorphSVG +9.3 KB, MotionPath +9.5 KB |
| anime.js 4.5 full ESM bundle | 39.9 KB | none | ~40 KB | tree-shakeable modules |
| Motion `animate` mini / hybrid | 3.2 KB / 22 KB (vendor figure) | none | — | [motion.dev docs](https://motion.dev/docs/animate) |

---

## Lottie / dotLottie: origin, 2026 ecosystem, sizes, performance, limitations, state machines

### Takeaway
Lottie is the de facto interchange format for designer-made vector motion. It began as After Effects → Bodymovin JSON → native/web players at Airbnb (2017). It now has a Linux-Foundation-hosted spec (v1.0, Sep 2024) and a second-generation stack from LottieFiles: Lottie Creator (web editor with AI), dotLottie (a ZIP container with multiple animations, images, themes and state machines), and dotlottie-web (Rust + ThorVG compiled to WASM, now with WebGL/WebGPU). The trade-off for web: classic lottie-web is light (~45–74 KB gz) but CPU-heavy SVG/Canvas rendering. dotlottie-web adds interactivity and GPU backends, but costs ~0.5 MB of gzipped WASM, fetched from a CDN by default.

### Cited Findings
**Origin**
- Lottie came out of Airbnb. Engineers Brandon Withrow and Gabriel Peal described it in 2017 as "a library for animations in iOS, Android, web, and React Native" — [Software Engineering Daily, Aug 10 2017](https://softwareengineeringdaily.com/2017/08/10/lottie-animation-with-brandon-withrow-and-gabriel-peal/). Design lead and animator Salih Abdul-Karim and Withrow discussed it on a School of Motion podcast on Mar 3, 2017 — [School of Motion](https://www.schoolofmotion.com/podcast/after-effects-to-code-lottie-from-airbnb/).
- Classic pipeline: After Effects composition → Bodymovin AE plugin exports JSON → lottie-web renders in the browser via SVG, Canvas or HTML. The Bodymovin plugin lists Shapes, Solids, Images, Comps, Nulls and Texts as supported layer types, and expressions as "partially supported" — [aescripts Bodymovin](https://aescripts.com/bodymovin).
- Airbnb's official docs moved from airbnb.io/lottie to lottie.airbnb.tech (301 redirect observed 2026-10-17) — [airbnb.io/lottie](https://airbnb.io/lottie/).

**Standardization (Lottie Animation Community)**
- On Sep 17, 2024, the Lottie Animation Community (LAC), a Joint Development Foundation project under the Linux Foundation, released the v1.0 Lottie JSON specification. Its stated goal was to cover "all well known, commonly implemented, documentable features" — [Linux Foundation press release](https://www.linuxfoundation.org/press/lottie-animation-community-announces-lottie-v1.0-specification).
- LAC was formed in 2023 by "LottieFiles and other industry leaders". v1.0 covers shape, solid, image, precomp and null layers, the core shapes, fills, strokes, gradients, trim path, masks, mattes, time remap and slots. It explicitly excludes text layers, layer effects, blend modes, expressions and additional modifiers. v1.0 is "a baseline to build on top of", not a complete spec — [LottieFiles blog, Sep 19 2024](https://lottiefiles.com/blog/inside-lottiefiles/lottie-specification-v1-0-a-milestone-for-open-source-animation).
- An IANA registration exists. Sources are inconsistent about the extension (".lot" vs ".lottie"). The dotLottie page states the media type `application/zip+dotlottie` — [LottieFiles dotLottie page](https://lottiefiles.com/dotlottie).

**dotLottie format**
- A .lottie file is a ZIP (Deflate) archive. It bundles one or more Lottie animations, shared assets, embedded images, theme objects (color, opacity and style overrides) and state machine definitions. The current spec is "dotLottie Specs 2.0" — [LottieFiles dotLottie page](https://lottiefiles.com/dotlottie).
- Vendor size claims: "up to 10x smaller than Lottie JSON", "typically 2-10x smaller". Gojek reported 89% smaller files and Zomato 60–70% — [LottieFiles dotLottie page](https://lottiefiles.com/dotlottie). In the Gojek case study, a "Safe Trip Plus" animation went from 844 KB to 107 KB, with JSON sizes reduced by up to 89.35% and "99.6% reduction in memory fluctuation". These are vendor-reported numbers — [LottieFiles Gojek case study](https://lottiefiles.com/case-studies/gojekdev).

**dotlottie-web player and ThorVG**
- Architecture: the Rust core `dotlottie-rs` handles parsing, the state machine engine, theming/slots and multi-animation playback. ThorVG (C++) does the rasterizing. The same core is used on web (WASM), iOS and Android — [LottieFiles blog, dotLottie runtimes](https://lottiefiles.com/blog/dotlottie/how-dotlottie-runtimes-solve-lottie); [LottieFiles WebGL/WebGPU post](https://lottiefiles.com/blog/working-with-lottie-animations/hardware-accelerated-lottie-on-the-web-dotlottie-web-now-ships-webgl-webgpu).
- On May 8, 2026, dotlottie-web shipped WebGL2 (`/webgl`) and WebGPU (`/webgpu`, labelled experimental) backends next to the default software Canvas2D rasterizer. The post says ThorVG 1.0 made the GPU backends production-ready and claims a "150%+ GPU rendering performance gain". No fps or CPU benchmarks are published — [LottieFiles blog, May 8 2026](https://lottiefiles.com/blog/working-with-lottie-animations/hardware-accelerated-lottie-on-the-web-dotlottie-web-now-ships-webgl-webgpu). The dotlottie-web README still labels WebGPU experimental — [GitHub dotlottie-web](https://github.com/lottiefiles/dotlottie-web).
- Size conflict: marketing says ThorVG is a "~150KB runtime" with "120+ FPS rendering" — [LottieFiles dotLottie page](https://lottiefiles.com/dotlottie). But the dotlottie-web 0.81.0 README says "The player's WASM engine (~500 KB compressed) is fetched from a CDN when the first player is constructed" and recommends `<link rel=preload>` or `setWasmUrl()` to self-host — [dotlottie-web README via npm](https://www.npmjs.com/package/@lottiefiles/dotlottie-web). Measured: 484.8 KB gz WASM + 32.2 KB gz JS (see table).
- The README also documents `DotLottieWorker` (rendering in a Web Worker with OffscreenCanvas) and CSP caveats: the worker starts from a `blob:` URL, and the WASM comes from jsdelivr/unpkg unless self-hosted — [dotlottie-web README via npm](https://www.npmjs.com/package/@lottiefiles/dotlottie-web).
- Expressions: LottieFiles says the dotLottie player supports After Effects expressions on web, iOS and Android, and ThorVG enables Lottie expressions by default. They can be compiled out to save size — [LottieFiles runtimes page](https://lottiefiles.com/runtimes); [ThorVG v1.0 blog](https://lottiefiles.com/blog/thorvg/thorvg-v10-what-this-release-means-for-developers-team-and-the-products-they-build).

**State machines (interactivity)**
- dotLottie v2 embeds state machines in the file. They are driven by pointer events, custom events or input values. The JS API includes `stateMachineLoad` / `stateMachineStart` and events such as `stateMachineTransition` and `stateMachineError` — [LottieFiles docs, state machines](https://docs.lottiefiles.com/en/runtimes/distributions/js/v0.x/state-machines); [GitHub dotlottie-web](https://github.com/lottiefiles/dotlottie-web).
- Classic Lottie (lottie-web) has no state machine. Interactivity is limited to playback control: segments, markers, direction, speed and frame seeking. *(This is the standard lottie-web API. No separate primary page was fetched this session; see Gaps.)*

**Platform feature gaps (Airbnb's supported-features matrix)**
- Expressions are supported only on Web (SVG/Canvas/HTML), not on Android, iOS or Windows. Images are supported on all platforms. Luma mattes are not supported on native. Many mask modes (Lighten, Darken, Difference, Feather) are unsupported everywhere. Layer effects are very limited (iOS: drop shadow only) — [airbnb/lottie supported-features.md](https://github.com/airbnb/lottie/blob/master/supported-features.md).
- The AE Puppet tool (mesh deformation) is not exported by Bodymovin ("puppet tool is not supported unfortunately", per the developer on the forum). This is an older source but consistent — [Prototypr, Using Lottie with React Native](https://blog.prototypr.io/using-lottie-with-react-native-af7a8ea2c13c); [aescripts Bodymovin](https://aescripts.com/bodymovin).

**Authoring tools in 2026**
- Lottie Creator is LottieFiles' web-based editor. It includes Motion Copilot 2.0 (updated Jul 22, 2026), which builds shapes, text, gradients and layers from a prompt and adds keyframes, easing and loops. It reads the existing scene, so follow-ups like "make it faster" build on earlier work, and it shows a plan before destructive changes — [LottieFiles blog, Motion Copilot 2.0](https://lottiefiles.com/blog/working-with-lottie-animations/introducing-motion-copilot-on-lottie-creator).

### Inferences
- For a *loader*, which must render before the app's JS/WASM is ready, dotlottie-web's ~0.5 MB WASM fetched from a third-party CDN works against the purpose. lottie-web `lottie_light` (~45 KB gz) or a pure CSS/SVG loader is the right tool for the first-paint loader. dotLottie/ThorVG pays off only for many or complex animations, or when state machines or GPU rendering are needed.
- The open spec reduces lock-in compared with Rive, since many players and exporters exist. But v1.0 deliberately excludes text, effects and expressions, so "portable Lottie" means a conservative feature subset.

### Gaps
- No independent, recent (2025–2026) fps/CPU benchmark of lottie-web SVG vs Canvas vs dotlottie-web software vs WebGL on the same file was found. Vendor numbers only.
- The Bodymovin creator's name (commonly cited as Hernan Torrisi) and the exact Airbnb "Introducing Lottie" blog date (early Feb 2017) were not confirmed from a primary page this session.
- The current LAC membership list and the status of a v1.1/v2 spec, or of dotLottie standardization under LAC, were not found.
- No primary doc was fetched on lottie-web's segments/markers API. The claim about classic Lottie's interactivity limits rests on general knowledge of the API.

---

## Rive: editor, state machines, bones/meshes, data binding, web runtime, case studies, and Rive vs Lottie

### Takeaway
Rive is a proprietary SaaS editor plus MIT-licensed open-source runtimes. Its distinguishing features are an in-file State Machine, which since 2025 is driven via Data Binding / View Models, plus bones, meshes on rasters, scripting (Luau, with an AI coding agent since Jan 2026) and its own GPU "Rive Renderer". It wins on interactivity and per-file size: vendor-reported examples are 10–17x smaller than equivalent Lottie. It loses on runtime weight (~0.4–1.0 MB gz on web) and on lock-in, since the editor is the only authoring tool and runtime export requires a paid plan. The flagship mascot case is Duolingo: World Characters lip-sync since 2022, and Lily in Video Call (2025) with a sub-1 MB .riv file.

### Cited Findings
**Web runtime packages and sizes**
- Official Web (JS) sizes (brotli -9, "majority of the size is the WASM"): canvas-lite 707 KB raw / 222 KB compressed; canvas 1728 KB / 567 KB; webgl2 2179 KB / 648 KB. iOS adds ~1.67 MB download; Android ARM-v8a adds 2.40 MB — [Rive docs, Runtime Sizes](https://rive.app/docs/runtimes/runtime-sizes).
- Measured on 2.44.2 with gzip -9 (JS + WASM): canvas-lite ~414 KB, canvas ~951 KB, webgl2 ~999 KB (see table). A real-world React webgl2 project reported ~925 KB gz WASM plus ~450 KB unminified JS glue — [GitHub issue, uwmadison-chm/teddy-static #4](https://github.com/uwmadison-chm/teddy-static/issues/4). Third-party claims of a "~50 KB" Rive runtime ([PkgPulse](https://www.pkgpulse.com/guides/lottie-vs-rive-vs-css-animations-web-animation-formats-2026)) are contradicted by both the official docs and the measurement.
- Renderer choice: `@rive-app/webgl2` "draws with the Rive Renderer, the same renderer as the Rive Editor", is recommended by default and supports Vector Feathering. `@rive-app/canvas` uses the browser's Canvas2D (no feathering, cheaper blend modes on mobile). `canvas-lite` "drops the text, layout, audio, and scripting engines". `@rive-app/webgl` is deprecated after v2.37.0. Use `useOffscreenRenderer: true` for many webgl2 instances per page to stay under the WebGL context limit — [Rive docs, Canvas vs WebGL](https://rive.app/docs/runtimes/web/canvas-vs-webgl).
- All web runtime packages are MIT-licensed (package.json, measured 2026-10-17) — [npm @rive-app/canvas](https://www.npmjs.com/package/@rive-app/canvas).

**State machines and data binding**
- Duolingo describes the State Machine as "a visual representation of the logic that connects the animations ('states') together". It lets the app control "which animation states are called, how they are called, and how they transition and blend together" — [Duolingo blog, Nov 10 2022](https://blog.duolingo.com/world-character-visemes).
- Data Binding: View Models define properties, and instances hold values. The web runtime exposes them in `onLoad`, with `autoBind: true` binding the default view model instance. React has `useViewModel` / `useViewModelInstance` hooks. Rive's migration guide says data binding replaces state machine inputs and runtime events, and is recommended for new work — [Rive docs, Web data binding](https://rive.app/docs/runtimes/web/data-binding); [Rive docs, migration guide](https://rive.app/docs/editor/data-binding/migration-guide).
- Scripting: launched as a core feature on Jan 13, 2026, after early access in Nov 2025. Scripts are Luau, with editor-generated type definitions. An in-editor AI Coding Agent generates Luau, answers questions and proposes inline diffs — [Rive blog, Scripting is live](https://rive.app/blog/scripting-is-live-in-rive); [Rive community, early access](https://community.rive.app/c/announcements/rive-scripting-is-in-early-access).

**Pricing / licensing (affects a research project)**
- Free plan ($0): personal files, 3 collaborative files, State Machines, Data Binding, Scripting, but "Exports for runtime" is not included. Cadet: $17/seat/mo or $108/seat/yr, max 3 seats, includes runtime export. Voyager: $39/seat/mo or $304/seat/yr, adds Libraries, CDN hosting and $20/seat monthly agent credits. Enterprise: $1,440/seat/yr for orgs with $10M+ revenue — [Rive docs, Pricing](https://rive.app/docs/account-admin/pricing). Third-party pages list older or different prices; treat the official page as authoritative — [Rive pricing search results, e.g. vijaytalksai](https://vijaytalksai.com/rive-pricing-explained/).

**Rive vs Lottie: file size and performance (vendor-sourced)**
- Rive's Guido Rosso (Dec 2024) argued that an imported Lottie keeps its bloat, while rebuilding it with Rive rigging gives "267 KB vs 16 KB" — [X/@guidorosso](https://x.com/guidorosso/status/1869666681494343932).
- An Oct 2022 Rosso tweet, quoted by Pixel Point (Nov 3 2022), compared a Lottie at 181.7 KB with a Rive file at 18 KB. It reported GPU memory of ~149–190 MB vs 2.6 MB, JS heap of 16.9 MB vs 7.3 MB, and CPU of 91.8% vs 31.8%. These are vendor-originated numbers from 2022 — [Pixel Point blog](https://pixelpoint.io/blog/rive-app-overview/).
- A real project reported a 72 KB `.riv` where the runtime dominates the download — [GitHub issue teddy-static #4](https://github.com/uwmadison-chm/teddy-static/issues/4).

**Case studies**
- **Duolingo World Characters (lip-sync, since 2022):** 10 characters and "a set of 20+ mouths designed for everyone". The team chose Rive because "file sizes were compact and plugged in neatly with Duolingo's app architecture". Speech is generated by TTS, and in-house speech recognition and pronunciation models produce per-word and per-phoneme timings. "Each sound is mapped onto a visual representation, or viseme". Mouth states run in parallel with body states. Data transfer is "much less than sending down a little movie". The files run on Android, iOS and Web — [Duolingo blog](https://blog.duolingo.com/world-character-visemes).
- **Duolingo Video Call with Lily (2025):** "The State Machine drives Lily's mouth positions, facial expressions, camera movements, and all other animations". 8 head and 8 body animations combine into 64+ idle variations. Nested artboards separate head and body. Event-triggered expressions sync with AI responses, and "processing" states (head tilt, pondering) hide LLM latency. "The final Rive file is under a megabyte" — [Rive blog, Mar 20 2025](https://rive.app/blog/duolingo-s-ai-powered-video-call-brings-lily-to-life); [X/@guidorosso](https://x.com/guidorosso/status/1904374664388018403).
- **Spotify Wrapped 2025:** Rive was used for the motion layer. Designers prototyped with dummy data, then engineering drove the animations with real user data. The setup handled text-length variation, localization and late changes "without turning every tweak into a rebuild". Vendor-reported outcomes: 300M+ engaged users (+20%) and 630M+ shares (+42%). No file-size or performance numbers were given — [Rive blog](https://rive.app/blog/spotify-used-rive-for-spotify-wrapped-2025). Earlier Wrapped (2023) motion designers favoured Lottie because it keeps control with the design team — [Fable blog](https://fable.app/blog/how-spotify-used-motion-design-to-create-a-viral-annual-campaign); [Spotify Engineering, 2023 Wrapped animation](https://engineering.atspotify.com/2024/1/exploring-the-animation-landscape-of-2023-wrapped).

### Inferences
- Rive is the strongest fit for an *interactive character*: idle, talk, react and think states, lip-sync and data-driven variation. The Duolingo "8+8 → 64 variations" pattern is the template. It is overkill for a simple spinner-style loader, because the ~0.4–1 MB runtime must load before anything animates.
- The web runtime size makes Rive unsuitable as the *first-paint* loader, unless the app already ships the Rive runtime for in-app characters. In that case the loader can reuse it after the shell loads.
- Lock-in: there is no second authoring tool for .riv. For a research project, at least one Cadet seat (~$108/yr) is needed to export, and assets cannot be edited without Rive's SaaS editor.

### Gaps
- No official Rive page states a per-character authoring effort (hours or days) for rigging.
- Independent (non-vendor) 2025–2026 Rive vs Lottie benchmarks on equivalent files were not found.
- Duolingo's exact viseme pipeline for Lily (vs the 2022 World Characters pipeline) is not described publicly.

---

## Code-first: SVG + GSAP, Motion, Web Animations API, anime.js v4 — and when it beats designer tools

### Takeaway
Since GSAP became fully free on Apr 30 2025 (including MorphSVG, DrawSVG, MotionPath and other former Club plugins, under a custom "no charge" license), the code-first stack is cheap and capable. Bundle sizes: GSAP core ~28 KB gz, anime.js v4 full ~40 KB gz, Motion mini ~3.2 KB, and WAAPI 0 KB. Code-first beats Lottie or Rive when the art already exists as SVG or PNG parts, when motion is parametric, procedural or data-driven, when first-paint size matters, and when animations are written by engineers or LLMs rather than motion designers.

### Cited Findings
- **GSAP free:** Webflow announced GSAP "100% free" for everyone, including commercial use and all previously paid Club plugins — [Webflow blog](https://webflow.com/blog/gsap-becomes-free); [GSAP 3.13 release post](https://gsap.com/blog/3-13/). The gsap 3.13.0 npm publish timestamp is 2025-04-30T15:30Z, which confirms the date (npm registry, checked 2026-10-17) — [npm gsap](https://www.npmjs.com/package/gsap). CodePen covered it on May 5 2025 — [CodePen blog](https://blog.codepen.io/2025/05/05/chris-corner-gsap-more-like-freesap/).
- **GSAP license caveat:** the Standard "No Charge" license is not OSI open source (package.json: "Standard 'no charge' license"). It prohibits use in visual, no-code animation tools that compete with Webflow's animation builder without written consent — [GSAP Standard License](https://gsap.com/community/standard-license/); [Pinegrow forum discussion](https://forum.pinegrow.com/t/gsap-has-been-acquired-by-webflow/9906).
- **Motion (formerly Framer Motion):** spun off as an independent project on Nov 12 2024, with vanilla JS APIs in addition to React — [motion.dev blog](https://motion.dev/blog/framer-motion-is-now-independent-introducing-motion). The `animate()` function is "mini (3.2kb)" or "hybrid (22kb)". Mini uses native browser APIs (Web Animations API). Hybrid adds SVG path drawing via `pathLength` / `pathOffset` — [Motion docs, animate](https://motion.dev/docs/animate). v12.0.0 was published 2025-01-20, v14.0.0 on 2026-10-02, and current is 14.3.0, MIT (npm registry) — [npm motion](https://www.npmjs.com/package/motion).
- **anime.js v4:** v4.0.0 was published 2025-04-03 and is now 4.5.0 (2026-06-22). It is MIT, modular and tree-shakeable. The full ESM bundle measured ~40 KB gz — [npm animejs](https://www.npmjs.com/package/animejs). A third-party page lists ~24.5 KB gz for the full bundle and ~5 KB per module. This conflicts with the measurement, likely because of version or bundle variant, so treat it as unverified — [claudeskills.info anime.js page](https://claudeskills.info/ja/skills/bowtiedswan/animejs-skills/animejs/).
- **Web Animations API:** a browser-native API (`element.animate()`) that runs keyframe animations without a library. Motion's mini build commits WAAPI-animated values to styles on stop — [MDN Web Animations API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Animations_API); [Motion docs](https://motion.dev/docs/animate).
- **Research evidence that LLMs + GSAP work for simple motion graphics:** MoVer (SIGGRAPH 2025) uses an LLM-based synthesizer that generates SVG animations through "a simple JavaScript API based on GSAP", then verifies them with a first-order-logic DSL and iterates — [MoVer GitHub](https://github.com/jama1017/MoVer). Apple's Keyframer (arXiv Feb 2024, VL/HCC 2025) used GPT-4 to turn natural-language requests into CSS animation code for static SVGs — [Apple ML Research, Keyframer](https://machinelearning.apple.com/research/keyframer).
- **Classic code-first "mascot loader": the Chrome offline T-Rex** is plain JS on a `<canvas>` with a single PNG sprite sheet (1x and 2x `offline-sprite.png`) and a `requestAnimationFrame` loop. It is BSD-3 licensed in Chromium — [freeCodeCamp, How the Chrome Dino game works](https://www.freecodecamp.org/news/how-the-chrome-dino-game-works); [wayou/t-rex-runner](https://github.com/wayou/t-rex-runner).

### Inferences
- **When code-first wins:**
  - The first-paint loader needs to be inline SVG + CSS/WAAPI at a few KB.
  - The art comes from an AI image model as raster or SVG parts, so no AE or Rive source exists anyway.
  - Motion is procedural or data-driven (simulation state, agent activity, map zoom).
  - The team has no motion designer.
  - LLM-authored animation is desired, because LLMs write GSAP/CSS far more reliably than they write raw Lottie JSON or Rive rigs (see the AI section).
- **When designer tools win:** expressive character acting (squash and stretch, overlapping action, lip-sync, many blended states) authored by a motion designer. That is where Rive's state machine or AE→Lottie save engineering time.
- Pick by budget: Motion mini or WAAPI for simple transforms, GSAP for timelines, morphing and motion paths, and anime.js v4 as a fully MIT alternative if the GSAP license clause matters (e.g. if the project ever builds a visual animation editor).

### Gaps
- No authoritative 2026 benchmark comparing GSAP / Motion / anime.js / WAAPI frame times for SVG character animation was found.
- The exact list of GSAP plugins in 3.15 was not enumerated from a primary page. MorphSVG and MotionPath are confirmed present in the 3.15.0 package by inspection.

---

## Real examples of mascot / character / loader animations in products

### Takeaway
The best-documented, citable examples are:
- **Telegram animated stickers:** TGS, which is gzipped Lottie with strict limits.
- **Discord stickers:** Lottie JSON accepted, raster reportedly blocked.
- **Duolingo characters:** Rive, the strongest documented mascot case.
- **Spotify Wrapped 2025:** Rive.
- **Gojek:** dotLottie.
- **Airbnb:** origin of Lottie.
- **Chrome T-Rex:** code + sprite sheet.

No primary sources were found for Headspace, Mailchimp, Slack or the Discord Wumpus loader specifically.

### Cited Findings
- **Telegram (TGS = Lottie):** requirements are 512×512 canvas, 60 FPS, max 3 seconds, must loop, max 64 KB after Bodymovin export. The authoring path is AE + "Bodymovin-TG" (Telegram's fork). Forbidden features are auto-bezier keys, expressions, masks, layer effects, images, solids, texts, 3D layers, merge paths, repeaters and time remapping — [Telegram, Animated stickers](https://core.telegram.org/animated_stickers). TGS is gzip-compressed Lottie JSON introduced in July 2019 — [FileFormat.com TGS](https://docs.fileformat.com/compression/tgs). Press reported typical stickers at ~20–30 KB — [CrackBerry](https://crackberry.com/telegram-59-introduces-new-faster-format-animated-stickers).
- **Discord stickers:** the API accepts PNG, APNG, GIF or Lottie JSON. Limits are 512 KB, 320×320, and ≤5 s for animated stickers — [discord-api-types](https://discord-api-types.dev/api/discord-api-types-v9/interface/RESTPostAPIGuildStickerFormDataBody). A user feedback thread says Discord blocks Lottie uploads containing raster images. This is a user claim, not official — [Discord support community](https://support.discord.com/hc/es/community/posts/4403611337367-Allow-Lottie-Stickers-to-use-raster-images). Discord's looping logo loading/reconnecting animation exists (a user requested an option to disable it), but its implementation is undocumented — [Discord support community](https://support.discord.com/hc/en-us/community/posts/11358646694551-Disable-loading-connecting-animation).
- **Duolingo:** Rive for 10 World Characters with 20+ visemes (2022), and for Lily in Video Call (2025, <1 MB .riv) — [Duolingo blog](https://blog.duolingo.com/world-character-visemes); [Rive blog](https://rive.app/blog/duolingo-s-ai-powered-video-call-brings-lily-to-life). Duolingo's research reports say Lily gives no real-time speaking feedback; learners review a transcript after the call — [Duolingo whitepaper](https://duolingo-papers.s3.amazonaws.com/reports/Duolingo_whitepaper_language_video_call_improves_speaking_2025.pdf).
- **Spotify Wrapped 2025:** Rive for the data-driven motion layer — [Rive blog](https://rive.app/blog/spotify-used-rive-for-spotify-wrapped-2025).
- **Gojek:** migrated to dotLottie. One animation went from 844 KB to 107 KB, and the home screen has a Lottie background with personalized greetings (vendor case study) — [LottieFiles, Gojek](https://lottiefiles.com/case-studies/gojekdev).
- **Airbnb:** created Lottie for its own apps (2017) — [Software Engineering Daily](https://softwareengineeringdaily.com/2017/08/10/lottie-animation-with-brandon-withrow-and-gabriel-peal/).
- **Google Chrome dino:** canvas + PNG sprite sheet, vanilla JS — [freeCodeCamp](https://www.freecodecamp.org/news/how-the-chrome-dino-game-works).

### Inferences
- The industry splits by use case:
  - Sticker and emoji ecosystems standardize on constrained Lottie, because it is small, vector-only and safe to render.
  - Character-driven, stateful mascots (Duolingo) moved to Rive.
  - Game-like or offline mascots (Chrome dino) use raster sprite sheets driven by code.
- Telegram's and Discord's bans on images in Lottie are a strong signal that raster-in-Lottie is a second-class path.

### Gaps
- No primary engineering or design source was found for Headspace, Mailchimp (Freddie), Slack or the Discord Wumpus loading animation's format. Do not cite them without further research.
- The LottieFiles case-study index tags several entries "Loader", but the brands were not identified.

---

## Raster / bitmap support: can Lottie or Rive animate AI-generated PNG parts (cutout + bones)?

### Takeaway
**Rive: yes.** It imports PNG/JPEG (and layered PSD with names and order preserved), applies meshes to raster images, binds them to bones with per-vertex weights, and animates them with state machines. That is real cutout + skeletal deformation of bitmaps, supported on web canvas and webgl2.

**Lottie: only rigidly.** Image layers can be moved, rotated, scaled, parented and masked, but the AE Puppet tool (mesh deformation) is not exported. Major consumers (Telegram, reportedly Discord) forbid images entirely, and raster assets inflate JSON as base64 unless packed in dotLottie.

**Code-first:** CSS/GSAP transforms on `<img>` / `<image>` parts give rigid cutout animation for free. Deformation needs WebGL or a skeletal runtime.

### Cited Findings
- Rive supports png, jpeg/jpg and mixing raster with vector — [Rive community, raster graphics example](https://rive.app/community/1738-3431-raster-graphics-example/).
- "Meshes are layers that can be added to raster graphics" for organic deformation (skin, fabric, hair). Bones are optional but can be bound via "Bind Bones", with per-vertex weights set by the Weight tool. Runtime support covers Web, iOS, Android, React, React Native, Flutter and Flutter Web with CanvasKit, but not the Flutter Web HTML renderer. Tips: use transparent backgrounds, remove stray pixels, keep vertex counts low for performance, and export images at the target resolution — [Rive blog, Intro to meshes, Jul 5 2022](https://rive.app/blog/intro-to-meshes).
- Rive "Import PSD files that retain their layer position, order, and names" — [Rive blog, mesh deformation and PSD support](https://rive.app/blog/new-features-released-mesh-deformation-and-psd-support); [Rive docs, Manipulating Shapes](https://rive.app/docs/editor/manipulating-shapes/manipulating-shapes).
- `canvas-lite` drops text, layout, audio and scripting. The docs do not say images or meshes are dropped, but this is not explicitly confirmed — [Rive docs, Canvas vs WebGL](https://rive.app/docs/runtimes/web/canvas-vs-webgl).
- Free-tier Rive image upload limit: 10 MB per image (third-party summary of Rive docs) — [Rive pricing search summary / vijaytalksai](https://vijaytalksai.com/rive-pricing-explained/).
- Lottie: image layers are supported on all platforms per Airbnb's matrix — [airbnb/lottie supported-features](https://github.com/airbnb/lottie/blob/master/supported-features.md). Puppet pin / mesh deformation is not supported by Bodymovin — [Prototypr](https://blog.prototypr.io/using-lottie-with-react-native-af7a8ea2c13c). The spec v1.0 includes image layers and assets — [LottieFiles spec blog](https://lottiefiles.com/blog/inside-lottiefiles/lottie-specification-v1-0-a-milestone-for-open-source-animation). dotLottie bundles embedded images inside the ZIP — [LottieFiles dotLottie](https://lottiefiles.com/dotlottie).
- Telegram forbids images in TGS — [Telegram](https://core.telegram.org/animated_stickers). Discord reportedly blocks Lottie with rasters (user claim) — [Discord support community](https://support.discord.com/hc/es/community/posts/4403611337367-Allow-Lottie-Stickers-to-use-raster-images).

### Inferences
- Practical pipeline for the project's "AI-only art, no hand drawing" constraint, using Rive:
  1. Generate the character with the image model.
  2. Split it into parts (head, torso, limbs, eyes, mouth variants) as separate transparent PNGs, or as a layered PSD.
  3. Import into Rive.
  4. Add meshes and bones, weight the vertices.
  5. Author idle, talk and react timelines and a state machine.
  6. Export .riv.

  Steps 4–5 are manual rigging and animation work in the editor; the AI art does not remove them. Mouth and eye variants (visemes) can also be AI-generated as separate PNG swaps, which is the Duolingo "20+ mouths" pattern in raster form.
- With Lottie, the equivalent is rigid "paper puppet" cutouts plus image-swap frames. This is feasible, but loses the organic deformation that makes raster characters feel alive, and image-heavy Lottie JSON is large.
- If the art style keeps crisp pixel edges ("pixel-art-ish"), mesh deformation and non-integer rotation resample the bitmap and soften edges. Frame-based sprite sheets (the Chrome dino approach), or rigid transforms with nearest-neighbour scaling, preserve the look better. This is an inference, not tested.

### Gaps
- No primary source confirms whether dotlottie-web/ThorVG renders image layers with full matte/mask fidelity on the WebGL/WebGPU backends.
- No source documents an automated (AI) rigging tool for Rive meshes or bones as of Oct 2026. The Rive AI agent targets Luau scripting, not rigging.
- Adjacent raster-skeletal tools (Spine, Meta's open-source Animated Drawings, Live2D) were out of scope and not researched here.

---

## AI and automation: generating Lottie / SVG / Rive animation from text (state as of Oct 2026)

### Takeaway
Vendor tools now offer LLM-driven authoring *inside* editors:
- **LottieFiles:** Motion Copilot 2.0 (Jul 2026), Prompt to Vector, Prompt to State Machines and a Lottie Creator MCP server (Apr 2026) for Claude, Cursor and Codex.
- **Rive:** an AI Coding Agent for Luau scripts (Jan 2026).

These produce good *starting points* for icon-level and UI motion, but "AI can be unpredictable when generating illustration shapes from scratch". Research models are advancing fast but sit at icon and simple-motion level:
- OmniLottie (Mar 2026) is a Qwen2.5-VL-based text/image/video-to-Lottie model trained on MMLottie-2M.
- LiveSVG (May 2026), Vector Prism (CVPR 2026), LottieGPT (CVPR 2026) and MoVer (SIGGRAPH 2025) are related work.

The consistent finding is that general LLMs struggle with raw SVG/Lottie for non-rigid, character-level motion. No tool fully automates rigged-character animation from AI raster art.

### Cited Findings
**Vendor tools**
- **LottieFiles Motion Copilot 2.0** (blog originally Jun 12 2024, updated Jul 22 2026) builds shapes, text, gradients and layers, sets keyframes and easing, loops and staggers. It reads existing scenes, shows a plan before broad changes and asks clarifying questions. Sample prompts include "Create a sun with drifting clouds that loop forever" and "Bounce 5 times and then get to a halt". The model is not named — [LottieFiles blog](https://lottiefiles.com/blog/working-with-lottie-animations/introducing-motion-copilot-on-lottie-creator).
- **LottieFiles Prompt to Vector** generates vector assets in five styles: flat icons, basic logos, full scenery, UI icons and "Humaaan" illustrations — [LottieFiles blog](https://lottiefiles.com/blog/working-with-lottie-animations/introducing-motion-copilot-on-lottie-creator). A "Prompt to Vector 2.0" (generate, refine, animate) post exists — [LottieFiles blog](https://lottiefiles.com/blog/working-with-lottie-animations/ai-svg-generator-generate-refine-and-animate-prompt-to-vector-2-0). LottieFiles also lists Prompt to State Machines and AI Theming — [LottieFiles AI](https://lottiefiles.com/ai).
- **Lottie Creator MCP** (Apr 15 2026) lets Claude, Cursor, Codex or any MCP client read, modify and create animations: layers, timing, variations, accessibility (WCAG/motion) audits and brand-consistent sets, returned as .lottie. The vendor caveats: "AI can be unpredictable when generating illustration shapes from scratch" (import your own SVGs first), and "Animation quality scales directly with the model" (it recommends Claude Sonnet/Opus over smaller models) — [LottieFiles blog](https://lottiefiles.com/blog/working-with-lottie-animations/your-ai-can-now-control-lottie-creator-heres-what-that-actually-means).
- **Rive AI Coding Agent** generates Luau scripts, answers questions and proposes inline diffs inside the editor. It is billed in AI credits ($1 = $1 credit), with monthly per-seat credits of Cadet $5, Voyager $16 and Enterprise $40 per the launch post. The current pricing page lists Voyager $20 and Enterprise $40, so credit amounts changed — [Rive blog, Scripting is live](https://rive.app/blog/scripting-is-live-in-rive); [Rive on Threads](https://www.threads.com/@rive.app/post/DTgPo-0kkW_/the-ai-coding-agent-is-in-the-rive-editor-ask-questions-generate-luau-and-get); [Rive docs, Pricing](https://rive.app/docs/account-admin/pricing).

**Research**
- **OmniLottie** (arXiv 2603.02138, Mar 2 2026; Yang, Cheng, Chen, Fu, Zeng, Cai, Yu, Ma) is a Lottie tokenizer that turns JSON into compact command/parameter sequences. The authors say raw JSON wastes tokens on formatting and metadata. The model builds on a pretrained VLM (Qwen2.5-VL per secondary summaries) and supports text-, text+image- and video-to-Lottie — [arXiv abs](https://arxiv.org/abs/2603.02138); [HF paper page](https://huggingface.co/papers/2603.02138).
- **MMLottie-2M** has ~2M Lottie animations with text, keyframe and video annotations, sourced from LottieFiles, IconScout, Flaticon and Iconfont, under CC BY-NC-SA 4.0. **MMLottieBench** is its benchmark — [HF dataset](https://huggingface.co/datasets/OmniLottie/MMLottie-2M); [HF MMLottieBench](https://huggingface.co/datasets/OmniLottie/MMLottieBench). A secondary review says OmniLottie "significantly outperforms" Recraft and open-source baselines, which had very low success rates. This was not verified against the paper — [Liner review](https://liner.com/review/omnilottie-generating-vector-animations-via-parameterized-lottie-tokens).
- **LiveSVG** (arXiv 2605.30174, May 28 2026) does zero-shot SVG animation. A frozen image-to-video model generates a target video, then differentiable rendering fits SVG geometry (per-group homographies plus per-path Bézier offsets, skeleton-free). It states that LLM-based code synthesis "fails to express fine, non-rigid Bézier deformations" and that existing methods "struggle with complex motions" — [arXiv abs](https://arxiv.org/abs/2605.30174).
- **Vector Prism** (CVPR 2026) stratifies SVG semantic structure before animating. It is reported to beat AniClipart and GPT-5 on instruction alignment and quality, and notes "even the strongest LLMs struggle with raw SVG code" (secondary paper note) — [papernotes, Vector Prism](https://en.papernotes.org/CVPR2026/video_generation/vector_prism_animating_vector_graphics_by_stratifying_semantic_structure/).
- The Awesome-2D-Animation list also catalogues LogoMotion (CHI 2025), VAnim (ICML 2026) and LottieGPT (CVPR 2026). Venues were not independently verified — [GitHub Awesome-2D-Animation](https://github.com/MarkMoHR/Awesome-2D-Animation).
- **MoVer** (SIGGRAPH 2025) runs an LLM → GSAP-based JS API → SVG animation loop with formal verification and iterative correction — [MoVer GitHub](https://github.com/jama1017/MoVer). **Keyframer** (Apple): GPT-4 → CSS animations for static SVGs — [Apple ML Research](https://machinelearning.apple.com/research/keyframer).

### Inferences
- **Most reliable automation today:**
  1. AI generates the static art (raster or SVG parts).
  2. An LLM writes GSAP/CSS/WAAPI code (or drives Lottie Creator via MCP) for *rigid / parametric* motion: bob, blink via part swap, bounce, squash via scale, orbiting dots and so on.
  3. Optionally, a verify loop (MoVer-style: render frames, check against the spec) is added.

  This matches research findings that LLMs handle code-level motion but not fine non-rigid deformation.
- Text-to-Lottie models (OmniLottie) are interesting for generating *icon-style* loaders. The dataset is non-commercial (CC BY-NC-SA), which is OK for this non-commercial research project. Output is vector-flat-icon style, not consistent with a raster AI art direction.
- Character-quality deformation of AI raster art still requires either manual Rive rigging or a video-diffusion → sprite-sheet route (outside this note's scope). No surveyed tool auto-rigs.

### Gaps
- No quantitative OmniLottie, LottieGPT or LiveSVG success rates were extracted (the abstract pages give none). Read the full papers if numbers are needed.
- Whether OmniLottie weights and code are publicly released was not confirmed (the project page links HF/Replicate, but release was not verified).
- No independent evaluation of Motion Copilot or Lottie Creator MCP output quality was found. All claims are vendor-sourced.
- No evidence was found of a Rive "text-to-animation" or "auto-rig" feature as of Oct 2026.

---

## End-to-end pipelines and manual authoring effort (synthesis across tools)

### Takeaway
There are three production pipelines.
- **(A) Lottie:** AE + Bodymovin, or Lottie Creator, or Figma-to-Lottie plugins → JSON / .lottie → lottie-web or dotlottie-web.
- **(B) Rive:** the Rive editor (design, rig, state machine, data binding, scripting) → .riv → a Rive runtime.
- **(C) Code-first:** SVG/PNG parts from any source → GSAP / Motion / WAAPI / anime.js in the app bundle.

A and B need a motion designer's hands for character work. C needs an engineer, or an LLM, and is the only route where AI can do most of the authoring today.

### Cited Findings
- Duolingo's handoff: animators build states and the State Machine in Rive, export a single runtime file, and engineers integrate it — [Duolingo blog](https://blog.duolingo.com/world-character-visemes).
- Spotify's handoff: prototype the motion with dummy data in Rive, then engineering binds real data without rebuilds — [Rive blog](https://rive.app/blog/spotify-used-rive-for-spotify-wrapped-2025).
- The Telegram pipeline requires AE + Bodymovin-TG plus a strict feature subset — [Telegram](https://core.telegram.org/animated_stickers).
- Importing an existing Lottie into Rive carries over its inefficiencies; rebuilding with Rive rigging gives the size win — [X/@guidorosso](https://x.com/guidorosso/status/1869666681494343932).
- The Lottie Creator MCP vendor recommends importing your own SVGs, naming layers descriptively and breaking work into steps for AI-driven animation — [LottieFiles blog](https://lottiefiles.com/blog/working-with-lottie-animations/your-ai-can-now-control-lottie-creator-heres-what-that-actually-means).

### Inferences
- Decision matrix for this project (browser world simulator, AI-generated raster-ish art, no hand drawing):
  - **App boot loader:** inline SVG/CSS or WAAPI (0–3 KB), or a tiny PNG sprite strip. Never a WASM runtime.
  - **In-app small loaders and status icons:** Motion mini, GSAP or anime.js on AI-generated parts, written by LLM.
  - **Optional:** lottie_light for any vector icon animations from LottieFiles or OmniLottie.
  - **Interactive mascot / agent avatars with talk and react states:** Rive, if a human will spend rigging time and the ~0.4–1 MB runtime is acceptable after first paint. Otherwise use code-driven part-swap and transform animation of AI PNG parts.
- Manual effort ranking (least to most) for a stateful character, given AI art: code-first rigid cutout (hours, LLM-assisted) < Lottie cutout in Creator/AE (hours to a day per character, still rigid) < Rive mesh + bones + state machine (days per character for quality acting). These are estimates by inference; no source quantifies them.

### Gaps
- No published time or effort figures were found for authoring a character rig in Rive or AE/Lottie.
- Figma-to-Lottie / Figma-to-Rive export paths were not researched in this pass.
