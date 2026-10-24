// Walking back under law v2: v1/trace.js's answer for one cell, plus what v2
// keeps there: the dent, how deep the ink sank, the highest the bead stood, the
// water the paper remembers (soak), wear, a tear, the cockle ridge, and oak
// gall. Passive, as in v1: the facts are exactly those of grow() without it.
//
//   trace(rec, { paperKey, family, scale }, [cx, cy]) → v1's fields, and
//     paper.ridge                       the fibers' ridge height (cockling follows it)
//     settled.gall                      fixed oak gall (absorbance ×1024 at its strongest channel)
//     depth: { dent, depth, peak, soak, wear, torn, cockle, film, aired }   the cell's v2 facts (levels; aired: the
//                                       water that went into the air here, in drops)

import { grow, filmLevel, heldE } from './sim.js';
import { NB_DX, NB_DY } from './paper.js';
import { TILE, TICK_MS, DENT_SHIFT, DEPTH_SHIFT, THICK, WEAR_SHIFT, TORN } from './constants.js';
import { EXP8 } from '../v1/tables.js';

const DIRS = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'];
const dirOf = (dx, dy) => DIRS[NB_DX.findIndex((x, n) => x === dx && NB_DY[n] === dy)] ?? `${dx},${dy}`;

export function trace(rec, { paperKey, family, scale = 64 }, [cx, cy]) {
  const tx = Math.floor(cx / TILE);
  const ty = Math.floor(cy / TILE);
  const idx = (cy - ty * TILE) * TILE + (cx - tx * TILE);
  let tile = null;
  let tick = 0;
  let wetAt = null;
  let lastWet = null;
  let peak = 0;
  let peakAt = null;
  let peakCap = 0;
  const deposits = new Map();
  const carried = new Map();

  const instrument = {
    tile(t) {
      if (t.tx === tx && t.ty === ty) tile = t;
    },
    wet(t, i) {
      if (t === tile && i === idx && wetAt === null) wetAt = tick;
    },
    deposit(t, i, g, now) {
      if (t !== tile || i !== idx) return;
      deposits.set(now, (deposits.get(now) ?? 0) + g);
      if (wetAt === null) wetAt = now;
    },
    fiber(t, i, n, q) {
      const x = t.tx * TILE + (i % TILE) + NB_DX[n];
      const y = t.ty * TILE + Math.floor(i / TILE) + NB_DY[n];
      if (x !== cx || y !== cy || q <= 0) return;
      const from = dirOf(-NB_DX[n], -NB_DY[n]);
      carried.set(from, (carried.get(from) ?? 0) + q);
    },
    step(k) {
      tick = k + 1;
      if (!tile) return;
      const w = tile.W[idx];
      if (w > 0) lastWet = k;
      if (w > peak) {
        peak = w;
        peakAt = k;
        peakCap = heldE(tile, idx); // what the paper held then (its front; a dent holds more)
      }
    },
    strokeStart() {},
    finish() {},
  };
  grow(rec, { paperKey, family, scale, instrument });

  const acts = [];
  rec.strokes.forEach((s, si) => {
    for (let i = 1; i < s.t.length; i++) acts.push({ stroke: si, act: i, t0: s.t[i - 1], t1: s.t[i], p: s.hasP ? s.p[i] : null });
    if (s.t.length === 1) acts.push({ stroke: si, act: 0, t0: s.t[0], t1: s.t[0] + 1, p: s.hasP ? s.p[0] : null });
  });
  const actAt = (k) => {
    const a = k * TICK_MS;
    const b = a + TICK_MS;
    return acts.find((x) => x.t0 < b && x.t1 > a) ?? acts.find((x) => x.t1 >= a) ?? null;
  };

  const fixed = tile ? [tile.F[3 * idx], tile.F[3 * idx + 1], tile.F[3 * idx + 2]] : [0, 0, 0];
  return {
    cell: [cx, cy],
    paper: tile
      ? {
          capacity: tile.cap[idx],
          hold: tile.hold[idx],
          sizing: tile.siz[idx],
          height: tile.z[idx],
          ridge: tile.ridge[idx],
          fibers: NB_DX.map((dx, n) => ({ toward: dirOf(dx, NB_DY[n]), conductance: tile.link[idx * 8 + n] })).filter((f) => f.conductance > 0),
        }
      : null,
    settled: {
      fixed,
      gall: tile?.FG ? tile.FG[idx] : 0,
      transmittance: fixed.map((f) => EXP8[Math.min(f >> 2, 2047)]),
    },
    depth: tile
      ? {
          dent: tile.dentA[idx] >> DENT_SHIFT,
          depth: Math.min(THICK, tile.depthA[idx] >> DEPTH_SHIFT),
          peak: tile.peak[idx],
          soak: Math.min(255, tile.soakA[idx] >> 8),
          wear: Math.min(255, tile.wearA[idx] >> WEAR_SHIFT),
          torn: !!(tile.flags[idx] & TORN),
          cockle: tile.cockle[idx],
          film: filmLevel(tile.filmA[idx]),
          aired: tile.drainA[idx],
        }
      : null,
    water: {
      wetAt: wetAt === null ? null : wetAt * TICK_MS,
      dryAt: lastWet === null ? null : (lastWet + 1) * TICK_MS,
      peak,
      peakAt: peakAt === null ? null : peakAt * TICK_MS,
      standing: Math.max(0, peak - peakCap),
    },
    deposits: [...deposits.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([k, drops]) => {
        const a = actAt(k);
        return { at: k * TICK_MS, drops, stroke: a?.stroke ?? null, act: a?.act ?? null, p: a?.p ?? null };
      }),
    carried: [...carried.entries()].map(([from, drops]) => ({ from, drops })),
  };
}
