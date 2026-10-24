// The rules of flow (keys.md, Factor one): acts deposit ink, ink flows,
// settles and dries, and what settles is the fact. Integer arithmetic only;
// every product stays below 2^53 (bounds noted at each rule). The paper is a
// sparse grid of 16×16 tiles grown on demand; only wet tiles are worked.
// Flow and mix are Jacobi passes (all reads from the state before the pass,
// all writes into deltas), so the order tiles and cells are visited in never
// changes a result.
//
// Time is recorded time, read from the acts: one tick per TICK_MS; every
// DRY_EVERY-th tick also mixes, settles and dries. Each tick runs, in order:
// the deposits that fall in it, flow, then (on dry ticks) mix → settle → dry.
//
// The same sim runs live while someone writes (frontend ink worker): acts are
// fed as they become final, idle ticks run while the pen is up (advanceTo),
// undo restores a snapshot taken at a stroke's pen-down, and view() hands back
// the tiles that changed. None of that changes a result: fed the same acts, the
// live sim settles exactly as grow() does (law/test/live.test.js).

import {
  TILE, TICK_MS, DRY_EVERY, HT_PER_CELL, P_NONE, NIB_FLEX, NIB_BROAD, STEP_HT, BROAD_T_HT, CARRY_MS,
  CAP_REF, W_SAT, W_WET, W_EPS, C_SAT, G_LEVEL, G_RUN, G_PORE, G_WICK, G_MAX, DIAG_Q, G_MIX, SETTLE, ABSORB,
  EVAP_BASE, EVAP_EDGE, E_MIN, MAX_WET_CELLS, MAX_WORK, DRAIN_MAX_TICKS, SCALE_ONE, SCALE_MIN, SCALE_MAX,
} from './constants.js';
import { ABS_Q, PRESS, PRESS_SHAPE, FLOW_Q, COSSIN_Q14 } from './tables.js';
import { makePaper, NB_DX, NB_DY } from './paper.js';
import { floorDiv, ceilDiv, clamp, isqrt, LawError } from './int.js';
import { penTimeline, precheck } from './acts.js';

const TT = TILE * TILE;
const STEP_FINE = STEP_HT * 256;
// Length of a piece in 1/256 half-tenth, so stamps fall at the same places
// however finely the motion was sampled. Pieces too long for that precision
// within 2^53 are measured in whole half-tenths (no writing comes near it).
export function fineLength(dx, dy) {
  const d2 = dx * dx + dy * dy;
  return d2 < 2 ** 36 ? isqrt(d2 * 65536) : isqrt(d2) * 256;
}
const LAST = TILE - 1;
const NB_OFF = NB_DX.map((dx, n) => NB_DY[n] * TILE + dx);
// Tile neighbour index (same E, SE, S, ... order) for a tile offset (ox, oy).
const TILE_DIR = new Int8Array([5, 6, 7, 4, -1, 0, 3, 2, 1]); // index (oy+1)*3 + (ox+1)
// Cells not on the tile's edge reach all 8 neighbours inside the tile.
const INNER = new Uint8Array(TT).map((_, i) => {
  const x = i % TILE;
  const y = (i - x) / TILE;
  return x > 0 && x < LAST && y > 0 && y < LAST ? 1 : 0;
});
const isInner = (i) => INNER[i] === 1;
// Conductances per neighbour direction (diagonals at DIAG_Q/256), into a wet or a dry cell.
const diag = (g, n) => (n & 1 ? floorDiv(g * DIAG_Q, 256) : g);
const GS_WET = NB_DX.map((_, n) => diag(G_LEVEL, n));
const GS_DRY = NB_DX.map((_, n) => diag(G_RUN, n));
const GP_WET = NB_DX.map((_, n) => diag(G_PORE, n));
const GP_DRY = NB_DX.map((_, n) => diag(G_WICK, n));

