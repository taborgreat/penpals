// What settled ink shows under law v2, and the digests that pin it down.
//
// Facts (sealed, time-free): per cell the fixed pigment F0..2, the fixed oak
// gall FG, the dent, how deep the ink sank (depth), the highest bead (peak),
// soak, wear, flags (torn), the cockle ridge and the film the ink dried to on
// top. factsDigest covers all of them.
//
// The look is a pure function of the facts and two buckets, applied in one
// pass at view time (nothing is stored or scheduled while nobody looks):
//   age      hours since the record was made (oak gall darkens with air)
//   exposure views (every colour fades with light; ink sunk deep fades least)
// At age 0 and exposure 0 it is the canonical look (lookRGB, lookDigest):
// oak gall at its fresh tint, nothing faded. A torn cell holds no ink: it is
// as clear as untouched paper in the look (colour to alpha), and a break in
// the side view.
//
// heightOf and sideView are for viewers (not the published look): the height
// field the scene is built from (scene.js), and a cut through the paper. They
// read the paper's facts (depth, dents).

import { sha256 } from '@noble/hashes/sha2.js';
import { TILE, LAW, SCALE_ONE, THICK, DENT_SHIFT, DEPTH_SHIFT, WEAR_SHIFT, OAK_GALL, GALL_FRESH, AGE_CAP_H,
  EXPOSURE_STEP, FADE_SHIFT, TORN, DENT_Z, FILM_Q } from './constants.js';
import { EXP8, ABS_Q } from '../v1/tables.js';
import { FADE, SURFACE } from './tables.js';
import { GALL_ABS, darkAt, filmLevel } from './sim.js';
import { T, concat, u16be } from '../tags.js';

const TT = TILE * TILE;
const VISIBLE = 4;
const MARGIN = 2;
const i32be = (n) => {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setInt32(0, n, false);
  return b;
};

// Oak gall's absorbance over r, g, b per unit of FG, ×256.
export const GN = OAK_GALL.map((c) => Math.floor((ABS_Q[c] * 256 + (GALL_ABS >> 1)) / GALL_ABS));

// Every cell with a fact, sorted (y, x):
// [y, x, f0, f1, f2, fg, dent, depth, peak, soak, wear, flags, cockle, film]
export function settledCells(tiles) {
  const cells = [];
  for (const t of tiles) {
    for (let i = 0; i < TT; i++) {
      const f0 = t.F[3 * i], f1 = t.F[3 * i + 1], f2 = t.F[3 * i + 2];
      const fg = t.FG ? t.FG[i] : 0;
      const dent = t.dentA[i] >> DENT_SHIFT;
      const depth = Math.min(THICK, t.depthA[i] >> DEPTH_SHIFT);
      const peak = t.peak[i];
      const soak = Math.min(255, t.soakA[i] >> 8);
      const wear = Math.min(255, t.wearA[i] >> WEAR_SHIFT);
      const flags = t.flags[i];
      const cockle = t.cockle[i];
      const film = filmLevel(t.filmA[i]);
      if (!(f0 || f1 || f2 || fg || dent || depth || peak || soak || wear || flags || cockle || film)) continue;
      const x = t.tx * TILE + (i % TILE);
      const y = t.ty * TILE + Math.floor(i / TILE);
      cells.push([y, x, f0, f1, f2, fg, dent, depth, peak, soak, wear, flags, cockle, film]);
    }
  }
  cells.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return cells;
}

// The box of visible ink (pigment or gall), plus a margin.
export function boxOf(cells) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const c of cells) {
    if (Math.max(c[2], c[3], c[4], c[5]) < VISIBLE) continue;
    const [y, x] = c;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  if (x0 === Infinity) return [0, 0, 0, 0];
  return [x0 - MARGIN, y0 - MARGIN, x1 - x0 + 1 + 2 * MARGIN, y1 - y0 + 1 + 2 * MARGIN];
}

export const hasGall = (cells) => cells.some((c) => c[5] > 0);

// The buckets a look is made (and cached) for.
export const ageBucket = (hours) => Math.max(0, Math.min(AGE_CAP_H, Math.floor(hours)));
export const exposureBucket = (views) => Math.max(0, Math.floor(views / EXPOSURE_STEP) * EXPOSURE_STEP);

