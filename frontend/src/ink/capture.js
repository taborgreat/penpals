// Capture: pointer events → acts, the raw record of the writer's motion
// (keys.md: "Each sampled point of the pen is an act"). One path for every
// surface (the lab, Pad, write mode), so a stroke means the same thing
// wherever it was written.
//
//   - each coalesced event keeps its own timestamp; equal stamps are spread
//     out and time always moves forward (dt ≥ 1 ms)
//   - while the pen is held still, a sample is added every HOLD_MS (pointer
//     events stop when nothing moves, but ink keeps flowing: that is the dwell)
//   - lifting the pen is an act too, so a dwell before lifting shows
//   - nothing is dropped and pauses are kept as they were (up to 60 s)
//   - pressure is kept only from a real pen; with a flex nib, mouse and touch
//     get a causal synthetic pressure (synthP): heavier heading down the slant,
//     hairline going up, swelling in over the nib's swell distance
//   - landing: in the first LANDING_MS after pen-down, moves at the same spot
//     are not acts and no hold samples are added; the first real move re-stamps
//     the pen-down one sample before it, so the click is not a dwell. A pen held
//     still longer than that is a dwell from the moment it touched down. The
//     same at the end: lifting where it last moved, within LANDING_MS, is the
//     release, not a dwell.
// Points are in page units (the caller converts screen → page, after the chase).
//
// Writing live (ink/live.js) reads the same points as they become final, as
// record integers (quantize), in the order they will be encoded: a point is
// final once nothing can replace it (real samples at once, hold samples after
// COMMIT_MS), and a final point never changes. strokesToActs runs the same
// quantizer over the same points, so the live sheet and the sealed record are
// fed the very same acts.

import { encodeActs } from 'penpals-law/v1/acts';

const HOLD_MS = 16; // a held pen adds a sample this often
const COMMIT_MS = 50; // a hold sample becomes final once no real sample older than it can still arrive
const LANDING_MS = 50; // a still pen this soon after touching down is a click, not a dwell
const FIRST_DT = 8; // the first motion's interval when the click is taken out (one 120 Hz sample)
const MOVED = 0.05; // page units: less than this from the pen-down is the same spot
const MAX_GAP = 60000;
export const KINDS = { mouse: 0, touch: 1, pen: 2 };

// --- page points → record integers (one clock per drawing) ---

const newClock = () => ({ t0: null, shift: 0, prevEnd: null, last: -1 });

// A final page point as the record will hold it: sheet tenths (x·10, never
// negative), ms since the drawing began with pauses over a minute shortened,
// pressure 1..255 (pens only). `first` marks a stroke's first point.
export function quantize(clock, pt, hasP, first) {
  if (clock.t0 === null) clock.t0 = pt.t;
  let t = Math.round(pt.t - clock.t0) - clock.shift;
  if (first) {
    if (clock.prevEnd !== null && t - clock.prevEnd > MAX_GAP) {
      clock.shift += t - clock.prevEnd - MAX_GAP;
      t = clock.prevEnd + MAX_GAP;
    }
    clock.last = clock.prevEnd === null ? -1 : clock.prevEnd - 1;
  }
  if (t <= clock.last) t = clock.last + 1;
  clock.last = t;
  return {
    x: Math.max(0, Math.round(pt.x * 10)),
    y: Math.max(0, Math.round(pt.y * 10)),
    t,
    p: hasP ? Math.min(255, Math.max(1, Math.round((pt.p ?? 0.5) * 255))) : null,
  };
}
const endClockStroke = (clock) => { clock.prevEnd = clock.last; };

