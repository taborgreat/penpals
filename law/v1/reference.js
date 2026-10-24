// The reference simulation: the law of flow written as plainly as possible,
// for checking the fast one (sim.js) against. One dense grid over the writing,
// every cell visited every tick, no tiles, no wet lists, no deltas shared
// between tiles. Slow, and meant to be: when the two disagree, this one says
// what the law is. Same rules, same order, same integer arithmetic.
//
// The only shortcut is exact: when no cell holds water a tick changes nothing,
// so runs of such ticks are skipped (sim.js does the same).
//
// The grid must hold all the ink. If water reaches the grid's border the run
// stops with an error rather than inventing a wall the law does not have.

import {
  TILE, TICK_MS, DRY_EVERY, HT_PER_CELL, P_NONE, NIB_FLEX, NIB_BROAD, STEP_HT, BROAD_T_HT, CARRY_MS,
  CAP_REF, W_SAT, W_WET, W_EPS, C_SAT, G_LEVEL, G_RUN, G_PORE, G_WICK, G_MAX, DIAG_Q, G_MIX, SETTLE, ABSORB,
  EVAP_BASE, EVAP_EDGE, E_MIN, DRAIN_MAX_TICKS, SCALE_ONE,
} from './constants.js';
import { ABS_Q, PRESS, PRESS_SHAPE, FLOW_Q, COSSIN_Q14 } from './tables.js';
import { makePaper, NB_DX, NB_DY } from './paper.js';
import { floorDiv, ceilDiv, clamp, isqrt } from './int.js';

const FINE = 256; // travel is measured in 1/256 of a half-tenth
const pieceLength = (dx, dy) => {
  const d2 = dx * dx + dy * dy;
  return d2 < 2 ** 36 ? isqrt(d2 * FINE * FINE) : isqrt(d2) * FINE;
};
import { penTimeline } from './acts.js';

