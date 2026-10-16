(function () {
"use strict";
const G = self.GEN, C = G.C, TS = G.TS, MAXL = 21, ZMAX = 20.6;
/* street zoom uses tiles one level finer than the view (texel ≈ 1–1.4 CSS px instead of 2) */
const tileLevel = () => Math.max(0, Math.min(MAXL, view.z > 17.5 ? Math.round(view.z) + 1 : Math.round(view.z)));
const $ = (s) => document.querySelector(s);

/* ================= data ================= */
const CITY_ROWS = [
["Москва",55.756,37.617,12.6],["Санкт-Петербург",59.939,30.316,5.4],["Новосибирск",55.03,82.92,1.6],["Екатеринбург",56.84,60.61,1.5],
["Казань",55.79,49.12,1.3],["Нижний Новгород",56.33,44.0,1.2],["Самара",53.2,50.15,1.2],["Ростов-на-Дону",47.23,39.72,1.1],
["Краснодар",45.04,38.98,1.0],["Владивосток",43.12,131.89,0.6],["Иркутск",52.29,104.3,0.6],["Красноярск",56.01,92.85,1.1],
["Омск",54.99,73.37,1.1],["Волгоград",48.71,44.51,1.0],["Пермь",58.01,56.25,1.0],["Уфа",54.74,55.97,1.1],["Мурманск",68.97,33.08,0.3],
["Калининград",54.71,20.51,0.5],["Сочи",43.6,39.73,0.45],["Хабаровск",48.48,135.08,0.6],["Якутск",62.03,129.73,0.35],
["Киев",50.45,30.52,3.0],["Минск",53.9,27.56,2.0],["Варшава",52.23,21.01,1.8],["Берлин",52.52,13.405,3.6],["Париж",48.857,2.352,11],
["Лондон",51.507,-0.128,9.5],["Мадрид",40.417,-3.704,6.6],["Барселона",41.385,2.173,5.5],["Рим",41.9,12.5,4.3],["Милан",45.46,9.19,3.1],
["Вена",48.21,16.37,1.9],["Прага",50.08,14.43,1.3],["Будапешт",47.5,19.04,1.8],["Бухарест",44.43,26.1,1.8],["Стамбул",41.01,28.97,15],
["Анкара",39.93,32.86,5.0],["Афины",37.98,23.73,3.1],["Лиссабон",38.72,-9.14,2.9],["Амстердам",52.37,4.9,2.4],["Брюссель",50.85,4.35,2.1],
["Мюнхен",48.14,11.58,1.5],["Гамбург",53.55,9.99,1.8],["Копенгаген",55.68,12.57,1.3],["Стокгольм",59.33,18.07,1.6],["Осло",59.91,10.75,1.0],
["Хельсинки",60.17,24.94,1.2],["Рига",56.95,24.1,0.6],["Дублин",53.35,-6.26,1.4],["Манчестер",53.48,-2.24,2.7],["Белград",44.79,20.45,1.4],
["София",42.7,23.32,1.3],["Тбилиси",41.72,44.79,1.2],["Ереван",40.18,44.51,1.1],["Баку",40.41,49.87,2.3],["Алматы",43.24,76.89,2.0],
["Ташкент",41.3,69.24,2.6],["Астана",51.17,71.45,1.3],["Каир",30.04,31.24,20],["Лагос",6.52,3.38,14],["Киншаса",-4.44,15.27,14],
["Йоханнесбург",-26.2,28.05,6],["Кейптаун",-33.92,18.42,4.6],["Найроби",-1.29,36.82,4.7],["Аддис-Абеба",9.03,38.74,4.8],
["Касабланка",33.57,-7.59,3.7],["Алжир",36.75,3.06,3.4],["Тунис",36.8,10.18,2.4],["Дакар",14.72,-17.47,3.1],["Аккра",5.6,-0.19,2.5],
["Луанда",-8.84,13.23,8],["Дар-эс-Салам",-6.79,39.21,6.7],["Хартум",15.5,32.56,5.8],["Тегеран",35.69,51.39,9.1],["Багдад",33.31,44.36,7.1],
["Эр-Рияд",24.71,46.68,7.5],["Дубай",25.2,55.27,3.5],["Тель-Авив",32.08,34.78,4.0],["Карачи",24.86,67.0,16],["Лахор",31.55,74.34,13],
["Дели",28.61,77.21,30],["Мумбаи",19.08,72.88,21],["Калькутта",22.57,88.36,15],["Бангалор",12.97,77.59,12],["Ченнаи",13.08,80.27,11],
["Дакка",23.81,90.41,21],["Катманду",27.72,85.32,1.5],["Пекин",39.9,116.4,21],["Шанхай",31.23,121.47,27],["Гуанчжоу",23.13,113.26,18],
["Шэньчжэнь",22.54,114.06,17],["Чэнду",30.66,104.07,16],["Чунцин",29.56,106.55,16],["Ухань",30.59,114.31,11],["Сиань",34.34,108.94,12],
["Харбин",45.8,126.53,6],["Гонконг",22.32,114.17,7.5],["Тайбэй",25.03,121.57,7],["Сеул",37.57,126.98,25],["Пхеньян",39.04,125.76,3],
["Токио",35.68,139.69,37],["Осака",34.69,135.5,19],["Нагоя",35.18,136.91,9],["Саппоро",43.06,141.35,2.6],["Улан-Батор",47.89,106.91,1.6],
["Бангкок",13.76,100.5,11],["Ханой",21.03,105.85,8],["Хошимин",10.82,106.63,9],["Манила",14.6,120.98,14],["Джакарта",-6.2,106.85,34],
["Сингапур",1.35,103.82,6],["Куала-Лумпур",3.14,101.69,8],["Янгон",16.87,96.2,5],["Сидней",-33.87,151.21,5.3],["Мельбурн",-37.81,144.96,5.1],
["Брисбен",-27.47,153.03,2.5],["Перт",-31.95,115.86,2.1],["Аделаида",-34.93,138.6,1.4],["Окленд",-36.85,174.76,1.7],
["Нью-Йорк",40.71,-74.0,19],["Лос-Анджелес",34.05,-118.24,13],["Чикаго",41.88,-87.63,9.5],["Хьюстон",29.76,-95.37,7],["Даллас",32.78,-96.8,7.5],
["Майами",25.76,-80.19,6.1],["Атланта",33.75,-84.39,6],["Вашингтон",38.9,-77.04,6.3],["Бостон",42.36,-71.06,4.9],["Филадельфия",39.95,-75.17,6],
["Сан-Франциско",37.77,-122.42,4.7],["Сиэтл",47.61,-122.33,4],["Денвер",39.74,-104.99,3],["Финикс",33.45,-112.07,4.9],["Лас-Вегас",36.17,-115.14,2.3],
["Детройт",42.33,-83.05,4.3],["Миннеаполис",44.98,-93.27,3.6],["Торонто",43.65,-79.38,6.2],["Монреаль",45.5,-73.57,4.2],["Ванкувер",49.28,-123.12,2.6],
["Калгари",51.05,-114.07,1.5],["Мехико",19.43,-99.13,22],["Гвадалахара",20.67,-103.35,5.3],["Монтеррей",25.69,-100.32,5.3],["Гавана",23.11,-82.37,2.1],
["Анкоридж",61.22,-149.9,0.3],["Богота",4.71,-74.07,11],["Лима",-12.05,-77.04,11],["Сантьяго",-33.45,-70.67,7],["Буэнос-Айрес",-34.6,-58.38,15],
["Сан-Паулу",-23.55,-46.63,22],["Рио-де-Жанейро",-22.91,-43.17,13.5],["Бразилиа",-15.79,-47.88,4.7],["Каракас",10.48,-66.9,2.9],["Кито",-0.18,-78.47,2],
["Монтевидео",-34.9,-56.16,1.8],["Салвадор",-12.97,-38.5,3.9],["Манаус",-3.12,-60.02,2.2],["Рейкьявик",64.15,-21.94,0.23],["Нуук",64.18,-51.72,0.05],
["Кишинёв",47.0105,28.8575,0.7]
];
/* cities with hand-placed landmarks (see LMP in gen.js); the rest get a generic centre */
const LMK = { "Москва": "moscow", "Санкт-Петербург": "spb", "Париж": "paris", "Лондон": "london", "Рим": "rome", "Нью-Йорк": "nyc", "Кишинёв": "chisinau", "Киев": "kyiv", "Каир": "cairo", "Стамбул": "istanbul",
  "Пекин": "beijing", "Токио": "tokyo", "Дубай": "dubai", "Берлин": "berlin", "Барселона": "barcelona", "Вашингтон": "washington", "Рио-де-Жанейро": "rio", "Дели": "delhi", "Афины": "athens" };
const STY = { eu: 0, ru: 1, am: 2, as: 3, in: 4, me: 4, af: 4, la: 5 };

const MOUNTAINS = [ // [points [lat,lon]...], width km, strength
  [[[35.5,72],[34,77],[30.5,81],[28,86],[27.6,92],[28.3,97]],260,1.15],
  [[[36,80],[35.5,90],[35,98]],170,0.9], [[[33,80],[32,88],[31.5,95]],600,0.55],
  [[[35,68],[36.5,71.5],[38,73.5],[36.5,76]],220,1.0], [[[42,70],[43,80],[43,89]],200,0.9],
  [[[50,85],[48.5,91],[46.5,98]],200,0.75], [[[52,92],[51,100]],150,0.55], [[[30,99],[25,100.5]],220,0.65],
  [[[10,-73],[6,-75.5],[0,-78.2],[-6,-78.5],[-11,-76],[-16,-71],[-22,-68],[-28,-69],[-33,-70],[-40,-71.5],[-46,-72.5],[-51,-73.5],[-54,-71]],210,1.1],
  [[[8.5,-71],[10.3,-67]],100,0.6],
  [[[61,-131],[57,-126],[53,-120],[49,-115],[45,-111],[41,-107],[37,-106],[33,-107]],360,0.9],
  [[[48.5,-121.3],[44,-122],[40.5,-121.5],[37.5,-119.2],[35.5,-118.2]],110,0.8],
  [[[28,-107],[23,-104.5],[19,-99],[17,-96],[16,-93]],200,0.6],
  [[[62.5,-153],[61.5,-147],[60.5,-140],[59.5,-136]],150,0.9], [[[68,-162],[68.3,-150],[68.5,-143]],130,0.5],
  [[[44.2,6.8],[45.8,7.3],[46.4,9.5],[46.9,11.5],[47.2,13.5],[47.4,15]],170,0.95],
  [[[43,-1.5],[42.7,1.2],[42.5,2.8]],80,0.75], [[[43.6,39.6],[42.8,43.5],[41.6,47.5]],120,0.95],
  [[[37,44],[34,46.5],[30.5,51],[28,55.5]],210,0.75], [[[36.6,49.5],[36,53.5]],80,0.65],
  [[[68,65.5],[64,59.5],[60,59],[55,58.8],[51.5,58.5]],90,0.6], [[[58.6,7],[61.5,8.5],[64,12.5],[67,16],[69.3,20]],190,0.75],
  [[[30,-9],[31.6,-5.5],[34,-1],[35.5,3],[36.3,7.5]],150,0.75], [[[34,-85],[37,-81],[40,-78],[42.5,-75],[44.5,-71.5]],170,0.5],
  [[[48.7,22.5],[49.3,20.5],[48,24.5],[47,25.5],[45.5,25],[45.2,22.5]],110,0.6], [[[46,14.5],[43.5,17.5],[41.5,20.5]],110,0.55],
  [[[37.5,29],[37.5,33],[38.5,38],[39.3,42]],260,0.5], [[[68,128],[63,136]],250,0.5], [[[66,142],[69,148]],220,0.45],
  [[[57,160.5],[53,158]],120,0.65], [[[-15,145],[-21,148],[-26,151.5],[-31,151.5],[-35.5,149],[-37.5,146.5]],120,0.45],
  [[[-41,173],[-43.5,170.5],[-45.5,167.5]],100,0.85], [[[36.7,137.5],[35.5,138.3]],120,0.65], [[[-28.5,29.3],[-30.8,28]],100,0.55],
  [[[13,38],[9,39],[6.5,38]],260,0.55], [[[-0.5,36.3],[-3.2,37.3]],100,0.6], [[[1,30],[-2,29.3]],80,0.45], [[[31,-108],[28,-106]],80,0.3]
];
const DESERTS = [ // lat, lon, rLat, rLon, strength
  [24,-8,7,11,1.6],[22,5,8,14,1.6],[24,22,8,12,1.6],[21,32,6,6,1.4],[22.5,47,8,10,1.5],[31,58,5,9,1.1],[27,71,3,4,1.1],
  [40.5,61,4,8,1.0],[39,83,3,7.5,1.4],[42.5,104,4,11,1.15],[-24,131,9,14,1.3],[-29,139,5,6,1.0],[-23,20,5,6,1.1],[-23,15,4,1.5,1.2],
  [-23,-69.7,5,1.5,1.4],[-45,-68.5,5,3,0.7],[34,-114,5,6,1.1],[29,-106,4,4,0.9],[8,46,5,5,1.0],[47,60,5,14,0.65],[15.5,5,3,18,0.75]
];
const ICE = [[71.5,-42,13,26,1.6],[64.4,-16.8,0.5,1.2,0.8],[-49,-73.3,2.2,0.7,0.7],[61,-142,1.3,4.5,0.6],[78.5,17,2,8,0.5],[80,58,1.5,10,0.6],[76,-100,3,20,0.4]];

/* ================= helpers ================= */
const mercY = (lat) => { const l = Math.max(-85.05, Math.min(85.05, lat)) * Math.PI / 180; return (1 - Math.log(Math.tan(Math.PI / 4 + l / 2)) / Math.PI) / 2; };
const latOf = (Y) => Math.atan(Math.sinh(Math.PI * (1 - 2 * Y))) * 180 / Math.PI;
const tick = () => new Promise((r) => setTimeout(r, 0));
function mulberry(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function boxBlur(src, S, r, wrapX) {
  const tmp = new Float32Array(S * S), out = new Uint8Array(S * S), n = 2 * r + 1;
  for (let y = 0; y < S; y++) {
    const o = y * S; let acc = 0;
    for (let x = -r; x <= r; x++) acc += src[o + ((x + S) % S)];
    for (let x = 0; x < S; x++) { tmp[o + x] = acc / n; acc += src[o + ((x + r + 1) % S)] - src[o + ((x - r + S) % S)]; }
  }
  for (let x = 0; x < S; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += tmp[Math.min(S - 1, Math.max(0, y)) * S + x];
    for (let y = 0; y < S; y++) { out[y * S + x] = acc / n; acc += tmp[Math.min(S - 1, y + r + 1) * S + x] - tmp[Math.max(0, y - r) * S + x]; }
  }
  return out;
}

/* ================= world build ================= */
function decodeTopo(topo) {
  const [sx, sy] = topo.transform.scale, [tx, ty] = topo.transform.translate;
  const arcs = topo.arcs.map((a) => { let x = 0, y = 0; return a.map((d) => { x += d[0]; y += d[1]; return [x * sx + tx, y * sy + ty]; }); });
  const ring = (idx) => { const pts = []; for (const ai of idx) { const a = ai >= 0 ? arcs[ai] : arcs[~ai].slice().reverse(); for (let i = pts.length ? 1 : 0; i < a.length; i++) pts.push(a[i]); } return pts; };
  const polys = [];
  for (const g of topo.objects.land.geometries) { const list = g.type === "Polygon" ? [g.arcs] : g.arcs; for (const p of list) polys.push(p.map(ring)); }
  return polys;
}
function buildMask(polys, S) {
  const cv = document.createElement("canvas"); cv.width = cv.height = S;
  const c = cv.getContext("2d", { willReadFrequently: true });
  c.fillStyle = "#000"; c.fillRect(0, 0, S, S); c.fillStyle = "#fff";
  for (const poly of polys) {
    // unwrap rings that cross the antimeridian, then draw shifted copies so the wrap is seamless
    const rings = poly.map((r) => { let off = 0, prev = r[0][0]; return r.map((p) => { const d = p[0] - prev; if (d > 180) off -= 360; else if (d < -180) off += 360; prev = p[0]; return [p[0] + off, p[1]]; }); });
    for (const shift of [-S, 0, S]) {
      c.beginPath();
      for (const r of rings) { r.forEach((p, i) => { const x = (p[0] + 180) / 360 * S + shift, y = mercY(p[1]) * S; if (i) c.lineTo(x, y); else c.moveTo(x, y); }); c.closePath(); }
      c.fill("evenodd");
    }
  }
  const d = c.getImageData(0, 0, S, S).data, m = new Uint8Array(S * S);
  for (let i = 0; i < S * S; i++) m[i] = d[i * 4];
  cv.width = cv.height = 1;
  return m;
}
function downsample(m, S, f) {
  const s = S / f, out = new Uint8Array(s * s);
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    let a = 0; for (let j = 0; j < f; j++) for (let i = 0; i < f; i++) a += m[(y * f + j) * S + x * f + i];
    out[y * s + x] = a / (f * f);
  }
  return out;
}
function climateLayer(S, draw) {
  const cv = document.createElement("canvas"); cv.width = cv.height = S;
  const c = cv.getContext("2d", { willReadFrequently: true });
  c.fillStyle = "#000"; c.fillRect(0, 0, S, S);
  c.globalCompositeOperation = "lighter";
  draw(c, S);
  const d = c.getImageData(0, 0, S, S).data, m = new Uint8Array(S * S);
  for (let i = 0; i < S * S; i++) m[i] = d[i * 4];
  return boxBlur(m, S, 3);
}
function drawEllipses(list) {
  return (c, S) => {
    for (const [lat, lon, rl, rn, st] of list) {
      const cx = (lon + 180) / 360 * S, cy = mercY(lat) * S;
      const ry = Math.abs(mercY(lat + rl) - mercY(lat - rl)) / 2 * S, rx = rn / 360 * S;
      c.save(); c.translate(cx, cy); c.scale(rx, ry);
      const g = c.createRadialGradient(0, 0, 0, 0, 0, 1);
      const v = Math.min(255, 255 * st) | 0;
      g.addColorStop(0, `rgb(${v},${v},${v})`); g.addColorStop(0.55, `rgb(${v * 0.85 | 0},${v * 0.85 | 0},${v * 0.85 | 0})`); g.addColorStop(1, "rgb(0,0,0)");
      c.fillStyle = g; c.beginPath(); c.arc(0, 0, 1, 0, Math.PI * 2); c.fill(); c.restore();
    }
  };
}
function drawRanges(c, S) {
  c.lineCap = "round"; c.lineJoin = "round"; c.strokeStyle = "#fff";
  for (const [pts, wkm, st] of MOUNTAINS) {
    const latm = pts.reduce((a, p) => a + p[0], 0) / pts.length;
    const ppk = S / (40075 * Math.cos(latm * Math.PI / 180));
    for (const [f, a] of [[2.2, 0.16], [1.6, 0.2], [1.1, 0.24], [0.6, 0.3]]) {
      c.globalAlpha = Math.min(1, a * st); c.lineWidth = Math.max(1, wkm * f * ppk);
      c.beginPath(); pts.forEach((p, i) => { const x = (p[1] + 180) / 360 * S, y = mercY(p[0]) * S; if (i) c.lineTo(x, y); else c.moveTo(x, y); }); c.stroke();
    }
  }
  c.globalAlpha = 1;
}

/* ================= state ================= */
const cv = $("#map"), ctx = cv.getContext("2d");
let W = 0, H = 0, DPR = 1;
const view = { x: 0.56, y: 0.36, z: 2.3 };
let minZ = 1;
let cities = [], citiesByPop = [], agents = [], selected = null, follow = false;
let anim = null;
const cache = new Map();
let frameNo = 0;

function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2.5);
  W = cv.clientWidth; H = cv.clientHeight;
  cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
  minZ = Math.max(0.8, Math.log2(Math.max(W, H) / 256) - 0.6);
  if (view.z < minZ) view.z = minZ;
}
const worldPx = () => 256 * Math.pow(2, view.z);
function clampView() {
  view.x = ((view.x % 1) + 1) % 1;
  view.z = Math.max(minZ, Math.min(ZMAX, view.z));
  const half = H / 2 / worldPx();
  view.y = half >= 0.5 ? 0.5 : Math.max(half, Math.min(1 - half, view.y));
}
function toScreen(X, Y) {
  let dx = X - view.x; dx -= Math.round(dx);
  const s = worldPx();
  return [W / 2 + dx * s, H / 2 + (Y - view.y) * s];
}

