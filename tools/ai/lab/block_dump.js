// Dump a window of a schema city from the generator for the block micro-map: buildings (rect, height, roof, colours, bays, doors),
// street edges with carriageway / sidewalk widths, block faces, street props and trees.
//   node tools/ai/lab/block_dump.js CITY CX CY HALF OUT.json      e.g. moscow -107 -131 130 block_raw.json
// Coordinates are the city's local metres (x east, y south), the same frame as occlusion.js.
const fs = require("fs"), vm = require("vm"), path = require("path");
const ROOT = path.resolve(__dirname, "../../..");
const code = (fs.readFileSync(ROOT + "/src/schemas.js", "utf8") + "\n" + fs.readFileSync(ROOT + "/src/gen.js", "utf8").split("/*STREET*/").join(fs.readFileSync(ROOT + "/src/street.js", "utf8")))
  .replace("sgEdgesIn: function", "sgTrees: sgTrees, sgEdgesIn: function");          // street trees are not exported by GEN
const sb = { self: {}, console, Math, Date, Float32Array, Float64Array, Int32Array, Uint8Array, Uint8ClampedArray, Uint16Array, Int16Array, Map, Set, JSON, Array, Object };
sb.self = sb; vm.createContext(sb); vm.runInContext(code, sb);
const G = sb.GEN, C = G.C;
const mercY = (la) => { const l = la * Math.PI / 180; return (1 - Math.log(Math.tan(Math.PI / 4 + l / 2)) / Math.PI) / 2; };
const CITY = { moscow: [55.756, 37.617, 12.6, 1], paris: [48.857, 2.352, 11, 0], nyc: [40.71, -74.0, 19, 2], istanbul: [41.01, 28.97, 15, 4] };
const [name, CX, CY, HW, OUT] = [process.argv[2], +process.argv[3], +process.argv[4], +process.argv[5], process.argv[6]];
const S = 64, full = new Uint8Array(S * S).fill(255), zero = new Uint8Array(S * S);
G.init({ spr: null, mask: full, ms: S, blur: full, bs: S, cd: zero, cm: zero, ci: zero, cs: S,
  cities: [{ mx: (CITY[name][1] + 180) / 360 * C, my: mercY(CITY[name][0]) * C, pop: CITY[name][2], sty: CITY[name][3], seed: 17, lm: name }], roads: [] });
const c = G.cities().find((q) => q.schema); G.sgFaces(c); const g = c.sg, E = g.E;
const inWin = (x, y, m) => Math.abs(x - CX) < HW + m && Math.abs(y - CY) < HW + m;
const bld = c.sb.list.filter((o) => o.k === 3 && o.p && o.h > 0 && o.rect && inWin(o.rect.cx, o.rect.cy, 30)).map((o) => ({
  id: o.id, p: Array.from(o.p.slice(0, 2 * o.n)), rect: o.rect, z0: o.z0 || 0, h: o.h, roof: o.roof, wc: o.wc, rc: o.rc, win: o.win, trim: o.trim, aw: o.aw,
  bays: o.bays ? Object.fromEntries(Object.entries(o.bays).map(([k, b]) => [k, { n: b.n, w: b.w, t: b.t }])) : null,
  doors: (o.doors || []).map((d) => ({ x: d.x, y: d.y, nx: d.nx, ny: d.ny, k: d.k, e: d.e })) }));
const edges = [];
for (let e = 0; e < E.a.length; e++) {
  const a = E.a[e], b = E.b[e], xa = g.nx[a], ya = g.ny[a], xb = g.nx[b], yb = g.ny[b];
  if (!inWin((xa + xb) / 2, (ya + yb) / 2, 120)) continue;
  edges.push({ e, xa, ya, xb, yb, cls: E.cls[e], cw: G.EC[E.cls[e]][0], sw: G.EC[E.cls[e]][1] });
}
const faces = (g.faces || []).filter((F) => inWin(F.cx, F.cy, 150)).map((F) => ({ id: F.id, kind: F.kind, gd: F.gd || 0, cx: F.cx, cy: F.cy, px: Array.from(Object.values(F.px)), py: Array.from(Object.values(F.py)) }));
const props = [], trees = [];
for (let j = Math.floor((CY - HW) / 64); j <= Math.floor((CY + HW) / 64); j++) for (let i = Math.floor((CX - HW) / 64); i <= Math.floor((CX + HW) / 64); i++) {
  for (const p of G.sgProps(c, i, j)) props.push({ t: p.t, x: p.x, y: p.y, id: p.id });
  for (const t of G.sgTrees(c, i, j)) trees.push(Object.fromEntries(Object.entries(t).filter(([, v]) => typeof v !== "object")));
}
fs.writeFileSync(OUT, JSON.stringify({ city: name, cx: CX, cy: CY, hw: HW, buildings: bld, edges, faces, props, trees }));
console.log(`${name}: buildings ${bld.length}, edges ${edges.length}, faces ${faces.length}, props ${props.length}, trees ${trees.length} -> ${OUT}`);
