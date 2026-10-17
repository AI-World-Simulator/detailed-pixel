/* Boot loader: little pixel residents doing things while the world loads.
   Every moving part is a CSS animation of transform/opacity (compositor-only), built once per stage change,
   so the scene keeps moving while boot() blocks the main thread. Sprites: data/loader/sprites.json, inlined by build.js.
     LOADER.stage(key, text, i, n)  boot() step: key in STAGES (unknown keys get a generic busy scene)
     LOADER.done()                  fade out and remove the overlay
     LOADER.scene(root, variant)    build a scene into any element (demo page)
   Variant: ?loader=crew|chat|walk|parade|island|dots, default DEFAULT. Reduced motion: frames hold, only opacity pulses. */
(function () {
  "use strict";
  var SPR = /*LOADER_SPR*/null;
  var DEFAULT = "crew";
  var STAGES = ["coast", "smooth", "relief", "roads", "kit", "workers", "people"];
  var W = 168, H = 72;                       // scene size in art pixels; CSS scales by an integer --s

  var uid = 0, sheet = null;
  function css(rule) {
    if (!sheet) { var st = document.createElement("style"); st.id = "ldr-kf"; document.head.appendChild(st); sheet = st.sheet; }
    try { sheet.insertRule(rule, sheet.cssRules.length); } catch (e) { /* bad rule: skip, never break boot */ }
  }
  function el(tag, cls, parent, style) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (style) e.style.cssText = style;
    if (parent) parent.appendChild(e);
    return e;
  }
  // segs [[value, ms], ...] -> keyframes that hold each value (played with step-end); total = sum of ms
  function track(segs, decl) {
    var total = 0, i, f = [];
    for (i = 0; i < segs.length; i++) total += segs[i][1];
    var t = 0;
    for (i = 0; i < segs.length; i++) { f.push((t / total * 100).toFixed(3) + "%{" + decl(segs[i][0]) + "}"); t += segs[i][1]; }
    f.push("100%{" + decl(segs[segs.length - 1][0]) + "}");
    var name = "lk" + (uid++).toString(36);
    css("@keyframes " + name + "{" + f.join("") + "}");
    return name + " " + total + "ms step-end";
  }
  function play(e, anims, count) {
    e.style.animation = anims.map(function (a) { return a + " " + (count || "infinite") + (count ? " forwards" : ""); }).join(",");
  }
  var px = function (n) { return "calc(var(--s) * " + n + "px)"; };

  /* ---------- sprites ---------- */
  // props: (x, y) = bottom-left corner; characters: x = body centre, y = the line the feet stand on
  // (a character's canvas is the union of all its frames, e.g. a raised shovel widens it to one side)
  function sprite(scene, name, x, y, flip) {
    var c = SPR.chars[name] || SPR.props[name];
    if (!c) return null;
    var n = c.frames ? c.frames.length : 1;
    if (c.feet != null) y -= c.h - 1 - c.feet;
    if (c.cx != null) x -= flip ? c.w - 1 - c.cx : c.cx;
    var a = el("div", "la", scene, "--x:" + x + ";--y:" + y + ";--w:" + c.w + ";--h:" + c.h);
    var win = el("div", "lp" + (flip ? " flip" : ""), a);
    var strip = el("i", "", win, "--n:" + n + ";background-image:url(" + c.src + ")");
    return { el: a, strip: strip, c: c, x: x, y: y, n: n };
  }
  function frames(s, segs, count) {          // segs [[frameName, ms]]
    if (!s) return;
    var idx = segs.map(function (g) { var k = s.c.frames ? s.c.frames.indexOf(g[0]) : 0; return [k < 0 ? 0 : k, g[1]]; });
    play(s.strip, [track(idx, function (k) { return "transform:translateX(" + (-k / s.n * 100).toFixed(4) + "%)"; })], count);
  }
  function motion(s, segs, count) {          // segs [[[dx, dy], ms]] in art px, dy up
    if (!s) return;
    s.el.classList.add("lmv");
    play(s.el, [track(segs, function (v) { return "transform:translate(" + px(v[0]) + "," + px(-v[1]) + ")"; })], count);
  }
  function fade(e, segs, count) {            // segs [[0|1, ms]]
    play(e, [track(segs, function (v) { return "opacity:" + v; })], count);
  }
  function has(name) { return !!(SPR.chars[name] || SPR.props[name]); }
  // talking: uneven mouth flaps, a longer closed "word gap" every 4th close, the line always ends with a closed mouth
  var TALK = [130, 170, 110, 190, 140, 120, 180, 150];
  function talk(ms, seed, a, b) {
    var out = [], t = 0, k = seed || 0, n = 0;
    a = a || "talk"; b = b || "idle";
    while (t < ms) {
      var f = k % 2 ? b : a, d = TALK[k % TALK.length];
      if (f === b && ++n % 4 === 0) d += 260;
      d = Math.min(d, ms - t); out.push([f, d]); t += d; k++;
    }
    if (out.length && out[out.length - 1][0] === a) out[out.length - 1][0] = b;
    return out;
  }
  function rng(seed) {                       // xorshift32: the same variety on every load, different per character
    var x = (Math.imul((seed | 0) ^ 0x9e3779b9, 0x85ebca6b) >>> 0) || 1;
    return function () { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) / 4294967296; };
  }
  // standing life: blinks 2-5.5 s apart (first one early), ~15 % double, never triple; each character gets its own
  // loop length (7300 / 8900 / 10700 ms...) so nobody blinks in sync and the loop is hard to spot
  function idleLife(s, total, seed, base) {
    var r = rng(seed), f = base || "idle", bl = blinkOf(s, f) || f, out = [], t = 0, gap = 600 + r() * 2400;
    while (t + gap + 140 + 400 < total) {
      out.push([f, gap | 0], [bl, 140]); t += (gap | 0) + 140;
      if (r() < 0.15 && t + 500 < total) { var g = 160 + r() * 80 | 0; out.push([f, g], [bl, 120]); t += g + 120; }
      gap = 2000 + r() * 3500;
    }
    frames(s, pad(out, total, f));
  }
  // blinking twin of a frame (sprites carry <frame>_blink for every pose: the blink eyes moved with the pose's head)
  function blinkOf(s, f) {
    var b = f === "idle" ? "blink" : f + "_blink";
    return s && s.c.frames && s.c.frames.indexOf(b) >= 0 ? b : null;
  }
  // insert blinks into a whole track every 2-5.5 s (seeded): long holds blink for 130 ms inside, short frames
  // (walk cycle) are swapped for their twin as a whole
  function withBlinks(s, segs, seed) {
    var r = rng(seed), out = [], t = 0, next = 800 + r() * 2200;
    segs.forEach(function (g) {
      var f = g[0], d = g[1], b = blinkOf(s, f);
      if (b && t + d > next) {
        if (d >= 260) { var at = Math.max(60, Math.min(d - 190, (next - t) | 0)); out.push([f, at], [b, 130], [f, d - at - 130]); next = t + at + 2000 + r() * 3500; }
        else { out.push([b, d]); next = t + 2000 + r() * 3500; }
      } else out.push(g);
      t += d;
    });
    return out;
  }
  function repeat(seq, n) { var all = []; for (var i = 0; i < n; i++) all = all.concat(seq); return all; }
  function work(s, seq, reps, seed) { frames(s, withBlinks(s, repeat(seq, reps), seed)); }   // a work loop that blinks

  // a hop: anticipation squash, launch, held apex, fall, landing squash (heights in art px); frame f in the air
  function hop(f) {                          // the squash keeps the expression of the airborne frame (squash_laugh)
    var q = f === "laugh" ? "squash_laugh" : "squash";
    return [[q, 0, 110], [f, 2, 70], [f, 4, 60], [f, 5, 150], [f, 4, 60], [f, 2, 60], [q, 0, 100]];
  }
  function cheer(s, rests, f) {              // hops with a different rest after each: frames and lift share one length
    var fr = [], mv = [];
    rests.forEach(function (rest) {
      hop(f || "jump").concat([["idle", 0, rest]]).forEach(function (h) { fr.push([h[0], h[2]]); mv.push([[0, h[1]], h[2]]); });
    });
    frames(s, fr); motion(s, mv);
  }
  // a fixed-length timeline: events [[at ms, [[value, ms], ...]], ...], gaps filled with `base`
  function timeline(total, base, events) {
    var out = [], t = 0;
    events.sort(function (x, y) { return x[0] - y[0]; }).forEach(function (e) {
      if (e[0] > t) { out.push([base, e[0] - t]); t = e[0]; }
      e[1].forEach(function (g) { var d = Math.min(g[1], total - t); if (d > 0) { out.push([g[0], d]); t += d; } });
    });
    if (t < total) out.push([base, total - t]);
    return out;
  }
  function pad(segs, total, f) {            // fill a track up to `total` ms with frame f
    var t = 0; segs.forEach(function (g) { t += g[1]; });
    if (t < total) segs.push([f, total - t]);
    return segs;
  }
  function loop(a, b, ms, total) {           // a/b alternation, e.g. digging
    if (!(ms > 0) || !(total > 0)) return [[a, Math.max(1, total || 1)]];
    var out = [], t = 0, k = 0;
    while (t < total) { out.push([k % 2 ? b : a, Math.min(ms, total - t)]); t += ms; k++; }
    return out;
  }
  function still(s) { if (s) s.el.style.animation = ""; }   // drop a motion track (e.g. hops) when the job changes

  /* ---------- clips: PixelLab animations packed as "<clip>_<k>" frames, sprite.c.clips = {clip: frame count} ----------
     The clips carry their own life (hair, blinks, expressions, head turns): play them as they are, vary only the rests.
     A sprite without clips (local frames) falls back to its single frame of that name. */
  // per-frame time of each walk clip at the scenes' 20 art px/s: one step (half the 8-frame cycle) = stride, so
  // ms = stride / (4 frames x 20 px/s); the stride is measured on the clip by tools/loader/cloud/pack_cloud.py
  function walkMs(c) { return c && c.stride ? Math.max(90, Math.min(200, Math.round(c.stride / 80 * 1000))) : 120; }
  var CLIP_MS = { idle: 170, walk: 120, talk: 115, laugh: 125, wave: 130, crouch: 140, paint: 135, dig: 125, carry: 150, cheer: 105, read: 180 };
  function seq(s, c, ms) {                   // one pass through clip c
    var n = s && s.c.clips && s.c.clips[c], d = ms || CLIP_MS[c] || 140, out = [];
    if (!n) return [[c, d * 4]];
    for (var k = 0; k < n; k++) out.push([c + "_" + k, d]);
    return out;
  }
  function trimTo(out, t, dur, segs) {       // append segs to out until dur; returns the new time
    segs.forEach(function (g) { var d = Math.min(g[1], dur - t); if (d > 0) { out.push([g[0], d]); t += d; } });
    return t;
  }
  function span(s, c, dur, ms) {             // clip c repeated to fill exactly dur ms
    var out = [], t = 0;
    while (t < dur) t = trimTo(out, t, dur, seq(s, c, ms));
    return out;
  }
  function life(s, dur, seed, c) {           // standing life: the idle clip with irregular holds on its first frame
    var r = rng(seed), base = c || "idle", out = [], t = 0;
    while (t < dur) t = trimTo(out, t, dur, [[base + "_0", 250 + r() * 1400 | 0]].concat(seq(s, base)));
    return out;
  }
  function busy(s, c, dur, seed, rmin, rmax) {   // a work loop: passes of clip c, rests of uneven length in between
    var r = rng(seed), out = [], t = 0;
    while (t < dur) t = trimTo(out, t, dur, seq(s, c).concat([[c + "_0", rmin + r() * (rmax - rmin) | 0]]));
    return out;
  }
  function tl(s, total, seed, events) {      // timeline of clip events; the gaps are standing life
    var out = [], t = 0, k = 0;
    events.sort(function (x, y) { return x[0] - y[0]; }).forEach(function (e) {
      if (e[0] > t) { out = out.concat(life(s, e[0] - t, seed + k++)); t = e[0]; }
      t = trimTo(out, t, total, e[1]);
    });
    if (t < total) out = out.concat(life(s, total - t, seed + k));
    return out;
  }

  /* ---------- scene pieces ---------- */
  function bubble(scene, x, y, w, h, flip) {
    return el("div", "lb" + (flip ? " flip" : ""), scene, "--x:" + x + ";--y:" + y + ";--w:" + w + ";--h:" + h);
  }
  function iconIn(b, name, bw, bh) {
    var c = SPR.props[name]; if (!c) return null;
    var s = sprite(b, name, Math.floor((bw - c.w) / 2), Math.floor((bh - c.h) / 2));
    return s;
  }
  function ground(scene, kind) { return el("div", "lgnd " + kind, scene); }
  // twinkling 1-px stars in the upper part of the scene (deterministic positions, uneven periods)
  function stars(scene, n, top) {
    for (var k = 0; k < n; k++) {
      var x = (k * 53 + 17) % W, y = H - 2 - ((k * 29 + 7) % (top || 18));
      var st = el("i", "lstar", scene, "--x:" + x + ";--y:" + y);
      fade(st, [[1, 900 + (k * 370) % 1700], [0.25, 260], [1, 400 + (k * 130) % 600], [0.25, 180]]);
    }
  }

  /* ---------- variants ---------- */
  var V = {};

  // two neighbours chatting under a street lamp: icons in speech bubbles, laughs, blinks (14 s loop)
  V.chat = function (sc) {
    stars(sc, 9);
    ground(sc, "walk");
    if (has("lamp")) sprite(sc, "lamp", 6, 5);
    if (has("bush")) sprite(sc, "bush", 140, 5);
    if (has("flowers")) sprite(sc, "flowers", 126, 5);
    if (has("bench")) sprite(sc, "bench", 66, 5);
    var A = sprite(sc, "woman", 52, 5), B = sprite(sc, "builder", 110, 5, true);
    if (!A || !B) return V.dots(sc);
    // 14 s loop. A: line 0-2.8 s, B answers after a 0.5 s pause (wave, then 3.3-6.1 s), A laughs first (5.85),
    // B joins (6.35), A again 7.9-10.5, B 11.0-13.6; between lines both live on their own idle rhythm
    var T = 14000, wv = seq(B, "wave"), wvT = wv.reduce(function (t, g) { return t + g[1]; }, 0);
    frames(A, tl(A, T, 101, [[0, span(A, "talk", 2800)], [5850, span(A, "laugh", 1400)], [7900, span(A, "talk", 2600)]]));
    frames(B, tl(B, T, 202, [[3300, wv], [3300 + wvT, span(B, "talk", Math.max(600, 2800 - wvT))], [6350, span(B, "laugh", 1250)], [11000, span(B, "talk", 2600)]]));
    // bubbles follow the lines; two icons per turn, each shown >= 1.3 s
    var bw = 22, bh = 20;
    var bA = bubble(sc, 52 + 6, 5 + 44, bw, bh), bB = bubble(sc, 110 - bw - 6, 5 + 44, bw, bh, true);   // above the heads (~43 px tall)
    fade(bA, [[1, 2800], [0, 5100], [1, 2600], [0, 3500]]);
    fade(bB, [[0, 3300], [1, 2800], [0, 4900], [1, 2600], [0, 400]]);
    var icA = [["house", 0, 1400], ["coin", 1400, 1400], ["coffee", 7900, 1300], ["fish", 9200, 1300]];
    var icB = [["tree", 3300, 1400], ["heart", 4700, 1400], ["star", 11000, 1300], ["train", 12300, 1300]];
    [[bA, icA], [bB, icB]].forEach(function (p) {
      p[1].forEach(function (ic) {
        var s = iconIn(p[0], ic[0], bw, bh); if (!s) return;
        var segs = []; if (ic[1]) segs.push([0, ic[1]]); segs.push([1, ic[2]]); if (ic[1] + ic[2] < T) segs.push([0, T - ic[1] - ic[2]]);
        fade(s.el, segs);
      });
    });
    return {};
  };

  // a work crew builds the world: each boot step gets its own job, finished jobs stay on screen
  V.crew = function (sc) {
    stars(sc, 7, 14);
    var land = el("div", "lland", sc);
    el("div", "lcover", sc);   // the sea; slides away when the coast is drawn
    var mnt = el("div", "lclip mnt", sc), road = el("div", "lroad", sc), town = el("div", "lclip town", sc);
    // the crew stands at the edges facing the middle; the world they build fills the middle (x 32..104)
    var M = [];
    [["s_hill", 56], ["s_mountain", 34], ["s_mountain", 76], ["s_pine", 96]].forEach(function (m) { if (has(m[0])) M.push(sprite(mnt, m[0], m[1], 0)); });
    var tiles = [];
    for (var i = 0; i < 14; i++) tiles.push(el("i", "", road, "--i:" + i));
    var houses = [];
    [["s_house", 36], ["s_tower", 58], ["s_house2", 80]].forEach(function (h) { if (has(h[0])) houses.push(sprite(town, h[0], h[1], 0)); });
    var crate = has("crate") ? sprite(sc, "crate", 58, 9) : null;
    var pops = ["house", "tree", "coin", "star"].filter(has).map(function (n, k) {
      var s = sprite(sc, n, 62 + (k % 2) * 4, 22); s.el.classList.add("lpop"); s.el.style.setProperty("--d", k * 400 + "ms"); return s;
    });
    var Wm = sprite(sc, "woman", 16, 9), Bd = sprite(sc, "builder", 118, 9, true), By = sprite(sc, "boy", 152, 9);   // the boy is drawn facing left
    var dirt = has("dirt") ? sprite(sc, "dirt", 84, 9) : null, stones = null;   // the dirt pile sits where the flipped builder digs
    if (!Wm || !Bd || !By) return V.dots(sc);
    [dirt, stones, crate].forEach(function (s) { if (s) s.el.style.opacity = 0; });
    var done = {};
    var BY_PROGRESS = [[0.15, "coast"], [0.35, "relief"], [0.55, "roads"], [0.75, "kit"], [0.95, "people"]];
    function job(key, i, n) {
      var T = 2400;
      if (STAGES.indexOf(key) < 0 && n) {    // unknown step (a backend boot): play the job matching the progress fraction
        var f = (i + 1) / n, pick = "coast";
        BY_PROGRESS.forEach(function (b) { if (f >= b[0]) pick = b[1]; });
        if (pick !== "coast" && !done.coast) { done.coast = 1; sc.classList.add("st-coast"); }
        if ((pick === "roads" || pick === "kit" || pick === "people") && !done.relief) { done.relief = 1; sc.classList.add("st-relief"); }
        if ((pick === "kit" || pick === "people") && !done.roads) { done.roads = 1; sc.classList.add("st-roads"); }
        key = pick;
      }
      // each job is a clip loop with uneven rests; whoever is not working lives on an own idle rhythm
      switch (key) {
        case "coast": case "smooth":
          frames(Wm, busy(Wm, "paint", 9000, 41, 200, 700)); frames(Bd, life(Bd, 8900, 11)); frames(By, life(By, 10700, 12));
          if (!done.coast) { done.coast = 1; sc.classList.add("st-coast"); }
          break;
        case "relief":
          frames(Bd, busy(Bd, "dig", 9000, 42, 150, 600)); frames(Wm, tl(Wm, 7300, 13, [[200, seq(Wm, "wave")]])); frames(By, life(By, 10700, 14));
          if (dirt) dirt.el.style.opacity = 1;
          if (!done.relief) { done.relief = 1; sc.classList.add("st-relief"); }
          break;
        case "roads":
          frames(By, busy(By, "crouch", 9000, 43, 500, 1200)); frames(Wm, life(Wm, 7300, 15)); frames(Bd, busy(Bd, "dig", 9000, 44, 150, 600));
          if (stones) stones.el.style.opacity = 1;
          if (dirt) dirt.el.style.opacity = 0;
          if (!done.roads) { done.roads = 1; sc.classList.add("st-roads"); }
          break;
        case "kit": case "workers":
          if (crate) crate.el.style.opacity = 1;
          frames(Bd, busy(Bd, "carry", 8000, 45, 300, 900)); frames(By, busy(By, "cheer", 8000, 46, 300, 900));
          frames(Wm, tl(Wm, 7300, 16, [[300, span(Wm, "talk", 1600)], [4100, span(Wm, "talk", 1400)]]));
          sc.classList.add("st-kit");
          break;
        case "people":
          sc.classList.remove("st-kit"); sc.classList.add("st-people");
          [crate, stones, dirt].forEach(function (x) { if (x) x.el.style.opacity = 0; });
          frames(Wm, busy(Wm, "wave", 7300, 47, 200, 700)); frames(Bd, tl(Bd, 8900, 17, [[400, span(Bd, "laugh", 1250)], [2600, seq(Bd, "wave")]]));
          frames(By, busy(By, "cheer", 8000, 48, 300, 800));
          break;
        default:                                // unknown step (e.g. a backend fetch): everyone busy
          frames(Wm, busy(Wm, "paint", 9000, 49, 200, 700)); frames(Bd, busy(Bd, "dig", 9000, 50, 150, 600)); frames(By, busy(By, "crouch", 9000, 51, 500, 1200));
      }
      still(By);
    }
    job("coast");
    return { stage: job };
  };

  // one resident walks across the world: sea, hills, mountains, roads, then the city
  V.walk = function (sc) {
    var BIOME = { coast: "sea", smooth: "sea", relief: "mount", roads: "road", kit: "hills", workers: "hills", people: "city" };
    // near scenery moves with the ground (30 px/s); far scenery (mountains, hills, lighthouse, mills) at half speed and one
    // line further back: parallax gives depth for free
    var SETS = {
      sea: { far: [["s_lighthouse", 14], ["s_mill", 104]], near: [["s_boat", 60], ["birch", 150]] },
      hills: { far: [["s_hill", 0], ["s_hill", 96]], near: [["oak", 58], ["s_pine", 112], ["birch", 148]] },
      mount: { far: [["s_mountain", 4], ["s_mountain", 92]], near: [["s_pine", 60], ["s_pine", 150]] },
      road: { far: [["s_mill2", 120]], near: [["sign", 8], ["cone", 56], ["lamp", 90], ["hydrant", 140]] },
      city: { far: [["s_tower", 40], ["s_tower", 128]], near: [["s_house", 0], ["lamp", 86], ["s_house2", 104], ["mailbox", 152]] }
    };
    var L = 168, belts = {};
    stars(sc, 8, 14);
    var sky = el("div", "lclip sky", sc);
    if (has("s_cloud")) { sprite(sky, "s_cloud", 30, 46).el.classList.add("ldrift"); sprite(sky, "s_cloud", 120, 54).el.classList.add("ldrift", "slow"); }
    Object.keys(SETS).forEach(function (k) {
      var pair = [];
      ["far", "near"].forEach(function (depth) {
        var b = el("div", "lbelt " + depth, sc);
        [0, L].forEach(function (off) { SETS[k][depth].forEach(function (p) { if (has(p[0])) sprite(b, p[0], p[1] + off, depth === "far" ? 2 : 0); }); });
        pair.push(b);
      });
      belts[k] = pair;
    });
    el("div", "lgnd walk scroll", sc);
    var who = has("boy") ? "boy" : "woman";
    var clips = SPR.chars[who] && SPR.chars[who].clips;
    var P = sprite(sc, who, 76, 5, !clips && who === "boy");   // the walk clip faces right; old local frames faced left
    if (!P) return V.dots(sc);
    // ground moves 20 art px/s; the walk clip's frame time comes from its stride (walkMs) so the feet don't slide
    if (clips && clips.walk) frames(P, seq(P, "walk", walkMs(P.c)));
    else {
      frames(P, withBlinks(P, repeat([["walkA", 170], ["idle", 170], ["walkB", 170], ["idle", 170]], 12), 51));
      motion(P, [[[0, 0], 170], [[0, 1], 170], [[0, 0], 170], [[0, 1], 170]]);
    }
    var ORDER = ["sea", "mount", "road", "hills", "city"];
    function stage(key, i, n) {             // unknown steps (a backend boot): scenery follows the progress fraction
      var cur = BIOME[key] || (n ? ORDER[Math.min(ORDER.length - 1, Math.floor((i + 1) / n * ORDER.length - 1e-9))] : "hills");
      Object.keys(belts).forEach(function (k) { belts[k].forEach(function (b) { b.classList.toggle("on", k === cur); }); });
    }
    stage("coast");
    return { stage: stage };
  };

  // residents cross the street at 20 art px/s (50 ms per px = 3 frames at 60 Hz) with their side-view walk clips;
  // lanes start at uneven offsets (no conveyor belt); the old man reads his paper by the bench
  V.parade = function (sc) {
    stars(sc, 8);
    ground(sc, "walk");
    [["lamp", 22], ["bench", 70], ["birch", 132]].forEach(function (p) { if (has(p[0])) sprite(sc, p[0], p[1], 5); });
    var reader = sprite(sc, "oldman", 58, 5);
    if (reader) {                            // holds the open paper: the last two frames of the read clip, uneven holds
      var rn = reader.c.clips && reader.c.clips.read, rr = rng(31), rs = [];
      if (rn) { for (var q = 0; q < 6; q++) rs.push(["read_" + (rn - 1), 1100 + rr() * 1900 | 0], ["read_" + (rn - 2), 260 + rr() * 200 | 0]); frames(reader, rs); }
      else frames(reader, life(reader, 9700, 31));
    }
    var who = [["woman", 0], ["builder", -4.6], ["boy", -8.3]];
    var n = 0;
    who.forEach(function (w, k) {
      if (!has(w[0])) return;
      var c = SPR.chars[w[0]], lane = el("div", "lwalker", sc, "--d:" + w[1] + "s;--rx:" + (100 + k * 26));
      var s = sprite(lane, w[0], 0, 5, !c.clips && w[0] === "boy");
      if (c.clips && c.clips.walk) frames(s, seq(s, "walk", walkMs(c)));
      else {
        frames(s, withBlinks(s, repeat([["walkA", 240], ["idle", 240], ["walkB", 240], ["idle", 240]], 10), 60 + k));
        motion(s, [[[0, 0], 240], [[0, 1], 240], [[0, 0], 240], [[0, 1], 240]]);
      }
      n++;
    });
    if (!n) return V.dots(sc);
    return {};
  };

  // one island grows a layer per boot step: sea -> beach -> meadows -> mountains and forest -> roads -> town
  V.island = function (sc) {
    var c = SPR.chars.island;
    if (!c) return V.crew(sc);
    stars(sc, 8, 12);
    var FR = { coast: "coast", smooth: "smooth", relief: "relief", roads: "roads", kit: "roads", workers: "roads", people: "idle" };
    var I = sprite(sc, "island", W / 2, 1);   // characters (the island is one) are placed by their centre
    var A = sprite(sc, "woman", 16, 3), B = sprite(sc, "boy", W - 16, 3);
    if (A) frames(A, life(A, 7300, 21)); if (B) frames(B, life(B, 8900, 22));
    var cur = null;
    var LAYERS = ["coast", "smooth", "relief", "roads", "idle"];
    function stage(key, i, n) {             // unknown steps (a backend boot): the island grows with the progress fraction
      var f = FR[key] || (n ? LAYERS[Math.min(LAYERS.length - 1, Math.floor((i + 1) / n * LAYERS.length - 1e-9))] : "roads");
      if (c.frames.indexOf(f) < 0) f = "idle";
      if (f !== cur) {                       // new layer: flash the previous frame once, then settle with a 1 px bounce
        frames(I, cur ? [[cur, 90], [f, 90], [cur, 90], [f, 1]] : [[f, 1]], 1);
        motion(I, [[[0, 1], 120], [[0, 0], 1]], 1);
        cur = f;
      }
      if (key === "people") {
        if (A) frames(A, tl(A, 7300, 23, [[0, span(A, "wave", 2000)], [4800, span(A, "laugh", 1100)]]));
        if (B) frames(B, busy(B, "cheer", 8000, 24, 300, 800));
      }
    }
    frames(I, [["sea", 1]], 1); cur = "sea";
    stage("coast");
    return { stage: stage };
  };

  // fallback: three blinking squares (no sprites, or the scene failed)
  V.dots = function (sc) {
    sc.classList.add("ldots");
    for (var i = 0; i < 3; i++) el("i", "", sc);
    return {};
  };

  /* ---------- mounting ---------- */
  function scene(root, variant) {
    var v = V[variant] ? variant : DEFAULT;
    root.classList.add("ldr-scene", "v-" + v);
    var api = {};
    try { api = (SPR ? V[v] : V.dots)(root) || {}; } catch (e) { console.warn("loader scene failed", e); root.textContent = ""; V.dots(root); }
    return { stage: function (k, i, n) { try { if (api.stage) api.stage(k, i, n); } catch (e) { console.warn(e); } } };
  }

  var q = /[?&]loader=([a-z]+)/.exec(location.search);
  var root = document.getElementById("loading");
  var main = null;
  if (root) {
    var host = root.querySelector(".ldr-stage");
    if (host) main = scene(host, q ? q[1] : DEFAULT);
  }
  window.LOADER = {
    stage: function (key, text, i, n) {
      if (!root) return;
      var msg = document.getElementById("loadMsg"); if (msg && text) msg.textContent = text;
      var bar = root.querySelector(".ldr-bar");
      if (bar && n) {
        bar.style.setProperty("--p", Math.min(1, (i + 1) / n));
        bar.setAttribute("aria-valuenow", Math.round(Math.min(1, (i + 1) / n) * 100));
      }
      root.setAttribute("data-stage", key);
      if (main) main.stage(key, i, n);
    },
    done: function () {
      if (!root) return;
      root.classList.add("out");
      root.setAttribute("aria-busy", "false");
      setTimeout(function () { if (root.parentNode) root.parentNode.removeChild(root); var st = document.getElementById("ldr-kf"); if (st) st.remove(); }, 420);
    },
    scene: scene,
    STAGES: STAGES
  };
})();
