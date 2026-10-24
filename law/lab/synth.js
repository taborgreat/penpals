// Synthetic writers, to prove the experiment's pipeline before real hands are
// collected. Not a model of handwriting worth trusting for the gate; a way to
// check that genuine readings land close, tracings land far, and that every
// attacker and report path runs. Lab only (floats are fine; output is acts).
//
// A writer has stable traits (size, slant, speed, how much they slow at turns,
// dwell at starts and ends, pressure habit, spacing, rhythm between words);
// each session jitters them a little. Glyph shapes come from the character, so
// the same text is the same shape for everyone, written in each person's way.

import { encodeActs } from '../v1/acts.js';

export function prng(seed) {
  let s = (seed >>> 0) || 0x9e3779b9;
  return () => {
    s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}
const gauss = (r) => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());

const ASC = new Set('bdfhklt');
const DESC = new Set('gjpqy');

// A glyph: control points in a box where the x-height runs y 0..1 (y down).
export function glyph(ch) {
  const r = prng(ch.charCodeAt(0) * 7919 + 13);
  const w = 0.45 + 0.4 * r();
  const n = 4 + Math.floor(r() * 3);
  const pts = [[0, 0.85]];
  for (let i = 1; i < n - 1; i++) {
    const x = (w * i) / (n - 1) + (r() - 0.5) * 0.25 * w;
    let y = r();
    if (i === 1 && ASC.has(ch)) y = -0.75;
    if (i === n - 2 && DESC.has(ch)) y = 1.7;
    pts.push([x, y]);
  }
  pts.push([w, 0.9]);
  return { w, pts };
}

// Catmull-Rom through points, dense.
function spline(pts, per = 12) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let k = 0; k < per; k++) {
      const t = k / per, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map((c) => 0.5 * ((2 * p1[c]) + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3)));
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

export function makeWriter(seed) {
  const r = prng(seed * 2654435761);
  return {
    seed,
    size: 28 + 18 * r(), // x-height, units
    slant: -0.1 + 0.55 * r(),
    speed: 110 + 220 * r(), // units/s
    turnSlow: 0.3 + 0.55 * r(),
    dwellStart: 120 * r(),
    dwellEnd: 90 * r(),
    pressBase: 0.3 + 0.5 * r(),
    pressDown: 0.35 * r(),
    spacing: 0.1 + 0.35 * r(),
    wordGap: 150 + 600 * r(),
    letterGap: 60 + 140 * r(),
    jitter: 0.015 + 0.05 * r(),
    nib: 30 + Math.floor(30 * r()),
    flow: 6 + Math.floor(3 * r()),
    rgb: [20 + Math.floor(60 * r()), 25 + Math.floor(60 * r()), 40 + Math.floor(100 * r())],
  };
}

// Session variation of a writer (stable person, varying day).
function sessionOf(w, session, device) {
  const r = prng(w.seed * 7349 + session * 131 + (device === 'phone' ? 17 : 0));
  const j = (v, s) => v * (1 + s * gauss(r));
  const phone = device === 'phone';
  return {
    ...w,
    size: j(w.size * (phone ? 1.35 : 1), 0.04),
    slant: w.slant + 0.03 * gauss(r),
    speed: j(w.speed * (phone ? 0.8 : 1), 0.08),
    turnSlow: Math.min(0.95, Math.max(0.05, w.turnSlow + 0.05 * gauss(r))),
    dwellStart: Math.max(0, j(w.dwellStart, 0.25)),
    dwellEnd: Math.max(0, j(w.dwellEnd, 0.25)),
    wordGap: j(w.wordGap, 0.15),
    letterGap: j(w.letterGap, 0.15),
    jitter: w.jitter * (phone ? 1.8 : 1),
    hasP: device === 'pen',
    kind: device === 'pen' ? 2 : device === 'phone' ? 1 : 0,
    r,
  };
}

