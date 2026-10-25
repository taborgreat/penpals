// The weather (world.md Phase 4): a few numbers of the air over a place, stepped by the shared rules at
// a coarse scale from the sun (law/sun.js) and the place's seed, so everyone at a place has the same
// weather at the same moment. All of it is scene: none of it is recorded.
//   Heat     the ground's air (the layer that turns over, LAYER deep) takes the sun the clouds let
//            through and gives its warmth back as the ground does (the air's film and its glow:
//            law/sun.js days), the glow less where clouds send it back; and the air that comes over
//            the place, at the day's own warmth, mixes in (as fast as the film takes heat up).
//   Water    that air brings its water too: how near what it can hold, a smooth wander from the
//            place's seed and the date (wetter spells and drier); the ground's air takes it up as
//            fast as it takes up heat (water and heat go alike), less what its clouds take.
//   Rising   the sun warms the ground, the ground the air over it (its film's share of the sun; the
//            rest it glows away), and warm air rises, cool air flowing in under it: the layer turns
//            over as fast as that heating's buoyancy drives it (Deardorff's speed). That is the wind.
//            The rising air cools as rising air does (dry, then wet once its water condenses); lifted
//            the layer's depth and still warmer than the air it meets there (the day's, cooling with
//            height as the standard air does), it rises on as fast as that buoyancy lets it: a storm.
//   Clouds   the rising air's water past what air holds at its heat aloft (Clausius–Clapeyron)
//            condenses: the clouds' water, a phase change; the ground's air past its own dew point
//            fogs. A cloud mixes with the air it rose into as fast as the layer turns over, and in air
//            drier than it could hold gives its water back (the air aloft carries it off); fog, as
//            the ground's air warms past its dew point.
//   Rain     a heavy cloud rains: its water past what its droplets hold apart falls, as fast as they
//            meet (Kessler's coalescence).
//   Charge   rising air through a raining cloud parts charge, as fast as it rises through the rain;
//            past the air's breakdown it strikes: lightning, somewhere about (seeded).
//   weatherAt(seed, ms) → { temp (°C), humidity (‰ of what the air holds), cloud (0..1: of the sun the
//     clouds turn back), rain (mm/h), wind (m/s), charge (0..1 of a strike), strikes: [{ at (ms), away
//     (m), bearing (°) }] (in the STEP before ms) }
import { MATTER, AIR } from './matter.js';
import { sunAt, levelLight, dayOf } from './sun.js';
import { exp } from './dmath.js';

export const LAYER = 1000; // m: the air that turns over by day (Tabor's to set)
export const CLIMATE = Object.freeze({ wet: [400, 950], spell: 2 }); // ‰ of what it holds, the air that comes over; days a spell (Tabor's to set)
export const DROPLET = 10e-6; // m: a cloud's droplets (how much light their water turns back: Tabor's to set)
export const KESSLER = Object.freeze({ rate: 1e-3, holds: 5e-4 }); // /s; kg of cloud water a kg of air holds apart (Kessler 1969)
export const CHARGE = 0.6; // strikes a (m/s of rising) × (kg/(m²·s) of rain) a second (Tabor's to set)
export const STORM = 10000; // m: how far about a storm's strikes fall (Tabor's to set)
// A strike: its energy (J), the shares of it that leave as light and as sound, and how long its
// light lasts (s): a gigajoule, about a hundredth each, a fifth of a second (Tabor's to set)
export const STRIKE = Object.freeze({ energy: 1e9, light: 0.01, sound: 0.01, lasts: 0.2 });
export const STEP = 120; // s: the weather's step
export const STANDARD_LAPSE = 0.0065; // K/m: the standard air's cooling with height (ICAO)

const G = 9.81,
  R = 8.314462618,
  SIGMA = 5.670374419e-8,
  P0 = 101325,
  T0 = 273.15,
  E0 = 611.2; // Pa: water's vapour over it at T0
const DAY = 86400000;
const Md = MATTER.air.molar / 1000,
  Mw = MATTER.water.molar / 1000;
const Rd = R / Md,
  Rv = R / Mw,
  EPS = Mw / Md;
const CP = MATTER.air.heat.holds,
  LV = MATTER.water.heat.vaporizes,
  RHO = MATTER.air.density;
const DRY_LAPSE = G / CP;
const C_LAYER = RHO * CP * LAYER; // J/(m²·K)
const TAU_Q = C_LAYER / AIR.film; // s: the ground's air takes up water as fast as heat
const MEAN = (() => {
  let s = 0;
  for (let d = 0; d < 365; d++) s += dayOf(d).light;
  return s / 365 / 86400;
})();

// what air holds of water at T (K), p (Pa): kg/kg
const eSat = (T) => E0 * exp((LV / Rv) * (1 / T0 - 1 / T));
const qSat = (T, p = P0) => {
  const e = eSat(T);
  return (EPS * e) / (p - (1 - EPS) * e);
};

// a fixed hash, 0..1
const mix = (a, b) => {
  let x = (Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ b) >>> 0;
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
};
const seedOf = (seed) => {
  let h = 0x811c9dc5;
  for (const c of String(seed)) h = Math.imul(h ^ c.codePointAt(0), 0x01000193) >>> 0;
  return h;
};

