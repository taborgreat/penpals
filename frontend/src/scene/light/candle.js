// Candles burn (light-waves §2). The flame is a release loop (the shared
// primitive): while lit it burns wax, giving light (a black body at about
// 1850 K: the visible flame and the light it casts are one spectrum), heat and
// smoke, until the wax runs out.
//
// A candle is lit at night whenever a being is present (in this layer the
// viewer; rooms.md makes it the room's beings) and goes out when they leave.
// It keeps its burn across nights: nothing resets, so the same candle burns
// down over many nights, only while lit, and lasts days or a thousand years
// depending on how long beings spend there at night. When it is spent a new
// one replaces it. Burnt wax is not deleted: it leaves as smoke (world.md's
// room air), at the rate this reports.
//
// Flicker comes from the wick and the fuel, not noise added on top: as the
// wax sinks the wick stands longer, the flame grows taller and more restless
// and draws more wax, until the charred tip curls into the flame and trims
// itself, and the flame settles. That cycle, and the flame's shiver, are
// deterministic: the same lit time and the same clock give the same flame for
// everyone. As the candle sinks the flame sits lower, its light comes in
// lower, and the shadows on the page grow longer.
//
//   candleState(litMs, t, { lit, which, generation })
//     → { height, wick, flameSize, flameAt, intensity, heatRate, smokeRate, spent }
//   litMs: this candle's total lit time; t: the clock, seconds (for the shiver)
//   height, flameSize, flameAt: metres (flameAt: the flame's middle above the candle's foot)
//   wick: mm; intensity: the flame's light, 1 for a settled flame; heatRate: W; smokeRate: g / s

import { blackbody } from './blackbody.js';
import { CMF } from './curves.js';
import { LUMENS } from './color.js';

export const FLAME_K = 1850;
export const HEIGHT = 0.25; // a taper, m
export const DIAMETER = 0.022;
export const WAX_DENSITY = 900; // kg / m³
export const WAX = HEIGHT * Math.PI * (DIAMETER / 2) ** 2 * WAX_DENSITY * 1000; // g of wax in a new candle
export const BURN_HOURS = 12; // lit hours a candle lasts (Tabor's to set)
export const BURN_RATE = WAX / (BURN_HOURS * 3600); // g / s, for a settled flame
export const HEAT_OF_WAX = 44000; // J / g released by burning
export const CANDELA = 1; // a settled flame's luminous intensity, cd
export const FLAME_H = 0.035; // a settled flame's height, m
export const WICK_TRIM = 8; // mm of wick a trimmed flame stands on
export const WICK_LONG = 13; // mm when it is about to curl over
const WICK_MEAN = (WICK_TRIM + WICK_LONG) / 2;
const GROW = 0.85; // of a wick cycle the wick spends growing (the rest, trimming)
export const CYCLE_MIN = 25 * 60000; // a wick cycle's lit time, ms
export const CYCLE_MAX = 45 * 60000;
export const NIGHT_EL = 0; // the sun below this elevation (degrees): night

// --- lit or not ---
export const candleLit = ({ sunEl, present }) => !!present && sunEl < NIGHT_EL;

// A candle's record for the session (until rooms.md reads it from enter and
// leave acts): its lit time and how many candles have stood in its place.
export const newCandle = () => ({ litMs: 0, generation: 0 });
// dtMs passes; it burns only while lit. A spent candle is replaced by a new
// one (the default ruling), which burns on through what is left of dtMs; with
// replace: false it stays spent.
export function burn(candle, dtMs, lit, { replace = true, which = 0 } = {}) {
  if (!lit || dtMs <= 0) return candle;
  let { litMs, generation } = candle;
  litMs += dtMs;
  for (let life = lifeMs(generation, which); litMs >= life; life = lifeMs(generation, which)) {
    if (!replace) return { litMs: life, generation };
    litMs -= life;
    generation += 1;
  }
  return { litMs, generation };
}

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
const cycleMs = (generation, which, k) => CYCLE_MIN + (CYCLE_MAX - CYCLE_MIN) * hash(generation, which, k);
// The wick through a cycle (p 0..1): 0 trimmed .. 1 longest.
const wickShape = (p) => (p <= GROW ? p / GROW : (1 - p) / (1 - GROW));
// ∫0^p (wickShape − ½): how far the wax burnt so far in the cycle runs from the
// cycle's mean (zero again at the cycle's end, so each cycle burns exactly its share).
const burnShape = (p) => (p <= GROW ? (p * p) / (2 * GROW) - p / 2 : ((1 - GROW) ** 2 - (1 - p) ** 2) / (2 * (1 - GROW)) - (p - GROW) / 2);
const SPREAD = (WICK_LONG - WICK_TRIM) / WICK_MEAN;

