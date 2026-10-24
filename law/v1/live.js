// Writing live: the law's sim fed act by act while someone writes, so what the
// screen shows is what will be sealed. The writer's device (frontend ink
// worker) runs it; law/test/live.test.js holds it to grow() byte for byte.
//
// Points are record integers in the sheet frame: x, y in tenths of an ink unit
// from the sheet's origin (the record's org is 0, so they are the record's own
// positions plus 10·org; at scale 1× the sim lands them on the same cells),
// t in ms of recorded time, p 1..255 or null (no pressure). They must be final:
// what capture will encode, in order, never revised (capture.js freezes them).
//
//   down(pt, pen, hasP)  a stroke starts (a snapshot is taken first, for undo)
//   point(pt)            the next act of this stroke
//   pen(pen)             the pen changes after the latest act (mid-stroke)
//   up()                 the stroke ends
//   advanceTo(ms)        the pen is up and no stroke starts before ms: dry until then
//   undo()               the last stroke goes; the sheet is as it was at its pen-down
//   changed()            tiles that changed since the last call, as RGBA
//   finish(actsBytes)    settle everything: { cells, box, facts } exactly as grow()

import { createSim } from './sim.js';
import { settledCells, boxOf, factsDigest } from './look.js';
import { TILE, TICK_MS, P_NONE, SCALE_ONE } from './constants.js';
import { EXP8 } from './tables.js';
import { floorDiv } from './int.js';
import { penTimeline } from './acts.js';

const TT = TILE * TILE;
const same = (a, b) => {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
};
const tOf = (f) => EXP8[Math.min(f >> 2, 2047)];

export function createLive({ paperKey, family, keep = 24 }) {
  let sim = createSim({ paperKey, family, track: true });
  const shown = new Map(); // tile key → the RGBA last handed out: only pixels that changed go out again
  const done = []; // finished strokes, for replay: { hasP, points, pens: [[at, pen]], snap }
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
      // Only the most recent strokes keep a snapshot (copy on write: what each
      // stroke and its drying touch); undoing further back grows the sheet again.
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
        // Grow the strokes before it again from the start: the same acts, the same sheet.
        sim = createSim({ paperKey, family, track: true });
        for (const d of done) feedStroke(d);
        for (const key of shown.keys()) sim.redraw(...key.split(',').map(Number)); // what the undone stroke alone touched shows blank again
      }
      return true;
    },
    get strokes() { return done.length; },
    get now() { return sim.now * TICK_MS; },
    get wet() { return sim.wetCells > 0; },
    get activeTiles() { return sim.activeTiles; },
    // [{ tx, ty, rgba }]: 16×16 cells, colour to alpha from white, wet ink
    // included; only tiles whose pixels differ from what was last handed out.
    changed() {
      const out = [];
      for (const [tx, ty, , P, F] of sim.changed()) {
        const rgba = new Uint8ClampedArray(TT * 4);
        for (let i = 0; i < TT; i++) {
          const r = tOf(Math.min(65535, F[3 * i] + P[3 * i]));
          const g = tOf(Math.min(65535, F[3 * i + 1] + P[3 * i + 1]));
          const b = tOf(Math.min(65535, F[3 * i + 2] + P[3 * i + 2]));
          const a = 255 - Math.min(r, g, b);
          rgba[4 * i + 3] = a;
          if (a === 0) continue;
          rgba[4 * i] = 255 - Math.round(((255 - r) * 255) / a);
          rgba[4 * i + 1] = 255 - Math.round(((255 - g) * 255) / a);
          rgba[4 * i + 2] = 255 - Math.round(((255 - b) * 255) / a);
        }
        const key = `${tx},${ty}`;
        const before = shown.get(key);
        if (before && same(before, rgba)) continue;
        shown.set(key, rgba.slice());
        out.push({ tx, ty, rgba });
      }
      return out;
    },
    finish(actsBytes) {
      if (cur) throw new Error('finish while the pen is down');
      const res = sim.finish();
      const cells = settledCells(res.tiles);
      const box = boxOf(cells);
      return { cells, box, facts: factsDigest({ cells, box, actsBytes, family, scale: SCALE_ONE }), ticks: res.ticks, work: res.work };
    },
  };
}

// A decoded record's strokes as live points (sheet frame), for tests and replays.
export function livePoints(rec, timeline) {
  return rec.strokes.map((s, si) => ({
    hasP: s.hasP,
    points: Array.from(s.x, (x, i) => ({ x: x + 10 * rec.orgX, y: s.y[i] + 10 * rec.orgY, t: s.t[i], p: s.hasP ? s.p[i] : null })), // x may be a typed array
    pens: timeline[si],
  }));
}

// Playing a record back: the same law, run forward to any moment, so a sheet
// can be watched being written (Play, the journal, exported video). advanceTo
// only moves forward; at the end, finish() settles it exactly as grow() does.
//   duration     ms from the first act to the last (drying after it not included)
//   advanceTo(ms) feed every act up to ms and dry the sheet to then
//   changed()    tiles that changed, as RGBA (as createLive)
//   finish()     everything settled: { cells, box, facts }
export function createPlayback({ actsBytes, rec, paperKey, family }) {
  const live = createLive({ paperKey, family, keep: 0 });
  const strokes = livePoints(rec, penTimeline(rec));
  let si = 0; // stroke
  let pi = 0; // next point in it
  let k = 0; // its pen
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
        if (pi < s.points.length) return; // mid-stroke: the sheet is as far as the pen
        live.up();
        open = false;
        si++;
      }
      if (!open) live.advanceTo(si < strokes.length ? Math.min(ms, strokes[si].points[0].t) : ms);
    },
    changed: () => live.changed(),
    finish() {
      if (!finished) {
        this.advanceTo(Infinity);
        finished = live.finish(actsBytes);
      }
      return finished;
    },
  };
}
