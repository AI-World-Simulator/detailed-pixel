
/* ---------- street renderer: 2.5D heightfield ray caster ----------
   Street-level tiles are rendered from a height field instead of painted object by object:
   buildings, roofs, rooftop props, trees and landmark parts are rasterised as heights (texels) with an owner id;
   then every tile column is scanned from the viewer (south) to the north like a voxel-space renderer,
   so roofs, south facades, occlusion, slope lighting, cast shadows and ambient occlusion all come from one field.
   Projection: screen row = y - h * STF (oblique, close to top-down). Sun from the north-west: a point is lit
   if the field never rises above the ray (x - SUNA t, y - SUNB t, z + t). */
var STF = 0.42, SUNA = 0.62, SUNB = 0.5, ST_RM = 20;
var ST = { ht: null, hs: null, mat: null, bh: null, tmp: null, sh: null, sid: null, cap: 0, objs: [], tl: [], W: 0, H: 0, mxL: 0, myT: 0 };
function stEnsure(n) {
  if (ST.cap >= n) return;
  ST.cap = n; ST.ht = new Float32Array(n); ST.hs = new Float32Array(n); ST.mat = new Int32Array(n); ST.bh = new Float32Array(n); ST.tmp = new Float32Array(n);
}
var STSH = new Float32Array(TS * TS), STSID = new Int32Array(TS * TS), STKIND = new Uint8Array(TS * TS), STGND = new Int32Array(TS * TS), STOWN = new Int32Array(TS * TS), STHT = new Float32Array(TS * TS), STROW = new Float32Array(TS * TS);

/* --- palettes tuned to the reference: warm, slightly desaturated --- */
var SR_TERRA = [0xb8573f, 0xc0603f, 0xa94c36, 0xc96d4b, 0xb4614a, 0x9f4a35];
var SR_SLATE = [0x8b8f98, 0x7d828c, 0x969aa2, 0x6f7480];
var SR_FLAT = [0xb9b2a5, 0xaaa69f, 0xc4bcae, 0xa39d93, 0xbfb6a4, 0x9d9a95];
var SR_WALL = [0xc9a679, 0xd2ae74, 0xbf9a6e, 0xd8c3a0, 0xb7845e, 0xcfa98a, 0xc2b195, 0xa96b4f];
function stPick(a, h) { return a[(h * a.length) | 0]; }

/* --- object collection for the region (local metres per city) --- */
function stAdd(type, o, c, sc, ax, ay) { ST.objs.push({ t: type, o: o, c: c, sc: sc, ax: ax, ay: ay }); return ST.objs.length - 1; }
function stCollect(c, mpp, ox, oy, rx0, ry0, rx1, ry1, mode) {
  // rx/ry: region bounds in tile texels; convert to local metres of this city
  var sc = 1 / (c.k * mpp), ax = (c.mx - ox) / mpp, ay = (c.my - oy) / mpp;
  var lx0 = (rx0 - ax) / sc, lx1 = (rx1 - ax) / sc, ly0 = (ry0 - ay) / sc, ly1 = (ry1 - ay) / sc, i, j, q, o, L;
  var seen = new Set();
  var addList = function (L) {
    for (var q = 0; q < L.length; q++) {
      var o = L[q];
      if (mode === 1 && o.k !== 1) continue;
      if (o.k === 0 || o.k === 3) { var bb = o.k === 0 ? [o.x0, o.y0, o.x1, o.y1] : o.bb; if (bb[2] < lx0 || bb[0] > lx1 || bb[3] < ly0 || bb[1] > ly1) continue; stAdd(1, o, c, sc, ax, ay); }
      else if (o.k === 1) { if (o.x + o.r < lx0 || o.x - o.r > lx1 || o.y + o.r < ly0 || o.y - o.r > ly1) continue; if (mode === 1) { if (SPR.tr) ST.tl.push({ o: o, sc: sc, ax: ax, ay: ay }); } else stAdd(2, o, c, sc, ax, ay); }
      else if (o.k === 2) { var b2 = o.bb; if (b2[2] < lx0 || b2[0] > lx1 || b2[3] < ly0 || b2[1] > ly1) continue; stAdd(3, o, c, sc, ax, ay); }
    }
  };
  if (c.schema) {
    var sb = sgBuild(c);
    if (mode !== 1) for (j = Math.floor(ly0 / 128); j <= Math.floor(ly1 / 128); j++) for (i = Math.floor(lx0 / 128); i <= Math.floor(lx1 / 128); i++) {
      L = sb.B.get(i * 65536 + j); if (!L) continue;
      for (q = 0; q < L.length; q++) { if (seen.has(L[q])) continue; seen.add(L[q]); TMP1[0] = sb.list[L[q]]; addList(TMP1); }
    }
    for (j = Math.floor(ly0 / 64); j <= Math.floor(ly1 / 64); j++) for (i = Math.floor(lx0 / 64); i <= Math.floor(lx1 / 64); i++) {
      addList(sgTrees(c, i, j));
      if (mode === 1 && SPR.pr) { var PL = sgProps(c, i, j); for (q = 0; q < PL.length; q++) { o = PL[q]; if (o.x > lx0 - 4 && o.x < lx1 + 4 && o.y > ly0 - 4 && o.y < ly1 + 8) ST.tl.push({ o: o, sc: sc, ax: ax, ay: ay }); } }
    }
    for (q = 0; q < c.lms.length && mode !== 1; q++) {
      var P = c.lms[q], A = P.A;
      if (A.X1 < lx0 || A.X0 > lx1 || A.Y1 < ly0 || A.Y0 > ly1) continue;
      if (!P.lo) { P.lo = []; LB = P.lo; LC = c; LS = P.id * 7919 + (c.seed | 0); lmBuild(P, A, c); LB = null; }
      addList(P.lo);
    }
  } else {
    var lim = Math.ceil(2.2 * c.R / Math.min(c.PX, c.PY)) + (c.lmFar ? 12 : 1);
    var bi0 = Math.max(-lim, blockIx(c, lx0)), bi1 = Math.min(lim, blockIx(c, lx1)), bj0 = Math.max(-lim, blockJy(c, ly0)), bj1 = Math.min(lim, blockJy(c, ly1));
    for (j = bj0; j <= bj1; j++) for (i = bi0; i <= bi1; i++) {
      var b = cblock(c, i, j);
      if (!b) continue;
      if (b.L) { if (seen.has(b.L)) continue; seen.add(b.L); }
      addList(layout(c, b));
    }
  }
}
/* rooftop clutter for flat roofs of polygon buildings (generated once per building) */
function stProps(o) {
  if (o._props) return o._props;
  var P = [], n = o.n, p = o.p, cx = 0, cy = 0, i;
  for (i = 0; i < n; i++) { cx += p[2 * i]; cy += p[2 * i + 1]; }
  cx /= n; cy /= n;
  var area = polyArea(p), cnt = Math.min(16, 2 + Math.floor(area / 45)), s = o.id;
  var ux = o.rect ? o.rect.ux : 1, uy = o.rect ? o.rect.uy : 0;
  for (i = 0; i < cnt * 3 && P.length < cnt; i++) {
    var r = hh(i, s, 31), w = r < 0.5 ? 1.2 + hh(i, s, 32) * 1.2 : r < 0.75 ? 0.8 : 2.2 + hh(i, s, 33) * 2, d = r < 0.5 ? 0.9 + hh(i, s, 34) * 0.8 : r < 0.75 ? 0.8 : 1.4 + hh(i, s, 35);
    var x = cx + (hh(i, s, 36) - 0.5) * (o.bb[2] - o.bb[0]) * 0.8, y = cy + (hh(i, s, 37) - 0.5) * (o.bb[3] - o.bb[1]) * 0.8;
    var c1 = [x - ux * w / 2 + uy * d / 2, y - uy * w / 2 - ux * d / 2], c2 = [x + ux * w / 2 - uy * d / 2, y + uy * w / 2 + ux * d / 2];
    if (!inPoly(p, x, y) || !inPoly(p, c1[0], c1[1]) || !inPoly(p, c2[0], c2[1])) continue;
    var ok = true;
    for (var q = 0; q < P.length; q++) if (Math.abs(P[q].x - x) < (P[q].w + w) / 2 + 0.6 && Math.abs(P[q].y - y) < (P[q].d + d) / 2 + 0.6) { ok = false; break; }
    if (!ok) continue;
    P.push({ x: x, y: y, w: w, d: d, ux: ux, uy: uy, h: r < 0.5 ? 0.9 : r < 0.75 ? 1.1 : 0.35, kind: r < 0.5 ? 0 : r < 0.75 ? 1 : 2, id: (s ^ (i * 7919)) | 0 });
  }
  o._props = P;
  return P;
}

