// node render.js <gen.js> <out.bmp> <lat> <lon> <z> <tilesW> <tilesH> [cityName]
const fs = require("fs");
const [, , genPath, outPath, lat, lon, z, tw, th] = process.argv;
const G = require(genPath).GEN;
const C = G.C, TS = G.TS;
const mercY = (la) => { const l = la * Math.PI / 180; return (1 - Math.log(Math.tan(Math.PI / 4 + l / 2)) / Math.PI) / 2; };
const CITY = [["Москва", 55.756, 37.617, 12.6, 1, "moscow"], ["Париж", 48.857, 2.352, 11, 0, "paris"], ["Кишинёв", 47.0105, 28.8575, 0.7, 0, "chisinau"],
  ["Нью-Йорк", 40.71, -74.0, 19, 2, "nyc"], ["Каир", 30.04, 31.24, 20, 4, "cairo"], ["Лондон", 51.507, -0.128, 9.5, 0, "london"], ["Рим", 41.9, 12.5, 4.3, 0, "rome"],
  ["Пекин", 39.9, 116.4, 21, 3, "beijing"], ["Дубай", 25.2, 55.27, 3.5, 4, "dubai"], ["Токио", 35.68, 139.69, 37, 3, "tokyo"], ["Стамбул", 41.01, 28.97, 15, 4, "istanbul"],
  ["Берлин", 52.52, 13.405, 3.6, 0, "berlin"], ["Санкт-Петербург", 59.939, 30.316, 5.4, 1, "spb"], ["Вашингтон", 38.9, -77.04, 6.3, 2, "washington"], ["Барселона", 41.385, 2.173, 5.5, 0, "barcelona"],
  ["Киев", 50.45, 30.52, 3.0, 1, "kyiv"], ["Афины", 37.98, 23.73, 3.1, 0, "athens"], ["Дели", 28.61, 77.21, 30, 4, "delhi"], ["Рио", -22.91, -43.17, 13.5, 5, "rio"]];
const S = 64;
const full = new Uint8Array(S * S).fill(255), zero = new Uint8Array(S * S);
let spr = null;
if (process.env.SPR) { const j = JSON.parse(fs.readFileSync(process.env.SPR + ".json", "utf8")); spr = { w: j.w, h: j.h, g: j.g, px: new Uint8Array(fs.readFileSync(process.env.SPR + ".rgba")) }; }
G.init({ spr, mask: full, ms: S, blur: full, bs: S, cd: zero, cm: zero, ci: zero, cs: S,
  cities: CITY.map((r, i) => ({ mx: (r[2] + 180) / 360 * C, my: mercY(r[1]) * C, pop: r[3], sty: r[4], seed: i * 7919 + 17, lm: r[5] })), roads: [] });
const Z = +z, n = 2 ** Z, X = (+lon + 180) / 360 * n, Y = mercY(+lat) * n;
const TW = +tw, TH = +th, x0 = process.env.TX0 ? +process.env.TX0 : Math.floor(X - TW / 2), y0 = process.env.TY0 ? +process.env.TY0 : Math.floor(Y - TH / 2);
console.log('origin', Z, x0, y0);
const W = TW * TS, H = TH * TS, img = Buffer.alloc(W * H * 3);
let t0 = Date.now();
for (let j = 0; j < TH; j++) for (let i = 0; i < TW; i++) {
  const r = G.renderTile(Z, x0 + i, y0 + j);
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const s = (y * TS + x) * 4, d = ((j * TS + y) * W + i * TS + x) * 3;
    img[d] = r.img[s]; img[d + 1] = r.img[s + 1]; img[d + 2] = r.img[s + 2];
  }
}
console.log("ms/tile", ((Date.now() - t0) / (TW * TH)).toFixed(1));
// BMP 24-bit, bottom-up
const row = (W * 3 + 3) & ~3, bmp = Buffer.alloc(54 + row * H);
bmp.write("BM"); bmp.writeUInt32LE(54 + row * H, 2); bmp.writeUInt32LE(54, 10); bmp.writeUInt32LE(40, 14);
bmp.writeInt32LE(W, 18); bmp.writeInt32LE(H, 22); bmp.writeUInt16LE(1, 26); bmp.writeUInt16LE(24, 28); bmp.writeUInt32LE(row * H, 34);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const s = (y * W + x) * 3, d = 54 + (H - 1 - y) * row + x * 3; bmp[d] = img[s + 2]; bmp[d + 1] = img[s + 1]; bmp[d + 2] = img[s]; }
fs.writeFileSync(outPath, bmp);
