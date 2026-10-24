// Writing live under law v2: the v2 sim fed act by act while someone writes,
// exactly as v1/live.js does for v1 (same calls, same points, same undo), so
// what the screen shows is what will be sealed. law/test/v2.test.js holds it
// to grow() byte for byte.
//
// What the preview paints, beyond v1: oak gall at its fresh tint (it darkens
// over days, at view time, never while writing), water from the water brush as
// a faint wash where no ink is, and torn cells left empty (the page behind
// shows through, as in the published look).
//
//   down(pt, pen, hasP) · point(pt) · pen(pen) · up() · advanceTo(ms) · undo()
//   changed()            tiles that changed since the last call, as RGBA
//   cut(x0, y0, x1, y1)  rows for a side view or the scene right now (settledCells' layout,
//                        plus [14]: the bead standing on a wet cell now, in drops)
//   finish(actsBytes)    settle everything: { cells, box, facts } exactly as grow()

import { createSim, filmLevel, heldE } from './sim.js';
import { settledCells, boxOf, factsDigest, GN } from './look.js';
import { TILE, TICK_MS, P_NONE, SCALE_ONE, W_SAT, W_WET, GALL_FRESH, TORN, DENT_SHIFT, DEPTH_SHIFT, THICK, WEAR_SHIFT, DENT_Z, FILM_Q } from './constants.js';
import { EXP8 } from '../v1/tables.js';
import { floorDiv } from '../v1/int.js';
import { penTimeline } from './acts.js';
import { livePoints } from '../v1/live.js';

export { livePoints };

const TT = TILE * TILE;
const WATER_TINT = [150, 170, 205];
const same = (a, b) => {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
};
const tOf = (a) => EXP8[Math.min(a >> 2, 2047)];

// One tile as the writer sees it now: colour to alpha from white.
// One tile's height field for the scene, 4 values a cell (Int16): the top of
// what stands there (the surface: cockle up, a dent down; plus the bead now, or
// the film once dry) in drops, the bead or film alone, the depth sunk (levels),
// and flags (1 torn, 2 wet).
export function heightTile(t, hf = new Int16Array(TT * 4)) {
  for (let i = 0; i < TT; i++) {
    const dent = t.dentA[i] >> DENT_SHIFT;
    const bead = t.W[i] > 0 ? Math.max(0, t.W[i] - heldE(t, i)) : 0; // what stands on top
    const above = Math.min(32767, bead + filmLevel(t.filmA[i]) * FILM_Q);
    const surface = t.cockle[i] - dent * DENT_Z;
    hf[4 * i] = Math.max(-32768, Math.min(32767, surface + above));
    hf[4 * i + 1] = above;
    hf[4 * i + 2] = Math.min(THICK, t.depthA[i] >> DEPTH_SHIFT);
    hf[4 * i + 3] = (t.flags[i] & TORN ? 1 : 0) | (t.W[i] >= W_WET ? 2 : 0);
  }
  return hf;
}

function paint(t, rgba = new Uint8ClampedArray(TT * 4)) {
  const { W, P, F, G, FG, flags } = t;
  rgba.fill(0);
  for (let i = 0; i < TT; i++) {
    if (flags[i] & TORN) continue;
    let a0 = F[3 * i] + P[3 * i],
      a1 = F[3 * i + 1] + P[3 * i + 1],
      a2 = F[3 * i + 2] + P[3 * i + 2];
    if (FG) {
      const g = FG[i] + G[i];
      if (g) {
        a0 += floorDiv(g * GN[0] * GALL_FRESH, 65536);
        a1 += floorDiv(g * GN[1] * GALL_FRESH, 65536);
        a2 += floorDiv(g * GN[2] * GALL_FRESH, 65536);
      }
    }
    const r = tOf(a0),
      g = tOf(a1),
      b = tOf(a2);
    const a = 255 - Math.min(r, g, b);
    if (a === 0) {
      if (W[i] >= W_WET) {
        rgba.set(WATER_TINT, 4 * i);
        rgba[4 * i + 3] = 14 + floorDiv(30 * Math.min(W[i], W_SAT), W_SAT);
      }
      continue;
    }
    rgba[4 * i + 3] = a;
    rgba[4 * i] = 255 - Math.round(((255 - r) * 255) / a);
    rgba[4 * i + 1] = 255 - Math.round(((255 - g) * 255) / a);
    rgba[4 * i + 2] = 255 - Math.round(((255 - b) * 255) / a);
  }
  return rgba;
}

