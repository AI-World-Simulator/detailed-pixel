# UI loader principles (UX + motion) and how simple loaders are built with CSS/SVG/JS

Scope: web front-end loaders (spinners, progress bars, skeletons, animated dots, "personality" bars), with mobile guidance only where it informs principles. Research date: 2026-10-17. Many core sources are old (1993, 2007, 2010, 2013, 2014, 2017, 2019, 2020, 2021). They are flagged where it matters. Code fragments under "Inferences" are illustrations written for these notes, not quotes from a source, unless a source is named.

---

## 1. When to show which indicator: thresholds, delay and minimum display time, determinate vs indeterminate, skeleton vs spinner, progress-bar tricks

### Takeaway
The working rules have stayed stable since Nielsen (1993) and NN/g (2014):
- under about 1 s, show no indicator;
- for about 1–10 s, use an indeterminate spinner or skeleton;
- above 10 s, use a determinate bar with an estimate.

Production frameworks add two anti-flicker timers, a show delay (about 100–500 ms) and a minimum visible time (about 200 ms–1 s). The evidence that skeleton screens improve perceived speed is weak and mixed. The best-supported progress-bar "tricks" are:
- accelerate toward the end and avoid late pauses (Harrison 2007);
- use backwards-moving, decelerating ribbing (about 11% shorter perceived duration, Harrison 2010).

Apple warns that over-manipulated pacing "can even feel deceptive".

### Cited Findings

