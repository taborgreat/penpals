// The baseline the experiment compares against: a hand measure read straight
// from the raw strokes (speed, its variation, dwell, pressure, lifts, slant,
// turning, time), with the same zoning by reading direction and the same bit
// budget as hand.js, so "facts vs raw" is a fair comparison. Lab only.

import { decodeCanonical } from '../v1/acts.js';
import { ZONE_FEATURES, GLOBAL_FEATURES, log2x8 } from '../v1/hand.js';

export const RAW_ZONE = ['width', 'speed', 'speedCV', 'dwell', 'pressure', 'pressRange', 'lifts', 'down', 'right', 'turning', 'time'];
export const RAW_GLOBAL = ['speedQ25', 'speedQ50', 'speedQ75', 'dwell', 'pressure', 'pressRange', 'liftsPerLen', 'down', 'right', 'turning', 'aspect', 'timePerLen'];
if (RAW_ZONE.length !== ZONE_FEATURES.length || RAW_GLOBAL.length !== GLOBAL_FEATURES.length) {
  throw new Error('raw and facts measures must have the same shape');
}

// Segments of a record: [xMid, yMid, len (tenths), dt, p, dx, dy, strokeStart, turn].
function segments(rec) {
  const out = [];
  for (const s of rec.strokes) {
    for (let i = 1; i < s.x.length; i++) {
      const dx = s.x[i] - s.x[i - 1];
      const dy = s.y[i] - s.y[i - 1];
      let turn = 0;
      if (i > 1) {
        const ax = s.x[i - 1] - s.x[i - 2], ay = s.y[i - 1] - s.y[i - 2];
        const la = Math.hypot(ax, ay), lb = Math.hypot(dx, dy);
        if (la > 0 && lb > 0) turn = Math.abs(Math.atan2(ax * dy - ay * dx, ax * dx + ay * dy));
      }
      out.push({
        x: (s.x[i] + s.x[i - 1]) / 2, y: (s.y[i] + s.y[i - 1]) / 2, len: Math.hypot(dx, dy), dt: s.t[i] - s.t[i - 1],
        p: s.hasP ? s.p[i] : 0, dx, dy, start: i === 1, turn,
      });
    }
  }
  return out;
}

function cuts(segs, k) {
  const sorted = [...segs].sort((a, b) => a.x - b.x);
  const total = sorted.reduce((s, g) => s + g.len, 0) || 1;
  const out = [];
  let acc = 0;
  let next = 1;
  for (const g of sorted) {
    acc += g.len;
    while (next < k && acc * k >= total * next) {
      out.push(g.x);
      next++;
    }
  }
  while (out.length < k - 1) out.push(sorted.length ? sorted[sorted.length - 1].x : 0);
  return out;
}
const partOf = (v, c) => {
  let i = 0;
  while (i < c.length && v > c[i]) i++;
  return i;
};

function stats(group, totalTime, totalLen) {
  const len = group.reduce((s, g) => s + g.len, 0);
  const time = group.reduce((s, g) => s + g.dt, 0) || 1;
  const speeds = group.map((g) => (g.len * 1000) / Math.max(1, g.dt)).sort((a, b) => a - b);
  const mean = speeds.reduce((s, v) => s + v, 0) / Math.max(1, speeds.length);
  const sd = Math.sqrt(speeds.reduce((s, v) => s + (v - mean) ** 2, 0) / Math.max(1, speeds.length));
  const q = (f) => (speeds.length ? speeds[Math.min(speeds.length - 1, Math.floor((speeds.length * f) / 100))] : 0);
  const still = group.filter((g) => g.len < 2).reduce((s, g) => s + g.dt, 0);
  const ps = group.filter((g) => g.p > 0).map((g) => g.p);
  const pMean = ps.length ? ps.reduce((s, v) => s + v, 0) / ps.length : 0;
  const pRange = ps.length ? Math.max(...ps) - Math.min(...ps) : 0;
  const down = group.filter((g) => g.dy > 0 && Math.abs(g.dy) > Math.abs(g.dx)).reduce((s, g) => s + g.len, 0);
  const right = group.filter((g) => g.dx > 0).reduce((s, g) => s + g.len, 0);
  const turning = group.reduce((s, g) => s + g.turn, 0);
  return {
    len, time, mean, sd, q, still, pMean, pRange, lifts: group.filter((g) => g.start).length,
    down: len ? (down * 1000) / len : 0, right: len ? (right * 1000) / len : 0,
    turning: len ? (turning * 10000) / len : 0, timeShare: (time * 1000) / Math.max(1, totalTime), lenShare: (len * 1000) / Math.max(1, totalLen),
  };
}

