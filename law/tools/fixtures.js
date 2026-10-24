// Synthetic writing for tuning and tests: the three keys.md test strokes (a
// fast hairline, a slow curve, a dwell that must bead and run) plus mixing, a
// broad nib, a flex nib under pressure, and a cursive line. Each fixture is a
// record ready for encodeActs. Units: tenths of an ink unit (≈0.0154 mm), ms.
// This file is a tool; floats are fine here because the output is quantized
// into acts, and the acts are what the law reads.

import { sha256 } from '@noble/hashes/sha2.js';
import { encodeActs, decodeActs } from '../v1/acts.js';
import { T, concat, utf8 } from '../tags.js';

// A paper for tuning and tests (a stand-in for a real sheet's paperKey).
export function testPaperKey(text) {
  const seed = concat(sha256(utf8(`seed:${text}`)), sha256(utf8(`seed2:${text}`))); // 64 bytes, like a signature
  return sha256(concat(T('paperkey'), seed));
}

const TEN = 10; // tenths per unit
const INK = [26, 32, 58]; // a blue-black
export const PENS = {
  fine: { nib: 0, size: 14, flex: 0, flow: 7, rgb: INK, angle: 0 },
  medium: { nib: 0, size: 50, flex: 0, flow: 7, rgb: INK, angle: 0 },
  heavy: { nib: 0, size: 50, flex: 0, flow: 11, rgb: INK, angle: 0 },
  flex: { nib: 1, size: 12, flex: 120, flow: 8, rgb: INK, angle: 0 },
  broad: { nib: 2, size: 160, flex: 0, flow: 8, rgb: INK, angle: 35 },
};

// Sample a path: pos(u) for u in [0, 1] (units), speed(u) in units/s, every `hz`.
// Returns { x[], y[], t[] (relative ms), p[] } before quantizing.
export function samplePath(pos, speed, { hz = 120, pressure = null, hold = null } = {}) {
  const dt = 1000 / hz;
  const xs = [], ys = [], ts = [], ps = [];
  let u = 0;
  let t = 0;
  const push = (uu) => {
    const [x, y] = pos(uu);
    xs.push(x);
    ys.push(y);
    ts.push(t);
    ps.push(pressure ? pressure(uu) : null);
  };
  push(0);
  if (hold?.at === 0) {
    for (let k = 0; k < hold.ms / dt; k++) {
      t += dt;
      push(0);
    }
  }
  const du = 1e-3;
  while (u < 1) {
    // advance u by speed·dt along arc length
    let travel = (speed(u) * dt) / 1000;
    while (travel > 0 && u < 1) {
      const [x0, y0] = pos(u);
      const [x1, y1] = pos(Math.min(1, u + du));
      const seg = Math.hypot(x1 - x0, y1 - y0) || 1e-9;
      if (seg > travel) {
        u += (du * travel) / seg;
        travel = 0;
      } else {
        u = Math.min(1, u + du);
        travel -= seg;
      }
    }
    t += dt;
    push(Math.min(u, 1));
    if (hold && hold.at > 0 && u >= hold.at && !hold.done) {
      hold.done = true;
      for (let k = 0; k < hold.ms / dt; k++) {
        t += dt;
        push(u);
      }
    }
  }
  return { xs, ys, ts, ps };
}

// Build a record from strokes [{ path (from samplePath), start (ms), pen, kind, hasP }].
// Each stroke's `start` is the gap (ms) after the previous stroke ends (the first starts at 0).
export function record(strokes, org = [10, 10]) {
  let minX = Infinity, minY = Infinity;
  for (const s of strokes) for (let i = 0; i < s.path.xs.length; i++) {
    minX = Math.min(minX, s.path.xs[i]);
    minY = Math.min(minY, s.path.ys[i]);
  }
  const out = { orgX: org[0], orgY: org[1], strokes: [] };
  let prevPen = null;
  let prevEnd = 0;
  for (const s of strokes) {
    const { xs, ys, ts, ps } = s.path;
    const x = [], y = [], t = [], p = [];
    for (let i = 0; i < xs.length; i++) {
      const base = out.strokes.length ? prevEnd + s.start : 0;
      const tt = Math.max(Math.round(base + ts[i]), t.length ? t[t.length - 1] + 1 : base);
      x.push(Math.round((xs[i] - minX) * TEN) + 50);
      y.push(Math.round((ys[i] - minY) * TEN) + 50);
      t.push(tt);
      if (s.hasP) p.push(Math.max(1, Math.min(255, Math.round(ps[i] * 255))));
    }
    const pens = [];
    if (s.pen !== prevPen) pens.push({ at: 0, ...s.pen });
    prevPen = s.pen;
    out.strokes.push({ hasP: !!s.hasP, kind: s.hasP ? 2 : 0, synthP: false, x, y, t, p: s.hasP ? p : null, pens });
    prevEnd = t[t.length - 1];
  }
  return out;
}

