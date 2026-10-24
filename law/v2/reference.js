// The reference simulation of law v2: every rule written as plainly as
// possible on one dense grid, every cell visited every tick, for checking the
// fast sim (sim.js) against. Same rules, same order, same integer arithmetic;
// when the two disagree, this one says what the law is.
//
// Per tick: the deposits that fall in it (dent, wear and tear under the nib),
// flow (peak, gall carried), then on dry ticks mix → settle (depth) → revive
// → dry (soak; cockle when a cell dries).

import {
  TILE, TICK_MS, DRY_EVERY, HT_PER_CELL, P_NONE, NIB_FLEX, NIB_BROAD, STEP_HT, BROAD_T_HT, CARRY_MS,
  CAP_REF, W_SAT, W_WET, W_EPS, C_SAT, G_LEVEL, G_RUN, G_PORE, G_WICK, G_MAX, DIAG_Q, G_MIX, SETTLE, ABSORB,
  EVAP_BASE, EVAP_EDGE, E_MIN, DRAIN_MAX_TICKS, SCALE_ONE,
  DENT_SHIFT, DENT_MAX, DENT_CAP, DENT_Z, DENT_THIRST, THICK, DEPTH_SHIFT, PEAK_SHIFT, REDISSOLVE,
  FILM_SHIFT, POROSITY, POROSITY_THIRST, SUPPLY_V, WIPE_MAX16, FEED_Q, DWELL_MS, RAIL_WIDE, RAIL_MIN, RAIL_MID, RAIL_TINE,
  SOAK_Q, SOAK_THIRST, SOAK_LINK, SOAK_PORE, SOAK_WICK, SOAK_FULL, WEAR_SHIFT, WEAR_STILL, STRENGTH_BASE, WET_K, SOAK_K, RIM_Z,
  COCKLE_MIN, COCKLE_MAX, TORN, DROP_REACH, DROP_R_MAX,
} from './constants.js';
import { ABS_Q, PRESS, PRESS_SHAPE, FLOW_Q, COSSIN_Q14 } from '../v1/tables.js';
import { DENT_Q, WEAR_Q, COCKLE } from './tables.js';
import { makePaper, NB_DX, NB_DY } from './paper.js';
import { floorDiv, ceilDiv, clamp, isqrt } from '../v1/int.js';
import { penTimeline } from './acts.js';
import { paperHasher } from '../v1/siphash.js';
import { splatter } from './splat.js';
import { GALL_ABS, isGall, darkAt, filmLevel } from './sim.js';

const FINE = 256;
const pieceLength = (dx, dy) => {
  const d2 = dx * dx + dy * dy;
  return d2 < 2 ** 36 ? isqrt(d2 * FINE * FINE) : isqrt(d2) * FINE;
};