// How near what it can hold the air that comes over is (0..1), at a moment: knots a spell apart,
// smoothly between.
function wetness(s, ms) {
  const x = ms / DAY / CLIMATE.spell;
  const k = Math.floor(x),
    f = x - k;
  const a = mix(s, k),
    b = mix(s, k + 1);
  const t = f * f * (3 - 2 * f);
  const [lo, hi] = CLIMATE.wet;
  return (lo + (hi - lo) * (a + (b - a) * t)) / 1000;
}

// The ground's air lifted the layer's depth: its heat there, and the water it gave up on the way.
function lift(T, q) {
  const n = 10,
    dz = LAYER / n;
  let Tp = T,
    qp = q,
    gave = 0;
  for (let k = 1; k <= n; k++) {
    Tp -= DRY_LAPSE * dz;
    const p = P0 * exp((-G * k * dz) / (Rd * T));
    const qs = qSat(Tp, p);
    if (qp > qs) {
      const d = (qp - qs) / (1 + (LV * LV * qs) / (CP * Rv * Tp * Tp)); // (condensing warms it: one step to saturation)
      qp -= d;
      gave += d;
      Tp += (LV * d) / CP;
    }
  }
  return { T: Tp, gave };
}

function stepOnce(st, s, ms) {
  const day = ms / DAY + 719528; // (days since Jan 1 of year 0, as law/sun.js counts them)
  const season = dayOf(Math.floor(day)).warmth + T0;
  const sun = sunAt(ms)[2];
  const S = levelLight(sun) * (1 - st.cloud);
  const give = AIR.film + 4 * SIGMA * T0 * T0 * T0 * (1 - st.cloud);
  st.T += ((S - MEAN - give * (st.T - (AIR.temp + T0))) * STEP) / C_LAYER + ((season - st.T) * STEP) / TAU_Q;
  // water: the air that comes over
  const qAir = wetness(s, ms) * qSat(season);
  st.q += ((qAir - st.q) * STEP) / TAU_Q;
  // rising
  const up = lift(st.T, st.q);
  const env = season - STANDARD_LAPSE * LAYER;
  const buoy = up.T - env;
  const heats = (S * AIR.film) / (AIR.film + 4 * SIGMA * T0 * T0 * T0); // W/m²: the ground's sun handed to the air
  const turns = heats > 0 ? Math.cbrt((G * LAYER * heats) / (RHO * CP * st.T)) : 0;
  const storm = up.gave > 0 && buoy > 0 ? Math.sqrt((2 * G * LAYER * buoy) / env) : 0;
  const w = Math.max(turns, storm);
  st.wind = w;
  // clouds: half the air rises (cool air flows in under it), giving up its water
  const made = RHO * w * 0.5 * up.gave * STEP; // kg/m²
  st.c += made;
  st.q -= made / (RHO * LAYER);
  const qs = qSat(st.T);
  if (st.q > qs) {
    st.c += (st.q - qs) * RHO * LAYER; // fog
    st.q = qs;
  } else if (st.c > 0) {
    const back = (st.c * (1 - st.q / qs) * STEP) / TAU_Q;
    st.c -= back;
    st.q += back / (RHO * LAYER);
  }
  if (st.c > 0 && w > 0) st.c -= Math.min(st.c, (st.c * (1 - wetness(s, ms)) * w * STEP) / LAYER);
  // rain
  const rain = KESSLER.rate * Math.max(0, st.c - KESSLER.holds * RHO * LAYER); // kg/(m²·s)
  st.c -= rain * STEP;
  st.rain = rain;
  const tau = (3 * st.c) / (2 * MATTER.water.density * DROPLET);
  st.cloud = tau / (tau + 7.7);
  // charge
  st.Q += CHARGE * w * rain * STEP;
  st.strikes = [];
  while (st.Q >= 1) {
    st.Q -= 1;
    const k = st.n * 16 + st.strikes.length;
    st.strikes.push({ at: Math.round(ms - STEP * 1000 * mix(s ^ 0x51, k)), away: STORM * Math.sqrt(mix(s ^ 0x52, k)), bearing: 360 * mix(s ^ 0x53, k) });
  }
  st.n++;
}

// From three days before the day's start (in its own steps): the same moment, the same weather.
const cache = new Map();
export function weatherAt(seed, ms) {
  const s = seedOf(seed);
  const anchor = Math.floor(ms / DAY) * DAY - 3 * DAY;
  let st = cache.get(s);
  if (!st || st.anchor !== anchor || st.t > ms) {
    const day = anchor / DAY + 719528;
    const T = dayOf(Math.floor(day)).warmth + T0;
    st = { anchor, t: anchor, n: 0, T, q: wetness(s, anchor) * qSat(T), c: 0, cloud: 0, rain: 0, wind: 0, Q: 0, strikes: [] };
    cache.set(s, st);
  }
  while (st.t + STEP * 1000 <= ms) {
    st.t += STEP * 1000;
    stepOnce(st, s, st.t);
  }
  return {
    temp: st.T - T0,
    humidity: Math.round((1000 * st.q) / qSat(st.T)),
    cloud: st.cloud,
    rain: st.rain * 3600,
    wind: st.wind,
    charge: st.Q,
    strikes: st.strikes,
    at: st.t,
  };
}
