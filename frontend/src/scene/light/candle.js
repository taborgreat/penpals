// Candles burn (light-waves §2; matter-fixes §2, §6). The flame is a release
// loop (the shared primitive): while lit it burns wax, giving light (a black
// body at about 1850 K: the visible flame and the light it casts are one
// spectrum), heat and smoke, until the wax runs out.
//
// One burn-down, in the law (law/candle.js): the candle is matter, its wax
// cells under the heat rule; it burns only while lit (an act), as fast as its
// wick draws when its pool feeds it, and less while it starves (just lit, the
// pool not yet melted). What is drawn reads it: how tall it stands, how well
// its flame is fed this moment, how long it has burnt in all. Nothing here
// keeps a lifetime of its own.
//
// Flicker comes from the wick, not noise added on top: as the wax sinks the
// wick stands longer, the flame grows taller and more restless, until the
// charred tip curls into the flame and trims itself, and the flame settles.
// That cycle runs on the candle's own burning (the law's burnt wax), and the
// flame's shiver on the clock: the same candle and the same moment give the
// same flame for everyone. As it sinks, the flame sits lower and the shadows
// on the page grow longer.
//
//   candleState({ lit, height, fed, burntS, spent }, t, { lit?, which }) (lit: the state's unless given)
//     → { height, wick, flameSize, flameAt, intensity, heatRate, smokeRate, spent }
//   height: m (law heightOf); fed: 0..1 (law flameOf); burntS: s of full burning (law flameOf)
//   t: the clock, seconds (for the shiver)
//   flameSize, flameAt: metres (flameAt: the flame's middle above the candle's foot)
//   wick: mm; intensity: the flame's light, 1 for a settled, fed flame; heatRate: W; smokeRate: g / s

import { matter, candle as C } from 'penpals-law';
import { blackbody } from './blackbody.js';
import { CMF } from './curves.js';
import { LUMENS } from './color.js';

export const FLAME_K = 1850;
export const HEIGHT = C.CANDLE.length; // a new taper, m
export const DIAMETER = 2 * C.CANDLE.radius;
const DRAW_G_S = matter.MATTER.wick.draws / 1e6; // g of wax a fed wick burns a second
const HEAT_OF_WAX = matter.MATTER.wax.heat.releases / 1000; // J / g released by burning
export const CANDELA = 1; // a settled flame's luminous intensity, cd
export const FLAME_H = 0.035; // a settled flame's height, m
export const WICK_TRIM = 8; // mm of wick a trimmed flame stands on
export const WICK_LONG = 13; // mm when it is about to curl over
const WICK_MEAN = (WICK_TRIM + WICK_LONG) / 2;
const GROW = 0.85; // of a wick cycle the wick spends growing (the rest, trimming)
export const CYCLE_MIN = 25 * 60000; // a wick cycle's burning time, ms
export const CYCLE_MAX = 45 * 60000;
export const NIGHT_EL = 0; // the sun below this elevation (degrees): night

// --- lit or not, where no chain says (the lobby, the labs: candles of no one's, lit at night while someone looks) ---
export const candleLit = ({ sunEl, present }) => !!present && sunEl < NIGHT_EL;
// A candle as it stands before anything has burnt it.
export const NEW_CANDLE = Object.freeze({ height: HEIGHT, fed: 1, burntS: 0, spent: false });

// --- the wick's cycles ---
const hash = (a, b, c) => {
  let h = (Math.imul(a, 0x9e3779b1) ^ Math.imul(b + 0x7f4a7c15, 0x85ebca77) ^ Math.imul(c + 0x165667b1, 0xc2b2ae3d)) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b) >>> 0;
  h ^= h >>> 16;
  return h / 4294967296;
};
const cycleMs = (which, k) => CYCLE_MIN + (CYCLE_MAX - CYCLE_MIN) * hash(0, which, k);
// The wick through a cycle (p 0..1): 0 trimmed .. 1 longest.
const wickShape = (p) => (p <= GROW ? p / GROW : (1 - p) / (1 - GROW));
// Where in its wick cycles a candle is after `ms` of burning: → p 0..1 through the current one.
function cycleAt(which, ms) {
  let start = 0;
  for (let k = 0; k < 100000; k++) {
    const period = cycleMs(which, k);
    if (ms < start + period) return Math.max(0, (ms - start) / period);
    start += period;
  }
  return 0;
}

// --- the shiver: smooth value noise in the clock, keyed by the hour ---
function shiver(t, which) {
  const hour = Math.floor(t / 3600);
  const s = t - hour * 3600;
  let v = 0;
  [
    [2.3, 0.55],
    [5.9, 0.3],
    [13.7, 0.15],
  ].forEach(([f, amp], o) => {
    const x = s * f;
    const i = Math.floor(x);
    const u = x - i;
    const w = u * u * (3 - 2 * u);
    const a = hash(hour, which * 8 + o, i) * 2 - 1,
      b = hash(hour, which * 8 + o, i + 1) * 2 - 1;
    v += amp * (a + (b - a) * w);
  });
  return v; // about −1..1
}

export function candleState(state = NEW_CANDLE, t = 0, opts = {}) {
  const { height = HEIGHT, fed = 1, burntS = 0, spent = false } = state;
  const lit = opts.lit ?? state.lit ?? true;
  const which = opts.which ?? 0;
  const long = wickShape(cycleAt(which, burntS * 1000)); // 0 trimmed .. 1 longest: how restless the flame is
  const wick = WICK_TRIM + (WICK_LONG - WICK_TRIM) * long;
  if (!lit || spent || fed <= 0) return { height, wick, flameSize: 0, flameAt: height, intensity: 0, heatRate: 0, smokeRate: 0, spent };
  const fuel = (wick / WICK_MEAN) * Math.min(1, fed); // a longer wick stands a taller flame; a starved one, a smaller
  const n = shiver(t, which);
  const flameSize = FLAME_H * fuel ** 0.8 * (1 + (0.02 + 0.14 * long) * n);
  const intensity = (flameSize / FLAME_H) ** 1.5;
  const smokeRate = DRAW_G_S * Math.min(1, fed); // what burns leaves as smoke (world.md 3b), as fast as the law burns it
  return { height, wick, flameSize, flameAt: height + wick / 2000 + flameSize / 2, intensity, heatRate: smokeRate * HEAT_OF_WAX, smokeRate, spent };
}

// The flame's light: radiant intensity per bin (W / sr), a black body scaled
// to the flame's luminous intensity (CANDELA × intensity).
const BODY = blackbody(FLAME_K);
const BODY_CD = LUMENS * BODY.reduce((t, v, i) => t + v * CMF.y[i], 0);
export const flameLight = (state) => BODY.map((v) => (v * CANDELA * state.intensity) / BODY_CD);
