// The candles heard (world.md Phase 3): a lit candle crackles as it burns. Now and then a bead of
// air or water in its wax reaches the flame and bursts: as often as the flame burns the wax that
// holds one (its draw as fed: scene/light/candle.js smokeRate), and the more the longer its wick
// stands (a long wick's char, hotter at its tip: its cycle). Each burst is its bead's volume of air
// at the room's pressure let go at once, over the time sound takes to cross it: a soft knock.
//   crackles(flame, from, to) → the events in [from, to) (t and world: s on the world's clock; rate: the
//     candle's crackles a second, for its grouping: sound/music.js), from the light's
//     flame (scene/light.js at(): { which, pos, lit, wick, smokeRate }); each seeded by its candle
//     and its moment, so the same moment crackles alike for everyone
import { SPEED, knock } from './bands.js';
import { WICK_TRIM } from '../scene/light/candle.js';

export const BEAD_R = 0.0002; // m: a bead in the wax (Tabor's to set)
export const WAX_A_BEAD = 0.005; // g of wax about each bead it holds (Tabor's to set)
const ATM = 101325; // Pa: the air's pressure

// a fixed hash of two integers, 0..1
const mix = (a, b) => {
  let x = (Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ b) >>> 0;
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
};

export const crackleRate = (flame) => (flame.lit && flame.smokeRate > 0 ? (flame.smokeRate / WAX_A_BEAD) * (flame.wick / WICK_TRIM) : 0);

export function crackles(flame, from, to) {
  const rate = crackleRate(flame);
  if (!rate) return [];
  const burst = knock(ATM * (4 / 3) * Math.PI * BEAD_R ** 3, (2 * BEAD_R) / SPEED);
  const out = [];
  // one bead in each 1 / rate of the clock, somewhere in it (seeded): never even, never random
  for (let s = Math.floor(from * rate); s < to * rate; s++) {
    const t = (s + mix(flame.which + 1, s)) / rate;
    if (t < from || t >= to) continue;
    out.push({ kind: 'crackle', matter: true, t, world: t, rate, pos: flame.pos, bands: burst.bands, dur: burst.dur, attack: burst.dur / 2, seed: (((flame.which + 1) << 24) ^ s) >>> 0 });
  }
  return out;
}