export function createLive({ paperKey, family, keep = 24 }) {
  let sim = createSim({ paperKey, family, track: true });
  const shown = new Map();
  const scratchC = new Uint8ClampedArray(TT * 4); // a tile's colour, drawn here first
  const scratchH = new Int16Array(TT * 4); // and its heights
  const shownH = new Map();
  const done = [];
  let cur = null;

  const feedStroke = (s) => {
    sim.setPen(s.pens[0][1]);
    const p = (pt) => (s.hasP ? pt.p : P_NONE);
    sim.strokeStart(s.points[0].x, s.points[0].y, s.points[0].t, p(s.points[0]));
    let k = 0;
    for (let i = 1; i < s.points.length; i++) {
      while (k + 1 < s.pens.length && s.pens[k + 1][0] <= i - 1) {
        k++;
        sim.setPen(s.pens[k][1]);
      }
      const pt = s.points[i];
      sim.act(pt.x, pt.y, pt.t, p(pt));
    }
    sim.endStroke();
  };

  return {
    down(pt, pen, hasP) {
      if (cur) throw new Error('down while a stroke is open');
      const snap = keep > 0 ? sim.snapshot() : null;
      const kept = done.filter((s) => s.snap);
      if (snap && kept.length >= keep) {
        sim.forget(kept[0].snap);
        kept[0].snap = null;
      }
      cur = { hasP, points: [pt], pens: [[0, pen]], snap };
      sim.setPen(pen);
      sim.strokeStart(pt.x, pt.y, pt.t, hasP ? pt.p : P_NONE);
    },
    point(pt) {
      cur.points.push(pt);
      sim.act(pt.x, pt.y, pt.t, cur.hasP ? pt.p : P_NONE);
    },
    pen(pen) {
      cur.pens.push([cur.points.length - 1, pen]);
      sim.setPen(pen);
    },
    up() {
      sim.endStroke();
      done.push(cur);
      cur = null;
    },
    advanceTo(ms) {
      if (cur) throw new Error('advanceTo while the pen is down');
      sim.advanceTo(floorDiv(ms, TICK_MS));
    },
    undo() {
      if (cur) throw new Error('undo while the pen is down');
      const s = done.pop();
      if (!s) return false;
      if (s.snap) sim.restore(s.snap);
      else {
        sim = createSim({ paperKey, family, track: true });
        for (const d of done) feedStroke(d);
        for (const key of shown.keys()) sim.redraw(...key.split(',').map(Number));
      }
      return true;
    },
    get strokes() {
      return done.length;
    },
    get now() {
      return sim.now * TICK_MS;
    },
    get wet() {
      return sim.wetCells > 0;
    },
    get activeTiles() {
      return sim.activeTiles;
    },
    // With { heights: true } each tile also carries its height field for the
    // scene (heightTile): beads rising and sinking show even where no colour changes.
    // (drawn into scratch: a tile that did not change costs nothing; one that did
    // gets buffers of its own, handed over, and what was shown is kept in place)
    changed({ heights = false } = {}) {
      const out = [];
      for (const t of sim.changed()) {
        const rgba = paint(t, scratchC);
        const key = `${t.tx},${t.ty}`;
        const hf = heights ? heightTile(t, scratchH) : null;
        const before = shown.get(key);
        const beforeH = heights ? shownH.get(key) : null;
        if (before && same(before, rgba) && (!heights || (beforeH && same(beforeH, hf)))) continue;
        if (before) before.set(rgba);
        else shown.set(key, rgba.slice());
        if (heights) {
          if (beforeH) beforeH.set(hf);
          else shownH.set(key, hf.slice());
        }
        out.push(heights ? { tx: t.tx, ty: t.ty, rgba: rgba.slice(), hf: hf.slice() } : { tx: t.tx, ty: t.ty, rgba: rgba.slice() });
      }
      return out;
    },
    // Every tile handed out so far, handed out again by the next changed() (a
    // viewer that now wants heights too).
    resend() {
      for (const key of shown.keys()) sim.redraw(...key.split(',').map(Number));
      shown.clear();
      shownH.clear();
    },
    // Rows (look.js settledCells layout) for the cells in a rectangle, as they
    // are now: wet pigment counted with fixed, and at [14] the water standing
    // over a wet cell's capacity now (0 once dry: then only the film stands).
    cut(x0, y0, x1, y1) {
      const lx = Math.min(x0, x1),
        hx = Math.max(x0, x1),
        ly = Math.min(y0, y1),
        hy = Math.max(y0, y1);
      const rows = [];
      for (const t of sim.tiles()) {
        if ((t.tx + 1) * TILE <= lx || t.tx * TILE > hx || (t.ty + 1) * TILE <= ly || t.ty * TILE > hy) continue;
        for (let i = 0; i < TT; i++) {
          const x = t.tx * TILE + (i % TILE);
          const y = t.ty * TILE + Math.floor(i / TILE);
          if (x < lx || x > hx || y < ly || y > hy) continue;
          const dent = t.dentA[i] >> DENT_SHIFT;
          const standing = Math.max(0, t.W[i] - heldE(t, i)); // on top, in drops
          rows.push([
            y,
            x,
            Math.min(65535, t.F[3 * i] + t.P[3 * i]),
            Math.min(65535, t.F[3 * i + 1] + t.P[3 * i + 1]),
            Math.min(65535, t.F[3 * i + 2] + t.P[3 * i + 2]),
            t.FG ? Math.min(65535, t.FG[i] + t.G[i]) : 0,
            dent,
            Math.min(THICK, t.depthA[i] >> DEPTH_SHIFT),
            t.peak[i],
            Math.min(255, t.soakA[i] >> 8),
            Math.min(255, t.wearA[i] >> WEAR_SHIFT),
            t.flags[i],
            t.cockle[i],
            filmLevel(t.filmA[i]),
            t.W[i] > 0 ? standing : 0,
          ]);
        }
      }
      rows.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      return rows;
    },
    finish(actsBytes) {
      if (cur) throw new Error('finish while the pen is down');
      const res = sim.finish();
      const cells = settledCells(res.tiles);
      const box = boxOf(cells);
      return { cells, box, facts: factsDigest({ cells, box, actsBytes, family, scale: SCALE_ONE }), ticks: res.ticks, work: res.work, lost: res.lost };
    },
  };
}