/* --- rasterisation into the field --- */
var RX = new Float64Array(64), RY = new Float64Array(64), XS = new Float64Array(64);
function stPolyFill(n, idx, hfun, shOnly) {
  var W = ST.W, H = ST.H, y0 = 1e9, y1 = -1e9, i, j, k;
  for (i = 0; i < n; i++) { if (RY[i] < y0) y0 = RY[i]; if (RY[i] > y1) y1 = RY[i]; }
  var ja = Math.max(0, Math.floor(y0)), jb = Math.min(H - 1, Math.ceil(y1));
  for (j = ja; j <= jb; j++) {
    var yc = j + 0.5, m = 0;
    for (i = 0, k = n - 1; i < n; k = i++) {
      var yi = RY[i], yk = RY[k];
      if ((yi > yc) !== (yk > yc)) XS[m++] = RX[i] + (yc - yi) / (yk - yi) * (RX[k] - RX[i]);
    }
    if (m < 2) continue;
    for (var a = 1; a < m; a++) { var v = XS[a], b = a - 1; while (b >= 0 && XS[b] > v) { XS[b + 1] = XS[b]; b--; } XS[b + 1] = v; }
    for (k = 0; k + 1 < m; k += 2) {
      var ia = Math.max(0, Math.ceil(XS[k] - 0.5)), ib = Math.min(W - 1, Math.floor(XS[k + 1] - 0.5));
      for (i = ia; i <= ib; i++) {
        var h = hfun(i + 0.5, yc);
        var e = j * W + i;
        if (shOnly) { if (h > ST.hs[e]) ST.hs[e] = h; }
        else if (h > ST.ht[e]) { ST.ht[e] = h; ST.mat[e] = idx; }
      }
    }
  }
}
var CUR = null;
function stToLocal(e, rx, ry) { RLX = (rx - ST.mxL - e.ax) / e.sc; RLY = (ry - ST.myT - e.ay) / e.sc; }
var RLX = 0, RLY = 0;
/* roof height above ground (metres) of a building at local point */
function stRoofH(o, lx, ly) {
  var top = o.z0 + o.h, R = o.rect, rf = o.roof;
  if (o.k === 0) {
    if (rf === 0) return top;
    var W = o.x1 - o.x0, D = o.y1 - o.y0, along = rf === 1 || rf === 3, hd = (along ? D : W) / 2, hl = (along ? W : D) / 2;
    var a = along ? lx - (o.x0 + o.x1) / 2 : ly - (o.y0 + o.y1) / 2, b = along ? ly - (o.y0 + o.y1) / 2 : lx - (o.x0 + o.x1) / 2;
    var s = Math.min(1.1, 5 / Math.max(1, hd)), dB = hd - Math.abs(b), dA = hl - Math.abs(a);
    return top + s * ((rf === 1 || rf === 2) ? Math.min(dA, dB) : dB);
  }
  if (rf === 5) { var dE = stEdgeDist(o, lx, ly); return top + Math.min(dE, 1.4) * 1.7; }
  if (rf === 6) { var d6 = stEdgeDist(o, lx, ly); return top + Math.min(d6 * 0.62, 4.2); }
  if ((rf === 1 || rf === 3) && R) {
    var dx = lx - R.cx, dy = ly - R.cy, a2 = dx * R.ux + dy * R.uy, b2 = -dx * R.uy + dy * R.ux;
    var s2 = Math.min(1.1, 5 / Math.max(1, R.hd)), dB2 = R.hd - Math.abs(b2), dA2 = R.hl - Math.abs(a2);
    return top + s2 * (rf === 1 ? Math.min(dA2, dB2) : dB2);
  }
  return top;
}
function stEdgeDist(o, lx, ly) {
  var n = o.n, p = o.p, best = 1e9;
  for (var i = 0; i < n; i++) { var j = (i + 1) % n, d = segD(lx, ly, p[2 * i], p[2 * i + 1], p[2 * j], p[2 * j + 1]); if (d < best) best = d; }
  return best;
}
/* nearest and second-nearest edge of a polygon: distance, along-edge coordinate, edge direction */
var EI = { d: 0, d2: 0, u: 0, ex: 1, ey: 0, i: 0, L: 1 };
function stEdgeInfo(o, lx, ly) {
  var n = o.n, p = o.p, b1 = 1e9, b2 = 1e9;
  for (var i = 0; i < n; i++) {
    var j = (i + 1) % n, ex = p[2 * j] - p[2 * i], ey = p[2 * j + 1] - p[2 * i + 1], l = Math.hypot(ex, ey) || 1, d = segD(lx, ly, p[2 * i], p[2 * i + 1], p[2 * j], p[2 * j + 1]);
    if (d < b1) { b2 = b1; b1 = d; EI.ex = ex / l; EI.ey = ey / l; EI.u = (lx - p[2 * i]) * EI.ex + (ly - p[2 * i + 1]) * EI.ey; EI.i = i; EI.L = l; }
    else if (d < b2) b2 = d;
  }
  EI.d = b1; EI.d2 = b2;
  return EI;
}
function stRaster() {
  var objs = ST.objs, W = ST.W, H = ST.H, i, k;
  for (var idx = 0; idx < objs.length; idx++) {
    var e = objs[idx], o = e.o, sc = e.sc, ox = e.ax + ST.mxL, oy = e.ay + ST.myT;
    CUR = e;
    if (e.t === 1) {
      if (o.k === 0) { RX[0] = ox + o.x0 * sc; RY[0] = oy + o.y0 * sc; RX[1] = ox + o.x1 * sc; RY[1] = RY[0]; RX[2] = RX[1]; RY[2] = oy + o.y1 * sc; RX[3] = RX[0]; RY[3] = RY[2]; k = 4; }
      else { k = o.n; for (i = 0; i < k; i++) { RX[i] = ox + o.p[2 * i] * sc; RY[i] = oy + o.p[2 * i + 1] * sc; } }
      var flat = o.k === 3 ? (o.roof === 0) : (o.roof === 0);
      stPolyFill(k, idx, function (rx, ry) {
        stToLocal(CUR, rx, ry);
        var h = stRoofH(CUR.o, RLX, RLY);
        if (flat && CUR.o.k === 3 && stEdgeDist(CUR.o, RLX, RLY) < 0.45) h += 0.55; // parapet
        else if (flat && CUR.o.k === 0) { var dd = Math.min(RLX - CUR.o.x0, CUR.o.x1 - RLX, RLY - CUR.o.y0, CUR.o.y1 - RLY); if (dd < 0.45) h += 0.55; }
        return h * CUR.sc;
      });
      // rooftop props: AC units, vents, skylights, chimney-like boxes
      if (flat && sc > 1.2 && !(SPR.ri && o.k === 3)) {
        var top = o.z0 + o.h, pr, q;
        if (o.k === 3) {
          pr = stProps(o);
          for (q = 0; q < pr.length; q++) {
            var P = pr[q], hw = P.w / 2, hd = P.d / 2;
            RX[0] = ox + (P.x - P.ux * hw + P.uy * hd) * sc; RY[0] = oy + (P.y - P.uy * hw - P.ux * hd) * sc;
            RX[1] = ox + (P.x + P.ux * hw + P.uy * hd) * sc; RY[1] = oy + (P.y + P.uy * hw - P.ux * hd) * sc;
            RX[2] = ox + (P.x + P.ux * hw - P.uy * hd) * sc; RY[2] = oy + (P.y + P.uy * hw + P.ux * hd) * sc;
            RX[3] = ox + (P.x - P.ux * hw - P.uy * hd) * sc; RY[3] = oy + (P.y - P.uy * hw + P.ux * hd) * sc;
            var pidx = stAdd(4, P, e.c, sc, e.ax, e.ay); objs[pidx].top = top; objs[pidx].bld = idx;
            var ph = (top + P.h) * sc;
            stPolyFill(4, pidx, function () { return ph; });
          }
        } else if (o.pr) {
          for (q = 0; q < o.pr.length; q++) {
            var p2 = o.pr[q];
            RX[0] = ox + p2[0] * sc; RY[0] = oy + p2[1] * sc; RX[1] = ox + p2[2] * sc; RY[1] = RY[0]; RX[2] = RX[1]; RY[2] = oy + p2[3] * sc; RX[3] = RX[0]; RY[3] = RY[2];
            var pi2 = stAdd(4, { kind: 3, col: p2[5], id: q * 977 + o.id, x: (p2[0] + p2[2]) / 2, y: (p2[1] + p2[3]) / 2, w: p2[2] - p2[0], d: p2[3] - p2[1], ux: 1, uy: 0 }, e.c, sc, e.ax, e.ay);
            objs[pi2].top = top; objs[pi2].bld = idx;
            var ph2 = (top + p2[4]) * sc;
            stPolyFill(4, pi2, function () { return ph2; });
          }
        }
      }
    } else if (e.t === 2) {
      var r = o.r, cx = ox + o.x * sc, cy = oy + o.y * sc, R = r * 1.15 * sc;
      RX[0] = cx - R; RY[0] = cy - R; RX[1] = cx + R; RY[1] = RY[0]; RX[2] = RX[1]; RY[2] = cy + R; RX[3] = RX[0]; RY[3] = RY[2];
      stPolyFill(4, idx, function (rx, ry) {
        stToLocal(CUR, rx, ry);
        var t = CUR.o, dx = RLX - t.x, dy = RLY - t.y, d = Math.sqrt(dx * dx + dy * dy);
        var re = t.r * (1 + 0.1 * noise(Math.atan2(dy, dx) * 1.6 + (t.id & 255), 3.7) + 0.08 * noise(RLX * 0.9, RLY * 0.9));
        if (d > re) return -1;
        var bump = 0.22 * t.r * (noise(RLX * 0.75 + (t.id & 63), RLY * 0.75) + 0.5 * noise(RLX * 1.7, RLY * 1.7 + 3));
        return (t.r * 0.45 + Math.sqrt(re * re - d * d) * 0.95 + bump) * CUR.sc;
      }, SPR.tr);
    } else if (e.t === 3) {
      var bb = o.bb;
      RX[0] = ox + bb[0] * sc; RY[0] = oy + bb[1] * sc; RX[1] = ox + bb[2] * sc; RY[1] = RY[0]; RX[2] = RX[1]; RY[2] = oy + bb[3] * sc; RX[3] = RX[0]; RY[3] = RY[2];
      stPolyFill(4, idx, function (rx, ry) { stToLocal(CUR, rx, ry); var h = stPartH(CUR.o, RLX, RLY); return h < 0 ? -1 : h * CUR.sc; });
    }
  }
}
function stPartH(p, x, y) {
  var dx = x - p.cx, dy = y - p.cy, d = Math.sqrt(dx * dx + dy * dy), u;
  if (p.t === "cyl") return d <= p.r ? p.z0 + p.h : -1;
  if (p.t === "dome") {
    if (!p.on) return d <= p.r ? p.z0 + p.h * Math.sqrt(Math.max(0, 1 - (d / p.r) * (d / p.r))) : -1;
    for (u = 1; u >= 0; u -= 1 / 24) if (onion(u) * p.r >= d) return p.z0 + u * p.h;
    return -1;
  }
  if (p.t === "cone") { var dd = p.sq ? Math.max(Math.abs(dx), Math.abs(dy)) : d; return dd <= p.r ? p.z0 + p.h * (1 - dd / p.r) : -1; }
  if (p.t === "lat") {
    var e = Math.max(Math.abs(dx), Math.abs(dy));
    for (u = 1; u >= 0; u -= 1 / 48) { var hw = p.w * Math.pow(1 - u, 2.6) * 0.95 + p.w * 0.04; if (hw >= e) return u * p.h; }
    return -1;
  }
  if (p.t === "ring") {
    var qx = dx / p.rx, qy = dy / p.ry, q = Math.sqrt(qx * qx + qy * qy);
    if (q > 1 || q < p.qi) return -1;
    var t = (q - p.qi) / (1 - p.qi);
    return q > 0.96 ? p.h : p.h * (0.3 + 0.62 * t);
  }
  return -1;
}

