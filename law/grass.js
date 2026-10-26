// Grass (outside.md §2.4: grass and trees grow from the dirt; one-matter.md Phase 7's way, for a meadow): what
// stands on a m² of grass is a fact of the acts that took from it and the days since. Untouched, the meadow
// stands at its fullest (its kind's `full`). A hand gathering there takes what it holds of it (law/making.js
// handful), no more than stands; from then the grass grows back each day warm enough (`warmth`) by the light its
// blades take (as much of the day's light as their cover holds back: `leaf` m² of blades a m² at the fullest,
// what stands over the fullest, and what its roots hold to push new blades with, `store`), `yield` g a MJ of it,
// until it stands full again. Nothing is kept for a m² no hand has touched.
//   grassOn(takes, day, kind?) → g standing on that m² on `day`; takes: [{ day, grams }] (in order)
//   cellOf(x, y) → the m² (its key) a place (m) is in
//   coverOf(mass, kind?) → the share of the ground its blades cover (0..1), as their light share is (no roots)
import { GRASSES } from './matter.js';
import { dayOf } from './sun.js';
import { exp } from './dmath.js';

export const cellOf = (x, y) => `${Math.floor(x)},${Math.floor(y)}`;
export const coverOf = (mass, kind = 'meadow') => 1 - exp((-GRASSES[kind].leaf * mass) / GRASSES[kind].full);

export function grassOn(takes, day, kind = 'meadow') {
  const k = GRASSES[kind];
  if (!takes?.length) return k.full;
  let mass = k.full;
  let t = 0;
  for (let d = takes[0].day; d <= day; d++) {
    for (; t < takes.length && takes[t].day === d; t++) mass = Math.max(0, mass - takes[t].grams);
    if (d === day) break;
    const D = dayOf(d);
    if (D.warmth < k.warmth) continue;
    const cover = 1 - exp((-k.leaf * (mass + k.store)) / k.full); // (its blades' share of the day's light)
    mass = Math.min(k.full, mass + (k.yield * cover * D.light) / 1e6);
    if (mass >= k.full && t >= takes.length) return k.full; // (full again, and nothing more taken)
  }
  return mass;
}