export function growReference(rec, { paperKey, family, scale = SCALE_ONE, margin = 64, gallAgeH = 0 }) {
  const timeline = penTimeline(rec);
  const hx = (x) => 20 * rec.orgX + floorDiv(2 * x * scale, SCALE_ONE);
  const hy = (y) => 20 * rec.orgY + floorDiv(2 * y * scale, SCALE_ONE);

  let maxW = 0;
  for (const pens of timeline) for (const [, pen] of pens) maxW = Math.max(maxW, 2 * (pen.size + (pen.nib === NIB_FLEX ? pen.flex : 0)), BROAD_T_HT);
  const reach = floorDiv(floorDiv((maxW + DROP_REACH + DROP_R_MAX) * scale, SCALE_ONE), HT_PER_CELL) + 2 + margin; // the nib, and as far as a drop can fly
  let cx0 = Infinity, cy0 = Infinity, cx1 = -Infinity, cy1 = -Infinity;
  for (const s of rec.strokes) {
    for (let i = 0; i < s.x.length; i++) {
      const cx = floorDiv(hx(s.x[i]), HT_PER_CELL), cy = floorDiv(hy(s.y[i]), HT_PER_CELL);
      cx0 = Math.min(cx0, cx);
      cy0 = Math.min(cy0, cy);
      cx1 = Math.max(cx1, cx);
      cy1 = Math.max(cy1, cy);
    }
  }
  const X0 = floorDiv(cx0 - reach, TILE) * TILE, Y0 = floorDiv(cy0 - reach, TILE) * TILE;
  const X1 = (floorDiv(cx1 + reach, TILE) + 1) * TILE, Y1 = (floorDiv(cy1 + reach, TILE) + 1) * TILE;
  const GW = X1 - X0, GH = Y1 - Y0, N = GW * GH;

  const paper = makePaper(paperKey, family);
  const cap = new Int32Array(N), hold = new Int32Array(N), siz = new Int32Array(N), z = new Int32Array(N), ridge = new Int32Array(N);
  const link = new Int32Array(N * 8);
  for (let ty = Y0; ty < Y1; ty += TILE) {
    for (let tx = X0; tx < X1; tx += TILE) {
      const f = paper.tileFields(tx, ty);
      for (let k = 0; k < TILE * TILE; k++) {
        const c = (ty - Y0 + Math.floor(k / TILE)) * GW + (tx - X0 + (k % TILE));
        cap[c] = f.cap[k];
        hold[c] = f.hold[k];
        siz[c] = f.siz[k];
        z[c] = f.z[k];
        ridge[c] = f.ridge[k];
        for (let n = 0; n < 8; n++) link[c * 8 + n] = f.link[k * 8 + n];
      }
    }
  }
  const W = new Int32Array(N), P = new Int32Array(N * 3), F = new Int32Array(N * 3), G = new Int32Array(N), FG = new Int32Array(N);
  const dentA = new Int32Array(N), depthA = new Int32Array(N), peak = new Int32Array(N), soakA = new Int32Array(N);
  const wearA = new Int32Array(N), flags = new Int32Array(N), rim = new Int32Array(N), cockle = new Int32Array(N);
  const drainA = new Int32Array(N), filmA = new Int32Array(N);
  const lost = { W: 0, P: 0, F: 0, G: 0 };
  const at = (cx, cy) => (cy - Y0) * GW + (cx - X0);
  const nbOf = (c, n) => {
    const x = (c % GW) + NB_DX[n], y = Math.floor(c / GW) + NB_DY[n];
    if (x < 0 || y < 0 || x >= GW || y >= GH) throw new Error('ink reached the reference grid border; give it a wider margin');
    return y * GW + x;
  };
  const wetCount = () => {
    let n = 0;
    for (let c = 0; c < N; c++) if (W[c] > 0) n++;
    return n;
  };
  const dentL = (c) => dentA[c] >> DENT_SHIFT;
  const soakL = (c) => Math.min(255, soakA[c] >> 8);
  const capE = (c) => cap[c] + dentL(c) * DENT_CAP;
  const zE = (c) => z[c] - dentL(c) * DENT_Z + cockle[c] - rim[c] * RIM_Z;
  const washed = (c) => Math.min(SOAK_FULL, soakA[c] >> 8);
  const thirstE = (c) => clamp(siz[c] + floorDiv(washed(c) * SOAK_THIRST - dentL(c) * DENT_THIRST, 256), 0, 15);
  const SINK_W = [2, 1, 2, 1, 2, 1, 2, 1];
  const liquidIn = (c) => Math.min(W[c], capE(c)) + drainA[c];
  const sink = (c) => {
    let vol = 4 * liquidIn(c);
    let th = 4 * thirstE(c);
    for (let n = 0; n < 8; n++) {
      const j = nbOf(c, n);
      vol += SINK_W[n] * liquidIn(j);
      th += SINK_W[n] * thirstE(j);
    }
    depthA[c] = Math.max(depthA[c], Math.min(THICK << DEPTH_SHIFT, floorDiv(vol * 1024 * POROSITY_THIRST, POROSITY * (16 * POROSITY_THIRST - th))));
  };
  const snap = (c) => {
    for (let ch = 0; ch < 3; ch++) {
      F[3 * c + ch] = Math.min(65535, F[3 * c + ch] + P[3 * c + ch]);
      filmA[c] += P[3 * c + ch];
      P[3 * c + ch] = 0;
    }
    FG[c] = Math.min(65535, FG[c] + G[c]);
    filmA[c] += G[c];
    G[c] = 0;
    const sl = soakL(c);
    if (sl >= COCKLE_MIN) {
      const k = floorDiv(COCKLE_MAX * COCKLE[sl] * ridge[c], 65536);
      if (k > cockle[c]) cockle[c] = k;
    }
  };
  const tear = (c) => {
    flags[c] |= TORN;
    lost.W += W[c];
    W[c] = 0;
    for (let ch = 0; ch < 3; ch++) {
      lost.P += P[3 * c + ch];
      lost.F += F[3 * c + ch];
      P[3 * c + ch] = 0;
      F[3 * c + ch] = 0;
    }
    lost.G += G[c] + FG[c];
    G[c] = 0;
    FG[c] = 0;
    filmA[c] = 0;
    for (let n = 0; n < 8; n++) {
      const j = nbOf(c, n);
      if (rim[j] < 8) rim[j]++;
    }
  };

  // --- the nib ---
  let pen = null;
  let gall = false;
  let carry = 0;
  const sc = (v) => floorDiv(v * scale, SCALE_ONE);
  const widthAt = (p) => {
    if (pen.nib === NIB_FLEX) return sc(2 * (pen.size + floorDiv(pen.flex * PRESS_SHAPE[p], 256)));
    const base = sc(2 * pen.size);
    return pen.nib === NIB_BROAD ? base : floorDiv(base * (224 + floorDiv(p * 64, 255)), 256);
  };
  const setPen = (p) => {
    pen = p;
    gall = isGall(p.rgb);
  };
  function stamp(px, py, w, amt, p, dd, moving, drop = false) {
    const cells = [];
    let sum = 0;
    let top = 0;
    let spread = 0;
    if ((pen.nib === NIB_BROAD || pen.nib === NIB_FLEX) && !drop) {
      const a = floorDiv(w, 2);
      const b = pen.nib === NIB_FLEX ? Math.max(HT_PER_CELL >> 1, sc(pen.size)) : floorDiv(sc(BROAD_T_HT), 2);
      if (pen.nib === NIB_FLEX) spread = a;
      const cos = COSSIN_Q14[2 * pen.angle], sin = COSSIN_Q14[2 * pen.angle + 1];
      const r = a + b + HT_PER_CELL;
      for (let cy = floorDiv(py - r, HT_PER_CELL); cy <= floorDiv(py + r, HT_PER_CELL); cy++) {
        for (let cx = floorDiv(px - r, HT_PER_CELL); cx <= floorDiv(px + r, HT_PER_CELL); cx++) {
          const dx = cx * HT_PER_CELL + 5 - px, dy = cy * HT_PER_CELL + 5 - py;
          const u = floorDiv(dx * cos + dy * sin, 16384), v = floorDiv(dy * cos - dx * sin, 16384);
          const g = clamp(a - Math.abs(u), 0, HT_PER_CELL) * clamp(b - Math.abs(v), 0, HT_PER_CELL);
          if (g > 0) {
            cells.push([cx, cy, g, Math.abs(u)]);
            sum += g;
            top = Math.max(top, g);
          }
        }
      }
    } else {
      const R = floorDiv(w, 2);
      for (let cy = floorDiv(py - R, HT_PER_CELL); cy <= floorDiv(py + R, HT_PER_CELL); cy++) {
        for (let cx = floorDiv(px - R, HT_PER_CELL); cx <= floorDiv(px + R, HT_PER_CELL); cx++) {
          const dx = cx * HT_PER_CELL + 5 - px, dy = cy * HT_PER_CELL + 5 - py;
          const g = R * R - dx * dx - dy * dy;
          if (g > 0) {
            cells.push([cx, cy, g, 0]);
            sum += g;
            top = Math.max(top, g);
          }
        }
      }
    }
    if (sum === 0) {
      cells.push([floorDiv(px, HT_PER_CELL), floorDiv(py, HT_PER_CELL), 1, 0]);
      sum = 1;
      top = 1;
      spread = 0;
    }
    let sumI = sum;
    let inkOf = (k) => cells[k][2];
    if (spread >= sc(RAIL_WIDE) && amt < RAIL_MIN * cells.length) {
      const inner = spread - sc(RAIL_TINE);
      const wts = cells.map(([, , g, u]) => (u < inner ? floorDiv(g * RAIL_MID, 256) : g));
      const s2 = wts.reduce((a, b) => a + b, 0);
      if (s2 > 0) {
        sumI = s2;
        inkOf = (k) => wts[k];
      }
    }
    let given = 0;
    for (let k = 0; k < cells.length; k++) {
      const [cx, cy, wt] = cells[k];
      const c = at(cx, cy);
      if (flags[c] & TORN) continue;
      if (dd > 0) dentA[c] = Math.min(DENT_MAX << DENT_SHIFT, dentA[c] + floorDiv(dd * wt, top));
      if (!drop && W[c] >= W_WET) {
        wearA[c] += floorDiv((moving ? WEAR_Q[p] : WEAR_Q[p] >> WEAR_STILL) * wt, top);
        const strength = STRENGTH_BASE - floorDiv(W[c] * WET_K + soakL(c) * SOAK_K, 256);
        if (wearA[c] >> WEAR_SHIFT > strength) {
          tear(c);
          continue;
        }
      }
      const room = W_SAT - W[c];
      if (room <= 0) continue;
      const g = Math.min(floorDiv(amt * inkOf(k), sumI), room);
      if (g <= 0) continue;
      W[c] += g;
      if (gall) G[c] += floorDiv(g * GALL_ABS, 256);
      else {
        P[3 * c] += floorDiv(g * ABS_Q[pen.rgb[0]], 256);
        P[3 * c + 1] += floorDiv(g * ABS_Q[pen.rgb[1]], 256);
        P[3 * c + 2] += floorDiv(g * ABS_Q[pen.rgb[2]], 256);
      }
      given += g;
    }
    return amt - given;
  }
  let travel = 0;
  let dwellMs = 0;
  const splat = { drops: 0, W: 0 };
  const H = paperHasher(paperKey.subarray(0, 16));
  const hh = [0, 0];
  function depositTick(segs, drops) {
    let wipe = 0;
    let feed = 0;
    let dent = 0;
    let tickMs = 0;
    for (const sg of segs) {
      const pa = floorDiv(sg.p0 + sg.p1, 2);
      const unit = floorDiv(FLOW_Q[pen.flow] * widthAt(pa) * PRESS[pa] * scale, SCALE_ONE);
      wipe += unit * Math.min(WIPE_MAX16, floorDiv(pieceLength(sg.x1 - sg.x0, sg.y1 - sg.y0) * 16, SUPPLY_V));
      feed += unit * sg.dt * 16;
      dent += DENT_Q[pa] * sg.dt;
      tickMs += sg.dt;
    }
    const D = HT_PER_CELL * 256 * 16 * SCALE_ONE;
    const stamps = [];
    for (const sg of segs) {
      const dx = sg.x1 - sg.x0, dy = sg.y1 - sg.y0;
      const L = pieceLength(dx, dy);
      if (L === 0) continue;
      let next = STEP_HT * FINE - travel;
      while (next <= L) {
        stamps.push([sg.x0 + floorDiv(dx * next, L), sg.y0 + floorDiv(dy * next, L), sg.p0 + floorDiv((sg.p1 - sg.p0) * next, L)]);
        next += STEP_HT * FINE;
      }
      travel = (travel + L) % (STEP_HT * FINE);
    }
    const end = segs[segs.length - 1];
    const moving = stamps.length > 0;
    if (!moving) {
      stamps.push([end.x1, end.y1, end.p1]);
      travel = 0;
    }
    dwellMs = moving ? 0 : dwellMs + tickMs;
    const fill = Math.min(256, floorDiv(W[at(floorDiv(end.x1, HT_PER_CELL), floorDiv(end.y1, HT_PER_CELL))] * 256, W_SAT));
    const fed = dwellMs > DWELL_MS ? 0 : floorDiv(floorDiv(feed, 256) * FEED_Q, 256) * (256 - fill);
    const total = pen.flow === 0 ? 0 : floorDiv(wipe + fed, HT_PER_CELL * 256 * 16 * 16) + carry;
    let left = 0;
    stamps.forEach(([x, y, p], m) => {
      const amt = floorDiv(total * (m + 1), stamps.length) - floorDiv(total * m, stamps.length);
      const dd = floorDiv(dent * (m + 1), stamps.length) - floorDiv(dent * m, stamps.length);
      left += stamp(x, y, widthAt(p), amt, p, dd, moving);
    });
    carry = pen.flow === 0 ? 0 : Math.min(left, floorDiv(FLOW_Q[pen.flow] * widthAt(end.p1) * 256 * CARRY_MS * scale, D));
    for (const [x, y, r, amt] of drops) {
      splat.drops++;
      splat.W += amt - stamp(x, y, 2 * r, amt, 0, 0, false, true);
    }
  }

  // --- the rules ---
  function flow() {
    const dW = new Int32Array(N), dP = new Int32Array(N * 3), dG = new Int32Array(N);
    for (let c = 0; c < N; c++) {
      const Wi = W[c];
      if (Wi <= 0) continue;
      const s = Wi - capE(c);
      const sPos = Math.max(s, 0);
      peak[c] = Math.max(peak[c], Math.min(255, sPos >> PEAK_SHIFT));
      const sl = soakL(c);
      for (let n = 0; n < 8; n++) {
        const j = nbOf(c, n);
        if (flags[j] & TORN) continue;
        const d = s + zE(c) - (W[j] - capE(j) + zE(j));
        if (d <= 0) continue;
        const dryJ = W[j] < W_WET;
        let gs = s > 0 && (!dryJ || s > hold[c]) ? (dryJ ? G_RUN : G_LEVEL) : 0;
        let gp = dryJ ? G_WICK + SOAK_WICK * washed(j) : G_PORE + SOAK_PORE * sl;
        if (n & 1) {
          gs = floorDiv(gs * DIAG_Q, 256);
          gp = floorDiv(gp * DIAG_Q, 256);
        }
        let lk = link[c * 8 + n];
        if (lk && sl) lk += floorDiv(lk * sl * SOAK_LINK, 256);
        gp += lk;
        if (gs + gp > G_MAX) gp = G_MAX - gs;
        const q = floorDiv(Math.min(d, sPos) * gs + Math.min(d, Wi) * gp, 4096);
        if (q <= 0) continue;
        dW[c] -= q;
        dW[j] += q;
        for (let ch = 0; ch < 3; ch++) {
          const m = floorDiv(P[3 * c + ch] * q, Wi);
          dP[3 * c + ch] -= m;
          dP[3 * j + ch] += m;
        }
        if (G[c]) {
          const m = floorDiv(G[c] * q, Wi);
          dG[c] -= m;
          dG[j] += m;
        }
      }
    }
    for (let c = 0; c < N; c++) {
      if (dW[c] === 0 && dP[3 * c] === 0 && dP[3 * c + 1] === 0 && dP[3 * c + 2] === 0 && dG[c] === 0) continue;
      const was = W[c];
      W[c] += dW[c];
      for (let ch = 0; ch < 3; ch++) P[3 * c + ch] += dP[3 * c + ch];
      G[c] += dG[c];
      if (was > 0 && W[c] === 0) snap(c);
    }
  }
  function mix() {
    const dP = new Int32Array(N * 3), dG = new Int32Array(N);
    for (let c = 0; c < N; c++) {
      const Wi = W[c];
      if (Wi <= 0) continue;
      for (const n of [0, 2]) {
        const j = nbOf(c, n);
        const Wj = W[j];
        if (Wj <= 0) continue;
        for (let ch = 0; ch < 3; ch++) {
          const x = P[3 * c + ch] * Wj - P[3 * j + ch] * Wi;
          if (x === 0) continue;
          const m = floorDiv(Math.abs(x) * G_MIX, (Wi + Wj) * 4096);
          const sgn = x > 0 ? 1 : -1;
          dP[3 * c + ch] -= sgn * m;
          dP[3 * j + ch] += sgn * m;
        }
        const x = G[c] * Wj - G[j] * Wi;
        if (x !== 0) {
          const m = floorDiv(Math.abs(x) * G_MIX, (Wi + Wj) * 4096);
          const sgn = x > 0 ? 1 : -1;
          dG[c] -= sgn * m;
          dG[j] += sgn * m;
        }
      }
    }
    for (let k = 0; k < N * 3; k++) P[k] += dP[k];
    for (let c = 0; c < N; c++) G[c] += dG[c];
  }
  function settle() {
    for (let c = 0; c < N; c++) {
      const Wi = W[c];
      if (Wi <= 0) continue;
      const th = thirstE(c);
      const inPaper = Math.min(Wi, capE(c));
      for (let ch = 0; ch < 3; ch++) {
        const p = P[3 * c + ch];
        if (p <= 0) continue;
        const f = Math.min(p, ceilDiv(p * SETTLE[th] * inPaper, Wi * 65536));
        P[3 * c + ch] = p - f;
        F[3 * c + ch] = Math.min(65535, F[3 * c + ch] + f);
      }
      if (G[c] > 0) {
        const g = G[c];
        const f = Math.min(g, ceilDiv(g * SETTLE[th] * inPaper, Wi * 65536));
        G[c] = g - f;
        FG[c] = Math.min(65535, FG[c] + f);
      }
    }
  }
  function revive() {
    for (let c = 0; c < N; c++) {
      const Wi = W[c];
      if (Wi <= 0) continue;
      let back = 0;
      for (let ch = 0; ch < 3; ch++) {
        const r = floorDiv(F[3 * c + ch] * REDISSOLVE * Wi, W_SAT * 65536);
        F[3 * c + ch] -= r;
        P[3 * c + ch] += r;
        back += r;
      }
      const keep = 256 - darkAt(depthA[c] >> DEPTH_SHIFT, filmLevel(filmA[c]), gallAgeH);
      const r = floorDiv(FG[c] * REDISSOLVE * Wi * keep, W_SAT * 65536 * 256);
      FG[c] -= r;
      G[c] += r;
      back += r;
      if (back) filmA[c] = Math.max(0, filmA[c] - back);
    }
  }
  function dry() {
    const loss = new Int32Array(N);
    const wasWet = [];
    for (let c = 0; c < N; c++) {
      if (W[c] <= 0) continue;
      wasWet.push(c);
      let nd = 0;
      for (let n = 0; n < 8; n++) if (W[nbOf(c, n)] < W_WET) nd++;
      loss[c] = Math.max(E_MIN, ceilDiv((EVAP_BASE + EVAP_EDGE * nd) * CAP_REF + ABSORB[thirstE(c)] * Math.min(W[c], capE(c)), 65536));
    }
    for (let c = 0; c < N; c++) {
      if (W[c] <= 0) continue;
      soakA[c] = Math.min(255 << 8, soakA[c] + floorDiv(W[c] * SOAK_Q, W_SAT));
      let w = W[c] - Math.min(loss[c], W[c]);
      if (w < W_EPS) w = 0;
      drainA[c] += W[c] - w;
      W[c] = w;
      if (w === 0) {
        snap(c);
        continue;
      }
      const capP = floorDiv(w * C_SAT, 256);
      for (let ch = 0; ch < 3; ch++) {
        if (P[3 * c + ch] > capP) {
          F[3 * c + ch] = Math.min(65535, F[3 * c + ch] + P[3 * c + ch] - capP);
          filmA[c] += P[3 * c + ch] - capP;
          P[3 * c + ch] = capP;
        }
      }
      if (G[c] > capP) {
        FG[c] = Math.min(65535, FG[c] + G[c] - capP);
        filmA[c] += G[c] - capP;
        G[c] = capP;
      }
    }
    for (const c of wasWet) sink(c);
  }

  let now = 0;
  const step = (k) => {
    flow();
    if (k % DRY_EVERY === DRY_EVERY - 1) {
      mix();
      settle();
      revive();
      dry();
    }
  };
  const runUntil = (k) => {
    while (now < k) {
      if (wetCount() === 0) {
        now = k;
        break;
      }
      step(now);
      now++;
    }
  };

  let lastT = 0;
  let pending = null;
  const flush = () => {
    if (pending) depositTick(pending.segs, pending.drops);
    pending = null;
  };
  rec.strokes.forEach((s, si) => {
    const pens = timeline[si];
    let k = 0;
    flush();
    setPen(pens[0][1]);
    const p = (i) => (s.hasP ? s.p[i] : P_NONE);
    runUntil(floorDiv(s.t[0], TICK_MS));
    carry = 0;
    travel = 0;
    let ax = hx(s.x[0]), ay = hy(s.y[0]), ap = p(0), at0 = s.t[0];
    let pdx = 0, pdy = 0;
    dwellMs = 0;
    for (let i = 1; i < s.x.length; i++) {
      while (k + 1 < pens.length && pens[k + 1][0] <= i - 1) {
        flush();
        setPen(pens[++k][1]);
      }
      const X = hx(s.x[i]), Y = hy(s.y[i]), pi = p(i), t = s.t[i];
      const dt = t - at0;
      let tau = at0, pxs = ax, pys = ay, pps = ap;
      while (tau < t) {
        const tick = floorDiv(tau, TICK_MS);
        const tb = Math.min(t, (tick + 1) * TICK_MS);
        const f = tb - at0;
        const pxe = ax + floorDiv((X - ax) * f, dt), pye = ay + floorDiv((Y - ay) * f, dt), ppe = ap + floorDiv((pi - ap) * f, dt);
        if (pending && pending.tick !== tick) flush();
        if (!pending) {
          runUntil(tick);
          pending = { tick, segs: [], drops: [] };
        }
        pending.segs.push({ x0: pxs, y0: pys, p0: pps, x1: pxe, y1: pye, p1: ppe, dt: tb - tau });
        pxs = pxe;
        pys = pye;
        pps = ppe;
        tau = tb;
      }
      if (pen.spatter) {
        pending.drops.push(...splatter(H, hh, {
          si, i, x0: ax, y0: ay, x1: X, y1: Y, pdx, pdy, dt, p: pi, flow: pen.flow, spatter: pen.spatter,
          tooth: z[at(floorDiv(X, HT_PER_CELL), floorDiv(Y, HT_PER_CELL))], scale,
        }));
      }
      pdx = X - ax;
      pdy = Y - ay;
      ax = X;
      ay = Y;
      ap = pi;
      at0 = t;
      lastT = t;
    }
  });
  flush();
  runUntil(floorDiv(lastT, TICK_MS) + 1);
  for (let drained = 0; wetCount() > 0 && drained < DRAIN_MAX_TICKS; drained++) {
    step(now);
    now++;
  }
  const lastWet = [];
  for (let c = 0; c < N; c++) {
    if (W[c] > 0) {
      drainA[c] += W[c];
      W[c] = 0;
      lastWet.push(c);
      snap(c);
    }
  }
  for (const c of lastWet) sink(c);

  // Cells with any fact, sorted (y, x): the same shape as look.settledCells.
  const cells = [];
  for (let c = 0; c < N; c++) {
    const row = [F[3 * c], F[3 * c + 1], F[3 * c + 2], FG[c], dentA[c] >> DENT_SHIFT, Math.min(THICK, depthA[c] >> DEPTH_SHIFT),
      peak[c], Math.min(255, soakA[c] >> 8), Math.min(255, wearA[c] >> WEAR_SHIFT), flags[c], cockle[c], filmLevel(filmA[c])];
    if (row.some((v) => v)) cells.push([Y0 + Math.floor(c / GW), X0 + (c % GW), ...row]);
  }
  return { cells, ticks: now, lost, splat };
}