// How far a cell's gall has darkened (0..256) at `ageH` hours: air reaches a
// hairline at the surface fully, ink sunk deep or under a tall pool less.
export const gallDark = (cell, ageH) => darkAt(cell[7], cell[13], ageBucket(ageH));
// What is left of a cell's colour after `views` (0..256): light reaches the surface first.
export function fadeOf(cell, views) {
  if (!views) return 256;
  const k = Math.floor((exposureBucket(views) * SURFACE[Math.min(THICK, cell[7])]) / (1 << FADE_SHIFT));
  return FADE[Math.min(FADE.length - 1, k)];
}

// Absorbance per channel of one cell, at a view.
function cellAbs(c, ageH, views) {
  let a0 = c[2], a1 = c[3], a2 = c[4];
  if (c[5]) {
    const factor = GALL_FRESH + Math.floor(((256 - GALL_FRESH) * gallDark(c, ageH)) / 256);
    a0 += Math.floor((c[5] * GN[0] * factor) / 65536);
    a1 += Math.floor((c[5] * GN[1] * factor) / 65536);
    a2 += Math.floor((c[5] * GN[2] * factor) / 65536);
  }
  if (views) {
    const f = fadeOf(c, views);
    a0 = Math.floor((a0 * f) / 256);
    a1 = Math.floor((a1 * f) / 256);
    a2 = Math.floor((a2 * f) / 256);
  }
  return [a0, a1, a2];
}
const tOf = (a) => EXP8[Math.min(a >> 2, 2047)];

// Transmittance RGB over the box at a view ({ ageH, views }; zero = the canonical look).
export function lookRGB(cells, box, { ageH = 0, views = 0 } = {}) {
  const [x0, y0, w, h] = box;
  const out = new Uint8Array(w * h * 3).fill(255);
  for (const c of cells) {
    const lx = c[1] - x0, ly = c[0] - y0;
    if (lx < 0 || ly < 0 || lx >= w || ly >= h) continue;
    if (c[11] & TORN) continue;
    const [a0, a1, a2] = cellAbs(c, ageH, views);
    const k = (ly * w + lx) * 3;
    out[k] = tOf(a0);
    out[k + 1] = tOf(a1);
    out[k + 2] = tOf(a2);
  }
  return out;
}

// The published picture: colour to alpha from white (exact over white), as v1.
export function lookRGBA(rgb, box) {
  const [, , w, h] = box;
  const out = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const r = rgb[3 * i], g = rgb[3 * i + 1], b = rgb[3 * i + 2];
    const a = 255 - Math.min(r, g, b);
    out[4 * i + 3] = a;
    if (a === 0) continue;
    out[4 * i] = 255 - Math.round(((255 - r) * 255) / a);
    out[4 * i + 1] = 255 - Math.round(((255 - g) * 255) / a);
    out[4 * i + 2] = 255 - Math.round(((255 - b) * 255) / a);
  }
  return out;
}

export function factsDigest({ cells, box, actsBytes, family, scale = SCALE_ONE, law = LAW }) {
  const h = sha256.create();
  h.update(T('facts'));
  h.update(u16be(law));
  h.update(sha256(actsBytes));
  h.update(Uint8Array.of(family.grain, family.weight, family.tooth));
  h.update(u16be(scale));
  for (const v of box) h.update(i32be(v));
  h.update(i32be(cells.length));
  const row = new Uint8Array(24);
  const dv = new DataView(row.buffer);
  for (const c of cells) {
    dv.setInt32(0, c[1], false);
    dv.setInt32(4, c[0], false);
    dv.setUint16(8, c[2], false);
    dv.setUint16(10, c[3], false);
    dv.setUint16(12, c[4], false);
    dv.setUint16(14, c[5], false);
    for (let k = 0; k < 7; k++) row[16 + k] = c[6 + k];
    row[23] = c[13]; // film: the ink dried on top
    h.update(row);
  }
  return h.digest();
}

export function lookDigest(rgb, box) {
  return sha256(concat(T('look'), ...box.map(i32be), rgb));
}

// --- viewer modes (not the published look; display only, floats allowed) ---

const PAPER = [244, 238, 226];
const cellMap = (cells) => {
  const m = new Map();
  for (const c of cells) m.set(`${c[1]},${c[0]}`, c);
  return m;
};
export const inkColor = (c, ageH = 0, views = 0) => cellAbs(c, ageH, views).map((a) => tOf(a));
export const hasInk = (c) => !!(c[2] || c[3] || c[4] || c[5]);