/* ================= tiles ================= */
let workers = [], freeWorkers = [], useMain = false;
const inflight = new Map();
let reqId = 0;
const pending = new Map();
function key(z, x, y) { return z + "/" + x + "/" + y; }
function onTile(id, buf, mbuf) {
  const t = pending.get(id); pending.delete(id);
  if (!t) return;
  const tl = (window.__tileT = window.__tileT || []); tl.push([t.z, Math.round(performance.now() - t.t0)]); if (tl.length > 400) tl.shift();
  inflight.delete(t.k);
  const c = document.createElement("canvas"); c.width = c.height = TS;
  c.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(buf), TS, TS), 0, 0);
  cache.set(t.k, { c, used: frameNo, z: t.z, msk: mbuf ? new Uint8Array(mbuf) : null });
  if (cache.size > 1100) evict();
}
function evict() {
  const arr = [...cache.entries()].filter((e) => e[1].z > 2).sort((a, b) => a[1].used - b[1].used);
  for (let i = 0; i < arr.length - 800; i++) cache.delete(arr[i][0]);
}
function request(z, x, y, w) {
  const k = key(z, x, y);
  inflight.set(k, true);
  const id = ++reqId;
  pending.set(id, { k, z, t0: performance.now() });
  if (w) w.postMessage({ t: "tile", id, z, x, y });
  else { const r = G.renderTile(z, x, y); onTile(id, r.img.buffer, r.msk.buffer); }
}
let lastWanted = [];
function dispatch(wanted) {
  lastWanted = wanted;
  if (!wanted.length) return;
  wanted.sort((a, b) => a.p - b.p);
  if (useMain) {
    const t0 = performance.now();
    for (const t of wanted) { if (inflight.has(t.k)) continue; request(t.z, t.x, t.y, null); if (performance.now() - t0 > 14) break; }
    return;
  }
  for (const t of wanted) {
    if (!freeWorkers.length) break;
    if (inflight.has(t.k)) continue;
    request(t.z, t.x, t.y, freeWorkers.pop());
  }
}
/* a worker just finished: hand it the next wanted tile without waiting for a frame */
function refill() {
  for (const t of lastWanted) {
    if (!freeWorkers.length) return;
    if (inflight.has(t.k) || cache.has(t.k)) continue;
    request(t.z, t.x, t.y, freeWorkers.pop());
  }
}
function drawTiles(wanted) {
  const L = tileLevel();
  const n = Math.pow(2, L), s = worldPx(), sD = s * DPR;
  const left = view.x - W / 2 / s, top = view.y - H / 2 / s;
  const ix0 = Math.floor(left * n), ix1 = Math.floor((view.x + W / 2 / s) * n);
  const iy0 = Math.max(0, Math.floor(top * n)), iy1 = Math.min(n - 1, Math.floor((view.y + H / 2 / s) * n));
  ctx.imageSmoothingEnabled = false;
  const cxT = view.x * n, cyT = view.y * n;
  for (let iy = iy0; iy <= iy1; iy++) for (let ix = ix0; ix <= ix1; ix++) {
    const wx = ((ix % n) + n) % n;
    const x0 = Math.round((ix / n - left) * sD), x1 = Math.round(((ix + 1) / n - left) * sD);
    const y0 = Math.round((iy / n - top) * sD), y1 = Math.round(((iy + 1) / n - top) * sD);
    const k = key(L, wx, iy), e = cache.get(k);
    if (e) { e.used = frameNo; ctx.drawImage(e.c, x0, y0, x1 - x0, y1 - y0); continue; }
    if (!inflight.has(k)) wanted.push({ k, z: L, x: wx, y: iy, p: Math.hypot(ix + 0.5 - cxT, iy + 0.5 - cyT) });
    // ancestor fallback
    for (let d = 1; d <= L; d++) {
      const az = L - d, ax = wx >> d, ay = iy >> d, ae = cache.get(key(az, ax, ay));
      if (!ae) { if (d <= 2 && !inflight.has(key(az, ax, ay))) wanted.push({ k: key(az, ax, ay), z: az, x: ax, y: ay, p: 1000 * d + Math.hypot(ix - cxT, iy - cyT) }); continue; }
      ae.used = frameNo;
      const f = 1 << d, sz = TS / f;
      ctx.drawImage(ae.c, (wx - (ax << d)) * sz, (iy - (ay << d)) * sz, sz, sz, x0, y0, x1 - x0, y1 - y0);
      break;
    }
  }
}

/* ================= AI-painted districts =================
   Offline bakes: our own z20 render of a district, repainted with the open Z-Image-Turbo model (Apache-2.0)
   as one seamless image (MultiDiffusion img2img, layout kept), cut into 1024 px webp chunks with a soft outer edge.
   Drawn over the generated tiles at street zooms; cars and people still use the generated tiles' masks. */
// The baked Kremlin (baked/kremlin_*.webp) is switched off: a painted layer disagrees with the walking residents.
// Kept for reference: { name: "Кремль", z: 20, tx: 633841, ty: 327786, nx: 4, ny: 3, cs: 1024, path: "baked/kremlin_", minZ: 17.3 }
const BAKED = [];
for (const b of BAKED) {
  const n = 128 * Math.pow(2, b.z);
  b.X0 = b.tx * 128 / n; b.Y0 = b.ty * 128 / n; b.X1 = b.X0 + b.nx * b.cs / n; b.Y1 = b.Y0 + b.ny * b.cs / n; b.img = [];
}
function drawBaked() {
  const s = worldPx(), sD = s * DPR, left = view.x - W / 2 / s, top = view.y - H / 2 / s;
  for (const b of BAKED) {
    if (view.z < b.minZ) continue;
    if (b.X1 < left || b.X0 > left + W / s || b.Y1 < top || b.Y0 > top + H / s) continue;
    const a = Math.min(1, (view.z - b.minZ) / 0.5), cw = (b.X1 - b.X0) / b.nx, ch = (b.Y1 - b.Y0) / b.ny;
    ctx.globalAlpha = a;
    ctx.imageSmoothingEnabled = view.z < b.z - 0.05; ctx.imageSmoothingQuality = "high";
    for (let j = 0; j < b.ny; j++) for (let i = 0; i < b.nx; i++) {
      const X0 = b.X0 + i * cw, Y0 = b.Y0 + j * ch;
      if (X0 + cw < left || X0 > left + W / s || Y0 + ch < top || Y0 > top + H / s) continue;
      const k = j * b.nx + i;
      let im = b.img[k];
      if (!im) { im = b.img[k] = new Image(); im.decoding = "async"; im.src = b.path + i + "_" + j + ".webp"; }
      if (!im.complete || !im.naturalWidth) continue;
      const x0 = Math.round((X0 - left) * sD), y0 = Math.round((Y0 - top) * sD), x1 = Math.round((X0 + cw - left) * sD), y1 = Math.round((Y0 + ch - top) * sD);
      ctx.drawImage(im, x0, y0, x1 - x0, y1 - y0);
    }
    ctx.globalAlpha = 1; ctx.imageSmoothingEnabled = false;
  }
}