/* --- surface colours (before lighting) --- */
function stRoofCol(e, lx, ly, sc) {
  var o = e.o, c = o.rc, R = o.rect, rf = o.roof;
  if (o.k === 0 && rf) R = { cx: (o.x0 + o.x1) / 2, cy: (o.y0 + o.y1) / 2, ux: rf === 1 || rf === 3 ? 1 : 0, uy: rf === 1 || rf === 3 ? 0 : 1, hl: (rf === 1 || rf === 3 ? o.x1 - o.x0 : o.y1 - o.y0) / 2, hd: (rf === 1 || rf === 3 ? o.y1 - o.y0 : o.x1 - o.x0) / 2 };
  if ((rf === 1 || rf === 2 || rf === 3 || rf === 4) && R) {
    var dx = lx - R.cx, dy = ly - R.cy, a = dx * R.ux + dy * R.uy, b = -dx * R.uy + dy * R.ux;
    var hip = rf === 1 || rf === 2, dA = R.hl - Math.abs(a), dB = R.hd - Math.abs(b);
    var end = hip && dA < dB, dist = end ? dA : dB, along = end ? b : a;
    var terra = ((c >> 16) & 255) > ((c & 255) + 40);
    if (dist > R.hd - 0.25 && !end) return sh(c, 1.18);           // ridge
    if (hip && Math.abs(dA - dB) < 0.18) return sh(c, 1.1);         // hip line
    if (SPR.ok) { var tx = sprTexCol(terra ? "terra" : "metal", along, dist, sc, c); if (tx < 0 && !terra) tx = sprTexCol("slate", along, dist, sc, c); if (tx >= 0) return tx; }
    if (terra) {                                                     // clay tiles: courses along the eave, staggered tiles
      var row = Math.floor(dist / 0.34), fr = dist / 0.34 - row, col = Math.floor(along / 0.26 + (row & 1) * 0.5);
      var v = 0.93 + 0.12 * hh(row, col, o.id);
      if (fr < 0.22) v *= 0.8;
      if (sc > 4 && ((along / 0.26 + (row & 1) * 0.5) % 1 + 1) % 1 < 0.12) v *= 0.9;
      return sh(c, v);
    }
    var seam = ((along / 0.55) % 1 + 1) % 1;                         // metal / slate
    return sh(c, seam < 0.12 ? 0.86 : 0.98 + 0.05 * hh(Math.floor(along / 0.55), Math.floor(dist / 2), o.id));
  }
  if (rf === 6) {
    var ei = stEdgeInfo(o, lx, ly), terra6 = ((c >> 16) & 255) > ((c & 255) + 40);
    if (ei.d * 0.62 >= 4.2 - 0.12) return sh(c, 1.12);                      // flat ridge band
    if (Math.abs(ei.d2 - ei.d) < 0.16) return sh(c, 1.06);                   // hip / valley line
    if (ei.d < 0.22) return sh(c, 0.7);                                      // eave
    if (SPR.ok) { var tx6 = sprTexCol(terra6 ? "terra" : "metal", ei.u, ei.d, sc, c); if (tx6 < 0 && !terra6) tx6 = sprTexCol("slate", ei.u, ei.d, sc, c); if (tx6 >= 0) return tx6; }
    if (terra6) {
      var row6 = Math.floor(ei.d / 0.42), fr6 = ei.d / 0.42 - row6, col6 = Math.floor(ei.u / 0.34 + (row6 & 1) * 0.5);
      var v6 = 0.94 + 0.1 * hh(row6, col6, o.id);
      if (fr6 < 0.24) v6 *= 0.78; else if (fr6 > 0.8) v6 *= 1.06;
      return sh(c, v6);
    }
    var seam6 = ((ei.u / 0.7) % 1 + 1) % 1, st6 = hh(Math.floor(ei.u / 0.7), Math.floor(ei.d / 3), o.id);
    return sh(c, seam6 < 0.1 ? 0.88 : seam6 < 0.18 ? 1.05 : 0.97 + 0.05 * st6);
  }
  if (rf === 5) {
    var dE = stEdgeDist(o, lx, ly);
    if (dE < 1.4) {
      var ue = lx * 0.7 + ly * 0.7, du = ((ue % 3.1) + 3.1) % 3.1;
      if (dE > 0.35 && dE < 1.15 && du > 1.1 && du < 2.1) return dE < 0.5 || du < 1.25 || du > 1.95 ? 0xece6da : 0x3c4a5a;
      return sh(c, 0.95);
    }
    return sh(c, 1.28);
  }
  // flat: membrane / gravel with seams and stains, lighter parapet
  var dP = o.k === 3 ? stEdgeDist(o, lx, ly) : Math.min(lx - o.x0, o.x1 - lx, ly - o.y0, o.y1 - ly);
  if (dP < 0.45) return o.kit && o.kit.ny && o.k === 3 ? sh(o.wc, dP < 0.15 ? 1.2 : 1.05) : sh(c, 1.16);   // New York: brick parapets with a stone coping
  if (SPR.ok && SPR.g.tex && SPR.g.tex.flat1) { // kit roofing (membrane, slabs, gravel, felt) aligned with the building
    var Rf = o.rect, fu = Rf ? lx * Rf.ux + ly * Rf.uy : lx, fv = Rf ? -lx * Rf.uy + ly * Rf.ux : ly, fk = (o.kit && o.kit.ny && SPR.g.tex.nyr1 ? "nyr" : "flat") + (1 + ((o.id >>> 4) & 3));
    if (!SPR.g.tex[fk]) fk = "flat1";
    var fc = sprTexCol(fk, fu, fv, sc, c);
    if (fc >= 0) return dP < 0.75 ? sh(fc, 0.84) : fc;
  }
  var n1 = noise(lx * 0.35 + (o.id & 255), ly * 0.35), n2 = hh(Math.floor(lx * 4), Math.floor(ly * 4), o.id), n3 = noise(lx * 0.9 - (o.id & 127), ly * 0.9);
  var v2 = 1 + 0.07 * n1 + (n2 - 0.5) * 0.06 + (n3 > 0.38 ? -0.07 : 0);
  var u2 = lx * 0.83 + ly * 0.55;
  if (((u2 / 2.4) % 1 + 1) % 1 < 0.04) v2 *= 0.93;
  if (dP > 0.45 && dP < 0.75) v2 *= 0.86;
  return sh(c, v2);
}
function stWallCol(e, lx, ly, z, sc) {
  var o = e.o, base = o.wc, h = o.z0 + o.h, zr = z - o.z0;
  if (zr < 0) zr = 0;
  var u = lx;
  if (o.k === 3) u = stEdgeInfo(o, lx, ly).u;
  if (SPR.ok && (o.win !== 3 || (o.kit && o.kit.fkg)) && o.win !== 0 && z <= h && z >= o.z0) {
    if (o.k === 3 && SPR.g.fk) { var kcol = sprFkCol(o, stEdgeInfo(o, lx, ly), zr, sc); if (kcol >= 0) return kcol; }
    var fcol = sprFacCol(o, u, zr, sc); if (fcol >= 0) return fcol;
  }
  if (h - z < 0.35) return o.trim ? sh(o.trim, 0.95) : sh(base, 1.12);  // cornice
  if (h - z < 0.7) return sh(base, 0.72);                               // shadow under the cornice
  if (o.win === 3) {                                                    // curtain wall
    var fz = zr % 3.4, cu = ((u / 1.6) % 1 + 1) % 1;
    if (fz < 0.25) return sh(base, 0.7);
    if (cu < 0.08) return sh(base, 0.78);
    return sh(base, 0.95 + 0.12 * (fz / 3.4));
  }
  if (o.win === 0) return base;
  var fl = Math.floor(zr / 3.1), fz2 = zr - fl * 3.1, col = u / 3.0, ci = Math.floor(col), cf = col - ci;
  if (fl === 0 && o.z0 === 0) {
    if (o.aw >= 0) {
      if (fz2 > 2.3 && fz2 < 2.95) return (Math.floor(u / 0.5) & 1) ? o.aw : 0xf3ece0;
      if (fz2 > 0.15 && fz2 < 2.3 && cf > 0.08 && cf < 0.92) return fz2 > 1.95 ? 0x8aa3b8 : (hh(ci, 0, o.id) < 0.3 ? 0x6b4a32 : 0x2e3c4c);
    } else if (cf > 0.38 && cf < 0.62 && fz2 < 2.2 && hh(ci, 1, o.id) < 0.25) return 0x5a3d2a;
    if (fz2 < 0.5) return sh(base, 0.8);
  }
  var wx = cf > 0.3 && cf < 0.7, wy = fz2 > 0.8 && fz2 < 2.35;
  if (wx && wy) {
    if (fz2 > 2.1) return 0xa9bfcf;
    var lit = hh(ci, fl, o.id);
    return lit < 0.06 ? 0xf2d27a : (cf < 0.36 ? 0x3d4c5c : 0x2b3644);
  }
  if (wx && fz2 > 0.62 && fz2 <= 0.8) return o.trim ? o.trim : sh(base, 1.2);  // sill
  if (o.trim && sc > 3 && cf > 0.25 && cf < 0.75 && fz2 > 0.62 && fz2 < 2.55) return sh(o.trim, 0.96);
  if (fz2 < 0.12) return sh(base, 0.9);
  return base;
}
var TREE_ST = [[0xa4c24a, 0x7fae3a, 0x5f8f2f, 0x456f27, 0x2c4a1c], [0xb2cc58, 0x8db843, 0x6c9a35, 0x4e7a2b, 0x31521e], [0x95b744, 0x73a037, 0x56822e, 0x3f6526, 0x2a451b],
  [0xd9b34a, 0xc0952f, 0x9c7526, 0x75561d, 0x4f3a15], [0xb8b048, 0x9a9a3a, 0x7d7f30, 0x5d6026, 0x40421b], [0xb69ad8, 0x9a7cc4, 0x7d5fa8, 0x5f4785, 0x41305c],
  [0xe2a0b8, 0xc9809c, 0xa8627f, 0x844a62, 0x5c3245], [0xd9894a, 0xc06c35, 0x9c522a, 0x763d20, 0x4f2915]];
