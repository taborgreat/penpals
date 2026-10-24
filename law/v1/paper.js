// Paper is a function, not a file (keys.md, Factor one). Every cell's state is
// computed from the sheet's paperKey, the public paper family and the cell's
// coordinates; nothing is stored. A tile's fields depend only on the tile's
// coordinates, never on which tiles were computed before it.
//
// Per cell: capacity (cap), the hold before a bead breaks (hold), thirst
// (siz, 0..15: how fast it drinks), roughness height (z), and the fiber
// conductance to each of its 8 neighbours (link).

import {
  TILE, COORD_OFFSET, CAP_BASE, CAP_WEIGHT, CAP_STEP, CAP_MIN, CAP_MAX, LF_CAP, LF_SIZ, SIZ_BASE, Z_SCALE,
  FIBER_BLOCK, FIBER_COUNT, FIBER_LEN, LF1, LF2, HOLD_Q, G_FIB, DIAG_Q,
} from './constants.js';
import { DIR16_Q14, DIRW, SMOOTH32 } from './tables.js';
import { paperHasher } from './siphash.js';
import { floorDiv, clamp, LawError } from './int.js';

// Neighbour order used everywhere in the law: E, SE, S, SW, W, NW, N, NE (y down).
export const NB_DX = [1, 1, 0, -1, -1, -1, 0, 1];
export const NB_DY = [0, 1, 1, 1, 0, -1, -1, -1];

const TAG_SHEET = 0;
const TAG_CELL = 1;
const TAG_FIBER = 2;
const TAG_LF1 = 3;
const TAG_LF2 = 4;
const HALF = TILE + 2; // fiber fields are computed with a 1-cell halo for the links

export function checkFamily(f) {
  const ok = f && Number.isInteger(f.grain) && Number.isInteger(f.weight) && Number.isInteger(f.tooth)
    && f.grain >= 0 && f.grain <= 15 && f.weight >= 0 && f.weight <= 15 && f.tooth === 0;
  if (!ok) throw new Error('paper family is { grain 0..15, weight 0..15, tooth 0 }');
  return f;
}