// Turn a dense path into acts with the writer's dynamics. Returns stroke arrays.
function actsAlong(path, s, { speedOf = null, dwellStart = s.dwellStart, dwellEnd = s.dwellEnd, pressure = null } = {}) {
  const dt = 8;
  const xs = [], ys = [], ts = [], ps = [];
  const sharp = path.map((p, i) => {
    if (i === 0 || i === path.length - 1) return 1;
    const a = [p[0] - path[i - 1][0], p[1] - path[i - 1][1]], b = [path[i + 1][0] - p[0], path[i + 1][1] - p[1]];
    const la = Math.hypot(...a), lb = Math.hypot(...b);
    return la && lb ? (1 - (a[0] * b[0] + a[1] * b[1]) / (la * lb)) / 2 : 0;
  });
  let t = 0;
  const push = (x, y, p) => {
    xs.push(x);
    ys.push(y);
    ts.push(t);
    ps.push(p);
  };
  const pAt = (i) => pressure ?? Math.min(1, Math.max(0.05, s.pressBase + (path[Math.min(i + 1, path.length - 1)][1] > path[i][1] ? s.pressDown : 0) + 0.04 * gauss(s.r)));
  push(path[0][0], path[0][1], pAt(0));
  for (let k = 0; k < dwellStart / dt; k++) { t += dt; push(path[0][0], path[0][1], pAt(0)); }
  let i = 0;
  let frac = 0;
  while (i < path.length - 1) {
    const v = speedOf ? speedOf(i) : s.speed * (1 - s.turnSlow * Math.min(1, sharp[i] * 4));
    let travel = (Math.max(5, v) * dt) / 1000;
    while (travel > 0 && i < path.length - 1) {
      const seg = Math.hypot(path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1]) || 1e-6;
      const left = seg * (1 - frac);
      if (left > travel) {
        frac += travel / seg;
        travel = 0;
      } else {
        travel -= left;
        i++;
        frac = 0;
      }
    }
    t += dt;
    const a = path[Math.min(i, path.length - 1)], b = path[Math.min(i + 1, path.length - 1)];
    push(a[0] + (b[0] - a[0]) * frac, a[1] + (b[1] - a[1]) * frac, pAt(i));
  }
  const last = path[path.length - 1];
  for (let k = 0; k < dwellEnd / dt; k++) { t += dt; push(last[0], last[1], pAt(path.length - 1)); }
  return { xs, ys, ts, ps };
}

// The words of `text` as dense paths in units, cursive within a word.
function layout(text, s, { originX = 40, originY = 40 } = {}) {
  const words = [];
  let cx = originX;
  for (const word of text.toLowerCase().split(/\s+/).filter(Boolean)) {
    const pts = [];
    for (const ch of word) {
      if (!/[a-z]/.test(ch)) continue;
      const g = glyph(ch);
      for (const [gx, gy] of g.pts) {
        const nx = gx + s.jitter * gauss(s.r), ny = gy + s.jitter * gauss(s.r);
        pts.push([cx + (nx - s.slant * ny) * s.size, originY + ny * s.size]);
      }
      cx += (g.w + s.spacing) * s.size;
    }
    if (pts.length > 1) words.push(spline(pts));
    cx += 0.8 * s.size;
  }
  return words;
}

