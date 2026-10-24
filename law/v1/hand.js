// The hand measure (provisional "hand key", FIG. 1): the writing is grown on
// the public calibration paper (one sheet, the same for everyone), and the hand
// is read off the settled facts, not the raw strokes. The physics is the
// instrument: dwell shows as beads and rings, speed as starved hairlines,
// pressure as width, rhythm as drying boundaries (ink laid on ink that had
// already dried), slant as where ink wicks along the fibers.
//
// readHand(acts) → integer features. handBits(features) → the measure, a bit
// vector (Gray-coded levels, so a one-step change flips one bit). Everything
// here is integer and deterministic: the same acts give the same bits on any
// conforming device. The features and the quantizer are versioned with the law.
//
// Zones: the writing is split along the reading direction at quantiles of its
// settled ink (and, for a page, first into bands down the page), so the same
// phrase written again lands in the same zones wherever it sits.

import { sha256 } from '@noble/hashes/sha2.js';
import { T, concat } from '../tags.js';
import { TILE, LAW } from './constants.js';
import { grow } from './sim.js';
import { decodeCanonical } from './acts.js';
import { floorDiv, clamp, isqrt } from './int.js';

export const HAND_VERSION = 1;
// The hand quantizer and the code radii wait for the Phase 0 report on real
// hands (law/lab). Until then they may change, and every reading carries
// HAND_VERSION so a sketch made under one setting is never read under another.
export const LAW_HAND_UNFROZEN = true;
// Code radii (bit errors corrected), loose for now: set from the synthetic
// run so one person can register and sign in on a phone and a desktop.
export const PHRASE_RADIUS = 30; // of 300 bits (8 zones × 11 features + 12 global, 3 bits each)
export const PAGE_RADIUS = 96; // of 1092 bits (4 bands × 8 zones × 11 + 12 global, 3 bits each)
export const PHRASE_LAYOUT = Object.freeze({ bands: 1, zones: 8 });
export const PAGE_LAYOUT = Object.freeze({ bands: 4, zones: 8 });
export const CALIBRATION_FAMILY = Object.freeze({ grain: 8, weight: 8, tooth: 0 });
// Every reading is grown with this pen, whatever pen the writing was made with:
// the measure reads the hand (motion, time, pressure), not the pen settings.
export const CALIBRATION_PEN = Object.freeze({ nib: 0, size: 40, flex: 0, flow: 7, rgb: [20, 20, 20], angle: 0 });
export const CALIBRATION_SEED = sha256(T('calibration'));
// The calibration page: written once at registration (never published) and for the backstop.
export const CALIBRATION_TEXT = 'the quick brown fox jumps over the lazy dog while five wizards box jolly kings';
export const calibrationPaperKey = () => sha256(concat(T('paperkey'), CALIBRATION_SEED));

const TT = TILE * TILE;
const VISIBLE = 12; // Σ of the three channels' fixed pigment before a cell counts as inked
const THIN = 3; // a run of this many inked cells or fewer across is a hairline
const REWET_DRY_TICKS = 20; // ink dry this long (200 ms recorded) before new ink lands on it

// --- the observer: watches the simulation without changing it ---

function observer() {
  return {
    tile(t) {
      t.h = {
        maxW: new Uint16Array(TT), rewet: new Uint8Array(TT), fib: new Float64Array(TT * 4),
        lastWet: new Float64Array(TT).fill(-1e9), // the last tick the cell was wet
      };
    },
    wet() {},
    // Called after the drops landed (tick `now`). A drying boundary: the pen laid
    // ink on visible ink that had been dry for at least REWET_DRY_TICKS.
    deposit(t, i, g, now) {
      if (t.W[i] === g && t.h.rewet[i] < 255 && now - t.h.lastWet[i] >= REWET_DRY_TICKS
        && t.F[3 * i] + t.F[3 * i + 1] + t.F[3 * i + 2] >= VISIBLE) t.h.rewet[i]++;
      if (t.W[i] > t.h.maxW[i]) t.h.maxW[i] = t.W[i];
      t.h.lastWet[i] = now;
    },
    fiber(t, i, n, amt) {
      t.h.fib[i * 4 + (n & 3)] += amt;
    },
    step(k, wetTiles) {
      for (const t of wetTiles) {
        const { W } = t;
        const { maxW, lastWet } = t.h;
        for (let i = 0; i < TT; i++) {
          if (W[i] > 0) {
            lastWet[i] = k;
            if (W[i] > maxW[i]) maxW[i] = W[i];
          }
        }
      }
    },
    strokeStart() {},
    finish() {},
  };
}