class Tile {
  constructor(tx, ty, f) {
    this.tx = tx;
    this.ty = ty;
    this.cap = f.cap;
    this.hold = f.hold;
    this.siz = f.siz;
    this.z = f.z;
    this.link = f.link;
    this.W = new Int32Array(TT);
    this.P = new Int32Array(TT * 3);
    this.F = new Uint16Array(TT * 3);
    this.dW = new Int32Array(TT);
    this.dP = new Int32Array(TT * 3);
    this.wet = 0; // cells with W > 0
    this.everWet = new Uint8Array(TT);
    this.touched = false;
    this.inked = false;
    this.nb = new Array(8).fill(null);
    this.journal = null; // the undo journal this tile was last copied into (live only)
  }
}

// header: { orgX, orgY } of the record; key: 32-byte paperKey; family; scale (64 = 1×).
// instrument: optional observer for the hand measure (never changes the law's state).
// track: remember which tiles changed, for view() (the live preview).
export function createSim({ paperKey, family, scale = SCALE_ONE, orgX = 0, orgY = 0, instrument = null, track = false }) {
  if (!Number.isInteger(scale) || scale < SCALE_MIN || scale > SCALE_MAX) throw new LawError('scale', 'scale out of range');
  const paper = makePaper(paperKey, family);
  const tiles = new Map();
  const wetTiles = new Set();
  let wetCells = 0;
  let everWet = 0;
  let work = 0;
  let now = 0; // the next tick to run
  const touched = [];
  const dirty = track ? new Set() : null;
  // Undo (live only): a stack of journals, one per stroke's pen-down. A tile's
  // state is copied into the open journal the first time it changes after the
  // journal began (copy on write), so a snapshot costs what the stroke touches,
  // never the whole sheet.
  const journals = [];
  function cow(t) {
    const j = journals.length ? journals[journals.length - 1] : null;
    if (!j || t.journal === j) return;
    t.journal = j;
    if (j.has.has(t)) return;
    j.has.add(t);
    j.saved.push([t, t.W.slice(), t.P.slice(), t.F.slice(), t.everWet.slice(), t.wet, t.inked]);
  }

  const tileKey = (tx, ty) => (tx + 65536) * 131072 + (ty + 65536);

  function getTile(tx, ty) {
    const key = tileKey(tx, ty);
    let t = tiles.get(key);
    if (t) return t;
    t = new Tile(tx, ty, paper.tileFields(tx * TILE, ty * TILE));
    if (instrument) instrument.tile(t);
    tiles.set(key, t);
    for (let d = 0; d < 8; d++) {
      const o = tiles.get(tileKey(tx + NB_DX[d], ty + NB_DY[d]));
      if (o) {
        t.nb[d] = o;
        o.nb[(d + 4) & 7] = t;
      }
    }
    return t;
  }
  function neighbourTile(t, ox, oy) {
    const d = TILE_DIR[(oy + 1) * 3 + (ox + 1)];
    return t.nb[d] ?? getTile(t.tx + ox, t.ty + oy);
  }
  // Resolve neighbour n of cell idx in tile t into [tile, index].
  const res = [null, 0];
  function neighbour(t, idx, n) {
    const x = idx & LAST;
    const y = (idx - x) / TILE;
    const nx = x + NB_DX[n];
    const ny = y + NB_DY[n];
    if (nx >= 0 && nx < TILE && ny >= 0 && ny < TILE) {
      res[0] = t;
      res[1] = idx + NB_OFF[n];
    } else {
      res[0] = neighbourTile(t, nx < 0 ? -1 : nx >= TILE ? 1 : 0, ny < 0 ? -1 : ny >= TILE ? 1 : 0);
      res[1] = (ny & LAST) * TILE + (nx & LAST);
    }
    return res;
  }

  function becameWet(t, i) {
    if (instrument) instrument.wet(t, i);
    t.wet++;
    wetCells++;
    if (t.wet === 1) wetTiles.add(t);
    if (!t.everWet[i]) {
      t.everWet[i] = 1;
      everWet++;
      if (everWet > MAX_WET_CELLS) throw new LawError('cost', 'too much of the sheet is wet');
    }
  }
  function becameDry(t) {
    t.wet--;
    wetCells--;
    if (t.wet === 0) wetTiles.delete(t);
  }
  function touch(t) {
    if (!t.touched) {
      t.touched = true;
      touched.push(t);
    }
  }

  // --- the nib ---

  let pen = null;
  let abs0 = 0, abs1 = 0, abs2 = 0;
  let carry = 0;
  const sc = (v) => floorDiv(v * scale, SCALE_ONE);

  function setPen(p) {
    if (batch) flushTick(); // ink already on its way leaves with the old pen
    pen = p;
    abs0 = ABS_Q[p.rgb[0]];
    abs1 = ABS_Q[p.rgb[1]];
    abs2 = ABS_Q[p.rgb[2]];
  }
  // Nib width in half-tenths at pressure p (the edge length for a broad nib).
  function widthAt(p) {
    if (pen.nib === NIB_FLEX) return sc(2 * (pen.size + floorDiv(pen.flex * PRESS_SHAPE[p], 256)));
    const base = sc(2 * pen.size);
    if (pen.nib === NIB_BROAD) return base;
    return floorDiv(base * (224 + floorDiv(p * 64, 255)), 256); // a round nib swells a little with pressure
  }

  // Put `amt` drops through the footprint centred at (px, py) (half-tenths).
  // Returns what did not fit (cells are full).
  const fx = [];
  const fy = [];
  const fw = [];
  function stamp(px, py, w, amt) {
    fx.length = 0;
    fy.length = 0;
    fw.length = 0;
    let sum = 0;
    if (pen.nib === NIB_BROAD) {
      const a = floorDiv(w, 2);
      const b = floorDiv(sc(BROAD_T_HT), 2);
      const cos = COSSIN_Q14[2 * pen.angle];
      const sin = COSSIN_Q14[2 * pen.angle + 1];
      const r = a + b + HT_PER_CELL;
      const cx0 = floorDiv(px - r, HT_PER_CELL), cx1 = floorDiv(px + r, HT_PER_CELL);
      const cy0 = floorDiv(py - r, HT_PER_CELL), cy1 = floorDiv(py + r, HT_PER_CELL);
      for (let cy = cy0; cy <= cy1; cy++) {
        const dy = cy * HT_PER_CELL + 5 - py;
        for (let cx = cx0; cx <= cx1; cx++) {
          const dx = cx * HT_PER_CELL + 5 - px;
          const u = floorDiv(dx * cos + dy * sin, 16384);
          const v = floorDiv(dy * cos - dx * sin, 16384);
          const g = clamp(a - Math.abs(u), 0, HT_PER_CELL) * clamp(b - Math.abs(v), 0, HT_PER_CELL);
          if (g > 0) {
            fx.push(cx);
            fy.push(cy);
            fw.push(g);
            sum += g;
          }
        }
      }
    } else {
      const R = floorDiv(w, 2);
      const R2 = R * R;
      const cx0 = floorDiv(px - R, HT_PER_CELL), cx1 = floorDiv(px + R, HT_PER_CELL);
      const cy0 = floorDiv(py - R, HT_PER_CELL), cy1 = floorDiv(py + R, HT_PER_CELL);
      for (let cy = cy0; cy <= cy1; cy++) {
        const dy = cy * HT_PER_CELL + 5 - py;
        for (let cx = cx0; cx <= cx1; cx++) {
          const dx = cx * HT_PER_CELL + 5 - px;
          const g = R2 - dx * dx - dy * dy;
          if (g > 0) {
            fx.push(cx);
            fy.push(cy);
            fw.push(g);
            sum += g;
          }
        }
      }
    }
    if (sum === 0) {
      fx.push(floorDiv(px, HT_PER_CELL));
      fy.push(floorDiv(py, HT_PER_CELL));
      fw.push(1);
      sum = 1;
    }
    let given = 0;
    for (let k = 0; k < fx.length; k++) {
      const cx = fx[k];
      const cy = fy[k];
      const tx = floorDiv(cx, TILE);
      const ty = floorDiv(cy, TILE);
      const t = getTile(tx, ty);
      const i = (cy - ty * TILE) * TILE + (cx - tx * TILE);
      const room = W_SAT - t.W[i];
      if (room <= 0) continue;
      const g = Math.min(floorDiv(amt * fw[k], sum), room); // amt < 2^30, fw < 2^24
      if (g <= 0) continue;
      if (journals.length) cow(t);
      if (t.W[i] === 0) becameWet(t, i);
      t.W[i] += g;
      t.P[3 * i] += floorDiv(g * abs0, 256);
      t.P[3 * i + 1] += floorDiv(g * abs1, 256);
      t.P[3 * i + 2] += floorDiv(g * abs2, 256);
      t.inked = true;
      if (dirty) dirty.add(t);
      if (instrument) instrument.deposit(t, i, g, now);
      given += g;
    }
    return amt - given;
  }

  // Deposit is per tick: the pieces of the pen's path inside one tick are
  // stamped together, a stamp every STEP_HT of travel along the stroke (the
  // remainder carries over), or, if the pen barely moved, one stamp where it is
  // at the tick's end (a dwell). So where ink lands depends on the motion, not
  // on how often the device happened to sample it.
  let batch = null; // { k, segs: [[x0, y0, p0, x1, y1, p1, dt], ...] } for tick k
  let travel = 0; // distance since the last stamp in this stroke, in 1/256 half-tenth
  const DEPOSIT_D = HT_PER_CELL * 256 * 16 * SCALE_ONE;

  function addPiece(k, x0, y0, p0, x1, y1, p1, dt) {
    if (batch && batch.k !== k) flushTick();
    if (!batch) {
      runUntil(k); // the ticks before this one run first
      batch = { k, segs: [] };
    }
    batch.segs.push([x0, y0, p0, x1, y1, p1, dt]);
  }

  function flushTick() {
    const b = batch;
    batch = null;
    if (!b || pen.flow === 0) return;
    // Drops released: FLOW_Q (×16 per ms per cell of width) × width × pressure × dt,
    // × scale/64 once more so a scaled word deposits the same per cell. Summed
    // over the tick's pieces, then divided once (each piece < 2^48, ≤ 10 pieces a tick).
    let num = 0;
    for (const [, , p0, , , p1, dt] of b.segs) {
      const pa = floorDiv(p0 + p1, 2);
      num += FLOW_Q[pen.flow] * widthAt(pa) * PRESS[pa] * dt * scale;
    }
    const total = floorDiv(num, DEPOSIT_D) + carry;
    const sx = [], sy = [], sp = [];
    for (const [x0, y0, p0, x1, y1, p1] of b.segs) {
      const dx = x1 - x0, dy = y1 - y0;
      const L = fineLength(dx, dy);
      if (L === 0) continue;
      for (let at = STEP_FINE - travel; at <= L; at += STEP_FINE) {
        sx.push(x0 + floorDiv(dx * at, L)); // dx < 2^23, at ≤ L < 2^31
        sy.push(y0 + floorDiv(dy * at, L));
        sp.push(p0 + floorDiv((p1 - p0) * at, L));
      }
      travel = travel + L - STEP_FINE * floorDiv(travel + L, STEP_FINE);
    }
    const end = b.segs[b.segs.length - 1];
    if (!sx.length) {
      sx.push(end[3]);
      sy.push(end[4]);
      sp.push(end[5]);
      travel = 0;
    }
    const n = sx.length;
    let left = 0;
    for (let m = 1; m <= n; m++) {
      const amt = floorDiv(total * m, n) - floorDiv(total * (m - 1), n);
      left += stamp(sx[m - 1], sy[m - 1], widthAt(sp[m - 1]), amt);
    }
    carry = Math.min(left, floorDiv(FLOW_Q[pen.flow] * widthAt(end[5]) * 256 * CARRY_MS * scale, DEPOSIT_D));
  }

  // --- the four rules (flow; then on dry ticks mix, settle, dry) ---

  function flow() {
    for (const t of wetTiles) {
      const { W, P, cap, hold, z, link, dW, dP } = t;
      let gave = false;
      for (let i = 0; i < TT; i++) {
        const Wi = W[i];
        if (Wi <= 0) continue;
        const s = Wi - cap[i];
        const sPos = s > 0 ? s : 0;
        const phi = s + z[i];
        const holdI = hold[i];
        const inner = INNER[i] === 1;
        const P0 = P[3 * i], P1 = P[3 * i + 1], P2 = P[3 * i + 2];
        let outW = 0, out0 = 0, out1 = 0, out2 = 0;
        for (let n = 0; n < 8; n++) {
          let tn = t;
          let j = i + NB_OFF[n];
          if (!inner) {
            neighbour(t, i, n);
            tn = res[0];
            j = res[1];
          }
          const Wj = tn.W[j];
          const d = phi - (Wj - tn.cap[j] + tn.z[j]);
          if (d <= 0) continue;
          const dryJ = Wj < W_WET;
          // Surface flow only once there is surplus, and into a dry cell only once the bead breaks.
          const gs = s > 0 && (!dryJ || s > holdI) ? (dryJ ? GS_DRY[n] : GS_WET[n]) : 0;
          let gp = (dryJ ? GP_DRY[n] : GP_WET[n]) + link[i * 8 + n];
          if (gs + gp > G_MAX) gp = G_MAX - gs;
          // q ≤ Wi·(gs+gp)/4096 ≤ Wi/8 per direction, so a cell never gives more than it holds.
          const q = floorDiv(Math.min(d, sPos) * gs + Math.min(d, Wi) * gp, 4096);
          if (q <= 0) continue;
          const m0 = floorDiv(P0 * q, Wi); // P < 2^26, q < 2^13
          const m1 = floorDiv(P1 * q, Wi);
          const m2 = floorDiv(P2 * q, Wi);
          outW += q;
          out0 += m0;
          out1 += m1;
          out2 += m2;
          if (tn === t) {
            dW[j] += q;
            dP[3 * j] += m0;
            dP[3 * j + 1] += m1;
            dP[3 * j + 2] += m2;
          } else {
            tn.dW[j] += q;
            tn.dP[3 * j] += m0;
            tn.dP[3 * j + 1] += m1;
            tn.dP[3 * j + 2] += m2;
            touch(tn);
          }
          if (instrument && link[i * 8 + n]) instrument.fiber(t, i, n, floorDiv(Math.min(d, Wi) * link[i * 8 + n], 4096));
        }
        if (outW) {
          dW[i] -= outW;
          dP[3 * i] -= out0;
          dP[3 * i + 1] -= out1;
          dP[3 * i + 2] -= out2;
          gave = true;
        }
      }
      if (gave) touch(t);
    }
    applyDeltas();
  }

  function applyDeltas() {
    for (const t of touched) {
      if (journals.length) cow(t);
      const { W, P, F, dW, dP } = t;
      for (let i = 0; i < TT; i++) {
        const dw = dW[i];
        const dp0 = dP[3 * i], dp1 = dP[3 * i + 1], dp2 = dP[3 * i + 2];
        if (dw === 0 && dp0 === 0 && dp1 === 0 && dp2 === 0) continue;
        const was = W[i];
        const w = was + dw;
        W[i] = w;
        P[3 * i] += dp0;
        P[3 * i + 1] += dp1;
        P[3 * i + 2] += dp2;
        dW[i] = 0;
        dP[3 * i] = 0;
        dP[3 * i + 1] = 0;
        dP[3 * i + 2] = 0;
        if (w >= 8192 || w < 0) throw new Error(`law invariant broken: W=${w}`);
        if (was === 0 && w > 0) becameWet(t, i);
        else if (was > 0 && w === 0) {
          becameDry(t);
          snapCell(t, i); // no water left: whatever pigment stayed settles where it is
        }
      }
      t.touched = false;
    }
    touched.length = 0;
  }

  function snapCell(t, i) {
    const { P, F } = t;
    for (let ch = 0; ch < 3; ch++) {
      const k = 3 * i + ch;
      if (P[k] > 0) {
        F[k] = Math.min(65535, F[k] + P[k]);
        P[k] = 0;
        t.inked = true;
      }
    }
  }

  // Pigment diffuses between wet 4-neighbours, toward the lower concentration.
  function mix() {
    for (const t of wetTiles) {
      const { W, P } = t;
      for (let i = 0; i < TT; i++) {
        const Wi = W[i];
        if (Wi <= 0) continue;
        const inner = isInner(i);
        for (let n = 0; n <= 2; n += 2) { // E and S: every 4-neighbour pair once
          let tn = t, j = i + NB_OFF[n];
          if (!inner) {
            neighbour(t, i, n);
            tn = res[0];
            j = res[1];
          }
          const Wj = tn.W[j];
          if (Wj <= 0) continue;
          const den = (Wi + Wj) * 4096;
          for (let ch = 0; ch < 3; ch++) {
            const x = P[3 * i + ch] * Wj - tn.P[3 * j + ch] * Wi; // < 2^39
            if (x === 0) continue;
            const m = floorDiv(Math.abs(x) * G_MIX, den);
            if (m === 0) continue;
            const sign = x > 0 ? 1 : -1;
            t.dP[3 * i + ch] -= sign * m;
            tn.dP[3 * j + ch] += sign * m;
            touch(t);
            touch(tn);
          }
        }
      }
    }
    applyDeltas();
  }

  // Wet pigment binds to the fibers at the cell's rate; water stays. Only the
  // part of the water down in the paper (up to capacity) touches the fibers:
  // in a deep bead most pigment stays suspended, free to move to its edge.
  function settle() {
    for (const t of wetTiles) {
      const { W, P, F, siz, cap } = t;
      for (let i = 0; i < TT; i++) {
        const Wi = W[i];
        if (Wi <= 0) continue;
        const rate = SETTLE[siz[i]];
        const inPaper = Math.min(Wi, cap[i]);
        const den = Wi * 65536;
        for (let ch = 0; ch < 3; ch++) {
          const k = 3 * i + ch;
          const p = P[k];
          if (p <= 0) continue;
          const f = Math.min(p, ceilDiv(p * rate * inPaper, den)); // < 2^26 · 2^13 · 2^10
          P[k] = p - f;
          F[k] = Math.min(65535, F[k] + f);
        }
      }
    }
  }

  // Water leaves, faster where the cell has dry neighbours (edges dry first).
  // What the remaining water can no longer carry is left behind: the ring.
  function dry() {
    const list = [...wetTiles];
    for (const t of list) { // phase 1: how much each wet cell loses (reads only)
      const { W, siz, dW } = t;
      for (let i = 0; i < TT; i++) {
        const Wi = W[i];
        if (Wi <= 0) continue;
        let nd = 0;
        if (isInner(i)) {
          for (let n = 0; n < 8; n++) if (W[i + NB_OFF[n]] < W_WET) nd++;
        } else {
          for (let n = 0; n < 8; n++) {
            neighbour(t, i, n);
            if (res[0].W[res[1]] < W_WET) nd++;
          }
        }
        // Evaporation is per unit of surface, not per drop: a thin edge runs dry
        // while a deep bead is still standing, and the bead feeds the edge (the
        // ring). Absorption takes a share of the water that is down in the paper.
        const e = (EVAP_BASE + EVAP_EDGE * nd) * CAP_REF + ABSORB[siz[i]] * Math.min(Wi, t.cap[i]);
        dW[i] = Math.max(E_MIN, ceilDiv(e, 65536));
      }
    }
    for (const t of list) { // phase 2: apply
      const { W, P, F, dW } = t;
      for (let i = 0; i < TT; i++) {
        const Wi = W[i];
        if (Wi <= 0) continue;
        const e = dW[i];
        dW[i] = 0;
        let w = Wi - Math.min(e, Wi);
        if (w < W_EPS) w = 0;
        W[i] = w;
        if (w === 0) {
          becameDry(t);
          snapCell(t, i);
          continue;
        }
        const capP = floorDiv(w * C_SAT, 256);
        for (let ch = 0; ch < 3; ch++) {
          const k = 3 * i + ch;
          if (P[k] > capP) {
            F[k] = Math.min(65535, F[k] + P[k] - capP);
            P[k] = capP;
          }
        }
      }
    }
  }

  function step(k) {
    if (dirty) for (const t of wetTiles) dirty.add(t);
    if (journals.length) for (const t of wetTiles) cow(t);
    work += wetCells;
    if (work > MAX_WORK) throw new LawError('cost', 'this writing takes too long to settle');
    flow();
    if (k % DRY_EVERY === DRY_EVERY - 1) {
      mix();
      settle();
      dry();
    }
    if (instrument) instrument.step(k, wetTiles);
  }

  function runUntil(k) {
    while (now < k) {
      if (wetCells === 0) {
        now = k; // nothing wet: these ticks change nothing
        break;
      }
      step(now);
      now++;
    }
  }

  // --- feeding acts ---

  // Positions in half-tenths in the sheet frame (scaled about the record origin).
  const hx = (x) => 20 * orgX + floorDiv(2 * x * scale, SCALE_ONE);
  const hy = (y) => 20 * orgY + floorDiv(2 * y * scale, SCALE_ONE);

  let last = null; // { x, y, p, t } of the previous act in this stroke
  let lastT = 0;
  let inStroke = false; // between strokeStart and endStroke (live only; grow never ends one)

  function strokeStart(x, y, t, p) {
    if (batch) flushTick();
    runUntil(floorDiv(t, TICK_MS));
    last = { x: hx(x), y: hy(y), p, t };
    carry = 0;
    travel = 0;
    lastT = t;
    inStroke = true;
    if (instrument) instrument.strokeStart(t);
  }

  function act(x, y, t, p) {
    const X = hx(x), Y = hy(y);
    const a = last;
    const dt = t - a.t;
    if (dt < 1) throw new LawError('acts', 'time must move forward');
    let tau = a.t;
    let pxs = a.x, pys = a.y, pps = a.p;
    while (tau < t) {
      const k = floorDiv(tau, TICK_MS);
      const tb = Math.min(t, (k + 1) * TICK_MS);
      const f = tb - a.t;
      const pxe = a.x + floorDiv((X - a.x) * f, dt);
      const pye = a.y + floorDiv((Y - a.y) * f, dt);
      const ppe = a.p + floorDiv((p - a.p) * f, dt);
      addPiece(k, pxs, pys, pps, pxe, pye, ppe, tb - tau);
      pxs = pxe;
      pys = pye;
      pps = ppe;
      tau = tb;
    }
    last = { x: X, y: Y, p, t };
    lastT = t;
  }

  // Run to the end: the last act's tick, then drying until nothing is wet
  // (at most DRAIN_MAX_TICKS), then whatever is still wet settles where it is.
  function finish() {
    if (batch) flushTick();
    runUntil(floorDiv(lastT, TICK_MS) + 1);
    // Counted from the tick after the last act (not from now: a live sim may
    // already have dried part of the way while the pen was up).
    const drainEnd = floorDiv(lastT, TICK_MS) + 1 + DRAIN_MAX_TICKS;
    while (wetCells > 0 && now < drainEnd) {
      step(now);
      now++;
    }
    for (const t of [...wetTiles]) {
      for (let i = 0; i < TT; i++) {
        if (t.W[i] > 0) {
          t.W[i] = 0;
          becameDry(t);
          snapCell(t, i);
        }
      }
    }
    if (instrument) instrument.finish(now);
    return { tiles: [...tiles.values()].filter((t) => t.inked), ticks: now, work };
  }

  // --- live (between strokes only) ---

  // The pen is up: nothing more comes for this stroke.
  function endStroke() {
    inStroke = false;
  }

  // Run the idle ticks before tick k while the pen is up. The caller promises no
  // stroke will start before k·TICK_MS. Never past the drain limit after the
  // last act: had the writing ended here, grow() would have stopped there; a
  // later stroke catches up from that point (strokeStart runs the rest).
  function advanceTo(k) {
    if (inStroke) throw new Error('advanceTo while the pen is down');
    if (batch) flushTick(); // the last tick's ink lands as it would before any later tick
    runUntil(Math.min(k, floorDiv(lastT, TICK_MS) + 1 + DRAIN_MAX_TICKS));
  }

  // Begin a journal: the state from here on can be put back (restore). Paper
  // fields never change and are never copied; tiles are copied only when they
  // first change after this (cow).
  function snapshot() {
    if (inStroke) throw new Error('snapshot while the pen is down');
    if (batch) flushTick();
    const j = { saved: [], has: new Set(), counters: { now, wetCells, everWet, work, lastT, pen, carry, travel } };
    journals.push(j);
    return j;
  }

  // Back to the moment `snap` began. Only the newest journal can be restored
  // (undo is newest first); the one below it then records again, so it can still
  // put back everything since its own pen-down.
  function restore(snap) {
    if (journals[journals.length - 1] !== snap) throw new Error('restore the newest snapshot first');
    journals.pop();
    for (let k = snap.saved.length - 1; k >= 0; k--) {
      const [t, W, P, F, ev, wet, inked] = snap.saved[k];
      t.W.set(W);
      t.P.set(P);
      t.F.set(F);
      t.everWet.set(ev);
      t.wet = wet;
      t.inked = inked;
      t.journal = null;
      if (wet > 0) wetTiles.add(t);
      else wetTiles.delete(t);
      if (dirty) dirty.add(t);
    }
    batch = null; // a tick of the undone stroke's ink that had not landed yet: gone with it
    ({ now, wetCells, everWet, work, lastT, carry, travel } = snap.counters);
    if (snap.counters.pen) setPen(snap.counters.pen);
    last = null;
    inStroke = false;
  }

  // Let go of the oldest journal (undo that far back grows the sheet again instead).
  function forget(snap) {
    const i = journals.indexOf(snap);
    if (i === 0) journals.shift();
  }

  // Show tile (tx, ty) again on the next changed() (after the sheet was grown afresh).
  function redraw(tx, ty) {
    if (dirty) dirty.add(getTile(tx, ty));
  }

  // The tiles that changed since the last call: [tx, ty, W, P, F] (live views of
  // the arrays; read them before feeding more acts).
  function changed() {
    if (!dirty) throw new Error('createSim({ track: true }) to use changed()');
    const out = [...dirty].map((t) => [t.tx, t.ty, t.W, t.P, t.F]);
    dirty.clear();
    return out;
  }

  return {
    setPen, strokeStart, act, finish, runUntil,
    endStroke, advanceTo, snapshot, restore, forget, changed, redraw,
    get now() { return now; },
    get lastT() { return lastT; },
    get wetCells() { return wetCells; },
    get activeTiles() { return wetTiles.size; }, // the tiles a tick walks: only wet ones
    tiles: () => tiles.values(),
    getTile,
  };
}

// Grow a whole decoded record (acts.decodeActs) on a paper. Returns the settled tiles.
export function grow(rec, { paperKey, family, scale = SCALE_ONE, instrument = null }) {
  precheck(rec, scale);
  const sim = createSim({ paperKey, family, scale, orgX: rec.orgX, orgY: rec.orgY, instrument });
  const timeline = penTimeline(rec);
  rec.strokes.forEach((s, si) => {
    const pens = timeline[si];
    let k = 0;
    sim.setPen(pens[0][1]);
    const p = (i) => (s.hasP ? s.p[i] : P_NONE);
    sim.strokeStart(s.x[0], s.y[0], s.t[0], p(0));
    for (let i = 1; i < s.x.length; i++) {
      while (k + 1 < pens.length && pens[k + 1][0] <= i - 1) {
        k++;
        sim.setPen(pens[k][1]);
      }
      sim.act(s.x[i], s.y[i], s.t[i], p(i));
    }
  });
  return sim.finish();
}
