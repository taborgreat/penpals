// Matter grown as paper is (one-matter.md Phase 2, 3; law/v1/paper.js). Every
// cell of every surface and thing is a function of its matter's row (law/
// matter.js: how much a cell holds, how fast it drinks, how rough it is, its
// fibers), the key it was grown from, and the cell's place; nothing is
// stored. A grower gives the ink law (law/v2/sim.js) the same fields paper's
// does, a tile at a time, plus each cell's matter:
//   cap   how much it holds (drops; 0: it drinks nothing)
//   hold  how much stands on it before a bead breaks and runs (drops)
//   siz   its thirst, 0..15 (how fast it drinks and settles)
//   z     its roughness (height units)
//   link  each cell's fiber conductance to its 8 neighbours (paper's fibers;
//         wood's run along its grain; plaster, wax and metal have none)
//   ridge where a soaked cell buckles (paper's own; 0 elsewhere)
//   mat   its matter (law/matter.js idOf)
// Paper is grown by its own frozen grower (v2/paper.js); everything else here,
// by the same hash and the same layered randomness.
//
// A stack (Phase 2): a sheet lying on a body is paper cells over that body's
// cells. stackGrower gives the paper's fields where a sheet lies and the body's
// elsewhere; no fiber reaches across where one matter meets another.

import { TILE, COORD_OFFSET, HOLD_Q, G_FIB, DIAG_Q } from './v1/constants.js';
import { DIRW } from './v1/tables.js';
import { paperHasher } from './v1/siphash.js';
import { NB_DX, NB_DY } from './v1/paper.js';
import { makePaper } from './v2/paper.js';
import { floorDiv, clamp, LawError } from './v1/int.js';
import { MATTER, idOf } from './matter.js';

const TT = TILE * TILE;
const TAG_GRAIN = 32; // (paper's tags are 0..4 and 16)
const TAG_CELL = 33;
const TAG_RING = 34;

// The grower of a body of `matter` (a row of law/matter.js with `ink`), from its key (32 bytes).
export function makeGrower(matter, paperKey) {
  if (matter === 'paper') throw new Error('paper grows by its own grower (v2/paper.js makePaper)');
  const row = MATTER[matter];
  if (!row?.ink) throw new Error(`no ink properties for ${matter}`);
  const ink = row.ink;
  const mat = idOf(matter);
  const H = paperHasher(paperKey.subarray(0, 16));
  const h = [0, 0];
  H(TAG_GRAIN, 0, 0, h);
  const dir = h[1] & 15; // its grain's direction (wood's: the board's), one of 16
  function tileFields(cx0, cy0) {
    const X0 = cx0 + COORD_OFFSET,
      Y0 = cy0 + COORD_OFFSET;
    if (X0 < 1 || Y0 < 1 || X0 + TILE + 1 >= 0x10000000 || Y0 + TILE + 1 >= 0x10000000) throw new LawError('domain', 'ink left the body');
    const cap = new Uint16Array(TT),
      hold = new Uint16Array(TT),
      siz = new Uint8Array(TT),
      z = new Uint16Array(TT),
      link = new Uint16Array(TT * 8),
      ridge = new Uint8Array(TT),
      mats = new Uint8Array(TT).fill(mat);
    for (let y = 0; y < TILE; y++) {
      const Y = Y0 + y;
      for (let x = 0; x < TILE; x++) {
        const X = X0 + x;
        H(TAG_CELL, X >> 2, Y, h);
        const q = X & 3;
        const bits = q < 2 ? (h[1] >>> (16 * q)) & 0xffff : (h[0] >>> (16 * (q - 2))) & 0xffff;
        const i = y * TILE + x;
        const c = ink.drinks ? clamp(ink.cap + ink.capStep * ((bits & 15) - 8), ink.capMin, ink.capMax) : 0;
        const s = clamp(ink.thirst + floorDiv(((bits >>> 8) & 15) - 8, 4), 0, 15);
        cap[i] = c;
        siz[i] = s;
        hold[i] = ink.drinks ? floorDiv(c * HOLD_Q[s], 256) : ink.hold;
        let zz = ((bits >>> 4) & 15) * ink.rough;
        if (ink.fibers === 'grain') {
          // growth rings across the grain: a sawtooth in height, each ring its own width
          const across = floorDiv((Y * 16 - X * dir) * 7, 16) + (1 << 20);
          H(TAG_RING, floorDiv(across, 48), 0, h);
          zz += (((across % 48) * ink.rough) >> 3) + (h[1] & 3) * ink.rough;
        }
        z[i] = zz;
      }
    }
    if (ink.fibers === 'grain') {
      // wood carries along its grain: every neighbour as aligned with it as it is (paper's fiber weights)
      for (let i = 0; i < TT; i++)
        for (let n = 0; n < 8; n++) {
          let g = floorDiv(G_FIB * ink.fiber * DIRW[dir * 8 + n] * DIRW[dir * 8 + n], 262144);
          if (n & 1) g = floorDiv(g * DIAG_Q, 256);
          link[i * 8 + n] = g;
        }
    }
    return { cap, hold, siz, z, link, ridge, mat: mats };
  }
  return { tileFields, dominant: dir, matter };
}

