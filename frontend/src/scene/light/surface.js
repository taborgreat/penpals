// The room's surfaces, grown on the fly (light-waves §4): walls, ceiling,
// floor and table top are cells at the paper's grain, each cell's small
// height, its tone (where it sits between its matter's light and dark curves)
// and, for wood, its grain direction come from hashing its coordinates with
// the surface's seed. Nothing is stored and there are no texture files: the
// shader grows each cell as the pixel is drawn, a few dozen integer
// operations, so the room can be billions of cells.
//
// The same layered randomness as the paper (law/v1/paper.js): a per-cell
// 4-bit jitter, and smoothstep-bilinear lattices at several scales.
//   plaster  small bumps (16 and 128 cells) and slow tone shifts (2048 and
//            16384 cells)
//   planks   the floor: boards about 12 cm wide running along u, staggered
//            ends, seams that sit lower and darker; in each board growth
//            rings (a sawtooth: earlywood darkening into latewood, then a
//            sharp return), grain streaks, its own tone
//   board    the table top: wide boards glued edge to edge, no ends
// and the things' matter (matter-fixes §3), grown as plaster is, each by its own
// constants (FINE): brass, wax, wick, cloth, skin. A thing's cells are on its
// own surface (objectCells), so they go where it goes.
//
// Grown, never stored: a cell is a function of (kind, seed, x, y) only.
// Crisp cells use only 32-bit unsigned integer operations (Wellons'
// lowbias32 hash; integer smoothstep weights), so the same seed draws the
// same cells on every device: this file's JS, the GLSL (SURFACE_GLSL, WebGL2)
// and the WGSL (SURFACE_WGSL, WebGPU) agree bit for bit (e2e/grower.mjs
// checks it in a browser). Their constants are this file's, interpolated.
//
// The view picks the level:
//   growCell   up close: the cell itself, drawn crisp (nearest); cellFace its
//              own face to the light from its neighbours' heights
//   growMean   far away, where many cells fall in one pixel: their averaged
//              character over the pixel's footprint (`foot` cells), so there
//              is no shimmer. Each layer fades to its mean as the footprint
//              passes its scale; seams and rings are box-filtered exactly,
//              and the boards the footprint covers blend by their shares.
//              Floats, smooth; at foot ≤ 1 it is growCell.
//
// A surface's cells are addressed by integer (x, y) ≥ 0 in its own (u, v)
// frame from its corner. tone 0..255 mixes the surface's curves:
// R(λ) = mix(light(λ), dark(λ), tone / 255) (the curve table's pairs, CURVES_OF),
// so the averaged tone gives exactly the averaged reflectance. height is in the
// paper's height units (drops; the paper's own roughness spans 0..120).
// rooms.md passes each surface's seed grown from the owner's key; until then
// a fixed default (DEFAULT_SEEDS). Plus its facts: writing or wax on a surface
// is drawn over this like ink over paper. The scene only.

import { CELLS_PER_UNIT } from 'penpals-law/v1/constants';

export const CELL_PX = 1 / CELLS_PER_UNIT; // page px a cell: the paper's grain
export const PX_PER_M = 1400 / 0.2159; // page px a metre (1400 across a letter-width page: ink/nibs.js PX_PER_MM)
export const CELL_M = CELL_PX / PX_PER_M; // about 77 µm

export const PLASTER = 0;
export const PLANKS = 1;
export const BOARD = 2;
export const BRASS = 3;
export const WAX = 4;
export const WICK = 5;
export const CLOTH = 6;
export const SKIN = 7;
export const KINDS = Object.freeze({ plaster: PLASTER, planks: PLANKS, board: BOARD, brass: BRASS, wax: WAX, wick: WICK, cloth: CLOTH, skin: SKIN });
export const CURVES_OF = Object.freeze(['plaster', 'floor', 'table', 'brass', 'wax', 'wick', 'cloth', 'skin']); // kind → the curve table's light/dark pair

// Hash tags (one stream of randomness per layer).
const T_CELL = 1, T_BUMP1 = 2, T_BUMP2 = 3, T_TONE1 = 4, T_TONE2 = 5, T_ROW = 6, T_BOARD = 7, T_WOB = 8, T_STREAK = 9;
const GOLD = 0x9e3779b9;

// --- the fine kinds: plaster, and the things' matter ---
// Two lattices of bumps and two of tone, each its steps along x and y (log2
// cells); how much of each (heights: /32; tones: /16); how far the cell's own
// jitter is shifted down into the height and the tone; the tone's base.
//   plaster  troweled: small bumps (16 and 128 cells), slow tone shifts (2048 and
//            16384 cells); about 48..94, around 71
//   brass    turned and polished: fine scratches along x (64 cells long, a cell
//            wide: around a holder, the lathe's) and pits, low; tarnish in slow patches
//   wax      poured: faint bumps, its tone barely moving
//   wick     braided cotton: threads across, charred in patches
//   cloth    woven: warp and weft threads four cells wide
//   skin     smooth, with fine pores
const FINE = {
  [PLASTER]: { b: [4, 4, 7, 7], t: [11, 11, 14, 14], w: [3, 5, 1, 1], jz: 1, jt: 0, base: 48 },
  [BRASS]: { b: [6, 0, 2, 2], t: [9, 9, 12, 12], w: [1, 1, 2, 2], jz: 3, jt: 2, base: 16 },
  [WAX]: { b: [4, 4, 7, 7], t: [10, 10, 13, 13], w: [1, 1, 1, 1], jz: 4, jt: 2, base: 48 },
  [WICK]: { b: [0, 2, 2, 2], t: [3, 3, 6, 6], w: [4, 4, 2, 2], jz: 1, jt: 0, base: 64 },
  [CLOTH]: { b: [2, 0, 0, 2], t: [8, 8, 11, 11], w: [4, 4, 1, 1], jz: 2, jt: 1, base: 56 },
  [SKIN]: { b: [2, 2, 5, 5], t: [9, 9, 12, 12], w: [1, 1, 1, 1], jz: 3, jt: 2, base: 48 },
};
const FINE_KINDS = Object.keys(FINE).map(Number);
// a fine kind's constants as the shaders take them
const fineArgs = (k, u4, u3) => {
  const { b, t, w, jz, jt, base } = FINE[k];
  const us = (a) => a.map((v) => `${v}u`).join(', ');
  return `${u4}(${us(b)}), ${u4}(${us(t)}), ${u4}(${us(w)}), ${u3}(${us([jz, jt, base])})`;
};