// Where in its wick cycles a candle is after `litMs`: → { k, start, period, p }.
function cycleAt(generation, which, litMs) {
  let start = 0;
  for (let k = 0; ; k++) {
    const period = cycleMs(generation, which, k);
    if (litMs < start + period || k > 100000) return { k, start, period, p: Math.max(0, (litMs - start) / period) };
    start += period;
  }
}
// Wax burnt (g) after `litMs` of lit time: each bit of the flame's life burnt at its wick's rate.
function burntAt(generation, which, litMs) {
  const { start, period, p } = cycleAt(generation, which, litMs);
  return (BURN_RATE / 1000) * (start + period * (p + SPREAD * burnShape(p)));
}
// How long this candle burns before its wax is gone (ms), found once per candle.
const lives = new Map();
export function lifeMs(generation = 0, which = 0) {
  const key = `${generation}:${which}`;
  if (lives.has(key)) return lives.get(key);
  let lo = 0, hi = (WAX / BURN_RATE) * 1000 * 1.2;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (burntAt(generation, which, mid) >= WAX) hi = mid;
    else lo = mid;
  }
  if (lives.size > 4096) lives.clear();
  lives.set(key, hi);
  return hi;
}

// --- the shiver: smooth value noise in the clock, keyed by the hour ---
function shiver(t, which) {
  const hour = Math.floor(t / 3600);
  const s = t - hour * 3600;
  let v = 0;
  [[2.3, 0.55], [5.9, 0.3], [13.7, 0.15]].forEach(([f, amp], o) => {
    const x = s * f;
    const i = Math.floor(x);
    const u = x - i;
    const w = u * u * (3 - 2 * u);
    const a = hash(hour, which * 8 + o, i) * 2 - 1, b = hash(hour, which * 8 + o, i + 1) * 2 - 1;
    v += amp * (a + (b - a) * w);
  });
  return v; // about −1..1
}

export function candleState(litMs, t = 0, { lit = true, which = 0, generation = 0 } = {}) {
  const life = lifeMs(generation, which);
  const at = Math.max(0, Math.min(litMs, life));
  const spent = litMs >= life;
  const height = HEIGHT * Math.max(0, 1 - burntAt(generation, which, at) / WAX);
  const { p } = cycleAt(generation, which, at);
  const long = wickShape(p); // 0 trimmed .. 1 longest: how restless the flame is
  const wick = WICK_TRIM + (WICK_LONG - WICK_TRIM) * long;
  if (!lit || spent) return { height, wick, flameSize: 0, flameAt: height, intensity: 0, heatRate: 0, smokeRate: 0, spent };
  const fuel = wick / WICK_MEAN; // a longer wick draws more wax
  const n = shiver(t, which);
  const flameSize = FLAME_H * fuel ** 0.8 * (1 + (0.02 + 0.14 * long) * n);
  const intensity = (flameSize / FLAME_H) ** 1.5;
  const smokeRate = BURN_RATE * fuel;
  return { height, wick, flameSize, flameAt: height + wick / 2000 + flameSize / 2, intensity, heatRate: smokeRate * HEAT_OF_WAX, smokeRate, spent };
}

// The flame's light: radiant intensity per bin (W / sr), a black body scaled
// to the flame's luminous intensity (CANDELA × intensity).
const BODY = blackbody(FLAME_K);
const BODY_CD = LUMENS * BODY.reduce((t, v, i) => t + v * CMF.y[i], 0);
export const flameLight = (state) => BODY.map((v) => (v * CANDELA * state.intensity) / BODY_CD);