// paperKey: 32 bytes (sha256(T("paperkey") ‖ seed)); only the first 16 key the hash.
export function makePaper(paperKey, family) {
  checkFamily(family);
  const H = paperHasher(paperKey.subarray(0, 16));
  const h = [0, 0];
  H(TAG_SHEET, 0, 0, h);
  const MD = h[1] & 15; // the sheet's dominant fiber direction
  const capBase = CAP_BASE + CAP_WEIGHT * family.weight;
  const grain = family.grain;

  // Lattice node values are cached by key; caching never changes a value.
  const lf1 = new Map();
  const lf2 = new Map();
  function node1(i, j) {
    const key = i * 0x4000000 + j;
    let v = lf1.get(key);
    if (!v) {
      H(TAG_LF1, i, j, h);
      const lo = h[1];
      v = [floorDiv(((lo & 0xff) - 128) * LF_CAP, 128), floorDiv((((lo >>> 8) & 0xf) - 8) * LF_SIZ, 8)];
      lf1.set(key, v);
    }
    return v;
  }
  function node2(i, j) {
    const key = i * 0x4000000 + j;
    let v = lf2.get(key);
    if (!v) {
      H(TAG_LF2, i, j, h);
      const lo = h[1];
      v = [[-1, 0, 0, 1][lo & 3], floorDiv(((lo >>> 8) & 0xf) - 8, 4)];
      lf2.set(key, v);
    }
    return v;
  }
  // Smoothstep-bilinear blend of a lattice component at hash coords (X, Y); rounds to nearest.
  function blend(node, step, X, Y, comp) {
    const i = floorDiv(X, step);
    const j = floorDiv(Y, step);
    const wx = SMOOTH32[floorDiv((X - i * step) * 32, step)];
    const wy = SMOOTH32[floorDiv((Y - j * step) * 32, step)];
    const v = node(i, j)[comp] * (256 - wx) * (256 - wy) + node(i + 1, j)[comp] * wx * (256 - wy)
      + node(i, j + 1)[comp] * (256 - wx) * wy + node(i + 1, j + 1)[comp] * wx * wy;
    return floorDiv(v + 32768, 65536);
  }

  // Fibers of one block: [x0, y0, x1, y1, str, dir, key] in hash coords.
  const blocks = new Map();
  function blockFibers(bx, by) {
    const key = bx * 0x4000000 + by;
    let list = blocks.get(key);
    if (list) return list;
    list = [];
    H(TAG_FIBER, bx, by, h);
    const hi = h[0];
    const lo = h[1];
    const count = FIBER_COUNT[lo & 3];
    for (let f = 0; f < count; f++) {
      const bits = f === 0 ? lo >>> 2 : hi; // 30 bits for the first fiber, 32 for the second
      const ox = bits & 7;
      const oy = (bits >>> 3) & 7;
      const off = floorDiv((((bits >>> 6) & 15) - 8) * (15 - grain), 15);
      const len = FIBER_LEN[(bits >>> 10) & 15];
      const str = [1, 1, 2, 3][(bits >>> 14) & 3];
      const cx = bx * FIBER_BLOCK + ox;
      const cy = by * FIBER_BLOCK + oy;
      const dir = (MD + blend(node2, LF2, cx, cy, 0) + off + 32) & 15;
      const hx = floorDiv(len * DIR16_Q14[2 * dir], 32768);
      const hy = floorDiv(len * DIR16_Q14[2 * dir + 1], 32768);
      let x0 = cx - hx, y0 = cy - hy, x1 = cx + hx, y1 = cy + hy;
      if (y1 < y0 || (y1 === y0 && x1 < x0)) [x0, y0, x1, y1] = [x1, y1, x0, y0]; // canonical endpoint order
      list.push([x0, y0, x1, y1, str, dir, (by * 0x4000000 + bx) * 2 + f]);
    }
    blocks.set(key, list);
    return list;
  }

  // Fill the fields of the tile whose top-left cell is (cx0, cy0) (sheet cells).
  function tileFields(cx0, cy0) {
    const X0 = cx0 + COORD_OFFSET;
    const Y0 = cy0 + COORD_OFFSET;
    if (X0 < 1 || Y0 < 1 || X0 + TILE + 1 >= 0x10000000 || Y0 + TILE + 1 >= 0x10000000) {
      throw new LawError('domain', 'ink left the paper');
    }
    const cap = new Uint16Array(TILE * TILE);
    const hold = new Uint16Array(TILE * TILE);
    const siz = new Uint8Array(TILE * TILE);
    const z = new Uint16Array(TILE * TILE);
    const link = new Uint16Array(TILE * TILE * 8);

    for (let y = 0; y < TILE; y++) {
      const Y = Y0 + y;
      for (let x = 0; x < TILE; x++) {
        const X = X0 + x;
        H(TAG_CELL, Math.floor(X / 4), Y, h);
        const q = X % 4; // 16 bits per cell: two from the low word, two from the high
        const bits = q < 2 ? (h[1] >>> (16 * q)) & 0xffff : (h[0] >>> (16 * (q - 2))) & 0xffff;
        const cap4 = bits & 15;
        const z4 = (bits >>> 4) & 15;
        const siz4 = (bits >>> 8) & 15;
        const i = y * TILE + x;
        const c = clamp(capBase + CAP_STEP * (cap4 - 8) + blend(node1, LF1, X, Y, 0), CAP_MIN, CAP_MAX);
        const s = clamp(SIZ_BASE + floorDiv(siz4 - 8, 2) + blend(node1, LF1, X, Y, 1), 0, 15);
        cap[i] = c;
        siz[i] = s;
        hold[i] = floorDiv(c * HOLD_Q[s], 256);
        z[i] = clamp(z4 + blend(node2, LF2, X, Y, 1), 0, 20) * Z_SCALE;
      }
    }

    // Fiber strength and direction over the tile plus a 1-cell halo; the
    // highest key wins where fibers cross, so the order of rasterizing is irrelevant.
    const fib = new Uint8Array(HALF * HALF);
    const fdir = new Uint8Array(HALF * HALF);
    const fkey = new Float64Array(HALF * HALF).fill(-1);
    const hx0 = X0 - 1, hy0 = Y0 - 1; // halo origin
    const reach = FIBER_LEN[15] / 2 + FIBER_BLOCK + 1;
    const bx0 = floorDiv(hx0 - reach, FIBER_BLOCK), bx1 = floorDiv(hx0 + HALF + reach, FIBER_BLOCK);
    const by0 = floorDiv(hy0 - reach, FIBER_BLOCK), by1 = floorDiv(hy0 + HALF + reach, FIBER_BLOCK);
    for (let by = by0; by <= by1; by++) {
      for (let bx = bx0; bx <= bx1; bx++) {
        for (const [x0, y0, x1, y1, str, dir, key] of blockFibers(bx, by)) {
          // Bresenham from (x0, y0) to (x1, y1).
          const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
          const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
          let err = dx + dy, x = x0, y = y0;
          for (;;) {
            const lx = x - hx0, ly = y - hy0;
            if (lx >= 0 && lx < HALF && ly >= 0 && ly < HALF) {
              const k = ly * HALF + lx;
              if (key > fkey[k]) {
                fkey[k] = key;
                fib[k] = str;
                fdir[k] = dir;
              }
            }
            if (x === x1 && y === y1) break;
            const e2 = 2 * err;
            if (e2 >= dy) { err += dy; x += sx; }
            if (e2 <= dx) { err += dx; y += sy; }
          }
        }
      }
    }
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        const k = (y + 1) * HALF + (x + 1);
        if (!fib[k]) continue;
        for (let n = 0; n < 8; n++) {
          const kn = (y + 1 + NB_DY[n]) * HALF + (x + 1 + NB_DX[n]);
          if (!fib[kn]) continue;
          let g = floorDiv(G_FIB * Math.min(fib[k], fib[kn]) * DIRW[fdir[k] * 8 + n] * DIRW[fdir[kn] * 8 + n], 262144);
          if (n & 1) g = floorDiv(g * DIAG_Q, 256);
          link[(y * TILE + x) * 8 + n] = g;
        }
      }
    }
    return { cap, hold, siz, z, link };
  }

  return { tileFields, dominant: MD };
}