function stTreePal(o) {
  if (o._sp !== undefined) return TREE_ST[o._sp];
  var v = ((o.id >>> 9) & 1023) / 1024;
  o._sp = v < 0.4 ? 0 : v < 0.7 ? 1 : v < 0.84 ? 2 : v < 0.9 ? 3 : v < 0.94 ? 4 : v < 0.97 ? 5 : v < 0.99 ? 7 : 6;
  return TREE_ST[o._sp];
}

/* tallest thing that can reach into this tile: towers up to ~90 m south rise into it, their shadows fall across it.
   Schema cities look at the buildings around the tile (per-bucket maxima, cached), so a low district beside Midtown stays cheap. */
function stLocalMaxH(c, mpp, ox, oy) {
  if (!c.schema) return Math.min(c.maxH || 40, 90);
  var sb = sgBuild(c), sc = 1 / (c.k * mpp), ax = (c.mx - ox) / mpp, ay = (c.my - oy) / mpp;
  var lx0 = -ax / sc - 90, lx1 = (TS - ax) / sc + 90, ly0 = -ay / sc - 90, ly1 = (TS - ay) / sc + 90, m = 20, i, j, q;
  for (q = 0; q < c.lms.length; q++) { var A = c.lms[q].A; if (!(A.X1 < lx0 || A.X0 > lx1 || A.Y1 < ly0 || A.Y0 > ly1)) return Math.min(c.maxH || 40, 200); }
  if (!sb.MH) sb.MH = new Map();
  for (j = Math.floor(ly0 / 128); j <= Math.floor(ly1 / 128); j++) for (i = Math.floor(lx0 / 128); i <= Math.floor(lx1 / 128); i++) {
    var k = i * 65536 + j, v = sb.MH.get(k);
    if (v === undefined) { v = 0; var L = sb.B.get(k); if (L) for (q = 0; q < L.length; q++) { var o = sb.list[L[q]]; if (o.h !== undefined && (o.z0 || 0) + o.h > v) v = (o.z0 || 0) + o.h; } sb.MH.set(k, v); }
    if (v > m) m = v;
  }
  return Math.min(m + 6, 200);   // + rooftop water towers and bulkheads
}