// --- reading the facts ---

// The settled cells of a writing grown on the calibration paper, with what the
// observer saw: [x, y, ink (ΣF), maxW, cap, hold, rewet (times the pen laid ink on its dried ink), fib0..3].
export function calibrationCells(actsBytes) {
  const rec = decodeCanonical(actsBytes);
  const strokes = rec.strokes.map((s, i) => ({ ...s, pens: i === 0 ? [{ at: 0, mask: 0x3f, ...CALIBRATION_PEN }] : [] }));
  const res = grow({ ...rec, strokes, orgX: 0, orgY: 0 }, {
    paperKey: calibrationPaperKey(), family: CALIBRATION_FAMILY, instrument: observer(),
  });
  const cells = [];
  for (const t of res.tiles) {
    for (let i = 0; i < TT; i++) {
      const ink = t.F[3 * i] + t.F[3 * i + 1] + t.F[3 * i + 2];
      if (ink === 0) continue;
      const fib = t.h.fib;
      cells.push([
        t.tx * TILE + (i % TILE), t.ty * TILE + Math.floor(i / TILE), ink, t.h.maxW[i], t.cap[i], t.hold[i],
        t.h.rewet[i], fib[4 * i], fib[4 * i + 1], fib[4 * i + 2], fib[4 * i + 3],
      ]);
    }
  }
  cells.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  return { cells, rec };
}

// Split coordinate values into `k` parts at quantiles of mass. Returns k−1 cut points.
function cutsByMass(cells, axis, k) {
  const byPos = new Map();
  let total = 0;
  for (const c of cells) {
    byPos.set(c[axis], (byPos.get(c[axis]) ?? 0) + c[2]);
    total += c[2];
  }
  const pos = [...byPos.keys()].sort((a, b) => a - b);
  const cuts = [];
  let acc = 0;
  let next = 1;
  for (const p of pos) {
    acc += byPos.get(p);
    while (next < k && acc * k >= total * next) {
      cuts.push(p);
      next++;
    }
  }
  while (cuts.length < k - 1) cuts.push(pos[pos.length - 1] ?? 0);
  return cuts;
}
const partOf = (v, cuts) => {
  let i = 0;
  while (i < cuts.length && v > cuts[i]) i++;
  return i;
};

export const ZONE_FEATURES = ['width', 'density', 'coverage', 'dark', 'beads', 'beadHeight', 'thin', 'rewet', 'pieces', 'inkCV', 'spots'];
export const GLOBAL_FEATURES = ['inkQ25', 'inkQ50', 'inkQ75', 'thin', 'beadsPerInk', 'beadHeight', 'rewet', 'piecesPerInk', 'inkCV', 'spotsPerInk', 'aspect', 'coverage'];

const share = (a, b) => (b > 0 ? floorDiv(a * 1000, b) : 0);

// Connected regions of a set of "x,y" keys (4- or 8-neighbour).
function regions(keys, diagonal) {
  const steps = diagonal
    ? [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]
    : [[1, 0], [-1, 0], [0, 1], [0, -1]];
  let count = 0;
  const seen = new Set();
  for (const key of keys) {
    if (seen.has(key)) continue;
    count++;
    const stack = [key];
    seen.add(key);
    while (stack.length) {
      const [x, y] = stack.pop().split(',').map(Number);
      for (const [dx, dy] of steps) {
        const k2 = `${x + dx},${y + dy}`;
        if (keys.has(k2) && !seen.has(k2)) {
          seen.add(k2);
          stack.push(k2);
        }
      }
    }
  }
  return count;
}