// Strokes (units, absolute) → canonical acts. The record's origin keeps the
// absolute position (whole units), so letters written in boxes keep their
// place relative to the box (baseline and all), as the lab records them.
function toRecord(strokes, s) {
  let minX = Infinity, minY = Infinity;
  for (const st of strokes) for (let i = 0; i < st.xs.length; i++) {
    minX = Math.min(minX, st.xs[i]);
    minY = Math.min(minY, st.ys[i]);
  }
  const orgX = Math.max(0, Math.floor(minX) - 2), orgY = Math.max(0, Math.floor(minY) - 2);
  const pen = { nib: 0, size: s.nib, flex: 0, flow: s.flow, rgb: s.rgb, angle: 0 };
  let prevEnd = 0;
  const out = { orgX, orgY, strokes: [] };
  strokes.forEach((st, k) => {
    const base = k === 0 ? 0 : prevEnd + Math.round(st.gap);
    const x = [], y = [], t = [], p = [];
    for (let i = 0; i < st.xs.length; i++) {
      x.push(Math.max(0, Math.round((st.xs[i] - orgX) * 10)));
      y.push(Math.max(0, Math.round((st.ys[i] - orgY) * 10)));
      t.push(Math.max(Math.round(base + st.ts[i]), t.length ? t[t.length - 1] + 1 : base));
      p.push(Math.min(255, Math.max(1, Math.round(st.ps[i] * 255))));
    }
    out.strokes.push({ hasP: s.hasP, kind: s.kind, synthP: false, x, y, t, p: s.hasP ? p : null, pens: k === 0 ? [{ at: 0, ...pen }] : [] });
    prevEnd = t[t.length - 1];
  });
  return encodeActs(out);
}

// A writing of `text` by writer w in a session on a device ('desktop' | 'pen' | 'phone').
export function write(w, text, session, device = 'desktop') {
  const s = sessionOf(w, session, device);
  const strokes = layout(text, s).map((path, i) => ({ ...actsAlong(path, s), gap: i === 0 ? 0 : s.wordGap }));
  return toRecord(strokes, s);
}

// A tracing of the sample's paths by someone else: same lines, the tracer's
// slow, even, careful dynamics.
export function trace(sampleRec, tracerSeed) {
  const r = prng(tracerSeed * 99991);
  const s = { ...makeWriter(tracerSeed), r, hasP: sampleRec.strokes[0].hasP, kind: sampleRec.strokes[0].kind, jitter: 0 };
  const speed = 45 + 50 * r();
  const strokes = sampleRec.strokes.map((st, i) => {
    const path = [];
    for (let k = 0; k < st.x.length; k++) {
      const x = st.x[k] / 10, y = st.y[k] / 10;
      if (!path.length || Math.hypot(x - path[path.length - 1][0], y - path[path.length - 1][1]) > 0.3) path.push([x, y]);
    }
    if (path.length < 2) path.push([path[0][0] + 0.1, path[0][1]]);
    return { ...actsAlong(path, s, { speedOf: () => speed * (0.8 + 0.4 * r()), dwellStart: 80 * r(), dwellEnd: 60 * r(), pressure: 0.5 }), gap: i === 0 ? 0 : 400 + 400 * r() };
  });
  return toRecord(strokes, { ...s, nib: 40, flow: 7, rgb: [30, 30, 60] });
}

// The public corpus: each letter alone (its own record, coordinates in its box),
// plus a pangram written normally.
export function corpus(w, session = 99, device = 'desktop') {
  const s = sessionOf(w, session, device);
  const letters = {};
  for (const ch of 'abcdefghijklmnopqrstuvwxyz') {
    const g = glyph(ch);
    const pts = g.pts.map(([gx, gy]) => [(gx - s.slant * gy) * s.size + 30, gy * s.size + s.size + 30]);
    letters[ch] = toRecord([{ ...actsAlong(spline(pts), s), gap: 0 }], s);
  }
  return { letters, pangram: write(w, 'the quick brown fox jumps over the lazy dog', session, device) };
}

export const PHRASE_WORDS = ['amber', 'river', 'quiet', 'lamp', 'stone', 'garden', 'velvet', 'harbor', 'maple', 'cedar', 'window', 'summer', 'violet', 'copper', 'meadow', 'echo'];
export function freshPhrase(seed) {
  const r = prng(seed * 31 + 7);
  return Array.from({ length: 4 }, () => PHRASE_WORDS[Math.floor(r() * PHRASE_WORDS.length)]).join(' ');
}