// Playing a v2 record back (as v1/live.js createPlayback).
export function createPlayback({ actsBytes, rec, paperKey, family }) {
  const live = createLive({ paperKey, family, keep: 0 });
  const strokes = livePoints(rec, penTimeline(rec));
  let si = 0;
  let pi = 0;
  let k = 0;
  let open = false;
  let finished = null;
  const duration = strokes.length ? strokes.at(-1).points.at(-1).t : 0;
  return {
    duration,
    advanceTo(ms) {
      if (finished) return;
      while (si < strokes.length) {
        const s = strokes[si];
        if (!open) {
          if (s.points[0].t > ms) break;
          live.down(s.points[0], s.pens[0][1], s.hasP);
          open = true;
          pi = 1;
          k = 0;
        }
        while (pi < s.points.length && s.points[pi].t <= ms) {
          live.point(s.points[pi]);
          while (k + 1 < s.pens.length && s.pens[k + 1][0] <= pi) {
            k++;
            live.pen(s.pens[k][1]);
          }
          pi++;
        }
        if (pi < s.points.length) return;
        live.up();
        open = false;
        si++;
      }
      if (!open) live.advanceTo(si < strokes.length ? Math.min(ms, strokes[si].points[0].t) : ms);
    },
    changed: () => live.changed(),
    cut: (...a) => live.cut(...a),
    finish() {
      if (!finished) {
        this.advanceTo(Infinity);
        finished = live.finish(actsBytes);
      }
      return finished;
    },
  };
}