// Features of one group of cells. `bounds` = [x0, y0, x1, y1] of the group's area.
function groupFeatures(group, bounds, all) {
  const inked = group.filter((c) => c[2] >= VISIBLE);
  const n = inked.length;
  const mass = group.reduce((s, c) => s + c[2], 0);
  const [x0, y0, x1, y1] = bounds;
  const area = Math.max(1, (x1 - x0 + 1) * (y1 - y0 + 1));
  const sortedInk = inked.map((c) => c[2]).sort((a, b) => a - b);
  const q = (f) => (n ? sortedInk[Math.min(n - 1, floorDiv(n * f, 100))] : 0);
  const median = q(50);

  // Pieces: connected (8-neighbour) regions of inked cells. Pen lifts, and
  // letters set down one by one, leave gaps the ink shows.
  const inkKeys = new Set(inked.map((c) => `${c[0]},${c[1]}`));
  const pieces = regions(inkKeys, true);

  // How much the ink varies from cell to cell (×1000 of the mean): a pen that
  // speeds up and slows down lays uneven ink; a careful, even pace does not.
  let sx = 0, sxx = 0;
  for (const c of inked) {
    const v = Math.floor(c[2] / 16);
    sx += v;
    sxx += v * v;
  }
  const inkCV = n && sx ? floorDiv(isqrt(Math.max(0, n * sxx - sx * sx)) * 1000, sx) : 0;

  // Dwell spots: cells at least 2.5× the writing's median ink that are the
  // darkest within two cells: where the pen paused.
  const inkAt = new Map(inked.map((c) => [`${c[0]},${c[1]}`, c[2]]));
  let spots = 0;
  const floor = floorDiv(5 * (all.median || median || 1), 2);
  for (const c of inked) {
    if (c[2] < floor) continue;
    let top = true;
    for (let dy = -2; dy <= 2 && top; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        if ((dx || dy) && (inkAt.get(`${c[0] + dx},${c[1] + dy}`) ?? 0) > c[2]) {
          top = false;
          break;
        }
      }
    }
    if (top) spots++;
  }

  // Beads: connected (4-neighbour) regions of cells whose water stood above capacity + hold.
  const bead = new Set();
  let beadHeight = 0;
  for (const c of group) {
    if (c[3] > c[4] + c[5]) bead.add(`${c[0]},${c[1]}`);
    if (c[3] - c[4] > beadHeight) beadHeight = c[3] - c[4];
  }
  const beads = regions(bead, false);

  // Hairlines: inked cells whose run across (in x or in y) is short.
  const inkSet = new Set(inked.map((c) => `${c[0]},${c[1]}`));
  const run = (x, y, dx, dy) => {
    let r = 1;
    for (let s = 1; s <= THIN && inkSet.has(`${x + s * dx},${y + s * dy}`); s++) r++;
    for (let s = 1; s <= THIN && inkSet.has(`${x - s * dx},${y - s * dy}`); s++) r++;
    return r;
  };
  let thin = 0;
  for (const c of inked) if (run(c[0], c[1], 1, 0) <= THIN || run(c[0], c[1], 0, 1) <= THIN) thin++;

  let rewet = 0;
  for (const c of group) if (c[6] > 0) rewet++;
  return {
    n, mass, area, median, beads, beadHeight, thin, rewet, q, pieces, inkCV, spots,
    dark: n ? share(inked.filter((c) => c[2] > 2 * (all.median || 1)).length, n) : 0,
  };
}

// readHand(acts, { bands, zones }) → { zone: Int32Array(bands·zones·Z), global: Int32Array(G) }
export function readHand(actsBytes, { bands = 1, zones = 8 } = {}) {
  const { cells } = calibrationCells(actsBytes);
  return readCells(cells, { bands, zones });
}

export function readCells(cells, { bands = 1, zones = 8 } = {}) {
  if (!cells.length) throw new Error('nothing was written');
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const c of cells) {
    if (c[0] < x0) x0 = c[0];
    if (c[0] > x1) x1 = c[0];
    if (c[1] < y0) y0 = c[1];
    if (c[1] > y1) y1 = c[1];
  }
  const all = groupFeatures(cells, [x0, y0, x1, y1], { median: 0 });
  const allWithMedian = { median: all.median };

  const bandCuts = cutsByMass(cells, 1, bands);
  const zone = new Int32Array(bands * zones * ZONE_FEATURES.length);
  for (let b = 0; b < bands; b++) {
    const inBand = cells.filter((c) => partOf(c[1], bandCuts) === b);
    const cuts = cutsByMass(inBand.length ? inBand : cells, 0, zones);
    const bx = [x0, ...cuts.map((v) => v + 1)];
    const ex = [...cuts, x1];
    for (let z = 0; z < zones; z++) {
      const group = inBand.filter((c) => partOf(c[0], cuts) === z);
      let gy0 = Infinity, gy1 = -Infinity;
      for (const c of group) {
        if (c[1] < gy0) gy0 = c[1];
        if (c[1] > gy1) gy1 = c[1];
      }
      if (gy0 === Infinity) gy0 = gy1 = 0;
      const g = groupFeatures(group, [bx[z], gy0, ex[z], gy1], allWithMedian);
      const values = [
        share(Math.max(0, ex[z] - bx[z] + 1), x1 - x0 + 1), // width share of the writing
        g.n ? floorDiv(g.mass, g.n) : 0, // ink per inked cell
        share(g.n, g.area), // how full the zone's box is
        g.dark,
        g.beads,
        g.beadHeight,
        share(g.thin, g.n),
        share(g.rewet, g.n),
        g.pieces,
        g.inkCV,
        g.spots,
      ];
      zone.set(values, (b * zones + z) * ZONE_FEATURES.length);
    }
  }

  const global = Int32Array.from([
    all.q(25), all.q(50), all.q(75),
    share(all.thin, all.n),
    share(all.beads * 1000, Math.max(1, all.n)),
    all.beadHeight,
    share(all.rewet, all.n),
    share(all.pieces * 1000, Math.max(1, all.n)),
    all.inkCV,
    share(all.spots * 1000, Math.max(1, all.n)),
    share(y1 - y0 + 1, x1 - x0 + 1),
    share(all.n, all.area),
  ]);
  return { zone, global, layout: { bands, zones } };
}