// --- wood ---
// Per kind: board width across (cells), whether boards end (staggered ends
// along u), the seam's width, tone and height, the wood's tone base.
const WOOD = {
  [PLANKS]: { width: 1536, ends: 1, seam: 12, seamTone: 224, seamZ: -40, base: 64 },
  [BOARD]: { width: 3200, ends: 0, seam: 3, seamTone: 176, seamZ: -8, base: 72 },
};
const ROW_MIN = 8192, ROW_MASK = 8191; // board lengths 8192..16383 cells (0.63..1.26 m)
const RING_MIN = 24, RING_MASK = 31; // ring spacing 24..55 cells (1.8..4.2 mm)
const RING_TONE = 80, STREAK_TONE = 40; // /256 of ring darkness, streak value, into tone
const WOB_K = 11, WOB_AMP = 96; // the rings' wobble along the board: lattice step (log2), amplitude (/128 of 0..255)
const STREAK_KX = 11, STREAK_KY = 2; // streaks: long along the board, narrow across
const GRAIN_DU = 128, GRAIN_T = 13; // the wobble's rise over GRAIN_DU cells past which the grain turns 11.25°
const WOOD_Z = 24;

// Wellons' lowbias32: a 32-bit integer mixer, the same on every device.
function lowbias(x) {
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return x >>> 0;
}
// A surface's seed ([s0, s1], two uint32) folded to one, once (the shader takes this).
export const seedMix = ([s0, s1]) => lowbias((s0 ^ lowbias(s1 >>> 0)) >>> 0);
const mixOf = (seed) => (typeof seed === 'number' ? seed >>> 0 : seedMix(seed));
const tagOf = (mix, tag) => lowbias((mix ^ Math.imul(tag, GOLD)) >>> 0);
const hash = (t, i, j) => lowbias((i ^ lowbias((j ^ t) >>> 0)) >>> 0);

// The default seed of a named surface (the room's own, until rooms.md grows them from a key).
function fnv(s, h = 0x811c9dc5) {
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h >>> 0;
}
export const defaultSeed = (name) => [fnv(`penpals room ${name}`), fnv(`penpals room ${name}`, 0x2545f491)];
export const DEFAULT_SEEDS = Object.freeze(Object.fromEntries(
  ['floor', 'ceiling', 'wall-near', 'wall-far', 'wall-left', 'wall-right', 'table'].map((n) => [n, Object.freeze(defaultSeed(n))]),
));

// Integer smoothstep: t 0..256 → 0..256.
const smooth8 = (t) => (t * t * (768 - 2 * t)) >>> 16;
// x's place within its lattice step 2^k, as 0..256.
const frac8 = (x, k) => {
  const f = x & ((1 << k) - 1);
  return k <= 8 ? f << (8 - k) : f >>> (k - 8);
};
// A value-noise lattice (0..255), steps 2^kx along x and 2^ky along y.
function lattice(t, x, y, kx, ky) {
  const i = x >>> kx, j = y >>> ky;
  const wx = smooth8(frac8(x, kx)), wy = smooth8(frac8(y, ky));
  const n00 = hash(t, i, j) & 255, n10 = hash(t, i + 1, j) & 255;
  const n01 = hash(t, i, j + 1) & 255, n11 = hash(t, i + 1, j + 1) & 255;
  const s = n00 * (256 - wx) * (256 - wy) + n10 * wx * (256 - wy) + n01 * (256 - wx) * wy + n11 * wx * wy;
  return (s + 32768) >>> 16;
}
// The same along one axis only (row b of nodes).
function lattice1(t, x, k, b) {
  const i = x >>> k, w = smooth8(frac8(x, k));
  return ((hash(t, i, b) & 255) * (256 - w) + (hash(t, i + 1, b) & 255) * w + 128) >>> 8;
}

// Where a cell sits among the boards: its row (across), board (along), and
// its place in that board.
function boardOf(P, t, x, y) {
  const r = Math.floor(y / P.width);
  const v = y - r * P.width;
  let U = x, b = 0, L = 0;
  if (P.ends) {
    const hr = hash(t.row, r, 0);
    L = ROW_MIN + (hr & ROW_MASK);
    U = x + ((hr >>> 13) % L);
    b = Math.floor(U / L);
  }
  return { r, v, U, b, L, u: U - b * L, hb: hash(t.board, b, r), id: r * 64 + b };
}
const tagsOf = (m) => ({ row: tagOf(m, T_ROW), board: tagOf(m, T_BOARD), wob: tagOf(m, T_WOB), streak: tagOf(m, T_STREAK), cell: tagOf(m, T_CELL) });

// One cell, crisp: { height, tone, grain } (integers). seed: [s0, s1], or its seedMix.
export function growCell(kind, seed, x, y) {
  const m = mixOf(seed);
  const j = hash(tagOf(m, T_CELL), x, y) & 15;
  const F = FINE[kind];
  if (F) {
    const { b, t, w } = F;
    const b1 = lattice(tagOf(m, T_BUMP1), x, y, b[0], b[1]);
    const b2 = lattice(tagOf(m, T_BUMP2), x, y, b[2], b[3]);
    const t1 = lattice(tagOf(m, T_TONE1), x, y, t[0], t[1]);
    const t2 = lattice(tagOf(m, T_TONE2), x, y, t[2], t[3]);
    return { height: ((b1 * w[0] + b2 * w[1] + 16) >>> 5) + (j >>> F.jz), tone: F.base + ((t1 * w[2] + t2 * w[3] + 8) >>> 4) + (j >>> F.jt), grain: 0 };
  }
  const P = WOOD[kind];
  const t = tagsOf(m);
  const B = boardOf(P, t, x, y);
  if (B.v < P.seam || (P.ends && B.u < P.seam)) return { height: P.seamZ + (j >>> 2), tone: P.seamTone + j, grain: 0 };
  const spacing = RING_MIN + (B.hb & RING_MASK);
  const wob = (lattice1(t.wob, B.U, WOB_K, B.id) * WOB_AMP) >>> 7;
  const rho = B.v + ((B.hb >>> 5) & 1023) + wob;
  const ring = Math.floor(((rho % spacing) * 510 + 255) / (2 * spacing)); // at the cell's middle
  const st = lattice(t.streak, B.U + ((B.hb >>> 20) << 4), B.v, STREAK_KX, STREAK_KY);
  const rise = ((lattice1(t.wob, B.U + GRAIN_DU, WOB_K, B.id) * WOB_AMP) >>> 7) - wob;
  return {
    height: WOOD_Z + ((ring + 8) >>> 4) + ((st + 16) >>> 5) + (j >>> 2),
    tone: P.base + ((B.hb >>> 15) & 31) + ((ring * RING_TONE + 128) >>> 8) + ((st * STREAK_TONE + 128) >>> 8) + j,
    grain: rise >= GRAIN_T ? 1 : rise <= -GRAIN_T ? 15 : 0,
  };
}