// A grower for a sheet's paper (paper's frozen grower), its cells marked paper.
export function paperGrower(paperKey, family) {
  const p = makePaper(paperKey, family);
  const mat = idOf('paper');
  return {
    dominant: p.dominant,
    matter: 'paper',
    tileFields(cx0, cy0) {
      return { ...p.tileFields(cx0, cy0), mat: new Uint8Array(TT).fill(mat) };
    },
  };
}

// Sheets lying on a body: [{ grower, x0, y0, x1, y1 }] (cells in the body's frame, the
// sheet's own cell (0, 0) at (x0, y0)); the body's grower beneath. A cell under a sheet is
// that sheet's; anywhere else the body's; no fiber crosses from one matter to another.
export function stackGrower(base, sheets) {
  const cache = new Map();
  const sheetTile = (s, k, tx, ty) => {
    const key = `${k}:${tx}:${ty}`;
    let f = cache.get(key);
    if (!f) cache.set(key, (f = s.grower.tileFields(tx * TILE, ty * TILE)));
    return f;
  };
  return {
    dominant: base.dominant,
    matter: base.matter,
    tileFields(cx0, cy0) {
      const f = base.tileFields(cx0, cy0);
      const mat = f.mat ?? new Uint8Array(TT).fill(idOf(base.matter));
      const out = { ...f, mat };
      sheets.forEach((s, k) => {
        if (s.x1 <= cx0 || s.y1 <= cy0 || s.x0 >= cx0 + TILE || s.y0 >= cy0 + TILE) return;
        for (let y = 0; y < TILE; y++)
          for (let x = 0; x < TILE; x++) {
            const cx = cx0 + x,
              cy = cy0 + y;
            if (cx < s.x0 || cy < s.y0 || cx >= s.x1 || cy >= s.y1) continue;
            const sx = cx - s.x0,
              sy = cy - s.y0;
            const tx = floorDiv(sx, TILE),
              ty = floorDiv(sy, TILE);
            const g = sheetTile(s, k, tx, ty);
            const j = (sy - ty * TILE) * TILE + (sx - tx * TILE);
            const i = y * TILE + x;
            out.cap[i] = g.cap[j];
            out.hold[i] = g.hold[j];
            out.siz[i] = g.siz[j];
            out.z[i] = g.z[j];
            out.ridge[i] = g.ridge[j];
            out.mat[i] = g.mat[j];
            for (let n = 0; n < 8; n++) out.link[i * 8 + n] = g.link[j * 8 + n];
          }
      });
      // no fiber across where one matter meets another (a cell's matter is which sheet it lies under, if any)
      const under = (cx, cy) => sheets.findIndex((s) => cx >= s.x0 && cy >= s.y0 && cx < s.x1 && cy < s.y1);
      for (let y = 0; y < TILE; y++)
        for (let x = 0; x < TILE; x++) {
          const i = y * TILE + x;
          const here = under(cx0 + x, cy0 + y);
          for (let n = 0; n < 8; n++) if (under(cx0 + x + NB_DX[n], cy0 + y + NB_DY[n]) !== here) out.link[i * 8 + n] = 0;
        }
      return out;
    },
  };
}
