// The scene's field (the scene spec, §2): what a renderer needs for each cell
// of a sheet, built from the sealed facts alone, so the server can serve it for
// a closed sheet without its seed or its paper. Not canonical: a view.
//
//   surface  the paper's top, in drops: cockle up, a dent down
//   above    what stands on it, in drops: a bead while wet, the film once dry
//   depth    how far the liquid sank (levels of THICK)
//   rgba     the ink as it looks now (age and light applied), colour to alpha
//   abs      (sceneField) the same ink by its absorbances, for lighting by wavelength (look.js lookAbs)
//   flags    1 torn (a hole: the page behind), 2 wet (a glossy bead)
//
// The paper's own fibers (paperDetail) need the paper: only own and open sheets
// have them; a visitor's view of a closed sheet uses a generic paper texture.
//
// PNKS v2 (what encodeScene writes), little-endian: only the cells that hold
// anything, as runs along each row; the surface in one byte when it fits:
//   'PNKS' u8 2 | i32 x0 y0 w h | u8 flags (bit 0: surface is i8; bits 1–2: the
//   level of detail, each cell 2^lod × 2^lod of the sheet's, sceneWindow) |
//   per row: varint runs | per run: varint gap (cells since the last run's end, or
//   the row's start) | varint length | per cell: i8 or i16 surface | u16 above |
//   u8 depth | u8 r g b a | u8 flags
// An empty cell is all zeros. PNKS v1 (still read): 'PNKS' u8 1 | i32 x0 y0 w h |
// every cell of the box: i16 surface | u16 above | u8 depth | u8 r g b a | u8 flags

import { TORN, THICK, TILE } from './constants.js';
import { lookRGB, lookRGBA, lookAbs, heightOf, inkColor, hasInk } from './look.js';
import { makePaper } from './paper.js';

export const TORN_BIT = 1;
export const WET_BIT = 2;
const MAGIC = [0x50, 0x4e, 0x4b, 0x53];
const PER_CELL = 2 + 2 + 1 + 4 + 1;

function blank(box, lod = 0) {
  const n = box[2] * box[3];
  return { box: [...box], lod, surface: new Int16Array(n), above: new Uint16Array(n), depth: new Uint8Array(n), rgba: new Uint8Array(n * 4), flags: new Uint8Array(n) };
}
const clampI16 = (v) => Math.max(-32768, Math.min(32767, v));

// Settled rows (look.settledCells) at a view ({ ageH, views }).
export function sceneField(cells, box, view = {}) {
  const f = blank(box);
  const [x0, y0, w, h] = box;
  if (w && h) f.rgba.set(lookRGBA(lookRGB(cells, box, view), box));
  f.abs = lookAbs(cells, box, view);
  for (const c of cells) {
    const lx = c[1] - x0,
      ly = c[0] - y0;
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
    const lx = c[1] - x0,
      ly = c[0] - y0;
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

// What the eye can see of a field (cleanup-and-speed.md §5b): the cells of
// `at` ([x0, y0, w, h] of the sheet's cells, clipped to the box; null: all of
// it), at level `lod` (0..MAX_LOD): each 2^lod × 2^lod block of the sheet's
// cells one cell, its box in those cells (block i covers cells i·2^lod onward).
// A block takes its cells' mean surface and what stands on them (empty paper
// counting as level), the deepest ink, their flags together, and their colour
// mixed by how much ink each holds. A view of a view: never facts.
export const MAX_LOD = 3;
export function sceneWindow(f, at = null, lod = 0) {
  if (!Number.isInteger(lod) || lod < 0 || lod > MAX_LOD || (f.lod ?? 0) !== 0) throw new Error('scene: bad level');
  const [fx, fy, fw, fh] = f.box;
  const ax = at ? Math.max(fx, at[0]) : fx,
    ay = at ? Math.max(fy, at[1]) : fy;
  const bx = at ? Math.min(fx + fw, at[0] + at[2]) : fx + fw,
    by = at ? Math.min(fy + fh, at[1] + at[3]) : fy + fh;
  const n = 1 << lod;
  const ox = Math.floor(ax / n),
    oy = Math.floor(ay / n);
  const any = bx > ax && by > ay;
  const w = any ? Math.ceil(bx / n) - ox : 0,
    h = any ? Math.ceil(by / n) - oy : 0;
  const out = blank([ox, oy, w, h], lod);
  if (lod === 0) {
    // the cells themselves, row by row
    for (let j = 0; j < h; j++) {
      const from = (ay + j - fy) * fw + (ax - fx),
        to = j * w;
      out.surface.set(f.surface.subarray(from, from + w), to);
      out.above.set(f.above.subarray(from, from + w), to);
      out.depth.set(f.depth.subarray(from, from + w), to);
      out.flags.set(f.flags.subarray(from, from + w), to);
      out.rgba.set(f.rgba.subarray(4 * from, 4 * (from + w)), 4 * to);
    }
    return out;
  }
  const area = n * n;
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      let surface = 0,
        above = 0,
        depth = 0,
        flags = 0,
        a = 0,
        r = 0,
        g = 0,
        b = 0;
      const x0 = Math.max(ax, (ox + i) * n),
        x1 = Math.min(bx, (ox + i + 1) * n);
      const y0 = Math.max(ay, (oy + j) * n),
        y1 = Math.min(by, (oy + j + 1) * n);
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const k = (y - fy) * fw + (x - fx);
          surface += f.surface[k];
          above += f.above[k];
          if (f.depth[k] > depth) depth = f.depth[k];
          flags |= f.flags[k];
          const ka = f.rgba[4 * k + 3];
          a += ka;
          r += f.rgba[4 * k] * ka;
          g += f.rgba[4 * k + 1] * ka;
          b += f.rgba[4 * k + 2] * ka;
        }
      }
      const k = j * w + i;
      out.surface[k] = Math.round(surface / area);
      out.above[k] = Math.round(above / area);
      out.depth[k] = depth;
      out.flags[k] = flags;
      if (Math.round(a / area)) {
        // (ink too thin to show at this level: none)
        out.rgba[4 * k] = Math.round(r / a);
        out.rgba[4 * k + 1] = Math.round(g / a);
        out.rgba[4 * k + 2] = Math.round(b / a);
        out.rgba[4 * k + 3] = Math.round(a / area);
      }
    }
  }
  return out;
}

