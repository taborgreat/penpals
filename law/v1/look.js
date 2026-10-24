// What the settled ink shows, and the digests that pin it down.
//   box          cells with visible ink (max F ≥ 4) plus a 2-cell margin, sheet cells
//   transmittance per channel T = EXP8[min(F >> 2, 2047)] (0..255): the canonical look
//   rgba         "colour to alpha from white": exact under multiply, still visible on
//                dark pages; never shows the paper itself (that is the secret)
//   factsDigest  sha256(T("facts") ‖ law ‖ sha256(acts) ‖ family ‖ scale ‖ box ‖ cells)
//   lookDigest   sha256(T("look") ‖ box ‖ RGB)
// Pixels are compared, never PNG bytes (deflate differs between machines).

import { sha256 } from '@noble/hashes/sha2.js';
import { TILE, LAW, SCALE_ONE } from './constants.js';
import { EXP8 } from './tables.js';
import { T, concat, u16be } from '../tags.js';

const TT = TILE * TILE;
const VISIBLE = 4;
const MARGIN = 2;

const i32be = (n) => {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setInt32(0, n, false);
  return b;
};

// All settled cells as sorted (y, x) with their fixed pigment. tiles: from sim.finish().
export function settledCells(tiles) {
  const cells = [];
  for (const t of tiles) {
    const { F } = t;
    for (let i = 0; i < TT; i++) {
      const f0 = F[3 * i], f1 = F[3 * i + 1], f2 = F[3 * i + 2];
      if (f0 === 0 && f1 === 0 && f2 === 0) continue;
      const x = t.tx * TILE + (i % TILE);
      const y = t.ty * TILE + Math.floor(i / TILE);
      cells.push([y, x, f0, f1, f2]);
    }
  }
  cells.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return cells;
}

export function boxOf(cells) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [y, x, f0, f1, f2] of cells) {
    if (Math.max(f0, f1, f2) < VISIBLE) continue;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  if (x0 === Infinity) return [0, 0, 0, 0];
  return [x0 - MARGIN, y0 - MARGIN, x1 - x0 + 1 + 2 * MARGIN, y1 - y0 + 1 + 2 * MARGIN];
}

const tOf = (f) => EXP8[Math.min(f >> 2, 2047)]; // f ≤ 65535, so >> is safe here

// Transmittance RGB over the box (row-major, 3 bytes a cell): the canonical look.
export function lookRGB(cells, box) {
  const [x0, y0, w, h] = box;
  const out = new Uint8Array(w * h * 3).fill(255);
  for (const [y, x, f0, f1, f2] of cells) {
    const lx = x - x0, ly = y - y0;
    if (lx < 0 || ly < 0 || lx >= w || ly >= h) continue;
    const k = (ly * w + lx) * 3;
    out[k] = tOf(f0);
    out[k + 1] = tOf(f1);
    out[k + 2] = tOf(f2);
  }
  return out;
}

// The published picture: alpha a = 255 − min(T), colour chosen so that the
// pixel over white is exactly T. Display only; digests use lookRGB.
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
  const row = new Uint8Array(14);
  const dv = new DataView(row.buffer);
  for (const [y, x, f0, f1, f2] of cells) {
    dv.setInt32(0, x, false);
    dv.setInt32(4, y, false);
    dv.setUint16(8, f0, false);
    dv.setUint16(10, f1, false);
    dv.setUint16(12, f2, false);
    h.update(row);
  }
  return h.digest();
}

export function lookDigest(rgb, box) {
  return sha256(concat(T('look'), ...box.map(i32be), rgb));
}