/* --- the ray caster --- */
function streetPass(out, msk, z, tx, ty, mpp) {
  var n = Math.pow(2, z), ox = tx / n * C, oy = ty / n * C, i, j, e;
  // margins from the tallest object nearby (capped)
  var maxM = 0;
  for (i = 0; i < TC.length; i++) maxM = Math.max(maxM, stLocalMaxH(TC[i], mpp, ox, oy));
  var kc = kAt(oy + TS * mpp / 2), mT = maxM / (kc * mpp);
  var mxL = Math.ceil(mT * SUNA) + 4, myT = Math.ceil(mT * SUNB) + 4, myB = Math.ceil(mT * STF) + 4, mxR = SPR.ri ? 14 : 4;
  var W = TS + mxL + mxR, H = TS + myT + myB;
  stEnsure(W * H);
  ST.W = W; ST.H = H; ST.mxL = mxL; ST.myT = myT; ST.objs.length = 0;
  var ht = ST.ht, hs = ST.hs, mat = ST.mat;
  for (i = 0; i < W * H; i++) { ht[i] = 0; hs[i] = 0; mat[i] = -1; }
  for (i = 0; i < TC.length; i++) stCollect(TC[i], mpp, ox, oy, -mxL, -myT, TS + mxR, TS + myB);
  // sprite trees: collected with a margin wide enough for the largest crown, drawn after shading
  ST.tl.length = 0;
  if (SPR.tr || SPR.pr) { var mTr = Math.ceil(7 / (kc * mpp)) + 2; for (i = 0; i < TC.length; i++) stCollect(TC[i], mpp, ox, oy, -mTr, -mTr, TS + mTr, TS + mTr * 2, 1); }
  stRaster();
  if (SPR.ri) for (i = 0; i < ST.objs.length; i++) { // rooftop details from the kit, on this building's roof surface
    var eo = ST.objs[i];
    if (eo.t !== 1 || eo.o.k !== 3) continue;
    var RI = stRoofItems(eo.o);
    for (j = 0; j < RI.length; j++) ST.tl.push({ o: RI[j], sc: eo.sc, ax: eo.ax, ay: eo.ay });
  }
  var maxHT = 0;
  if (SPR.ok) { for (i = 0; i < W * H; i++) if (ht[i] > hs[i]) hs[i] = ht[i]; } else hs.set(ht.subarray(0, W * H));
  for (i = 0; i < W * H; i++) if (hs[i] > maxHT) maxHT = hs[i];
  if (maxHT <= 0) return;
  // blurred height for ambient occlusion
  stBlur(ht, ST.bh, W, H, Math.max(3, Math.round(2.2 / (kc * mpp))));
  var objs = ST.objs, F = STF;
  for (i = 0; i < TS * TS; i++) { STKIND[i] = 0; STSID[i] = -1; STSH[i] = 1; STOWN[i] = -1; STHT[i] = 0; STROW[i] = -1e9; }
  // scan every column from the viewer to the horizon
  for (var px = 0; px < TS; px++) {
    var ci = px + mxL, ymin = TS;
    for (j = H - 1; j >= 0 && ymin > 0; j--) {
      var ce = j * W + ci, h = ht[ce], y = j - myT;
      var top = y - h * F;
      if (top >= ymin) continue;
      var qa = Math.max(0, Math.floor(top + 0.5)), qb = Math.min(ymin, TS) - 1;
      for (var q = qb; q >= qa; q--) {
        var yc = q + 0.5, o = q * TS + px, id = mat[ce];
        STOWN[o] = id; STHT[o] = h;
        if (yc < y + 1 - h * F) { // top surface
          STKIND[o] = id < 0 ? 1 : 2; STSID[o] = ce; STROW[o] = y + 0.5;
        } else {                  // south face of this cell
          var zf = (y + 1 - yc) / F;
          STKIND[o] = 3; STSID[o] = ce; STSH[o] = zf; STROW[o] = y + 1;   // STSH temporarily holds the face height
        }
      }
      ymin = Math.min(ymin, qa);
    }
  }
  // shade
  var Lx = -SUNA, Ly = -SUNB, Lz = 1, Ll = Math.sqrt(Lx * Lx + Ly * Ly + 1); Lx /= Ll; Ly /= Ll; Lz /= Ll;
  var flatL = Lz;
  for (var py = 0; py < TS; py++) for (px = 0; px < TS; px++) {
    o = py * TS + px;
    var kind = STKIND[o];
    if (kind === 0) continue;
    var ce2 = STSID[o], ci2 = ce2 % W, cj2 = (ce2 / W) | 0, h2 = ht[ce2], id2 = mat[ce2], col, lit = 1, zt;
    var x0 = ci2 + 0.5, y0 = cj2 + 0.5;
    if (kind === 1) { // ground: colour already in out; add shadows and AO
      zt = 0.05;
      var sv = stShadow(x0, y0, zt, maxHT, hs);
      var ao = 1 - Math.min(0.42, Math.max(0, ST.bh[ce2] - h2) / (mT * 0.06 + 1) * 0.16);
      STSH[o] = sv; STGND[o] = 1;
      var f = ao * (sv < 1 ? 1 - 0.42 * (1 - sv) : 1);
      var oi = o * 4;
      out[oi] = out[oi] * f * (sv < 1 ? 0.97 : 1); out[oi + 1] = out[oi + 1] * f * (sv < 1 ? 0.98 : 1); out[oi + 2] = Math.min(255, out[oi + 2] * f * (sv < 1 ? 1.06 : 1));
      if (sv < 1) msk[o] = msk[o] || 3;
      continue;
    }
    e = objs[id2];
    STGND[o] = 0;
    stToLocal(e, x0, y0);
    var lx = RLX, ly = RLY, sc = e.sc;
    if (kind === 2) {
      // normal from the field (same owner only)
      var hl = (ci2 > 0 && mat[ce2 - 1] === id2) ? ht[ce2 - 1] : h2, hr = (ci2 < W - 1 && mat[ce2 + 1] === id2) ? ht[ce2 + 1] : h2;
      var hu = (cj2 > 0 && mat[ce2 - W] === id2) ? ht[ce2 - W] : h2, hd2 = (cj2 < H - 1 && mat[ce2 + W] === id2) ? ht[ce2 + W] : h2;
      var nx = -(hr - hl) / 2, ny = -(hd2 - hu) / 2, nz = 1, nl = Math.sqrt(nx * nx + ny * ny + 1);
      var dif = (nx * Lx + ny * Ly + nz * Lz) / nl;
      lit = 0.42 + 0.58 * Math.max(0, dif) / flatL;
      // rim: darker where the surface drops away (south/east), lighter towards the light
      var dropS = cj2 < H - 1 && ht[ce2 + W] < h2 - 2, dropE = ci2 < W - 1 && ht[ce2 + 1] < h2 - 2, dropN = cj2 > 0 && ht[ce2 - W] < h2 - 2, dropW = ci2 > 0 && ht[ce2 - 1] < h2 - 2;
      if (e.t === 1 || e.t === 4) {
        col = e.t === 1 ? stRoofCol(e, lx, ly, sc) : stPropCol(e, lx, ly);
        if (dropS || dropE) lit *= 0.74; else if (dropN || dropW) lit *= 1.1;
      } else if (e.t === 2) {
        var P = stTreePal(e.o), tn = noise(lx * 2.1 + (e.o.id & 127), ly * 2.1) * 0.5 + noise(lx * 4.3, ly * 4.3 + 7) * 0.35;
        var lv = lit + tn * 0.28;
        col = lv > 1.18 ? P[0] : lv > 0.98 ? P[1] : lv > 0.78 ? P[2] : lv > 0.6 ? P[3] : P[4];
        if (dropS || dropE || dropN || dropW) col = (dropS || dropE) ? P[4] : P[3];
        lit = 1;
        msk[o] = 2;
      } else {
        col = e.o.rib ? ribCol(e.o, lx - e.o.cx, ly - e.o.cy) : (e.o.col || 0xcccccc);
        if (e.o.t === "cyl" && e.o.rc && h2 >= (e.o.z0 + e.o.h) * sc - 0.6) col = e.o.rc;
      }
      zt = h2 + 0.05;
    } else { // south facade
      zt = STSH[o] * 1; // texels
      var zm = zt / sc;
      if (e.t === 1) { col = stWallCol(e, lx, ly, zm, sc); lit = 0.86; if (zm - e.o.z0 < 0.6) lit *= 0.82; }
      else if (e.t === 4) { col = stPropCol(e, lx, ly); lit = 0.7; }
      else if (e.t === 2) { var P2 = stTreePal(e.o); col = (zm < e.o.r * 0.7) ? P2[4] : P2[3]; lit = 1; msk[o] = 2; }
      else { col = e.o.col || 0xcccccc; if (e.o.t === "cyl" && e.o.win && sc > 2) { var aa = Math.atan2(ly - e.o.cy, lx - e.o.cx), cu = (aa / 6.2832 + 0.5) * Math.max(4, Math.round(e.o.r * 1.2)), cf = cu - Math.floor(cu), fz = (zm - e.o.z0) % 4; if (cf > 0.35 && cf < 0.65 && fz > 1 && fz < 3.2) col = 0x3f4f63; } lit = 0.8 - 0.25 * Math.max(0, (lx - e.o.cx) / Math.max(1, e.o.r || e.o.w || 1)); }
      y0 = cj2 + 1.02;
    }
    var sv2 = stShadow(x0, y0, zt, maxHT, hs);
    if (sv2 < 1) lit *= 1 - 0.38 * (1 - sv2);
    var r = ((col >> 16) & 255) * lit, g = ((col >> 8) & 255) * lit, b = (col & 255) * lit;
    if (sv2 < 1) { r *= 0.96; b = b * 1.05 + 4; }
    var oi2 = o * 4;
    out[oi2] = r > 255 ? 255 : r; out[oi2 + 1] = g > 255 ? 255 : g; out[oi2 + 2] = b > 255 ? 255 : b;
    if (msk[o] !== 2) msk[o] = 1;
  }
  stFinish(out, objs);
  if ((SPR.tr || SPR.pr || SPR.ri) && ST.tl.length) sprTrees(out, msk, maxHT);
}
/* outlines where one object meets another (the nearer / taller side gets the dark line), then a warm grade */
function stFinish(out, objs) {
  for (var py = 0; py < TS; py++) for (var px = 0; px < TS; px++) {
    var o = py * TS + px, id = STOWN[o];
    if (id < 0) continue;
    var e = objs[id], dark = 0;
    for (var k = 0; k < 4; k++) {
      var qx = px + (k === 0 ? -1 : k === 1 ? 1 : 0), qy = py + (k === 2 ? -1 : k === 3 ? 1 : 0);
      if (qx < 0 || qy < 0 || qx >= TS || qy >= TS) continue;
      var q = qy * TS + qx, id2 = STOWN[q];
      if (id2 === id) continue;
      if (id2 >= 0 && objs[id2].t === 4 && objs[id2].bld === id) continue;      // own rooftop props
      if (e.t === 4 && id2 === e.bld) { if (k === 3 || k === 1) dark = Math.max(dark, 1); continue; }
      if (id2 < 0 || STHT[q] < STHT[o] - 0.5 || k === 2) dark = Math.max(dark, e.t === 2 ? 0 : 2);
      else dark = Math.max(dark, 1);
    }
    if (dark) { var f = dark === 2 ? 0.66 : 0.8, i4 = o * 4; out[i4] *= f; out[i4 + 1] *= f; out[i4 + 2] *= f * 1.04; }
  }
}
function stGrade(out) { // warm grade for every tile at object zooms (applied to all of them so tiles match)
  for (var i = 0; i < TS * TS * 4; i += 4) {
    var r = out[i] * 1.05 + 4, g = out[i + 1] * 1.005 + 2, b = out[i + 2] * 0.9;
    out[i] = r > 255 ? 255 : r; out[i + 1] = g > 255 ? 255 : g; out[i + 2] = b;
  }
}
function stPropCol(e, lx, ly) {
  var P = e.o;
  if (P.kind === 0) { var u = (lx - P.x) * P.ux + (ly - P.y) * P.uy; return (((u / 0.18) | 0) & 1) ? 0xd5d8dc : 0xc2c6cb; } // AC unit with grille
  if (P.kind === 1) return 0x8a8f96;                                                                                       // vent / hatch
  if (P.kind === 2) { var v = (lx - P.x) * P.uy - (ly - P.y) * P.ux; return Math.abs(v) < 0.1 ? 0xb9c4cf : 0x6f8fa8; }       // skylight
  return P.col || 0xbfc3c8;
}
/* soft-ish shadow: march towards the sun; partial values near the start of the occluder give a 1-2 px penumbra */
function stShadow(x, y, z, maxHT, ht) {
  var W = ST.W, H = ST.H, t = 0.7, best = 1;
  while (true) {
    var pz = z + t;
    if (pz > maxHT) break;
    var px = x - SUNA * t, py = y - SUNB * t;
    if (px < 0 || py < 0 || px >= W || py >= H) break;
    var hv = ht[(py | 0) * W + (px | 0)], over = hv - pz;
    if (over > 0) { if (over > 1.2) return 0; best = Math.min(best, 1 - over / 1.2); }
    t += t < 6 ? 0.7 : 1.4;
  }
  return best;
}
function stBlur(src, dst, W, H, r) {
  var tmp = ST.tmp, i, j, acc, n = 2 * r + 1;
  for (j = 0; j < H; j++) {
    var o = j * W; acc = 0;
    for (i = -r; i <= r; i++) acc += src[o + Math.min(W - 1, Math.max(0, i))];
    for (i = 0; i < W; i++) { tmp[o + i] = acc / n; acc += src[o + Math.min(W - 1, i + r + 1)] - src[o + Math.max(0, i - r)]; }
  }
  for (i = 0; i < W; i++) {
    acc = 0;
    for (j = -r; j <= r; j++) acc += tmp[Math.min(H - 1, Math.max(0, j)) * W + i];
    for (j = 0; j < H; j++) { dst[j * W + i] = acc / n; acc += tmp[Math.min(H - 1, j + r + 1) * W + i] - tmp[Math.max(0, j - r) * W + i]; }
  }
}