// --- quantizing to bits ---

// Each feature becomes a level 0..7: magnitudes on a log scale (8 steps per
// doubling), shares on a linear one; then 3 Gray-coded bits.
const LOG = 'log';
const LIN = 'lin';
export const ZONE_SPEC = {
  width: [LIN, 30, 25], density: [LOG, 32, 6], coverage: [LIN, 80, 60], dark: [LIN, 0, 60], beads: [LIN, 0, 1],
  beadHeight: [LOG, 40, 6], thin: [LIN, 0, 120], rewet: [LIN, 0, 40], pieces: [LIN, 0, 1], inkCV: [LIN, 200, 80], spots: [LIN, 0, 1],
};
export const GLOBAL_SPEC = {
  inkQ25: [LOG, 40, 4], inkQ50: [LOG, 48, 4], inkQ75: [LOG, 56, 4], thin: [LIN, 0, 120], beadsPerInk: [LOG, 0, 6],
  beadHeight: [LOG, 40, 6], rewet: [LIN, 0, 40], piecesPerInk: [LOG, 0, 6], inkCV: [LIN, 200, 80], spotsPerInk: [LOG, 0, 6],
  aspect: [LOG, 32, 4], coverage: [LIN, 40, 40],
};

// 8 × log2(v), integer: 8·floor(log2 v) + the next three bits.
export function log2x8(v) {
  if (v <= 0) return 0;
  let b = 0;
  while (2 ** (b + 1) <= v) b++;
  return 8 * b + floorDiv((v - 2 ** b) * 8, 2 ** b);
}

export function level(value, [kind, base, step], offset = 0) {
  const v = kind === LOG ? log2x8(value) : value;
  return clamp(floorDiv(v - base + offset, step), 0, 7);
}
const GRAY = [0, 1, 3, 2, 6, 7, 5, 4];

// Bits of a reading. offsets (optional, same shape as the levels) shift each
// feature before quantizing, e.g. to centre a person's own values in their bins.
export function handBits(reading, { useZones = true, useGlobal = true, offsets = null } = {}) {
  const levels = handLevels(reading, { useZones, useGlobal, offsets });
  const bits = new Uint8Array(levels.length * 3);
  levels.forEach((l, i) => {
    const g = GRAY[l];
    bits[3 * i] = (g >> 2) & 1;
    bits[3 * i + 1] = (g >> 1) & 1;
    bits[3 * i + 2] = g & 1;
  });
  return bits;
}

export function handLevels(reading, { useZones = true, useGlobal = true, offsets = null } = {}) {
  const out = [];
  let k = 0;
  if (useZones) {
    for (let i = 0; i < reading.zone.length; i++) {
      const spec = ZONE_SPEC[ZONE_FEATURES[i % ZONE_FEATURES.length]];
      out.push(level(reading.zone[i], spec, offsets ? offsets[k] : 0));
      k++;
    }
  }
  if (useGlobal) {
    for (let i = 0; i < reading.global.length; i++) {
      out.push(level(reading.global[i], GLOBAL_SPEC[GLOBAL_FEATURES[i]], offsets ? offsets[k] : 0));
      k++;
    }
  }
  return out;
}

export const hamming = (a, b) => {
  let d = 0;
  for (let i = 0; i < a.length; i++) d += a[i] !== b[i] ? 1 : 0;
  return d;
};

export const HAND = { version: HAND_VERSION, law: LAW };
