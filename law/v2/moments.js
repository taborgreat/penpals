// Show the moments (the scene spec, §5): which moment of the writing put the
// ink down in each cell, so a viewer can band a stroke like tree rings: tight
// rings where the pen went slowly, wide where it was fast, one thick band at a
// pause. Grown again with a passive observer (the facts are those of grow());
// it needs the paper, so it is for own and open sheets. Not canonical: a view.

import { grow } from './sim.js';
import { TILE, TICK_MS } from './constants.js';

export const BAND_MS = 40; // one band per this much writing time

// → { box, at: Int32Array (ms of the cell's largest deposit, −1 where the nib never put ink) }
export function momentsOf(rec, { paperKey, family, scale = 64 }, box) {
  const [x0, y0, w, h] = box;
  const at = new Int32Array(w * h).fill(-1);
  const most = new Int32Array(w * h);
  grow(rec, {
    paperKey, family, scale, instrument: {
      tile() {}, wet() {}, fiber() {}, step() {}, strokeStart() {}, finish() {},
      deposit(t, i, g, now) {
        const x = t.tx * TILE + (i % TILE) - x0, y = t.ty * TILE + Math.floor(i / TILE) - y0;
        if (x < 0 || y < 0 || x >= w || y >= h) return;
        const k = y * w + x;
        if (g > most[k]) {
          most[k] = g;
          at[k] = now * TICK_MS;
        }
      },
    },
  });
  return { box: [...box], at };
}

// The band a moment falls in (0 or 1, alternating), or −1 where none.
export const bandOf = (ms) => (ms < 0 ? -1 : Math.floor(ms / BAND_MS) % 2);