export function readRaw(actsBytes, { bands = 1, zones = 8 } = {}) {
  const rec = decodeCanonical(actsBytes);
  const segs = segments(rec);
  const xs = segs.map((s) => s.x), ys = segs.map((s) => s.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const all = stats(segs, rec.duration, segs.reduce((s, g) => s + g.len, 0));
  const ySorted = [...segs].sort((a, b) => a.y - b.y);
  const bandCuts = cuts(ySorted.map((g) => ({ ...g, x: g.y })), bands);
  const zone = new Int32Array(bands * zones * RAW_ZONE.length);
  for (let b = 0; b < bands; b++) {
    const inBand = segs.filter((g) => partOf(g.y, bandCuts) === b);
    const c = cuts(inBand.length ? inBand : segs, zones);
    const bx = [x0, ...c];
    const ex = [...c, x1];
    for (let z = 0; z < zones; z++) {
      const g = stats(inBand.filter((s) => partOf(s.x, c) === z), all.time, all.len);
      zone.set([
        Math.round(((ex[z] - bx[z]) * 1000) / Math.max(1, x1 - x0)), Math.round(g.mean), Math.round(g.mean ? (g.sd * 1000) / g.mean : 0),
        Math.round((g.still * 1000) / g.time), Math.round(g.pMean), Math.round(g.pRange), g.lifts,
        Math.round(g.down), Math.round(g.right), Math.round(g.turning), Math.round(g.timeShare),
      ], (b * zones + z) * RAW_ZONE.length);
    }
  }
  const global = Int32Array.from([
    all.q(25), all.q(50), all.q(75), Math.round((all.still * 1000) / all.time), Math.round(all.pMean), Math.round(all.pRange),
    Math.round((all.lifts * 100000) / Math.max(1, all.len)), Math.round(all.down), Math.round(all.right), Math.round(all.turning),
    Math.round(((y1 - y0 + 1) * 1000) / Math.max(1, x1 - x0 + 1)), Math.round((rec.duration * 1000) / Math.max(1, all.len)),
  ].map((v) => Math.round(v)));
  return { zone, global, layout: { bands, zones } };
}

// Quantize the raw reading the same way hand.js does: 8 levels, Gray-coded.
const L = (base, step) => ['log', base, step];
const N = (base, step) => ['lin', base, step];
export const RAW_ZONE_SPEC = {
  width: N(30, 25), speed: L(80, 4), speedCV: N(200, 100), dwell: N(0, 60), pressure: N(40, 25), pressRange: N(0, 25),
  lifts: N(0, 1), down: N(100, 60), right: N(200, 60), turning: L(40, 6), time: N(30, 25),
};
export const RAW_GLOBAL_SPEC = {
  speedQ25: L(72, 4), speedQ50: L(80, 4), speedQ75: L(88, 4), dwell: N(0, 60), pressure: N(40, 25), pressRange: N(0, 25),
  liftsPerLen: L(0, 6), down: N(100, 60), right: N(200, 60), turning: L(40, 6), aspect: L(32, 4), timePerLen: L(40, 4),
};

const GRAY = [0, 1, 3, 2, 6, 7, 5, 4];
const levelOf = (v, [kind, base, step], off = 0) => {
  const x = kind === 'log' ? log2x8(Math.max(0, Math.round(v))) : v;
  return Math.min(7, Math.max(0, Math.floor((x - base + off) / step)));
};

export function rawLevels(reading, { useZones = true, useGlobal = true, offsets = null } = {}) {
  const out = [];
  let k = 0;
  if (useZones) for (let i = 0; i < reading.zone.length; i++) out.push(levelOf(reading.zone[i], RAW_ZONE_SPEC[RAW_ZONE[i % RAW_ZONE.length]], offsets ? offsets[k++] : 0));
  if (useGlobal) for (let i = 0; i < reading.global.length; i++) out.push(levelOf(reading.global[i], RAW_GLOBAL_SPEC[RAW_GLOBAL[i]], offsets ? offsets[k++] : 0));
  return out;
}

export function levelsToBits(levels) {
  const bits = new Uint8Array(levels.length * 3);
  levels.forEach((l, i) => {
    const g = GRAY[l];
    bits[3 * i] = (g >> 2) & 1;
    bits[3 * i + 1] = (g >> 1) & 1;
    bits[3 * i + 2] = g & 1;
  });
  return bits;
}