// A cell's own face to the light: its height's rise to the +x and +y neighbours.
export function cellFace(kind, seed, x, y) {
  const m = mixOf(seed);
  const h = growCell(kind, m, x, y).height;
  return [growCell(kind, m, x + 1, y).height - h, growCell(kind, m, x, y + 1).height - h];
}

// Metres in a surface's frame → its cell.
export const cellOf = (u, v) => [Math.floor(u / CELL_M), Math.floor(v / CELL_M)];

// A thing's cells (matter-fixes §3): on its own surface, counted from its own
// corner, so its grain goes where it goes (the shader's, nodes.js objectMaterial).
//   shape   'box' (a unit box about its middle: each face its two axes), 'round'
//           (a cylinder of radius 1 about its z axis: around it, the arc from its
//           back, and up it; its caps flat) or 'ball' (a sphere of radius 1, about its y)
//   local   the point in the shape's own units; normal its face's (local)
//   scale   the thing's size: page px a local unit, along each axis
// → [x, y] cells (fractional, ≥ 0)
export function objectCells(shape, [x, y, z], normal, [sx, sy, sz]) {
  const k = 1 / CELL_PX;
  if (shape === 'box') {
    if (Math.abs(normal[2]) > 0.5) return [(x + 0.5) * sx * k, (y + 0.5) * sy * k];
    if (Math.abs(normal[0]) > 0.5) return [(y + 0.5) * sy * k, (z + 0.5) * sz * k];
    return [(x + 0.5) * sx * k, (z + 0.5) * sz * k];
  }
  if (shape === 'ball') return [(Math.atan2(z, x) + Math.PI) * sx * k, (y + 1) * sy * k];
  if (Math.abs(normal[2]) > 0.5) return [(x + 1) * sx * k, (y + 1) * sy * k];
  return [(Math.atan2(y, x) + Math.PI) * sx * k, (z + 1) * sz * k];
}

// Each thing's own seed (matter-fixes §3), from the room's (its owner's key) and the
// thing's name: the same thing grows the same for everyone who sees it.
export const thingSeed = (roomMix, name) => lowbias((roomMix ^ fnv(`penpals thing ${name}`)) >>> 0);

// --- far away: the averaged character ---
const smoothstep = (a, b, x) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};
// How much of a layer of scale s (cells) is left at a footprint of `foot` cells.
const fade = (s, foot) => 1 - smoothstep(Math.max(1, s / 2), 2 * s, foot);
// The lattice as a smooth function of a position in cells (nodes as the crisp one).
function latticeF(t, x, y, sx, sy) {
  const qx = Math.max(0, x) / sx, qy = Math.max(0, y) / sy;
  const i = Math.floor(qx), j = Math.floor(qy);
  const fx = qx - i, fy = qy - j;
  const wx = fx * fx * (3 - 2 * fx), wy = fy * fy * (3 - 2 * fy);
  const a = (hash(t, i, j) & 255) * (1 - wx) + (hash(t, i + 1, j) & 255) * wx;
  const b = (hash(t, i, j + 1) & 255) * (1 - wx) + (hash(t, i + 1, j + 1) & 255) * wx;
  return a * (1 - wy) + b * wy;
}
function lattice1F(t, x, s, b) {
  const q = Math.max(0, x) / s, i = Math.floor(q), f = q - i, w = f * f * (3 - 2 * f);
  return (hash(t, i, b) & 255) * (1 - w) + (hash(t, i + 1, b) & 255) * w;
}
// The share of [c − f/2, c + f/2] covered by strips [kP, kP + s) (a box filter, exact).
const stripC = (x, P, s) => {
  const k = Math.floor(x / P);
  return k * s + Math.min(x - k * P, s);
};
const strip = (c, f, P, s) => (stripC(c + f / 2, P, s) - stripC(c - f / 2, P, s)) / f;
// The mean of the sawtooth (x mod P) / P over [c − f/2, c + f/2] (exact).
const sawC = (x, P) => {
  const k = Math.floor(x / P), r = x - k * P;
  return (k * P) / 2 + (r * r) / (2 * P);
};
const saw = (c, f, P) => (sawC(c + f / 2, P) - sawC(c - f / 2, P)) / f;

// How much of [a, b] lies in [lo, hi], as a share of f.
const share = (a, b, lo, hi, f) => Math.max(0, Math.min(b, hi) - Math.max(a, lo)) / f;
// Wood's averaged character over all boards: [height, tone], seams and jitter aside.
const woodMean = (P) => [WOOD_Z + 127.5 / 16 + 127.5 / 32, P.base + 15.5 + (127.5 * RING_TONE) / 256 + (127.5 * STREAK_TONE) / 256];

// One board's wood (seams and jitter aside) over the footprint at (x, y): the
// board holding cell (cx, cy). [height, tone].
function boardMean(P, t, cx, cy, x, y, foot) {
  const B = boardOf(P, t, cx, cy);
  const U = B.U + (x - cx), v = B.v + (y - cy); // the footprint's centre in this board's frame
  const spacing = RING_MIN + (B.hb & RING_MASK);
  const wob = (lattice1F(t.wob, U - 0.5, 1 << WOB_K, B.id) * WOB_AMP) / 128;
  const ring = 255 * saw(v + ((B.hb >>> 5) & 1023) + wob, foot, spacing);
  const st = 127.5 + fade(1 << STREAK_KY, foot) * (latticeF(t.streak, U + ((B.hb >>> 20) << 4) - 0.5, v - 0.5, 1 << STREAK_KX, 1 << STREAK_KY) - 127.5);
  return [WOOD_Z + ring / 16 + st / 32, P.base + ((B.hb >>> 15) & 31) + (ring * RING_TONE) / 256 + (st * STREAK_TONE) / 256];
}
// Along one row: the board under (cx, cy) and the one the footprint reaches
// into past its end, each by its share (what is past both: the mean).
function rowMean(P, t, cx, cy, x, y, foot) {
  if (!P.ends) return boardMean(P, t, cx, cy, x, y, foot);
  const B = boardOf(P, t, cx, cy);
  const U = B.U + (x - cx), lo = B.U - B.u, hi = lo + B.L, a = U - foot / 2, b = U + foot / 2;
  const wc = share(a, b, lo, hi, foot);
  const out = boardMean(P, t, cx, cy, x, y, foot).map((v) => v * wc);
  let wn = 0;
  if (a < lo && cx > B.u) {
    wn = share(a, b, lo - B.L, lo, foot);
    boardMean(P, t, cx - B.u - 1, cy, x, y, foot).forEach((v, i) => { out[i] += v * wn; });
  } else if (b > hi) {
    wn = share(a, b, hi, hi + B.L, foot);
    boardMean(P, t, cx + B.L - B.u, cy, x, y, foot).forEach((v, i) => { out[i] += v * wn; });
  }
  return woodMean(P).map((v, i) => out[i] + v * Math.max(0, 1 - wc - wn));
}