/* ---------- AI sprite atlas ----------
   Sprites (tree crowns, cars, props) were generated offline with an open model (Z-Image-Turbo, Apache-2.0),
   cut out, pixelised at several sizes and packed into one RGBA atlas that GEN.init receives as d.spr.
   SPR.g[group][category] = list of sprites; a sprite = list of mips {x, y, w, h} sorted by width. */
var SPR = { ok: false, tr: false, pr: false, ri: false, w: 0, h: 0, px: null, g: null };
function sprInit(s) {
  if (!s || !s.px) return;
  SPR.w = s.w; SPR.h = s.h; SPR.px = s.px instanceof Uint8Array || s.px instanceof Uint8ClampedArray ? s.px : new Uint8Array(s.px); SPR.g = s.g; SPR.ok = true; SPR.tr = !!s.g.tree; SPR.pr = !!s.g.prop; SPR.ri = !!s.g.roof;
}
function sprMip(sp, w) { for (var i = 0; i < sp.length; i++) if (sp[i].w >= w) return sp[i]; return sp[sp.length - 1]; }
// tree palette index (stTreePal) -> sprite category
var SPR_TCAT = ["g", "g", "g", "y", "o", "p", "k", "o"];
function sprTreeOf(o) {
  stTreePal(o);
  var G = SPR.g.tree, cat = SPR_TCAT[o._sp], L = G[cat] || G.g || G.d || G[Object.keys(G)[0]];
  if (o._sp === 2 && G.d && (o.id & 1)) L = G.d;
  return L[((o.id >>> 3) & 0xffff) % L.length];
}
// roof / wall textures: metres per repeat; the texture modulates the building's own colour
var SPR_TS = { terra: 3.0, metal: 4.8, slate: 3.0, flat1: 6, flat2: 6, flat3: 5, flat4: 6, nyr1: 6, nyr2: 6, nyr3: 5, nyr4: 6 };
function sprTexCol(cat, u, v, sc, base) {
  var T = SPR.g.tex && SPR.g.tex[cat];
  if (!T) return -1;
  var S = SPR_TS[cat] || 3, m = sprMip(T[0], S * sc), P = SPR.px, AW = SPR.w;
  if (m.mr === undefined) {
    var r0 = 0, g0 = 0, b0 = 0;
    for (var yy = 0; yy < m.h; yy++) for (var xx = 0; xx < m.w; xx++) { var a0 = ((m.y + yy) * AW + m.x + xx) * 4; r0 += P[a0]; g0 += P[a0 + 1]; b0 += P[a0 + 2]; }
    var nn = m.w * m.h; m.mr = r0 / nn; m.mg = g0 / nn; m.mb = b0 / nn;
  }
  var k = m.w / S, x = Math.floor(u * k) % m.w, y = Math.floor(v * k) % m.h;
  if (x < 0) x += m.w; if (y < 0) y += m.h;
  var a = ((m.y + y) * AW + m.x + x) * 4;
  var c0 = cat.charCodeAt(0), kf = c0 === 102 ? 1.6 : c0 === 110 ? 1.3 : 0.5; // flat roofing: full-strength texture (seams, patches, gravel)
  var r = ((base >> 16) & 255) * (1 - kf + kf * P[a] / m.mr), g = ((base >> 8) & 255) * (1 - kf + kf * P[a + 1] / m.mg), b = (base & 255) * (1 - kf + kf * P[a + 2] / m.mb);
  if (r < 0) r = 0; if (g < 0) g = 0; if (b < 0) b = 0;
  return ((r > 255 ? 255 : r) << 16) | ((g > 255 ? 255 : g) << 8) | (b > 255 ? 255 : b);
}
// AI facades: a cornice band, a typical floor band (repeated) and a ground-floor band, pre-squashed by STF.
// The texture's own wall colour is replaced by the building's wall colour; windows, awnings and doors stay.
function sprFacOf(o) {
  if (o._fac !== undefined) return o._fac;
  var G = SPR.g.fac, k = o.kit, L = null;
  if (G && k) L = k === KITS.stalin ? G.stal : (k === KITS.haus || k === KITS.subfr || k === KITS.ist || k === KITS.istm) ? G.haus : k === KITS.msk ? ((o.id >>> 5) & 1 ? G.stal : G.haus) : null;
  o._fac = L ? L[((o.id >>> 7) & 0xffff) % L.length] : null;
  return o._fac;
}
function sprFacCol(o, u, zr, sc) {
  var F = sprFacOf(o);
  if (!F) return -1;
  var m = F[F.length - 1];
  for (var i = 0; i < F.length; i++) if (F[i].s >= sc * 0.92) { m = F[i]; break; }
  var H = o.h, hc = m.b[0], hf = m.b[1], hg = m.b[2], zt = H - zr, row;
  var gnd = o.z0 === 0 && H > m.Hg + m.Hc + 1.5;
  if (zt < m.Hc) row = Math.min(hc - 1, (zt / m.Hc * hc) | 0);
  else if (gnd && zr < m.Hg) row = hc + hf + Math.min(hg - 1, ((m.Hg - zr) / m.Hg * hg) | 0);
  else { var z2 = zr - (gnd ? m.Hg : 0), fz = z2 - Math.floor(z2 / m.Hf) * m.Hf; row = hc + Math.min(hf - 1, ((m.Hf - fz) / m.Hf * hf) | 0); }
  var x = Math.floor(u * m.s) % m.w; if (x < 0) x += m.w;
  var a = ((m.y + row) * SPR.w + m.x + x) * 4, P = SPR.px, r = P[a], g = P[a + 1], b = P[a + 2];
  var W = m.wall, dr = r - W[0], dg = g - W[1], db = b - W[2];
  if (dr * dr + dg * dg + db * db < 2400) {       // wall plaster -> this building's colour, keeping the texel's shading
    var c = o.wc, l = (r + g + b + 1) / (W[0] + W[1] + W[2] + 1);
    r = ((c >> 16) & 255) * l; g = ((c >> 8) & 255) * l; b = (c & 255) * l;
  }
  return ((r > 255 ? 255 : r) << 16) | ((g > 255 ? 255 : g) << 8) | (b > 255 ? 255 : b);
}
/* modular facades (atlas group fk): a wall is split into bays — from the skeleton (b.bays) on street fronts, uniform elsewhere.
   A ground-floor bay takes a source bay of its type (S shop window, s shop door, D entrance, A arch, W window);
   upper floors and the cornice take source bays in order, so windows always sit on the bay grid. */