**Response-time limits (classic, 1993; web addendum 2014)**
- There are three limits. At 0.1 s the system feels like it is "reacting instantaneously". At 1.0 s the user's "flow of thought" stays uninterrupted. At 10 s the system can still keep "the user's attention", and beyond that users want to do other tasks. The source is Jakob Nielsen's *Usability Engineering* (1993), ch. 5, with a 2014 web update — [NN/g, Response Times: The 3 Important Limits](https://www.nngroup.com/articles/response-times-3-important-limits/)
- For delays of 0.1–1 s, "no special feedback is necessary except to display the result". Above 1 s, indicate that the computer is working. For operations over about 10 s, use "percent-done progress indicators". For 2–10 s, a full percent-done bar may be overkill; a busy cursor plus a fast-changing number is suggested instead. When the amount of work is unknown, show progress in absolute terms, such as naming each item being processed. A generic spinner is the last resort — [NN/g, Response Times](https://www.nngroup.com/articles/response-times-3-important-limits/)

**NN/g progress-indicator rules (Katie Sherwin, 26 Oct 2014)**
- Use any progress indicator for actions longer than about 1 s. Looped animation (spinner) "should be reserved for actions that take between 2-10 seconds". It is "distracting" under 1 s and should be avoided beyond 10 s. Use percent-done indicators for ≥10 s, or for shorter record-by-record tasks ("Updating address 3 of 50"). Above 10 s, show an estimated completion time and pad it — [NN/g, Progress Indicators Make a Slow System Less Insufferable](https://www.nngroup.com/articles/progress-indicators/)
- Don't use static "Loading…" text, because users can't tell whether the system has hung. For percent-done bars, start slower and speed up near the end. Offer cancel for long tasks. "The bigger the variability in your estimates, the lower the threshold for showing the more elaborate feedback." — [NN/g 2014](https://www.nngroup.com/articles/progress-indicators/)
- A University of Nebraska–Lincoln study found that users who saw a looping progress bar were "willing to wait on average 3 times longer" than users who saw no indicator. NN/g does not name the authors or the year (secondary citation) — [NN/g 2014](https://www.nngroup.com/articles/progress-indicators/)

**NN/g skeleton screens (Samhita Tankala, 4 Jun 2023; reviewed Sep 2026)**
- Skeletons are for full-page loads with waits under 10 s. Spinners suit a single module (a video, a dashboard card) with a 2–10 s wait. Use a progress bar for loads over 10 s and for uploads, downloads and conversions, where a skeleton "could even be confusing". Under 1 s, neither skeleton nor spinner helps — [NN/g, Skeleton Screens 101](https://www.nngroup.com/articles/skeleton-screens/)
- There are three types: static, animated (pulse or shimmer) and frame-display. Animated skeletons can be "distracting, annoying, or even create accessibility problems". Frame-display (header and footer only) is not recommended because users may think the page is broken. Skeletons that flash briefly on fast loads make users feel they "can't keep up". Skeletons are "simply one extra tool", not a substitute for performance work — [NN/g 2023](https://www.nngroup.com/articles/skeleton-screens/)
- NN/g cites Mejtoft, Långström & Söderström (2018) but does not summarize its results. The claimed benefits are design reasoning, not reported data — [NN/g 2023](https://www.nngroup.com/articles/skeleton-screens/)

**Skeleton vs spinner evidence**
- Origin of the idea (2013): Luke Wroblewski reports that in the Polar app, spinners in web views made the app feel slower ("We focused on the indicator and not the progress"). He defines a skeleton screen as "essentially a blank version of a page into which information is gradually loaded". This is anecdotal, not a controlled study — [LukeW, Mobile Design Details: Avoid The Spinner, 17 Sep 2013](https://www.lukew.com/ff/entry.asp?1797)
- Viget study (19 Oct 2017; n=136; mobile; identical-length GIF animations). The skeleton "performed the worst by all metrics":

  | Measure | Skeleton | Spinner | Blank |
  |---|---|---|---|
  | Agreed "loaded quickly" | 59% | 74% | 66% |
  | Mean perceived wait | 2.82 s | 2.41 s | 2.29 s |
  | Post-load task time | 10.54 s | 9.49 s | 9.50 s |

  The authors' caveats: skeletons were novel at the time, the interface was unfamiliar, and the effect may only hold for very short waits — [Viget, A Bone to Pick with Skeleton Screens](https://viget.com/articles/a-bone-to-pick-with-skeleton-screens)
- Other small studies favour skeletons. One Brazilian conference paper with n≈21 reports that skeletons had the best perception and that cyclic indicators beat determinate ones. I saw this only through a search snippet and did not verify it — [sol.sbc.org.br](https://sol.sbc.org.br/index.php/ihc_estendido/article/download/37767/37549)

**Anti-flicker timing in real frameworks (delay before showing, minimum display time)**
- `spin-delay` (React hook) defaults to `delay: 500` ms and `minDuration: 200` ms. Its rationale: a 210 ms request with a 200 ms delay would flash a spinner for 10 ms ("This flicker can be annoying") — [smeijer/spin-delay README](https://github.com/smeijer/spin-delay)
- Angular `@defer` has built-in `@loading (after 100ms; minimum 1s)` and `@placeholder (minimum 500ms)`. These exist to "prevent fast flickering". Both timers start when loading is triggered — [angular.dev, Deferred loading with @defer](https://angular.dev/guide/templates/defer)
- React Suspense "reveals suspended content at most once every 300ms, measured from the last reveal". Boundaries that become ready in that window are revealed together. `startTransition` / `useDeferredValue` keep already-revealed content on screen instead of swapping back to a fallback. This prevention applies only to non-urgent updates — [react.dev, `<Suspense>`](https://react.dev/reference/react/Suspense). An older React commit (2023) described a 500 ms throttle. The current docs say 300 ms — [React commit #26611 mirror](https://cdn05042023.gitlink.org.cn/maxjhandsome/react/commit/8256781fdf3ae1947a7f27ddc78ae11b9989c2cd)
- Turbo Drive (Hotwire) shows its top progress bar "for any page that takes longer than 500ms to load". The delay is configurable via `Turbo.setProgressBarDelay`. The bar is a `div.turbo-progress-bar`. During navigation Turbo sets `aria-busy="true"` on `<html>` — [Turbo Handbook, Drive](https://turbo.hotwired.dev/handbook/drive)
- The Android Material progress indicator exposes `app:showDelay` and `app:minHideDelay` ("Min delay (in ms) to hide"), both defaulting to 0. The platform component has the same two-timer pattern built in — [material-components-android ProgressIndicator.md](https://raw.githubusercontent.com/material-components/material-components-android/master/docs/components/ProgressIndicator.md)

**Determinate vs indeterminate (Apple HIG, updated Sep 2023)**
- "When possible, use a determinate progress indicator." If an indeterminate process reaches a point where its duration is known, "switch to a determinate progress bar". Don't switch a circular indicator into a bar, because it "can disrupt your interface". "Keep progress indicators moving". If a process stalls, explain the problem. Avoid vague labels like "loading" or "authenticating". Keep the indicator's location consistent. Allow cancel, and warn when cancelling loses progress — [Apple HIG, Progress indicators (JSON)](https://developer.apple.com/tutorials/data/design/human-interface-guidelines/progress-indicators.json)
- Apple on honesty: "Showing 90 percent completion in five seconds and the last 10 percent in 5 minutes … can even feel deceptive" — [Apple HIG](https://developer.apple.com/tutorials/data/design/human-interface-guidelines/progress-indicators.json)
- On macOS, prefer a spinner for background operations or when space is constrained, and "avoid labeling a spinning progress indicator" — [Apple HIG](https://developer.apple.com/tutorials/data/design/human-interface-guidelines/progress-indicators.json)

**Progress-bar perception research (CMU, Chris Harrison et al.)**
- **"Rethinking the Progress Bar"**, UIST 2007 (Harrison, Amento, Kuznetsov, Bell; 22 participants; 9 progress functions):
  - Functions with pauses near the end (Slow Wavy, Fast Wavy, Late Pause) were perceived as slower than linear.
  - "accelerating progress was strongly favored" (Power, Fast Power).
  - Both effects are exaggerated toward the end (peak-and-end effect).
  - Design advice: "cache progress" at the start to absorb later stalls, and downplay early progress while accelerating near the end. In multi-stage processes, run slow or variable stages first.
  - — [Harrison et al. 2007 PDF](https://www.chrisharrison.net/projects/progressbars/ProgBarHarrison.pdf)
- **"Faster Progress Bars"**, CHI 2010 (Harrison, Yeo, Hudson):
  - Animated ribbing that moves backwards (against the fill direction) was significantly preferred over still or forward ribbing (p<0.001).
  - Accelerating pulsation frequency also helped.
  - In a method-of-adjustment study (16 participants; 5 s and 15 s bars), **backwards-decelerating ribbing** made a bar feel equal to a plain bar about **11% longer**, so processes "appear 11% faster".
  - The ribbing explanation is induced motion.
  - — [Harrison, Yeo, Hudson 2010 PDF](https://www.chrisharrison.net/projects/progressbars2/ProgressBarsHarrison.pdf); [project page](https://www.chrisharrison.net/index.php/Research/ProgressBars2)

**The "fake" top-of-page bar pattern (NProgress, 2013–14)**
- NProgress defaults: `minimum: 0.08`, `speed: 200` ms, `trickleSpeed: 200` ms, `easing: 'linear'`. Each trickle step adds a decreasing increment:

  | Current progress | Increment |
  |---|---|
  | below 0.2 | +0.1 |
  | 0.2–0.5 | +0.04 |
  | 0.5–0.8 | +0.02 |
  | 0.8–0.99 | +0.005 |

  The value is clamped at 0.994, so the bar never finishes without `done()`. Position is set with `transform: translate3d(X%,0,0)`, falling back to `margin-left` — [nprogress.js source](https://raw.githubusercontent.com/rstacruz/nprogress/master/nprogress.js)

### Inferences
- **Decision table for a web app** (synthesis of NN/g, Apple, frameworks):

  | Wait | What to show |
  |---|---|
  | under ~300–500 ms | Nothing new; keep old content (React transitions) |
  | ~0.5–2 s | Inline spinner or dots, or a top bar after a 300–500 ms delay |
  | 2–10 s | Spinner for a module; skeleton for a known-layout page; label what is happening |
  | over 10 s, or measurable work | Determinate bar with absolute counts ("tiles 340/1200"), an estimate, and cancel |

- Use a two-timer gate on every async indicator: show after D ≈ 150–500 ms, then keep it visible for at least M ≈ 300–500 ms. This combines the spin-delay and Angular numbers. The exact values are a judgment call, not a cited standard.
- Harrison 2007 and NN/g's "slow start, fast finish" are in mild tension with Apple's "even pace, don't deceive". A reasonable reconciliation:
  - front-load the uncertain stages;
  - never stall visibly near the end;
  - never sprint to 90% and then stall.

  NProgress's asymptotic trickle is exactly the "90% then wait" pattern Apple warns about when a request takes long. So complete or switch to a determinate bar once real progress is known.
- For a map or world simulator with many tile and asset fetches, the strongest NN/g recommendation is absolute progress: count assets or tiles loaded. It beats a spinner when the work is enumerable.

### Gaps
- I could not access Myers (1985), the classic CHI paper on percent-done indicators. Nah (2004) on tolerable waiting time and the Mejtoft et al. (2018) skeleton study were also not read in full.
- The University of Nebraska–Lincoln "3× longer" study is only known via NN/g; I did not find the original citation.
- I found no primary engineering-blog data from Facebook or LinkedIn quantifying skeleton benefits.

---

## 2. Motion fundamentals for UI: easing, durations, loop length, staggering, animation principles

### Takeaway
UI transitions live in roughly 100–500 ms:
- simple feedback about 100 ms;
- most transitions 200–300 ms;
- 400 ms+ only for large moves.

Entering elements use ease-out (decelerate) and exiting elements use ease-in (accelerate). Material 3 encodes this as tokens: 16 durations from 50 to 1000 ms and standard/emphasized cubic-beziers. M3 Expressive (2025) moved spatial motion to spring physics. Looping loaders, by contrast, run on about 1–2.5 s cycles and use staggered negative delays.

### Cited Findings

**Durations and easing (NN/g, Page Laubheimer, 9 Feb 2020)**
- General range 100–500 ms. Simple feedback (checkbox, toggle) about 100 ms. Larger screen changes such as a modal 200–300 ms. 400 ms is "a very slow animation" for big movements. "At 500ms, animations start to feel like a real drag."
- Entering takes slightly longer than exiting, e.g. 300 ms in and 200–250 ms out. Animations are "far more common[ly] … too long than too short". The more frequent an animation, the shorter and subtler it should be.
- Ease-out for entering ("Most frequently, you'll want to use an ease-out animation"), ease-in for exiting. "Completely linear motion looks weird and unnatural."
- — [NN/g, Executing UX Animations: Duration and Motion Characteristics](https://www.nngroup.com/articles/animation-duration/)

**Material 3 duration tokens (ms)** — [Flutter `Durations`](https://api.flutter.dev/flutter/material/Durations-class.html); same values as `--md-sys-motion-duration-*` in `@material/web` 2.5.0 ([npm](https://www.npmjs.com/package/@material/web))

| Token | 1 | 2 | 3 | 4 |
|---|---|---|---|---|
| short | 50 | 100 | 150 | 200 |
| medium | 250 | 300 | 350 | 400 |
| long | 450 | 500 | 550 | 600 |
| extra-long | 700 | 800 | 900 | 1000 |

**Material 3 easing tokens (cubic-bezier)** — [Flutter `motion.dart` source](https://raw.githubusercontent.com/flutter/flutter/master/packages/flutter/lib/src/material/motion.dart); `@material/web` 2.5.0 tokens

| Token | Value |
|---|---|
| standard | `(0.2, 0, 0, 1)` |
| standard-decelerate | `(0, 0, 0, 1)` |
| standard-accelerate | `(0.3, 0, 1, 1)` |
| emphasized-decelerate | `(0.05, 0.7, 0.1, 1)` |
| emphasized-accelerate | `(0.3, 0, 0.8, 0.15)` |
| legacy (M2 "standard") | `(0.4, 0, 0.2, 1)` |
| legacy-decelerate | `(0, 0, 0.2, 1)` |
| legacy-accelerate | `(0.4, 0, 1, 1)` |

- The M3 "emphasized" curve is not a single cubic-bezier, and Flutter's `Easing` class has no `emphasized` constant. On the web, `@material/web` resolves `--md-sys-motion-easing-emphasized` to `cubic-bezier(0.2, 0, 0, 1)`, which is the same as standard. I verified this in the 2.5.0 package tokens (`easing-emphasized--resolved: var(--easing-standard)`).

**Material 3 Expressive springs (2025)** — Compose source tokens, androidx-main ([ExpressiveMotionTokens.kt](https://android.googlesource.com/platform/frameworks/support/+/androidx-main/compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/ExpressiveMotionTokens.kt), [StandardMotionTokens.kt](https://android.googlesource.com/platform/frameworks/support/+/androidx-main/compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/StandardMotionTokens.kt))

| Scheme | Spatial default | Spatial fast | Spatial slow | Effects (default / fast / slow) |
|---|---|---|---|---|
| Expressive | damping 0.8, stiffness 380 | damping 0.6, stiffness 800 | damping 0.8, stiffness 200 | damping 1.0; stiffness 1600 / 3800 / 800 |
| Standard | damping 0.9, stiffness 700 | damping 0.9, stiffness 1400 | damping 0.9, stiffness 300 | same as Expressive |

- "Spatial" springs (position, size, shape) are underdamped, so they overshoot and give follow-through. "Effects" springs (opacity, color) are critically damped (1.0) and do not bounce. The spatial/effects naming is also described in third-party ports — [pub.dev M3EMotion](https://pub.dev/documentation/m3e_slider/0.0.2/common_m3e_common/M3EMotion-class.html)

**Apple HIG Motion (changelog through 9 Sep 2025, Liquid Glass)**
- "Add motion purposefully". Gratuitous motion can make people "feel disconnected or physically uncomfortable".
- Don't use motion as the only way to communicate. Supplement it with haptics and audio.
- "Aim for brevity and precision in feedback animations". "Generally avoid adding motion to UI interactions that occur frequently".
- "Let people cancel motion… don't make people wait for an animation to complete".
- visionOS: avoid sustained oscillation, especially around 0.2 Hz.
- — [Apple HIG, Motion (JSON)](https://developer.apple.com/tutorials/data/design/human-interface-guidelines/motion.json)

**Loop lengths and stagger values in shipped loaders**
- Material circular indeterminate (Angular Material, MDC-based):

  | Keyframe | Duration | Easing |
  |---|---|---|
  | arc expand/contract | 1333 ms | `cubic-bezier(0.4,0,0.2,1)` |
  | spinner-layer rotation (8 steps of 135°, 3 turns) | 5332 ms (= 4 × 1333) | `cubic-bezier(0.4,0,0.2,1)` |
  | container rotation | ≈1568 ms (1333 × 360/306) | linear |

  — [Angular Material progress-spinner.scss](https://raw.githubusercontent.com/angular/components/main/src/material/progress-spinner/progress-spinner.scss). `@material/web` uses the same constants ([_circular-progress.scss](https://raw.githubusercontent.com/material-components/material-web/main/progress/internal/_circular-progress.scss))
- Material Web linear indeterminate: a 2 s linear cycle. Two bars each combine `translateX` and `scaleX` keyframes with custom cubic-beziers. The determinate fill is `transition: transform 250ms cubic-bezier(0.4, 0, 0.6, 1)` (`@material/web` 2.5.0 `_linear-progress.scss`).
- SpinKit:

  | Loader | Cycle | Easing | Stagger |
  |---|---|---|---|
  | flow (3 dots) | 1.4 s | `cubic-bezier(0.455,0.03,0.515,0.955)` | delays −0.30 s, −0.15 s, 0 |
  | wave (5 bars) | 1.2 s | ease-in-out | −1.2 s … −0.8 s |
  | circle (12 dots) | 1.2 s | — | −1.1 s … −0.1 s in 0.1 s steps |
  | chase | 2.5 s wrapper, 2.0 s dots | — | — |

  All animate only `transform` (sometimes `opacity`) — [SpinKit spinkit.css](https://raw.githubusercontent.com/tobiasahlin/SpinKit/master/spinkit.css)
- MUI Skeleton: pulse is `opacity 1→0.4→1`, `2s ease-in-out 0.5s infinite`. Wave is `translateX(-100%)→100%` over `2s linear 0.5s infinite`, with the keyframe holding at 100% from 50% to 100%, which builds in a pause ("+0.5s of delay between each loop") — [@mui/material 9.5.0 Skeleton.js](https://www.npmjs.com/package/@mui/material)
- M3 Expressive LoadingIndicator: a third-party Flutter port lists a morph interval of about 650 ms and a global rotation of about 4666 ms. This is not an official spec — [pub.dev loading_indicator_m3e](https://pub.dev/documentation/loading_indicator_m3e/latest/)

**Cartoon principles applied to UI (primary HCI source)**
- Chang & Ungar, "Animation: From Cartoons to the User Interface" (UIST '93) applied the principles in the Self environment:
  - "Attention to timing and transient detail allows Self objects to move solidly" (solidity).
  - "Anticipating motion with a small contrary motion and pacing the middle of transitions faster than the endpoints results in smoother and clearer movements" (anticipation, slow-in/slow-out).
  - "Cartoon-style motion blur" keeps fast motion comprehensible.
  - — [Chang & Ungar 1993 PDF](https://bibliography.selflanguage.org/_static/animation.pdf) (abstract via search snippet)

### Inferences
- Map the principles to loaders:
  - **Squash & stretch:** SpinKit's scale-based dots and the Material arc that grows from short to long and back.
  - **Slow-in/slow-out:** the `(0.4,0,0.2,1)` curves on every Material spinner keyframe.
  - **Overlap and follow-through:** staggered negative delays (dots peak in sequence) and M3 Expressive underdamped spatial springs.
  - **Anticipation:** rarely useful in a loop; more useful in the exit transition when content arrives.
- Loop period: shipped loaders cluster at 1.2–2.5 s per visual cycle. Material's arc is 1.333 s; SpinKit and MUI skeletons are 1.2–2 s; the Material linear indeterminate bar is 2 s. Faster than ~0.8 s reads as frantic; slower than ~3 s reads as stalled. This is a heuristic from these examples, not a cited rule.
- Use negative `animation-delay` for staggering, not positive. With negative delays every element is mid-cycle at t=0, so the loader looks "already running" the instant it paints. That matters for flicker-gated loaders that may only be visible for 300–500 ms.
- For the reveal after loading (content in, loader out), use M3 tokens:
  - content in: emphasized-decelerate `(0.05,0.7,0.1,1)` at 250–400 ms;
  - loader out: opacity fade at about 100–150 ms with standard-accelerate `(0.3,0,1,1)`.

  This matches NN/g's "exit faster than enter".

### Gaps
- m3.material.io easing/duration and progress-indicator pages render client-side and could not be fetched. The official M3 usage guidance per token (which token for which transition) is therefore taken from secondary sources and token sources only.
- The CSS `linear()` easing function can approximate springs on the web. I did not gather a source for M3 spring→`linear()` conversion.
- I did not read Lasseter's 1987 SIGGRAPH paper on the 12 principles.

---

## 3. Accessibility: prefers-reduced-motion, WCAG 2.2 (2.2.2, 2.3.3), ARIA for loaders

### Takeaway
A loading animation that is the only thing on screen is exempt from WCAG 2.2.2. One that runs more than 5 s in parallel with usable content needs pause/stop/hide unless it is "essential". The Understanding doc explicitly allows preload animations to count as essential when their absence would make users think content is frozen.

Honour `prefers-reduced-motion` by reducing, not removing, the indicator. A frozen spinner reads as a hang. Real libraries do this in three different ways:
- MUI disables the skeleton animation;
- Primer makes the shimmer opt-in;
- Angular Material slows the spinner by 1.25×.

For semantics, use `role="progressbar"` or native `<progress>` with an accessible name, omit `aria-valuenow` when indeterminate, and set `aria-busy="true"` plus `aria-describedby` on the region being loaded.

### Cited Findings

**WCAG 2.2 SC 2.2.2 Pause, Stop, Hide (Level A)**
- The rule: "For any moving, blinking or scrolling information that (1) starts automatically, (2) lasts more than five seconds, and (3) is presented in parallel with other content", there must be a mechanism to pause, stop or hide it, "unless the movement, blinking, or scrolling is part of an activity where it is essential". Auto-updating content has no 5-second exception. Five seconds "is long enough to get a user's attention" — [W3C Understanding 2.2.2](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html)
- Note 4: "An animation that occurs as part of a preload phase or similar situation can be considered essential if interaction cannot occur during that phase for all users and if not indicating progress could confuse users or cause them to think that content was frozen or broken." A worked example covers a preloader that is the only content on the page: no mechanism is needed, even past 5 s — [W3C Understanding 2.2.2](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html)

**WCAG 2.2 SC 2.3.3 Animation from Interactions (Level AAA)**
- "Motion animation triggered by interaction can be disabled, unless the animation is essential". Motion animation "does not include changes of color, blurring, or opacity". An errata note amends the definition to not exclude blurring, which creates an inconsistency on the page. The page does not discuss spinners. Sufficient techniques are C39 (CSS `prefers-reduced-motion`), SCR40 (the same query in JS) and a user preference setting — [W3C Understanding 2.3.3](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html)

**prefers-reduced-motion (web.dev, Thomas Steiner, 2019)**
- Values are `no-preference` and `reduce`. `reduce` means minimize movement, "preferably to the point where all non-essential movement is removed". The OS sources named are macOS "Reduce motion" and Android "Remove animations".
- Support: Chrome 74, Edge 79, Firefox 63, Safari 10.1.
- Patterns:
  - an override under `reduce`;
  - opt-in under `no-preference`, which also covers browsers without support;
  - `<link media="(prefers-reduced-motion: no-preference)">`;
  - `<picture><source media=…>` to swap animated AVIF/WebP/GIF for a still image;
  - the `Sec-CH-Prefers-Reduced-Motion` client hint;
  - in JS, `matchMedia(...)` plus a `change` listener, because JS animations must be stopped manually.
- The demo keeps essential motion: reduced ≠ none.
- — [web.dev, prefers-reduced-motion](https://web.dev/articles/prefers-reduced-motion)

**How real libraries handle reduced motion for loaders**
- **MUI Skeleton** (@mui/material 9.5.0) sets `animation: 'none'` for both pulse and wave under reduced motion (`getReducedMotionStyles`) — [npm @mui/material](https://www.npmjs.com/package/@mui/material)
- **GitHub Primer** SkeletonBox and ProgressBar (@primer/react 38.42.0) apply the shimmer only inside `@media (prefers-reduced-motion: no-preference)`, the opt-in pattern. They also add `forced-colors: active` handling with an outline on the skeleton and system colors `LinkText`/`CanvasText` on the progress bar — [npm @primer/react](https://www.npmjs.com/package/@primer/react)
- **Angular Material** spinner: under OS reduced motion, `--mat-progress-spinner-animation-multiplier: 1.25` slows all spinner animations by 25%; for example, 1333 ms becomes about 1666 ms. Only when animations are disabled app-wide (`_mat-animation-noopable`) is the spinner rendered as a static full circle (`stroke-dasharray: 0`) — [Angular Material progress-spinner.scss](https://raw.githubusercontent.com/angular/components/main/src/material/progress-spinner/progress-spinner.scss)
- **@material/web** 2.5.0: the progress components contain no `prefers-reduced-motion` rules. The rules appear only in tabs, slider and focus-ring (checked by grep in the published package). Progress uses `role="progressbar"`, `aria-valuemin="0"`, `aria-valuemax`, and omits `aria-valuenow` when indeterminate. Its circular progress supports `forced-colors` via `CanvasText` — [npm @material/web](https://www.npmjs.com/package/@material/web); [_circular-progress.scss](https://raw.githubusercontent.com/material-components/material-web/main/progress/internal/_circular-progress.scss)
- **Vercel Geist** LoadingDots: the dots are decorative, so "don't add `aria-label` to the component itself". Put the label text in a span with `aria-live="polite"`, honour reduced motion, and don't put two animated indicators on one line. Don't write "Saved…" with dots, because dots imply ongoing work. Keep the label specific ("Deploying", "Uploading") — [vercel.com/geist/loading-dots](https://vercel.com/geist/loading-dots)

**ARIA (MDN)**
- `aria-busy="true"` tells assistive technology to "wait until the modifications or changes are complete before exposing the content". Set it while several parts of a live region load, then set it to `false`. Inside `role="feed"`, changes are not announced while busy, except user-initiated ones — [MDN aria-busy](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-busy)
- `role="progressbar"`:
  - an accessible name is required;
  - `aria-valuenow` is required only when the value is determinate ("don't include the attribute" when indeterminate);
  - `aria-valuemin`/`aria-valuemax` default to 0 and 100;
  - use `aria-valuetext` when a percentage would be misleading;
  - children are presentational.
- For loading a region, "include the `aria-describedby` attribute to reference the progress bar's status, and set the `aria-busy` attribute to `true` on the region until it is finished loading". Prefer native `<progress>` — [MDN progressbar role](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Roles/progressbar_role)
- Turbo applies `aria-busy="true"` to `<html>` during navigations — [Turbo Handbook](https://turbo.hotwired.dev/handbook/drive)
- Android: indicator bounds ≤4 dp fail to draw the focus indicator, so pad them. Non-text-contrast updates add a 4 dp track gap and a 4 dp stop indicator on linear determinate bars — [material-components-android ProgressIndicator.md](https://raw.githubusercontent.com/material-components/material-components-android/master/docs/components/ProgressIndicator.md)

### Inferences
- Recommended reduced-motion policy for loaders:
  - keep an indeterminate indicator moving, slowly or with low amplitude: rotation without arc morphing, or an opacity pulse;
  - replace shimmer sweeps and translating skeleton waves with a static skeleton or a gentle opacity pulse;
  - drop decorative bounce, squash and overshoot.

  Opacity changes are explicitly not "motion animation" under 2.3.3, so an opacity pulse is the safest reduced-motion fallback that still shows "alive". Angular's 1.25× slow-down is a defensible alternative for spinners.
- A map or world view where users can pan while tiles or agents load means the loader is "in parallel with other content". If it can run more than 5 s, either make it small and essential (it indicates progress and its absence would look broken, per Note 4) or make it dismissible. A determinate counter ("loaded 340/1200 tiles") is updating text and has no 5 s exemption under the "auto-updating" clause. Use `aria-live="polite"` sparingly and throttle it; don't announce every increment.
- Minimal accessible markup (illustrative):
  ```html
  <main id="world" aria-busy="true" aria-describedby="world-progress">…</main>
  <div id="world-progress" role="progressbar" aria-label="Loading world"></div> <!-- indeterminate: no aria-valuenow -->
  <span class="sr-only" aria-live="polite" id="world-status"></span>          <!-- set once: "World loaded" -->
  ```

### Gaps
- iOS and Windows mappings for `prefers-reduced-motion` are not in the fetched web.dev article (it names only macOS and Android).
- Apple's HIG Motion page does not describe what Reduce Motion should change. That guidance lives on Apple's Accessibility pages, which were not fetched.
- I found no WCAG technique document that specifically addresses spinners.

---

## 4. Implementation techniques: compositor-friendly CSS, why loaders freeze, SVG line drawing, Material spinner internals, skeleton shimmer, staggered dots, steps(), inline boot loader

### Takeaway
Animate only `transform` and `opacity`, and `filter` where supported. In Chromium these properties can run on the compositor thread "not affected by the main thread". A spinner built purely from rotations keeps turning while JS parses or hydrates.

Animations of `stroke-dasharray`/`stroke-dashoffset`, `background-position`, `mask-position`, SMIL, and anything driven by `requestAnimationFrame` are sampled on the main thread and stall during long tasks. That is why the Material spinner is built from rotating clipped halves rather than dash animation.

For a boot loader that must survive bundle parse, put inline HTML+CSS before the scripts, keep it transform-only, and remove it after the first app paint.

### Cited Findings

**Compositor vs main thread**
- Chrome (updated 22 Feb 2021): hardware-accelerated by default are "`opacity`, `filter`, and `transform`". These animations "are not affected by the main thread" and "bypass the crust of other active scripts". "As of Chromium 89" SVG animations are hardware-accelerated by default, and percentage transform animations became accelerated in 89. `background-color` and `clip-path` were then "slated" to become accelerated — [developer.chrome.com, Hardware-accelerated animation capabilities](https://developer.chrome.com/blog/hardware-accelerated-animations)
- Blink animation README: "currently transform, opacity, filter, and backdrop-filter" can be mutated on the compositor. The same engine drives CSS Animations, CSS Transitions and `element.animate()` (WAAPI), so WAAPI animations of these properties are also eligible. "An accelerated animation is still running on main thread", which updates computed style while the compositor updates visuals. Eligibility is decided by `CheckCanStartAnimationOnCompositor()` (composite mode, other animations on the same property, whether the element can be promoted) — [Chromium blink/renderer/core/animation README](https://chromium.googlesource.com/chromium/src/+/2f7dfeb1/third_party/blink/renderer/core/animation)
- web.dev (Kayce Basques, Rachel Andrew; updated 6 Oct 2020): "restrict animations to `opacity` and `transform`". Use `will-change` "sparingly, and only if you encounter a performance issue" — [web.dev, How to create high-performance CSS animations](https://web.dev/articles/animations-guide)
- MDN: if CSS animations and rAF both run on the main thread there is "no difference performance-wise". Off-main-thread animation (OMTA) is possible only for properties that don't trigger reflow or repaint, "the most common property is the CSS transform". rAF pauses in background tabs — [MDN, CSS and JavaScript animation performance](https://developer.mozilla.org/en-US/docs/Web/Performance/Guides/CSS_JavaScript_animation_performance)
- Caveats from library vendors, secondary sources:
  - each browser has its own acceleration rules;
  - animating CSS custom properties that feed `transform` is not accelerated;
  - Safari reportedly does not accelerate animations using `linear()` easing.

  — [motion.dev performance](https://motion.dev/docs/performance); [anime.js docs](https://animejs.com/documentation/web-animation-api/hardware-accelerated-animations)
- SMIL: a 2014 Chromium engineer (Philip Rogers) argued SMIL is hard to move off the main thread and measured Blink SMIL as no faster than rAF JS. Motion.dev states SMIL runs on the main thread. Current Chromium behaviour was not verified from primary sources — [www-svg 2014 thread](https://lists.w3.org/Archives/Public/www-svg/2014Jun/0041.html); [motion.dev SVG](https://motion.dev/docs/svg-animation)

**Material circular indeterminate spinner: how it is actually built**
- Angular Material (MDC lineage) does *not* animate `stroke-dasharray` for the indeterminate spinner. The structure is:
  - a container rotating linearly (≈1568 ms);
  - a spinner layer rotating in 8 eased 135° steps (5332 ms);
  - two `overflow:hidden` half-width clippers, each holding a circle that swings between 265° and 130° (left) or −265° and −130° (right), 1333 ms, `cubic-bezier(0.4,0,0.2,1)`;
  - a 5%-wide "gap patch" hiding the seam.

  `stroke-dashoffset` is used only for the determinate ring: `transition: stroke-dashoffset 500ms cubic-bezier(0,0,0.2,1)` — [Angular Material progress-spinner.scss](https://raw.githubusercontent.com/angular/components/main/src/material/progress-spinner/progress-spinner.scss)
- `@material/web` builds the same arc from CSS borders: `border-radius:50%`, with top and right border colored and bottom and left transparent, inside two half clippers. The right half has `animation-delay: calc(-0.5 * 1333ms)`. The keyframes `expand-arc`, `rotate-arc` and `linear-rotate` are all transform rotations. The optional four-color mode animates `border-*-color`, which is not compositor-eligible. The SVG `stroke-dasharray: 100` with `pathLength` is used only for the determinate track — [_circular-progress.scss](https://raw.githubusercontent.com/material-components/material-web/main/progress/internal/_circular-progress.scss)
- Android MDC: `indeterminateAnimationType` is `disjoint` (2 segments, default) or `contiguous` (3 segments, needs ≥3 colors) for linear, and `advance` for circular. Track 4 dp by default and 8 dp for the thick Expressive variant. Circular size 40 dp by default; 52 dp recommended for thick wavy indeterminate — [ProgressIndicator.md](https://raw.githubusercontent.com/material-components/material-components-android/master/docs/components/ProgressIndicator.md)

**SVG line drawing (stroke-dasharray/dashoffset)**
- Set `stroke-dasharray` ≥ the path length, set `stroke-dashoffset` to the same value (hidden), and animate the offset to 0 (`animation: dash 5s linear forwards`). Measure with `path.getTotalLength()`, or set the `pathLength` attribute to normalize lengths (reader comment) — [CSS-Tricks, How SVG Line Animation Works (Chris Coyier, 18 Feb 2014)](https://css-tricks.com/svg-line-animation-works/)

**Skeleton shimmer techniques in production libraries**
- **MUI wave** (compositor-friendly):
  - an `::after` overlay with `linear-gradient(90deg, transparent, <hover color>, transparent)`, starting at `transform: translateX(-100%)` "to avoid flash during server-side hydration";
  - animated `translateX(-100%)→(100%)` over 2 s linear with a 0.5 s delay;
  - the parent has `overflow:hidden` and a `-webkit-mask-image` radial-gradient fix for a Safari border-radius clipping bug (WebKit 68196).
- **MUI pulse:** opacity 1→0.4→1 over 2 s ease-in-out — [@mui/material Skeleton.js](https://www.npmjs.com/package/@mui/material)
- **Primer** (GitHub): `mask-image: linear-gradient(75deg,#000 30%,rgba(0,0,0,.65) 80%); mask-size: 200%`, animating `mask-position: 200% → 0`. Duration is `var(--base-duration-1000)` on skeletons and 1 s on progress bars. Gated by `prefers-reduced-motion: no-preference` — [@primer/react 38.42.0](https://www.npmjs.com/package/@primer/react)
- **Facebook Shimmer** (Android) was "originally developed for Facebook Home" as "an unobtrusive loading indicator". The repo was archived on 1 Aug 2023 — [facebookarchive/shimmer-android](https://github.com/facebookarchive/shimmer-android)

**Staggered dots and steps()**
- SpinKit stagger values: see section 2. Note the mix of negative delays (dots in phase from frame 0) and positive delays (grid, fold) — [SpinKit](https://raw.githubusercontent.com/tobiasahlin/SpinKit/master/spinkit.css)
- `steps(<integer>, <step-position>?)`. Positions are `jump-start`/`start`, `jump-end`/`end` (the default), `jump-none` and `jump-both`. "If an animation contains multiple segments, the specified number of steps applies to each segment" — [MDN steps()](https://developer.mozilla.org/en-US/docs/Web/CSS/easing-function/steps)

**Other notes from sources**
- Hidden-but-animating elements still cost work. `@material/web` hides buffer dots with `display:none` explicitly "to prevent infinite invisible animation" (`_linear-progress.scss`, 2.5.0).
- Animated raster loaders (GIF/WebP/AVIF) can be gated per reduced motion with `<picture><source media="(prefers-reduced-motion: no-preference)">` — [web.dev](https://web.dev/articles/prefers-reduced-motion)

### Inferences
These are illustrative code patterns derived from the sources above, not verified by running them in this research.

- **Why a "classic" SVG spinner half-freezes under load.** The popular pattern rotates the `<svg>` (compositor) while animating `stroke-dasharray`/`stroke-dashoffset` on the `<circle>` (main thread). During a long task the rotation continues but the arc stops growing and shrinking. Material's clipped-half construction avoids this because all moving parts are rotations, except the optional color cycle. Illustrative pattern; the numbers are the commonly used values for r=20 (circumference ≈125.7), not taken from a fetched source:
  ```css
  .spin { animation: rot 2s linear infinite; }                 /* compositor */
  .spin circle { fill:none; stroke:currentColor; stroke-width:4; stroke-linecap:round;
                 animation: dash 1.5s ease-in-out infinite; }   /* main thread */
  @keyframes rot  { to { transform: rotate(360deg); } }
  @keyframes dash { 0%  { stroke-dasharray: 1 150;  stroke-dashoffset: 0; }
                    50% { stroke-dasharray: 90 150; stroke-dashoffset: -35; }
                    100%{ stroke-dasharray: 90 150; stroke-dashoffset: -124; } }
  ```
- **Long-task-proof minimal spinner** (transform only):
  ```css
  .ring { width:40px; height:40px; border-radius:50%;
          border:4px solid color-mix(in srgb, currentColor 20%, transparent);
          border-top-color: currentColor;
          animation: rot .9s linear infinite; }
  @keyframes rot { to { transform: rotate(1turn); } }
  @media (prefers-reduced-motion: reduce) { .ring { animation-duration: 2.4s; } } /* slow, don't stop */
  ```
- **Determinate ring:** `<circle pathLength="100" stroke-dasharray="100" style="stroke-dashoffset: calc(100 - var(--p))">` with `transition: stroke-dashoffset 250–500ms`. This follows the same `pathLength` normalization `@material/web` uses (`stroke-dasharray: 100`). It runs on the main thread, which is acceptable because it only updates when real progress changes.
- **Skeleton shimmer:** prefer the MUI approach (a translating `::after` gradient, composited) over animating `background-position` or `mask-position`. Those are paint-bound, not in Chromium's compositor list, so they cost a repaint every frame across every skeleton block. For many skeleton rows, one shared overlay or a pulse is cheaper. Under reduced motion, use a static block.
- **Three-dot loader:** `animation: dot 1.4s ease-in-out infinite both` with delays `-0.32s`/`-0.16s`/`0s` (or SpinKit's −0.30/−0.15), and keyframes `0%,80%,100% {transform:scale(0)} 40% {transform:scale(1)}`. Pure transform, so it is composited.
- **CSS-only delay-before-show** (no JS timer): `.loader { opacity:0; animation: show 150ms ease-out 400ms forwards, rot 1s linear infinite; } @keyframes show { to { opacity:1 } }`. Both are compositor properties. Minimum display time still needs JS, for example: record `shownAt` when the delay elapses, and on completion wait `max(0, minVisible - (now - shownAt))` before hiding.
- **steps() for frame-based loaders** (relevant for AI-generated sprite strips in this project):
  - Animating `background-position` with `steps(N)` is paint-bound (main thread).
  - A compositor-friendly variant puts the whole strip of N frames in an `<img>` inside an `overflow:hidden` frame. Since the percentage is relative to the image's own width, animate either `translateX(0) → translateX(calc(-100% * (N-1) / N))` with `steps(N, jump-none)` (N levels including both ends; e.g. 8 frames of 100px → 0 to −700px), or `translateX(0) → translateX(-100%)` with `steps(N)` (default `end`, which gives levels 0, 1/N … (N−1)/N).
  - Whether Chromium composites `steps()` timing was not verified; check in DevTools → Animations or Performance.
- **Inline boot loader that survives bundle parse/hydration:**
  1. Put a tiny `<style>` and `<div id="boot">` (logo, ring or dots) in the HTML `<body>` before any script. Use `type="module"` or `defer` scripts so HTML parsing and first paint aren't blocked.
  2. Animate only transform and opacity, so the compositor keeps it moving during main-thread parse, compile and hydration.
  3. On the app's first meaningful render, fade it out (opacity, ~150 ms) and remove the node, or set `display:none` so it stops animating.
  4. Mark the app root `aria-busy="true"` until then.

  One caveat: compositor animations must already have started (style resolved, layer promoted) before the long task begins. An animation inserted or started *during* a blocked main thread won't start until the thread frees up. The Chrome and Blink sources state the main-thread independence of composited animations; the start-time caveat is a reasoned implication, not quoted.
- **Video logos.** Discord's animated logo was originally a webm (see section 5). Video decode generally doesn't depend on JS main-thread work, but I did not verify that a `<video>` keeps playing smoothly during long tasks.

### Gaps
- I did not verify the current Chromium status of composited `background-color` and `clip-path` animations, which were "slated" in 2021. Treat them as main-thread until verified.
- I found no current (2024–2026) primary Chromium or WebKit documentation on whether SMIL or `steps()` timing animations are composited.
- I found no primary source for "the canonical SVG dasharray spinner values". They are a CodePen-era convention.
- I found no primary measurements of how often loaders freeze during hydration in real apps.

---

## 5. Real product examples and reference collections

### Takeaway
- **Material 3 Expressive (May 2025):** two new indicators. A shape-morphing LoadingIndicator for waits under ~5 s, which replaces the indeterminate circular indicator. Thicker, optionally wavy linear and circular bars for longer processes.
- **Apple:** standardizes on spinner versus determinate bar, with a "switch to determinate" rule.
- **The web:** top-of-page thin bars (NProgress, YouTube's red bar era, Turbo with a 500 ms delay) and skeletons (MUI, Primer). Linear-style subtle loaders are a matter of convention.
- **Discord:** shows an animated logo plus a "Did you know" tip, displayed for about 2 s per user reports.
- **Reference collections:** css-loaders.com (600+ single-element CSS loaders), SpinKit (transform-only CSS), loading.io.

### Cited Findings

**Material Design 3 / M3 Expressive**
- LoadingIndicator, per 9to5Google (Abner Li, 16 May 2025) quoting Google guidance:
  - shows "progress for a short wait time" and should be used for things that load "in under five seconds";
  - is a "replacement for indeterminate circular progress indicators";
  - is a "looping shape morph sequence composed of seven unique Material 3 shapes" (M3 has 35 shapes);
  - comes with or without a circular container (pull-to-refresh), and can sit inside buttons or replace a browser favicon while loading.
  - For longer processes, the linear and circular indicators get thicker and can be wavy: "The wavy shape can make longer processes feel less static and is best used when a more expressive style is appropriate."
  - This is secondary reporting; the official m3.material.io page could not be fetched.
  - — [9to5Google](https://9to5google.com/2025/05/16/material-3-expressive-loading-indicator/)
- Compose implements `LoadingIndicator` as a morph between `RoundedPolygon`s; the determinate variant maps 0..1 progress to the morph and needs ≥2 polygons — [Android developers reference via search](https://developer.android.com/reference/kotlin/androidx/compose/material3/LoadingIndicator.composable)
- Compose wavy indicators:
  - `amplitude` is a 0..1 fraction (default 1.0);
  - `wavelength` is in Dp and may be adjusted slightly to keep the wave continuous;
  - wave speed defaults to one wavelength per second;
  - the linear variant has a separate indeterminate wavelength default.

  — [CircularWavyProgressIndicator (kotlinlang)](https://kotlinlang.org/api/compose-multiplatform/material3/androidx.compose.material3/-circular-wavy-progress-indicator.html); [LinearWavyProgressIndicator](https://kotlinlang.org/api/compose-multiplatform/material3/androidx.compose.material3/-linear-wavy-progress-indicator.html)
- Android MDC lists wavy and the 8 dp thick track under the "M3 Expressive update". It requires the `Material3Expressive` theme, and wave attributes default to 0 (flat) — [ProgressIndicator.md](https://raw.githubusercontent.com/material-components/material-components-android/master/docs/components/ProgressIndicator.md)
- Reader reception was mixed. The top comment on 9to5Google says the style walks a "razor thin line between cool and childish" — [9to5Google](https://9to5google.com/2025/05/16/material-3-expressive-loading-indicator/)

**Apple**
- Activity indicator (spinner) is used for unquantifiable tasks. Determinate bars fill leading→trailing; circular determinate fills clockwise. iOS uses refresh controls for pull-to-refresh. APIs: SwiftUI `ProgressView`; UIKit `UIProgressView`, `UIActivityIndicatorView`, `UIRefreshControl`; AppKit `NSProgressIndicator` — [Apple HIG Progress indicators](https://developer.apple.com/tutorials/data/design/human-interface-guidelines/progress-indicators.json)

**Top-of-page progress bars**
- NProgress mechanics: see section 1 — [nprogress.js](https://raw.githubusercontent.com/rstacruz/nprogress/master/nprogress.js)
- Turbo Drive: 500 ms delay, `.turbo-progress-bar`, `aria-busy` on `<html>` — [Turbo Handbook](https://turbo.hotwired.dev/handbook/drive)
- YouTube: a thin red bar at the top during SPF (Structured Page Fragments) navigations. SPF sends only page fragments as JSON on navigation. A userscript titled "YouTube – Disable Red Bar aka SPF" ties the bar to SPF. A 2014 mailing-list post notes YouTube already used such a bar — [youtube/spfjs](https://github.com/youtube/spfjs); [userscript](https://openuserjs.org/scripts/JoeSimmons/YouTube_-_Disable_Red_Bar_aka_SPF); [PatternFly list, Jul 2014](https://listman.redhat.com/archives/patternfly/2014-July/000159.html)

**Skeleton screens in products and libraries**
- Polar (2013) replaced spinners with skeletons — [LukeW](https://www.lukew.com/ff/entry.asp?1797)
- Facebook Shimmer came from Facebook Home — [shimmer-android](https://github.com/facebookarchive/shimmer-android)
- MUI and Primer skeleton implementations: see section 4.

**Discord and Slack**
- The Discord web app shows a "Did you know" splash message on opening. A user reports it is displayed for about 2 s, too short to read, and requests a setting to adjust or skip it — [Discord support community post](https://support.discord.com/hc/fr/community/posts/19267185234711-The-Did-You-Know-splash-message-on-opening-Discord-is-displayed-too-briefly-to-read)
- Discord's animated loading logo is a video (webm). An open-source project recreates it as SVG "inspired by the original webm" (third-party) — [awesome.ecosyste.ms entry](https://awesome.ecosyste.ms/projects/133432)
- A list of Discord loading-screen tip texts exists as an unofficial gist with unknown provenance — [gist](https://gist.github.com/wavedevgit/0ee5b85f2aa63f716f70f01e14165c9e)
- Slack lets workspace admins and owners set custom "Loading Messages" (Customize Slack → Loading Messages, under 150 characters). This comes from a third-party blog; I found no official help article — [tosbourn.com](https://tosbourn.com/slack-custom-startup-message)

**Vercel Geist**
- Geist ships `LoadingDots` ("Indicate an action running in the background"), `Spinner` (icon-sized indeterminate), `Skeleton` (layout placeholders) and `Progress` (known progress). Use `Button`'s `loading` prop rather than dots inside the label — [vercel.com/geist/loading-dots](https://vercel.com/geist/loading-dots)

**Reference collections**
- **css-loaders.com** (Temani Afif): "Over 600+ CSS-only loaders made using a single element"; click to copy CSS — [css-loaders.com](https://css-loaders.com/)
- **SpinKit** (Tobias Ahlin): about 12 CSS spinners; all keyframes animate transform/opacity only — [SpinKit](https://raw.githubusercontent.com/tobiasahlin/SpinKit/master/spinkit.css)
- **Material implementations to read as reference code:**
  - [Angular Material spinner](https://raw.githubusercontent.com/angular/components/main/src/material/progress-spinner/progress-spinner.scss)
  - [@material/web circular](https://raw.githubusercontent.com/material-components/material-web/main/progress/internal/_circular-progress.scss) and linear (`_linear-progress.scss` in the npm package)

### Inferences
- For a browser-based map or world simulator, the examples suggest a layered set:
  1. An inline boot loader (logo or ring, transform-only), optionally with rotating "tips" in the Discord style. Tips are only readable if each stays up for several seconds, and Discord users complain at about 2 s.
  2. A thin top bar for route or scene transitions, after a 300–500 ms delay (Turbo/NProgress style). Finish it promptly once real progress is known.
  3. Determinate counters for enumerable asset or tile loads.
  4. Small module spinners or dots for panels.
  5. Static or pulse skeletons only for UI panels with stable layout, not for the map canvas. A "frame-display" style skeleton of a map is exactly what NN/g warns can look broken.
- M3 Expressive's split mirrors NN/g's thresholds closely: shape-morph indicator under 5 s, wavy bar for long processes. The wavy bar is essentially a modern "personality" version of Harrison's animated-ribbing finding: motion inside the bar makes a long process "feel less static". No published data was found showing that the wavy bar reduces perceived duration; that remains a hypothesis.

### Gaps
- I found no primary sources for Linear, Stripe or LinkedIn loader implementations or engineering posts. GitHub's own top-of-page progress bar implementation (Turbo vs a custom bar) was not confirmed.
- loading.io was not fetched; it is commonly known as a generator of SVG/CSS/GIF/APNG loaders, but that is unverified here.
- Official Discord or Slack engineering write-ups on their loading screens were not found. The details come from user posts and third-party blogs.
- The official M3 page text for the loading indicator and wavy indicators (m3.material.io) was not retrievable, because it is client-rendered. The "under 5 seconds" figure is from secondary reporting quoting Google.