/* ================= sprites ================= */
function hex(c) { return "#" + c.toString(16).padStart(6, "0"); }
function makeCloud(seed) {
  const w = 60, h = 30, c = document.createElement("canvas"); c.width = w; c.height = h;
  const g = c.getContext("2d"), r = mulberry(seed);
  const blobs = []; const nb = 4 + (r() * 4 | 0);
  for (let i = 0; i < nb; i++) blobs.push([10 + r() * (w - 20), 11 + r() * (h - 20), 5 + r() * 8]);
  const inside = (x, y) => { if (x < 0 || y < 0 || x >= w || y >= h) return false; for (const b of blobs) { const dx = x - b[0], dy = (y - b[1]) * 1.25; if (dx * dx + dy * dy < b[2] * b[2] * (0.85 + 0.3 * G.noise(x * 0.3 + seed, y * 0.3))) return true; } return false; };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!inside(x, y)) continue;
    let col = "#eef3f8";
    if (!inside(x, y + 2) || !inside(x + 1, y + 2)) col = "#c3d1e2";
    else if (!inside(x, y + 4)) col = "#d8e2ee";
    else if (!inside(x - 1, y - 1) || !inside(x, y - 2)) col = "#ffffff";
    g.fillStyle = col; g.fillRect(x, y, 1, 1);
  }
  const s = document.createElement("canvas"); s.width = w; s.height = h;
  const sg = s.getContext("2d"); sg.drawImage(c, 0, 0); sg.globalCompositeOperation = "source-in"; sg.fillStyle = "rgba(8,20,40,0.28)"; sg.fillRect(0, 0, w, h);
  return { c, s };
}
const SKIN = [0xf3d2b8, 0xe8b996, 0xd7a07a, 0xb57a52, 0x8a5636, 0x6a4027];
const HAIR = [0x2b1d14, 0x4a3020, 0x7a4a26, 0xb98b4e, 0xdcc07a, 0x9c3b22, 0x1a1a1f, 0x8c8c8c];
const SHIRT = [0xd84a4a, 0x3b6fd1, 0x3fa36b, 0xe0a33a, 0x8e5bc8, 0x2f3b4c, 0xe6e6e6, 0xd96aa0, 0x29a3a8];
const BGS = [0xbfe3f2, 0xf7d9b5, 0xd5ecc2, 0xf1c9d4, 0xd9d1f2, 0xf5ecb8];
function shadeInt(c, f) { return ((Math.min(255, ((c >> 16) & 255) * f) | 0) << 16) | ((Math.min(255, ((c >> 8) & 255) * f) | 0) << 8) | (Math.min(255, (c & 255) * f) | 0); }
/* 16x16 pixel portrait: shoulders, face with light from the left, hair style, eyes, brows, mouth */
function makeAvatar(a) {
  const N = 16, c = document.createElement("canvas"); c.width = c.height = N;
  const g = c.getContext("2d");
  const R = (x, y, w, h, col) => { g.fillStyle = hex(col); g.fillRect(x, y, w, h); };
  const sk = a.skin, sk2 = shadeInt(sk, 0.84), sk3 = shadeInt(sk, 0.7), hc = a.hair, h2 = shadeInt(hc, 0.72), h3 = shadeInt(hc, 1.35) || 0x555555;
  const st = a.style, fem = a.female;
  R(0, 0, N, N, a.bg); R(0, 0, N, 6, shadeInt(a.bg, 1.06)); R(0, 12, N, 4, shadeInt(a.bg, 0.94));
  if (st === 1) R(3, 5, 10, 10, h2);                 // long hair falls behind the shoulders
  if (st === 3 && fem) R(3, 5, 10, 6, h2);
  // shoulders and shirt
  const sh1 = a.shirt, sh2 = shadeInt(a.shirt, 0.78);
  R(2, 13, 12, 3, sh1); R(3, 12, 10, 1, sh1); R(10, 12, 3, 4, sh2); R(13, 14, 1, 2, sh2);
  R(6, 12, 4, 1, shadeInt(a.shirt, 0.6)); R(7, 13, 2, 1, sk2);
  // neck and face
  R(6, 10, 4, 3, sk2);
  R(5, 4, 6, 8, sk); R(4, 5, 8, 5, sk);
  R(11, 5, 1, 5, sk2); R(10, 10, 1, 1, sk2); R(5, 11, 6, 1, sk2); R(4, 9, 1, 1, sk2);
  px1(g, 4, 7, sk2); px1(g, 11, 7, sk3);                           // ears in shade
  // eyes, brows, nose, mouth
  const eye = 0x22180f;
  px1(g, 6, 7, eye); px1(g, 9, 7, eye);
  if (fem) { px1(g, 5, 7, eye); px1(g, 10, 7, eye); }
  px1(g, 6, 6, h2); px1(g, 9, 6, h2); if (!fem) { px1(g, 5, 6, h2); px1(g, 10, 6, h2); }
  px1(g, 8, 8, sk2); px1(g, 8, 9, sk3);
  const lip = fem ? 0xc65a5a : shadeInt(sk, 0.66);
  R(7, 10, 2, 1, lip);
  if (fem) { px1(g, 5, 9, shadeInt(sk, 0.93) & 0xffd0d0 | 0x200000); px1(g, 10, 9, shadeInt(sk, 0.9)); }
  // hair
  if (st !== 4) {
    R(5, 2, 6, 1, hc); R(4, 3, 8, 2, hc); R(4, 5, 1, 2, hc); R(11, 5, 1, 2, hc);
    R(6, 2, 2, 1, h3); R(5, 3, 2, 1, h3);
    if (st === 0) { R(5, 5, 3, 1, hc); }
    if (st === 1) { R(3, 4, 1, 9, hc); R(12, 4, 1, 9, hc); R(4, 5, 1, 6, hc); R(11, 5, 1, 6, hc); R(5, 5, 2, 1, hc); }
    if (st === 2) { R(6, 0, 4, 2, hc); R(7, 0, 1, 1, h3); R(3, 4, 1, 4, hc); R(12, 4, 1, 4, hc); }
    if (st === 3) { R(3, 3, 1, 5, hc); R(12, 3, 1, 5, hc); for (let x = 4; x < 12; x += 2) px1(g, x, 2, hc); px1(g, 6, 5, hc); px1(g, 9, 5, hc); if (fem) { R(3, 8, 2, 3, hc); R(11, 8, 2, 3, hc); } }
  } else { R(5, 3, 6, 1, h2); R(4, 4, 1, 2, h2); R(11, 4, 1, 2, h2); px1(g, 6, 3, h3); }
  if (a.beard) { R(5, 9, 6, 2, hc); R(6, 11, 4, 1, hc); R(4, 7, 1, 3, hc); R(11, 7, 1, 3, hc); R(7, 10, 2, 1, shadeInt(hc, 1.5)); }
  if (a.glasses) { R(5, 7, 2, 1, 0x1d1d26); R(9, 7, 2, 1, 0x1d1d26); px1(g, 7, 7, 0x1d1d26); px1(g, 8, 7, 0x1d1d26); px1(g, 5, 6, 0x1d1d26); px1(g, 10, 6, 0x1d1d26); }
  return c;
}
function px1(g, x, y, col) { g.fillStyle = hex(col); g.fillRect(x, y, 1, 1); }

/* ================= agents ================= */
const NAMES = {
  ru: [["Дарья","Анна","Мария","Елена","Ольга","Алиса","Софья","Полина","Ксения","Вера","Ирина","Наталья","Екатерина","Виктория","Юлия"],["Иван","Алексей","Дмитрий","Максим","Артём","Никита","Сергей","Михаил","Егор","Павел","Андрей","Кирилл","Олег","Роман","Глеб"]],
  eu: [["Эмма","Луиза","Клара","Софи","Мия","Хлоя","Лаура","Элена","Ханна","Ингрид","Агата","Марта"],["Лукас","Матео","Леон","Луи","Хуго","Марко","Томас","Ян","Пауль","Оскар","Николя","Андреас"]],
  as: [["Юки","Мэй","Сакура","Хана","Лин","Сяо","Джи-ын","Мина","Аюми","Ли На"],["Хироши","Кэнта","Вэй","Чен","Мин-джун","Тао","Рё","Джун","Хао","Сота"]],
  in: [["Прия","Анания","Дивья","Мира","Асма","Фатима"],["Арджун","Рахул","Вивек","Имран","Радж","Санджай"]],
  me: [["Лейла","Ясмин","Нур","Зейнеп","Айше","Сара"],["Омар","Амир","Юсуф","Али","Эмре","Карим"]],
  af: [["Амара","Зури","Нала","Аиша","Имани","Адама"],["Кофи","Обинна","Тендай","Джабари","Кваме","Муса"]],
  am: [["Эмили","Сара","Джессика","Хлоя","Мэдисон","Оливия"],["Джон","Майкл","Итан","Ноа","Дэниел","Джейкоб"]],
  la: [["Ана","Габриэла","Камила","Валентина","Лусия","Мариана"],["Карлос","Матеус","Диего","Педро","Луис","Габриэль"]]
};
const PROFS = [["Программист","Программистка"],["Бариста","Бариста"],["Учитель","Учительница"],["Врач","Врач"],["Курьер","Курьер"],["Инженер","Инженер"],["Повар","Повар"],["Архитектор","Архитектор"],["Фотограф","Фотограф"],["Дизайнер","Дизайнер"],["Студент","Студентка"],["Журналист","Журналистка"],["Музыкант","Музыкант"],["Таксист","Таксистка"],["Продавец","Продавщица"],["Пенсионер","Пенсионерка"],["Флорист","Флорист"],["Механик","Механик"]];
const ACTS = [
  [6, ["Идёт на работу", "Пьёт кофе на ходу", "Спешит к метро", "Выгуливает собаку"]],
  [10, ["Идёт на встречу", "Идёт по делам", "Несёт документы в офис", "Ищет, где пообедать"]],
  [13, ["Идёт на обед", "Возвращается с обеда", "Покупает кофе"]],
  [15, ["Идёт по делам", "Спешит на встречу", "Забирает посылку"]],
  [18, ["Возвращается домой", "Идёт в магазин", "Встречается с друзьями", "Гуляет по району"]],
  [22, ["Идёт домой", "Не спится, гуляет", "Возвращается из кино"]]
];
function regionOf(c) {
  const [, lat, lon] = c.row;
  if (c.ru) return "ru";
  if (lon < -30) return lat < 24 ? "la" : "am";
  if (lat < 37.5 && lon > -20 && lon < 52) return (lat > 15 || (lon > 34 && lat > 12)) ? "me" : "af";
  if (lat < 42.5 && lon > 26 && lon < 62 && lat > 12) return "me";
  if (lat > 35 && lon < 45 && lon > -25) return "eu";
  if (lon >= 62 && lon < 93 && lat < 36) return "in";
  if (lon > 93) return lat < -10 ? "am" : "as";
  return "ru";
}
/* agents walk along the sidewalks of the city grid: axis 0 = along a horizontal street (line = y-line index), axis 1 = along a vertical one */
function sbm(b) { return b && !(b.L && b.L.out); }
function segH(g, i, j) { const a = G.cblock(g, i, j - 1), b = G.cblock(g, i, j); if (a && b && a.L && a.L === b.L) return false; return !!(sbm(a) || sbm(b)); }
function segV(g, i, j) { const a = G.cblock(g, i - 1, j), b = G.cblock(g, i, j); if (a && b && a.L && a.L === b.L) return false; return !!(sbm(a) || sbm(b)); }
function walkOff(g, line, side) { return side * (G.cw(g, line) + G.sw(g, line) * 0.55); }
/* schema cities: agents walk the road graph; e = edge, dir = +1 from node a to b, s = metres from node a */
function sgPos(a) {
  const g = a.g, sg = G.sg(g), E = sg.E, e = a.e, ux = E.ux[e], uy = E.uy[e], lane = G.EC[E.cls[e]][0] + G.EC[E.cls[e]][1] * 0.55;
  let off = a.side * lane;
  if (a.mode) { // walking to / standing in / coming out of a door (arches lead through into the courtyard)
    const V = a.visit, p = a.mode === "in" ? a.mt : a.mode === "out" ? 1 - a.mt : 1;
    off = V.side * (lane + (V.off + (V.k === "arch" ? V.dep + 3 : 0) - lane) * p);
  }
  return [sg.nx[E.a[e]] + ux * a.s - uy * off, sg.ny[E.a[e]] + uy * a.s + ux * off];
}
/* doors on either side of a road edge, from the generator's skeleton (only those facing this street), cached */
const EDOORS = new Map();
function inRing(xs, ys, x, y) { let c = false; for (let i = 0, j = xs.length - 1; i < xs.length; j = i++) if ((ys[i] > y) !== (ys[j] > y) && x < xs[i] + (y - ys[i]) / (ys[j] - ys[i]) * (xs[j] - xs[i])) c = !c; return c; }
function edgeDoors(g, e) {
  const key = g.seed + ":" + e;
  let L = EDOORS.get(key);
  if (L) return L;
  const sg = G.sg(g), E = sg.E, xa = sg.nx[E.a[e]], ya = sg.ny[E.a[e]], xb = sg.nx[E.b[e]], yb = sg.ny[E.b[e]];
  const ux = E.ux[e], uy = E.uy[e], len = E.len[e], cw = G.EC[E.cls[e]][0], sw = G.EC[E.cls[e]][1], pad = cw + sw + 8;
  L = [];
  for (const d of G.sgDoorsIn(g, Math.min(xa, xb) - pad, Math.min(ya, yb) - pad, Math.max(xa, xb) + pad, Math.max(ya, yb) + pad)) {
    const rx = d.x - xa, ry = d.y - ya, s = rx * ux + ry * uy, off = -rx * uy + ry * ux, side = off < 0 ? -1 : 1, ao = Math.abs(off);
    if (s < 4 || s > len - 4 || ao < cw + sw - 0.5 || ao > cw + sw + 6) continue;
    if ((d.nx * -uy + d.ny * ux) * side > -0.6) continue; // must face this street
    L.push({ s, side, off: ao, k: d.k, dep: d.dep });
  }
  L.sort((p, q) => p.s - q.s);
  EDOORS.set(key, L);
  return L;
}
function sgArrive(a, rnd) {
  const sg = G.sg(a.g), E = sg.E, n = a.dir > 0 ? E.b[a.e] : E.a[a.e], tx = E.ux[a.e] * a.dir, ty = E.uy[a.e] * a.dir;
  const opts = []; let tot = 0;
  for (const e2 of sg.adj[n]) {
    if (e2 === a.e || E.cls[e2] === undefined) continue;
    const d2 = E.a[e2] === n ? 1 : -1, w = 0.6 + 2 * Math.max(0, tx * E.ux[e2] * d2 + ty * E.uy[e2] * d2);
    opts.push([e2, d2, w]); tot += w;
  }
  if (!opts.length) { a.dir = -a.dir; return; }
  let r = rnd() * tot, ch = opts[0];
  for (const o of opts) { r -= o[2]; if (r <= 0) { ch = o; break; } }
  a.e = ch[0]; a.dir = ch[1]; a.s = ch[1] > 0 ? 0 : E.len[ch[0]];
  if (rnd() < 0.3) a.side = -a.side;
  if (rnd() < 0.1) a.wait = 1.5 + rnd() * 5;
  // now and then the resident heads for a door on this street: home, a shop, or through an arch into the courtyard
  if (rnd() < 0.45) {
    const DL = edgeDoors(a.g, a.e).filter((d) => (d.s - a.s) * a.dir > 6);
    if (DL.length) {
      const d = DL[(rnd() * DL.length) | 0], lane = G.EC[E.cls[a.e]][0] + G.EC[E.cls[a.e]][1] * 0.55;
      a.visit = Object.assign({ len: Math.max(1, d.off - lane) + (d.k === "arch" ? d.dep + 3 : 0) }, d);
      a.side = d.side;
    }
  }
}
function agentLocal(a) {
  if (a.sch) return sgPos(a);
  const g = a.g;
  return a.axis === 0 ? [a.pos, G.lineY(g, a.line) + walkOff(g, a.line, a.side)] : [G.lineX(g, a.line) + walkOff(g, a.line, a.side), a.pos];
}
function agentPos(a) { const p = agentLocal(a); return [a.g.mx + p[0] / a.g.k, a.g.my + p[1] / a.g.k]; }
function nodeCoord(a, n) { return a.axis === 0 ? G.lineX(a.g, n) : G.lineY(a.g, n); }
function canGo(g, axis, line, node, dir) { const s = dir > 0 ? node : node - 1; return axis === 0 ? segH(g, s, line) : segV(g, line, s); }
function arrive(a, rnd) {
  const g = a.g, node = a.target;
  const ni = a.axis === 0 ? node : a.line, nj = a.axis === 0 ? a.line : node;
  const opts = [];
  if (canGo(g, a.axis, a.line, node, a.dir)) opts.push([a.axis, a.line, node, a.dir, 3]);
  const ox = 1 - a.axis, oline = a.axis === 0 ? ni : nj, onode = a.axis === 0 ? nj : ni;
  for (const d of [1, -1]) if (canGo(g, ox, oline, onode, d)) opts.push([ox, oline, onode, d, 1.4]);
  if (!opts.length) { a.dir = -a.dir; a.target = node + a.dir; return; }
  let tot = 0; for (const o of opts) tot += o[4];
  let r = rnd() * tot, ch = opts[0];
  for (const o of opts) { r -= o[4]; if (r <= 0) { ch = o; break; } }
  if (ch[0] !== a.axis) { a.axis = ch[0]; a.line = ch[1]; a.pos = a.axis === 0 ? G.lineX(g, ni) : G.lineY(g, nj); if (rnd() < 0.5) a.side = -a.side; }
  a.dir = ch[3]; a.target = ch[2] + a.dir;
  if (rnd() < 0.1) a.wait = 1.5 + rnd() * 5;
}
function spawnAgents() {
  const rnd = mulberry(20261015);
  const total = 560;
  const weights = cities.map((c) => Math.pow(c.pop, 0.75));
  const wsum = weights.reduce((a, b) => a + b, 0);
  const pickCity = () => { let r = rnd() * wsum; for (let i = 0; i < cities.length; i++) { r -= weights[i]; if (r <= 0) return cities[i]; } return cities[0]; };
  const make = (city, forced) => {
    const g = city.g;
    if (g.schema) {
      const sg = G.sg(g), E = sg.E, lim = g.R * (forced ? 0.18 : 0.7);
      const cand = [];
      for (let e = 0; e < sg.ne; e++) if (E.len[e] >= 30 && Math.hypot(sg.nx[E.a[e]], sg.ny[E.a[e]]) < lim) cand.push(e);
      if (!cand.length) return null;
      const e = cand[(rnd() * cand.length) | 0];
      return { g, sch: 1, e, dir: rnd() < 0.5 ? 1 : -1, s: E.len[e] * (0.2 + 0.6 * rnd()), side: rnd() < 0.5 ? 1 : -1, wait: 0 };
    }
    for (let tries = 0; tries < 60; tries++) {
      const ang = rnd() * Math.PI * 2, d = g.R * (forced ? 0.2 : 0.8) * Math.sqrt(rnd());
      const bi = G.blockIx(g, Math.cos(ang) * d), bj = G.blockJy(g, Math.sin(ang) * d), b = G.cblock(g, bi, bj);
      if (!b || b.L) continue;
      const axis = rnd() < 0.5 ? 0 : 1, dir = rnd() < 0.5 ? 1 : -1, side = rnd() < 0.5 ? 1 : -1;
      const a = { g, axis, dir, side, wait: 0 };
      if (axis === 0) { a.line = rnd() < 0.5 ? bj : bj + 1; const x0 = G.lineX(g, bi), x1 = G.lineX(g, bi + 1); a.pos = x0 + (x1 - x0) * (0.15 + 0.7 * rnd()); a.target = dir > 0 ? bi + 1 : bi; }
      else { a.line = rnd() < 0.5 ? bi : bi + 1; const y0 = G.lineY(g, bj), y1 = G.lineY(g, bj + 1); a.pos = y0 + (y1 - y0) * (0.15 + 0.7 * rnd()); a.target = dir > 0 ? bj + 1 : bj; }
      if (!canGo(g, a.axis, a.line, a.target - dir, dir)) continue;
      return a;
    }
    return null;
  };
  const build = (city, a, fem, opts) => {
    const reg = regionOf(city), pool = NAMES[reg];
    const old = rnd() < 0.12;
    Object.assign(a, {
      id: agents.length, city, female: fem, name: pool[fem ? 0 : 1][(rnd() * pool[fem ? 0 : 1].length) | 0],
      age: old ? 62 + (rnd() * 20 | 0) : 18 + (rnd() * 40 | 0), speed: 1.2 + rnd() * 0.7,
      skin: reg === "ru" || reg === "eu" ? SKIN[(rnd() * 2) | 0] : reg === "af" ? SKIN[4 + ((rnd() * 2) | 0)] : SKIN[1 + ((rnd() * 3) | 0)],
      hair: old ? HAIR[7] : (reg === "ru" || reg === "eu" || reg === "am") ? HAIR[(rnd() * 6) | 0] : HAIR[[0, 6, 1][(rnd() * 3) | 0]],
      shirt: SHIRT[(rnd() * SHIRT.length) | 0], bg: BGS[(rnd() * BGS.length) | 0],
      style: fem ? [1, 1, 2, 3][(rnd() * 4) | 0] : [0, 0, 3, 4][(rnd() * 4) | 0], beard: !fem && rnd() < 0.25, glasses: rnd() < 0.18,
      energy: 0.5 + rnd() * 0.5, food: 0.4 + rnd() * 0.6, mood: 0.4 + rnd() * 0.6, actSeed: (rnd() * 1e6) | 0
    }, opts || {});
    const pr = PROFS[(rnd() * PROFS.length) | 0];
    a.prof = a.prof || (old ? (fem ? "Пенсионерка" : "Пенсионер") : pr[fem ? 1 : 0]);
    a.ava = makeAvatar(a);
    agents.push(a);
  };
  const moscow = cities.find((c) => c.name === "Москва");
  const d0 = make(moscow, true);
  if (d0) build(moscow, d0, true, { name: "Дарья", age: 27, prof: "Дизайнер", style: 1, hair: 0x7a3a22, skin: SKIN[0], shirt: 0xe0a33a, bg: 0xf7d9b5, glasses: false, star: true });
  let guard = 0;
  while (agents.length < total && guard++ < total * 3) {
    const city = pickCity(); const a = make(city, false);
    if (a) build(city, a, rnd() < 0.5);
  }
  agents.forEach((a) => { a.rnd = mulberry(a.id * 7919 + 13); });
}
function stepAgents(dt) {
  const k = 4; // time acceleration for walking
  for (const a of agents) {
    if (a.wait > 0) { a.wait -= dt; continue; }
    let dist = a.speed * k * dt;
    if (a.sch && a.mode) {
      if (a.mode === "inside") { a.mode = "out"; a.mt = 0; continue; }
      a.mt += dist * 0.6 / a.visit.len;
      if (a.mt >= 1) { if (a.mode === "in") { a.mode = "inside"; a.mt = 1; a.wait = 6 + a.rnd() * 14; } else { a.mode = null; a.visit = null; } }
      continue;
    }
    if (a.sch && a.visit) {
      const toV = (a.visit.s - a.s) * a.dir;
      if (toV < 0) a.visit = null;
      else if (toV <= dist) { a.s = a.visit.s; a.mode = "in"; a.mt = 0; continue; }
    }
    if (a.sch) {
      const L = G.sg(a.g).E.len;
      for (let guard = 0; guard < 4 && dist > 0; guard++) {
        const rem = a.dir > 0 ? L[a.e] - a.s : a.s;
        if (dist < rem) { a.s += a.dir * dist; dist = 0; } else { dist -= rem; a.s = a.dir > 0 ? L[a.e] : 0; sgArrive(a, a.rnd); }
      }
      continue;
    }
    for (let guard = 0; guard < 3 && dist > 0; guard++) {
      const tgt = nodeCoord(a, a.target), rem = Math.abs(tgt - a.pos);
      if (dist < rem) { a.pos += a.dir * dist; dist = 0; }
      else { a.pos = tgt; dist -= rem; arrive(a, a.rnd); }
    }
  }
}