// The averaged character over a pixel's footprint, centred at (x, y) cells
// (fractional), `foot` cells across: { height, tone } (floats).
export function growMean(kind, seed, x, y, foot) {
  const cx = Math.floor(Math.max(0, x)), cy = Math.floor(Math.max(0, y));
  if (foot <= 1) {
    const c = growCell(kind, seed, cx, cy);
    return { height: c.height, tone: c.tone };
  }
  const m = mixOf(seed);
  const j = 7.5 + fade(1, foot) * ((hash(tagOf(m, T_CELL), cx, cy) & 15) - 7.5);
  const F = FINE[kind];
  if (F) {
    // a crisp cell's value is its lattice at its corner: the smooth one is read half a
    // cell back; a layer fades as the footprint passes its finer step
    const lay = (tag, kx, ky) => 127.5 + fade(1 << Math.min(kx, ky), foot) * (latticeF(tagOf(m, tag), x - 0.5, y - 0.5, 1 << kx, 1 << ky) - 127.5);
    const { b, t, w } = F;
    const b1 = lay(T_BUMP1, b[0], b[1]), b2 = lay(T_BUMP2, b[2], b[3]);
    const t1 = lay(T_TONE1, t[0], t[1]), t2 = lay(T_TONE2, t[2], t[3]);
    return { height: (b1 * w[0] + b2 * w[1]) / 32 + j / (1 << F.jz), tone: F.base + (t1 * w[2] + t2 * w[3]) / 16 + j / (1 << F.jt) };
  }
  // the rows of boards the footprint covers, each by its share: this row, the
  // one it reaches into, and past those the mean
  const P = WOOD[kind];
  const t = tagsOf(m);
  const W = P.width, lo = Math.floor(cy / W) * W, hi = lo + W, a = y - foot / 2, b = y + foot / 2;
  const wc = share(a, b, lo, hi, foot);
  const wood = rowMean(P, t, cx, cy, x, y, foot).map((v) => v * wc);
  let wn = 0;
  if (a < lo && lo > 0) {
    wn = share(a, b, lo - W, lo, foot);
    rowMean(P, t, cx, lo - 1, x, y, foot).forEach((v, i) => { wood[i] += v * wn; });
  } else if (b > hi) {
    wn = share(a, b, hi, hi + W, foot);
    rowMean(P, t, cx, hi, x, y, foot).forEach((v, i) => { wood[i] += v * wn; });
  }
  const [height, tone] = woodMean(P).map((v, i) => wood[i] + v * Math.max(0, 1 - wc - wn) + j / (i ? 1 : 4));
  // and the seams over it: across between rows, along at this row's board ends
  const B = boardOf(P, t, cx, cy);
  const across = strip(y, foot, W, P.seam);
  const along = P.ends ? strip(B.U + (x - cx), foot, B.L, P.seam) : 0;
  const s = across + along - across * along;
  return { height: height + s * (P.seamZ + j / 4 - height), tone: tone + s * (P.seamTone + j - tone) };
}

// --- the shaders: the same, in GLSL ES 3.00 and WGSL ---
// growCell(kind, seedMix, cell) → (height, tone, grain); cellFace → (dh/dx, dh/dy);
// growMean(kind, seedMix, pos, foot) → (height, tone), pos in cells.
const PK = WOOD[PLANKS], BK = WOOD[BOARD];
const fl = (v) => (Number.isInteger(v) ? `${v}.0` : `${v}`); // a float literal
const [PMH, PMT] = woodMean(PK).map(fl), [BMH, BMT] = woodMean(BK).map(fl);