const line = (x0, y0, x1, y1) => (u) => [x0 + (x1 - x0) * u, y0 + (y1 - y0) * u];
const arc = (cx, cy, r, a0, a1) => (u) => [cx + r * Math.cos(a0 + (a1 - a0) * u), cy + r * Math.sin(a0 + (a1 - a0) * u)];
const const_ = (v) => () => v;
// Slow at the ends, fast in the middle, like a real stroke.
const bell = (lo, hi) => (u) => lo + (hi - lo) * Math.sin(Math.PI * Math.min(1, Math.max(0, u))) ** 2 + 1e-3;

export const FIXTURES = {
  hairline: () => record([
    { path: samplePath((u) => [u * 300, 20 * Math.sin(u * 3)], bell(300, 1100)), start: 0, pen: PENS.fine },
  ]),
  slowCurve: () => record([
    { path: samplePath(arc(60, 60, 50, Math.PI * 0.9, Math.PI * 2.6), const_(70)), start: 0, pen: PENS.medium },
  ]),
  dwell: () => record([
    { path: samplePath(line(0, 0, 160, 40), bell(40, 200), { hold: { at: 0.35, ms: 1500 } }), start: 0, pen: PENS.medium },
  ]),
  dwellLight: () => record([
    { path: samplePath(line(0, 0, 160, 40), bell(40, 200), { hold: { at: 0.35, ms: 1500 } }), start: 0, pen: { ...PENS.medium, rgb: [60, 130, 150] } },
  ]),
  // Two touching parallel strokes, red then blue: 20 ms apart both are wet and
  // bleed into each other; 3 s apart the red is dry and the blue only glazes it.
  mixWet: () => record([
    { path: samplePath(line(0, 40, 60, 40), const_(150)), start: 0, pen: { ...PENS.heavy, rgb: [190, 30, 30] } },
    { path: samplePath(line(0, 45, 60, 45), const_(150)), start: 20, pen: { ...PENS.heavy, rgb: [30, 50, 190] } },
  ]),
  mixDry: () => record([
    { path: samplePath(line(0, 40, 60, 40), const_(150)), start: 0, pen: { ...PENS.heavy, rgb: [190, 30, 30] } },
    { path: samplePath(line(0, 45, 60, 45), const_(150)), start: 3000, pen: { ...PENS.heavy, rgb: [30, 50, 190] } },
  ]),
  broad: () => record([
    { path: samplePath((u) => [u * 240, 40 * Math.abs(((u * 4) % 2) - 1)], const_(160)), start: 0, pen: PENS.broad },
  ]),
  flexPressure: () => record([
    {
      path: samplePath((u) => [u * 260 + 25 * Math.sin(u * Math.PI * 8), 40 + 35 * Math.cos(u * Math.PI * 8)], bell(120, 260), {
        pressure: (u) => 0.15 + 0.8 * Math.max(0, Math.sin(u * Math.PI * 8 - Math.PI / 2)) ** 2,
      }),
      start: 0,
      pen: PENS.flex,
      hasP: true,
    },
  ]),
  cursive: () => record([
    // a run of loops like "llll", then a short word gap and "eee"
    { path: samplePath((u) => [u * 220 + 14 * Math.sin(u * Math.PI * 10), 50 - 38 * Math.abs(Math.sin(u * Math.PI * 5))], bell(90, 220)), start: 0, pen: PENS.medium },
    { path: samplePath((u) => [250 + u * 140 + 9 * Math.sin(u * Math.PI * 6), 40 + 12 * Math.cos(u * Math.PI * 6)], bell(80, 180)), start: 600, pen: PENS.medium },
  ]),
};

export function fixtureBytes(name) {
  const bytes = encodeActs(FIXTURES[name]());
  return { bytes, rec: decodeActs(bytes) };
}