/* ================= sim clock ================= */
let simMin = 8 * 60 + 40; // UTC-ish minutes of day at Moscow-based display
function localHour(lon) { return (((simMin / 60 + lon / 15 - 3) % 24) + 24) % 24; }
function activityOf(a) {
  if (a.mode && a.visit) {
    const f = a.female, k = a.visit.k;
    if (k === "shop") return a.mode === "out" ? (f ? "Выходит из магазина" : "Выходит из магазина") : (f ? "Зашла в магазин" : "Зашёл в магазин");
    if (k === "home") return a.mode === "out" ? "Выходит из подъезда" : (f ? "Зашла домой" : "Зашёл домой");
    return "Отдыхает во дворе";
  }
  const h = localHour(a.city.row[2]);
  let grp = ACTS[ACTS.length - 1][1];
  for (const [hs, list] of ACTS) if (h >= hs) grp = list;
  if (h < 6) grp = ACTS[ACTS.length - 1][1];
  const slot = Math.floor(simMin / 47);
  return grp[(G.hh(a.actSeed, slot, 5) * grp.length) | 0];
}

/* ================= overlays ================= */
const clouds = [];
function setupClouds() {
  const sprites = []; for (let i = 0; i < 10; i++) sprites.push(makeCloud(i * 977 + 3));
  const r = mulberry(99);
  for (let i = 0; i < 170; i++) {
    const y = 0.14 + r() * 0.72;
    clouds.push({ x: r(), y, w: 0.012 + Math.pow(r(), 2) * 0.03, s: sprites[(r() * sprites.length) | 0], v: 0.0025 + r() * 0.002 });
  }
}
function drawClouds(t) {
  const a = Math.max(0, Math.min(0.95, (6.6 - view.z) / 2.2));
  if (a <= 0.01) return;
  const s = worldPx();
  ctx.imageSmoothingEnabled = false;
  for (const c of clouds) {
    const X = c.x + t * c.v / 60;
    const [sx, sy] = toScreen(((X % 1) + 1) % 1, c.y);
    const w = c.w * s, h = w / 2;
    if (sx + w < -10 || sx - w > W + 10 || sy + h < -10 || sy - h > H + 10) continue;
    const pxs = Math.max(1, Math.round(w / 60 * DPR)), dw = pxs * 60, dh = pxs * 30;
    const dx = Math.round(sx * DPR - dw / 2), dy = Math.round(sy * DPR - dh / 2);
    ctx.globalAlpha = a * 0.8; ctx.drawImage(c.s.s, dx + Math.round(dw * 0.12), dy + Math.round(dh * 0.45), dw, dh);
    ctx.globalAlpha = a; ctx.drawImage(c.s.c, dx, dy, dw, dh);
  }
  ctx.globalAlpha = 1;
}
/* ---- street life: pixel cars and pedestrians drawn on the art-pixel grid, hidden behind buildings ---- */
function occluded(sx, sy) {
  const L = tileLevel(), n = Math.pow(2, L), s = worldPx();
  let X = view.x + (sx - W / 2) / s; X -= Math.floor(X);
  const Y = view.y + (sy - H / 2) / s;
  const fx = X * n, fy = Y * n, ix = Math.floor(fx), iy = Math.floor(fy);
  const e = cache.get(key(L, ix, iy));
  if (!e || !e.msk) return false;
  const px = Math.floor((fx - ix) * TS), py = Math.floor((fy - iy) * TS);
  const v = e.msk[py * TS + px];
  return v === 1 || v === 2 || v === 4;
}
const shadeCache = new Map();
function shade(c, f) { const k = c * 10 + f; let v = shadeCache.get(k); if (!v) { v = hex(shadeInt(c, f)); shadeCache.set(k, v); } return v; }
const CAR_COLS = [0xd23c3c, 0x2f5fb3, 0xf2f2f2, 0x2a2a2a, 0x9aa3ad, 0xe8c547, 0x3d8f5a, 0xf08a2a, 0x7a2e2e, 0x5fb7c9, 0xf2f2f2, 0x1f3f7a];
function artInfo() {
  const L = tileLevel();
  const a = 2 * Math.pow(2, view.z - L) * DPR; // device px per art px
  const rmA = C * G.kAt(view.y * C) / (Math.pow(2, L) * TS); // real meters per art px
  return { a, rmA };
}
function rectA(ox, oy, a, x, y, w, h, col) {
  const x0 = Math.round(ox + x * a), y0 = Math.round(oy + y * a);
  ctx.fillStyle = col; ctx.fillRect(x0, y0, Math.round(ox + (x + w) * a) - x0, Math.round(oy + (y + h) * a) - y0);
}
function drawCar(sx, sy, ew, dir, c, a, rmA) {
  const F = G.F_OBL;
  const Lp = Math.max(3, Math.min(40, Math.round(4.5 / rmA))), Wp = Math.max(2, Math.min(18, Math.round(2.0 / rmA))), Sp = Math.max(1, Math.round(0.7 * F / rmA));
  const body = hex(c), dark = shade(c, 0.62), lite = shade(c, 1.2), edge = shade(c, 0.5), glass = "#253140", glassHi = "#7d9ab3";
  const w = ew ? Lp : Wp, h = ew ? Wp : Lp;
  const ox = Math.round(sx * DPR - w * a / 2), oy = Math.round(sy * DPR - (h / 2 + Sp) * a);
  rectA(ox, oy, a, 1, 1.5, w, h + Sp, "rgba(0,0,0,0.28)");
  rectA(ox, oy, a, 0, 0, w, h, edge);
  rectA(ox, oy, a, 0, h, w, Sp, dark);
  if (Lp >= 6 && Wp >= 3) {
    rectA(ox, oy, a, ew ? 1 : 1, 1, w - 2, h - 2, body);
    if (ew) {
      const fr = dir > 0, c0 = Math.round(Lp * 0.3), c1 = Math.round(Lp * 0.7);
      rectA(ox, oy, a, c0, 1, c1 - c0, Wp - 2, lite);
      rectA(ox, oy, a, fr ? c1 : c0 - 2, 1, 2, Wp - 2, glass);
      rectA(ox, oy, a, fr ? c0 - 1 : c1, 1, 1, Wp - 2, glassHi);
      rectA(ox, oy, a, c0, h, c1 - c0, 1, glass);
      rectA(ox, oy, a, fr ? w - 1 : 0, h, 1, Sp, fr ? "#fff3c4" : "#e0453a");
    } else {
      const south = dir > 0, c0 = Math.round(Lp * 0.3), c1 = Math.round(Lp * 0.68);
      rectA(ox, oy, a, 1, c0, Wp - 2, c1 - c0, lite);
      rectA(ox, oy, a, 1, south ? c1 : c0 - 2, Wp - 2, 2, glass);
      rectA(ox, oy, a, 1, south ? c0 - 1 : c1, Wp - 2, 1, glassHi);
      rectA(ox, oy, a, 0, h, 1, Sp, south ? "#fff3c4" : "#e0453a"); rectA(ox, oy, a, w - 1, h, 1, Sp, south ? "#fff3c4" : "#e0453a");
    }
  } else rectA(ox, oy, a, 0, 0, w, h, body);
}
function drawPerson(sx, sy, shirt, hair, skin, step, a, pants) {
  const ox = Math.round(sx * DPR - 1.5 * a), oy = Math.round(sy * DPR - 6 * a);
  rectA(ox, oy, a, 1, 5.5, 3, 1, "rgba(0,0,0,0.28)");
  rectA(ox, oy, a, 0.5, 0, 2, 1, hair);
  rectA(ox, oy, a, 0.5, 1, 2, 1, skin);
  rectA(ox, oy, a, 0, 2, 3, 2, shirt);
  rectA(ox, oy, a, 2.5, 2, 0.5, 2, shade(parseInt(shirt.slice(1), 16), 0.75));
  rectA(ox, oy, a, 0.5, 4, 2, 1, pants || "#2f3542");
  rectA(ox, oy, a, step ? 0.5 : 1.5, 5, 1, 1, "#1f232b");
}
function citiesInView(x0, y0, x1, y1) {
  const out = [];
  for (const c of cities) { const g = c.g, e = 2.6 * g.R / g.k; if (g.mx + e > x0 && g.mx - e < x1 && g.my + e > y0 && g.my - e < y1) out.push(g); }
  if (view.z > 15.5) for (const t of G.townsIn(x0, y0, x1, y1)) out.push(t);
  return out;
}
function viewBox() { const s = worldPx(); return [(view.x - W / 2 / s) * C, (view.y - H / 2 / s) * C, (view.x + W / 2 / s) * C, (view.y + H / 2 / s) * C]; }
/* cb(g, axis, line, seg): axis 0 = horizontal street on y-line `line` between x-lines seg..seg+1 */
function forVisibleStreets(cb) {
  const [ux0, uy0, ux1, uy1] = viewBox();
  for (const g of citiesInView(ux0, uy0, ux1, uy1)) {
    if (g.schema) continue;
    const lx0 = (ux0 - g.mx) * g.k - 30, lx1 = (ux1 - g.mx) * g.k + 30, ly0 = (uy0 - g.my) * g.k - 30, ly1 = (uy1 - g.my) * g.k + 30;
    const i0 = G.blockIx(g, lx0), i1 = G.blockIx(g, lx1) + 1, j0 = G.blockJy(g, ly0), j1 = G.blockJy(g, ly1) + 1;
    for (let j = j0; j <= j1; j++) for (let i = i0; i < i1; i++) if (segH(g, i, j) && cb(g, 0, j, i) === false) return;
    for (let i = i0; i <= i1; i++) for (let j = j0; j < j1; j++) if (segV(g, i, j) && cb(g, 1, i, j) === false) return;
  }
}
function forVisibleBlocks(cb) {
  const [ux0, uy0, ux1, uy1] = viewBox();
  for (const g of citiesInView(ux0, uy0, ux1, uy1)) {
    if (g.schema) continue;
    const i0 = G.blockIx(g, (ux0 - g.mx) * g.k), i1 = G.blockIx(g, (ux1 - g.mx) * g.k), j0 = G.blockJy(g, (uy0 - g.my) * g.k), j1 = G.blockJy(g, (uy1 - g.my) * g.k);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const b = G.cblock(g, i, j); if (b && cb(g, i, j, b) === false) return; }
  }
}
function forVisibleEdges(cb) {
  const [ux0, uy0, ux1, uy1] = viewBox();
  for (const g of citiesInView(ux0, uy0, ux1, uy1)) {
    if (!g.schema) continue;
    const sg = G.sg(g);
    for (const e of G.sgEdgesIn(g, (ux0 - g.mx) * g.k - 30, (uy0 - g.my) * g.k - 30, (ux1 - g.mx) * g.k + 30, (uy1 - g.my) * g.k + 30)) if (cb(g, sg, e) === false) return;
  }
}
/* river boats and ferries on schema cities: drawn on the art-pixel grid, rotated along their route, hidden only by buildings */
function occludedSolid(sx, sy) {
  const L = tileLevel(), n = Math.pow(2, L), s = worldPx();
  let X = view.x + (sx - W / 2) / s; X -= Math.floor(X);
  const Y = view.y + (sy - H / 2) / s, fx = X * n, fy = Y * n, ix = Math.floor(fx), iy = Math.floor(fy);
  const e = cache.get(key(L, ix, iy));
  if (!e || !e.msk) return false;
  const v = e.msk[Math.floor((fy - iy) * TS) * TS + Math.floor((fx - ix) * TS)];
  return v === 1 || v === 2;
}
const BOAT_COLS = [0xf4f4f0, 0xf4f4f0, 0xe8e2d0, 0xd23c3c, 0x2f5fb3];
function drawBoats(t) {
  const { a, rmA } = artInfo();
  if (rmA > 6) return;
  const [ux0, uy0, ux1, uy1] = viewBox();
  for (const c of cities) {
    const g = c.g; if (!g.schema) continue;
    const e = 6 * g.R / g.k; if (g.mx + e < ux0 || g.mx - e > ux1 || g.my + e < uy0 || g.my - e > uy1) continue;
    const lines = g._boat || (g._boat = G.sgBoatLines(g).map((L) => { const cum = [0]; for (let i = 1; i < L.pts.length; i++) cum.push(cum[i - 1] + Math.hypot(L.pts[i][0] - L.pts[i - 1][0], L.pts[i][1] - L.pts[i - 1][1])); return { ...L, cum }; }));
    lines.forEach((L, li) => {
      const tot = L.cum[L.cum.length - 1], nB = Math.max(1, Math.floor(tot / 420));
      for (let q = 0; q < nB; q++) {
        const dir = q & 1 ? 1 : -1, big = G.hh(q, li, 3) < 0.5, spd = big ? 3.2 : 5;
        let s = ((G.hh(q, li, 1) * tot + dir * t * spd) % tot + tot) % tot;
        let k = 1; while (k < L.cum.length - 1 && L.cum[k] < s) k++;
        const p0 = L.pts[k - 1], p1 = L.pts[k], f = (s - L.cum[k - 1]) / Math.max(1e-6, L.cum[k] - L.cum[k - 1]);
        const ux = (p1[0] - p0[0]) / Math.max(1e-6, L.cum[k] - L.cum[k - 1]), uy = (p1[1] - p0[1]) / Math.max(1e-6, L.cum[k] - L.cum[k - 1]);
        const off = dir * Math.min(L.w * 0.22, 14);
        const lx = p0[0] + (p1[0] - p0[0]) * f - uy * off, ly = p0[1] + (p1[1] - p0[1]) * f + ux * off;
        const [x, y] = localToScreen(g, lx, ly);
        if (x < -60 || y < -60 || x > W + 60 || y > H + 60 || occludedSolid(x, y)) continue;
        drawBoat(x, y, Math.atan2(uy * dir, ux * dir), big, BOAT_COLS[(G.hh(q, li, 7) * BOAT_COLS.length) | 0], a, rmA);
      }
    });
  }
}
function drawBoat(sx, sy, ang, big, col, a, rmA) {
  const Lp = Math.max(4, Math.round((big ? 34 : 16) / rmA)), Wp = Math.max(2, Math.round((big ? 7 : 4.5) / rmA));
  ctx.save(); ctx.translate(Math.round(sx * DPR), Math.round(sy * DPR)); ctx.rotate(ang); ctx.scale(a, a);
  ctx.fillStyle = "rgba(235,248,255,0.55)"; ctx.fillRect(-Lp / 2 - Lp * 0.5, -Wp / 2 + 1, Lp * 0.5, 1); ctx.fillRect(-Lp / 2 - Lp * 0.5, Wp / 2 - 2, Lp * 0.5, 1);
  ctx.fillStyle = "rgba(10,30,60,0.3)"; ctx.fillRect(-Lp / 2 + 1, -Wp / 2 + 1, Lp, Wp);
  ctx.fillStyle = "#2a2f38"; ctx.fillRect(-Lp / 2, -Wp / 2, Lp, Wp);
  ctx.fillStyle = hex(col); ctx.fillRect(-Lp / 2 + 1, -Wp / 2 + 1, Lp - 2, Wp - 2);
  ctx.beginPath(); ctx.moveTo(Lp / 2 - 1, -Wp / 2 + 1); ctx.lineTo(Lp / 2 + Wp * 0.5, 0); ctx.lineTo(Lp / 2 - 1, Wp / 2 - 1); ctx.fill();
  if (Lp >= 8) {
    ctx.fillStyle = shade(col, 0.82); ctx.fillRect(-Lp / 2 + 3, -Wp / 2 + 2, Lp * 0.62, Wp - 4);
    ctx.fillStyle = "#33465a"; for (let x = -Lp / 2 + 4; x < -Lp / 2 + 3 + Lp * 0.62 - 1; x += 2) ctx.fillRect(x, -Wp / 2 + 2, 1, 1);
    ctx.fillStyle = "#ffffff"; ctx.fillRect(-Lp / 2 + 4, -1, Lp * 0.45, 2);
  }
  ctx.restore();
}
function drawCarRot(sx, sy, ang, c, a, rmA, lm) {
  const CL = KIT && KIT.g.car && ((lm === "nyc" && KIT.g.car.ny) || KIT.g.car.a || Object.values(KIT.g.car)[0]);
  if (CL) { // kit car sprite (seen from above, pointing up), rotated to the direction of travel
    const sp = CL[(Math.imul(c | 0, 0x9e3779b1) >>> 0) % CL.length], need = 4.5 / rmA * a;
    let m = sp[sp.length - 1]; for (const q of sp) if (q.h >= need * 0.95) { m = q; break; }
    const hh2 = need, ww = hh2 * m.w / m.h;
    ctx.save(); ctx.translate(Math.round(sx * DPR), Math.round(sy * DPR)); ctx.rotate(ang + Math.PI / 2);
    ctx.fillStyle = "rgba(0,0,0,0.28)"; ctx.fillRect(-ww / 2 + a * 0.6, -hh2 / 2 + a * 0.9, ww, hh2);
    ctx.drawImage(KIT.img, m.x, m.y, m.w, m.h, -ww / 2, -hh2 / 2, ww, hh2);
    ctx.restore();
    return;
  }
  const Lp = Math.max(3, Math.min(40, Math.round(4.5 / rmA))), Wp = Math.max(2, Math.min(18, Math.round(2.0 / rmA)));
  ctx.save(); ctx.translate(Math.round(sx * DPR), Math.round(sy * DPR)); ctx.rotate(ang); ctx.scale(a, a);
  ctx.fillStyle = "rgba(0,0,0,0.28)"; ctx.fillRect(-Lp / 2 + 0.6, -Wp / 2 + 0.9, Lp, Wp);
  ctx.fillStyle = shade(c, 0.5); ctx.fillRect(-Lp / 2, -Wp / 2, Lp, Wp);
  ctx.fillStyle = hex(c); ctx.fillRect(-Lp / 2 + 1, -Wp / 2 + 1, Lp - 2, Wp - 2);
  if (Lp >= 6) {
    const c0 = -Lp / 2 + Math.round(Lp * 0.3), c1 = -Lp / 2 + Math.round(Lp * 0.7);
    ctx.fillStyle = shade(c, 1.2); ctx.fillRect(c0, -Wp / 2 + 1, c1 - c0, Wp - 2);
    ctx.fillStyle = "#253140"; ctx.fillRect(c1, -Wp / 2 + 1, 2, Wp - 2);
    ctx.fillStyle = "#7d9ab3"; ctx.fillRect(c0 - 1, -Wp / 2 + 1, 1, Wp - 2);
    ctx.fillStyle = "#fff3c4"; ctx.fillRect(Lp / 2 - 1, -Wp / 2, 1, 1); ctx.fillRect(Lp / 2 - 1, Wp / 2 - 1, 1, 1);
  }
  ctx.restore();
}
function localToScreen(g, lx, ly) { return toScreen((g.mx + lx / g.k) / C, (g.my + ly / g.k) / C); }
function drawCars(t) {
  const { a, rmA } = artInfo();
  if (rmA > 2.4) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  let count = 0;
  const list = [];
  forVisibleStreets((g, axis, line, seg) => {
    const L = axis === 0 ? G.lineX : G.lineY;
    const a0 = L(g, seg) + G.cw(g, seg) + 1, a1 = L(g, seg + 1) - G.cw(g, seg + 1) - 1, len = a1 - a0;
    if (len < 12) return;
    const maj = G.cw(g, line) > 7, base = axis === 0 ? G.lineY(g, line) : G.lineX(g, line);
    const h = G.hh(seg * 7 + axis, line, g.seed);
    const nC = Math.floor(h * (maj ? 6 : 3.4) * (g.town ? 0.4 : 1));
    for (let q = 0; q < nC; q++) {
      if (count++ > 450) return false;
      const hq = G.hh(seg, line * 3 + q, g.seed + axis * 17);
      const dir = hq < 0.5 ? 1 : -1, spd = 7 + hq * 6;
      let f = (G.hh(seg, line + q * 99, g.seed + 5) + dir * t * spd / len) % 1; if (f < 0) f += 1;
      const along = a0 + f * len, off = maj && G.hh(q, seg, line) < 0.5 ? 4.8 : 1.7;
      const across = axis === 0 ? base + dir * off : base - dir * off;
      const [x, y] = axis === 0 ? localToScreen(g, along, across) : localToScreen(g, across, along);
      if (x < -30 || y < -30 || x > W + 30 || y > H + 30) continue;
      if (occluded(x, y)) continue;
      list.push([y, x, axis === 0, dir, CAR_COLS[(G.hh(seg, q, line + g.seed) * CAR_COLS.length) | 0]]);
    }
  });
  forVisibleEdges((g, sg, e) => {
    const E = sg.E, cls = E.cls[e], len = E.len[e], ux = E.ux[e], uy = E.uy[e], xa = sg.nx[E.a[e]], ya = sg.ny[E.a[e]];
    const r0 = sg.nr[E.a[e]] + 2, r1 = len - sg.nr[E.b[e]] - 2;
    if (r1 - r0 < 10) return;
    const nC = Math.floor(G.hh(e, 7, g.seed) * (cls === 0 ? 7 : cls === 1 ? 5 : 2.6));
    for (let q = 0; q < nC; q++) {
      if (count++ > 450) return false;
      const hq = G.hh(e, q, g.seed + 17), dir = hq < 0.5 ? 1 : -1, spd = 7 + hq * 6;
      let f = (G.hh(e, q + 99, g.seed + 5) + dir * t * spd / (r1 - r0)) % 1; if (f < 0) f += 1;
      const s = r0 + f * (r1 - r0), lane = cls < 2 && G.hh(q, e, 3) < 0.5 ? 4.6 : cls < 2 ? 1.7 : 1.3, off = dir * lane;
      const lx = xa + ux * s - uy * off, ly = ya + uy * s + ux * off;
      const [x, y] = localToScreen(g, lx, ly);
      if (x < -30 || y < -30 || x > W + 30 || y > H + 30 || occluded(x, y)) continue;
      list.push([y, x, null, Math.atan2(uy * dir, ux * dir), CAR_COLS[(G.hh(e, q, 11) * CAR_COLS.length) | 0], g.lm]);
    }
  });
  list.sort((p, q) => p[0] - q[0]);
  for (const c of list) {
    if (c[2] !== null) { drawCar(c[1], c[0], c[2], c[3], c[4], a, rmA); continue; }
    const ang = c[3], sa = Math.abs(Math.sin(ang)), ca = Math.abs(Math.cos(ang));
    if (sa < 0.12) drawCar(c[1], c[0], true, Math.cos(ang) > 0 ? 1 : -1, c[4], a, rmA);
    else if (ca < 0.12) drawCar(c[1], c[0], false, Math.sin(ang) > 0 ? 1 : -1, c[4], a, rmA);
    else drawCarRot(c[1], c[0], ang, c[4], a, rmA, c[5]);
  }
}
const PED_SHIRT = [0xd84a4a, 0x3b6fd1, 0x3fa36b, 0xe0a33a, 0x8e5bc8, 0x2f3b4c, 0xe6e6e6, 0xd96aa0, 0x29a3a8, 0x9a6a3a, 0xf2d24a, 0x5a7a3a];
const PANTS = ["#2f3542", "#3b4f7a", "#5a4632", "#2a2a2e", "#6b6f78"];
function drawCrowd(t) {
  const { a, rmA } = artInfo();
  if (rmA > 1.05) return;
  const pa = a * Math.max(1, 0.3 / rmA); // a person pixel is ~0.3 m whatever the tile level
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  let count = 0;
  const step = Math.floor(t * 4) & 1;
  const person = (g, lx, ly, q, salt) => {
    const [x, y] = localToScreen(g, lx, ly);
    if (x < -10 || y < -10 || x > W + 10 || y > H + 10 || occluded(x, y)) return;
    const hs = G.hh(q, salt, g.seed);
    drawPerson(x, y, hex(PED_SHIRT[(hs * PED_SHIRT.length) | 0]), hex(HAIR[(G.hh(q, salt, 3) * 7) | 0]), hex(SKIN[(G.hh(salt, q, 4) * SKIN.length) | 0]), (step + q) & 1, pa, PANTS[(G.hh(q, salt, 5) * PANTS.length) | 0]);
  };
  forVisibleStreets((g, axis, line, seg) => {
    const L = axis === 0 ? G.lineX : G.lineY;
    const p0 = L(g, seg), p1 = L(g, seg + 1), len = p1 - p0, cw = G.cw(g, line), sw = G.sw(g, line);
    const base = axis === 0 ? G.lineY(g, line) : G.lineX(g, line);
    const nP = Math.floor(G.hh(seg, line, g.seed + 77) * (g.town ? 3 : 9));
    for (let q = 0; q < nP; q++) {
      if (count++ > 900) return false;
      const hq = G.hh(seg * 3 + q, line, g.seed + 91);
      const dir = hq < 0.5 ? 1 : -1, side = G.hh(q, seg, line + g.seed) < 0.5 ? -1 : 1;
      let f = (G.hh(q, line * 7 + seg, g.seed + 93) + dir * t * (1.1 + hq * 0.6) * 4 / len) % 1; if (f < 0) f += 1;
      const along = p0 + f * len, off = side * (cw + 0.8 + G.hh(q, seg, 5) * (sw - 1.6));
      if (axis === 0) person(g, along, base + off, q, seg * 31 + line); else person(g, base + off, along, q, seg * 31 + line + 7777);
    }
  });
  forVisibleEdges((g, sg, e) => {
    const E = sg.E, cls = E.cls[e], len = E.len[e], ux = E.ux[e], uy = E.uy[e], xa = sg.nx[E.a[e]], ya = sg.ny[E.a[e]], cw = G.EC[cls][0], sw = G.EC[cls][1];
    const nP = Math.floor((0.7 + 0.6 * G.hh(e, 77, g.seed)) * Math.min(40, 4 + len / 4));
    for (let q = 0; q < nP; q++) {
      if (count++ > 2600) return false;
      const hq = G.hh(e * 3 + q, 1, g.seed + 91), dir = hq < 0.5 ? 1 : -1, side = G.hh(q, e, 5) < 0.5 ? -1 : 1;
      let f = (G.hh(q, e, g.seed + 93) + dir * t * (1.1 + hq * 0.6) * 4 / len) % 1; if (f < 0) f += 1;
      const s = f * len, off = side * (cw + 0.8 + G.hh(q, e, 6) * (sw - 1.6));
      person(g, xa + ux * s - uy * off, ya + uy * s + ux * off, q, e * 31 + 7);
    }
    // door trips: someone comes along the sidewalk, turns into a door (or through an arch into the courtyard),
    // stays a while and comes back out — all on the skeleton the tiles were drawn from
    const DL = edgeDoors(g, e);
    for (let q = 0; q < DL.length && q < 10; q++) {
      if (count++ > 2900) return false;
      const d = DL[q], h = G.hh(e * 13 + q, 3, g.seed), v = 4.2 + 1.6 * h, lane = cw + 0.8 + G.hh(q, e, 8) * (sw - 1.6);
      const A = 14 + 10 * h, B = Math.max(0.5, d.off - lane), thr = d.k === "arch" ? d.dep + 4 : 0, I = d.k === "arch" ? 3 + 5 * G.hh(q, e, 9) : 5 + 9 * G.hh(q, e, 9);
      const vs = v * 0.6, t1 = A / v, t2 = t1 + B / vs, t3 = t2 + thr / vs, t4 = t3 + I, t5 = t4 + thr / vs, t6 = t5 + B / vs, t7 = t6 + A / v, P = t7 + 3 + 12 * G.hh(q, e, 10);
      const tt = ((t + P * G.hh(q, e, 11)) % P + P) % P, dIn = G.hh(q, e, 12) < 0.5 ? 1 : -1, dOut = G.hh(q, e, 13) < 0.5 ? 1 : -1;
      let ss = d.s, o;
      if (tt < t1) { ss = d.s - dIn * (A - tt * v); o = lane; }
      else if (tt < t2) o = lane + (tt - t1) / (t2 - t1) * B;
      else if (tt < t3) o = d.off + (tt - t2) / (t3 - t2) * thr;
      else if (tt < t4) { if (!thr) continue; o = d.off + thr; }
      else if (tt < t5) o = d.off + thr - (tt - t4) / (t5 - t4) * thr;
      else if (tt < t6) o = d.off - (tt - t5) / (t6 - t5) * B;
      else if (tt < t7) { ss = d.s + dOut * (tt - t6) * v; o = lane; }
      else continue;
      if (ss < 1 || ss > len - 1) continue;
      const off = d.side * o;
      person(g, xa + ux * ss - uy * off, ya + uy * ss + ux * off, q + 50, e * 31 + 11);
    }
  });
  for (const c of cities) {
    const g = c.g; if (!g.schema) continue;
    const e0 = 3 * g.R / g.k, [vx0, vy0, vx1, vy1] = viewBox();
    if (g.mx + e0 < vx0 || g.mx - e0 > vx1 || g.my + e0 < vy0 || g.my - e0 > vy1) continue;
    // people on squares and in courtyards
    for (const F of G.sgFaces(g)) {
      if (!F.kind && !F.cf) continue;
      const [sx0, sy0] = localToScreen(g, F.cx, F.cy);
      if (sx0 < -150 || sy0 < -150 || sx0 > W + 150 || sy0 > H + 150) continue;
      const R = Math.sqrt(F.area / Math.PI), n = F.kind ? Math.min(40, 10 + Math.floor(F.area / 250)) : Math.min(14, 2 + Math.floor(F.area / 600));
      for (let q = 0; q < n; q++) {
        if (count++ > 3300) return;
        const hq = G.hh(q, F.id, g.seed + 3), dir = hq < 0.5 ? 1 : -1, sp = (0.9 + hq * 0.7) * 2.5;
        const rr = F.kind ? (q % 3 === 0 ? R * 0.4 : q % 3 === 1 ? R * 0.75 : 6 + (q % 5)) : R * 0.25;
        const ang = G.hh(q, F.id, 9) * 6.283 + dir * t * sp / Math.max(5, rr), lx = F.cx + Math.cos(ang) * rr, ly = F.cy + Math.sin(ang) * rr * 0.9;
        if (!F.kind && !(F.court && inRing(F.court[0], F.court[1], lx, ly))) continue;
        person(g, lx, ly, q, F.id * 977 + 13);
      }
    }
    for (const P of g.lms) {
      if (!/square|gorky|bigpark|redsquare|palacesq/.test(P.f)) continue;
      const A = P.A, [sx0, sy0] = localToScreen(g, A.X0, A.Y0), [sx1, sy1] = localToScreen(g, A.X1, A.Y1);
      if (sx1 < 0 || sy1 < 0 || sx0 > W || sy0 > H) continue;
      const Wb = A.X1 - A.X0, Hb = A.Y1 - A.Y0, n = Math.min(40, 8 + Math.floor(Wb * Hb / 900));
      for (let q = 0; q < n; q++) {
        if (count++ > 1400) return;
        const hq = G.hh(q, P.id, g.seed + 3), sp = (0.9 + hq * 0.7) * 4, dir = hq < 0.5 ? 1 : -1, L2 = Math.hypot(Wb, Hb);
        let f = (G.hh(q, P.id, 9) + dir * t * sp / L2) % 1; if (f < 0) f += 1;
        const k2 = q % 2, off = (G.hh(q, 3, P.id) - 0.5) * 3;
        person(g, k2 ? A.X0 + 3 + f * (Wb - 6) : A.X1 - 3 - f * (Wb - 6), A.Y0 + 3 + f * (Hb - 6) + off, q, P.id * 977);
      }
    }
  }
  // people strolling in parks, squares and landmark grounds
  forVisibleBlocks((g, bi, bj, b) => {
    if (b.t !== 5 && b.t !== 6 && b.t !== 9) return;
    if (b.L && b.L.out) return;
    const X0 = G.lineX(g, bi) + G.ed(g, bi), X1 = G.lineX(g, bi + 1) - G.ed(g, bi + 1), Y0 = G.lineY(g, bj) + G.ed(g, bj), Y1 = G.lineY(g, bj + 1) - G.ed(g, bj + 1);
    const Wb = X1 - X0, Hb = Y1 - Y0, cx = (X0 + X1) / 2, cy = (Y0 + Y1) / 2, R = Math.min(Wb, Hb) * 0.17 + 4;
    const n = 10 + Math.floor(G.hh(bi, bj, g.seed + 11) * 14);
    for (let q = 0; q < n; q++) {
      if (count++ > 1400) return false;
      const hq = G.hh(q, bi * 131 + bj, g.seed + 3), sp = (0.9 + hq * 0.7) * 4, dir = hq < 0.5 ? 1 : -1;
      const k = q % 3;
      let lx, ly;
      if (k === 2) { const ang = G.hh(q, bj, bi) * 6.283 + dir * t * sp / R; lx = cx + Math.cos(ang) * (R + (G.hh(q, 1, bi) - 0.5) * 2); ly = cy + Math.sin(ang) * (R + (G.hh(q, 2, bj) - 0.5) * 2); }
      else {
        const L2 = Math.hypot(Wb, Hb); let f = (G.hh(q, bi, bj + 5) + dir * t * sp / L2) % 1; if (f < 0) f += 1;
        const off = (G.hh(q, 3, bj) - 0.5) * 2.2;
        lx = k === 0 ? X0 + 3 + f * (Wb - 6) : X1 - 3 - f * (Wb - 6); ly = Y0 + 3 + f * (Hb - 6) + off;
      }
      person(g, lx, ly, q, bi * 977 + bj);
    }
  });
}

