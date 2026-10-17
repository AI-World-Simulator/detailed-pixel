// How much of the walkable ground (streets, sidewalks, yards) is hidden behind buildings for an orthographic camera
// looking north and pitched PITCH degrees below the horizon, on the real schema cities from the generator.
//   node tools/ai/lab/occlusion.js [city=moscow,paris,nyc,istanbul] [out.json]
// Geometry: a ground point P is hidden if some building lies south of it (towards the camera) at horizontal distance s with
// roof height > PERSON + s*tan(pitch)  (PERSON = 1.7 m: the whole person is hidden, not just the feet).
// The engine's current oblique projection (ground unscaled, heights x0.6) hides 0.6*h of ground behind a building:
// the same as a real camera with tan(pitch) = 1/0.6, pitch ~59 deg; it is reported as "engine".
const fs = require("fs"), vm = require("vm"), path = require("path");
const ROOT = path.resolve(__dirname, "../../..");
const code = fs.readFileSync(ROOT + "/src/schemas.js", "utf8") + "\n" + fs.readFileSync(ROOT + "/src/gen.js", "utf8").split("/*STREET*/").join(fs.readFileSync(ROOT + "/src/street.js", "utf8"));
const sb = { self: {}, console, Math, Date, Float32Array, Float64Array, Int32Array, Uint8Array, Uint8ClampedArray, Uint16Array, Int16Array, Map, Set, JSON, Array, Object };
sb.self = sb; vm.createContext(sb); vm.runInContext(code, sb);
const G = sb.GEN, C = G.C;
const mercY = (la) => { const l = la * Math.PI / 180; return (1 - Math.log(Math.tan(Math.PI / 4 + l / 2)) / Math.PI) / 2; };
const CITY = { moscow: [55.756, 37.617, 12.6, 1], paris: [48.857, 2.352, 11, 0], nyc: [40.71, -74.0, 19, 2], istanbul: [41.01, 28.97, 15, 4] };
const want = (process.argv[2] || "moscow,paris,nyc,istanbul").split(",");
const S = 64, full = new Uint8Array(S * S).fill(255), zero = new Uint8Array(S * S);
G.init({ spr: null, mask: full, ms: S, blur: full, bs: S, cd: zero, cm: zero, ci: zero, cs: S,
  cities: want.map((k, i) => ({ mx: (CITY[k][1] + 180) / 360 * C, my: mercY(CITY[k][0]) * C, pop: CITY[k][2], sty: CITY[k][3], seed: i * 7919 + 17, lm: k })), roads: [] });
const PERSON = 1.7, CELL = 1.0, WIN = 900;                          // 1 m raster over a 900 x 900 m window around the centre
const PITCHES = [25, 30, 35, 40, 45, 50, 55, 60, 70];
const out = {};
for (const c of G.cities()) {
  if (!c.schema) continue;
  const fac = G.sgFaces(c);                                           // forces sgBuild
  const list = c.sb.list.filter((o) => o.k === 3 && o.p && o.h > 0);
  const N = Math.round(WIN / CELL), x0 = -WIN / 2, y0 = -WIN / 2;
  const H = new Float32Array(N * N);                                // roof height per cell (0 = ground)
  for (const o of list) {
    const top = (o.z0 || 0) + o.h + (o.roof ? 2.5 : 0.5);            // pitched roofs add a ridge
    const bb = o.bb, ia = Math.max(0, Math.floor((bb[0] - x0) / CELL)), ib = Math.min(N - 1, Math.ceil((bb[2] - x0) / CELL));
    const ja = Math.max(0, Math.floor((bb[1] - y0) / CELL)), jb = Math.min(N - 1, Math.ceil((bb[3] - y0) / CELL));
    for (let j = ja; j <= jb; j++) for (let i = ia; i <= ib; i++) {
      const x = x0 + (i + 0.5) * CELL, y = y0 + (j + 0.5) * CELL;
      let ins = false; const p = o.p, n = o.n;
      for (let a = 0, b = n - 1; a < n; b = a++) { const ya = p[2 * a + 1], yb = p[2 * b + 1]; if ((ya > y) !== (yb > y) && x < p[2 * a] + (y - ya) / (yb - ya) * (p[2 * b] - p[2 * a])) ins = !ins; }
      if (ins && top > H[j * N + i]) H[j * N + i] = top;
    }
  }
  if (process.env.DUMP_DIR) {                                         // height raster (Float32, N x N, 1 m cells, row = y) for renderers
    fs.writeFileSync(`${process.env.DUMP_DIR}/heights_${c.lm}_${N}.f32`, Buffer.from(H.buffer));
  }
  let ground = 0; for (let k = 0; k < N * N; k++) if (H[k] === 0) ground++;
  const res = { buildings: list.length, ground_share: +(ground / (N * N)).toFixed(3), hidden: {} };
  const runs = PITCHES.map((p) => [p + "°", Math.tan(p * Math.PI / 180)]).concat([["engine", 1 / 0.6]]);
  for (const [name, tn] of runs) {
    let hid = 0;
    for (let i = 0; i < N; i++) {                                     // sweep each column from south (camera side, large y) to north
      let lim = 1e9;                                                  // a building at y_b hides ground in (y_b - (h - PERSON)/tan, y_b)
      for (let j = N - 1; j >= 0; j--) {
        const h = H[j * N + i], y = y0 + (j + 0.5) * CELL;
        if (h > 0) { if (h > PERSON) lim = Math.min(lim, y - (h - PERSON) / tn); continue; }
        if (y > lim) hid++;
      }
    }
    res.hidden[name] = +(hid / ground).toFixed(3);
  }
  out[c.lm] = res;
  console.log(c.lm.padEnd(9), "buildings", String(list.length).padStart(5), "| ground", res.ground_share, "| hidden:", Object.entries(res.hidden).map(([k, v]) => `${k} ${(v * 100).toFixed(0)}%`).join("  "));
}
if (process.argv[3]) fs.writeFileSync(process.argv[3], JSON.stringify(out, null, 1));
