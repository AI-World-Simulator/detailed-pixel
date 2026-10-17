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
    // 14 s loop. A: line 0-2.8 s, B answers after a 0.5 s pause (3.3-6.1 s), A laughs first (5.85), B joins (6.35),
    // A again 7.9-10.5, B 11.0-13.6; listeners nod or blink after the other's pauses, never in sync
    var T = 14000;
    var hopA = hop("laugh"), hopB = hop("laugh");
    var frA = timeline(T, "idle", [[0, talk(2800, 0)], [4700, [["blink", 140]]], [5850, hopA.map(function (h) { return [h[0], h[2]]; }).concat([["laugh", 700]])],
      [7900, talk(2600, 3)], [11300, [["blink", 140]]], [13350, [["blink", 120]]]]);
    var mvA = timeline(T, [0, 0], [[5850, hopA.map(function (h) { return [[0, h[1]], h[2]]; })]]);
    var frB = timeline(T, "idle", [[1900, [["blink", 140]]], [3150, [["blink", 120]]], [3300, [["wave", 600]]], [3900, talk(2200, 2)],
      [6350, hopB.map(function (h) { return [h[0], h[2]]; }).concat([["laugh", 600]])], [8600, [["blink", 140]]], [10850, [["blink", 140]]], [11000, talk(2600, 5)]]);
    var mvB = timeline(T, [0, 0], [[1300, [[[0, -1], 160]]], [6350, hopB.map(function (h) { return [[0, h[1]], h[2]]; })], [9600, [[[0, -1], 160]]]]);
    frames(A, frA); motion(A, mvA); frames(B, frB); motion(B, mvB);
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
      // work loops have uneven timing (long wind-up, short strike, hold); idle residents live on their own blink loops
      var DIG = [["shovelUp", 460], ["shovelDown", 80], ["shovelDown", 300], ["idle", 240], ["shovelUp", 520], ["shovelDown", 80], ["shovelDown", 260], ["idle", 300]];
      var PAINT = [["paint1", 380], ["paint2", 340], ["paint1", 420], ["paint2", 360], ["paint1", 400], ["paint2", 320]];
      var PAVE = [["idle", 300], ["crouch", 650], ["idle", 520], ["idle", 260], ["crouch", 700], ["idle", 480]];
      switch (key) {
        case "coast": case "smooth":
          work(Wm, PAINT, 3, 41); idleLife(Bd, 8900, 11); idleLife(By, 10700, 12); still(By);
          if (!done.coast) { done.coast = 1; sc.classList.add("st-coast"); }
          break;
        case "relief":
          work(Bd, DIG, 3, 42); frames(Wm, timeline(7300, "idle", [[200, [["wave", 380], ["idle", 300], ["wave", 380]]], [2600, [["blink", 140]]], [5900, [["blink", 140]]]]));
          idleLife(By, 10700, 13); still(By);
          if (dirt) dirt.el.style.opacity = 1;
          if (!done.relief) { done.relief = 1; sc.classList.add("st-relief"); }
          break;
        case "roads":
          work(By, PAVE, 3, 43); still(By); idleLife(Wm, 7300, 14); work(Bd, DIG, 3, 44);
          if (stones) stones.el.style.opacity = 1;
          if (dirt) dirt.el.style.opacity = 0;
          if (!done.roads) { done.roads = 1; sc.classList.add("st-roads"); }
          break;
        case "kit": case "workers":
          if (crate) crate.el.style.opacity = 1;
          frames(Bd, timeline(8900, "carry", [[1300, [["carry_blink", 130]]], [2100, [["idle", 500], ["blink", 140], ["idle", 900]]], [4700, [["carry_blink", 130]]], [6400, [["idle", 400], ["blink", 140], ["idle", 600]]]]));
          cheer(By, [380, 620, 450]);
          frames(Wm, timeline(7300, "idle", [[300, talk(1600, 1)], [2600, [["blink", 140]]], [4100, talk(1400, 4)], [6200, [["blink", 140]]]]));
          sc.classList.add("st-kit");
          break;
        case "people":
          sc.classList.remove("st-kit"); sc.classList.add("st-people");
          [crate, stones, dirt].forEach(function (x) { if (x) x.el.style.opacity = 0; });
          frames(Wm, timeline(7300, "idle", [[0, [["wave", 380], ["idle", 320], ["wave", 380], ["idle", 300], ["wave", 400]]], [3400, [["blink", 140]]], [5200, [["laugh", 900]]]]));
          frames(Bd, timeline(8900, "idle", [[400, [["laugh", 900]]], [1700, [["blink", 140]]], [2600, [["wave", 380], ["idle", 300], ["wave", 380]]], [6200, [["blink", 140]]]]));
          cheer(By, [300, 520, 380, 700]);
          break;
        default:                                // unknown step (e.g. a backend fetch): everyone busy
          work(Wm, PAINT, 3, 45); work(Bd, DIG, 3, 46); work(By, PAVE, 3, 47); still(By);
      }
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
    var P = sprite(sc, who, 76, 5, who === "boy");   // walk to the right: the boy is drawn facing left
    if (!P) return V.dots(sc);
    // 30 art px/s ground (33.3 ms per px = 2 frames at 60 Hz) and 170 ms frames: 10.2 px per step = the boy's stride
    frames(P, withBlinks(P, repeat([["walkA", 170], ["idle", 170], ["walkB", 170], ["idle", 170]], 12), 51));
    motion(P, [[[0, 0], 170], [[0, 1], 170], [[0, 0], 170], [[0, 1], 170]]);
    var ORDER = ["sea", "mount", "road", "hills", "city"];
    function stage(key, i, n) {             // unknown steps (a backend boot): scenery follows the progress fraction
      var cur = BIOME[key] || (n ? ORDER[Math.min(ORDER.length - 1, Math.floor((i + 1) / n * ORDER.length - 1e-9))] : "hills");
      Object.keys(belts).forEach(function (k) { belts[k].forEach(function (b) { b.classList.toggle("on", k === cur); }); });
    }
    stage("coast");
    return { stage: stage };
  };

  // residents cross the street at 20 art px/s (50 ms per px = 3 frames at 60 Hz). Each walker's frame time comes from
  // its own stride (speed = stride x steps/s, so feet don't slide); lanes start at uneven offsets (no conveyor belt);
  // the old man has no walk frames, so he doesn't glide past: he stands by the bench reading
  V.parade = function (sc) {
    stars(sc, 8);
    ground(sc, "walk");
    [["lamp", 22], ["bench", 70], ["birch", 132]].forEach(function (p) { if (has(p[0])) sprite(sc, p[0], p[1], 5); });
    var reader = sprite(sc, "oldman", 58, 5);
    if (reader) idleLife(reader, 9700, 31, "read");
    var SPEED = 20, STRIDE = { woman: 9.25, builder: 10, boy: 10.25 };   // stride: art px per step, measured on the frames
    var who = [["woman", false, 0], ["builder", false, -4.6], ["boy", true, -8.3]];
    var n = 0;
    who.forEach(function (w, k) {
      if (!has(w[0])) return;
      var lane = el("div", "lwalker", sc, "--d:" + w[2] + "s;--rx:" + (100 + k * 26));
      var s = sprite(lane, w[0], 0, 5, w[1]);
      var ms = Math.round(STRIDE[w[0]] / (2 * SPEED) * 1000);             // two frames per step
      frames(s, withBlinks(s, repeat([["walkA", ms], ["idle", ms], ["walkB", ms], ["idle", ms]], 10), 60 + k));
      motion(s, [[[0, 0], ms], [[0, 1], ms], [[0, 0], ms], [[0, 1], ms]]);
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
    if (A) idleLife(A, 7300, 21); if (B) idleLife(B, 8900, 22);
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
        if (A) frames(A, timeline(7300, "idle", [[0, [["wave", 380], ["idle", 320], ["wave", 380], ["idle", 300], ["wave", 400]]], [3200, [["blink", 140]]], [4800, [["laugh", 900]]]]));
        if (B) cheer(B, [320, 560, 400, 680]);
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
