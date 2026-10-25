// The room's light, settled (light-waves §4, "When"): whenever the light or any
// patch's absorption changes, in a worker (lightWorker.js), a few milliseconds.
// The settled light is linear in its sources, so it is kept in parts: the
// day (the sun and the sky through the window) and each flame at its own unit
// strength. A flame's flicker then only scales its part (combine, every
// flicker frame, no solve); the parts are settled again only when the sun
// moves, a flame moves (the candle sinks), or a patch's matter changes.
//
// Light reacts only when a being is there (rooms.md §1b): with no one present
// nothing is lit. In this layer the viewer is always the being present.

import { N } from './axis.js';
import { sunLight, toward } from './air.js';
import { outsideAt, deckOf, evenSky } from './outside.js';
import { MATTER } from './curves.js';
import { paperCurve, grownCurve, patchAbsorption } from './matter.js';
import { directLight } from './direct.js';
import { solve } from './bounce.js';
import { PLASTER, PLANKS, BOARD, defaultSeed, growMean } from './surface.js';

// A surface's average tone (its cells' character from far away: one pixel for the whole of it).
const means = new Map();
export function meanTone(kind, seed) {
  const key = `${kind}:${seed}`;
  if (!means.has(key)) means.set(key, growMean(kind, seed, 20000.5, 20000.5, 1e7).tone);
  return means.get(key);
}
const KIND = { plaster: PLASTER, floor: PLANKS, table: BOARD };
const SEED_OF = (surface) => (surface.id.startsWith('table') ? 'table' : surface.id);

// Every patch's absorption by its matter: the grown surfaces by their average
// tone (their own seeds; rooms.md passes the owner's), the page by `page` (its
// paper and ink, matter.js pageCurve). Patches can be overridden (a wall
// written on) through `curves`: { [patchIndex]: reflectance }.
export function roomAbsorption(room, { page = paperCurve([0xf7, 0xf3, 0xea]), seeds = {}, curves = {} } = {}) {
  return patchAbsorption(room.patches, (p, i) => {
    if (curves[i]) return curves[i];
    if (p.matter === 'paper') return page;
    const surface = room.surfaces[p.surface];
    const name = SEED_OF(surface);
    return grownCurve(p.matter, meanTone(KIND[p.matter], seeds[name] ?? defaultSeed(name)));
  });
}

// The sources by day for a sun at { az, el } (degrees; air.js sunPlace).
export function daySources(sun) {
  const sunDir = toward(sun.az, sun.el);
  const { through } = deckOf(sun.cloud);
  return { sunDir, sun: sunLight(sun.el).map((v) => v * through), outside: outsideAt(sunDir, { cloud: sun.cloud ?? 0 }), glass: MATTER.glass, opens: sun.opens ?? null };
}
// A sky of unit radiance every way (outside.js evenSky): what the room settles to under it, scaled
// for a flash in the clouds.
export const evenSources = () => ({ sunDir: [0, 0, -1], sun: null, outside: evenSky, glass: MATTER.glass });

// Settle the parts: → { day, flames: [part per flame], passes }. `flames`:
// [{ pos, intensity }] with intensity the flame's spectrum at the strength its
// part is kept at (combine scales it from there).
export function settleParts(room, absorption, { sun = null, flames = [], present = true, even = false } = {}) {
  const n = room.patches.length;
  const dark = () => new Float64Array(n * N);
  if (!present) return { day: dark(), flames: flames.map(dark), passes: 0 };
  let passes = 0;
  const run = (sources) => {
    const r = solve(room.patches, room.F, absorption, directLight(room, sources));
    passes += r.passes;
    return r.light;
  };
  const day = sun && sun.el > -6 ? run(daySources(sun)) : dark();
  return { day, flames: flames.map((f) => run({ flames: [f] })), ...(even ? { even: run(evenSources()) } : {}), passes };
}

// The light now: the day plus each flame's part times its scale (its flicker).
export function combine(parts, scales = [], out = new Float64Array(parts.day.length)) {
  out.set(parts.day);
  parts.flames.forEach((f, k) => {
    const s = scales[k] ?? 1;
    if (s) for (let i = 0; i < out.length; i++) out[i] += f[i] * s;
  });
  return out;
}
