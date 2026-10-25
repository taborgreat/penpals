// A candle's melt pool and its drips (rooms.md §3b). The melt pool is the heat
// rule: the flame's heat flows into the wax round the wick, and wax above its
// melting point is liquid; when the flame goes out the heat flows to the air and
// the wax sets again. It settles whether or not anyone is there: computed in one
// step from the time lit and the time since it went out. A drip comes from the
// pool, the tilt and nothing else: tilted past the pool's lip, liquid wax spills,
// more the more liquid and the further tilted; upright, or set, nothing falls.
// Integers, the same on every machine.

export const POOL_MAX = 1024; // a full pool's liquid
export const FILL_MS = 120000; // lit this long, the pool is full (Tabor's to set)
export const SET_MS = 600000; // out this long, it has all set (Tabor's to set: by the next day, long set)
export const LIP_DEG = 20; // tilted past this, the pool spills over its lip (Tabor's to set)
export const DRIP_MIN = 64; // less liquid than this does not reach the lip
export const DRIP_AMT = 400000; // a full pool tipped right over: one drip's wax (v2/sim.js marks)

// The liquid in the pool: lit for litMs (this burning), out for outMs since (0 while it burns).
export function poolOf({ litMs = 0, outMs = 0 }) {
  const hot = Math.min(POOL_MAX, Math.floor((Math.max(0, litMs) * POOL_MAX) / FILL_MS));
  if (outMs <= 0) return hot;
  return Math.max(0, Math.floor((hot * Math.max(0, SET_MS - outMs)) / SET_MS));
}

// One drip from a pool of `liquid` tilted `tiltDeg`: { amt, heat } (as a drip act takes it), or null.
export function dripOf(liquid, tiltDeg) {
  const tilt = Math.max(0, Math.min(90, Math.round(tiltDeg)));
  if (tilt <= LIP_DEG || liquid < DRIP_MIN) return null;
  const over = tilt - LIP_DEG; // how far past the lip
  const amt = Math.max(1, Math.floor((DRIP_AMT * liquid * over) / (POOL_MAX * (90 - LIP_DEG))));
  return { amt, heat: 120 + Math.floor((100 * liquid) / POOL_MAX) }; // hotter the more of it is liquid
}