let labelHits = [];
function textBox(text, x, y, font, fg, bg, border) {
  ctx.font = font; ctx.textBaseline = "middle";
  const tw = ctx.measureText(text).width, bx = Math.round(x - tw / 2 - 7), by = Math.round(y - 10), bw = Math.round(tw + 14);
  ctx.fillStyle = "rgba(8,14,24,0.55)"; ctx.fillRect(bx + 2, by + 2, bw, 20);
  ctx.fillStyle = bg; ctx.fillRect(bx, by, bw, 20);
  if (border) { ctx.strokeStyle = border; ctx.lineWidth = 1.5; ctx.strokeRect(bx + 0.75, by + 0.75, bw - 1.5, 18.5); }
  ctx.fillStyle = fg; ctx.fillText(text, Math.round(x - tw / 2), Math.round(y + 1));
  return [bx, by, bx + bw, by + 20];
}
function drawLabels() {
  labelHits = [];
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  const placed = [];
  const free = (r) => !placed.some((q) => !(r[2] < q[0] || r[0] > q[2] || r[3] < q[1] || r[1] > q[3]));
  // landmark names at city and street zoom
  if (view.z > 14.2 && view.z < 19.6) {
    ctx.globalAlpha = Math.min(1, (view.z - 14.2) / 0.6, (19.6 - view.z) / 0.6);
    const [ux0, uy0, ux1, uy1] = viewBox();
    for (const c of cities) {
      const g = c.g, e = 4 * g.R / g.k;
      if (g.mx + e < ux0 || g.mx - e > ux1 || g.my + e < uy0 || g.my - e > uy1) continue;
      for (const L of c.lms) {
        const [x, y] = toScreen(L.mx / C, L.my / C);
        if (x < -100 || x > W + 100 || y < -30 || y > H + 30) continue;
        ctx.font = '600 13px "Pixelify Sans", ui-monospace, monospace';
        const tw = ctx.measureText(L.name).width, r = [x - tw / 2 - 8, y - 11, x + tw / 2 + 8, y + 11];
        if (!free(r)) continue;
        placed.push(r);
        textBox(L.name, x, y, '600 13px "Pixelify Sans", ui-monospace, monospace', "#ffe7a8", "rgba(16,27,44,0.88)", "#c99a3a");
      }
    }
    ctx.globalAlpha = 1;
  }
  if (view.z < 1.8 || view.z > 14.6) { ctx.setTransform(1, 0, 0, 1, 0, 0); return; }
  if (view.z <= 9.45) { // parchment plates under the city icons drawn into the tiles
    const L = Math.max(2, Math.min(9, Math.round(view.z))), art = 2 * Math.pow(2, view.z - L);
    for (const ic of G.iconList(L)) {
      const c = cities[ic.i]; if (!c) continue;
      const [x, y0] = toScreen(c.X, c.Y), y = y0 + ic.H * 0.32 * art + 9;
      if (x < -80 || x > W + 80 || y < -20 || y > H + 20) continue;
      const big = c.pop >= 8 || !!c.g.lm, f = big ? '600 13px "Pixelify Sans", ui-monospace, monospace' : '500 12px "Pixelify Sans", ui-monospace, monospace';
      ctx.font = f;
      const tw = ctx.measureText(c.name).width, r = [x - tw / 2 - 7, y - 9, x + tw / 2 + 7, y + 9];
      if (!free(r)) continue;
      placed.push(r);
      textBox(c.name, x, y, f, "#3a2a14", "#f3e6c4", "#8a6a34");
      labelHits.push({ rect: r, city: c });
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    return;
  }
  const fade = view.z > 13.4 ? Math.max(0, (14.6 - view.z) / 1.2) : 1;
  const z = view.z, minPop = z < 3 ? 12 : z < 4 ? 5 : z < 5 ? 2 : z < 6 ? 0.9 : 0;
  ctx.font = '500 13px "Pixelify Sans", ui-monospace, monospace';
  ctx.textBaseline = "middle";
  ctx.globalAlpha = fade;
  for (const c of citiesByPop) {
    if (c.pop < minPop) break;
    let [x, y] = toScreen(c.X, c.Y);
    if (z > 11) y -= Math.min(160, c.g.R / c.k / C * worldPx() * 1.15);
    if (x < -80 || x > W + 80 || y < -20 || y > H + 20) continue;
    const big = c.pop >= 8;
    ctx.font = big ? '600 15px "Pixelify Sans", ui-monospace, monospace' : '500 13px "Pixelify Sans", ui-monospace, monospace';
    const tw = ctx.measureText(c.name).width;
    const rect = [x - 5, y - 9, x + 9 + tw, y + 9];
    if (!free(rect)) continue;
    placed.push(rect);
    ctx.fillStyle = "#101b2c"; ctx.fillRect(Math.round(x) - 3, Math.round(y) - 3, 6, 6);
    ctx.fillStyle = big ? "#ffd166" : "#ffffff"; ctx.fillRect(Math.round(x) - 2, Math.round(y) - 2, 4, 4);
    ctx.lineWidth = 3; ctx.strokeStyle = "rgba(10,20,36,0.9)"; ctx.lineJoin = "round";
    ctx.strokeText(c.name, Math.round(x + 7), Math.round(y));
    ctx.fillStyle = "#f4f7fb"; ctx.fillText(c.name, Math.round(x + 7), Math.round(y));
    labelHits.push({ rect, city: c });
  }
  ctx.globalAlpha = 1;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

let pinHits = [];
function drawAgents() {
  pinHits = [];
  if (view.z < 13.2) return;
  const vis = [];
  for (const a of agents) {
    const m = agentPos(a);
    const [x, y] = toScreen(m[0] / C, m[1] / C);
    if (x < -40 || y < -80 || x > W + 40 || y > H + 40) continue;
    vis.push([a, x, y]);
  }
  ctx.imageSmoothingEnabled = false;
  const ai = artInfo(), street = ai.rmA < 1.05;
  if (street) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const st = Math.floor(performance.now() / 250) & 1;
    for (const [a, x, y] of vis) if ((a === selected && !(a.mode === "inside" && a.visit.k !== "arch")) || (!occluded(x, y) && !(a.mode === "inside" && a.visit.k !== "arch"))) drawPerson(x, y, hex(a.shirt), hex(a.hair), hex(a.skin), (st + a.id) & 1, Math.max(ai.a * Math.max(1, 0.3 / ai.rmA), 2 * DPR));
  }
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  // declutter: selected first, then from the top of the screen
  const placed = [], pins = [];
  vis.sort((p, q) => (q[0] === selected) - (p[0] === selected) || p[2] - q[2]);
  for (const v of vis) {
    const [a, x, y] = v;
    if (a !== selected && placed.some(([px, py]) => Math.abs(px - x) < 50 && Math.abs(py - y) < 56)) continue;
    placed.push([x, y]); pins.push(v);
  }
  pins.reverse();
  const big = view.z > 17, lift = street ? 16 : 6;
  for (const [a, x0, y0] of pins) {
    const x = Math.round(x0), y = Math.round(y0);
    if (a === selected) {
      const R = big ? 29 : 22, cy = y - lift - 30 - R;
      const pulse = 1 + 0.18 * Math.sin(performance.now() / 260);
      ctx.strokeStyle = "#f2a516"; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.ellipse(x, y, 9 * pulse, 5 * pulse, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = "rgba(242,165,22,0.35)"; ctx.lineWidth = 5; ctx.beginPath(); ctx.ellipse(x, y, 12 * pulse, 7 * pulse, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = "#f2a516"; ctx.fillRect(x - 1, cy + R, 2, y - cy - R - 4);
      ctx.fillStyle = "rgba(8,14,24,0.45)"; ctx.beginPath(); ctx.arc(x + 2, cy + 3, R + 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#6b4306"; ctx.beginPath(); ctx.arc(x, cy, R + 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#f6b52c"; ctx.beginPath(); ctx.arc(x, cy, R + 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#ffe08a"; ctx.beginPath(); ctx.arc(x - 1, cy - 1, R + 0.5, Math.PI * 0.9, Math.PI * 1.6); ctx.lineTo(x - 1, cy - 1); ctx.fill();
      ctx.save(); ctx.beginPath(); ctx.arc(x, cy, R - 0.5, 0, Math.PI * 2); ctx.clip();
      ctx.drawImage(a.ava, x - R - 3, cy - R - 2, 2 * R + 6, 2 * R + 6); ctx.restore();
      ctx.fillStyle = "#f6b52c"; ctx.beginPath(); ctx.moveTo(x - 6, cy + R + 1); ctx.lineTo(x + 6, cy + R + 1); ctx.lineTo(x, cy + R + 9); ctx.fill();
      const r = textBox(a.name, x, y - lift - 14, '600 14px "Pixelify Sans", ui-monospace, monospace', "#fff4dc", "#141e2e", "#f2a516");
      pinHits.push({ a, x0: x - R - 6, y0: cy - R - 6, x1: x + R + 6, y1: r[3] });
    } else {
      const S = big ? 42 : 30, bx = x - S / 2, by = y - lift - S - 8;
      ctx.fillStyle = "rgba(8,14,24,0.45)"; ctx.fillRect(bx + 1, by + 3, S + 6, S + 6);
      ctx.fillStyle = "#1a2232"; ctx.fillRect(bx - 3, by - 3, S + 6, S + 6);
      ctx.beginPath(); ctx.moveTo(x - 7, by + S + 2); ctx.lineTo(x + 7, by + S + 2); ctx.lineTo(x, by + S + 10); ctx.fill();
      ctx.fillStyle = "#f4f6fa"; ctx.fillRect(bx - 1, by - 1, S + 2, S + 2);
      ctx.beginPath(); ctx.moveTo(x - 5, by + S); ctx.lineTo(x + 5, by + S); ctx.lineTo(x, by + S + 7); ctx.fill();
      ctx.drawImage(a.ava, bx + 1, by + 1, S - 2, S - 2);
      ctx.fillStyle = "rgba(255,255,255,0.18)"; ctx.fillRect(bx + 1, by + 1, S - 2, 2);
      pinHits.push({ a, x0: bx - 4, y0: by - 4, x1: bx + S + 4, y1: by + S + 12 });
    }
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

/* ================= camera ================= */
function flyTo(tx, ty, tz, done) {
  const x0 = view.x, y0 = view.y, z0 = view.z;
  let dx = tx - x0; dx -= Math.round(dx);
  const dy = ty - y0, dist = Math.hypot(dx, dy);
  tz = Math.max(minZ, Math.min(ZMAX, tz));
  const fitZ = Math.log2(Math.min(W, H) / (256 * Math.max(dist, 1e-12))) - 0.6;
  const zm = Math.max(minZ, Math.min(z0, tz, fitZ));
  const a = Math.abs(z0 - zm), b = Math.abs(tz - zm);
  const f = (a + 0.3) / (a + b + 0.6);
  const N = 300, zs = new Float64Array(N + 1), ws = new Float64Array(N + 1);
  for (let i = 0; i <= N; i++) { const s = i / N; zs[i] = s < f ? z0 + (zm - z0) * (s / f) : zm + (tz - zm) * ((s - f) / (1 - f)); }
  for (let i = 1; i <= N; i++) ws[i] = ws[i - 1] + Math.pow(2, -(zs[i] + zs[i - 1]) / 2);
  for (let i = 0; i <= N; i++) ws[i] /= ws[N] || 1;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  anim = { t0: performance.now(), dur: reduce ? 1 : Math.min(8000, 900 + 420 * (a + b) + 600 * Math.min(1, dist * 40)), zs, ws, x0, y0, dx, dy, N, done };
}
function stepAnim(now) {
  if (!anim) return;
  let s = Math.min(1, (now - anim.t0) / anim.dur);
  const e = s < 0.5 ? 4 * s * s * s : 1 - Math.pow(-2 * s + 2, 3) / 2;
  const fi = e * anim.N, i = Math.min(anim.N - 1, Math.floor(fi)), fr = fi - i;
  view.z = anim.zs[i] + (anim.zs[i + 1] - anim.zs[i]) * fr;
  const w = anim.ws[i] + (anim.ws[i + 1] - anim.ws[i]) * fr;
  view.x = anim.x0 + anim.dx * w; view.y = anim.y0 + anim.dy * w;
  if (s >= 1) { const d = anim.done; anim = null; if (d) d(); }
}
function zoomAt(sx, sy, dz) {
  const s0 = worldPx();
  const wx = view.x + (sx - W / 2) / s0, wy = view.y + (sy - H / 2) / s0;
  view.z = Math.max(minZ, Math.min(ZMAX, view.z + dz));
  const s1 = worldPx();
  view.x = wx - (sx - W / 2) / s1; view.y = wy - (sy - H / 2) / s1;
}
function selectAgent(a, fly) {
  selected = a; follow = false;
  renderCard(true);
  if (fly && a) {
    const m = agentPos(a);
    flyTo(m[0] / C, m[1] / C, Math.max(view.z, 19.2), () => { follow = true; renderCard(true); });
  }
}

/* ================= UI ================= */
const LEVELS = [["Мир", 2.3], ["Регион", 8.6], ["Город", 14.8], ["Улица", 19.2]];
function levelIdx(z) { return z < 5 ? 0 : z < 11.8 ? 1 : z < 17.2 ? 2 : 3; }
/* zoom at which the whole compact city fits on screen */
function cityZoom(c) { const R = c.g.schema ? 1300 : c.g.R; return Math.max(12, Math.min(17.2, Math.log2(0.95 * Math.min(W, H) / (256 * 2.5 * R / (c.g.k * C))))); }
function renderCard(force) {
  const card = $("#card");
  if (!selected) { card.hidden = true; return; }
  const a = selected;
  card.hidden = false;
  if (force) {
    const big = $("#cAva"), g = big.getContext("2d"); g.imageSmoothingEnabled = false; g.clearRect(0, 0, 88, 88); g.drawImage(a.ava, 0, 0, 88, 88);
    $("#cName").textContent = a.name;
    $("#cMeta").textContent = `${a.age} ${plural(a.age, "год", "года", "лет")} · ${a.prof}`;
    $("#cCity").textContent = a.city.name;
    $("#cFollow").textContent = follow ? "Не следить" : "Следить";
    $("#cFollow").setAttribute("aria-pressed", follow ? "true" : "false");
  }
  $("#cAct").textContent = activityOf(a);
  const h = localHour(a.city.row[2]);
  $("#cTime").textContent = "Местное время " + fmtTime(h * 60);
  for (const [id, v] of [["bEnergy", a.energy], ["bFood", a.food], ["bMood", a.mood]]) $("#" + id).style.width = Math.round(v * 100) + "%";
}
function plural(n, a, b, c) { const m10 = n % 10, m100 = n % 100; if (m10 === 1 && m100 !== 11) return a; if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return b; return c; }
function fmtTime(min) { min = ((Math.floor(min) % 1440) + 1440) % 1440; return String(Math.floor(min / 60)).padStart(2, "0") + ":" + String(min % 60).padStart(2, "0"); }
function niceScale() {
  const lat = latOf(view.y), mpp = C * Math.cos(lat * Math.PI / 180) / worldPx();
  const target = mpp * 96; const p = Math.pow(10, Math.floor(Math.log10(target)));
  let n = p; for (const m of [1, 2, 5, 10]) if (m * p <= target) n = m * p;
  return [n / mpp, n >= 1000 ? (n / 1000).toLocaleString("ru-RU") + " км" : n + " м"];
}
let lastHud = 0;
function updateHud(now) {
  if (now - lastHud < 120) return;
  lastHud = now;
  const li = levelIdx(view.z);
  document.querySelectorAll(".ladder button").forEach((b, i) => b.classList.toggle("on", i === li));
  $("#lvl").textContent = LEVELS[li][0];
  const lat = latOf(view.y), lon = view.x * 360 - 180;
  $("#coord").textContent = `${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? "с. ш." : "ю. ш."}  ${Math.abs(lon).toFixed(2)}° ${lon >= 0 ? "в. д." : "з. д."}`;
  const [w, label] = niceScale();
  $("#scaleBar").style.width = Math.round(w) + "px"; $("#scaleLbl").textContent = label;
  $("#clock").textContent = fmtTime(localHour(lon) * 60);
  $("#zoomVal").textContent = "z " + view.z.toFixed(1);
  if (selected) renderCard(false);
}

/* ================= input ================= */
const ptrs = new Map();
let drag = null, pinch = null, downAt = null;
function hitTest(x, y) {
  for (let i = pinHits.length - 1; i >= 0; i--) { const h = pinHits[i]; if (x >= h.x0 && x <= h.x1 && y >= h.y0 && y <= h.y1) return { agent: h.a }; }
  for (const l of labelHits) { const r = l.rect; if (x >= r[0] && x <= r[2] && y >= r[1] && y <= r[3]) return { city: l.city }; }
  return null;
}
function bindInput() {
  cv.addEventListener("pointerdown", (e) => {
    cv.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, [e.offsetX, e.offsetY]);
    anim = null;
    if (ptrs.size === 1) { drag = [e.offsetX, e.offsetY]; downAt = [e.offsetX, e.offsetY, performance.now()]; }
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), z: view.z }; drag = null; downAt = null; }
  });
  cv.addEventListener("pointermove", (e) => {
    if (!ptrs.has(e.pointerId)) { const h = hitTest(e.offsetX, e.offsetY); cv.style.cursor = h ? "pointer" : "grab"; return; }
    ptrs.set(e.pointerId, [e.offsetX, e.offsetY]);
    if (pinch && ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      const target = pinch.z + Math.log2(d / pinch.d);
      zoomAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, target - view.z);
    } else if (drag) {
      const s = worldPx();
      if (downAt && Math.hypot(e.offsetX - downAt[0], e.offsetY - downAt[1]) > 5) { if (follow) { follow = false; renderCard(true); } downAt = null; cv.style.cursor = "grabbing"; hideHint(); }
      view.x -= (e.offsetX - drag[0]) / s; view.y -= (e.offsetY - drag[1]) / s;
      drag = [e.offsetX, e.offsetY];
    }
  });
  const up = (e) => {
    ptrs.delete(e.pointerId);
    if (ptrs.size < 2) pinch = null;
    if (downAt && performance.now() - downAt[2] < 500) {
      const h = hitTest(e.offsetX, e.offsetY);
      if (h && h.agent) selectAgent(h.agent, false);
      else if (h && h.city) flyTo(h.city.X, h.city.Y, cityZoom(h.city));
    }
    downAt = null; drag = ptrs.size === 1 ? [...ptrs.values()][0] : null;
    cv.style.cursor = "grab";
  };
  cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
  cv.addEventListener("wheel", (e) => {
    e.preventDefault(); anim = null; hideHint();
    let d = e.deltaY * (e.deltaMode === 1 ? 33 : 1);
    zoomAt(e.offsetX, e.offsetY, -d * (e.ctrlKey ? 0.012 : 0.0024));
  }, { passive: false });
  cv.addEventListener("dblclick", (e) => { const s0 = worldPx(); flyTo(view.x + (e.offsetX - W / 2) / s0, view.y + (e.offsetY - H / 2) / s0, view.z + 1.6); });
  window.addEventListener("keydown", (e) => {
    if (e.target.closest && e.target.closest("button,input")) return;
    if (e.key === "+" || e.key === "=") zoomAt(W / 2, H / 2, 0.5);
    else if (e.key === "-") zoomAt(W / 2, H / 2, -0.5);
    else if (e.key.startsWith("Arrow")) { const s = worldPx(), st = 120 / s; follow = false; if (e.key === "ArrowLeft") view.x -= st; if (e.key === "ArrowRight") view.x += st; if (e.key === "ArrowUp") view.y -= st; if (e.key === "ArrowDown") view.y += st; }
    else if (e.key === "Escape") selectAgent(null);
  });
  $("#zin").onclick = () => flyTo(view.x, view.y, view.z + 1);
  $("#zout").onclick = () => flyTo(view.x, view.y, view.z - 1);
  document.querySelectorAll(".ladder button").forEach((b, i) => { b.onclick = () => flyTo(view.x, view.y, LEVELS[i][1]); });
  $("#cClose").onclick = () => selectAgent(null);
  $("#cFollow").onclick = () => { follow = !follow; if (follow && selected) { const m = agentPos(selected); flyTo(m[0] / C, m[1] / C, Math.max(view.z, 18.6), () => { follow = true; }); } renderCard(true); };
  $("#cGo").onclick = () => selected && selectAgent(selected, true);
  $("#tour").onclick = () => tour();
  $("#rand").onclick = () => { const a = agents[1 + Math.floor(Math.random() * (agents.length - 1))]; selectAgent(a, true); };
}
function hideHint() { const h = $(".hint"); if (h) h.hidden = true; }
function tour() {
  hideHint();
  const d = agents.find((a) => a.star) || agents[0];
  selected = d; follow = false; renderCard(true);
  const go = () => { const m = agentPos(d); flyTo(m[0] / C, m[1] / C, 19.2, () => { follow = true; renderCard(true); }); };
  if (view.z > 4) flyTo(view.x, view.y, 2.4, go); else go();
}
function buildJumps() {
  const nav = $("#jumps");
  const list = ["Москва", "Париж", "Нью-Йорк", "Стамбул", "Кишинёв", "Лондон", "Рим", "Каир", "Токио"];
  for (const n of list) {
    const c = cities.find((q) => q.name === n); if (!c) continue;
    const b = document.createElement("button"); b.type = "button"; b.textContent = n;
    b.onclick = () => { follow = false; flyTo(c.X, c.Y, cityZoom(c)); };
    nav.appendChild(b);
  }
  for (const d of BAKED) {
    const b = document.createElement("button"); b.type = "button"; b.textContent = d.name + " · ИИ"; b.title = "Район, расписанный открытой моделью Z-Image-Turbo поверх нашей раскладки";
    b.onclick = () => { follow = false; flyTo((d.X0 + d.X1) / 2, (d.Y0 + d.Y1) / 2, 19.2); };
    nav.appendChild(b);
  }
}

/* ================= loop ================= */
let lastT = performance.now(), simT = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - lastT) / 1000); lastT = now; simT += dt; frameNo++;
  simMin += dt * 2; // 1 real second = 2 sim minutes
  stepAnim(now);
  stepAgents(dt);
  for (const a of agents) { a.energy = Math.max(0.05, a.energy - dt * 0.0015); a.food = Math.max(0.05, a.food - dt * 0.002); a.mood = Math.min(1, Math.max(0.1, a.mood + (Math.random() - 0.5) * dt * 0.02)); if (a.food < 0.2 && Math.random() < dt * 0.05) a.food = 0.9; if (a.energy < 0.2 && Math.random() < dt * 0.03) a.energy = 0.95; }
  if (follow && selected && !anim) { const m = agentPos(selected); view.x = m[0] / C; view.y = m[1] / C; }
  clampView();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#15376a"; ctx.fillRect(0, 0, cv.width, cv.height);
  const wanted = [];
  drawTiles(wanted);
  dispatch(wanted);
  drawBaked();
  drawBoats(simT);
  drawCars(simT);
  drawCrowd(simT);
  drawAgents();
  drawClouds(simT);
  drawLabels();
  updateHud(now);
  requestAnimationFrame(frame);
}

