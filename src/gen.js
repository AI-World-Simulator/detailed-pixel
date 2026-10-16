(function (root) {
"use strict";
/* Procedural pixel-art world generator. Runs both in Web Workers and on the main thread.
   World coordinates: X,Y in [0,1] (Web Mercator), mx,my = merc meters (X*C, Y*C). */
var C = 40075016.686, TS = 128;
var MASK = null, MS = 0, BLUR = null, BS = 0, CD = null, CM = null, CI = null, CS = 0;
var CITIES = [], ROADS = [], TC = [], TR = [];

function hh(x, y, s) {
  var h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul((y | 0) + 0x3c6ef372, 0x165667b1) ^ Math.imul((s | 0) + 0x7f4a7c15, 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

var P = new Uint8Array(512);
(function () {
  var p = new Uint8Array(256), s = 1337, i;
  for (i = 0; i < 256; i++) p[i] = i;
  for (i = 255; i > 0; i--) { s = (Math.imul(s, 1103515245) + 12345) | 0; var j = ((s >>> 16) % (i + 1)); var t = p[i]; p[i] = p[j]; p[j] = t; }
  for (i = 0; i < 512; i++) P[i] = p[i & 255];
})();
var GX = [1, -1, 1, -1, 1.41, -1.41, 0, 0], GY = [1, 1, -1, -1, 0, 0, 1.41, -1.41];
function noise(x, y) {
  var xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  var X = xi & 255, Y = yi & 255;
  var a = P[P[X] + Y] & 7, b = P[P[X + 1] + Y] & 7, c = P[P[X] + Y + 1] & 7, d = P[P[X + 1] + Y + 1] & 7;
  var u = xf * xf * xf * (xf * (xf * 6 - 15) + 10), v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
  var n00 = GX[a] * xf + GY[a] * yf, n10 = GX[b] * (xf - 1) + GY[b] * yf;
  var n01 = GX[c] * xf + GY[c] * (yf - 1), n11 = GX[d] * (xf - 1) + GY[d] * (yf - 1);
  var x1 = n00 + u * (n10 - n00), x2 = n01 + u * (n11 - n01);
  return x1 + v * (x2 - x1);
}
function fbm(x, y, o) {
  var s = 0, a = 1, t = 0, f = 1;
  for (var i = 0; i < o; i++) { s += a * noise(x * f + i * 19.19, y * f - i * 7.73); t += a; a *= 0.5; f *= 2; }
  return s / t;
}
function ridged(x, y, o) {
  var s = 0, a = 1, t = 0, f = 1;
  for (var i = 0; i < o; i++) { var n = 1 - Math.abs(noise(x * f + i * 5.3, y * f + i * 9.1)); s += a * n * n; t += a; a *= 0.5; f *= 2.03; }
  return s / t;
}
/* LOD fbm: octaves finer than ~2.5 px fade to their mean so far zoom levels stay calm */
function lfbm(x, y, l, mpp, o) {
  var s = 0, a = 1, t = 0, f = 1;
  for (var i = 0; i < o; i++) {
    var fade = l / f / (mpp * 2.5);
    if (fade > 1) fade = 1;
    if (fade > 0.03) s += a * fade * noise(x * f + i * 19.19, y * f - i * 7.73);
    t += a; a *= 0.5; f *= 2;
  }
  return s / t;
}
function lridged(x, y, l, mpp, o) {
  var s = 0, a = 1, t = 0, f = 1;
  for (var i = 0; i < o; i++) {
    var fade = l / f / (mpp * 2.5);
    if (fade > 1) fade = 1;
    var n = 0.6;
    if (fade > 0.03) { var q = 1 - Math.abs(noise(x * f + i * 5.3, y * f + i * 9.1)); n = fade * q * q + (1 - fade) * 0.6; }
    s += a * n; t += a; a *= 0.5; f *= 2.03;
  }
  return s / t;
}
function oct(l, mpp, max) { var o = Math.ceil(Math.log2(l / (1.6 * mpp))); return o < 1 ? 1 : o > max ? max : o; }
var BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(function (v) { return v / 16; });

function sh(c, f) {
  var r = ((c >> 16) & 255) * f, g = ((c >> 8) & 255) * f, b = (c & 255) * f;
  return ((r > 255 ? 255 : r) << 16) | ((g > 255 ? 255 : g) << 8) | (b > 255 ? 255 : b);
}
function mix(a, b, t) {
  var r = ((a >> 16) & 255) * (1 - t) + ((b >> 16) & 255) * t;
  var g = ((a >> 8) & 255) * (1 - t) + ((b >> 8) & 255) * t;
  var bb = (a & 255) * (1 - t) + (b & 255) * t;
  return (r << 16) | (g << 8) | bb;
}
function samp(A, S, X, Y) {
  var fx = X * S - 0.5, fy = Y * S - 0.5;
  var x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
  var x1 = x0 + 1, y1 = y0 + 1;
  x0 = ((x0 % S) + S) % S; x1 = ((x1 % S) + S) % S;
  if (y0 < 0) y0 = 0; else if (y0 >= S) y0 = S - 1;
  if (y1 < 0) y1 = 0; else if (y1 >= S) y1 = S - 1;
  var r0 = y0 * S, r1 = y1 * S;
  var a = A[r0 + x0], b = A[r0 + x1], c = A[r1 + x0], d = A[r1 + x1];
  return ((a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty) / 255;
}

/* ---------- coastline ---------- */
function coastS(X, Y, mx, my, mpp) {
  var wx = noise(mx / 70000 + 3.1, my / 70000 - 7.7) * 7000 + noise(mx / 23000, my / 23000 + 5) * 2500;
  var wy = noise(mx / 70000 - 9.4, my / 70000 + 1.3) * 7000 + noise(mx / 23000 + 8, my / 23000) * 2500;
  var v = samp(MASK, MS, X + wx / C, Y + wy / C);
  if (v <= 0.002) return -0.6;
  if (v >= 0.998) return 0.6;
  return v - 0.5 + 0.6 * fbm(mx / 9000, my / 9000, oct(9000, mpp, 13));
}

/* ---------- districts (voronoi) ---------- */
var Dgx = 0, Dgy = 0, Dsx = 0, Dsy = 0, Db = 0, Dg2x = 0, Dg2y = 0;
function siteX(gx, gy, D, seed) { return (gx + 0.15 + 0.7 * hh(gx, gy, seed)) * D; }
function siteY(gx, gy, D, seed) { return (gy + 0.15 + 0.7 * hh(gx, gy, seed + 1)) * D; }
function district(mx, my, D, seed) {
  var cx = Math.floor(mx / D), cy = Math.floor(my / D);
  var b1 = 1e30, b2 = 1e30, s1x = 0, s1y = 0, s2x = 0, s2y = 0, g1x = 0, g1y = 0, g2x = 0, g2y = 0;
  for (var j = -1; j <= 1; j++) for (var i = -1; i <= 1; i++) {
    var gx = cx + i, gy = cy + j;
    var sx = (gx + 0.15 + 0.7 * hh(gx, gy, seed)) * D, sy = (gy + 0.15 + 0.7 * hh(gx, gy, seed + 1)) * D;
    var dx = mx - sx, dy = my - sy, d = dx * dx + dy * dy;
    if (d < b1) { b2 = b1; s2x = s1x; s2y = s1y; g2x = g1x; g2y = g1y; b1 = d; s1x = sx; s1y = sy; g1x = gx; g1y = gy; }
    else if (d < b2) { b2 = d; s2x = sx; s2y = sy; g2x = gx; g2y = gy; }
  }
  var ddx = s2x - s1x, ddy = s2y - s1y;
  Db = (b2 - b1) / (2 * Math.sqrt(ddx * ddx + ddy * ddy));
  Dgx = g1x; Dgy = g1y; Dsx = s1x; Dsy = s1y; Dg2x = g2x; Dg2y = g2y;
}

/* ---------- compact stylised cities ----------
   A city is a small regular grid of blocks around its centre. Its radius R is far smaller than the real city,
   so a whole capital fits on one screen, while blocks, streets, cars and people keep real proportions.
   Local frame: metres, x east, y south. Block (bi,bj) is centred at (bi*PX, bj*PY); street line i runs at x=(i-0.5)*PX. */
var S_EU = 0, S_RU = 1, S_US = 2, S_AS = 3, S_ME = 4, S_LA = 5;
var T_PERIM = 1, T_HOUSES = 2, T_SLAB = 3, T_TOWERS = 4, T_PARK = 5, T_PLAZA = 6, T_SCHOOL = 7, T_PARKING = 8, T_LM = 9;
function mod(a, m) { return ((a % m) + m) % m; }

/* landmark placements: first block (i,j) relative to the centre block, span si x sj blocks, builder f, label n */
var LMP = {
  moscow: [{ i: -2, j: -1, si: 2, sj: 2, f: "kremlin", n: "Кремль" }, { i: 0, j: -1, si: 1, sj: 2, f: "redsquare", n: "Красная площадь" },
    { i: 1, j: 1, si: 1, sj: 1, f: "theatre", n: "Большой театр" }, { i: -2, j: 1, si: 2, sj: 1, f: "square", n: "Александровский сад" }],
  spb: [{ i: -1, j: -1, si: 2, sj: 1, f: "winter", n: "Зимний дворец" }, { i: -1, j: 0, si: 2, sj: 1, f: "palacesq", n: "Дворцовая площадь" },
    { i: 2, j: 0, si: 1, sj: 1, f: "isaac", n: "Исаакиевский собор" }, { i: 1, j: 1, si: 1, sj: 1, f: "square" }],
  paris: [{ i: -2, j: -2, si: 1, sj: 3, f: "eiffel", n: "Эйфелева башня" }, { i: 1, j: -1, si: 1, sj: 1, f: "arc", n: "Триумфальная арка" },
    { i: 2, j: 1, si: 1, sj: 1, f: "notre", n: "Нотр-Дам" }, { i: 0, j: 1, si: 1, sj: 1, f: "square" }],
  london: [{ i: -1, j: 0, si: 2, sj: 1, f: "parliament", n: "Биг-Бен" }, { i: -1, j: -2, si: 2, sj: 2, f: "bigpark", n: "Гайд-парк" }],
  rome: [{ i: 0, j: 0, si: 1, sj: 1, f: "colosseum", n: "Колизей" }, { i: -3, j: -1, si: 1, sj: 1, f: "stpeter", n: "Собор Святого Петра" }, { i: 1, j: 1, si: 1, sj: 1, f: "square" }],
  nyc: [{ i: -1, j: -6, si: 2, sj: 4, f: "bigpark", n: "Центральный парк" }, { i: 1, j: 0, si: 1, sj: 1, f: "empire", n: "Эмпайр-стейт-билдинг" }],
  chisinau: [{ i: 0, j: 0, si: 1, sj: 1, f: "cathedral_md", n: "Кафедральный собор" }, { i: 1, j: 0, si: 1, sj: 1, f: "arcmd", n: "Арка Победы" },
    { i: 0, j: 1, si: 2, sj: 1, f: "square", n: "Парк Штефана чел Маре" }, { i: -2, j: -1, si: 1, sj: 1, f: "parl_md", n: "Парламент" }],
  kyiv: [{ i: 0, j: 0, si: 1, sj: 1, f: "sophia", n: "Софийский собор" }, { i: 1, j: 1, si: 1, sj: 1, f: "square" }],
  cairo: [{ i: -24, j: 2, si: 3, sj: 3, f: "pyramids", n: "Пирамиды Гизы", out: 1 }, { i: 0, j: 0, si: 1, sj: 1, f: "mosque" }],
  istanbul: [{ i: 0, j: 0, si: 1, sj: 1, f: "bluemosque", n: "Голубая мечеть" }, { i: 1, j: -1, si: 1, sj: 1, f: "hagia", n: "Айя-София" }, { i: 1, j: 0, si: 1, sj: 1, f: "square" }],
  beijing: [{ i: -1, j: -2, si: 2, sj: 3, f: "forbidden", n: "Запретный город" }],
  tokyo: [{ i: 1, j: 1, si: 1, sj: 1, f: "tokyotower", n: "Токийская башня" }, { i: -1, j: 0, si: 1, sj: 1, f: "pagoda", n: "Храм Сэнсо-дзи" }],
  dubai: [{ i: 0, j: 0, si: 1, sj: 1, f: "burj", n: "Бурдж-Халифа" }],
  berlin: [{ i: 0, j: 0, si: 1, sj: 1, f: "brandenburg", n: "Бранденбургские ворота" }, { i: 0, j: -1, si: 1, sj: 1, f: "reichstag", n: "Рейхстаг" }, { i: -2, j: 0, si: 2, sj: 2, f: "bigpark", n: "Тиргартен" }],
  barcelona: [{ i: 0, j: 0, si: 1, sj: 1, f: "sagrada", n: "Саграда Фамилия" }, { i: -1, j: 1, si: 1, sj: 1, f: "square" }],
  washington: [{ i: -1, j: -1, si: 2, sj: 1, f: "capitol", n: "Капитолий" }, { i: -5, j: -1, si: 4, sj: 1, f: "mall", n: "Монумент Вашингтона" }],
  rio: [{ i: 2, j: 1, si: 2, sj: 2, f: "stadium", n: "Маракана" }, { i: 0, j: 0, si: 1, sj: 1, f: "cathedral" }],
  delhi: [{ i: -1, j: 0, si: 3, sj: 1, f: "indiagate", n: "Ворота Индии" }, { i: 1, j: -1, si: 1, sj: 1, f: "mosque" }],
  athens: [{ i: -1, j: -1, si: 2, sj: 2, f: "acropolis", n: "Акрополь" }],
  gen_eu: [{ i: 0, j: 0, si: 1, sj: 1, f: "cathedral" }, { i: 1, j: 1, si: 1, sj: 1, f: "square" }],
  gen_ru: [{ i: 0, j: 0, si: 1, sj: 1, f: "sobor" }, { i: 1, j: 1, si: 1, sj: 1, f: "square" }],
  gen_us: [{ i: 0, j: 0, si: 1, sj: 1, f: "cityhall" }, { i: 1, j: 1, si: 1, sj: 1, f: "square" }],
  gen_as: [{ i: 0, j: 0, si: 1, sj: 1, f: "pagoda" }, { i: 1, j: 1, si: 1, sj: 1, f: "square" }],
  gen_me: [{ i: 0, j: 0, si: 1, sj: 1, f: "mosque" }, { i: 1, j: 1, si: 1, sj: 1, f: "square" }],
  town: [{ i: 0, j: 0, si: 1, sj: 1, f: "church" }]
};
var GEN_LM = ["gen_eu", "gen_ru", "gen_us", "gen_as", "gen_me", "gen_eu"];
/* rivers through cities, in the city frame rotated by ang: centre line v = o + a*sin(2*pi*u/wl), width w (metres) */
var RIV = { moscow: { o: 250, a: 55, wl: 1300, w: 75, ang: 0.12 }, spb: { o: -265, a: 30, wl: 2000, w: 130, ang: -0.05 }, paris: { o: -340, a: 60, wl: 1500, w: 60, ang: 0.35 },
  london: { o: 190, a: 50, wl: 1400, w: 85, ang: -0.1 }, rome: { o: 200, a: 40, wl: 1100, w: 55, ang: 1.5708 }, berlin: { o: -235, a: 40, wl: 1200, w: 45, ang: 0.2 },
  kyiv: { o: -430, a: 60, wl: 1800, w: 200, ang: 1.5708 }, cairo: { o: 330, a: 40, wl: 2200, w: 170, ang: 1.5708 }, chisinau: { o: 300, a: 40, wl: 900, w: 18, ang: -0.4 } };

function cityPrep(c) {
  var s = c.seed | 0;
  c.k = kAt(c.my);
  c.R = 650 * Math.pow(Math.max(c.pop, 0.004), 0.42);
  c.PX = (c.sty === S_US ? 128 : c.sty === S_AS ? 112 : 104) + 22 * hh(s, 1, 1);
  c.PY = (c.sty === S_US ? 90 : 84) + 20 * hh(s, 2, 1);
  c.me = 3 + ((hh(s, 3, 1) * 2) | 0);
  c.bc = new Map(); c.lo = new Map(); c.lmb = new Map(); c.LX = new Float64Array(129).fill(NaN); c.LY = new Float64Array(129).fill(NaN); c.maxH = c.pop > 2 ? 90 : 40;
  var list = LMP[c.lm] || (c.pop < 0.12 ? (c.pop > 0.015 ? LMP.town : []) : LMP[GEN_LM[c.sty]]);
  c.lms = [];
  for (var q = 0; q < list.length; q++) {
    var P = list[q], o = { i: P.i, j: P.j, si: P.si, sj: P.sj, f: P.f, n: P.n || "", out: P.out || 0, id: q + 1, lo: null, c: c };
    c.lms.push(o);
    for (var a = 0; a < P.si; a++) for (var b = 0; b < P.sj; b++) c.lmb.set((P.i + a) * 4096 + (P.j + b), o);
    if (LM_H[P.f]) c.maxH = Math.max(c.maxH, LM_H[P.f]);
    o.cc = LMC[LMG[P.f] || "pave"];
    if (Math.hypot((P.i + P.si / 2) * c.PX, (P.j + P.sj / 2) * c.PY) > 1.3 * c.R) c.lmFar = true;
  }
  if (c.sty === S_US || c.sty === S_AS || c.sty === S_ME) c.maxH = Math.max(c.maxH, c.pop > 5 ? 200 : c.pop > 2 ? 120 : 50);
  c.ext = c.R * 1.6;
  var rv = RIV[c.lm];
  if (!rv && !c.lm && c.pop > 1.2 && hh(s, 9, 2) < 0.55) { var sg = hh(s, 10, 2) < 0.5 ? -1 : 1; rv = { o: sg * (260 + 160 * hh(s, 11, 2)), a: 30 + 40 * hh(s, 12, 2), wl: 900 + 900 * hh(s, 13, 2), w: 40 + 60 * hh(s, 14, 2), ang: (hh(s, 15, 2) - 0.5) * 1.2 }; }
  if (rv) { c.rv = rv; c.rca = Math.cos(rv.ang); c.rsa = Math.sin(rv.ang); c.rph = hh(s, 16, 2) * 6.283; }
  if (typeof SCHEMAS !== "undefined" && SCHEMAS[c.lm]) sgPrep(c);
  return c;
}
var LM_H = { topkapi: 30, galata: 65, maiden: 32, wtc: 290, chrysler: 230, liberty: 60, bbtower: 45, timessq: 75, montparnasse: 140, invalides: 70, pantheon: 65, christ: 75, mcity: 200, stalinhr: 150, mgu: 245, ostankino: 300, eiffel: 240, tokyotower: 210, burj: 470, empire: 290, sagrada: 140, mall: 165, isaac: 80, kremlin: 70, parliament: 100, stpeter: 75 };

function riverD(c, x, y) { // distance from the city river bank (negative = in water)
  var r = c.rv, u = x * c.rca + y * c.rsa, v = -x * c.rsa + y * c.rca;
  return Math.abs(v - r.o - r.a * Math.sin(u / r.wl * 6.2832 + c.rph)) - r.w / 2;
}
function dryAt(c, x, y) {
  if (c.rv && riverD(c, x, y) < 6) return false;
  return !wetPt(c, x, y, 0);
}
function wetPt(c, x, y, pad) { // coast or inland water at a city-local point
  var mx = c.mx + x / c.k, my = c.my + y / c.k, X = mx / C, Y = my / C;
  if (coastS(X, Y, mx, my, 2) < 0.03) return true;
  var lat = Math.acos(Math.min(1, c.k)) * 57.29578, ws = WS;
  WS = wsOf(c, Math.sqrt(x * x + y * y));
  var w = WS > 0.01 && waterLand(mx, my, c.k, 1, 2, samp(CD, CS, X, Y), samp(CM, CS, X, Y), lat);
  WS = ws;
  return !!w;
}
function btype(c, dn, h) {
  var sty = c.sty;
  if (c.pop < 0.12) return dn < 0.45 && h < 0.35 ? T_PERIM : h > 0.95 ? T_PARK : T_HOUSES;
  if (dn < 0.42) {
    if (h < 0.06) return T_PARK;
    if (h < 0.1) return T_PLAZA;
    if ((sty === S_US || sty === S_AS || sty === S_ME) && c.pop > 1.5 && h < 0.1 + (0.42 - dn) * (sty === S_US ? 1.5 : 1)) return T_TOWERS;
    return T_PERIM;
  }
  if (dn < 0.78) {
    if (h < 0.07) return T_PARK;
    if (h < 0.11) return T_SCHOOL;
    if (h < 0.14) return T_PARKING;
    if (h < (sty === S_RU || sty === S_AS ? 0.48 : sty === S_US ? 0.2 : 0.28)) return T_SLAB;
    if (h < (sty === S_US ? 0.45 : 0.78)) return T_PERIM;
    return T_HOUSES;
  }
  if (h < 0.05) return T_PARK;
  if (h < (sty === S_US ? 0.08 : 0.16)) return T_PERIM;
  return T_HOUSES;
}
function cblock(c, bi, bj) {
  var key = bi * 4096 + bj, b = c.bc.get(key);
  if (b !== undefined) return b;
  b = null;
  var x = (lineX(c, bi) + lineX(c, bi + 1)) / 2, y = (lineY(c, bj) + lineY(c, bj + 1)) / 2, L = c.lmb.get(key) || null;
  var dn = Math.sqrt(x * x + y * y) / c.R + 0.34 * fbm(x / (c.R * 0.9 + 200) + (c.seed % 89), y / (c.R * 0.9 + 200) - 3.7, 3);
  if (L || dn < 1) {
    var ax = c.PX * 0.32, ay = c.PY * 0.32;
    var dc = L || dryAt(c, x, y);
    var dry = L || (dc && dryAt(c, x - ax, y - ay) && dryAt(c, x + ax, y + ay) && dryAt(c, x - ax, y + ay) && dryAt(c, x + ax, y - ay));
    var h = hh(bi, bj, c.seed);
    if (dry) b = { t: L ? T_LM : btype(c, dn, h), s: (hh(bi, bj, c.seed + 1) * 1e9) | 0, dn: dn, L: L, bi: bi, bj: bj };
    else if (dc) b = { t: T_PARK, s: (hh(bi, bj, c.seed + 1) * 1e9) | 0, dn: dn, L: null, bi: bi, bj: bj, riv: 1 };
    else if (c.rv && riverD(c, x, y) > -c.rv.w * 0.5 - 30 && (c.rv.w < 120 || riverD(c, x, y) > -20)) { // riverside: embankment park
      var c0 = c.rv; c.rv = null; var dl = dryAt(c, x, y); c.rv = c0;
      if (dl) b = { t: T_PARK, s: (hh(bi, bj, c.seed + 1) * 1e9) | 0, dn: dn, L: null, bi: bi, bj: bj, riv: 1 };
    }
  }
  c.bc.set(key, b);
  return b;
}
function lineX(c, i) { var j = i + 64; if (j >= 0 && j < 129) { var v = c.LX[j]; if (v === v) return v; } var r = (i - 0.5) * c.PX + (i === 0 || i === 1 ? 0 : (hh(i, 11, c.seed) - 0.5) * 0.34 * c.PX); if (j >= 0 && j < 129) c.LX[j] = r; return r; }
function lineY(c, j) { var q = j + 64; if (q >= 0 && q < 129) { var v = c.LY[q]; if (v === v) return v; } var r = (j - 0.5) * c.PY + (j === 0 || j === 1 ? 0 : (hh(j, 12, c.seed) - 0.5) * 0.34 * c.PY); if (q >= 0 && q < 129) c.LY[q] = r; return r; }
function blockIx(c, lx) { var i = Math.floor(lx / c.PX + 0.5); if (lx < lineX(c, i)) i--; else if (lx >= lineX(c, i + 1)) i++; return i; }
function blockJy(c, ly) { var j = Math.floor(ly / c.PY + 0.5); if (ly < lineY(c, j)) j--; else if (ly >= lineY(c, j + 1)) j++; return j; }
function cwOf(c, i) { return mod(i, c.me) === 0 ? 8.6 : 5.8; }   // carriageway half width (incl. parking lane)
function swOf(c, i) { return mod(i, c.me) === 0 ? 5.6 : 4.4; }   // sidewalk width
function edOf(c, i) { return cwOf(c, i) + swOf(c, i); }
function sb(b) { return b && !(b.L && b.L.out); }               // does this block call for streets around it
function sameL(a, b) { return a && b && a.L && a.L === b.L; }
function lmArea(c, P) {
  return { X0: lineX(c, P.i) + edOf(c, P.i), X1: lineX(c, P.i + P.si) - edOf(c, P.i + P.si),
    Y0: lineY(c, P.j) + edOf(c, P.j), Y1: lineY(c, P.j + P.sj) - edOf(c, P.j + P.sj) };
}

/* ---------- towns (procedural, in 24 km cells) ---------- */
var TOWN = 24000, TCACHE = new Map();
function styAt(X, Y) {
  var lon = X * 360 - 180, lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * Y))) * 57.29578;
  if (samp(CD, CS, X, Y) > 0.3) return S_ME;
  if (lon < -30) return lat > 15 ? S_US : S_LA;
  if (lat > 44 && lon > 26) return S_RU;
  if (lon > 62 && lat < 45) return S_AS;
  return S_EU;
}
function town(cx, cy) {
  var key = cx * 4096 + cy;
  var t = TCACHE.get(key);
  if (t !== undefined) return t;
  if (TCACHE.size > 20000) TCACHE.clear();
  t = null;
  if (hh(cx, cy, 91) < 0.5) {
    var tx = (cx + 0.2 + 0.6 * hh(cx, cy, 92)) * TOWN, ty = (cy + 0.2 + 0.6 * hh(cx, cy, 93)) * TOWN;
    var X = tx / C, Y = ty / C;
    var lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * Y))) * 57.29578;
    if (samp(MASK, MS, X, Y) > 0.75 && samp(CD, CS, X, Y) < 0.5 && samp(CM, CS, X, Y) < 0.55 && samp(CI, CS, X, Y) < 0.2 && Math.abs(lat) < 66) {
      var near = false;
      for (var i = 0; i < CITIES.length; i++) { var q = CITIES[i], dx = (q.mx - tx) * q.k, dy = (q.my - ty) * q.k; if (dx * dx + dy * dy < 9e6 + 9 * q.R * q.R) { near = true; break; } }
      if (!near) t = cityPrep({ mx: tx, my: ty, pop: 0.003 + 0.09 * Math.pow(hh(cx, cy, 94), 4), sty: styAt(X, Y), seed: (hh(cx, cy, 95) * 1e9) | 0, lm: "", town: true });
    }
  }
  TCACHE.set(key, t);
  return t;
}

var TGRN = [0x2f7a32, 0x47963f, 0x225f28], TAUT = [0xd98b2b, 0xf0b04a, 0xa8641c], TYEL = [0xcdb93a, 0xe6d35a, 0x9e8c24], TPUR = [0xa65fc4, 0xc88ae0, 0x7d4596];
/* tree crown in local meter coords; returns color, -2 if in tree shadow, -1 nothing */
function treeAt(x, y, cell, dens, seed, pal) {
  var cx = Math.floor(x / cell), cy = Math.floor(y / cell);
  if (hh(cx, cy, seed) >= dens) return -1;
  var tx = (cx + 0.5 + (hh(cx, cy, seed + 1) - 0.5) * 0.35) * cell, ty = (cy + 0.5 + (hh(cx, cy, seed + 2) - 0.5) * 0.35) * cell;
  var r = cell * (0.33 + 0.12 * hh(cx, cy, seed + 3));
  var dx = x - tx, dy = y - ty;
  if (dx * dx + dy * dy < r * r) {
    var pl = pal;
    if (!pl) { var v = hh(cx, cy, seed + 4); pl = v < 0.82 ? TGRN : v < 0.9 ? TAUT : v < 0.95 ? TYEL : TPUR; }
    var q = (dx + dy) / r;
    var c = q < -0.55 ? pl[1] : q > 0.45 ? pl[2] : pl[0];
    if (q > -0.55 && q < 0.45 && hh(Math.floor(x * 1.4), Math.floor(y * 1.4), seed + 5) < 0.14) c = pl[1];
    return c;
  }
  var sx = dx - r * 0.5, sy = dy - r * 0.5;
  if (sx * sx + sy * sy < r * r) return -2;
  return -1;
}
/* ---------- palettes ---------- */
var ROOF_R = [0xb9472f, 0xc4573a, 0xa8402c, 0xcf6a45, 0xb35238, 0x9c4632, 0xc0603e];
var ROOF_G = [0xa3a49f, 0xb3b0a6, 0xbdb7a8, 0x92969a, 0xc6bfae, 0xa9aca4, 0x8a8f95, 0xcfc8b6];
var ROOF_D = [0x5d6672, 0x4f5862, 0x6b5a4e, 0x55606a];
var WALL = [0xd9c49c, 0xcaa97c, 0xe4d6b5, 0xb98f66, 0xd8b28a, 0xc7c2b6, 0xe2cf98, 0xd6a38a, 0xa7836a, 0xcfc8b8, 0xe8dfcc];
var WALL_LA = [0xe8b04a, 0x6fb3c8, 0xe07a5f, 0xf1e3b2, 0x9fcf8a, 0xd98fb0, 0xf2f0e6];
var WALL_ME = [0xe2cfa6, 0xd8c08f, 0xeadfc6, 0xcfb487, 0xf1ebdc];
var GLASS = [0x6f97b3, 0x5f8aa6, 0x7aa3a6, 0x8a9fb5, 0x56788f];
var AWN = [0xc8423b, 0x2f7d4f, 0x2f5fa8, 0xe0a33a, 0x8e4fa8, 0xd9d2c0];
var CARS = [0xd23c3c, 0x2f5fb3, 0xf2f2f2, 0x2a2a2a, 0x9aa3ad, 0xe8c547, 0x3d8f5a, 0xb8b8b8, 0x7a2e2e, 0xf08a2a, 0x1f3f7a];
/* tree palettes: highlight, light, mid, dark, outline */
var TP = [[0x8cc45a, 0x5fa040, 0x3f7f32, 0x2b5e27, 0x1d4220], [0x9fcf6a, 0x6fb04a, 0x4a8c38, 0x33682b, 0x22471f], [0x6fa64e, 0x4b8a3c, 0x346b2f, 0x244f24, 0x18381a],
  [0xf6c063, 0xe39a3a, 0xc4752a, 0x93521f, 0x5f3415], [0xf2e07a, 0xd9c04a, 0xb39a2e, 0x84701f, 0x574812], [0xd7a6ec, 0xb57ad8, 0x8f55b8, 0x683a8a, 0x45255c],
  [0xf8c8d8, 0xeba0bb, 0xcf7898, 0x9e5470, 0x6a3449], [0xf08a6a, 0xd65f45, 0xb04432, 0x7f3025, 0x521e17]];
function treePal(id, park) {
  var v = ((id >>> 8) & 1023) / 1024;
  if (!park) return v < 0.4 ? 0 : v < 0.72 ? 1 : v < 0.86 ? 2 : v < 0.93 ? 3 : v < 0.97 ? 4 : 7;
  return v < 0.38 ? 0 : v < 0.62 ? 1 : v < 0.74 ? 2 : v < 0.84 ? 3 : v < 0.9 ? 4 : v < 0.95 ? 5 : v < 0.98 ? 6 : 7;
}

/* ---------- ground colours ---------- */
var CO_ROAD = 0x4a4c51, CO_MARK = 0xe2dfd6, CO_ZEB = 0xebe8e0, CO_CURB = 0xb9b3aa, CO_WALK = 0xc7ad9b, CO_WALK2 = 0xb19682;
var CO_LAWN = 0x5f9c41, CO_LAWN2 = 0x568f3b, CO_HEDGE = 0x3c7433, CO_PATH = 0xd2c3a6, CO_PAVE = 0xcdbfab, CO_PAVE2 = 0xc3b49f;
function carTop(ax, al, len, wd, col, rm, hsel) { // ax across (-wd/2..wd/2), al along (0..len)
  var hw = wd / 2;
  if (hsel !== undefined && SPR.ok && SPR.g.car) { // kit car seen from above, pointing along the street
    var CL = sprCars(), sp = CL[((hsel * 4294967296) >>> 0) % CL.length];
    var m = sp[sp.length - 1], need = len / Math.max(0.02, rm || 0.1);
    for (var mi = 0; mi < sp.length; mi++) if (sp[mi].h >= need * 0.95) { m = sp[mi]; break; }
    var sw2 = len * m.w / m.h, u = (ax / sw2 + 0.5) * m.w, v = (1 - al / len) * m.h;
    if (u < 0 || v < 0 || u >= m.w || v >= m.h) return -1;
    var pa = ((m.y + (v | 0)) * SPR.w + m.x + (u | 0)) * 4;
    return SPR.px[pa + 3] < 128 ? -1 : (SPR.px[pa] << 16) | (SPR.px[pa + 1] << 8) | SPR.px[pa + 2];
  }
  if (ax < -hw || ax > hw || al < 0 || al > len) return -1;
  var e = Math.min(hw - Math.abs(ax), al, len - al);
  if (e < 0.18) return sh(col, 0.55);
  if (al > len * 0.27 && al < len * 0.4) return 0x2b3644;
  if (al > len * 0.74 && al < len * 0.84) return 0x34414f;
  if (al >= len * 0.4 && al <= len * 0.74) return Math.abs(ax) < hw - 0.3 ? sh(col, 1.18) : sh(col, 0.8);
  return Math.abs(ax) > hw - 0.35 ? sh(col, 0.82) : col;
}
var CUR_STY = 0, CUR_LM = "";
function lawn(x, y, rm, s) {
  if (CUR_STY === S_ME) { if (rm < 1.2) { var nq = noise(x / 4 + s % 31, y / 4); return nq > 0.25 ? 0xe2d3ae : nq < -0.3 ? 0xcfbd94 : 0xd9c9a3; } return 0xd9c9a3; }
  if (rm < 1.2) { var n = noise(x / 3.1 + s % 53, y / 3.1); if (n > 0.28) return 0x6aa84a; if (n < -0.3) return CO_LAWN2; if (hh(Math.floor(x / 0.7), Math.floor(y / 0.7), s) < 0.03) return 0x78b554; }
  return CO_LAWN;
}
function tiles(x, y, rm, a, b, sz) {
  if (rm > 1.1) return a;
  var u = x / sz, v = y / sz, fu = u - Math.floor(u), fv = v - Math.floor(v), e = Math.max(0.08, rm * 0.5 / sz);
  if (fu < e || fv < e) return b;
  return a;
}

/* street pixel. du/dv: distance to the nearest vertical/horizontal street line */
function streetPix(c, lx, ly, inU, inV, du, dv, iu, iv, rm, gx, gy) {
  var cwU = cwOf(c, iu), cwV = cwOf(c, iv), eU = cwU + swOf(c, iu), eV = cwV + swOf(c, iv);
  var majU = mod(iu, c.me) === 0, majV = mod(iv, c.me) === 0;
  if (rm > 3.2) return (inU && majU) || (inV && majV) ? 0x80838a : 0x9c978e;
  var onU = inU && du < cwU, onV = inV && dv < cwV;
  if (onU || onV) {
    var c0 = rm > 1.6 ? 0x62666d : CO_ROAD;
    if (rm < 1.3) { var n = hh(gx >> 1, gy >> 1, 71); if (n < 0.06) c0 = 0x484d54; else if (n > 0.965) c0 = 0x575c63; }
    if (onU && onV) return c0;
    var t = Math.max(0.13, rm * 0.5);
    if (onU) {
      if (inV) return (rm < 1 && dv > cwV + 0.7 && dv < eV - 0.5 && du < cwU - 0.4) ? ((Math.floor(lx / 0.9) & 1) ? CO_ZEB : c0) : c0;
      return lane(c0, du, cwU, majU, ly, lx > lineX(c, iu) ? 1 : 0, iu, dv - eV, rm, t, c);
    }
    if (inU) return (rm < 1 && du > cwU + 0.7 && du < eU - 0.5 && dv < cwV - 0.4) ? ((Math.floor(ly / 0.9) & 1) ? CO_ZEB : c0) : c0;
    return lane(c0, dv, cwV, majV, lx, ly > lineY(c, iv) ? 1 : 0, iv + 50000, du - eU, rm, t, c);
  }
  // sidewalk
  var dc = inU && inV ? Math.min(du - cwU, dv - cwV) : inU ? du - cwU : dv - cwV;
  if (inU && inV && du >= cwU && dv >= cwV) dc = Math.min(du - cwU, dv - cwV);
  if (dc < Math.max(0.28, rm * 0.5)) return CO_CURB;
  if (rm < 1.1) { if ((lx % 1.6 + 1.6) % 1.6 < Math.max(0.12, rm * 0.5) || (ly % 1.6 + 1.6) % 1.6 < Math.max(0.12, rm * 0.5)) return CO_WALK2; if (hh(gx >> 1, gy >> 1, 72) < 0.03) return 0xbcb2a1; }
  return CO_WALK;
}
function lane(c0, d, cw, maj, al, side, line, dA, rm, t, c) {
  if (rm > 2.6) return c0;
  if (maj) {
    if (Math.abs(d - 0.22) < Math.max(0.09, t * 0.6)) return 0xe0c25a;
    if (Math.abs(d - 3.3) < t && (Math.floor(al / 3) & 1)) return CO_MARK;
  } else if (d < t && (Math.floor(al / 3.2) & 1)) return CO_MARK;
  if (d > cw - 2.45 && d < cw - 0.2 && dA > 3 && rm < 2) {
    var slot = Math.floor(al / 5.8), sa = al - slot * 5.8, hs = hh(slot, line * 2 + side, c.seed + 7);
    if (hs < 0.55) { var cp = carTop(d - (cw - 1.32), sa - 0.6, 4.6, 1.95, CARS[(hh(slot, line, side) * CARS.length) | 0]); if (cp >= 0) return cp; }
    if (Math.abs(sa - 0.15) < t * 0.5) return 0x8c9096;
  }
  return c0;
}

/* block ground (under objects). x,y in block-interior metres, W,H interior size */
function ringIn(x, y, W, H, D) { return x >= 0 && y >= 0 && x <= W && y <= H && Math.min(x, y, W - x, H - y) < D; }
function blockGround(c, b, x, y, W, H, rm, gx, gy) {
  var s = b.s, t = b.t;
  if (x < 0 || y < 0 || x > W || y > H) return CO_WALK;
  if (!GO) return blockCoarse(c, b, x, y, W, H, rm, gx, gy);
  if (t === T_PERIM) {
    var v = hh(s, 7, 8);
    var D = 17 + 6 * hh(s, 1, 3), cx = x - D, cy = y - D, CW = W - 2 * D, CH = H - 2 * D;
    if (v < 0.25 && cx > 2 && cy > 2 && cx < CW - 2 && cy < CH - 2) { // parking yard
      var row = Math.floor((cy - 2) / 5.5), ry = cy - 2 - row * 5.5;
      if (ry < 5 && row < 2) { var sl = Math.floor(cx / 2.7), sx = cx - sl * 2.7; if (sx < 0.12) return 0xd9d9d0; if (hh(sl, row, s) < 0.6) { var cp = carTop(sx - 1.35, ry - 0.2, 4.5, 1.9, CARS[(hh(row, sl, s) * CARS.length) | 0]); if (cp >= 0) return cp; } }
      return 0x7a7d82;
    }
    if (v < 0.45 && Math.abs(cx - CW * 0.5) < 6 && Math.abs(cy - CH * 0.5) < 4.5) { // playground
      var px = cx - CW * 0.5 + 6, py = cy - CH * 0.5 + 4.5;
      if (px > 1.5 && px < 4.5 && py > 1.5 && py < 4.5) return 0xe2cf96;
      if (Math.abs(px - 8.5) < 0.6 && py > 1.5 && py < 7.5) return 0xd9483b;
      if (py > 6 && py < 7 && px > 6 && px < 11) return 0x3f6fb5;
      return 0xc9a66f;
    }
    var pth = Math.min(Math.abs(cx - CW * 0.5), Math.abs(cy - CH * 0.5));
    if (pth < 1.1 && v > 0.62) return tiles(x, y, rm, CO_PATH, 0xc4b392, 0.8);
    return lawn(x, y, rm, s);
  }
  if (t === T_HOUSES) {
    var lot = 14 + 4 * hh(s, 2, 5), li = Math.floor(x / lot), lx = x - li * lot, two = H > 30, top = !two || y < H / 2, ly = top ? y : H - y;
    if (rm < 1.5 && lx < Math.max(0.25, rm * 0.5)) return CO_HEDGE;
    if (lx > lot - 3.6 && lx < lot - 0.8 && ly < 13) return 0xb5b0a6; // driveway
    var hp = hh(li, top ? 1 : 2, s);
    if (hp < 0.13 && ly > 14 && ly < 19 && lx > 2.5 && lx < 8.5) return (ly < 14.5 || ly > 18.5 || lx < 3 || lx > 8) ? 0xe8e4da : 0x58c3e6;
    if (hp > 0.85 && ly > 13.5 && ly < 18 && lx > 2 && lx < 9) return ((Math.floor(lx) + Math.floor(ly)) & 1) ? 0x8a6b45 : 0x7b5e3c;
    return lawn(x, y, rm, s);
  }
  if (t === T_SLAB) {
    if (y > H - 7 && y < H - 1.5) { var sl2 = Math.floor(x / 2.7), sx2 = x - sl2 * 2.7; if (sx2 < 0.12) return 0xd9d9d0; if (hh(sl2, 3, s) < 0.55) { var cq = carTop(sx2 - 1.35, y - (H - 6.8), 4.5, 1.9, CARS[(hh(sl2, 4, s) * CARS.length) | 0]); if (cq >= 0) return cq; } return 0x7a7d82; }
    if (Math.abs(y - H + 9) < 1.2 || Math.abs(x - W / 2) < 1) return tiles(x, y, rm, CO_PATH, 0xc4b392, 0.8);
    return lawn(x, y, rm, s);
  }
  if (t === T_TOWERS) {
    if (Math.min(x, y, W - x, H - y) < 3 && hh(Math.floor(x / 6), Math.floor(y / 6), s) < 0.4) return CO_HEDGE;
    return tiles(x, y, rm, 0xd0cbc2, 0xbfb9ae, 3);
  }
  if (t === T_PARK) return b.riv ? (Math.abs(y - H * 0.5 - 6 * Math.sin(x / 23)) < 1.4 ? tiles(x, y, rm, CO_PATH, 0xc4b392, 1) : lawn(x, y, rm, s)) : parkGround(x, y, W, H, rm, s, gx, gy);
  if (t === T_PLAZA) {
    var dd = Math.sqrt((x - W / 2) * (x - W / 2) + (y - H / 2) * (y - H / 2));
    var f = fountain(dd, rm, gx, gy, 4.5); if (f >= 0) return f;
    if (Math.abs(dd - 11) < 0.8) return 0xb3a58e;
    return ((Math.floor(x / 2.2) + Math.floor(y / 2.2)) & 1) ? CO_PAVE : CO_PAVE2;
  }
  if (t === T_SCHOOL) {
    var fx0 = W * 0.45, fy0 = 4, fw = W * 0.55 - 4, fh = H - 8;
    if (x > fx0 && x < fx0 + fw && y > fy0 && y < fy0 + fh) {
      var ex = Math.min(x - fx0, fx0 + fw - x), ey = Math.min(y - fy0, fy0 + fh - y);
      if (ex < 3 || ey < 3) return Math.abs(Math.min(ex, ey) - 1.5) < 0.25 ? 0xe9dcd0 : 0xb55a43;
      if (Math.abs(x - fx0 - fw / 2) < 0.2 || Math.abs(Math.min(ex, ey) - 3.4) < 0.2) return 0xeef2ea;
      return (Math.floor((x - fx0) / 4) & 1) ? 0x5aa548 : 0x4f9a3f;
    }
    return lawn(x, y, rm, s);
  }
  if (t === T_PARKING) {
    var r3 = Math.floor((y - 2) / 6), ry3 = y - 2 - r3 * 6;
    if (ry3 >= 0 && ry3 < 5 && y < H - 2) { var sl3 = Math.floor(x / 2.7), sx3 = x - sl3 * 2.7; if (sx3 < 0.12) return 0xd9d9d0; if (hh(sl3, r3, s) < 0.7) { var cr = carTop(sx3 - 1.35, ry3 - 0.25, 4.5, 1.9, CARS[(hh(r3, sl3, s) * CARS.length) | 0]); if (cr >= 0) return cr; } }
    return 0x6e7278;
  }
  return CO_WALK;
}
function fountain(d, rm, gx, gy, r) {
  if (d > r + 1.6) return -1;
  if (d > r + 0.9) return 0xd8d0c0;
  if (d > r) return 0xb8b0a2;
  if (d < 0.9) return 0xeef6fb;
  if (d < 1.6) return 0x8fd0ee;
  return ((gx + gy) & 1) && rm < 1 && Math.abs(d - r * 0.6) < 0.4 ? 0x86c9ea : 0x4fa8d8;
}
function parkGround(x, y, W, H, rm, s, gx, gy) {
  var st0 = CUR_STY; CUR_STY = 0;
  var r = parkGround0(x, y, W, H, rm, s, gx, gy);
  CUR_STY = st0;
  return r;
}
function parkGround0(x, y, W, H, rm, s, gx, gy) {
  var cx = W / 2, cy = H / 2, dx = x - cx, dy = y - cy, d = Math.sqrt(dx * dx + dy * dy);
  var f = fountain(d, rm, gx, gy, 4.2); if (f >= 0) return f;
  var m = Math.min(W, H), R = m * 0.17 + 4;
  var pw = 1.6;
  if (Math.abs(d - R) < pw || Math.min(x, y, W - x, H - y) < 3.2) return tiles(x, y, rm, 0xcdb9a3, 0xc0ab94, 1.2);
  var dg = Math.min(Math.abs(x / W - y / H) * m, Math.abs(x / W - (1 - y / H)) * m);
  if (dg < pw && d > R) return tiles(x, y, rm, 0xcdb9a3, 0xc0ab94, 1.2);
  if (dg < pw + 0.8 && d > R || Math.abs(d - R) < pw + 0.8 || Math.min(x, y, W - x, H - y) < 4.2) return CO_HEDGE;
  var fl = hh(Math.floor(x / 1.3), Math.floor(y / 1.3), s);
  if (rm < 1 && fl < 0.025) return [0xe76fa0, 0xf4d24a, 0xb07ae0, 0xffffff, 0xf08a3c][(hh(Math.floor(x), Math.floor(y), 3) * 5) | 0];
  return lawn(x, y, rm, s);
}
function blockCoarse(c, b, x, y, W, H, rm, gx, gy) {
  var t = b.t, s = b.s, h = hh(gx >> 1, gy >> 1, 51);
  if (t === T_PARK) return h < 0.45 ? 0x4d8a3c : 0x62a046;
  if (t === T_PLAZA || t === T_PARKING) return 0xbcb3a3;
  if (t === T_SCHOOL) return h < 0.5 ? 0x5aa548 : 0xb55a43;
  if (t === T_LM) return b.L.cc || 0xc9b48a;
  if (t === T_TOWERS) return h < 0.2 ? 0xd0cbc2 : GLASS[(hh(s, 2, 3) * GLASS.length) | 0];
  var red = hh(s, 3, 4) < roofRed(c);
  if (t === T_HOUSES) return h < 0.42 ? 0x6aa84d : ROOF_R[(hh(gx >> 1, gy >> 1, 52) * ROOF_R.length) | 0];
  if (t === T_SLAB) return h < 0.3 ? 0x77ad52 : ROOF_G[(hh(s, 5, 6) * ROOF_G.length) | 0];
  if (ringIn(x, y, W, H, 14)) return red ? ROOF_R[(hh(s, gx >> 2, 7) * ROOF_R.length) | 0] : ROOF_G[(hh(s, gy >> 2, 8) * ROOF_G.length) | 0];
  return 0x6aa64a;
}
function roofRed(c) { return [0.55, 0.42, 0.2, 0.2, 0.06, 0.6][c.sty]; }

/* landmark ground. x,y relative to the landmark area, W,H its size */
function lmGround(c, P, x, y, W, H, rm, gx, gy) {
  var g = LMG[P.f] || "pave";
  var s = P.id * 7919 + (c.seed | 0);
  var dx = x - W / 2, dy = y - H / 2, d = Math.sqrt(dx * dx + dy * dy);
  if (g === "park") return parkGround(x, y, W, H, rm, s, gx, gy);
  if (g === "bigpark") {
    var lx = dx / (W * 0.22), ly = (dy + H * 0.1) / (H * 0.16), ld = lx * lx + ly * ly + 0.15 * noise(x / 20, y / 20);
    if (ld < 1) return ld > 0.86 ? 0x8ec6dc : 0x4f9fcf;
    if (ld < 1.12) return 0xcfc39f;
    var p1 = Math.abs(dx - (y - H / 2) * 0.35 + 8 * Math.sin(y / 30)), p2 = Math.abs(dy - dx * 0.2 + 10 * Math.sin(x / 25));
    if (Math.min(p1, p2) < 1.4 || Math.min(x, y, W - x, H - y) < 2.5) return tiles(x, y, rm, CO_PATH, 0xc4b392, 1);
    return lawn(x, y, rm, s);
  }
  if (g === "lawn" || g === "mall") {
    var bor = g === "mall" ? 9 : 5;
    if (Math.min(x, y, W - x, H - y) < bor) return tiles(x, y, rm, CO_PATH, 0xc4b392, 1);
    if (g === "mall" && Math.abs(dy) < 2.2) return tiles(x, y, rm, 0xdcd2bb, 0xcfc4ab, 1.5);
    if (g === "lawn" && (Math.abs(dx) < 2 || Math.abs(dy) < 2)) return tiles(x, y, rm, CO_PATH, 0xc4b392, 1);
    return (rm < 1.5 && (Math.floor((g === "mall" ? x : y) / 5) & 1)) ? 0x72ad4f : CO_LAWN;
  }
  if (g === "cobble") {
    if (rm < 1.2) { var u = Math.floor(x / 0.8) + (Math.floor(y / 0.8) & 1) * 0.5, n2 = hh(Math.floor(u), Math.floor(y / 0.8), 9); if ((x / 0.8 + (Math.floor(y / 0.8) & 1) * 0.5) % 1 < 0.15 || (y / 0.8) % 1 < 0.15) return 0x6e5f5a; return n2 < 0.3 ? 0x8a7871 : n2 < 0.6 ? 0x95827a : 0x7f6e68; }
    return 0x857570;
  }
  if (g === "sand") {
    var nd = noise(x / 40 + 3, y / 40) + 0.4 * noise(x / 12, y / 12 + 5);
    return nd > 0.3 ? 0xe6c88a : nd < -0.25 ? 0xcfa868 : 0xdcb978;
  }
  if (g === "round") {
    if (d < 13) return tiles(x, y, rm, 0xd6ccb8, 0xcabfa9, 1.2);
    if (d < Math.min(W, H) / 2 - 4) return (Math.floor(Math.atan2(dy, dx) * 6 / Math.PI + 12) & 1) ? 0xcdc1aa : 0xc4b7a0;
    if (d < Math.min(W, H) / 2 - 1) return CO_HEDGE;
    return lawn(x, y, rm, s);
  }
  if (g === "arena") {
    var q = (dx / (W * 0.3)) * (dx / (W * 0.3)) + (dy / (H * 0.28)) * (dy / (H * 0.28));
    if (q < 1) return noise(x / 6, y / 6) > 0.2 ? 0xd5b87f : 0xcdae74;
    return tiles(x, y, rm, 0xd8ccb4, 0xcabda3, 2);
  }
  if (g === "field") {
    var qx = dx / (W * 0.27), qy = dy / (H * 0.25);
    if (Math.abs(qx) < 1 && Math.abs(qy) < 1) {
      if (Math.abs(dx) < 0.25 || Math.abs(Math.abs(qx) - 1) < 0.02 || Math.abs(Math.abs(qy) - 1) < 0.03) return 0xf0f3ea;
      if (Math.abs(d - 9) < 0.25) return 0xf0f3ea;
      return (Math.floor(dx / 5) & 1) ? 0x5aa548 : 0x4f9a3f;
    }
    return tiles(x, y, rm, 0xc9c6c0, 0xbdb9b2, 2);
  }
  if (g === "island") {
    var dI = Math.sqrt(dx * dx + dy * dy), Rr = Math.min(W, H) / 2;
    if (dI > Rr) return -9;
    if (dI > Rr - 3) return 0xd8cdb4;
    var st = Math.abs(Math.cos(Math.atan2(dy, dx) * 5.5)) * 9 + 16;
    if (dI < st) return tiles(x, y, rm, 0xcdc3b2, 0xc0b5a2, 2);
    return lawn(x, y, rm, s);
  }
  if (g === "tuileries" || g === "lux") {
    if (Math.min(x, y, W - x, H - y) < 8) return tiles(x, y, rm, 0xd8ccb0, 0xcdbfa1, 1.5);
    var py = g === "lux" ? 0.58 : 0.5, pr = g === "lux" ? Math.min(W, H) * 0.12 : Math.min(W, H) * 0.12;
    var q1 = Math.hypot(x - W * (g === "lux" ? 0.5 : 0.22), y - H * py), q2 = Math.hypot(x - W * 0.78, y - H * py);
    var qd = g === "lux" ? q1 : Math.min(q1, q2);
    if (qd < pr) return qd > pr - 1.2 ? 0xd8d0c0 : 0x4fa8d8;
    if (qd < pr + 4) return tiles(x, y, rm, 0xd8ccb0, 0xcdbfa1, 1.5);
    var lx2 = (x / W) % 0.25, ok2 = lx2 > 0.03 && lx2 < 0.22 && y > H * 0.15 && y < H * 0.85;
    if (ok2 && !(g === "lux" && qd < pr * 2.2)) return Math.min(lx2 - 0.03, 0.22 - lx2) * W < 1 ? CO_HEDGE : lawn(x, y, rm, s);
    return tiles(x, y, rm, 0xd8ccb0, 0xcdbfa1, 1.5);
  }
  if (g === "kremlin") {
    var qx2 = 6 + (W - 10) * 0.62, qy2 = 6 + (H - 12) * 0.58;
    if (Math.abs(x - qx2 - 6) < 84 && Math.abs(y - qy2) < 60) return tiles(x, y, rm, 0xd8cfbe, 0xccc2af, 2.4);
    if (Math.abs(y - (H - 12) * 0.47) < 3 || Math.abs(x - (W - 10) * 0.5) < 3 && y < H * 0.5) return tiles(x, y, rm, 0xd8cfbe, 0xccc2af, 2.4);
    return lawn(x, y, rm, s);
  }
  if (g === "forbidden") {
    if (Math.abs(dx) < 6) return tiles(x, y, rm, 0xe2dccd, 0xd6cfbe, 1.5);
    return tiles(x, y, rm, 0xd4cbb8, 0xc7bea9, 3);
  }
  if (g === "rock") {
    var rr = Math.max(Math.abs(dx) / (W * 0.46), Math.abs(dy) / (H * 0.46));
    if (rr > 1) return lawn(x, y, rm, s);
    var nr = noise(x / 7, y / 7);
    return nr > 0.25 ? 0xd2c29c : nr < -0.25 ? 0xb5a37c : 0xc6b48d;
  }
  // pave
  var e2 = Math.min(x, y, W - x, H - y);
  if (e2 < 3) return CO_HEDGE;
  return ((Math.floor(x / 2.4) + Math.floor(y / 2.4)) & 1) ? CO_PAVE : CO_PAVE2;
}
var LMG = { kremlin: "kremlin", redsquare: "cobble", palacesq: "cobble", square: "park", bigpark: "bigpark", eiffel: "mall", mall: "mall", indiagate: "mall",
  arc: "round", arcmd: "round", colosseum: "arena", stadium: "field", pyramids: "sand", forbidden: "forbidden", acropolis: "rock", capitol: "lawn", reichstag: "lawn", cityhall: "lawn",
  topkapi: "lawn", galata: "pave", maiden: "island",
  wtc: "pave", chrysler: "pave", liberty: "island", bbtower: "pave", timessq: "pave",
  louvre: "pave", tuileries: "tuileries", concorde: "round", invalides: "mall", sacrecoeur: "lawn", opera: "pave", lux: "lux", pantheon: "pave", montparnasse: "pave",
  christ: "pave", mcity: "pave", stalinhr: "lawn", mgu: "mall", gorky: "bigpark", ostankino: "lawn" };
var LMC = { park: 0x5f9e45, bigpark: 0x5f9e45, mall: 0x6aa64a, lawn: 0x6aa64a, cobble: 0x857570, sand: 0xdcb978, round: 0xc9bfae, arena: 0xd8ccb4, field: 0x5aa548, kremlin: 0xa7402f, forbidden: 0xb23a2a, rock: 0xc6b48d, pave: 0xc9bfae };

/* city pixel in local metres; -1 = not part of this city */
function cityFine(c, lx, ly, rm, gx, gy) {
  var rd = c.rv ? riverD(c, lx, ly) : 99, wet = rd < 0;
  CUR_STY = c.sty; CUR_LM = c.lm || "";
  var bi = blockIx(c, lx), bj = blockJy(c, ly), xa = lineX(c, bi), ya = lineY(c, bj);
  var PX = lineX(c, bi + 1) - xa, PY = lineY(c, bj + 1) - ya;
  var fu = lx - xa, fv = ly - ya;
  var eW = fu >= PX * 0.5, sS = fv >= PY * 0.5;
  var iu = eW ? bi + 1 : bi, iv = sS ? bj + 1 : bj;
  var du = eW ? PX - fu : fu, dv = sS ? PY - fv : fv;
  var m = 0.5 * rm;
  var inU = du < Math.max(edOf(c, iu), m), inV = dv < Math.max(edOf(c, iv), m);
  var b;
  if (inU || inV) {
    var b1, b2, b3, b4, any;
    if (inU && inV) {
      b1 = cblock(c, iu - 1, iv - 1); b2 = cblock(c, iu, iv - 1); b3 = cblock(c, iu - 1, iv); b4 = cblock(c, iu, iv);
      if (sameL(b1, b2) && sameL(b1, b3) && sameL(b1, b4)) return lmPix(c, b1.L, lx, ly, rm, gx, gy);
      any = sb(b1) || sb(b2) || sb(b3) || sb(b4);
      var onRoad = du < cwOf(c, iu) || dv < cwOf(c, iv);
      if (!onRoad && !sb(eW ? (sS ? b4 : b2) : (sS ? b3 : b1)) && rm < 7) any = false;
    } else if (inU) {
      b1 = cblock(c, iu - 1, bj); b2 = cblock(c, iu, bj);
      if (sameL(b1, b2)) return lmPix(c, b1.L, lx, ly, rm, gx, gy);
      any = sb(b1) || sb(b2);
    } else {
      b1 = cblock(c, bi, iv - 1); b2 = cblock(c, bi, iv);
      if (sameL(b1, b2)) return lmPix(c, b1.L, lx, ly, rm, gx, gy);
      any = sb(b1) || sb(b2);
    }
    if (!any) return wet ? riverPix(rd, rm, gx, gy) : -1;
    OUTC = 1;
    OUTB = (inU && mod(iu, c.me) === 0) || (inV && mod(iv, c.me) === 0) ? 1 : 0;
    if (rd < 2.5) {
      if (!OUTB || (inU && inV)) { OUTC = 0; OUTB = 0; return riverPix(rd, rm, gx, gy); }
      var sp = streetPix(c, lx, ly, inU, inV, du, dv, iu, iv, rm, gx, gy);
      var dd = inU ? du - cwOf(c, iu) : dv - cwOf(c, iv);
      return dd > 0 && dd < Math.max(0.6, rm * 0.6) ? 0x6d655c : dd > 0 ? sh(sp, 0.95) : sp;
    }
    return streetPix(c, lx, ly, inU, inV, du, dv, iu, iv, rm, gx, gy);
  }
  if (wet) return riverPix(rd, rm, gx, gy);
  if (rd < 7) return rd < 1.2 ? 0x8f887c : tiles(lx, ly, rm, 0xb9b0a0, 0xaca392, 1.4);
  b = cblock(c, bi, bj);
  if (!b) return -1;
  if (b.L) return lmPix(c, b.L, lx, ly, rm, gx, gy);
  var x0 = edOf(c, bi), y0 = edOf(c, bj);
  return blockGround(c, b, fu - x0, fv - y0, PX - x0 - edOf(c, bi + 1), PY - y0 - edOf(c, bj + 1), rm, gx, gy);
}
function riverPix(rd, rm, gx, gy) {
  WET = 1;
  if (rd > -Math.max(1.4, rm * 0.6)) return 0x7fb6d6;
  var n = hh(gx >> 1, gy, 77);
  return rm < 2 && n < 0.03 ? 0x6fa9d8 : rd > -4 ? 0x4f97cc : 0x3f88c4;
}
function lmPix(c, P, lx, ly, rm, gx, gy) {
  var A = P.A || (P.A = lmArea(c, P));
  if (!GO && rm > 7) { lmGround(c, P, lx - A.X0, ly - A.Y0, A.X1 - A.X0, A.Y1 - A.Y0, rm, gx, gy); return P.cc || 0xc9bfae; }
  if (lx < A.X0 || ly < A.Y0 || lx > A.X1 || ly > A.Y1) return CO_WALK;
  return lmGround(c, P, lx - A.X0, ly - A.Y0, A.X1 - A.X0, A.Y1 - A.Y0, rm, gx, gy);
}
/* far zoom: a city is an inflated cluster of roofs so it stays readable at region/world scale */
function cityBlob(c, dn, rm, gx, gy) {
  var h = hh(gx, gy, 41), h2 = hh(gx >> 1, gy >> 1, 42);
  if (rm > 2500) return dn < 0.45 ? 0xf2eee4 : h < 0.5 ? 0xc4573a : 0x9c4632;
  if (h < 0.16) return 0x7d8087;
  if (dn > 0.8 && h2 < 0.35) return 0x6f9c4a;
  if (h2 < 0.08) return 0x6f9c4a;
  if (dn < 0.4 && h < 0.42) return ROOF_G[(hh(gx >> 1, gy, 43) * ROOF_G.length) | 0];
  return ROOF_R[(hh(gx >> 1, gy >> 1, 44) * ROOF_R.length) | 0];
}
function inflate(c, rm) {
  if (rm < 45) return c.R;
  var f = Math.min(1, (rm - 45) / 120);
  var g = c.town ? (rm > 700 || c.pop < 0.012 ? 0 : 2.4 + 20 * c.pop) : 3 + 2.4 * Math.pow(c.pop, 0.33);
  return Math.max(c.R, rm * f * g);
}
var SUB = 0, WS = 1; // WS: inland water scale, shrinks rivers and lakes near cities with their own hand-placed geography
function wsOf(c, d) { if (!c.lm) return 1; var t = (d / c.R - 1.15) / 1.5; return t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t); }
function cityPix(mx, my, rm, gx, gy) {
  SUB = 0; WS = 1;
  for (var q = 0; q < TC.length; q++) { var cq = TC[q]; if (cq.lm) { var ex = (mx - cq.mx) * cq.k, ey = (my - cq.my) * cq.k, w = wsOf(cq, Math.sqrt(ex * ex + ey * ey)); if (w < WS) WS = w; } }
  for (var i = 0; i < TC.length; i++) {
    var c = TC[i];
    if (c.schema && rm <= 45) continue;
    if ((rm > 300 || SPZ <= 9) && !c.town) continue; // far zoom: the city is an icon, not a blob
    var lx = (mx - c.mx) * c.k, ly = (my - c.my) * c.k;
    var Rv = inflate(c, rm), d2 = lx * lx + ly * ly;
    if (d2 > (c.rv ? 36 * c.R * c.R : 0) + 16 * Rv * Rv + 4e6) continue;
    var su = Math.exp(-d2 / (9 * c.R * c.R + 1e6));
    if (su > SUB) SUB = su;
    if (rm > 45) {
      var dn = Math.sqrt(d2) / Rv + 0.3 * noise(lx / (Rv * 0.6) + (c.seed % 71), ly / (Rv * 0.6));
      if (dn < 1) return cityBlob(c, dn, rm, gx, gy);
      continue;
    }
    if (d2 > 2.6 * c.R * c.R + 4e5 && !(c.lmFar && d2 < 16 * c.R * c.R + 4e6)) {
      if (c.rv && d2 < 36 * c.R * c.R) { // the river runs on past the city and narrows away
        var rdo = riverD(c, lx, ly) + c.rv.w / 2 * Math.max(0, (Math.sqrt(d2) / c.R - 3) / 3);
        if (rdo < 0) return riverPix(rdo, rm, gx, gy);
      }
      continue;
    }
    var v = cityFine(c, lx, ly, rm, gx, gy);
    if (v >= 0) return v;
  }
  return -1;
}

/* ---------- roads between cities ---------- */
function highway(mx, my, k, rm) {
  if (rm > 2600 || TR.length === 0) return -1;
  var wx = mx + noise(mx / 38000 + 3, my / 38000) * 2400 + noise(mx / 9000, my / 9000 + 2) * 400;
  var wy = my + noise(mx / 38000, my / 38000 + 9) * 2400 + noise(mx / 9000 + 6, my / 9000) * 400;
  var best = 1e30, bt = 0, bl = 0;
  for (var i = 0; i < TR.length; i++) {
    var r = TR[i];
    var t = ((wx - r.ax) * r.dx + (wy - r.ay) * r.dy) * r.il2;
    if (t < 0) t = 0; else if (t > 1) t = 1;
    var ex = r.ax + r.dx * t - wx, ey = r.ay + r.dy * t - wy, d = ex * ex + ey * ey;
    if (d < best) { best = d; bt = t; bl = r.len; }
  }
  var dr = Math.sqrt(best) * k, hw = 12;
  if (dr > Math.max(hw, 0.5 * rm)) return -1;
  OUTC = 1; OUTB = 1;
  if (rm > 40) return 0xdcc993;
  if (rm > 3) return dr > hw - 2.5 ? 0x8f9294 : 0x6b7077;
  if (dr > 10.8) return 0x8d8f91;
  if (Math.abs(dr - 10.1) < 0.3) return 0xe6e6e6;
  if (dr < 0.5) return 0xd8c25a;
  var along = bt * bl * k;
  if (Math.abs(dr - 3.6) < 0.25 && (Math.floor(along / 4.5) & 1)) return 0xe6e6e6;
  if (Math.abs(dr - 7) < 0.25 && (Math.floor(along / 4.5) & 1)) return 0xe6e6e6;
  return 0x50565e;
}

/* ---------- inland water ---------- */
function waterLand(mx, my, k, rm, mpp, des, mt, alat) {
  if (des < 0.5 && rm < 9000) {
    var m = fbm(mx / 900000 + 2, my / 900000 - 4, 2);
    if (m > -0.08 && mt < 0.7) {
      var wx = noise(mx / 60000, my / 60000) * 15000;
      var n = fbm((mx + wx) / 240000 + 7, my / 240000 + 3, oct(240000, mpp, 9));
      var dm = Math.abs(n) * 240000 * 0.42 * k;
      var hw = Math.max(110 + 120 * (m + 0.1), 0.55 * rm);
      if (dm < hw * WS) return (rm < 3 && dm > hw * WS - 2.5) ? 0x5fa7d6 : 0x3b85c4;
    }
    if (rm < 260) {
      var m2 = fbm(mx / 220000 - 6, my / 220000 + 2, 2);
      if (m2 > 0.04) {
        var n2 = fbm(mx / 38000 - 1, my / 38000 + 9, oct(38000, mpp, 9));
        var dm2 = Math.abs(n2) * 38000 * 0.42 * k;
        if (dm2 < Math.max(24, 0.55 * rm) * WS) return (rm < 2 && dm2 > 21 * WS) ? 0x5fa7d6 : 0x3d88c6;
      }
    }
  }
  var l = lfbm(mx / 26000 + 40, my / 26000 - 17, 26000, mpp, 10);
  var thr = 0.47 + (alat > 50 ? -0.04 : 0) + des * 0.5 + mt * 0.4;
  thr += (1 - WS) * 0.3;
  if (l > thr) return (l < thr + 0.006 && rm < 30) ? 0x62acd9 : 0x3f8ccb;
  return 0;
}

/* ---------- natural land ---------- */
var FIELDS = [0x9fbf5a, 0xb9bd68, 0x8db24d, 0xa99a5e, 0xc7c070, 0x7fa547, 0x968b56, 0xb2c875, 0x6f9e45, 0x87ad52];
var P_TEMP = [0x2f7032, 0x46903f, 0x225a28, 0x1b4420, 0x2c5a2a];
var P_TAIGA = [0x2a5a38, 0x3c7047, 0x1e472b, 0x163821, 0x2a4a30];
var P_TROP = [0x23752e, 0x37923b, 0x185f24, 0x124a1c, 0x1f5a26];
function forest(mx, my, mpp, rm, gx, gy, pal, bay) {
  if (rm < 2.6) {
    var t = treeAt(mx, my, 9.5, 0.9, 61, pal);
    if (t >= 0) return t;
    return t === -2 ? pal[3] : pal[4];
  }
  if (rm < 30 + 30 * hh(gx, gy, 64)) {
    var h = hh(gx >> 1, gy >> 1, 63);
    var c = h < 0.3 ? pal[2] : h < 0.78 ? pal[0] : pal[1];
    if (((gx | gy) & 1) === 0 && h > 0.55) c = pal[1];
    if (((gx & gy) & 1) === 1 && h < 0.5) c = pal[2];
    return c;
  }
  var n = lfbm(mx / 7000, my / 7000, 7000, mpp, 4);
  return n > -0.02 + bay * 0.1 ? pal[0] : n < -0.2 ? pal[2] : pal[1];
}
function fields(mx, my, k, rm, gx, gy) {
  district(mx, my, 1400, 23);
  var a = hh(Dgx, Dgy, 24) < 0.55 ? 0 : (hh(Dgx, Dgy, 25) - 0.5) * 1.2;
  var ca = Math.cos(a), sa = Math.sin(a), dx = mx - Dsx, dy = my - Dsy;
  var lu = dx * ca + dy * sa, lv = -dx * sa + dy * ca;
  var vert = hh(Dgx, Dgy, 26) < 0.5;
  var q = vert ? lu : lv, q2 = vert ? lv : lu;
  var sw = 90 + 170 * hh(Dgx, Dgy, 27);
  var si = Math.floor(q / sw), fq = q - si * sw;
  var c = FIELDS[(hh(si, Dgx * 31 + Dgy, 28) * FIELDS.length) | 0];
  var bm = Db * k;
  if (rm < 60 && bm < Math.max(3.5, 0.5 * rm)) {
    if (rm < 2.5) { var t = treeAt(mx, my, 6, 0.75, 71, P_TEMP); if (t >= 0) return t; }
    return 0x4c8a3b;
  }
  if (rm < 14 && Math.min(fq, sw - fq) < Math.max(0.6, 0.45 * rm)) return sh(c, 0.86);
  if (rm < 2.6 && ((q2 % 2.2 + 2.2) % 2.2) < 0.7) return sh(c, 0.93);
  return c;
}
function natural(X, Y, mx, my, mpp, k, rm, lat, alat, des, mt, u, gx, gy) {
  var bay = BAY[(gy & 3) * 4 + (gx & 3)] - 0.5;
  var e = 0, lit = 1;
  if (true) {
    var o = oct(60000, mpp * 0.5, 12);
    var n0 = lridged(mx / 60000, my / 60000, 60000, mpp, o);
    var d = mpp > 15 ? mpp : 15;
    var n1 = lridged((mx - d) / 60000, (my - d) / 60000, 60000, mpp, o);
    e = mt * n0;
    var sl = (n0 - n1) * (0.22 + mt) * (3 + 2600 / (d * k));
    lit = 1 + (sl > 0.42 ? 0.42 : sl < -0.42 ? -0.42 : sl);
  }
  var snowL = 0.68 - (alat > 30 ? (alat - 30) * 0.006 : 0);
  NATE = e; NATF = 0;
  if (e > snowL + bay * 0.05) { NATB = "snow"; return sh(e > snowL + 0.08 ? 0xf3f7fa : 0xdfe8ef, lit); }
  NATB = "rock";
  if (e > 0.4 + bay * 0.05) return sh(lfbm(mx / 3000, my / 3000, 3000, mpp, 4) + (hh(gx, gy, 3) - 0.5) * 0.1 > 0.02 ? 0x9a8d7b : 0x847968, lit);
  var dd = des + 0.2 * lfbm(mx / 400000 - 3, my / 400000 + 8, 400000, mpp, 3) + 0.14 * lfbm(mx / 50000 - 3, my / 50000 + 8, 50000, mpp, 6) + bay * 0.06;
  var c;
  if (dd > 0.56) {
    NATB = "desert";
    var n = lfbm(mx / 9000 + 5, my / 9000 - 2, 9000, mpp, 8) + 0.6 * lfbm(mx / 180000, my / 180000, 180000, mpp, 2);
    c = n > 0.12 ? 0xe7c684 : n < -0.12 ? 0xcd9f5a : 0xdcb46b;
    if (rm < 500) { var dn = Math.sin(mx * 0.0011 + my * 0.0004 + fbm(mx / 5000, my / 5000, 3) * 6); if (dn > 0.75) c = sh(c, 1.07); else if (dn < -0.55) c = sh(c, 0.91); }
    if (lridged(mx / 14000 + 3, my / 14000, 14000, mpp, 6) > 0.8) c = 0xa77a4f;
  } else if (dd > 0.38) {
    NATB = "steppe";
    var ns = lfbm(mx / 7000 - 4, my / 7000 + 1, 7000, mpp, 6);
    c = ns > 0.12 ? 0xc6c06f : ns < -0.1 ? 0xa8a956 : 0xb9b864;
    if (rm < 3) { var ts = treeAt(mx, my, 16, 0.12, 81, alat < 25 ? P_TROP : P_TEMP); if (ts >= 0) c = ts; else if (ts === -2) c = sh(c, 0.8); }
    else if (rm < 30 && hh(gx, gy, 82) < 0.03) c = 0x6f8a3a;
  } else {
    var bf = 0.6 * lfbm(mx / 300000 + 1.3, my / 300000 - 2.1, 300000, mpp, 3) + 0.4 * lfbm(mx / 24000 + 11, my / 24000 - 5, 24000, mpp, 7);
    if (alat > 66 + bf * 25) {
      NATB = "tundra";
      var nt = lfbm(mx / 5000, my / 5000, 5000, mpp, 6);
      c = nt > 0.1 ? 0xa9a983 : nt < -0.12 ? 0x7c8a60 : 0x95a072;
    } else {
      var al2 = alat + bf * 12;
      var thrF = al2 > 54 ? -0.1 : al2 < 14 ? -0.14 : 0.04;
      thrF += u * 0.5 + (e > 0.2 ? -0.1 : 0);
      if (bf > thrF + bay * 0.03) { NATB = "forest"; NATF = al2 > 54 ? 1 : al2 < 18 ? 2 : 0; c = forest(mx, my, mpp, rm, gx, gy, al2 > 54 ? P_TAIGA : al2 < 18 ? P_TROP : P_TEMP, bay); }
      else if (rm < 1100 + 1000 * hh(gx, gy, 99) && alat > 22 && alat < 61 && e < 0.3) { NATB = "fields"; c = fields(mx, my, k, rm, gx, gy); }
      else {
        NATB = "grass";
        if (rm >= 1100 && alat > 18 && alat < 62 && e < 0.3 && dd < 0.34) {
          district(mx, my, 7 * mpp / k, 23);
          var fh = hh(Dgx, Dgy, 24);
          if (fh < 0.55) { NATB = "fields"; var fc = FIELDS[(hh(Dgx, Dgy, 25) * FIELDS.length) | 0]; return Db < mpp * 0.7 / k * 1.0 ? sh(fc, 0.84) : sh(fc, lit !== 1 ? lit : 1); }
        }
        var ng = lfbm(mx / 6000, my / 6000, 6000, mpp, 6);
        c = ng > 0.12 ? 0x81b958 : ng < -0.1 ? 0x68a245 : 0x76b04e;
        if (rm < 3) { var tg = treeAt(mx, my, 14, 0.07, 91, P_TEMP); if (tg >= 0) c = tg; else if (tg === -2) c = sh(c, 0.8); }
      }
    }
  }
  if (rm < 40 && dd < 0.62 && e < 0.42) {
    district(mx, my, 5600, 11);
    if (hh(Dgx + Dg2x, Dgy + Dg2y, Math.abs(Dgx - Dg2x) * 3 + Math.abs(Dgy - Dg2y) + 17) < 0.62) {
      var bm = Db * k;
      if (bm < Math.max(3.2, 0.5 * rm)) c = rm > 3 ? 0xc2b07f : (bm < 2.7 ? 0x707377 : 0xbfae80);
    }
  }
  return lit !== 1 ? sh(c, lit) : c;
}

/* ---------- pixel ---------- */
var OCN = [0x15376a, 0x1a4682, 0x20579a, 0x2869ac, 0x337dba];
function ocean(X, Y, mx, my, dm, rm, gx, gy) {
  var dp = dm / rm; // distance to the coast in art px
  if (dp < 1.1 || (rm < 40 && dm < 2.2)) return 0xeaf7f2;
  if (dp < 3.2 || dm < 25) return 0x8edbd1;
  if (dp < 7 || dm < 90) return 0x5cc7cf;
  var b = samp(BLUR, BS, X, Y);
  var t = b * 2.6 + (BAY[(gy & 3) * 4 + (gx & 3)] - 0.5) * 0.12 + 0.07 * noise(mx / 150000, my / 150000);
  var c = t < 0.08 ? 0x174a86 : t < 0.2 ? 0x1d5a9a : t < 0.34 ? 0x2470ad : t < 0.5 ? 0x2b86bd : t < 0.68 ? 0x35a0c8 : 0x45b5cd;
  if (rm > 60) { var wc = Math.floor(gx / 9), wr = Math.floor(gy / 7), fx = gx - wc * 9, fy = gy - wr * 7; if (fy === 3 && fx >= 2 && fx < 5 && hh(wc, wr, 61) < 0.13) return sh(c, 1.28); if (fy === 4 && fx >= 3 && fx < 6 && hh(wc, wr, 61) < 0.13) return sh(c, 1.12); }
  return c;
}

/* ---------- block layouts: objects in city-local metres ----------
   box  {k:0}: x0,y0,x1,y1 footprint, z0 base, h height, roof 0 flat | 1 hip along x | 2 hip along y | 3 gable x | 4 gable y
   tree {k:1}: x,y, r crown radius
   part {k:2}: dome / cyl / cone / lat (lattice tower) / ring (arena), rendered by ray marching */
var F_OBL = 0.8, OBJ_RM = 20;
var LB = null, LS = 0, LC = null;
function addBox(x0, y0, x1, y1, h, o) {
  var b = { k: 0, x0: x0, y0: y0, x1: x1, y1: y1, z0: 0, h: h, roof: 0, rc: 0xa3a49f, wc: 0xd9c49c, win: 1, aw: -1, pr: null, cren: 0, door: -1, id: (Math.imul(LB.length + 11, 0x9e3779b1) ^ LS) | 0 };
  if (o) for (var q in o) b[q] = o[q];
  LB.push(b);
  return b;
}
function cbox(cx, cy, w, d, h, o) { return addBox(cx - w / 2, cy - d / 2, cx + w / 2, cy + d / 2, h, o); }
function addTree(x, y, r, park) {
  if (LC && LC.rv && riverD(LC, x, y) < r + 2) return;
  if (LC && LC.wetT && wetPt(LC, x, y, 0)) return;
  var id = (Math.imul(LB.length + 3, 0x85ebca6b) ^ LS) | 0;
  LB.push({ k: 1, x: x, y: y, r: r, id: id, pal: treePal(id, park) });
}
function addPart(t, o) {
  o.k = 2; o.t = t; o.z0 = o.z0 || 0;
  var r = t === "lat" ? o.w : t === "ring" ? Math.max(o.rx, o.ry) : o.r * (o.on ? 1.25 : 1);
  o.bb = t === "ring" ? [o.cx - o.rx, o.cy - o.ry, o.cx + o.rx, o.cy + o.ry, 0, o.h] : [o.cx - r, o.cy - r, o.cx + r, o.cy + r, o.z0, o.z0 + o.h];
  LB.push(o);
  return o;
}
function dome(cx, cy, r, z0, h, col, on, rib, col2) { return addPart("dome", { cx: cx, cy: cy, r: r, z0: z0, h: h, col: col, on: on || 0, rib: rib || 0, col2: col2 || 0 }); }
function cyl(cx, cy, r, z0, h, col, win, rc) { return addPart("cyl", { cx: cx, cy: cy, r: r, z0: z0, h: h, col: col, win: win || 0, rc: rc || 0 }); }
function cone(cx, cy, r, z0, h, col, sq, rib, col2) { return addPart("cone", { cx: cx, cy: cy, r: r, z0: z0, h: h, col: col, sq: sq || 0, rib: rib || 0, col2: col2 || 0 }); }
/* onion dome on a drum with a small gold cross/finial */
function onionOn(cx, cy, r, z0, col, rib, col2) {
  cyl(cx, cy, r * 0.8, z0, r * 1.3, 0xf1ede2, 1, 0xd9d2c0);
  dome(cx, cy, r, z0 + r * 1.3, r * 2.1, col, 1, rib, col2);
  cone(cx, cy, r * 0.12, z0 + r * 3.4, r * 0.9, 0xe3b23c);
}
function roofProps(b, s) {
  var W = b.x1 - b.x0, D = b.y1 - b.y0, z = b.z0 + b.h, pr = [];
  var n = Math.min(6, Math.floor(W * D / 140) + 1);
  for (var i = 0; i < n; i++) {
    var w = 1.4 + hh(i, s, 1) * 1.2, d = 1.1 + hh(i, s, 2) * 0.8;
    var x = b.x0 + 1.4 + hh(i, s, 3) * Math.max(0.1, W - w - 2.8), y = b.y0 + 1.4 + hh(i, s, 4) * Math.max(0.1, D - d - 2.8);
    pr.push([x, y, x + w, y + d, 0.9 + hh(i, s, 5) * 0.6, hh(i, s, 6) < 0.75 ? 0xd9dcdf : 0x9aa0a6]);
  }
  if (W * D > 220 && hh(s, 7, 7) < 0.6) { var ex = b.x0 + W * (0.2 + 0.5 * hh(s, 8, 8)), ey = b.y0 + D * 0.3; pr.push([ex, ey, ex + 3.2, ey + 3, 2.4, sh(b.rc, 0.92)]); }
  b.pr = pr;
}
function streetTrees(c, b, X0, Y0, X1, Y1, p) {
  var s = b.s, k, x, y;
  var yN = lineY(c, b.bj) + cwOf(c, b.bj) + 1.9, yS = lineY(c, b.bj + 1) - cwOf(c, b.bj + 1) - 1.9;
  var xW = lineX(c, b.bi) + cwOf(c, b.bi) + 1.9, xE = lineX(c, b.bi + 1) - cwOf(c, b.bi + 1) - 1.9;
  for (k = 0, x = X0 + 6; x < X1 - 5; k++, x += 10.5) {
    if (hh(k, 1, s + 31) < p) addTree(x, yN, 3.3 + 1.1 * hh(k, 5, s), false);
    if (hh(k, 2, s + 31) < p) addTree(x, yS, 3.3 + 1.1 * hh(k, 6, s), false);
  }
  for (k = 0, y = Y0 + 6; y < Y1 - 5; k++, y += 10.5) {
    if (hh(k, 3, s + 31) < p * 0.9) addTree(xW, y, 3.3 + 1.1 * hh(k, 7, s), false);
    if (hh(k, 4, s + 31) < p * 0.9) addTree(xE, y, 3.3 + 1.1 * hh(k, 8, s), false);
  }
}
function wallsOf(c) { return c.sty === S_LA ? WALL_LA : c.sty === S_ME ? WALL_ME : WALL; }

function layout(c, b) {
  if (b.L) {
    var P = b.L;
    if (!P.lo) { P.lo = []; LB = P.lo; LC = c; LS = P.id * 7919 + (c.seed | 0); P.A = P.A || lmArea(c, P); (LBLD[P.f] || LBLD.square)(P.A, c, P); LB = null; }
    return P.lo;
  }
  var key = b.bi * 4096 + b.bj, L = c.lo.get(key);
  if (L) return L;
  L = []; c.lo.set(key, L); LB = L; LS = b.s; LC = c;
  c.wetT = !!b.riv || !dryAt(c, (lineX(c, b.bi) + lineX(c, b.bi + 1)) / 2 + c.PX * 0.6, (lineY(c, b.bj) + lineY(c, b.bj + 1)) / 2) || !dryAt(c, (lineX(c, b.bi) + lineX(c, b.bi + 1)) / 2 - c.PX * 0.6, (lineY(c, b.bj) + lineY(c, b.bj + 1)) / 2) || !dryAt(c, (lineX(c, b.bi) + lineX(c, b.bi + 1)) / 2, (lineY(c, b.bj) + lineY(c, b.bj + 1)) / 2 + c.PY * 0.6) || !dryAt(c, (lineX(c, b.bi) + lineX(c, b.bi + 1)) / 2, (lineY(c, b.bj) + lineY(c, b.bj + 1)) / 2 - c.PY * 0.6);
  var X0 = lineX(c, b.bi) + edOf(c, b.bi), X1 = lineX(c, b.bi + 1) - edOf(c, b.bi + 1);
  var Y0 = lineY(c, b.bj) + edOf(c, b.bj), Y1 = lineY(c, b.bj + 1) - edOf(c, b.bj + 1);
  var t = b.t, s = b.s, W = X1 - X0, H = Y1 - Y0, i, k;
  streetTrees(c, b, X0, Y0, X1, Y1, t === T_HOUSES ? 0.45 : t === T_PARKING ? 0.5 : 0.8);
  var walls = wallsOf(c), pRed = roofRed(c);
  if (t === T_PERIM) {
    var D = 17 + 6 * hh(s, 1, 3), dn = b.dn;
    var fl0 = c.town ? 2 : dn < 0.25 ? 5 : dn < 0.5 ? 4 : 3, fv = c.town ? 2 : dn < 0.5 ? 3 : 2;
    var bld = function (x0, y0, x1, y1, dir, id) {
      var r1 = hh(id, s, 11), red = r1 < pRed;
      var o = { roof: red ? dir : 0, rc: red ? ROOF_R[(hh(id, s, 13) * ROOF_R.length) | 0] : ROOF_G[(hh(id, s, 14) * ROOF_G.length) | 0],
        wc: walls[(hh(id, s, 15) * walls.length) | 0], aw: (dn < 0.55 && !c.town && hh(id, s, 16) < 0.4) ? AWN[(hh(id, s, 17) * AWN.length) | 0] : -1 };
      var bx = addBox(x0, y0, x1, y1, (fl0 + ((hh(id, s, 12) * fv) | 0)) * 3.1 + (red ? 0.3 : 0.9), o);
      bx.door = (hh(id, s, 19) * 4) | 0;
      if (!red) roofProps(bx, id ^ s);
      else if (hh(id, s, 18) < 0.6) { var cx0 = x0 + (x1 - x0) * (0.25 + 0.5 * hh(id, s, 20)), cy0 = y0 + (y1 - y0) * 0.3; bx.pr = [[cx0, cy0, cx0 + 0.9, cy0 + 0.9, 1.4, 0x8a4a3a]]; }
    };
    var rowX = function (xa, xb, y0, y1, base) { var x = xa, q = 0; while (x < xb - 0.1) { var len = 14 + 18 * hh(q, base, s); if (xb - x - len < 10) len = xb - x; bld(x, y0, x + len, y1, 1, base + q); x += len; q++; } };
    var rowY = function (ya, yb, x0, x1, base) { var y = ya, q = 0; while (y < yb - 0.1) { var len = 14 + 16 * hh(q, base, s); if (yb - y - len < 10) len = yb - y; bld(x0, y, x1, y + len, 2, base + q); y += len; q++; } };
    if (W < 2 * D + 10 || H < 2 * D + 10) { // too small for a courtyard: a cluster of 2-4 buildings
      var nx = W > 46 ? 2 : 1, ny = H > 40 ? 2 : 1, cw2 = W / nx, ch2 = H / ny;
      for (var qy = 0; qy < ny; qy++) for (var qx = 0; qx < nx; qx++) bld(X0 + qx * cw2, Y0 + qy * ch2, X0 + (qx + 1) * cw2, Y0 + (qy + 1) * ch2, cw2 >= ch2 ? 1 : 2, 1 + qx + qy * 2);
    }
    else {
      var shp = hh(s, 2, 3), open = shp < 0.6 ? -1 : shp < 0.85 ? ((hh(s, 3, 3) * 4) | 0) : 4; // 0 N 1 S 2 W 3 E, 4 = S+E
      var oN = open === 0, oS = open === 1 || open === 4, oW = open === 2, oE = open === 3 || open === 4;
      if (!oN) rowX(X0, X1, Y0, Y0 + D, 100);
      if (!oS) rowX(X0, X1, Y1 - D, Y1, 200);
      if (!oW) rowY(oN ? Y0 : Y0 + D, oS ? Y1 : Y1 - D, X0, X0 + D, 300);
      if (!oE) rowY(oN ? Y0 : Y0 + D, oS ? Y1 : Y1 - D, X1 - D, X1, 400);
      var nt = 6 + ((hh(s, 4, 4) * 9) | 0);
      for (i = 0; i < nt; i++) addTree(X0 + D + 4.5 + hh(i, 1, s) * (W - 2 * D - 9), Y0 + D + 4.5 + hh(i, 2, s) * (H - 2 * D - 9), 3.4 + 2 * hh(i, 3, s), hh(i, 4, s) < 0.3);
      if (oS) for (k = 0; k * 8 + 4 < W; k++) if (hh(k, 9, s) < 0.6) addTree(X0 + 4 + k * 8, Y1 - 3, 2.6 + hh(k, 10, s), false);
    }
  } else if (t === T_HOUSES) {
    var lot = 14 + 4 * hh(s, 2, 5), two = H > 30, nl = Math.max(1, Math.floor(W / lot));
    lot = W / nl;
    for (var li = 0; li < nl; li++) for (var row = 0; row < (two ? 2 : 1); row++) {
      var lh = hh(li, row, s), ax = X0 + li * lot;
      var hw = Math.min(lot - 5.5, 8 + 3 * lh), hd = 7.5 + 3 * hh(li, row + 4, s), hx = ax + 1.6 + (lot - 5 - hw) * 0.5;
      var y0 = row === 0 ? Y0 + 3 : Y1 - 3 - hd;
      var rr = hh(li, row + 8, s), flat = c.sty === S_ME || (c.sty === S_US && rr < 0.15) || rr > 0.94;
      var hb = addBox(hx, y0, hx + hw, y0 + hd, (rr < 0.35 ? 2 : 1) * 3 + (flat ? 0.6 : 0.4), {
        roof: flat ? 0 : (hh(li, row + 12, s) < 0.6 ? 1 : 3), rc: flat ? ROOF_G[(rr * 8 | 0) % ROOF_G.length] : rr < 0.8 ? ROOF_R[(rr * 9 | 0) % ROOF_R.length] : ROOF_D[(rr * 13 | 0) % ROOF_D.length],
        wc: walls[(hh(li, row + 16, s) * walls.length) | 0] });
      hb.door = 1;
      var half = two ? H / 2 : H;
      if (hh(li, row, s + 9) < 0.75 && half - hd - 3 > 6) {
        var ty = hd + 6 + hh(li, row, s + 10) * (half - hd - 9);
        addTree(ax + 3 + hh(li, row, s + 11) * (lot - 6), row === 0 ? Y0 + ty : Y1 - ty, 2.4 + hh(li, row, s + 12) * 1.6, false);
      }
    }
  } else if (t === T_SLAB) {
    var horiz = W >= H, Lg = horiz ? W : H, Sd = horiz ? H : W, n = Lg > 75 ? 2 : 1, gap = 10, inset = 5;
    var tallF = (c.sty === S_RU || c.sty === S_AS) ? 9 + ((hh(s, 5, 5) * 8) | 0) : 5 + ((hh(s, 5, 5) * 4) | 0);
    var bl = (Lg - 2 * inset - (n - 1) * gap) / n, dep = Math.min(14, Sd - 20);
    var pan = [0xd8d4ca, 0xc9c4b8, 0xe2ddd0, 0xb9b7b0, 0xd9cdb5, 0xc4ccd0];
    for (var ai = 0; ai < n; ai++) {
      var a0 = inset + ai * (bl + gap), b0 = 6;
      var o2 = { rc: ROOF_G[(hh(ai, s, 3) * ROOF_G.length) | 0], wc: pan[(hh(ai, s, 4) * pan.length) | 0] };
      var sb2 = horiz ? addBox(X0 + a0, Y0 + b0, X0 + a0 + bl, Y0 + b0 + dep, tallF * 2.9 + 1, o2) : addBox(X0 + b0, Y0 + a0, X0 + b0 + dep, Y0 + a0 + bl, tallF * 2.9 + 1, o2);
      roofProps(sb2, s + ai);
    }
    for (k = 0; k * 11 + 6 < W; k++) if (hh(k, 5, s) < 0.6) addTree(X0 + 6 + k * 11, Y1 - 10, 2.8 + hh(k, 6, s) * 1.2, false);
  } else if (t === T_TOWERS) {
    var big = c.pop > 8 ? 1.6 : 1, nT = W > 70 && H > 55 ? 2 : 1;
    var pod = addBox(X0 + 3, Y0 + 3, X1 - 3, Y1 - 3, 7, { rc: 0xb9bcbf, wc: 0xc9cdd0, win: 3, aw: -1 });
    roofProps(pod, s + 99);
    for (i = 0; i < nT; i++) {
      var tw = 18 + 10 * hh(i, s, 21), td = 16 + 8 * hh(i, s, 22);
      var tx0 = nT === 2 ? (i === 0 ? X0 + 8 : X1 - 8 - tw) : X0 + (W - tw) / 2, ty0 = Y0 + 6 + hh(i, s, 23) * Math.max(0, H - td - 12);
      var floors = (12 + hh(i, s, 24) * 26 * big * (1.4 - b.dn)) | 0;
      var gb = addBox(tx0, ty0, tx0 + tw, ty0 + td, floors * 3.4, { z0: 7, win: 3, wc: GLASS[(hh(i, s, 25) * GLASS.length) | 0], rc: 0x8f979e });
      roofProps(gb, s + i);
      if (hh(i, s, 26) < 0.25) cone(tx0 + tw / 2, ty0 + td / 2, 1.2, 7 + floors * 3.4, 14, 0xc9cfd4);
    }
  } else if (t === T_PARK) {
    parkTrees(X0, Y0, W, H, s, c);
  } else if (t === T_PLAZA) {
    for (k = 0; k * 8 + 3 < W; k++) { addTree(X0 + 3 + k * 8, Y0 + 2.5, 2.4, false); addTree(X0 + 3 + k * 8, Y1 - 2.5, 2.4, false); }
  } else if (t === T_SCHOOL) {
    var sw2 = W * 0.4;
    addBox(X0 + 3, Y0 + 3, X0 + sw2, Y0 + 17, 3 * 3.2 + 0.9, { rc: 0xb3b0a6, wc: 0xe0c9a0 });
    addBox(X0 + 3, Y0 + 17, X0 + 16, Y1 - 6, 2 * 3.2 + 0.9, { rc: 0xa9aca4, wc: 0xe0c9a0 });
    for (k = 0; k < 4; k++) addTree(X0 + 20 + hh(k, 1, s) * (sw2 - 22), Y0 + 24 + hh(k, 2, s) * (H - 30), 2.8, false);
  } else if (t === T_PARKING) {
    for (k = 0; k * 14 < W; k++) addTree(X0 + 7 + k * 14, Y1 - 1.5, 2.2, false);
  }
  LB = null; c.wetT = false;
  return L;
}
function parkTrees(X0, Y0, W, H, s, c) {
  var m = Math.min(W, H), R = m * 0.17 + 4;
  for (var gy = 0; gy * 9 < H; gy++) for (var gx = 0; gx * 9 < W; gx++) {
    if (hh(gx, gy, s + 41) > 0.58) continue;
    var tx = (gx + 0.5 + (hh(gx, gy, s + 42) - 0.5) * 0.6) * 9, ty = (gy + 0.5 + (hh(gx, gy, s + 43) - 0.5) * 0.6) * 9;
    if (tx < 6 || ty < 6 || tx > W - 6 || ty > H - 6) continue;
    var dx = tx - W / 2, dy = ty - H / 2, d = Math.sqrt(dx * dx + dy * dy);
    var dg = Math.min(Math.abs(tx / W - ty / H) * m, Math.abs(tx / W - (1 - ty / H)) * m);
    if (dg < 5.5 || Math.abs(d - R) < 5.5 || d < R) continue;
    if (c && c.rv && riverD(c, X0 + tx, Y0 + ty) < 9) continue;
    addTree(X0 + tx, Y0 + ty, 3.6 + 2.2 * hh(gx, gy, s + 44), true);
  }
}

/* ---------- landmark builders (A = area rect in local metres) ---------- */
var GOLD = 0xd9a520, WHITE = 0xf1ede2, SAND = 0xd6c39a, BRICK = 0xa7402f;
function ctr(A) { return [(A.X0 + A.X1) / 2, (A.Y0 + A.Y1) / 2]; }
function edgeTrees(A, step, inset, park) {
  step *= 1.25;
  for (var x = A.X0 + inset; x < A.X1 - inset + 0.1; x += step) { addTree(x, A.Y0 + inset, 3.4, park); addTree(x, A.Y1 - inset, 3.4, park); }
  for (var y = A.Y0 + inset + step; y < A.Y1 - inset - step + 0.1; y += step) { addTree(A.X0 + inset, y, 3.4, park); addTree(A.X1 - inset, y, 3.4, park); }
}
function gothic(cx, cy, s, spires, wc, rc) {
  wc = wc || SAND; rc = rc || 0x5d6672;
  addBox(cx - 9, cy - 32, cx + 9, cy + 18, 24, { roof: 4, rc: rc, wc: wc, win: 4 });
  addBox(cx - 21, cy - 18, cx + 21, cy - 6, 22, { roof: 3, rc: rc, wc: wc, win: 4 });
  cyl(cx, cy - 32, 9, 0, 20, wc, 4, rc);
  cone(cx, cy - 32, 9, 20, 7, rc);
  addBox(cx - 12, cy + 18, cx - 3, cy + 27, 44, { rc: sh(wc, 0.9), wc: wc, win: 4 });
  addBox(cx + 3, cy + 18, cx + 12, cy + 27, 44, { rc: sh(wc, 0.9), wc: wc, win: 4 });
  addBox(cx - 3, cy + 18, cx + 3, cy + 26, 30, { rc: rc, wc: wc, win: 4, roof: 4 });
  if (spires) { cone(cx - 7.5, cy + 22.5, 4.6, 44, 24, rc, 1); cone(cx + 7.5, cy + 22.5, 4.6, 44, 24, rc, 1); }
  cone(cx, cy - 12, 2.6, 24, 26, rc, 1);
}
function mosqueAt(cx, cy, s, nm, wc, dc) {
  dc = sh(dc, 1.25);
  addBox(cx - 22, cy - 18, cx + 22, cy + 20, 13, { rc: sh(wc, 0.95), wc: wc, win: 2 });
  cyl(cx, cy, 14, 13, 4, wc, 2, sh(wc, 0.9));
  dome(cx, cy, 14, 17, 14, dc, 0);
  var off = [[-14, 0], [14, 0], [0, -13], [0, 13]];
  for (var i = 0; i < 4; i++) dome(cx + off[i][0], cy + off[i][1], 7, 13, 7, dc, 0);
  cone(cx, cy, 0.7, 31, 4, GOLD);
  var mp = nm === 6 ? [[-27, -22], [27, -22], [-27, 24], [27, 24], [-27, 1], [27, 1]] : [[-26, -22], [26, -22], [-26, 24], [26, 24]];
  for (i = 0; i < mp.length; i++) { cyl(cx + mp[i][0], cy + mp[i][1], 1.7, 0, 46, WHITE, 0, WHITE); cone(cx + mp[i][0], cy + mp[i][1], 1.9, 46, 9, dc); }
}
function arch(cx, cy, w, d, h, wc, op) { return addBox(cx - w / 2, cy - d / 2, cx + w / 2, cy + d / 2, h, { wc: wc, rc: sh(wc, 1.05), win: 0, arch: op || 0.3 }); }
function lattice(cx, cy, w, h, col, bands) { return addPart("lat", { cx: cx, cy: cy, w: w, h: h, col: col, bands: bands || 0 }); }
function stalinTower(cx, cy, s, top) { // stepped Stalinist high-rise with a spire
  var o = { wc: 0xe9dcbf, rc: 0xcbbd9c, win: 2 };
  cbox(cx, cy, 100 * s, 36 * s, 30 * s, o);
  var t1 = cbox(cx, cy, 44 * s, 40 * s, 70 * s, o);
  var t2 = cbox(cx, cy, 30 * s, 28 * s, 26 * s, o); t2.z0 = 70 * s;
  var t3 = cbox(cx, cy, 18 * s, 18 * s, 16 * s, o); t3.z0 = 96 * s;
  cone(cx, cy, 6.5 * s, 112 * s, top * s, 0xd8c8a0, 1);
  cone(cx, cy, 0.9 * s, (112 + top) * s, 5 * s, GOLD);
  for (var q = -1; q <= 1; q += 2) { cbox(cx + q * 44 * s, cy, 14 * s, 14 * s, 44 * s, o); cone(cx + q * 44 * s, cy, 5 * s, 44 * s, 12 * s, 0xd8c8a0, 1); }
}
var LIME = 0xe6dcc4;
var LBLD = {
  topkapi: function (A, c, P) {
    var X0 = A.X0 + 6, Y0 = A.Y0 + 6, X1 = A.X1 - 6, Y1 = A.Y1 - 6, o = { roof: 1, rc: 0x8d949a, wc: 0xf1ebdc, win: 2 };
    addBox(X0, Y0, X1, Y0 + 14, 9, o); addBox(X0, Y1 - 14, X1, Y1, 9, o); addBox(X0, Y0 + 14, X0 + 14, Y1 - 14, 9, { roof: 2, rc: 0x8d949a, wc: 0xf1ebdc, win: 2 });
    dome(X0 + 40, Y0 + 40, 7, 9, 6, 0x8d949a, 0); cyl(X0 + 70, Y0 + 7, 3, 9, 16, 0xf1ebdc, 2); cone(X0 + 70, Y0 + 7, 3.3, 25, 7, 0x8d949a);
    for (var q = 0; q < 8; q++) addTree(X0 + 30 + hh(q, 1, LS) * (X1 - X0 - 40), Y0 + 22 + hh(q, 2, LS) * (Y1 - Y0 - 44), 3.4, false);
  },
  galata: function (A, c, P) { var m = ctr(A); cyl(m[0], m[1], 8, 0, 46, 0xc9b48a, 2, 0xb9a47a); cone(m[0], m[1], 8.6, 46, 16, 0x6f7a84); },
  maiden: function (A, c, P) { var m = ctr(A); cbox(m[0], m[1], 16, 12, 8, { rc: 0xd9cfb4, wc: 0xeee6d4, win: 2 }); cyl(m[0] + 4, m[1], 3.4, 8, 14, 0xeee6d4, 2); cone(m[0] + 4, m[1], 3.6, 22, 7, 0x8d949a); },
  wtc: function (A, c, P) { var m = ctr(A); var b = cbox(m[0], m[1], 40, 40, 200, { rc: 0x9fb3c4, wc: 0x7f9fb8, win: 3 }); roofProps(b, LS); cone(m[0], m[1], 1.4, 200, 90, 0xd9dfe4); },
  chrysler: function (A, c, P) {
    var m = ctr(A), cx = m[0], cy = m[1], o = { rc: 0xb9b5a8, wc: 0xc7c3b6, win: 1 };
    cbox(cx, cy, 36, 36, 120, o); var t = cbox(cx, cy, 24, 24, 30, o); t.z0 = 120;
    for (var q = 0; q < 4; q++) { var r = 11 - q * 2.6; dome(cx, cy, r, 150 + q * 8, 9, 0xd9dfe4, 0, 16, 0x9aa3ad); }
    cone(cx, cy, 1.4, 182, 40, 0xe8ecef);
  },
  liberty: function (A, c, P) {
    var m = ctr(A), cx = m[0], cy = m[1];
    cbox(cx, cy, 26, 26, 8, { rc: 0xb9b0a0, wc: 0xa89f8f, win: 0 });
    cbox(cx, cy, 12, 12, 22, { z0: 8, rc: 0xc9c0b0, wc: 0xb9b0a0, win: 0 });
    cyl(cx, cy, 3.2, 30, 15, 0x6fb3a0, 0, 0x7fc3b0); dome(cx, cy, 2.2, 45, 3, 0x6fb3a0, 0); cyl(cx + 2.2, cy, 0.7, 44, 7, 0x6fb3a0); cone(cx + 2.2, cy, 1.1, 51, 2.5, GOLD);
    edgeTrees(A, 10, 8, false);
  },
  bbtower: function (A, c, P) { var m = ctr(A); arch(m[0], m[1], 14, 8, 40, 0xa89676, -2); cone(m[0] - 4.5, m[1], 1, 40, 4, 0x8a7a5e, 1); cone(m[0] + 4.5, m[1], 1, 40, 4, 0x8a7a5e, 1); },
  timessq: function (A, c, P) {
    var m = ctr(A), cx = m[0], cy = m[1], cols = [0xd23c3c, 0x2f5fb3, 0xe8c547, 0x3fa36b, 0xd96aa0, 0xf08a2a];
    for (var q = 0; q < 6; q++) cbox(cx + (q & 1 ? 12 : -12), cy - 25 + (q >> 1) * 22, 16, 18, 40 + 30 * hh(q, 1, LS), { rc: 0x6f7378, wc: cols[q], win: 3 });
  },
  louvre: function (A, c, P) {
    var o = { rc: 0x6f7c8a, wc: LIME, win: 2, roof: 1 }, X0 = A.X0 + 4, X1 = A.X1 - 4, Y0 = A.Y0 + 4, Y1 = A.Y1 - 4;
    addBox(X0, Y0, X1, Y0 + 22, 20, o); addBox(X0, Y0 + 22, X0 + 24, Y1, 20, { rc: 0x6f7c8a, wc: LIME, win: 2, roof: 2 }); addBox(X1 - 24, Y0 + 22, X1, Y1, 20, { rc: 0x6f7c8a, wc: LIME, win: 2, roof: 2 });
    cbox((X0 + X1) / 2, Y0 + 11, 26, 26, 26, { rc: 0x66717d, wc: LIME, win: 2, roof: 1 });
    addPart("cone", { cx: (X0 + X1) / 2, cy: (Y0 + Y1) / 2 + 12, r: 13, z0: 0, h: 20, col: 0x9fc4d8, sq: 1 });
  },
  tuileries: function (A, c, P) { for (var x = A.X0 + 5; x < A.X1 - 4; x += 9) { addTree(x, A.Y0 + 5, 3, false); addTree(x, A.Y1 - 5, 3, false); } },
  concorde: function (A, c, P) { var m = ctr(A); cbox(m[0], m[1], 3, 3, 21, { rc: 0xc9a868, wc: 0xc9a868, win: 0 }); cone(m[0], m[1], 1.6, 21, 3, GOLD, 1); },
  invalides: function (A, c, P) {
    var m = ctr(A), cx = m[0], cy = m[1] + 30;
    addBox(cx - 60, cy - 30, cx + 60, cy + 10, 18, { rc: 0x6f7c8a, wc: LIME, win: 2, roof: 1 });
    cbox(cx, cy + 25, 40, 34, 22, { rc: 0x6f7c8a, wc: LIME, win: 2, cols: 1 });
    cyl(cx, cy + 25, 12, 22, 15, LIME, 2, 0xd8cdb2); dome(cx, cy + 25, 13, 37, 19, GOLD, 0, 18, 0xc49018); cyl(cx, cy + 25, 2, 56, 4, GOLD); cone(cx, cy + 25, 2, 60, 7, GOLD);
  },
  sacrecoeur: function (A, c, P) {
    var m = ctr(A), cx = m[0], cy = m[1], w = 0xf6f3ea;
    addBox(cx - 24, cy - 14, cx + 24, cy + 20, 18, { rc: 0xe8e4da, wc: w, win: 2 });
    cyl(cx, cy, 9, 18, 10, w, 2, 0xe8e4da); dome(cx, cy, 9.5, 28, 16, w, 1, 12, 0xe6e2d8); cone(cx, cy, 1, 44, 5, w);
    var d4 = [[-15, -6], [15, -6], [-15, 14], [15, 14]];
    for (var q = 0; q < 4; q++) { cyl(cx + d4[q][0], cy + d4[q][1], 3.5, 18, 5, w); dome(cx + d4[q][0], cy + d4[q][1], 3.8, 23, 7, w, 1); }
    cbox(cx, cy - 22, 9, 9, 34, { rc: w, wc: w, win: 2 }); dome(cx, cy - 22, 4.5, 34, 7, w, 1);
    for (var x = A.X0 + 5; x < A.X1 - 4; x += 10) addTree(x, A.Y1 - 6, 3.2, false);
  },
  opera: function (A, c, P) {
    var m = ctr(A), cx = m[0], cy = m[1];
    addBox(cx - 34, cy - 44, cx + 34, cy + 30, 24, { rc: 0x7b8b84, wc: LIME, win: 2, roof: 2 });
    cbox(cx, cy + 36, 56, 12, 22, { rc: 0x7b8b84, wc: 0xeee4cc, win: 2, cols: 1 });
    cyl(cx, cy - 8, 14, 24, 5, 0x7b8b84); dome(cx, cy - 8, 15, 29, 10, 0x6f9a7a, 0, 16, 0x5f8a6a); cone(cx, cy - 8, 1.2, 39, 5, GOLD);
  },
  lux: function (A, c, P) {
    var W = A.X1 - A.X0, H = A.Y1 - A.Y0;
    addBox(A.X0 + W * 0.3, A.Y0 + 4, A.X0 + W * 0.7, A.Y0 + 24, 18, { rc: 0x6f7c8a, wc: LIME, win: 2, roof: 1 });
    for (var gy = 0; gy * 9 < H; gy++) for (var gx = 0; gx * 9 < W; gx++) {
      var x = gx * 9 + 4, y = gy * 9 + 4, dx = (x - W / 2) / (W * 0.32), dy = (y - H * 0.58) / (H * 0.3);
      if (dx * dx + dy * dy < 1.15 || y < 30 || hh(gx, gy, LS) > 0.6) continue;
      addTree(A.X0 + x, A.Y0 + y, 3 + 1.6 * hh(gx, gy, LS + 1), true);
    }
  },
  pantheon: function (A, c, P) {
    var m = ctr(A), cx = m[0], cy = m[1];
    addBox(cx - 26, cy - 36, cx + 26, cy + 30, 22, { rc: 0xb9b2a2, wc: LIME, win: 0, cols: 1 });
    cbox(cx, cy + 36, 34, 12, 20, { rc: 0xb9b2a2, wc: 0xeee4cc, win: 0, cols: 2 });
    cyl(cx, cy - 4, 12, 22, 14, LIME, 2, 0xd8cdb2); dome(cx, cy - 4, 12, 36, 14, 0x9aa3ad, 0, 16, 0x8a939d); cyl(cx, cy - 4, 2.4, 50, 6, LIME); cone(cx, cy - 4, 2.4, 56, 3, 0x9aa3ad);
  },
  montparnasse: function (A, c, P) { var m = ctr(A); var b = cbox(m[0], m[1], 44, 30, 130, { rc: 0x4a545e, wc: 0x3f4a54, win: 3 }); roofProps(b, LS); },
  christ: function (A, c, P) {
    var m = ctr(A), cx = m[0], cy = m[1], w = 0xf4f1ea;
    cbox(cx, cy, 58, 58, 28, { rc: 0xe6e2d8, wc: w, win: 2, cols: 1 });
    for (var q = 0; q < 4; q++) { var dx = q === 0 ? 0 : q === 1 ? 0 : q === 2 ? -31 : 31, dy = q === 0 ? -31 : q === 1 ? 31 : 0; cbox(cx + dx, cy + dy, dx ? 6 : 24, dx ? 24 : 6, 24, { rc: 0xe6e2d8, wc: 0xf7f4ee, win: 0, cols: 2 }); }
    var d4 = [[-20, -20], [20, -20], [-20, 20], [20, 20]];
    for (q = 0; q < 4; q++) { cyl(cx + d4[q][0], cy + d4[q][1], 4.2, 28, 8, w, 2, 0xe6e2d8); dome(cx + d4[q][0], cy + d4[q][1], 4.6, 36, 6, GOLD, 0, 12, 0xc49018); cone(cx + d4[q][0], cy + d4[q][1], 0.5, 42, 4, GOLD); }
    cyl(cx, cy, 15, 28, 15, w, 2, 0xe6e2d8);
    dome(cx, cy, 16, 43, 19, GOLD, 0, 20, 0xc49018);
    cone(cx, cy, 1.3, 62, 9, GOLD);
  },
  mcity: function (A, c, P) {
    var m = ctr(A), cx = m[0], cy = m[1];
    cbox(cx, cy + 70, 150, 30, 14, { rc: 0xa9b4bc, wc: 0x9fb8c9, win: 3 });
    var T = [[-75, -55, 32, 32, 190, 0x5f8aa6], [-35, -60, 28, 28, 170, 0x6f97b3], [15, -45, 28, 28, 158, 0xb5653a], [70, -30, 26, 26, 118, 0x7aa3a6],
      [-10, 15, 30, 30, 150, 0x56788f], [45, 25, 26, 26, 132, 0x8a9fb5], [90, 40, 20, 22, 90, 0x6f97b3], [-90, 30, 22, 22, 80, 0x8fb3d0]];
    for (var q = 0; q < T.length; q++) { var t = T[q], b = cbox(cx + t[0], cy + t[1], t[2], t[3], t[4], { rc: 0x8f979e, wc: t[5], win: 3 }); roofProps(b, LS + q); }
    cyl(cx - 55, cy + 25, 16, 0, 126, 0x8fb3d0, 3, 0xa9c6da);
    cone(cx - 55, cy + 25, 3, 126, 10, 0xc9d3db);
  },
  stalinhr: function (A, c, P) { var m = ctr(A); stalinTower(m[0], m[1] - 4, Math.min(A.X1 - A.X0, A.Y1 - A.Y0) / 110, 30); edgeTrees(A, 9, 3.5, false); },
  mgu: function (A, c, P) {
    var m = ctr(A), cx = m[0], cy = m[1] - 30, o = { wc: 0xece1c6, rc: 0xcbbd9c, win: 2 };
    addBox(cx - 150, cy - 12, cx + 150, cy + 12, 40, o);
    for (var q = -1; q <= 1; q += 2) { cbox(cx + q * 150, cy, 26, 26, 64, o); cone(cx + q * 150, cy, 9, 64, 22, 0xd8c8a0, 1); cone(cx + q * 150, cy, 0.8, 86, 4, GOLD); cbox(cx + q * 80, cy + 30, 22, 40, 34, o); }
    cbox(cx, cy, 70, 48, 110, o);
    var t2 = cbox(cx, cy, 48, 36, 40, o); t2.z0 = 110;
    var t3 = cbox(cx, cy, 30, 24, 26, o); t3.z0 = 150;
    var t4 = cbox(cx, cy, 16, 16, 14, o); t4.z0 = 176;
    cone(cx, cy, 7, 190, 46, 0xd8c8a0, 1); cone(cx, cy, 1.2, 236, 6, GOLD);
    for (var x = A.X0 + 8; x < A.X1 - 6; x += 10) { addTree(x, A.Y1 - 6, 3, false); }
  },
  gorky: function (A, c, P) {
    LBLD.bigpark(A, c, P);
    var cx = (A.X0 + A.X1) / 2;
    addBox(cx - 34, A.Y0 + 3, cx + 34, A.Y0 + 14, 17, { wc: 0xf1e6c8, rc: 0xdcd2b8, win: 0, cols: 1 });
    addBox(cx - 56, A.Y0 + 5, cx - 34, A.Y0 + 13, 11, { wc: 0xf1e6c8, rc: 0xdcd2b8, win: 0, cols: 1 });
    addBox(cx + 34, A.Y0 + 5, cx + 56, A.Y0 + 13, 11, { wc: 0xf1e6c8, rc: 0xdcd2b8, win: 0, cols: 1 });
  },
  ostankino: function (A, c, P) {
    var m = ctr(A), cx = m[0], cy = m[1];
    cyl(cx, cy, 11, 0, 26, 0xd6d6d0, 0, 0xc9c9c2);
    cone(cx, cy, 9, 26, 240, 0xe6e6e0, 0, 10, 0xd6d6d0);
    cyl(cx, cy, 7, 200, 13, 0x6f7a84, 3, 0x8a949c);
    cyl(cx, cy, 1.6, 213, 80, 0xd23c3c);
    edgeTrees(A, 9, 3.5, false);
  },
  square: function (A, c, P) { parkTrees(A.X0, A.Y0, A.X1 - A.X0, A.Y1 - A.Y0, LS); },
  bigpark: function (A, c, P) {
    var W = A.X1 - A.X0, H = A.Y1 - A.Y0;
    for (var gy = 0; gy * 8 < H; gy++) for (var gx = 0; gx * 8 < W; gx++) {
      if (hh(gx, gy, LS + 41) > 0.55) continue;
      var x = gx * 8 + 4 + (hh(gx, gy, LS + 42) - 0.5) * 5, y = gy * 8 + 4 + (hh(gx, gy, LS + 43) - 0.5) * 5;
      var dx = x - W / 2, dy = y - H / 2, lx = dx / (W * 0.22), ly = (dy + H * 0.1) / (H * 0.16);
      if (lx * lx + ly * ly < 1.5 || x < 5 || y < 5 || x > W - 5 || y > H - 5) continue;
      var p1 = Math.abs(dx - dy * 0.35 + 8 * Math.sin(y / 30)), p2 = Math.abs(dy - dx * 0.2 + 10 * Math.sin(x / 25));
      if (Math.min(p1, p2) < 4) continue;
      addTree(A.X0 + x, A.Y0 + y, 3 + 2 * hh(gx, gy, LS + 44), true);
    }
  },
  cathedral: function (A, c, P) { var m = ctr(A); gothic(m[0], m[1] - 2, LS, true); edgeTrees(A, 9, 3.5, false); },
  notre: function (A, c, P) { var m = ctr(A); gothic(m[0], m[1] - 2, LS, false, 0xd9cfb4, 0x6b7480); edgeTrees(A, 9, 3.5, false); },
  sobor: function (A, c, P) {
    var m = ctr(A), cx = m[0], cy = m[1] - 4;
    addBox(cx - 13, cy - 13, cx + 13, cy + 13, 18, { rc: 0x5f8f6a, wc: WHITE, win: 2 });
    onionOn(cx, cy, 5.5, 18, GOLD);
    var d4 = [[-8, -8], [8, -8], [-8, 8], [8, 8]];
    for (var i = 0; i < 4; i++) onionOn(cx + d4[i][0], cy + d4[i][1], 3.2, 18, 0x3f6fb5);
    addBox(cx - 4, cy + 20, cx + 4, cy + 28, 24, { rc: WHITE, wc: WHITE, win: 2 });
    cone(cx, cy + 24, 3.8, 24, 12, GOLD, 1);
    edgeTrees(A, 9, 3.5, false);
  },
  church: function (A, c, P) {
    var m = ctr(A), cx = m[0], cy = m[1], ru = c.sty === S_RU;
    addBox(cx - 5, cy - 12, cx + 5, cy + 8, 9, { roof: 4, rc: ru ? 0x5f8f6a : ROOF_R[0], wc: WHITE, win: 2 });
    addBox(cx - 3, cy + 8, cx + 3, cy + 14, 18, { rc: WHITE, wc: WHITE, win: 2 });
    if (ru) onionOn(cx, cy + 11, 2.6, 18, 0x3f6fb5); else cone(cx, cy + 11, 3.2, 18, 11, 0x5d6672, 1);
    if (ru) onionOn(cx, cy - 4, 3, 9, GOLD);
    edgeTrees(A, 10, 3.5, false);
  },
  mosque: function (A, c, P) { var m = ctr(A); mosqueAt(m[0], m[1], LS, 4, 0xe6dcc6, 0x8a9aa8); },
  bluemosque: function (A, c, P) { var m = ctr(A); mosqueAt(m[0], m[1], LS, 6, 0xe6dcc6, 0x7f98ad); },
  hagia: function (A, c, P) { var m = ctr(A); mosqueAt(m[0], m[1], LS, 4, 0xd9a07f, 0x8f99a0); },
  pagoda: function (A, c, P) {
    var m = ctr(A), cx = m[0], cy = m[1];
    for (var t = 0; t < 5; t++) {
      var sz = 20 - 3.4 * t, z = t * 6.4;
      cbox(cx, cy, sz, sz, 4.2, { z0: z, wc: 0xb8402e, rc: 0x3f6b6a, win: 0 });
      cbox(cx, cy, sz + 5, sz + 5, 2.2, { z0: z + 4.2, roof: 1, rc: 0x3f6b6a, wc: 0x2f4f4e, win: 0 });
    }
    cone(cx, cy, 1, 32, 9, GOLD);
    edgeTrees(A, 9, 3.5, true);
  },
  cityhall: function (A, c, P) {
    var m = ctr(A), cx = m[0], cy = m[1];
    addBox(cx - 30, cy - 8, cx + 30, cy + 10, 14, { rc: 0xd6d6d0, wc: 0xeeeeea, win: 2 });
    cyl(cx, cy, 8, 14, 8, 0xeeeeea, 2, 0xd6d6d0);
    dome(cx, cy, 8, 22, 9, 0xeeeeea, 0);
    cone(cx, cy, 1, 31, 4, 0xeeeeea);
  },
  capitol: function (A, c, P) {
    var m = ctr(A), cx = m[0], cy = m[1];
    addBox(cx - 70, cy - 12, cx + 70, cy + 12, 17, { rc: 0xd6d6d0, wc: 0xf0efe9, win: 2 });
    addBox(cx - 18, cy - 18, cx + 18, cy + 18, 21, { rc: 0xd6d6d0, wc: 0xf0efe9, win: 2 });
    cyl(cx, cy, 12, 21, 11, 0xf0efe9, 2, 0xdcdcd6);
    dome(cx, cy, 12, 32, 14, 0xf4f3ee, 0, 16, 0xe2e1da);
    cyl(cx, cy, 2.2, 46, 4, 0xf0efe9); cone(cx, cy, 2.2, 50, 4, 0x6f6a5a);
  },
  kremlin: function (A, c, P) {
    var X0 = A.X0 + 6, X1 = A.X1 - 4, Y0 = A.Y0 + 6, Y1 = A.Y1 - 6, W = X1 - X0, H = Y1 - Y0, wt = 5, wh = 13, i;
    var wo = { rc: 0xb4503c, wc: BRICK, win: 0, cren: 1 }, cream = 0xf1e6c4, yel = 0xe8d28a, grn = 0x5f9a72;
    addBox(X0, Y0, X1, Y0 + wt, wh, wo); addBox(X0, Y1 - wt, X1, Y1, wh, wo);
    addBox(X0, Y0, X0 + wt, Y1, wh, wo); addBox(X1 - wt, Y0, X1, Y1, wh, wo);
    var tw = [[X0, Y0], [X1, Y0], [X0, Y1], [X1, Y1], [X0 + W * 0.5, Y0], [X0 + W * 0.33, Y1], [X0 + W * 0.66, Y1], [X0, Y0 + H * 0.5], [X1, Y0 + H * 0.25], [X1, Y0 + H * 0.8]];
    for (i = 0; i < tw.length; i++) { cbox(tw[i][0], tw[i][1], 11, 11, 22, { rc: 0xb4503c, wc: BRICK, win: 0 }); cbox(tw[i][0], tw[i][1], 7, 7, 6, { z0: 22, rc: BRICK, wc: 0xc0503a, win: 0 }); cone(tw[i][0], tw[i][1], 4.6, 28, 14, 0x3d6b4f, 1); cone(tw[i][0], tw[i][1], 0.6, 42, 3, 0xd23c3c); }
    var sx = X1, sy = Y0 + H * 0.5; // Spasskaya tower
    cbox(sx, sy, 14, 14, 34, { rc: 0xb4503c, wc: BRICK, win: 0, clock: 1 }); cbox(sx, sy, 10, 10, 10, { z0: 34, rc: WHITE, wc: 0xf4efe4, win: 2 }); cone(sx, sy, 5, 44, 20, 0x3d6b4f, 1); cone(sx, sy, 1, 64, 5, 0xd23c3c);
    // palaces: Grand Kremlin Palace above the river wall, Senate (yellow) in the north-east, Arsenal along the north wall
    addBox(X0 + W * 0.18, Y1 - 52, X0 + W * 0.58, Y1 - 18, 24, { roof: 1, rc: grn, wc: cream, win: 2, cols: 1 });
    addBox(X0 + W * 0.66, Y0 + 18, X1 - 20, Y0 + 52, 20, { roof: 1, rc: grn, wc: yel, win: 2 });
    dome(X0 + W * 0.66 + (X1 - 20 - X0 - W * 0.66) / 2, Y0 + 35, 7, 20, 7, grn, 0);
    addBox(X0 + 16, Y0 + 14, X0 + W * 0.42, Y0 + 32, 16, { roof: 1, rc: grn, wc: yel, win: 2 });
    addBox(X0 + 14, Y0 + 32, X0 + 32, Y0 + H * 0.45, 16, { roof: 2, rc: grn, wc: yel, win: 2 });
    // Cathedral Square: Assumption, Archangel, Annunciation and the Ivan the Great bell tower (drawn 1.5x for readability)
    var qx = X0 + W * 0.62, qy = Y0 + H * 0.58, k = 1.5;
    cbox(qx - 34 * k, qy - 22 * k, 24 * k, 20 * k, 15 * k, { rc: WHITE, wc: 0xf6f1e4, win: 2 }); onionOn(qx - 34 * k, qy - 22 * k, 4.2 * k, 15 * k, GOLD);
    for (i = 0; i < 4; i++) onionOn(qx - 34 * k + (i & 1 ? 7 : -7) * k, qy - 22 * k + (i & 2 ? 6 : -6) * k, 2.6 * k, 15 * k, GOLD);
    cbox(qx + 6 * k, qy - 26 * k, 22 * k, 18 * k, 13 * k, { rc: WHITE, wc: 0xf4efe4, win: 2 }); onionOn(qx + 6 * k, qy - 26 * k, 3.8 * k, 13 * k, 0xc9d0d6);
    for (i = 0; i < 4; i++) onionOn(qx + 6 * k + (i & 1 ? 6 : -6) * k, qy - 26 * k + (i & 2 ? 5 : -5) * k, 2.3 * k, 13 * k, i === 0 ? GOLD : 0xc9d0d6);
    cbox(qx - 6 * k, qy + 10 * k, 16 * k, 14 * k, 12 * k, { rc: WHITE, wc: 0xf4efe4, win: 2 });
    for (i = 0; i < 5; i++) onionOn(qx - 6 * k + (i === 4 ? 0 : i & 1 ? 4.5 : -4.5) * k, qy + 10 * k + (i === 4 ? 0 : i & 2 ? 3.5 : -3.5) * k, (i === 4 ? 2.6 : 1.8) * k, 12 * k, GOLD);
    var bx = qx + 30 * k, by = qy - 4 * k;
    cyl(bx, by, 6.5 * k, 0, 26 * k, WHITE, 2, 0xf1ede2); cyl(bx, by, 5.4 * k, 26 * k, 20 * k, WHITE, 2, 0xf1ede2); cyl(bx, by, 4.3 * k, 46 * k, 16 * k, WHITE, 2, 0xf1ede2);
    onionOn(bx, by, 4.2 * k, 62 * k, GOLD);
    addBox(bx + 6 * k, by - 8 * k, bx + 20 * k, by + 8 * k, 22 * k, { rc: WHITE, wc: 0xf4efe4, win: 2 }); onionOn(bx + 13 * k, by, 3 * k, 22 * k, GOLD);
    // gardens: dense trees along the walls and in the south-west
    for (i = 0; i < 220; i++) {
      var tx = X0 + 10 + hh(i, 1, LS) * (W - 20), ty = Y0 + 10 + hh(i, 2, LS) * (H - 20);
      var inSq = Math.abs(tx - qx - 6) < 86 && Math.abs(ty - qy) < 62 || Math.abs(ty - (Y0 + H * 0.47)) < 6 || Math.abs(tx - (X0 + W * 0.5)) < 6 && ty < Y0 + H * 0.5, inPal = tx > X0 + W * 0.16 && tx < X0 + W * 0.6 && ty > Y1 - 56, inSen = tx > X0 + W * 0.64 && ty < Y0 + 56, inArs = tx < X0 + W * 0.44 && ty < Y0 + 36 || tx < X0 + 36 && ty < Y0 + H * 0.47;
      if (inSq || inPal || inSen || inArs) continue;
      addTree(tx, ty, 3.4 + 2.2 * hh(i, 3, LS), hh(i, 4, LS) < 0.25);
    }
  },
  redsquare: function (A, c, P) {
    var cx = (A.X0 + A.X1) / 2 - 6, k = 1.6, by = A.Y1 - 30 * k, i;
    // St Basil's: central tented tower and eight coloured onion domes on drums
    cbox(cx, by, 30 * k, 26 * k, 6 * k, { rc: 0xb4503c, wc: BRICK, win: 0 });
    cyl(cx, by, 6 * k, 6 * k, 14 * k, BRICK, 2, 0xb4503c);
    cone(cx, by, 6 * k, 20 * k, 22 * k, 0x5f8f6a, 0, 16, 0xe8d28a); onionOn(cx, by, 1.6 * k, 42 * k, GOLD);
    var cols = [[0xd23c3c, 0x3f8f4f], [0x2f5fb3, 0xf1ede2], [0xe0b030, 0x3f8f4f], [0xd23c3c, 0xf1ede2], [0x3f8f4f, 0xe0b030], [0x2f5fb3, 0xe0b030], [0xd23c3c, 0x2f5fb3], [0x3f8f4f, 0xf1ede2]];
    for (i = 0; i < 8; i++) { var a = i * Math.PI / 4, x = cx + Math.cos(a) * 11 * k, y = by + Math.sin(a) * 9 * k, hb = (i & 1 ? 9 : 12) * k; cyl(x, y, 2.6 * k, 0, hb, BRICK, 2, 0xb4503c); dome(x, y, 3.4 * k, hb, 7.5 * k, cols[i][0], 1, 10, cols[i][1]); cone(x, y, 0.4 * k, hb + 7.5 * k, 2.5 * k, GOLD); }
    // Lenin's mausoleum by the wall, GUM along the east side, the red Historical Museum closing the north end
    addBox(A.X0 + 4, (A.Y0 + A.Y1) / 2 - 12, A.X0 + 16, (A.Y0 + A.Y1) / 2 + 10, 7, { rc: 0x5a2a28, wc: 0x7a2f2c, win: 0 });
    addBox(A.X1 - 22, A.Y0 + 40, A.X1 - 2, A.Y1 - 70 * k * 0.6 - 30, 17, { roof: 4, rc: 0x9fb8c9, wc: 0xe2d8c4, win: 2 });
    addBox(A.X0 + 8, A.Y0 + 2, A.X1 - 8, A.Y0 + 28, 22, { roof: 3, rc: 0x8a5a48, wc: 0xb24a34, win: 4 });
    for (i = 0; i < 4; i++) { var tx = A.X0 + 12 + i * (A.X1 - A.X0 - 24) / 3; cbox(tx, A.Y0 + 26, 6, 6, 32, { rc: 0xb24a34, wc: 0xb24a34, win: 0 }); cone(tx, A.Y0 + 26, 3.4, 32, 10, 0x6b7a72, 1); }
  },
  theatre: function (A, c, P) {
    var m = ctr(A), cx = m[0], cy = m[1];
    addBox(cx - 24, cy - 30, cx + 24, cy + 16, 22, { roof: 4, rc: 0x7b8b84, wc: 0xefe5cc, win: 2 });
    addBox(cx - 16, cy + 16, cx + 16, cy + 26, 20, { roof: 3, rc: 0x7b8b84, wc: 0xf4efe0, win: 2, cols: 1 });
    edgeTrees(A, 9, 3.5, false);
  },
  winter: function (A, c, P) {
    var X0 = A.X0 + 3, X1 = A.X1 - 3, Y0 = A.Y0 + 3, Y1 = A.Y1 - 3, D = 18, o = { rc: 0x8a9a8e, wc: 0x7fb79a, win: 2, cols: 1 };
    addBox(X0, Y0, X1, Y0 + D, 22, o); addBox(X0, Y1 - D, X1, Y1, 22, o);
    addBox(X0, Y0 + D, X0 + D, Y1 - D, 22, o); addBox(X1 - D, Y0 + D, X1, Y1 - D, 22, o);
  },
  palacesq: function (A, c, P) { var m = ctr(A); cbox(m[0], m[1], 6, 6, 4, { rc: 0xb08a7a, wc: 0xb08a7a, win: 0 }); cyl(m[0], m[1], 2, 4, 38, 0xb08a7a); cyl(m[0], m[1], 1, 42, 4, 0x6b5a3a); },
  isaac: function (A, c, P) {
    var m = ctr(A), cx = m[0], cy = m[1];
    addBox(cx - 26, cy - 22, cx + 26, cy + 22, 26, { rc: 0x8f9a92, wc: 0xb3b1a9, win: 2, cols: 1 });
    cyl(cx, cy, 13, 26, 14, 0xb3b1a9, 2, 0x9a9890);
    dome(cx, cy, 13, 40, 15, GOLD, 0, 24, 0xc49018);
    cyl(cx, cy, 2.4, 55, 5, 0xb3b1a9); cone(cx, cy, 2.4, 60, 5, GOLD);
    var d4 = [[-19, -15], [19, -15], [-19, 15], [19, 15]];
    for (var i = 0; i < 4; i++) { cyl(cx + d4[i][0], cy + d4[i][1], 3.6, 26, 5, 0xb3b1a9); dome(cx + d4[i][0], cy + d4[i][1], 3.6, 31, 4, GOLD, 0); }
  },
  eiffel: function (A, c, P) {
    var cx = (A.X0 + A.X1) / 2, cy = A.Y0 + 50;
    lattice(cx, cy, 40, 230, 0x9a7454, 0);
    for (var y = A.Y0 + 108; y < A.Y1 - 6; y += 9) { addTree(A.X0 + 5, y, 2.7, false); addTree(A.X1 - 5, y, 2.7, false); }
  },
  arc: function (A, c, P) { var m = ctr(A); arch(m[0], m[1], 42, 20, 46, 0xdcd2b6, 0.3); },
  arcmd: function (A, c, P) { var m = ctr(A); arch(m[0], m[1], 13, 9, 14, 0xe8dcc0, 0.38); edgeTrees(A, 9, 3.5, false); },
  parliament: function (A, c, P) {
    var X0 = A.X0 + 4, X1 = A.X1 - 4, cy = (A.Y0 + A.Y1) / 2 - 4, wc = 0xcdb886;
    addBox(X0 + 14, cy - 15, X1 - 18, cy + 15, 24, { roof: 3, rc: 0x6b7480, wc: wc, win: 4 });
    for (var x = X0 + 22; x < X1 - 24; x += 14) { cone(x, cy + 14, 1.1, 24, 6, wc, 1); cone(x, cy - 14, 1.1, 24, 6, wc, 1); }
    cbox(X1 - 9, cy + 8, 13, 13, 70, { rc: wc, wc: wc, win: 4, clock: 1 }); cone(X1 - 9, cy + 8, 6.5, 70, 26, 0x5d6672, 1); cone(X1 - 9, cy + 8, 0.6, 96, 5, GOLD);
    cbox(X0 + 10, cy, 22, 22, 82, { rc: wc, wc: wc, win: 4 });
    for (var i = 0; i < 4; i++) cone(X0 + 10 + (i & 1 ? 9 : -9), cy + (i & 2 ? 9 : -9), 1.4, 82, 9, GOLD, 1);
    for (x = A.X0 + 6; x < A.X1; x += 10) addTree(x, A.Y1 - 4, 2.6, false);
  },
  colosseum: function (A, c, P) { var m = ctr(A); addPart("ring", { cx: m[0], cy: m[1], rx: Math.min(48, (A.X1 - A.X0) / 2 - 3), ry: Math.min(40, (A.Y1 - A.Y0) / 2 - 3), qi: 0.62, h: 44, col: 0xd3c29b, col2: 0xc2b088, arch: 1 }); },
  stadium: function (A, c, P) { var m = ctr(A); addPart("ring", { cx: m[0], cy: m[1], rx: (A.X1 - A.X0) / 2 - 6, ry: (A.Y1 - A.Y0) / 2 - 6, qi: 0.7, h: 28, col: 0xd6d8da, col2: 0x3f6fb5, arch: 0 }); },
  stpeter: function (A, c, P) {
    var m = ctr(A), cx = m[0], cy = m[1] - 8;
    addBox(cx - 30, cy - 26, cx + 30, cy + 22, 30, { rc: 0x9a9286, wc: 0xd8cdb0, win: 2, cols: 1 });
    cyl(cx, cy - 6, 14, 30, 14, 0xd8cdb0, 2, 0xc8bea2);
    dome(cx, cy - 6, 14, 44, 19, 0x8aa0b0, 0, 16, 0x7a909f);
    cyl(cx, cy - 6, 2.6, 63, 5, 0xd8cdb0); cone(cx, cy - 6, 2.6, 68, 5, 0x8aa0b0);
  },
  empire: function (A, c, P) {
    var m = ctr(A), cx = m[0], cy = m[1], o = { rc: 0xb9b5a8, wc: 0xc7c3b6, win: 1 };
    cbox(cx, cy, 56, 46, 20, o);
    var t1 = cbox(cx, cy, 42, 32, 60, o); t1.z0 = 20;
    var t2 = cbox(cx, cy, 30, 24, 130, o); t2.z0 = 80;
    var t3 = cbox(cx, cy, 20, 16, 50, o); t3.z0 = 210;
    var t4 = cbox(cx, cy, 10, 10, 18, o); t4.z0 = 260;
    cone(cx, cy, 2.5, 278, 30, 0xd9dcdf);
  },
  cathedral_md: function (A, c, P) {
    var m = ctr(A), cx = m[0] - 8, cy = m[1] + 2;
    addBox(cx - 16, cy - 7, cx + 16, cy + 7, 14, { rc: 0xdcd8cc, wc: 0xf2efe6, win: 2, cols: 1 });
    addBox(cx - 7, cy - 16, cx + 7, cy + 16, 14, { rc: 0xdcd8cc, wc: 0xf2efe6, win: 2, cols: 1 });
    cyl(cx, cy, 6.5, 14, 8, 0xf2efe6, 2, 0xdcd8cc);
    dome(cx, cy, 6.8, 22, 7.5, 0x5f9a8f, 0, 12, 0x4f8a80); cone(cx, cy, 0.5, 29.5, 3.5, GOLD);
    var bx = m[0] + 22, by = m[1] + 14;
    cbox(bx, by, 9, 9, 22, { rc: 0xdcd8cc, wc: 0xf2efe6, win: 2 });
    cyl(bx, by, 3.6, 22, 8, 0xf2efe6, 2); dome(bx, by, 3.8, 30, 5, 0x5f9a8f, 0); cone(bx, by, 0.4, 35, 3, GOLD);
    edgeTrees(A, 9, 3.5, false);
  },
  parl_md: function (A, c, P) { var m = ctr(A); var b = addBox(m[0] - 34, m[1] - 10, m[0] + 34, m[1] + 12, 30, { rc: 0xc9ccce, wc: 0xb7c4cc, win: 3 }); roofProps(b, LS); edgeTrees(A, 9, 3.5, false); },
  sophia: function (A, c, P) {
    var m = ctr(A), cx = m[0] - 6, cy = m[1];
    addBox(cx - 18, cy - 15, cx + 18, cy + 15, 15, { roof: 1, rc: 0x5e8f6b, wc: WHITE, win: 2 });
    onionOn(cx, cy, 5, 15, GOLD);
    var d4 = [[-10, -8], [10, -8], [-10, 8], [10, 8]];
    for (var i = 0; i < 4; i++) onionOn(cx + d4[i][0], cy + d4[i][1], 3, 15, 0x5e8f6b);
    var bx = m[0] + 26, by = m[1] + 16;
    cbox(bx, by, 9, 9, 30, { rc: 0x8fb6d8, wc: 0x8fb6d8, win: 2 }); onionOn(bx, by, 3.2, 30, GOLD);
    edgeTrees(A, 9, 3.5, false);
  },
  pyramids: function (A, c, P) {
    var W = A.X1 - A.X0, H = A.Y1 - A.Y0, s = Math.min(W, H) / 330;
    var pyr = function (fx, fy, hb, h, col) { addPart("cone", { cx: A.X0 + W * fx, cy: A.Y0 + H * fy, r: hb * s, z0: 0, h: h * s, col: col, sq: 1, step: 1 }); };
    pyr(0.68, 0.3, 70, 92, 0xd8b673); pyr(0.44, 0.55, 64, 86, 0xd2ae6a); pyr(0.22, 0.8, 32, 42, 0xcc9f62);
  },
  forbidden: function (A, c, P) {
    var X0 = A.X0 + 4, X1 = A.X1 - 4, Y0 = A.Y0 + 4, Y1 = A.Y1 - 4, wo = { rc: 0xe0a92c, wc: 0xa8392b, win: 0, roof: 0 }, cx = (X0 + X1) / 2;
    addBox(X0, Y0, X1, Y0 + 4, 9, wo); addBox(X0, Y1 - 4, X1, Y1, 9, wo); addBox(X0, Y0, X0 + 4, Y1, 9, wo); addBox(X1 - 4, Y0, X1, Y1, 9, wo);
    var corners = [[X0, Y0], [X1, Y0], [X0, Y1], [X1, Y1]];
    for (var i = 0; i < 4; i++) cbox(corners[i][0], corners[i][1], 12, 12, 13, { roof: 1, rc: 0xe0a92c, wc: 0xa8392b, win: 0 });
    var halls = [[0.22, 54, 28, 14], [0.45, 66, 34, 17], [0.68, 44, 24, 12], [0.9, 60, 18, 13]];
    for (i = 0; i < halls.length; i++) {
      var hy = Y0 + (Y1 - Y0) * halls[i][0];
      cbox(cx, hy, halls[i][1] + 10, halls[i][2] + 10, 3, { rc: 0xe6e2d8, wc: 0xe6e2d8, win: 0 });
      var hb = cbox(cx, hy, halls[i][1], halls[i][2], halls[i][3], { roof: 1, rc: 0xe0a92c, wc: 0xb23a2a, win: 0 }); hb.z0 = 3;
    }
  },
  tokyotower: function (A, c, P) { var m = ctr(A); lattice(m[0], m[1], 40, 200, 0xe2572f, 1); edgeTrees(A, 9, 3.5, false); },
  burj: function (A, c, P) {
    var m = ctr(A), cx = m[0], cy = m[1], g = 0x9fb3c4;
    var st = [[22, 0, 110], [17, 110, 110], [12, 220, 100], [8, 320, 80], [5, 400, 40]];
    for (var i = 0; i < st.length; i++) cyl(cx, cy, st[i][0], st[i][1], st[i][2], g, 3, 0xc9d3db);
    cone(cx, cy, 3, 440, 50, 0xd9dfe4);
  },
  brandenburg: function (A, c, P) {
    var m = ctr(A), cx = m[0], cy = m[1];
    arch(cx, cy, 62, 12, 20, 0xd8c8a0, -5);
    cbox(cx, cy, 34, 9, 5, { z0: 20, rc: 0xcbbb92, wc: 0xd8c8a0, win: 0 });
    cbox(cx, cy, 6, 4, 3, { z0: 25, rc: 0x3f6b5a, wc: 0x2f5246, win: 0 });
  },
  reichstag: function (A, c, P) {
    var m = ctr(A), cx = m[0], cy = m[1], wc = 0xcfc3a3, W = Math.min(110, A.X1 - A.X0 - 6), H = Math.min(70, A.Y1 - A.Y0 - 6);
    addBox(cx - W / 2, cy - H / 2, cx + W / 2, cy + H / 2, 24, { rc: 0x8f948a, wc: wc, win: 2, cols: 1 });
    var d4 = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
    for (var i = 0; i < 4; i++) cbox(cx + d4[i][0] * (W / 2 - 8), cy + d4[i][1] * (H / 2 - 8), 18, 18, 30, { rc: 0x8f948a, wc: wc, win: 2 });
    dome(cx, cy, 12, 24, 13, 0xbfd8e6, 0, 20, 0x8fb3c8);
  },
  sagrada: function (A, c, P) {
    var m = ctr(A), cx = m[0], cy = m[1], wc = 0xc9b48a;
    addBox(cx - 30, cy - 20, cx + 30, cy + 20, 30, { roof: 3, rc: 0xa89670, wc: wc, win: 4 });
    for (var i = 0; i < 4; i++) { cone(cx - 15 + i * 10, cy + 22, 3.4, 0, 98, wc, 0, 9, 0xb7a276); cone(cx - 15 + i * 10, cy - 22, 3.2, 0, 90, wc, 0, 9, 0xb7a276); }
    cone(cx, cy, 6, 30, 110, 0xd2c09a, 0, 12, 0xbfae86); cone(cx, cy, 1, 140, 6, 0xf2f2ee);
  },
  mall: function (A, c, P) {
    var m = ctr(A); cbox(m[0], m[1], 7, 7, 150, { rc: 0xeeeeea, wc: 0xeeeeea, win: 0 }); cone(m[0], m[1], 3.5, 150, 10, 0xeeeeea, 1);
    for (var x = A.X0 + 6; x < A.X1 - 4; x += 9) { addTree(x, A.Y0 + 13, 2.8, false); addTree(x, A.Y1 - 13, 2.8, false); }
  },
  indiagate: function (A, c, P) { var m = ctr(A); arch(m[0], m[1], 30, 10, 40, 0xc98a6a, 0.34); for (var x = A.X0 + 6; x < A.X1 - 4; x += 9) { addTree(x, A.Y0 + 13, 2.8, false); addTree(x, A.Y1 - 13, 2.8, false); } },
  acropolis: function (A, c, P) {
    var m = ctr(A), cx = m[0], cy = m[1], W = (A.X1 - A.X0) * 0.92, H = (A.Y1 - A.Y0) * 0.92;
    cbox(cx, cy, W, H, 14, { rc: 0xc6b48d, wc: 0xa8956d, win: 0 });
    var p = cbox(cx + 8, cy - 6, 68, 30, 14, { roof: 3, rc: 0xe2dccc, wc: 0xefe9dc, win: 0, cols: 2 }); p.z0 = 14;
    var e = cbox(cx - 40, cy + 22, 26, 16, 10, { rc: 0xe2dccc, wc: 0xefe9dc, win: 0, cols: 2 }); e.z0 = 14;
  }
};

/* ---------- object rendering ---------- */
function put(out, i, c) { out[i] = (c >> 16) & 255; out[i + 1] = (c >> 8) & 255; out[i + 2] = c & 255; }
function darken(out, msk, px, py, f) {
  if (px < 0 || py < 0 || px >= TS || py >= TS) return;
  var j = py * TS + px;
  if (msk[j]) return;
  msk[j] = 3;
  var i = j * 4;
  out[i] = out[i] * f; out[i + 1] = out[i + 1] * f; out[i + 2] = out[i + 2] * f * 1.07;
}
var SHX = 0.55, SHY = 0.2, SHF = 0.68;
function shadowPoly(out, msk, x0, y0, x1, y1, vx, vy) { // sweep of rect [x0,x1)x[y0,y1) along (vx,vy)
  var ya = Math.max(0, Math.floor(Math.min(y0, y0 + vy))), yb = Math.min(TS, Math.ceil(Math.max(y1, y1 + vy)));
  for (var py = ya; py < yb; py++) {
    var yc = py + 0.5, t0, t1;
    if (Math.abs(vy) < 1e-6) { if (yc < y0 || yc >= y1) continue; t0 = 0; t1 = 1; }
    else { t0 = (yc - y1) / vy; t1 = (yc - y0) / vy; if (t0 > t1) { var q = t0; t0 = t1; t1 = q; } if (t0 < 0) t0 = 0; if (t1 > 1) t1 = 1; if (t0 > t1) continue; }
    var xa = Math.max(0, Math.round(x0 + Math.min(t0 * vx, t1 * vx))), xb = Math.min(TS, Math.round(x1 + Math.max(t0 * vx, t1 * vx)));
    for (var px = xa; px < xb; px++) darken(out, msk, px, py, SHF);
  }
}
function roofPix(b, rx, ry, w, d, sc) {
  var c = b.rc, R = b.roof;
  if (w < 3 || d < 3) return R ? sh(c, ry < d / 2 ? 1.08 : 0.88) : c;
  if (rx === 0 || ry === 0 || rx === w - 1 || ry === d - 1) return sh(c, rx === 0 || ry === 0 ? 0.74 : 0.6);
  if (b.cren) return ((Math.floor(rx / Math.max(1, sc * 1.4)) & 1) || ry !== 1) ? sh(c, 1.08) : sh(c, 0.7);
  if (R === 0) {
    var pw = sc > 2.4 ? 2 : 1;
    if (rx <= pw || ry <= pw) return sh(c, 1.15);
    if (rx >= w - 1 - pw || ry >= d - 1 - pw) return sh(c, 1.05);
    if (sc > 1.2 && (rx === pw + 1 || ry === pw + 1)) return sh(c, 0.85);
    if (sc > 1.4) { var n = hh(rx >> 1, ry >> 1, b.id); if (n < 0.06) return sh(c, 0.94); if (n > 0.975) return sh(c, 1.05); }
    return c;
  }
  var dN = ry, dS = d - 1 - ry, dW = rx, dE = w - 1 - rx, mNS = Math.min(dN, dS), mWE = Math.min(dW, dE);
  var alongX = R === 1 || R === 3, hip = R === 1 || R === 2, face, dist;
  if (alongX) { if (hip && mWE < mNS) { face = dW < dE ? 2 : 3; dist = mWE; } else { face = dN <= dS ? 0 : 1; dist = mNS; } }
  else { if (hip && mNS < mWE) { face = dN < dS ? 0 : 1; dist = mNS; } else { face = dW <= dE ? 2 : 3; dist = mWE; } }
  if (alongX ? (Math.abs(dN - dS) <= 1 && (!hip || mWE >= mNS)) : (Math.abs(dW - dE) <= 1 && (!hip || mNS >= mWE))) return sh(c, 1.25);
  if (hip && Math.abs(mWE - mNS) < 0.6) return sh(c, 0.82);
  var f = face === 0 ? 1.1 : face === 1 ? 0.86 : face === 2 ? 1.0 : 0.76;
  if (sc > 1.6 && (dist & 1) === 1) f *= 0.91;
  if (sc > 2 && ((rx * 3 + ry * 7 + b.id) % 13) === 0) f *= 0.93;
  return sh(c, f);
}
function wallPix(b, rx, hy, w, Hw, sc, zb) {
  var c = sh(b.wc, 0.93);
  if (rx === 0 || rx === w - 1) return sh(c, 0.66);
  var top = Hw - 1 - hy;
  if (top === 0) return sh(c, 1.16);
  if (top === 1 && Hw > 6) return sh(c, 0.8);
  if (hy === 0 && zb === 0 && Hw > 3) return sh(c, 0.56);
  var fsc = F_OBL * sc, z = (hy + 0.5) / fsc + b.z0, zr = z - b.z0;
  if (b.arch) { // gate / triumphal arch openings
    var u = (rx + 0.5) / w;
    if (b.arch > 0) { if (Math.abs(u - 0.5) < b.arch / 2 && zr < b.h * 0.62 - Math.pow((u - 0.5) / (b.arch / 2), 2) * b.h * 0.08) return 0x3a3633; }
    else { var nO = -b.arch, cu = u * nO, cf2 = cu - Math.floor(cu); if (cf2 > 0.3 && cf2 < 0.7 && zr < b.h * 0.72) return 0x3a3633; if (cf2 < 0.1 || cf2 > 0.9) return sh(c, 1.12); }
    if (top < Math.max(2, Hw * 0.12)) return sh(c, 1.08);
    return c;
  }
  if (b.cols && sc > 0.7) { var cpp = Math.max(2, Math.round(2.2 * sc)); if (rx % cpp < Math.max(1, cpp >> 1)) return sh(c, 1.12); if (b.cols === 2) return sh(c, 0.7); }
  if (b.clock && sc > 0.5) { var cz = b.h * 0.8, dzc = zr - cz, dxc = (rx - w / 2) / sc; if (dxc * dxc + dzc * dzc < 16) return (dxc * dxc + dzc * dzc < 11) ? 0xf2ead0 : 0x2b2b2b; }
  if (b.win === 0) return c;
  if (b.win === 3) {
    var cp3 = Math.max(2, Math.round(1.6 * sc)), fp3 = 3.4 * fsc;
    if (fp3 >= 2.5 && (Math.floor(zr * fsc) % Math.max(2, Math.round(fp3))) === 0) return sh(b.wc, 0.62);
    if (rx % cp3 === 0) return sh(b.wc, 0.72);
    return ((rx + hy) % 29 < 6) ? sh(b.wc, 1.28) : sh(b.wc, 0.97 + 0.08 * ((hy / Math.max(1, Hw)) - 0.5));
  }
  var fp = 3.1 * fsc;
  if (fp < 2.2) return (hy & 1) && fp >= 1.4 ? sh(c, 0.85) : c;
  var fl = Math.floor(zr / 3.1), fz = zr - fl * 3.1;
  var cp = 3.0 * sc, col = (rx - 1) / cp, ci = Math.floor(col), cf = col - ci;
  var wx = cf > 0.32 && cf < 0.76 && cp * 0.44 >= 0.8;
  if (b.win === 4) { // gothic lancets
    var gx = cf > 0.36 && cf < 0.64, gz = (zr % 9) > 1.5 && (zr % 9) < 7.5;
    if (gx && gz) return (zr % 9) > 6.6 ? sh(c, 0.75) : 0x3f4f63;
    if (cf < 0.08) return sh(c, 1.1);
    return c;
  }
  if (b.z0 === 0 && fl === 0) {
    if (b.aw >= 0) {
      if (fz > 2.25 && fz < 2.95) return ((Math.floor(rx / Math.max(1, sc * 0.75))) & 1) ? b.aw : 0xf2ede2;
      if (fz > 0.2 && fz <= 2.25 && cf > 0.1 && cf < 0.92) return fz > 1.85 ? 0x7f9bb5 : 0x33465a;
    }
    if (ci === b.door && cf > 0.25 && cf < 0.8 && fz < 2.3) return 0x5a3d2a;
  }
  var wy = b.win === 2 ? fz > 0.5 && fz < 2.6 : fz > 0.9 && fz < 2.3;
  if (wx && wy) {
    if (fz > (b.win === 2 ? 2.35 : 2.05)) return 0x8fb0c8;
    return hh(ci, fl, b.id) < 0.07 ? 0xf2d27a : 0x34465c;
  }
  if (wx && fz > (b.win === 2 ? 0.25 : 0.65) && fz <= (b.win === 2 ? 0.5 : 0.9)) return sh(c, 1.2);
  return c;
}
function drawBox(out, msk, o) {
  var b = o.o, sc = o.sc;
  var ix0 = Math.round(o.x0), ix1 = Math.round(o.x1), iy0 = Math.round(o.y0), iy1 = Math.round(o.y1);
  var it = Math.round((b.z0 + b.h) * F_OBL * sc), ib = Math.round(b.z0 * F_OBL * sc);
  if (ix1 <= ix0) ix1 = ix0 + 1;
  if (iy1 <= iy0) iy1 = iy0 + 1;
  var w = ix1 - ix0, d = iy1 - iy0, Hw = it - ib, roofTop = iy0 - it, wallTop = iy1 - it, wallBot = iy1 - ib;
  var ya = roofTop < 0 ? 0 : roofTop, yb = wallBot > TS ? TS : wallBot, xa = ix0 < 0 ? 0 : ix0, xb = ix1 > TS ? TS : ix1;
  for (var py = ya; py < yb; py++) for (var px = xa; px < xb; px++) {
    var c = py < wallTop ? roofPix(b, px - ix0, py - roofTop, w, d, sc) : wallPix(b, px - ix0, wallBot - 1 - py, w, Hw, sc, ib);
    var j = py * TS + px;
    put(out, j * 4, c); msk[j] = 1;
  }
  if (b.pr && sc > 0.9) {
    for (var q = 0; q < b.pr.length; q++) {
      var p = b.pr[q];
      var px0 = Math.round(o.ax + p[0] * sc), px1 = Math.round(o.ax + p[2] * sc), py0 = Math.round(o.ay + p[1] * sc - it), py1 = Math.round(o.ay + p[3] * sc - it);
      var ph = Math.max(1, Math.round(p[4] * F_OBL * sc)), sw = Math.round(p[4] * SHX * sc);
      if (px1 <= px0) px1 = px0 + 1;
      for (py = py0 - ph; py < py1; py++) for (px = px0; px < px1 + sw; px++) {
        if (px < 0 || py < 0 || px >= TS || py >= TS) continue;
        var jj = py * TS + px, cc;
        if (px >= px1) { if (py >= py0 && py < py1 && msk[jj] === 1) { var ii = jj * 4; out[ii] *= 0.78; out[ii + 1] *= 0.78; out[ii + 2] *= 0.8; } continue; }
        if (py < py1 - ph) cc = (py === py0 - ph) ? sh(p[5], 1.12) : p[5];
        else cc = (px === px0 ? sh(p[5], 0.6) : sh(p[5], 0.72));
        put(out, jj * 4, cc); msk[jj] = 1;
      }
    }
  }
}
function shadowBox(out, msk, o) {
  var b = o.o, ht = (b.z0 + b.h) * o.sc;
  shadowPoly(out, msk, o.x0, o.y0, o.x1, o.y1, ht * SHX, ht * SHY);
}
function shadowTree(out, msk, o) {
  var r = o.r, cx = o.x + r * 0.55, cy = o.y - o.t * 0.2 + r * 0.05, rx = r * 1.05, ry = r * 0.85;
  for (var py = Math.floor(cy - ry); py <= Math.ceil(cy + ry); py++) for (var px = Math.floor(cx - rx); px <= Math.ceil(cx + rx); px++) {
    var dx = (px + 0.5 - cx) / rx, dy = (py + 0.5 - cy) / ry;
    if (dx * dx + dy * dy <= 1) darken(out, msk, px, py, 0.7);
  }
}
var BLOB = new Float64Array(30);
function drawTree(out, msk, o) {
  var r = o.r, P = TP[o.o.pal], id = o.o.id;
  var cx = o.x, cyc = o.y - o.t - r * 0.75;
  var n = r < 2.5 ? 1 : r < 5 ? 5 : 7, i;
  // crown = union of a few blobs (cauliflower look)
  BLOB[0] = cx; BLOB[1] = cyc; BLOB[2] = n === 1 ? r : r * 0.66;
  for (i = 1; i < n; i++) {
    var a = (i / (n - 1)) * 6.283 + hh(i, 1, id) * 0.9, rr = r * (0.38 + 0.08 * hh(i, 2, id));
    BLOB[i * 3] = cx + Math.cos(a) * rr; BLOB[i * 3 + 1] = cyc + Math.sin(a) * rr * 0.92; BLOB[i * 3 + 2] = r * (0.5 + 0.12 * hh(i, 3, id));
  }
  if (r >= 2.5) { var tx = Math.floor(cx), base = Math.round(o.y); for (var ty = base - Math.round(o.t) - 1; ty <= base; ty++) if (ty >= 0 && ty < TS && tx >= 0 && tx < TS) { put(out, (ty * TS + tx) * 4, 0x5a3e28); msk[ty * TS + tx] = 2; } }
  var y0 = Math.max(0, Math.floor(cyc - r - 1)), y1 = Math.min(TS - 1, Math.ceil(cyc + r + 1)), x0 = Math.max(0, Math.floor(cx - r - 1)), x1 = Math.min(TS - 1, Math.ceil(cx + r + 1));
  for (var py = y0; py <= y1; py++) for (var px = x0; px <= x1; px++) {
    var X = px + 0.5, Y = py + 0.5, best = -1, bq = 0, inner = 1e9;
    for (i = 0; i < n; i++) {
      var dx = X - BLOB[i * 3], dy = Y - BLOB[i * 3 + 1], R2 = BLOB[i * 3 + 2], q = (dx * dx + dy * dy) / (R2 * R2);
      if (q < 1) { var e = R2 * (1 - Math.sqrt(q)); if (best < 0 || dy / R2 + dx / R2 * 0.3 > bq) { best = i; bq = dy / R2 + dx / R2 * 0.3; } if (e < inner) inner = e; }
    }
    if (best < 0) continue;
    var gd = ((X - cx) * 0.7 + (Y - cyc)) / r; // global light: upper-left bright
    var bdx = (X - BLOB[best * 3]) / BLOB[best * 3 + 2], bdy = (Y - BLOB[best * 3 + 1]) / BLOB[best * 3 + 2];
    var l = -(bdx * 0.6 + bdy * 0.8) * 0.9 - gd * 0.7;
    var c = l > 0.75 ? P[0] : l > 0.1 ? P[1] : l > -0.6 ? P[2] : P[3];
    var outer = true;
    for (i = 0; i < n && outer; i++) { var ex = X - BLOB[i * 3], ey = Y - BLOB[i * 3 + 1], ER = BLOB[i * 3 + 2] - 1; if (ER > 0 && ex * ex + ey * ey < ER * ER) outer = false; }
    if (outer && r >= 2.2) c = gd > -0.2 ? P[4] : P[3];
    else if (r >= 3.5 && hh(px, py, id) < 0.08) c = l > 0 ? P[0] : P[2];
    var j = py * TS + px;
    put(out, j * 4, c); msk[j] = 2;
  }
}
/* ray-marched parts: return colour at local point or -1 */
var DZ = 0.5;
function onion(u) { return u < 0.32 ? 0.84 + 0.36 * Math.sin(u / 0.32 * 1.5708) : 1.2 * Math.pow(Math.max(0, 1 - (u - 0.32) / 0.68), 1.25); }
function shadeL(col, l) { if (l > 1.18) return mix(sh(col, 1.18), 0xfff3c0, Math.min(0.6, (l - 1.18) * 2)); return sh(col, l < 0.42 ? 0.42 : l); }
function ribCol(p, dx, dy) { if (!p.rib) return p.col; var a = Math.atan2(dy, dx); return (Math.floor((a / 6.2832 + 0.5) * p.rib) & 1) ? (p.col2 || sh(p.col, 0.85)) : p.col; }
function pDome(p, x, y, z) {
  var u = (z - p.z0) / p.h; if (u < 0 || u > 1) return -1;
  var rr = p.on ? onion(u) * p.r : p.r * Math.sqrt(Math.max(0, 1 - u * u));
  var dx = x - p.cx, dy = y - p.cy, d2 = dx * dx + dy * dy;
  if (d2 > rr * rr) return -1;
  var rn = rr + 1e-6, l = 0.62 + (-dx * 0.55 - dy * 0.6) / rn * 0.38 + u * 0.38;
  if (Math.sqrt(d2) > rn * 0.9 && dx > 0) l *= 0.85;
  return shadeL(ribCol(p, dx, dy), l);
}
function pCyl(p, x, y, z) {
  if (z < p.z0 || z > p.z0 + p.h) return -1;
  var dx = x - p.cx, dy = y - p.cy;
  if (dx * dx + dy * dy > p.r * p.r) return -1;
  if (z > p.z0 + p.h - DZ * 1.05) return sh(p.rc || p.col, 1.08 - 0.15 * dx / p.r);
  var l = 0.96 - 0.32 * dx / p.r;
  if (p.win && p.r * SC > 3) {
    var a = Math.atan2(dy, dx), cu = (a / 6.2832 + 0.5) * Math.max(4, Math.round(p.r * 1.2)), cf = cu - Math.floor(cu), fz = (z - p.z0) % (p.win === 3 ? 3.4 : 4);
    if (p.win === 3) { if (fz < 0.4) return sh(p.col, 0.62 * l); return sh(p.col, l * (cf < 0.12 ? 0.75 : 1)); }
    if (cf > 0.35 && cf < 0.65 && fz > 1 && fz < 3.2) return 0x3f4f63;
  }
  return sh(p.col, l);
}
function pCone(p, x, y, z) {
  var u = (z - p.z0) / p.h; if (u < 0 || u > 1) return -1;
  var rr = p.r * (1 - u) + 1e-6, dx = x - p.cx, dy = y - p.cy, l;
  if (p.sq) {
    var ax = Math.abs(dx), ay = Math.abs(dy);
    if (ax > rr || ay > rr) return -1;
    if (ax > ay) l = dx < 0 ? 1.02 : 0.7; else l = dy < 0 ? 1.15 : 0.88;
    if (Math.abs(ax - ay) < 0.55 / SC) l *= 0.82;
    if (p.step && SC > 0.25 && (Math.floor(z / Math.max(1.2, 0.9 / SC)) & 1)) l *= 0.94;
    if (p.step && u > 0.93) return sh(0xeee4cc, l);
    return sh(p.col, l);
  }
  if (dx * dx + dy * dy > rr * rr) return -1;
  l = 0.98 - 0.34 * dx / rr - 0.1 * dy / rr;
  return sh(ribCol(p, dx, dy), l);
}
function pLat(p, x, y, z) {
  var u = z / p.h; if (u < 0 || u > 1) return -1;
  var hw = p.w * Math.pow(1 - u, 2.6) * 0.95 + p.w * 0.04, dx = x - p.cx, dy = y - p.cy, ax = Math.abs(dx), ay = Math.abs(dy);
  if (ax > hw || ay > hw) return -1;
  var col = p.bands ? ((Math.floor(u * 11) & 1) ? 0xf2f2ee : p.col) : p.col;
  if (Math.abs(u - 0.2) < 0.012 || Math.abs(u - 0.42) < 0.01 || Math.abs(u - 0.88) < 0.008) return sh(col, 0.82);
  if (u < 0.24) {
    var leg = hw * (0.22 + u * 0.9);
    if (ax < hw - leg && ay < hw - leg) return -1;
    var gap = hw - leg, archZ = p.h * 0.21 * (1 - Math.pow(Math.min(ax, ay) / Math.max(gap, 1e-6), 2)) * 0.8;
    if ((ax < gap || ay < gap) && z < archZ) return -1;
  }
  var e = Math.max(ax, ay), t = Math.max(1.4, hw * 0.3);
  if (u < 0.86 && e < hw - Math.max(0.8, hw * 0.16)) return -1;
  var along = ax > ay ? dy : dx;
  if (SC * t > 2.4 && u < 0.86) { var q1 = (((z + along) / t) % 2 + 2) % 2, q2 = (((z - along) / t) % 2 + 2) % 2; if (Math.abs(q1 - 1) > 0.22 && Math.abs(q2 - 1) > 0.22 && hw - e > 0.25 / SC && Math.abs(Math.abs(along) - hw) > 0.9 / SC) return -1; }
  var l = ax > ay ? (dx < 0 ? 1.04 : 0.76) : (dy < 0 ? 0.62 : 0.95);
  return sh(col, l);
}
function pRing(p, x, y, z) {
  var dx = (x - p.cx) / p.rx, dy = (y - p.cy) / p.ry, q = Math.sqrt(dx * dx + dy * dy);
  if (q > 1 || q < p.qi) return -1;
  var t = (q - p.qi) / (1 - p.qi), hz = q > 0.96 ? p.h : p.h * (0.3 + 0.62 * t);
  if (z > hz) return -1;
  if (z > hz - DZ * 1.6) { if (q > 0.96) return sh(p.col, 1.12); return (Math.floor(t * 16) & 1) ? sh(p.col2, 1.05) : sh(p.col2, 0.86); }
  var l = 0.98 - 0.28 * dx - 0.08 * dy;
  if (p.arch && SC > 0.5) {
    var a = Math.atan2(dy, dx), cu = (a / 6.2832 + 0.5) * 64, cf = cu - Math.floor(cu), lev = z / p.h * 4, lf = lev - Math.floor(lev);
    if (cf > 0.25 && cf < 0.75 && lf > 0.15 && lf < 0.75 && lev < 3) return sh(0x5a5046, 0.8 + 0.2 * lf);
    if (lf < 0.1) l *= 1.1;
  }
  return sh(p.col, l);
}
var PARTF = { dome: pDome, cyl: pCyl, cone: pCone, lat: pLat, ring: pRing };
var SC = 1;
function drawPart(out, msk, o) {
  var p = o.o, ax = o.ax, ay = o.ay, sc = o.sc, F = F_OBL, bb = p.bb, fn = PARTF[p.t];
  SC = sc; DZ = Math.min(0.6 / (F * sc), p.t === "lat" || p.t === "cone" ? 0.7 : 2);
  var px0 = Math.max(0, Math.floor(ax + bb[0] * sc)), px1 = Math.min(TS, Math.ceil(ax + bb[2] * sc));
  var py0 = Math.max(0, Math.floor(ay + bb[1] * sc - bb[5] * F * sc)), py1 = Math.min(TS, Math.ceil(ay + bb[3] * sc - bb[4] * F * sc));
  for (var py = py0; py < py1; py++) {
    var ys = (py + 0.5 - ay) / sc;
    var za = Math.max(bb[4], (bb[1] - ys) / F), zb = Math.min(bb[5], (bb[3] - ys) / F);
    if (zb < za) continue;
    for (var px = px0; px < px1; px++) {
      var x = (px + 0.5 - ax) / sc;
      for (var z = zb; z >= za; z -= DZ) {
        var col = fn(p, x, ys + z * F, z);
        if (col >= 0) { var j = py * TS + px; put(out, j * 4, col); msk[j] = 1; break; }
      }
    }
  }
}
function shadowPart(out, msk, o) {
  var p = o.o, sc = o.sc, ax = o.ax, ay = o.ay;
  if (p.t === "ring") { shadowPoly(out, msk, ax + p.bb[0] * sc, ay + p.bb[1] * sc, ax + p.bb[2] * sc, ay + p.bb[3] * sc, p.h * sc * SHX, p.h * sc * SHY); return; }
  var r = p.t === "lat" ? p.w : p.r, n = Math.min(60, Math.ceil((p.z0 + p.h) * sc * 0.5) + 1);
  for (var i = 0; i <= n; i++) {
    var z = (p.z0 + p.h) * i / n, rr;
    if (p.t === "cyl") rr = z >= p.z0 ? r : 0;
    else if (p.t === "lat") { var u = z / p.h; rr = p.w * Math.pow(1 - u, 2.3) * 0.94 + p.w * 0.045; if (u < 0.2) rr *= 0.9; }
    else if (z < p.z0) rr = 0;
    else { var u2 = (z - p.z0) / p.h; rr = p.t === "dome" ? (p.on ? onion(u2) : Math.sqrt(Math.max(0, 1 - u2 * u2))) * r : r * (1 - u2); }
    if (rr * sc < 0.4) continue;
    var cx = ax + (p.cx + z * SHX) * sc, cy = ay + (p.cy + z * SHY) * sc, R = rr * sc;
    for (var py = Math.floor(cy - R); py <= Math.ceil(cy + R); py++) for (var px = Math.floor(cx - R); px <= Math.ceil(cx + R); px++) {
      var dx = px + 0.5 - cx, dy = py + 0.5 - cy;
      if (p.sq || p.t === "lat" ? (Math.abs(dx) <= R && Math.abs(dy) <= R) : dx * dx + dy * dy <= R * R) darken(out, msk, px, py, SHF);
    }
  }
}


/* ---------- schema cities: hand-authored layout (src/schemas.js) ----------
   Lazy per thread: sgGraph (raster of districts/water/landmarks + road graph) on first touch, sgBuild (buildings) on the first object pass. */
var EC = [[9.6, 5.2], [7.0, 4.6], [4.4, 3.6]]; // [carriageway half width, sidewalk] for ring, avenue, street
var KCLS = { ring: 0, avenue: 1, street: 2 };
function segD(px, py, x0, y0, x1, y1) { // distance to a segment; SEGT gets the clamped parameter
  var dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy, t = l2 > 0 ? ((px - x0) * dx + (py - y0) * dy) / l2 : 0;
  if (t < 0) t = 0; else if (t > 1) t = 1;
  SEGT = t;
  var ex = x0 + dx * t - px, ey = y0 + dy * t - py;
  return Math.sqrt(ex * ex + ey * ey);
}
var SEGT = 0;
/* schemas authored in [lat, lon] (S.ll = centre): convert once to local metres with radial compression */
function sgConvert(S) {
  if (!S.ll || S._conv) return;
  S._conv = 1;
  var lat0 = S.ll[0], lon0 = S.ll[1], kx = 111.32 * Math.cos(lat0 * Math.PI / 180);
  var cv = function (q) {
    var x = (q[1] - lon0) * kx, y = -(q[0] - lat0) * 111.2, r = Math.sqrt(x * x + y * y);
    var f = r < 2.5 ? 0.5 * r : 1.25 + 0.3 * (r - 2.5), m = r > 1e-9 ? f / r * 1000 : 500;
    return [x * m, y * m];
  };
  var cvl = function (L) { for (var i = 0; i < L.length; i++) L[i] = cv(L[i]); };
  var i;
  for (i = 0; i < S.rivers.length; i++) cvl(S.rivers[i].pts);
  for (i = 0; i < (S.ferries || []).length; i++) cvl(S.ferries[i]);
  for (i = 0; i < (S.water || []).length; i++) cvl(S.water[i].poly);
  for (i = 0; i < S.roads.length; i++) cvl(S.roads[i].pts);
  for (i = 0; i < S.districts.length; i++) { var D = S.districts[i]; if (D.poly) cvl(D.poly); if (D.circle) { var q = cv(D.circle); D.circle = [q[0], q[1], D.circle[2]]; } if (D.grid && D.grid.c) D.grid.c = cv(D.grid.c); }
  var hitsWater = function (r) {
    var cx = (r[0] + r[2]) / 2, cy = (r[1] + r[3]) / 2, hx = (r[2] - r[0]) / 2, hy = (r[3] - r[1]) / 2;
    for (var a = 0; a < S.rivers.length; a++) { var P = S.rivers[a].pts, w = S.rivers[a].w / 2 + 4; for (var b = 0; b + 1 < P.length; b++) { var sl = Math.hypot(P[b + 1][0] - P[b][0], P[b + 1][1] - P[b][1]), st = Math.max(0.002, 6 / Math.max(1, sl)); for (var t = 0; t <= 1; t += st) { var x = P[b][0] + (P[b + 1][0] - P[b][0]) * t, y = P[b][1] + (P[b + 1][1] - P[b][1]) * t; if (Math.abs(x - cx) < hx + w && Math.abs(y - cy) < hy + w) return true; } } }
    for (a = 0; a < (S.water || []).length; a++) { var Q = S.water[a].poly, fl = []; for (b = 0; b < Q.length; b++) fl.push(Q[b][0], Q[b][1]); for (var u = 0; u <= 4; u++) for (var v = 0; v <= 4; v++) if (inPolyAny(fl, r[0] + (r[2] - r[0]) * u / 4, r[1] + (r[3] - r[1]) * v / 4)) return true; }
    return false;
  };
  var placed = [];
  for (i = 0; i < S.lms.length; i++) {
    var L = S.lms[i]; if (!L.at) continue;
    var a = cv(L.at), ex = L.x || 1.6, r;
    for (; ex >= 1; ex -= 0.1) {
      r = [a[0] - L.w * ex / 2, a[1] - L.h * ex / 2, a[0] + L.w * ex / 2, a[1] + L.h * ex / 2];
      var bad = !L.island && hitsWater(r);
      for (var q = 0; q < placed.length && !bad; q++) { var o = placed[q]; if (r[0] < o[2] - 2 && r[2] > o[0] + 2 && r[1] < o[3] - 2 && r[3] > o[1] + 2) bad = true; }
      if (!bad) break;
    }
    if (ex < 1) { // still touching water at true size: push it inland, away from the nearest bank
      ex = 1;
      var best = null;
      for (var ang = 0; ang < 6.283 && !best; ang += 0.785) for (var dist = 15; dist <= 120 && !best; dist += 15) {
        var b2 = [a[0] + Math.cos(ang) * dist, a[1] + Math.sin(ang) * dist], r2 = [b2[0] - L.w / 2, b2[1] - L.h / 2, b2[0] + L.w / 2, b2[1] + L.h / 2];
        if (!hitsWater(r2)) best = b2;
      }
      if (best) a = best;
    }
    L.ex = ex; L.r = [a[0] - L.w * ex / 2, a[1] - L.h * ex / 2, a[0] + L.w * ex / 2, a[1] + L.h * ex / 2];
    placed.push(L.r);
  }
}
function sgPrep(c) {
  var S = SCHEMAS[c.lm];
  sgConvert(S);
  c.schema = S; c.R = S.R; c.lms = []; c.lmb = new Map(); c.rv = null; c.lmFar = false; c.maxH = 120;
  for (var i = 0; i < S.lms.length; i++) {
    var q = S.lms[i], P = { f: q.f, n: q.n || "", id: i + 1, out: 0, lo: null, c: c, island: q.island || 0, ex: q.ex || 1, A: { X0: q.r[0], Y0: q.r[1], X1: q.r[2], Y1: q.r[3] } };
    P.cc = LMC[LMG[q.f] || "pave"];
    if (LM_H[q.f]) c.maxH = Math.max(c.maxH, LM_H[q.f] * P.ex);
    c.lms.push(P);
  }
}
function sgGraph(c) {
  if (c.sg) return c.sg;
  var S = c.schema, R = S.R, cell = 8, half = Math.ceil(R * 1.15 / cell), N = 2 * half, i, j, k;
  var g = { N: N, half: half, cell: cell, dist: new Uint8Array(N * N), wat: new Uint8Array(N * N), lmk: new Uint8Array(N * N), dt: [] };
  c.sg = g;
  var cx0 = function (x) { return Math.floor(x / cell) + half; };
  // districts: later entries override earlier ones
  for (var di = 0; di < S.districts.length; di++) {
    var D = S.districts[di]; g.dt.push(D.t);
    var RR = (1.1 * R) * (1.1 * R);
    if (D.circle) {
      var ccx = D.circle[0], ccy = D.circle[1], cr = D.circle[2];
      for (j = Math.max(0, cx0(ccy - cr * 1.15)); j < Math.min(N, cx0(ccy + cr * 1.15) + 1); j++) for (i = Math.max(0, cx0(ccx - cr * 1.15)); i < Math.min(N, cx0(ccx + cr * 1.15) + 1); i++) {
        var px = (i - half + 0.5) * cell - ccx, py = (j - half + 0.5) * cell - ccy, a = Math.atan2(py, px);
        var rr = cr * (1 + 0.09 * noise(Math.cos(a) * 2.3 + di * 7.1, Math.sin(a) * 2.3) + 0.04 * noise(Math.cos(a) * 7 + di, Math.sin(a) * 7));
        var gxp = (i - half + 0.5) * cell, gyp = (j - half + 0.5) * cell;
        if (px * px + py * py < rr * rr && gxp * gxp + gyp * gyp < RR) g.dist[j * N + i] = di + 1;
      }
    } else {
      var P = D.poly, ny0 = 1e9, ny1 = -1e9;
      for (k = 0; k < P.length; k++) { ny0 = Math.min(ny0, P[k][1]); ny1 = Math.max(ny1, P[k][1]); }
      for (j = Math.max(0, cx0(ny0)); j < Math.min(N, cx0(ny1) + 1); j++) {
        var yy = (j - half + 0.5) * cell, xs = [];
        for (k = 0; k < P.length; k++) { var p0 = P[k], p1 = P[(k + 1) % P.length]; if ((p0[1] <= yy) !== (p1[1] <= yy)) xs.push(p0[0] + (yy - p0[1]) / (p1[1] - p0[1]) * (p1[0] - p0[0])); }
        xs.sort(function (a, b) { return a - b; });
        for (k = 0; k + 1 < xs.length; k += 2) for (i = Math.max(0, cx0(xs[k])); i <= Math.min(N - 1, cx0(xs[k + 1])); i++) { var gxq = (i - half + 0.5) * cell; if (gxq * gxq + yy * yy < RR) g.dist[j * N + i] = di + 1; }
      }
    }
  }
  // landmark rects
  for (k = 0; k < c.lms.length; k++) { var A = c.lms[k].A; for (j = Math.max(0, cx0(A.Y0)); j <= Math.min(N - 1, cx0(A.Y1)); j++) for (i = Math.max(0, cx0(A.X0)); i <= Math.min(N - 1, cx0(A.X1)); i++) g.lmk[j * N + i] = k + 1; }
  // rivers: segments + bucket; raster bit 1 = near water, bit 2 = deep water
  g.rs = []; g.RB = new Map();
  for (var ri = 0; ri < S.rivers.length; ri++) {
    var rv = S.rivers[ri];
    for (k = 0; k + 1 < rv.pts.length; k++) {
      var s = { x0: rv.pts[k][0], y0: rv.pts[k][1], x1: rv.pts[k + 1][0], y1: rv.pts[k + 1][1], w: rv.w };
      var id = g.rs.length; g.rs.push(s);
      var m = s.w / 2 + 12;
      bucketAdd(g.RB, 64, Math.min(s.x0, s.x1) - m, Math.min(s.y0, s.y1) - m, Math.max(s.x0, s.x1) + m, Math.max(s.y0, s.y1) + m, id);
      for (j = Math.max(0, cx0(Math.min(s.y0, s.y1) - m)); j <= Math.min(N - 1, cx0(Math.max(s.y0, s.y1) + m)); j++) for (i = Math.max(0, cx0(Math.min(s.x0, s.x1) - m)); i <= Math.min(N - 1, cx0(Math.max(s.x0, s.x1) + m)); i++) {
        var d = segD((i - half + 0.5) * cell, (j - half + 0.5) * cell, s.x0, s.y0, s.x1, s.y1) - s.w / 2;
        if (d < 10) g.wat[j * N + i] |= 1;
        if (d < -7) g.wat[j * N + i] |= 2;
      }
    }
  }
  // water polygons (bays, harbours): raster bit 4 = inside; edges go to the bucket as zero-width segments
  g.wp = [];
  for (var wi = 0; wi < (S.water || []).length; wi++) {
    var WP = S.water[wi].poly, flat = [];
    for (k = 0; k < WP.length; k++) flat.push(WP[k][0], WP[k][1]);
    g.wp.push(flat);
    var wy0 = 1e9, wy1 = -1e9;
    for (k = 0; k < WP.length; k++) { wy0 = Math.min(wy0, WP[k][1]); wy1 = Math.max(wy1, WP[k][1]); }
    for (j = Math.max(0, cx0(wy0)); j < Math.min(N, cx0(wy1) + 1); j++) {
      var yy2 = (j - half + 0.5) * cell, xs2 = [];
      for (k = 0; k < WP.length; k++) { var q0 = WP[k], q1 = WP[(k + 1) % WP.length]; if ((q0[1] <= yy2) !== (q1[1] <= yy2)) xs2.push(q0[0] + (yy2 - q0[1]) / (q1[1] - q0[1]) * (q1[0] - q0[0])); }
      xs2.sort(function (a, b) { return a - b; });
      for (k = 0; k + 1 < xs2.length; k += 2) for (i = Math.max(0, cx0(xs2[k])); i <= Math.min(N - 1, cx0(xs2[k + 1])); i++) g.wat[j * N + i] |= 7;
    }
    for (k = 0; k < WP.length; k++) {
      var e0 = WP[k], e1 = WP[(k + 1) % WP.length], sw2 = { x0: e0[0], y0: e0[1], x1: e1[0], y1: e1[1], w: 0, poly: wi };
      var id2 = g.rs.length; g.rs.push(sw2);
      bucketAdd(g.RB, 64, Math.min(e0[0], e1[0]) - 14, Math.min(e0[1], e1[1]) - 14, Math.max(e0[0], e1[0]) + 14, Math.max(e0[1], e1[1]) + 14, id2);
      for (j = Math.max(0, cx0(Math.min(e0[1], e1[1]) - 14)); j <= Math.min(N - 1, cx0(Math.max(e0[1], e1[1]) + 14)); j++) for (i = Math.max(0, cx0(Math.min(e0[0], e1[0]) - 14)); i <= Math.min(N - 1, cx0(Math.max(e0[0], e1[0]) + 14)); i++) {
        if (segD((i - half + 0.5) * cell, (j - half + 0.5) * cell, e0[0], e0[1], e1[0], e1[1]) < 10) { g.wat[j * N + i] |= 1; g.wat[j * N + i] &= ~2; }
      }
    }
  }
  sgRoads(c, g);
  return g;
}
function bucketAdd(B, cs, x0, y0, x1, y1, id) {
  for (var j = Math.floor(y0 / cs); j <= Math.floor(y1 / cs); j++) for (var i = Math.floor(x0 / cs); i <= Math.floor(x1 / cs); i++) {
    var key = i * 65536 + j, L = B.get(key);
    if (!L) { L = []; B.set(key, L); }
    L.push(id);
  }
}
function sgCell(g, x, y) { var i = Math.floor(x / g.cell) + g.half, j = Math.floor(y / g.cell) + g.half; return (i < 0 || j < 0 || i >= g.N || j >= g.N) ? -1 : j * g.N + i; }
function sgRoads(c, g) {
  var S = c.schema, segs = [], k, i, j;
  var addPoly = function (pts, cls, closed) { for (var q = 0; q + 1 < pts.length + (closed ? 1 : 0); q++) { var a = pts[q], b = pts[(q + 1) % pts.length]; segs.push([a[0], a[1], b[0], b[1], cls]); } };
  for (k = 0; k < S.roads.length; k++) addPoly(S.roads[k].pts, KCLS[S.roads[k].k], S.roads[k].closed);
  // streets around landmark grounds (nearby landmarks are grouped), clipped where they would cross water or another landmark
  var groups = [];
  for (k = 0; k < c.lms.length; k++) {
    var A0 = c.lms[k].A, gb = [A0.X0, A0.Y0, A0.X1, A0.Y1];
    if (c.lms[k].island) continue;
    for (var gq = 0; gq < groups.length; gq++) { var G1 = groups[gq]; if (gb[0] < G1[2] + 30 && gb[2] > G1[0] - 30 && gb[1] < G1[3] + 30 && gb[3] > G1[1] - 30) { G1[0] = Math.min(G1[0], gb[0]); G1[1] = Math.min(G1[1], gb[1]); G1[2] = Math.max(G1[2], gb[2]); G1[3] = Math.max(G1[3], gb[3]); gb = null; break; } }
    if (gb) groups.push(gb);
  }
  for (var gq2 = 0; gq2 < groups.length; gq2++) {
    var G2 = groups[gq2], o2 = EC[2][0] + EC[2][1] + 1, X0 = G2[0] - o2, Y0 = G2[1] - o2, X1 = G2[2] + o2, Y1 = G2[3] + o2;
    var ring = [[X0, Y0], [X1, Y0], [X1, Y1], [X0, Y1], [X0, Y0]];
    for (var rs = 0; rs < 4; rs++) {
      var ra = ring[rs], rb = ring[rs + 1], rl = Math.hypot(rb[0] - ra[0], rb[1] - ra[1]), nst = Math.max(1, Math.ceil(rl / 8)), runS = -1;
      for (var st2 = 0; st2 <= nst; st2++) {
        var okp = st2 < nst;
        if (okp) { var mxp = ra[0] + (rb[0] - ra[0]) * (st2 + 0.5) / nst, myp = ra[1] + (rb[1] - ra[1]) * (st2 + 0.5) / nst, cq = sgCell(g, mxp, myp); okp = cq >= 0 && !(g.wat[cq] & 1) && !g.lmk[cq]; }
        if (okp && runS < 0) runS = st2;
        if (!okp && runS >= 0) { if (st2 - runS >= 2) segs.push([ra[0] + (rb[0] - ra[0]) * runS / nst, ra[1] + (rb[1] - ra[1]) * runS / nst, ra[0] + (rb[0] - ra[0]) * st2 / nst, ra[1] + (rb[1] - ra[1]) * st2 / nst, 2]); runS = -1; }
      }
    }
  }
  // embankments: a street along both banks of every river and along the land side of water polygons
  var EMBD = [];
  var embank = function (pts, off, cls, closedSign) {
    var n = pts.length, run = [];
    var flushE = function () {
      if (run.length >= 2) { EMBD.push(segs.length, 0); for (var q = 0; q + 1 < run.length; q++) segs.push([run[q][0], run[q][1], run[q + 1][0], run[q + 1][1], cls]); EMBD.push(segs.length - 1, 1); }
      run = [];
    };
    for (var i2 = 0; i2 < n; i2++) {
      var pa = pts[Math.max(0, i2 - 1)], pb = pts[Math.min(n - 1, i2 + 1)], tx = pb[0] - pa[0], ty = pb[1] - pa[1], tl = Math.hypot(tx, ty) || 1;
      var ex = pts[i2][0] - ty / tl * off, ey = pts[i2][1] + tx / tl * off;
      var ce = sgCell(g, ex, ey), good = ce >= 0 && !g.lmk[ce] && ex * ex + ey * ey < 1.1 * S.R * 1.1 * S.R && sgWater(g, ex, ey) > 1;
      if (good) run.push([ex, ey]); else flushE();
    }
    flushE();
  };
  // outer boulevard closing the city so every block is a bounded face
  var ringO = [], RO = 1.04 * S.R;
  for (var ao = 0; ao <= 6.2832 + 1e-6; ao += 40 / RO) { var rr0 = RO * (1 + 0.03 * noise(Math.cos(ao) * 2 + 5, Math.sin(ao) * 2)); ringO.push([Math.cos(ao) * rr0, Math.sin(ao) * rr0]); }
  ringO.push(ringO[0]);
  embank(ringO, 0, 1);
  for (k = 0; k < S.rivers.length; k++) {
    var rv0 = S.rivers[k]; if (rv0.w < 18) continue;
    var dense = [];
    for (var q3 = 0; q3 + 1 < rv0.pts.length; q3++) { var A3 = rv0.pts[q3], B3 = rv0.pts[q3 + 1], L3 = Math.hypot(B3[0] - A3[0], B3[1] - A3[1]), n3 = Math.max(1, Math.ceil(L3 / 40)); for (var t3 = 0; t3 < n3; t3++) dense.push([A3[0] + (B3[0] - A3[0]) * t3 / n3, A3[1] + (B3[1] - A3[1]) * t3 / n3]); }
    dense.push(rv0.pts[rv0.pts.length - 1]);
    var cls3 = rv0.w >= 60 ? 1 : 2, o3 = rv0.w / 2 + EC[cls3][0] + 1.5;
    embank(dense, o3, cls3); embank(dense, -o3, cls3);
  }
  for (k = 0; k < (S.water || []).length; k++) {
    var WP2 = S.water[k].poly, dense2 = [];
    for (var q4 = 0; q4 < WP2.length; q4++) { var A4 = WP2[q4], B4 = WP2[(q4 + 1) % WP2.length], L4 = Math.hypot(B4[0] - A4[0], B4[1] - A4[1]), n4 = Math.max(1, Math.ceil(L4 / 40)); for (var t4 = 0; t4 < n4; t4++) dense2.push([A4[0] + (B4[0] - A4[0]) * t4 / n4, A4[1] + (B4[1] - A4[1]) * t4 / n4]); }
    var ar = 0; for (q4 = 0; q4 < WP2.length; q4++) { var P5 = WP2[q4], P6 = WP2[(q4 + 1) % WP2.length]; ar += P5[0] * P6[1] - P6[0] * P5[1]; }
    var o4 = (EC[1][0] + 1.5) * (ar > 0 ? -1 : 1);
    embank(dense2, o4, 1);
  }
  var nMaj = segs.length, MB = new Map(), DANG = EMBD.slice();
  for (k = 0; k < nMaj; k++) { var s0 = segs[k], mm = EC[s0[4]][0] + EC[s0[4]][1] + 70; bucketAdd(MB, 64, Math.min(s0[0], s0[2]) - mm, Math.min(s0[1], s0[3]) - mm, Math.max(s0[0], s0[2]) + mm, Math.max(s0[1], s0[3]) + mm, k); }
  var nearMaj = function (x, y) { // [distance beyond the major road band, projection x, y]
    var L = MB.get(Math.floor(x / 64) * 65536 + Math.floor(y / 64)), best = 1e9, bx = 0, by = 0;
    if (L) for (var q = 0; q < L.length; q++) { var s = segs[L[q]], d = segD(x, y, s[0], s[1], s[2], s[3]); var e = d - EC[s[4]][0] - EC[s[4]][1]; if (e < best) { best = e; bx = s[0] + (s[2] - s[0]) * SEGT; by = s[1] + (s[3] - s[1]) * SEGT; } }
    return [best, bx, by];
  };
  // minor streets: per district pattern, clipped by district, water, landmarks, parks and major road bands
  for (var di = 0; di < S.districts.length; di++) {
    var D = S.districts[di], G0 = D.grid;
    if (!G0 || D.t === "park" || G0.type === "split") continue;
    var lines = [], R = S.R;
    if (G0.type === "grid") {
      var ca = Math.cos(G0.ang), sa = Math.sin(G0.ang), ph1 = hh(di, 1, 5) * G0.sy, ph2 = hh(di, 2, 5) * G0.sx;
      for (var o = -R - ph1; o < R; o += G0.sy) lines.push([[-R * ca - o * sa, -R * sa + o * ca], [R * ca - o * sa, R * sa + o * ca]]);
      for (o = -R - ph2; o < R; o += G0.sx) lines.push([[o * ca + R * sa, o * sa - R * ca], [o * ca - R * sa, o * sa + R * ca]]);
    } else if (G0.type === "patch") {
      var PC = G0.cell;
      for (var pj = Math.floor(-R / PC) - 1; pj <= Math.ceil(R / PC); pj++) for (var pi2 = Math.floor(-R / PC) - 1; pi2 <= Math.ceil(R / PC); pi2++) {
        var pa = G0.ang + (hh(pi2, pj, 71 + di) - 0.5) * G0.jit, pc = Math.cos(pa), ps = Math.sin(pa);
        var pcx = (pi2 + 0.5) * PC + (hh(pi2, pj, 72) - 0.5) * PC * 0.5, pcy = (pj + 0.5) * PC + (hh(pi2, pj, 73) - 0.5) * PC * 0.5, ext = PC * 0.9;
        var sx2 = G0.sx * (0.85 + 0.3 * hh(pi2, pj, 74)), sy2 = G0.sy * (0.85 + 0.3 * hh(pi2, pj, 75));
        for (var oo = -ext + hh(pi2, pj, 76) * sy2; oo < ext; oo += sy2) lines.push({ pts: [[pcx - ext * pc - oo * ps, pcy - ext * ps + oo * pc], [pcx + ext * pc - oo * ps, pcy + ext * ps + oo * pc]], patch: [pi2, pj] });
        for (oo = -ext + hh(pi2, pj, 77) * sx2; oo < ext; oo += sx2) lines.push({ pts: [[pcx + oo * pc + ext * ps, pcy + oo * ps - ext * pc], [pcx + oo * pc - ext * ps, pcy + oo * ps + ext * pc]], patch: [pi2, pj] });
      }
    } else {
      for (k = 0; k < G0.rings.length; k++) { var rp = [], rr = G0.rings[k]; for (var a = 0; a <= 6.2832 + 1e-6; a += 12 / rr) rp.push([G0.cx + Math.cos(a) * rr, G0.cy + Math.sin(a) * rr]); lines.push(rp); }
      for (a = hh(di, 3, 5) * G0.da; a < 6.2832; a += G0.da) lines.push([[G0.cx + Math.cos(a) * G0.r0, G0.cy + Math.sin(a) * G0.r0], [G0.cx + Math.cos(a) * G0.r1, G0.cy + Math.sin(a) * G0.r1]]);
    }
    var CURP = null;
    var patchOf = function (x, y) {
      var PC = G0.cell, bi = Math.floor(x / PC), bj = Math.floor(y / PC), best = 1e18, br = null;
      for (var dj = -1; dj <= 1; dj++) for (var dI = -1; dI <= 1; dI++) {
        var qi = bi + dI, qj = bj + dj, qx = (qi + 0.5) * PC + (hh(qi, qj, 72) - 0.5) * PC * 0.5, qy = (qj + 0.5) * PC + (hh(qi, qj, 73) - 0.5) * PC * 0.5, d = (x - qx) * (x - qx) + (y - qy) * (y - qy);
        if (d < best) { best = d; br = qi * 65536 + qj; }
      }
      return br;
    };
    var ok = function (x, y) {
      var ci = sgCell(g, x, y);
      if (ci < 0 || g.dist[ci] !== di + 1 || (g.wat[ci] & 1) || g.lmk[ci]) return false;
      if (CURP !== null && patchOf(x, y) !== CURP) return false;
      return nearMaj(x, y)[0] > 2;
    };
    for (var li = 0; li < lines.length; li++) {
      var Lp = lines[li];
      if (Lp.pts) { CURP = Lp.patch[0] * 65536 + Lp.patch[1]; Lp = Lp.pts; } else CURP = null;
      var run = [], last = null, cnt = 0;
      var flush = function () {
        if (last && run.length && run[run.length - 1] !== last) run.push(last);
        if (run.length >= 2) {
          var len = 0; for (var q = 1; q < run.length; q++) len += Math.hypot(run[q][0] - run[q - 1][0], run[q][1] - run[q - 1][1]);
          if (len >= 40) {
            var e0 = nearMaj(run[0][0], run[0][1]), e1 = nearMaj(run[run.length - 1][0], run[run.length - 1][1]);
            if (e0[0] < 60) run.unshift([e0[1], e0[2]]); else DANG.push(segs.length, 0);
            if (e1[0] < 60) run.push([e1[1], e1[2]]); else DANG.push(segs.length + run.length - 2, 1);
            for (q = 0; q + 1 < run.length; q++) segs.push([run[q][0], run[q][1], run[q + 1][0], run[q + 1][1], 2]);
          }
        }
        run = []; last = null; cnt = 0;
      };
      for (k = 0; k + 1 < Lp.length; k++) {
        var ax = Lp[k][0], ay = Lp[k][1], bx = Lp[k + 1][0], by = Lp[k + 1][1], L2 = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.ceil(L2 / 4));
        for (var st = (k === 0 ? 0 : 1); st <= n; st++) {
          var x = ax + (bx - ax) * st / n, y = ay + (by - ay) * st / n;
          if (ok(x, y)) {
            var pt = [x, y];
            if (!run.length) run.push(pt);
            else if (G0.type === "polar" && (++cnt % 6) === 0) run.push(pt);
            last = pt;
          } else if (run.length) flush();
        }
      }
      flush();
    }
  }
  // connect dangling minor ends to the nearest other street within 45 m
  if (DANG.length) {
    var AB = new Map();
    for (k = 0; k < segs.length; k++) { var sa = segs[k]; bucketAdd(AB, 64, Math.min(sa[0], sa[2]) - 50, Math.min(sa[1], sa[3]) - 50, Math.max(sa[0], sa[2]) + 50, Math.max(sa[1], sa[3]) + 50, k); }
    var nAdd = [];
    for (k = 0; k < DANG.length; k += 2) {
      var si = DANG[k], se = segs[si], end = DANG[k + 1], px = end ? se[2] : se[0], py = end ? se[3] : se[1];
      var dx0 = end ? se[2] - se[0] : se[0] - se[2], dy0 = end ? se[3] - se[1] : se[1] - se[3], dl = Math.hypot(dx0, dy0) || 1;
      var Lc = AB.get(Math.floor(px / 64) * 65536 + Math.floor(py / 64)), best2 = 45, bx2 = 0, by2 = 0;
      if (Lc) for (var q2 = 0; q2 < Lc.length; q2++) {
        if (Lc[q2] === si) continue;
        var so = segs[Lc[q2]], dd2 = segD(px, py, so[0], so[1], so[2], so[3]);
        var qx2 = so[0] + (so[2] - so[0]) * SEGT, qy2 = so[1] + (so[3] - so[1]) * SEGT;
        if (dd2 > 0.5 && dd2 < best2 && ((qx2 - px) * dx0 + (qy2 - py) * dy0) / (dd2 * dl) > 0.3) { best2 = dd2; bx2 = qx2; by2 = qy2; }
      }
      if (best2 < 45) { var mx2 = (px + bx2) / 2, my2 = (py + by2) / 2, cm = sgCell(g, mx2, my2); if (cm >= 0 && !(g.wat[cm] & 1) && !g.lmk[cm]) nAdd.push([px, py, bx2, by2, 2]); }
    }
    for (k = 0; k < nAdd.length; k++) segs.push(nAdd[k]);
  }
  sgSubdivide(c, g, segs);
  sgBuildGraph(c, g, segs);
}

/* ---------- block subdivision ----------
   Faces of the street graph that are bigger than their district's target block size are cut by straight lanes,
   recursively, across their longer extent (with a little jitter), so every block is clean and has no dead ends. */
var TGT = { historic: 9500, stalin: 15000, haussmann: 9000, banlieue: 14000, ottoman: 2400, modern: 10000, nybrick: 9000, nyrow: 8000, nyloft: 8000, midtown: 9000, downtown: 6000, imperial: 11000 };
function sgSubdivide(c, g, segs) {
  var S = c.schema, tg = { lmk: g.lmk, N: g.N, half: g.half, cell: g.cell, wat: g.wat, dist: g.dist, dt: g.dt };
  sgBuildGraph(c, tg, segs.slice());
  var faces = sgFaces(tg), fi, k;
  for (fi = 0; fi < faces.length; fi++) {
    var F = faces[fi], n = F.v.length, xs = [], ys = [];
    for (k = 0; k < n; k++) { xs.push(tg.nx[F.v[k]]); ys.push(tg.ny[F.v[k]]); }
    var p = []; for (k = 0; k < n; k++) p.push(xs[k], ys[k]);
    sgSplit(c, g, segs, p, 0, fi * 131 + 7);
  }
}
function polyCentroid(p) {
  var n = p.length >> 1, a = 0, cx = 0, cy = 0;
  for (var i = 0; i < n; i++) { var j = (i + 1) % n, cr = p[2 * i] * p[2 * j + 1] - p[2 * j] * p[2 * i + 1]; a += cr; cx += (p[2 * i] + p[2 * j]) * cr; cy += (p[2 * i + 1] + p[2 * j + 1]) * cr; }
  if (Math.abs(a) < 1e-6) { cx = 0; cy = 0; for (i = 0; i < n; i++) { cx += p[2 * i]; cy += p[2 * i + 1]; } return [cx / n, cy / n]; }
  return [cx / (3 * a), cy / (3 * a)];
}
function sgSplit(c, g, segs, p, depth, seed) {
  var n = p.length >> 1;
  if (n < 3 || depth > 9) return;
  var area = polyArea(p), ct = polyCentroid(p), ci = sgCell(g, ct[0], ct[1]);
  if (ci < 0 || !g.dist[ci] || (g.wat[ci] & 4)) return;
  var t = g.dt[g.dist[ci] - 1], D = c.schema.districts[g.dist[ci] - 1], tgt = (D.grid && D.grid.area) || TGT[t];
  if (!tgt || area < tgt * (0.8 + 0.5 * hh(seed, depth, 3))) return;
  // longest side direction
  var bl = 0, dx = 1, dy = 0, i;
  for (i = 0; i < n; i++) { var j = (i + 1) % n, ex = p[2 * j] - p[2 * i], ey = p[2 * j + 1] - p[2 * i + 1], l = Math.hypot(ex, ey); if (l > bl) { bl = l; dx = ex / l; dy = ey / l; } }
  var a0 = 1e9, a1 = -1e9, b0 = 1e9, b1 = -1e9;
  for (i = 0; i < n; i++) { var u = p[2 * i] * dx + p[2 * i + 1] * dy, v = -p[2 * i] * dy + p[2 * i + 1] * dx; a0 = Math.min(a0, u); a1 = Math.max(a1, u); b0 = Math.min(b0, v); b1 = Math.max(b1, v); }
  // cut across the longer extent: the cut line's normal (nx, ny) points along that extent
  var nx, ny, lo, hi;
  if (a1 - a0 >= (b1 - b0) * 0.85) { nx = dx; ny = dy; lo = a0; hi = a1; } else { nx = -dy; ny = dx; lo = b0; hi = b1; }
  var tries = [0, 0.18, -0.18, 0.32, -0.32];
  for (var q = 0; q < tries.length; q++) {
    var f = 0.5 + tries[q] + (hh(seed, depth, 5) - 0.5) * 0.16, w = lo + (hi - lo) * f;
    // chord: intersections of the line {x·n = w} with the polygon, the interval around the centroid's projection
    var ts = [], ldx = -ny, ldy = nx, ox = nx * w, oy = ny * w, tc = (ct[0] - ox) * ldx + (ct[1] - oy) * ldy;
    for (i = 0; i < n; i++) {
      var j2 = (i + 1) % n, ax = p[2 * i], ay = p[2 * i + 1], bx = p[2 * j2], by = p[2 * j2 + 1];
      var fa = ax * nx + ay * ny - w, fb = bx * nx + by * ny - w;
      if ((fa >= 0) !== (fb >= 0)) { var tt = fa / (fa - fb), X = ax + (bx - ax) * tt, Y = ay + (by - ay) * tt; ts.push((X - ox) * ldx + (Y - oy) * ldy); }
    }
    if (ts.length < 2) continue;
    ts.sort(function (a, b) { return a - b; });
    var t0 = ts[0], t1 = ts[ts.length - 1];
    for (i = 0; i + 1 < ts.length; i += 2) if (ts[i] <= tc && ts[i + 1] >= tc) { t0 = ts[i]; t1 = ts[i + 1]; break; }
    if (t1 - t0 < 25) continue;
    var blocked = function (s) { var sx = ox + ldx * s, sy = oy + ldy * s, cq = sgCell(g, sx, sy); return cq < 0 || (g.wat[cq] & 1) || g.lmk[cq] || !g.dist[cq]; };
    var tcc = Math.max(t0 + 1, Math.min(t1 - 1, tc));
    if (blocked(tcc)) continue;
    var ca = tcc, cb = tcc;
    while (ca - 2 > t0 && !blocked(ca - 2)) ca -= 2;
    while (cb + 2 < t1 && !blocked(cb + 2)) cb += 2;
    if (ca - 2 > t0) ca -= 1; else ca = t0 - 0.5;   // stopped at an obstacle: end on the street around it
    if (cb + 2 < t1) cb += 1; else cb = t1 + 0.5;
    if (cb - ca < 25) continue;
    segs.push([ox + ldx * ca, oy + ldy * ca, ox + ldx * cb, oy + ldy * cb, 2]);
    var pA = clipHalf(p, nx, ny, ox, oy, 0), pB = clipHalf(p, -nx, -ny, ox, oy, 0);
    sgSplit(c, g, segs, pA, depth + 1, seed * 3 + 1);
    sgSplit(c, g, segs, pB, depth + 1, seed * 3 + 2);
    return;
  }
}

/* split segments at mutual intersections, snap nodes, build edges, adjacency and the edge bucket index into g */
function sgBuildGraph(c, g, segs) {
  var k;
  // split all segments at mutual intersections
  var SB = new Map(), ns = segs.length, tl = [];
  for (k = 0; k < ns; k++) { var s1 = segs[k]; tl.push([0, 1]); bucketAdd(SB, 64, Math.min(s1[0], s1[2]) - 2, Math.min(s1[1], s1[3]) - 2, Math.max(s1[0], s1[2]) + 2, Math.max(s1[1], s1[3]) + 2, k); }
  var seen = new Set();
  SB.forEach(function (L) {
    for (var p = 0; p < L.length; p++) for (var q = p + 1; q < L.length; q++) {
      var a = L[p], b = L[q], key = a < b ? a * 1048576 + b : b * 1048576 + a;
      if (seen.has(key)) continue;
      seen.add(key);
      var A = segs[a], B = segs[b];
      var rx = A[2] - A[0], ry = A[3] - A[1], sx = B[2] - B[0], sy = B[3] - B[1], den = rx * sy - ry * sx;
      if (Math.abs(den) < 1e-9) continue;
      var qx = B[0] - A[0], qy = B[1] - A[1], t = (qx * sy - qy * sx) / den, u = (qx * ry - qy * rx) / den;
      var la = Math.hypot(rx, ry), lb = Math.hypot(sx, sy), ea = 1.5 / la, eb = 1.5 / lb;
      if (t < -ea || t > 1 + ea || u < -eb || u > 1 + eb) continue;
      tl[a].push(Math.max(0, Math.min(1, t))); tl[b].push(Math.max(0, Math.min(1, u)));
    }
  });
  // nodes (snapped within 1.5 m) and edges
  var nx = [], ny = [], NB = new Map();
  var node = function (x, y) {
    var ci = Math.floor(x / 2), cj = Math.floor(y / 2);
    for (var dj = -1; dj <= 1; dj++) for (var dI = -1; dI <= 1; dI++) { var L = NB.get((ci + dI) * 65536 + cj + dj); if (L) for (var q = 0; q < L.length; q++) { var id = L[q]; if (Math.abs(nx[id] - x) < 1.5 && Math.abs(ny[id] - y) < 1.5) return id; } }
    var nid = nx.length; nx.push(x); ny.push(y);
    var key = ci * 65536 + cj, L2 = NB.get(key); if (!L2) { L2 = []; NB.set(key, L2); } L2.push(nid);
    return nid;
  };
  var E = { a: [], b: [], cls: [], len: [], ux: [], uy: [] }, eseen = new Set();
  for (k = 0; k < ns; k++) {
    var sg = segs[k], ts = tl[k].sort(function (a, b) { return a - b; }), prev = -1;
    for (var w = 0; w < ts.length; w++) {
      var id2 = node(sg[0] + (sg[2] - sg[0]) * ts[w], sg[1] + (sg[3] - sg[1]) * ts[w]);
      if (prev >= 0 && id2 !== prev) {
        var ek = prev < id2 ? prev * 1048576 + id2 : id2 * 1048576 + prev;
        if (!eseen.has(ek)) {
          eseen.add(ek);
          var ddx = nx[id2] - nx[prev], ddy = ny[id2] - ny[prev], ll = Math.hypot(ddx, ddy);
          var mc = sgCell(g, (nx[id2] + nx[prev]) / 2, (ny[id2] + ny[prev]) / 2), inLm = false;
          if (mc >= 0 && g.lmk[mc]) { var LA = c.lms[g.lmk[mc] - 1].A, qx0 = (nx[id2] + nx[prev]) / 2, qy0 = (ny[id2] + ny[prev]) / 2; inLm = qx0 > LA.X0 + 2 && qx0 < LA.X1 - 2 && qy0 > LA.Y0 + 2 && qy0 < LA.Y1 - 2; }
          if (ll > 0.5 && !inLm) { E.a.push(prev); E.b.push(id2); E.cls.push(sg[4]); E.len.push(ll); E.ux.push(ddx / ll); E.uy.push(ddy / ll); }
        }
      }
      prev = id2;
    }
  }
  var ne = E.a.length, adj = []; for (k = 0; k < nx.length; k++) adj.push([]);
  E.sA = new Float64Array(ne);
  for (k = 0; k < ne; k++) E.sA[k] = ((nx[E.a[k]] * E.ux[k] + ny[E.a[k]] * E.uy[k]) % 10.5 + 10.5) % 10.5;
  for (k = 0; k < ne; k++) { adj[E.a[k]].push(k); adj[E.b[k]].push(k); }
  var nr = new Float64Array(nx.length);
  for (k = 0; k < ne; k++) { var cw = EC[E.cls[k]][0]; if (cw > nr[E.a[k]]) nr[E.a[k]] = cw; if (cw > nr[E.b[k]]) nr[E.b[k]] = cw; }
  g.nx = nx; g.ny = ny; g.E = E; g.ne = ne; g.adj = adj; g.nr = nr; g.EB = new Map();
  for (k = 0; k < ne; k++) {
    var m2 = EC[E.cls[k]][0] + EC[E.cls[k]][1] + 3, xa = nx[E.a[k]], ya = ny[E.a[k]], xb = nx[E.b[k]], yb = ny[E.b[k]];
    bucketAdd(g.EB, 64, Math.min(xa, xb) - m2, Math.min(ya, yb) - m2, Math.max(xa, xb) + m2, Math.max(ya, yb) + m2, k);
  }
}
/* nearest road / sidewalk around a point (union over edges): fills RQ */
var RQ = { a: 1e9, b: 1e9, e: -1, t: 0, side: 0 };
function sgRoadQ(g, x, y) {
  RQ.a = 1e9; RQ.b = 1e9; RQ.e = -1;
  var L = g.EB.get(Math.floor(x / 64) * 65536 + Math.floor(y / 64));
  if (!L) return RQ;
  var E = g.E;
  for (var q = 0; q < L.length; q++) {
    var e = L[q], xa = g.nx[E.a[e]], ya = g.ny[E.a[e]], d = segD(x, y, xa, ya, g.nx[E.b[e]], g.ny[E.b[e]]);
    var cw = EC[E.cls[e]][0], a = d - cw, b = a - EC[E.cls[e]][1];
    if (a < RQ.a) { RQ.a = a; RQ.e = e; RQ.t = SEGT; RQ.side = (x - xa) * -E.uy[e] + (y - ya) * E.ux[e]; }
    if (b < RQ.b) RQ.b = b;
  }
  return RQ;
}
var PBD = [];
function inPolyAny(p, x, y) { var n = p.length >> 1, ins = false; for (var i = 0, j = n - 1; i < n; j = i++) { var yi = p[2 * i + 1], yj = p[2 * j + 1]; if ((yi > y) !== (yj > y) && x < (p[2 * j] - p[2 * i]) * (y - yi) / (yj - yi) + p[2 * i]) ins = !ins; } return ins; }
function sgWater(g, x, y) { // signed distance to the nearest bank (negative = water)
  var L = g.RB.get(Math.floor(x / 64) * 65536 + Math.floor(y / 64)), best = 99, anyP = false;
  if (L) {
    PBD.length = 0;
    for (var q = 0; q < L.length; q++) {
      var s = g.rs[L[q]], d = segD(x, y, s.x0, s.y0, s.x1, s.y1);
      if (s.poly === undefined) { d -= s.w / 2; if (d < best) best = d; } else if (PBD[s.poly] === undefined || d < PBD[s.poly]) PBD[s.poly] = d;
    }
    for (var w0 = 0; w0 < PBD.length; w0++) if (PBD[w0] !== undefined) { anyP = true; var sd = inPolyAny(g.wp[w0], x, y) ? -PBD[w0] : PBD[w0]; if (sd < best) best = sd; }
  }
  if (!anyP && g.wp.length) { // far from any polygon edge: inside or outside as a whole
    var ci = sgCell(g, x, y);
    if (ci >= 0) { if (g.wat[ci] & 4) best = Math.min(best, -20); }
    else for (var w = 0; w < g.wp.length; w++) if (inPolyAny(g.wp[w], x, y)) { best = Math.min(best, -20); break; }
  }
  return best;
}
var DCOARSE = { historic: [0x5f8f6a, 0xc4573a, 0xeccb7e, 0x8d949a, 0x6aa64a], stalin: [0xe8dcc0, 0x8d949a, 0xb35238, 0x6aa64a], soviet: [0xdcdad4, 0xc8ccd0, 0x6aa64a, 0x5f9c41],
  glass: [0x6f97b3, 0x8a9fb5, 0xd0cbc2], park: [0x4d8a3c, 0x5f9e45, 0x3f7a35], haussmann: [0x7d8a96, 0xe6dcc4, 0x6aa64a], villas: [0x6aa84d, 0xc4573a, 0x6aa84d] };
/* returns colour, -2 = natural ground here, -1 = not this city */
function schemaPix(c, lx, ly, rm, gx, gy) {
  var g = sgGraph(c), ci = sgCell(g, lx, ly);
  var wat = ci >= 0 ? g.wat[ci] : 0, rd = 99;
  if (wat && ci >= 0 && g.lmk[ci]) { var PI0 = c.lms[g.lmk[ci] - 1]; if (PI0.island) { var AI = PI0.A, gi = lmGround(c, PI0, lx - AI.X0, ly - AI.Y0, AI.X1 - AI.X0, AI.Y1 - AI.Y0, rm, gx, gy); if (gi !== -9) return gi; } }
  if (wat & 1) rd = sgWater(g, lx, ly); else if (wat & 4) rd = -30;
  RQ.a = 1e9; RQ.b = 1e9;
  var band = Math.max(0, 0.5 * rm - 6);
  sgRoadQ(g, lx, ly);
  var onRoad = RQ.a < band, onWalk = !onRoad && RQ.b < band;
  if (rm > 3.2) { onRoad = RQ.a < Math.max(0, 0.5 * rm - 4); onWalk = false; }
  CUR_STY = c.sty; CUR_LM = c.lm || "";
  if (rd < 0) {
    var cls = RQ.e >= 0 ? g.E.cls[RQ.e] : 2;
    if ((onRoad || onWalk) && cls < 2) { OUTC = 1; OUTB = 1; var bc = sgStreet(g, lx, ly, rm, gx, gy, onRoad); return RQ.b > -0.9 && RQ.b < band + Math.max(0.6, rm * 0.6) - 0 && !onRoad ? 0x6d655c : sh(bc, 1.05); }
    return riverPix(rd, rm, gx, gy);
  }
  if (onRoad || onWalk) { OUTC = 1; OUTB = 0; return sgStreet(g, lx, ly, rm, gx, gy, onRoad); }
  if (rd < 7) return rd < 1.2 ? 0x8f887c : tiles(lx, ly, rm, 0xb9b0a0, 0xaca392, 1.4);
  if (ci < 0) return -2;
  if (g.lmk[ci]) { var P = c.lms[g.lmk[ci] - 1], A = P.A; if (lx >= A.X0 && ly >= A.Y0 && lx <= A.X1 && ly <= A.Y1) { if (!GO && rm > 7) return P.cc; return lmGround(c, P, lx - A.X0, ly - A.Y0, A.X1 - A.X0, A.Y1 - A.Y0, rm, gx, gy); } }
  var dd = g.dist[ci];
  if (!dd) return -2;
  var t = g.dt[dd - 1];
  FACEK = 0; FACE = null;
  if (g.fid) { var fq = g.fid[ci]; if (fq > 0) { FACE = g.faces[fq - 1]; FACEK = FACE.kind; } }
  if (!GO) { var pal = DCOARSE[t] || DCOARSE.historic, h = hh(gx >> 1, gy >> 1, 51 + dd); return pal[(h * pal.length) | 0]; }
  return sgGround(t, lx, ly, rm, gx, gy, dd);
}
function sgStreet(g, x, y, rm, gx, gy, onRoad) {
  var E = g.E, e = RQ.e, cls = E.cls[e];
  if (rm > 3.2) return cls < 2 ? 0x80838a : 0x9c978e;
  var cw = EC[cls][0], d = cw + RQ.a, s = RQ.t * E.len[e], len = E.len[e], na = E.a[e], nb = E.b[e];
  var ra = g.nr[na] + EC[cls][1], rb = g.nr[nb] + EC[cls][1], dega = g.adj[na].length, degb = g.adj[nb].length;
  if (!onRoad) { // sidewalk
    if (RQ.b > -Math.max(0.28, rm * 0.5) && RQ.b < 0 || RQ.a < Math.max(0.28, rm * 0.5)) return CO_CURB;
    if (CUR_LM === "nyc") { // New York: big grey concrete flags, darker gum-spotted near the curb
      if (rm >= 1.1) return 0xc3c0b9;
      var qa = s / 1.5, qb = (d - cw) / 1.5, ja = Math.floor(qa), jb = Math.floor(qb), gq = Math.max(0.07, rm * 0.4) / 1.5;
      if (qa - ja < gq || qb - jb < gq) return 0xa29f98;
      var tq = hh(ja, jb, e + 5), sp = hh(Math.floor(s * 3), Math.floor(d * 3), e + 6);
      return sp < 0.025 ? 0x9b988f : tq < 0.15 ? 0xbab7b0 : tq > 0.88 ? 0xd2cfc8 : 0xc6c3bc;
    }
    if (rm < 1.1) {
      var pa = s / 0.8, pb = (d - cw) / 0.8, ia = Math.floor(pa + (Math.floor(pb) & 1) * 0.5), ib = Math.floor(pb), gr = Math.max(0.1, rm * 0.45) / 0.8;
      if (pa + (ib & 1) * 0.5 - ia < gr || pb - ib < gr) return CO_WALK2;
      var tv = hh(ia, ib, e + 3);
      return tv < 0.12 ? 0xbfa491 : tv > 0.92 ? 0xd0b8a7 : CO_WALK;
    }
    return CO_WALK;
  }
  var c0 = rm > 1.6 ? 0x5a5c61 : CO_ROAD;
  if (rm < 1.3) { var n = hh(gx >> 1, gy >> 1, 71), n2 = noise(x / 6, y / 6); if (n < 0.08) c0 = 0x45474c; else if (n > 0.96) c0 = 0x55575c; else if (n2 > 0.45) c0 = 0x4e5055; if (d > cw - 0.7) c0 = sh(c0, 0.9); }
  var nearA = dega >= 3 && s < ra, nearB = degb >= 3 && len - s < rb;
  if (nearA || nearB) return c0; // intersection box
  if (rm < 1 && ((dega >= 3 && s < ra + 3.6) || (degb >= 3 && len - s < rb + 3.6)) && d < cw - 0.4) return (Math.floor(RQ.side / 0.9) & 1) ? CO_ZEB : c0;
  var t = Math.max(0.13, rm * 0.5);
  if (rm > 2.6) return c0;
  if (cls < 2) {
    if (Math.abs(d - 0.22) < Math.max(0.09, t * 0.6)) return 0xe0c25a;
    if ((Math.abs(d - 3.3) < t || (cls === 0 && Math.abs(d - 6.6) < t)) && (Math.floor(s / 3) & 1)) return CO_MARK;
  } else if (d < t && (Math.floor(s / 3.2) & 1)) return CO_MARK;
  if (d > cw - 2.45 && d < cw - 0.2 && rm < 2 && s > ra + 5 && len - s > rb + 5) {
    var slot = Math.floor(s / 5.8), sa = s - slot * 5.8, side = RQ.side > 0 ? 1 : 0, hs = hh(slot, e * 2 + side, 7);
    if (hs < 0.5) { var cp = carTop(d - (cw - 1.05), sa - 0.6, 4.6, 1.95, CARS[(hh(slot, e, side) * CARS.length) | 0], rm, hh(slot, e, side + 5)); if (cp >= 0) return cp; }
  }
  return c0;
}
var FACEK = 0, FACE = null;
function grass(x, y, rm, s) {
  if (rm > 1.6) return 0x6b9640;
  var m = noise(x / 2.6 + s % 61, y / 2.6) + 0.5 * noise(x / 1.1, y / 1.1 + 4), v = hh(Math.floor(x * 3), Math.floor(y * 3), s);
  var c = m > 0.32 ? 0x7da64a : m < -0.3 ? 0x5c8634 : 0x6c973f;
  return v < 0.12 ? sh(c, 0.92) : v > 0.93 ? sh(c, 1.08) : c;
}
function paving(x, y, rm, base, grout, sz, salt) {
  if (rm > 1.1) return base;
  var a = x / sz, b = y / sz, ib = Math.floor(b), ia = Math.floor(a + (ib & 1) * 0.5), g = Math.max(0.09, rm * 0.45) / sz;
  if (a + (ib & 1) * 0.5 - ia < g || b - ib < g) return grout;
  var v = hh(ia, ib, salt);
  return v < 0.15 ? sh(base, 0.95) : v > 0.9 ? sh(base, 1.04) : base;
}
function flowers(x, y, s) {
  var fx = Math.floor(x * 2.2), fy = Math.floor(y * 2.2), h = hh(fx, fy, s + 9);
  if (h < 0.16) return [0xe25b7a, 0xf2c94c, 0xf6f1e8, 0xb07ad8, 0xf08a3c][(hh(fx, fy, 3) * 5) | 0];
  return -1;
}
/* courtyard of a perimeter block: a paved strip along the buildings, a lawn with a cross of paths,
   round flower beds and sometimes a playground; returns 0 paving, 1 edging, 2 path, 3 sand, 4 lawn, 5 flowers, 6 play equipment */
function courtSpot(F, x, y) {
  var cf = F.cf, n = cf.length >> 1, d = 1e9;
  for (var i = 0; i < n; i++) { var j = (i + 1) % n, q = segD(x, y, cf[2 * i], cf[2 * i + 1], cf[2 * j], cf[2 * j + 1]); if (q < d) d = q; }
  if (!inPolyAny(cf, x, y)) return 0;
  if (d < 2.4) return 0;
  if (d < 2.9) return 1;
  var dx = x - F.cx, dy = y - F.cy, a = dx * F.ax + dy * F.ay, b = -dx * F.ay + dy * F.ax;
  if (Math.abs(b) < 1.1 || (F.area > 5000 && Math.abs(a) < 1.1)) return 2;
  if (F.area > 4500 && F.seed > 0.35) { // playground in one quarter
    var pa = a - (F.seed > 0.6 ? 11 : -11), pb = b - 8.5;
    if (Math.abs(pa) < 5.5 && Math.abs(pb) < 4.2) {
      if (Math.abs(pa) > 5.1 || Math.abs(pb) > 3.8) return 1;
      if ((Math.abs(pa + 2.5) < 0.9 && Math.abs(pb) < 2.6) || (Math.abs(pa - 2.6) < 1.6 && Math.abs(pb + 1.2) < 0.5) || Math.hypot(pa - 2.6, pb - 1.8) < 1) return 6;
      return 3;
    }
  }
  var gx = Math.floor(a / 9), gy = Math.floor(b / 9), cxb = (gx + 0.5) * 9, cyb = (gy + 0.5) * 9;
  if (hh(gx, gy, (F.id * 31) | 0) < 0.12 && Math.hypot(a - cxb, b - cyb) < 1.6) return 5;
  return 4;
}
function sgCourt(F, x, y, rm, gx, gy) {
  var k = courtSpot(F, x, y);
  if (k === 0) return paving(x, y, rm, 0xcbbaa3, 0xb5a48c, 0.7, 41);
  if (k === 1) return 0xb3aa9c;
  if (k === 2) return paving(x * F.ax + y * F.ay, -x * F.ay + y * F.ax, rm, 0xd4c6ae, 0xbfae95, 0.55, 42);
  if (k === 3) return hh(Math.floor(x * 3), Math.floor(y * 3), 9) < 0.15 ? 0xd9c38a : 0xe6d29c;
  if (k === 6) { var h = (F.id * 7) % 4; return [0xd9483b, 0x3f6fb5, 0xe8b33a, 0x3fa36b][h]; }
  if (k === 5) { var fl = flowers(x, y, 33); return fl >= 0 ? fl : 0x5a3f2a; }
  return grass(x, y, rm, 17);
}
/* New York rear gardens: the court is cut into one strip per lot by wooden fences from the back walls to the middle line;
   each strip gets its own ground (lawn, brick patio, bluestone, gravel, a timber deck) with a paved terrace by the house and planted borders */
function nyYardPrep(F) {
  if (F._ny) return F._ny;
  var bx = F.court[0], by = F.court[1], m = bx.length, E = [], k, f = F.fen || [];
  for (k = 0; k < m; k++) { var k2 = (k + 1) % m, ex = bx[k2] - bx[k], ey = by[k2] - by[k], L = Math.hypot(ex, ey) || 1; E.push({ x: bx[k], y: by[k], ux: ex / L, uy: ey / L, L: L, t: [] }); }
  for (var i = 0; i < f.length; i += 5) {
    var e = E[f[i]]; if (!e) continue;
    for (var q = 1; q <= 3; q += 2) e.t.push((f[i + q] - e.x) * e.ux + (f[i + q + 1] - e.y) * e.uy);
  }
  for (k = 0; k < m; k++) { E[k].t.sort(function (a, b) { return a - b; }); var u = []; for (q = 0; q < E[k].t.length; q++) if (!u.length || E[k].t[q] - u[u.length - 1] > 0.8) u.push(E[k].t[q]); E[k].t = u; }
  F._ny = E;
  return E;
}
var NYG = { k: 0, t: 0, d: 0, j: 0, fd: 0, d2: 0 };   // last nyYardAt: nearest court edge, position along it, depth, lot strip, distance to its fence, gap to the middle line
function nyYardAt(F, x, y) {
  var E = nyYardPrep(F), d1 = 1e9, d2 = 1e9, k1 = 0, t1 = 0;
  for (var k = 0; k < E.length; k++) {
    var e = E[k], t = (x - e.x) * e.ux + (y - e.y) * e.uy, tc = t < 0 ? 0 : t > e.L ? e.L : t, dx = e.x + e.ux * tc - x, dy = e.y + e.uy * tc - y, d = Math.sqrt(dx * dx + dy * dy);
    if (d < d1) { d2 = d1; d1 = d; k1 = k; t1 = t; } else if (d < d2) d2 = d;
  }
  var T = E[k1].t, j = 0, fd = 1e9;
  for (var q = 0; q < T.length; q++) { if (T[q] < t1) j = q + 1; var a = Math.abs(t1 - T[q]); if (a < fd) fd = a; }
  NYG.k = k1; NYG.t = t1; NYG.d = d1; NYG.j = j; NYG.fd = fd; NYG.d2 = d2 - d1;
  return NYG;
}
function sgNyYard(F, x, y, rm, s) {
  if (!inPolyAny(F.cf, x, y)) return paving(x, y, rm, 0xb9b2a6, 0xa39c90, 0.6, 43);         // behind a shallower house: its terrace
  var Y = nyYardAt(F, x, y), fw = Math.max(0.11, rm * 0.55);
  if (Y.fd < fw || (Y.d2 < fw * 2 && Y.d > 2)) { var post = (Y.fd < fw ? Y.d : Y.t) % 1.8; return post < 0.22 ? 0x4e3826 : 0x8a6440; } // wooden fences
  var e = F._ny[Y.k], mat = hh(F.id, Y.k * 97 + Y.j, 401), u = Y.t, v = Y.d;
  if (v < 2.4) { // terrace by the back wall: bluestone, brick or a deck
    if (mat < 0.35) return paving(u, v, rm, 0x9aa1a4, 0x7d8387, 0.75, 44);
    if (mat < 0.7) return tiles(u * 2, v, rm, 0xa45f45, 0x7f4535, 0.42);
    var bd = (v * 5.5) % 1; return rm < 0.6 && bd < 0.14 ? 0x7a5634 : 0xa77a4c;
  }
  if (Y.fd < 0.95 || Y.d2 < 1.6) { var fl = rm < 0.9 ? flowers(x, y, 57) : -1; if (fl >= 0) return fl; return hh(Math.floor(x * 1.6), Math.floor(y * 1.6), 58) < 0.45 ? 0x3f6e2f : 0x5a4030; } // planted borders
  if (mat < 0.42) return grass(x, y, rm, s);
  if (mat < 0.6) return paving(u * 0.9, v, rm, 0xa86a4e, 0x8a5240, 0.5, 45);
  if (mat < 0.75) { var g2 = hh(Math.floor(x * 4), Math.floor(y * 4), 59); return g2 < 0.3 ? 0xc9bea6 : g2 < 0.6 ? 0xb8ad96 : 0xd6ccb6; }
  if (mat < 0.88) { var bd2 = (v * 5.5) % 1; return rm < 0.6 && bd2 < 0.14 ? 0x6e4e30 : 0x9c7148; }
  return lawn(x, y, rm, s);
}
/* courtyards: paving with organic grass beds edged by low hedges, flower beds and a sandpit now and then */
function sgYard(x, y, rm, gx, gy, s, t) { // leftover ground: pocket park in big faces, paving with planters in small ones
  if (FACE && FACE.area > 2500) return parkGround0(x - FACE.cx + 60, y - FACE.cy + 60, 120, 120, rm, s, gx, gy);
  var px = ((x % 9) + 9) % 9 - 4.5, py = ((y % 9) + 9) % 9 - 4.5, d = Math.sqrt(px * px + py * py);
  if (d < 2.3) return d > 1.9 ? 0xa59b8c : grass(x, y, rm, s);
  return paving(x, y, rm, 0xcdbda5, 0xb7a68e, 0.7, 41);
}
/* city square: plaza ring, diagonal and axial paths to a central fountain, lawn quadrants with hedges and flower beds */
function sgSquare(x, y, rm, gx, gy) {
  var F = FACE, dx = x - F.cx, dy = y - F.cy, d = Math.sqrt(dx * dx + dy * dy), R = Math.sqrt(F.area / Math.PI);
  if (d < 2.6) return (((gx + gy) & 1) && rm < 1) ? 0x7cc6e6 : 0x4fa3d6;
  if (d < 3.3) return 0xe6e0d4;
  if (d < 3.7) return 0xa9a294;
  if (d < 8.5) return paving(x, y, rm, 0xd6c8b2, 0xc2b29a, 0.6, 51);
  var ang = Math.atan2(dy, dx), k8 = Math.abs(Math.sin(ang * 4)) * d;
  if (k8 < 1.6 || d > R * 0.62) return paving(x, y, rm, 0xd2c1ab, 0xbcaa92, 0.7, 52);
  if (k8 < 2.3 || d > R * 0.62 - 0.8) return 0x4a6d2c;
  if (Math.abs(d - R * 0.4) < 1.6 && rm < 1.2) { var f = flowers(x, y, 71); if (f >= 0) return f; return 0x5a3f2a; }
  return grass(x, y, rm, 61);
}
/* a small public garden on a block too awkward to build on: lawn, a gravel ring path, two crossing paths, flower borders */
function sgGarden(F, x, y, rm, s) {
  var dx = x - F.cx, dy = y - F.cy, R = Math.sqrt(F.area / Math.PI), d = Math.sqrt(dx * dx + dy * dy);
  var pw = 1.3, ax = F.ax, ay = F.ay, u = dx * ax + dy * ay, v = -dx * ay + dy * ax;
  if (Math.abs(d - R * 0.42) < pw || (Math.abs(u) < pw * 0.8 && d < R * 0.42) || (Math.abs(v) < pw * 0.8 && d < R * 0.42)) return tiles(x, y, rm, CO_PATH, 0xc4b392, 1);
  if (d < 2.6) return d < 1.8 ? 0x8ec6dc : 0xd8d2c4;                                 // a little round basin in the middle
  if (Math.abs(d - R * 0.42) < pw + 0.9 && rm < 1.2) { var fl = hh(Math.floor(x / 0.8), Math.floor(y / 0.8), s); if (fl < 0.3) return [0xe76fa0, 0xf4d24a, 0xb07ae0, 0xffffff, 0xe85a4a][(fl * 16) | 0]; return 0x5f9a3e; }
  return lawn(x, y, rm, s);
}
function sgGround(t, x, y, rm, gx, gy, dd) {
  var s = dd * 977;
  if (t === "park") {
    var pn = noise(x / 70 + dd, y / 70), pn2 = noise(x / 45 - 3, y / 45 + dd);
    if (Math.abs(pn) < 0.022 || Math.abs(pn2) < 0.016) return tiles(x, y, rm, CO_PATH, 0xc4b392, 1);
    if (pn > 0.5) return pn > 0.53 ? 0x4f9fcf : 0x8ec6dc;
    if (rm < 1 && hh(Math.floor(x / 1.3), Math.floor(y / 1.3), s) < 0.012) return [0xe76fa0, 0xf4d24a, 0xb07ae0, 0xffffff][(hh(Math.floor(x), Math.floor(y), 3) * 4) | 0];
    return lawn(x, y, rm, s);
  }
  if (t === "glass") return tiles(x, y, rm, 0xd0cbc2, 0xbfb9ae, 3);
  if (FACEK === 1) return sgSquare(x, y, rm, gx, gy);
  if (FACE && FACE.cf && FACE.ny && rm <= 3) return sgNyYard(FACE, x, y, rm, s);
  if (FACE && FACE.cf && rm <= 3) return sgCourt(FACE, x, y, rm, gx, gy);
  if (FACE && FACE.gd && rm <= 3) return sgGarden(FACE, x, y, rm, s);
  if (rm <= 3) return sgYard(x, y, rm, gx, gy, s, t);
  if (rm > 3) { var cn = noise(x / 14 + dd, y / 14) + 0.5 * noise(x / 5, y / 5 + dd); if (cn > 0.12) return cn > 0.45 ? 0x3f7a35 : cn > 0.3 ? 0x4b8a3c : 0x5a9a44; }
  var n = noise(x / 23 + dd * 3, y / 23);
  if (t === "historic" || t === "haussmann") { if (n > 0.55) return tiles(x, y, rm, 0xcbbfa9, 0xbcb09a, 1.2); if (n < -0.7) return 0xd9c58e; }
  if (t === "soviet" && Math.abs(n) < 0.03) return tiles(x, y, rm, 0xbdb8ad, 0xb0ab9f, 1);
  return lawn(x, y, rm, s);
}

/* ---------- schema cities: buildings as convex lots along the streets ---------- */
var KITS = {
  msk: { walls: [0xe2bf78, 0xdca99a, 0xe6bf94, 0xb7cfae, 0xe8d8b6, 0xb0c4d6, 0xece6d8, 0xdcb684, 0xc98f6a], roofs: [0x5f8f6a, 0x6f9a7a, 0xb85a3e, 0xc0623f, 0xa9503a, 0x7d828c, 0x8b8f98], pitched: 0.62, trim: 0xf4efe4, aw: 0.28 },
  stalin: { walls: [0xe8dcc0, 0xdccaa6, 0xe9d3a8, 0xd6c4a0, 0xc9b48a], roofs: [0x8d949a, 0x6f7a72, 0xa8483a, 0x7b8389], pitched: 0.4, trim: 0xf2ead6, aw: 0.3 },
  panel: { walls: [0xe4e2dc, 0xd2d4d0, 0xdcd6c8, 0xc8d0d4, 0xe8e0d0], roofs: [0x9a9ea3, 0xa6a8a6], pitched: 0, trim: 0, aw: 0 },
  glass: { walls: GLASS, roofs: [0x8f979e, 0x9aa2a8], pitched: 0, trim: 0, aw: 0, glass: 1 }
};
KITS.haus = { walls: [0xe8dcc4, 0xdfd2b6, 0xece2cc, 0xd9ccb0, 0xe4d7bc, 0xf0e6d2], roofs: [0x6f7c8a, 0x7d8a96, 0x66717d], pitched: 0, trim: 0xf6efe0, aw: 0.55, mansard: 1, balc: 1 };
KITS.subfr = { walls: [0xf0e8d8, 0xe8d8bc, 0xf4efe4, 0xe2cfb0], roofs: [0xb9472f, 0xc4573a, 0xa8402c, 0x9c4632], pitched: 0.85, trim: 0xfaf6ee, aw: 0.05 };
KITS.ny = { walls: [0xa8583c, 0xb06a4e, 0x9a4e36, 0xb87a5a, 0x8e5a44, 0xc9a07a, 0xa86848], roofs: [0x55585c, 0x606366, 0x4d5054], pitched: 0, trim: 0xe8dcc6, aw: 0.35, fire: 1, wt: 0.12 };
KITS.nyt = { walls: [0xc7c3b6, 0xb9b5a8, 0x8a9fb5, 0x6f97b3, 0xd9cfb4, 0x56788f, 0xa9aca4], roofs: [0x8f979e, 0x7d858c], pitched: 0, trim: 0, aw: 0.15, glassP: 0.45 };
KITS.ist = { walls: [0xe8b04a, 0xd98f6a, 0xf1e3b2, 0x9fcf8a, 0xe07a5f, 0xd9c4a0, 0xf2f0e6, 0xb9cfe2, 0xe6a0a0], roofs: [0xb9472f, 0xc4573a, 0xa8402c, 0xcf6a45, 0xb35238], pitched: 0.88, trim: 0xf6f0e4, aw: 0.3 };
KITS.istm = { walls: [0xf1ebdc, 0xe2cfa6, 0xd8d4ca, 0xe8e0d0, 0xeadcc0], roofs: [0xb9472f, 0xc4573a, 0x9a9ea3], pitched: 0.45, trim: 0, aw: 0.2 };
/* kit facade groups (atlas fk.<name>): fk = street side, fky = courtyard / rear side, fkt = towers over 70 m; ny = New York roofs, props, rear gardens */
KITS.msk.fk = "msk"; KITS.stalin.fk = "stal"; KITS.haus.fk = "msk"; KITS.subfr.fk = "msk";
var NY_ROOF = [0xb4b8bb, 0x9a9ea2, 0x6a6d70, 0x55585b, 0xa49a8c, 0x8a857c, 0xc0c3c4];   // silver-painted tar, grey membrane, the odd black tar roof
KITS.ny.fk = "nyten"; KITS.ny.fky = "nyyard"; KITS.ny.ny = 1;
KITS.nyrow = { walls: [0x94603f, 0x9c6a4a, 0x8a5a40, 0xa8785a, 0xb0654a, 0xc2b092, 0xa06a50, 0x9b8f86], roofs: [0x55585c, 0x606366], pitched: 0, trim: 0xe8dcc6, aw: 0, fk: "nyrow", fky: "nyyard", ny: 1 };
KITS.nyloft = { walls: [0xe6dccb, 0xd9cdb8, 0xc9b9a0, 0xb8a58c, 0xe2d6c2], roofs: [0x55585c, 0x606366], pitched: 0, trim: 0, aw: 0.1, fk: "nyloft", fky: "nyyard", ny: 1 };
KITS.nyt.fk = "nymid"; KITS.nyt.fkt = "nytall"; KITS.nyt.fkg = "nyglass"; KITS.nyt.fky = "nymid"; KITS.nyt.ny = 1;
var DRULE = {
  ottoman: { lot: [10, 20], D: [11, 15], fl: [3, 5], sb: 0, gap: 0.03, kit: "ist", treeP: 0.3, stP: 0.45 },
  modern: { lot: [20, 40], D: [13, 17], fl: [5, 9], sb: 2, gap: 0.08, kit: "istm", treeP: 0.3, stP: 0.6 },
  nybrick: { lot: [8, 16], D: [15, 19], fl: [4, 6], sb: 0, gap: 0, kit: "ny", treeP: 0.3, stP: 0.75, arch: 0, shop: 0.75, yard: "ny" },
  nyrow: { lot: [5.5, 8], D: [12, 15], fl: [3, 4], sb: 0, gap: 0, kit: "nyrow", treeP: 0.55, stP: 0.85, arch: 0, shop: 0.06, yard: "ny", bw: 2.1, stoop: 1 },
  nyloft: { lot: [10, 20], D: [20, 26], fl: [5, 7], sb: 0, gap: 0, kit: "nyloft", treeP: 0.12, stP: 0.6, arch: 0, shop: 1, yard: "ny", bw: 2.6 },
  midtown: { lot: [18, 40], D: [22, 32], fl: [12, 50], sb: 0, gap: 0, kit: "nyt", treeP: 0.06, stP: 0.45, arch: 0, shop: 0.8 },
  downtown: { lot: [18, 36], D: [20, 30], fl: [14, 58], sb: 0, gap: 0, kit: "nyt", treeP: 0.05, stP: 0.4, arch: 0, shop: 0.7 },
  haussmann: { lot: [14, 28], D: [15, 20], fl: [6, 7], sb: 0, gap: 0.01, kit: "haus", treeP: 0.22, stP: 0.85 },
  banlieue: { lot: [16, 34], D: [9, 13], fl: [2, 4], sb: 4, gap: 0.3, kit: "subfr", treeP: 0.4, stP: 0.6 },
  historic: { lot: [12, 24], D: [11, 15], fl: [3, 6], sb: 0, gap: 0, kit: "msk", treeP: 0.4, stP: 0.8, arch: 0.12, shop: 0.55 },
  stalin: { lot: [24, 50], D: [14, 18], fl: [6, 9], sb: 0, gap: 0.02, kit: "stalin", treeP: 0.4, stP: 0.8, arch: 0.25, shop: 0.7 },
  soviet: { lot: [48, 95], D: [11, 13], fl: [9, 17], sb: 10, gap: 0.45, kit: "panel", treeP: 0.33, stP: 0.6, slabs: 1 },
  glass: { lot: [26, 40], D: [24, 32], fl: [15, 48], sb: 6, gap: 0.3, kit: "glass", treeP: 0.06, stP: 0.4 }
};
function polyArea(p) { var a = 0, n = p.length >> 1; for (var i = 0; i < n; i++) { var j = (i + 1) % n; a += p[2 * i] * p[2 * j + 1] - p[2 * j] * p[2 * i + 1]; } return Math.abs(a) / 2; }
function clipHalf(p, nx0, ny0, px0, py0, w) { // keep points with (q - p0)·n >= w
  var out = [], n = p.length >> 1;
  for (var i = 0; i < n; i++) {
    var j = (i + 1) % n, ax = p[2 * i], ay = p[2 * i + 1], bx = p[2 * j], by = p[2 * j + 1];
    var fa = (ax - px0) * nx0 + (ay - py0) * ny0 - w, fb = (bx - px0) * nx0 + (by - py0) * ny0 - w;
    if (fa >= 0) out.push(ax, ay);
    if ((fa >= 0) !== (fb >= 0)) { var t = fa / (fa - fb); out.push(ax + (bx - ax) * t, ay + (by - ay) * t); }
  }
  return out;
}
function satOverlap(p, q) {
  for (var pass = 0; pass < 2; pass++) {
    var A = pass ? q : p, n = A.length >> 1;
    for (var i = 0; i < n; i++) {
      var j = (i + 1) % n, ex = A[2 * j] - A[2 * i], ey = A[2 * j + 1] - A[2 * i + 1], l = Math.hypot(ex, ey) || 1, nx0 = -ey / l, ny0 = ex / l;
      var a0 = 1e9, a1 = -1e9, b0 = 1e9, b1 = -1e9, k, v;
      for (k = 0; k < p.length; k += 2) { v = p[k] * nx0 + p[k + 1] * ny0; if (v < a0) a0 = v; if (v > a1) a1 = v; }
      for (k = 0; k < q.length; k += 2) { v = q[k] * nx0 + q[k + 1] * ny0; if (v < b0) b0 = v; if (v > b1) b1 = v; }
      if (a1 < b0 + 0.35 || b1 < a0 + 0.35) return false;
    }
  }
  return true;
}
function inPoly(p, x, y) { var n = p.length >> 1, s = 0; for (var i = 0; i < n; i++) { var j = (i + 1) % n, c = (p[2 * j] - p[2 * i]) * (y - p[2 * i + 1]) - (p[2 * j + 1] - p[2 * i + 1]) * (x - p[2 * i]); if (c !== 0) { if (s === 0) s = c > 0 ? 1 : -1; else if ((c > 0 ? 1 : -1) !== s) return false; } } return true; }
/* where along edge e (from node, outward dir ox,oy) the lot run may start on the side with normal (nx0,ny0) */
function endClear(g, e, node, ox, oy, nx0, ny0, o, D, clips) {
  var E = g.E, best = -1, bth = 9, bv = null;
  var L = g.adj[node];
  for (var q = 0; q < L.length; q++) {
    var e2 = L[q]; if (e2 === e) continue;
    var vx = E.a[e2] === node ? E.ux[e2] : -E.ux[e2], vy = E.a[e2] === node ? E.uy[e2] : -E.uy[e2];
    if (vx * nx0 + vy * ny0 <= 0.02) continue;
    var th = Math.acos(Math.max(-1, Math.min(1, vx * ox + vy * oy)));
    if (th < bth) { bth = th; best = e2; bv = [vx, vy]; }
  }
  if (best < 0) return L.length <= 1 ? 4 : 0;
  if (bth > 2.75) return 0;
  var W2 = EC[E.cls[best]][0] + EC[E.cls[best]][1];
  // signed distance to e2's line, positive inside the wedge
  var wx = ox + bv[0], wy = oy + bv[1], sg = (bv[0] * wy - bv[1] * wx) > 0 ? 1 : -1;
  var A = sg * (bv[0] * oy - bv[1] * ox), B = sg * (bv[0] * ny0 - bv[1] * nx0);
  if (A < 0.15) A = 0.15;
  var nlx = sg * -bv[1], nly = sg * bv[0]; // unit normal of e2's line pointing into the wedge: sd = (p - node)·nl
  var tn = function (off, extra) { return (W2 + extra - B * off) / A; };
  if (e < best) { clips.push([nlx, nly, g.nx[node], g.ny[node], W2]); return Math.max(0, tn(o, 0)); }
  return Math.max(0, tn(o, D), tn(o + D, D));
}
function pickRoof(kit, h) { return kit.roofs[(h * kit.roofs.length) | 0]; }

/* ---------- perimeter blocks from the faces of the street graph ----------
   Every bounded face of the planar road graph is a city block. Its boundary is inset by each street's
   carriageway + sidewalk (front line) and again by the building depth (back line); the band in between is cut
   into lots, so a block becomes a continuous ring of buildings with mitred corners and a courtyard inside. */
function sgFaces(g) {
  var E = g.E, nn = g.nx.length, i, k;
  var ord = [];
  for (i = 0; i < nn; i++) {
    var L = g.adj[i].slice();
    L.sort(function (a, b) {
      var ax = E.a[a] === i ? E.ux[a] : -E.ux[a], ay = E.a[a] === i ? E.uy[a] : -E.uy[a], bx = E.a[b] === i ? E.ux[b] : -E.ux[b], by = E.a[b] === i ? E.uy[b] : -E.uy[b];
      return Math.atan2(ay, ax) - Math.atan2(by, bx);
    });
    ord.push(L);
  }
  var seen = new Uint8Array(g.ne * 2), faces = [];
  for (var h0 = 0; h0 < g.ne * 2; h0++) {
    if (seen[h0]) continue;
    var verts = [], hes = [], h = h0, guard = 0;
    while (!seen[h] && guard++ < 4000) {
      seen[h] = 1;
      var e = h >> 1, rev = h & 1, u = rev ? E.b[e] : E.a[e], v = rev ? E.a[e] : E.b[e];
      verts.push(u); hes.push(e);
      var Lv = ord[v], idx = Lv.indexOf(e);
      var e2 = Lv[(idx - 1 + Lv.length) % Lv.length];        // next edge clockwise from the way back
      h = e2 * 2 + (E.a[e2] === v ? 0 : 1);
    }
    // remove spikes left by dead-end streets (u, v, u)
    for (var it = 0; it < 50 && verts.length > 3; it++) {
      var found = false;
      for (k = 0; k < verts.length; k++) {
        var km = (k - 1 + verts.length) % verts.length, kp = (k + 1) % verts.length;
        if (verts[km] === verts[kp]) { var lo = Math.min(k, kp), hi = Math.max(k, kp); verts.splice(hi, 1); hes.splice(hi, 1); verts.splice(lo, 1); hes.splice(lo, 1); found = true; break; }
      }
      if (!found) break;
    }
    if (verts.length < 3) continue;
    var A = 0;
    for (k = 0; k < verts.length; k++) { var p0 = verts[k], p1 = verts[(k + 1) % verts.length]; A += g.nx[p0] * g.ny[p1] - g.nx[p1] * g.ny[p0]; }
    faces.push({ v: verts, e: hes, A: A / 2 });
  }
  // bounded faces share one orientation; the outer face and spikes have the other or a huge area
  var pos = 0, neg = 0;
  for (k = 0; k < faces.length; k++) { if (faces[k].A > 0) pos += faces[k].A; else neg -= faces[k].A; }
  var sgn = pos > neg ? -1 : 1; // the outer face is the largest single face; most area sits in bounded faces of the other sign
  var big = 0; for (k = 0; k < faces.length; k++) if (Math.abs(faces[k].A) > Math.abs(faces[big].A)) big = k;
  sgn = faces[big].A > 0 ? -1 : 1;
  var out = [];
  for (k = 0; k < faces.length; k++) if (k !== big && faces[k].A * sgn > 0) out.push(faces[k]);
  g.fsgn = sgn;
  return out;
}
function sgFillFace(g, px, py, val) {
  var N = g.N, half = g.half, cell = g.cell, y0 = 1e9, y1 = -1e9, m = px.length, j, k;
  for (k = 0; k < m; k++) { y0 = Math.min(y0, py[k]); y1 = Math.max(y1, py[k]); }
  for (j = Math.max(0, Math.floor(y0 / cell) + half); j <= Math.min(N - 1, Math.floor(y1 / cell) + half); j++) {
    var yc = (j - half + 0.5) * cell, xs = [];
    for (k = 0; k < m; k++) { var k2 = (k + 1) % m; if ((py[k] <= yc) !== (py[k2] <= yc)) xs.push(px[k] + (yc - py[k]) / (py[k2] - py[k]) * (px[k2] - px[k])); }
    xs.sort(function (a, b) { return a - b; });
    for (k = 0; k + 1 < xs.length; k += 2) for (var i = Math.max(0, Math.floor(xs[k] / cell) + half); i <= Math.min(N - 1, Math.floor(xs[k + 1] / cell) + half); i++) g.fid[j * N + i] = val;
  }
}
/* Douglas-Peucker on a closed ring of points with per-point offsets; returns kept indices */
function dpRing(xs, ys, off, tol) {
  var n = xs.length, keep = new Uint8Array(n), i;
  // always keep points where the offset (street class) changes or the turn is sharp
  for (i = 0; i < n; i++) {
    var a = (i - 1 + n) % n, b = (i + 1) % n;
    var d1x = xs[i] - xs[a], d1y = ys[i] - ys[a], d2x = xs[b] - xs[i], d2y = ys[b] - ys[i], l1 = Math.hypot(d1x, d1y) || 1, l2 = Math.hypot(d2x, d2y) || 1;
    if ((d1x * d2x + d1y * d2y) / (l1 * l2) < 0.97 || off[a] !== off[i]) keep[i] = 1;
  }
  var anyK = 0; for (i = 0; i < n; i++) anyK += keep[i];
  if (anyK < 2) { keep[0] = 1; keep[(n / 2) | 0] = 1; }
  var ks = []; for (i = 0; i < n; i++) if (keep[i]) ks.push(i);
  var rec = function (a, b) { // indices along ring from a to b (exclusive)
    var ax = xs[a], ay = ys[a], bx = xs[b], by = ys[b], best = -1, bd = tol;
    for (var j = (a + 1) % n; j !== b; j = (j + 1) % n) { var d = segD(xs[j], ys[j], ax, ay, bx, by); if (d > bd) { bd = d; best = j; } }
    if (best >= 0) { keep[best] = 1; rec(a, best); rec(best, b); }
  };
  for (i = 0; i < ks.length; i++) rec(ks[i], ks[(i + 1) % ks.length]);
  var out = []; for (i = 0; i < n; i++) if (keep[i]) out.push(i);
  return out;
}
/* offset a closed polygon inwards by per-side distances (side k runs from vertex k to k+1); sgn = orientation.
   Sides that collapse (their offset segment would flip) are dropped and their neighbours meet directly,
   so vertex k keeps its index (a dropped side becomes a zero-length side): lots can map front and back rings 1:1. */
function insetRing(px, py, dist, sgn, miter) {
  var n = px.length, k, it;
  var lx = new Float64Array(n), ly = new Float64Array(n), dx = new Float64Array(n), dy = new Float64Array(n), act = new Uint8Array(n);
  for (k = 0; k < n; k++) {
    var b = (k + 1) % n, ex = px[b] - px[k], ey = py[b] - py[k], l = Math.hypot(ex, ey) || 1;
    dx[k] = ex / l; dy[k] = ey / l; lx[k] = px[k] - dy[k] * sgn * dist[k]; ly[k] = py[k] + dx[k] * sgn * dist[k]; act[k] = 1;
  }
  var ox = new Float64Array(n), oy = new Float64Array(n), na = n;
  var meet = function (a, c, vk) { // intersection of active lines a and c, near original vertex vk
    var den = dx[a] * dy[c] - dy[a] * dx[c], x, y;
    if (Math.abs(den) < 1e-3) { x = (lx[c] + lx[a] + dx[a] * Math.hypot(px[vk] - px[a], py[vk] - py[a])) / 2; y = (ly[c] + ly[a] + dy[a] * Math.hypot(px[vk] - px[a], py[vk] - py[a])) / 2; }
    else { var t = ((lx[c] - lx[a]) * dy[c] - (ly[c] - ly[a]) * dx[c]) / den; x = lx[a] + dx[a] * t; y = ly[a] + dy[a] * t; }
    var mx = x - px[vk], my = y - py[vk], ml = Math.hypot(mx, my), lim = miter * Math.max(dist[a], dist[c]);
    if (ml > lim) { x = px[vk] + mx / ml * lim; y = py[vk] + my / ml * lim; }
    MX = x; MY = y;
  };
  for (it = 0; it < n; it++) {
    for (k = 0; k < n; k++) {
      if (!act[k]) continue;
      var pv = (k - 1 + n) % n; while (!act[pv]) pv = (pv - 1 + n) % n;
      meet(pv, k, k); ox[k] = MX; oy[k] = MY;
    }
    for (k = 0; k < n; k++) if (!act[k]) { var nx2 = (k + 1) % n; while (!act[nx2]) nx2 = (nx2 + 1) % n; ox[k] = ox[nx2]; oy[k] = oy[nx2]; }
    var worst = -1, wv = 0;
    for (k = 0; k < n; k++) {
      if (!act[k]) continue;
      var nk = (k + 1) % n; while (!act[nk]) nk = (nk + 1) % n;
      var v = (ox[nk] - ox[k]) * dx[k] + (oy[nk] - oy[k]) * dy[k];
      if (v < wv) { wv = v; worst = k; }
    }
    if (worst < 0) break;
    act[worst] = 0; na--;
    if (na < 3) return [ox, oy, false];
  }
  return [ox, oy, true];
}
var MX = 0, MY = 0;
function ringArea(px, py) { var a = 0, n = px.length; for (var i = 0; i < n; i++) { var j = (i + 1) % n; a += px[i] * py[j] - px[j] * py[i]; } return a / 2; }
function ringSelfX(px, py) { // any two non-adjacent sides crossing
  var n = px.length;
  for (var i = 0; i < n; i++) for (var j = i + 2; j < n; j++) {
    if (i === 0 && j === n - 1) continue;
    var ax = px[i], ay = py[i], bx = px[(i + 1) % n], by = py[(i + 1) % n], cx = px[j], cy = py[j], dx = px[(j + 1) % n], dy = py[(j + 1) % n];
    if (Math.abs(bx - ax) + Math.abs(by - ay) < 1e-6 || Math.abs(dx - cx) + Math.abs(dy - cy) < 1e-6) continue;
    if (Math.hypot(ax - cx, ay - cy) < 1e-6 || Math.hypot(ax - dx, ay - dy) < 1e-6 || Math.hypot(bx - cx, by - cy) < 1e-6 || Math.hypot(bx - dx, by - dy) < 1e-6) continue;
    var d1 = (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx), d2 = (dx - cx) * (by - cy) - (dy - cy) * (bx - cx), d3 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax), d4 = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax);
    if ((d1 > 0) !== (d2 > 0) && (d3 > 0) !== (d4 > 0)) return true;
  }
  return false;
}
function sgBlocks(c, g, place) {
  var E = g.E, faces = sgFaces(g), sgn = g.fsgn, fi;
  g.faces = [];
  g.fid = new Int32Array(g.N * g.N);
  for (fi = 0; fi < faces.length; fi++) {
    var F = faces[fi], n = F.v.length, k;
    var area = Math.abs(F.A);
    if (area < 400) continue;
    var xs = [], ys = [], off = [];
    for (k = 0; k < n; k++) { xs.push(g.nx[F.v[k]]); ys.push(g.ny[F.v[k]]); var cl = E.cls[F.e[k]]; off.push(EC[cl][0] + EC[cl][1]); }
    var cx = 0, cy = 0; for (k = 0; k < n; k++) { cx += xs[k]; cy += ys[k]; } cx /= n; cy /= n;
    var ci = sgCell(g, cx, cy);
    if (ci < 0 || !g.dist[ci]) continue;
    var dt = g.dt[g.dist[ci] - 1], rule = DRULE[dt];
    var keep = dpRing(xs, ys, off, 1.2), m = keep.length;
    if (m < 3) continue;
    // merge short sides and drop near-reversals (notches left by short connector streets)
    var qx = [], qy = [], qo = [];
    for (k = 0; k < m; k++) { qx.push(xs[keep[k]]); qy.push(ys[keep[k]]); qo.push(off[keep[k]]); }
    for (var it2 = 0; it2 < 40 && qx.length > 3; it2++) {
      var ch = false, mm = qx.length;
      for (k = 0; k < mm && !ch; k++) {
        var k1 = (k + 1) % mm, km1 = (k - 1 + mm) % mm, sl2 = Math.hypot(qx[k1] - qx[k], qy[k1] - qy[k]);
        var ax1 = qx[k] - qx[km1], ay1 = qy[k] - qy[km1], ax2 = qx[k1] - qx[k], ay2 = qy[k1] - qy[k], la = Math.hypot(ax1, ay1) || 1, lb = Math.hypot(ax2, ay2) || 1;
        if ((ax1 * ax2 + ay1 * ay2) / (la * lb) < -0.85) { qx.splice(k, 1); qy.splice(k, 1); qo.splice(k, 1); ch = true; }
        else if (sl2 < 7) { qx[k] = (qx[k] + qx[k1]) / 2; qy[k] = (qy[k] + qy[k1]) / 2; qo[k] = Math.max(qo[k], qo[k1]); qx.splice(k1, 1); qy.splice(k1, 1); qo.splice(k1, 1); ch = true; }
      }
      if (!ch) break;
    }
    m = qx.length;
    if (m < 3) continue;
    var px = new Float64Array(m), py = new Float64Array(m), od = new Float64Array(m);
    for (k = 0; k < m; k++) { px[k] = qx[k]; py[k] = qy[k]; od[k] = qo[k]; }
    var fid = g.faces.length, hs = hh(fi, F.v.length, c.seed | 0);
    var face = { id: fid, px: px, py: py, cx: cx, cy: cy, area: area, t: dt, kind: 0, ax: 1, ay: 0, seed: hs };
    var bl = 0; for (k = 0; k < m; k++) { var k2b = (k + 1) % m, sl = Math.hypot(px[k2b] - px[k], py[k2b] - py[k]); if (sl > bl) { bl = sl; face.ax = (px[k2b] - px[k]) / sl; face.ay = (py[k2b] - py[k]) / sl; } }
    g.faces.push(face);
    sgFillFace(g, px, py, fid + 1);
    if (!rule || rule.slabs || area > 160000) continue;
    if (g.lmk[ci] || (g.wat[ci] & 1)) continue;
    if (area < 9000 && area > 2500 && hs < (rule.sq || 0.035)) { face.kind = 1; continue; } // a square with a fountain
    var front = insetRing(px, py, od, sgn, 2.5);
    var fx = front[0], fy = front[1];
    if (!front[2] || ringArea(fx, fy) * ringArea(px, py) <= 0 || Math.abs(ringArea(fx, fy)) < 120 || ringSelfX(fx, fy)) {
      if (area > 500) face.gd = 1;
      continue;
    }
    var D = rule.D[0] + (rule.D[1] - rule.D[0]) * hh(fi, 2, 77), dd = new Float64Array(m), back, bxs, bys, bad = true;
    for (var tryD = 0; tryD < 3 && bad; tryD++) {
      for (k = 0; k < m; k++) dd[k] = D * (1 - tryD * 0.25);
      back = insetRing(fx, fy, dd, sgn, 2.2); bxs = back[0]; bys = back[1];
      bad = !back[2] || ringArea(bxs, bys) * ringArea(fx, fy) <= 0 || Math.abs(ringArea(bxs, bys)) < 160 || ringSelfX(bxs, bys);
    }
    var solid = bad && Math.abs(ringArea(fx, fy)) < 2600;
    if (bad && !solid) { if (area > 500) face.gd = 1; continue; }
    var kit = KITS[rule.kit];
    if (solid) { // small block: one building filling the inset ring, only if it is a decent quadrilateral
      var pp = [], minCos = 1;
      for (k = 0; k < m; k++) {
        pp.push(fx[k], fy[k]);
        var ka = (k - 1 + m) % m, kb = (k + 1) % m, e1x = fx[ka] - fx[k], e1y = fy[ka] - fy[k], e2x = fx[kb] - fx[k], e2y = fy[kb] - fy[k], l1 = Math.hypot(e1x, e1y), l2 = Math.hypot(e2x, e2y);
        if (l2 < 5) minCos = -1;
        else if (l1 > 1) minCos = Math.min(minCos, -((e1x * e2x + e1y * e2y) / (l1 * l2)));
      }
      if (minCos < -0.5) { face.gd = 1; continue; }                 // an angle under ~60 degrees: a small garden instead
      place(pp, rule, kit, (Math.imul(fi + 7, 0x9e3779b1)) | 0, null, 0, 1);
      continue;
    }
    face.court = [bxs, bys]; var cflat = []; for (k = 0; k < m; k++) cflat.push(bxs[k], bys[k]); face.cf = cflat;
    // separate buildings: a corner building at every convex corner (sides aligned with both streets),
    // rectangular sections along each side in between, with varying depth, height and the odd passage
    var kit = KITS[rule.kit], U = [], Lside = [];
    for (k = 0; k < m; k++) { var kn = (k + 1) % m, ex = fx[kn] - fx[k], ey = fy[kn] - fy[k], l = Math.hypot(ex, ey); Lside.push(l); U.push(l > 1e-6 ? [ex / l, ey / l] : null); }
    var cA = new Float64Array(m), cB = new Float64Array(m), conv = new Uint8Array(m), smooth = new Uint8Array(m);
    for (k = 0; k < m; k++) {
      var kp = (k - 1 + m) % m, up = U[kp], uk = U[k];
      if (!up || !uk) { smooth[k] = 1; continue; }
      if (up[0] * uk[0] + up[1] * uk[1] > 0.86) { smooth[k] = 1; continue; }
      var npx = -up[1] * sgn, npy = up[0] * sgn;
      if (uk[0] * npx + uk[1] * npy <= 0.05) continue;                 // reflex or straight: no corner building
      var vx = bxs[k] - fx[k], vy = bys[k] - fy[k];
      var a = vx * uk[0] + vy * uk[1], a2 = -(vx * up[0] + vy * up[1]);
      if (a < 4 || a2 < 4 || a > Lside[k] * 0.5 || a2 > Lside[kp] * 0.5) continue;
      var acute = -(up[0] * uk[0] + up[1] * uk[1]) > 0.47;               // acute corner: chamfer the tip (a cut corner, common in Moscow)
      conv[k] = 1; cA[k] = a; cB[k] = a2;
      var cpoly = [fx[k], fy[k], fx[k] + uk[0] * a, fy[k] + uk[1] * a, bxs[k], bys[k], fx[k] - up[0] * a2, fy[k] - up[1] * a2];
      if (acute) { var ch = Math.min(a, a2) * 0.42; cpoly = [fx[k] + uk[0] * ch, fy[k] + uk[1] * ch, fx[k] + uk[0] * a, fy[k] + uk[1] * a, bxs[k], bys[k], fx[k] - up[0] * a2, fy[k] - up[1] * a2, fx[k] - up[0] * ch, fy[k] - up[1] * ch]; }
      var sq = !acute && Math.abs(uk[0] * up[0] + uk[1] * up[1]) < 0.12;
      var crect = sq ? { cx: (fx[k] + bxs[k]) / 2, cy: (fy[k] + bys[k]) / 2, ux: uk[0], uy: uk[1], hl: a / 2, hd: a2 / 2 } : null;
      var cb = place(cpoly, rule, kit, (Math.imul(fid * 64 + k + 5, 0x9e3779b1)) | 0, crect, 0, 1);
      if (cb) sgFront(cb, [0, 3], [od[k], od[kp]], rule, 0);
    }
    for (k = 0; k < m; k++) {
      var u0 = U[k]; if (!u0) continue;
      var kn2 = (k + 1) % m, L0 = Lside[k], nxs = -u0[1] * sgn, nys = u0[0] * sgn;
      var tA = conv[k] ? cA[k] : smooth[k] ? 0 : D * 0.9, tB = L0 - (conv[kn2] ? cB[kn2] : smooth[kn2] ? 0 : D * 0.9);
      // a reflex end must also clear the neighbouring side's rectangles
      var t = tA, q = 0, sd = fid * 64 + k;
      if (tB - tA < 6) continue;
      while (t < tB - 3) {
        var Lt = rule.lot[0] + (rule.lot[1] - rule.lot[0]) * hh(q, sd, 11);
        if (tB - t - Lt < rule.lot[0] * 0.7) Lt = tB - t;
        var gap = rule.arch === undefined && hh(q, sd, 14) < (rule.pass || 0.24) && Lt > 14 ? 3.5 + 3 * hh(q, sd, 15) : 0;
        var Dd = D * (rule.arch === undefined ? 0.72 + 0.28 * hh(q, sd, 12) : 0.86 + 0.14 * hh(q, sd, 12)), L1 = Lt - gap;
        var x0 = fx[k] + u0[0] * t, y0 = fy[k] + u0[1] * t;
        var rp = [x0, y0, x0 + u0[0] * L1, y0 + u0[1] * L1, x0 + u0[0] * L1 + nxs * Dd, y0 + u0[1] * L1 + nys * Dd, x0 + nxs * Dd, y0 + nys * Dd];
        var rr = { cx: x0 + u0[0] * L1 / 2 + nxs * Dd / 2, cy: y0 + u0[1] * L1 / 2 + nys * Dd / 2, ux: u0[0], uy: u0[1], hl: L1 / 2, hd: Dd / 2 };
        var bseed = (Math.imul(sd + 17, 0x9e3779b1) ^ Math.imul(q + 3, 0x85ebca6b)) | 0, sbd = null;
        for (var shr = 0; shr < 3 && !sbd; shr++) {
          var Dq = Dd * (1 - shr * 0.25);
          rp = [x0, y0, x0 + u0[0] * L1, y0 + u0[1] * L1, x0 + u0[0] * L1 + nxs * Dq, y0 + u0[1] * L1 + nys * Dq, x0 + nxs * Dq, y0 + nys * Dq];
          rr = { cx: x0 + u0[0] * L1 / 2 + nxs * Dq / 2, cy: y0 + u0[1] * L1 / 2 + nys * Dq / 2, ux: u0[0], uy: u0[1], hl: L1 / 2, hd: Dq / 2 };
          sbd = place(rp, rule, kit, bseed, rr, 0, 1);
          if (rule.arch === undefined) break;
        }
        if (sbd) sgFront(sbd, [0], [od[k]], rule, rule.arch && L1 > 13 && hh(q, sd, 14) < rule.arch ? 1 : 0);
        if (sbd && rule.yard === "ny") { // New York rear gardens: a fence from the back wall at every lot line
          face.ny = 1; (face.fen || (face.fen = [])).push(k, x0 + nxs * Dq, y0 + nys * Dq, x0 + u0[0] * L1 + nxs * Dq, y0 + u0[1] * L1 + nys * Dq);
        }
        t += Lt; q++;
      }
    }
  }
}
/* street furniture of one 64 m cell, part of the skeleton (residents walk around it, the renderer draws it from the kit):
   lamps along the curb between the street trees, bins by entrances, cafe tables in front of shop windows on busy streets,
   kiosks by the curb, and benches, a sandbox, swings and a flower bed in larger courtyards. k = 5, t = type. */
function sgProps(c, i, j) {
  var sb = sgBuild(c), key = i * 65536 + j;
  if (!sb.P) sb.P = new Map();
  var T = sb.P.get(key);
  if (T) return T;
  T = []; sb.P.set(key, T);
  var g = c.sg, E = g.E, x0 = i * 64, y0 = j * 64, q, add = function (t, x, y, id) {
    if (x < x0 || y < y0 || x >= x0 + 64 || y >= y0 + 64) return;
    var ci = sgCell(g, x, y); if (ci < 0 || (g.wat[ci] & 1) || g.lmk[ci]) return;
    if (sgInBuilding(sb, x, y)) return;
    T.push({ k: 5, t: t, x: x, y: y, id: id | 0 });
  };
  var L = g.EB.get(key), NY = c.lm === "nyc";
  if (L) for (q = 0; q < L.length; q++) {
    var e = L[q], cls = E.cls[e], cw = EC[cls][0], sw = EC[cls][1], ux = E.ux[e], uy = E.uy[e], len = E.len[e];
    var da = g.adj[E.a[e]].length > 2, db = g.adj[E.b[e]].length > 2, xa = g.nx[E.a[e]], ya = g.ny[E.a[e]];
    var s0 = da ? g.nr[E.a[e]] + sw + 4 : 2, s1 = db ? len - g.nr[E.b[e]] - sw - 4 : len - 2;
    for (var side = -1; side <= 1; side += 2) {
      for (var s = Math.ceil((s0 + E.sA[e] - 5.25) / 21) * 21 - E.sA[e] + 5.25; s < s1; s += 21) // lamps between the trees
        add("lamp", xa + ux * s - uy * side * (cw + 0.7), ya + uy * s + ux * side * (cw + 0.7), Math.imul(e + 3, 0x9e3779b1) ^ Math.floor(s));
      if (NY) { // New York sidewalks: hydrants, wire cans and newspaper boxes by the corners, subway stairs on the avenues, carts, bike docks
        var cs = side * 7 + e * 13, wo = cw + 0.8, wm = cw + sw * 0.5;
        if (da) { if (hh(e, cs, 201) < 0.7) add("hydrant", xa + ux * (s0 - 2) - uy * side * wo, ya + uy * (s0 - 2) + ux * side * wo, cs + 1);
          if (hh(e, cs, 202) < 0.6) add("wirecan", xa + ux * (s0 - 0.5) - uy * side * wo, ya + uy * (s0 - 0.5) + ux * side * wo, cs + 2);
          if (hh(e, cs, 203) < (cls < 2 ? 0.55 : 0.25)) add("newsbox", xa + ux * (s0 + 1.6) - uy * side * wo, ya + uy * (s0 + 1.6) + ux * side * wo, cs + 3);
          if (hh(e, cs, 204) < 0.12) add("mailbox", xa + ux * (s0 + 3.4) - uy * side * wo, ya + uy * (s0 + 3.4) + ux * side * wo, cs + 4); }
        if (db && hh(e, cs, 205) < 0.6) add("hydrant", xa + ux * (s1 + 2) - uy * side * wo, ya + uy * (s1 + 2) + ux * side * wo, cs + 5);
        if (cls < 2 && len > 50 && hh(e, cs, 206) < 0.3) add("subway", xa + ux * (s0 + 6) - uy * side * wm, ya + uy * (s0 + 6) + ux * side * wm, cs + 6);
        if (len > 40 && hh(e, cs, 207) < 0.16) add("hotdog", xa + ux * (s1 - 3) - uy * side * wo, ya + uy * (s1 - 3) + ux * side * wo, cs + 7);
        if (cls < 2 && len > 70 && hh(e, cs, 208) < 0.14) { var sc2 = len * (0.4 + 0.2 * hh(e, cs, 209)); add("citibike", xa + ux * sc2 - uy * side * (cw + 0.9), ya + uy * sc2 + ux * side * (cw + 0.9), cs + 8); }
        if (len > 60 && hh(e, cs, 210) < 0.05) { var sc3 = len * (0.3 + 0.4 * hh(e, cs, 211)); add("barrier", xa + ux * sc3 - uy * side * wo, ya + uy * sc3 + ux * side * wo, cs + 9); add("barrel", xa + ux * (sc3 + 2.4) - uy * side * wo, ya + uy * (sc3 + 2.4) + ux * side * wo, cs + 10); }
      }
      if (len > 40 && hh(e, side, 71) < 0.18) { var sk = len * (0.3 + 0.4 * hh(e, side, 72)); add(NY ? "newsstand" : "kiosk", xa + ux * sk - uy * side * (cw + 1.8), ya + uy * sk + ux * side * (cw + 1.8), e * 31 + side); }
      else if (cls < 2 && len > 70 && hh(e, side, 78) < 0.5) { var sb2 = len * (0.35 + 0.3 * hh(e, side, 79)); add(NY ? "nybus" : "busstop", xa + ux * sb2 - uy * side * (cw + 1.9), ya + uy * sb2 + ux * side * (cw + 1.9), e * 37 + side); }
    }
  }
  for (var bj = Math.floor((y0 - 8) / 128); bj <= Math.floor((y0 + 72) / 128); bj++) for (var bi = Math.floor((x0 - 8) / 128); bi <= Math.floor((x0 + 72) / 128); bi++) {
    var BL = sb.B.get(bi * 65536 + bj); if (!BL) continue;
    for (q = 0; q < BL.length; q++) {
      var b = sb.list[BL[q]]; if (!b.doors) continue;
      for (var d = 0; d < b.doors.length; d++) {
        var D = b.doors[d], tx = -D.ny, ty = D.nx;
        if (D.k === "home" && hh(b.id, d, 73) < 0.5) add(NY ? (hh(b.id, d, 212) < 0.5 ? "bags" : "tcans") : "bin", D.x + tx * 1.7 + D.nx * (NY ? 1.4 : 0.6), D.y + ty * 1.7 + D.ny * (NY ? 1.4 : 0.6), b.id ^ d);
        else if (D.k === "shop" && NY && hh(b.id, d, 213) < 0.25) add("fruit", D.x - tx * 2.2 + D.nx * 1.2, D.y - ty * 2.2 + D.ny * 1.2, b.id ^ (d * 17));
        else if (D.k === "shop" && hh(b.id, d, 80) < 0.3) add("bike", D.x - tx * 1.9 + D.nx * 0.9, D.y - ty * 1.9 + D.ny * 0.9, b.id ^ (d * 13));
      }
      for (var e2 in b.bays) {
        var B = b.bays[e2], ei = +e2, n = b.n, p = b.p, e3 = (ei + 1) % n, ex = p[2 * e3] - p[2 * ei], ey = p[2 * e3 + 1] - p[2 * ei + 1], el = Math.hypot(ex, ey) || 1;
        var D0 = b.doors.length ? b.doors[0] : null, nx = D0 ? D0.nx : 0, ny = D0 ? D0.ny : 0;
        for (var d2 = 0; d2 < b.doors.length; d2++) if (b.doors[d2].e === ei) { nx = b.doors[d2].nx; ny = b.doors[d2].ny; break; }
        if (!nx && !ny) continue;
        for (var k2 = 0; k2 < B.n; k2++) if (B.t.charAt(k2) === "S" && hh(b.id, ei * 64 + k2, 74) < 0.35) {
          var tc = (k2 + 0.5) * B.w;
          add("cafe", p[2 * ei] + ex / el * tc + nx * 2.4, p[2 * ei + 1] + ey / el * tc + ny * 2.4, b.id ^ (k2 * 977));
        }
      }
    }
  }
  if (g.faces) for (q = 0; q < g.faces.length; q++) {
    var F = g.faces[q];
    if (F.kind === 1 && F.cx > x0 - 80 && F.cx < x0 + 144 && F.cy > y0 - 80 && F.cy < y0 + 144) { // square: benches round the fountain, beds and hedges further out
      var R0 = Math.sqrt(F.area / Math.PI), sid = F.id * 151;
      for (var kb = 0; kb < 8; kb++) { var ab = kb / 8 * 6.283 + 0.39; add("bench", F.cx + Math.cos(ab) * 12.5, F.cy + Math.sin(ab) * 12.5, sid + kb); }
      for (var kf = 0; kf < 4; kf++) { var af = kf / 4 * 6.283 + 0.785, rf = Math.min(R0 * 0.55, 20); add("flower", F.cx + Math.cos(af) * rf, F.cy + Math.sin(af) * rf, sid + 20 + kf); add("hedge", F.cx + Math.cos(af + 0.3) * rf, F.cy + Math.sin(af + 0.3) * rf, sid + 30 + kf); }
      continue;
    }
    if (F.gd && F.cx > x0 - 80 && F.cx < x0 + 144 && F.cy > y0 - 80 && F.cy < y0 + 144) {
      var gR2 = Math.sqrt(F.area / Math.PI) * 0.42 + 2.2, gs = F.id * 191;
      for (var kg = 0; kg < 6; kg++) { var ag = kg / 6 * 6.283 + 0.52; add(kg % 3 === 2 ? "lamp" : "bench", F.cx + Math.cos(ag) * gR2, F.cy + Math.sin(ag) * gR2, gs + kg); }
      continue;
    }
    if (!F.cf && !F.kind && F.area > 500 && F.area < 12000 && F.t !== "park" && F.t !== "soviet" && F.cx > x0 - 80 && F.cx < x0 + 144 && F.cy > y0 - 80 && F.cy < y0 + 144) { // paved pocket square
      var ps = F.id * 173;
      for (var kp = 0; kp < 5; kp++) { var ap = hh(ps, kp, 82) * 6.283, rp = 4 + 8 * hh(ps, kp, 83); add(kp < 3 ? "bench" : kp === 3 ? "flower" : "rack", F.cx + Math.cos(ap) * rp, F.cy + Math.sin(ap) * rp, ps + kp); }
      if (hh(ps, 9, 84) < 0.4) add("kiosk", F.cx + 3, F.cy - 4, ps + 9);
      continue;
    }
    if (!F.cf || F.cx < x0 - 80 || F.cx > x0 + 144 || F.cy < y0 - 80 || F.cy > y0 + 144) continue;
    var cx = 0, cy = 0, m = F.court[0].length, ca = Math.abs(ringArea(F.court[0], F.court[1]));
    if (ca < 450) continue;
    for (var k3 = 0; k3 < m; k3++) { cx += F.court[0][k3]; cy += F.court[1][k3]; }
    cx /= m; cy /= m;
    var fs = F.id * 131, bx = F.court[0], by = F.court[1];
    if (F.ny) { // New York rear gardens: something in every lot strip, a deck or a grill by the house, a shed or vegetable bed at the back
      var NE = nyYardPrep(F);
      for (var k7 = 0; k7 < NE.length; k7++) {
        var ne = NE[k7], ninx = -ne.uy, niny = ne.ux;
        if ((ne.x + ne.ux * ne.L / 2 - cx) * ninx + (ne.y + ne.uy * ne.L / 2 - cy) * niny > 0) { ninx = -ninx; niny = -niny; }
        var TT = [0].concat(ne.t, [ne.L]);
        for (var j7 = 0; j7 + 1 < TT.length; j7++) {
          var ta = Math.max(0, TT[j7]), tb2 = Math.min(ne.L, TT[j7 + 1]), wl = tb2 - ta, mt = (ta + tb2) / 2, sd7 = fs + k7 * 211 + j7 * 7;
          if (wl < 3.5) continue;
          var r7 = hh(sd7, 1, 214), tA7 = r7 < 0.3 ? "ydeck" : r7 < 0.5 ? "grill" : r7 < 0.62 ? "ytable" : r7 < 0.72 ? "pots" : r7 < 0.8 ? "lounge" : r7 < 0.86 ? "ybike" : null;
          if (tA7) add(tA7, ne.x + ne.ux * mt + ninx * (tA7 === "ydeck" ? 2.6 : 3.2), ne.y + ne.uy * mt + niny * (tA7 === "ydeck" ? 2.6 : 3.2), sd7 + 1);
          var r8 = hh(sd7, 2, 215), tB7 = r8 < 0.22 ? "gshed" : r8 < 0.4 ? "vbed" : r8 < 0.5 ? "playhouse" : r8 < 0.58 ? "yline" : r8 < 0.66 ? "pots" : null;
          if (tB7) add(tB7, ne.x + ne.ux * (mt + (hh(sd7, 3, 216) - 0.5) * wl * 0.3) + ninx * 7.5, ne.y + ne.uy * (mt + (hh(sd7, 3, 216) - 0.5) * wl * 0.3) + niny * 7.5, sd7 + 2);
        }
      }
      continue;
    }
    // a lived-in Moscow courtyard: cars, garages, bins, sheds and lilac along the back walls ...
    for (var k5 = 0; k5 < m; k5++) {
      var k6 = (k5 + 1) % m, ex = bx[k6] - bx[k5], ey = by[k6] - by[k5], el = Math.hypot(ex, ey);
      if (el < 8) continue;
      var tx = ex / el, ty = ey / el, nx = -ty, ny = tx;
      if ((bx[k5] + ex / 2 - cx) * nx + (by[k5] + ey / 2 - cy) * ny > 0) { nx = -nx; ny = -ny; }
      for (var st = 4; st < el - 3; st += 5.5) {
        var r = hh(fs + k5, Math.floor(st), 81), t2 = r < 0.34 ? "pcar" : r < 0.42 && el - st > 9 ? "garages" : r < 0.5 ? "bins3" : r < 0.56 ? "shed" : r < 0.72 ? "lilac" : r < 0.77 ? "rack" : r < 0.8 ? "container" : r < 0.82 ? "transformer" : null;
        if (!t2) continue;
        var dep = t2 === "pcar" ? 3.4 : t2 === "garages" ? 4 : 2.6;
        add(t2, bx[k5] + tx * st + nx * dep, by[k5] + ty * st + ny * dep, fs + k5 * 97 + Math.floor(st));
        if (t2 === "garages") st += 5;
      }
    }
    // ... and a playground, a table, benches and laundry in the middle
    if (ca > 900) { add("slide", cx - 4, cy - 1, fs + 1); add("sandbox", cx, cy + 2, fs + 4); add("swing", cx + 4.5, cy - 1.5, fs + 2); }
    add("flower", cx + (hh(fs, 1, 75) - 0.5) * 6, cy + 6 + hh(fs, 2, 75) * 2, fs + 3);
    if (ca > 700) { add("picnic", cx + 7, cy + 5, fs + 5); add("laundry", cx - 7, cy + 6, fs + 6); }
    for (var k4 = 0; k4 < 4; k4++) { var ang = hh(fs, k4, 76) * 6.283, rb = 7 + 3 * hh(fs, k4, 77); add("bench", cx + Math.cos(ang) * rb, cy + Math.sin(ang) * rb, fs + 10 + k4); }
  }
  return T;
}
/* street fronts of a building: ground-floor bays and doors (the skeleton the kit and the residents share).
   fe: polygon edge indices that face a street, od: their street offsets (busier street = larger).
   b.bays[e] = { n, w, t: string of bay types } with D = entrance, S = shop window, s = shop door, W = window, A = arch;
   b.doors = [{ x, y, nx, ny, k: "home" | "shop" | "arch", e, i }] (outward normal points to the street). */
function sgFront(b, fe, od, rule, arch) {
  var p = b.p, n = b.n, s = b.id;
  b.bays = {}; b.doors = [];
  for (var f = 0; f < fe.length; f++) {
    var e = fe[f], e2 = (e + 1) % n, x0 = p[2 * e], y0 = p[2 * e + 1], ex = p[2 * e2] - x0, ey = p[2 * e2 + 1] - y0, L = Math.hypot(ex, ey);
    if (L < 4) continue;
    var nb = Math.max(1, Math.round(L / (rule.bw || 3.3))), w = L / nb, ux = ex / L, uy = ey / L;
    // outward normal: away from the polygon centre
    var cx = (b.bb[0] + b.bb[2]) / 2, cy = (b.bb[1] + b.bb[3]) / 2, nx = -uy, ny = ux;
    if ((x0 + ex / 2 - cx) * nx + (y0 + ey / 2 - cy) * ny < 0) { nx = -nx; ny = -ny; }
    var busy = od[f] > 12, shops = hh(s, e, 41) < (rule.shop || 0) * (busy ? 1.3 : 0.7), t = [], i;
    for (i = 0; i < nb; i++) t.push(shops ? "S" : "W");
    if (shops) { for (i = 1; i < nb; i += 3 + ((hh(s, i, 42) * 2) | 0)) t[i] = "s"; }
    var home = rule.stoop ? (hh(s, e, 43) < 0.5 ? 0 : nb - 1) : Math.min(nb - 1, (hh(s, e, 43) * nb) | 0); // a townhouse: its stoop at one end
    if (nb > 2 || !shops || rule.stoop) t[home] = "D";
    if (arch && f === 0 && nb >= 4) { var ai = Math.max(1, Math.min(nb - 2, (nb / 2) | 0)); t[ai] = "A"; }
    b.bays[e] = { n: nb, w: w, t: t.join("") };
    for (i = 0; i < nb; i++) {
      var k = t[i] === "D" ? "home" : t[i] === "s" ? "shop" : t[i] === "A" ? "arch" : null;
      if (!k) continue;
      var tc = (i + 0.5) * w, dx = x0 + ux * tc, dy = y0 + uy * tc, dep = 0;
      for (var v = 0; v < n; v++) dep = Math.max(dep, -((p[2 * v] - dx) * nx + (p[2 * v + 1] - dy) * ny));
      b.doors.push({ x: dx + nx * 0.3, y: dy + ny * 0.3, nx: nx, ny: ny, k: k, e: e, i: i, dep: dep });
    }
  }
}
/* append the points of a run polyline between fractions fa and fb (either direction) */
function addAlong(poly, xs, ys, run, cum, fa, fb) {
  var L = cum[cum.length - 1], ta = fa * L, tb = fb * L, dir = tb >= ta ? 1 : -1;
  var pt = function (t) { var k = 1; while (k < cum.length - 1 && cum[k] < t) k++; var f = (t - cum[k - 1]) / Math.max(1e-9, cum[k] - cum[k - 1]); poly.push(xs[run[k - 1]] + (xs[run[k]] - xs[run[k - 1]]) * f, ys[run[k - 1]] + (ys[run[k]] - ys[run[k - 1]]) * f); };
  pt(ta);
  if (dir > 0) { for (var k = 1; k < cum.length - 1; k++) if (cum[k] > ta + 0.3 && cum[k] < tb - 0.3) poly.push(xs[run[k]], ys[run[k]]); }
  else { for (k = cum.length - 2; k >= 1; k--) if (cum[k] < ta - 0.3 && cum[k] > tb + 0.3) poly.push(xs[run[k]], ys[run[k]]); }
  pt(tb);
}

function sgBuild(c) {
  if (c.sb) return c.sb;
  var g = sgGraph(c), E = g.E, sb = { list: [], B: new Map(), T: new Map() };
  c.sb = sb;
  var place = function (p, rule, kit, seed, rect, flo, skipSat) {
    if (p.length < 6 || polyArea(p) < 60) return false;
    var n = p.length >> 1, cx = 0, cy = 0, i;
    for (i = 0; i < n; i++) { cx += p[2 * i]; cy += p[2 * i + 1]; }
    cx /= n; cy /= n;
    for (i = skipSat ? 0 : -1; i < n; i++) {
      var x = i < 0 ? cx : p[2 * i] + (cx - p[2 * i]) * 0.12, y = i < 0 ? cy : p[2 * i + 1] + (cy - p[2 * i + 1]) * 0.12;
      if (skipSat) { var i2 = (i + 1) % n; x = (p[2 * i] + p[2 * i2]) / 2 * 0.85 + cx * 0.15; y = (p[2 * i + 1] + p[2 * i2 + 1]) / 2 * 0.85 + cy * 0.15; }
      var ci = sgCell(g, x, y);
      if (ci < 0 || (g.wat[ci] & 1) || g.lmk[ci]) return false;
      var t = g.dt[g.dist[ci] - 1];
      if (!g.dist[ci] || t === "park") return false;
      sgRoadQ(g, x, y); if (RQ.b < (skipSat ? -2.5 : -0.6)) return false;
    }
    var bx0 = 1e9, by0 = 1e9, bx1 = -1e9, by1 = -1e9;
    for (i = 0; i < n; i++) { bx0 = Math.min(bx0, p[2 * i]); bx1 = Math.max(bx1, p[2 * i]); by0 = Math.min(by0, p[2 * i + 1]); by1 = Math.max(by1, p[2 * i + 1]); }
    for (var bj = Math.floor(by0 / 128); bj <= Math.floor(by1 / 128); bj++) for (var bi = Math.floor(bx0 / 128); bi <= Math.floor(bx1 / 128); bi++) {
      var L = sb.B.get(bi * 65536 + bj); if (L) for (var q = 0; q < L.length; q++) { var o2 = sb.list[L[q]]; if (o2.k !== 3) continue; if (o2.bb[0] < bx1 && o2.bb[2] > bx0 && o2.bb[1] < by1 && o2.bb[3] > by0 && satOverlap(p, o2.p)) return false; }
    }
    var fl = flo || (rule.fl[0] + ((hh(seed, 3, 1) * (rule.fl[1] - rule.fl[0] + 1)) | 0));
    var pit = hh(seed, 4, 1) < kit.pitched;
    if (kit.mansard) pit = false;
    var gl = kit.glass || (kit.glassP && hh(seed, 14, 1) < kit.glassP);
    var b = { k: 3, p: p, n: n, z0: 0, h: fl * 3.1 + (pit ? 0.4 : kit.mansard ? 3.2 : 0.9), roof: pit ? (rect ? (hh(seed, 5, 1) < 0.75 ? 1 : 3) : 6) : kit.mansard ? 5 : 0, kit: kit, rc: pit ? pickRoof(kit, hh(seed, 6, 1)) : (kit.glass ? kit.roofs[0] : kit.ny ? NY_ROOF[(hh(seed, 7, 1) * NY_ROOF.length) | 0] : ROOF_G[(hh(seed, 7, 1) * ROOF_G.length) | 0]),
      wc: kit.walls[(hh(seed, 8, 1) * kit.walls.length) | 0], win: gl ? 3 : 1, trim: kit.trim, aw: hh(seed, 9, 1) < kit.aw ? AWN[(hh(seed, 10, 1) * AWN.length) | 0] : -1,
      rect: rect, id: seed | 0, bb: [bx0, by0, bx1, by1] };
    if (kit.mansard) b.rc = pickRoof(kit, hh(seed, 6, 1)); else if (pit) b.rc = pickRoof(kit, hh(seed, 6, 1)); else if (!kit.glass && rule === DRULE.historic && hh(seed, 11, 1) < 0.35) b.rc = 0xa9a39a;
    var id = sb.list.length; sb.list.push(b);
    bucketAdd(sb.B, 128, bx0, by0, bx1, by1, id);
    if (kit.wt && !(SPR.ri && kit.ny && SPR.g.roof.wtower) && hh(seed, 15, 1) < kit.wt && polyArea(p) > 120) { // rooftop water tank on legs
      var wx = cx + (hh(seed, 16, 1) - 0.5) * 4, wy = cy + (hh(seed, 17, 1) - 0.5) * 4;
      LB = sb.list; addPart("cyl", { cx: wx, cy: wy, r: 1.9, z0: b.h + 1.6, h: 3.4, col: 0x8a5a3a, win: 0, rc: 0x6e4630 }); addPart("cone", { cx: wx, cy: wy, r: 2.1, z0: b.h + 5, h: 1.6, col: 0x5a3a28 }); LB = null;
      for (var wq = sb.list.length - 2; wq < sb.list.length; wq++) { var wb = sb.list[wq].bb; bucketAdd(sb.B, 128, wb[0], wb[1], wb[2], wb[3], wq); }
    }
    if (fl > 24 && !kit.glass && hh(seed, 18, 1) < 0.5 && rect) { // setback crown on tall towers
      var tb = { k: 3, p: [rect.cx - rect.ux * rect.hl * 0.55 + rect.uy * rect.hd * 0.55, rect.cy - rect.uy * rect.hl * 0.55 - rect.ux * rect.hd * 0.55, rect.cx + rect.ux * rect.hl * 0.55 + rect.uy * rect.hd * 0.55, rect.cy + rect.uy * rect.hl * 0.55 - rect.ux * rect.hd * 0.55,
        rect.cx + rect.ux * rect.hl * 0.55 - rect.uy * rect.hd * 0.55, rect.cy + rect.uy * rect.hl * 0.55 + rect.ux * rect.hd * 0.55, rect.cx - rect.ux * rect.hl * 0.55 - rect.uy * rect.hd * 0.55, rect.cy - rect.uy * rect.hl * 0.55 + rect.ux * rect.hd * 0.55], n: 4, z0: b.h, h: 12 + 20 * hh(seed, 19, 1), roof: 0, kit: kit, rc: b.rc, wc: b.wc, win: b.win, trim: 0, aw: -1, rect: null, id: seed ^ 77, bb: b.bb };
      var tid = sb.list.length; sb.list.push(tb); bucketAdd(sb.B, 128, bx0, by0, bx1, by1, tid);
    }
    return b;
  };
  sgBlocks(c, g, place);
  // soviet microdistricts: free-standing slabs inside the superblocks
  var S = c.schema;
  for (var di = 0; di < S.districts.length; di++) {
    var Dd2 = S.districts[di], r2 = DRULE[Dd2.t];
    if (!r2 || !r2.slabs) continue;
    var ang = Dd2.grid ? Dd2.grid.ang : 0, R = S.R;
    for (var yy = -R; yy < R; yy += 70) for (var xx = -R; xx < R; xx += 70) {
      var h0 = hh(Math.floor(xx), Math.floor(yy), 61 + di);
      if (h0 > 0.55) continue;
      var a2 = ang + (h0 < 0.2 ? 1.5708 : 0), L2 = 55 + 45 * hh(Math.floor(xx), Math.floor(yy), 62), D2 = 12;
      var ca = Math.cos(a2), sa = Math.sin(a2), mx = xx + (hh(Math.floor(xx), Math.floor(yy), 63) - 0.5) * 30, my = yy + (hh(Math.floor(xx), Math.floor(yy), 64) - 0.5) * 30;
      var c0 = sgCell(g, mx, my); if (c0 < 0 || g.dist[c0] !== di + 1) continue;
      sgRoadQ(g, mx, my); if (RQ.b < 14) continue;
      var pp = [mx - ca * L2 / 2 + sa * D2 / 2, my - sa * L2 / 2 - ca * D2 / 2, mx + ca * L2 / 2 + sa * D2 / 2, my + sa * L2 / 2 - ca * D2 / 2,
        mx + ca * L2 / 2 - sa * D2 / 2, my + sa * L2 / 2 + ca * D2 / 2, mx - ca * L2 / 2 - sa * D2 / 2, my - sa * L2 / 2 + ca * D2 / 2];
      place(pp, r2, KITS[r2.kit], (Math.imul(Math.floor(xx) + 9, 0x27d4eb2d) ^ Math.floor(yy)) | 0, { cx: mx, cy: my, ux: ca, uy: sa, hl: L2 / 2, hd: D2 / 2 }, 9 + ((h0 * 14) | 0));
    }
  }
  for (var mq = 0; mq < sb.list.length; mq++) { var mo = sb.list[mq]; if (mo.k === 3 && mo.z0 + mo.h > c.maxH) c.maxH = mo.z0 + mo.h; }
  return sb;
}
function sgInBuilding(sb, x, y) {
  var L = sb.B.get(Math.floor(x / 128) * 65536 + Math.floor(y / 128));
  if (L) for (var q = 0; q < L.length; q++) { var b = sb.list[L[q]]; if (b.k === 3 && x > b.bb[0] - 1.5 && x < b.bb[2] + 1.5 && y > b.bb[1] - 1.5 && y < b.bb[3] + 1.5 && inPoly(b.p, x, y)) return true; }
  return false;
}
/* trees of one 64 m cell: street trees along edges + courtyard trees (generated on demand, cached) */
function dd2(g, ci) { return g.dist[ci]; }
function sgTrees(c, i, j) {
  var sb = c.sb, key = i * 65536 + j, T = sb.T.get(key);
  if (T) return T;
  T = []; sb.T.set(key, T);
  var g = c.sg, E = g.E, x0 = i * 64, y0 = j * 64, k, q;
  var L = g.EB.get(key), NY = c.lm === "nyc";
  if (L) for (q = 0; q < L.length; q++) {
    var e = L[q], cls = E.cls[e], cw = EC[cls][0], sw = EC[cls][1], ux = E.ux[e], uy = E.uy[e], len = E.len[e];
    var da = g.adj[E.a[e]].length > 2, db = g.adj[E.b[e]].length > 2;
    var xa = g.nx[E.a[e]], ya = g.ny[E.a[e]], s0 = da ? g.nr[E.a[e]] + sw + 5 : 0, s1 = db ? len - g.nr[E.b[e]] - sw - 5 : len, ph = 0;
    for (var side = -1; side <= 1; side += 2) for (var s = Math.ceil((s0 + ph + E.sA[e]) / 10.5) * 10.5 - E.sA[e]; s < s1; s += 10.5) {
      var x = xa + ux * s - uy * side * (cw + 1.9), y = ya + uy * s + ux * side * (cw + 1.9);
      if (x < x0 || y < y0 || x >= x0 + 64 || y >= y0 + 64) continue;
      var ci = sgCell(g, x, y); if (ci < 0 || (g.wat[ci] & 1) || g.lmk[ci]) continue;
      var r = DRULE[g.dt[g.dist[ci] - 1]], si = Math.floor(s / 10.5);
      if (hh(si, e * 2 + (side > 0 ? 1 : 0), 34) > (r ? r.stP : 0.7)) continue;
      T.push({ k: 1, x: x, y: y, r: 3.2 + 1.2 * hh(si, e, 35), id: (Math.imul(si + 5, 0x85ebca6b) ^ e) | 0, pal: treePal((Math.imul(si + 5, 0x85ebca6b) ^ e) | 0, false) });
    }
  }
  for (var yy = 0; yy < 64; yy += 8) for (var xx = 0; xx < 64; xx += 8) {
    var hx = Math.floor(x0 / 8) + xx / 8, hy = Math.floor(y0 / 8) + yy / 8, h1 = hh(hx, hy, 41);
    var tx = x0 + xx + 1 + hh(hx, hy, 42) * 6, ty = y0 + yy + 1 + hh(hx, hy, 43) * 6;
    var cj = sgCell(g, tx, ty); if (cj < 0 || (g.wat[cj] & 1) || g.lmk[cj] || !g.dist[cj]) continue;
    var tt = g.dt[g.dist[cj] - 1], pr = tt === "park" ? 0.42 : DRULE[tt] ? DRULE[tt].treeP * 1.6 : 0;
    var fq = g.fid ? g.fid[cj] : 0, Fq = fq > 0 ? g.faces[fq - 1] : null;
    if (Fq && Fq.kind === 1) { // square: trees on the outer plaza ring and in the lawns, none on paths or by the fountain
      var qdx = tx - Fq.cx, qdy = ty - Fq.cy, qd = Math.sqrt(qdx * qdx + qdy * qdy), qR = Math.sqrt(Fq.area / Math.PI), k8 = Math.abs(Math.sin(Math.atan2(qdy, qdx) * 4)) * qd;
      pr = qd < 10 || (k8 < 4 && qd < qR * 0.62) ? 0 : qd > qR * 0.62 + 1.5 ? 0.75 : 0.45;
    } else if (Fq && Fq.cf) { // courtyard: trees on the lawn only
      var csp = courtSpot(Fq, tx, ty);
      pr = csp === 4 ? pr * 0.95 : 0;
    } else if (Fq && Fq.gd) { var gdd = Math.hypot(tx - Fq.cx, ty - Fq.cy), gR = Math.sqrt(Fq.area / Math.PI); pr = Math.abs(gdd - gR * 0.42) < 3 || gdd < 5 ? 0 : 0.7; }
    else if (Fq && Fq.area > 2500 && tt !== "soviet") pr = 0.36; // pocket park
    else if (tt !== "park" && tt !== "soviet") pr = 0; // leftover ground: trees only in planters (below)
    if (h1 > pr) continue;
    sgRoadQ(g, tx, ty); if (RQ.b < 2.5) continue;
    if (sgInBuilding(sb, tx, ty)) continue;
    var id = (Math.imul(hx + 7, 0x9e3779b1) ^ hy) | 0, rr = tt === "park" ? 3.6 + 2.6 * hh(hx, hy, 44) : 3 + 2 * hh(hx, hy, 44);
    T.push({ k: 1, x: tx, y: ty, r: rr, id: id, pal: treePal(id, tt === "park") });
  }
  for (var py9 = Math.ceil((y0 - 4.5) / 9); py9 * 9 + 4.5 < y0 + 64; py9++) for (var px9 = Math.ceil((x0 - 4.5) / 9); px9 * 9 + 4.5 < x0 + 64; px9++) {
    var qx9 = px9 * 9 + 4.5, qy9 = py9 * 9 + 4.5, c9 = sgCell(g, qx9, qy9);
    if (c9 < 0 || (g.wat[c9] & 1) || g.lmk[c9] || !g.dist[c9] || hh(px9, py9, 47) > 0.6) continue;
    var t9 = g.dt[g.dist[c9] - 1], f9 = g.fid ? g.fid[c9] : 0, F9 = f9 > 0 ? g.faces[f9 - 1] : null;
    if (t9 === "park" || t9 === "soviet" || t9 === "glass" || (F9 && (F9.kind === 1 || F9.cf))) continue;
    sgRoadQ(g, qx9, qy9); if (RQ.b < 2.5) continue;
    if (sgInBuilding(sb, qx9, qy9)) continue;
    var id9 = (Math.imul(px9 + 11, 0x9e3779b1) ^ py9) | 0;
    T.push({ k: 1, x: qx9, y: qy9, r: 2.8 + 1.4 * hh(px9, py9, 48), id: id9, pal: treePal(id9, false) });
  }
  return T;
}

/* ---------- convex prism rendering ---------- */
var PX_ = new Float64Array(64), PY_ = new Float64Array(64);
function polyRoof(o, lx, ly, sc) {
  var c = o.rc, R = o.rect;
  if ((o.roof === 1 || o.roof === 3) && R) {
    var dx = lx - R.cx, dy = ly - R.cy, a = dx * R.ux + dy * R.uy, b = -dx * R.uy + dy * R.ux;
    var dA = R.hl - Math.abs(a), dB = R.hd - Math.abs(b), px = 1 / sc;
    if (dA < 0.7 * px || dB < 0.7 * px) return sh(c, 0.6);
    var end = o.roof === 1 && dA < dB, nx0, ny0;
    if (end) { nx0 = a > 0 ? R.ux : -R.ux; ny0 = a > 0 ? R.uy : -R.uy; } else { nx0 = b > 0 ? -R.uy : R.uy; ny0 = b > 0 ? R.ux : -R.ux; }
    if (Math.abs(b) < 0.6 * px && !end) return sh(c, 1.26);
    if (o.roof === 1 && Math.abs(dA - dB) < 0.5 * px) return sh(c, 0.8);
    var f = 1 + 0.17 * (-nx0 * 0.6 - ny0 * 0.8);
    var dist = end ? dA : dB;
    if (sc > 1.6 && (Math.floor(dist * sc) & 1)) f *= 0.92;
    return sh(c, f);
  }
  // flat roof: parapet by distance to the nearest edge, rooftop units on a 3.2 m grid
  var n = o.n, p = o.p, best = 1e9, bnx = 0, bny = 0, bu = 0;
  for (var i = 0; i < n; i++) {
    var j = (i + 1) % n, ex = p[2 * j] - p[2 * i], ey = p[2 * j + 1] - p[2 * i + 1], l = Math.hypot(ex, ey) || 1;
    var d = Math.abs((lx - p[2 * i]) * ey - (ly - p[2 * i + 1]) * ex) / l;
    if (d < best) { best = d; bnx = ey / l; bny = -ex / l; bu = ((lx - p[2 * i]) * ex + (ly - p[2 * i + 1]) * ey) / l; }
  }
  if (o.roof === 5) {
    var cxm5 = (o.bb[0] + o.bb[2]) / 2, cym5 = (o.bb[1] + o.bb[3]) / 2;
    if ((cxm5 - lx) * bnx + (cym5 - ly) * bny > 0) { bnx = -bnx; bny = -bny; }
    var band = 3.6, px5 = 1 / sc, lit5 = 1 + 0.16 * (-bnx * 0.6 - bny * 0.8);
    if (best < 0.6 * px5) return sh(c, 0.55);
    if (best < band) {
      var du = ((bu % 3.4) + 3.4) % 3.4;
      if (sc > 0.9 && du > 1.1 && du < 2.3 && best > 0.9 && best < 2.7) return best < 1.25 || du < 1.3 || du > 2.1 ? 0xeee9df : (best > 2.2 ? 0x8fa2b4 : 0x3c4a5a);
      return sh(c, lit5 * (best < band - 0.5 ? 1 : 1.15));
    }
    var top = sh(c, 1.32);
    if (sc > 0.8) { var cu = ((bu % 6.5) + 6.5) % 6.5; if (best > band + 0.4 && best < band + 1.6 && cu > 2.5 && cu < 4.2) return best < band + 0.75 ? 0xe07b4f : 0xb0583c; }
    return top;
  }
  var cxm = (o.bb[0] + o.bb[2]) / 2, cym = (o.bb[1] + o.bb[3]) / 2;
  if ((cxm - lx) * bnx + (cym - ly) * bny > 0) { bnx = -bnx; bny = -bny; }
  var pxm = 1 / sc, lit = bnx < 0.3 && bny < 0.3 && (bnx < -0.2 || bny < -0.2);
  if (best < 0.65 * pxm) return sh(c, lit ? 0.74 : 0.6);
  if (best < (sc > 2.4 ? 2 : 1) * pxm + 0.65 * pxm) return sh(c, lit ? 1.15 : 1.04);
  if (best < 2.6 * pxm && lit && sc > 1.2) return sh(c, 0.86);
  if (sc > 1.1 && best > 2) {
    var u0 = lx * 0.83 + ly * 0.55, v0 = -lx * 0.55 + ly * 0.83, ci = Math.floor(u0 / 3.2), cj = Math.floor(v0 / 3.2), fu = u0 - ci * 3.2, fv = v0 - cj * 3.2;
    if (hh(ci, cj, o.id) < 0.07 && fu > 0.6 && fu < 2.3 && fv > 0.6 && fv < 2.1) return fv > 1.75 ? 0x8b9096 : fu > 1.95 ? 0xaeb3b8 : 0xdadde0;
    var nn = hh(Math.floor(lx * sc / 2), Math.floor(ly * sc / 2), o.id); if (nn < 0.05) return sh(c, 0.95);
  }
  return c;
}
function polyWall(o, u, elen, z, sc, nxo) {
  var fsc = F_OBL * sc, base = sh(o.wc, 0.95 - 0.22 * nxo);
  if (u < 0.55 / sc || elen - u < 0.55 / sc) return sh(base, 0.7);
  var fromTop = (o.h - z) * fsc;
  if (fromTop < 1) return o.trim ? sh(o.trim, 0.98 - 0.15 * nxo) : sh(base, 1.15);
  if (fromTop < 2 && o.h * fsc > 6) return sh(base, 0.78);
  if (z * fsc < 1 && o.z0 === 0) return sh(base, 0.56);
  if (o.win === 3) {
    var cp = Math.max(2, Math.round(1.6 * sc));
    if ((Math.floor(z * fsc) % Math.max(2, Math.round(3.4 * fsc))) === 0) return sh(o.wc, 0.62);
    if (Math.floor(u * sc) % cp === 0) return sh(o.wc, 0.72);
    return ((Math.floor(u * sc) + Math.floor(z * fsc)) % 29 < 6) ? sh(o.wc, 1.28) : sh(o.wc, 0.98 - 0.2 * nxo);
  }
  var fp = 3.1 * fsc;
  if (fp < 2.2) return (Math.floor(z * fsc) & 1) && fp >= 1.4 ? sh(base, 0.86) : base;
  var fl = Math.floor(z / 3.1), fz = z - fl * 3.1, col = (u - 0.9) / 3.0, ci = Math.floor(col), cf = col - ci;
  if (o.kit && o.kit.fire && fl >= 1 && sc > 1 && ((ci + (o.id & 7)) % 4) === 1 && cf > 0.05 && cf < 0.95) {
    if (fz < 0.22 || (fz > 2.9) || Math.abs(fz - 0.35 - cf * 2.3) < 0.45 / sc) return 0x26282c;
    if ((cf < 0.1 || cf > 0.9) && fz < 1.1) return 0x26282c;
  }
  if (o.kit && o.kit.balc) {
    if (fl === 0) {
      if (o.aw >= 0 && fz > 2.2 && fz < 2.95) return (Math.floor(u * sc / Math.max(1, sc * 0.75)) & 1) ? o.aw : sh(o.aw, 0.75);
      if (fz > 0.25 && fz <= 2.2 && cf > 0.08 && cf < 0.94) return fz > 1.7 ? 0x9cb4c4 : 0x2c3a48;
      return sh(base, 0.88);
    }
    if ((fl === 1 || fl === 4) && fz > 0.35 && fz < 0.8) return (Math.floor(u * sc) & 1) || fz < 0.45 ? 0x2b2f35 : base;
    var wx2 = cf > 0.3 && cf < 0.72, wy2 = fz > 0.6 && fz < 2.65;
    if (wx2 && wy2) return fz > 2.4 ? 0x9cb4c4 : hh(ci, fl, o.id) < 0.08 ? 0xf2d27a : 0x3a4656;
    if (sc > 1.3 && cf > 0.24 && cf < 0.78 && fz > 0.5 && fz < 2.8) return sh(o.trim, 0.97 - 0.15 * nxo);
    if (fz > 2.85) return sh(base, 1.08);
    return base;
  }
  if (fl === 0 && o.aw >= 0) {
    if (fz > 2.25 && fz < 2.95) return (Math.floor(u * sc / Math.max(1, sc * 0.75)) & 1) ? o.aw : 0xf2ede2;
    if (fz > 0.2 && fz <= 2.25 && cf > 0.1 && cf < 0.92) return fz > 1.85 ? 0x7f9bb5 : 0x33465a;
  }
  if (fl === 0 && ci === ((o.id >>> 3) & 7) % 5 && cf > 0.25 && cf < 0.8 && fz < 2.3) return 0x5a3d2a;
  var wx = cf > 0.32 && cf < 0.74, wy = fz > 0.85 && fz < 2.3;
  if (wx && wy) return fz > 2.05 ? 0x8fb0c8 : hh(ci, fl, o.id) < 0.07 ? 0xf2d27a : 0x34465c;
  if (o.trim && sc > 1.3 && cf > 0.24 && cf < 0.82 && fz > 0.7 && fz < 2.45) return sh(o.trim, 0.97 - 0.15 * nxo);
  if (wx && fz > 0.65 && fz <= 0.85) return sh(base, 1.2);
  return base;
}
function drawPoly(out, msk, w) {
  var o = w.o, sc = w.sc, ax = w.ax, ay = w.ay, n = o.n, p = o.p, Fs = F_OBL * sc, i, j;
  var minx = 1e9, maxx = -1e9;
  for (i = 0; i < n; i++) { PX_[i] = ax + p[2 * i] * sc; PY_[i] = ay + p[2 * i + 1] * sc; if (PX_[i] < minx) minx = PX_[i]; if (PX_[i] > maxx) maxx = PX_[i]; }
  var ztop = o.z0 + o.h, Ht = ztop * Fs, Hb = o.z0 * Fs;
  var cxp = 0; for (i = 0; i < n; i++) cxp += PX_[i]; cxp /= n;
  var x0 = Math.max(0, Math.floor(minx)), x1 = Math.min(TS, Math.ceil(maxx));
  for (var px = x0; px < x1; px++) {
    var xc = px + 0.5, ya = 1e9, yb = -1e9, eb = -1;
    for (i = 0; i < n; i++) {
      j = (i + 1) % n;
      var xi = PX_[i], xj = PX_[j];
      if ((xi <= xc) !== (xj <= xc)) { var y = PY_[i] + (xc - xi) / (xj - xi) * (PY_[j] - PY_[i]); if (y < ya) ya = y; if (y > yb) { yb = y; eb = i; } }
    }
    if (eb < 0) continue;
    var r0 = Math.max(0, Math.floor(ya - Ht)), r1 = Math.min(TS, Math.ceil(yb - Hb));
    var ej = (eb + 1) % n, ex = (PX_[ej] - PX_[eb]) / sc, ey = (PY_[ej] - PY_[eb]) / sc, el = Math.hypot(ex, ey) || 1;
    var nxo = ey / el; if ((PX_[eb] + PX_[ej]) / 2 - cxp < 0 ? nxo > 0 : nxo < 0) nxo = -nxo;
    var uu = Math.hypot(xc - PX_[eb], yb - PY_[eb]) / sc;
    for (var py = r0; py < r1; py++) {
      var yc = py + 0.5, zr = (yb - yc) / Fs, zl = (ya - yc) / Fs, col;
      if (ztop >= zl && ztop <= zr) col = polyRoof(o, (xc - ax) / sc, (yc + Ht - ay) / sc, sc);
      else if (zr < ztop && zr >= o.z0) col = polyWall(o, uu, el, zr - o.z0, sc, nxo);
      else continue;
      var jj = py * TS + px;
      put(out, jj * 4, col); msk[jj] = 1;
    }
  }
}
var HX = new Float64Array(80), HY = new Float64Array(80), HU = [];
function shadowPolyObj(out, msk, w) {
  var o = w.o, sc = w.sc, ax = w.ax, ay = w.ay, n = o.n, p = o.p, ht = (o.z0 + o.h) * sc, vx = ht * SHX, vy = ht * SHY, i, m = 0;
  var pts = [];
  for (i = 0; i < n; i++) { var x = ax + p[2 * i] * sc, y = ay + p[2 * i + 1] * sc; pts.push([x, y], [x + vx, y + vy]); }
  pts.sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
  var cr = function (o0, a, b) { return (a[0] - o0[0]) * (b[1] - o0[1]) - (a[1] - o0[1]) * (b[0] - o0[0]); };
  var lo = [], up = [];
  for (i = 0; i < pts.length; i++) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], pts[i]) <= 0) lo.pop(); lo.push(pts[i]); }
  for (i = pts.length - 1; i >= 0; i--) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], pts[i]) <= 0) up.pop(); up.push(pts[i]); }
  lo.pop(); up.pop();
  var H = lo.concat(up); m = H.length;
  var bx0 = 1e9, by0 = 1e9, bx1 = -1e9, by1 = -1e9;
  for (i = 0; i < m; i++) { HX[i] = H[i][0]; HY[i] = H[i][1]; bx0 = Math.min(bx0, HX[i]); bx1 = Math.max(bx1, HX[i]); by0 = Math.min(by0, HY[i]); by1 = Math.max(by1, HY[i]); }
  for (var py = Math.max(0, Math.floor(by0)); py < Math.min(TS, Math.ceil(by1)); py++) for (var px = Math.max(0, Math.floor(bx0)); px < Math.min(TS, Math.ceil(bx1)); px++) {
    var X = px + 0.5, Y = py + 0.5, inside = true;
    for (i = 0; i < m; i++) { var j = (i + 1) % m; if ((HX[j] - HX[i]) * (Y - HY[i]) - (HY[j] - HY[i]) * (X - HX[i]) < 0) { inside = false; break; } }
    if (inside) darken(out, msk, px, py, SHF);
  }
}
var TMP1 = [null], AT = new Float64Array(4);
/* build a landmark; with P.ex > 1 it is built in a smaller rect and blown up around the centre (postcard exaggeration) */
function lmBuild(P, A, c) {
  var ex = P.ex || 1, cx = (A.X0 + A.X1) / 2, cy = (A.Y0 + A.Y1) / 2;
  if (ex === 1) { (LBLD[P.f] || LBLD.square)(A, c, P); return; }
  var A2 = { X0: cx + (A.X0 - cx) / ex, Y0: cy + (A.Y0 - cy) / ex, X1: cx + (A.X1 - cx) / ex, Y1: cy + (A.Y1 - cy) / ex };
  (LBLD[P.f] || LBLD.square)(A2, c, P);
  var X = function (v) { return cx + (v - cx) * ex; }, Y = function (v) { return cy + (v - cy) * ex; };
  for (var i = 0; i < LB.length; i++) {
    var o = LB[i];
    if (o.k === 0) { o.x0 = X(o.x0); o.x1 = X(o.x1); o.y0 = Y(o.y0); o.y1 = Y(o.y1); o.h *= ex; o.z0 *= ex; if (o.pr) for (var q = 0; q < o.pr.length; q++) { var pr = o.pr[q]; pr[0] = X(pr[0]); pr[2] = X(pr[2]); pr[1] = Y(pr[1]); pr[3] = Y(pr[3]); pr[4] *= ex; } }
    else if (o.k === 1) { o.x = X(o.x); o.y = Y(o.y); }
    else {
      o.cx = X(o.cx); o.cy = Y(o.cy); o.z0 *= ex; o.h *= ex;
      if (o.r !== undefined) o.r *= ex; if (o.w !== undefined) o.w *= ex; if (o.rx !== undefined) { o.rx *= ex; o.ry *= ex; }
      o.bb = [X(o.bb[0]), Y(o.bb[1]), X(o.bb[2]), Y(o.bb[3]), o.bb[4] * ex, o.bb[5] * ex];
    }
  }
}
/* object pass for a schema city: buildings, trees, landmarks */
function sgObjects(c, ox, oy, ex, ey, mpp) {
  var sc = 1 / (c.k * mpp), ax = (c.mx - ox) / mpp, ay = (c.my - oy) / mpp, rm = c.k * mpp;
  var lx0 = (ox - c.mx) * c.k, lx1 = (ex - c.mx) * c.k, ly0 = (oy - c.my) * c.k, ly1 = (ey - c.my) * c.k;
  var mh = c.maxH, sb = sgBuild(c), i, j, q, o;
  var bx0 = lx0 - mh * SHX - 4, bx1 = lx1 + 4, by0 = ly0 - mh * SHY - 4, by1 = ly1 + mh * F_OBL + 4;
  var seenB = new Set();
  for (j = Math.floor(by0 / 128); j <= Math.floor(by1 / 128); j++) for (i = Math.floor(bx0 / 128); i <= Math.floor(bx1 / 128); i++) {
    var L = sb.B.get(i * 65536 + j); if (!L) continue;
    for (q = 0; q < L.length; q++) {
      if (seenB.has(L[q])) continue; seenB.add(L[q]);
      o = sb.list[L[q]];
      if (o.k === 2) { if (rm < 3) { TMP1[0] = o; pushLayout(TMP1, sc, ax, ay, rm); } continue; }
      var ht = o.z0 + o.h;
      if (o.bb[2] + ht * SHX < lx0 - 1 || o.bb[0] > lx1 + 1 || o.bb[3] + ht * SHY < ly0 - 1 || o.bb[1] - ht * F_OBL > ly1 + 1) continue;
      OBJS.push({ k: 3, o: o, sc: sc, ax: ax, ay: ay, key: ay + o.bb[3] * sc + o.z0 * 3 * sc });
    }
  }
  if (rm < 9) for (j = Math.floor((ly0 - 8) / 64); j <= Math.floor((ly1 + 12) / 64); j++) for (i = Math.floor((lx0 - 8) / 64); i <= Math.floor((lx1 + 8) / 64); i++) {
    var T = sgTrees(c, i, j);
    for (q = 0; q < T.length; q++) {
      o = T[q]; if (rm > 5 && o.r < 3.5) continue;
      var tx2 = ax + o.x * sc, ty2 = ay + o.y * sc, r = Math.max(0.7, o.r * sc), tt = (0.6 + o.r * 0.25) * F_OBL * sc;
      if (tx2 < -r * 2 - 2 || tx2 > TS + r + 2 || ty2 < -r || ty2 - tt - 2 * r > TS + 1) continue;
      OBJS.push({ k: 1, o: o, x: tx2, y: ty2, r: r, t: tt, key: ty2 + 0.01 });
    }
  }
  for (var li = 0; li < c.lms.length; li++) {
    var P = c.lms[li], A = P.A, lh = (LM_H[P.f] || 60) * (P.ex || 1);
    if (A.X1 + lh * SHX < lx0 - 2 || A.X0 > lx1 + 2 || A.Y1 + lh * SHY < ly0 - 2 || A.Y0 - lh * F_OBL > ly1 + 2) continue;
    if (!P.lo) { P.lo = []; LB = P.lo; LC = c; LS = P.id * 7919 + (c.seed | 0); lmBuild(P, A, c); LB = null; }
    pushLayout(P.lo, sc, ax, ay, rm);
  }
}

var OBJS = [], SEEN = new Set();
/* push a layout's objects for one city frame (ax, ay = tile px of the city origin, sc = px per metre); sort keys in tile px */
function pushLayout(L, sc, ax, ay, rm) {
  for (var i = 0; i < L.length; i++) {
    var o = L[i], x0, x1, y0, y1;
    if (o.k === 0) {
      x0 = ax + o.x0 * sc; x1 = ax + o.x1 * sc; y0 = ay + o.y0 * sc; y1 = ay + o.y1 * sc;
      var ht = (o.z0 + o.h) * sc;
      if (x1 + ht * SHX < -1 || x0 > TS + 1 || y1 + ht * SHY < -1 || y0 - ht * F_OBL > TS + 1) continue;
      OBJS.push({ k: 0, o: o, x0: x0, y0: y0, x1: x1, y1: y1, sc: sc, ax: ax, ay: ay, key: y1 + o.z0 * 3 * sc });
    } else if (o.k === 1) {
      if (rm > 7 && o.r < 3) continue;
      var tx2 = ax + o.x * sc, ty2 = ay + o.y * sc, r = Math.max(0.7, o.r * sc), tt = (0.6 + o.r * 0.25) * F_OBL * sc;
      if (tx2 < -r * 2 - 2 || tx2 > TS + r + 2 || ty2 < -r || ty2 - tt - 2 * r > TS + 1) continue;
      OBJS.push({ k: 1, o: o, x: tx2, y: ty2, r: r, t: tt, key: ty2 + 0.02 });
    } else {
      var bb = o.bb;
      if ((bb[2] - bb[0]) * sc < 0.8 && (bb[5] - bb[4]) * sc * F_OBL < 1.5) continue;
      if (ax + (bb[2] + bb[5] * SHX) * sc < -1 || ax + bb[0] * sc > TS + 1 || ay + (bb[3] + bb[5] * SHY) * sc < -1 || ay + bb[1] * sc - bb[5] * F_OBL * sc > TS + 1) continue;
      OBJS.push({ k: 2, o: o, sc: sc, ax: ax, ay: ay, key: ay + bb[3] * sc + bb[4] * 3 * sc });
    }
  }
}
function objectPass(out, msk, z, tx, ty, mpp) {
  var n = Math.pow(2, z), ox = tx / n * C, oy = ty / n * C, ex = ox + TS * mpp, ey = oy + TS * mpp;
  OBJS.length = 0;
  for (var ci = 0; ci < TC.length; ci++) {
    var c = TC[ci], sc = 1 / (c.k * mpp), rm = c.k * mpp;
    if (c.schema) { sgObjects(c, ox, oy, ex, ey, mpp); continue; }
    var ax = (c.mx - ox) / mpp, ay = (c.my - oy) / mpp;
    var lx0 = (ox - c.mx) * c.k, lx1 = (ex - c.mx) * c.k, ly0 = (oy - c.my) * c.k, ly1 = (ey - c.my) * c.k;
    var mh = c.maxH;
    var bi0 = blockIx(c, lx0 - mh * SHX - 8), bi1 = blockIx(c, lx1 + 8);
    var bj0 = blockJy(c, ly0 - mh * SHY - 8), bj1 = blockJy(c, ly1 + mh * F_OBL + 8);
    var lim = Math.ceil(2.2 * c.R / Math.min(c.PX, c.PY)) + (c.lmFar ? 12 : 1);
    if (bi0 < -lim) bi0 = -lim; if (bj0 < -lim) bj0 = -lim; if (bi1 > lim) bi1 = lim; if (bj1 > lim) bj1 = lim;
    SEEN.clear();
    for (var bj = bj0; bj <= bj1; bj++) for (var bi = bi0; bi <= bi1; bi++) {
      var b = cblock(c, bi, bj);
      if (!b) continue;
      if (b.L) { if (SEEN.has(b.L.id)) continue; SEEN.add(b.L.id); }
      pushLayout(layout(c, b), sc, ax, ay, rm);
    }
  }
  var j;
  for (j = 0; j < OBJS.length; j++) { var q = OBJS[j]; if (q.k === 0) shadowBox(out, msk, q); else if (q.k === 1) { if (q.r > 1.2) shadowTree(out, msk, q); } else if (q.k === 3) shadowPolyObj(out, msk, q); else shadowPart(out, msk, q); }
  OBJS.sort(function (a, b) { return a.key - b.key; });
  for (j = 0; j < OBJS.length; j++) { var w = OBJS[j]; if (w.k === 0) drawBox(out, msk, w); else if (w.k === 1) drawTree(out, msk, w); else if (w.k === 3) drawPoly(out, msk, w); else drawPart(out, msk, w); }
}

/* ---------- pixel ---------- */

/* ---------- coarse-zoom sprites (illustrated-map look) ----------
   Mountains, trees, ships, villages and city icons are pre-rendered once per thread and blitted on a jittered grid
   in global art px of the current zoom level, so they keep their pixel size at every level and tiles agree at borders. */
var NATB = "", NATE = 0, NATF = 0; // biome of the last natural() call, its elevation, forest kind (0 temp, 1 taiga, 2 tropic)
function spr(w, h) { return { w: w, h: h, px: new Uint8ClampedArray(w * h * 4) }; }
function sput(S, x, y, c, a) { if (x < 0 || y < 0 || x >= S.w || y >= S.h) return; var i = (y * S.w + x) * 4; S.px[i] = (c >> 16) & 255; S.px[i + 1] = (c >> 8) & 255; S.px[i + 2] = c & 255; S.px[i + 3] = a === undefined ? 255 : a; }
function sget(S, x, y) { return x < 0 || y < 0 || x >= S.w || y >= S.h ? 0 : S.px[(y * S.w + x) * 4 + 3]; }
function soutline(S, c) { // dark 1-px outline around opaque pixels (only where empty)
  var add = [];
  for (var y = 0; y < S.h; y++) for (var x = 0; x < S.w; x++) if (sget(S, x, y) < 200 && (sget(S, x - 1, y) > 200 || sget(S, x + 1, y) > 200 || sget(S, x, y - 1) > 200 || sget(S, x, y + 1) > 200)) add.push(x, y);
  for (var i = 0; i < add.length; i += 2) sput(S, add[i], add[i + 1], c, 255);
}
function sShadow(S, cx, cy, rx, ry) { for (var y = Math.floor(cy - ry); y <= cy + ry; y++) for (var x = Math.floor(cx - rx); x <= cx + rx; x++) { var dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry; if (dx * dx + dy * dy <= 1 && sget(S, x, y) === 0) sput(S, x, y, 0x0a1a10, 70); } }
function mkConifer(h, seed, snow) {
  var w = Math.max(3, Math.round(h * 0.62)) | 1, S = spr(w + 4, h + 3), cx = (w + 4) / 2;
  sShadow(S, cx + 1.5, h + 1, w * 0.45, 1.4);
  var tiers = h > 9 ? 3 : 2;
  for (var y = 0; y < h - 1; y++) {
    var t = y / (h - 1), tier = Math.min(tiers - 1, Math.floor(t * tiers)), tt = t * tiers - tier, hw = (0.2 + 0.8 * tt) * (0.45 + 0.55 * (tier + 1) / tiers) * w / 2;
    for (var x = Math.floor(cx - hw); x < Math.ceil(cx + hw); x++) {
      var lit = x + 0.5 < cx - hw * 0.15, col = lit ? 0x3f8a46 : 0x2a6332;
      if (snow && tt < 0.3 && hh(x, y, seed) < 0.6) col = 0xe8eff4;
      sput(S, x, y, col);
    }
  }
  sput(S, Math.floor(cx), h - 1, 0x5a3e28); sput(S, Math.floor(cx), h, 0x5a3e28);
  soutline(S, 0x173a1d);
  S.ax = Math.floor(cx); S.ay = h;
  return S;
}
function mkLeafy(h, seed, pal) {
  var w = h + 1, S = spr(w + 4, h + 3), cx = (w + 4) / 2, cy = h * 0.45, r = h * 0.45;
  sShadow(S, cx + 1.5, h + 0.5, r, 1.5);
  for (var y = 0; y < h; y++) for (var x = 0; x < S.w; x++) {
    var dx = x + 0.5 - cx, dy = y + 0.5 - cy, rr = r * (0.88 + 0.2 * hh(x, y, seed));
    if (dx * dx + dy * dy * 1.1 > rr * rr) continue;
    var l = -(dx * 0.6 + dy * 0.8) / r;
    sput(S, x, y, l > 0.45 ? pal[0] : l > -0.1 ? pal[1] : l > -0.6 ? pal[2] : pal[3]);
  }
  sput(S, Math.floor(cx), Math.ceil(cy + r), 0x5a3e28); sput(S, Math.floor(cx), Math.ceil(cy + r) + 1, 0x5a3e28);
  soutline(S, pal[4]);
  S.ax = Math.floor(cx); S.ay = Math.min(S.h - 1, Math.ceil(cy + r) + 1);
  return S;
}
function mkPalm(h) {
  var S = spr(h + 4, h + 3), cx = Math.floor((h + 4) / 2);
  sShadow(S, cx + 1.5, h + 1, h * 0.35, 1.2);
  for (var y = Math.floor(h * 0.3); y <= h; y++) sput(S, cx + Math.round(Math.sin(y / h * 2) * 0.8), y, y & 1 ? 0x8a6a42 : 0x6e5232);
  var top = Math.floor(h * 0.3), L = Math.max(2, Math.round(h * 0.4));
  for (var a = 0; a < 6; a++) { var ang = a / 6 * 6.283 + 0.3; for (var t = 0; t <= L; t++) sput(S, cx + Math.round(Math.cos(ang) * t), top + Math.round(Math.sin(ang) * t * 0.6 + t * t * 0.06), t < L / 2 ? 0x3f9a3f : 0x2c7a34); }
  soutline(S, 0x1d4a22);
  S.ax = cx; S.ay = h;
  return S;
}
/* mountain: a craggy massif of 2-4 peaks lit from the left: rock faces with creases, snow in the gullies, green foot */
function mkMountain(w, seed, snowy, green) {
  var h = Math.round(w * (0.68 + 0.2 * hh(seed, 1, 1))), S = spr(w + 2, h + 3), np = 2 + ((hh(seed, 2, 1) * 3) | 0), i, x, y;
  var peaks = [];
  for (i = 0; i < np; i++) {
    var main = i === 0, px = main ? w * (0.38 + 0.24 * hh(seed, 3, 1)) : w * (0.1 + 0.8 * hh(i, seed, 3)), ph = main ? h : h * (0.42 + 0.38 * hh(i, seed, 4));
    peaks.push([px, ph, 0.85 + 0.5 * hh(i, seed, 5)]);
  }
  var prof = new Float64Array(w + 2), dom = new Int32Array(w + 2);
  for (x = 0; x < w + 2; x++) {
    var best = 0, bi = 0;
    for (i = 0; i < np; i++) { var d = Math.abs(x + 0.5 - peaks[i][0]), v = peaks[i][1] - d * peaks[i][1] / (w * 0.45) * peaks[i][2]; if (v > best) { best = v; bi = i; } }
    prof[x] = Math.max(0, best + (noise(x * 0.31 + seed, 1.7) * 0.07 + noise(x * 0.9 + seed, 4.2) * 0.035) * h);
    dom[x] = bi;
  }
  for (x = 0; x < w + 2; x++) {
    var top = h + 1 - prof[x], pk = peaks[dom[x]], lit = x + 0.5 < pk[0];
    for (y = Math.max(0, Math.ceil(top)); y < h + 3; y++) {
      var alt = (h + 1 - y) / h, fromTop = (y - top) / Math.max(1, h * 0.9);
      var cr = noise((x - pk[0]) / Math.max(2, w * 0.07) + seed, y / (h * 0.32)) + 0.4 * noise(x * 0.5, y * 0.5 + seed);
      var col;
      var snowAt = snowy && alt > 0.34 + 0.1 * noise(x * 0.2 + seed, 9) && (fromTop < 0.42 || cr < -0.15);
      if (snowAt) col = lit ? (cr > 0.35 ? 0xdde8f0 : 0xf7fafc) : (cr > 0.3 ? 0xa7b8c8 : 0xc2d1de);
      else if (green && alt < 0.5 || alt < 0.18) { col = lit ? 0x75994a : 0x56783a; if (hh(x, y, seed + 3) < 0.18) col = 0x3f6a33; }
      else {
        var base = lit ? 0xa99a83 : 0x6f6457;
        if (cr > 0.3) base = lit ? 0xc2b49c : 0x857a6b; else if (cr < -0.3) base = lit ? 0x8c7f6c : 0x5a5148;
        col = base;
      }
      sput(S, x, y, col, y > h + 1 ? 120 : 255);
    }
    var ty = Math.ceil(top) - 1; if (ty >= 0) sput(S, x, ty, 0x463d35, 255);
  }
  S.ax = Math.floor(w / 2); S.ay = h + 1;
  return S;
}
function mkShip(seed) {
  var big = hh(seed, 1, 1) < 0.4, w = big ? 11 : 8, h = big ? 11 : 8, S = spr(w + 6, h + 3), x0 = 3;
  for (var t = 0; t < 4; t++) sput(S, x0 - 2 - t, h - 1 + (t & 1), 0xcfe8f2, 200);
  for (var x = 0; x < w; x++) { sput(S, x0 + x, h - 1, 0x6b4a2c); if (x > 0 && x < w - 1) sput(S, x0 + x, h - 2, 0x8a6338); }
  var mast = x0 + Math.floor(w / 2);
  for (var y = 1; y < h - 2; y++) { sput(S, mast, y, 0x5a3e28); var sw2 = Math.floor((y - 1) * 0.6); for (var q = 1; q <= sw2; q++) sput(S, mast + q, y, q === sw2 ? 0xd9d4c4 : 0xf6f3ea); if (big) for (q = 1; q <= sw2 - 1; q++) sput(S, mast - q, y + 1, 0xece6d6); }
  soutline(S, 0x2a2a30);
  S.ax = x0 + Math.floor(w / 2); S.ay = h;
  return S;
}
function mkVillage(seed, n) {
  var S = spr(18, 13);
  sShadow(S, 9.5, 10.5, 8, 2.2);
  for (var i = 0; i < n; i++) {
    var x = 2 + ((hh(i, seed, 1) * 12) | 0), y = 3 + ((hh(i, seed, 2) * 6) | 0), wd = 3 + ((hh(i, seed, 3) * 2) | 0);
    var rc = [0xc4573a, 0xb9472f, 0xd0744c, 0x8d949a][(hh(i, seed, 4) * 4) | 0];
    for (var dx = 0; dx < wd; dx++) { sput(S, x + dx, y, sh(rc, 1.15)); sput(S, x + dx, y + 1, rc); sput(S, x + dx, y + 2, dx === 0 ? 0xd8cdb8 : 0xf1e9d8); sput(S, x + dx, y + 3, dx === 0 ? 0xc9bea8 : 0xe4dccb); }
    if (wd > 3) sput(S, x + 1, y + 3, 0x4a5a6a);
  }
  soutline(S, 0x3a3028);
  S.ax = 9; S.ay = 11;
  return S;
}
var ATLAS = null;
function atlas() {
  if (ATLAS) return ATLAS;
  ATLAS = { con: [], cons: [], leaf: [], leafA: [], palm: [], mtn: [], mtnS: [], mtnG: [], ship: [], vil: [] };
  var LP = [[0x8cc45a, 0x5fa040, 0x3f7f32, 0x2b5e27, 0x1d4220], [0x9fcf6a, 0x6fb04a, 0x4a8c38, 0x33682b, 0x22471f], [0xf6c063, 0xe39a3a, 0xc4752a, 0x93521f, 0x5f3415]];
  for (var s = 4; s <= 11; s++) { ATLAS.con.push(mkConifer(s + 2, s * 7, false)); ATLAS.cons.push(mkConifer(s + 2, s * 7 + 1, true)); ATLAS.leaf.push(mkLeafy(s, s * 13, LP[s & 1])); ATLAS.leafA.push(mkLeafy(s, s * 17, LP[2])); ATLAS.palm.push(mkPalm(s + 2)); }
  for (var m = 0; m < 7; m++) for (var v = 0; v < 3; v++) { var w = 14 + m * 9; ATLAS.mtn.push(mkMountain(w, m * 31 + v, false, false)); ATLAS.mtnS.push(mkMountain(w, m * 31 + v + 7, true, false)); ATLAS.mtnG.push(mkMountain(w, m * 31 + v + 13, false, true)); }
  for (var q = 0; q < 4; q++) { ATLAS.ship.push(mkShip(q * 5 + 1)); ATLAS.vil.push(mkVillage(q * 11 + 3, 3 + q)); }
  return ATLAS;
}
var SPL = []; // sprite draw list for the current tile
function blit(out, S, x, y) { // x,y = tile px of the sprite anchor
  var x0 = Math.round(x) - S.ax, y0 = Math.round(y) - S.ay;
  for (var j = 0; j < S.h; j++) {
    var ty = y0 + j; if (ty < 0 || ty >= TS) continue;
    for (var i = 0; i < S.w; i++) {
      var tx = x0 + i; if (tx < 0 || tx >= TS) continue;
      var si = (j * S.w + i) * 4, a = S.px[si + 3]; if (!a) continue;
      var o = (ty * TS + tx) * 4;
      if (a === 255) { out[o] = S.px[si]; out[o + 1] = S.px[si + 1]; out[o + 2] = S.px[si + 2]; }
      else { var f = a / 255; out[o] = out[o] * (1 - f) + S.px[si] * f; out[o + 1] = out[o + 1] * (1 - f) + S.px[si + 1] * f; out[o + 2] = out[o + 2] * (1 - f) + S.px[si + 2] * f; }
    }
  }
}
/* classify an anchor exactly like pixel() would colour it */
function anchorClass(X, Y, mpp) {
  var mx = X * C, my = Y * C, lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * Y))) * 57.29578, alat = lat < 0 ? -lat : lat, k = Math.cos(lat / 57.29578), rm = mpp * k;
  if (coastS(X, Y, mx, my, mpp) < 0) return "sea";
  var des = samp(CD, CS, X + noise(mx / 900000 + 3, my / 900000) * 0.01, Y + noise(mx / 900000, my / 900000 - 5) * 0.01), mt = samp(CM, CS, X, Y), ic = samp(CI, CS, X, Y);
  if (ic + (alat > 77 ? 0.7 : 0) + (lat < -62 ? 1 : 0) + 0.25 * lfbm(mx / 120000, my / 120000, 120000, mpp, 7) > 0.55) return "ice";
  OUTC = 0; OUTB = 0;
  for (var si = 0; si < TC.length; si++) { var sq = TC[si]; if (!sq.schema) continue; var qx = (mx - sq.mx) * sq.k, qy = (my - sq.my) * sq.k; if (qx * qx + qy * qy < 1.3 * sq.R * sq.R) return "city"; }
  if (TC.length && cityPix(mx, my, rm, 0, 0) >= 0) return "city";
  if (waterLand(mx, my, k, rm, mpp, des, mt, alat)) return "water";
  natural(X, Y, mx, my, mpp, k, rm, lat, alat, des, mt, SUB * 1.2, Math.floor(X * 1e6), Math.floor(Y * 1e6));
  NATM = mt;
  return NATB;
}
var NATM = 0;
function spritePass(out, z, tx, ty, mpp) {
  var A = atlas(), N = Math.pow(2, z) * TS, sf = Math.max(0, Math.min(1, (z - 2) / 7));
  SPL.length = 0;
  var layers = [
    { cs: Math.round(5 + 2 * sf), kind: 0 },     // trees
    { cs: Math.round(11 + 15 * sf), kind: 1 },   // mountains
    { cs: Math.round(26 + 20 * sf), kind: 2 }    // ships, villages
  ];
  var gx0 = tx * TS, gy0 = ty * TS;
  for (var L = 0; L < layers.length; L++) {
    var cs = layers[L].cs, kind = layers[L].kind, mg = kind === 1 ? 80 : 16;
    var ncx = Math.floor(N / cs);
    for (var cj = Math.floor((gy0 - mg) / cs); cj <= Math.floor((gy0 + TS + mg) / cs); cj++) for (var ci = Math.floor((gx0 - mg) / cs); ci <= Math.floor((gx0 + TS + mg) / cs); ci++) {
      var wi = ((ci % ncx) + ncx) % ncx, h1 = hh(wi, cj, 500 + kind + z * 7);
      if (kind === 0 && h1 > 0.82) continue;
      if (kind === 2 && h1 > 0.3) continue;
      var ax = (ci + 0.2 + 0.6 * hh(wi, cj, 510 + kind)) * cs, ay = (cj + 0.2 + 0.6 * hh(wi, cj, 520 + kind)) * cs;
      if (ay < 0 || ay >= N) continue;
      var X = ((ax / N) % 1 + 1) % 1, Y = ay / N;
      var cl = anchorClass(X, Y, mpp), S = null, h2 = hh(wi, cj, 530 + kind);
      if (kind === 0) {
        if (cl === "forest") { var ti = Math.min(7, Math.max(0, Math.round(sf * 4 + h2 * 3))); S = NATF === 1 ? (NATE > 0.25 || hh(wi, cj, 540) < 0.25 ? A.cons[ti] : A.con[ti]) : NATF === 2 ? (h2 < 0.3 ? A.palm[ti] : A.leaf[ti]) : (h2 < 0.35 ? A.con[ti] : hh(wi, cj, 541) < 0.07 ? A.leafA[ti] : A.leaf[ti]); }
        else if ((cl === "grass" || cl === "fields") && h1 < 0.035) S = A.leaf[Math.min(7, Math.round(sf * 3 + h2 * 2))];
        else if (cl === "steppe" && h1 < 0.03) S = A.leaf[Math.round(sf * 2)];
        else if (cl === "desert" && h1 < 0.012) S = A.palm[Math.round(sf * 3)];
        else if (cl === "tundra" && h1 < 0.05) S = A.cons[Math.round(sf * 2)];
      } else if (kind === 1) {
        if (cl === "snow" || cl === "rock" || (NATM > 0.35 && cl !== "sea" && cl !== "city" && cl !== "water" && cl !== "ice")) {
          if (NATM < 0.3 && h1 > 0.4) continue;
          var mi = Math.max(0, Math.min(6, Math.round((NATM * 1.1 + h2 * 0.45) * (2.2 + 4.2 * sf) - 1.2)));
          var vi = (h2 * 3) | 0;
          S = cl === "snow" || NATM > 0.62 || (NATM > 0.45 && h2 < 0.5) ? A.mtnS[mi * 3 + vi] : NATM < 0.42 ? A.mtnG[mi * 3 + vi] : A.mtn[mi * 3 + vi];
        }
      } else {
        if (cl === "sea") { var b = samp(BLUR, BS, X, Y); if (b > 0.06 && b < 0.5 && h1 < 0.16) S = A.ship[(h2 * 4) | 0]; }
        else if ((cl === "fields" || cl === "grass" || cl === "steppe") && z >= 5 && h1 < 0.12) S = A.vil[(h2 * 4) | 0];
      }
      if (S) SPL.push([ay, ax - gx0 - (ax - gx0 > N / 2 ? N : ax - gx0 < -N / 2 ? -N : 0), ay - gy0, S]);
    }
  }
  if (z <= 9) {
    var IL = iconList(z);
    for (var ii = 0; ii < IL.length; ii++) {
      var ic = IL[ii], dxI = ic.x - gx0; if (dxI > N / 2) dxI -= N; else if (dxI < -N / 2) dxI += N;
      if (dxI < -110 || dxI > TS + 110 || ic.y - gy0 < -40 || ic.y - gy0 > TS + 110) continue;
      SPL.push([ic.y + 0.5, dxI, ic.y - gy0, iconSprite(CITIES[ic.i], ic.H)]);
    }
  }
  SPL.sort(function (a, b) { return a[0] - b[0]; });
  for (var q = 0; q < SPL.length; q++) blit(out, SPL[q][3], SPL[q][1], SPL[q][2]);
}


/* ---------- city icons for world/region zoom: a miniature of the city's landmark with a ring of little houses ---------- */
var ICON = { moscow: ["iconMoscow", 170, 90], paris: ["eiffel", 120, 120], london: ["parliament", 200, 70], rome: ["colosseum", 120, 100], nyc: ["iconNY", 160, 120],
  cairo: ["pyramids", 330, 270], istanbul: ["bluemosque", 90, 90], beijing: ["pagoda", 70, 70], tokyo: ["tokyotower", 100, 100], dubai: ["burj", 80, 80],
  berlin: ["reichstag", 140, 100], barcelona: ["sagrada", 90, 70], washington: ["capitol", 160, 60], delhi: ["indiagate", 60, 40], athens: ["acropolis", 140, 100],
  spb: ["isaac", 80, 80], kyiv: ["sophia", 90, 80], chisinau: ["cathedral_md", 90, 80], rio: ["cathedral", 80, 90] };
var ICON_GEN = [["cathedral", 80, 90], ["sobor", 70, 80], ["cityhall", 80, 60], ["pagoda", 70, 70], ["mosque", 90, 90], ["cathedral", 80, 90]];
LBLD.iconMoscow = function (A, c, P) {
  var cx = (A.X0 + A.X1) / 2 + 25, cy = (A.Y0 + A.Y1) / 2, bx = cx + 14, by = cy + 12, i;
  addBox(cx - 85, cy - 16, cx - 10, cy - 11, 11, { rc: 0xb4503c, wc: BRICK, win: 0, cren: 1 });
  cbox(cx - 88, cy - 13, 11, 11, 22, { rc: 0xb4503c, wc: BRICK, win: 0 }); cone(cx - 88, cy - 13, 5.5, 22, 15, 0x3d6b4f, 1);
  cbox(cx - 8, cy - 13, 13, 13, 32, { rc: 0xb4503c, wc: BRICK, win: 0 }); cbox(cx - 8, cy - 13, 9, 9, 8, { z0: 32, rc: WHITE, wc: WHITE, win: 2 }); cone(cx - 8, cy - 13, 4.5, 40, 20, 0x3d6b4f, 1); cone(cx - 8, cy - 13, 0.9, 60, 4, 0xd23c3c);
  cbox(cx - 50, cy - 40, 14, 14, 10, { rc: WHITE, wc: WHITE, win: 2 }); onionOn(cx - 50, cy - 40, 3.6, 10, GOLD);
  cyl(cx - 30, cy - 46, 5, 0, 40, WHITE, 2); onionOn(cx - 30, cy - 46, 4, 40, GOLD);
  cyl(bx, by, 6, 0, 16, BRICK, 2, 0xb4503c); cone(bx, by, 6, 16, 22, 0x5f8f6a, 0, 16, 0xe8d28a); onionOn(bx, by, 1.6, 38, GOLD);
  var cols = [[0xd23c3c, 0x3f8f4f], [0x2f5fb3, 0xf1ede2], [0xe0b030, 0x3f8f4f], [0xd23c3c, 0xf1ede2], [0x3f8f4f, 0xe0b030], [0x2f5fb3, 0xe0b030], [0xd23c3c, 0x2f5fb3], [0x3f8f4f, 0xf1ede2]];
  for (i = 0; i < 8; i++) { var a = i * Math.PI / 4, x = bx + Math.cos(a) * 11, y = by + Math.sin(a) * 9; cyl(x, y, 2.6, 0, 11, BRICK, 2, 0xb4503c); dome(x, y, 3.4, 11, 7.5, cols[i][0], 1, 10, cols[i][1]); }
};
LBLD.iconNY = function (A, c, P) {
  var cx = (A.X0 + A.X1) / 2, cy = (A.Y0 + A.Y1) / 2, T = [[-50, -20, 26, 22, 160, 0xc7c3b6], [-15, -30, 22, 22, 210, 0x8a9fb5], [25, -15, 30, 26, 150, 0xb98f66], [55, -35, 20, 20, 120, 0x6f97b3], [5, 20, 24, 20, 110, 0xd9c49c], [-45, 25, 20, 18, 90, 0xa7836a]];
  for (var i = 0; i < T.length; i++) { var t = T[i], b = cbox(cx + t[0], cy + t[1], t[2], t[3], t[4], { rc: 0x8f979e, wc: t[5], win: i === 1 || i === 3 ? 3 : 1 }); if (i === 0) cone(cx + t[0], cy + t[1], 3, t[4], 30, 0xd9dcdf); }
};
var ICONS = new Map();
function iconSprite(c, Hpx) {
  var key = (c.lm || "g" + c.sty) + ":" + Hpx + ":" + (c.seed | 0);
  var S = ICONS.get(key);
  if (S) return S;
  var def = ICON[c.lm] || ICON_GEN[c.sty] || ICON_GEN[0], w = def[1], h = def[2];
  var L = []; LB = L; LC = null; LS = c.seed | 0;
  var A = { X0: -w / 2, Y0: -h / 2, X1: w / 2, Y1: h / 2 };
  (LBLD[def[0]] || LBLD.cathedral)(A, c, { id: 1, f: def[0] });
  LB = null;
  var objs = L.filter(function (o) { return o.k !== 1; }), i, o, bb;
  var bbOf = function (o) { return o.k === 0 ? [o.x0, o.y0, o.x1, o.y1, o.z0, o.z0 + o.h] : o.bb; };
  // scale from the landmark alone: its screen height (top of the tallest part to the front edge) becomes Hpx
  var x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (i = 0; i < objs.length; i++) { bb = bbOf(objs[i]); x0 = Math.min(x0, bb[0]); x1 = Math.max(x1, bb[2]); y0 = Math.min(y0, bb[1] - bb[5] * F_OBL); y1 = Math.max(y1, bb[3]); }
  var sc = Math.min(Hpx / (y1 - y0), Hpx * 2.2 / (x1 - x0));
  // a dense cluster of little houses around it, sized in pixels
  var hw = (x1 - x0) / 2, walls = c.sty === S_LA ? WALL_LA : c.sty === S_ME ? WALL_ME : WALL, n = 16 + Math.min(14, Math.round(c.pop * 2));
  LB = objs; LS = (c.seed | 0) + 5;
  var tall = c.sty === S_US || c.sty === S_AS;
  for (i = 0; i < n; i++) {
    var a = (i / n) * 6.283 + hh(i, 1, LS) * 0.5, rp = hw * sc + 3 + (i & 1 ? 6 : 1) + hh(i, 2, LS) * 4, x = Math.cos(a) * rp / sc, y = Math.sin(a) * rp * 0.62 / sc + ((y0 + y1) / 2 + Hpx * 0.25 / sc);
    var bw = (4 + 3 * hh(i, 3, LS)) / sc, bd = (3 + 2 * hh(i, 4, LS)) / sc, red = hh(i, 5, LS) < roofRed(c) + 0.3;
    var hz = (tall ? 5 + 9 * hh(i, 6, LS) : 2.5 + 2.5 * hh(i, 6, LS)) / (sc * F_OBL);
    if (Math.sin(a) > 0.35) hz *= 0.7;
    addBox(x - bw / 2, y - bd / 2, x + bw / 2, y + bd / 2, hz, { roof: red ? (bw > bd ? 1 : 2) : 0, rc: red ? ROOF_R[(hh(i, 7, LS) * ROOF_R.length) | 0] : ROOF_G[(hh(i, 8, LS) * ROOF_G.length) | 0], wc: walls[(hh(i, 9, LS) * walls.length) | 0], win: 0 });
  }
  LB = null;
  x0 = 1e9; x1 = -1e9; y0 = 1e9; y1 = -1e9;
  for (i = 0; i < objs.length; i++) { bb = bbOf(objs[i]); x0 = Math.min(x0, bb[0]); x1 = Math.max(x1, bb[2]); y0 = Math.min(y0, bb[1] - bb[5] * F_OBL); y1 = Math.max(y1, bb[3]); }
  var out = new Uint8ClampedArray(TS * TS * 4), msk = new Uint8Array(TS * TS);
  var ax = TS / 2 - (x0 + x1) / 2 * sc, ay = TS / 2 - (y0 + y1) / 2 * sc;
  var save = OBJS; OBJS = [];
  pushLayout(objs, sc, ax, ay, 1);
  var j;
  for (j = 0; j < OBJS.length; j++) { var q = OBJS[j]; if (q.k === 0) shadowBox(out, msk, q); else if (q.k === 2) shadowPart(out, msk, q); }
  OBJS.sort(function (a, b) { return a.key - b.key; });
  for (j = 0; j < OBJS.length; j++) { var wv = OBJS[j]; if (wv.k === 0) drawBox(out, msk, wv); else if (wv.k === 2) drawPart(out, msk, wv); }
  OBJS = save;
  var bx0 = TS, by0 = TS, bx1 = 0, by1 = 0;
  for (j = 0; j < TS * TS; j++) if (msk[j]) { var px = j % TS, py = (j / TS) | 0; if (px < bx0) bx0 = px; if (px > bx1) bx1 = px; if (py < by0) by0 = py; if (py > by1) by1 = py; }
  S = spr(Math.max(1, bx1 - bx0 + 1), Math.max(1, by1 - by0 + 1));
  for (var yy = by0; yy <= by1; yy++) for (var xx = bx0; xx <= bx1; xx++) {
    var m = msk[yy * TS + xx], si = ((yy - by0) * S.w + (xx - bx0)) * 4, oi = (yy * TS + xx) * 4;
    if (m === 1 || m === 2) { S.px[si] = out[oi]; S.px[si + 1] = out[oi + 1]; S.px[si + 2] = out[oi + 2]; S.px[si + 3] = 255; }
    else if (m === 3) { S.px[si] = 12; S.px[si + 1] = 24; S.px[si + 2] = 18; S.px[si + 3] = 80; }
  }
  soutline(S, 0x2a2420);
  S.ax = Math.round(ax) - bx0; S.ay = Math.round(ay) - by0;
  ICONS.set(key, S);
  return S;
}
function iconH(pop, z) { var sf = Math.max(0, Math.min(1, (z - 2.5) / 5)), h = Math.max(18, Math.min(72, 18 + 11 * Math.log(1 + pop) / Math.LN2)) * (0.5 + 0.5 * sf); return h < 24 ? 20 : h < 34 ? 28 : h < 46 ? 40 : h < 60 ? 52 : 64; }
var ICL = new Map();
/* icons accepted at zoom level z after a greedy declutter (named cities first, then by population) */
function iconList(z) {
  var L = ICL.get(z);
  if (L) return L;
  var N = Math.pow(2, z) * TS, minPop = z < 3 ? 12 : z < 4 ? 5 : z < 5 ? 2 : z < 6 ? 0.9 : 0;
  var cand = [];
  for (var i = 0; i < CITIES.length; i++) { var c = CITIES[i]; if (c.pop < minPop && !(c.lm && z >= 4)) continue; cand.push(i); }
  cand.sort(function (a, b) { var A = CITIES[a], B = CITIES[b]; return (B.lm ? 1 : 0) - (A.lm ? 1 : 0) || B.pop - A.pop; });
  L = [];
  for (var q = 0; q < cand.length; q++) {
    var cc = CITIES[cand[q]], H = iconH(cc.pop, z), x = cc.mx / C * N, y = cc.my / C * N, ok = true;
    for (var r = 0; r < L.length; r++) { var o = L[r], dx = Math.abs(o.x - x); if (dx > N / 2) dx = N - dx; if (dx < (o.H + H) * 0.75 && Math.abs(o.y - y) < (o.H + H) * 0.55) { ok = false; break; } }
    if (ok) L.push({ i: cand[q], x: x, y: y, H: H });
  }
  ICL.set(z, L);
  return L;
}

/*STREET*/
var WET = 0; // set by pixel() for water, kept in the tile mask so cars and people never show on it
var GO = false; // objects pass active: buildings and trees are drawn as oblique objects above the ground
function pixel(X, Y, mx, my, mpp, k, rm, lat, gx, gy) {
  var alat = lat < 0 ? -lat : lat;
  if (SCH.length && rm <= 45) for (var si = 0; si < SCH.length; si++) {
    var sc0 = SCH[si], slx = (mx - sc0.mx) * sc0.k, sly = (my - sc0.my) * sc0.k, sd2 = slx * slx + sly * sly;
    if (sd2 > 2.6 * sc0.R * sc0.R) continue;
    OUTC = 0; OUTB = 0;
    var sv = sd2 < sc0.R * sc0.R * 1.3 ? schemaPix(sc0, slx, sly, rm, gx, gy) : -3;
    if (sv >= 0) return sv;
    if (sv === -3) { var swd = sgWater(sgGraph(sc0), slx, sly); if (swd < 0) return riverPix(swd, rm, gx, gy); }
    var sdes = samp(CD, CS, X, Y), smt = samp(CM, CS, X, Y), sfall = Math.max(0, Math.min(1, (Math.sqrt(sd2) / sc0.R - 1.14) / 0.47));
    return natural(X, Y, mx, my, mpp, k, rm, lat, alat, sdes, smt, 0.25 * (1 - sfall), gx, gy);
  }
  var s = coastS(X, Y, mx, my, mpp);
  var dpx = 99;
  if (s > -0.2 && s < 0.2) {
    var sx = coastS(X + mpp / C, Y, mx + mpp, my, mpp), sy = coastS(X, Y + mpp / C, mx, my + mpp, mpp);
    var a = sx - s, b = sy - s, g = Math.sqrt(a * a + b * b);
    dpx = g > 1e-9 ? Math.abs(s) / g : 99;
  }
  var dm = dpx * rm;
  if (s < 0) { WET = 1; return ocean(X, Y, mx, my, dm, rm, gx, gy); }
  var des = samp(CD, CS, X + noise(mx / 900000 + 3, my / 900000) * 0.01, Y + noise(mx / 900000, my / 900000 - 5) * 0.01), mt = samp(CM, CS, X, Y), ic = samp(CI, CS, X, Y);
  var iceV = ic + (alat > 77 ? 0.7 : 0) + (lat < -62 ? 1 : 0) + 0.25 * lfbm(mx / 120000, my / 120000, 120000, mpp, 7);
  if (iceV > 0.55) {
    var ni = lfbm(mx / 7000, my / 7000, 7000, mpp, 9);
    return ni > 0.12 ? 0xd3e2ee : ni < -0.15 ? 0xf6fafc : 0xe8f0f6;
  }
  OUTC = 0; OUTB = 0; SUB = 0;
  var c = TC.length ? cityPix(mx, my, rm, gx, gy) : -1;
  if (c < 0) { OUTC = 0; OUTB = 0; var hwc = highway(mx, my, k, rm); if (hwc >= 0) c = hwc; }
  if (!(OUTC === 1 && OUTB)) {
    var w = waterLand(mx, my, k, rm, mpp, des, mt, alat);
    if (w) { WET = 1; return w; }
  } else if (rm < 4 && waterLand(mx, my, k, rm, mpp, des, mt, alat)) {
    c = sh(c, 1.08); // bridge deck
  }
  if (c >= 0) {
    if (dm < Math.max(3, 0.5 * rm) && rm < 30) return 0xa8a296;
    return c;
  }
  if (dm < Math.max(16, 0.7 * rm) && mt < 0.5) return hh(gx, gy, 6) < 0.15 ? 0xd9c48a : 0xe5d29b;
  return natural(X, Y, mx, my, mpp, k, rm, lat, alat, des, mt, SUB * 1.2, gx, gy);
}
var OUTC = 0, OUTB = 0; // OUTC: 1 street; OUTB: street may bridge water

var SCH = [], SPZ = 99;
function setTileContext(x0, x1, y0, y1, mpp) {
  TC = []; SCH = [];
  var kc = kAt((y0 + y1) / 2), rm = mpp * kc, i;
  for (i = 0; i < CITIES.length; i++) {
    var c = CITIES[i], e = (Math.max(4 * inflate(c, rm), (c.rv ? 6 : c.lmFar ? 4 : 3) * c.R) + 2500) / c.k;
    if (c.mx + e > x0 && c.mx - e < x1 && c.my + e > y0 && c.my - e < y1) { TC.push(c); if (c.schema) SCH.push(c); }
  }
  if (rm < 700) {
    var pad = (6000 + 6 * rm) / kc;
    for (var cy = Math.floor((y0 - pad) / TOWN); cy <= Math.floor((y1 + pad) / TOWN); cy++) for (var cx = Math.floor((x0 - pad) / TOWN); cx <= Math.floor((x1 + pad) / TOWN); cx++) {
      var t = town(cx, cy);
      if (!t) continue;
      var et = (Math.max(4 * inflate(t, rm), 3 * t.R) + 1500) / t.k;
      if (t.mx + et > x0 && t.mx - et < x1 && t.my + et > y0 && t.my - et < y1) TC.push(t);
    }
  }
  TR = [];
  var pd = 4500 + mpp * 2;
  for (var j = 0; j < ROADS.length; j++) {
    var r = ROADS[j];
    if (r.maxx + pd > x0 && r.minx - pd < x1 && r.maxy + pd > y0 && r.miny - pd < y1) TR.push(r);
  }
}
function renderTile(z, tx, ty) {
  var n = Math.pow(2, z), N = n * TS, mpp = C / N;
  SPZ = z;
  setTileContext(tx / n * C, (tx + 1) / n * C, ty / n * C, (ty + 1) / n * C, mpp);
  var out = new Uint8ClampedArray(TS * TS * 4), msk = new Uint8Array(TS * TS);
  var kc = kAt((ty + 0.5) / n * C);
  GO = mpp * kc <= OBJ_RM && TC.length > 0;
  for (var py = 0; py < TS; py++) {
    var gy = ty * TS + py, Y = (gy + 0.5) / N, my = Y * C;
    var lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * Y))) * 57.29577951;
    var k = Math.cos(lat / 57.29577951), rm = mpp * k;
    for (var px = 0; px < TS; px++) {
      var gx = tx * TS + px, X = (gx + 0.5) / N;
      WET = 0;
      var c = pixel(X, Y, X * C, my, mpp, k, rm, lat, gx, gy);
      if (WET && GO) msk[py * TS + px] = 4;
      var o = (py * TS + px) * 4;
      out[o] = (c >> 16) & 255; out[o + 1] = (c >> 8) & 255; out[o + 2] = c & 255; out[o + 3] = 255;
    }
  }
  if (mpp * kc <= OBJ_RM) stGradeLater = true;
  if (GO && mpp * kc <= ST_RM) { streetPass(out, msk, z, tx, ty, mpp); GO = false; }
  else if (GO) { objectPass(out, msk, z, tx, ty, mpp); GO = false; }
  else if (z >= 2) spritePass(out, z, tx, ty, mpp);
  if (stGradeLater) { stGrade(out); stGradeLater = false; }
  return { img: out, msk: msk };
}
var stGradeLater = false;

function kAt(my) { return Math.cos(Math.atan(Math.sinh(Math.PI * (1 - 2 * my / C)))); }

root.GEN = {
  C: C, TS: TS, F_OBL: F_OBL,
  init: function (d) {
    MASK = d.mask; MS = d.ms; BLUR = d.blur; BS = d.bs; CD = d.cd; CM = d.cm; CI = d.ci; CS = d.cs;
    CITIES = d.cities.map(function (q) { return cityPrep({ mx: q.mx, my: q.my, pop: q.pop, sty: q.sty, seed: q.seed, lm: q.lm }); });
    ROADS = d.roads;
    TC = CITIES; TR = ROADS;
    sprInit(d.spr);
  },
  renderTile: renderTile,
  hh: hh, noise: noise, fbm: fbm, kAt: kAt,
  maskAt: function (X, Y) { return samp(MASK, MS, X, Y); },
  coast: function (mx, my) { return coastS(mx / C, my / C, mx, my, 2); },
  cities: function () { return CITIES; },
  cblock: cblock, cw: cwOf, sw: swOf, ed: edOf, layout: layout, lineX: lineX, lineY: lineY, blockIx: blockIx, blockJy: blockJy,
  EC: EC, sg: sgGraph, sgFaces: function (c) { sgBuild(c); return c.sg.faces || []; },
  sgProps: function (c, i, j) { return sgProps(c, i, j); },
  sgDoorsIn: function (c, x0, y0, x1, y1) { // doors of street-front buildings inside a local-metre box
    var sb = sgBuild(c), out = [], seen = new Set();
    for (var j = Math.floor(y0 / 128); j <= Math.floor(y1 / 128); j++) for (var i = Math.floor(x0 / 128); i <= Math.floor(x1 / 128); i++) {
      var L = sb.B.get(i * 65536 + j); if (!L) continue;
      for (var q = 0; q < L.length; q++) {
        var b = sb.list[L[q]]; if (!b.doors || seen.has(b)) continue; seen.add(b);
        for (var d = 0; d < b.doors.length; d++) { var D = b.doors[d]; if (D.x >= x0 && D.x <= x1 && D.y >= y0 && D.y <= y1) out.push(D); }
      }
    }
    return out;
  },
  sgEdgesIn: function (c, x0, y0, x1, y1) { // edge ids whose buckets touch a local-metre box
    var g = sgGraph(c), out = [], seen = new Set();
    for (var j = Math.floor(y0 / 64); j <= Math.floor(y1 / 64); j++) for (var i = Math.floor(x0 / 64); i <= Math.floor(x1 / 64); i++) {
      var L = g.EB.get(i * 65536 + j); if (L) for (var q = 0; q < L.length; q++) if (!seen.has(L[q])) { seen.add(L[q]); out.push(L[q]); }
    }
    return out;
  },
  townsIn: function (x0, y0, x1, y1) {
    var out = [], pad = 3000;
    for (var cy = Math.floor((y0 - pad) / TOWN); cy <= Math.floor((y1 + pad) / TOWN); cy++) for (var cx = Math.floor((x0 - pad) / TOWN); cx <= Math.floor((x1 + pad) / TOWN); cx++) {
      var t = town(cx, cy);
      if (t && t.mx + 2 * t.R / t.k > x0 && t.mx - 2 * t.R / t.k < x1 && t.my + 2 * t.R / t.k > y0 && t.my - 2 * t.R / t.k < y1) out.push(t);
    }
    return out;
  },
  iconList: function (z) { return iconList(z); },
  _icon: function (c, H) { return iconSprite(c, H); },
  sgBoatLines: function (c) { // river centre lines and ferry routes in city-local metres, for boats
    var S = c.schema, out = [];
    for (var i = 0; i < S.rivers.length; i++) if (S.rivers[i].w >= 30) out.push({ w: S.rivers[i].w, pts: S.rivers[i].pts });
    for (i = 0; i < (S.ferries || []).length; i++) out.push({ w: 200, pts: S.ferries[i] });
    return out;
  },
  _atlas: function () { return atlas(); },
  landmarks: function (c) {
    return c.lms.filter(function (P) { return P.n; }).map(function (P) {
      var A = P.A || (P.A = lmArea(c, P));
      return { name: P.n, mx: c.mx + (A.X0 + A.X1) / 2 / c.k, my: c.my + (A.Y0 + A.Y1) / 2 / c.k };
    });
  }
};
})(typeof self !== "undefined" ? self : this);