function sprFkOf(o) {
  if (o._fk !== undefined) return o._fk;
  var G = SPR.g.fk, k = o.kit, L = null;
  if (G && k && k.fk) { L = G[o.win === 3 && k.fkg ? k.fkg : k.fkt && o.z0 + o.h > 70 ? k.fkt : k.fk] || G[k.fk] || (k.fk === "stal" ? G.msk : null) || null; if (L && !L.length) L = null; }
  o._fk = L ? L[((o.id >>> 7) & 0xffff) % L.length] : null;
  return o._fk;
}
var FK_FALL = { s: "S", S: "W", A: "D", D: "W", W: "S" };
function sprFkSrc(m, t, salt) {
  var gt = m.gt, cnt = 0, i, tries = 0;
  while (tries++ < 4) {
    cnt = 0; for (i = 0; i < gt.length; i++) if (gt.charAt(i) === t) cnt++;
    if (cnt) break;
    t = FK_FALL[t] || "W";
  }
  if (!cnt) return salt % gt.length;
  var k = ((salt >>> 0) % cnt);
  for (i = 0; i < gt.length; i++) if (gt.charAt(i) === t && k-- === 0) return i;
  return 0;
}
function sprFkCol(o, ei, zr, sc) {
  var F = sprFkOf(o);
  if (!F) return -1;
  var B = o.bays && o.bays[ei.i], YL = SPR.g.fk[(o.kit && o.kit.fky) || "yard"];
  if (!B && YL && o.bays) F = YL[((o.id >>> 11) & 0xffff) % YL.length];   // a wall away from the street: plain courtyard side
  var m = F[F.length - 1], i;
  for (i = 0; i < F.length; i++) if (F[i].s >= sc * 0.92) { m = F[i]; break; }
  var L = ei.L, n = B ? B.n : Math.max(1, Math.round(L / 3.3)), w = L / n, u = Math.max(0, Math.min(L - 1e-6, ei.u));
  var bi = Math.min(n - 1, Math.floor(u / w)), fr = (u - bi * w) / w, t = B ? B.t.charAt(bi) : (n > 2 && (bi + (o.id & 3)) % 4 === 1 ? "D" : "W");
  var nb = m.nb, bf = m.bf, H = o.h, hc = m.b[0], hf = m.b[1], hg = m.b[2], zt = H - zr, row, src;
  var gnd = o.z0 === 0 && H > m.Hg + m.Hc + 1.5;
  // upper floors and cornice: their own column grid at the source's bay width, so windows keep their proportions
  var nU = Math.max(1, Math.round(L / (m.Wm / nb))), wU = L / nU, biU = Math.min(nU - 1, Math.floor(u / wU)), frU = (u - biU * wU) / wU;
  if (zt < m.Hc) { row = Math.min(hc - 1, (zt / m.Hc * hc) | 0); src = (biU + ei.i * 3) % nb; fr = frU; }
  else if (gnd && zr < m.Hg) {
    row = hc + hf + Math.min(hg - 1, ((m.Hg - zr) / m.Hg * hg) | 0);
    var salt = (Math.imul(bi + 7, 0x9e3779b1) ^ o.id) >>> 0;
    if (m.gm) { // ground-floor modules with their own extents (shopfronts and doors need not follow the window grid)
      var tt = t, GL = null;
      for (var tr = 0; tr < 4 && !GL; tr++) { GL = m.gm[tt]; if (!GL || !GL.length) { GL = null; tt = FK_FALL[tt] || "W"; } }
      if (GL) {
        var R = GL[salt % GL.length], gx = Math.min(m.w - 1, Math.floor((R[0] + fr * (R[1] - R[0])) * m.w));
        var ga = ((m.y + row) * SPR.w + m.x + gx) * 4;
        return sprFkRecolor(o, m, SPR.px[ga], SPR.px[ga + 1], SPR.px[ga + 2]);
      }
    }
    src = sprFkSrc(m, t, salt);
  }
  else { var z2 = zr - (gnd ? m.Hg : 0), fz = z2 - Math.floor(z2 / m.Hf) * m.Hf; row = hc + Math.min(hf - 1, ((m.Hf - fz) / m.Hf * hf) | 0); src = (biU + ei.i * 3 + (o.id & 7)) % nb; fr = frU; }
  var x = Math.min(m.w - 1, Math.floor((bf[src] + fr * (bf[src + 1] - bf[src])) * m.w));
  var a = ((m.y + row) * SPR.w + m.x + x) * 4;
  return sprFkRecolor(o, m, SPR.px[a], SPR.px[a + 1], SPR.px[a + 2]);
}
function sprFkRecolor(o, m, r, g, b) { // the texture's plaster takes this building's wall colour (if the kit allows), details stay
  var W = m.wall, dr = r - W[0], dg = g - W[1], db = b - W[2];
  if (!m.keep && dr * dr + dg * dg + db * db < 2400) { var c = o.wc, l = (r + g + b + 1) / (W[0] + W[1] + W[2] + 1); r = ((c >> 16) & 255) * l; g = ((c >> 8) & 255) * l; b = (c & 255) * l; }
  return ((r > 255 ? 255 : r) << 16) | ((g > 255 ? 255 : g) << 8) | (b > 255 ? 255 : b);
}
// street furniture: upright sprites standing on their base point; width in metres per type
/* rooftop details of one building (k = 6, z = roof height there): chimneys by the ridge, dormers on the street slope
   every other bay, skylights now and then; air conditioners, vents and dishes on flat roofs */
