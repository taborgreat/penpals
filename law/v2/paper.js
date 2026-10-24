// Paper for law v2: law v1's paper (capacity, hold, thirst, height, fibers),
// unchanged, plus one field: the ridge pattern a soaked cell buckles along
// when it dries (cockling). Ridges come from the paper's own grain: a smooth
// lattice stretched along the sheet's dominant fiber direction, so a cockled
// patch rises in long low ridges the way real paper does. Like every paper
// field it is a function of the paperKey and the cell, never stored.

import { makePaper as makePaperV1, NB_DX, NB_DY, checkFamily } from '../v1/paper.js';
import { paperHasher } from '../v1/siphash.js';
import { DIR16_Q14, SMOOTH32 } from '../v1/tables.js';
import { TILE, COORD_OFFSET } from '../v1/constants.js';
import { floorDiv } from '../v1/int.js';

export { NB_DX, NB_DY, checkFamily };

const TAG_RIDGE = 16; // v1 uses tags 0..4
const ACROSS = 14; // cells between ridges, across the grain
const ALONG = 72; // cells along a ridge before it changes

export function makePaper(paperKey, family) {
  const base = makePaperV1(paperKey, family);
  const H = paperHasher(paperKey.subarray(0, 16));
  const h = [0, 0];
  const cos = DIR16_Q14[2 * base.dominant];
  const sin = DIR16_Q14[2 * base.dominant + 1];
  const nodes = new Map();
  const node = (i, j) => {
    const key = i * 0x4000000 + j;
    let v = nodes.get(key);
    if (v === undefined) {
      H(TAG_RIDGE, i, j, h);
      v = h[1] & 0xff;
      nodes.set(key, v);
    }
    return v;
  };
  // Smoothstep-bilinear lattice value 0..255 at (u, v) in the rotated frame.
  const ridgeAt = (X, Y) => {
    const u = floorDiv(X * cos + Y * sin, 16384) + (1 << 22); // along the grain (kept non-negative)
    const v = floorDiv(Y * cos - X * sin, 16384) + (1 << 22); // across it
    const i = floorDiv(u, ALONG);
    const j = floorDiv(v, ACROSS);
    const wx = SMOOTH32[floorDiv((u - i * ALONG) * 32, ALONG)];
    const wy = SMOOTH32[floorDiv((v - j * ACROSS) * 32, ACROSS)];
    const s = node(i, j) * (256 - wx) * (256 - wy) + node(i + 1, j) * wx * (256 - wy) + node(i, j + 1) * (256 - wx) * wy + node(i + 1, j + 1) * wx * wy;
    return floorDiv(s + 32768, 65536);
  };
  return {
    dominant: base.dominant,
    tileFields(cx0, cy0) {
      const f = base.tileFields(cx0, cy0);
      const ridge = new Uint8Array(TILE * TILE);
      for (let y = 0; y < TILE; y++) {
        for (let x = 0; x < TILE; x++) ridge[y * TILE + x] = ridgeAt(cx0 + x + COORD_OFFSET, cy0 + y + COORD_OFFSET);
      }
      f.ridge = ridge;
      return f;
    },
  };
}
