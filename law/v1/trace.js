// Walking back (keys.md): why one cell of a sheet looks the way it does.
// The sheet is grown again with a passive observer on the law's hooks; it
// only reads, so the facts are exactly those of grow() without it (tested).
// Floats are fine here: nothing it returns is canonical.
//
//   trace(rec, { paperKey, family, scale }, [cx, cy]) → {
//     cell, paper: { capacity, hold, sizing, height, fibers: [{ toward, conductance }] },
//     settled: { fixed: [r, g, b], transmittance: [r, g, b] },
//     water: { wetAt, dryAt, peak, peakAt, standing }  (ms of recorded time; standing = the peak's surplus over capacity)
//     deposits: [{ at, drops, stroke, act, p }]       ink the nib put down here, tick by tick, and the act it came from
//     carried: [{ from, drops }]                      water that came in along fibers, by direction
//   }
// The paper fields are the sheet's secret: only someone holding its seed can
// ask (the writer, or anyone once the sheet is open).

import { grow } from './sim.js';
import { NB_DX, NB_DY } from './paper.js';
import { TILE, TICK_MS } from './constants.js';
import { EXP8 } from './tables.js';

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
  const deposits = new Map(); // tick → drops
  const carried = new Map(); // direction it came from → drops

  const instrument = {
    tile(t) { if (t.tx === tx && t.ty === ty) tile = t; },
    wet(t, i) { if (t === tile && i === idx && wetAt === null) wetAt = tick; },
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
      }
    },
    strokeStart() {},
    finish() {},
  };
  grow(rec, { paperKey, family, scale, instrument });

  // Which act was under the nib in each tick that put ink here.
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

  const cap = tile ? tile.cap[idx] : 0;
  const fixed = tile ? [tile.F[3 * idx], tile.F[3 * idx + 1], tile.F[3 * idx + 2]] : [0, 0, 0];
  return {
    cell: [cx, cy],
    paper: tile
      ? {
        capacity: cap,
        hold: tile.hold[idx],
        sizing: tile.siz[idx],
        height: tile.z[idx],
        fibers: NB_DX.map((dx, n) => ({ toward: dirOf(dx, NB_DY[n]), conductance: tile.link[idx * 8 + n] })).filter((f) => f.conductance > 0),
      }
      : null,
    settled: { fixed, transmittance: fixed.map((f) => EXP8[Math.min(f >> 2, 2047)]) },
    water: {
      wetAt: wetAt === null ? null : wetAt * TICK_MS,
      dryAt: lastWet === null ? null : (lastWet + 1) * TICK_MS,
      peak,
      peakAt: peakAt === null ? null : peakAt * TICK_MS,
      standing: Math.max(0, peak - cap),
    },
    deposits: [...deposits.entries()].sort((a, b) => a[0] - b[0]).map(([k, drops]) => {
      const a = actAt(k);
      return { at: k * TICK_MS, drops, stroke: a?.stroke ?? null, act: a?.act ?? null, p: a?.p ?? null };
    }),
    carried: [...carried.entries()].map(([from, drops]) => ({ from, drops })),
  };
}