export const SURFACE_GLSL = /* glsl */ `
uint sgMix(uint x) {
  x ^= x >> 16u; x *= 0x7feb352du; x ^= x >> 15u; x *= 0x846ca68bu; x ^= x >> 16u;
  return x;
}
uint sgTag(uint m, uint tag) { return sgMix(m ^ (tag * ${GOLD}u)); }
uint sgHash(uint t, uint i, uint j) { return sgMix(i ^ sgMix(j ^ t)); }
uint sgSmooth(uint t) { return (t * t * (768u - 2u * t)) >> 16u; }
uint sgFrac(uint x, uint k) { uint f = x & ((1u << k) - 1u); return k <= 8u ? f << (8u - k) : f >> (k - 8u); }
uint sgLattice(uint t, uint x, uint y, uint kx, uint ky) {
  uint i = x >> kx, j = y >> ky;
  uint wx = sgSmooth(sgFrac(x, kx)), wy = sgSmooth(sgFrac(y, ky));
  uint n00 = sgHash(t, i, j) & 255u, n10 = sgHash(t, i + 1u, j) & 255u;
  uint n01 = sgHash(t, i, j + 1u) & 255u, n11 = sgHash(t, i + 1u, j + 1u) & 255u;
  uint s = n00 * (256u - wx) * (256u - wy) + n10 * wx * (256u - wy) + n01 * (256u - wx) * wy + n11 * wx * wy;
  return (s + 32768u) >> 16u;
}
uint sgLattice1(uint t, uint x, uint k, uint b) {
  uint i = x >> k, w = sgSmooth(sgFrac(x, k));
  return ((sgHash(t, i, b) & 255u) * (256u - w) + (sgHash(t, i + 1u, b) & 255u) * w + 128u) >> 8u;
}
struct SgBoard { uint r; uint v; uint U; uint b; uint L; uint u; uint hb; uint id; };
SgBoard sgBoardOf(int kind, uint m, uint x, uint y) {
  SgBoard B;
  uint W = kind == ${PLANKS} ? ${PK.width}u : ${BK.width}u;
  B.r = y / W; B.v = y - B.r * W;
  B.U = x; B.b = 0u; B.L = 0u;
  if (kind == ${PLANKS}) {
    uint hr = sgHash(sgTag(m, ${T_ROW}u), B.r, 0u);
    B.L = ${ROW_MIN}u + (hr & ${ROW_MASK}u);
    B.U = x + (hr >> 13u) % B.L;
    B.b = B.U / B.L;
  }
  B.u = B.U - B.b * B.L;
  B.hb = sgHash(sgTag(m, ${T_BOARD}u), B.b, B.r);
  B.id = B.r * 64u + B.b;
  return B;
}
// a fine kind's cell: b, t its lattices' steps (x, y; x, y), w their weights, s (jz, jt, base)
ivec3 sgFine(uint m, uint x, uint y, uint j, uvec4 b, uvec4 t, uvec4 w, uvec3 s) {
  uint b1 = sgLattice(sgTag(m, ${T_BUMP1}u), x, y, b.x, b.y);
  uint b2 = sgLattice(sgTag(m, ${T_BUMP2}u), x, y, b.z, b.w);
  uint t1 = sgLattice(sgTag(m, ${T_TONE1}u), x, y, t.x, t.y);
  uint t2 = sgLattice(sgTag(m, ${T_TONE2}u), x, y, t.z, t.w);
  return ivec3(int(((b1 * w.x + b2 * w.y + 16u) >> 5u) + (j >> s.x)), int(s.z + ((t1 * w.z + t2 * w.w + 8u) >> 4u) + (j >> s.y)), 0);
}
ivec3 growCell(int kind, uint m, uvec2 cell) {
  uint x = cell.x, y = cell.y;
  uint j = sgHash(sgTag(m, ${T_CELL}u), x, y) & 15u;
${FINE_KINDS.map((k) => `  if (kind == ${k}) return sgFine(m, x, y, j, ${fineArgs(k, 'uvec4', 'uvec3')});`).join('\n')}
  bool planks = kind == ${PLANKS};
  SgBoard B = sgBoardOf(kind, m, x, y);
  if (B.v < (planks ? ${PK.seam}u : ${BK.seam}u) || (planks && B.u < ${PK.seam}u)) {
    return planks ? ivec3(${PK.seamZ} + int(j >> 2u), int(${PK.seamTone}u + j), 0) : ivec3(${BK.seamZ} + int(j >> 2u), int(${BK.seamTone}u + j), 0);
  }
  uint tw = sgTag(m, ${T_WOB}u);
  uint spacing = ${RING_MIN}u + (B.hb & ${RING_MASK}u);
  uint wob = (sgLattice1(tw, B.U, ${WOB_K}u, B.id) * ${WOB_AMP}u) >> 7u;
  uint rho = B.v + ((B.hb >> 5u) & 1023u) + wob;
  uint ring = ((rho % spacing) * 510u + 255u) / (2u * spacing);
  uint st = sgLattice(sgTag(m, ${T_STREAK}u), B.U + ((B.hb >> 20u) << 4u), B.v, ${STREAK_KX}u, ${STREAK_KY}u);
  int rise = int((sgLattice1(tw, B.U + ${GRAIN_DU}u, ${WOB_K}u, B.id) * ${WOB_AMP}u) >> 7u) - int(wob);
  uint base = planks ? ${PK.base}u : ${BK.base}u;
  return ivec3(
    int(${WOOD_Z}u + ((ring + 8u) >> 4u) + ((st + 16u) >> 5u) + (j >> 2u)),
    int(base + ((B.hb >> 15u) & 31u) + ((ring * ${RING_TONE}u + 128u) >> 8u) + ((st * ${STREAK_TONE}u + 128u) >> 8u) + j),
    rise >= ${GRAIN_T} ? 1 : rise <= -${GRAIN_T} ? 15 : 0);
}
ivec2 cellFace(int kind, uint m, uvec2 cell) {
  int h = growCell(kind, m, cell).x;
  return ivec2(growCell(kind, m, cell + uvec2(1u, 0u)).x - h, growCell(kind, m, cell + uvec2(0u, 1u)).x - h);
}
float sgFade(float s, float foot) { return 1.0 - smoothstep(max(1.0, 0.5 * s), 2.0 * s, foot); }
float sgLatticeF(uint t, vec2 p, vec2 s) {
  vec2 q = max(p, vec2(0.0)) / s;
  vec2 i = floor(q), f = q - i, w = f * f * (3.0 - 2.0 * f);
  uint ix = uint(i.x), iy = uint(i.y);
  float a = mix(float(sgHash(t, ix, iy) & 255u), float(sgHash(t, ix + 1u, iy) & 255u), w.x);
  float b = mix(float(sgHash(t, ix, iy + 1u) & 255u), float(sgHash(t, ix + 1u, iy + 1u) & 255u), w.x);
  return mix(a, b, w.y);
}
float sgLattice1F(uint t, float x, float s, uint b) {
  float q = max(x, 0.0) / s, i = floor(q), f = q - i, w = f * f * (3.0 - 2.0 * f);
  return mix(float(sgHash(t, uint(i), b) & 255u), float(sgHash(t, uint(i) + 1u, b) & 255u), w);
}
float sgStripC(float x, float P, float s) { float k = floor(x / P); return k * s + min(x - k * P, s); }
float sgStrip(float c, float f, float P, float s) { return (sgStripC(c + 0.5 * f, P, s) - sgStripC(c - 0.5 * f, P, s)) / f; }
float sgSawC(float x, float P) { float k = floor(x / P), r = x - k * P; return 0.5 * k * P + r * r / (2.0 * P); }
float sgSaw(float c, float f, float P) { return (sgSawC(c + 0.5 * f, P) - sgSawC(c - 0.5 * f, P)) / f; }
float sgShare(float a, float b, float lo, float hi, float f) { return max(0.0, min(b, hi) - max(a, lo)) / f; }
vec2 sgBoardMean(int kind, uint m, uvec2 c, vec2 pos, float foot) {
  SgBoard B = sgBoardOf(kind, m, c.x, c.y);
  float U = float(B.U) + (pos.x - float(c.x)), v = float(B.v) + (pos.y - float(c.y));
  float spacing = float(${RING_MIN}u + (B.hb & ${RING_MASK}u));
  float wob = sgLattice1F(sgTag(m, ${T_WOB}u), U - 0.5, ${1 << WOB_K}.0, B.id) * ${WOB_AMP}.0 / 128.0;
  float ring = 255.0 * sgSaw(v + float((B.hb >> 5u) & 1023u) + wob, foot, spacing);
  float st = 127.5 + sgFade(${1 << STREAK_KY}.0, foot) * (sgLatticeF(sgTag(m, ${T_STREAK}u), vec2(U + float((B.hb >> 20u) << 4u), v) - 0.5, vec2(${1 << STREAK_KX}.0, ${1 << STREAK_KY}.0)) - 127.5);
  float base = kind == ${PLANKS} ? ${PK.base}.0 : ${BK.base}.0;
  return vec2(${WOOD_Z}.0 + ring / 16.0 + st / 32.0, base + float((B.hb >> 15u) & 31u) + ring * ${RING_TONE}.0 / 256.0 + st * ${STREAK_TONE}.0 / 256.0);
}
vec2 sgRowMean(int kind, uint m, uvec2 c, vec2 pos, float foot) {
  if (kind != ${PLANKS}) return sgBoardMean(kind, m, c, pos, foot);
  SgBoard B = sgBoardOf(kind, m, c.x, c.y);
  float L = float(B.L), U = float(B.U) + (pos.x - float(c.x)), lo = float(B.U - B.u), hi = lo + L;
  float a = U - 0.5 * foot, b = U + 0.5 * foot;
  float wc = sgShare(a, b, lo, hi, foot), wn = 0.0;
  vec2 acc = wc * sgBoardMean(kind, m, c, pos, foot);
  if (a < lo && c.x > B.u) {
    wn = sgShare(a, b, lo - L, lo, foot);
    acc += wn * sgBoardMean(kind, m, uvec2(c.x - B.u - 1u, c.y), pos, foot);
  } else if (b > hi) {
    wn = sgShare(a, b, hi, hi + L, foot);
    acc += wn * sgBoardMean(kind, m, uvec2(c.x + B.L - B.u, c.y), pos, foot);
  }
  return acc + max(0.0, 1.0 - wc - wn) * vec2(${PMH}, ${PMT});
}
float sgLay(uint t, vec2 p, uint kx, uint ky, float foot) {
  return 127.5 + sgFade(float(1u << min(kx, ky)), foot) * (sgLatticeF(t, p, vec2(float(1u << kx), float(1u << ky))) - 127.5);
}
vec2 sgFineMean(uint m, vec2 pos, float foot, float j, uvec4 b, uvec4 t, uvec4 w, uvec3 s) {
  vec2 p = pos - 0.5;
  float b1 = sgLay(sgTag(m, ${T_BUMP1}u), p, b.x, b.y, foot), b2 = sgLay(sgTag(m, ${T_BUMP2}u), p, b.z, b.w, foot);
  float t1 = sgLay(sgTag(m, ${T_TONE1}u), p, t.x, t.y, foot), t2 = sgLay(sgTag(m, ${T_TONE2}u), p, t.z, t.w, foot);
  return vec2((b1 * float(w.x) + b2 * float(w.y)) / 32.0 + j / float(1u << s.x), float(s.z) + (t1 * float(w.z) + t2 * float(w.w)) / 16.0 + j / float(1u << s.y));
}
vec2 growMean(int kind, uint m, vec2 pos, float foot) {
  uvec2 c = uvec2(floor(max(pos, vec2(0.0))));
  if (foot <= 1.0) return vec2(growCell(kind, m, c).xy);
  float j = 7.5 + sgFade(1.0, foot) * (float(sgHash(sgTag(m, ${T_CELL}u), c.x, c.y) & 15u) - 7.5);
${FINE_KINDS.map((k) => `  if (kind == ${k}) return sgFineMean(m, pos, foot, j, ${fineArgs(k, 'uvec4', 'uvec3')});`).join('\n')}
  bool planks = kind == ${PLANKS};
  uint Wu = planks ? ${PK.width}u : ${BK.width}u;
  uint loU = (c.y / Wu) * Wu;
  float W = float(Wu), lo = float(loU), hi = lo + W, a = pos.y - 0.5 * foot, b = pos.y + 0.5 * foot;
  float wc = sgShare(a, b, lo, hi, foot), wn = 0.0;
  vec2 wood = wc * sgRowMean(kind, m, c, pos, foot);
  if (a < lo && loU > 0u) {
    wn = sgShare(a, b, lo - W, lo, foot);
    wood += wn * sgRowMean(kind, m, uvec2(c.x, loU - 1u), pos, foot);
  } else if (b > hi) {
    wn = sgShare(a, b, hi, hi + W, foot);
    wood += wn * sgRowMean(kind, m, uvec2(c.x, loU + Wu), pos, foot);
  }
  wood += max(0.0, 1.0 - wc - wn) * (planks ? vec2(${PMH}, ${PMT}) : vec2(${BMH}, ${BMT})) + vec2(j / 4.0, j);
  SgBoard B = sgBoardOf(kind, m, c.x, c.y);
  float seam = planks ? ${PK.seam}.0 : ${BK.seam}.0;
  float across = sgStrip(pos.y, foot, W, seam);
  float along = planks ? sgStrip(float(B.U) + (pos.x - float(c.x)), foot, float(B.L), seam) : 0.0;
  float s = across + along - across * along;
  float seamZ = planks ? ${PK.seamZ}.0 : ${BK.seamZ}.0, seamTone = planks ? ${PK.seamTone}.0 : ${BK.seamTone}.0;
  return vec2(wood.x + s * (seamZ + j / 4.0 - wood.x), wood.y + s * (seamTone + j - wood.y));
}
`;

