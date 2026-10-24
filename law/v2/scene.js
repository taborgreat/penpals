// The scene's field (the scene spec, §2): what a renderer needs for each cell
// of a sheet, built from the sealed facts alone, so the server can serve it for
// a closed sheet without its seed or its paper. Not canonical: a view.
//
//   surface  the paper's top, in drops: cockle up, a dent down
//   above    what stands on it, in drops: a bead while wet, the film once dry
//   depth    how far the liquid sank (levels of THICK)
//   rgba     the ink as it looks now (age and light applied), colour to alpha
//   flags    1 torn (a hole: the page behind), 2 wet (a glossy bead)
//
// The paper's own fibers (paperDetail) need the paper: only own and open sheets
// have them; a visitor's view of a closed sheet uses a generic paper texture.
//
// PNKS v1, little-endian:
//   'PNKS' u8 1 | i32 x0 y0 w h | per cell (row-major over the box):
//   i16 surface | u16 above | u8 depth | u8 r g b a | u8 flags

import { TORN, THICK, TILE } from './constants.js';
import { lookRGB, lookRGBA, heightOf, inkColor, hasInk } from './look.js';
import { makePaper } from './paper.js';

export const TORN_BIT = 1;
export const WET_BIT = 2;
const MAGIC = [0x50, 0x4e, 0x4b, 0x53];
const PER_CELL = 2 + 2 + 1 + 4 + 1;

function blank(box) {
  const n = box[2] * box[3];
  return { box: [...box], surface: new Int16Array(n), above: new Uint16Array(n), depth: new Uint8Array(n), rgba: new Uint8Array(n * 4), flags: new Uint8Array(n) };
}
const clampI16 = (v) => Math.max(-32768, Math.min(32767, v));

// Settled rows (look.settledCells) at a view ({ ageH, views }).
export function sceneField(cells, box, view = {}) {
  const f = blank(box);
  const [x0, y0, w, h] = box;
  if (w && h) f.rgba.set(lookRGBA(lookRGB(cells, box, view), box));
  for (const c of cells) {
    const lx = c[1] - x0, ly = c[0] - y0;
    if (lx < 0 || ly < 0 || lx >= w || ly >= h) continue;
    const k = ly * w + lx;
    const hf = heightOf(c);
    f.surface[k] = clampI16(hf.surface);
    f.above[k] = Math.min(65535, hf.above);
    f.depth[k] = Math.min(THICK, hf.depth);
    if (hf.torn) f.flags[k] |= TORN_BIT;
  }
  return f;
}

// Rows of a sheet being written (live.cut): wet ink in its colour, a standing
// bead at [14], water alone as a faint wash.
export function liveField(rows, box) {
  const f = blank(box);
  const [x0, y0, w, h] = box;
  for (const c of rows) {
    const lx = c[1] - x0, ly = c[0] - y0;
    if (lx < 0 || ly < 0 || lx >= w || ly >= h) continue;
    const k = ly * w + lx;
    const hf = heightOf(c);
    f.surface[k] = clampI16(hf.surface);
    f.above[k] = Math.min(65535, hf.above);
    f.depth[k] = Math.min(THICK, hf.depth);
    if (hf.torn) f.flags[k] |= TORN_BIT;
    if (hf.wet) f.flags[k] |= WET_BIT;
    if (hasInk(c) && !hf.torn) {
      const [r, g, b] = inkColor(c);
      const a = 255 - Math.min(r, g, b);
      if (a) {
        f.rgba[4 * k] = 255 - Math.round(((255 - r) * 255) / a);
        f.rgba[4 * k + 1] = 255 - Math.round(((255 - g) * 255) / a);
        f.rgba[4 * k + 2] = 255 - Math.round(((255 - b) * 255) / a);
        f.rgba[4 * k + 3] = a;
      }
    } else if (hf.wet) {
      f.rgba.set([150, 170, 205, 40], 4 * k);
    }
  }
  return f;
}

export function encodeScene(f) {
  const n = f.box[2] * f.box[3];
  const out = new Uint8Array(5 + 16 + n * PER_CELL);
  const dv = new DataView(out.buffer);
  out.set(MAGIC, 0);
  out[4] = 1;
  f.box.forEach((v, i) => dv.setInt32(5 + 4 * i, v, true));
  let o = 21;
  for (let k = 0; k < n; k++) {
    dv.setInt16(o, f.surface[k], true);
    dv.setUint16(o + 2, f.above[k], true);
    out[o + 4] = f.depth[k];
    out.set(f.rgba.subarray(4 * k, 4 * k + 4), o + 5);
    out[o + 9] = f.flags[k];
    o += PER_CELL;
  }
  return out;
}

export function decodeScene(bytes) {
  if (!MAGIC.every((b, i) => bytes[i] === b) || bytes[4] !== 1) throw new Error('not a scene');
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const box = [0, 1, 2, 3].map((i) => dv.getInt32(5 + 4 * i, true));
  const f = blank(box);
  const n = box[2] * box[3];
  if (bytes.length !== 21 + n * PER_CELL) throw new Error('scene: wrong length');
  let o = 21;
  for (let k = 0; k < n; k++) {
    f.surface[k] = dv.getInt16(o, true);
    f.above[k] = dv.getUint16(o + 2, true);
    f.depth[k] = bytes[o + 4];
    f.rgba.set(bytes.subarray(o + 5, o + 9), 4 * k);
    f.flags[k] = bytes[o + 9];
    o += PER_CELL;
  }
  return f;
}

// The paper's own surface over the box (0..255 per cell): its height and its
// fibers, for the fine detail of own and open sheets. Needs the paper: never
// served for a closed sheet.
export function paperDetail(paperKey, family, box) {
  const [x0, y0, w, h] = box;
  const out = new Uint8Array(w * h);
  const paper = makePaper(paperKey, family);
  for (let ty = Math.floor(y0 / TILE); ty * TILE < y0 + h; ty++) {
    for (let tx = Math.floor(x0 / TILE); tx * TILE < x0 + w; tx++) {
      const fl = paper.tileFields(tx * TILE, ty * TILE);
      for (let i = 0; i < TILE * TILE; i++) {
        const x = tx * TILE + (i % TILE) - x0, y = ty * TILE + Math.floor(i / TILE) - y0;
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        let fiber = 0;
        for (let n = 0; n < 8; n++) fiber = Math.max(fiber, fl.link[i * 8 + n]);
        out[y * w + x] = Math.min(255, fl.z[i] + (fiber ? 60 : 0));
      }
    }
  }
  return out;
}

export { TORN };