// `live`: queue what becomes final for a live sheet (drain()); off, nothing is kept for one.
export function createCapture({ now = () => performance.now(), pen: startPen = null, live = false } = {}) {
  const strokes = []; // finished: { type, kind, hasP, points: [{ x, y, t, p }], pens: [[at, pen]], clock0 }
  let cur = null;
  let timer = 0;
  let lastT = -Infinity; // the latest time handed out or promised (strokes never go back in time)
  let pen = startPen;
  let clock = newClock();
  let ops = []; // for the live sheet: what became final since the last drain (live only)
  const queue = (...o) => { if (live) ops.push(...o); };
  let fed = 0; // points of `cur` already quantized and queued
  let flex = null; // { slant (deg), swell (page units) } while the pen is a flex nib

  // Synthetic pressure for a flex nib without a pressure pen: the heading of the
  // pen from its previous final point, against the slant (down it = pressed),
  // eased in over the swell distance. Only past points: written once, final.
  function synthesize(p, i) {
    const f = cur.flex;
    if (i > 0) {
      const a = cur.points[i - 1];
      const dx = p.x - a.x;
      const dy = p.y - a.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 0) {
        const th = (f.slant * Math.PI) / 180;
        const along = (-dx * Math.cos(th) + dy * Math.sin(th)) / dist; // 1 = straight down the slant
        const k = Math.min(1, Math.max(0, (along - 0.3) / 0.6));
        f.level += (k * k * (3 - 2 * k) - f.level) * Math.min(1, dist / f.swell);
      }
    }
    p.p = 0.04 + 0.96 * f.level;
  }

  const pressureOf = (ev, kind) => (kind === 'pen' && ev && ev.pressure > 0 ? Math.min(1, ev.pressure) : null);

  // Queue every point of the current stroke that is final now, in order.
  function feed(all = false) {
    if (!cur || cur.landing) return;
    const until = all ? Infinity : now() - COMMIT_MS;
    while (fed < cur.points.length) {
      const p = cur.points[fed];
      if (p.hold && p.t > until) break;
      p.final = true;
      if (cur.synthP) synthesize(p, fed);
      const q = quantize(clock, p, cur.hasP, fed === 0);
      queue(fed === 0 ? { op: 'down', pt: q, pen: cur.pens[0][1], hasP: cur.hasP } : { op: 'point', pt: q });
      fed++;
    }
  }

  function addReal(pt, ev, lifting = false) {
    let t = ev && Number.isFinite(ev.timeStamp) && ev.timeStamp > 0 ? ev.timeStamp : now();
    if (cur.landing) {
      const d = cur.points[0];
      const moved = Math.hypot(pt.x - d.x, pt.y - d.y) >= MOVED;
      if (!moved && !lifting) return; // still where it touched down: not an act
      cur.landing = false;
      if (moved && t - d.t < LANDING_MS) d.t = Math.max(d.t, t - FIRST_DT); // the click is not a dwell
    } else if (lifting && cur.points.length > 1) {
      // Lifting where the pen last moved, sooner than LANDING_MS after it: the
      // release, not a dwell (the same rule as the click). Still for longer, the
      // hold samples stand and the end beads, as a pen held there would.
      let r = cur.points.length - 1;
      while (r > 0 && cur.points[r].hold) r--;
      const lastReal = cur.points[r];
      if (t - lastReal.t < LANDING_MS && Math.hypot(pt.x - lastReal.x, pt.y - lastReal.y) < MOVED) {
        while (cur.points.length - 1 > r && cur.points.length > fed) cur.points.pop(); // its hold samples are not final yet
        return;
      }
    }
    // A real sample older than pending hold samples replaces them (the pen moved
    // after all), unless they are already final: then time simply moves on.
    while (cur.points.length > fed && cur.points.at(-1).hold && cur.points.at(-1).t >= t) cur.points.pop();
    const prev = cur.points.at(-1);
    if (t <= prev.t) t = prev.t + 1;
    cur.points.push({ x: pt.x, y: pt.y, t, p: pressureOf(ev, cur.type) ?? prev.p });
    lastT = Math.max(lastT, t);
  }

  function hold() {
    if (!cur) return;
    const t = now();
    if (cur.landing) {
      if (t - cur.points[0].t < LANDING_MS) return;
      cur.landing = false; // held still: a dwell, from the moment it touched down
    }
    const prev = cur.points.at(-1);
    if (t - prev.t >= HOLD_MS) {
      cur.points.push({ x: prev.x, y: prev.y, t: Math.max(t, prev.t + 1), p: prev.p, hold: true });
      lastT = Math.max(lastT, cur.points.at(-1).t);
    }
  }

  const strip = (s) => {
    for (const p of s.points) {
      delete p.hold;
      delete p.final;
    }
    return s;
  };

  return {
    get strokes() { return strokes; },
    get drawing() { return cur; },
    get pen() { return pen; },
    down(pt, ev, type = ev?.pointerType ?? 'mouse') {
      if (cur) this.up(pt, ev);
      let t = ev && Number.isFinite(ev.timeStamp) && ev.timeStamp > 0 ? ev.timeStamp : now();
      if (t <= lastT) t = lastT + 1;
      const synthP = type !== 'pen' && !!flex && pen?.nib === 1;
      cur = {
        type, kind: KINDS[type] ?? 3, hasP: type === 'pen' || synthP, synthP,
        points: [{ x: pt.x, y: pt.y, t, p: pressureOf(ev, type) }],
        pens: [[0, pen]],
        clock0: { ...clock },
        flex: synthP ? { ...flex, level: 0 } : null,
        landing: true, // final once it moves, or once it has been still past LANDING_MS
      };
      fed = 0;
      lastT = t;
      clearInterval(timer);
      timer = setInterval(hold, HOLD_MS);
    },
    move(pt, ev) {
      if (!cur) return;
      addReal(pt, ev);
      feed();
    },
    up(pt, ev) {
      if (!cur) return null;
      clearInterval(timer);
      timer = 0;
      addReal(pt ?? cur.points.at(-1), ev, true); // lifting is an act
      feed(true);
      endClockStroke(clock);
      queue({ op: 'up' });
      const done = strip(cur);
      cur = null;
      strokes.push(done);
      return done;
    },
    // The pen (nib, size, flex, flow, colour) for what is written next. Mid-stroke
    // it takes effect after the latest sample, which is final from then on.
    setPen(next) {
      pen = next;
      if (!cur) return;
      cur.landing = false;
      feed(true);
      const at = cur.points.length - 1;
      if (cur.pens.at(-1)[0] === at) cur.pens.at(-1)[1] = next;
      else cur.pens.push([at, next]);
      queue({ op: 'pen', pen: next });
    },
    // A flex nib (mouse and touch then get synthetic pressure), or null.
    setFlex(next) {
      flex = next ? { slant: next.slant ?? 55, swell: Math.max(1, next.swell ?? 25) } : null;
    },
    // A stroke the system took back (pointercancel): as if never written.
    cancel() {
      clearInterval(timer);
      timer = 0;
      if (!cur) return;
      if (fed > 0) queue({ op: 'up' }, { op: 'undo' });
      clock = cur.clock0;
      cur = null;
    },
    undo() {
      if (cur) return null;
      const s = strokes.pop() ?? null;
      if (s) {
        clock = s.clock0;
        queue({ op: 'undo' });
      }
      return s;
    },
    clear() {
      this.cancel();
      strokes.length = 0;
      clock = newClock();
      queue({ op: 'clear' });
    },
    // Hold samples newer than this are still tentative (a late real sample may replace them).
    committedUntil: () => now() - COMMIT_MS,
    // For the live sheet: what became final since the last call (see feed()).
    drain() {
      feed();
      const out = ops;
      ops = [];
      return out;
    },
    // The pen is up: promise that no stroke starts at or before wall time `w`
    // (a later pointerdown stamped earlier is moved after it), and say from
    // which record time a stroke could start, so the sheet may dry until then.
    // null while the pen is down or nothing is written yet.
    promise(w = now()) {
      if (cur || clock.prevEnd === null) return null;
      lastT = Math.max(lastT, w);
      return Math.max(clock.prevEnd, Math.min(Math.round(w - clock.t0) - clock.shift, clock.prevEnd + MAX_GAP));
    },
    acts(fallbackPen) {
      return strokesToActs(strokes, fallbackPen ?? pen);
    },
  };
}