/* sprite kit generated offline (tools/ai): decoded once here and handed to the generators as raw RGBA */
let KIT = null;
async function loadKit() {
  try {
    const j = JSON.parse($("#spr").textContent);
    if (!j || !j.png) return null;
    const bin = atob(j.png), u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const im = await createImageBitmap(new Blob([u8], { type: j.mime || "image/png" }));
    const c = document.createElement("canvas"); c.width = j.w; c.height = j.h;
    const g = c.getContext("2d"); g.drawImage(im, 0, 0);
    KIT = { w: j.w, h: j.h, g: j.g, img: c };
    return { w: j.w, h: j.h, g: j.g, px: g.getImageData(0, 0, j.w, j.h).data };
  } catch (e) { console.warn("sprite kit unavailable", e); return null; }
}

/* ================= boot ================= */
async function boot() {
  const status = $("#loadMsg");
  const say = async (t) => { (window.__bootLog = window.__bootLog || []).push([Math.round(performance.now()), t]); status.textContent = t; await tick(); };
  resize();
  await say("Рисуем береговые линии…");
  const topo = JSON.parse($("#land").textContent);
  const polys = decodeTopo(topo);
  const MS = 4096;
  let mask = buildMask(polys, MS);
  await say("Сглаживаем побережья…");
  const blurBase = downsample(mask, MS, 8);
  mask = boxBlur(mask, MS, 2);
  let blur = boxBlur(blurBase, 512, 5); blur = boxBlur(blur, 512, 5);
  await say("Поднимаем горы и пустыни…");
  const CSZ = 1024;
  const cd = climateLayer(CSZ, drawEllipses(DESERTS));
  const cm = climateLayer(CSZ, drawRanges);
  const ci = climateLayer(CSZ, drawEllipses(ICE));
  cities = CITY_ROWS.map((row, i) => {
    const [name, lat, lon, pop] = row;
    const X = (lon + 180) / 360, Y = mercY(lat), k = Math.cos(lat * Math.PI / 180);
    const r = 6500 * Math.pow(pop, 0.42);
    return { name, row, pop, X, Y, mx: X * C, my: Y * C, k, ru: i < 21 || name === "Кишинёв" };
  });
  citiesByPop = cities.slice().sort((a, b) => b.pop - a.pop);
  await say("Прокладываем дороги…");
  const maskAt = (lat, lon) => { const X = (lon + 180) / 360, Y = mercY(lat); const x = Math.floor(X * MS) % MS, y = Math.min(MS - 1, Math.floor(Y * MS)); return mask[y * MS + x] / 255; };
  const roads = [], seen = new Set();
  const hav = (a, b) => { const R = 6371, p1 = a.row[1] * Math.PI / 180, p2 = b.row[1] * Math.PI / 180, dp = p2 - p1, dl = (b.row[2] - a.row[2]) * Math.PI / 180; const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
  cities.forEach((a, i) => {
    const near = cities.map((b, j) => [j, hav(a, b)]).filter(([j, d]) => j !== i && d < 1150).sort((p, q) => p[1] - q[1]).slice(0, 3);
    for (const [j] of near) {
      const kk = Math.min(i, j) + "-" + Math.max(i, j); if (seen.has(kk)) continue; seen.add(kk);
      const b = cities[j];
      if (Math.abs(a.row[2] - b.row[2]) > 180) continue;
      let ok = true;
      for (let s = 1; s < 30; s++) { const t = s / 30; if (maskAt(a.row[1] + (b.row[1] - a.row[1]) * t, a.row[2] + (b.row[2] - a.row[2]) * t) < 0.3) { ok = false; break; } }
      if (!ok) continue;
      const dx = b.mx - a.mx, dy = b.my - a.my;
      roads.push({ ax: a.mx, ay: a.my, dx, dy, il2: 1 / (dx * dx + dy * dy), len: Math.hypot(dx, dy), minx: Math.min(a.mx, b.mx), maxx: Math.max(a.mx, b.mx), miny: Math.min(a.my, b.my), maxy: Math.max(a.my, b.my) });
    }
  });
  const cityData = cities.map((c, i) => ({ mx: c.mx, my: c.my, pop: c.pop, sty: STY[regionOf(c)], seed: i * 7919 + 17, lm: LMK[c.name] || "" }));
  await say("Распаковываем набор спрайтов…");
  const spr = await loadKit();
  (window.__bootLog = window.__bootLog || []).push([Math.round(performance.now()), "kit " + (spr ? spr.w + "x" + spr.h : "none")]);
  const data = { mask, ms: MS, blur, bs: 512, cd, cm, ci, cs: CSZ, cities: cityData, roads, spr };
  G.init(data);
  window.__bootLog.push([Math.round(performance.now()), "init"]);
  const gc = G.cities();
  cities.forEach((c, i) => { c.g = gc[i]; c.lms = G.landmarks(c.g); });
  await say("Запускаем генераторы…");
  try {
    const src = $("#gen").textContent + "\nself.onmessage=function(e){var m=e.data;if(m.t==='init'){GEN.init(m.d);self.postMessage({t:'ready'});}else if(m.t==='tile'){var r=GEN.renderTile(m.z,m.x,m.y);self.postMessage({t:'tile',id:m.id,buf:r.img.buffer,msk:r.msk.buffer},[r.img.buffer,r.msk.buffer]);}};";
    const url = URL.createObjectURL(new Blob([src], { type: "text/javascript" }));
    const n = Math.max(2, Math.min(6, (navigator.hardwareConcurrency || 4) - 1));
    await Promise.all(Array.from({ length: n }, () => new Promise((res, rej) => {
      const w = new Worker(url);
      const to = setTimeout(() => rej(new Error("worker timeout")), 15000);
      w.onerror = (e) => { clearTimeout(to); rej(e); };
      w.onmessage = (e) => {
        if (e.data.t === "ready") { clearTimeout(to); workers.push(w); freeWorkers.push(w); w.onmessage = (ev) => { if (ev.data.t === "tile") { freeWorkers.push(w); onTile(ev.data.id, ev.data.buf, ev.data.msk); refill(); } }; res(); }
      };
      w.postMessage({ t: "init", d: data });
    })));
  } catch (err) {
    console.warn("Workers unavailable, rendering on main thread", err);
    workers.forEach((w) => w.terminate()); workers = []; freeWorkers = []; useMain = true;
  }
  await say("Заселяем города…");
  await tick();
  setupClouds();
  spawnAgents();
  $("#pop").textContent = agents.length.toLocaleString("ru-RU");
  $("#ncities").textContent = cities.length;
  buildJumps();
  bindInput();
  try { await document.fonts.load('600 13px "Pixelify Sans"'); } catch (e) {}
  $("#loading").hidden = true;
  (window.__bootLog = window.__bootLog || []).push([Math.round(performance.now()), "ready", useMain ? "main-thread" : workers.length + " workers"]);
  requestAnimationFrame(frame);
}
window.addEventListener("resize", resize);
if (location.hostname === "localhost") window.__pw = { setView: (lat, lon, z) => { anim = null; follow = false; view.x = (lon + 180) / 360; view.y = mercY(lat); view.z = z; }, stats: () => ({ cache: cache.size, inflight: inflight.size }), dbg: () => { const a = agents[0]; return { z: view.z, n: agents.length, pos: agentPos(a), axis: a.axis, line: a.line, target: a.target, p: a.pos, view: [view.x, view.y] }; } };
boot();
})();