// rec: decoded acts. margin: cells of paper around the writing's footprint.
export function growReference(rec, { paperKey, family, scale = SCALE_ONE, margin = 64 }) {
  const timeline = penTimeline(rec);
  const hx = (x) => 20 * rec.orgX + floorDiv(2 * x * scale, SCALE_ONE);
  const hy = (y) => 20 * rec.orgY + floorDiv(2 * y * scale, SCALE_ONE);

  // The grid: every act's cell, widened by the widest nib and the margin.
  let maxW = 0;
  for (const pens of timeline) for (const [, pen] of pens) maxW = Math.max(maxW, 2 * (pen.size + (pen.nib === NIB_FLEX ? pen.flex : 0)), BROAD_T_HT);
  const reach = floorDiv(floorDiv(maxW * scale, SCALE_ONE), HT_PER_CELL) + 2 + margin;
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
  // Align to whole tiles so the paper can be read tile by tile.
  const X0 = floorDiv(cx0 - reach, TILE) * TILE, Y0 = floorDiv(cy0 - reach, TILE) * TILE;
  const X1 = (floorDiv(cx1 + reach, TILE) + 1) * TILE, Y1 = (floorDiv(cy1 + reach, TILE) + 1) * TILE;
  const GW = X1 - X0, GH = Y1 - Y0, N = GW * GH;

  const paper = makePaper(paperKey, family);
  const cap = new Int32Array(N), hold = new Int32Array(N), siz = new Int32Array(N), z = new Int32Array(N);
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
        for (let n = 0; n < 8; n++) link[c * 8 + n] = f.link[k * 8 + n];
      }
    }
  }
  const W = new Int32Array(N), P = new Int32Array(N * 3), F = new Int32Array(N * 3);
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
  const snap = (c) => {
    for (let ch = 0; ch < 3; ch++) {
      F[3 * c + ch] = Math.min(65535, F[3 * c + ch] + P[3 * c + ch]);
      P[3 * c + ch] = 0;
    }
  };

  // --- the nib ---
  let pen = null;
  let carry = 0;
  const sc = (v) => floorDiv(v * scale, SCALE_ONE);
  const widthAt = (p) => {
    if (pen.nib === NIB_FLEX) return sc(2 * (pen.size + floorDiv(pen.flex * PRESS_SHAPE[p], 256)));
    const base = sc(2 * pen.size);
    return pen.nib === NIB_BROAD ? base : floorDiv(base * (224 + floorDiv(p * 64, 255)), 256);
  };
  function stamp(px, py, w, amt) {
    const cells = [];
    let sum = 0;
    if (pen.nib === NIB_BROAD) {
      const a = floorDiv(w, 2), b = floorDiv(sc(BROAD_T_HT), 2);
      const cos = COSSIN_Q14[2 * pen.angle], sin = COSSIN_Q14[2 * pen.angle + 1];
      const r = a + b + HT_PER_CELL;
      for (let cy = floorDiv(py - r, HT_PER_CELL); cy <= floorDiv(py + r, HT_PER_CELL); cy++) {
        for (let cx = floorDiv(px - r, HT_PER_CELL); cx <= floorDiv(px + r, HT_PER_CELL); cx++) {
          const dx = cx * HT_PER_CELL + 5 - px, dy = cy * HT_PER_CELL + 5 - py;
          const u = floorDiv(dx * cos + dy * sin, 16384), v = floorDiv(dy * cos - dx * sin, 16384);
          const g = clamp(a - Math.abs(u), 0, HT_PER_CELL) * clamp(b - Math.abs(v), 0, HT_PER_CELL);
          if (g > 0) {
            cells.push([cx, cy, g]);
            sum += g;
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
            cells.push([cx, cy, g]);
            sum += g;
          }
        }
      }
    }
    if (sum === 0) {
      cells.push([floorDiv(px, HT_PER_CELL), floorDiv(py, HT_PER_CELL), 1]);
      sum = 1;
    }
    let given = 0;
    for (const [cx, cy, wt] of cells) {
      const c = at(cx, cy);
      const room = W_SAT - W[c];
      if (room <= 0) continue;
      const g = Math.min(floorDiv(amt * wt, sum), room);
      if (g <= 0) continue;
      W[c] += g;
      P[3 * c] += floorDiv(g * ABS_Q[pen.rgb[0]], 256);
      P[3 * c + 1] += floorDiv(g * ABS_Q[pen.rgb[1]], 256);
      P[3 * c + 2] += floorDiv(g * ABS_Q[pen.rgb[2]], 256);
      given += g;
    }
    return amt - given;
  }
  // One tick's path, stamped as a whole: a stamp every STEP_HT of travel along
  // the stroke (remainder carried), or one at the tick's end if no stamp fell.
  let travel = 0;
  function depositTick(segs) {
    if (pen.flow === 0) return;
    let num = 0;
    for (const sg of segs) {
      const pa = floorDiv(sg.p0 + sg.p1, 2);
      num += FLOW_Q[pen.flow] * widthAt(pa) * PRESS[pa] * sg.dt * scale;
    }
    const D = HT_PER_CELL * 256 * 16 * SCALE_ONE;
    const total = floorDiv(num, D) + carry;
    const stamps = [];
    for (const sg of segs) {
      const dx = sg.x1 - sg.x0, dy = sg.y1 - sg.y0;
      const L = pieceLength(dx, dy);
      if (L === 0) continue;
      let next = STEP_HT * FINE - travel; // distance along this piece to the next stamp
      while (next <= L) {
        stamps.push([sg.x0 + floorDiv(dx * next, L), sg.y0 + floorDiv(dy * next, L), sg.p0 + floorDiv((sg.p1 - sg.p0) * next, L)]);
        next += STEP_HT * FINE;
      }
      travel = (travel + L) % (STEP_HT * FINE);
    }
    const end = segs[segs.length - 1];
    if (stamps.length === 0) {
      stamps.push([end.x1, end.y1, end.p1]);
      travel = 0;
    }
    let left = 0;
    stamps.forEach(([x, y, p], m) => {
      const amt = floorDiv(total * (m + 1), stamps.length) - floorDiv(total * m, stamps.length);
      left += stamp(x, y, widthAt(p), amt);
    });
    carry = Math.min(left, floorDiv(FLOW_Q[pen.flow] * widthAt(end.p1) * 256 * CARRY_MS * scale, D));
  }

  // --- the rules ---
  function flow() {
    const dW = new Int32Array(N), dP = new Int32Array(N * 3);
    for (let c = 0; c < N; c++) {
      const Wi = W[c];
      if (Wi <= 0) continue;
      const s = Wi - cap[c];
      for (let n = 0; n < 8; n++) {
        const j = nbOf(c, n);
        const d = s + z[c] - (W[j] - cap[j] + z[j]);
        if (d <= 0) continue;
        const dryJ = W[j] < W_WET;
        let gs = s > 0 && (!dryJ || s > hold[c]) ? (dryJ ? G_RUN : G_LEVEL) : 0;
        let gp = dryJ ? G_WICK : G_PORE;
        if (n & 1) {
          gs = floorDiv(gs * DIAG_Q, 256);
          gp = floorDiv(gp * DIAG_Q, 256);
        }
        gp += link[c * 8 + n];
        if (gs + gp > G_MAX) gp = G_MAX - gs;
        const q = floorDiv(Math.min(d, Math.max(s, 0)) * gs + Math.min(d, Wi) * gp, 4096);
        if (q <= 0) continue;
        dW[c] -= q;
        dW[j] += q;
        for (let ch = 0; ch < 3; ch++) {
          const m = floorDiv(P[3 * c + ch] * q, Wi);
          dP[3 * c + ch] -= m;
          dP[3 * j + ch] += m;
        }
      }
    }
    for (let c = 0; c < N; c++) {
      if (dW[c] === 0 && dP[3 * c] === 0 && dP[3 * c + 1] === 0 && dP[3 * c + 2] === 0) continue;
      const was = W[c];
      W[c] += dW[c];
      for (let ch = 0; ch < 3; ch++) P[3 * c + ch] += dP[3 * c + ch];
      if (was > 0 && W[c] === 0) snap(c);
    }
  }
  function mix() {
    const dP = new Int32Array(N * 3);
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
      }
    }
    for (let k = 0; k < N * 3; k++) P[k] += dP[k];
  }
  function settle() {
    for (let c = 0; c < N; c++) {
      const Wi = W[c];
      if (Wi <= 0) continue;
      for (let ch = 0; ch < 3; ch++) {
        const p = P[3 * c + ch];
        if (p <= 0) continue;
        const f = Math.min(p, ceilDiv(p * SETTLE[siz[c]] * Math.min(Wi, cap[c]), Wi * 65536));
        P[3 * c + ch] = p - f;
        F[3 * c + ch] = Math.min(65535, F[3 * c + ch] + f);
      }
    }
  }
  function dry() {
    const loss = new Int32Array(N);
    for (let c = 0; c < N; c++) {
      if (W[c] <= 0) continue;
      let nd = 0;
      for (let n = 0; n < 8; n++) if (W[nbOf(c, n)] < W_WET) nd++;
      loss[c] = Math.max(E_MIN, ceilDiv((EVAP_BASE + EVAP_EDGE * nd) * CAP_REF + ABSORB[siz[c]] * Math.min(W[c], cap[c]), 65536));
    }
    for (let c = 0; c < N; c++) {
      if (W[c] <= 0) continue;
      let w = W[c] - Math.min(loss[c], W[c]);
      if (w < W_EPS) w = 0;
      W[c] = w;
      if (w === 0) {
        snap(c);
        continue;
      }
      const capP = floorDiv(w * C_SAT, 256);
      for (let ch = 0; ch < 3; ch++) {
        if (P[3 * c + ch] > capP) {
          F[3 * c + ch] = Math.min(65535, F[3 * c + ch] + P[3 * c + ch] - capP);
          P[3 * c + ch] = capP;
        }
      }
    }
  }

  let now = 0;
  const step = (k) => {
    flow();
    if (k % DRY_EVERY === DRY_EVERY - 1) {
      mix();
      settle();
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
  let pending = null; // { tick, segs } not yet deposited
  const flush = () => {
    if (pending) depositTick(pending.segs);
    pending = null;
  };
  rec.strokes.forEach((s, si) => {
    const pens = timeline[si];
    let k = 0;
    flush();
    pen = pens[0][1];
    const p = (i) => (s.hasP ? s.p[i] : P_NONE);
    runUntil(floorDiv(s.t[0], TICK_MS));
    carry = 0;
    travel = 0;
    let ax = hx(s.x[0]), ay = hy(s.y[0]), ap = p(0), at0 = s.t[0];
    for (let i = 1; i < s.x.length; i++) {
      while (k + 1 < pens.length && pens[k + 1][0] <= i - 1) {
        flush();
        pen = pens[++k][1];
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
          pending = { tick, segs: [] };
        }
        pending.segs.push({ x0: pxs, y0: pys, p0: pps, x1: pxe, y1: pye, p1: ppe, dt: tb - tau });
        pxs = pxe;
        pys = pye;
        pps = ppe;
        tau = tb;
      }
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
  for (let c = 0; c < N; c++) {
    if (W[c] > 0) {
      W[c] = 0;
      snap(c);
    }
  }

  // Settled cells, sorted (y, x), the same shape as look.settledCells.
  const cells = [];
  for (let c = 0; c < N; c++) {
    const f0 = F[3 * c], f1 = F[3 * c + 1], f2 = F[3 * c + 2];
    if (f0 || f1 || f2) cells.push([Y0 + Math.floor(c / GW), X0 + (c % GW), f0, f1, f2]);
  }
  return { cells, ticks: now };
}