// Strokes (page units) → canonical acts. The record's origin is the whole unit
// just above-left of the writing, so its position on the page is kept.
// Each stroke may carry its pens ([[atAct, pen]], from capture); otherwise
// `pen` ({ nib, size (tenths), flex, flow, rgb, angle }) is used throughout.
export function strokesToActs(list, pen, { margin = 2 } = {}) {
  const strokes = list.filter((s) => s.points.length);
  if (!strokes.length) return null;
  const clock = newClock();
  const recs = strokes.map((s) => {
    const pts = s.points.map((p, i) => quantize(clock, p, s.hasP, i === 0));
    endClockStroke(clock);
    return pts;
  });
  let minX = Infinity, minY = Infinity;
  for (const pts of recs) for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
  }
  const orgX = Math.max(0, Math.floor(minX / 10) - margin);
  const orgY = Math.max(0, Math.floor(minY / 10) - margin);
  let carried = null;
  const out = strokes.map((s, i) => {
    const pts = recs[i];
    const pens = [];
    for (const [at, pn] of s.pens ?? [[0, pen]]) {
      const p = pn ?? pen;
      if (at === 0 && carried && samePen(p, carried)) continue;
      pens.push({ at, ...p });
      carried = p;
    }
    return {
      hasP: s.hasP,
      kind: s.kind,
      synthP: !!s.synthP,
      x: pts.map((p) => p.x - 10 * orgX),
      y: pts.map((p) => p.y - 10 * orgY),
      t: pts.map((p) => p.t),
      p: s.hasP ? pts.map((p) => p.p) : null,
      pens,
    };
  });
  return encodeActs({ orgX, orgY, strokes: out });
}

const samePen = (a, b) => a.nib === b.nib && a.size === b.size && a.flex === b.flex && a.flow === b.flow && a.angle === b.angle
  && a.rgb[0] === b.rgb[0] && a.rgb[1] === b.rgb[1] && a.rgb[2] === b.rgb[2];