export const SURFACE_WGSL = /* wgsl */ `
fn sgMix(v: u32) -> u32 {
  var x = v;
  x = x ^ (x >> 16u); x = x * 0x7feb352du; x = x ^ (x >> 15u); x = x * 0x846ca68bu; x = x ^ (x >> 16u);
  return x;
}
fn sgTag(m: u32, tag: u32) -> u32 { return sgMix(m ^ (tag * ${GOLD}u)); }
fn sgHash(t: u32, i: u32, j: u32) -> u32 { return sgMix(i ^ sgMix(j ^ t)); }
fn sgSmooth(t: u32) -> u32 { return (t * t * (768u - 2u * t)) >> 16u; }
fn sgFrac(x: u32, k: u32) -> u32 {
  let f = x & ((1u << k) - 1u);
  if (k <= 8u) { return f << (8u - k); }
  return f >> (k - 8u);
}
fn sgLattice(t: u32, x: u32, y: u32, kx: u32, ky: u32) -> u32 {
  let i = x >> kx; let j = y >> ky;
  let wx = sgSmooth(sgFrac(x, kx)); let wy = sgSmooth(sgFrac(y, ky));
  let n00 = sgHash(t, i, j) & 255u; let n10 = sgHash(t, i + 1u, j) & 255u;
  let n01 = sgHash(t, i, j + 1u) & 255u; let n11 = sgHash(t, i + 1u, j + 1u) & 255u;
  let s = n00 * (256u - wx) * (256u - wy) + n10 * wx * (256u - wy) + n01 * (256u - wx) * wy + n11 * wx * wy;
  return (s + 32768u) >> 16u;
}
fn sgLattice1(t: u32, x: u32, k: u32, b: u32) -> u32 {
  let i = x >> k; let w = sgSmooth(sgFrac(x, k));
  return ((sgHash(t, i, b) & 255u) * (256u - w) + (sgHash(t, i + 1u, b) & 255u) * w + 128u) >> 8u;
}
struct SgBoard { r: u32, v: u32, U: u32, b: u32, L: u32, u: u32, hb: u32, id: u32 }
fn sgBoardOf(kind: i32, m: u32, x: u32, y: u32) -> SgBoard {
  var B: SgBoard;
  let W = select(${BK.width}u, ${PK.width}u, kind == ${PLANKS});
  B.r = y / W; B.v = y - B.r * W;
  B.U = x; B.b = 0u; B.L = 0u;
  if (kind == ${PLANKS}) {
    let hr = sgHash(sgTag(m, ${T_ROW}u), B.r, 0u);
    B.L = ${ROW_MIN}u + (hr & ${ROW_MASK}u);
    B.U = x + (hr >> 13u) % B.L;
    B.b = B.U / B.L;
  }
  B.u = B.U - B.b * B.L;
  B.hb = sgHash(sgTag(m, ${T_BOARD}u), B.b, B.r);
  B.id = B.r * 64u + B.b;
  return B;
}
fn sgFine(m: u32, x: u32, y: u32, j: u32, b: vec4<u32>, t: vec4<u32>, w: vec4<u32>, s: vec3<u32>) -> vec3<i32> {
  let b1 = sgLattice(sgTag(m, ${T_BUMP1}u), x, y, b.x, b.y);
  let b2 = sgLattice(sgTag(m, ${T_BUMP2}u), x, y, b.z, b.w);
  let t1 = sgLattice(sgTag(m, ${T_TONE1}u), x, y, t.x, t.y);
  let t2 = sgLattice(sgTag(m, ${T_TONE2}u), x, y, t.z, t.w);
  return vec3<i32>(i32(((b1 * w.x + b2 * w.y + 16u) >> 5u) + (j >> s.x)), i32(s.z + ((t1 * w.z + t2 * w.w + 8u) >> 4u) + (j >> s.y)), 0);
}
fn growCell(kind: i32, m: u32, cell: vec2<u32>) -> vec3<i32> {
  let x = cell.x; let y = cell.y;
  let j = sgHash(sgTag(m, ${T_CELL}u), x, y) & 15u;
${FINE_KINDS.map((k) => `  if (kind == ${k}) { return sgFine(m, x, y, j, ${fineArgs(k, 'vec4<u32>', 'vec3<u32>')}); }`).join('\n')}
  let planks = kind == ${PLANKS};
  let B = sgBoardOf(kind, m, x, y);
  if (B.v < select(${BK.seam}u, ${PK.seam}u, planks) || (planks && B.u < ${PK.seam}u)) {
    return select(vec3<i32>(${BK.seamZ} + i32(j >> 2u), i32(${BK.seamTone}u + j), 0), vec3<i32>(${PK.seamZ} + i32(j >> 2u), i32(${PK.seamTone}u + j), 0), planks);
  }
  let tw = sgTag(m, ${T_WOB}u);
  let spacing = ${RING_MIN}u + (B.hb & ${RING_MASK}u);
  let wob = (sgLattice1(tw, B.U, ${WOB_K}u, B.id) * ${WOB_AMP}u) >> 7u;
  let rho = B.v + ((B.hb >> 5u) & 1023u) + wob;
  let ring = ((rho % spacing) * 510u + 255u) / (2u * spacing);
  let st = sgLattice(sgTag(m, ${T_STREAK}u), B.U + ((B.hb >> 20u) << 4u), B.v, ${STREAK_KX}u, ${STREAK_KY}u);
  let rise = i32((sgLattice1(tw, B.U + ${GRAIN_DU}u, ${WOB_K}u, B.id) * ${WOB_AMP}u) >> 7u) - i32(wob);
  let base = select(${BK.base}u, ${PK.base}u, planks);
  return vec3<i32>(
    i32(${WOOD_Z}u + ((ring + 8u) >> 4u) + ((st + 16u) >> 5u) + (j >> 2u)),
    i32(base + ((B.hb >> 15u) & 31u) + ((ring * ${RING_TONE}u + 128u) >> 8u) + ((st * ${STREAK_TONE}u + 128u) >> 8u) + j),
    select(select(0, 15, rise <= -${GRAIN_T}), 1, rise >= ${GRAIN_T}));
}
fn cellFace(kind: i32, m: u32, cell: vec2<u32>) -> vec2<i32> {
  let h = growCell(kind, m, cell).x;
  return vec2<i32>(growCell(kind, m, cell + vec2<u32>(1u, 0u)).x - h, growCell(kind, m, cell + vec2<u32>(0u, 1u)).x - h);
}
fn sgFade(s: f32, foot: f32) -> f32 { return 1.0 - smoothstep(max(1.0, 0.5 * s), 2.0 * s, foot); }
fn sgLatticeF(t: u32, p: vec2<f32>, s: vec2<f32>) -> f32 {
  let q = max(p, vec2<f32>(0.0)) / s;
  let i = floor(q); let f = q - i; let w = f * f * (3.0 - 2.0 * f);
  let ix = u32(i.x); let iy = u32(i.y);
  let a = mix(f32(sgHash(t, ix, iy) & 255u), f32(sgHash(t, ix + 1u, iy) & 255u), w.x);
  let b = mix(f32(sgHash(t, ix, iy + 1u) & 255u), f32(sgHash(t, ix + 1u, iy + 1u) & 255u), w.x);
  return mix(a, b, w.y);
}
fn sgLattice1F(t: u32, x: f32, s: f32, b: u32) -> f32 {
  let q = max(x, 0.0) / s; let i = floor(q); let f = q - i; let w = f * f * (3.0 - 2.0 * f);
  return mix(f32(sgHash(t, u32(i), b) & 255u), f32(sgHash(t, u32(i) + 1u, b) & 255u), w);
}
fn sgStripC(x: f32, P: f32, s: f32) -> f32 { let k = floor(x / P); return k * s + min(x - k * P, s); }
fn sgStrip(c: f32, f: f32, P: f32, s: f32) -> f32 { return (sgStripC(c + 0.5 * f, P, s) - sgStripC(c - 0.5 * f, P, s)) / f; }
fn sgSawC(x: f32, P: f32) -> f32 { let k = floor(x / P); let r = x - k * P; return 0.5 * k * P + r * r / (2.0 * P); }
fn sgSaw(c: f32, f: f32, P: f32) -> f32 { return (sgSawC(c + 0.5 * f, P) - sgSawC(c - 0.5 * f, P)) / f; }
fn sgShare(a: f32, b: f32, lo: f32, hi: f32, f: f32) -> f32 { return max(0.0, min(b, hi) - max(a, lo)) / f; }
fn sgBoardMean(kind: i32, m: u32, c: vec2<u32>, pos: vec2<f32>, foot: f32) -> vec2<f32> {
  let B = sgBoardOf(kind, m, c.x, c.y);
  let U = f32(B.U) + (pos.x - f32(c.x)); let v = f32(B.v) + (pos.y - f32(c.y));
  let spacing = f32(${RING_MIN}u + (B.hb & ${RING_MASK}u));
  let wob = sgLattice1F(sgTag(m, ${T_WOB}u), U - 0.5, ${1 << WOB_K}.0, B.id) * ${WOB_AMP}.0 / 128.0;
  let ring = 255.0 * sgSaw(v + f32((B.hb >> 5u) & 1023u) + wob, foot, spacing);
  let st = 127.5 + sgFade(${1 << STREAK_KY}.0, foot) * (sgLatticeF(sgTag(m, ${T_STREAK}u), vec2<f32>(U + f32((B.hb >> 20u) << 4u), v) - 0.5, vec2<f32>(${1 << STREAK_KX}.0, ${1 << STREAK_KY}.0)) - 127.5);
  let base = select(${BK.base}.0, ${PK.base}.0, kind == ${PLANKS});
  return vec2<f32>(${WOOD_Z}.0 + ring / 16.0 + st / 32.0, base + f32((B.hb >> 15u) & 31u) + ring * ${RING_TONE}.0 / 256.0 + st * ${STREAK_TONE}.0 / 256.0);
}
fn sgRowMean(kind: i32, m: u32, c: vec2<u32>, pos: vec2<f32>, foot: f32) -> vec2<f32> {
  if (kind != ${PLANKS}) { return sgBoardMean(kind, m, c, pos, foot); }
  let B = sgBoardOf(kind, m, c.x, c.y);
  let L = f32(B.L); let U = f32(B.U) + (pos.x - f32(c.x)); let lo = f32(B.U - B.u); let hi = lo + L;
  let a = U - 0.5 * foot; let b = U + 0.5 * foot;
  let wc = sgShare(a, b, lo, hi, foot);
  var wn = 0.0;
  var acc = wc * sgBoardMean(kind, m, c, pos, foot);
  if (a < lo && c.x > B.u) {
    wn = sgShare(a, b, lo - L, lo, foot);
    acc += wn * sgBoardMean(kind, m, vec2<u32>(c.x - B.u - 1u, c.y), pos, foot);
  } else if (b > hi) {
    wn = sgShare(a, b, hi, hi + L, foot);
    acc += wn * sgBoardMean(kind, m, vec2<u32>(c.x + B.L - B.u, c.y), pos, foot);
  }
  return acc + max(0.0, 1.0 - wc - wn) * vec2<f32>(${PMH}, ${PMT});
}
fn sgLay(t: u32, p: vec2<f32>, kx: u32, ky: u32, foot: f32) -> f32 {
  return 127.5 + sgFade(f32(1u << min(kx, ky)), foot) * (sgLatticeF(t, p, vec2<f32>(f32(1u << kx), f32(1u << ky))) - 127.5);
}
fn sgFineMean(m: u32, pos: vec2<f32>, foot: f32, j: f32, b: vec4<u32>, t: vec4<u32>, w: vec4<u32>, s: vec3<u32>) -> vec2<f32> {
  let p = pos - 0.5;
  let b1 = sgLay(sgTag(m, ${T_BUMP1}u), p, b.x, b.y, foot); let b2 = sgLay(sgTag(m, ${T_BUMP2}u), p, b.z, b.w, foot);
  let t1 = sgLay(sgTag(m, ${T_TONE1}u), p, t.x, t.y, foot); let t2 = sgLay(sgTag(m, ${T_TONE2}u), p, t.z, t.w, foot);
  return vec2<f32>((b1 * f32(w.x) + b2 * f32(w.y)) / 32.0 + j / f32(1u << s.x), f32(s.z) + (t1 * f32(w.z) + t2 * f32(w.w)) / 16.0 + j / f32(1u << s.y));
}
fn growMean(kind: i32, m: u32, pos: vec2<f32>, foot: f32) -> vec2<f32> {
  let c = vec2<u32>(floor(max(pos, vec2<f32>(0.0))));
  if (foot <= 1.0) { return vec2<f32>(growCell(kind, m, c).xy); }
  let j = 7.5 + sgFade(1.0, foot) * (f32(sgHash(sgTag(m, ${T_CELL}u), c.x, c.y) & 15u) - 7.5);
${FINE_KINDS.map((k) => `  if (kind == ${k}) { return sgFineMean(m, pos, foot, j, ${fineArgs(k, 'vec4<u32>', 'vec3<u32>')}); }`).join('\n')}
  let planks = kind == ${PLANKS};
  let Wu = select(${BK.width}u, ${PK.width}u, planks);
  let loU = (c.y / Wu) * Wu;
  let W = f32(Wu); let lo = f32(loU); let hi = lo + W; let a = pos.y - 0.5 * foot; let b = pos.y + 0.5 * foot;
  let wc = sgShare(a, b, lo, hi, foot);
  var wn = 0.0;
  var wood = wc * sgRowMean(kind, m, c, pos, foot);
  if (a < lo && loU > 0u) {
    wn = sgShare(a, b, lo - W, lo, foot);
    wood += wn * sgRowMean(kind, m, vec2<u32>(c.x, loU - 1u), pos, foot);
  } else if (b > hi) {
    wn = sgShare(a, b, hi, hi + W, foot);
    wood += wn * sgRowMean(kind, m, vec2<u32>(c.x, loU + Wu), pos, foot);
  }
  wood += max(0.0, 1.0 - wc - wn) * select(vec2<f32>(${BMH}, ${BMT}), vec2<f32>(${PMH}, ${PMT}), planks) + vec2<f32>(j / 4.0, j);
  let B = sgBoardOf(kind, m, c.x, c.y);
  let seam = select(${BK.seam}.0, ${PK.seam}.0, planks);
  let across = sgStrip(pos.y, foot, W, seam);
  let along = select(0.0, sgStrip(f32(B.U) + (pos.x - f32(c.x)), foot, f32(B.L), seam), planks);
  let s = across + along - across * along;
  let seamZ = select(${BK.seamZ}.0, ${PK.seamZ}.0, planks); let seamTone = select(${BK.seamTone}.0, ${PK.seamTone}.0, planks);
  return vec2<f32>(wood.x + s * (seamZ + j / 4.0 - wood.x), wood.y + s * (seamTone + j - wood.y));
}
`;