var ROOF_W = { wtower: 4.4, wtower2: 4.8, bulk: 3.8, elev: 4.6, hvac: 3.6, acrow2: 3.4, flues: 1.8, sky2: 2.8, deck: 5.6, greenhouse: 3.0, pipes: 2.6, machine: 3.4, acrow: 3.0, ventbox: 2.2, antenna: 1.8, hatch: 1.4, solar: 2.6, tank: 2.4, chimney: 1.6, chimney2: 1.9, dormer: 2.8, dormerR: 2.8, ac: 1.9, skylight: 2.2, vent: 0.9, dish: 1.9, skyflat: 2.4 }; // exaggerated like the reference
function stRoofItems(o) {
  if (o._ri) return o._ri;
  var R = [], s = o.id, p = o.p, n = o.n, i, q, terra = ((o.rc >> 16) & 255) > ((o.rc & 255) + 40);
  var put = function (t, x, y, k) { if (!inPoly(p, x, y)) return; for (var j = 0; j < R.length; j++) if (Math.abs(R[j].x - x) < 1.4 && Math.abs(R[j].y - y) < 1.4) return; R.push({ k: 6, t: t, x: x, y: y, z: stRoofH(o, x, y), id: (s ^ Math.imul(k + 1, 0x9e3779b1)) | 0 }); };
  var cx = (o.bb[0] + o.bb[2]) / 2, cy = (o.bb[1] + o.bb[3]) / 2;
  if (o.roof) {
    // chimneys near the middle of the roof
    var nc = 1 + ((hh(s, 1, 90) * 2.2) | 0), Rr = o.rect;
    for (i = 0; i < nc; i++) {
      var a = (hh(s, i, 91) - 0.5) * (Rr ? Rr.hl * 1.4 : 6), b = (hh(s, i, 92) - 0.5) * (Rr ? Rr.hd * 0.6 : 3);
      var ux = Rr ? Rr.ux : 1, uy = Rr ? Rr.uy : 0;
      put(hh(s, i, 93) < 0.5 ? "chimney" : "chimney2", cx + ux * a - uy * b, cy + uy * a + ux * b, i);
    }
    // dormers on the street slopes (or every slope of a mansard)
    for (var e in (o.bays || {})) {
      var ei = +e, e2 = (ei + 1) % n, ex = p[2 * e2] - p[2 * ei], ey = p[2 * e2 + 1] - p[2 * ei + 1], L = Math.hypot(ex, ey);
      if (L < 6) continue;
      var tx = ex / L, ty = ey / L, nx = -ty, ny = tx;
      if ((p[2 * ei] + ex / 2 - cx) * nx + (p[2 * ei + 1] + ey / 2 - cy) * ny > 0) { nx = -nx; ny = -ny; } // inward
      var B = o.bays[e], inset = o.roof === 5 ? 0.9 : 2.0;
      for (q = 1; q < B.n - 1; q += 2) {
        if (hh(s, ei * 32 + q, 94) < 0.25) continue;
        var t = (q + 0.5) * B.w, kind = hh(s, ei * 32 + q, 95) < 0.15 ? "skylight" : terra ? "dormerR" : "dormer";
        put(kind, p[2 * ei] + tx * t + nx * inset, p[2 * ei + 1] + ty * t + ny * inset, 10 + ei * 32 + q);
      }
    }
  } else if (o.kit && o.kit.ny && SPR.g.roof.wtower) { // New York: a stair bulkhead, the wooden water tower, HVAC, flues, skylights, the odd roof deck
    var area = polyArea(p), RG = SPR.g.roof, Rr = o.rect, hb = o.z0 + o.h, ux = Rr ? Rr.ux : 1, uy = Rr ? Rr.uy : 0, hl = Rr ? Rr.hl : (o.bb[2] - o.bb[0]) / 2, hd = Rr ? Rr.hd : (o.bb[3] - o.bb[1]) / 2;
    var at = function (a, b) { return [cx + ux * a * hl - uy * b * hd, cy + uy * a * hl + ux * b * hd]; }, q2;
    var small = area < 130 || hb < 14;   // a townhouse: a hatch, a skylight and a flue, no bulkhead or tank
    q2 = at((hh(s, 1, 120) - 0.5) * 0.8, 0.35); put(small ? (hh(s, 6, 120) < 0.5 ? "hatch" : "sky2") : hb > 40 && RG.elev ? "elev" : "bulk", q2[0], q2[1], 120);
    if (!small && hb > 14 && hb < 90 && area > 150 && hh(s, 2, 120) < (hb > 30 ? 0.6 : 0.45)) { q2 = at((hh(s, 3, 120) - 0.5) * 0.9, -0.15 + hh(s, 4, 120) * 0.3); put(hh(s, 5, 120) < 0.5 || !RG.wtower2 ? "wtower" : "wtower2", q2[0], q2[1], 121); }
    var cnt2 = small ? (hh(s, 7, 120) < 0.6 ? 1 : 0) : Math.min(12, 1 + Math.floor(area / 110));
    for (i = 0; i < cnt2 * 5 && R.length < cnt2 + 2; i++) {
      var x2 = o.bb[0] + 2 + hh(s, i, 96) * (o.bb[2] - o.bb[0] - 4), y2 = o.bb[1] + 2 + hh(s, i, 97) * (o.bb[3] - o.bb[1] - 4), r2 = hh(s, i, 98);
      if (stEdgeDist(o, x2, y2) < 1.4) continue;
      var t4 = small ? (r2 < 0.6 ? "flues" : "vent") : r2 < 0.25 ? "hvac" : r2 < 0.42 ? "acrow2" : r2 < 0.6 ? "flues" : r2 < 0.74 ? "sky2" : r2 < 0.88 ? "ac" : "vent";
      if (!RG[t4]) t4 = "vent";
      put(t4, x2, y2, 100 + i);
    }
  } else {
    var area = polyArea(p), cnt = Math.min(16, 3 + Math.floor(area / 60));
    if (SPR.g.roof.machine && area > 220) put("machine", cx + (hh(s, 3, 99) - 0.5) * 3, cy + (hh(s, 4, 99) - 0.5) * 3, 99);
    for (i = 0; i < cnt * 5 && R.length < cnt; i++) {
      var x = o.bb[0] + 2 + hh(s, i, 96) * (o.bb[2] - o.bb[0] - 4), y = o.bb[1] + 2 + hh(s, i, 97) * (o.bb[3] - o.bb[1] - 4), r = hh(s, i, 98);
      if (stEdgeDist(o, x, y) < 1.2) continue;
      var RG = SPR.g.roof, t3 = r < 0.3 ? "ac" : r < 0.45 ? "acrow" : r < 0.58 ? "vent" : r < 0.66 ? "ventbox" : r < 0.74 ? "dish" : r < 0.8 ? "antenna" : r < 0.86 ? "hatch" : r < 0.9 ? "solar" : r < 0.93 ? "tank" : r < 0.96 ? "pipes" : "skyflat";
      if (!RG[t3]) t3 = r < 0.5 ? "ac" : "vent";
      put(t3, x, y, 100 + i);
    }
  }
  o._ri = R;
  return R;
}
function sprCars() { var C = SPR.g.car; return C ? (CUR_LM === "nyc" && C.ny) || C.a || C[Object.keys(C)[0]] : null; } // the city's own traffic
var PROP_W = { hydrant: 0.9, subway: 4.2, hotdog: 2.6, newsbox: 2.2, mailbox: 1.0, bags: 2.0, wirecan: 1.0, citibike: 6.0, nytree: 3.2, barrier: 2.6, barrel: 1.0, newsstand: 4.0, nybus: 4.2, fruit: 3.2, planter: 2.6,
  ydeck: 4.4, grill: 1.4, gshed: 3.0, pots: 2.6, vbed: 3.0, ytable: 2.6, yfence: 3.0, lounge: 2.4, ybike: 1.9, playhouse: 2.4, yline: 3.6, tcans: 2.4, pcar: 2.0, lamp: 1.2, bin: 1.7, cafe: 3.2, kiosk: 3.9, bench: 2.4, sandbox: 3.8, swing: 3.8, flower: 3.0, bike: 2.1, busstop: 3.9, hedge: 3.0, fountain: 3.8, shed: 3.6, garages: 6.2, container: 4.4, transformer: 2.2, slide: 3.2, picnic: 3.0, rack: 2.6, laundry: 4.0, bins3: 3.6, birch: 3.4, lilac: 3.2, tyres: 2.8 };
function sprProp(out, msk, e, maxHT) {
  var o = e.o, G = o.k === 6 ? SPR.g.roof : SPR.g.prop, Lp = o.t === "pcar" ? sprCars() : G && (G[o.t] || null);
  if (!Lp || !Lp.length) return;
  var sp = Lp[((o.id >>> 3) & 0xffff) % Lp.length], sc = e.sc, D = (PROP_W[o.t] || 1.5) * sc;
  if (D < 2) return;
  if (o.k === 6) D = (ROOF_W[o.t] || 1) * sc;
  var m = sprMip(sp, D), s = D / m.w, Hh = m.h * s, P = SPR.px, AW = SPR.w;
  var flat = o.t === "pcar"; // lying on the ground (seen from above), centred on its point
  var cx = e.ax + o.x * sc, yb = e.yb, lift = (o.z || 0) * sc * STF, x0 = Math.round(cx - D / 2), y1 = Math.round(flat ? yb + Hh / 2 : yb - lift + D * 0.12), y0 = Math.round(y1 - Hh), x1 = x0 + Math.round(D);
  if (x1 <= 0 || y1 <= 0 || x0 >= TS || y0 >= TS) return;
  for (var py = Math.max(0, y0); py < Math.min(TS, y1); py++) {
    var v = Math.min(m.h - 1, ((py - y0 + 0.5) / s) | 0);
    for (var px = Math.max(0, x0); px < Math.min(TS, x1); px++) {
      var u = Math.min(m.w - 1, ((px - x0 + 0.5) / s) | 0), a = ((m.y + v) * AW + m.x + u) * 4;
      if (P[a + 3] < 128) continue;
      var q = py * TS + px;
      if (STROW[q] > (flat ? py + 0.5 : yb) + 0.6) continue;
      var sv = stShadow(px + ST.mxL + 0.5, (flat ? py + 0.5 : yb) + ST.myT, ((o.z || 0) + 0.6) * sc, maxHT, ST.ht), f = sv < 1 ? 1 - 0.36 * (1 - sv) : 1, q4 = q * 4;
      out[q4] = P[a] * f; out[q4 + 1] = P[a + 1] * f; out[q4 + 2] = Math.min(255, P[a + 2] * f * (sv < 1 ? 1.08 : 1));
      msk[q] = msk[q] === 1 ? 1 : 2;
    }
  }
}
var STL_SORT = function (a, b) { return a.yb - b.yb; };
function sprTrees(out, msk, maxHT) {
  var L = ST.tl, P = SPR.px, AW = SPR.w, ht = ST.ht, mxL = ST.mxL, myT = ST.myT, i;
  for (i = 0; i < L.length; i++) { var t = L[i]; t.yb = t.ay + t.o.y * t.sc; }
  L.sort(STL_SORT);
  for (i = 0; i < L.length; i++) {
    if (L[i].o.k === 5 || L[i].o.k === 6) { sprProp(out, msk, L[i], maxHT); continue; }
    var e = L[i], o = e.o, sc = e.sc, D = 2 * o.r * 1.12 * sc;
    if (D < 3) continue;
    var cx = e.ax + o.x * sc, yb = e.yb, hc = o.r * 0.95 * sc, cy = yb - hc * STF;
    var m = sprMip(sprTreeOf(o), D), s = D / m.w, Hh = m.h * s;
    var x0 = Math.round(cx - D / 2), y0 = Math.round(cy - Hh / 2), x1 = x0 + Math.round(D), y1 = y0 + Math.round(Hh);
    if (x1 <= 0 || y1 <= 0 || x0 >= TS || y0 >= TS) continue;
    var flip = (o.id >>> 20) & 1;
    for (var py = Math.max(0, y0); py < Math.min(TS, y1); py++) {
      var v = Math.min(m.h - 1, ((py - y0 + 0.5) / s) | 0), drow = yb + Math.max(py + 0.5 - cy, -o.r * sc * 0.3); // the crown leans over a nearby wall instead of being cut by it
      for (var px = Math.max(0, x0); px < Math.min(TS, x1); px++) {
        var u = Math.min(m.w - 1, ((px - x0 + 0.5) / s) | 0); if (flip) u = m.w - 1 - u;
        var a = ((m.y + v) * AW + m.x + u) * 4;
        if (P[a + 3] < 128) continue;
        var q = py * TS + px;
        if (STROW[q] > drow + 0.5) continue;               // something nearer to the viewer is here
        var sv = stShadow(px + mxL + 0.5, drow + myT, hc + 0.3 * sc, maxHT, ht), f = sv < 1 ? 1 - 0.36 * (1 - sv) : 1;
        var q4 = q * 4;
        out[q4] = P[a] * f; out[q4 + 1] = P[a + 1] * f; out[q4 + 2] = Math.min(255, P[a + 2] * f * (sv < 1 ? 1.08 : 1));
        msk[q] = 2;
      }
    }
  }
}