const holds = (f, k) => f.surface[k] !== 0 || f.above[k] !== 0 || f.depth[k] !== 0 || f.rgba[4 * k + 3] !== 0 || f.flags[k] !== 0;

export function encodeScene(f) {
  const [, , w, h] = f.box;
  let small = 1;
  for (let k = 0; k < w * h; k++) if (f.surface[k] < -128 || f.surface[k] > 127) small = 0;
  const per = (small ? 1 : 2) + 2 + 1 + 4 + 1;
  const out = [];
  const varint = (v) => {
    while (v >= 0x80) {
      out.push((v & 0x7f) | 0x80);
      v >>>= 7;
    }
    out.push(v);
  };
  const head = new Uint8Array(22);
  const dv = new DataView(head.buffer);
  head.set(MAGIC, 0);
  head[4] = 2;
  f.box.forEach((v, i) => dv.setInt32(5 + 4 * i, v, true));
  head[21] = small | ((f.lod ?? 0) << 1);
  const cell = new Uint8Array(per);
  const cv = new DataView(cell.buffer);
  for (let y = 0; y < h; y++) {
    const runs = [];
    for (let x = 0; x < w;) {
      if (!holds(f, y * w + x)) {
        x++;
        continue;
      }
      const x0 = x;
      while (x < w && holds(f, y * w + x)) x++;
      runs.push([x0, x - x0]);
    }
    varint(runs.length);
    let end = 0;
    for (const [x0, n] of runs) {
      varint(x0 - end);
      varint(n);
      end = x0 + n;
      for (let x = x0; x < x0 + n; x++) {
        const k = y * w + x;
        let o = 0;
        if (small) cv.setInt8(o++, f.surface[k]);
        else {
          cv.setInt16(o, f.surface[k], true);
          o += 2;
        }
        cv.setUint16(o, f.above[k], true);
        cell[o + 2] = f.depth[k];
        cell.set(f.rgba.subarray(4 * k, 4 * k + 4), o + 3);
        cell[o + 7] = f.flags[k];
        for (const byte of cell) out.push(byte);
      }
    }
  }
  const bytes = new Uint8Array(head.length + out.length);
  bytes.set(head, 0);
  bytes.set(out, head.length);
  return bytes;
}

export function decodeScene(bytes) {
  if (!MAGIC.every((b, i) => bytes[i] === b) || (bytes[4] !== 1 && bytes[4] !== 2)) throw new Error('not a scene');
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const box = [0, 1, 2, 3].map((i) => dv.getInt32(5 + 4 * i, true));
  const f = blank(box);
  const [, , w, h] = box;
  const n = w * h;
  if (bytes[4] === 1) {
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
  const small = bytes[21] & 1;
  f.lod = (bytes[21] >> 1) & 3;
  let o = 22;
  const varint = () => {
    let v = 0;
    for (let shift = 0; ; shift += 7) {
      if (o >= bytes.length || shift > 28) throw new Error('scene: cut short');
      const b = bytes[o++];
      v |= (b & 0x7f) << shift;
      if (!(b & 0x80)) return v >>> 0;
    }
  };
  for (let y = 0; y < h; y++) {
    const runs = varint();
    let x = 0;
    for (let r = 0; r < runs; r++) {
      x += varint();
      const len = varint();
      if (x + len > w || o + len * ((small ? 1 : 2) + 8) > bytes.length) throw new Error('scene: wrong length');
      for (let e = x + len; x < e; x++) {
        const k = y * w + x;
        if (small) f.surface[k] = dv.getInt8(o++);
        else {
          f.surface[k] = dv.getInt16(o, true);
          o += 2;
        }
        f.above[k] = dv.getUint16(o, true);
        f.depth[k] = bytes[o + 2];
        f.rgba.set(bytes.subarray(o + 3, o + 7), 4 * k);
        f.flags[k] = bytes[o + 7];
        o += 8;
      }
    }
  }
  if (o !== bytes.length) throw new Error('scene: wrong length');
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
        const x = tx * TILE + (i % TILE) - x0,
          y = ty * TILE + Math.floor(i / TILE) - y0;
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