// The height field of one cell (the scene, §0), in drops (the unit of water,
// and of the paper's own height): the surface (cockle up, a dent down), what
// stands above it (the bead while wet: rows from live.cut carry it at [14];
// once dry only the film the ink left on top, the ring a little higher; never
// the peak) and how deep the liquid sank below it (levels of THICK).
export function heightOf(c) {
  return {
    surface: c[12] - c[6] * DENT_Z,
    above: (c[14] ?? 0) + c[13] * FILM_Q,
    wet: (c[14] ?? 0) > 0,
    depth: c[7],
    torn: (c[11] & TORN) !== 0,
  };
}
const FLAT = { surface: 0, above: 0, wet: false, depth: 0, torn: false };

// A cut through the paper along (x0, y0) → (x1, y1) (sheet cells), `px` pixels
// per cell: the paper body in layers, its surface with dents and ridges, the
// liquid sunk into the fibers below it, and above it the bead (while wet) or
// the film it dried to. Heights are interpolated between cells, not drawn as
// bars. A viewer mode, not the look: it shows the paper's facts.
export function sideView(cells, { x0, y0, x1, y1 }, { px = 4, ageH = 0, views = 0 } = {}) {
  const map = cellMap(cells);
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) + 1;
  const DROPS_PX = 12; // drops of height per pixel above the paper
  const LV = 3; // pixels per depth level
  const HEAD = 72; // room above the surface for beads and ridges
  const body = (THICK + 2) * LV;
  const H = HEAD + body + 8;
  const W = n * px;
  const rgba = new Uint8ClampedArray(W * H * 4);
  const put = (x, y, [r, g, b], a = 255) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const k = (y * W + x) * 4;
    const al = a / 255;
    rgba[k] = Math.round(r * al + rgba[k] * (1 - al));
    rgba[k + 1] = Math.round(g * al + rgba[k + 1] * (1 - al));
    rgba[k + 2] = Math.round(b * al + rgba[k + 2] * (1 - al));
    rgba[k + 3] = Math.max(rgba[k + 3], a);
  };
  const samples = [];
  for (let s = 0; s < n; s++) {
    const cx = Math.round(x0 + ((x1 - x0) * s) / Math.max(1, n - 1));
    const cy = Math.round(y0 + ((y1 - y0) * s) / Math.max(1, n - 1));
    const c = map.get(`${cx},${cy}`);
    samples.push(c ? { ...heightOf(c), ink: hasInk(c) ? inkColor(c, ageH, views) : null } : { ...FLAT, ink: null });
  }
  const lerp = (a, b, f) => a + (b - a) * f;
  for (let X = 0; X < W; X++) {
    // between the centres of the two nearest cells
    const t = Math.min(n - 1, Math.max(0, (X + 0.5) / px - 0.5));
    const s0 = Math.floor(t);
    const s1 = Math.min(n - 1, s0 + 1);
    const f = t - s0;
    const a = samples[s0], b = samples[s1];
    const near = f < 0.5 ? a : b;
    if (near.torn) continue; // the break: the page behind
    const surface = HEAD - Math.round(lerp(a.surface, b.surface, f) / DROPS_PX);
    const above = Math.round(lerp(a.above, b.above, f) / DROPS_PX);
    const depthPx = Math.round(lerp(a.depth, b.depth, f) * LV);
    const bottom = HEAD + body;
    for (let y = Math.max(0, surface); y < bottom; y++) {
      const layer = (y - HEAD) % LV === 0 ? 0.94 : 1;
      put(X, y, PAPER.map((v) => Math.round(v * layer)));
    }
    const ink = near.ink ?? a.ink ?? b.ink;
    if (ink && depthPx > 0) {
      for (let y = Math.max(0, surface); y < Math.min(bottom, surface + depthPx); y++) {
        const fall = 1 - ((y - surface) / depthPx) * 0.6; // fainter as it sinks
        put(X, y, ink, Math.round(255 * fall));
      }
    } else if (depthPx > 0) {
      for (let y = Math.max(0, surface); y < Math.min(bottom, surface + depthPx); y++) put(X, y, [196, 210, 230], 60); // water only
    }
    if (above > 0) {
      const wet = a.wet || b.wet;
      const col = ink ?? [140, 160, 210];
      for (let y = Math.max(0, surface - above); y < surface; y++) put(X, y, col, wet ? 150 : 235); // a bead, or the film
    }
  }
  return { width: W, height: H, rgba };
}
